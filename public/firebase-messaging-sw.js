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

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};

  const notificationOptions = {
    body,
    icon: '/icons.svg',
    badge: '/icons.svg',
    vibrate: [200, 100, 200],
    tag: 'jcb-notif',
    renotify: true,
    data: payload.data || {},
  };

  self.registration.showNotification(title || 'JCB', notificationOptions);
});

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
