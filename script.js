const STORAGE = {
  firstVisit: 'dw_first',
  streak: 'dw_streak',
  lastDate: 'dw_lastDate',
  completed: 'dw_completed'
};

const today = new Date().toISOString().split('T')[0];

async function init() {
  // 1. Inicializar streak
  const lastDate = localStorage.getItem(STORAGE.lastDate);
  let streak = parseInt(localStorage.getItem(STORAGE.streak) || 0);
  
  if (lastDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    streak = lastDate === yesterday ? streak + 1 : 1;
    localStorage.setItem(STORAGE.streak, streak);
    localStorage.setItem(STORAGE.lastDate, today);
  }
  document.getElementById('streak').textContent = `🔥 ${streak}`;

  // 2. Verificar si ya se completó hoy
  if (localStorage.getItem(STORAGE.completed) === today) {
    showDone();
    return;
  }

  // 3. Cargar vocabulario
  try {
    const res = await fetch('vocabulary.json');
    if (!res.ok) throw new Error('JSON no encontrado');
    const vocab = await res.json();
    renderDay(vocab);
  } catch (e) {
    console.error(e);
    document.getElementById('loading').textContent = '⚠️ Error cargando palabras.';
  }
}

function renderDay(vocab) {
  const first = localStorage.getItem(STORAGE.firstVisit) || today;
  localStorage.setItem(STORAGE.firstVisit, first);
  
  const dayIndex = Math.floor((new Date(today) - new Date(first)) / 86400000) % vocab.length;
  const current = vocab[dayIndex];

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('content').classList.remove('hidden');

  document.getElementById('word').textContent = current.word;
  document.getElementById('phonetic').textContent = current.phonetic;
  document.getElementById('pos').textContent = current.pos;
  document.getElementById('definition').textContent = current.definition;
  document.getElementById('examples').innerHTML = current.examples.map(e => `<li>"${e}"</li>`).join('');

  // Audio
  const listenBtn = document.getElementById('listen-btn');
  if (listenBtn) {
    listenBtn.onclick = () => {
      const u = new SpeechSynthesisUtterance(current.word + ". " + current.examples[0]);
      u.lang = 'en-US';
      u.rate = 0.9;
      speechSynthesis.speak(u);
    };
  }

  // Botón de estudio - ASIGNAR EVENTO
  const studyBtn = document.getElementById('study-btn');
  if (studyBtn) {
    studyBtn.onclick = () => {
      document.getElementById('study-section').classList.add('hidden');
      generateQuiz(current, vocab);
    };
  } else {
    console.error('No se encontró study-btn');
  }
}

function generateQuiz(current, vocab) {
  const quiz = document.getElementById('quiz');
  quiz.classList.remove('hidden');
  document.getElementById('quiz-question').textContent = `¿Qué significa "${current.word}"?`;

  // Crear opciones: 1 correcta + 3 distractores
  const distractors = vocab.filter(v => v.id !== current.id)
                           .sort(() => Math.random() - 0.5)
                           .slice(0, 3)
                           .map(v => v.definition);
  const options = [current.definition, ...distractors].sort(() => Math.random() - 0.5);

  const container = document.getElementById('quiz-options');
  container.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.textContent = opt;
    btn.onclick = () => handleAnswer(btn, opt === current.definition, current);
    container.appendChild(btn);
  });
}

function handleAnswer(btn, isCorrect, current) {
  const options = document.querySelectorAll('.option');
  options.forEach(o => o.disabled = true);

  if (isCorrect) {
    btn.classList.add('correct');
    localStorage.setItem(STORAGE.completed, today);
    setTimeout(showDone, 800);
  } else {
    btn.classList.add('wrong');
    const correctBtn = Array.from(options).find(o => o.textContent === current.definition);
    if (correctBtn) correctBtn.classList.add('correct');
    setTimeout(() => {
      options.forEach(o => { 
        o.disabled = false; 
        o.classList.remove('wrong','correct'); 
      });
    }, 1500);
  }
}

function showDone() {
  document.getElementById('study-section')?.classList.add('hidden');
  document.getElementById('quiz')?.classList.add('hidden');
  document.getElementById('done').classList.remove('hidden');
}

// Iniciar app
init();
