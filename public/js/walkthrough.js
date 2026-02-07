// ============================================
// WALKTHROUGH PARA NUEVOS ALUMNOS
// ============================================

export function initStudentWalkthrough() {
  // Verificar si ya vio el tutorial
  const hasSeenWalkthrough = localStorage.getItem('hasSeenWalkthrough');
  
  if (hasSeenWalkthrough === 'true') {
    console.log('✅ El alumno ya vio el tutorial');
    return;
  }
  
  // Crear el tour
  const tour = new Shepherd.Tour({
    defaultStepOptions: {
      cancelIcon: {
        enabled: true
      },
      classes: 'shepherd-theme-custom',
      scrollTo: { behavior: 'smooth', block: 'center' }
    },
    useModalOverlay: true
  });
  
  // PASO 1: Bienvenida
  tour.addStep({
    id: 'welcome',
    text: `
      <h3 style="color: var(--neon-cyan); font-family: 'Orbitron', sans-serif; margin-bottom: 1rem;">
        🎮 ¡Bienvenido a Class Adventure!
      </h3>
      <p style="color: var(--text-primary);">
        Este es tu dashboard personal donde verás tu progreso, hechizos y recompensas.
      </p>
    `,
    buttons: [
      {
        text: 'Comenzar Tour 🚀',
        action: tour.next,
        classes: 'shepherd-button-primary'
      },
      {
        text: 'Saltar',
        action: tour.cancel
      }
    ]
  });
  
  // PASO 2: Nivel y XP
  tour.addStep({
    id: 'level-xp',
    text: `
      <h3 style="color: var(--neon-cyan); font-family: 'Orbitron', sans-serif; margin-bottom: 1rem;">
        ⚡ Tu Nivel y XP
      </h3>
      <p style="color: var(--text-primary);">
        Aquí ves tu nivel actual y cuánto XP necesitas para subir de nivel.
        Cada vez que subes de nivel, ¡ganas un Lucky Spin! 🎲
      </p>
    `,
    attachTo: {
      element: '.level-circle-wrapper',
      on: 'bottom'
    },
    buttons: [
      {
        text: 'Anterior',
        action: tour.back
      },
      {
        text: 'Siguiente',
        action: tour.next
      }
    ]
  });
  
  // PASO 3: Stats
  tour.addStep({
    id: 'stats',
    text: `
      <h3 style="color: var(--neon-cyan); font-family: 'Orbitron', sans-serif; margin-bottom: 1rem;">
        📊 Tus Estadísticas
      </h3>
      <p style="color: var(--text-primary);">
        Aquí ves:
        <br>• <strong>HP Normal:</strong> Para actividades regulares
        <br>• <strong>Special HP:</strong> Para exámenes y proyectos importantes
        <br><br>Puedes comprar HP con tu XP.
      </p>
    `,
    attachTo: {
      element: '.profile-stats-card',
      on: 'left'
    },
    buttons: [
      {
        text: 'Anterior',
        action: tour.back
      },
      {
        text: 'Siguiente',
        action: tour.next
      }
    ]
  });
  
  // PASO 4: Lucky Spins
  tour.addStep({
    id: 'lucky-spins',
    text: `
      <h3 style="color: #ffd700; font-family: 'Orbitron', sans-serif; margin-bottom: 1rem;">
        🎲 Lucky Spins
      </h3>
      <p style="color: var(--text-primary);">
        Cada vez que subes de nivel, ganas un Lucky Spin.
        <br><br>Úsalo para ganar hechizos gratis en la ruleta.
      </p>
    `,
    attachTo: {
      element: '#student-lucky-spin-btn',
      on: 'bottom'
    },
    buttons: [
      {
        text: 'Anterior',
        action: tour.back
      },
      {
        text: 'Siguiente',
        action: tour.next
      }
    ]
  });
  
  // PASO 5: Comprar hechizos
  tour.addStep({
    id: 'buy-spells',
    text: `
      <h3 style="color: var(--neon-magenta); font-family: 'Orbitron', sans-serif; margin-bottom: 1rem;">
        🪄 Comprar Hechizos
      </h3>
      <p style="color: var(--text-primary);">
        Usa tu XP para comprar hechizos especiales.
        <br><br>Cada hechizo tiene un efecto único que te ayudará en tus actividades.
      </p>
    `,
    attachTo: {
      element: '#student-profile-buy-spell-btn',
      on: 'bottom'
    },
    buttons: [
      {
        text: 'Anterior',
        action: tour.back
      },
      {
        text: 'Siguiente',
        action: tour.next
      }
    ]
  });
  
  // PASO 6: Tus hechizos
  tour.addStep({
    id: 'your-spells',
    text: `
      <h3 style="color: var(--neon-cyan); font-family: 'Orbitron', sans-serif; margin-bottom: 1rem;">
        📜 Tus Hechizos
      </h3>
      <p style="color: var(--text-primary);">
        Aquí verás todos los hechizos que has adquirido.
        <br><br>Pídele al profesor que los use cuando los necesites.
      </p>
    `,
    attachTo: {
      element: '#student-profile-spells-container',
      on: 'top'
    },
    buttons: [
      {
        text: 'Anterior',
        action: tour.back
      },
      {
        text: 'Finalizar ✅',
        action: tour.complete
      }
    ]
  });
  
  // Al completar o cancelar, marcar como visto
  tour.on('complete', () => {
    localStorage.setItem('hasSeenWalkthrough', 'true');
    console.log('✅ Tutorial completado');
  });
  
  tour.on('cancel', () => {
    localStorage.setItem('hasSeenWalkthrough', 'true');
    console.log('⏭️ Tutorial saltado');
  });
  
  // Iniciar el tour después de un pequeño delay
  setTimeout(() => {
    tour.start();
  }, 1000);
}

// Función para resetear el tutorial (útil para testing)
export function resetWalkthrough() {
  localStorage.removeItem('hasSeenWalkthrough');
  console.log('🔄 Tutorial reseteado');
}