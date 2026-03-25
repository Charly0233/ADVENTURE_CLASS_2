// ============================================
// APP LOGIC - Dashboard Management (VERSIÓN SIMPLIFICADA)
// ============================================

import { auth, db } from './firebase-config.js';
import { getUserRole } from './auth.js';
import { 
  collection, 
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ============================================
// VARIABLES GLOBALES
// ============================================

let allStudents = []; // Todos los alumnos
let allGroups = [];   // Todos los guilds
let unsubscribeStudents = null; // Para detener el listener
let currentView = 'cards'; // 'cards' o 'table'
let availableSpells = [];
let availableChapters = []; // Lista de capítulos
let currentChapter = null;   // Capítulo activo actual

export function getAvailableSpells() {
  return availableSpells;
}

// ============================================
// INICIALIZAR CAPÍTULOS EN FIRESTORE (Solo ejecutar una vez)
// ============================================

async function initializeChaptersInFirestore() {
  try {
    const configDoc = doc(db, 'appConfig', 'chapters');
    
    // Verificar si ya existen
    const docSnap = await getDoc(configDoc);
    
    if (!docSnap.exists()) {
      // Cargar desde JSON
      const response = await fetch('./chapters.json');
      const chaptersData = await response.json();
      
      // Guardar en Firestore usando setDoc
      await setDoc(configDoc, {
        chapters: chaptersData,
        lastUpdated: serverTimestamp(),
        createdBy: auth.currentUser.uid
      });
      
      console.log('✅ Capítulos inicializados en Firestore');
    } else {
      console.log('✅ Capítulos ya existen en Firestore');
    }
  } catch (error) {
    console.error('❌ Error inicializando capítulos:', error);
    throw error; // Re-lanzar el error para manejarlo arriba
  }
}

// ============================================
// CARGAR CAPÍTULOS DESDE FIRESTORE
// ============================================

export async function loadChapters() {
  try {
    const configDoc = doc(db, 'appConfig', 'chapters');
    const docSnap = await getDoc(configDoc);
    
    if (docSnap.exists()) {
      availableChapters = docSnap.data().chapters || [];
      currentChapter = availableChapters.find(c => c.active) || availableChapters[0];
      console.log('✅ Capítulos cargados desde Firestore. Actual:', currentChapter.name);
      
      updateCurrentChapterDisplay();
    } else {
      // Si no existen en Firestore, inicializar desde JSON
      console.log('⚠️ Capítulos no encontrados. Inicializando...');
      await initializeChaptersInFirestore();
      // Reintentar carga
      await loadChapters();
    }
  } catch (error) {
    console.error('❌ Error al cargar capítulos:', error);
    availableChapters = [];
  }
}

// Actualizar display del capítulo actual
function updateCurrentChapterDisplay() {
  const chapterStat = document.getElementById('current-chapter-stat');
  if (chapterStat && currentChapter) {
    chapterStat.textContent = currentChapter.name;
  }
}

export function getCurrentChapter() {
  return currentChapter;
}




// ============================================
// INICIALIZAR DASHBOARD DE ADMIN
// ============================================

export function initAdminDashboard() {
  console.log('🎮 Inicializando Dashboard de Admin...');
  console.log('📱 Ancho de pantalla:', window.innerWidth);
  console.log('📱 ¿Es móvil?', window.innerWidth <= 768);
  
  loadSpells(); // Cargar hechizos disponibles
  loadChapters(); // Cargar capítulos disponibles
  // Escuchar cambios en la colección de students en tiempo real
  listenToStudents();
  
  // Event Listeners de filtros
  setupFilters();
  
  // Event Listeners para botones de toggle móvil
  setupMobileToggles();

  
}

// ============================================
// CARGAR HECHIZOS DESDE JSON
// ============================================

export async function loadSpells() {
  try {
    const response = await fetch('./spells.json');
    if (!response.ok) {
      throw new Error('No se pudo cargar spells.json');
    }
    availableSpells = await response.json();
    console.log('✅ Hechizos cargados:', availableSpells);
  } catch (error) {
    console.error('❌ Error al cargar hechizos:', error);
    availableSpells = []; // Array vacío si falla
  }
}

function listenToStudents() {
  const studentsRef = collection(db, 'users');
  const studentsQuery = query(studentsRef, where('role', '==', 'student'), orderBy('displayName'));
  
  unsubscribeStudents = onSnapshot(studentsQuery, async (snapshot) => {
    allStudents = [];
    const guildsSet = new Set(); // ✅ CAMBIO: Crear Set temporal (no usar allGroups directamente)
    
    snapshot.forEach((doc) => {
      const studentData = { id: doc.id, ...doc.data() };
      allStudents.push(studentData);
      
      if (studentData.groupId && studentData.groupId !== 'sin-grupo') {
        guildsSet.add(studentData.groupId); // ✅ CAMBIO: agregar a guildsSet (no a allGroups)
      }
    });
    
    // ✅ Cargar guilds desde Firestore también
    try {
      const guildsRef = collection(db, 'groups');
      const guildsSnapshot = await getDocs(guildsRef);
      
      guildsSnapshot.forEach((doc) => {
        const guildData = doc.data();
        if (guildData.name && guildData.name !== 'sin-grupo') {
          guildsSet.add(guildData.name); // ✅ CAMBIO: agregar a guildsSet (no a allGroups)
        }
      });
    } catch (error) {
      console.error('Error cargando guilds:', error);
    }
    
    // ✅ CAMBIO: Convertir el Set a Array y asignarlo a allGroups
    allGroups = Array.from(guildsSet).sort();
    
    console.log(`📊 ${allStudents.length} alumnos cargados`);
    console.log(`🛡️ ${allGroups.length} guilds disponibles:`, allGroups);
    
    // Actualizar UI
    updateStats();
    updateGuildFilter();
    renderStudentCards();
  }, (error) => {
    console.error('Error al escuchar students:', error);
    alert('Error al cargar alumnos: ' + error.message);
  });
}
// ============================================
// ACTUALIZAR ESTADÍSTICAS
// ============================================

function updateStats() {
  const totalStudents = allStudents.length;
  document.getElementById('total-students-stat').textContent = totalStudents;
  
  // Actualizar Leaderboard
  updateLeaderboard();
  
  // Actualizar Hechizo Popular (placeholder por ahora)
  document.getElementById('popular-spell-stat').textContent = 'Apparition';
}

// ============================================
// ACTUALIZAR LEADERBOARD
// ============================================

function updateLeaderboard() {
  const leaderboardFilter = document.getElementById('leaderboard-filter').value;
  
  // Filtrar por guild si no es "all"
  let studentsToRank = allStudents;
  if (leaderboardFilter !== 'all') {
    studentsToRank = allStudents.filter(s => s.groupId === leaderboardFilter);
  }
  
  // Ordenar por XP descendente y tomar top 3
  const top3 = studentsToRank
    .sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0))
    .slice(0, 3);
  
  const leaderboardList = document.getElementById('leaderboard-list');
  
  if (top3.length === 0) {
    leaderboardList.innerHTML = `
      <li class="leaderboard-item">
        <span class="leaderboard-rank">--</span>
        <span class="leaderboard-name">Sin datos</span>
        <span class="leaderboard-xp">-- XP</span>
      </li>
    `;
    return;
  }
  
  leaderboardList.innerHTML = top3.map((student, index) => {
    const medals = ['🥇', '🥈', '🥉'];
    return `
      <li class="leaderboard-item">
        <span class="leaderboard-rank">${medals[index]}</span>
        <span class="leaderboard-name">${student.displayName}</span>
        <span class="leaderboard-xp">${student.totalXp || 0} XP</span>
      </li>
    `;
  }).join('');
}

// ============================================
// ACTUALIZAR FILTRO DE GUILDS
// ============================================

function updateGuildFilter() {
  const guildFilter = document.getElementById('guild-filter');
  const leaderboardFilter = document.getElementById('leaderboard-filter');
  const currentValue = guildFilter.value;
  const currentLeaderboardValue = leaderboardFilter.value;
  
  // Actualizar filtro de lista de alumnos
  guildFilter.innerHTML = '<option value="all">Todos</option>';
  
  allGroups.forEach(guild => {
    const option = document.createElement('option');
    option.value = guild;
    option.textContent = guild;
    guildFilter.appendChild(option);
  });
  
  // Restaurar selección previa si existe
  if (currentValue && allGroups.includes(currentValue)) {
    guildFilter.value = currentValue;
  }
  
  // Actualizar filtro de leaderboard
  leaderboardFilter.innerHTML = '<option value="all">General</option>';
  
  allGroups.forEach(guild => {
    const option = document.createElement('option');
    option.value = guild;
    option.textContent = guild;
    leaderboardFilter.appendChild(option);
  });
  
  // Restaurar selección previa si existe
  if (currentLeaderboardValue && allGroups.includes(currentLeaderboardValue)) {
    leaderboardFilter.value = currentLeaderboardValue;
  }
}

// ============================================
// RENDERIZAR CARDS DE ALUMNOS
// ============================================

function renderStudentCards() {
  const studentsList = document.getElementById('students-list');
  const guildFilter = document.getElementById('guild-filter').value;
  const searchTerm = document.getElementById('student-search').value.toLowerCase();
  
  // Filtrar alumnos
  const filteredStudents = allStudents.filter(student => {
    const matchesGuild = guildFilter === 'all' || student.groupId === guildFilter;
    const matchesSearch = student.displayName.toLowerCase().includes(searchTerm) || 
                          student.email.toLowerCase().includes(searchTerm) ||
                          (student.nickname && student.nickname.toLowerCase().includes(searchTerm));
    return matchesGuild && matchesSearch;
  });
  
  // Limpiar lista
  studentsList.innerHTML = '';
  
  if (filteredStudents.length === 0) {
    studentsList.className = 'students-grid';
    studentsList.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
        <p style="font-size: 1.2rem;">📭 No hay alumnos que mostrar</p>
        <p style="margin-top: 0.5rem;">Agrega alumnos desde Firebase Console por ahora</p>
      </div>
    `;
    return;
  }
  
  // Renderizar según la vista actual
  if (currentView === 'cards') {
    renderCardsView(studentsList, filteredStudents);
  } else {
    renderTableView(studentsList, filteredStudents);
  }
}

// ============================================
// RENDERIZAR VISTA DE TARJETAS
// ============================================

function renderCardsView(container, students) {
  container.className = 'students-grid';
  
  students.forEach(student => {
    const card = createStudentCard(student);
    container.appendChild(card);
  });
}

// ============================================
// RENDERIZAR VISTA DE TABLA
// ============================================

function renderTableView(container, students) {
  container.className = 'students-table';
  
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Guild</th>
        <th>Nivel</th>
        <th>XP</th>
        <th>HP</th>
        <th>Spins</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody id="table-body">
    </tbody>
  `;
  
  container.appendChild(table);
  const tbody = table.querySelector('#table-body');
  
  students.forEach(student => {
    const row = createStudentRow(student);
    tbody.appendChild(row);
  });
}

// ============================================
// CREAR FILA DE TABLA
// ============================================
// ============================================
// CREAR FILA DE TABLA
// ============================================

function createStudentRow(student) {
  const row = document.createElement('tr');
  const level = calculateLevel(student.totalXp || 0);
  const xp = student.totalXp || 0;
  const hp = student.earnedHealingPoints || 0;
  const spins = student.availableRouletteSpins || 0;
  const guild = student.groupId || 'Sin Guild';
  const specialHP = student.earnedSpecialHp || 0;
  
  // Agregar clase si XP es negativo
  if (xp < 0) {
    row.classList.add('negative-xp');
  }
  
  // Determinar color del XP
  const xpColor = xp < 0 ? '#ff4757' : 'var(--neon-cyan)';
  const xpStyle = `color: ${xpColor}; font-weight: 700;`;
  
  // Determinar si tiene spins (para el badge)
  const levelBadge = spins > 0 
    ? `<span style="background: linear-gradient(135deg, #ffd700, #ff8c00); padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.8rem; font-weight: 700; color: #0a0e27;">Lvl ${level} 🎲</span>`
    : `<span style="background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.8rem; font-weight: 700; color: #0a0e27;">Lvl ${level}</span>`;
  
  row.innerHTML = `
    <td><strong>${student.displayName}</strong></td>
    <td>🛡️ ${guild}</td>
    <td>${levelBadge}</td>
    <td style="${xpStyle}">⚡ ${xp}</td>
    <td>❤️ ${hp}</td>
    <td>🎲 ${spins}</td>
    <td>✨ ${specialHP}</td>
    <td>
      <div class="table-actions">
        <button class="table-action-btn add-xp" title="Agregar XP">➕</button>
        <button class="table-action-btn remove-xp" title="Restar XP">➖</button>
        <button class="table-action-btn buys-spell" title="Buy Spell">🪄</button>
        <button class="table-action-btn buy-HP" title="Buy HP">❤️</button>
        <button class="table-action-btn spin" title="Spin">🎲</button>
        <button class="table-action-btn delete-student" title="Eliminar" style="color: #ff4757;">🗑️</button>
      </div>
    </td>
  `;
  
  // ✅ AGREGAR EVENT LISTENERS DESPUÉS DE CREAR EL HTML
  setTimeout(() => {
    const addXpBtn = row.querySelector('.add-xp');
    const removeXpBtn = row.querySelector('.remove-xp');
    const buySpellBtn = row.querySelector('.buys-spell');
    const buyHPBtn = row.querySelector('.buy-HP');
    const spinBtn = row.querySelector('.spin');
    const deleteBtn = row.querySelector('.delete-student');
    
    if (addXpBtn) {
      addXpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showAddXpModal(student);
        console.log('Agregar XP a', student.displayName);
      });
    }
    
      removeXpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('quitar XP a', student.displayName);
        showRemoveXpModal(student);
      });
    
    if (buySpellBtn) {
      buySpellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showBuySpellModal(student);
      });
    }
    
    if (buyHPBtn) {
      buyHPBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showBuyHpModal(student);
      });
    }
    if (spinBtn) {
      spinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showLuckySpinModal(student);
      });
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteStudent(student.id);
      });
    }
  }, 0);
  
  row.addEventListener('click', (e) => {
    // Solo abrir perfil si NO se hizo clic en un botón de acción
    if (!e.target.closest('.table-action-btn')) {
      showStudentProfile(student);
    }
  });
  
  return row;
}

// ============================================
// CREAR CARD DE ALUMNO
// ============================================

function createStudentCard(student) {
  const card = document.createElement('div');
  card.className = 'student-card';
  card.dataset.studentId = student.id;
  
  const level = calculateLevel(student.totalXp || 0);
  const xp = student.totalXp || 0;
  const hp = student.earnedHealingPoints || 0;
  const spins = student.availableRouletteSpins || 0;
  const guild = student.groupId || 'Sin Guild';
  const specialHP = student.earnedSpecialHp || 0;
  
  // Determinar si tiene spins disponibles para agregar clase CSS
  const hasSpinsClass = spins > 0 ? 'has-spins' : '';
  
  // Determinar color del XP (rojo si es negativo)
  const xpColor = xp < 0 ? '#ff4757' : 'var(--neon-cyan)';
  
  // ✅ AGREGAR: Avatar con fallback
  const avatarUrl = student.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName)}&background=00f0ff&color=0a0e27&size=128`;
  
  card.innerHTML = `
    <div class="student-header">
      <!-- ✅ AGREGAR: Avatar -->
      <div class="student-card-avatar">
        <img src="${avatarUrl}" 
             alt="${student.displayName}"
             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName)}&background=00f0ff&color=0a0e27&size=128'">
      </div>
      
      <!-- ✅ MODIFICAR: Agrupar info -->
      <div class="student-header-info">
        <div class="student-name">${student.displayName}</div>
        <div class="student-nickname">@${student.nickname || 'Sin nickname'}</div>
        <div class="student-guild">🛡️ ${guild}</div>
      </div>
      
      <div class="student-level ${hasSpinsClass}">Lvl ${level}</div>
    </div>
    
    <div class="student-stats">
      <div class="stat-item">
        <span class="stat-item-label">XP</span>
        <span class="stat-item-value" style="color: ${xpColor};">⚡ ${xp}</span>
      </div>
      <div class="stat-item">
        <span class="stat-item-label">HP</span>
        <span class="stat-item-value">❤️ ${hp}</span>
      </div>
      <div class="stat-item">
        <span class="stat-item-label">Spins</span>
        <span class="stat-item-value">🎲 ${spins}</span>
      </div>
      <div class="stat-item">
        <span class="stat-item-label">SpecialHP</span>
        <span class="stat-item-value">✨ ${specialHP}</span>
      </div>
      <button class="card-action-btn delete-student" title="Eliminar Alumno" style="color: #ff4757;">
        🗑️
      </button>
    </div>
    
    <div class="student-actions">
      <button class="card-action-btn add-xp" title="Agregar XP">
        ➕
      </button>
      <button class="card-action-btn remove-xp" title="Restar XP">
        ➖
      </button>
      <button class="card-action-btn buys-spell" title="Buy Spell">
        🪄
      </button>
      <button class="card-action-btn buy-HP" title="Buy HP">
        ❤️
      </button>
      <button class="card-action-btn spin" title="Girar Ruleta" >
        🎲
      </button>
    </div>
  `;
  
  // El resto del código sigue igual...
  setTimeout(() => {
    const addXpBtn = card.querySelector('.add-xp');
    const removeXpBtn = card.querySelector('.remove-xp');
    const buySpellBtn = card.querySelector('.buys-spell');
    const buyHPBtn = card.querySelector('.buy-HP');
    const spinBtn = card.querySelector('.spin');
    const deleteBtn = card.querySelector('.delete-student');
    
    if (addXpBtn) {
      addXpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showAddXpModal(student);
      });
    }
    
    if (removeXpBtn) {
      removeXpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showRemoveXpModal(student);
      });
    }
    
    if (buySpellBtn) {
      buySpellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showBuySpellModal(student);
      });
    }
    
    if (buyHPBtn) {
      buyHPBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showBuyHpModal(student);
      });
    }

    if (spinBtn) {
      spinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showLuckySpinModal(student);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteStudent(student.id);
      });
    }
  }, 0);
  
  card.style.cursor = 'pointer';
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.card-action-btn')) {
      showStudentProfile(student);
    }
  });
  
  return card;
}

// ============================================
// CALCULAR NIVEL
// ============================================

function calculateLevel(xp) {
  return Math.floor(xp / 100) + 1;
}

// ============================================
// SETUP FILTROS
// ============================================

function setupFilters() {
  // Filtros
  document.getElementById('guild-filter').addEventListener('change', renderStudentCards);
  document.getElementById('student-search').addEventListener('input', renderStudentCards);
  document.getElementById('leaderboard-filter').addEventListener('change', updateLeaderboard);
  
  // Toggle de vista
  document.getElementById('toggle-view-btn').addEventListener('click', toggleView);

  const changeChapterBtn = document.getElementById('change-chapter-btn');
  if (changeChapterBtn) {
    changeChapterBtn.addEventListener('click', showChangeChapterModal);
  }
   const massXpBtn = document.getElementById('mass-xp-btn');
  if (massXpBtn) {
    massXpBtn.addEventListener('click', showAddXpToGuildModal);
  }
  
  // Botón de XP a Party
  const partyXpBtn = document.getElementById('party-xp-btn');
  if (partyXpBtn) {
    partyXpBtn.addEventListener('click', showAddXpToPartyModal);
  }
  // Botón de intercambio
  const exchangeBtn = document.getElementById('exchange-btn');
  if (exchangeBtn) {
    exchangeBtn.addEventListener('click', showSpellExchangeModal);
  }
  const editStudentBtn = document.getElementById('edit-student-btn');
  if (editStudentBtn) {
    editStudentBtn.addEventListener('click', showEditStudentModal);
  }
    // Botón de gestionar guilds
  const manageGuildsBtn = document.getElementById('manage-guilds-btn');
  if (manageGuildsBtn) {
    manageGuildsBtn.addEventListener('click', showManageGuildsModal);
  }
  // Botón de agregar alumno
  const addStudentBtn = document.getElementById('add-student-btn');
  if (addStudentBtn) {
    addStudentBtn.addEventListener('click', showAddStudentModal);
  }

  // Botón de eliminar todos los alumnos
  const deleteAllBtn = document.getElementById('delete-all-students-btn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', showDeleteAllStudentsModal);
  }
  const randomOrderBtn = document.getElementById('random-order-btn');
  if (randomOrderBtn) {
    randomOrderBtn.addEventListener('click', showRandomOrderModal);
  }
}

// ============================================
// MODAL: Agregar Alumno
// ============================================
async function showAddStudentModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');

  // Opciones de guilds
  let guildOptions = '<option value="sin-grupo">Sin Guild</option>';
  allGroups.forEach(guild => {
    guildOptions += `<option value="${guild}">🛡️ ${guild}</option>`;
  });

  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 1.5rem;">
      ➕ Agregar Alumno
    </h2>

    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">Nombre completo</label>
      <input type="text" id="new-student-name" placeholder="Ej: Juan Pérez"
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>

    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">Email</label>
      <input type="email" id="new-student-email" placeholder="Ej: juan@email.com"
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>

    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">Guild</label>
      <select id="new-student-guild"
              style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
        ${guildOptions}
      </select>
    </div>

    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-add-student" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer;">
        ➕ Agregar
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255,255,255,0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;

  modalOverlay.classList.remove('hidden');

  document.getElementById('confirm-add-student').onclick = async () => {
    const displayName = document.getElementById('new-student-name').value.trim();
    const email = document.getElementById('new-student-email').value.trim();
    const groupId = document.getElementById('new-student-guild').value;

    if (!displayName) {
      showNotification('⚠️ Ingresa el nombre del alumno', 'warning');
      return;
    }
    if (!email) {
      showNotification('⚠️ Ingresa el email del alumno', 'warning');
      return;
    }

    await createStudentInFirestore(displayName, email, groupId);
    closeModal();
  };

  document.getElementById('cancel-modal').onclick = closeModal;
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  };
}

// ============================================
// CREAR ALUMNO EN FIRESTORE (sin Auth)
// ============================================
async function createStudentInFirestore(displayName, email, groupId) {
  try {
    const usersRef = collection(db, 'users');

    // Verificar si ya existe un alumno con ese email
    const existing = allStudents.find(s => s.email === email);
    if (existing) {
      showNotification('⚠️ Ya existe un alumno con ese email', 'warning');
      return;
    }

    const newStudentRef = doc(usersRef); // ID automático
    await setDoc(newStudentRef, {
      email,
      displayName,
      nickname: '',
      lastName: '',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=00f0ff&color=0a0e27&size=128`,
      groupId,
      role: 'student',
      totalXp: 0,
      earnedHealingPoints: 0,
      appliedHealingPoints: 0,
      earnedSpecialHp: 0,
      appliedSpecialHp: 0,
      currentLevel: 1,
      availableRouletteSpins: 0,
      spells: [],
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });

    showNotification(`✅ ${displayName} agregado correctamente`, 'success');
    await loadStudents(); // Recargar la lista

  } catch (error) {
    console.error('Error creando alumno:', error);
    showNotification('❌ Error al crear el alumno', 'error');
  }
}

// ============================================
// MODAL: Orden Aleatorio de Presentaciones
// ============================================
function showRandomOrderModal() {
  let originalNames = []; // ✅ scope compartido entre animaciones
  let shuffledNames = [];
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
function playRandomAnimation(onComplete) {
    const animFns = [renderShuffleAnimation, renderSlotAnimation, renderExplosionAnimation];
    const chosen = animFns[Math.floor(Math.random() * animFns.length)];
    chosen(onComplete);
  }

  function renderShuffleAnimation(onComplete) {
    const names = shuffledNames || [];
    modalContainer.innerHTML = `
      <div id="shuffle-stage" style="position:relative;height:220px;overflow:hidden;border-radius:10px;background:rgba(0,0,0,0.2);">
      </div>
      <p style="text-align:center;color:var(--neon-cyan);font-family:'Orbitron',sans-serif;font-size:0.9rem;margin-top:1rem;letter-spacing:2px;" id="shuffle-msg">Barajando...</p>
    `;
    const stage = document.getElementById('shuffle-stage');
    const msgEl = document.getElementById('shuffle-msg');
    const W = stage.offsetWidth;
    const H = stage.offsetHeight;

    const cards = names.map((name, i) => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;width:140px;height:38px;background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:0.85rem;color:var(--text-primary);transition:none;`;
      el.textContent = name;
      const startX = 20 + (i % 2) * (W - 160);
      const startY = 15 + Math.floor(i / 2) * 55;
      el.style.left = startX + 'px';
      el.style.top = startY + 'px';
      stage.appendChild(el);
      return el;
    });

    const cx = W / 2 - 70;
    const cy = H / 2 - 19;

    // FASE 1: ir al centro
    setTimeout(() => {
      cards.forEach((el, i) => {
        el.style.transition = 'all 0.35s ease-in';
        el.style.left = (cx + (i - cards.length/2) * 5) + 'px';
        el.style.top = (cy + (i - cards.length/2) * 3) + 'px';
        el.style.transform = `rotate(${(i - cards.length/2) * 8}deg)`;
      });
    }, 100);

    // FASE 2: mezcla rápida
    let mixFrame = 0;
    const mixInterval = setInterval(() => {
      cards.forEach((el, i) => {
        el.style.transition = 'all 0.08s ease';
        el.style.left = (cx + (Math.random()-0.5)*30 + (i-cards.length/2)*4) + 'px';
        el.style.top = (cy + (Math.random()-0.5)*20 + (i-cards.length/2)*3) + 'px';
        el.style.transform = `rotate(${(Math.random()-0.5)*25}deg)`;
      });
      mixFrame++;
      if (mixFrame >= 6) clearInterval(mixInterval);
    }, 100);

    // FASE 3: volar a posición final
    setTimeout(() => {
      if (msgEl) msgEl.textContent = '¡Listo!';
      cards.forEach((_, i) => {
        const originalIndex = i;
        const el = cards[originalIndex];
        setTimeout(() => {
          el.style.transition = 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)';
          el.style.left = (W/2 - 70) + 'px';
          el.style.top = (10 + i * 48) + 'px';
          el.style.transform = 'rotate(0deg)';
        }, i * 100);
      });
      setTimeout(onComplete, cards.length * 100 + 500);
    }, 900);
  }

  function renderSlotAnimation(onComplete) {
    const names = originalNames || [];
    const slots = names.map((_, i) => i + 1).slice(0, names.length);

    modalContainer.innerHTML = `
      <h2 style="font-family:'Orbitron',sans-serif;color:var(--neon-cyan);margin-bottom:1rem;font-size:1.1rem;">🎰 Sorteando...</h2>
      <div id="slots-container" style="background:rgba(0,0,0,0.2);border-radius:10px;padding:1rem;"></div>
    `;

    const container = document.getElementById('slots-container');
    container.innerHTML = names.map((_, i) => `
      <div style="display:flex;align-items:center;gap:0.8rem;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-family:'Orbitron',sans-serif;font-size:0.9rem;color:var(--text-secondary);min-width:1.5rem;">${i+1}</span>
        <span id="slot-${i}" style="font-size:0.95rem;color:var(--text-secondary);">---</span>
      </div>
    `).join('');

    names.forEach((finalName, i) => {
      let ticks = 0;
      const maxTicks = 12 + i * 8;
      setTimeout(() => {
        const iv = setInterval(() => {
          const el = document.getElementById(`slot-${i}`);
          if (el) el.textContent = names[Math.floor(Math.random() * names.length)];
          ticks++;
          if (ticks >= maxTicks) {
            clearInterval(iv);
            if (el) {
              el.textContent = finalName;
              el.style.color = i === 0 ? 'var(--neon-cyan)' : i === 1 ? 'var(--neon-magenta)' : 'var(--text-primary)';
              el.style.fontWeight = '600';
            }
          }
        }, 60);
      }, i * 400);
    });

    setTimeout(onComplete, names.length * 400 + 800);
  }

  function renderExplosionAnimation(onComplete) {
    const names = shuffledNames || [];
    modalContainer.innerHTML = `
      <div id="exp-stage" style="position:relative;height:${Math.max(260, names.length * 46 + 20)}px;overflow:hidden;border-radius:10px;background:rgba(0,0,0,0.2);">
      </div>
      <p style="text-align:center;color:var(--neon-cyan);font-family:'Orbitron',sans-serif;font-size:0.9rem;margin-top:1rem;letter-spacing:2px;" id="exp-msg">Sorteando...</p>
    `;
    const stage = document.getElementById('exp-stage');
    const msgEl = document.getElementById('exp-msg');
    const W = stage.offsetWidth;
    const H = stage.offsetHeight;
    const cardW = 140; const cardH = 36;
    const cx = W/2 - cardW/2;
    const cy = H/2 - cardH/2;
    const floor = H - cardH - 5;

    const physics = names.map(() => {
      const angle = (Math.random() * 260 - 130) * Math.PI / 180;
      const speed = 7 + Math.random() * 6;
      return { x: cx, y: cy, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 5, rot: 0, vrot: (Math.random()-0.5)*15, settled: false, settling: false };
    });

    const cards = names.map((name, i) => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;width:${cardW}px;height:${cardH}px;background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:0.82rem;color:var(--text-primary);opacity:0;`;
      el.textContent = name;
      el.style.left = cx + 'px';
      el.style.top = cy + 'px';
      stage.appendChild(el);
      return el;
    });

    // Flash
    const flash = document.createElement('div');
    flash.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:${cardW}px;height:${cardH}px;border-radius:10px;background:var(--neon-cyan);opacity:0.6;transition:all 0.25s ease;pointer-events:none;`;
    stage.appendChild(flash);
    setTimeout(() => { flash.style.opacity='0'; flash.style.transform='scale(2.5)'; }, 30);

    setTimeout(() => {
      cards.forEach(el => { el.style.opacity = '1'; });
      let frame = 0;
      const gravity = 0.55; const bounce = 0.35; const friction = 0.8;

      const loop = setInterval(() => {
        frame++;
        let allSettled = true;
        physics.forEach((p, i) => {
          if (p.settled) return;
          allSettled = false;
          p.vy += gravity; p.x += p.vx; p.y += p.vy; p.rot += p.vrot;
          if (p.y >= floor) {
            p.y = floor; p.vy *= -bounce; p.vx *= friction; p.vrot *= 0.5;
            if (Math.abs(p.vy) < 1.2 && !p.settling) {
              p.settling = true;
              setTimeout(() => { p.settled = true; }, 80);
            }
          }
          if (p.x < 0) { p.x=0; p.vx*=-0.4; }
          if (p.x+cardW > W) { p.x=W-cardW; p.vx*=-0.4; }
          cards[i].style.transform = `rotate(${p.rot}deg)`;
          cards[i].style.left = p.x + 'px';
          cards[i].style.top = p.y + 'px';
        });
        if (allSettled || frame > 120) {
          clearInterval(loop);
          if (msgEl) msgEl.textContent = '¡Listo!';
          setTimeout(() => {
            const finalX = W/2 - cardW/2;
            cards.forEach((el, i) => {
              setTimeout(() => {
                el.style.transition = 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)';
                el.style.left = finalX + 'px';
                el.style.top = (8 + i * 46) + 'px';
                el.style.transform = 'rotate(0deg)';
                el.textContent = `${i + 1}. ${names[i]}`;
                el.style.color = i === 0 ? 'var(--neon-cyan)' : i === 1 ? 'var(--neon-magenta)' : 'var(--text-primary)';
                el.style.borderColor = i === 0 ? 'var(--neon-cyan)' : i === 1 ? 'var(--neon-magenta)' : 'var(--glass-border)';
              }, i * 100);
            });
            setTimeout(onComplete, cards.length * 100 + 500);
          }, 200);
        }
      }, 16);
    }, 150);
  }

  function renderInput() {
    modalContainer.innerHTML = `
      <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 1.5rem;">
        🎲 Orden Aleatorio
      </h2>
      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
          Nombres (uno por línea)
        </label>
        <textarea id="random-names-input" placeholder="Ej:&#10;Equipo Alpha&#10;Equipo Beta&#10;Equipo Gamma"
                  style="width: 100%; height: 180px; padding: 0.9rem 1.2rem; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem; resize: vertical; font-family: inherit;"></textarea>
      </div>
      <div style="display: flex; gap: 1rem;">
        <button id="confirm-random-order" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer;">
          🎲 Ordenar
        </button>
        <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255,255,255,0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
          Cerrar
        </button>
      </div>
    `;

    document.getElementById('confirm-random-order').onclick = () => {
      const input = document.getElementById('random-names-input').value.trim();
      if (!input) { showNotification('⚠️ Ingresa al menos un nombre', 'warning'); return; }
      const names = input.split('\n').map(n => n.trim()).filter(n => n !== '');
      if (names.length < 2) { showNotification('⚠️ Ingresa al menos 2 nombres', 'warning'); return; }

      const shuffled = [...names];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const state = shuffled.map(name => ({ name, done: false }));

      originalNames = names;
      shuffledNames = shuffled;
      playRandomAnimation(() => renderResult(state, names));
      // ✅ Mostrar animación antes del resultado
    };

    document.getElementById('cancel-modal').onclick = closeModal;
  }

 function renderResult(state, originalNames) {
    const rankColors = [
      'var(--neon-cyan)',
      'var(--neon-magenta)',
    ];

    // ✅ 2 columnas si hay más de 5 pendientes
    const useGrid = state.length > 5;

    modalContainer.innerHTML = `
      <style>
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rank-item {
          opacity: 0;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: ${useGrid ? '0.5rem 0.7rem' : '0.7rem 1rem'};
          margin-bottom: 0.4rem;
          border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .rank-item:hover { transform: translateX(4px); background: rgba(0,240,255,0.05); }
        .rank-number { font-family: 'Orbitron', sans-serif; font-size: ${useGrid ? '1rem' : '1.2rem'}; font-weight: 900; min-width: 1.8rem; text-align: center; }
        .rank-name { font-size: ${useGrid ? '0.85rem' : '1rem'}; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rank-grid { display: grid; grid-template-columns: ${useGrid ? '1fr 1fr' : '1fr'}; gap: 0 0.8rem; }
      </style>

      <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 0.3rem; font-size: 1.2rem;">
        🎲 Orden Aleatorio
      </h2>
      <p style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 1rem;">
        ${state.length} participantes
      </p>

      <div id="rank-list">
        <div class="rank-grid">
           ${state.map((item, index) => `
            <div class="rank-item" id="rank-item-${state.indexOf(item)}" style="border-left: 3px solid ${rankColors[index] || 'var(--glass-border)'};">
              <span class="rank-number" style="color: ${rankColors[index] || 'var(--text-secondary)'};">
                ${index + 1}
              </span>
              <span class="rank-name" style="color: ${rankColors[index] || 'var(--text-primary)'};">${item.name}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display: flex; gap: 0.8rem; margin-top: 1rem;">
        <button id="reshuffle-btn" style="flex: 1; padding: 0.8rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 0.9rem; font-weight: 700; cursor: pointer;">
          🔀 Volver a ordenar
        </button>
        <button id="edit-names-btn" style="flex: 1; padding: 0.8rem; background: rgba(255,255,255,0.05); border: 1px solid var(--neon-cyan); border-radius: 10px; color: var(--neon-cyan); font-size: 0.9rem; font-weight: 600; cursor: pointer;">
          ✏️ Editar nombres
        </button>
      </div>
    `;

    // Animar entrada
    state.forEach((item, index) => {
      setTimeout(() => {
        const el = document.getElementById(`rank-item-${state.indexOf(item)}`);
        if (el) el.style.animation = 'slideDown 0.25s ease forwards';
      }, index * 80);
    });


    document.getElementById('reshuffle-btn').onclick = () => {
      const reshuffled = [...state];
      for (let i = reshuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
      }
      playRandomAnimation(() => renderResult(reshuffled, originalNames));
    };

    document.getElementById('edit-names-btn').onclick = () => {
      renderInput();
      setTimeout(() => {
        document.getElementById('random-names-input').value = originalNames.join('\n');
      }, 0);
    };
  }

  modalOverlay.classList.remove('hidden');
  renderInput();

  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  };
}
// ============================================
// TOGGLE VIEW (Cards ↔ Table)
// ============================================

function toggleView() {
  currentView = currentView === 'cards' ? 'table' : 'cards';
  
  const viewModeText = document.getElementById('view-mode-text');
  const toggleBtn = document.getElementById('toggle-view-btn');
  const icon = toggleBtn.querySelector('svg');
  
  if (currentView === 'table') {
    viewModeText.textContent = 'Tabla';
    icon.innerHTML = `
      <rect x="3" y="4" width="18" height="2"></rect>
      <rect x="3" y="11" width="18" height="2"></rect>
      <rect x="3" y="18" width="18" height="2"></rect>
    `;
  } else {
    viewModeText.textContent = 'Tarjetas';
    icon.innerHTML = `
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    `;
  }
  
  renderStudentCards();
}

// ============================================
// SETUP MOBILE TOGGLES
// ============================================

function setupMobileToggles() {
  const toggleStatsBtn = document.getElementById('toggle-stats-btn');
  const toggleMenuBtn = document.getElementById('toggle-menu-btn');
  const statsSection = document.querySelector('.stats-section');
  const menuSection = document.querySelector('.quick-actions-section');
  
  // Función para verificar si estamos en móvil
  function isMobile() {
    return window.innerWidth <= 768;
  }
  
  // Inicializar estado en móvil
  if (isMobile()) {
    statsSection.classList.add('show');
    toggleStatsBtn.classList.add('active');
    toggleMenuBtn.classList.remove('active');
  }
  
  toggleStatsBtn.addEventListener('click', () => {
    // Activar Stats, desactivar Menu
    toggleStatsBtn.classList.add('active');
    toggleMenuBtn.classList.remove('active');
    
    statsSection.classList.add('show');
    menuSection.classList.remove('show');
  });
  
  toggleMenuBtn.addEventListener('click', () => {
    // Activar Menu, desactivar Stats
    toggleMenuBtn.classList.add('active');
    toggleStatsBtn.classList.remove('active');
    
    menuSection.classList.add('show');
    statsSection.classList.remove('show');
  });
  
  // Limpiar clases al cambiar tamaño de pantalla
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      // En desktop, mostrar todo
      statsSection.classList.remove('show');
      menuSection.classList.remove('show');
    } else {
      // En móvil, asegurar que stats esté activo por defecto
      if (!statsSection.classList.contains('show') && !menuSection.classList.contains('show')) {
        statsSection.classList.add('show');
        toggleStatsBtn.classList.add('active');
        toggleMenuBtn.classList.remove('active');
      }
    }
  });
}

// ============================================
// CLEANUP AL SALIR
// ============================================

export function cleanupAdminDashboard() {
  if (unsubscribeStudents) {
    unsubscribeStudents();
    unsubscribeStudents = null;
  }
}

// ============================================
// MODAL: Agregar XP
// ============================================

function showAddXpModal(student) {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  console.log('🔍 Modal overlay encontrado:', modalOverlay);
  console.log('🔍 Tiene clase hidden?', modalOverlay.classList.contains('hidden'));
  console.log('🔍 Clases del modal:', modalOverlay.className);
  
  modalOverlay.classList.remove('hidden');

  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 1.5rem;">
      ➕ Agregar XP
    </h2>
    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
      Alumno: <strong style="color: var(--text-primary);">${student.displayName}</strong>
    </p>
    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
      XP Actual: <strong style="color: var(--neon-cyan);">${student.totalXp || 0}</strong>
    </p>
    
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Cantidad de XP
      </label>
      <input type="number" id="xp-amount" value="10" min="1" step="1" 
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Razón
      </label>
      <input type="text" id="xp-reason" placeholder="Ej: Participación en clase"
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-add-xp" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer;">
        Confirmar
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  console.log('✅ Modal debería estar visible ahora');
  console.log('🔍 Clases del modal:', modalOverlay.className);
  
  // Event listeners
  document.getElementById('confirm-add-xp').onclick = async () => {
    const amount = parseInt(document.getElementById('xp-amount').value, 10);
    const reason = document.getElementById('xp-reason').value.trim();
    
    if (!amount || amount <= 0) {
      alert('Ingresa una cantidad válida de XP');
      return;
    }
    
    if (!reason) {
      alert('Ingresa una razón para el XP');
      return;
    }
    
    await addXpToStudent(student.id, amount, reason);
    closeModal();
  };
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  // Cerrar al hacer clic fuera del modal
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// AGREGAR XP A ALUMNO (Con lógica de nivel)
// ============================================

async function addXpToStudent(studentId, amount, reason) {
  try {
    const studentRef = doc(db, 'users', studentId);
    const transactionsRef = collection(db, 'transactions');
    
    // Obtener datos actuales del alumno
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.data();
    const oldXp = studentData.totalXp || 0;
    const newXp = oldXp + amount;
    
    // Calcular niveles
    const oldLevel = calculateLevel(oldXp);
    const newLevel = calculateLevel(newXp);
    const leveledUp = newLevel > oldLevel;
    
    // Batch write para operaciones atómicas
    const batch = writeBatch(db);
    
    // 1. Actualizar XP del alumno
    batch.update(studentRef, {
      totalXp: newXp,
      currentLevel: newLevel,
      lastUpdated: serverTimestamp()
    });
    
    // 2. Si subió de nivel, agregar Lucky Spins
    if (leveledUp) {
      const levelsGained = newLevel - oldLevel;
      const newSpins = (studentData.availableRouletteSpins || 0) + levelsGained;
      
      batch.update(studentRef, {
        availableRouletteSpins: newSpins
      });
      
      console.log(`🎉 ${studentData.displayName} subió ${levelsGained} nivel(es)! Ganó ${levelsGained} Lucky Spin(s)`);
    }
    
    // 3. Crear transacción
    const transactionRef = doc(transactionsRef);
    batch.set(transactionRef, {
      userId: studentId,
      type: 'xp_add',
      amount: amount,
      reason: reason,
      performedBy: auth.currentUser.uid,
      oldBalance: oldXp,
      newBalance: newXp,
      timestamp: serverTimestamp()
    });
    
    // Ejecutar todas las operaciones
    await batch.commit();
    
    // Mostrar notificación
    if (leveledUp) {
      showNotification(`✅ ${amount} XP agregados! 🎉 ¡${studentData.displayName} subió a nivel ${newLevel}!`, 'success');
    } else {
      showNotification(`✅ ${amount} XP agregados a ${studentData.displayName}`, 'success');
    }
    
  } catch (error) {
    console.error('Error al agregar XP:', error);
    showNotification('❌ Error al agregar XP', 'error');
  }
}

// ============================================
// MODAL: Restar XP
// ============================================

function showRemoveXpModal(student) {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: #ff4757; margin-bottom: 1.5rem;">
      ➖ Restar XP
    </h2>
    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
      Alumno: <strong style="color: var(--text-primary);">${student.displayName}</strong>
    </p>
    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
      XP Actual: <strong style="color: ${(student.totalXp || 0) >= 0 ? 'var(--neon-cyan)' : '#ff4757'};">${student.totalXp || 0}</strong>
    </p>
    <p style="color: #ff6b6b; font-size: 0.85rem; margin-bottom: 1.5rem;">
      ⚠️ El XP puede quedar negativo. Esto se permite solo para el profesor.
    </p>
    
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #ff4757; margin-bottom: 0.5rem; text-transform: uppercase;">
        Cantidad de XP a restar
      </label>
      <input type="number" id="xp-amount-remove" value="10" min="1" step="1" 
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 71, 87, 0.3); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #ff4757; margin-bottom: 0.5rem; text-transform: uppercase;">
        Razón
      </label>
      <input type="text" id="xp-reason-remove" placeholder="Ej: Falta injustificada"
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 71, 87, 0.3); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-remove-xp" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, #ff4757, #ff6348); border: none; border-radius: 10px; color: white; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer;">
        Confirmar
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  // Event listeners
  document.getElementById('confirm-remove-xp').onclick = async () => {
    const amount = parseInt(document.getElementById('xp-amount-remove').value, 10);
    const reason = document.getElementById('xp-reason-remove').value.trim();
    
    if (!amount || amount <= 0) {
      alert('Ingresa una cantidad válida de XP');
      return;
    }
    
    if (!reason) {
      alert('Ingresa una razón para restar el XP');
      return;
    }
    
    await removeXpFromStudent(student.id, amount, reason);
    closeModal();
  };
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  // Cerrar al hacer clic fuera del modal
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// RESTAR XP A ALUMNO (Con lógica de nivel)
// ============================================

async function removeXpFromStudent(studentId, amount, reason) {
  try {
    const studentRef = doc(db, 'users', studentId);
    const transactionsRef = collection(db, 'transactions');
    
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.data();
    const oldXp = studentData.totalXp || 0;
    const newXp = oldXp - amount;
    
    // Calcular niveles
    const oldLevel = calculateLevel(oldXp);
    const newLevel = calculateLevel(newXp);
    const leveledDown = newLevel < oldLevel;
    
    const batch = writeBatch(db);
    
    // 1. Actualizar XP del alumno
    batch.update(studentRef, {
      totalXp: newXp,
      currentLevel: newLevel,
      lastUpdated: serverTimestamp()
    });
    
    // 2. Si bajó de nivel, quitar Lucky Spins
    if (leveledDown) {
      const levelsLost = oldLevel - newLevel;
      const currentSpins = studentData.availableRouletteSpins || 0;
      const newSpins = Math.max(0, currentSpins - levelsLost);
      
      batch.update(studentRef, {
        availableRouletteSpins: newSpins
      });
      
      console.log(`⚠️ ${studentData.displayName} bajó ${levelsLost} nivel(es)! Perdió ${Math.min(currentSpins, levelsLost)} Lucky Spin(s)`);
    }
    
    // 3. Crear transacción
    const transactionRef = doc(transactionsRef);
    batch.set(transactionRef, {
      userId: studentId,
      type: 'xp_subtract',
      amount: -amount,
      reason: reason,
      performedBy: auth.currentUser.uid,
      oldBalance: oldXp,
      newBalance: newXp,
      timestamp: serverTimestamp()
    });
    
    await batch.commit();
    
    if (leveledDown) {
      showNotification(`⚠️ ${amount} XP restados. ${studentData.displayName} bajó a nivel ${newLevel} y perdió ${oldLevel - newLevel} Lucky Spin(s)`, 'warning');
    } else if (newXp < 0) {
      showNotification(`⚠️ ${amount} XP restados. ${studentData.displayName} ahora tiene ${newXp} XP (negativo)`, 'warning');
    } else {
      showNotification(`✅ ${amount} XP restados a ${studentData.displayName}`, 'success');
    }
    
  } catch (error) {
    console.error('Error al restar XP:', error);
    showNotification('❌ Error al restar XP', 'error');
  }
}

// ============================================
// MODAL: COMPRAR HP
// ============================================

export function showBuyHpModal(student) {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  const currentXP = student.totalXp || 0;
  const normalHpCost = 5;
  const specialHpCost = currentChapter ? currentChapter.specialHpCost : 20;
  const chapterName = currentChapter ? currentChapter.name : 'Desconocido';
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 1.5rem;">
      ❤️ Comprar Healing Points
    </h2>
    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
      Alumno: <strong style="color: var(--text-primary);">${student.displayName}</strong>
    </p>
    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
      XP Actual: <strong style="color: ${currentXP >= 0 ? 'var(--neon-cyan)' : '#ff4757'};">${currentXP}</strong>
    </p>
    
    <!-- Tabs para cambiar tipo de HP -->
    <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--glass-border);">
      <button id="tab-normal-hp" class="hp-tab active-tab" style="flex: 1; padding: 1rem; background: transparent; border: none; border-bottom: 3px solid var(--neon-cyan); color: var(--neon-cyan); font-weight: 700; cursor: pointer;">
        HP Normal
      </button>
      <button id="tab-special-hp" class="hp-tab" style="flex: 1; padding: 1rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: var(--text-secondary); font-weight: 700; cursor: pointer;">
        Special HP
      </button>
    </div>
    
    <!-- Contenido Normal HP -->
    <div id="normal-hp-content" class="hp-content">
      <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(0, 255, 65, 0.1); border: 1px solid rgba(0, 255, 65, 0.3); border-radius: 10px;">
        <p style="color: var(--neon-green); font-weight: 600; margin-bottom: 0.5rem;">❤️ HP Normal</p>
        <p style="color: var(--text-secondary); font-size: 0.9rem;">Costo: <strong style="color: #ffd700;">${normalHpCost} XP</strong> por punto</p>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.3rem;">Se puede usar en cualquier trabajo o actividad</p>
      </div>
      
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
          Cantidad de HP
        </label>
        <input type="number" id="normal-hp-amount" value="1" min="1" step="1" 
               style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
      </div>
      
      <p id="normal-hp-total" style="color: #ffd700; font-weight: 700; margin-bottom: 1rem;">
        Costo total: ${normalHpCost} XP
      </p>
    </div>
    
    <!-- Contenido Special HP -->
    <div id="special-hp-content" class="hp-content" style="display: none;">
      <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(255, 0, 255, 0.1); border: 1px solid rgba(255, 0, 255, 0.3); border-radius: 10px;">
        <p style="color: var(--neon-magenta); font-weight: 600; margin-bottom: 0.5rem;">✨ Special HP (${chapterName})</p>
        <p style="color: var(--text-secondary); font-size: 0.9rem;">Costo: <strong style="color: #ffd700;">${specialHpCost} XP</strong> por punto</p>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.3rem;">Solo para proyectos/exámenes de este capítulo</p>
      </div>
      
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-magenta); margin-bottom: 0.5rem; text-transform: uppercase;">
          Cantidad de Special HP
        </label>
        <input type="number" id="special-hp-amount" value="1" min="1" step="1" 
               style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
      </div>
      
      <p id="special-hp-total" style="color: #ffd700; font-weight: 700; margin-bottom: 1rem;">
        Costo total: ${specialHpCost} XP
      </p>
    </div>
    
    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-buy-hp" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer;">
        Confirmar Compra
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  // Variables para tracking
  let activeTab = 'normal';
  
  // Event listeners para tabs
  const tabNormal = document.getElementById('tab-normal-hp');
  const tabSpecial = document.getElementById('tab-special-hp');
  const normalContent = document.getElementById('normal-hp-content');
  const specialContent = document.getElementById('special-hp-content');
  
  tabNormal.onclick = () => {
    activeTab = 'normal';
    tabNormal.classList.add('active-tab');
    tabNormal.style.borderBottomColor = 'var(--neon-cyan)';
    tabNormal.style.color = 'var(--neon-cyan)';
    tabSpecial.classList.remove('active-tab');
    tabSpecial.style.borderBottomColor = 'transparent';
    tabSpecial.style.color = 'var(--text-secondary)';
    normalContent.style.display = 'block';
    specialContent.style.display = 'none';
  };
  
  tabSpecial.onclick = () => {
    activeTab = 'special';
    tabSpecial.classList.add('active-tab');
    tabSpecial.style.borderBottomColor = 'var(--neon-magenta)';
    tabSpecial.style.color = 'var(--neon-magenta)';
    tabNormal.classList.remove('active-tab');
    tabNormal.style.borderBottomColor = 'transparent';
    tabNormal.style.color = 'var(--text-secondary)';
    specialContent.style.display = 'block';
    normalContent.style.display = 'none';
  };
  
  // Actualizar costo total al cambiar cantidad
  const normalHpInput = document.getElementById('normal-hp-amount');
  const specialHpInput = document.getElementById('special-hp-amount');
  const normalTotalDisplay = document.getElementById('normal-hp-total');
  const specialTotalDisplay = document.getElementById('special-hp-total');
  
  normalHpInput.oninput = () => {
    const amount = parseInt(normalHpInput.value) || 0;
    normalTotalDisplay.textContent = `Costo total: ${amount * normalHpCost} XP`;
  };
  
  specialHpInput.oninput = () => {
    const amount = parseInt(specialHpInput.value) || 0;
    specialTotalDisplay.textContent = `Costo total: ${amount * specialHpCost} XP`;
  };
  
  // Confirmar compra
  document.getElementById('confirm-buy-hp').onclick = async () => {
    const amount = activeTab === 'normal' 
      ? parseInt(normalHpInput.value) 
      : parseInt(specialHpInput.value);
    const cost = activeTab === 'normal' 
      ? amount * normalHpCost 
      : amount * specialHpCost;
    
    if (!amount || amount <= 0) {
      showNotification('⚠️ Ingresa una cantidad válida', 'warning');
      return;
    }
    
    if (currentXP < cost) {
      showNotification('❌ XP insuficiente', 'error');
      return;
    }
    
    await buyHpForStudent(student.id, amount, activeTab, cost);
    closeModal();
  };
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// COMPRAR HP PARA ALUMNO
// ============================================

async function buyHpForStudent(studentId, amount, hpType, totalCost) {
  try {
    const studentRef = doc(db, 'users', studentId);
    const transactionsRef = collection(db, 'transactions');
    
    // Obtener datos actuales del alumno
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.data();
    const currentXP = studentData.totalXp || 0;
    
    // Validar que tenga suficiente XP
    if (currentXP < totalCost) {
      showNotification('❌ XP insuficiente para comprar HP', 'error');
      return;
    }
    
    const newXP = currentXP - totalCost;
    
    const oldLevel = calculateLevel(currentXP);
    const newLevel = calculateLevel(newXP);
    const leveledDown = newLevel < oldLevel;
    
    // Batch write para operaciones atómicas
    const batch = writeBatch(db);
    
    // Preparar actualización según el tipo de HP
    const updateData = {
      totalXp: newXP,
      lastUpdated: serverTimestamp(),
      availableRouletteSpins: studentData.availableRouletteSpins
    };
    
    if (hpType === 'normal') {
      // HP Normal
      updateData.earnedHealingPoints = (studentData.earnedHealingPoints || 0) + amount;
    } else {
      // HP Especial
      updateData.earnedSpecialHp = (studentData.earnedSpecialHp || 0) + amount;
    }
    
    if (leveledDown) {
      const levelsLost = oldLevel - newLevel;
      const currentSpins = studentData.availableRouletteSpins || 0;
      const newSpins = Math.max(0, currentSpins - levelsLost);
      updateData.availableRouletteSpins = newSpins;
    }
    
    // 1. Actualizar datos del alumno
    batch.update(studentRef, updateData);
    
    // 2. Crear transacción
    const transactionRef = doc(transactionsRef);
    batch.set(transactionRef, {
      userId: studentId,
      type: hpType === 'normal' ? 'hp_purchase' : 'special_hp_purchase',
      amount: -totalCost, // Negativo porque es gasto de XP
      hpAmount: amount,
      hpType: hpType,
      chapterName: hpType === 'special' ? (currentChapter ? currentChapter.name : 'Desconocido') : null,
      performedBy: auth.currentUser.uid,
      oldBalance: currentXP,
      newBalance: newXP,
      timestamp: serverTimestamp()
    });
    
    // Ejecutar todas las operaciones
    await batch.commit();
    
    const hpIcon = hpType === 'normal' ? '❤️' : '✨';
    const hpLabel = hpType === 'normal' ? 'HP Normal' : 'Special HP';
    showNotification(`✅ ${hpIcon} ${amount} ${hpLabel} comprado! -${totalCost} XP`, 'success');
    
  } catch (error) {
    console.error('Error al comprar HP:', error);
    showNotification('❌ Error al comprar HP', 'error');
  }
}
// ============================================
// UTILIDADES: Modal
// ============================================

export function closeModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  modalOverlay.classList.add('hidden');
}

// ============================================
// UTILIDADES: Notificaciones
// ============================================

export function showNotification(message, type = 'info') {
  const colors = {
    success: '#00ff41',
    error: '#ff4757',
    info: '#00f0ff',
    warning: '#ffff00'
  };
  
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: ;
    top: 2rem;
    right: 2rem;
    background: var(--bg-secondary);
    border: 2px solid ${colors[type]};
    color: ${colors[type]};
    padding: 1rem 1.5rem;
    border-radius: 10px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    animation: slideIn 0.3s ease;
    max-width: 90%;
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}
/*
function showStudentProfile(student) {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  const level = calculateLevel(student.totalXp || 0);
  const xp = student.totalXp || 0;
  const hp = student.earnedHealingPoints || 0;
  const spins = student.availableRouletteSpins || 0;
  const guild = student.groupId || 'Sin Guild';
  
  modalContainer.innerHTML = `
    <h2 
    style="font-family: 'Orbitron', sans-serif; 
    color: var(--neon-cyan); 
    margin-bottom: 1.5rem; 
    text-align: center;

    display: flex; 
    align-items: center; 
    justify-content: center; 
    gap: 15px; /* Espacio entre la foto y el texto */
    /*">
      <img src=${student.avatar} class="avatar-alumno" alt="Avatar"> Perfil de ${student.displayName}
    </h2>
    
    <div style="background: rgba(0,0,0,0.3); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
     
      <div style="margin-top: 1rem; text-align: center; padding: 0.8rem; background: rgba(255,255,255,0.05); border-radius: 8px;">
        <p style="color: var(--text-secondary); font-size: 0.85rem;">Guild</p>
        <p style="font-weight: 700; color: var(--neon-cyan); font-size: 1.1rem;">${guild}</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
        <div style="text-align: center; padding: 1rem; background: rgba(0,240,255,0.1); border-radius: 8px;">
          <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.5rem;">Nivel</p>
          <p style="font-family: 'Orbitron', sans-serif; font-size: 2rem; font-weight: 700; color: var(--neon-cyan);">${level}</p>
        </div>
        <div style="text-align: center; padding: 1rem; background: rgba(255,0,255,0.1); border-radius: 8px;">
          <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.5rem;">XP Total</p>
          <p style="font-family: 'Orbitron', sans-serif; font-size: 2rem; font-weight: 700; color: ${xp < 0 ? '#ff4757' : 'var(--neon-cyan)'};"> ${xp}</p>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div style="text-align: center; padding: 0.8rem; background: rgba(255,107,107,0.1); border-radius: 8px;">
          <p style="color: var(--text-secondary); font-size: 0.85rem;">gained HP</p>
          <p style="font-weight: 700; color: #ff6b6b; font-size: 1.2rem;">${hp}</p>
        </div>
        <div style="text-align: center; padding: 0.8rem; background: rgba(255,255,0,0.1); border-radius: 8px;">
          <p style="color: var(--text-secondary); font-size: 0.85rem;">lucky Spins</p>
          <p style="font-weight: 700; color: var(--neon-yellow); font-size: 1.2rem;">${spins}</p>
        </div>
      </div>
      
      <div style="margin-top: 1rem; text-align: center; padding: 0.8rem; background: rgba(255,255,255,0.05); border-radius: 8px;">
        <p style="color: var(--text-secondary); font-size: 0.85rem;">spells</p>
        <ul style="list-style: none; padding: 0; font-weight: 700; color: var(--text-primary); font-size: 1.1rem;">
         <li> hello </li>
         <li> hello1 </li>
         <li> hello2 </li>
        </ul>
      </div>

    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
      <button id="edit-student-btn" style="padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-weight: 700; cursor: pointer;">
        Editar
      </button>
      <button id="close-profile-btn" style="padding: 1rem; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-weight: 600; cursor: pointer;">
        Cerrar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  document.getElementById('edit-student-btn').onclick = () => {
    closeModal();
    // AquÃ­ puedes agregar la funciÃ³n de ediciÃ³n
    console.log('Editar alumno:', student.id);
  };
  
  document.getElementById('close-profile-btn').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}*/

// ============================================
// MODAL: comprar spell
// ============================================

export function showBuySpellModal(student) {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
// Crear opciones de hechizos
  let spellOptions = '';
//  const currentXP = student.totalXp || 0;

  const availableSpellsForChapter = availableSpells.filter(spell => {
    return spell.chapter === 'all' || spell.chapter === currentChapter.id;
  });

  if (availableSpellsForChapter.length === 0) {
    spellOptions = '<option value="">No hay hechizos disponibles</option>';
  } else {
    spellOptions = '<option value="">Selecciona un hechizo...</option>';
    availableSpellsForChapter.forEach(spell => {
      const canAfford = student.totalXp >= spell.cost;
      const disabled = canAfford ? '' : 'disabled';
      spellOptions += `
        <option class="spell-option" value="${spell.id}" data-cost="${spell.cost}" ${disabled}>
          ${spell.icon} ${spell.name} - ${spell.cost} XP ${!canAfford ? '(Insuficiente)' : ''}
        </option>
      `;
    });
  }

  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: #e5b561; margin-bottom: 1.5rem;">
      🪄 Buy Spell
    </h2>
    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
      Alumno: <strong style="color: var(--text-primary);">${student.displayName}</strong>
    </p>
    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
      <span id="label-xp" class="col-1" >XP Actual: <strong style="color: ${(student.totalXp || 0) >= 0 ? 'var(--neon-cyan)' : '#e5b561'};">${student.totalXp || 0}</strong></span>
      <span> | </span>
      <span id="after-buy" class="col-2"></span>  
    </p>
    
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #e5b561; margin-bottom: 0.5rem; text-transform: uppercase;">
        Hechizo a comprar:
      </label>
    <select id="spell-select" class= "spells-list">
        ${spellOptions}
      </select>
    </div>
    
    <div id="spell-details" style="display: none; margin-bottom: 1.5rem; padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 10px; border: 1px solid var(--glass-border);">
      <!-- Aquí se mostrarán los detalles del hechizo seleccionado -->
    </div>
    <p style="color: #ff6b6b; font-size: 0.85rem; margin-bottom: 1.5rem;">
      ⚠️ El XP no puede quedar negativo. Esto solo se permite por XP negativa.
    </p>
    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-buy-spell" disabled style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer; opacity: 0.5;">
        Confirmar
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  // Event listener para mostrar detalles del hechizo seleccionado
  const spellSelect = document.getElementById('spell-select');
  const confirmBtn = document.getElementById('confirm-buy-spell');
  const spellDetails = document.getElementById('spell-details');
  const afterBuy = document.getElementById('after-buy');
  
  spellSelect.addEventListener('change', () => {
  const selectedSpellId = spellSelect.value;
  
  if (selectedSpellId) {
    const spell = availableSpellsForChapter.find(s => s.id === selectedSpellId)
      
      if (spell) {
        spellDetails.style.display = 'block';
        spellDetails.innerHTML = `
          <div style="text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 0.5rem;">${spell.icon}</div>
            <h3 style="color: var(--neon-cyan); font-family: 'Orbitron', sans-serif; margin-bottom: 0.5rem;">${spell.name}</h3>
            <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">${spell.description}</p>
            <p style="color: #ffd700; font-weight: 700; font-size: 1.2rem;">Costo: ${spell.cost} XP</p>
          </div>
        `;
        afterBuy.style.display = 'inline-block';
        afterBuy.innerHTML= `
          <div style="text-align: center;">
            <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">XP final: <strong style="color: ${(student.totalXp - spell.cost) >= 0 ? 'var(--neon-cyan)' : '#e5b561'};">${student.totalXp - spell.cost}</strong></p>
          </div>
        `;
        
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
      }
    } else {
      spellDetails.style.display = 'none';
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
    }
  });
  
  // Event listener para confirmar compra
  confirmBtn.onclick = async () => {
    const selectedSpellId = spellSelect.value;
    
    if (!selectedSpellId) {
      alert('Selecciona un hechizo');
      return;
    }
    
    const spell = availableSpells.find(s => s.id === selectedSpellId);
    await buySpellForStudent(student.id, spell);


    closeModal();
  };
  
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// COMPRAR HECHIZO PARA ALUMNO
// ============================================

async function buySpellForStudent(studentId, spell) {
  try {
    const studentRef = doc(db, 'users', studentId);
    const transactionsRef = collection(db, 'transactions');
    
    // Obtener datos actuales del alumno
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.data();
    const currentXP = studentData.totalXp || 0;
    
    // Validar que tenga suficiente XP
    if (currentXP < spell.cost) {
      showNotification('❌ XP insuficiente para comprar este hechizo', 'error');
      return;
    }
    
    const newXP = currentXP - spell.cost;
    
    const oldLevel = calculateLevel(currentXP);
    const newLevel = calculateLevel(newXP);
    const leveledDown = newLevel < oldLevel;

    // Crear objeto del hechizo comprado
    const purchasedSpell = {
      spellId: spell.id,
      spellName: spell.name,
      spellIcon: spell.icon,
      purchasedAt: new Date(),
      casted: false,
      castedAt: null
    };
    
    // Obtener array actual de hechizos (o crear uno vacío)
    const currentSpells = studentData.spells || [];
    const updatedSpells = [...currentSpells, purchasedSpell];
    
    // Batch write para operaciones atómicas
    const batch = writeBatch(db);
    
    
    // 1. Actualizar XP y agregar hechizo
    
    const updateData = {
      totalXp: newXP,
      currentLevel: newLevel,
      spells: updatedSpells,
      lastUpdated: serverTimestamp(),
      availableRouletteSpins: studentData.availableRouletteSpins 
    };
    
    if (leveledDown) {
      const levelsLost = oldLevel - newLevel;
      const currentSpins = studentData.availableRouletteSpins || 0;
      const newSpins = Math.max(0, currentSpins - levelsLost);
      updateData.availableRouletteSpins = newSpins;
    }

    batch.update(studentRef, updateData);


    // 2. Crear transacción
    const transactionRef = doc(transactionsRef);
    batch.set(transactionRef, {
      userId: studentId,
      type: 'spell_purchase',
      spellId: spell.id,
      spellName: spell.name,
      cost: spell.cost,
      amount: -spell.cost,  // ✅ AGREGAR (negativo porque es gasto)
      reason: `Hechizo comprado: ${spell.name}`,  // ✅ AGREGAR
      performedBy: auth.currentUser.uid,
      oldBalance: currentXP,
      newBalance: newXP,
      timestamp: new Date()  // ✅ CAMBIAR 'buyTime' por 'timestamp'
    });
    
    // Ejecutar todas las operaciones
    await batch.commit();

    if (leveledDown) {
      showNotification(`⚠️ ${spell.icon} ${spell.name} comprado! -${spell.cost} XP. Bajaste a nivel ${newLevel}`, 'warning');
    } else {
      showNotification(`✅ ${spell.icon} ${spell.name} comprado! -${spell.cost} XP`, 'success');
    }
    
    
  } catch (error) {
    console.error('Error al comprar hechizo:', error);
    showNotification('❌ Error al comprar hechizo', 'error');
  }
}

// ============================================
// NAVEGACIÓN AL PERFIL DEL ALUMNO
// ============================================

function showStudentProfile(student) {
  // Ocultar admin screen
  document.getElementById('admin-screen').classList.remove('active');
  document.getElementById('admin-screen').classList.add('hidden');
  
  // Mostrar profile screen
  const profileScreen = document.getElementById('student-profile-screen');
  profileScreen.classList.remove('hidden');
  profileScreen.classList.add('active');
  
  // Cargar datos del alumno
  loadStudentProfileData(student);
}

// ============================================
// CARGAR DATOS DEL PERFIL DEL ALUMNO
// ============================================

function loadStudentProfileData(student) {
  console.log('📊 Cargando perfil de:', student);
  
  // ============================================
  // SECCIÓN 1: IDENTIDAD (Foto y Nombre)
  // ============================================
  
  // Avatar (usar la foto del alumno o una por defecto)
  const avatarImg = document.getElementById('profile-avatar');
  avatarImg.src = student.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(student.displayName) + '&size=150&background=0a0e27&color=00f0ff&bold=true';
  
  // Nombre completo y nickname
  document.getElementById('profile-student-name').textContent = student.displayName || 'Sin nombre';
  document.getElementById('profile-student-nickname').textContent = student.nickname ? `"${student.nickname}"` : '""';
  document.getElementById('profile-student-lastname').textContent = student.lastName || '';
  
  // ============================================
  // SECCIÓN 2: NIVEL Y XP PROGRESS
  // ============================================
  
  const totalXp = student.totalXp || 0;
  const currentLevel = calculateLevel(totalXp);
  const xpForCurrentLevel = (currentLevel - 1) * 100;
  const xpForNextLevel = currentLevel * 100;
  const xpInCurrentLevel = totalXp - xpForCurrentLevel;
  const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
  const progressPercentage = (xpInCurrentLevel / xpNeededForNextLevel) * 100;
  
  // Actualizar número de nivel
  document.getElementById('profile-level-value').textContent = currentLevel;
  
  // Actualizar texto de progreso
  document.getElementById('profile-xp-progress').textContent = `${xpInCurrentLevel} / ${xpNeededForNextLevel} XP`;
  
  // Actualizar círculo de progreso (SVG)
  const progressCircle = document.getElementById('level-circle-progress');
  const isMobile = window.innerWidth <= 768;
  const radius = isMobile ? 50 : 70; // Radio ajustado para móvil
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progressPercentage / 100) * circumference;

  progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
  progressCircle.style.strokeDashoffset = offset;
  
  // ============================================
  // SECCIÓN 3: STATS
  // ============================================
  
    // Stats
    document.getElementById('profile-guild-value').textContent = student.groupId || 'Sin Guild';
    document.getElementById('profile-total-xp-value').textContent = totalXp;

    // HP Normal
    const earnedHP = student.earnedHealingPoints || 0;
    const usedHP = student.appliedHealingPoints || 0;
    const availableHP = Math.max(0, earnedHP - usedHP);

    document.getElementById('profile-hp-earned-value').textContent = earnedHP;
    document.getElementById('profile-hp-available-value').textContent = availableHP;
    document.getElementById('profile-hp-used-value').textContent = usedHP;

    // Special HP
    const earnedSpecialHP = student.earnedSpecialHp || 0;
    const usedSpecialHP = student.appliedSpecialHp || 0;
    const availableSpecialHP = Math.max(0, earnedSpecialHP - usedSpecialHP);

    document.getElementById('profile-special-hp-earned-value').textContent = earnedSpecialHP;
    document.getElementById('profile-special-hp-available-value').textContent = availableSpecialHP;
    document.getElementById('profile-special-hp-used-value').textContent = usedSpecialHP;
  // SECCIÓN 4: LUCKY SPINS
  // ============================================
  
  const spinsAvailable = student.availableRouletteSpins || 0;
  const spinBtn = document.getElementById('lucky-spin-btn');
  const spinCounter = document.getElementById('lucky-spin-counter');
  
  spinCounter.textContent = spinsAvailable;
  
  if (spinsAvailable > 0) {
    spinBtn.classList.remove('lucky-spin-inactive');
    spinBtn.classList.add('lucky-spin-active');
  } else {
    spinBtn.classList.remove('lucky-spin-active');
    spinBtn.classList.add('lucky-spin-inactive');
  }
  
  // ============================================
  // SECCIÓN 5: HECHIZOS
  // ============================================
  
  loadStudentSpells(student);
  
  // ============================================
  // SECCIÓN 6: HISTORIAL DE TRANSACCIONES
  // ============================================
  
  loadStudentTransactions(student.id);
  
  // ============================================
  // SECCIÓN 7: EVENT LISTENERS
  // ============================================
  
  // Botón de comprar hechizo
  document.getElementById('profile-buy-spell-btn').onclick = () => {
    showBuySpellModal(student);
  };
  
  // Botón de usar HP (solo admin)
  document.getElementById('use-hp-btn').onclick = () => {
    useHealingPoints(student.id);
  };

  // ✅ AGREGAR ESTO - Botón de usar Special HP (solo admin)
  document.getElementById('use-special-hp-btn').onclick = () => {
    useHealingPoints(student.id, 'special');
  };

  document.getElementById('buy-HP-student-btn').onclick = () => {
    showBuyHpModal(student);
  }


// Botón de Lucky Spin
spinBtn.onclick = () => {
  if (spinsAvailable > 0) {
    showLuckySpinModal(student);
  } else {
    showNotification('⚠️ No tienes Lucky Spins disponibles', 'warning');
  }
};
}

// ============================================
// CARGAR HECHIZOS DEL ALUMNO
// ============================================

function loadStudentSpells(student) {
  const spellsContainer = document.getElementById('profile-spells-container');
  const studentSpells = student.spells || [];
  
  if (studentSpells.length === 0) {
    spellsContainer.innerHTML = '<p class="empty-state">No hay hechizos adquiridos aún</p>';
    return;
  }
  
  spellsContainer.innerHTML = studentSpells
    .filter(spell => !spell.transferred)
    .map((spell, index) => {  // ✅ AGREGAR index
      const statusClass = spell.casted ? 'spell-used' : 'spell-available';
      const statusText = spell.casted ? 'Usado' : 'Disponible';
      
      const spellInfo = availableSpells.find(s => s.id === spell.spellId);
      const description = spellInfo ? spellInfo.description : 'Hechizo especial';
      
      // ✅ AGREGAR: Calcular si se puede deshacer (solo comprado y no usado)
      const canUndo = !spell.casted && !spell.obtainedFrom;  // Solo comprados (no de lucky_spin, gift, etc)
      const costRefund = spellInfo ? spellInfo.cost : 0;
      
      // ✅ AGREGAR: Badges de origen
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
          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
            ${!spell.casted ? `
              <button 
                class="btn-cast-spell" 
                data-spell-id="${spell.spellId}" 
                data-student-id="${student.id}"
                style="padding: 0.5rem 1rem; background: linear-gradient(135deg, var(--neon-magenta), #9b59b6); border: none; border-radius: 8px; color: white; font-size: 0.85rem; font-weight: 600; cursor: pointer;">
                ✨ Usar
              </button>
            ` : ''}
            ${canUndo ? `
              <button 
                class="btn-undo-spell" 
                data-student-id="${student.id}"
                data-spell-index="${index}"
                data-spell-cost="${costRefund}"
                title="Deshacer compra (+${costRefund} XP)"
                style="padding: 0.5rem 1rem; background: rgba(255, 107, 107, 0.2); border: 1px solid #ff6b6b; border-radius: 8px; color: #ff6b6b; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                ↩️ Deshacer (+${costRefund} XP)
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  
  // ✅ AGREGAR: Event listeners para botones de deshacer
  document.querySelectorAll('.btn-undo-spell').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const studentId = btn.dataset.studentId;
      const spellIndex = parseInt(btn.dataset.spellIndex);
      const spellCost = parseInt(btn.dataset.spellCost);
      const spell = studentSpells[spellIndex];
      
      await undoSpellPurchase(studentId, spell, spellCost);
    });
  });
  spellsContainer.querySelectorAll('.btn-cast-spell').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const spellId = btn.dataset.spellId;
      const studentId = btn.dataset.studentId;
      showCastSpellModal(studentId, spellId);
    });
  });
}

// ============================================
// MODAL: Usar Hechizo
// ============================================

function showCastSpellModal(studentId, spellId) {
  const student = allStudents.find(s => s.id === studentId);
  if (!student) {
    showNotification('❌ Estudiante no encontrado', 'error');
    return;
  }
  
  const spell = student.spells.find(s => s.spellId === spellId && !s.casted);
  if (!spell) {
    showNotification('❌ Hechizo no encontrado o ya usado', 'error');
    return;
  }
  
  const spellInfo = availableSpells.find(s => s.id === spellId);
  
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-magenta); margin-bottom: 1.5rem;">
      🪄 Usar Hechizo
    </h2>
    
    <div style="text-align: center; margin-bottom: 1.5rem;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">${spell.spellIcon}</div>
      <h3 style="color: var(--neon-cyan); font-family: 'Orbitron', sans-serif; margin-bottom: 0.5rem;">
        ${spell.spellName}
      </h3>
      <p style="color: var(--text-secondary); margin-bottom: 1rem;">
        ${spellInfo ? spellInfo.description : 'Hechizo especial'}
      </p>
    </div>
    
    <p style="color: var(--text-secondary); margin-bottom: 1rem; text-align: center;">
      Alumno: <strong style="color: var(--text-primary);">${student.displayName}</strong>
    </p>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Razón de uso
      </label>
      <input type="text" id="spell-use-reason" placeholder="Ej: Usado en examen parcial" 
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-cast-spell" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-magenta), #9b59b6); border: none; border-radius: 10px; color: white; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer;">
        ✨ Usar Hechizo
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  document.getElementById('confirm-cast-spell').onclick = async () => {
    const reason = document.getElementById('spell-use-reason').value.trim();
    
    if (!reason) {
      showNotification('⚠️ Ingresa una razón para usar el hechizo', 'warning');
      return;
    }
    
    await castSpell(studentId, spell, reason);
    closeModal();
  };
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

  // ============================================
  // USAR HECHIZO
  // ============================================

  async function castSpell(studentId, spell, reason) {
    try {
      const studentRef = doc(db, 'users', studentId);
      const transactionsRef = collection(db, 'transactions');  // ✅ AGREGAR
      
      const studentSnap = await getDoc(studentRef);
      const studentData = studentSnap.data();
      
      // Marcar el hechizo como usado
      const updatedSpells = (studentData.spells || []).map(s => {
        if (s.spellId === spell.spellId && 
            s.purchasedAt.toMillis() === spell.purchasedAt.toMillis() && 
            !s.casted) {
          return {
            ...s,
            casted: true,
            castedAt: new Date(),
            castedReason: reason
          };
        }
        return s;
      });
      
      // ✅ AGREGAR: Usar batch para operaciones atómicas
      const batch = writeBatch(db);
      
      // 1. Actualizar spells del estudiante
      batch.update(studentRef, {
        spells: updatedSpells,
        lastUpdated: serverTimestamp()
      });
      
      // 2. ✅ CREAR TRANSACCIÓN
      const transactionRef = doc(transactionsRef);
      batch.set(transactionRef, {
        userId: studentId,
        type: 'spell_use',
        spellId: spell.spellId,
        spellName: spell.spellName,
        amount: 0,  // No cambia XP, pero se registra
        reason: `Hechizo usado: ${spell.spellName} - ${reason}`,
        performedBy: auth.currentUser.uid,
        timestamp: serverTimestamp()
      });
      
      // ✅ EJECUTAR BATCH
      await batch.commit();
      
      showNotification(`✅ ${spell.spellIcon} ${spell.spellName} usado correctamente`, 'success');
      
    } catch (error) {
      console.error('Error usando hechizo:', error);
      showNotification('❌ Error al usar hechizo', 'error');
    }
  }

// ============================================
// CARGAR TRANSACCIONES DEL ALUMNO
// ============================================

async function loadStudentTransactions(studentId) {
  const tbody = document.getElementById('profile-transactions-tbody');
  
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
    'spell_use':"🪄⚡️: Uso hechizo",
    'spell_refund':'↩️ Devolución de Hechizo',
    'hp_purchase': '❤️ Compra HP',
    'special_hp_purchase': '✨ Compra Special HP',
    'lucky_spin': '🎲 Lucky Spin',
    'spell_gift': '🎁 Regalo de Hechizo',
    'spell_exchange': '🔄 Intercambio de Hechizo',
    'level_up': '⬆️ Subida de Nivel'
  };
  return labels[type] || type;
}

// ============================================
// USAR HEALING POINTS (ADMIN)
// ============================================

async function useHealingPoints(studentId, hpType = 'normal') {
  const inputId = hpType === 'normal' ? 'use-hp-input' : 'use-special-hp-input';
  const amount = parseInt(document.getElementById(inputId).value);
  
  if (!amount || amount <= 0) {
    showNotification('⚠️ Ingresa una cantidad válida', 'warning');
    return;
  }
  
  try {
    const studentRef = doc(db, 'users', studentId);
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.data();
    
    const earnedField = hpType === 'normal' ? 'earnedHealingPoints' : 'earnedSpecialHp';
    const appliedField = hpType === 'normal' ? 'appliedHealingPoints' : 'appliedSpecialHp';
    
    const earned = studentData[earnedField] || 0;
    const applied = studentData[appliedField] || 0;
    const available = earned - applied;  // ✅ AGREGAR - Calcular disponibles
    
    // ✅ AGREGAR - Validar que tenga suficientes HP disponibles
    if (available < amount) {
      const hpLabel = hpType === 'normal' ? 'HP Normal' : 'Special HP';
      showNotification(`❌ No tiene suficientes ${hpLabel} disponibles (tiene ${available}, intenta usar ${amount})`, 'error');
      return;
    }
    
    const updateData = {
      [appliedField]: applied + amount,  // ✅ Solo sumar a applied
      lastUpdated: serverTimestamp()
    };
    
    await updateDoc(studentRef, updateData);
    
    const hpIcon = hpType === 'normal' ? '❤️' : '✨';
    showNotification(`✅ ${hpIcon} ${amount} HP aplicados`, 'success');
    
    const updatedSnap = await getDoc(studentRef);
    loadStudentProfileData({id: studentId, ...updatedSnap.data()});
    
  } catch (error) {
    console.error('Error usando HP:', error);
    showNotification('❌ Error al aplicar HP', 'error');
  }
}

function closeStudentProfile() {
  // Ocultar profile screen
  document.getElementById('student-profile-screen').classList.remove('active');
  document.getElementById('student-profile-screen').classList.add('hidden');
  
  // Mostrar admin screen
  document.getElementById('admin-screen').classList.remove('hidden');
  document.getElementById('admin-screen').classList.add('active');
}

// Event listener para el botón de regreso
document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('back-to-dashboard-btn');
  if (backBtn) {
    backBtn.addEventListener('click', closeStudentProfile);
  }
});

// ============================================
// MODAL: Cambiar Capítulo
// ============================================

function showChangeChapterModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  const chaptersOptions = availableChapters.map(chapter => {
    const isActive = chapter.active ? '✅' : '';
    return `
      <div class="chapter-option ${chapter.active ? 'chapter-active' : ''}" data-chapter-id="${chapter.id}">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <span style="font-size: 2rem;">📖</span>
          <div style="flex: 1;">
            <h4 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 0.3rem;">${chapter.name} ${isActive}</h4>
            <p style="color: var(--text-secondary); font-size: 0.85rem;">Special HP Cost: ${chapter.specialHpCost} XP</p>
          </div>
          ${chapter.active ? '<span style="color: var(--neon-green); font-weight: 700;">ACTIVO</span>' : '<button class="btn-select-chapter" data-chapter-id="' + chapter.id + '">Seleccionar</button>'}
        </div>
      </div>
    `;
  }).join('');
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 1.5rem;">
      📖 Cambiar Capítulo Actual
    </h2>
    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
      El capítulo actual define el costo de los Special HP
    </p>
    
    <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem;">
      ${chaptersOptions}
    </div>
    
    <button id="close-chapter-modal" style="width: 100%; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-weight: 600; cursor: pointer;">
      Cerrar
    </button>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  // Event listeners para botones de selección
  document.querySelectorAll('.btn-select-chapter').forEach(btn => {
    btn.addEventListener('click', async () => {
      const chapterId = btn.dataset.chapterId;
      await changeActiveChapter(chapterId);
      closeModal();
    });
  });
  
  document.getElementById('close-chapter-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// CAMBIAR CAPÍTULO ACTIVO Y GUARDAR EN FIRESTORE
// ============================================

async function changeActiveChapter(chapterId) {
  try {
    // Actualizar en el array local
    availableChapters.forEach(chapter => {
      chapter.active = chapter.id === chapterId;
    });
    
    currentChapter = availableChapters.find(c => c.id === chapterId);
    
    // Guardar en Firestore usando setDoc con merge
    const configDoc = doc(db, 'appConfig', 'chapters');
    await setDoc(configDoc, {
      chapters: availableChapters,
      lastUpdated: serverTimestamp(),
      changedBy: auth.currentUser.uid
    }, { merge: true }); // ✅ IMPORTANTE: merge: true
    
    // Actualizar display
    updateCurrentChapterDisplay();
    
    showNotification(`✅ Capítulo cambiado a: ${currentChapter.name}`, 'success');
    
    console.log('✅ Capítulo guardado en Firestore');
    
  } catch (error) {
    console.error('❌ Error cambiando capítulo:', error);
    showNotification('❌ Error al cambiar capítulo', 'error');
  }
}

// // ============================================
// // GIRAR LUCKY SPIN (Placeholder)
// // ============================================

// async function spinLuckyRoulette(studentId) {
//   try {
//     // Verificar que tenga spins disponibles
//     const studentRef = doc(db, 'users', studentId);
//     const studentSnap = await getDoc(studentRef);
//     const studentData = studentSnap.data();
    
//     if ((studentData.availableRouletteSpins || 0) <= 0) {
//       showNotification('❌ No tienes Lucky Spins disponibles', 'error');
//       return;
//     }
    
//     // Obtener hechizos disponibles para el capítulo actual
//     const possibleSpells = availableSpells.filter(spell => {
//       return spell.chapter === 'all' || spell.chapter === currentChapter.id;
//     });
    
//     // Seleccionar uno al azar
//     const randomSpell = possibleSpells[Math.floor(Math.random() * possibleSpells.length)];
    
//     console.log('🎲 Lucky Spin! Ganaste:', randomSpell.name);
    
//     // TODO: Agregar animación de ruleta
//     // TODO: Guardar hechizo ganado en el alumno
//     // TODO: Restar 1 spin
    
//     showNotification(`🎲 ¡Ganaste ${randomSpell.icon} ${randomSpell.name}!`, 'success');
    
//   } catch (error) {
//     console.error('Error en Lucky Spin:', error);
//     showNotification('❌ Error al girar la ruleta', 'error');
//   }
// }

// ============================================
// MODAL: Lucky Spin Roulette ÉPICA
// ============================================

export function showLuckySpinModal(student) {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  const spinsAvailable = student.availableRouletteSpins || 0;
  
  if (spinsAvailable <= 0) {
    showNotification('❌ No tienes Lucky Spins disponibles', 'error');
    return;
  }

   console.log('🎲 Total hechizos disponibles:', availableSpells.length);
  console.log('📖 Capítulo actual:', currentChapter?.name);
  
  
  // Obtener hechizos disponibles para el capítulo actual
  const possibleSpells = availableSpells.filter(spell => {
    return spell.chapter === 'all' || spell.chapter === currentChapter.id;
  });

   console.log('🎯 Hechizos para este capítulo:', possibleSpells.length); 
  
  const numSlices = possibleSpells.length;
  const anglePerSlice = 360 / numSlices;
  
  // Generar rebanadas (slices) COMENZANDO DESDE LA FLECHA (0° = arriba)
  let slicesHTML = '';
  possibleSpells.forEach((spell, index) => {
    // IMPORTANTE: Empezar desde -90° porque 0° CSS está a la derecha
    // y queremos que 0° lógico sea arriba (donde está la flecha)
    const rotation = (anglePerSlice * index) - 90;
    const hue = (index * 360 / numSlices);
    
    slicesHTML += `
      <div class="roulette-slice" data-spell-id="${spell.id}" data-index="${index}" style="
        position: absolute;
        width: 50%;
        height: 50%;
        top: 50%;
        left: 50%;
        transform-origin: 0% 0%;
        transform: rotate(${rotation}deg) skewY(${90 - anglePerSlice}deg);
        background: linear-gradient(135deg, hsl(${hue}, 70%, 30%), hsl(${hue}, 70%, 20%));
        border-right: 2px solid rgba(255, 215, 0, 0.5);
        transition: all 0.3s ease;
      ">
        <div style="
          position: absolute;
          top: 20%;
          left: 50%;
          transform: skewY(${-(90 - anglePerSlice)}deg) rotate(${anglePerSlice/2}deg) translateX(-50%);
          font-size: 2.5rem;
          filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.5));
        ">
          ${spell.icon}
        </div>
      </div>
    `;
  });
  
  modalContainer.innerHTML = `
    <div style="text-align: center;">
      <h2 style="font-family: 'Orbitron', sans-serif; color: #ffd700; margin-bottom: 1rem; font-size: 2rem; text-shadow: 0 0 20px rgba(255, 215, 0, 0.8);">
        🎲 LUCKY SPIN 🎲
      </h2>
      <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
        Alumno: <strong style="color: var(--text-primary);">${student.displayName}</strong>
      </p>
      <p style="color: var(--text-secondary); margin-bottom: 2rem;">
        Spins disponibles: <strong style="color: #ffd700;">${spinsAvailable}</strong>
      </p>
      
      <!-- Ruleta estilo casino -->
      <div style="position: relative; width: 400px; height: 400px; margin: 0 auto 2rem;">
        
        <!-- Contenedor de la ruleta -->
        <div id="roulette-wheel" style="
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 8px solid #ffd700;
          box-shadow: 
            0 0 40px rgba(255, 215, 0, 0.6),
            inset 0 0 60px rgba(0, 0, 0, 0.8);
          overflow: hidden;
          background: #0a0e27;
        ">
          
          <!-- Contenedor giratorio de rebanadas -->
          <div id="roulette-spinner" style="
            position: absolute;
            width: 100%;
            height: 100%;
            transition: transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99);
          ">
            ${slicesHTML}
          </div>
          
          <!-- Centro decorativo CLICKEABLE (BOTÓN DE GIRAR) -->
          <button id="spin-button" style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100px;
            height: 100px;
            background: radial-gradient(circle, #ffd700, #ff8c00);
            border-radius: 50%;
            border: 5px solid #fff;
            box-shadow: 0 0 30px rgba(255, 215, 0, 0.8);
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Orbitron', sans-serif;
            font-weight: 900;
            color: #0a0e27;
            font-size: 1.2rem;
            cursor: pointer;
            transition: all 0.3s ease;
          " onmouseover="this.style.transform='translate(-50%, -50%) scale(1.1)'" onmouseout="this.style.transform='translate(-50%, -50%) scale(1)'">
            SPIN
          </button>
        </div>
        
        <!-- Indicador/Flecha -->
        <div style="
          position: absolute;
          top: -15px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 20px solid transparent;
          border-right: 20px solid transparent;
          border-top: 35px solid #ff0000;
          z-index: 20;
          filter: drop-shadow(0 0 15px #ff0000);
        "></div>
      </div>
      
      <div id="roulette-buttons" style="display: flex; gap: 1rem; justify-content: center;">
        <button id="close-roulette" style="
          padding: 1rem 2rem;
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid var(--glass-border);
          border-radius: 10px;
          color: var(--text-primary);
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
        ">
          Salir
        </button>
      </div>
      
      <div id="result-message" style="margin-top: 2rem; min-height: 80px;">
        <!-- Mensaje del resultado -->
      </div>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  let isSpinning = false;
  
  // Audio de ruleta
  const spinSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3');
  
  // Event listener del CENTRO (botón de girar)
  document.getElementById('spin-button').onclick = async () => {
    if (isSpinning) return;
    
    isSpinning = true;
    const spinButton = document.getElementById('spin-button');
    spinButton.disabled = true;
    spinButton.style.opacity = '0.5';
    spinButton.textContent = '...';
    spinButton.style.cursor = 'not-allowed';
    
    // Reproducir sonido
    spinSound.play().catch(e => console.log('Audio no disponible:', e));
    
    // ✅ RANDOMIZACIÓN MEJORADA
    const winnerIndex = Math.floor(Math.random() * possibleSpells.length);
    const winnerSpell = possibleSpells[winnerIndex];
    
    console.log('🎲 Hechizo seleccionado:', winnerSpell.name, 'Index:', winnerIndex);
    
  // ✅ CALCULAR ROTACIÓN CORRECTA
    const baseRotations = 5 + Math.floor(Math.random() * 3); // 5-7 vueltas completas
    
    console.log('🎲 Hechizo seleccionado:', winnerSpell.name, 'Index:', winnerIndex);
    
    // Como ahora empezamos desde -90°, necesitamos ajustar
    const sliceStartAngle = (anglePerSlice * winnerIndex) - 90;
    const sliceCenterAngle = sliceStartAngle + (anglePerSlice / 2);
    
    console.log('📐 Centro de la rebanada ganadora:', sliceCenterAngle, '°');
    
    // Para que la flecha (que ahora es -90° en coordenadas CSS) apunte al centro
    // Necesitamos rotar de forma que sliceCenterAngle quede en -90°
    const targetRotation = -90 - sliceCenterAngle;
    const totalDegrees = (baseRotations * 360) + targetRotation;
    
    console.log('🔄 Rotación objetivo:', targetRotation, '°');
    console.log('🔄 Rotación total:', totalDegrees, '°');
    
    const spinner = document.getElementById('roulette-spinner');
    spinner.style.transform = `rotate(${totalDegrees}deg)`;

    
    // Esperar a que termine la animación
    setTimeout(async () => {
      // Detener sonido
      spinSound.pause();
      spinSound.currentTime = 0;
      
      // Iluminar la rebanada ganadora
      const allSlices = document.querySelectorAll('.roulette-slice');
      const winnerSlice = allSlices[winnerIndex];
      
      winnerSlice.style.background = 'linear-gradient(135deg, #ffd700, #ffed4e)';
      winnerSlice.style.boxShadow = '0 0 60px rgba(255, 215, 0, 1), inset 0 0 40px rgba(255, 255, 255, 0.5)';
      winnerSlice.style.zIndex = '5';
      
      // Mostrar resultado
      const resultMessage = document.getElementById('result-message');
      resultMessage.innerHTML = `
        <div style="animation: fadeIn 0.5s ease;">
          <div style="font-size: 4rem; margin-bottom: 1rem; animation: bounce 1s infinite;">
            ${winnerSpell.icon}
          </div>
          <h3 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 0.5rem; font-size: 1.8rem; text-shadow: 0 0 20px rgba(0, 240, 255, 0.8);">
            ¡GANASTE ${winnerSpell.name.toUpperCase()}!
          </h3>
          <p style="color: var(--text-secondary); font-size: 1rem; max-width: 400px; margin: 0 auto;">
            ${winnerSpell.description}
          </p>
        </div>
      `;
      
      // Guardar en la base de datos
      await awardSpellFromRoulette(student.id, winnerSpell);
      
      // Cambiar botones
      const buttonsDiv = document.getElementById('roulette-buttons');
      buttonsDiv.innerHTML = `
        <button id="close-after-spin" style="
          padding: 1.2rem 3rem;
          background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta));
          border: none;
          border-radius: 15px;
          color: #0a0e27;
          font-family: 'Orbitron', sans-serif;
          font-size: 1.3rem;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 0 30px rgba(0, 240, 255, 0.7);
        ">
          ✨ ¡GENIAL! CERRAR
        </button>
      `;
      
      document.getElementById('close-after-spin').onclick = async () => {
        closeModal();
        // Recargar perfil para actualizar spins
        const updatedSnap = await getDoc(doc(db, 'users', student.id));
        loadStudentProfileData({id: student.id, ...updatedSnap.data()});
      };
      
    }, 5000); // 5 segundos de animación
  };
  
  document.getElementById('close-roulette').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay' && !isSpinning) {
      closeModal();
    }
  };
}

// ============================================
// OTORGAR HECHIZO DE LA RULETA
// ============================================

async function awardSpellFromRoulette(studentId, spell) {
  try {
    const studentRef = doc(db, 'users', studentId);
    const transactionsRef = collection(db, 'transactions');
    
    // Obtener datos actuales del alumno
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.data();
    
    // Verificar que tenga spins disponibles
    if ((studentData.availableRouletteSpins || 0) <= 0) {
      showNotification('❌ No tienes Lucky Spins disponibles', 'error');
      return;
    }
    
    // Crear objeto del hechizo ganado
    const wonSpell = {
      spellId: spell.id,
      spellName: spell.name,
      spellIcon: spell.icon,
      purchasedAt: new Date(),
      casted: false,
      castedAt: null,
      obtainedFrom: 'lucky_spin'
    };
    
    // Obtener array actual de hechizos
    const currentSpells = studentData.spells || [];
    const updatedSpells = [...currentSpells, wonSpell];
    
    // Batch write
    const batch = writeBatch(db);
    
    // 1. Actualizar alumno: agregar hechizo y restar spin
    batch.update(studentRef, {
      spells: updatedSpells,
      availableRouletteSpins: (studentData.availableRouletteSpins || 0) - 1,
      lastUpdated: serverTimestamp()
    });
    
    // 2. Crear transacción
    const transactionRef = doc(transactionsRef);
    batch.set(transactionRef, {
      userId: studentId,
      type: 'lucky_spin',
      spellId: spell.id,
      spellName: spell.name,
      performedBy: auth.currentUser.uid,
      timestamp: serverTimestamp()
    });
    
    await batch.commit();
    
    console.log('✅ Hechizo de ruleta otorgado:', spell.name);
    
  } catch (error) {
    console.error('Error otorgando hechizo de ruleta:', error);
    showNotification('❌ Error al guardar el hechizo', 'error');
  }
}

// ============================================
// MODAL: Añadir XP a Guild completo
// ============================================

function showAddXpToGuildModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  // Crear opciones de guilds
  let guildOptions = '<option value="">Selecciona un guild...</option>';
  allGroups.forEach(guild => {
    const studentsInGuild = allStudents.filter(s => s.groupId === guild).length;
    guildOptions += `
      <option value="${guild}">
        🛡️ ${guild} (${studentsInGuild} alumnos)
      </option>
    `;
  });
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-green); margin-bottom: 1.5rem;">
      🛡️ XP a Guild
    </h2>
    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
      Otorga XP a todos los miembros de un guild
    </p>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-green); margin-bottom: 0.5rem; text-transform: uppercase;">
        Seleccionar Guild
      </label>
      <select id="guild-select" style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
        ${guildOptions}
      </select>
    </div>
    
    <div id="guild-preview" style="display: none; margin-bottom: 1.5rem; padding: 1rem; background: rgba(0, 255, 65, 0.05); border: 1px solid rgba(0, 255, 65, 0.3); border-radius: 10px;">
      <!-- Preview de alumnos -->
    </div>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-green); margin-bottom: 0.5rem; text-transform: uppercase;">
        Cantidad de XP
      </label>
      <input type="number" id="guild-xp-amount" value="10" min="1" step="1" 
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-green); margin-bottom: 0.5rem; text-transform: uppercase;">
        Razón
      </label>
      <input type="text" id="guild-xp-reason" placeholder="Ej: Ganaron el desafío de la semana" 
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-guild-xp" disabled style="flex: 1; padding: 1rem; background: linear-gradient(135deg, #00ff41, #00b894); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer; opacity: 0.5;">
        Confirmar
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  const guildSelect = document.getElementById('guild-select');
  const confirmBtn = document.getElementById('confirm-guild-xp');
  const guildPreview = document.getElementById('guild-preview');
  
  // Event listener para mostrar preview del guild
  guildSelect.addEventListener('change', () => {
    const selectedGuild = guildSelect.value;
    
    if (selectedGuild) {
      const studentsInGuild = allStudents.filter(s => s.groupId === selectedGuild);
      
      guildPreview.style.display = 'block';
      guildPreview.innerHTML = `
        <p style="color: var(--neon-green); font-weight: 600; margin-bottom: 0.5rem;">
          Alumnos que recibirán XP:
        </p>
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
          ${studentsInGuild.map(s => `
            <span style="padding: 0.3rem 0.8rem; background: rgba(0, 0, 0, 0.3); border-radius: 15px; font-size: 0.85rem;">
              ${s.displayName}
            </span>
          `).join('')}
        </div>
      `;
      
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.style.cursor = 'pointer';
    } else {
      guildPreview.style.display = 'none';
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
    }
  });
  
  // Confirmar
  confirmBtn.onclick = async () => {
    const selectedGuild = guildSelect.value;
    const amount = parseInt(document.getElementById('guild-xp-amount').value);
    const reason = document.getElementById('guild-xp-reason').value.trim();
    
    if (!selectedGuild) {
      showNotification('⚠️ Selecciona un guild', 'warning');
      return;
    }
    
    if (!amount || amount <= 0) {
      showNotification('⚠️ Ingresa una cantidad válida', 'warning');
      return;
    }
    
    if (!reason) {
      showNotification('⚠️ Ingresa una razón', 'warning');
      return;
    }
    
    await addXpToGuild(selectedGuild, amount, reason);
    closeModal();
  };
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// AÑADIR XP A GUILD COMPLETO
// ============================================

async function addXpToGuild(guildId, amount, reason) {
  try {
    const studentsInGuild = allStudents.filter(s => s.groupId === guildId);
    
    if (studentsInGuild.length === 0) {
      showNotification('❌ No hay alumnos en este guild', 'error');
      return;
    }
    
    const batch = writeBatch(db);
    const transactionsRef = collection(db, 'transactions');
    
    // Añadir XP a cada alumno del guild
    studentsInGuild.forEach(student => {
      const studentRef = doc(db, 'users', student.id);
      const oldXp = student.totalXp || 0;
      const newXp = oldXp + amount;
      
      // Actualizar XP
      batch.update(studentRef, {
        totalXp: newXp,
        lastUpdated: serverTimestamp()
      });
      
      // Crear transacción
      const transactionRef = doc(transactionsRef);
      batch.set(transactionRef, {
        userId: student.id,
        type: 'guild_xp_add',
        amount: amount,
        reason: reason,
        guildId: guildId,
        performedBy: auth.currentUser.uid,
        oldBalance: oldXp,
        newBalance: newXp,
        timestamp: serverTimestamp()
      });
    });
    
    await batch.commit();
    
    showNotification(`✅ ${amount} XP añadidos a ${studentsInGuild.length} alumnos del guild ${guildId}`, 'success');
    
  } catch (error) {
    console.error('Error añadiendo XP a guild:', error);
    showNotification('❌ Error al añadir XP al guild', 'error');
  }
}

// ============================================
// MODAL: Añadir XP a Party (grupo personalizado)
// ============================================
function showAddXpToPartyModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  // Crear opciones de guilds para filtrar
  let guildFilterOptions = '<option value="">Todos los guilds</option>';
  allGroups.forEach(guild => {
    guildFilterOptions += `<option value="${guild}">🛡️ ${guild}</option>`;
  });
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 1.5rem;">
      👥 XP a Party
    </h2>
    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
      Selecciona varios alumnos para otorgarles XP
    </p>
    
     <!-- ✅ TOGGLE SUMAR/RESTAR -->
    <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; background: rgba(0,0,0,0.3); padding: 0.4rem; border-radius: 10px;">
      <button id="mode-add" style="flex: 1; padding: 0.6rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 8px; color: #0a0e27; font-weight: 700; cursor: pointer;">
        ➕ Sumar
      </button>
      <button id="mode-remove" style="flex: 1; padding: 0.6rem; background: transparent; border: none; border-radius: 8px; color: var(--text-secondary); font-weight: 700; cursor: pointer;">
        ➖ Restar
      </button>
    </div>
    <!-- Filtro de guild -->
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Filtrar por Guild
      </label>
      <select id="party-guild-filter" style="width: 100%; padding: 0.7rem 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 0.9rem;">
        ${guildFilterOptions}
      </select>
    </div>
    
    <!-- Barra de búsqueda -->
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        🔍 Buscar Alumno
      </label>
      <input type="text" id="party-search-input" placeholder="Escribe el nombre del alumno..." 
             style="width: 100%; padding: 0.7rem 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 0.9rem;">
    </div>
    
    <!-- Lista de alumnos con checkboxes -->
    <div style="margin-bottom: 1.5rem; max-height: 300px; overflow-y: auto; padding: 1rem; background: rgba(0, 0, 0, 0.2); border-radius: 10px; border: 1px solid var(--glass-border);">
      <div id="students-checkbox-list">
        <!-- Se llenarán dinámicamente -->
      </div>
    </div>
    
    <!-- Preview de seleccionados -->
    <div id="selected-preview" style="display: none; margin-bottom: 1rem; padding: 1rem; background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 10px;">
      <p style="color: var(--neon-cyan); font-weight: 600; margin-bottom: 0.5rem;">
        Seleccionados: <span id="selected-count">0</span>
      </p>
      <div id="selected-names" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
        <!-- Nombres de seleccionados -->
      </div>
    </div>
    
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Cantidad de XP
      </label>
      <input type="number" id="party-xp-amount" value="10" min="1" step="1" 
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Razón
      </label>
      <input type="text" id="party-xp-reason" placeholder="Ej: Trabajo en equipo excepcional" 
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-party-xp" disabled style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer; opacity: 0.5;">
        Confirmar
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  let selectedStudents = new Set();
  let currentGuildFilter = '';
  let currentSearchTerm = '';

  let isRemoving = false;

  document.getElementById('mode-add').onclick = () => {
    isRemoving = false;
    document.getElementById('mode-add').style.background = 'linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta))';
    document.getElementById('mode-add').style.color = '#0a0e27';
    document.getElementById('mode-remove').style.background = 'transparent';
    document.getElementById('mode-remove').style.color = 'var(--text-secondary)';
  };

  document.getElementById('mode-remove').onclick = () => {
    isRemoving = true;
    document.getElementById('mode-remove').style.background = 'linear-gradient(135deg, #ff4757, #ff6348)';
    document.getElementById('mode-remove').style.color = 'white';
    document.getElementById('mode-add').style.background = 'transparent';
    document.getElementById('mode-add').style.color = 'var(--text-secondary)';
  };

  
  // ✅ FUNCIÓN PARA MANEJAR CLICKS EN CHECKBOXES (USANDO DELEGACIÓN DE EVENTOS)
  function handleCheckboxChange(e) {
    if (!e.target.classList.contains('student-checkbox')) return;
    
    const studentId = e.target.dataset.studentId;
    
    if (e.target.checked) {
      selectedStudents.add(studentId);
      console.log('✅ Agregado:', studentId, 'Total:', selectedStudents.size);
    } else {
      selectedStudents.delete(studentId);
      console.log('❌ Removido:', studentId, 'Total:', selectedStudents.size);
    }
    
    updateSelectedStudents();
  }
  
  // Función para renderizar lista de alumnos
  function renderStudentsList() {
    const studentsList = document.getElementById('students-checkbox-list');
    
    // Filtrar por guild
    let filteredStudents = currentGuildFilter 
      ? allStudents.filter(s => s.groupId === currentGuildFilter)
      : allStudents;
    
    // Filtrar por búsqueda (nombre o email)
    if (currentSearchTerm) {
      const searchLower = currentSearchTerm.toLowerCase();
      filteredStudents = filteredStudents.filter(s => 
        s.displayName.toLowerCase().includes(searchLower) ||
        s.email.toLowerCase().includes(searchLower) ||
        (s.nickname && s.nickname.toLowerCase().includes(searchLower))
      );
    }
    
    // Si no hay resultados
    if (filteredStudents.length === 0) {
      studentsList.innerHTML = `
        <p style="color: var(--text-secondary); text-align: center; padding: 2rem; font-style: italic;">
          🔍 No se encontraron alumnos
        </p>
      `;
      return;
    }
    
    studentsList.innerHTML = filteredStudents.map(student => `
      <label style="display: flex; align-items: center; padding: 0.7rem; cursor: pointer; border-radius: 8px; transition: all 0.2s ease;" 
             onmouseover="this.style.background='rgba(0, 240, 255, 0.1)'" 
             onmouseout="this.style.background='transparent'">
        <input type="checkbox" class="student-checkbox" data-student-id="${student.id}" 
               ${selectedStudents.has(student.id) ? 'checked' : ''}
               style="margin-right: 0.8rem; width: 18px; height: 18px; cursor: pointer;">
        <span style="flex: 1; color: var(--text-primary);">
          ${student.displayName}
        </span>
        <span style="font-size: 0.8rem; color: var(--text-secondary); padding: 0.2rem 0.6rem; background: rgba(255, 255, 255, 0.05); border-radius: 10px;">
          ${student.groupId || 'Sin guild'}
        </span>
      </label>
    `).join('');
  }
  
  // Función para actualizar preview de seleccionados
  function updateSelectedStudents() {
    const selectedPreview = document.getElementById('selected-preview');
    const selectedCount = document.getElementById('selected-count');
    const selectedNames = document.getElementById('selected-names');
    const confirmBtn = document.getElementById('confirm-party-xp');
    
    console.log('📊 Actualizando preview. Total seleccionados:', selectedStudents.size);
    
    if (selectedStudents.size > 0) {
      selectedPreview.style.display = 'block';
      selectedCount.textContent = selectedStudents.size;
      
      selectedNames.innerHTML = Array.from(selectedStudents).map(id => {
        const student = allStudents.find(s => s.id === id);
        return `
          <span style="padding: 0.3rem 0.8rem; background: rgba(0, 0, 0, 0.3); border-radius: 15px; font-size: 0.85rem;">
            ${student ? student.displayName : 'Alumno desconocido'}
          </span>
        `;
      }).join('');
      
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.style.cursor = 'pointer';
    } else {
      selectedPreview.style.display = 'none';
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
    }
  }
  
  // Inicializar lista
  renderStudentsList();
  
  // ✅ USAR DELEGACIÓN DE EVENTOS (un solo listener en el contenedor)
  document.getElementById('students-checkbox-list').addEventListener('change', handleCheckboxChange);
  
  // Event listener para búsqueda
  document.getElementById('party-search-input').addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.trim();
    renderStudentsList();
  });
  
  // Filtro de guild
  document.getElementById('party-guild-filter').addEventListener('change', (e) => {
    currentGuildFilter = e.target.value;
    renderStudentsList();
  });
  
  // Confirmar
  document.getElementById('confirm-party-xp').onclick = async () => {
    const amount = parseInt(document.getElementById('party-xp-amount').value);
    const reason = document.getElementById('party-xp-reason').value.trim();
    
    if (selectedStudents.size === 0) {
      showNotification('⚠️ Selecciona al menos un alumno', 'warning');
      return;
    }
    if (!amount || amount <= 0) {
      showNotification('⚠️ Ingresa una cantidad válida', 'warning');
      return;
    }
    if (!reason) {
      showNotification('⚠️ Ingresa una razón', 'warning');
      return;
    }
    
    const finalAmount = isRemoving ? -amount : amount;  // ✅ aquí está la magia
    await addXpToParty(Array.from(selectedStudents), finalAmount, reason);
    closeModal();
  };
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// AÑADIR XP A PARTY (grupo personalizado)
// ============================================

async function addXpToParty(studentIds, amount, reason) {
  try {
    const batch = writeBatch(db);
    const transactionsRef = collection(db, 'transactions');
    
    studentIds.forEach(studentId => {
      const student = allStudents.find(s => s.id === studentId);
      if (!student) return;
      
      const studentRef = doc(db, 'users', studentId);
      const oldXp = student.totalXp || 0;
      const newXp = oldXp + amount;
      
      // Actualizar XP
      batch.update(studentRef, {
        totalXp: newXp,
        lastUpdated: serverTimestamp()
      });
      
      // Crear transacción
      const transactionRef = doc(transactionsRef);
      batch.set(transactionRef, {
        userId: studentId,
        type: 'party_xp_add',
        amount: amount,
        reason: reason,
        performedBy: auth.currentUser.uid,
        oldBalance: oldXp,
        newBalance: newXp,
        timestamp: serverTimestamp()
      });
    });
    
    await batch.commit();
    
    showNotification(`✅ ${amount} XP añadidos a ${studentIds.length} alumnos`, 'success');
    
  } catch (error) {
    console.error('Error añadiendo XP a party:', error);
    showNotification('❌ Error al añadir XP al party', 'error');
  }
}

// ============================================
// MODAL: Intercambiar/Regalar Hechizos
// ============================================

function showSpellExchangeModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-magenta); margin-bottom: 1.5rem;">
      🔄 Intercambiar / Regalar Hechizos
    </h2>
    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
      Los alumnos deben ser del mismo guild
    </p>
    
    <!-- PASO 1: Seleccionar Alumno 1 (Quien da) -->
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        👤 Alumno 1 (Quien da el hechizo)
      </label>
      <select id="student1-select" style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
        <option value="">Selecciona un alumno...</option>
        ${allStudents.map(s => `
          <option value="${s.id}">
            ${s.displayName} - ${s.groupId || 'Sin guild'}
          </option>
        `).join('')}
      </select>
    </div>
    
    <!-- Hechizos del Alumno 1 -->
    <div id="student1-spells" style="display: none; margin-bottom: 1.5rem;">
      <p style="color: var(--neon-cyan); font-weight: 600; margin-bottom: 0.5rem; font-size: 0.85rem;">
        Hechizos disponibles de <span id="student1-name"></span>:
      </p>
      <div id="student1-spells-list" style="display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 1rem; background: rgba(0, 0, 0, 0.2); border-radius: 10px; max-height: 150px; overflow-y: auto;">
        <!-- Hechizos aquí -->
      </div>
    </div>
    
    <!-- PASO 2: Seleccionar Alumno 2 (Quien recibe) -->
    <div id="student2-section" style="display: none; margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-magenta); margin-bottom: 0.5rem; text-transform: uppercase;">
        👤 Alumno 2 (Quien recibe)
      </label>
      <select id="student2-select" style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
        <option value="">Selecciona un alumno del mismo guild...</option>
      </select>
    </div>
    
    <!-- Hechizos del Alumno 2 (para intercambio) -->
    <div id="student2-spells" style="display: none; margin-bottom: 1.5rem;">
      <p style="color: var(--neon-magenta); font-weight: 600; margin-bottom: 0.5rem; font-size: 0.85rem;">
        Hechizos disponibles de <span id="student2-name"></span>:
      </p>
      <div id="student2-spells-list" style="display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 1rem; background: rgba(0, 0, 0, 0.2); border-radius: 10px; max-height: 150px; overflow-y: auto;">
        <!-- Hechizos aquí -->
      </div>
    </div>
    
    <!-- Tipo de transacción -->
    <div id="transaction-type" style="display: none; margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #ffd700; margin-bottom: 0.5rem; text-transform: uppercase;">
        Tipo de transacción
      </label>
      <div style="display: flex; gap: 1rem;">
        <label style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 2px solid var(--glass-border); border-radius: 10px; cursor: pointer; transition: all 0.3s ease;" 
               onmouseover="this.style.borderColor='var(--neon-cyan)'" 
               onmouseout="if(!document.getElementById('exchange-radio').checked) this.style.borderColor='var(--glass-border)'">
          <input type="radio" name="transaction" id="exchange-radio" value="exchange" style="margin-right: 0.5rem;">
          <span>🔄 Intercambio</span>
        </label>
        <label style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 2px solid var(--glass-border); border-radius: 10px; cursor: pointer; transition: all 0.3s ease;" 
               onmouseover="this.style.borderColor='var(--neon-green)'" 
               onmouseout="if(!document.getElementById('gift-radio').checked) this.style.borderColor='var(--glass-border)'">
          <input type="radio" name="transaction" id="gift-radio" value="gift" checked style="margin-right: 0.5rem;">
          <span>🎁 Regalo</span>
        </label>
      </div>
    </div>
    
    <!-- Resumen de la transacción -->
    <div id="transaction-summary" style="display: none; margin-bottom: 1.5rem; padding: 1.5rem; background: rgba(255, 215, 0, 0.05); border: 2px solid rgba(255, 215, 0, 0.3); border-radius: 15px;">
      <h3 style="color: #ffd700; font-family: 'Orbitron', sans-serif; margin-bottom: 1rem; font-size: 1.1rem;">
        📋 Resumen
      </h3>
      <div id="summary-content">
        <!-- Resumen dinámico -->
      </div>
    </div>
    
    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
      <button id="confirm-exchange" disabled style="flex: 1; padding: 1rem; background: linear-gradient(135deg, #ffd700, #ff8c00); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer; opacity: 0.5;">
        Confirmar
      </button>
      <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  let selectedStudent1 = null;
  let selectedStudent2 = null;
  let selectedSpell1 = null;
  let selectedSpell2 = null;
  
  // Event listener: Seleccionar Alumno 1
  document.getElementById('student1-select').addEventListener('change', (e) => {
    const studentId = e.target.value;
    
    if (!studentId) {
      document.getElementById('student1-spells').style.display = 'none';
      document.getElementById('student2-section').style.display = 'none';
      return;
    }
    
    selectedStudent1 = allStudents.find(s => s.id === studentId);
    const availableSpells = (selectedStudent1.spells || []).filter(s => !s.casted);
    
    document.getElementById('student1-name').textContent = selectedStudent1.displayName;
    
    if (availableSpells.length === 0) {
      document.getElementById('student1-spells-list').innerHTML = `
        <p style="color: var(--text-secondary); font-style: italic; width: 100%; text-align: center;">
          No tiene hechizos disponibles
        </p>
      `;
      document.getElementById('student1-spells').style.display = 'block';
      return;
    }
    
    document.getElementById('student1-spells-list').innerHTML = availableSpells.map((spell, index) => `
      <label style="padding: 0.8rem 1.2rem; background: rgba(0, 240, 255, 0.1); border: 2px solid var(--glass-border); border-radius: 10px; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 0.5rem;" 
             onmouseover="this.style.borderColor='var(--neon-cyan)'" 
             onmouseout="if(!document.getElementById('spell1-${index}').checked) this.style.borderColor='var(--glass-border)'">
        <input type="radio" name="spell1" id="spell1-${index}" value="${index}" style="margin: 0;">
        <span style="font-size: 1.5rem;">${spell.spellIcon}</span>
        <span style="color: var(--text-primary); font-size: 0.9rem;">${spell.spellName}</span>
      </label>
    `).join('');
    
    document.getElementById('student1-spells').style.display = 'block';
    
    // Event listeners para hechizos del alumno 1
    availableSpells.forEach((spell, index) => {
      document.getElementById(`spell1-${index}`).addEventListener('change', () => {
        selectedSpell1 = spell;
        loadStudent2Options();
        updateTransactionSummary();
      });
    });
  });
  
  // Función para cargar alumnos del mismo guild
  function loadStudent2Options() {
    if (!selectedStudent1 || !selectedSpell1) return;
    
    const sameGuildStudents = allStudents.filter(s => 
      s.id !== selectedStudent1.id && 
      s.groupId === selectedStudent1.groupId &&
      s.groupId !== 'sin-grupo'
    );
    
    const student2Select = document.getElementById('student2-select');
    
    if (sameGuildStudents.length === 0) {
      student2Select.innerHTML = '<option value="">No hay otros alumnos en este guild</option>';
      document.getElementById('student2-section').style.display = 'block';
      return;
    }
    
    student2Select.innerHTML = `
      <option value="">Selecciona un alumno del mismo guild...</option>
      ${sameGuildStudents.map(s => `
        <option value="${s.id}">${s.displayName}</option>
      `).join('')}
    `;
    
    document.getElementById('student2-section').style.display = 'block';
    
    // Event listener para alumno 2
    student2Select.addEventListener('change', (e) => {
      const studentId = e.target.value;
      
      if (!studentId) {
        document.getElementById('student2-spells').style.display = 'none';
        document.getElementById('transaction-type').style.display = 'none';
        return;
      }
      
      selectedStudent2 = allStudents.find(s => s.id === studentId);
      const availableSpells2 = (selectedStudent2.spells || []).filter(s => !s.casted);
      
      document.getElementById('student2-name').textContent = selectedStudent2.displayName;
      document.getElementById('transaction-type').style.display = 'block';
      
      if (availableSpells2.length === 0) {
        document.getElementById('student2-spells-list').innerHTML = `
          <p style="color: var(--text-secondary); font-style: italic; width: 100%; text-align: center;">
            No tiene hechizos para intercambiar (solo puede recibir regalo)
          </p>
        `;
        document.getElementById('student2-spells').style.display = 'block';
        document.getElementById('exchange-radio').disabled = true;
        document.getElementById('gift-radio').checked = true;
        updateTransactionSummary();
        return;
      }
      
      document.getElementById('student2-spells-list').innerHTML = availableSpells2.map((spell, index) => `
        <label style="padding: 0.8rem 1.2rem; background: rgba(255, 0, 255, 0.1); border: 2px solid var(--glass-border); border-radius: 10px; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 0.5rem;" 
               onmouseover="this.style.borderColor='var(--neon-magenta)'" 
               onmouseout="if(!document.getElementById('spell2-${index}').checked) this.style.borderColor='var(--glass-border)'">
          <input type="radio" name="spell2" id="spell2-${index}" value="${index}" style="margin: 0;">
          <span style="font-size: 1.5rem;">${spell.spellIcon}</span>
          <span style="color: var(--text-primary); font-size: 0.9rem;">${spell.spellName}</span>
        </label>
      `).join('');
      
      document.getElementById('student2-spells').style.display = 'block';
      document.getElementById('exchange-radio').disabled = false;
      
      // Event listeners para hechizos del alumno 2
      availableSpells2.forEach((spell, index) => {
        document.getElementById(`spell2-${index}`).addEventListener('change', () => {
          selectedSpell2 = spell;
          updateTransactionSummary();
        });
      });
      
      updateTransactionSummary();
    });
  }
  
  // Event listeners para tipo de transacción
  document.querySelectorAll('input[name="transaction"]').forEach(radio => {
    radio.addEventListener('change', updateTransactionSummary);
  });
  
  // Función para actualizar el resumen
  function updateTransactionSummary() {
    const transactionType = document.querySelector('input[name="transaction"]:checked')?.value;
    const summaryDiv = document.getElementById('transaction-summary');
    const summaryContent = document.getElementById('summary-content');
    const confirmBtn = document.getElementById('confirm-exchange');
    
    if (!selectedStudent1 || !selectedSpell1 || !selectedStudent2) {
      summaryDiv.style.display = 'none';
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      return;
    }
    
    if (transactionType === 'exchange' && !selectedSpell2) {
      summaryDiv.style.display = 'none';
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      return;
    }
    
    let summaryHTML = '';
    
    if (transactionType === 'gift') {
      summaryHTML = `
        <div style="display: flex; align-items: center; gap: 1rem; justify-content: center;">
          <div style="text-align: center;">
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.3rem;">Da</p>
            <p style="color: var(--neon-cyan); font-weight: 700;">${selectedStudent1.displayName}</p>
            <div style="font-size: 2.5rem; margin: 0.5rem 0;">${selectedSpell1.spellIcon}</div>
            <p style="color: var(--text-primary); font-size: 0.9rem;">${selectedSpell1.spellName}</p>
          </div>
          <div style="font-size: 2rem; color: #ffd700;">→🎁</div>
          <div style="text-align: center;">
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.3rem;">Recibe</p>
            <p style="color: var(--neon-magenta); font-weight: 700;">${selectedStudent2.displayName}</p>
            <div style="font-size: 2.5rem; margin: 0.5rem 0;">${selectedSpell1.spellIcon}</div>
            <p style="color: var(--text-primary); font-size: 0.9rem;">${selectedSpell1.spellName}</p>
          </div>
        </div>
      `;
    } else {
      summaryHTML = `
        <div style="display: flex; align-items: center; gap: 1rem; justify-content: center;">
          <div style="text-align: center;">
            <p style="color: var(--neon-cyan); font-weight: 700;">${selectedStudent1.displayName}</p>
            <div style="font-size: 2.5rem; margin: 0.5rem 0;">${selectedSpell1.spellIcon}</div>
            <p style="color: var(--text-primary); font-size: 0.9rem;">${selectedSpell1.spellName}</p>
          </div>
          <div style="font-size: 2rem; color: #ffd700;">⇄</div>
          <div style="text-align: center;">
            <p style="color: var(--neon-magenta); font-weight: 700;">${selectedStudent2.displayName}</p>
            <div style="font-size: 2.5rem; margin: 0.5rem 0;">${selectedSpell2.spellIcon}</div>
            <p style="color: var(--text-primary); font-size: 0.9rem;">${selectedSpell2.spellName}</p>
          </div>
        </div>
      `;
    }
    
    summaryContent.innerHTML = summaryHTML;
    summaryDiv.style.display = 'block';
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
    confirmBtn.style.cursor = 'pointer';
  }
  
  // Confirmar transacción
  document.getElementById('confirm-exchange').onclick = async () => {
    const transactionType = document.querySelector('input[name="transaction"]:checked').value;
    
    if (transactionType === 'gift') {
      await giftSpell(selectedStudent1.id, selectedStudent2.id, selectedSpell1);
    } else {
      await exchangeSpells(selectedStudent1.id, selectedStudent2.id, selectedSpell1, selectedSpell2);
    }
    
    closeModal();
  };
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// REGALAR HECHIZO
// ============================================

async function giftSpell(giverId, receiverId, spell) {
  try {
    const giverRef = doc(db, 'users', giverId);
    const receiverRef = doc(db, 'users', receiverId);
    const transactionsRef = collection(db, 'transactions');
    
    // Obtener datos actuales
    const giverSnap = await getDoc(giverRef);
    const receiverSnap = await getDoc(receiverRef);
    const giverData = giverSnap.data();
    const receiverData = receiverSnap.data();
    
    const batch = writeBatch(db);
    
    // ✅ ELIMINAR hechizo del que da (en lugar de marcarlo)
    const giverSpells = (giverData.spells || []).filter(s => 
      !(s.spellId === spell.spellId && 
        s.purchasedAt.toMillis() === spell.purchasedAt.toMillis())
    );
    
    // ✅ AGREGAR hechizo al que recibe
    const receiverSpells = [...(receiverData.spells || []), {
      spellId: spell.spellId,
      spellName: spell.spellName,
      spellIcon: spell.spellIcon,
      purchasedAt: new Date(),
      casted: false,
      castedAt: null,
      obtainedFrom: 'gift',
      receivedFrom: giverId
    }];
    
    batch.update(giverRef, { 
      spells: giverSpells,
      lastUpdated: serverTimestamp()
    });
    
    batch.update(receiverRef, { 
      spells: receiverSpells,
      lastUpdated: serverTimestamp()
    });
    
    // Transacción
    const transactionRef = doc(transactionsRef);
    batch.set(transactionRef, {
      type: 'spell_gift',
      giverId: giverId,
      receiverId: receiverId,
      spellId: spell.spellId,
      spellName: spell.spellName,
      performedBy: auth.currentUser.uid,
      timestamp: serverTimestamp()
    });
    
    await batch.commit();
    
    const giverName = allStudents.find(s => s.id === giverId)?.displayName;
    const receiverName = allStudents.find(s => s.id === receiverId)?.displayName;
    
    showNotification(`✅ ${giverName} regaló ${spell.spellIcon} ${spell.spellName} a ${receiverName}`, 'success');
    
  } catch (error) {
    console.error('Error regalando hechizo:', error);
    showNotification('❌ Error al regalar hechizo', 'error');
  }
}

// ============================================
// INTERCAMBIAR HECHIZOS
// ============================================

async function exchangeSpells(student1Id, student2Id, spell1, spell2) {
  try {
    const student1Ref = doc(db, 'users', student1Id);
    const student2Ref = doc(db, 'users', student2Id);
    const transactionsRef = collection(db, 'transactions');
    
    // Obtener datos actuales
    const student1Snap = await getDoc(student1Ref);
    const student2Snap = await getDoc(student2Ref);
    const student1Data = student1Snap.data();
    const student2Data = student2Snap.data();
    
    const batch = writeBatch(db);
    
    // ✅ ALUMNO 1: Eliminar spell1 y agregar spell2
    const student1Spells = (student1Data.spells || [])
      .filter(s => 
        !(s.spellId === spell1.spellId && 
          s.purchasedAt.toMillis() === spell1.purchasedAt.toMillis())
      )
      .concat({
        spellId: spell2.spellId,
        spellName: spell2.spellName,
        spellIcon: spell2.spellIcon,
        purchasedAt: new Date(),
        casted: false,
        castedAt: null,
        obtainedFrom: 'exchange',
        receivedFrom: student2Id
      });
    
    // ✅ ALUMNO 2: Eliminar spell2 y agregar spell1
    const student2Spells = (student2Data.spells || [])
      .filter(s => 
        !(s.spellId === spell2.spellId && 
          s.purchasedAt.toMillis() === spell2.purchasedAt.toMillis())
      )
      .concat({
        spellId: spell1.spellId,
        spellName: spell1.spellName,
        spellIcon: spell1.spellIcon,
        purchasedAt: new Date(),
        casted: false,
        castedAt: null,
        obtainedFrom: 'exchange',
        receivedFrom: student1Id
      });
    
    batch.update(student1Ref, { 
      spells: student1Spells,
      lastUpdated: serverTimestamp()
    });
    
    batch.update(student2Ref, { 
      spells: student2Spells,
      lastUpdated: serverTimestamp()
    });
    
    // Transacción
    const transactionRef = doc(transactionsRef);
    batch.set(transactionRef, {
      type: 'spell_exchange',
      student1Id: student1Id,
      student2Id: student2Id,
      spell1Id: spell1.spellId,
      spell1Name: spell1.spellName,
      spell2Id: spell2.spellId,
      spell2Name: spell2.spellName,
      performedBy: auth.currentUser.uid,
      timestamp: serverTimestamp()
    });
    
    await batch.commit();
    
    const student1Name = allStudents.find(s => s.id === student1Id)?.displayName;
    const student2Name = allStudents.find(s => s.id === student2Id)?.displayName;
    
    showNotification(`✅ ${student1Name} (${spell1.spellIcon}) ⇄ ${student2Name} (${spell2.spellIcon})`, 'success');
    
  } catch (error) {
    console.error('Error intercambiando hechizos:', error);
    showNotification('❌ Error al intercambiar hechizos', 'error');
  }
}

// ============================================
// MODAL: Editar Alumno
// ============================================

function showEditStudentModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  // Crear opciones de alumnos
  let studentOptions = '<option value="">Selecciona un alumno...</option>';
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 1.5rem;">
      ✏️ Editar Alumno
    </h2>
    
    <!-- ✅ BARRA DE BÚSQUEDA -->
    <div style="margin-bottom: 1rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        🔍 Buscar Alumno
      </label>
      <input type="text" id="edit-student-search" placeholder="Escribe el nombre del alumno..." 
             style="width: 100%; padding: 0.7rem 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 0.9rem;">
    </div>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Seleccionar Alumno
      </label>
      <select id="select-student-to-edit" style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem; max-height: 200px;">
        ${studentOptions}
      </select>
    </div>
    
    <div id="edit-form" style="display: none;">
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
          Nombre Completo
        </label>
        <input type="text" id="edit-displayname" 
               style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
      </div>
      
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
          Nickname
        </label>
        <input type="text" id="edit-nickname" 
               style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
      </div>
      
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
          Apellidos
        </label>
        <input type="text" id="edit-lastname" 
               style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
      </div>
      
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
          Avatar URL (Opcional)
        </label>
        <input type="url" id="edit-avatar" placeholder="https://ejemplo.com/foto.jpg"
               style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
      </div>
      
      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
          Guild
        </label>
        <select id="edit-guild" style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
          <option value="sin-grupo">Sin Guild</option>
          ${allGroups.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
      </div>
      
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button id="confirm-edit-student" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer;">
          Guardar Cambios
        </button>
        <button id="cancel-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--neon-magenta); border-radius: 10px; color: var(--neon-magenta); font-size: 1rem; font-weight: 600; cursor: pointer;">
          Cancelar
        </button>
      </div>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  let selectedStudent = null;
  let searchTerm = '';
  
  // ✅ Función para renderizar opciones del select
  function renderStudentOptions() {
    const select = document.getElementById('select-student-to-edit');
    const currentValue = select.value; // Preservar selección actual
    
    // Filtrar alumnos
    let filteredStudents = allStudents;
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredStudents = allStudents.filter(s => 
        s.displayName.toLowerCase().includes(searchLower) ||
        s.email.toLowerCase().includes(searchLower) ||
        (s.groupId && s.groupId.toLowerCase().includes(searchLower)) ||
  (s.nickname && s.nickname.toLowerCase().includes(searchLower))
      );
    }
    
    // Ordenar alfabéticamente
    filteredStudents.sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    // Crear opciones
    let options = '<option value="">Selecciona un alumno...</option>';
    
    if (filteredStudents.length === 0) {
      options += '<option value="" disabled>🔍 No se encontraron alumnos</option>';
    } else {
      filteredStudents.forEach(student => {
        const guild = student.groupId || 'Sin guild';
        options += `
          <option value="${student.id}">
            ${student.displayName} - ${guild}
          </option>
        `;
      });
    }
    
    select.innerHTML = options;
    
    // Restaurar selección si existe
    if (currentValue && filteredStudents.find(s => s.id === currentValue)) {
      select.value = currentValue;
    }
  }
  
  // Inicializar opciones
  renderStudentOptions();
  
  // ✅ Event listener para búsqueda
  document.getElementById('edit-student-search').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    renderStudentOptions();
  });
  
  // Cargar datos del alumno seleccionado
  document.getElementById('select-student-to-edit').addEventListener('change', (e) => {
    const studentId = e.target.value;
    
    if (!studentId) {
      document.getElementById('edit-form').style.display = 'none';
      return;
    }
    
    selectedStudent = allStudents.find(s => s.id === studentId);
    
    document.getElementById('edit-displayname').value = selectedStudent.displayName || '';
    document.getElementById('edit-nickname').value = selectedStudent.nickname || '';
    document.getElementById('edit-lastname').value = selectedStudent.lastName || '';
    document.getElementById('edit-avatar').value = selectedStudent.avatar || '';
    document.getElementById('edit-guild').value = selectedStudent.groupId || 'sin-grupo';
    
    document.getElementById('edit-form').style.display = 'block';
  });
  
  // Confirmar cambios
  document.getElementById('confirm-edit-student').onclick = async () => {
    if (!selectedStudent) {
      showNotification('⚠️ Selecciona un alumno', 'warning');
      return;
    }
    
    const displayName = document.getElementById('edit-displayname').value.trim();
    const nickname = document.getElementById('edit-nickname').value.trim();
    const lastName = document.getElementById('edit-lastname').value.trim();
    const avatar = document.getElementById('edit-avatar').value.trim();
    const guild = document.getElementById('edit-guild').value;
    
    if (!displayName) {
      showNotification('⚠️ El nombre es obligatorio', 'warning');
      return;
    }
    
    await updateStudentInfo(selectedStudent.id, {
      displayName,
      nickname,
      lastName,
      avatar,
      groupId: guild
    });
    
    closeModal();
  };
  
  document.getElementById('cancel-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// ACTUALIZAR INFORMACIÓN DEL ALUMNO
// ============================================

async function updateStudentInfo(studentId, updates) {
  try {
    const studentRef = doc(db, 'users', studentId);
    
    await updateDoc(studentRef, {
      ...updates,
      lastUpdated: serverTimestamp()
    });
    
    showNotification('✅ Alumno actualizado correctamente', 'success');
    
  } catch (error) {
    console.error('Error actualizando alumno:', error);
    showNotification('❌ Error al actualizar alumno', 'error');
  }
}

// ============================================
// MODAL: Gestionar Guilds
// ============================================

function showManageGuildsModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: #ffd700; margin-bottom: 1.5rem;">
      🛡️ Gestionar Guilds
    </h2>
    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
      Crea, edita o elimina guilds
    </p>
    
    <!-- Lista de Guilds existentes -->
    <div style="margin-bottom: 1.5rem;">
      <h3 style="color: var(--neon-cyan); font-size: 0.9rem; font-weight: 700; margin-bottom: 1rem; text-transform: uppercase;">
        Guilds Existentes
      </h3>
      <div id="guilds-list" style="max-height: 300px; overflow-y: auto; padding: 1rem; background: rgba(0, 0, 0, 0.2); border-radius: 10px; border: 1px solid var(--glass-border);">
        <!-- Lista dinámica -->
      </div>
    </div>
    
    <!-- Formulario para crear nuevo guild -->
    <div style="padding: 1.5rem; background: rgba(0, 240, 255, 0.05); border: 2px solid var(--neon-cyan); border-radius: 15px; margin-bottom: 1.5rem;">
      <h3 style="color: var(--neon-cyan); font-size: 0.9rem; font-weight: 700; margin-bottom: 1rem; text-transform: uppercase;">
        ➕ Crear Nuevo Guild
      </h3>
      
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
          Nombre del Guild
        </label>
        <input type="text" id="new-guild-name" placeholder="Ej: Gryffindor" 
               style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
      </div>
      
      <button id="create-guild-btn" style="width: 100%; padding: 0.8rem; background: linear-gradient(135deg, var(--neon-cyan), #00b894); border: none; border-radius: 10px; color: #0a0e27; font-weight: 700; cursor: pointer;">
        ➕ Crear Guild
      </button>
    </div>
    
    <div style="display: flex; gap: 1rem;">
      <button id="close-guilds-modal" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-weight: 600; cursor: pointer;">
        Cerrar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  // Función para cargar la lista de guilds
  async function loadGuildsList() {
    const guildsList = document.getElementById('guilds-list');
    
    if (allGroups.length === 0) {
      guildsList.innerHTML = `
        <p style="color: var(--text-secondary); text-align: center; font-style: italic;">
          No hay guilds creados aún
        </p>
      `;
      return;
    }
    
    guildsList.innerHTML = allGroups.map(guild => {
      const studentsCount = allStudents.filter(s => s.groupId === guild).length;
      
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem; background: rgba(255, 255, 255, 0.05); border-radius: 10px; margin-bottom: 0.5rem; transition: all 0.3s ease;" 
             onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'" 
             onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
          
          <div style="flex: 1;">
            <span style="color: var(--text-primary); font-weight: 700; font-size: 1rem;">
              🛡️ ${guild}
            </span>
            <span style="color: var(--text-secondary); font-size: 0.85rem; margin-left: 1rem;">
              (${studentsCount} alumno${studentsCount !== 1 ? 's' : ''})
            </span>
          </div>
          
          <div style="display: flex; gap: 0.5rem;">
            <button class="edit-guild-btn" data-guild="${guild}" 
                    style="padding: 0.5rem 1rem; background: rgba(0, 240, 255, 0.2); border: 1px solid var(--neon-cyan); border-radius: 8px; color: var(--neon-cyan); font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;"
                    onmouseover="this.style.background='rgba(0, 240, 255, 0.3)'"
                    onmouseout="this.style.background='rgba(0, 240, 255, 0.2)'">
              ✏️ Editar
            </button>
            <button class="delete-guild-btn" data-guild="${guild}" 
                    style="padding: 0.5rem 1rem; background: rgba(255, 71, 87, 0.2); border: 1px solid #ff4757; border-radius: 8px; color: #ff4757; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;"
                    onmouseover="this.style.background='rgba(255, 71, 87, 0.3)'"
                    onmouseout="this.style.background='rgba(255, 71, 87, 0.2)'"
                    ${studentsCount > 0 ? 'disabled title="No se puede eliminar un guild con alumnos"' : ''}>
              🗑️ Eliminar
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Event listeners para botones de editar
    document.querySelectorAll('.edit-guild-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showEditGuildModal(btn.dataset.guild);
      });
    });
    
    // Event listeners para botones de eliminar
    document.querySelectorAll('.delete-guild-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteGuild(btn.dataset.guild);
      });
    });
  }
  
  loadGuildsList();
  
  // Crear nuevo guild
  document.getElementById('create-guild-btn').addEventListener('click', async () => {
    const guildName = document.getElementById('new-guild-name').value.trim();
    
    if (!guildName) {
      showNotification('⚠️ Ingresa un nombre para el guild', 'warning');
      return;
    }
    
    if (allGroups.includes(guildName)) {
      showNotification('⚠️ Ya existe un guild con ese nombre', 'warning');
      return;
    }
    
    await createGuild(guildName);
    document.getElementById('new-guild-name').value = '';
    loadGuildsList();
  });
  
  document.getElementById('close-guilds-modal').onclick = closeModal;
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
    }
  };
}

// ============================================
// MODAL: Editar Guild
// ============================================

function showEditGuildModal(oldGuildName) {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  const studentsCount = allStudents.filter(s => s.groupId === oldGuildName).length;
  
  modalContainer.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: var(--neon-cyan); margin-bottom: 1.5rem;">
      ✏️ Editar Guild
    </h2>
    
    <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(0, 240, 255, 0.05); border: 1px solid var(--neon-cyan); border-radius: 10px;">
      <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.3rem;">Guild actual:</p>
      <p style="color: var(--neon-cyan); font-weight: 700; font-size: 1.2rem;">🛡️ ${oldGuildName}</p>
      <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem;">
        ${studentsCount} alumno${studentsCount !== 1 ? 's' : ''} en este guild
      </p>
    </div>
    
    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--neon-cyan); margin-bottom: 0.5rem; text-transform: uppercase;">
        Nuevo Nombre
      </label>
      <input type="text" id="edit-guild-name" value="${oldGuildName}" 
             style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 1rem;">
    </div>
    
    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1.5rem;">
      ℹ️ Al cambiar el nombre, se actualizará automáticamente para todos los alumnos del guild.
    </p>
    
    <div style="display: flex; gap: 1rem;">
      <button id="confirm-edit-guild" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); border: none; border-radius: 10px; color: #0a0e27; font-family: 'Orbitron', sans-serif; font-weight: 700; cursor: pointer;">
        Guardar Cambios
      </button>
      <button id="cancel-edit-guild" style="flex: 1; padding: 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-weight: 600; cursor: pointer;">
        Cancelar
      </button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  document.getElementById('confirm-edit-guild').onclick = async () => {
    const newGuildName = document.getElementById('edit-guild-name').value.trim();
    
    if (!newGuildName) {
      showNotification('⚠️ El nombre no puede estar vacío', 'warning');
      return;
    }
    
    if (newGuildName === oldGuildName) {
      showNotification('ℹ️ El nombre no cambió', 'info');
      closeModal();
      return;
    }
    
    if (allGroups.includes(newGuildName)) {
      showNotification('⚠️ Ya existe un guild con ese nombre', 'warning');
      return;
    }
    
    await renameGuild(oldGuildName, newGuildName);
    closeModal();
    
    // Volver a mostrar el modal de gestión
    setTimeout(() => showManageGuildsModal(), 300);
  };
  
  document.getElementById('cancel-edit-guild').onclick = () => {
    closeModal();
    setTimeout(() => showManageGuildsModal(), 300);
  };
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
      setTimeout(() => showManageGuildsModal(), 300);
    }
  };
}

async function createGuild(guildName) {
  try {
    const guildsRef = collection(db, 'groups');
    
    await addDoc(guildsRef, {
      name: guildName,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    });
    
    // ✅ Agregar el guild al array local inmediatamente
    allGroups.push(guildName);
    allGroups.sort();
    
    showNotification(`✅ Guild "${guildName}" creado correctamente`, 'success');
    
    console.log('✅ Guild creado:', guildName);
    console.log('🛡️ Guilds actuales:', allGroups);
    
  } catch (error) {
    console.error('Error creando guild:', error);
    showNotification('❌ Error al crear guild', 'error');
  }
}

// ============================================
// RENOMBRAR GUILD
// ============================================

async function renameGuild(oldName, newName) {
  try {
    const batch = writeBatch(db);
    
    // Actualizar todos los alumnos con el nuevo nombre del guild
    const studentsToUpdate = allStudents.filter(s => s.groupId === oldName);
    
    studentsToUpdate.forEach(student => {
      const studentRef = doc(db, 'users', student.id);
      batch.update(studentRef, {
        groupId: newName,
        lastUpdated: serverTimestamp()
      });
    });
    
    await batch.commit();
    
    showNotification(`✅ Guild renombrado: "${oldName}" → "${newName}"`, 'success');
    
  } catch (error) {
    console.error('Error renombrando guild:', error);
    showNotification('❌ Error al renombrar guild', 'error');
  }
}

// ============================================
// ELIMINAR GUILD
// ============================================

async function deleteGuild(guildName) {
  const studentsCount = allStudents.filter(s => s.groupId === guildName).length;
  
  if (studentsCount > 0) {
    showNotification('❌ No se puede eliminar un guild con alumnos asignados', 'error');
    return;
  }
  
  const confirmed = confirm(`¿Estás seguro de eliminar el guild "${guildName}"?`);
  
  if (!confirmed) return;
  
  try {
    // ✅ Buscar y eliminar el documento del guild en Firestore
    const guildsRef = collection(db, 'groups');
    const q = query(guildsRef, where('name', '==', guildName));
    const querySnapshot = await getDocs(q);
    
    const batch = writeBatch(db);
    querySnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    // ✅ Eliminar del array local
    allGroups = allGroups.filter(g => g !== guildName);
    
    showNotification(`✅ Guild "${guildName}" eliminado`, 'success');
    
    console.log('✅ Guild eliminado:', guildName);
    console.log('🛡️ Guilds restantes:', allGroups);
    
    // Recargar modal
    setTimeout(() => {
      closeModal();
      setTimeout(() => showManageGuildsModal(), 300);
    }, 1000);
    
  } catch (error) {
    console.error('Error eliminando guild:', error);
    showNotification('❌ Error al eliminar guild', 'error');
  }
}

// ============================================
// MODAL: Borrar Todos los Alumnos (DOBLE CONFIRMACIÓN)
// ============================================

function showDeleteAllStudentsModal() {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContainer = document.getElementById('modal-container');
  
  const totalStudents = allStudents.length;
  
  if (totalStudents === 0) {
    showNotification('ℹ️ No hay alumnos para eliminar', 'info');
    return;
  }
  
  modalContainer.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 4rem; margin-bottom: 1rem; animation: pulse 1s infinite;">
        ⚠️
      </div>
      
      <h2 style="font-family: 'Orbitron', sans-serif; color: #ff4757; margin-bottom: 1rem; font-size: 1.8rem;">
        ¡ADVERTENCIA CRÍTICA!
      </h2>
      
      <div style="background: rgba(255, 71, 87, 0.1); border: 2px solid #ff4757; border-radius: 15px; padding: 1.5rem; margin-bottom: 1.5rem;">
        <p style="color: var(--text-primary); font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem;">
          Estás a punto de eliminar TODOS los alumnos del sistema
        </p>
        <p style="color: #ff6b6b; font-size: 2rem; font-weight: 900; margin: 1rem 0;">
          ${totalStudents} ALUMNO${totalStudents !== 1 ? 'S' : ''}
        </p>
        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">
          ⚠️ Esta acción eliminará:<br>
          • Todos los perfiles de alumnos<br>
          • Todo su historial de XP<br>
          • Todos sus hechizos adquiridos<br>
          • Todas sus transacciones<br>
          <br>
          <strong style="color: #ff4757;">ESTA ACCIÓN NO SE PUEDE DESHACER</strong>
        </p>
      </div>
      
      <div style="background: rgba(0, 0, 0, 0.3); border: 2px solid var(--neon-yellow); border-radius: 10px; padding: 1rem; margin-bottom: 1.5rem;">
        <p style="color: var(--neon-yellow); font-weight: 700; margin-bottom: 0.5rem;">
          🔒 PRIMERA CONFIRMACIÓN
        </p>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1rem;">
          Para continuar, escribe exactamente: <strong style="color: var(--text-primary);">ELIMINAR TODOS</strong>
        </p>
        <input type="text" id="confirm-text-1" placeholder="Escribe: ELIMINAR TODOS" 
               style="width: 100%; padding: 0.9rem 1.2rem; background: rgba(255, 255, 255, 0.05); border: 2px solid #ff4757; border-radius: 10px; color: var(--text-primary); font-size: 1rem; text-align: center; font-weight: 700;">
      </div>
      
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button id="cancel-delete-all" style="flex: 1; padding: 1.2rem; background: rgba(255, 255, 255, 0.05); border: 2px solid var(--neon-cyan); border-radius: 10px; color: var(--neon-cyan); font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 700; cursor: pointer;">
          ✅ CANCELAR
        </button>
        <button id="proceed-to-second-confirmation" disabled style="flex: 1; padding: 1.2rem; background: linear-gradient(135deg, #ff4757, #ff6348); border: none; border-radius: 10px; color: white; font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 700; cursor: pointer; opacity: 0.5;">
          ⚠️ CONTINUAR
        </button>
      </div>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  
  // Validar primera confirmación
  const confirmInput1 = document.getElementById('confirm-text-1');
  const proceedBtn = document.getElementById('proceed-to-second-confirmation');
  
  confirmInput1.addEventListener('input', () => {
    if (confirmInput1.value === 'ELIMINAR TODOS') {
      proceedBtn.disabled = false;
      proceedBtn.style.opacity = '1';
      proceedBtn.style.cursor = 'pointer';
    } else {
      proceedBtn.disabled = true;
      proceedBtn.style.opacity = '0.5';
      proceedBtn.style.cursor = 'not-allowed';
    }
  });
  
  // Cancelar
  document.getElementById('cancel-delete-all').onclick = () => {
    closeModal();
    showNotification('✅ Operación cancelada', 'success');
  };
  
  // Proceder a segunda confirmación
  proceedBtn.onclick = () => {
    showSecondConfirmation(totalStudents);
  };
  
  modalOverlay.onclick = (e) => {
    if (e.target.id === 'modal-overlay') {
      closeModal();
      showNotification('✅ Operación cancelada', 'success');
    }
  };
}

// ============================================
// SEGUNDA CONFIRMACIÓN
// ============================================

function showSecondConfirmation(totalStudents) {
  const modalContainer = document.getElementById('modal-container');
  
  modalContainer.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 4rem; margin-bottom: 1rem; animation: shake 0.5s infinite;">
        🚨
      </div>
      
      <h2 style="font-family: 'Orbitron', sans-serif; color: #ff4757; margin-bottom: 1rem; font-size: 2rem; text-shadow: 0 0 20px rgba(255, 71, 87, 0.8);">
        ¡ÚLTIMA ADVERTENCIA!
      </h2>
      
      <div style="background: rgba(255, 0, 0, 0.2); border: 3px solid #ff0000; border-radius: 15px; padding: 2rem; margin-bottom: 1.5rem; animation: pulse 2s infinite;">
        <p style="color: #ff4757; font-size: 1.3rem; font-weight: 900; margin-bottom: 1rem;">
          ESTÁS A PUNTO DE ELIMINAR<br>
          ${totalStudents} ALUMNOS PERMANENTEMENTE
        </p>
        <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6;">
          Una vez que hagas clic en "ELIMINAR TODO",<br>
          <strong style="color: #ff4757;">NO HABRÁ FORMA DE RECUPERAR LOS DATOS</strong>
        </p>
      </div>
      
      <div style="background: rgba(0, 0, 0, 0.5); border: 2px solid #ff0000; border-radius: 10px; padding: 1.5rem; margin-bottom: 1.5rem;">
        <p style="color: #ff4757; font-weight: 700; margin-bottom: 0.5rem; font-size: 1.1rem;">
          🔒 CONFIRMACIÓN FINAL
        </p>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
          Escribe el número de alumnos que serán eliminados: <strong style="color: #ff4757; font-size: 1.5rem;">${totalStudents}</strong>
        </p>
        <input type="number" id="confirm-number" placeholder="Escribe el número aquí" 
               style="width: 100%; padding: 1rem 1.5rem; background: rgba(255, 255, 255, 0.05); border: 3px solid #ff0000; border-radius: 10px; color: #ff4757; font-size: 1.5rem; text-align: center; font-weight: 900;">
      </div>
      
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button id="cancel-final" style="flex: 1; padding: 1.2rem; background: rgba(255, 255, 255, 0.05); border: 2px solid var(--neon-green); border-radius: 10px; color: var(--neon-green); font-family: 'Orbitron', sans-serif; font-size: 1.2rem; font-weight: 900; cursor: pointer;">
          ✅ NO, CANCELAR
        </button>
        <button id="confirm-delete-all-final" disabled style="flex: 1; padding: 1.2rem; background: linear-gradient(135deg, #ff0000, #cc0000); border: none; border-radius: 10px; color: white; font-family: 'Orbitron', sans-serif; font-size: 1.2rem; font-weight: 900; cursor: pointer; opacity: 0.5; text-shadow: 0 0 10px rgba(0, 0, 0, 0.8);">
          🗑️ SÍ, ELIMINAR TODO
        </button>
      </div>
    </div>
  `;
  
  // Validar segunda confirmación
  const confirmInput2 = document.getElementById('confirm-number');
  const finalBtn = document.getElementById('confirm-delete-all-final');
  
  confirmInput2.addEventListener('input', () => {
    if (parseInt(confirmInput2.value) === totalStudents) {
      finalBtn.disabled = false;
      finalBtn.style.opacity = '1';
      finalBtn.style.cursor = 'pointer';
    } else {
      finalBtn.disabled = true;
      finalBtn.style.opacity = '0.5';
      finalBtn.style.cursor = 'not-allowed';
    }
  });
  
  // Cancelar
  document.getElementById('cancel-final').onclick = () => {
    closeModal();
    showNotification('✅ Operación cancelada. Los alumnos están a salvo.', 'success');
  };
  
  // ELIMINAR TODO
  finalBtn.onclick = async () => {
    finalBtn.disabled = true;
    finalBtn.textContent = '⏳ ELIMINANDO...';
    
    await deleteAllStudents();
  };
}

// ============================================
// ELIMINAR TODOS LOS ALUMNOS
// ============================================

async function deleteAllStudents() {
  try {
    const batch = writeBatch(db);
    let studentCount = 0;
    let transactionCount = 0;
    
    // 1. Eliminar todos los documentos de estudiantes
    for (const student of allStudents) {
      const studentRef = doc(db, 'users', student.id);
      batch.delete(studentRef);
      studentCount++;
      
      // Firebase permite máximo 500 operaciones por batch
      if (studentCount % 400 === 0) {
        await batch.commit();
        console.log(`✅ ${studentCount} estudiantes eliminados...`);
      }
    }
    
    // Ejecutar el batch pendiente de estudiantes
    if (studentCount % 400 !== 0) {
      await batch.commit();
    }
    
    // 2. Eliminar TODAS las transacciones
    const transactionsRef = collection(db, 'transactions');
    const transactionsSnapshot = await getDocs(transactionsRef);
    
    const transactionBatch = writeBatch(db);
    transactionsSnapshot.forEach((doc) => {
      transactionBatch.delete(doc.ref);
      transactionCount++;
      
      // Batch cada 400 para dejar margen
      if (transactionCount % 400 === 0) {
        transactionBatch.commit();
        console.log(`✅ ${transactionCount} transacciones eliminadas...`);
      }
    });
    
    // Ejecutar el batch pendiente de transacciones
    if (transactionCount % 400 !== 0) {
      await transactionBatch.commit();
    }
    
    closeModal();
    
    showNotification(`✅ ${studentCount} alumnos y ${transactionCount} transacciones eliminados`, 'success');
    
    console.log(`🗑️ ${studentCount} alumnos y ${transactionCount} transacciones eliminados`);
    
  } catch (error) {
    console.error('Error eliminando alumnos:', error);
    showNotification('❌ Error al eliminar alumnos', 'error');
    closeModal();
  }
}

// ============================================
// ELIMINAR UN SOLO ALUMNO
// ============================================

async function deleteStudent(studentId) {
  const student = allStudents.find(s => s.id === studentId);
  
  if (!student) {
    showNotification('❌ Estudiante no encontrado', 'error');
    return;
  }
  
  const confirmed = confirm(`¿Estás seguro de eliminar a ${student.displayName}?\n\nEsto también eliminará:\n• Su historial de transacciones\n• Sus hechizos\n• Todos sus datos\n\nEsta acción NO se puede deshacer.`);
  
  if (!confirmed) return;
  
  try {
    const batch = writeBatch(db);
    
    // 1. Eliminar todas las transacciones del estudiante
    const transactionsRef = collection(db, 'transactions');
    const q = query(transactionsRef, where('userId', '==', studentId));
    const transactionsSnapshot = await getDocs(q);
    
    let transactionCount = 0;
    transactionsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
      transactionCount++;
    });
    
    // 2. Eliminar el documento del estudiante
    const studentRef = doc(db, 'users', studentId);
    batch.delete(studentRef);
    
    await batch.commit();
    
    showNotification(`✅ ${student.displayName} eliminado (${transactionCount} transacciones borradas)`, 'success');
    console.log(`🗑️ Estudiante ${student.displayName} eliminado con ${transactionCount} transacciones`);
    
  } catch (error) {
    console.error('Error eliminando estudiante:', error);
    showNotification('❌ Error al eliminar estudiante', 'error');
  }
}

// ============================================
// DESHACER COMPRA DE HECHIZO
// ============================================

async function undoSpellPurchase(studentId, spell, refundAmount) {
  const confirmed = confirm(`¿Deshacer la compra de ${spell.spellIcon} ${spell.spellName}?\n\nSe devolverán ${refundAmount} XP al alumno.`);
  
  if (!confirmed) return;
  
  try {
    const studentRef = doc(db, 'users', studentId);
    const transactionsRef = collection(db, 'transactions');
    
    // Obtener datos actuales del alumno
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.data();
    const currentXP = studentData.totalXp || 0;
    const newXP = currentXP + refundAmount;
    
    // Calcular niveles
    const oldLevel = calculateLevel(currentXP);
    const newLevel = calculateLevel(newXP);
    const leveledUp = newLevel > oldLevel;
    
    // Eliminar el hechizo del array
    const updatedSpells = (studentData.spells || []).filter(s => 
      !(s.spellId === spell.spellId && 
        s.purchasedAt.toMillis() === spell.purchasedAt.toMillis())
    );
    
    // Batch write
    const batch = writeBatch(db);
    
    // 1. Actualizar estudiante
    const updateData = {
      totalXp: newXP,
      currentLevel: newLevel,
      spells: updatedSpells,
      lastUpdated: serverTimestamp(),
      availableRouletteSpins: studentData.availableRouletteSpins
    };
    
    // Si subió de nivel al devolver XP
    if (leveledUp) {
      const levelsGained = newLevel - oldLevel;
      const newSpins = (studentData.availableRouletteSpins || 0) + levelsGained;
      updateData.availableRouletteSpins = newSpins;
    }
    
    batch.update(studentRef, updateData);
    
    // 2. Crear transacción
    const transactionRef = doc(transactionsRef);
    batch.set(transactionRef, {
      userId: studentId,
      type: 'spell_refund',
      spellId: spell.spellId,
      spellName: spell.spellName,
      amount: refundAmount,  // Positivo porque es devolución
      reason: `Compra de hechizo deshecha: ${spell.spellName}`,
      performedBy: auth.currentUser.uid,
      oldBalance: currentXP,
      newBalance: newXP,
      timestamp: serverTimestamp()
    });
    
    // Ejecutar batch
    await batch.commit();
    
    if (leveledUp) {
      showNotification(`✅ Compra deshecha! +${refundAmount} XP. ¡Subiste a nivel ${newLevel}!`, 'success');
    } else {
      showNotification(`✅ Compra deshecha! +${refundAmount} XP devueltos`, 'success');
    }
    
  } catch (error) {
    console.error('Error deshaciendo compra:', error);
    showNotification('❌ Error al deshacer compra', 'error');
  }
}