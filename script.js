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
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

let state = {
  currentWord: null,
  allVocab: [],
  isReview: false,
  reviewQueue: [],
  reviewIndex: 0,
  quizType: null,
  startTime: null,
  correct: 0,
  total: 0,
  timer: null
};

async function init() {
  updateProgress(10);
  await initStreak();
  
  if (localStorage.getItem(STORAGE.completed) === getToday()) {
    showDone();
    return;
  }

  try {
    const res = await fetch('vocabulary.json');
    if (!res.ok) throw new Error('JSON no encontrado');
    state.allVocab = await res.json();
    updateProgress(30);
    
    const due = getDueReviews();
    if (due.length > 0) {
      showReviewOption(due);
    } else {
      await loadNewWord();
    }
  } catch (e) {
    console.error(e);
    document.getElementById('loading').textContent = '️ Error cargando palabras. Recarga.';
  }
  updateProgress(100);
}

async function initStreak() {
  const today = getToday();
  const last = localStorage.getItem(STORAGE.lastDate);
  let streak = parseInt(localStorage.getItem(STORAGE.streak) || 0);
  
  if (last && last !== today) {
    const yesterday = getDateOffset(-1);
    streak = last === yesterday ? streak + 1 : 1;
  } else if (!last) {
    streak = 1;
  }
  
  localStorage.setItem(STORAGE.streak, streak);
  localStorage.setItem(STORAGE.lastDate, today);
  document.getElementById('streak').textContent = ` ${streak}`;
}

async function loadNewWord() {
  const first = localStorage.getItem(STORAGE.firstVisit) || getToday();
  localStorage.setItem(STORAGE.firstVisit, first);
  
  const dayIndex = Math.floor((new Date(getToday()) - new Date(first)) / 86400000);
  state.currentWord = state.allVocab[dayIndex % state.allVocab.length];
  state.isReview = false;
  state.startTime = Date.now();
  
  renderWord(state.currentWord);
  hide('review-section');
  show('content');
  hide('loading');
  show('study-section');
  hide('quiz');
  hide('done');
  updateProgress(50);
}

function renderWord(word) {
  document.getElementById('word').textContent = word.word;
  document.getElementById('phonetic').textContent = word.phonetic;
  document.getElementById('pos').textContent = word.pos;
  document.getElementById('definition').textContent = word.definition;
  document.getElementById('translation').textContent = `🇪🇸 ${word.translation}`;
  document.getElementById('examples').innerHTML = word.examples.map(e => `<li>"${e}"</li>`).join('');
  
  const mnSec = document.getElementById('mnemonic-section');
  if (word.mnemonic) {
    document.getElementById('mnemonic').textContent = word.mnemonic;
    show('mnemonic-section');
  } else {
    hide('mnemonic-section');
  }
  
  document.getElementById('listen-btn').onclick = () => playAudio(word);
  document.getElementById('study-btn').onclick = () => startQuiz();
  document.getElementById('skip-review-btn').onclick = () => skipReview();
  updateProgress(70);
}

function showReviewOption(reviews) {
  show('review-section');
  document.getElementById('review-count').textContent = reviews.length;
  document.getElementById('start-review-btn').onclick = () => startReviewMode(reviews);
}

function startReviewMode(reviews) {
  state.reviewQueue = reviews;
  state.reviewIndex = 0;
  state.isReview = true;
  hide('review-section');
  loadReviewWord();
}

function loadReviewWord() {
  const review = state.reviewQueue[state.reviewIndex];
  const word = state.allVocab.find(w => w.id === review.wordId);
  if (!word) return finishReview();
  
  state.currentWord = word;
  state.startTime = Date.now();
  renderWord(word);
  show('study-section');
  show('skip-review-btn');
  document.getElementById('study-btn').textContent = `✅ Repasar (${review.interval} días)`;
}

function skipReview() {
  const review = state.reviewQueue[state.reviewIndex];
  review.nextReview = Date.now() + (24 * 60 * 60 * 1000);
  saveReviews(state.reviewQueue);
  nextReview();
}

function scheduleReview(wordId, correct = true) {
  const reviews = JSON.parse(localStorage.getItem(STORAGE.reviews) || '[]');
  const idx = reviews.findIndex(r => r.wordId === wordId);
  const existing = reviews[idx];
  const interval = correct ? 
    (existing ? REVIEW_INTERVALS[Math.min(existing.interval + 1, REVIEW_INTERVALS.length - 1)] : 1) : 1;
  
  const data = { wordId, nextReview: Date.now() + (interval * 86400000), interval, lastReviewed: Date.now() };
  if (idx >= 0) reviews[idx] = data; else reviews.push(data);
  
  localStorage.setItem(STORAGE.reviews, JSON.stringify(reviews));
}

function getDueReviews() {
  return JSON.parse(localStorage.getItem(STORAGE.reviews) || '[]').filter(r => r.nextReview <= Date.now());
}

function saveReviews(reviews) {
  localStorage.setItem(STORAGE.reviews, JSON.stringify(reviews));
}

function nextReview() {
  state.reviewIndex++;
  if (state.reviewIndex < state.reviewQueue.length) loadReviewWord();
  else finishReview();
}

function finishReview() { showDone(); }

function startQuiz() {
  hide('study-section');
  show('quiz');
  state.quizType = QUIZ_TYPES[Math.floor(Math.random() * QUIZ_TYPES.length)];
  state.total = 1;
  state.currentQ = 0;
  generateQuiz();
}

function generateQuiz() {
  const word = state.currentWord;
  switch(state.quizType) {
    case 'translation':
      document.getElementById('quiz-question').textContent = `¿Qué significa "${word.word}" en español?`;
      renderOptions(generateOptions(word, 'translation'), word.translation);
      break;
    case 'fillBlank':
      const ex = word.examples[0].replace(new RegExp(word.word, 'gi'), '_____');
      document.getElementById('quiz-question').innerHTML = `Completa:<br><em>"${ex}"</em>`;
      renderOptions(generateOptions(word, 'word'), word.word);
      break;
    case 'listen':
      document.getElementById('quiz-question').textContent = 'Escucha y selecciona la palabra';
      setTimeout(() => playAudio(word), 500);
      renderOptions(generateOptions(word, 'word'), word.word);
      break;
  }
  startTimer(15);
}

function generateOptions(correct, field) {
  const others = state.allVocab.filter(w => w.id !== correct.id).sort(() => Math.random() - 0.5).slice(0, 3).map(w => w[field]);
  return [...others, correct[field]].sort(() => Math.random() - 0.5);
}

function renderOptions(opts, correctText) {
  const container = document.getElementById('quiz-options');
  container.innerHTML = '';
  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.textContent = opt;
    btn.onclick = () => handleAnswer(btn, opt === correctText);
    container.appendChild(btn);
  });
  document.getElementById('current-q').textContent = '1';
  document.getElementById('total-q').textContent = '1';
}

function handleAnswer(btn, isCorrect) {
  clearInterval(state.timer);
  document.querySelectorAll('.option').forEach(o => o.disabled = true);
  
  if (isCorrect) {
    btn.classList.add('correct');
    state.correct++;
    scheduleReview(state.currentWord.id, true);
    saveToHistory(state.currentWord);
    setTimeout(() => state.isReview ? nextReview() : completeDay(), 1000);
  } else {
    btn.classList.add('wrong');
    const correctBtn = Array.from(document.querySelectorAll('.option')).find(o => o.textContent === (state.quizType === 'fillBlank' || state.quizType === 'listen' ? state.currentWord.word : state.currentWord.translation));
    if (correctBtn) correctBtn.classList.add('correct');
    scheduleReview(state.currentWord.id, false);
    setTimeout(() => document.querySelectorAll('.option').forEach(o => { o.disabled = false; o.classList.remove('wrong','correct'); }), 2000);
  }
  state.total++;
}

function startTimer(sec) {
  let rem = sec;
  const el = document.getElementById('quiz-timer');
  state.timer = setInterval(() => {
    rem--;
    el.textContent = `⏱️ ${rem}s`;
    if (rem <= 0) {
      clearInterval(state.timer);
      document.querySelectorAll('.option').forEach(o => o.disabled = true);
      const correctText = state.quizType === 'fillBlank' || state.quizType === 'listen' ? state.currentWord.word : state.currentWord.translation;
      const cb = Array.from(document.querySelectorAll('.option')).find(o => o.textContent === correctText);
      if (cb) cb.classList.add('correct');
      scheduleReview(state.currentWord.id, false);
      setTimeout(() => state.isReview ? nextReview() : completeDay(), 2000);
    }
  }, 1000);
}

function playAudio(word) {
  const btn = document.getElementById('listen-btn');
  const orig = btn.textContent;
  btn.textContent = '🔊...';
  const u = new SpeechSynthesisUtterance(word.word);
  u.lang = 'en-US';
  u.rate = 0.85;
  u.onend = () => btn.textContent = orig;
  u.onerror = () => { btn.textContent = '❌'; setTimeout(() => btn.textContent = orig, 1000); };
  speechSynthesis.speak(u);
}

function completeDay() {
  localStorage.setItem(STORAGE.completed, getToday());
  saveStats();
  showDone();
}

function showDone() {
  hide('study-section'); hide('quiz'); hide('review-section'); show('done');
  const time = Math.floor((Date.now() - state.startTime) / 1000);
  document.getElementById('time-spent').textContent = `${time}s`;
  document.getElementById('accuracy').textContent = `${Math.round((state.correct / state.total) * 100)}%`;
  document.getElementById('streak-display').textContent = ` ${localStorage.getItem(STORAGE.streak)}`;
  launchConfetti();
  document.getElementById('view-history-btn').onclick = toggleHistory;
}

function saveStats() {
  const s = JSON.parse(localStorage.getItem(STORAGE.stats) || '{"total": 0, "time": 0}');
  s.total++; s.time += Math.floor((Date.now() - state.startTime) / 1000);
  localStorage.setItem(STORAGE.stats, JSON.stringify(s));
}

function saveToHistory(word) {
  const h = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
  if (!h.find(w => w.id === word.id && w.date === getToday())) {
    h.unshift({ ...word, date: getToday(), learnedAt: new Date().toISOString() });
    localStorage.setItem(STORAGE.history, JSON.stringify(h));
  }
}

function toggleHistory() {
  const p = document.getElementById('history-panel');
  p.classList.contains('hidden') ? (renderHistory(), show('history-panel')) : hide('history-panel');
}

function renderHistory() {
  const h = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
  const c = document.getElementById('history-list');
  if (!h.length) { c.innerHTML = '<p class="empty-state">Aún no has aprendido palabras</p>'; return; }
  c.innerHTML = h.map(w => `<div class="history-item"><div class="history-word"><strong>${w.word}</strong><span class="history-translation">${w.translation}</span></div><div class="history-date">${formatDate(w.date)}</div></div>`).join('');
}

function exportCSV() {
  const h = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
  const csv = [['Palabra', 'Traducción', 'Tema', 'Fecha'], ...h.map(w => [w.word, w.translation, w.topic, w.date])].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `dailyword-${getToday()}.csv`; a.click();
}

function getToday() { return new Date().toISOString().split('T')[0]; }
function getDateOffset(d) { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().split('T')[0]; }
function formatDate(ds) { return new Date(ds).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function updateProgress(p) { document.getElementById('progress-bar').style.setProperty('--progress', `${p}%`); }

function launchConfetti() {
  if (typeof confetti === 'undefined') return;
  const end = Date.now() + 2500;
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#0d6efd', '#198754', '#ffc107'] });
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#0d6efd', '#198754', '#ffc107'] });
    if (Date.now() < end) requestAnimationFrame(frame);
  }());
}

document.getElementById('history-btn').onclick = toggleHistory;
document.getElementById('close-history').onclick = () => hide('history-panel');
document.getElementById('export-btn').onclick = exportCSV;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('DOMContentLoaded', init);
