/* ==========================================================================
   在线架子鼓 · Drum kit（纯 ES5 / IIFE / 单文件自包含）
   鼓声全部用 WebAudio 实时合成，不加载音频文件。
   三档真实拉开：
     easy   自由演奏 —— 鼓面随时可敲，不计分、不跟拍
     medium 慢谱     —— 84 BPM 跟拍，窗口宽松，32 步
     hard   快谱     —— 120 BPM 跟拍，窗口更紧，48 步
   存档：ysgame-drumkit-state / -best / -diff
   [gyh 2026-11-10 新增] 批次七
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function t(k) { return window.I18N ? window.I18N.t(k) : k; }
  function tf(k, vars) {
    var s = t(k);
    for (var n in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, n)) {
        s = s.split('{' + n + '}').join(String(vars[n]));
      }
    }
    return s;
  }
  function sfx(name) {
    if (window.YSound && window.YSound.play) {
      try { window.YSound.play(name); } catch (e) { /* 音效不可用时静默 */ }
    }
  }
  function soundOn() {
    return !(window.YSGame && typeof window.YSGame.isSoundOn === 'function' && !window.YSGame.isSoundOn());
  }

  var STATE_KEY = 'ysgame-drumkit-state';
  var BEST_KEY = 'ysgame-drumkit-best';
  var DIFF_KEY = 'ysgame-drumkit-diff';

  /* 三档配置：自由 / 慢谱 / 快谱 */
  var DIFF = {
    easy:   { bpm: 0,   steps: 0,  window: 1.3,  free: true  },
    medium: { bpm: 84,  steps: 32, window: 1.28, free: false },
    hard:   { bpm: 120, steps: 48, window: 1.06, free: false }
  };

  /* 节奏谱（每步提示一个鼓面） */
  var PATTERNS = {
    medium: ['kick', 'hihat', 'snare', 'hihat', 'kick', 'tom1', 'snare', 'hihat',
             'kick', 'hihat', 'snare', 'hihat', 'tom2', 'hihat', 'snare', 'crash'],
    hard:   ['kick', 'hihat', 'snare', 'hihat', 'tom1', 'hihat', 'kick', 'snare',
             'kick', 'hihat', 'tom2', 'hihat', 'snare', 'hihat', 'kick', 'crash']
  };

  var VOICES = ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'crash'];

  /* ------------------------------ 音频合成 ------------------------------ */
  var AC = window.AudioContext || window.webkitAudioContext;
  var ac = null, master = null, noiseBuf = null;

  function ensureAudio() {
    if (!AC) return null;
    if (!ac) {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.55;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    return ac;
  }
  function buildNoise() {
    var len = Math.floor(ac.sampleRate * 1.2);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  function noiseSource() {
    if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) buildNoise();
    var s = ac.createBufferSource();
    s.buffer = noiseBuf;
    return s;
  }

  /* 每个鼓一种合成法 */
  function playVoice(name) {
    if (!soundOn()) return;
    if (!ensureAudio()) return;
    var now = ac.currentTime;
    if (name === 'kick') {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(155, now);
      o.frequency.exponentialRampToValueAtTime(48, now + 0.12);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.95, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.connect(g); g.connect(master);
      o.start(now); o.stop(now + 0.2);
    } else if (name === 'snare') {
      var ns = noiseSource(), nf = ac.createBiquadFilter(), ng = ac.createGain();
      nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 0.8;
      ng.gain.setValueAtTime(0.5, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      ns.connect(nf); nf.connect(ng); ng.connect(master);
      ns.start(now); ns.stop(now + 0.2);
      var so = ac.createOscillator(), sg = ac.createGain();
      so.type = 'triangle'; so.frequency.setValueAtTime(190, now);
      sg.gain.setValueAtTime(0.3, now);
      sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      so.connect(sg); sg.connect(master);
      so.start(now); so.stop(now + 0.13);
    } else if (name === 'hihat') {
      var hn = noiseSource(), hf = ac.createBiquadFilter(), hg = ac.createGain();
      hf.type = 'highpass'; hf.frequency.value = 7000;
      hg.gain.setValueAtTime(0.32, now);
      hg.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      hn.connect(hf); hf.connect(hg); hg.connect(master);
      hn.start(now); hn.stop(now + 0.06);
    } else if (name === 'tom1' || name === 'tom2') {
      var base = name === 'tom1' ? 220 : 160;
      var to = ac.createOscillator(), tg = ac.createGain();
      to.type = 'sine';
      to.frequency.setValueAtTime(base, now);
      to.frequency.exponentialRampToValueAtTime(base * 0.7, now + 0.25);
      tg.gain.setValueAtTime(0.0001, now);
      tg.gain.exponentialRampToValueAtTime(0.7, now + 0.006);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      to.connect(tg); tg.connect(master);
      to.start(now); to.stop(now + 0.32);
    } else if (name === 'crash') {
      var cn = noiseSource(), cf = ac.createBiquadFilter(), cg = ac.createGain();
      cf.type = 'highpass'; cf.frequency.value = 5000;
      cg.gain.setValueAtTime(0.4, now);
      cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      cn.connect(cf); cf.connect(cg); cg.connect(master);
      cn.start(now); cn.stop(now + 0.75);
    }
  }
  function playTick() {
    if (!soundOn()) return;
    if (!ensureAudio()) return;
    var now = ac.currentTime;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = 1500;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    o.connect(g); g.connect(master);
    o.start(now); o.stop(now + 0.05);
  }

  /* ------------------------------ 存档 ------------------------------ */
  function readJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.data ? o.data : null;
    } catch (e) { return null; }
  }
  function saveState() {
    if (!state) return;
    var d = { v: 1, data: {
      diff: state.diff, score: state.score, hits: state.hits,
      combo: state.combo, misses: state.misses, step: state.step
    } };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function readBest() {
    var n = 0;
    try { n = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { n = 0; }
    return n;
  }
  function writeBest(n) {
    try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) {}
  }
  function readDiff() {
    var d = 'medium';
    try { d = localStorage.getItem(DIFF_KEY) || 'medium'; } catch (e) {}
    return DIFF[d] ? d : 'medium';
  }

  /* ------------------------------ 运行时状态 ------------------------------ */
  var pads = {};
  var padEls = {};
  var state = null;
  var diff = 'medium';
  var running = false;
  var stepTimer = 0;
  var cueTimer = 0;
  var toastTimer = 0;
  var step = 0;
  var beatMs = 0;
  var activeCue = null;      // { voice, start, consumed }

  function def() { return DIFF[diff] || DIFF.medium; }
  function isFree() { return !!def().free; }

  function paintDiff() {
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function setModeDesc() {
    var el = $('mode-desc');
    if (!el) return;
    if (diff === 'easy') el.textContent = t('mode_free');
    else if (diff === 'medium') el.textContent = t('mode_slow');
    else el.textContent = t('mode_fast');
  }

  function updateHud() {
    $('score').textContent = state ? state.score : 0;
    $('hits').textContent = state ? state.hits : 0;
    $('combo').textContent = state ? state.combo : 0;
    var b = readBest();
    $('best').textContent = b > 0 ? b : '--';
    if (isFree()) {
      $('score').parentNode.style.visibility = 'hidden';
    } else {
      $('score').parentNode.style.visibility = 'visible';
    }
  }

  /* ------------------------------ 鼓面交互 ------------------------------ */
  function flashHit(voice) {
    var el = padEls[voice];
    if (!el) return;
    el.classList.remove('is-hit');
    /* 触发 reflow 让动画可重复 */
    void el.offsetWidth;
    el.classList.add('is-hit');
    el.classList.add('is-down');
    window.setTimeout(function () { el.classList.remove('is-down'); }, 110);
    window.setTimeout(function () { el.classList.remove('is-hit'); }, 460);
  }

  function tapPad(voice) {
    ensureAudio();
    playVoice(voice);
    if (isFree()) {
      if (state) { state.hits++; updateHud(); }
      return;
    }
    // 跟拍模式：判断是否命中当前提示
    var now = (ac ? ac.currentTime : 0) * 1000;
    if (activeCue && activeCue.voice === voice && !activeCue.consumed) {
      var dt = now - activeCue.start;
      var beat = beatMs;
      if (dt >= -beat * 0.4 && dt <= beat * def().window) {
        activeCue.consumed = true;
        if (activeCue.missT) { window.clearTimeout(activeCue.missT); activeCue.missT = 0; }
        state.hits++;
        state.combo++;
        var perfect = Math.abs(dt - beat) < beat * 0.22;
        var gain = 10 + (state.combo - 1) * 2 + (perfect ? 6 : 0);
        state.score += gain;
        flashHit(voice);
        updateHud();
        saveState();
      }
    }
  }

  function bindPads() {
    var nodes = document.querySelectorAll('#pads .dk-pad');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        var voice = node.getAttribute('data-voice');
        padEls[voice] = node;
        pads[voice] = true;
        var handler = function (e) {
          e.preventDefault();
          tapPad(voice);
        };
        node.addEventListener('pointerdown', handler);
      })(nodes[i]);
    }
  }

  /* ------------------------------ 节奏引擎 ------------------------------ */
  function endCue() {
    if (activeCue) {
      if (activeCue.missT) { window.clearTimeout(activeCue.missT); activeCue.missT = 0; }
      var el = padEls[activeCue.voice];
      if (el) el.classList.remove('is-cue');
    }
  }

  function cue(voice) {
    endCue();
    var el = padEls[voice];
    if (!el) return;
    el.style.setProperty('--cue-dur', beatMs + 'ms');
    el.classList.remove('is-cue');
    void el.offsetWidth;
    el.classList.add('is-cue');
    var c = { voice: voice, start: (ac ? ac.currentTime : 0) * 1000, consumed: false, missT: 0 };
    activeCue = c;
    var win = beatMs * def().window;
    c.missT = window.setTimeout(function () {
      if (activeCue === c && !c.consumed) {
        c.consumed = true;
        state.combo = 0;
        state.misses++;
        updateHud();
        saveState();
        el.classList.remove('is-cue');
      }
    }, win);
  }

  function stop() {
    running = false;
    if (stepTimer) { window.clearInterval(stepTimer); stepTimer = 0; }
    endCue();
    activeCue = null;
    var nodes = document.querySelectorAll('#pads .dk-pad');
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.remove('is-cue');
    $('btn-start').textContent = t('btn_play');
    $('btn-start').classList.add('g-btn--primary');
  }

  function finish() {
    stop();
    var acc = state.hits + state.misses > 0
      ? Math.round(state.hits / (state.hits + state.misses) * 100) : 0;
    var best = readBest();
    var isRecord = state.score > best;
    if (isRecord) { writeBest(state.score); }
    $('overlay-title').textContent = t('done_title');
    $('overlay-sub').textContent = t('done_sub');
    $('overlay-hits').textContent = state.hits + ' · ' + t('acc_label') + ' ' + acc + '%';
    $('record-badge').hidden = !isRecord;
    $('beat-readout').textContent = '';
    $('overlay').hidden = false;
    if (isRecord) sfx('record'); else sfx('win');
  }

  function stepOnce() {
    if (!running) return;
    if (step >= def().steps) { finish(); return; }
    var pat = PATTERNS[diff];
    var voice = pat[step % pat.length];
    cue(voice);
    playTick();
    step++;
    state.step = step;
  }

  function start() {
    stop();
    state = {
      diff: diff, score: 0, hits: 0, combo: 0, misses: 0, step: 0
    };
    step = 0;
    updateHud();
    saveState();                       // 开局立即落盘
    $('overlay').hidden = true;

    if (isFree()) {
      running = false;
      $('btn-start').textContent = t('btn_play');
      $('beat-readout').textContent = t('mode_free');
      return;
    }
    beatMs = 60000 / def().bpm;
    running = true;
    $('btn-start').textContent = t('btn_stop');
    $('btn-start').classList.remove('g-btn--primary');
    // 先放一小节预备拍，再开始计步
    stepTimer = window.setInterval(stepOnce, beatMs);
  }

  /* ------------------------------ 页面内提示条 ------------------------------ */
  function showToast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = 0; }
    toastTimer = window.setTimeout(function () { el.hidden = true; }, 2400);
  }

  /* ------------------------------ 难度切换 ------------------------------ */
  /* [gyh 2026-11-10 新增] 切档：先幂等落盘，清场后再显示页面内 toast，绝不用 window.confirm */
  function switchDiff(newDiff) {
    if (!DIFF[newDiff]) return;
    diff = newDiff;
    try { localStorage.setItem(DIFF_KEY, diff); } catch (e) {}   // 同档也幂等落盘
    paintDiff();
    setModeDesc();
    stop();
    start();
    showToast(t('confirm_diff'));
  }

  /* ------------------------------ 启动 ------------------------------ */
  function bindUi() {
    $('btn-start').addEventListener('click', function () {
      if (isFree()) { start(); return; }
      if (running) { stop(); $('beat-readout').textContent = ''; }
      else { start(); }
    });
    $('btn-stop').addEventListener('click', function () {
      if (isFree()) { return; }
      stop();
      $('beat-readout').textContent = '';
    });
    $('btn-restart').addEventListener('click', function () { start(); });
    $('btn-again').addEventListener('click', function () { start(); });

    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          switchDiff(b.getAttribute('data-diff'));
        });
      })(btns[i]);
    }
  }

  function boot() {
    bindPads();
    bindUi();
    diff = readDiff();
    paintDiff();
    setModeDesc();
    state = { diff: diff, score: 0, hits: 0, combo: 0, misses: 0, step: 0 };
    updateHud();
    // 自由演奏档鼓面随时可敲，不自动开始
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
