# 🔥 Falla Joaquín Costa — Burriana

```
╔══════════════════════════════════════╗
║        🔥  F A L L A  J C B         ║
║     Joaquín Costa · Burriana         ║
║          Fallas 2027                 ║
╚══════════════════════════════════════╝
```

Aplicació mòbil progressiva (PWA) per a la gestió interna de la **Falla Joaquín Costa de Burriana**. Carnet digital, inscripcions a esdeveniments, avisos en temps real i panell d'administració.

---

## ✨ Funcionalitats

| Mòdul | Descripció |
|---|---|
| 🔐 **Autenticació** | Login amb Firebase Auth verificant el número de fallero |
| ⏱️ **Compte enrere** | Compte enrere en temps real fins a La Plantà (14 març 2027) |
| 🗓️ **Esdeveniments** | Llistat en temps real, inscripció amb comptador de persones |
| 📢 **Avisos** | Feed d'anuncis en temps real des de Firestore |
| 👤 **Carnet Digital** | Carnet de fallero amb número i rol |
| 🛡️ **Panell Admin** | Llista d'inscrits per event + descàrrega CSV |

---

## 🛠️ Stack Tecnològic

- **React 19** + **Vite 8**
- **Tailwind CSS v4** (tokens via `@theme {}`)
- **Firebase SDK v10** — Firestore, Auth, Cloud Messaging
- **Lucide React** — iconografia

---

## 🚀 Instal·lació

### 1. Clonar el repositori

```bash
git clone <url-del-repo>
cd JCB
```

### 2. Instal·lar dependències

```bash
npm install
```

### 3. Configurar variables d'entorn

Crea un fitxer `.env` a l'arrel del projecte (mai puges aquest fitxer a git):

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### 4. Arrancar en mode desenvolupament

```bash
npm run dev
```

### 5. Build de producció

```bash
npm run build
```

---

## 🔥 Configuració Firebase

### Firestore — Regles de seguretat

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return get(/databases/$(database)/documents/falleros/$(request.auth.uid)).data.rol == 'admin';
    }

    match /falleros/{userId} {
      allow read: if request.auth.uid == userId;
      allow write: if isAdmin();
    }
    match /anuncios/{docId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /eventos/{docId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /inscripciones/{docId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update, delete: if isAdmin();
    }
  }
}
```

### Estructura de documents Firestore

**`falleros/{uid}`**
```json
{
  "nombre": "Josep",
  "apellidos": "García Martí",
  "numero": 42,
  "rol": "fallero"
}
```

**`eventos/{id}`**
```json
{
  "titulo": "Paella de la Falla",
  "tipo": "comida",
  "fecha": "<Timestamp>",
  "lugar": "Carpa de la Falla",
  "precio": 12,
  "plazasTotal": 80,
  "plazasOcupadas": 0
}
```

**`inscripciones/{id}`**
```json
{
  "eventId": "<id>",
  "eventoTitulo": "Paella de la Falla",
  "uid": "<uid>",
  "nombre": "Josep García Martí",
  "numFallero": 42,
  "nPersonas": 2,
  "nota": null,
  "createdAt": "<Timestamp>"
}
```

---

## 📁 Estructura del projecte

```
JCB/
├── public/
├── src/
│   ├── components/
│   │   ├── Countdown.jsx     # Compte enrere fins a La Plantà 2027
│   │   ├── Dashboard.jsx     # Shell principal + bottom nav
│   │   ├── EventList.jsx     # Llistat i inscripció d'events
│   │   ├── Login.jsx         # Pantalla d'autenticació
│   │   └── Profile.jsx       # Carnet digital + panell admin
│   ├── contexts/
│   │   └── AuthContext.jsx   # Context global d'autenticació
│   ├── firebase.js           # Inicialització Firebase
│   ├── App.jsx               # Router auth
│   └── index.css             # Design system "Luxury Fallera"
├── firestore.rules
├── .env                      # ⚠️  NO pujar a git
├── .gitignore
└── vite.config.js
```

---

## 🎨 Paleta de colors

| Token | Valor | Ús |
|---|---|---|
| `jc-black` | `#0a0a0a` | Fons principal |
| `jc-card` | `#141414` | Tarjetes |
| `jc-gold` | `#D4AF37` | Accent principal, actius |
| `jc-red` | `#CE1126` | CTAs, accions |
| `jc-blue` | `#003087` | Accent secundari |

---

*Falla Joaquín Costa · Burriana · Fallas 2027* 🔥
