/* Offline shell only. Never cache API responses, credentials, or user uploads. */
const CACHE = 'forgotten-shell-v1';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(SHELL);
      const page = await cache.match('/');
      const html = await page.text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"<>]+)"/g)].map(
        (match) => match[1],
      );
      await cache.addAll([...new Set(assets)]);
    }),
  );
  // Updates activate after existing tabs close, preserving in-progress drawings.
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('forgotten-shell-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }
  if (!url.pathname.startsWith('/assets/') && !SHELL.includes(url.pathname)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    }),
  );
});
