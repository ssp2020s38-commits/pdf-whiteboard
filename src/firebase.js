import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCGsiJ-M9HujT88ZWLv-OOVRtFOORVVk1E",
  authDomain: "subin-1e778.firebaseapp.com",
  databaseURL: "https://subin-1e778-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "subin-1e778",
  storageBucket: "subin-1e778.firebasestorage.app",
  messagingSenderId: "1099248452156",
  appId: "1:1099248452156:web:4202572b28c1f9ccdf7939"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);