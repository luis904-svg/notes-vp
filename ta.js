/* Notes VP — travaux assimilés (TA) composés d'ETA.
   Formulaire : type TA → choisir un TA de la discipline (ou en créer un), puis saisir l'ETA (note ou points).
   Les ETA et les TA sont des enregistrements comme les notes : synchronisation et export les transportent. */
(function () {
  "use strict";
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function num(v) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : NaN; }
  function hap(k) { if (window.FX) FX.haptic(k); }
  var app = function () { return window.NotesApp; };
  var open = {}, editing = null;

  /* ---------- Champs du formulaire ---------- */
  var typeSel = $("#f-type"), subjSel = $("#f-subj"), valField = $("#f-val").closest(".field");
  var box = document.createElement("div");
  box.id = "ta-fields"; box.className = "ta-fields"; box.hidden = true;
  box.innerHTML =
    '<div class="field"><label for="f-ta">Travail assimilé</label><select id="f-ta"></select></div>' +
    '<div class="ta-new" id="ta-new" hidden>' +
      '<div class="field"><label for="f-ta-label">Nom du TA</label><input id="f-ta-label" type="text" maxlength="50" placeholder="Vocabulaire ch. 3"></div>' +
      '<label class="row ta-switch">Noter en points<input type="checkbox" switch id="f-ta-points"></label>' +
      '<div class="ta-scale" id="ta-scale" hidden><span class="muted small">Barème : note =</span><input id="f-ta-mul" type="text" inputmode="decimal" value="5"><span class="muted small">× points / max +</span><input id="f-ta-add" type="text" inputmode="decimal" value="1"></div>' +
    '</div>' +
    '<div class="row2 ta-pts" id="ta-pts" hidden>' +
      '<div class="field"><label for="f-pts">Points obtenus</label><input id="f-pts" type="text" inputmode="decimal" placeholder="17"></div>' +
      '<div class="field"><label for="f-max">Points max</label><input id="f-max" type="text" inputmode="decimal" placeholder="20"></div>' +
    '</div>' +
    '<p class="ta-hint muted small" id="ta-hint"></p>';
  typeSel.closest(".row2").after(box);

  function defs(subject) {
    return app().records().filter(function (r) { return r.kind === "tadef" && (!subject || r.subject === subject); });
  }
  function etasOf(tid) { return app().records().filter(function (r) { return r.ta === tid; }); }
  function defOf(tid) { return app().records().filter(function (r) { return r.id === tid; })[0] || null; }
  function fillTA(keep) {
    var sel = $("#f-ta"), cur = keep || sel.value, list = defs(subjSel.value).sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    sel.innerHTML = list.map(function (d) {
      var n = etasOf(d.id).length;
      return '<option value="' + d.id + '">' + esc(d.label || "TA") + " (" + n + " ETA" + (d.points ? ", points" : "") + ")</option>";
    }).join("") + '<option value="__new">＋ Nouveau TA…</option>';
    sel.value = list.some(function (d) { return d.id === cur; }) ? cur : (list.length ? list[0].id : "__new");
    sync();
  }
  function current() { var v = $("#f-ta").value; return v === "__new" ? null : defOf(v); }
  function sync() {
    var isTA = typeSel.value === "ta";
    box.hidden = !isTA;
    var isNew = isTA && $("#f-ta").value === "__new", d = isTA ? current() : null;
    $("#ta-new").hidden = !isNew;
    var points = isNew ? $("#f-ta-points").checked : !!(d && d.points);
    $("#ta-scale").hidden = !(isNew && $("#f-ta-points").checked);
    $("#ta-pts").hidden = !(isTA && points);
    valField.hidden = isTA && points;
    var lbl = $("label[for=f-val]");
    if (lbl) lbl.textContent = isTA ? "Note de l'ETA (1 à 6)" : "Note (1 à 6)";
    var hint = "";
    if (isTA && d) {
      var n = etasOf(d.id).length;
      hint = n < 3 ? "Ce TA a " + n + " ETA : il compte déjà, mais reste provisoire jusqu'à 3 ETA." : n >= 10 ? "Ce TA a déjà " + n + " ETA : un TA en regroupe en principe 3 à 10." : "";
    } else if (isNew) hint = "Un TA regroupe 3 à 10 petites évaluations (ETA). Sa note compte comme un travail significatif.";
    $("#ta-hint").textContent = hint;
  }
  typeSel.addEventListener("change", function () { if (typeSel.value === "ta") fillTA(); else sync(); });
  subjSel.addEventListener("change", function () { if (typeSel.value === "ta") fillTA(); });
  box.addEventListener("change", function (e) { if (e.target.id === "f-ta" || e.target.id === "f-ta-points") sync(); });

  /* ---------- Enregistrement d'un ETA ---------- */
  $("#form").addEventListener("submit", function (e) {
    if (typeSel.value !== "ta") return;
    e.preventDefault(); e.stopImmediatePropagation();
    var msg = $("#f-msg"), date = $("#f-date").value, subject = subjSel.value;
    function err(t, el) { msg.textContent = t; if (el) el.focus(); }
    if (!date) return err("Choisis une date.");
    var recs = [], d = current();
    if (!d) {
      var label = $("#f-ta-label").value.trim();
      if (!label) return err("Donne un nom au TA (par exemple « Vocabulaire ch. 3 »).", $("#f-ta-label"));
      var pts = $("#f-ta-points").checked, mul = num($("#f-ta-mul").value), add = num($("#f-ta-add").value);
      if (pts && (!isFinite(mul) || !isFinite(add))) return err("Le barème doit contenir deux nombres (par défaut 5 et 1).", $("#f-ta-mul"));
      d = { id: uid(), kind: "tadef", subject: subject, label: label, points: pts, mul: pts ? mul : undefined, add: pts ? add : undefined, value: 0, coef: 0, date: date };
      if (!pts) { delete d.mul; delete d.add; }
      recs.push(d);
    }
    var eta = { id: editing || app().editing() || uid(), subject: d.subject, ta: d.id, coef: 1, type: "ta", date: date, label: $("#f-label").value.trim() };
    if (d.points) {
      var p = num($("#f-pts").value), m = num($("#f-max").value);
      if (!isFinite(p) || p < 0) return err("Entre les points obtenus.", $("#f-pts"));
      if (!isFinite(m) || m <= 0) return err("Entre le maximum de points (plus grand que 0).", $("#f-max"));
      if (p > m) return err("Les points obtenus dépassent le maximum.", $("#f-pts"));
      var mu = isFinite(d.mul) ? d.mul : 5, ad = isFinite(d.add) ? d.add : 1;
      eta.pts = p; eta.max = m; eta.value = Math.round((mu * p / m + ad) * 100) / 100;
    } else {
      var v = num($("#f-val").value);
      if (!isFinite(v) || v < 1 || v > 6) return err("La note doit être entre 1 et 6.", $("#f-val"));
      eta.value = Math.round(v * 100) / 100;
    }
    recs.push(eta);
    var was = !!(editing || app().editing());
    open[d.id] = true; editing = null;
    var all = etasOf(d.id).filter(function (x) { return x.id !== eta.id; }).concat([eta]);
    var note = app().taNote(d, all);
    app().upsert(recs, (was ? "ETA modifié" : "ETA ajouté") + " · TA " + (d.label || ""), { subject: d.subject, value: note + (all.length < 3 ? " (provisoire)" : "") });
  }, true);

  /* ---------- Liste : déplier, ajouter, renommer, supprimer ---------- */
  document.addEventListener("toggle", function (e) {
    var t = e.target; if (t.classList && t.classList.contains("ta-box")) open[t.dataset.ta] = t.open;
  }, true);
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset.taAdd) {
      var d = defOf(t.dataset.taAdd); if (!d) return;
      var go = $("[data-tab=add]") && $("[data-tab=add]").offsetParent ? $("[data-tab=add]") : $("#go-add");
      if (go) go.click();
      setTimeout(function () { subjSel.value = d.subject; typeSel.value = "ta"; fillTA(d.id); $(d.points ? "#f-pts" : "#f-val").focus({ preventScroll: true }); }, 60);
    }
    if (t.dataset.taEdit) {
      var d2 = defOf(t.dataset.taEdit); if (!d2) return;
      var name = window.prompt("Nom du TA", d2.label || ""); if (name == null) return;
      var upd = Object.assign({}, d2, { label: name.trim() || d2.label });
      if (d2.points) {
        var sc = window.prompt("Barème : note = A × points / max + B. Entre A et B (par exemple « 5 1 »)", (isFinite(d2.mul) ? d2.mul : 5) + " " + (isFinite(d2.add) ? d2.add : 1));
        if (sc != null) { var parts = sc.replace(/,/g, ".").trim().split(/[\s;]+/).map(num); if (parts.length === 2 && parts.every(isFinite)) { upd.mul = parts[0]; upd.add = parts[1]; } }
      }
      app().upsert([upd]); hap("success");
    }
    if (t.dataset.taDel) {
      var d3 = defOf(t.dataset.taDel); if (!d3) return;
      var n = etasOf(d3.id).length;
      if (!window.confirm("Supprimer le TA « " + (d3.label || "TA") + " » et ses " + n + " ETA ?")) return;
      app().remove([d3.id].concat(etasOf(d3.id).map(function (x) { return x.id; }))); hap("heavy");
    }
  });

  /* ---------- Avertissements (non bloquants) ---------- */
  function warnings() {
    var ul = $("#alerts"); if (!ul || !app().profile()) return;
    var recs = app().records(), items = [];
    app().subjects().forEach(function (s) {
      var mine = recs.filter(function (r) { return r.subject === s.id && r.kind !== "tadef"; });
      var tas = {}; mine.forEach(function (r) { if (r.ta) tas[r.ta] = (tas[r.ta] || 0) + 1; });
      var nTA = Object.keys(tas).length, nTS = mine.filter(function (r) { return !r.ta; }).length, total = nTA + nTS;
      // Seulement à partir de 4 travaux, sinon un seul TA en début d'année déclencherait l'alerte.
      if (nTA && total >= 4 && nTA * 4 > total) items.push("<b>" + esc(s.name) + "</b> : " + nTA + " TA sur " + total + " travaux, plus d'un quart (le CGE limite les TA à 1/4 des travaux).");
      Object.keys(tas).forEach(function (tid) { if (tas[tid] > 10) { var d = defOf(tid); items.push("<b>" + esc(s.name) + "</b> : le TA « " + esc(d ? d.label : "TA") + " » a " + tas[tid] + " ETA (en principe 10 au plus)."); } });
    });
    if (!items.length) return;
    var empty = ul.querySelector("li.t-none:only-child"); if (empty && /Rien à signaler/.test(empty.textContent)) empty.remove();
    ul.insertAdjacentHTML("beforeend", items.map(function (t) { return '<li class="t-none">' + t + '</li>'; }).join(""));
  }

  window.TA = {
    isOpen: function (tid) { return !!open[tid]; },
    onEdit: function (g) {
      if (!g.ta) { editing = null; sync(); return; }
      editing = g.id; typeSel.value = "ta"; fillTA(g.ta);
      if (g.pts != null) { $("#f-pts").value = g.pts; $("#f-max").value = g.max; }
    },
    reset: function () { editing = null; $("#f-ta-label").value = ""; $("#f-ta-points").checked = false; $("#f-pts").value = ""; $("#f-max").value = ""; sync(); },
    render: warnings
  };
  sync();
})();
