// Firebase Messaging Service Worker
// Background push message handler for JCB PWA

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: 'AIzaSyCj1ik0zduu21voJ2Xgiw6cnoL7u2B6ZEU',
  authDomain: 'jcb-pro.firebaseapp.com',
  projectId: 'jcb-pro',
  storageBucket: 'jcb-pro.firebasestorage.app',
  messagingSenderId: '1095618782140',
  appId: '1:1095618782140:web:10f965203e9b0ff86801b9',
};

firebase.initializeApp(firebaseConfig);

// IMPORTANT: NO `onBackgroundMessage` handler.
//
// El bug "notificaciones duplicadas" venía de aquí: si registramos un handler
// y además el mensaje incluye un campo `notification` (lo que hace nuestro
// endpoint /api/sendPush), en Chrome/Edge/Android el navegador muestra la
// notificación automáticamente A LA VEZ que nuestro handler llamaba a
// `showNotification` manualmente → 2 toasts idénticos en el mismo segundo.
//
// Al no registrar handler, el FCM SDK del SW se encarga de mostrar la
// notificación una sola vez, usando los overrides de `webpush.notification`
// (icon, badge, vibrate, tag) que viajan en el payload del send.
//
// Para procesar datos extra en el futuro, usa SIEMPRE un `tag` único por
// mensaje en el sender y, si registras `onBackgroundMessage`, ELIMINA el
// campo `notification` del payload (envía sólo `data`) para evitar la
// doble vía de display.
//
// La inicialización de messaging sigue siendo necesaria para que el SDK
// del SW registre su propio listener `push`.
firebase.messaging();

// Open the app when a notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Service Worker lifecycle
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
