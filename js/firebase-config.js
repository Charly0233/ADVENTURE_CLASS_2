// ============================================
// FIREBASE CONFIGURATION
// ============================================

// Importar los módulos de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Tu configuración de Firebase (los datos que ya tienes)
const firebaseConfig = {
  apiKey: "AIzaSyCMkPeINN_pbvEiXdRDzr0-Tp6Xefkjfz0",
  authDomain: "adventure-class-2-c5237.firebaseapp.com",
  projectId: "adventure-class-2-c5237",
  storageBucket: "adventure-class-2-c5237.firebasestorage.app",
  messagingSenderId: "482430852692",
  appId: "1:482430852692:web:7ef60d642bd260ca56d7c1",
  measurementId: "G-YBW71166LT"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios
const auth = getAuth(app);
const db = getFirestore(app);

// Exportar para usar en otros archivos
export { auth, db };

// Confirmación en consola
console.log("✅ Firebase inicializado correctamente");