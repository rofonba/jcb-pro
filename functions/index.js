const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

/**
 * Returns true if the FCM error code indicates an invalid / expired token
 * that should be removed from Firestore.
 */
function isInvalidToken(code) {
  return (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered'
  );
}

/**
 * Callable function: sendPushToAll
 * Sends a push notification to every token stored in the `fcm_tokens` collection.
 * Only callable by authenticated users with rol === 'admin' or 'directiva'.
 *
 * request.data: { title: string, body: string, data?: object }
 */
exports.sendPushToAll = onCall(async (request) => {
  // 1. Authentication check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado para enviar notificaciones.');
  }

  const db = getFirestore();

  // 2. Role check — read the fallero document for the caller
  const falleroDoc = await db.collection('falleros').doc(request.auth.uid).get();
  if (!falleroDoc.exists) {
    throw new HttpsError('permission-denied', 'No se encontró tu perfil de usuario.');
  }
  const { rol } = falleroDoc.data();
  if (rol !== 'admin' && rol !== 'directiva') {
    throw new HttpsError('permission-denied', 'No tienes permiso para enviar notificaciones.');
  }

  // 3. Extract payload
  const { title, body, data = {} } = request.data;

  // 4. Fetch all FCM tokens
  const tokensSnapshot = await db.collection('fcm_tokens').get();

  // 5. Build tokens array, filtering out falsy values
  const tokenDocs = [];
  tokensSnapshot.forEach((docSnap) => {
    const { token } = docSnap.data();
    if (token) {
      tokenDocs.push({ id: docSnap.id, token });
    }
  });

  const tokens = tokenDocs.map((t) => t.token);

  // 6. Nothing to do
  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  // 7. Build multicast message
  const message = {
    notification: { title, body },
    webpush: {
      notification: {
        title,
        body,
        icon: '/icons.svg',
        badge: '/icons.svg',
        vibrate: [200, 100, 200],
        requireInteraction: false,
      },
      fcmOptions: { link: '/' },
      headers: { Urgency: 'high' },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
    tokens,
  };

  // 8. Send
  const response = await getMessaging().sendEachForMulticast(message);

  // 9. Clean up invalid tokens
  const deletePromises = [];
  response.responses.forEach((res, idx) => {
    if (!res.success && res.error && isInvalidToken(res.error.code)) {
      const docId = tokenDocs[idx].id;
      deletePromises.push(db.collection('fcm_tokens').doc(docId).delete());
    }
  });
  await Promise.all(deletePromises);

  // 10. Return counts
  return {
    sent: response.successCount,
    failed: response.failureCount,
  };
});
