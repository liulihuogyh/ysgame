/* ==========================================================================
   连连看 · 游戏逻辑
   纯 ES5 + IIFE，和站内其它游戏保持一致（无框架、无打包、无依赖）。

   玩法：网格铺满成对图案，点两张同类牌，若能用一条「转弯不超过 2 次」的
        折线连起来（可绕棋盘外的一圈空格）就消除并短暂画出连线。
   难度：三档的棋盘尺寸 / 图案种类 / 时间 / 提示 / 洗牌次数都不同。
   存档：ysgame-linkup-state 按难度分桶，含剩余牌面 / 时间 / 分数 / 提示 /
        洗牌次数，刷新断点续玩；最高分按难度隔离存在 ysgame-linkup-best。
   音效：统一走 js/sound.js 的 YSound，主题由 body[data-dict] 自动识别。

   [gyh 2026-11-08 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var STATE_KEY = 'ysgame-linkup-state';
  var BEST_KEY = 'ysgame-linkup-best';
  var DIFF_KEY = 'ysgame-linkup-diff';

  // 三档要真的拉开：列数 / 行数 / 图案种类 / 时间 / 提示 / 洗牌全都不一样
  var DIFFS = {
    easy:   { cols: 6,  rows: 4, types: 8,  time: 300, hints: 5, shuffles: 3 },
    medium: { cols: 8,  rows: 5, types: 12, time: 240, hints: 3, shuffles: 2 },
    hard:   { cols: 10, rows: 6, types: 16, time: 180, hints: 1, shuffles: 1 }
  };

  // 低饱和色块 + Unicode 图案，不引用任何外部图片
  var TILES = ['🍃', '🍋', '🫐', '🌰', '🪨', '🌼', '🍄', '🍁',
               '🌿', '🌸', '🧊', '🍇', '🥑', '🐚', '🍊', '🍒'];
  var COLORS = [
    '#AEC9A6', '#E7CE86', '#A6B2D0', '#CDA988',
    '#BDB6AB', '#E8DCA2', '#D7B0A8', '#B7C9B0',
    '#B8CDA0', '#D9B8CE', '#B6CEDA', '#C0ADCD',
    '#BFCB98', '#E4C3A4', '#EBC093', '#C7C79A'
  ];

  /* ---------------- DOM ---------------- */

  function $(id) { return document.getElementById(id); }

  var boardEl = null;
  var linesEl = null;
  var veil = null;
  var veilText = null;
  var overlay = null;

  /* ---------------- 状态 ---------------- */

  var COLS = 8;
  var ROWS = 5;

  var state = {
    diff: 'medium',
    grid: [],            // grid[r][c] = 图案 id 或 -1（已消除）
    timeLeft: 0,
    score: 0,
    hints: 0,
    shuffles: 0,
    matched: 0,         // 已消除的牌数
    combo: 0,
    lastMatchAt: 0,
    started: false,
    paused: true,
    over: false,
    busy: false,        // 消除动画进行中，禁止连点
    selected: null,     // { r, c }
    hintPair: null,     // { a, b }
    recordShown: false,
    best: { easy: 0, medium: 0, hard: 0 }
  };

  var overlayInfo = null;
  var hintTimer = null;
  var warnedLowTime = false;
  var timerId = null;

  /* ---------------- 工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  // I18N.t 只收一个参数；带 {占位符} 的文案在这里用 split/join 自己替换。
  // 这些元素不挂静态 data-i18n，切语言靠 ys:langchange 重绘。
  function tf(key, vars) {
    var s = t(key);
    for (var k in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, k)) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      }
    }
    return s;
  }

  function sfx(name, opts) {
    if (window.YSound) window.YSound.play(name, opts);
  }

  // 选牌 / 连错这类高频操作要节流，不然一串点击听成机关枪
  var lastSfxAt = {};
  function sfxThrottled(name, ms, opts) {
    var now = Date.now();
    if (lastSfxAt[name] && now - lastSfxAt[name] < (ms || 80)) return;
    lastSfxAt[name] = now;
    sfx(name, opts);
  }

  function shuffleArray(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function formatTime(s) {
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s / 60);
    var ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function cloneGrid(g) {
    var out = [];
    for (var r = 0; r < g.length; r++) out.push(g[r].slice());
    return out;
  }

  /* ---------------- 存档（全部 try/catch） ---------------- */

  function emptyBest() { return { easy: 0, medium: 0, hard: 0 }; }

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

  // state 存档格式：{ v:1, buckets: { easy: bucket|null, ... } }
  // bucket 含剩余牌面 / 时间 / 分数 / 提示 / 洗牌次数。
  function emptyStateFile() {
    return { v: 1, buckets: { easy: null, medium: null, hard: null } };
  }

  function readStateFile() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (!raw) return emptyStateFile();
      var d = JSON.parse(raw);
      if (!d || d.v !== 1 || !d.buckets) return emptyStateFile();
      return d;
    } catch (e) {
      return emptyStateFile();
    }
  }

  function snapshot() {
    return {
      cols: COLS,
      rows: ROWS,
      grid: cloneGrid(state.grid),
      timeLeft: state.timeLeft,
      score: state.score,
      hints: state.hints,
      shuffles: state.shuffles,
      matched: state.matched,
      combo: state.combo,
      started: state.started,
      over: state.over,
      paused: state.paused
    };
  }

  function save() {
    try {
      var file = readStateFile();
      file.buckets[state.diff] = snapshot();
      localStorage.setItem(STATE_KEY, JSON.stringify(file));
    } catch (e) { /* ignore */ }
  }

  // 只恢复指定难度桶；刷新后一律先暂停，且顺手修掉无解局面。
  function loadState(diff) {
    try {
      var d = DIFFS[diff];
      var file = readStateFile();
      var b = file.buckets[diff];
      if (!b || !b.grid || b.cols !== d.cols || b.rows !== d.rows) return false;
      if (b.grid.length !== d.rows) return false;
      for (var rr = 0; rr < d.rows; rr++) {
        if (!b.grid[rr] || b.grid[rr].length !== d.cols) return false;
      }
      if (b.over) return false;

      COLS = d.cols;
      ROWS = d.rows;
      state.grid = cloneGrid(b.grid);
      state.timeLeft = Math.max(0, Number(b.timeLeft) || 0);
      state.score = Number(b.score) || 0;
      state.hints = Number(b.hints) || 0;
      state.shuffles = Number(b.shuffles) || 0;
      state.matched = Number(b.matched) || 0;
      state.combo = Number(b.combo) || 0;
      state.lastMatchAt = 0;
      state.started = !!b.started;
      state.paused = true;
      state.over = false;
      state.busy = false;
      state.selected = null;
      state.hintPair = null;
      state.recordShown = false;
      warnedLowTime = false;
      clearHintTimer();
      clearLines();

      applyGeometry();
      layout();
      ensureSolvable();
      render();
      updateVeil();
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- 连线判定：转弯 <= 2，可走棋盘外一圈 ---------------- */

  // 扩展网格范围：行 [-1, ROWS]、列 [-1, COLS]，多出来的那一圈恒为空。
  function inExt(r, c) {
    return r >= -1 && r <= ROWS && c >= -1 && c <= COLS;
  }

  // 格子能否作为路径的「中间 / 转折点」：外圈一圈视为空，内部需为已消除的空格。
  function emptyCell(r, c) {
    if (!inExt(r, c)) return false;
    if (r === -1 || r === ROWS || c === -1 || c === COLS) return true;
    return state.grid[r][c] < 0;
  }

  // p、q 同行或同列；只检查两点「之间」的格子是否全空，端点本身不检查。
  function segClear(p, q) {
    if (p.r === q.r) {
      var lo = Math.min(p.c, q.c);
      var hi = Math.max(p.c, q.c);
      for (var c = lo + 1; c < hi; c++) {
        if (!emptyCell(p.r, c)) return false;
      }
      return true;
    }
    if (p.c === q.c) {
      var lo2 = Math.min(p.r, q.r);
      var hi2 = Math.max(p.r, q.r);
      for (var r = lo2 + 1; r < hi2; r++) {
        if (!emptyCell(r, p.c)) return false;
      }
      return true;
    }
    return false;
  }

  // 返回点序列（用于画连线动画），不可连返回 null。
  function findPath(a, b) {
    // 0 弯：同行 / 同列直连
    if ((a.r === b.r || a.c === b.c) && segClear(a, b)) return [a, b];

    // 1 弯：两个矩形拐角
    var corners = [{ r: a.r, c: b.c }, { r: b.r, c: a.c }];
    for (var i = 0; i < 2; i++) {
      var k = corners[i];
      if (emptyCell(k.r, k.c) && segClear(a, k) && segClear(k, b)) {
        return [a, k, b];
      }
    }

    // 2 弯：枚举一条中间水平线（rr 可为 -1 / ROWS 的外圈行）
    for (var rr = -1; rr <= ROWS; rr++) {
      var k1 = { r: rr, c: a.c };
      var k2 = { r: rr, c: b.c };
      if (emptyCell(k1.r, k1.c) && emptyCell(k2.r, k2.c) &&
          segClear(a, k1) && segClear(k1, k2) && segClear(k2, b)) {
        return [a, k1, k2, b];
      }
    }

    // 2 弯：枚举一条中间垂直线（cc 可为 -1 / COLS 的外圈列）
    for (var cc = -1; cc <= COLS; cc++) {
      var j1 = { r: a.r, c: cc };
      var j2 = { r: b.r, c: cc };
      if (emptyCell(j1.r, j1.c) && emptyCell(j2.r, j2.c) &&
          segClear(a, j1) && segClear(j1, j2) && segClear(j2, b)) {
        return [a, j1, j2, b];
      }
    }

    return null;
  }

  // 遍历同类牌两两配对；needTurn=true 时只认带拐弯的路径。
  function scanMatch(needTurn) {
    var byType = {};
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var v = state.grid[r][c];
        if (v < 0) continue;
        if (!byType[v]) byType[v] = [];
        byType[v].push({ r: r, c: c });
      }
    }
    for (var key in byType) {
      if (!Object.prototype.hasOwnProperty.call(byType, key)) continue;
      var arr = byType[key];
      for (var i = 0; i < arr.length; i++) {
        for (var j = i + 1; j < arr.length; j++) {
          var p = findPath(arr[i], arr[j]);
          if (p && (!needTurn || p.length > 2)) {
            return { a: arr[i], b: arr[j], path: p };
          }
        }
      }
    }
    return null;
  }

  function findAnyMatch() { return scanMatch(false); }

  function remaining() {
    var n = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (state.grid[r][c] >= 0) n++;
      }
    }
    return n;
  }

  function remainingCells() {
    var cells = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (state.grid[r][c] >= 0) cells.push({ r: r, c: c });
      }
    }
    return cells;
  }

  function remainingIds() {
    var ids = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (state.grid[r][c] >= 0) ids.push(state.grid[r][c]);
      }
    }
    return ids;
  }

  function adjacentSameCount(g) {
    var n = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var v = g[r][c];
        if (v < 0) continue;
        if (c + 1 < COLS && g[r][c + 1] === v) n++;
        if (r + 1 < ROWS && g[r + 1][c] === v) n++;
      }
    }
    return n;
  }

  /* ---------------- 生成牌面：保证至少一组可消，且不是全相邻 ---------------- */

  function buildGrid() {
    var d = DIFFS[state.diff];
    COLS = d.cols;
    ROWS = d.rows;
    var pairs = COLS * ROWS / 2;   // 三档都是偶数，正好铺满
    var ids = [];
    for (var i = 0; i < pairs; i++) {
      var id = i % d.types;        // 尽量均匀覆盖所有图案，且每种必为偶数张
      ids.push(id);
      ids.push(id);
    }

    var bestGrid = null;
    var bestAdj = Infinity;        // hard：相邻同类越少越分散
    var fallback = null;           // 任意有解局面

    for (var attempt = 0; attempt < 60; attempt++) {
      shuffleArray(ids);
      var g = [];
      var k = 0;
      for (var r = 0; r < ROWS; r++) {
        g.push([]);
        for (var c = 0; c < COLS; c++) { g[r].push(ids[k]); k++; }
      }
      state.grid = g;

      var turn = scanMatch(true);              // 至少要有一组需要拐弯的可消对
      if (!turn && !findAnyMatch()) continue; // 完全无解，丢掉
      if (!fallback) fallback = g;
      if (!turn) continue;                    // 只有直连解，继续找有转弯的

      var adj = adjacentSameCount(g);
      if (state.diff === 'hard') {
        if (adj < bestAdj) { bestAdj = adj; bestGrid = g; }
      } else {
        // 简单 / 中等：相邻对别太密，留出需要转弯 / 绕外圈的空间
        if (adj <= Math.ceil(pairs / 2)) { bestGrid = g; break; }
        if (!bestGrid) bestGrid = g;
      }
    }

    state.grid = bestGrid || fallback || state.grid;
    ensureSolvable();   // 兜底：万一上面都没成，也保证有解
    return state.grid;
  }

  /* ---------------- 洗牌 / 无解自动重排 ---------------- */

  // 把剩余牌打乱重排到「剩余格位」上；needSolvable=true 时反复洗到有解为止。
  function reshuffleRemaining(needSolvable) {
    var cells = remainingCells();
    var ids = remainingIds();
    if (!cells.length) return true;

    var tries = needSolvable ? 50 : 1;
    for (var t2 = 0; t2 < tries; t2++) {
      shuffleArray(ids);
      for (var i = 0; i < cells.length; i++) {
        state.grid[cells[i].r][cells[i].c] = ids[i];
      }
      if (!needSolvable || findAnyMatch()) return true;
    }

    // 极端兜底：把剩余牌紧凑排到左上角并让同类两两相邻，必有直连可消对。
    if (needSolvable) compactPlace(ids, cells.length);
    return !!findAnyMatch();
  }

  function compactPlace(ids, m) {
    var sorted = ids.slice().sort(function (a, b) { return a - b; });
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) state.grid[r][c] = -1;
    }
    var k = 0;
    for (var rr = 0; rr < ROWS && k < m; rr++) {
      for (var cc = 0; cc < COLS && k < m; cc++) {
        state.grid[rr][cc] = sorted[k];
        k++;
      }
    }
  }

  // 每次消除 / 洗牌 / 读档后调用：无解就自动重排，且洗完仍可解。
  function ensureSolvable() {
    if (remaining() === 0) return;
    if (findAnyMatch()) return;
    reshuffleRemaining(true);
    state.selected = null;
    state.hintPair = null;
    clearHintTimer();
    sfx('shuffle');
    render();
    save();
  }

  /* ---------------- 绘制 ---------------- */

  // 格子中心在 SVG 坐标里是 (c + 1.5, r + 1.5)，viewBox 为 (COLS+2)x(ROWS+2)。
  function applyGeometry() {
    boardEl.style.gridTemplateColumns = 'repeat(' + COLS + ', 1fr)';
    boardEl.style.padding = (100 / (COLS + 2)) + '%';
    linesEl.setAttribute('viewBox', '0 0 ' + (COLS + 2) + ' ' + (ROWS + 2));
  }

  // 字号随棋盘宽度走，hard 十列在 320px 也不会把格子撑破
  function layout() {
    var w = boardEl.getBoundingClientRect().width;
    if (!w) return;
    var cell = w / (COLS + 2);
    boardEl.style.setProperty('--lk-fs', Math.max(11, Math.round(cell * 0.5)) + 'px');
  }

  function render() {
    var frag = document.createDocumentFragment();
    var hint = state.hintPair;
    var sel = state.selected;

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var v = state.grid[r][c];
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.setAttribute('data-r', String(r));
        cell.setAttribute('data-c', String(c));
        cell.setAttribute('role', 'gridcell');

        var cls = 'lk__cell';
        if (v < 0) {
          cls += ' is-empty';
          cell.disabled = true;
        } else {
          var tile = document.createElement('span');
          tile.className = 'lk__tile';
          tile.style.backgroundColor = COLORS[v % COLORS.length];
          tile.textContent = TILES[v % TILES.length];
          cell.appendChild(tile);
          cell.setAttribute('aria-label', TILES[v % TILES.length]);
        }
        if (sel && sel.r === r && sel.c === c) cls += ' is-selected';
        if (hint && ((hint.a.r === r && hint.a.c === c) ||
                     (hint.b.r === r && hint.b.c === c))) cls += ' is-hint';
        cell.className = cls;
        frag.appendChild(cell);
      }
    }

    boardEl.innerHTML = '';
    boardEl.appendChild(frag);
    updateHud();
  }

  function cellEl(r, c) {
    return boardEl.querySelector('.lk__cell[data-r="' + r + '"][data-c="' + c + '"]');
  }

  function drawLine(path) {
    clearLines();
    var pts = [];
    for (var i = 0; i < path.length; i++) {
      pts.push((path[i].c + 1.5) + ',' + (path[i].r + 1.5));
    }
    var pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pl.setAttribute('class', 'lk__line');
    pl.setAttribute('points', pts.join(' '));
    linesEl.appendChild(pl);
  }

  function clearLines() {
    while (linesEl.firstChild) linesEl.removeChild(linesEl.firstChild);
  }

  function markClearing(a, b) {
    var e1 = cellEl(a.r, a.c);
    var e2 = cellEl(b.r, b.c);
    if (e1) e1.className += ' is-clearing';
    if (e2) e2.className += ' is-clearing';
  }

  /* ---------------- 界面 ---------------- */

  function updateHud() {
    $('score').textContent = String(state.score);
    $('time').textContent = formatTime(state.timeLeft);
    $('pairs').textContent = String(Math.ceil(remaining() / 2));
    var b = state.best[state.diff] || 0;
    $('best').textContent = b > 0 ? String(b) : '--';
    $('hintCount').textContent = 'x' + state.hints;
    $('shuffleCount').textContent = 'x' + state.shuffles;

    var locked = state.over || !state.started || state.paused;
    $('btn-hint').disabled = locked || state.hints <= 0;
    $('btn-shuffle').disabled = locked || state.shuffles <= 0;
  }

  function updateVeil() {
    $('btn-pause').textContent =
      (state.paused && state.started && !state.over) ? t('btn_resume') : t('btn_pause');

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
    $('overlay-sub').textContent = tf(subKey, vars);
    $('overlay-score').textContent = String(state.score);
    overlay.hidden = false;
    if (overlay.scrollIntoView) {
      try { overlay.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
    }
  }

  // 语言原地切换时，I18N.apply 只管 data-i18n；动态文案要自己重画。
  function refreshDynamicText() {
    updateVeil();
    if (overlayInfo && !overlay.hidden) {
      $('overlay-title').textContent = t(overlayInfo.title);
      $('overlay-sub').textContent = tf(overlayInfo.sub, overlayInfo.vars);
    }
    updateHud();
  }

  function syncDiffs() {
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === state.diff;
      if (on) btns[i].classList.add('is-active');
      else btns[i].classList.remove('is-active');
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function clearHintTimer() {
    if (hintTimer) { window.clearTimeout(hintTimer); hintTimer = null; }
  }

  /* ---------------- 局面控制 ---------------- */

  function playable() {
    return state.started && !state.paused && !state.over && !state.busy;
  }

  function checkRecord() {
    var prev = state.best[state.diff] || 0;
    if (state.score > prev) {
      state.best[state.diff] = state.score;
      saveBest();
      state.recordShown = true;
    }
  }

  function newGame() {
    var d = DIFFS[state.diff];
    COLS = d.cols;
    ROWS = d.rows;
    state.timeLeft = d.time;
    state.score = 0;
    state.hints = d.hints;
    state.shuffles = d.shuffles;
    state.matched = 0;
    state.combo = 0;
    state.lastMatchAt = 0;
    state.started = false;
    state.paused = true;
    state.over = false;
    state.busy = false;
    state.selected = null;
    state.hintPair = null;
    state.recordShown = false;
    warnedLowTime = false;
    clearHintTimer();
    clearLines();
    overlayInfo = null;
    overlay.hidden = true;
    $('recordBadge').hidden = true;

    applyGeometry();
    buildGrid();          // 内部会设 state.grid 并保证可解
    layout();
    render();
    updateVeil();
    save();               // 覆盖当前难度桶
  }

  function start() {
    if (state.over) newGame();
    state.started = true;
    state.paused = false;
    overlay.hidden = true;
    sfx('start');
    updateVeil();
    updateHud();
    save();
  }

  function togglePause() {
    if (state.over) return;
    if (!state.started) { start(); return; }
    state.paused = !state.paused;
    sfx('click');
    updateVeil();
    updateHud();
    save();
  }

  // 进行中切换要确认；切换后按难度隔离「恢复该档存档 / 重开」。
  function switchDiff(diff) {
    if (!DIFFS[diff] || diff === state.diff) return;
    if (state.started && !state.over) {
      if (!window.confirm(t('confirm_diff'))) { syncDiffs(); return; }
    }
    state.diff = diff;
    saveDiff();
    syncDiffs();
    sfx('toggle');

    var d = DIFFS[diff];
    COLS = d.cols;
    ROWS = d.rows;
    var resumed = loadState(diff);
    if (!resumed) {
      newGame();
    } else {
      overlay.hidden = true;
      $('recordBadge').hidden = true;
      applyGeometry();
      layout();
      render();
      updateVeil();
    }
  }

  function onCell(r, c) {
    if (!playable()) return;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    var v = state.grid[r][c];
    if (v < 0) return;

    var hinted = !!state.hintPair;
    state.hintPair = null;
    clearHintTimer();

    var sel = state.selected;
    if (!sel) {
      state.selected = { r: r, c: c };
      sfxThrottled('select', 60);
      render();
      return;
    }
    if (sel.r === r && sel.c === c) {
      state.selected = null;
      sfxThrottled('tap', 80);
      render();
      return;
    }
    if (state.grid[sel.r][sel.c] !== v) {
      state.selected = { r: r, c: c };   // 不同类：改选
      sfxThrottled('error', 140);
      render();
      return;
    }

    var b = { r: r, c: c };
    var path = findPath(sel, b);
    if (!path) {
      state.selected = b;                // 同类但连不上：改选
      sfxThrottled('error', 140);
      render();
      return;
    }
    doMatch(sel, b, path);
  }

  function doMatch(a, b, path) {
    state.busy = true;
    state.selected = null;
    state.hintPair = null;
    clearHintTimer();
    render();               // 先去掉选中 / 提示态
    markClearing(a, b);     // 两格淡出
    drawLine(path);         // 短暂显示连线路径

    var now = Date.now();
    if (state.combo > 0 && now - state.lastMatchAt < 3200) state.combo += 1;
    else state.combo = 1;
    state.lastMatchAt = now;
    state.score += 10 + (state.combo - 1) * 4;
    state.matched += 2;

    sfx('clear', { rows: 1 });
    if (state.combo >= 2) sfx('combo', { combo: state.combo });
    checkRecord();
    updateHud();

    window.setTimeout(function () {
      state.grid[a.r][a.c] = -1;
      state.grid[b.r][b.c] = -1;
      clearLines();
      state.busy = false;
      render();
      if (remaining() === 0) { win(); return; }
      ensureSolvable();     // 无解自动重排，且重排后仍可解
      save();
    }, 280);
  }

  function useHint() {
    if (!playable()) return;
    if (state.hints <= 0) { sfx('error'); return; }
    var m = findAnyMatch();
    if (!m) { ensureSolvable(); m = findAnyMatch(); }
    if (!m) return;
    state.hints -= 1;
    state.selected = null;
    state.hintPair = { a: m.a, b: m.b };
    clearHintTimer();
    hintTimer = window.setTimeout(function () {
      state.hintPair = null;
      render();
    }, 2600);
    sfx('hint');
    render();
    save();
  }

  function useShuffle() {
    if (!playable()) return;
    if (state.shuffles <= 0) { sfx('error'); return; }
    state.shuffles -= 1;
    state.selected = null;
    state.hintPair = null;
    clearHintTimer();
    clearLines();
    reshuffleRemaining(true);   // 洗牌后仍可解
    sfx('shuffle');
    render();
    save();
  }

  function win() {
    if (state.over) return;
    state.over = true;
    state.paused = true;
    state.started = false;
    clearHintTimer();

    state.score += Math.floor(state.timeLeft / 5) * 2;  // 剩余时间折算奖励
    checkRecord();
    sfx('win');
    var isRec = state.recordShown && state.score > 0;
    if (isRec) sfx('record');
    $('recordBadge').hidden = !isRec;

    showOverlay('win_title', 'win_sub', {
      score: state.score,
      time: formatTime(DIFFS[state.diff].time - state.timeLeft),
      pairs: state.matched / 2,
      moves: state.matched / 2,
      level: state.diff
    });
    updateHud();
    updateVeil();
    save();
  }

  function lose() {
    if (state.over) return;
    state.over = true;
    state.paused = true;
    state.started = false;
    clearHintTimer();
    sfx('lose');
    $('recordBadge').hidden = true;
    showOverlay('lose_title', 'lose_sub', {
      score: state.score,
      pairs: Math.ceil(remaining() / 2),
      time: formatTime(0),
      moves: state.matched / 2,
      level: state.diff
    });
    updateHud();
    updateVeil();
    save();
  }

  function tick() {
    if (!state.started || state.paused || state.over) return;
    state.timeLeft -= 1;
    if (state.timeLeft <= 10 && state.timeLeft > 0 && !warnedLowTime) {
      warnedLowTime = true;
      sfx('warn');
    }
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateHud();
      lose();
      return;
    }
    updateHud();
    save();   // 每秒落盘，刷新恢复时间
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

    $('btn-start').addEventListener('click', function () { sfx('click'); start(); });
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-restart').addEventListener('click', function () {
      sfx('click'); newGame(); start();
    });
    $('btn-again').addEventListener('click', function () {
      sfx('click'); newGame(); start();
    });
    $('btn-hint').addEventListener('click', useHint);
    $('btn-shuffle').addEventListener('click', useShuffle);

    // 棋盘用事件委托，格子重建也不丢事件
    boardEl.addEventListener('click', function (e) {
      var cell = (e.target && e.target.closest) ? e.target.closest('.lk__cell') : null;
      if (!cell || cell.disabled) return;
      onCell(parseInt(cell.getAttribute('data-r'), 10),
             parseInt(cell.getAttribute('data-c'), 10));
    });

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var k = e.key;
      if (k === 'p' || k === 'P') togglePause();
      else if (k === 'h' || k === 'H') useHint();
      else if (k === 's' || k === 'S') useShuffle();
      else return;
      e.preventDefault();
    });

    // 切到后台自动暂停，回来别发现时间已经走光
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.started && !state.paused && !state.over) {
        state.paused = true;
        updateVeil();
        updateHud();
        save();
      }
    });

    document.addEventListener('ys:langchange', refreshDynamicText);

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { layout(); }, 120);
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    boardEl = $('board');
    linesEl = $('lines');
    veil = $('veil');
    veilText = $('veilText');
    overlay = $('overlay');

    state.best = loadBest();
    loadDiff();
    saveBest();   // 保证 best / diff 两个键开局就落盘
    saveDiff();
    var d = DIFFS[state.diff];
    COLS = d.cols;
    ROWS = d.rows;
    applyGeometry();
    layout();
    syncDiffs();

    var resumed = loadState(state.diff);
    if (!resumed) {
      newGame();
    } else {
      overlay.hidden = true;
      $('recordBadge').hidden = true;
      applyGeometry();
      layout();
      render();
      updateVeil();
    }

    bind();
    refreshDynamicText();
    timerId = window.setInterval(tick, 1000);
  }

  /* 仅供自动化验证使用，带 ?lkdebug 时才挂到 window 上 */
  if (window.location.search.indexOf('lkdebug') >= 0) {
    window.__LK__ = {
      hasMatch: function () { return !!findAnyMatch(); },
      remaining: remaining,
      grid: function () { return cloneGrid(state.grid); },
      setGrid: function (g) { state.grid = g; render(); },
      ensureSolvable: ensureSolvable,
      reshuffle: function () { return reshuffleRemaining(true); },
      findMatch: function () { return findAnyMatch(); },
      snapshot: function () {
        return {
          diff: state.diff, cols: COLS, rows: ROWS,
          timeLeft: state.timeLeft, score: state.score,
          hints: state.hints, shuffles: state.shuffles,
          remaining: remaining(), started: state.started,
          paused: state.paused, over: state.over
        };
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
