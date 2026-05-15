import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD4d_9PwUF5NuQvxoA7tG1gl1T124n51N8",
  authDomain: "hala-al-yusr.firebaseapp.com",
  projectId: "hala-al-yusr",
  storageBucket: "hala-al-yusr.firebasestorage.app",
  messagingSenderId: "615619663174",
  appId: "1:615619663174:web:3e8d144d8382eb4c09c147",
  measurementId: "G-LDTNV7X6CM"
};
export const hasFirebase = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = hasFirebase ? initializeApp(firebaseConfig) : null;
export const auth = hasFirebase && app ? getAuth(app) : null;
export const dbFirestore = hasFirebase && app ? getFirestore(app) : null;
export const storage = hasFirebase && app ? getStorage(app) : null;
