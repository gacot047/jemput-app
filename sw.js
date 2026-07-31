// Service worker ini SENGAJA dibuat minimal dan TIDAK menyimpan cache apa pun.
// Tujuannya cuma satu: memenuhi syarat teknis Chrome/Android supaya tombol
// "Install App" (bukan sekadar shortcut) muncul. Setelah beberapa kejadian
// sebelumnya soal file lama yang "nyangkut" di cache browser, kita hindari
// caching sama sekali di sini — setiap permintaan selalu diambil langsung
// dari server, jadi update file (HTML/CSS/JS) akan selalu langsung terlihat
// tanpa perlu urusan invalidasi cache tambahan.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Diteruskan langsung ke jaringan, tanpa caching.
  event.respondWith(fetch(event.request));
});
