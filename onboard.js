/* Notes VP — configuration au premier lancement (et « Modifier mon profil »). */
(function () {
  "use strict";
  var G = window.Grid, M = /[?&]noanim=1/.test(location.search) ? null : (window.Motion || null);
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  function canAnim() { return !!M && !reduce.matches; }
  function hap(k) { if (window.FX) window.FX.haptic(k); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }

  var p = {}, step = 0, editing = false, root = null, dir = 1;
  var STEPS = [
    { id: "welcome" },
    { id: "etab", title: "Ton établissement", sub: "Facultatif : il s'affichera en haut de ton tableau de bord." },
    { id: "year", title: "Ton année", sub: "Les disciplines et leurs périodes changent d'une année à l'autre." },
    { id: "os", title: "Option spécifique", sub: "Choisie en 8e, suivie de la 9e à la 11e." },
    { id: "acm", title: "AC&M ou éducation nutritionnelle", sub: "En 9e seulement. Si ton établissement ne laisse pas le choix, prends celle que tu suis.", when: function () { return p.year === 9; } },
    { id: "fac", title: "Cours facultatifs", sub: "Ils sont notés mais ne comptent ni pour la promotion ni pour le certificat. Tu peux n'en choisir aucun.", when: function () { return p.year >= 10; } },
    { id: "recap", title: "Tes disciplines" }
  ];
  function visible() { return STEPS.filter(function (s) { return !s.when || s.when(); }); }

  function row(name, sub, value, field, block, multi) {
    var on = multi ? (p[field] || []).indexOf(value) >= 0 : p[field] === value, dis = !!block;
    return '<button type="button" class="ob-row' + (on ? " on" : "") + '" data-f="' + field + '" data-v="' + esc(value) + '"' + (multi ? " data-multi" : "") + (dis ? " disabled" : "") + ' role="' + (multi ? "checkbox" : "radio") + '" aria-checked="' + on + '">' +
      '<span class="ob-txt"><span class="ob-n">' + esc(name) + '</span>' + (block ? '<span class="ob-s ob-why">' + esc(block) + '</span>' : (sub ? '<span class="ob-s">' + esc(sub) + '</span>' : "")) + '</span>' +
      '<svg class="ob-chk" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg></button>';
  }
  function list(items, field, blockFn, multi) {
    return '<div class="ob-list" role="' + (multi ? "group" : "radiogroup") + '">' + items.map(function (it) {
      return row(it.name, it.sub || "", it.id, field, blockFn ? blockFn(it.id, p) : null, multi);
    }).join("") + '</div>';
  }

  function valid(s) {
    switch (s.id) {
      case "year": return !!p.year;
      case "os": return !!p.os;
      case "acm": return !!p.acm;
      default: return true;
    }
  }
  // Un choix devenu impossible (retour en arrière) est effacé.
  function sanitize() {
    p.fac = (p.fac || []).filter(function (f) { return !G.facBlock(f, p); });
    if (p.year !== 9) delete p.acm;
  }

  function body(s) {
    if (s.id === "welcome") {
      return '<div class="ob-hero"><img src="icon-180.png" alt="" class="ob-icon"><h1>Bienvenue</h1>' +
        '<p>Réponds à quelques questions sur ta scolarité pour créer ton tableau de bord. Tes réponses et tes notes restent sur cet appareil.</p>' +
        '<p class="ob-fine">Voie prégymnasiale vaudoise · 9e à 11e · règles 2026-2027</p>' +
        (window.Sync && Sync.available() ? '<button type="button" class="link ob-sync" id="ob-sync">J\'ai déjà mes notes sur un autre appareil</button>' : '') + '</div>';
    }
    var h = '<h1 class="ob-title">' + esc(s.title) + '</h1>' + (s.sub ? '<p class="ob-sub">' + esc(s.sub) + '</p>' : "");
    if (s.id === "etab") {
      h += '<label class="ob-field"><span>Nom de ton établissement</span><input id="ob-etab" type="text" maxlength="40" autocomplete="off" placeholder="ES de l\'Elysée" value="' + esc(p.etab || "") + '"></label>';
    }
    if (s.id === "year") {
      h += list([{ id: 9, name: "9e année" }, { id: 10, name: "10e année" }, { id: 11, name: "11e année", sub: "avec les examens du certificat" }], "year");
      h += '<label class="ob-field"><span>Nom de ta classe (facultatif)</span><input id="ob-classe" type="text" maxlength="12" autocomplete="off" placeholder="10VP3" value="' + esc(p.classe || "") + '"></label>';
    }
    if (s.id === "os") h += list(G.OS, "os");
    if (s.id === "acm") h += list(G.ACM, "acm");
    if (s.id === "fac") h += list(G.FAC, "fac", G.facBlock, true);
    if (s.id === "recap") {
      var subs = G.build(p);
      h = '<h1 class="ob-title">' + esc(s.title) + '</h1><p class="ob-sub">' + esc((p.etab ? p.etab + " · " : "") + p.year + "e année VP" + (p.classe ? " · " + p.classe : "")) + '</p>';
      h += '<div class="ob-list ob-recap">' + subs.map(function (x) {
        var tags = [fmtP(x.periods) + " par semaine"];
        if (x.restreint) tags.push("groupe restreint");
        if (!x.counts) tags.push("ne compte pas");
        if (p.year === 11 && x.exam) tags.push("examen");
        return '<div class="ob-row ob-static"><span class="ob-txt"><span class="ob-n">' + esc(x.name) + '</span><span class="ob-s">' + esc(tags.join(" · ")) + '</span></span></div>';
      }).join("") + '</div>';
      var main = subs.filter(function (x) { return x.counts; }).length;
      h += '<p class="ob-tip"><b>' + (p.year === 11 ? "Certificat" : "Promotion") + ' :</b> au moins ' + (4 * main) + ' points dans le groupe principal (' + main + ' disciplines) et 16 points dans le groupe restreint (français, maths, allemand, option spécifique). Une note insuffisante peut être compensée par les autres.</p>';
      h += '<p class="ob-fine">Objectifs et périodes restent modifiables dans Réglages. En cas de doute, la décision de ton établissement fait foi.</p>';
    }
    return h;
  }
  function fmtP(n) { return String(n).replace(".", ",") + " pér."; }

  function render() {
    var vs = visible(), s = vs[step], last = step === vs.length - 1;
    var pct = Math.round((step / (vs.length - 1)) * 100);
    root.innerHTML =
      '<div class="ob-top"><button type="button" class="link ob-back"' + (step === 0 || (editing && step === 1) ? (editing ? ' data-cancel' : " hidden") : "") + '>' + (editing && step === 1 ? "Annuler" : "‹ Retour") + '</button>' +
      (s.id !== "welcome" ? '<div class="ob-prog" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' : "") + '</div>' +
      '<div class="ob-body" id="ob-body">' + body(s) + '</div>' +
      '<div class="ob-foot"><button type="button" class="btn ob-next"' + (valid(s) ? "" : " disabled") + '>' +
      (s.id === "welcome" ? "Commencer" : last ? (editing ? "Enregistrer" : "Créer mon tableau de bord") : "Continuer") + '</button></div>';
    var b = $("#ob-body", root);
    if (canAnim()) {
      M.animate(b, { opacity: [0, 1], x: [dir * 36, 0] }, { type: "spring", stiffness: 340, damping: 30 });
      var rows = b.querySelectorAll(".ob-row");
      if (rows.length) M.animate(rows, { opacity: [0, 1], y: [10, 0] }, { delay: M.stagger(0.025, { startDelay: 0.05 }), type: "spring", stiffness: 380, damping: 30 });
      var bar = $(".ob-prog i", root); if (bar) { var from = Math.round(((step - dir) / (vs.length - 1)) * 100); M.animate(bar, { width: [Math.max(0, from) + "%", pct + "%"] }, { type: "spring", stiffness: 260, damping: 30 }); }
    }
    var input = $("#ob-classe", root);
    if (input) input.addEventListener("input", function () { p.classe = input.value.trim(); });
    var etab = $("#ob-etab", root);
    if (etab) etab.addEventListener("input", function () { p.etab = etab.value.trim(); });
    root.scrollTop = 0;
  }

  function go(d) {
    var vs = visible();
    if (d > 0 && !valid(vs[step])) return;
    dir = d; step = Math.max(0, Math.min(vs.length - 1, step + d));
    render();
  }

  function finish() {
    var gs = window.NotesApp.grades(), next = G.build(p).map(function (x) { return x.id; });
    var lost = gs.filter(function (g) { return next.indexOf(g.subject) < 0; }).length;
    if (lost && !window.confirm(lost + " note" + (lost > 1 ? "s appartiennent" : " appartient") + " à des branches absentes de ce profil. Elles seront masquées, pas supprimées. Continuer ?")) return;
    window.NotesApp.setProfile(Object.assign({ v: 1 }, p));
    hap("success");
    close();
  }

  function close() {
    var el = root;
    var closed = false;
    function done() { if (closed) return; closed = true; el.remove(); root = null; document.body.classList.remove("ob-open"); if (window.FX) window.FX.view("dash"); }
    if (canAnim()) { M.animate(el, { opacity: [1, 0], scale: [1, 1.04] }, { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }).then(done); setTimeout(done, 500); }
    else done();
  }

  function open(edit) {
    if (root) return;
    editing = !!edit;
    var cur = window.NotesApp.profile();
    p = cur ? JSON.parse(JSON.stringify(cur)) : {};
    step = editing ? 1 : 0; dir = 1;
    root = document.createElement("div");
    root.className = "ob"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Configuration");
    document.body.appendChild(root);
    document.body.classList.add("ob-open");
    root.addEventListener("click", function (e) {
      if (e.target.id === "ob-sync") {
        var code = window.prompt("Code de synchronisation (sur ton autre appareil : Réglages → Synchronisation)");
        if (code == null) return;
        e.target.textContent = "Récupération…";
        window.Sync.join(code).then(function (ok) {
          if (ok) { hap("success"); close(); }
          else { e.target.textContent = "J'ai déjà mes notes sur un autre appareil"; window.alert("Aucune note trouvée pour ce code. Vérifie-le, ou continue la configuration."); }
        });
        return;
      }
      var r = e.target.closest(".ob-row[data-f]");
      if (r && !r.disabled) {
        var f = r.dataset.f, v = r.dataset.v, multi = r.hasAttribute("data-multi");
        if (multi) {
          var arr = p[f] || (p[f] = []), k = arr.indexOf(v);
          if (k >= 0) arr.splice(k, 1); else arr.push(v);
          var on = k < 0; r.classList.toggle("on", on); r.setAttribute("aria-checked", String(on));
        } else {
          p[f] = f === "year" ? parseInt(v, 10) : v;
          root.querySelectorAll('.ob-row[data-f="' + f + '"]').forEach(function (x) { var on2 = x === r; x.classList.toggle("on", on2); x.setAttribute("aria-checked", String(on2)); });
        }
        sanitize(); hap("select");
        if (canAnim()) M.animate(r.querySelector(".ob-chk"), { scale: [0.3, 1] }, { type: "spring", stiffness: 500, damping: 15 });
        $(".ob-next", root).disabled = !valid(visible()[step]);
        return;
      }
      if (e.target.closest(".ob-next")) { var vs = visible(); if (step === vs.length - 1) finish(); else go(1); return; }
      var back = e.target.closest(".ob-back");
      if (back) { if (back.hasAttribute("data-cancel")) close(); else go(-1); }
    });
    root.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.target.id === "ob-classe" || e.target.id === "ob-etab")) { e.preventDefault(); go(1); } });
    if (canAnim()) M.animate(root, { opacity: [0, 1] }, { duration: 0.3 });
    render();
  }

  function mountSettingsButton() {
    var host = document.getElementById("set-block"); if (!host || document.getElementById("ob-edit")) return;
    var d = document.createElement("div"); d.className = "backup";
    d.innerHTML = '<h3>Mon cursus</h3><p class="muted small" id="ob-sum"></p><div class="btns"><button type="button" class="btn-ghost" id="ob-edit">Modifier mon profil</button></div>';
    host.insertBefore(d, host.firstChild);
    document.getElementById("ob-edit").addEventListener("click", function () { open(true); });
  }
  function refreshSummary() {
    var el = document.getElementById("ob-sum"), pr = window.NotesApp.profile(); if (!el || !pr) return;
    var os = G.find(G.OS, pr.os), fac = (pr.fac || []).map(function (f) { var x = G.find(G.FAC, f); return x ? x.name : f; });
    el.textContent = pr.year + "e année VP · OS " + (os ? os.name : "?") + (pr.year === 9 && pr.acm ? " · " + (pr.acm === "en" ? "éducation nutritionnelle" : "AC&M") : "") + (fac.length ? " · facultatif : " + fac.join(", ") : "");
  }

  /* ---------- Installer d'abord ----------
     Safari et l'app de l'écran d'accueil ont des stockages séparés : on fait installer l'app
     avant la configuration pour ne pas la remplir deux fois. */
  var ua = navigator.userAgent;
  var isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var inApp = /FBAN|FBAV|Instagram|Snapchat|Line\/|TikTok|musical_ly|LinkedInApp/.test(ua);
  function standalone() { return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches; }
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferredPrompt = e;
    var b = document.getElementById("inst-btn"); if (b) b.hidden = false;
  });

  var ICON_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M6 11H5v9h14v-9h-1"/></svg>';
  var ICON_ADD = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
  var ICON_DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/></svg>';
  var ICON_HOME = '<img src="icon-180.png" alt="">';

  function steps() {
    if (inApp) return [["!", "Ce navigateur ne peut pas installer d'app", "Touche le menu de l'app (⋯ ou ⋮) puis « Ouvrir dans Safari » ou « Ouvrir dans le navigateur »."]];
    if (isIOS) return [
      [ICON_SHARE, "Touche le bouton Partager", "En bas de Safari. Si tu ne le vois pas, touche d'abord " + "⋯" + "."],
      [ICON_ADD, "Choisis « Sur l'écran d'accueil »", "Fais défiler la liste si besoin, puis touche « Ajouter »."],
      [ICON_HOME, "Ouvre Notes VP depuis ton écran d'accueil", "La configuration commencera dans l'app."]
    ];
    return [
      [ICON_DOTS, "Ouvre le menu du navigateur", "Le bouton ⋮ en haut à droite."],
      [ICON_ADD, "Touche « Installer l'application »", "Ou « Ajouter à l'écran d'accueil »."],
      [ICON_HOME, "Ouvre Notes VP depuis ton écran d'accueil", "La configuration commencera dans l'app."]
    ];
  }

  function openInstall() {
    var el = document.createElement("div");
    el.className = "ob ob-install"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Installer l'app");
    el.innerHTML =
      '<div class="ob-body"><div class="ob-hero"><img src="icon-180.png" alt="" class="ob-icon"><h1>Installe l\'app</h1>' +
      '<p>Ajoute Notes VP à ton écran d\'accueil avant de commencer. Elle s\'ouvrira en plein écran, marchera sans connexion, et tu ne feras la configuration qu\'une fois.</p></div>' +
      '<ol class="inst-steps">' + steps().map(function (s, i) {
        return '<li><span class="inst-ic' + (s[0] === "!" ? " warn" : "") + '">' + (s[0] === "!" ? "!" : s[0]) + '</span><span class="ob-txt"><span class="ob-n">' + (steps().length > 1 ? (i + 1) + ". " : "") + esc(s[1]) + '</span><span class="ob-s">' + esc(s[2]) + '</span></span></li>';
      }).join("") + '</ol>' +
      '<p class="ob-fine">Pourquoi ? Safari et l\'app de l\'écran d\'accueil gardent leurs données séparément : une configuration faite ici ne serait pas reprise dans l\'app.</p></div>' +
      '<div class="ob-foot"><button type="button" class="btn ob-next" id="inst-btn"' + (deferredPrompt ? "" : " hidden") + '>Installer l\'app</button>' +
      '<button type="button" class="link inst-skip" id="inst-skip">Continuer dans le navigateur</button>' +
      (isIOS && !inApp ? '<div class="inst-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4v15M6 13l6 6 6-6"/></svg></div>' : "") + '</div>';
    document.body.appendChild(el);
    document.body.classList.add("ob-open");
    if (canAnim()) {
      M.animate(el.querySelectorAll(".ob-hero > *, .inst-steps li"), { opacity: [0, 1], y: [16, 0] }, { delay: M.stagger(0.07), type: "spring", stiffness: 300, damping: 26 });
      var ar = el.querySelector(".inst-arrow svg");
      if (ar) M.animate(ar, { y: [0, 10, 0] }, { duration: 1.4, repeat: Infinity, ease: "easeInOut" });
    }
    el.querySelector("#inst-btn").addEventListener("click", function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; });
    });
    el.querySelector("#inst-skip").addEventListener("click", function () {
      if (!window.confirm("Si tu configures ici puis installes l'app plus tard, il faudra refaire la configuration dans l'app. Continuer dans le navigateur ?")) return;
      el.remove(); document.body.classList.remove("ob-open");
      open(false);
    });
    // Installée depuis Android pendant que la page est ouverte.
    window.addEventListener("appinstalled", function () { var s = el.querySelector(".ob-hero p"); if (s) s.textContent = "C'est installé ! Ouvre Notes VP depuis ton écran d'accueil."; });
  }

  window.Onboard = { open: open, refresh: refreshSummary };
  mountSettingsButton(); refreshSummary();
  if (!window.NotesApp.profile()) {
    if ((isIOS || isAndroid) && !standalone()) openInstall();
    else open(false);
  }
})();
