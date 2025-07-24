const CACHE_NAME = 'shrutipaath-cache-v2'; // ভার্সন পরিবর্তন করা হয়েছে
const DATA_CACHE_NAME = 'shrutipaath-data-cache-v2';

// অ্যাপ শেলের জন্য প্রয়োজনীয় ফাইল
const FILES_TO_CACHE = [
  'index.html', // রুটের / বাদ দেওয়া হয়েছে Cordova-এর জন্য
  'css/style.css',
  'js/app.js',
  'img/logo.png',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js'
];

self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install');
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching app shell');
      // addAll দিয়ে ক্যাশ করার সময় কোনো একটি ফাইল ফেইল করলে পুরোটা ফেইল হয়।
      // তাই আলাদাভাবে add করা যেতে পারে, কিন্তু addAll সহজতর।
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate');
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  // শুধুমাত্র GET রিকোয়েস্ট ক্যাশ করা হচ্ছে
  if (evt.request.method !== 'GET') {
    return;
  }

  // Firestore API রিকোয়েস্টের জন্য "Network first, falling back to cache"
  if (evt.request.url.includes('firestore.googleapis.com')) {
    evt.respondWith(
      fetch(evt.request)
        .then((response) => {
          // সফল হলে, ক্যাশ আপডেট করা
          return caches.open(DATA_CACHE_NAME).then((cache) => {
            cache.put(evt.request, response.clone());
            console.log('[ServiceWorker] Fetched and cached data:', evt.request.url);
            return response;
          });
        })
        .catch((err) => {
          // নেটওয়ার্ক ফেইল করলে, ক্যাশ থেকে দেওয়ার চেষ্টা
          console.log('[ServiceWorker] Network failed, trying cache for:', evt.request.url);
          return caches.match(evt.request);
        })
    );
  } else {
    // অন্যান্য সবকিছুর জন্য "Cache first, falling back to network"
    evt.respondWith(
      caches.match(evt.request).then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[ServiceWorker] Returning from cache:', evt.request.url);
          return cachedResponse;
        }
        // ক্যাশে না পেলে নেটওয়ার্ক থেকে আনা
        return fetch(evt.request);
      })
    );
  }
});
