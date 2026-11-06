/* Grille de la voie prégymnasiale (VP), école obligatoire vaudoise, 9e-11e (règles 2026-2027).
   Sources : grille horaire DGEO du degré secondaire (août 2026), Cadre général de l'évaluation 2022 (RLEO art. 84-85).
   Transforme le profil choisi au premier lancement en liste de disciplines pour l'année en cours. */
(function () {
  "use strict";

  var OS = [
    { id: "ED", name: "Économie et droit" },
    { id: "IT", name: "Italien" },
    { id: "LA", name: "Latin" },
    { id: "MP", name: "Mathématiques et physique" }
  ];
  var ACM = [
    { id: "acm", name: "Activités créatrices et manuelles (AC&M)" },
    { id: "en", name: "Éducation nutritionnelle" }
  ];
  var FAC = [
    { id: "gr", name: "Grec", sub: "3 périodes en 10e et 11e", years: [10, 11] },
    { id: "itf", name: "Italien", sub: "3 périodes en 11e", years: [11] }
  ];

  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function facBlock(id, p) {
    var f = find(FAC, id);
    if (f && p.year && f.years.indexOf(p.year) < 0) return "Pas proposé en " + p.year + "e";
    if (id === "itf" && p.os === "IT") return "Tu as déjà l'italien en option spécifique";
    return null;
  }

  /* Groupe principal : toutes les disciplines qui comptent (9e : 11 disciplines, seuil 44 ; 10e-11e : 10, seuil 40).
     Groupe restreint : français, mathématiques, allemand et option spécifique (seuil 16). */
  function build(p) {
    if (!p) return [];
    var y = Math.min(11, Math.max(9, p.year | 0)) - 9, out = [];
    function add(o, periods) {
      if (!periods[y]) return null;
      o.periods = periods[y];
      if (o.counts === undefined) o.counts = true;
      o.tpShare = 0;
      out.push(o); return o;
    }
    var os = find(OS, p.os), acm = find(ACM, p.acm) || ACM[0];
    add({ id: "fr", name: "Français", short: "Fr.", restreint: true, exam: true }, [6, 6, 6]);
    add({ id: "all", name: "Allemand", short: "All.", restreint: true, exam: true }, [3, 3, 3]);
    add({ id: "ang", name: "Anglais", short: "Angl.", exam: true }, [3, 3, 3]);
    add({ id: "ma", name: "Mathématiques", short: "Maths", restreint: true, exam: true }, [5, 5, 5]);
    if (os) add({ id: "os", name: "OS " + os.name, short: "OS", restreint: true, exam: true }, [4, 4, 4]);
    add({ id: "sn", name: "Sciences de la nature", short: "Sc." }, [2, 3, 2]);
    add({ id: "hi", name: "Histoire et éthique", short: "Hist." }, [2, 2, 2]);
    add({ id: "ge", name: "Géographie et citoyenneté", short: "Géo." }, [2, 2, 2]);
    add({ id: "av", name: "Arts visuels", short: "AV" }, [1, 1, 2]);
    add({ id: "mu", name: "Musique", short: "Mus." }, [1, 1, 1]);
    add({ id: "acm", name: acm.name, short: acm.id === "en" ? "EN" : "AC&M" }, [1, 0, 0]);
    (p.fac || []).forEach(function (fid) {
      var f = find(FAC, fid); if (!f || facBlock(fid, p)) return;
      add({ id: "fac_" + fid, name: f.name + " (facultatif)", short: f.id === "gr" ? "Grec" : "Ital.", counts: false },
        fid === "gr" ? [0, 3, 3] : [0, 0, 3]);
    });
    return out;
  }

  /* Examens du certificat (11e) : part de l'écrit dans la note d'examen. L'OS n'a pas de règle cantonale. */
  var EXAM_WRITTEN = { fr: 2 / 3, ma: 2 / 3, all: 3 / 4, ang: 3 / 4, os: 2 / 3 };

  window.Grid = { OS: OS, ACM: ACM, FAC: FAC, find: find, facBlock: facBlock, build: build, EXAM_WRITTEN: EXAM_WRITTEN };
})();
