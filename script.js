// ============================================
// CONFIGURACIÓN Y CONSTANTES
// ============================================
const STORAGE = {
  firstVisit: 'dw_first',
  streak: 'dw_streak',
  lastDate: 'dw_lastDate',
  completed: 'dw_completed',
  reviews: 'dw_reviews',
  history: 'dw_history',
  stats: 'dw_stats'
};

const QUIZ_TYPES = ['translation', 'fillBlank', 'listen'];
const REVIEW_INTERVALS = [1, 3, 7, 14, 30]; // días

let currentState = {
  currentWord: null,
  allVocab: [],
  isReview: false,
  reviewQueue: [],
  currentReviewIndex: 0,
  quizType: null,
  startTime: null,
  correctAnswers: 0,
  totalQuestions: 0,
  timer: null
};

// ============================================
// INICIALIZACIÓN
// ============================================
async function init() {
  updateProgressBar(10);
  await initStreak();
  
  // Verificar si ya completó hoy
  if (localStorage.getItem(STORAGE.completed) === getToday()) {
    showDone();
    return;
  }
  
  // Cargar vocabulario
  try {
    const res = await fetch('vocabulary.json');
    if (!res.ok) throw new Error('JSON no encontrado');
    currentState.allVocab = await res.json();
    updateProgressBar(30);
    
    // Verificar repasos pendientes
    const dueReviews = getDueReviews();
    if (dueReviews.length > 0) {
      showReviewOption(dueReviews);
    } else {
      await loadNewWord();
    }
  } catch (e) {
    console.error(e);
    showError('⚠️ Error cargando palabras. Recarga la página.');
  }
  
  updateProgressBar(100);
}

async function initStreak() {
  const today = getToday();
  const lastDate = localStorage.getItem(STORAGE.lastDate);
  let streak = parseInt(localStorage.getItem(STORAGE.streak) || 0);
  
  if (lastDate && lastDate !== today) {
    const yesterday = getDateOffset(-1);
    streak = lastDate === yesterday ? streak + 1 : 1;
    localStorage.setItem(STORAGE.streak, streak);
  } else if (!lastDate) {
    localStorage.setItem(STORAGE.streak, 1);
  }
  
  localStorage.setItem(STORAGE.lastDate, today);
  document.getElementById('streak').textContent = `🔥 ${localStorage.getItem(STORAGE.streak)}`;
}

// ============================================
// GESTIÓN DE PALABRAS
// ============================================
async function loadNewWord() {
  const first = localStorage.getItem(STORAGE.firstVisit) || getToday();
  localStorage.setItem(STORAGE.firstVisit, first);
  
  const dayIndex = Math.floor((new Date(getToday()) - new Date(first)) / 86400000);
  const current = currentState.allVocab[dayIndex % currentState.allVocab.length];
  
  currentState.currentWord = current;
  currentState.isReview = false;
  currentState.startTime = Date.now();
  
  renderWord(current);
  hideElement('review-section');
  showElement('content');
  hideElement('loading');
  showElement('study-section');
  hideElement('quiz');
  hideElement('done');
  
  updateProgressBar(50);
}

function renderWord(word) {
  document.getElementById('word').textContent = word.word;
  document.getElementById('phonetic').textContent = word.phonetic;
  document.getElementById('pos').textContent = word.pos;
  document.getElementById('definition').textContent = word.definition;
  document.getElementById('translation').textContent = `🇪🇸 ${word.translation}`;
  
  const examplesList = document.getElementById('examples');
  examplesList.innerHTML = word.examples.map(e => `<li>"${e}"</li>`).join('');
  
  // Mnemotecnia si existe
  const mnemonicSection = document.getElementById('mnemonic-section');
  if (word.mnemonic) {
    document.getElementById('mnemonic').textContent = word.mnemonic;
    showElement('mnemonic-section');
  } else {
    hideElement('mnemonic-section');
  }
  
  // Configurar botón de audio
  const listenBtn = document.getElementById('listen-btn');
  listenBtn.onclick = () => playAudio(word);
  
  // Botón de estudiar
  document.getElementById('study-btn').onclick = () => startQuiz();
  document.getElementById('skip-review-btn').onclick = () => skipReview();
  
  updateProgressBar(70);
}

// ============================================
// SISTEMA DE REPASO ESPACIADO
// ============================================
function showReviewOption(reviews) {
  showElement('review-section');
  document.getElementById('review-count').textContent = reviews.length;
  document.getElementById('start-review-btn').onclick = () => startReviewMode(reviews);
}

function startReviewMode(reviews) {
  currentState.reviewQueue = reviews;
  currentState.currentReviewIndex = 0;
  currentState.isReview = true;
  hideElement('review-section');
  loadReviewWord();
}

function loadReviewWord() {
  const review = currentState.reviewQueue[currentState.currentReviewIndex];
  const word = currentState.allVocab.find(w => w.id === review.wordId);
  
  if (!word) {
    finishReview();
    return;
  }
  
  currentState.currentWord = word;
  currentState.startTime = Date.now();
  
  renderWord(word);
  showElement('study-section');
  showElement('skip-review-btn');
  document.getElementById('study-btn').textContent = `✅ Repasar (${review.interval} días)`;
}

function skipReview() {
  // Posponer para mañana
  const review = currentState.reviewQueue[currentState.currentReviewIndex];
  review.nextReview = Date.now() + (24 * 60 * 60 * 1000);
  saveReviews(currentState.reviewQueue);
  
  nextReview();
}

function scheduleReview(wordId, correct = true) {
  const reviews = JSON.parse(localStorage.getItem(STORAGE.reviews) || '[]');
  const existingIndex = reviews.findIndex(r => r.wordId === wordId);
  
  const existing = reviews[existingIndex];
  const interval = correct ? 
    (existing ? REVIEW_INTERVALS[Math.min(existing.interval + 1, REVIEW_INTERVALS.length - 1)] : 1) :
    1;
  
  const reviewData = {
    wordId,
    nextReview: Date.now() + (interval * 24 * 60 * 60 * 1000),
    interval,
    lastReviewed: Date.now()
  };
  
  if (existingIndex >= 0) {
    reviews[existingIndex] = reviewData;
  } else {
    reviews.push(reviewData);
  }
  
  localStorage.setItem(STORAGE.reviews, JSON.stringify(reviews));
}

function getDueReviews() {
  const reviews = JSON.parse(localStorage.getItem(STORAGE.reviews) || '[]');
  const now = Date.now();
  return reviews.filter(r => r.nextReview <= now);
}

function saveReviews(reviews) {
  localStorage.setItem(STORAGE.reviews, JSON.stringify(reviews));
}

function nextReview() {
  currentState.currentReviewIndex++;
  if (currentState.currentReviewIndex < currentState.reviewQueue.length) {
    loadReviewWord();
  } else {
    finishReview();
  }
}

function finishReview() {
  showDone();
}

// ============================================
// QUIZ SYSTEM
// ============================================
function startQuiz() {
  hideElement('study-section');
  showElement('quiz');
  
  currentState.quizType = QUIZ_TYPES[Math.floor(Math.random() * QUIZ_TYPES.length)];
  currentState.totalQuestions = 1;
  currentState.currentQuestion = 0;
  
  generateQuiz();
}

function generateQuiz() {
  const word = currentState.currentWord;
  
  switch(currentState.quizType) {
    case 'translation':
      generateTranslationQuiz(word);
      break;
    case 'fillBlank':
      generateFillBlankQuiz(word);
      break;
    case 'listen':
      generateListenQuiz(word);
      break;
  }
  
  startQuizTimer(15);
}

function generateTranslationQuiz(word) {
  document.getElementById('quiz-question').textContent = 
    `¿Qué significa "${word.word}" en español?`;
  
  const options = generateOptions(word, 'translation');
  renderQuizOptions(options, word.translation);
}

function generateFillBlankQuiz(word) {
  const example = word.examples[0];
  const regex = new RegExp(word.word, 'gi');
  const blanked = example.replace(regex, '_____');
  
  document.getElementById('quiz-question').innerHTML = 
    `Completa la oración:<br><em>"${blanked}"</em>`;
  
  const options = generateOptions(word, 'word');
  renderQuizOptions(options, word.word);
}

function generateListenQuiz(word) {
  document.getElementById('quiz-question').textContent = 
    'Escucha y selecciona la palabra correcta';
  
  // Reproducir audio automáticamente
  setTimeout(() => playAudio(word), 500);
  
  const options = generateOptions(word, 'word');
  renderQuizOptions(options, word.word);
}

function generateOptions(correctWord, field) {
  const correct = correctWord[field];
  const others = currentState.allVocab
    .filter(w => w.id !== correctWord.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(w => w[field]);
  
  return [...others, correct].sort(() => Math.random() - 0.5);
}

function renderQuizOptions(options, correct) {
  const container = document.getElementById('quiz-options');
  container.innerHTML = '';
  
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.textContent = opt;
    btn.onclick = () => handleAnswer(btn, opt === correct);
    container.appendChild(btn);
  });
  
  document.getElementById('current-q').textContent = '1';
  document.getElementById('total-q').textContent = '1';
}

function handleAnswer(btn, isCorrect) {
  clearInterval(currentState.timer);
  
  const options = document.querySelectorAll('.option');
  options.forEach(o => o.disabled = true);
  
  if (isCorrect) {
    btn.classList.add('correct');
    currentState.correctAnswers++;
    
    // Programar repaso
    scheduleReview(currentState.currentWord.id, true);
    
    // Guardar en historial
    saveToHistory(currentState.currentWord);
    
    setTimeout(() => {
      if (currentState.isReview) {
        nextReview();
      } else {
        completeDay();
      }
    }, 1000);
  } else {
    btn.classList.add('wrong');
    const correctBtn = Array.from(options).find(o => 
      o.textContent === (currentState.quizType === 'fillBlank' || currentState.quizType === 'listen' 
        ? currentState.currentWord.word 
        : currentState.currentWord.translation)
    );
    if (correctBtn) correctBtn.classList.add('correct');
    
    scheduleReview(currentState.currentWord.id, false);
    
    setTimeout(() => {
      options.forEach(o => { 
        o.disabled = false; 
        o.classList.remove('wrong', 'correct'); 
      });
    }, 2000);
  }
  
  currentState.totalQuestions++;
}

function startQuizTimer(seconds) {
  let remaining = seconds;
  const timerEl = document.getElementById('quiz-timer');
  
  currentState.timer = setInterval(() => {
    remaining--;
    timerEl.textContent = `⏱️ ${remaining}s`;
    
    if (remaining <= 0) {
      clearInterval(currentState.timer);
      handleTimeOut();
    }
  }, 1000);
}

function handleTimeOut() {
  const options = document.querySelectorAll('.option');
  options.forEach(o => o.disabled = true);
  
  const correctText = currentState.quizType === 'fillBlank' || currentState.quizType === 'listen'
    ? currentState.currentWord.word
    : currentState.currentWord.translation;
  
  const correctBtn = Array.from(options).find(o => o.textContent === correctText);
  if (correctBtn) correctBtn.classList.add('correct');
  
  scheduleReview(currentState.currentWord.id, false);
  
  setTimeout(() => {
    if (currentState.isReview) {
      nextReview();
    } else {
      completeDay();
    }
  }, 2000);
}

// ============================================
// AUDIO
// ============================================
function playAudio(word) {
  const btn = document.getElementById('listen-btn');
  const originalText = btn.textContent;
  btn.textContent = '🔊...';
  
  const u = new SpeechSynthesisUtterance(word.word);
  u.lang = 'en-US';
  u.rate = 0.85;
  
  u.onend = () => {
    btn.textContent = originalText;
  };
  
  u.onerror = () => {
    btn.textContent = '❌';
    setTimeout(() => btn.textContent = originalText, 1000);
  };
  
  speechSynthesis.speak(u);
}

// ============================================
// COMPLETAR DÍA
// ============================================
function completeDay() {
  localStorage.setItem(STORAGE.completed, getToday());
  
  // Guardar estadísticas
  saveStats();
  
  showDone();
}

function showDone() {
  hideElement('study-section');
  hideElement('quiz');
  hideElement('review-section');
  showElement('done');
  
  // Calcular tiempo
  const timeSpent = Math.floor((Date.now() - currentState.startTime) / 1000);
  document.getElementById('time-spent').textContent = `${timeSpent}s`;
  
  // Calcular precisión
  const accuracy = currentState.totalQuestions > 0 
    ? Math.round((currentState.correctAnswers / currentState.totalQuestions) * 100)
    : 100;
  document.getElementById('accuracy').textContent = `${accuracy}%`;
  
  // Mostrar racha
  const streak = localStorage.getItem(STORAGE.streak);
  document.getElementById('streak-display').textContent = `🔥 ${streak}`;
  
  // Celebración
  launchConfetti();
  
  // Botón de historial
  document.getElementById('view-history-btn').onclick = toggleHistory;
}

function saveStats() {
  const stats = JSON.parse(localStorage.getItem(STORAGE.stats) || '{"totalWords": 0, "totalTime": 0}');
  stats.totalWords++;
  stats.totalTime += Math.floor((Date.now() - currentState.startTime) / 1000);
  localStorage.setItem(STORAGE.stats, JSON.stringify(stats));
}

// ============================================
// HISTORIAL
// ============================================
function saveToHistory(word) {
  const history = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
  if (!history.find(w => w.id === word.id && w.date === getToday())) {
    history.unshift({ ...word, date: getToday(), learnedAt: new Date().toISOString() });
    localStorage.setItem(STORAGE.history, JSON.stringify(history));
  }
}

function toggleHistory() {
  const panel = document.getElementById('history-panel');
  if (panel.classList.contains('hidden')) {
    renderHistory();
    showElement('history-panel');
  } else {
    hideElement('history-panel');
  }
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
  const container = document.getElementById('history-list');
  
  if (history.length === 0) {
    container.innerHTML = '<p class="empty-state">Aún no has aprendido palabras</p>';
    return;
  }
  
  container.innerHTML = history.map(word => `
    <div class="history-item">
      <div class="history-word">
        <strong>${word.word}</strong>
        <span class="history-translation">${word.translation}</span>
      </div>
      <div class="history-date">${formatDate(word.date)}</div>
    </div>
  `).join('');
}

function exportToCSV() {
  const history = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
  const csv = [
    ['Palabra', 'Traducción', 'Categoría', 'Fecha'],
    ...history.map(w => [w.word, w.translation, w.pos, w.date])
  ].map(row => row.join(',')).join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dailyword-export-${getToday()}.csv`;
  a.click();
}

// ============================================
// UTILIDADES
// ============================================
function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function showElement(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideElement(id) {
  document.getElementById(id).classList.add('hidden');
}

function updateProgressBar(percent) {
  document.getElementById('progress-bar').style.setProperty('--progress', `${percent}%`);
}

function showError(message) {
  document.getElementById('loading').textContent = message;
}

function launchConfetti() {
  const duration = 3000;
  const end = Date.now() + duration;
  
  (function frame() {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#0d6efd', '#198754', '#ffc107']
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#0d6efd', '#198754', '#ffc107']
    });
    
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
}

// ============================================
// EVENT LISTENERS
// ============================================
document.getElementById('history-btn').onclick = toggleHistory;
document.getElementById('close-history').onclick = () => hideElement('history-panel');
document.getElementById('export-btn').onclick = exportToCSV;

// Service Worker para PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    console.log('SW no registrado');
  });
}

// Iniciar app
document.addEventListener('DOMContentLoaded', init);
