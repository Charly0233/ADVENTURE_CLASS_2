// ============================================
// AUTHENTICATION LOGIC
// ============================================

import { auth, db } from './firebase-config.js';
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ============================================
// VARIABLES GLOBALES
// ============================================

let currentUser = null; // Usuario actual
let userRole = null;    // Rol del usuario (admin o student)

// ============================================
// FUNCIÓN: Iniciar sesión con Email/Password
// ============================================

export async function loginWithEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("✅ Login exitoso:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error("❌ Error en login:", error.message);
    throw new Error(getErrorMessage(error.code));
  }
}

// ============================================
// FUNCIÓN: Iniciar sesión con Google
// ============================================

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    console.log("✅ Login con Google exitoso:", result.user.email);
    
    // Verificar si el usuario ya existe en Firestore
    const userDoc = await getDoc(doc(db, 'users', result.user.uid));
    
    if (!userDoc.exists()) {
      // ✅ Usuario nuevo - NO crear el documento aún
      // Solo retornar para que se muestre el formulario de onboarding
      console.log("🆕 Usuario nuevo detectado - mostrar formulario de onboarding");
      return { user: result.user, isNewUser: true };
    }
    
    // Usuario existente - continuar normal
    return { user: result.user, isNewUser: false };
    
  } catch (error) {
    console.error("❌ Error en login con Google:", error.message);
    throw new Error(getErrorMessage(error.code));
  }
}

// ============================================
// FUNCIÓN: Crear perfil de usuario después del onboarding
// ============================================

export async function createUserProfile(userId, profileData) {
  try {
    await setDoc(doc(db, 'users', userId), {
      email: profileData.email,              // ✅ CORREGIDO
      displayName: profileData.displayName,
      nickname: profileData.nickname,
      lastName: profileData.lastName,
      avatar: profileData.avatar,
      groupId: profileData.groupId,
      role: 'student',
      totalXp: 0,
      earnedHealingPoints: 0,      // ✅ CORREGIDO
      appliedHealingPoints: 0,     // ✅ CORREGIDO
      earnedSpecialHp: 0,          // ✅ CORREGIDO (minúscula 'p')
      appliedSpecialHp: 0,         // ✅ CORREGIDO (minúscula 'p')
      currentLevel: 1,
      availableRouletteSpins: 0,
      spells: [],
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });
    
    console.log('✅ Perfil de usuario creado correctamente');
  } catch (error) {
    console.error('❌ Error creando perfil:', error);
    throw error;
  }
}

// ============================================
// FUNCIÓN: Registrar nuevo usuario (SOLO ADMIN)
// ============================================

export async function registerStudent(email, password, displayName, groupId) {
  try {
    // Verificar que el usuario actual es admin
    if (userRole !== 'admin') {
      throw new Error('Solo el profesor puede registrar alumnos');
    }
    
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const userId = userCredential.user.uid;
    
    // Crear documento en Firestore
    await setDoc(doc(db, 'users', userId), {
      email: email,
      displayName: displayName,
      role: 'student',
      groupId: groupId,
      totalXp: 0,
      earnedHealingPoints: 0,
      appliedHealingPoints: 0,
      currentLevel: 1,
      availableRouletteSpins: 0,
      spells: [],
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });
    
    console.log("✅ Alumno registrado:", displayName);
    return userId;
  } catch (error) {
    console.error("❌ Error al registrar alumno:", error.message);
    throw new Error(getErrorMessage(error.code));
  }
}

// ============================================
// FUNCIÓN: Cerrar sesión
// ============================================

export async function logout() {
  try {
    await signOut(auth);
    currentUser = null;
    userRole = null;
    console.log("✅ Sesión cerrada");
  } catch (error) {
    console.error("❌ Error al cerrar sesión:", error.message);
    throw error;
  }
}

// ============================================
// FUNCIÓN: Observar cambios en autenticación
// ============================================

export function onAuthChange(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      
      // Obtener rol del usuario desde Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        userRole = userDoc.data().role;
        console.log(`✅ Usuario autenticado: ${user.email} (${userRole})`);
        callback({ user, role: userRole, data: userDoc.data() });
      } else {
        console.warn("⚠️ Usuario sin documento en Firestore");
        callback({ user, role: null, data: null });
      }
    } else {
      currentUser = null;
      userRole = null;
      console.log("❌ No hay usuario autenticado");
      callback(null);
    }
  });
}

// ============================================
// FUNCIÓN: Obtener usuario actual
// ============================================

export function getCurrentUser() {
  return currentUser;
}

export function getUserRole() {
  return userRole;
}

// ============================================
// HELPER: Traducir códigos de error
// ============================================

function getErrorMessage(errorCode) {
  const errorMessages = {
    'auth/invalid-email': 'Correo electrónico inválido',
    'auth/user-disabled': 'Este usuario ha sido deshabilitado',
    'auth/user-not-found': 'No existe un usuario con este correo',
    'auth/wrong-password': 'Contraseña incorrecta',
    'auth/email-already-in-use': 'Este correo ya está registrado',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
    'auth/popup-closed-by-user': 'Ventana de inicio de sesión cerrada',
    'auth/cancelled-popup-request': 'Operación cancelada',
  };
  
  return errorMessages[errorCode] || 'Error desconocido. Intenta de nuevo.';
}