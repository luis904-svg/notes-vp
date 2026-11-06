/* Hors-ligne : la page vient du réseau si possible, sinon du cache ; le reste du cache d'abord. */
var V = "notesvp-v5";
var ASSETS = ["./", "index.html", "fx.css", "vp.css", "fx.js", "grid.js", "vp.js", "ta.js", "sync.js", "onboard.js", "motion.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: "reload" }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V && k.indexOf("notesvp-") === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req, { cache: "no-cache" }).then(function (res) {
      var copy = res.clone(); caches.open(V).then(function (c) { c.put("index.html", copy); }); return res;
    }).catch(function () { return caches.match("index.html"); }));
    return;
  }
  // Réseau d'abord pour tous les fichiers : toujours la dernière version quand il y a du réseau,
  // le cache seulement hors connexion (évite de mélanger des fichiers de versions différentes).
  e.respondWith(fetch(req, { cache: "no-cache" }).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(V).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
});
