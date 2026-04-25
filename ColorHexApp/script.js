/* ===== COLORHEX — GAME LOGIC ===== */

'use strict';

// ===== STATE =====
const STATE = {
  phase: 1,         // 1, 2, 3
  level: 1,         // 1–32
  score: 0,
  attempts: 0,
  levelStartTime: 0,
  targetHex: '',
  targetHex2: '',   // for phase 2+
  targetHex3: '',   // for phase 3
  blendedHex: '',
  gameActive: false,
  showingColor: false,
  colorBlindMode: false,
  selectedPhaseTab: 1,
  attemptHistory: [],
};

// ===== STORAGE =====
const STORAGE_KEY = 'colorhex_save_v2';

function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeSave(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function getDefaultSave() {
  return {
    score: 0,
    highScore: 0,
    unlockedPhase: 1,
    colorBlindMode: false,
    phases: {
      1: { completed: [], bestTimes: {}, bestAttempts: {} },
      2: { completed: [], bestTimes: {}, bestAttempts: {} },
      3: { completed: [], bestTimes: {}, bestAttempts: {} },
    }
  };
}

let SAVE = loadSave() || getDefaultSave();

function save() { writeSave(SAVE); }

// ===== AUDIO =====
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(freq, type, duration, gainVal, decay) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function soundCorrect() {
  playTone(880, 'sine', 0.4, 0.3, 0.4);
  setTimeout(() => playTone(1100, 'sine', 0.3, 0.25, 0.35), 80);
}
function soundWrong() {
  playTone(200, 'sawtooth', 0.3, 0.3, 0.3);
}
function soundWhoosh() {
  try {
    const ctx = getAudioCtx();
    const bufSize = ctx.sampleRate * 0.35;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.35);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start();
  } catch {}
}
function soundUnlock() {
  [440, 554, 659, 880].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.3, 0.25, 0.3), i * 80));
}

// ===== COLOR UTILS =====
function randomHex() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return rgbToHex(r, g, b);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function blendColors(hexColors) {
  const rgbs = hexColors.map(hexToRgb);
  const avg = {
    r: Math.round(rgbs.reduce((s, c) => s + c.r, 0) / rgbs.length),
    g: Math.round(rgbs.reduce((s, c) => s + c.g, 0) / rgbs.length),
    b: Math.round(rgbs.reduce((s, c) => s + c.b, 0) / rgbs.length),
  };
  return rgbToHex(avg.r, avg.g, avg.b);
}

function generateDistractors(targetHex, count) {
  const { r, g, b } = hexToRgb(targetHex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const distractors = new Set();
  const maxTries = count * 30;
  let tries = 0;

  while (distractors.size < count && tries < maxTries) {
    tries++;
    let nh = h, ns = s, nl = l;
    const strategy = tries % 3;
    if (strategy === 0) {
      // HSL perturbation
      nh = (h + (Math.random() * 50 + 15) * (Math.random() < 0.5 ? 1 : -1) + 360) % 360;
      ns = Math.max(0, Math.min(100, s + (Math.random() * 30 + 10) * (Math.random() < 0.5 ? 1 : -1)));
      nl = Math.max(5, Math.min(95, l + (Math.random() * 25 + 8) * (Math.random() < 0.5 ? 1 : -1)));
    } else if (strategy === 1) {
      // RGB random perturbation
      const dr = (Math.random() * 80 + 20) * (Math.random() < 0.5 ? 1 : -1);
      const dg = (Math.random() * 80 + 20) * (Math.random() < 0.5 ? 1 : -1);
      const db = (Math.random() * 80 + 20) * (Math.random() < 0.5 ? 1 : -1);
      const cand = rgbToHex(r + dr, g + dg, b + db);
      if (cand !== targetHex && !distractors.has(cand)) { distractors.add(cand); continue; }
    } else {
      // Completely random
      const cand = randomHex();
      if (cand !== targetHex && !distractors.has(cand)) { distractors.add(cand); continue; }
    }
    const { r: nr, g: ng, b: nb } = hslToRgb(nh, ns, nl);
    const cand = rgbToHex(nr, ng, nb);
    if (cand !== targetHex && !distractors.has(cand)) distractors.add(cand);
  }

  // Fill remaining with pure random
  while (distractors.size < count) {
    const cand = randomHex();
    if (cand !== targetHex) distractors.add(cand);
  }

  return [...distractors].slice(0, count);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ===== CONFETTI =====
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');
let confettiParticles = [];
let confettiAnim = null;

function spawnConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  const colors = ['#FFE600','#00E87A','#FF6BCC','#0066FF','#FF2D55','#FF9500','#AF52DE'];
  for (let i = 0; i < 80; i++) {
    confettiParticles.push({
      x: Math.random() * confettiCanvas.width,
      y: -10 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 4 + 2,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 8,
      w: Math.random() * 10 + 6,
      h: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      life: 0,
    });
  }
  if (confettiAnim) cancelAnimationFrame(confettiAnim);
  animateConfetti();
}

function animateConfetti() {
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiParticles = confettiParticles.filter(p => p.alpha > 0.05);
  confettiParticles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.07;
    p.rot += p.rotV;
    p.life++;
    if (p.y > confettiCanvas.height * 0.6) p.alpha -= 0.025;
    confettiCtx.save();
    confettiCtx.globalAlpha = p.alpha;
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot * Math.PI / 180);
    confettiCtx.fillStyle = p.color;
    confettiCtx.strokeStyle = '#0a0a0a';
    confettiCtx.lineWidth = 0.8;
    confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    confettiCtx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
    confettiCtx.restore();
  });
  if (confettiParticles.length > 0) {
    confettiAnim = requestAnimationFrame(animateConfetti);
  } else {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

// ===== DOM HELPERS =====
const $ = id => document.getElementById(id);
const screens = ['menu', 'game', 'levels', 'progress'];

function showScreen(name) {
  screens.forEach(s => $(`screen-${s}`).classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

// ===== MENU =====
function renderMenu() {
  const p = SAVE.unlockedPhase;
  $('menu-score').textContent = SAVE.score.toLocaleString();
  $('menu-highscore').textContent = (SAVE.highScore || 0).toLocaleString();

  const badges = ['phase1-badge', 'phase2-badge', 'phase3-badge'];
  badges.forEach((id, i) => {
    const el = $(id);
    const phNum = i + 1;
    el.classList.remove('unlocked', 'active-phase');
    if (phNum <= p) el.classList.add('unlocked');
    if (phNum === STATE.phase) el.classList.add('active-phase');
  });
  showScreen('menu');
}

// ===== LEVEL SELECT =====
function renderLevelSelect(phase) {
  STATE.selectedPhaseTab = phase;
  const container = $('levels-grid');
  container.innerHTML = '';

  // Phase tabs
  [1, 2, 3].forEach(ph => {
    const tab = $(`phase-tab-${ph}`);
    tab.classList.remove('active', 'unlocked', 'locked');
    if (ph <= SAVE.unlockedPhase) {
      tab.classList.add('unlocked');
      tab.removeAttribute('disabled');
    } else {
      tab.classList.add('locked');
      tab.setAttribute('disabled', '');
    }
    if (ph === phase) tab.classList.add('active');
  });

  const phData = SAVE.phases[phase];
  for (let lvl = 1; lvl <= 32; lvl++) {
    const btn = document.createElement('button');
    btn.className = 'level-btn';
    const isUnlocked = phase <= SAVE.unlockedPhase;
    const isDone = phData.completed.includes(lvl);
    const isFirst = lvl === 1;
    const prevDone = phData.completed.includes(lvl - 1);
    const canPlay = isUnlocked && (isFirst || prevDone || isDone);

    if (!isUnlocked) {
      btn.innerHTML = `<span>🔒</span>`;
    } else if (canPlay) {
      btn.classList.add('unlocked');
      if (isDone) btn.classList.add('completed');
      const best = phData.bestTimes[lvl];
      const star = isDone ? '⭐' : '';
      const time = best ? `${(best / 1000).toFixed(1)}s` : '';
      btn.innerHTML = `${star ? `<span class="level-star">${star}</span>` : ''}<span>${lvl}</span>${time ? `<span class="level-time">${time}</span>` : ''}`;
      btn.addEventListener('click', () => startGame(phase, lvl));
      btn.setAttribute('aria-label', `Level ${lvl}${isDone ? ' (completed)' : ''}`);
    } else {
      btn.innerHTML = `<span style="font-size:0.8rem;color:#ccc">${lvl}</span>`;
    }

    container.appendChild(btn);
  }

  showScreen('levels');
}

// ===== PROGRESS SCREEN =====
function renderProgress() {
  [1, 2, 3].forEach(ph => {
    const phData = SAVE.phases[ph];
    const done = phData.completed.length;
    const pct = (done / 32) * 100;
    $(`progress-fill-${ph}`).style.width = pct + '%';

    const times = Object.values(phData.bestTimes);
    const avgTime = times.length ? (times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1) : '—';
    const totalAttempts = Object.values(phData.bestAttempts).reduce((a, b) => a + b, 0);
    const isUnlocked = ph <= SAVE.unlockedPhase;

    $(`progress-stats-${ph}`).innerHTML = `
      <b>${done}/32</b> levels completed${!isUnlocked ? ' <span style="color:#999">(🔒 Locked)</span>' : ''}<br>
      Avg best time: <b>${avgTime}s</b><br>
      Total attempts recorded: <b>${totalAttempts}</b>
    `;
  });
  $('progress-total-score').textContent = SAVE.score.toLocaleString();
  $('progress-high-score').textContent = (SAVE.highScore || 0).toLocaleString();
  showScreen('progress');
}

// ===== GAME CORE =====
let studyTimer = null;
let studyInterval = null;
let studyTimeLeft = 0;

function startGame(phase, level) {
  STATE.phase = phase;
  STATE.level = level;
  STATE.attempts = 0;
  STATE.attemptHistory = [];
  STATE.gameActive = false;
  STATE.showingColor = true;
  STATE.levelStartTime = 0;

  // Generate target color(s)
  STATE.targetHex = randomHex();
  if (phase >= 2) STATE.targetHex2 = randomHex();
  if (phase >= 3) STATE.targetHex3 = randomHex();

  const colorsToBlend = [STATE.targetHex];
  if (phase >= 2) colorsToBlend.push(STATE.targetHex2);
  if (phase >= 3) colorsToBlend.push(STATE.targetHex3);
  STATE.blendedHex = phase === 1 ? STATE.targetHex : blendColors(colorsToBlend);

  // Update UI
  document.querySelector('.swatch-container').classList.remove('collapsed');
  updateGameHeader();
  $('game-level-display').textContent = `Level ${STATE.level} · ${STATE.level * 2} options`;
  renderStudyPhase();
  showScreen('game');
}

function updateGameHeader() {
  const phaseNames = { 1: 'Phase 1', 2: 'Phase 2', 3: 'Phase 3' };
  $('game-phase-label').textContent = phaseNames[STATE.phase];
  $('game-level-label').textContent = `Level ${STATE.level}`;
  renderAttemptDots();
}

function renderAttemptDots() {
  const row = $('attempts-row');
  row.innerHTML = '';
  STATE.attemptHistory.forEach(wasCorrect => {
    const dot = document.createElement('div');
    dot.className = 'attempt-dot ' + (wasCorrect ? 'correct' : 'wrong');
    row.appendChild(dot);
  });
}

function getStudyTime() {
  // Study time scales: level 1–8 = 5s, 9–16 = 4s, 17–24 = 3.5s, 25–32 = 3s
  if (STATE.level <= 8) return 5000;
  if (STATE.level <= 16) return 4000;
  if (STATE.level <= 24) return 3500;
  return 3000;
}

function renderStudyPhase() {
  const circle = $('color-circle');
  const hexDisp = $('hex-display');
  const instructionEl = $('instruction-text');
  const grid = $('color-grid');
  const timerBar = $('timer-bar');

  // Show the circle
  circle.style.backgroundColor = STATE.blendedHex;
  circle.classList.remove('fade-out');

  // Size: 58vmin diameter
  const size = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.58);
  circle.style.width = size + 'px';
  circle.style.height = size + 'px';

  hexDisp.textContent = STATE.blendedHex.toUpperCase();
  hexDisp.classList.remove('hidden');
  grid.innerHTML = '';
  grid.style.display = 'none';
  instructionEl.textContent = 'Memorise this colour…';
  timerBar.style.width = '100%';
  timerBar.classList.remove('urgent');

  // Study timer
  const studyMs = getStudyTime();
  studyTimeLeft = studyMs;
  const tickMs = 50;

  if (studyInterval) clearInterval(studyInterval);
  studyInterval = setInterval(() => {
    studyTimeLeft -= tickMs;
    const pct = Math.max(0, (studyTimeLeft / studyMs) * 100);
    timerBar.style.width = pct + '%';
    if (pct < 30) timerBar.classList.add('urgent');
    if (studyTimeLeft <= 0) {
      clearInterval(studyInterval);
      studyInterval = null;
      beginChoicePhase();
    }
  }, tickMs);
}

function beginChoicePhase() {
  soundWhoosh();
  const circle = $('color-circle');
  const hexDisp = $('hex-display');
  const instructionEl = $('instruction-text');
  const grid = $('color-grid');

  circle.classList.add('fade-out');
  hexDisp.classList.add('hidden');

  setTimeout(() => {
    document.querySelector('.swatch-container').classList.add('collapsed');
    instructionEl.textContent = 'Which colour did you see?';
    grid.style.display = 'grid';
    renderColorGrid();
    STATE.gameActive = true;
    STATE.showingColor = false;
    STATE.levelStartTime = Date.now();
  }, 650);
}

function getGridColumns(optionCount) {
  if (optionCount === 2) return 2;
  if (optionCount === 4) return 2;
  if (optionCount === 6) return 3;
  if (optionCount === 8) return 4;
  if (optionCount === 10) return 5;
  if (optionCount === 12) return 4;
  if (optionCount === 14) return 7;
  if (optionCount === 16) return 4;
  if (optionCount === 18) return 6;
  if (optionCount === 20) return 5;
  if (optionCount === 24) return 6;
  if (optionCount === 28) return 7;
  if (optionCount === 32) return 8;
  if (optionCount === 36) return 6;
  if (optionCount === 40) return 8;
  if (optionCount === 44) return 8;  // close enough
  if (optionCount === 48) return 8;
  if (optionCount === 52) return 8;
  if (optionCount === 56) return 8;
  if (optionCount === 60) return 8;
  if (optionCount === 64) return 8;
  return Math.ceil(Math.sqrt(optionCount));
}

function renderColorGrid() {
  const grid = $('color-grid');
  const optionCount = STATE.level * 2;
  const distractorCount = optionCount - 1;
  const distractors = generateDistractors(STATE.blendedHex, distractorCount);
  const allOptions = shuffle([STATE.blendedHex, ...distractors]);

  const cols = getGridColumns(optionCount);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.innerHTML = '';

  allOptions.forEach(hex => {
    const cell = document.createElement('div');
    cell.className = 'color-option';
    cell.style.backgroundColor = hex;
    cell.setAttribute('data-hex', hex.toUpperCase());
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `Color option ${hex.toUpperCase()}`);

    cell.addEventListener('click', () => handleColorChoice(cell, hex));
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') handleColorChoice(cell, hex);
    });

    grid.appendChild(cell);
  });
}

function handleColorChoice(cell, hex) {
  if (!STATE.gameActive) return;
  STATE.attempts++;

  const isCorrect = hex.toLowerCase() === STATE.blendedHex.toLowerCase();

  // Disable all cells temporarily
  document.querySelectorAll('.color-option').forEach(c => c.classList.add('disabled'));

  if (isCorrect) {
    STATE.gameActive = false;
    STATE.attemptHistory.push(true);
    renderAttemptDots();
    cell.classList.add('correct');
    soundCorrect();
    spawnConfetti();

    const elapsed = Date.now() - STATE.levelStartTime;
    saveLevelResult(STATE.phase, STATE.level, elapsed, STATE.attempts);
    showResult(true, elapsed);
  } else {
    STATE.attemptHistory.push(false);
    renderAttemptDots();
    cell.classList.add('wrong');
    soundWrong();

    // Re-enable after shake
    setTimeout(() => {
      document.querySelectorAll('.color-option').forEach(c => {
        c.classList.remove('disabled', 'wrong');
      });
    }, 380);
  }
}

function saveLevelResult(phase, level, timeMs, attempts) {
  const phData = SAVE.phases[phase];
  if (!phData.completed.includes(level)) {
    phData.completed.push(level);
    // Score: base 1000 pts, time bonus, attempt penalty
    const timeBonus = Math.max(0, 5000 - timeMs);
    const attemptPenalty = (attempts - 1) * 200;
    const pts = Math.max(100, Math.round(1000 + timeBonus / 10 - attemptPenalty));
    SAVE.score += pts;
    if (SAVE.score > (SAVE.highScore || 0)) SAVE.highScore = SAVE.score;
  }

  // Best time
  if (!phData.bestTimes[level] || timeMs < phData.bestTimes[level]) {
    phData.bestTimes[level] = timeMs;
  }
  // Best attempts
  if (!phData.bestAttempts[level] || attempts < phData.bestAttempts[level]) {
    phData.bestAttempts[level] = attempts;
  }

  // Check phase unlock
  if (phData.completed.length === 32 && phase < 3) {
    const nextPhase = phase + 1;
    if (SAVE.unlockedPhase < nextPhase) {
      SAVE.unlockedPhase = nextPhase;
      save();
      return 'unlock_' + nextPhase;
    }
  }
  save();
  return null;
}

function showResult(isCorrect, timeMs) {
  const overlay = $('result-overlay');
  const title = $('result-title');
  const icon = $('result-icon');
  const stats = $('result-stats');
  const swatch = $('result-swatch');

  title.textContent = isCorrect ? 'Correct!' : 'Wrong';
  icon.textContent = isCorrect ? '🎯' : '❌';
  swatch.style.backgroundColor = STATE.blendedHex;

  const phData = SAVE.phases[STATE.phase];
  const best = phData.bestTimes[STATE.level];
  const isBest = best && timeMs <= best;

  stats.innerHTML = `
    HEX: <b>${STATE.blendedHex.toUpperCase()}</b><br>
    Time: <b>${(timeMs / 1000).toFixed(2)}s</b>${isBest ? ' 🏆 Best!' : ''}<br>
    Attempts: <b>${STATE.attempts}</b>
  `;

  $('result-next-btn').textContent = STATE.level < 32 ? `Level ${STATE.level + 1} →` : 'Phase Complete!';

  overlay.classList.add('active');

  // Check for phase unlock
  const phaseData = SAVE.phases[STATE.phase];
  if (phaseData.completed.length === 32 && STATE.phase < 3 && SAVE.unlockedPhase === STATE.phase + 1) {
    setTimeout(() => {
      overlay.classList.remove('active');
      showUnlock(STATE.phase + 1);
    }, 2200);
  }
}

function proceedNext() {
  $('result-overlay').classList.remove('active');
  const phData = SAVE.phases[STATE.phase];

  if (STATE.level < 32) {
    startGame(STATE.phase, STATE.level + 1);
  } else if (STATE.phase < SAVE.unlockedPhase) {
    // Go to next phase level 1
    startGame(STATE.phase + 1, 1);
  } else {
    renderMenu();
  }
}

function showUnlock(newPhase) {
  $('unlock-phase-name').textContent = `Phase ${newPhase} Unlocked!`;
  const names = { 2: 'Two-color blending', 3: 'Three-color blending' };
  $('unlock-phase-desc').textContent = `You've mastered Phase ${newPhase - 1}! Now challenge your eyes with ${names[newPhase]}.`;
  $('unlock-overlay').classList.add('active');
  soundUnlock();
  spawnConfetti();
}

// ===== HOW TO PLAY =====
function showHowToPlay() {
  $('howtoplay-modal').classList.add('active');
}
function hideHowToPlay() {
  $('howtoplay-modal').classList.remove('active');
}

// ===== COLOR BLIND MODE =====
function toggleColorBlind() {
  STATE.colorBlindMode = !STATE.colorBlindMode;
  SAVE.colorBlindMode = STATE.colorBlindMode;
  save();
  document.body.classList.toggle('cb-mode', STATE.colorBlindMode);
  const track = $('cb-track');
  track.classList.toggle('on', STATE.colorBlindMode);
}

// ===== INSTALL PROMPT =====
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = $('install-btn');
  if (btn) btn.style.display = 'flex';
});

function handleInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(() => {
    deferredInstallPrompt = null;
    const btn = $('install-btn');
    if (btn) btn.style.display = 'none';
  });
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
  // Load save
  SAVE = loadSave() || getDefaultSave();
  if (!SAVE.phases) SAVE = getDefaultSave();

  // Apply color blind mode
  if (SAVE.colorBlindMode) {
    STATE.colorBlindMode = true;
    document.body.classList.add('cb-mode');
    const track = $('cb-track');
    if (track) track.classList.add('on');
  }

  // Menu buttons
  $('btn-play').addEventListener('click', () => {
    renderLevelSelect(SAVE.unlockedPhase);
  });
  $('btn-levels').addEventListener('click', () => renderLevelSelect(STATE.selectedPhaseTab || 1));
  $('btn-progress').addEventListener('click', renderProgress);
  $('btn-how').addEventListener('click', showHowToPlay);
  $('install-btn').addEventListener('click', handleInstall);

  // Level select back
  $('levels-back').addEventListener('click', renderMenu);

  // Phase tabs
  [1, 2, 3].forEach(ph => {
    $(`phase-tab-${ph}`).addEventListener('click', () => {
      if (ph <= SAVE.unlockedPhase) renderLevelSelect(ph);
    });
  });

  // Progress back
  $('progress-back').addEventListener('click', renderMenu);

  // Result overlay
  $('result-next-btn').addEventListener('click', proceedNext);
  $('result-menu-btn').addEventListener('click', () => {
    $('result-overlay').classList.remove('active');
    renderMenu();
  });

  // Unlock overlay
  $('unlock-continue-btn').addEventListener('click', () => {
    $('unlock-overlay').classList.remove('active');
    renderMenu();
  });

  // How to play
  $('howtoplay-close').addEventListener('click', hideHowToPlay);
  $('howtoplay-modal').addEventListener('click', e => {
    if (e.target === $('howtoplay-modal')) hideHowToPlay();
  });

  // Color blind toggle
  $('cb-toggle-wrap').addEventListener('click', toggleColorBlind);

  // Game back button
  $('game-back').addEventListener('click', () => {
    if (studyInterval) { clearInterval(studyInterval); studyInterval = null; }
    STATE.gameActive = false;
    renderMenu();
  });

  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Render initial screen
  renderMenu();
});
