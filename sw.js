/* sw.js — Service Worker: يخزّن واجهة التطبيق فقط. البيانات تبقى في Google Sheets ولا تُخزَّن هنا. */
const CACHE = 'expenses-pwa-v1';      // غيّر الرقم عند تحديث الملفات إن أردت إجبار التنظيف
const FONTS = 'expenses-fonts-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './pwa-shim.js',
               './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req, ms) {
  return new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(req, { ignoreSearch: true })
      .then(m => m || caches.match('./index.html'));
    const timer = setTimeout(() => { if (!done) fallback().then(m => { if (m && !done) { done = true; resolve(m); } }); }, ms);
    fetch(req).then(res => {
      if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(() => { clearTimeout(timer); if (!done) fallback().then(m => { done = true; resolve(m || Response.error()); }); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // لا نتدخل في POST (طلبات البيانات)
  const u = new URL(req.url);
  if (u.hostname === 'script.google.com' || u.hostname.endsWith('googleusercontent.com')) return;
  if (u.origin === location.origin) { e.respondWith(networkFirst(req, 4000)); return; }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
