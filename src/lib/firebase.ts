// Firebase initialisation + Firestore handle with offline persistence.
//
// Client-side Firebase web config is publishable — security comes from
// Firestore rules, not from hiding these values. The values are read from
// Vite env vars so they can be swapped without touching code.

import { initializeApp, type FirebaseOptions } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyB78reA-ow4kQbumN218FTxpcBcipocJhs",
  authDomain: "spices-a2188.firebaseapp.com",
  databaseURL: "https://spices-a2188-default-rtdb.firebaseio.com",
  projectId: "spices-a2188",
  storageBucket: "spices-a2188.firebasestorage.app",
  messagingSenderId: "449649850554",
  appId: "1:449649850554:web:d0d8917e9d0f367a6aaa83",
};


export const firebaseApp = initializeApp(firebaseConfig);

// initializeFirestore (not getFirestore) so we can enable IndexedDB persistence
// with the multi-tab manager — keeps the app fully offline-capable.
export const db: Firestore = initializeFirestore(firebaseApp, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
