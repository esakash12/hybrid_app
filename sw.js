const CACHE_NAME = 'shrutipaath-v1';
const DATA_CACHE_NAME = 'shrutipaath-data-v1';
const FILES_TO_CACHE = [
  '/',
  'index.html',
  'css/style.css',
  'js/app.js',
  'img/logo.png',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) => Promise.all(keyList.map((key) => {
      if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
        return caches.delete(key);
      }
    })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.url.includes('/firestore.googleapis.com/')) {
    evt.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) => {
        return fetch(evt.request)
          .then((response) => {
            if (response.status === 200) {
              cache.put(evt.request.url, response.clone());
            }
            return response;
          }).catch(() => cache.match(evt.request));
      })
    );
    return;
  }
  evt.respondWith(
    caches.match(evt.request).then((response) => response || fetch(evt.request))
  );
});