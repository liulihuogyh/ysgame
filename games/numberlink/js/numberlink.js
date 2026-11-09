/* ==========================================================================
   数字连线（Number Link）· 游戏逻辑
   - 出题：先生成一条铺满全盘的哈密顿蛇形路径，再用 backbite 变换随机化，
     最后按长度切成 N 段，每段首尾两格作为一对编号端点。这样天然存在
     「所有对连通 + 铺满全盘」的解，绝不会生成无解盘。
   - 交互：从端点（或已有线的末端）按住拖动，沿相邻格延伸；往回拖回退；
     右键 / 长按擦除整条线；两条线相遇或重叠直接拒绝。
   - 三档难度：网格、对数、提示次数、限时、得分基数、步罚、时间奖励逐级拉开。
   - 自动存档（按难度隔离槽）+ 最佳分，统一走 window.YSound.play。
   [numberlink-dev 2026-11-09 新增] 批次四
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var SIDE = 480;                 // 逻辑画布边长（正方形）
  var STATE_V = 1;
  var HINT_MS = 2500;             // 提示高亮持续时长
  var LONG_PRESS_MS = 600;        // 长按擦除判定
  var MIN_SEG = 3;                // 每段（每对端点之间）最短路径格数

  var KEY_STATE = 'ysgame-numberlink-state';
  var KEY_BEST = 'ysgame-numberlink-best';
  var KEY_DIFF = 'ysgame-numberlink-diff';

  // 三档难度：起始网格边长 / 对数 / 限时(秒,0=无限) / 提示次数 /
  //           得分基数 / 每步罚分 / 每剩余秒奖励
  var DIFF = {
    easy:   { size: 5, pairs: 4, timeLimit: 0,   hintLimit: 5, scoreBase: 300,  stepPen: 1, timeBonus: 0 },
    medium: { size: 7, pairs: 6, timeLimit: 180, hintLimit: 3, scoreBase: 700,  stepPen: 2, timeBonus: 3 },
    hard:   { size: 9, pairs: 8, timeLimit: 120, hintLimit: 1, scoreBase: 1200, stepPen: 3, timeBonus: 6 }
  };

  // 端点 / 连线配色（原创莫兰迪色板，最多 8 对）
  var PALETTE = [
    '#6B7AC2', '#D98E6A', '#6FA383', '#C9A227',
    '#9B7BB8', '#4E8C9B', '#C56B7E', '#7A8B99',
    '#B5654A', '#5E8C7E'
  ];

  var BG = '#FBF6EC';
  var GRID_LINE = 'rgba(69, 75, 89, .10)';

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium',
    status: 'ready',        // ready | running | paused | win | lose
    level: 1,
    steps: 0,               // 本关累计延伸操作数（用于步罚）
    score: 0,
    bestAtStart: 0,
    isRecord: false,
    timeLeft: 180,
    elapsed: 0,
    hintsLeft: 3,
    n: 7,
    pairs: 6,
    endpoints: null,        // { label: { a: cell, b: cell } }
    endAt: null,            // 长度 n*n；0=非端点，否则 label
    lines: null,            // { label: [cell,...] | null }
    occ: null,              // 长度 n*n；-1=空，否则占用它的线 label
    solution: null,         // { label: [cell,...] } 出题用的标准解（切段得到的段路径）
    hintCells: null,
    hintExpire: 0,
    cursor: 0               // 键盘光标所在格
  };

  var dom = {};
  var ctx = null;
  var lastTs = 0;
  var lastSave = 0;
  var lastWarn = 0;
  var toastTimer = 0;
  var lastToastKey = '';
  var longPressTimer = 0;

  // 撤销栈：每次「一次操作」前的 lines + steps 快照
  var history = [];

  // 一次指针拖拽的临时状态
  var pointerActive = false;
  var strokeStarted = false;
  var consumed = false;
  var downCell = -1;
  var longPressArmed = false;
  var dragging = null;        // { label, done } 或 null

  /* ---------------- 小工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function tf(key, map) {
    var s = t(key);
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        s = s.split('{' + k + '}').join(String(map[k]));
      }
    }
    return s;
  }

  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 隐私模式忽略 */ }
  }

  function sfx(name) {
    if (window.YSound) window.YSound.play(name);
  }

  // 动态文案：挂 data-i18n，切语言时 I18N.apply 会重绘
  function setI18n(el, key) {
    el.setAttribute('data-i18n', key);
    el.textContent = t(key);
  }

  function diffDef() { return DIFF[state.diff] || DIFF.medium; }

  function idx(r, c) { return r * state.n + c; }
  function rowOf(i) { return Math.floor(i / state.n); }
  function colOf(i) { return i % state.n; }
  function colorOf(label) { return PALETTE[(label - 1) % PALETTE.length]; }

  /* ---------------- 出题：哈密顿路径 + backbite 随机化 + 切段 ---------------- */

  // 关卡越高，盘面在起始尺寸上小幅增大（最多 +3），体现「下一关更大盘面」
  function gridSizeFor(level) {
    return diffDef().size + Math.min(level - 1, 3);
  }

  // 蛇形（boustrophedon）铺满全盘：一定是一条正交相邻、覆盖每格恰好一次的路径
  function serpentinePath(n) {
    var path = [];
    var r, c;
    for (r = 0; r < n; r++) {
      if (r % 2 === 0) {
        for (c = 0; c < n; c++) path.push(r * n + c);
      } else {
        for (c = n - 1; c >= 0; c--) path.push(r * n + c);
      }
    }
    return path;
  }

  function neighbors(n, cell) {
    var r = Math.floor(cell / n);
    var c = cell % n;
    var out = [];
    if (r > 0) out.push(cell - n);
    if (r < n - 1) out.push(cell + n);
    if (c > 0) out.push(cell - 1);
    if (c < n - 1) out.push(cell + 1);
    return out;
  }

  /*
   * backbite 变换：保持「哈密顿路径」合法性的随机化。
   * 取一个端点，选它在网格上的某个邻居 p[j]（在路径中的位置 j），
   * 把端点一侧的路径段整体翻转，新序列仍逐格相邻、仍覆盖全盘。
   */
  function backbite(path, n, iterations) {
    var L = path.length;
    var pos = [];
    var i, k, m;
    for (i = 0; i < L; i++) pos[path[i]] = i;

    for (var it = 0; it < iterations; it++) {
      var useTail = Math.random() < 0.5;
      var endCell = useTail ? path[L - 1] : path[0];
      var nbrs = neighbors(n, endCell);
      var cand = [];

      for (k = 0; k < nbrs.length; k++) {
        var j = pos[nbrs[k]];
        if (useTail) {
          if (j < L - 2) cand.push(j);          // 排除紧邻尾端的点（翻转无变化）
        } else {
          if (j > 1) cand.push(j);              // 排除紧邻头端的点（翻转无变化）
        }
      }
      if (!cand.length) continue;

      var pick = cand[Math.floor(Math.random() * cand.length)];
      var next;
      if (useTail) {
        // [p0..p_pick] + reverse([p_(pick+1)..p_(L-1)])
        next = path.slice(0, pick + 1).concat(path.slice(pick + 1).reverse());
      } else {
        // reverse([p0..p_(pick-1)]) + [p_pick..p_(L-1)]
        next = path.slice(0, pick).reverse().concat(path.slice(pick));
      }
      path = next;
      for (m = 0; m < L; m++) pos[path[m]] = m;
    }
    return path;
  }

  // 把长度 L 的路径切成 N 段，每段长度 >= minSeg 且都受软上限约束（避免某段吞掉剩余、
  // 长短过于悬殊）；返回 N+1 个边界。lo 的下界保证剩下的格子能被后面每段消化完。
  function splitBounds(L, N, minSeg) {
    var b = [0];
    var remaining = L;
    var avg = L / N;
    var cap = Math.max(minSeg, Math.ceil(avg * 1.7));   // 每段软上限
    var i;
    for (i = 0; i < N - 1; i++) {
      var segsLeft = N - i;
      var maxLen = remaining - (segsLeft - 1) * minSeg;  // 给后面每段留够 minSeg
      var lo = Math.max(minSeg, remaining - (segsLeft - 1) * cap);
      var hi = Math.min(maxLen, cap);
      if (lo > hi) lo = hi;
      var len = lo + Math.floor(Math.random() * (hi - lo + 1));
      b.push(b[b.length - 1] + len);
      remaining -= len;
    }
    b.push(L);
    return b;
  }

  function shuffledLabels(N) {
    var a = [];
    var i, j, tmp;
    for (i = 1; i <= N; i++) a.push(i);
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // 生成一道题：端点编号与路径段位置无关（打乱），但标准解始终存在
  function makePuzzle(n, pairsCount) {
    var path = serpentinePath(n);
    path = backbite(path, n, n * n * 22);

    var bounds = splitBounds(n * n, pairsCount, MIN_SEG);
    var labels = shuffledLabels(pairsCount);
    var endpoints = {};
    var endAt = [];
    var solution = {};
    var i, label, seg, a, b;
    for (i = 0; i < n * n; i++) endAt[i] = 0;

    for (i = 0; i < pairsCount; i++) {
      seg = path.slice(bounds[i], bounds[i + 1]);
      a = seg[0];
      b = seg[seg.length - 1];
      label = labels[i];
      endpoints[label] = { a: a, b: b };
      endAt[a] = label;
      endAt[b] = label;
      solution[label] = seg;
    }
    return { n: n, endpoints: endpoints, endAt: endAt, solution: solution };
  }

  /* ---------------- 盘面派生数据 ---------------- */

  function rebuildOcc() {
    var cells = state.n * state.n;
    var i, label, ln;
    state.occ = [];
    for (i = 0; i < cells; i++) state.occ[i] = -1;
    for (label = 1; label <= state.pairs; label++) {
      ln = state.lines[label];
      if (!ln) continue;
      for (i = 0; i < ln.length; i++) state.occ[ln[i]] = label;
    }
  }

  function lineComplete(label) {
    var ln = state.lines[label];
    if (!ln || ln.length < 2) return false;
    var ep = state.endpoints[label];
    var first = ln[0];
    var last = ln[ln.length - 1];
    return (first === ep.a && last === ep.b) || (first === ep.b && last === ep.a);
  }

  function connectedCount() {
    var c = 0;
    for (var label = 1; label <= state.pairs; label++) {
      if (lineComplete(label)) c += 1;
    }
    return c;
  }

  function hasAnyLine() {
    for (var label = 1; label <= state.pairs; label++) {
      if (state.lines[label] && state.lines[label].length) return true;
    }
    return false;
  }

  // 过关：每一对都连通，且盘面每一格都被线覆盖
  function isSolved() {
    var cells = state.n * state.n;
    var i;
    for (i = 1; i <= state.pairs; i++) {
      if (!lineComplete(i)) return false;
    }
    for (i = 0; i < cells; i++) {
      if (state.occ[i] === -1) return false;
    }
    return true;
  }

  function firstEndpointCell() {
    return state.endpoints[1] ? state.endpoints[1].a : 0;
  }

  /* ---------------- 撤销历史 ---------------- */

  function pushHistory() {
    var snap = { steps: state.steps, lines: {} };
    for (var label = 1; label <= state.pairs; label++) {
      snap.lines[label] = state.lines[label] ? state.lines[label].slice() : null;
    }
    history.push(snap);
    if (history.length > 80) history.shift();
  }

  function restoreHistory(snap) {
    for (var label = 1; label <= state.pairs; label++) {
      state.lines[label] = snap.lines[label] ? snap.lines[label].slice() : null;
    }
    state.steps = snap.steps;
    rebuildOcc();
  }

  /* ---------------- 画线交互 ---------------- */

  // 从某格起笔：端点→重画该线；已有线中间→截断到该处继续；空格→失败
  function beginStroke(cell) {
    if (state.status !== 'running') return false;
    if (cell < 0 || cell >= state.n * state.n) return false;

    var ea = state.endAt[cell];
    var label;
    if (ea > 0) {
      pushHistory();
      state.lines[ea] = [cell];
      rebuildOcc();
      dragging = { label: ea, done: false };
      sfx('tap');
      return true;
    }

    label = state.occ[cell];
    if (label > 0) {
      var ln = state.lines[label];
      var k = ln.indexOf(cell);
      if (k < 0) return false;
      pushHistory();
      state.lines[label] = ln.slice(0, k + 1);
      rebuildOcc();
      dragging = { label: label, done: false };
      sfx('tap');
      return true;
    }
    return false;
  }

  // 从当前线末端朝相邻格走一步（延伸或回退）
  function extendOne(next) {
    if (!dragging) return;
    var ln = state.lines[dragging.label];
    var last = ln[ln.length - 1];
    if (next === last) return;

    var ea = state.endAt[next];

    // 回退：拖回倒数第二格
    if (ln.length >= 2 && next === ln[ln.length - 2]) {
      ln.pop();
      dragging.done = false;
      rebuildOcc();
      state.steps = Math.max(0, state.steps - 1);
      sfx('tick');
      return;
    }

    // 已完成（到达另一端点）只允许回退
    if (dragging.done) return;

    // 别的端点：线不能盖住端点
    if (ea !== 0 && ea !== dragging.label) { warnToast('msg_invalid'); return; }
    // 自己的起点端点：不能绕回来连自己
    if (ea === dragging.label && next === ln[0]) { warnToast('msg_invalid'); return; }

    var ep = state.endpoints[dragging.label];
    var isOwnOtherEnd = (ea === dragging.label && next !== ln[0] &&
                         (next === ep.a || next === ep.b));

    // 已被占用的格子：自己的线=自交，别的线=被占
    if (state.occ[next] !== -1 && !isOwnOtherEnd) {
      warnToast(state.occ[next] === dragging.label ? 'msg_invalid' : 'msg_no_moves');
      return;
    }

    // 允许延伸
    ln.push(next);
    rebuildOcc();
    state.steps += 1;
    sfx('move');                 // 连线每走一格播轻量音

    if (isOwnOtherEnd) {
      dragging.done = true;
      sfx('coin');               // 连成一对
    }
  }

  // 把当前线末端逐格延伸到目标格（处理快速拖动跨多格的插值）
  function dragTo(cell) {
    if (!dragging || cell < 0) return;
    var guard = 0;
    while (guard++ < 400) {
      var ln = state.lines[dragging.label];
      var last = ln[ln.length - 1];
      if (last === cell) break;

      if (dragging.done) {
        // 已完成：只接受回退到倒数第二格
        if (ln.length >= 2 && ln[ln.length - 2] === cell) extendOne(cell);
        break;
      }

      var lr = rowOf(last), lc = colOf(last);
      var cr = rowOf(cell), cc = colOf(cell);
      var nr = lr, nc = lc;
      if (lc !== cc) nc = lc + (cc > lc ? 1 : -1);
      else if (lr !== cr) nr = lr + (cr > lr ? 1 : -1);
      else break;

      var before = ln.length;
      extendOne(idx(nr, nc));
      var after = state.lines[dragging.label].length;
      if (after === before && !dragging.done) break;   // 被拒绝，停止
    }
  }

  // 收笔：判定过关
  function endStroke() {
    if (!dragging) return;
    dragging = null;
    if (state.status === 'running' && isSolved()) {
      win();
    } else {
      saveState();
    }
    refreshHud();
    draw();
  }

  function eraseLineAt(cell) {
    if (state.status !== 'running' || cell < 0) return;
    var label = state.occ[cell];
    if (label <= 0) label = state.endAt[cell];
    if (label <= 0) return;
    pushHistory();
    state.lines[label] = null;
    rebuildOcc();
    sfx('clear');
    refreshHud();
    saveState();
    draw();
  }

  function clearAll() {
    if (state.status !== 'running' || !hasAnyLine()) return;
    pushHistory();
    for (var label = 1; label <= state.pairs; label++) state.lines[label] = null;
    rebuildOcc();
    sfx('clear');
    refreshHud();
    saveState();
    draw();
  }

  function undo() {
    if (state.status !== 'running' || !history.length) return;
    restoreHistory(history.pop());
    sfx('swap');
    refreshHud();
    saveState();
    draw();
  }

  function useHint() {
    if (state.status === 'ready') startGame();
    if (state.status !== 'running') return;
    if (state.hintsLeft <= 0) { sfx('warn'); return; }

    var candidates = [];
    for (var label = 1; label <= state.pairs; label++) {
      if (!lineComplete(label)) candidates.push(label);
    }
    if (!candidates.length) return;

    var pick = candidates[Math.floor(Math.random() * candidates.length)];
    state.hintsLeft -= 1;
    state.hintCells = state.solution[pick].slice();
    state.hintExpire = Date.now() + HINT_MS;
    sfx('select');
    refreshHud();
    saveState();
    draw();
  }

  /* ---------------- 绘制 ---------------- */

  function fitCanvas() {
    var rect = dom.canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.round(rect.height);
    if (!cssH || cssH < 10) cssH = cssW;

    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var pw = Math.round(cssW * dpr);
    var ph = Math.round(cssH * dpr);
    if (dom.canvas.width !== pw || dom.canvas.height !== ph) {
      dom.canvas.width = pw;
      dom.canvas.height = ph;
    }
    ctx = dom.canvas.getContext('2d');
    ctx.setTransform(pw / SIDE, 0, 0, ph / SIDE, 0, 0);
    draw();
  }

  function draw() {
    if (!ctx) return;
    var n = state.n;
    var cs = SIDE / n;
    var i;

    ctx.clearRect(0, 0, SIDE, SIDE);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, SIDE, SIDE);

    // 网格
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    for (i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, SIDE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(SIDE, i * cs); ctx.stroke();
    }

    if (state.hintCells && Date.now() < state.hintExpire) drawHint(cs);
    if (state.status === 'running' && !dragging) drawCursor(cs);

    for (i = 1; i <= state.pairs; i++) drawLine(i, cs);
    for (i = 1; i <= state.pairs; i++) drawEndpoints(i, cs);
  }

  function drawHint(cs) {
    ctx.fillStyle = 'rgba(107, 122, 194, .30)';
    for (var i = 0; i < state.hintCells.length; i++) {
      var cell = state.hintCells[i];
      ctx.beginPath();
      ctx.arc((colOf(cell) + 0.5) * cs, (rowOf(cell) + 0.5) * cs, cs * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCursor(cs) {
    var x = colOf(state.cursor) * cs;
    var y = rowOf(state.cursor) * cs;
    ctx.strokeStyle = 'rgba(69, 75, 89, .55)';
    ctx.lineWidth = Math.max(1.5, cs * 0.045);
    ctx.strokeRect(x + cs * 0.09, y + cs * 0.09, cs * 0.82, cs * 0.82);
  }

  function drawLine(label, cs) {
    var ln = state.lines[label];
    if (!ln || ln.length === 0) return;
    var color = colorOf(label);
    var complete = lineComplete(label);
    var i, cell, x, y;

    ctx.strokeStyle = color;
    ctx.lineWidth = cs * 0.42;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = complete ? 0.92 : 0.78;
    ctx.beginPath();
    for (i = 0; i < ln.length; i++) {
      cell = ln[i];
      x = (colOf(cell) + 0.5) * cs;
      y = (rowOf(cell) + 0.5) * cs;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 未完成的线末端画一个小圆点，提示可以从这里继续拖
    if (!complete && ln.length) {
      cell = ln[ln.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((colOf(cell) + 0.5) * cs, (rowOf(cell) + 0.5) * cs, cs * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEndpoints(label, cs) {
    var ep = state.endpoints[label];
    var cells = [ep.a, ep.b];
    var color = colorOf(label);
    var fs = Math.max(10, cs * 0.44);
    var font = '700 ' + fs.toFixed(1) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    var i, cell, x, y, rad;

    for (i = 0; i < 2; i++) {
      cell = cells[i];
      x = (colOf(cell) + 0.5) * cs;
      y = (rowOf(cell) + 0.5) * cs;
      rad = cs * 0.34;

      ctx.fillStyle = '#FFFDF8';
      ctx.beginPath(); ctx.arc(x, y, rad * 1.14, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(40, 36, 30, .14)';
      ctx.lineWidth = Math.max(1, cs * 0.03);
      ctx.stroke();

      // 白字 + 深色描边，任何底色上都清楚
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, cs * 0.055);
      ctx.strokeStyle = 'rgba(40, 36, 30, .55)';
      ctx.strokeText(String(label), x, y + cs * 0.02);
      ctx.fillStyle = '#FFFDF8';
      ctx.fillText(String(label), x, y + cs * 0.02);
    }
  }

  /* ---------------- 每帧推进（计时 + 提示过期） ---------------- */

  function loop(ts) {
    window.requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(ts - lastTs, 100) : 0;
    lastTs = ts;

    if (state.status === 'running') {
      var d = diffDef();
      if (d.timeLimit > 0) {
        state.timeLeft -= dt / 1000;
        if (state.timeLeft <= 0) {
          state.timeLeft = 0;
          updateTimeLabel();
          lose();
          return;
        }
        updateTimeLabel();
      } else {
        state.elapsed += dt / 1000;
        updateTimeLabel();
      }
      if (state.hintCells && Date.now() > state.hintExpire) {
        state.hintCells = null;
        draw();
      }
    }
  }

  /* ---------------- 提示气泡 ---------------- */

  // wrap=true 用于较长的提示条（如切换难度），允许换行、约 1.6 秒后消失
  function showToast(key, wrap) {
    lastToastKey = key;
    dom.toast.textContent = t(key);
    dom.toast.hidden = false;
    if (wrap) dom.toast.classList.add('is-wrap');
    else dom.toast.classList.remove('is-wrap');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      dom.toast.hidden = true;
      dom.toast.classList.remove('is-wrap');
    }, wrap ? 1600 : 1800);
  }

  function warnToast(key) {
    showToast(key);
    var now = Date.now();
    if (now - lastWarn > 220) {
      sfx('warn');
      lastWarn = now;
    }
  }

  /* ---------------- 记分板 / 卡片 / 结算 ---------------- */

  function refreshHud() {
    dom.score.textContent = String(state.score);
    dom.best.textContent = String(Math.max(state.bestAtStart, state.isRecord ? state.score : 0));
    dom.level.textContent = String(state.level);
    dom.pairs.textContent = connectedCount() + '/' + state.pairs;
    updateTimeLabel();
    syncButtons();
  }

  function updateTimeLabel() {
    var d = diffDef();
    dom.time.textContent = d.timeLimit > 0 ? fmtTime(state.timeLeft) : fmtTime(state.elapsed);
  }

  function syncDiffs() {
    var btns = dom.diffs.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === state.diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function syncButtons() {
    if (state.status === 'paused') setI18n(dom.btnPause, 'btn_resume');
    else setI18n(dom.btnPause, 'btn_pause');
    dom.btnPause.disabled = (state.status !== 'running' && state.status !== 'paused');

    var label = t('btn_hint');
    if (state.hintsLeft !== Infinity) label += ' (' + state.hintsLeft + ')';
    dom.btnHint.textContent = label;
    dom.btnHint.disabled = (state.status !== 'running' && state.status !== 'ready') || state.hintsLeft <= 0;

    dom.btnStartBar.disabled = (state.status !== 'ready');
    dom.btnUndo.disabled = (state.status !== 'running' || history.length === 0);
    dom.btnClear.disabled = (state.status !== 'running' || !hasAnyLine());
  }

  function showCard(kind) {
    dom.card.hidden = false;
    dom.card.dataset.kind = kind;
    if (kind === 'pause') {
      setI18n(dom.cardTitle, 'paused_title');
      dom.cardSub.hidden = true;
      setI18n(dom.btnStart, 'btn_resume');
    } else {
      setI18n(dom.cardTitle, 'game_title');
      dom.cardSub.hidden = false;
      setI18n(dom.cardSub, 'tagline');
      setI18n(dom.btnStart, 'btn_start');
    }
  }

  function hideCard() { dom.card.hidden = true; }
  function hideOverlay() { dom.overlay.hidden = true; }

  function renderResult() {
    if (state.status === 'win') setI18n(dom.overlayTitle, 'win_title');
    else setI18n(dom.overlayTitle, 'lose_title');

    // 带占位符的副标题一律 replace，页面/弹窗上不能残留花括号
    dom.overlaySub.textContent = tf(state.status === 'win' ? 'win_sub' : 'lose_sub', {
      level: state.level, score: state.score, steps: state.steps
    });
    dom.overlayScore.textContent = String(state.score);
    dom.overlayLevel.textContent = String(state.level);
    dom.recordBadge.hidden = !state.isRecord;
    dom.btnNext.hidden = (state.status !== 'win');
  }

  function showResult() {
    hideCard();
    renderResult();
    dom.overlay.hidden = false;
    if (typeof dom.overlay.scrollIntoView === 'function') {
      dom.overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ---------------- 得分 / 最佳 ---------------- */

  function readBest() {
    var b = readJSON(KEY_BEST, 0);
    return (typeof b === 'number' && b > 0) ? b : 0;
  }

  function saveBest(v) {
    if (v > readBest()) writeJSON(KEY_BEST, v);
  }

  function computeLevelScore() {
    var d = diffDef();
    var base = d.scoreBase * state.level;
    var pen = state.steps * d.stepPen;
    var bonus = (d.timeLimit > 0 && state.timeLeft > 0)
      ? Math.floor(state.timeLeft) * d.timeBonus : 0;
    return Math.max(0, Math.round(base - pen + bonus));
  }

  /* ---------------- 开局 / 状态切换 ---------------- */

  function setupLevel() {
    var d = diffDef();
    var n = gridSizeFor(state.level);
    var puzzle = makePuzzle(n, d.pairs);
    state.n = n;
    state.pairs = d.pairs;
    state.endpoints = puzzle.endpoints;
    state.endAt = puzzle.endAt;
    state.solution = puzzle.solution;
    state.lines = {};
    for (var label = 1; label <= state.pairs; label++) state.lines[label] = null;
    rebuildOcc();
    state.steps = 0;
    state.timeLeft = d.timeLimit;
    state.elapsed = 0;
    state.hintsLeft = d.hintLimit;
    state.hintCells = null;
    state.hintExpire = 0;
    state.cursor = firstEndpointCell();
    dragging = null;
    history = [];
  }

  function newGame() {
    state.level = 1;
    state.score = 0;
    state.isRecord = false;
    state.bestAtStart = readBest();
    setupLevel();
    state.status = 'ready';
    hideOverlay();
    showCard('ready');
    syncButtons();
    refreshHud();
    saveState(true);
    draw();
  }

  function startGame() {
    if (state.status !== 'ready') return;
    state.status = 'running';
    hideCard();
    syncButtons();
    sfx('start');
    saveState(true);
  }

  function togglePause() {
    if (state.status === 'running') {
      state.status = 'paused';
      showCard('pause');
      sfx('toggle');
      saveState(true);
    } else if (state.status === 'paused') {
      state.status = 'running';
      hideCard();
      sfx('toggle');
      saveState(true);
    }
    syncButtons();
  }

  function win() {
    state.score += computeLevelScore();
    state.status = 'win';
    sfx('win');
    if (state.score > state.bestAtStart) {
      state.isRecord = true;
      state.bestAtStart = state.score;
      saveBest(state.score);
      sfx('perfect');
    }
    refreshHud();
    showResult();
    saveState(true);
  }

  function lose() {
    state.status = 'lose';
    sfx('lose');
    refreshHud();
    showResult();
    saveState(true);
  }

  function nextLevel() {
    state.level += 1;
    setupLevel();
    state.status = 'ready';
    hideOverlay();
    showCard('ready');
    syncButtons();
    refreshHud();
    saveState(true);
    draw();
  }

  function switchDiff(diff) {
    if (!DIFF[diff]) return;                 // 非法档直接忽略
    // 幂等落盘：无论是否与当前难度相同，都先写 KEY_DIFF，
    // 保证回归脚本点击当前档时也能读到键；全程无任何阻塞式弹窗。
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) {}
    if (diff === state.diff) return;

    var inProgress = (state.status === 'running' || state.status === 'paused' ||
      (state.status === 'ready' && (state.steps > 0 || state.level > 1 || hasAnyLine())));
    // 有进度时仅用页面内提示条告知，随后照常重开新局。
    if (inProgress) showToast('confirm_diff', true);
    state.diff = diff;
    syncDiffs();
    sfx('toggle');
    newGame();
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    return {
      diff: state.diff,
      status: state.status,
      level: state.level,
      score: state.score,
      steps: state.steps,
      bestAtStart: state.bestAtStart,
      isRecord: state.isRecord,
      timeLeft: state.timeLeft,
      elapsed: state.elapsed,
      hintsLeft: state.hintsLeft,
      n: state.n,
      pairs: state.pairs,
      endpoints: state.endpoints,
      endAt: state.endAt,
      lines: state.lines,
      solution: state.solution,
      cursor: state.cursor
    };
  }

  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 200) return;
    lastSave = now;

    var root = readJSON(KEY_STATE, null);
    if (!root || root.v !== STATE_V || typeof root.data !== 'object' ||
        root.data === null || Array.isArray(root.data)) {
      root = { v: STATE_V, data: {} };
    }
    root.data[state.diff] = snapshot();
    writeJSON(KEY_STATE, root);
  }

  // 校验存档自洽性：尺寸、端点、解、线，任何一项不符就视为损坏
  function validSave(s) {
    if (!s || typeof s !== 'object') return false;
    var n = s.n;
    if (typeof n !== 'number' || Math.floor(n) !== n || n < 5 || n > 15) return false;
    var cells = n * n;
    if (!Array.isArray(s.endAt) || s.endAt.length !== cells) return false;
    if (!s.endpoints || typeof s.endpoints !== 'object') return false;
    if (!s.solution || typeof s.solution !== 'object') return false;
    if (!s.lines || typeof s.lines !== 'object') return false;
    if (typeof s.pairs !== 'number' || Math.floor(s.pairs) !== s.pairs ||
        s.pairs < 2 || s.pairs > 10) return false;
    if (typeof s.level !== 'number' || s.level < 1) return false;

    var label, i, ep, sol, ln, cell;
    var seen = {};
    var total = 0;
    for (label = 1; label <= s.pairs; label++) {
      ep = s.endpoints[label];
      if (!ep || typeof ep.a !== 'number' || typeof ep.b !== 'number') return false;
      if (ep.a < 0 || ep.a >= cells || ep.b < 0 || ep.b >= cells || ep.a === ep.b) return false;
      if (s.endAt[ep.a] !== label || s.endAt[ep.b] !== label) return false;

      sol = s.solution[label];
      if (!Array.isArray(sol) || sol.length < 2) return false;
      for (i = 0; i < sol.length; i++) {
        cell = sol[i];
        if (typeof cell !== 'number' || cell < 0 || cell >= cells) return false;
        if (seen[cell]) return false;         // 标准解不能重叠
        seen[cell] = 1;
      }
      total += sol.length;

      ln = s.lines[label];
      if (ln !== null && !Array.isArray(ln)) return false;
      if (Array.isArray(ln)) {
        for (i = 0; i < ln.length; i++) {
          cell = ln[i];
          if (typeof cell !== 'number' || cell < 0 || cell >= cells) return false;
        }
      }
    }
    if (total !== cells) return false;        // 标准解必须铺满全盘
    return true;
  }

  function loadState() {
    var root = readJSON(KEY_STATE, null);
    if (!root || root.v !== STATE_V || !root.data || typeof root.data !== 'object') return false;

    var s = root.data[state.diff];
    if (!validSave(s)) return false;

    state.n = s.n;
    state.pairs = s.pairs;
    state.endpoints = s.endpoints;
    state.endAt = s.endAt;
    state.solution = s.solution;
    state.lines = s.lines;
    state.level = s.level;
    state.score = (typeof s.score === 'number') ? s.score : 0;
    state.steps = (typeof s.steps === 'number') ? s.steps : 0;
    state.timeLeft = (typeof s.timeLeft === 'number') ? s.timeLeft : diffDef().timeLimit;
    state.elapsed = (typeof s.elapsed === 'number') ? s.elapsed : 0;
    state.hintsLeft = (typeof s.hintsLeft === 'number') ? s.hintsLeft : diffDef().hintLimit;
    state.bestAtStart = (typeof s.bestAtStart === 'number') ? s.bestAtStart : readBest();
    state.isRecord = !!s.isRecord;
    state.hintCells = null;
    state.hintExpire = 0;
    state.cursor = (typeof s.cursor === 'number' && s.cursor >= 0 && s.cursor < state.n * state.n)
      ? s.cursor : firstEndpointCell();
    dragging = null;
    history = [];
    rebuildOcc();

    if (s.status === 'win' || s.status === 'lose') {
      state.status = s.status;
      showResult();
    } else if (s.status === 'paused' || s.status === 'running') {
      // 离开期间一律回到可手动继续的暂停态，避免计时偷偷跑
      state.status = 'paused';
      showCard('pause');
      hideOverlay();
    } else {
      state.status = 'ready';
      showCard('ready');
      hideOverlay();
    }
    syncButtons();
    refreshHud();
    return true;
  }

  /* ---------------- 输入 ---------------- */

  function cellFromEvent(e) {
    var rect = dom.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    var lx = (e.clientX - rect.left) / rect.width * SIDE;
    var ly = (e.clientY - rect.top) / rect.height * SIDE;
    var cs = SIDE / state.n;
    var c = Math.floor(lx / cs);
    var r = Math.floor(ly / cs);
    if (r < 0 || c < 0 || r >= state.n || c >= state.n) return -1;
    return idx(r, c);
  }

  function resetPointer() {
    pointerActive = false;
    strokeStarted = false;
    consumed = false;
    downCell = -1;
    longPressArmed = false;
    window.clearTimeout(longPressTimer);
  }

  function bindInput() {
    // 指针按下：只记录起点，真正起笔推迟到首次移动，便于干净地判定长按擦除
    dom.canvas.addEventListener('pointerdown', function (e) {
      if (state.status !== 'running') return;
      if (e.button === 2) return;                 // 右键交给 contextmenu
      var cell = cellFromEvent(e);
      if (cell < 0) return;

      resetPointer();
      pointerActive = true;
      downCell = cell;

      var lab = state.occ[cell] > 0 ? state.occ[cell] : 0;
      var preLen = (lab > 0 && state.lines[lab]) ? state.lines[lab].length : 0;
      longPressArmed = (preLen > 1);             // 只在按下前该格属于实体线时才允许长按擦除

      longPressTimer = window.setTimeout(function () {
        if (strokeStarted || consumed || !pointerActive) return;
        if (!longPressArmed) return;
        eraseLineAt(downCell);
        consumed = true;
        dragging = null;
        draw();
      }, LONG_PRESS_MS);

      if (dom.canvas.setPointerCapture && e.pointerId != null) {
        try { dom.canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });

    // 移动：首次移动时从起点起笔，再逐格延伸；轻扫也能补齐跨过的格子
    document.addEventListener('pointermove', function (e) {
      if (!pointerActive || consumed || state.status !== 'running') return;
      var cell = cellFromEvent(e);
      if (cell < 0) return;
      if (!strokeStarted) {
        window.clearTimeout(longPressTimer);     // 一旦移动就不再算长按
        strokeStarted = true;
        beginStroke(downCell);
      }
      if (dragging) {
        dragTo(cell);
        refreshHud();
        draw();
      }
    });

    function onPointerEnd() {
      if (!pointerActive) return;
      window.clearTimeout(longPressTimer);
      if (!consumed && strokeStarted && dragging) endStroke();
      resetPointer();
    }
    document.addEventListener('pointerup', onPointerEnd);
    document.addEventListener('pointercancel', onPointerEnd);

    // 右键擦除整条线
    dom.canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (state.status !== 'running') return;
      eraseLineAt(cellFromEvent(e));
    });

    // 按钮
    function startAction() {
      sfx('click');
      if (state.status === 'paused') togglePause();
      else if (state.status === 'ready') startGame();
    }
    dom.btnStart.addEventListener('click', startAction);
    dom.btnStartBar.addEventListener('click', startAction);

    dom.btnPause.addEventListener('click', function () { sfx('click'); togglePause(); });
    dom.btnHint.addEventListener('click', function () { sfx('click'); useHint(); });
    dom.btnUndo.addEventListener('click', function () { sfx('click'); undo(); });
    dom.btnClear.addEventListener('click', function () { sfx('click'); clearAll(); });
    dom.btnRestart.addEventListener('click', function () { sfx('click'); newGame(); });
    dom.btnAgain.addEventListener('click', function () { sfx('click'); newGame(); });
    dom.btnNext.addEventListener('click', function () { sfx('click'); nextLevel(); });

    dom.diffs.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
      if (!btn || !dom.diffs.contains(btn)) return;
      switchDiff(btn.getAttribute('data-diff'));
    });

    // 键盘：P / 空格 开始或暂停；方向键移动光标（起笔后逐格延伸）；Enter 落笔 / 收笔
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      var k = e.key;

      if (k === ' ' || k === 'Spacebar' || k === 'p' || k === 'P') {
        if ((k === ' ' || k === 'Spacebar') && (tag === 'BUTTON' || tag === 'A')) return;
        e.preventDefault();
        if (state.status === 'running' || state.status === 'paused') togglePause();
        else if (state.status === 'ready') startGame();
        return;
      }
      if (state.status !== 'running') return;

      var dr = 0, dc = 0;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') dr = -1;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') dr = 1;
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') dc = -1;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') dc = 1;
      else if (k === 'Enter') {
        e.preventDefault();
        if (dragging) endStroke();
        else beginStroke(state.cursor);
        refreshHud();
        draw();
        return;
      } else return;

      e.preventDefault();
      var cr = rowOf(state.cursor), cc = colOf(state.cursor);
      var nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nc < 0 || nr >= state.n || nc >= state.n) return;
      var target = idx(nr, nc);
      if (dragging) {
        dragTo(target);
        var ln = state.lines[dragging.label];
        state.cursor = ln[ln.length - 1];
      } else {
        state.cursor = target;
      }
      refreshHud();
      draw();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (state.status === 'running') togglePause();
        resetPointer();
        saveState(true);
      }
    });
    window.addEventListener('pagehide', function () { saveState(true); });
    window.addEventListener('resize', fitCanvas);
    if (window.ResizeObserver) {
      new window.ResizeObserver(fitCanvas).observe(dom.canvas.parentNode);
    }
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    dom = {
      canvas: document.getElementById('canvas'),
      score: document.getElementById('score'),
      best: document.getElementById('best'),
      level: document.getElementById('level'),
      time: document.getElementById('time'),
      pairs: document.getElementById('pairs'),
      diffs: document.getElementById('diffs'),
      btnStartBar: document.getElementById('btn-start-bar'),
      btnUndo: document.getElementById('btn-undo'),
      btnClear: document.getElementById('btn-clear'),
      btnHint: document.getElementById('btn-hint'),
      btnPause: document.getElementById('btn-pause'),
      btnRestart: document.getElementById('btn-restart'),
      btnStart: document.getElementById('btn-start'),
      btnAgain: document.getElementById('btn-again'),
      btnNext: document.getElementById('btn-next'),
      card: document.getElementById('card'),
      cardTitle: document.getElementById('card-title'),
      cardSub: document.getElementById('card-sub'),
      toast: document.getElementById('toast'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlaySub: document.getElementById('overlay-sub'),
      overlayScore: document.getElementById('overlay-score'),
      overlayLevel: document.getElementById('overlay-level'),
      recordBadge: document.getElementById('record-badge')
    };

    var savedDiff = null;
    try { savedDiff = window.localStorage.getItem(KEY_DIFF); } catch (e) {}
    if (savedDiff && DIFF[savedDiff]) state.diff = savedDiff;

    syncDiffs();
    if (!loadState()) newGame();

    fitCanvas();
    bindInput();
    window.requestAnimationFrame(loop);

    document.addEventListener('ys:langchange', function () {
      syncDiffs();
      syncButtons();
      if (!dom.card.hidden) showCard(dom.card.dataset.kind || 'ready');
      if (!dom.overlay.hidden) renderResult();
      if (!dom.toast.hidden) dom.toast.textContent = t(lastToastKey);
      refreshHud();
      draw();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
