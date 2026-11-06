/* Notes VP — examens du certificat de fin de 11e (CGE 2022, § certification).
   Note finale d'une discipline d'examen = moyenne de l'année arrondie au dixième × 0,8 + note d'examen × 0,2,
   arrondie au demi-point. Note d'examen = écrit et oral pondérés, arrondie au demi-point. */
(function () {
  "use strict";
  var KEY = "notesvp.exams";
  var exams = {};
  try { exams = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { exams = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(exams)); } catch (e) {} }
  function half(x) { return Math.floor(x * 2 + 0.5 + 1e-9) / 2; }
  function tenth(x) { return Math.floor(x * 10 + 0.5 + 1e-9) / 10; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) && n >= 1 && n <= 6 ? n : null; }

  function exam(sid) {
    var e = exams[sid]; if (!e) return null;
    var w = num(e.w), o = num(e.o), wr = window.Grid.EXAM_WRITTEN[sid] || 2 / 3;
    if (w != null && o != null) return half(w * wr + o * (1 - wr));
    if (w != null) return half(w);
    if (o != null) return half(o);
    return null;
  }
  function final(sid, avg) {
    var x = exam(sid);
    if (avg == null) return null;
    return x == null ? half(avg) : half(tenth(avg) * 0.8 + x * 0.2);
  }
  function fmt(n) { return n == null ? "–" : (Number.isInteger(n) ? String(n) : n.toFixed(1)); }
  function frac(sid) { var w = window.Grid.EXAM_WRITTEN[sid]; return Math.abs(w - 3 / 4) < 1e-6 ? "écrit 3/4 · oral 1/4" : "écrit 2/3 · oral 1/3"; }

  var panel = null;
  function render() {
    var app = window.NotesApp, pr = app && app.profile();
    var dash = document.getElementById("view-dash");
    if (!pr || pr.year !== 11) { if (panel) panel.hidden = true; return; }
    if (!panel) {
      panel = document.createElement("section"); panel.className = "panel"; panel.id = "exams";
      panel.setAttribute("aria-labelledby", "h-exams");
      var promo = dash.querySelector("#promo").closest("section");
      promo.after(panel);
      panel.addEventListener("change", function (e) {
        var t = e.target; if (!t.dataset.sid) return;
        var r = exams[t.dataset.sid] || (exams[t.dataset.sid] = {});
        r[t.dataset.k] = t.value === "" ? null : num(t.value);
        save(); app.rerender();
      });
    }
    panel.hidden = false;
    var subs = app.subjects().filter(function (s) { return s.exam; });
    panel.innerHTML = '<h2 id="h-exams">Examens du certificat</h2>' +
      '<p class="muted small" style="margin:-8px 0 14px">Entre tes notes d\'examen quand tu les as. La note finale = moyenne de l\'année (au dixième) × 80 % + examen × 20 %, arrondie au demi-point. Elle remplace la moyenne dans le calcul du certificat.</p>' +
      '<div class="exam-list">' + subs.map(function (s) {
        var e = exams[s.id] || {}, avg = app.avg(s.id), x = exam(s.id), f = final(s.id, avg);
        return '<div class="exam-row"><div class="exam-head"><b>' + esc(s.name) + '</b><span class="muted small">' + (s.id === "os" ? "écrit 2/3 · oral 1/3 par défaut (selon ton établissement)" : frac(s.id)) + '</span></div>' +
          '<div class="exam-fields">' +
          '<label>Écrit<input type="number" inputmode="decimal" min="1" max="6" step="0.5" data-sid="' + s.id + '" data-k="w" value="' + (e.w != null ? e.w : "") + '" placeholder="–"></label>' +
          '<label>Oral<input type="number" inputmode="decimal" min="1" max="6" step="0.5" data-sid="' + s.id + '" data-k="o" value="' + (e.o != null ? e.o : "") + '" placeholder="–"></label>' +
          '<div class="exam-out"><span class="muted small">Examen</span><span class="mono">' + fmt(x) + '</span></div>' +
          '<div class="exam-out"><span class="muted small">Année</span><span class="mono">' + (avg == null ? "–" : avg.toFixed(2)) + '</span></div>' +
          '<div class="exam-out"><span class="muted small">Note finale</span><span class="mono exam-final ' + (f != null && f < 4 ? "crit" : "") + '">' + fmt(f) + '</span></div>' +
          '</div></div>';
      }).join("") + '</div>';
  }

  window.VPExam = { exam: exam, final: final, render: render };
})();
