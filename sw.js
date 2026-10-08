// Service worker do Dossiê Veicular.
// Casca do app em cache para uso offline (no pátio, sem sinal).
// /api/* NUNCA é guardado: respostas de consulta são dados vinculados a pessoas (LGPD) e mudam.
const VERSAO = "dv-v3";
const CASCA = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // fontes e terceiros: navegador decide
  if (url.pathname.startsWith("/api/")) return;          // consultas: sempre rede, nunca cache

  if (req.mode === "navigate") {                         // página: rede primeiro, cache se offline
    e.respondWith(fetch(req).then(r => {
      const copia = r.clone(); caches.open(VERSAO).then(c => c.put("/index.html", copia)); return r;
    }).catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c2 => c2.put(req, copia)); }
    return r;
  })));
});
