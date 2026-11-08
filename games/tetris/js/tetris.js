/* ==========================================================================
   俄罗斯方块 · 游戏逻辑
   纯 ES5 + IIFE，和站内其它游戏保持一致（无框架、无打包、无依赖）。

   玩法：10×20 棋盘，7-bag 随机出块，顺时针旋转 + 简易墙踢，
        软降 / 硬降 / 落点预览，消行按 1/2/3/4 行给分，连续消行有连击加成。
   难度：三档初速与每级加速不同；消行数决定等级，等级越高落得越快。
   存档：断点续玩（棋盘 + 当前块 + 队列 + 分数），最高分按档隔离。
   音效：统一走 js/sound.js 的 YSound，主题由 body[data-dict="gtetris"] 自动识别。

   [gyh 2026-11-08 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var COLS = 10;
  var ROWS = 20;
  var CELL = 24;
  var W = COLS * CELL;
  var H = ROWS * CELL;

  var STATE_KEY = 'ysgame-tetris-state';
  var BEST_KEY = 'ysgame-tetris-best';
  var DIFF_KEY = 'ysgame-tetris-diff';

  var DIFFS = {
    easy:   { startMs: 820, minMs: 300, linesPerLevel: 12, stepDown: 42 },
    medium: { startMs: 620, minMs: 200, linesPerLevel: 10, stepDown: 48 },
    hard:   { startMs: 430, minMs: 120, linesPerLevel: 8,  stepDown: 38 }
  };

  /* 每种方块都放在方阵里，旋转就是转矩阵，O 是 2×2、I 是 4×4 */
  var SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
  };

  /* 站内统一的低饱和配色，别用街机那种刺眼荧光 */
  var COLORS = {
    I: '#7FA8A0', J: '#8E9CC6', L: '#C9A88A', O: '#D4BE83',
    S: '#A8BD93', T: '#B49AC0', Z: '#C79A9A'
  };

  var LINE_SCORE = [0, 100, 300, 500, 800];

  /* ---------------- DOM ---------------- */

  var $ = function (id) { return document.getElementById(id); };
  var boardCv = $('board');
  var nextCv = $('next');
  var boardCtx = null;
  var nextCtx = null;
  var veil = $('veil');
  var veilText = $('veilText');
  var overlay = $('overlay');
  var recordBadge = $('recordBadge');
  var btnStart = $('btn-start');
  var btnPause = $('btn-pause');

  /* ---------------- 状态 ---------------- */

  function emptyBoard() {
    var b = [];
    for (var r = 0; r < ROWS; r++) {
      b.push([]);
      for (var c = 0; c < COLS; c++) b[r].push(null);
    }
    return b;
  }

  var state = {
    diff: 'medium',
    board: emptyBoard(),
    cur: null,          // { type, m, x, y }
    queue: [],
    score: 0,
    lines: 0,
    level: 1,
    combo: -1,
    over: false,
    paused: true,
    started: false,
    recordShown: false,
    best: { easy: 0, medium: 0, hard: 0 }
  };

  /* 结算卡片上的文字要能跟着语言切换重画，所以把 key 和变量记下来 */
  var overlayInfo = null;

  /* ---------------- 工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  /** I18N.t 只接受一个参数，{占位符} 由调用方自己替换 */
  function fmt(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (all, k) {
      return (vars && vars[k] != null) ? String(vars[k]) : '';
    });
  }

  function sfx(name, opts) {
    if (window.YSound) window.YSound.play(name, opts);
  }

  /* 左右移动、软降这类高频操作要节流，不然一串按键听成机关枪 */
  var lastSfxAt = {};
  function sfxThrottled(name, ms, opts) {
    var now = Date.now();
    if (lastSfxAt[name] && now - lastSfxAt[name] < (ms || 70)) return;
    lastSfxAt[name] = now;
    sfx(name, opts);
  }

  function cloneMatrix(m) {
    var out = [];
    for (var r = 0; r < m.length; r++) out.push(m[r].slice());
    return out;
  }

  function rotateMatrix(m) {
    var n = m.length;
    var out = [];
    for (var r = 0; r < n; r++) {
      out.push([]);
      for (var c = 0; c < n; c++) out[r].push(m[n - 1 - c][r]);
    }
    return out;
  }

  function emptyBest() { return { easy: 0, medium: 0, hard: 0 }; }

  /* ---------------- 存档 ---------------- */

  function loadBest() {
    try {
      var d = JSON.parse(localStorage.getItem(BEST_KEY));
      if (d && d.v === 1 && d.tiers) {
        return {
          easy: Number(d.tiers.easy) || 0,
          medium: Number(d.tiers.medium) || 0,
          hard: Number(d.tiers.hard) || 0
        };
      }
    } catch (e) { /* 存档坏了就当没有 */ }
    return emptyBest();
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify({ v: 1, tiers: state.best }));
    } catch (e) { /* 隐私模式下写不了，不影响玩 */ }
  }

  function loadDiff() {
    try {
      var d = localStorage.getItem(DIFF_KEY);
      if (d && DIFFS[d]) state.diff = d;
    } catch (e) { /* ignore */ }
  }

  function saveDiff() {
    try { localStorage.setItem(DIFF_KEY, state.diff); } catch (e) { /* ignore */ }
  }

  function save() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        v: 1,
        diff: state.diff,
        board: state.board,
        cur: state.cur,
        queue: state.queue,
        score: state.score,
        lines: state.lines,
        level: state.level,
        combo: state.combo,
        started: state.started,
        over: state.over
      }));
    } catch (e) { /* ignore */ }
  }

  function loadState() {
    try {
      var d = JSON.parse(localStorage.getItem(STATE_KEY));
      if (!d || d.v !== 1 || d.diff !== state.diff || d.over) return false;
      if (!d.board || d.board.length !== ROWS || d.board[0].length !== COLS) return false;

      state.board = d.board;
      state.cur = d.cur || null;
      state.queue = d.queue || [];
      state.score = Number(d.score) || 0;
      state.lines = Number(d.lines) || 0;
      state.level = Math.max(1, Number(d.level) || 1);
      state.combo = d.combo == null ? -1 : d.combo;
      state.started = !!d.started;
      state.paused = true;          // 刷新后一律先暂停，别让方块自己掉
      state.over = false;
      if (!state.cur || !state.queue.length) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- 方块 ---------------- */

  function refill() {
    var bag = Object.keys(SHAPES);
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
    }
    state.queue = state.queue.concat(bag);
  }

  function spawn() {
    while (state.queue.length < 7) refill();
    var type = state.queue.shift();
    var m = cloneMatrix(SHAPES[type]);
    var x = Math.floor((COLS - m.length) / 2);
    var y = type === 'I' ? -1 : 0;
    state.cur = { type: type, m: m, x: x, y: y };
    if (collides(m, x, y)) {
      gameOver();
      return;
    }
    save();
  }

  /** y < 0 允许（方块从棋盘上方进场），左右和底部越界即碰撞 */
  function collides(m, x, y) {
    for (var r = 0; r < m.length; r++) {
      for (var c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        var bx = x + c;
        var by = y + r;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && state.board[by][bx]) return true;
      }
    }
    return false;
  }

  function playable() {
    return state.started && !state.paused && !state.over && !!state.cur;
  }

  function stepMs() {
    var d = DIFFS[state.diff];
    return Math.max(d.minMs, d.startMs - (state.level - 1) * d.stepDown);
  }

  function move(dx) {
    if (!playable()) return;
    var p = state.cur;
    if (!collides(p.m, p.x + dx, p.y)) {
      p.x += dx;
      sfxThrottled('slide', 55, { step: Math.floor(p.x / 2) });
      save();
      render();
    }
  }

  function rotateCur() {
    if (!playable()) return;
    var p = state.cur;
    var rm = rotateMatrix(p.m);
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      var nx = p.x + kicks[i];
      for (var dy = 0; dy >= -1; dy--) {
        var ny = p.y + dy;
        if (collides(rm, nx, ny)) continue;
        p.m = rm; p.x = nx; p.y = ny;
        sfx('rotate');
        save();
        render();
        return;
      }
    }
    sfxThrottled('error', 180);
  }

  function softDrop() {
    if (!playable()) return;
    var p = state.cur;
    if (!collides(p.m, p.x, p.y + 1)) {
      p.y += 1;
      state.score += 1;
      sfxThrottled('tick', 90);
      save();
      render();
    }
  }

  function hardDrop() {
    if (!playable()) return;
    var p = state.cur;
    var dist = 0;
    while (!collides(p.m, p.x, p.y + 1)) { p.y += 1; dist += 1; }
    state.score += dist * 2;
    if (dist > 6) sfx('whoosh');
    sfx('drop');
    lockPiece();
  }

  function lockPiece() {
    var p = state.cur;
    for (var r = 0; r < p.m.length; r++) {
      for (var c = 0; c < p.m[r].length; c++) {
        if (!p.m[r][c]) continue;
        var by = p.y + r;
        if (by < 0) { gameOver(); return; }
        state.board[by][p.x + c] = p.type;
      }
    }
    sfx('lock');

    var cleared = clearLines();
    if (cleared > 0) {
      state.lines += cleared;
      state.combo += 1;
      state.score += LINE_SCORE[cleared] * state.level;
      if (state.combo > 0) state.score += state.combo * 50 * state.level;
      sfx('clear', { rows: cleared });
      if (cleared === 4 || state.combo >= 2) sfx('combo', { combo: state.combo + 2 });

      var lv = Math.floor(state.lines / DIFFS[state.diff].linesPerLevel) + 1;
      if (lv > state.level) {
        state.level = lv;
        sfx('levelup');
      }
    } else {
      state.combo = -1;
    }

    checkRecord();
    spawn();
    render();
  }

  function clearLines() {
    var n = 0;
    for (var r = ROWS - 1; r >= 0; r--) {
      var full = true;
      for (var c = 0; c < COLS; c++) {
        if (!state.board[r][c]) { full = false; break; }
      }
      if (!full) continue;
      state.board.splice(r, 1);
      var row = [];
      for (var k = 0; k < COLS; k++) row.push(null);
      state.board.unshift(row);
      n += 1;
      r += 1;             // 同一行索引又换上来一行，重新检查
    }
    return n;
  }

  function checkRecord() {
    var prev = state.best[state.diff] || 0;
    if (state.score <= prev) return;
    state.best[state.diff] = state.score;
    saveBest();
    if (!state.recordShown && state.score > 0) {
      state.recordShown = true;
      recordBadge.hidden = false;
      sfx('perfect');
    }
  }

  function gameOver() {
    if (state.over) return;
    state.over = true;
    state.paused = true;
    state.cur = null;
    sfx('lose');
    showOverlay('gameover_title', 'gameover_sub', {
      score: state.score, lines: state.lines, level: state.level
    });
    updateHud();
    updateVeil();
    save();
  }

  /* ---------------- 局面控制 ---------------- */

  function newGame() {
    state.board = emptyBoard();
    state.queue = [];
    refill();
    state.cur = null;
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.combo = -1;
    state.over = false;
    state.paused = true;
    state.started = false;
    state.recordShown = false;
    overlayInfo = null;
    overlay.hidden = true;
    recordBadge.hidden = true;
    spawn();
    updateVeil();
    updateHud();
    render();
    save();
  }

  function start() {
    if (state.over) newGame();
    if (!state.cur) spawn();
    state.started = true;
    state.paused = false;
    overlay.hidden = true;
    sfx('start');
    updateVeil();
    save();
  }

  function togglePause() {
    if (state.over) return;
    if (!state.started) { start(); return; }
    state.paused = !state.paused;
    sfx('click');
    updateVeil();
    save();
  }

  function switchDiff(diff) {
    if (!DIFFS[diff]) return;
    if (diff === state.diff) return;
    if (state.started && !state.over && state.score > 0) {
      if (!window.confirm(t('confirm_diff'))) { syncDiffs(); return; }
    }
    state.diff = diff;
    saveDiff();
    syncDiffs();
    sfx('toggle');
    newGame();
  }

  function syncDiffs() {
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === state.diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* ---------------- 界面 ---------------- */

  function updateHud() {
    $('score').textContent = String(state.score);
    $('lines').textContent = String(state.lines);
    $('level').textContent = String(state.level);
    var best = state.best[state.diff] || 0;
    $('best').textContent = best > 0 ? String(best) : '--';
  }

  function updateVeil() {
    btnPause.textContent = state.paused && state.started ? t('btn_resume') : t('btn_pause');

    if (state.over) { veil.hidden = true; return; }
    if (!state.started) {
      veil.hidden = false;
      veilText.textContent = t('btn_start');
      return;
    }
    if (state.paused) {
      veil.hidden = false;
      veilText.textContent = t('paused_title');
      return;
    }
    veil.hidden = true;
  }

  function showOverlay(titleKey, subKey, vars) {
    overlayInfo = { title: titleKey, sub: subKey, vars: vars };
    $('overlay-title').textContent = t(titleKey);
    $('overlay-sub').textContent = fmt(t(subKey), vars);
    $('overlay-score').textContent = String(state.score);
    overlay.hidden = false;
    if (overlay.scrollIntoView) {
      try { overlay.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
    }
  }

  /** 语言原地切换时，I18N.apply 只管 data-i18n；这些动态文字得自己重画 */
  function refreshDynamicText() {
    updateVeil();
    if (overlayInfo && !overlay.hidden) {
      $('overlay-title').textContent = t(overlayInfo.title);
      $('overlay-sub').textContent = fmt(t(overlayInfo.sub), overlayInfo.vars);
    }
  }

  /* ---------------- 绘制 ---------------- */

  function setupCanvas(cv, w, h) {
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function drawCell(c, x, y, color, alpha) {
    if (y < 0) return;
    var px = x * CELL;
    var py = y * CELL;
    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.fillStyle = color;
    c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    c.fillStyle = 'rgba(255,255,255,.30)';
    c.fillRect(px + 2, py + 2, CELL - 4, 3);
    c.strokeStyle = 'rgba(80,70,55,.20)';
    c.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
    c.restore();
  }

  function ghostY() {
    var p = state.cur;
    var y = p.y;
    while (!collides(p.m, p.x, y + 1) && y < ROWS) y += 1;
    return y;
  }

  function render() {
    var c = boardCtx;
    if (!c) return;
    c.clearRect(0, 0, W, H);

    /* 淡淡的格线，让空棋盘也有参照 */
    c.strokeStyle = 'rgba(120,104,78,.075)';
    c.lineWidth = 1;
    for (var gx = 1; gx < COLS; gx++) {
      c.beginPath(); c.moveTo(gx * CELL + .5, 0); c.lineTo(gx * CELL + .5, H); c.stroke();
    }
    for (var gy = 1; gy < ROWS; gy++) {
      c.beginPath(); c.moveTo(0, gy * CELL + .5); c.lineTo(W, gy * CELL + .5); c.stroke();
    }

    for (var r = 0; r < ROWS; r++) {
      for (var col = 0; col < COLS; col++) {
        if (state.board[r][col]) drawCell(c, col, r, COLORS[state.board[r][col]]);
      }
    }

    var p = state.cur;
    if (p) {
      var gy2 = ghostY();
      for (var i = 0; i < p.m.length; i++) {
        for (var j = 0; j < p.m[i].length; j++) {
          if (!p.m[i][j]) continue;
          drawCell(c, p.x + j, gy2 + i, COLORS[p.type], .26);
          drawCell(c, p.x + j, p.y + i, COLORS[p.type]);
        }
      }
    }

    drawNext();
    updateHud();
  }

  function drawNext() {
    var c = nextCtx;
    if (!c) return;
    c.clearRect(0, 0, 96, 96);
    var type = state.queue[0];
    if (!type) return;
    var m = SHAPES[type];

    var minR = 99, maxR = -1, minC = 99, maxC = -1;
    for (var r = 0; r < m.length; r++) {
      for (var col = 0; col < m[r].length; col++) {
        if (!m[r][col]) continue;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (col < minC) minC = col;
        if (col > maxC) maxC = col;
      }
    }
    var size = 20;
    var ox = (96 - (maxC - minC + 1) * size) / 2;
    var oy = (96 - (maxR - minR + 1) * size) / 2;
    for (var rr = minR; rr <= maxR; rr++) {
      for (var cc = minC; cc <= maxC; cc++) {
        if (!m[rr][cc]) continue;
        var px = ox + (cc - minC) * size;
        var py = oy + (rr - minR) * size;
        c.fillStyle = COLORS[type];
        c.fillRect(px + 1, py + 1, size - 2, size - 2);
        c.fillStyle = 'rgba(255,255,255,.30)';
        c.fillRect(px + 2, py + 2, size - 4, 3);
        c.strokeStyle = 'rgba(80,70,55,.20)';
        c.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
      }
    }
  }

  /* ---------------- 主循环 ---------------- */

  var lastTs = 0;
  var acc = 0;

  function frame(ts) {
    window.requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = Math.min(ts - lastTs, 120);
    lastTs = ts;

    if (playable()) {
      acc += dt;
      if (acc >= stepMs()) {
        acc = 0;
        var p = state.cur;
        if (!collides(p.m, p.x, p.y + 1)) {
          p.y += 1;
          save();
        } else {
          lockPiece();
        }
      }
    }
    render();
  }

  /* ---------------- 事件 ---------------- */

  function bind() {
    var diffs = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < diffs.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          switchDiff(btn.getAttribute('data-diff'));
        });
      })(diffs[i]);
    }

    btnStart.addEventListener('click', function () { sfx('click'); start(); });
    btnPause.addEventListener('click', togglePause);

    $('btn-restart').addEventListener('click', function () {
      sfx('click');
      newGame();
      start();
    });

    $('btn-again').addEventListener('click', function () {
      sfx('click');
      newGame();
      start();
    });

    /* 触屏按钮：按下即响应；左右能按住连走，旋转和硬降只触发一次 */
    function hold(id, fn, repeat) {
      var btn = $(id);
      var timer = null;
      function stop() {
        if (timer) { window.clearInterval(timer); timer = null; }
      }
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        fn();
        stop();
        if (repeat) timer = window.setInterval(fn, 130);
      });
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('pointerleave', stop);
    }
    hold('pad-left', function () { move(-1); }, true);
    hold('pad-right', function () { move(1); }, true);
    hold('pad-rotate', rotateCur, false);
    hold('pad-drop', hardDrop, false);

    /* 棋盘手势：横滑一格、轻点旋转、向下甩是硬降 */
    var down = null;
    boardCv.addEventListener('pointerdown', function (e) {
      down = { x: e.clientX, y: e.clientY, moved: 0, fired: false };
      boardCv.setPointerCapture && boardCv.setPointerCapture(e.pointerId);
    });
    boardCv.addEventListener('pointermove', function (e) {
      if (!down || !playable()) return;
      var rect = boardCv.getBoundingClientRect();
      var unit = Math.max(12, (rect.width / W) * CELL);
      var dx = e.clientX - down.x;
      var dy = e.clientY - down.y;
      while (dx - down.moved >= unit) { move(1); down.moved += unit; down.fired = true; }
      while (down.moved - dx >= unit) { move(-1); down.moved -= unit; down.fired = true; }
      if (dy > 46 && Math.abs(dx) < 30 && !down.fired) {
        hardDrop();
        down.fired = true;
      }
    });
    boardCv.addEventListener('pointerup', function () {
      if (down && !down.fired) rotateCur();
      down = null;
    });
    boardCv.addEventListener('pointercancel', function () { down = null; });

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var k = e.key;
      var handled = true;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') move(-1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') move(1);
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X') rotateCur();
      else if (k === 'ArrowDown' || k === 's' || k === 'S') softDrop();
      else if (k === ' ' || k === 'Spacebar') hardDrop();
      else if (k === 'p' || k === 'P') togglePause();
      else handled = false;
      if (handled) e.preventDefault();
    });

    /* 切到后台自动暂停，回来别发现已经堆顶了 */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.started && !state.paused && !state.over) {
        state.paused = true;
        updateVeil();
        save();
      }
    });

    document.addEventListener('ys:langchange', refreshDynamicText);

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        boardCtx = setupCanvas(boardCv, W, H);
        nextCtx = setupCanvas(nextCv, 96, 96);
        render();
      }, 120);
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    boardCtx = setupCanvas(boardCv, W, H);
    nextCtx = setupCanvas(nextCv, 96, 96);

    state.best = loadBest();
    loadDiff();
    syncDiffs();

    var resumed = loadState();
    if (!resumed) {
      newGame();
    } else {
      overlay.hidden = true;
      updateVeil();
      render();
    }

    bind();
    refreshDynamicText();
    window.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
