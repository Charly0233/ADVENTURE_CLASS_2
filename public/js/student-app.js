// ============================================
// STUDENT DASHBOARD LOGIC
// ============================================

import { auth, db } from './firebase-config.js';
import { 
  collection, 
  doc,
  getDoc,
  updateDoc,
  getDocs,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    showLuckySpinModal,
    showBuySpellModal,
    showBuyHpModal,
    showNotification,
    closeModal,
    loadChapters,
    loadSpells,
    getAvailableSpells,
    getCurrentChapter
} from './app.js';

import { initStudentWalkthrough, resetWalkthrough } from './walkthrough.js'; 
// ============================================
// VARIABLES GLOBALES
// ============================================

let currentStudentData = null;
//let availableSpells = [];
let unsubscribeStudent = null;
let currentChapter = null;  
// ============================================
// INICIALIZAR DASHBOARD DE ESTUDIANTE
// ============================================

export function initStudentDashboard(userId) {
  console.log('🎮 Inicializando Dashboard de Estudiante...');
  
  loadSpells();
  loadChapters();
  listenToStudentData(userId);
  setupStudentButtons(); // ✅ AGREGAR ESTA LÍNEA
}


// ============================================
// ESCUCHAR DATOS DEL ESTUDIANTE EN TIEMPO REAL
// ============================================

function listenToStudentData(userId) {
  const studentRef = doc(db, 'users', userId);
  
  unsubscribeStudent = onSnapshot(studentRef, (snapshot) => {
    if (snapshot.exists()) {
      currentStudentData = { id: snapshot.id, ...snapshot.data() };
      console.log('📊 Datos del estudiante actualizados:', currentStudentData);
      
      // Actualizar UI
      updateStudentProfile(currentStudentData);
      loadStudentSpells(currentStudentData);
      loadStudentTransactions(currentStudentData.id);
    } else {
      console.error('❌ No se encontraron datos del estudiante');
    }
  });
}

// ============================================
// ACTUALIZAR PERFIL DEL ESTUDIANTE
// ============================================

function updateStudentProfile(student) {
  console.log('🔄 Actualizando perfil del estudiante...');
  
  // Avatar
  const avatarImg = document.getElementById('student-profile-avatar');
  avatarImg.src = student.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(student.displayName) + '&size=150&background=0a0e27&color=00f0ff&bold=true';
  
  // Nombre, nickname y apellidos
  document.getElementById('student-profile-student-name').textContent = student.displayName || 'Sin nombre';
  document.getElementById('student-profile-student-nickname').textContent = student.nickname ? `"${student.nickname}"` : '""';
  document.getElementById('student-profile-student-lastname').textContent = student.lastName || '';
  
  // Nivel y XP
  const totalXp = student.totalXp || 0;
  const currentLevel = calculateLevel(totalXp);
  const xpForCurrentLevel = (currentLevel - 1) * 100;
  const xpForNextLevel = currentLevel * 100;
  const xpInCurrentLevel = totalXp - xpForCurrentLevel;
  const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
  const progressPercentage = (xpInCurrentLevel / xpNeededForNextLevel) * 100;
  
  document.getElementById('student-profile-level-value').textContent = currentLevel;
  document.getElementById('student-profile-xp-progress').textContent = `${xpInCurrentLevel} / ${xpNeededForNextLevel} XP`;
  
  // Actualizar círculo de progreso
  const progressCircle = document.getElementById('student-level-circle-progress');
  const isMobile = window.innerWidth <= 768;
  const radius = isMobile ? 50 : 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progressPercentage / 100) * circumference;

  progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
  progressCircle.style.strokeDashoffset = offset;
  
  // Stats
  document.getElementById('student-profile-guild-value').textContent = student.groupId || 'Sin Guild';
  document.getElementById('student-profile-total-xp-value').textContent = totalXp;
  
  // HP Normal - ✅ NUNCA NEGATIVO
  const earnedHP = student.earnedHealingPoints || 0;
  const usedHP = student.appliedHealingPoints || 0;
  const availableHP = Math.max(0, earnedHP - usedHP);

  document.getElementById('student-profile-hp-available-value').textContent = availableHP;
  document.getElementById('student-profile-hp-used-value').textContent = usedHP;

  // Special HP - ✅ NUNCA NEGATIVO
  const earnedSpecialHP = student.earnedSpecialHp || 0;      // minúscula 'p'
  const usedSpecialHP = student.appliedSpecialHp || 0;       // minúscula 'p'
  const availableSpecialHP = Math.max(0, earnedSpecialHP - usedSpecialHP);

  document.getElementById('student-profile-special-hp-available-value').textContent = availableSpecialHP;
  document.getElementById('student-profile-special-hp-used-value').textContent = usedSpecialHP;
  
  // Lucky Spins
  const spinsAvailable = student.availableRouletteSpins || 0;
  const spinBtn = document.getElementById('student-lucky-spin-btn');
  const spinCounter = document.getElementById('student-lucky-spin-counter');
  
  spinCounter.textContent = spinsAvailable;
  
  if (spinsAvailable > 0) {
    spinBtn.classList.remove('lucky-spin-inactive');
    spinBtn.classList.add('lucky-spin-active');
  } else {
    spinBtn.classList.remove('lucky-spin-active');
    spinBtn.classList.add('lucky-spin-inactive');
  }
}

// ============================================
// CALCULAR NIVEL
// ============================================

function calculateLevel(xp) {
  return Math.floor(xp / 100) + 1;
}

// ============================================
// CARGAR HECHIZOS DEL ESTUDIANTE
// ============================================

function loadStudentSpells(student) {
  const spellsContainer = document.getElementById('student-profile-spells-container');
  const studentSpells = student.spells || [];
  
  if (studentSpells.length === 0) {
    spellsContainer.innerHTML = '<p class="empty-state">No tienes hechizos adquiridos aún</p>';
    return;
  }

  const availableSpells = getAvailableSpells();
  
  spellsContainer.innerHTML = studentSpells
    .filter(spell => !spell.transferred)
    .map(spell => {
      const statusClass = spell.casted ? 'spell-used' : 'spell-available';
      const statusText = spell.casted ? 'Usado' : 'Disponible';
      
      const spellInfo = availableSpells.find(s => s.id === spell.spellId);
      const description = spellInfo ? spellInfo.description : 'Hechizo especial';
      
      let originBadge = '';
      if (spell.obtainedFrom === 'lucky_spin') {
        originBadge = '<span style="background: rgba(255, 215, 0, 0.2); color: #ffd700; padding: 0.2rem 0.5rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.5rem;">🎲 Lucky Spin</span>';
      } else if (spell.obtainedFrom === 'gift') {
        originBadge = '<span style="background: rgba(0, 255, 65, 0.2); color: var(--neon-green); padding: 0.2rem 0.5rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.5rem;">🎁 Regalo</span>';
      } else if (spell.obtainedFrom === 'exchange') {
        originBadge = '<span style="background: rgba(0, 240, 255, 0.2); color: var(--neon-cyan); padding: 0.2rem 0.5rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.5rem;">🔄 Intercambio</span>';
      }
      
      return `
        <div class="spell-card ${statusClass}">
          <div class="spell-icon">${spell.spellIcon}</div>
          <div class="spell-info">
            <h4 class="spell-name">${spell.spellName} ${originBadge}</h4>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.5rem 0;">${description}</p>
            <span class="spell-status">${statusText}</span>
          </div>
        </div>
      `;
    }).join('');
}

// ============================================
// CARGAR TRANSACCIONES DEL ESTUDIANTE
// ============================================

async function loadStudentTransactions(studentId) {
  const tbody = document.getElementById('student-profile-transactions-tbody');
  
  try {
    const transactionsRef = collection(db, 'transactions');
    const q = query(
      transactionsRef, 
      where('userId', '==', studentId),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay transacciones registradas</td></tr>';
      return;
    }
    
    tbody.innerHTML = snapshot.docs.map(doc => {
      const data = doc.data();
      const date = data.timestamp?.toDate().toLocaleString() || 'Fecha desconocida';
      const type = data.type || 'unknown';
      const xpChange = data.amount || 0;
      const detail = data.reason || data.spellName || 'Sin detalle';
      
      const xpClass = xpChange >= 0 ? 'xp-positive' : 'xp-negative';
      const xpSign = xpChange >= 0 ? '+' : '';
      
      return `
        <tr>
          <td>${date}</td>
          <td>${getTransactionTypeLabel(type)}</td>
          <td class="${xpClass}">${xpSign}${xpChange} XP</td>
          <td>${detail}</td>
        </tr>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error cargando transacciones:', error);
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Error al cargar transacciones</td></tr>';
  }
}

// ============================================
// HELPER: Etiquetas de tipo de transacción
// ============================================

function getTransactionTypeLabel(type) {
  const labels = {
    'xp_add': '⚡ XP Agregado',
    'xp_subtract': '❌ XP Restado',
    'guild_xp_add': '🛡️ XP de Guild',
    'party_xp_add': '👥 XP de Party',
    'spell_purchase': '🪄 Compra Hechizo',
    'hp_purchase': '❤️ Compra HP',
    'special_hp_purchase': '✨ Compra Special HP',
    'lucky_spin': '🎲 Lucky Spin',
    'spell_gift': '🎁 Regalo de Hechizo',
    'spell_exchange': '🔄 Intercambio de Hechizo',
    'level_up': '⬆️ Subida de Nivel'
  };
  return labels[type] || type;
}
export function getCurrentStudentData() {
  return currentStudentData;
}

// ============================================
// CLEANUP AL SALIR
// ============================================

export function cleanupStudentDashboard() {
  if (unsubscribeStudent) {
    unsubscribeStudent();
    unsubscribeStudent = null;
  }
}

function setupStudentButtons() {
  setTimeout(() => {
    // Botón Lucky Spin
    const spinBtn = document.getElementById('student-lucky-spin-btn');
    if (spinBtn) {
      const newSpinBtn = spinBtn.cloneNode(true);
      spinBtn.parentNode.replaceChild(newSpinBtn, spinBtn);
      
      // ✅ AGREGAR AMBOS EVENTOS
      const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🎲 Click en Lucky Spin');
        
        if ((currentStudentData?.availableRouletteSpins || 0) > 0) {
          showStudentLuckySpinModal();
        } else {
          showNotification('⚠️ No tienes Lucky Spins disponibles', 'warning');
        }
      };
      
      newSpinBtn.addEventListener('click', handleClick, { passive: false });
      newSpinBtn.addEventListener('touchend', handleClick, { passive: false }); // ✅ AGREGAR
    }

    // Botón Comprar Hechizo
    const buySpellBtn = document.getElementById('student-profile-buy-spell-btn');
    if (buySpellBtn) {
      const newBuySpellBtn = buySpellBtn.cloneNode(true);
      buySpellBtn.parentNode.replaceChild(newBuySpellBtn, buySpellBtn);
      
      const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🪄 Click en Comprar Hechizo');
        showStudentBuySpellModal();
      };
      
      newBuySpellBtn.addEventListener('click', handleClick, { passive: false });
      newBuySpellBtn.addEventListener('touchend', handleClick, { passive: false }); // ✅ AGREGAR
    }

    // Botón Comprar HP
    const buyHPBtn = document.getElementById('student-buy-HP-btn');
    if (buyHPBtn) {
      const newBuyHPBtn = buyHPBtn.cloneNode(true);
      buyHPBtn.parentNode.replaceChild(newBuyHPBtn, buyHPBtn);
      
      const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('💚 Click en Comprar HP');
        showStudentBuyHPModal();
      };
      
      newBuyHPBtn.addEventListener('click', handleClick, { passive: false });
      newBuyHPBtn.addEventListener('touchend', handleClick, { passive: false }); // ✅ AGREGAR
    }

    // Botón Editar Perfil
    const editProfileBtn = document.getElementById('student-edit-profile-btn');
    if (editProfileBtn) {
      const newEditProfileBtn = editProfileBtn.cloneNode(true);
      editProfileBtn.parentNode.replaceChild(newEditProfileBtn, editProfileBtn);
      
      const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('✏️ Click en Editar Perfil');
        showStudentEditProfileModal();
      };
      
      newEditProfileBtn.addEventListener('click', handleClick, { passive: false });
      newEditProfileBtn.addEventListener('touchend', handleClick, { passive: false }); // ✅ AGREGAR
    }

    const helpbtn= document.getElementById('help-btn');
    if( helpbtn ) {
      const newHelpBtn = helpbtn.cloneNode(true);
      helpbtn.parentNode.replaceChild(newHelpBtn, helpbtn);

      const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('❓ Click en Ayuda');
        resetWalkthrough();
        initStudentWalkthrough();
      };

      newHelpBtn.addEventListener('click', handleClick, { passive: false });
      newHelpBtn.addEventListener('touchend', handleClick, { passive: false }); // ✅ AGREGAR
    }
    
    console.log('✅ Event listeners configurados para estudiante');
  }, 200);
}

// ============================================
// MODALES PARA ESTUDIANTE (Placeholder)
// ============================================

function showStudentLuckySpinModal() {
    if(!currentStudentData) {
        showNotification('❌ Datos del estudiante no disponibles', 'error');
        return;
    }
    showLuckySpinModal(currentStudentData);
}

function showStudentBuySpellModal() {
    if(!currentStudentData) {  
        showNotification('❌ Datos del estudiante no disponibles', 'error');
        return;
    }
    showBuySpellModal(currentStudentData);
}

function showStudentBuyHPModal() {
    if(!currentStudentData) {  
        showNotification('❌ Datos del estudiante no disponibles', 'error');
        return;
    }
    showBuyHpModal(currentStudentData);
}

function showStudentEditProfileModal() {
  if (!currentStudentData) return;
  
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 1.5rem;">
      ✏️ Editar Mi Perfil
    </h2>
    
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Nombre Completo
      </label>
      <input type="text" id="edit-student-displayname" value="${currentStudentData.displayName || ''}"
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Nickname
      </label>
      <input type="text" id="edit-student-nickname" value="${currentStudentData.nickname || ''}"
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Apellidos
      </label>
      <input type="text" id="edit-student-lastname" value="${currentStudentData.lastName || ''}"
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Avatar URL (Opcional)
      </label>
      <input type="url" id="edit-student-avatar" value="${currentStudentData.avatar || ''}" placeholder="https://ejemplo.com/mi-foto.jpg"
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
      <p style="color: var(--text-secondary); font-size: 0.75rem; margin-top: 0.3rem;">
        Si dejas esto vacío, se usará tu foto de Google
      </p>
    </div>
    
    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-edit-profile" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer;">
        Guardar Cambios
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  // Confirmar cambios
  document.getElementById('confirm-edit-profile').onclick = async () => {
    const displayName = document.getElementById('edit-student-displayname').value.trim();
    const nickname = document.getElementById('edit-student-nickname').value.trim();
    const lastName = document.getElementById('edit-student-lastname').value.trim();
    const avatar = document.getElementById('edit-student-avatar').value.trim();
    
    if (!displayName) {
      showNotification('⚠️ El nombre es obligatorio', 'warning');
      return;
    }
    
    if (!nickname) {
      showNotification('⚠️ El nickname es obligatorio', 'warning');
      return;
    }
    
    try {
      const studentRef = doc(db, 'users', currentStudentData.id);
      
      await updateDoc(studentRef, {
        displayName,
        nickname,
        lastName: lastName || '',
        avatar: avatar || currentStudentData.avatar,
        lastUpdated: serverTimestamp()
      });
      
      showNotification('✅ Perfil actualizado correctamente', 'success');
      closeModal();
      
    } catch (error) {
      console.error('Error actualizando perfil:', error);
      showNotification('❌ Error al actualizar perfil', 'error');
    }
  };
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}