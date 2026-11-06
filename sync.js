/* Notes VP — synchronisation entre appareils par code (chiffrement de bout en bout).
   Le code donne à la fois l'adresse du coffre (empreinte SHA-256) et la clé de chiffrement (PBKDF2 → AES-GCM).
   Fusion : chaque note garde la date de sa dernière modification (u) ; une suppression laisse une trace (deleted). */
(function () {
  "use strict";
  var DEFAULT_URL = "https://notes-sync.ps14puu.workers.dev";
  var SYNC_URL = window.NOTES_SYNC_URL || (function () { try { return localStorage.getItem("notesvp.syncurl") || ""; } catch (e) { return ""; } })() || DEFAULT_URL;
  var KEY = "notesvp.sync";
  var ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var enc = new TextEncoder(), dec = new TextDecoder();
  var meta = load();
  var cryptoKey = null, vaultId = null, busy = false, again = false, pushTimer = null, pollTimer = null, applying = false;

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch (e) { return {}; } }
  function store() { try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch (e) {} }
  function app() { return window.NotesApp; }

  /* ---------- Code et chiffrement ---------- */
  function newCode() {
    var b = new Uint8Array(16), s = "";
    crypto.getRandomValues(b);
    for (var i = 0; i < 16; i++) { s += ALPHA[b[i] % ALPHA.length]; if (i % 4 === 3 && i < 15) s += "-"; }
    return s;
  }
  function normalize(code) {
    var c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/I|L/g, "1");
    if (c.length !== 16) return null;
    for (var i = 0; i < 16; i++) if (ALPHA.indexOf(c[i]) < 0) return null;
    return c.replace(/(.{4})(?=.)/g, "$1-");
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function b64(u8) { var s = ""; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function prepare(code) {
    return crypto.subtle.digest("SHA-256", enc.encode("notesvp-id:" + code)).then(function (h) {
      vaultId = hex(h);
      return crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
    }).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode("notesvp-sync-v1"), iterations: 150000, hash: "SHA-256" }, base,
        { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    }).then(function (k) { cryptoKey = k; });
  }
  function seal(obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, cryptoKey, enc.encode(JSON.stringify(obj))).then(function (ct) {
      var all = new Uint8Array(12 + ct.byteLength); all.set(iv, 0); all.set(new Uint8Array(ct), 12); return b64(all);
    });
  }
  function open(data) {
    var all = unb64(data);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, cryptoKey, all.slice(12)).then(function (pt) { return JSON.parse(dec.decode(pt)); });
  }

  /* ---------- Contenu local et fusion ---------- */
  function exams() { try { return JSON.parse(localStorage.getItem("notesvp.exams") || "{}") || {}; } catch (e) { return {}; } }
  function local() {
    var st = app().get();
    return { cfg: st.cfg, grades: st.grades, exams: exams() };
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function canon(P) {
    if (!P) return "";
    var d = {}; Object.keys(P.deleted || {}).sort().forEach(function (k) { d[k] = P.deleted[k]; });
    return JSON.stringify({ cfg: P.cfg, cfgTs: P.cfgTs || 0, exams: P.exams || {}, examsTs: P.examsTs || 0, deleted: d,
      grades: (P.grades || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }) });
  }
  // Repère ce qui a changé sur cet appareil depuis la dernière fois (ajout, modification, suppression).
  function track() {
    var cur = local(), now = Date.now(), prev = meta.prev || { cfg: null, grades: [], exams: {} };
    meta.u = meta.u || {}; meta.deleted = meta.deleted || {};
    var before = {}; prev.grades.forEach(function (g) { before[g.id] = g; });
    cur.grades.forEach(function (g) { if (!before[g.id] || !same(before[g.id], g)) meta.u[g.id] = now; delete before[g.id]; });
    Object.keys(before).forEach(function (id) { meta.deleted[id] = now; delete meta.u[id]; });
    if (!same(prev.cfg, cur.cfg)) meta.cfgTs = now;
    if (!same(prev.exams, cur.exams)) meta.examsTs = now;
    meta.prev = cur; store();
    return cur;
  }
  function payload(cur) {
    return { v: 1, cfg: cur.cfg, cfgTs: meta.cfgTs || 0, exams: cur.exams, examsTs: meta.examsTs || 0,
      grades: cur.grades.map(function (g) { return Object.assign({}, g, { u: meta.u[g.id] || 0 }); }), deleted: meta.deleted || {} };
  }
  function merge(L, R) {
    if (!R) return L;
    var del = Object.assign({}, R.deleted || {});
    Object.keys(L.deleted || {}).forEach(function (id) { del[id] = Math.max(del[id] || 0, L.deleted[id]); });
    var by = {};
    (R.grades || []).concat(L.grades).forEach(function (g) { var o = by[g.id]; if (!o || (g.u || 0) > (o.u || 0)) by[g.id] = g; });
    var grades = Object.keys(by).map(function (id) { return by[id]; }).filter(function (g) { return !(del[g.id] >= (g.u || 0) && del[g.id]); });
    var useR = (R.cfgTs || 0) > (L.cfgTs || 0), useRE = (R.examsTs || 0) > (L.examsTs || 0);
    return { v: 1, cfg: useR ? R.cfg : L.cfg, cfgTs: Math.max(L.cfgTs || 0, R.cfgTs || 0), exams: useRE ? R.exams : L.exams,
      examsTs: Math.max(L.examsTs || 0, R.examsTs || 0), grades: grades, deleted: del };
  }
  // Applique le résultat fusionné sur cet appareil sans le compter comme une modification locale.
  function apply(M) {
    var cur = local(), grades = M.grades.map(function (g) { var c = Object.assign({}, g); delete c.u; return c; });
    meta.u = {}; M.grades.forEach(function (g) { meta.u[g.id] = g.u || 0; });
    meta.deleted = M.deleted; meta.cfgTs = M.cfgTs; meta.examsTs = M.examsTs;
    var changed = !same(cur.cfg, M.cfg) || !same(cur.grades, grades) || !same(cur.exams, M.exams || {});
    if (changed) {
      applying = true;
      try { localStorage.setItem("notesvp.exams", JSON.stringify(M.exams || {})); } catch (e) {}
      if (window.VPExam && VPExam.reload) VPExam.reload();
      app().replace({ cfg: M.cfg, grades: grades });
      applying = false;
    }
    meta.prev = local(); store();
    return changed;
  }

  /* ---------- Échanges avec le serveur ---------- */
  function req(method, body) {
    return fetch(SYNC_URL.replace(/\/$/, "") + "/v1/" + vaultId, {
      method: method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store"
    }).then(function (r) { return r.json().then(function (j) { j.status = r.status; return j; }); });
  }
  function cycle() {
    if (!meta.code || !SYNC_URL) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    busy = true; status("sync");
    var L = payload(track());
    return req("GET").then(function (res) {
      var p = res.data ? open(res.data) : Promise.resolve(null);
      return p.then(function (R) {
        var M = merge(L, R);
        var changedHere = apply(M);
        if (R && canon(M) === canon(R) && res.rev) { meta.rev = res.rev; store(); return changedHere; }
        return seal(M).then(function (data) { return req("PUT", { data: data, base: res.rev || 0 }); }).then(function (w) {
          if (w.status === 409) { again = true; return; }
          if (w.rev) { meta.rev = w.rev; store(); }
        });
      });
    }).then(function () { meta.last = Date.now(); store(); status("ok"); }, function (e) {
      status(String(e && e.name) === "OperationError" ? "badcode" : "offline");
    }).then(function () { busy = false; if (again) { again = false; schedule(300); } });
  }
  function schedule(ms) { clearTimeout(pushTimer); pushTimer = setTimeout(cycle, ms == null ? 1500 : ms); }

  /* ---------- Interface (Réglages) ---------- */
  var ui = null, lastStatus = "";
  function status(s) { lastStatus = s; paint(); }
  function ago(t) {
    if (!t) return "jamais";
    var s = Math.round((Date.now() - t) / 1000);
    return s < 10 ? "à l'instant" : s < 60 ? "il y a " + s + " s" : s < 3600 ? "il y a " + Math.round(s / 60) + " min" : new Date(t).toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" });
  }
  function paint() {
    if (!ui) return;
    if (!SYNC_URL) { ui.innerHTML = '<h3>Synchronisation</h3><p class="muted small">Bientôt disponible.</p>'; return; }
    if (!meta.code) {
      ui.innerHTML = '<h3>Synchronisation</h3><p class="muted small">Retrouve tes notes sur ton iPhone, ton iPad et ton ordinateur. Elles sont chiffrées avec ton code : personne d\'autre ne peut les lire.</p>' +
        '<div class="btns"><button type="button" class="btn" id="sy-new">Activer la synchronisation</button><button type="button" class="btn-ghost" id="sy-join">J\'ai déjà un code</button></div>' +
        '<p class="ok" id="sy-msg" role="status"></p>';
      return;
    }
    var txt = { sync: "Synchronisation…", ok: "À jour · " + ago(meta.last), offline: "Hors connexion · dernière synchronisation " + ago(meta.last), badcode: "Code refusé : vérifie-le" }[lastStatus] || "À jour · " + ago(meta.last);
    ui.innerHTML = '<h3>Synchronisation</h3><p class="muted small">Tape ce code sur tes autres appareils (Réglages → Synchronisation → J\'ai déjà un code). Garde-le précieusement : il ne peut pas être récupéré.</p>' +
      '<div class="sy-code mono" id="sy-code">' + meta.code + '</div>' +
      '<p class="small ' + (lastStatus === "offline" || lastStatus === "badcode" ? "" : "muted") + '" id="sy-status">' + txt + '</p>' +
      '<div class="btns"><button type="button" class="btn-ghost" id="sy-copy">Copier le code</button><button type="button" class="btn-ghost" id="sy-now">Synchroniser</button><button type="button" class="link danger" id="sy-off">Désactiver sur cet appareil</button></div>';
  }
  function mount() {
    var host = document.getElementById("set-block"); if (!host || ui) return;
    ui = document.createElement("div"); ui.className = "backup"; ui.id = "sync";
    var cursus = host.querySelector(".backup"); if (cursus) cursus.after(ui); else host.insertBefore(ui, host.firstChild);
    ui.addEventListener("click", function (e) {
      var t = e.target;
      if (t.id === "sy-new") { start(newCode(), false); }
      if (t.id === "sy-join") { var c = window.prompt("Code de synchronisation (16 caractères)"); if (c != null) join(c); }
      if (t.id === "sy-copy") { if (navigator.clipboard) navigator.clipboard.writeText(meta.code).then(function () { t.textContent = "Copié"; }); }
      if (t.id === "sy-now") cycle();
      if (t.id === "sy-off" && window.confirm("Arrêter la synchronisation sur cet appareil ? Tes notes restent ici et en ligne ; tu pourras reprendre avec le même code.")) {
        meta = {}; store(); cryptoKey = null; vaultId = null; paint();
      }
    });
    paint();
  }
  function say(t) { var m = document.getElementById("sy-msg"); if (m) m.textContent = t; }
  function start(code, joining) {
    meta = { code: code }; if (!joining) meta.prev = { cfg: null, grades: [], exams: {} };
    store();
    return prepare(code).then(function () {
      if (joining) { meta.prev = local(); meta.u = {}; meta.deleted = {}; meta.cfgTs = 0; meta.examsTs = 0; store(); }
      return cycle();
    }).then(function () { loop(); paint(); if (window.FX) FX.haptic("success"); });
  }
  // Rejoindre : les données en ligne priment sur un appareil encore vide.
  function join(code) {
    var c = normalize(code);
    if (!c) { say("Ce code n'est pas valide : il faut 16 lettres ou chiffres."); if (window.FX) FX.haptic("error"); return Promise.resolve(false); }
    return start(c, true).then(function () { return !!(app().profile()); });
  }

  /* ---------- Démarrage ---------- */
  window.Sync = {
    changed: function () { if (!applying && meta.code) schedule(); },
    join: join, enabled: function () { return !!meta.code && !!SYNC_URL; }, available: function () { return !!SYNC_URL; }
  };
  var looping = false;
  function loop() {
    if (looping) return; looping = true;
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") cycle(); });
    window.addEventListener("online", function () { cycle(); });
    pollTimer = setInterval(function () { if (document.visibilityState === "visible") cycle(); }, 20000);
  }
  mount();
  if (meta.code && SYNC_URL) {
    prepare(meta.code).then(function () { if (!meta.prev) meta.prev = local(); loop(); cycle(); });
  }
})();
