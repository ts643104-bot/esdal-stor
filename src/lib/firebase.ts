import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "1:615619663174:web:3e8d144d8382eb4c09c147",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://hala-al-yusr-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "hala-al-yusr.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "615619663174",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "hala-al-yusr",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-LDTNV7X6CM" ,
};

export const hasFirebase = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = hasFirebase ? initializeApp(firebaseConfig) : null;
export const auth = hasFirebase && app ? getAuth(app) : null;
export const dbFirestore = hasFirebase && app ? getFirestore(app) : null;
export const storage = hasFirebase && app ? getStorage(app) : null;
