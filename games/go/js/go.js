/* ==========================================================================
   围棋 / Go · 游戏逻辑
   - 纯 ES5：IIFE + var + 'use strict'，不拆任何纯逻辑文件
   - Canvas 2D 原创绘制木色棋盘、星位、黑白子与阴影，零图片 / 字体 / 外链
   - 核心规则全档一致：横竖相邻同色成块、气尽提子、简单劫禁着（不能立刻回提）、
     自杀点禁着、停一手、双方连续停手后按「围地 + 提子 + 贴目」点目定胜负
     （空点用洪泛法连通分块，只看能到达哪方棋子，靠外沿又不挨子的大空算公气）
   - 三档真实拉开（棋盘尺寸是主要手段）：
       easy   9×9  局部启发（提子 / 接回气少块 + 少量随机），悔棋不限，提示不限，贴目 0.5
       medium 13×13 候选点上一层评估（气 / 提子 / 连接 / 边角），悔棋 3，提示不限，贴目 5.5
       hard   19×19 加领地影响 + 更多候选（限制 44 个 + 思考时间预算），悔棋 1，提示 3，贴目 6.5
   - 自动存档（ysgame-go-state 含完整棋盘）、难度（ysgame-go-diff）、最佳（ysgame-go-best）
   - 切档（含点到当前同档）先幂等写盘，再用页面内 toast 提示，绝不用 window.confirm
   - 统一走全站音效引擎 window.YSound.play（只用白名单音色）
   - window.__GO_RULES__ 暴露纯规则函数，供自动化自测直接用
   [gyh 2026-11-10 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var LOG = 600;                 // 逻辑画布边长（正方形）
  var PAD = 34;                  // 棋盘边距（逻辑）
  var STATE_V = 1;
  var BLACK = 1, WHITE = 2, EMPTY = 0;
  var KEY_STATE = 'ysgame-go-state';
  var KEY_DIFF = 'ysgame-go-diff';
  var KEY_BEST = 'ysgame-go-best';
  var FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

  /* 三档难度：棋盘路数 / 贴目 / 悔棋 / 提示 / AI 参数，全部写进常量
     [gyh 2026-11-10 新增] */
  var DIFF = {
    easy: {
      N: 9, komi: 0.5, undo: -1, hints: -1,
      delay: 280, candidates: 0, randomness: 0.0,
      localOnly: true, influence: false, timeBudget: 35
    },
    medium: {
      N: 13, komi: 5.5, undo: 3, hints: -1,
      delay: 420, candidates: 0, randomness: 0.15,
      localOnly: false, influence: false, timeBudget: 60
    },
    hard: {
      N: 19, komi: 6.5, undo: 1, hints: 3,
      delay: 520, candidates: 44, randomness: 0.05,
      localOnly: false, influence: true, timeBudget: 70
    }
  };

  /* ---------------- 纯规则层（无 DOM / 无状态，供自测直接调用） ----------------
     [gyh 2026-11-10 新增] */
  var Rules = (function () {
    'use strict';

    function idx(N, x, y) { return y * N + x; }
    function xy(N, i) { return { x: i % N, y: Math.floor(i / N) }; }

    function neighbors(N, i) {
      var x = i % N, y = Math.floor(i / N), r = [];
      if (x > 0) r.push(i - 1);
      if (x < N - 1) r.push(i + 1);
      if (y > 0) r.push(i - N);
      if (y < N - 1) r.push(i + N);
      return r;
    }

    function uniq(arr) {
      var seen = {}, out = [], k, i;
      for (i = 0; i < arr.length; i++) {
        k = String(arr[i]);
        if (!seen[k]) { seen[k] = 1; out.push(arr[i]); }
      }
      return out;
    }

    /* 洪泛：从 i 出发找同色连通块，并收集它所有的「气」（相邻空点） */
    function group(board, N, i) {
      var color = board[i];
      var seen = {}, stones = [], libs = [], stack = [i], cur, ns, n, j;
      while (stack.length) {
        cur = stack.pop();
        if (seen[cur]) continue;
        seen[cur] = 1;
        stones.push(cur);
        ns = neighbors(N, cur);
        for (j = 0; j < ns.length; j++) {
          n = ns[j];
          if (board[n] === EMPTY) libs.push(n);
          else if (board[n] === color && !seen[n]) stack.push(n);
        }
      }
      return { stones: stones, liberties: uniq(libs) };
    }

    function fail(board, reason) {
      return { ok: false, reason: reason, board: board, koPoint: -1, captured: 0, atari: false };
    }

    /* 尝试落子：返回新棋盘 / 新劫点 / 提子数 / 是否打吃；非法时不改动原盘
       color: 1 黑 / 2 白；koPoint: 上一手形成的禁着点（-1 表示无） */
    function attempt(board, N, x, y, color, koPoint) {
      if (x < 0 || y < 0 || x >= N || y >= N) return fail(board, 'invalid');
      var i = idx(N, x, y);
      if (board[i] !== EMPTY) return fail(board, 'occupied');
      if (koPoint >= 0 && i === koPoint) return fail(board, 'ko');

      var nb = board.slice(0);
      nb[i] = color;
      var opp = color === BLACK ? WHITE : BLACK;
      var ns = neighbors(N, i);
      var captured = 0, single = -1, g, s, k, n;

      /* 提掉四邻中气已尽的敌方块 */
      for (k = 0; k < ns.length; k++) {
        n = ns[k];
        if (nb[n] !== opp) continue;
        g = group(nb, N, n);
        if (g.liberties.length === 0) {
          if (g.stones.length === 1) single = g.stones[0];
          for (s = 0; s < g.stones.length; s++) nb[g.stones[s]] = EMPTY;
          captured += g.stones.length;
        }
      }

      var mine = group(nb, N, i);
      /* 落子后自己仍无气（且没提到子）＝自杀，禁着 */
      if (mine.liberties.length === 0) return fail(board, 'suicide');

      /* 简单劫：恰好提一子 + 自己是单子单气，则被提点成为下一手禁着点
         （下一手立刻回提会还原局面，故禁止；间隔一手后 koPoint 会被自然清掉） */
      var newKo = -1;
      if (captured === 1 && single >= 0 && mine.stones.length === 1 && mine.liberties.length === 1) {
        newKo = single;
      }

      /* 打吃：落子后任一相邻敌块仅剩一气 */
      var atari = false;
      for (k = 0; k < ns.length; k++) {
        n = ns[k];
        if (nb[n] === opp) {
          g = group(nb, N, n);
          if (g.liberties.length === 1) { atari = true; break; }
        }
      }
      return { ok: true, reason: '', board: nb, koPoint: newKo, captured: captured, atari: atari };
    }

    /* 洪泛法数空：连通空区只挨黑 / 只挨白才算对应方的地，
       既挨两方或谁都不挨（可达棋盘外沿的大空）都是公气，不计入任何一方 */
    function territory(board, N) {
      var seen = [], i, stack, cur, ns, k, n, region, touchB, touchW, black = 0, white = 0;
      for (i = 0; i < board.length; i++) {
        if (board[i] !== EMPTY || seen[i]) continue;
        stack = [i]; region = 0; touchB = false; touchW = false;
        while (stack.length) {
          cur = stack.pop();
          if (seen[cur]) continue;
          seen[cur] = 1;
          region++;
          ns = neighbors(N, cur);
          for (k = 0; k < ns.length; k++) {
            n = ns[k];
            if (board[n] === EMPTY) { if (!seen[n]) stack.push(n); }
            else if (board[n] === BLACK) touchB = true;
            else touchW = true;
          }
        }
        if (touchB && !touchW) black += region;
        else if (touchW && !touchB) white += region;
      }
      return { black: black, white: white };
    }

    function createBoard(N) {
      var b = [], i;
      for (i = 0; i < N * N; i++) b.push(EMPTY);
      return b;
    }

    return {
      idx: idx, xy: xy, neighbors: neighbors, group: group,
      attempt: attempt, territory: territory, createBoard: createBoard
    };
  })();

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium', N: 13, board: [], turn: BLACK, status: 'ready',
    koPoint: -1, capB: 0, capW: 0, moves: 0, passCount: 0,
    lastMove: -1, lastColor: 0, undoLeft: 3, hintLeft: -1, hintCell: -1,
    history: [], accumMs: 0, runStart: 0,
    aiThinking: false, aiTimer: 0, result: null,
    best: 0, bestAtStart: 0, isRecord: false
  };

  var dom = {};
  var ctx = null;
  var toastTimer = 0;
  var tickerId = 0;
  var hoverCell = null;

  /* ---------------- 小工具 ---------------- */

  function $(id) { return document.getElementById(id); }
  function t(key) { return window.I18N ? window.I18N.t(key) : key; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v, def) {
    return (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.floor(v) : def;
  }
  function diffDef() { return DIFF[state.diff] || DIFF.medium; }
  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  function readJSON(key, fallback) {
    try { var raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式忽略 */ }
  }

  function setI18n(el, key) {
    if (!el) return;
    el.setAttribute('data-i18n', key);
    el.textContent = t(key);
  }

  /* 音效：只用引擎白名单音色，go 主题由 body[data-dict=ggo] 自动匹配
     [gyh 2026-11-10 新增] */
  function sfx(name) { if (window.YSound) window.YSound.play(name); }

  /* 计时（wall clock，暂停 / 结束分段累计） */
  function elapsedMs() {
    return state.accumMs + (state.status === 'running' && state.runStart ? (Date.now() - state.runStart) : 0);
  }
  function startClock() { if (!state.runStart) state.runStart = Date.now(); }
  function stopClock() {
    if (state.runStart) { state.accumMs += Date.now() - state.runStart; state.runStart = 0; }
  }
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------------- 最佳记录 ---------------- */

  function ensureBest() {
    try {
      if (window.localStorage.getItem(KEY_BEST) === null) window.localStorage.setItem(KEY_BEST, '0');
    } catch (e) { /* ignore */ }
  }
  function readBest() {
    try {
      var n = Number(window.localStorage.getItem(KEY_BEST));
      return (isFinite(n) && n > 0) ? n : 0;
    } catch (e) { return 0; }
  }
  function writeBest(n) {
    try { window.localStorage.setItem(KEY_BEST, String(n)); } catch (e) { /* ignore */ }
  }

  /* ---------------- 页面内 toast（切档提示必须在清场之后显示） ----------------
     [gyh 2026-11-10 新增] */
  function clearToast() {
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = 0; }
    if (dom.toast) { dom.toast.hidden = true; dom.toast.textContent = ''; }
  }
  function showToast(text, ms) {
    clearToast();
    dom.toast.textContent = text;
    dom.toast.hidden = false;
    toastTimer = window.setTimeout(function () { toastTimer = 0; clearToast(); }, ms || 1200);
  }

  /* ---------------- canvas 尺寸 / DPR ---------------- */

  function fitCanvas() {
    var rect = dom.canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.round(rect.height);
    if (!cssH || cssH < 10) cssH = cssW;
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    if (dom.canvas.width !== pw || dom.canvas.height !== ph) {
      dom.canvas.width = pw;
      dom.canvas.height = ph;
    }
    ctx = dom.canvas.getContext('2d');
    if (ctx) ctx.setTransform(pw / LOG, 0, 0, ph / LOG, 0, 0);
  }

  function cellSize() { return (LOG - 2 * PAD) / (state.N - 1); }

  /* 事件坐标 → 最近交叉点；带容差，19 路在 320px 下也能点准
     [gyh 2026-11-10 新增] */
  function eventCell(e) {
    var rect = dom.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var lx = (e.clientX - rect.left) / rect.width * LOG;
    var ly = (e.clientY - rect.top) / rect.height * LOG;
    var cell = cellSize();
    var x = Math.round((lx - PAD) / cell);
    var y = Math.round((ly - PAD) / cell);
    if (x < 0 || y < 0 || x >= state.N || y >= state.N) return null;
    if (Math.abs(lx - (PAD + x * cell)) > cell * 0.55 ||
        Math.abs(ly - (PAD + y * cell)) > cell * 0.55) return null;
    return { x: x, y: y };
  }

  /* ---------------- 星位 / 边角价值 / 影响 ---------------- */

  function starPoints(N) {
    if (N === 9) return [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];
    if (N === 13) return [[3, 3], [3, 6], [3, 9], [6, 3], [6, 6], [6, 9], [9, 3], [9, 6], [9, 9]];
    return [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
  }

  function edgeValue(N, x, y) {
    var d = Math.min(x, y, N - 1 - x, N - 1 - y);
    if (d === 0) return -2;
    if (d === 1) return 1;
    if (d === 2) return 4;
    if (d === 3) return 3;
    return 2;
  }

  /* 轻量领地影响：候选点周围 5×5 的子力对比，越近权重越大
     [gyh 2026-11-10 新增] */
  function influence(board, N, i, color) {
    var x = i % N, y = Math.floor(i / N), dx, dy, nx, ny, v, w, sum = 0;
    for (dy = -2; dy <= 2; dy++) {
      for (dx = -2; dx <= 2; dx++) {
        nx = x + dx; ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        v = board[ny * N + nx];
        w = 6 - Math.abs(dx) - Math.abs(dy);
        if (v === color) sum += w;
        else if (v !== EMPTY) sum -= w;
      }
    }
    return sum;
  }

  function hasStoneNeighbor(board, N, i) {
    var x = i % N, y = Math.floor(i / N), dx, dy, nx, ny;
    for (dy = -1; dy <= 1; dy++) {
      for (dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        nx = x + dx; ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < N && ny < N && board[ny * N + nx] !== EMPTY) return true;
      }
    }
    return false;
  }

  /* ---------------- 绘制 ---------------- */

  function drawStone(cx, cy, r, color) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#1A1206';
    ctx.beginPath(); ctx.arc(cx + 1.4, cy + 2.4, r * 0.98, 0, 6.2832); ctx.fill();
    ctx.restore();

    var g = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.4, r * 0.12, cx, cy, r);
    if (color === BLACK) {
      g.addColorStop(0, '#5B5B60'); g.addColorStop(0.5, '#242428'); g.addColorStop(1, '#08080A');
    } else {
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.55, '#F6F3EA'); g.addColorStop(1, '#CBC4B2');
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = color === BLACK ? 'rgba(0,0,0,.55)' : 'rgba(90,80,60,.45)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = color === BLACK ? 0.42 : 0.7;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.36, r * 0.2, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawBoardBG() {
    var g = ctx.createLinearGradient(0, 0, 0, LOG);
    g.addColorStop(0, '#E7C07A'); g.addColorStop(1, '#D2A052');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LOG, LOG);
    ctx.save();
    ctx.strokeStyle = 'rgba(120,80,30,.07)';
    ctx.lineWidth = 2;
    var wy;
    for (wy = 18; wy < LOG; wy += 26) {
      ctx.beginPath();
      ctx.moveTo(0, wy);
      ctx.bezierCurveTo(LOG * 0.3, wy + 4, LOG * 0.65, wy - 4, LOG, wy + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGrid(cell) {
    var i, p, sp;
    ctx.strokeStyle = 'rgba(74,52,26,.85)';
    for (i = 0; i < state.N; i++) {
      p = PAD + i * cell;
      ctx.lineWidth = (i === 0 || i === state.N - 1) ? 2.2 : 1.25;
      ctx.beginPath(); ctx.moveTo(PAD, p); ctx.lineTo(LOG - PAD, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, PAD); ctx.lineTo(p, LOG - PAD); ctx.stroke();
    }
    sp = starPoints(state.N);
    ctx.fillStyle = 'rgba(74,52,26,.9)';
    for (i = 0; i < sp.length; i++) {
      ctx.beginPath();
      ctx.arc(PAD + sp[i][0] * cell, PAD + sp[i][1] * cell, Math.max(2.2, cell * 0.09), 0, 6.2832);
      ctx.fill();
    }
  }

  function drawInfoBar() {
    var y = LOG - 13, d = diffDef();
    ctx.save();
    ctx.font = '600 12px ' + FONT;
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = state.turn === BLACK ? '#16161A' : '#FFFDF8';
    ctx.strokeStyle = 'rgba(74,52,26,.85)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(PAD + 4, y - 4, 5, 0, 6.2832); ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'rgba(70,48,22,.85)';
    ctx.textAlign = 'center';
    ctx.fillText(state.N + '\u00D7' + state.N + '  \u00B7  K ' + d.komi, LOG / 2, y);

    ctx.textAlign = 'right';
    var u = d.undo < 0 ? '\u221E' : String(state.undoLeft);
    var h = d.hints < 0 ? '\u221E' : String(state.hintLeft);
    ctx.fillText('\u21B6 ' + u + '   \u2726 ' + h, LOG - PAD, y);
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    var cell = cellSize(), i, p, r, q, s, seen, g;
    ctx.clearRect(0, 0, LOG, LOG);
    drawBoardBG();
    drawGrid(cell);

    /* 棋子 */
    r = cell * 0.46;
    for (i = 0; i < state.board.length; i++) {
      if (state.board[i] === EMPTY) continue;
      p = Rules.xy(state.N, i);
      drawStone(PAD + p.x * cell, PAD + p.y * cell, r, state.board[i]);
    }

    /* 最后落子标记：与子反色的小圆环 */
    if (state.lastMove >= 0 && state.lastMove < state.board.length && state.board[state.lastMove] !== EMPTY) {
      p = Rules.xy(state.N, state.lastMove);
      ctx.strokeStyle = state.board[state.lastMove] === BLACK ? 'rgba(255,253,248,.9)' : 'rgba(30,30,34,.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(PAD + p.x * cell, PAD + p.y * cell, cell * 0.2, 0, 6.2832); ctx.stroke();
    }

    /* easy：气的提示——只剩一口气的块，子上点一个小红点
       [gyh 2026-11-10 新增] */
    if (state.diff === 'easy') {
      seen = [];
      for (i = 0; i < state.board.length; i++) {
        if (state.board[i] === EMPTY || seen[i]) continue;
        g = Rules.group(state.board, state.N, i);
        for (s = 0; s < g.stones.length; s++) seen[g.stones[s]] = 1;
        if (g.liberties.length === 1) {
          ctx.fillStyle = '#E2574C';
          for (s = 0; s < g.stones.length; s++) {
            q = Rules.xy(state.N, g.stones[s]);
            ctx.beginPath();
            ctx.arc(PAD + q.x * cell, PAD + q.y * cell, cell * 0.14, 0, 6.2832);
            ctx.fill();
          }
        }
      }
    }

    /* 提示点 */
    if (state.hintCell >= 0 && state.hintCell < state.board.length && state.board[state.hintCell] === EMPTY) {
      q = Rules.xy(state.N, state.hintCell);
      ctx.save();
      ctx.strokeStyle = '#FFE9A8';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(PAD + q.x * cell, PAD + q.y * cell, cell * 0.42, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#20243B';
      ctx.beginPath(); ctx.arc(PAD + q.x * cell, PAD + q.y * cell, cell * 0.34, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    /* 悬停预览（桌面） */
    if (hoverCell && state.status === 'running' && state.turn === BLACK && !state.aiThinking &&
        state.board[hoverCell.i] === EMPTY) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#111114';
      ctx.beginPath();
      ctx.arc(PAD + hoverCell.x * cell, PAD + hoverCell.y * cell, r, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    drawInfoBar();
  }

  /* ---------------- 记分板 / 卡片 / 结算 ---------------- */

  function refreshHud() {
    var terr = Rules.territory(state.board, state.N);
    var lead = terr.black - terr.white + state.capB - state.capW - diffDef().komi;
    var leadTxt = (lead > 0 ? '+' : '') + (Math.round(lead * 10) / 10);
    dom.hudTerritory.textContent = leadTxt;
    dom.hudCaptures.textContent = String(state.capB);
    dom.hudMoves.textContent = String(state.moves);
    dom.hudTime.textContent = fmtTime(elapsedMs());
  }

  function syncDiffs() {
    var btns = dom.diffs.querySelectorAll('.seg__btn'), i, on;
    for (i = 0; i < btns.length; i++) {
      on = btns[i].getAttribute('data-diff') === state.diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function syncButtons() {
    setI18n(dom.btnPause, state.status === 'paused' ? 'btn_resume' : 'btn_pause');
  }

  function updateHintMeta() {
    var d = diffDef();
    var u = d.undo < 0 ? '\u221E' : String(state.undoLeft);
    var h = d.hints < 0 ? '\u221E' : String(state.hintLeft);
    dom.hintMeta.textContent = state.N + '\u00D7' + state.N + ' \u00B7 komi ' + d.komi +
      ' \u00B7 \u21B6 ' + u + ' \u00B7 \u2726 ' + h;
  }

  function showCard(kind) {
    dom.card.hidden = false;
    dom.card.setAttribute('data-kind', kind);
    if (kind === 'paused') {
      setI18n(dom.cardTitle, 'paused_title');
      dom.cardSub.hidden = true;
      setI18n(dom.btnStartCard, 'btn_resume');
    } else {
      setI18n(dom.cardTitle, 'game_title');
      dom.cardSub.hidden = false;
      setI18n(dom.cardSub, 'tagline');
      setI18n(dom.btnStartCard, 'btn_start');
    }
  }
  function hideCard() { dom.card.hidden = true; }
  function hideOverlay() { dom.overlay.hidden = true; }

  /* 结算：win_sub / lose_sub 的 {score} 一律 .replace() 后再显示
     [gyh 2026-11-10 新增] */
  function renderResult() {
    var r = state.result || { win: false, score: 0 };
    setI18n(dom.overlayTitle, r.win ? 'win_title' : 'lose_title');
    var sub = t(r.win ? 'win_sub' : 'lose_sub');
    dom.overlaySub.textContent = sub.replace(/\{score\}/g, String(r.score));
    dom.overlayMoves.textContent = String(state.moves);
    dom.recordBadge.hidden = !state.isRecord;
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    return {
      v: STATE_V, diff: state.diff, N: state.N,
      board: state.board.slice(0),
      turn: state.turn, status: state.status, ended: state.status === 'gameover',
      koPoint: state.koPoint, capB: state.capB, capW: state.capW,
      moves: state.moves, passCount: state.passCount,
      lastMove: state.lastMove, lastColor: state.lastColor,
      undoLeft: state.undoLeft, hintLeft: state.hintLeft,
      elapsed: Math.floor(elapsedMs() / 1000),
      best: state.best, isRecord: state.isRecord, result: state.result
    };
  }
  function saveState() { writeJSON(KEY_STATE, snapshot()); }

  function loadState() {
    var s = readJSON(KEY_STATE, null);
    if (!s || typeof s !== 'object' || s.v !== STATE_V) return false;
    if (s.diff !== state.diff) return false;
    var d = diffDef();
    if (s.N !== d.N || !Array.isArray(s.board) || s.board.length !== d.N * d.N) return false;
    var i, b;
    for (i = 0; i < s.board.length; i++) {
      b = s.board[i];
      if (b !== EMPTY && b !== BLACK && b !== WHITE) return false;
    }
    if (s.ended || s.status === 'gameover') return false;

    state.N = d.N;
    state.board = s.board.slice(0);
    state.turn = s.turn === WHITE ? WHITE : BLACK;
    state.koPoint = typeof s.koPoint === 'number' ? s.koPoint : -1;
    state.capB = num(s.capB, 0);
    state.capW = num(s.capW, 0);
    state.moves = num(s.moves, 0);
    state.passCount = num(s.passCount, 0);
    state.lastMove = typeof s.lastMove === 'number' ? s.lastMove : -1;
    state.lastColor = typeof s.lastColor === 'number' ? s.lastColor : 0;
    state.undoLeft = typeof s.undoLeft === 'number' ? s.undoLeft : d.undo;
    state.hintLeft = typeof s.hintLeft === 'number' ? s.hintLeft : d.hints;
    state.hintCell = -1;
    state.history = [];
    state.accumMs = (typeof s.elapsed === 'number' && s.elapsed > 0) ? s.elapsed * 1000 : 0;
    state.runStart = 0;
    state.aiThinking = false;
    state.result = null;
    state.isRecord = false;
    state.bestAtStart = state.best;
    hoverCell = null;

    /* 刷新后停在暂停卡：局面完整，点「继续」即可，不自动落子 */
    state.status = 'paused';
    hideOverlay();
    dom.recordBadge.hidden = true;
    showCard('paused');
    syncButtons();
    refreshHud();
    updateHintMeta();
    return true;
  }

  /* ---------------- 开局 / 状态切换 ---------------- */

  function newGame() {
    cancelAi();
    clearToast();
    var d = diffDef();
    state.N = d.N;
    state.board = Rules.createBoard(state.N);
    state.turn = BLACK;
    state.status = 'ready';
    state.koPoint = -1;
    state.capB = 0; state.capW = 0; state.moves = 0; state.passCount = 0;
    state.lastMove = -1; state.lastColor = 0;
    state.undoLeft = d.undo; state.hintLeft = d.hints; state.hintCell = -1;
    state.history = [];
    state.accumMs = 0; state.runStart = 0;
    state.aiThinking = false; state.result = null; state.isRecord = false;
    state.bestAtStart = state.best;
    hoverCell = null;

    hideOverlay();
    dom.recordBadge.hidden = true;
    showCard('ready');
    syncButtons();
    refreshHud();
    updateHintMeta();
    fitCanvas();
    draw();
    saveState();                 // 开局即写入存档（含完整棋盘）
  }

  function start() {
    if (state.status !== 'ready') return;
    state.status = 'running';
    startClock();
    hideCard();
    syncButtons();
    sfx('start');
    draw();
    saveState();
  }

  function pause() {
    if (state.status !== 'running') return;
    stopClock();
    state.status = 'paused';
    cancelAi();
    showCard('paused');
    syncButtons();
    draw();
    saveState();
  }

  function resume() {
    if (state.status !== 'paused') return;
    state.status = 'running';
    startClock();
    hideCard();
    syncButtons();
    sfx('click');
    if (state.turn === WHITE && !state.aiThinking) {
      state.aiThinking = true;
      scheduleAi();
    }
    draw();
    saveState();
  }

  function restart() { newGame(); start(); }

  /* 点目结算：双方连续停手（或到达手数上限）后调用
     [gyh 2026-11-10 新增] */
  function endGame() {
    if (state.status === 'gameover') return;
    cancelAi();
    stopClock();
    var terr = Rules.territory(state.board, state.N);
    var komi = diffDef().komi;
    var b = terr.black + state.capB;
    var w = terr.white + state.capW + komi;
    var delta = Math.round((b - w) * 10) / 10;
    var win = delta > 0;
    state.status = 'gameover';
    state.result = {
      win: win, score: Math.abs(delta), diff: delta,
      black: b, white: w, territoryB: terr.black, territoryW: terr.white
    };
    state.isRecord = false;
    if (win && delta > state.best) {
      state.best = delta;
      writeBest(state.best);
      state.isRecord = true;
    }
    showToast(t('msg_score'), 1200);
    sfx(win ? 'win' : 'lose');
    if (state.isRecord) sfx('perfect');
    hideCard();
    renderResult();
    dom.overlay.hidden = false;
    syncButtons();
    refreshHud();
    draw();
    saveState();
  }

  /* ---------------- 落子 / 停一手 / 悔棋 / 提示 ---------------- */

  function applyMove(r, color, x, y) {
    state.board = r.board;
    state.koPoint = r.koPoint;
    state.lastMove = Rules.idx(state.N, x, y);
    state.lastColor = color;
    state.moves++;
    state.passCount = 0;
    state.hintCell = -1;
  }

  function pushHistory() {
    state.history.push({
      board: state.board.slice(0), koPoint: state.koPoint,
      capB: state.capB, capW: state.capW, moves: state.moves,
      passCount: state.passCount, lastMove: state.lastMove, lastColor: state.lastColor
    });
    if (state.history.length > 40) state.history.shift();
  }

  function doPlayerMove(x, y) {
    if (state.status !== 'running' || state.turn !== BLACK || state.aiThinking) return;
    var r = Rules.attempt(state.board, state.N, x, y, BLACK, state.koPoint);
    if (!r.ok) {
      if (r.reason === 'ko') { showToast(t('msg_ko'), 1500); sfx('warn'); }
      else if (r.reason === 'suicide') { showToast(t('msg_suicide'), 1500); sfx('warn'); }
      else if (r.reason === 'invalid') { showToast(t('msg_invalid'), 1200); sfx('warn'); }
      return;                       /* occupied 静默忽略 */
    }
    pushHistory();
    applyMove(r, BLACK, x, y);
    state.capB += r.captured;
    sfx('place');
    if (r.captured > 0) { showToast(t('msg_capture') + ' ' + r.captured, 900); sfx('coin'); }
    else if (r.atari) { showToast(t('msg_atari'), 900); sfx('warn'); }
    state.turn = WHITE;
    state.aiThinking = true;
    draw();
    refreshHud();
    saveState();
    scheduleAi();
  }

  function doPass() {
    if (state.status !== 'running' || state.turn !== BLACK || state.aiThinking) return;
    pushHistory();
    state.passCount++;
    state.koPoint = -1;             /* 停一手清除劫 */
    state.lastMove = -1;
    state.hintCell = -1;
    state.turn = WHITE;
    showToast(t('msg_pass'), 900);
    sfx('tap');
    state.aiThinking = true;
    draw();
    refreshHud();
    saveState();
    scheduleAi();
  }

  function doUndo() {
    if (state.status !== 'running' && state.status !== 'paused') return;
    if (state.undoLeft === 0 || !state.history.length) { sfx('warn'); return; }
    cancelAi();
    var h = state.history.pop();
    state.board = h.board;
    state.koPoint = h.koPoint;
    state.capB = h.capB; state.capW = h.capW;
    state.moves = h.moves; state.passCount = h.passCount;
    state.lastMove = h.lastMove; state.lastColor = h.lastColor;
    state.turn = BLACK;
    state.hintCell = -1;
    if (state.undoLeft > 0) state.undoLeft--;
    sfx('click');
    draw();
    refreshHud();
    saveState();
  }

  /* ---------------- AI ---------------- */

  function scheduleAi() {
    cancelAi();
    state.aiTimer = window.setTimeout(function () {
      state.aiTimer = 0;
      aiMove();
    }, diffDef().delay);
  }
  function cancelAi() {
    if (state.aiTimer) { window.clearTimeout(state.aiTimer); state.aiTimer = 0; }
    state.aiThinking = false;
  }

  /* 合法候选点：与子力相邻的空点 + 星位；用 attempt 过滤打劫 / 自杀 / 占用
     [gyh 2026-11-10 新增] */
  function legalCandidates(board, N, color, koPoint, limit) {
    var pts = [], seen = [], i, k, pi, sp, p, r, legal = [], scored, tmp;
    for (i = 0; i < board.length; i++) {
      if (board[i] === EMPTY && hasStoneNeighbor(board, N, i) && !seen[i]) {
        seen[i] = 1; pts.push(i);
      }
    }
    sp = starPoints(N);
    for (k = 0; k < sp.length; k++) {
      pi = sp[k][1] * N + sp[k][0];
      if (pi >= 0 && pi < board.length && board[pi] === EMPTY && !seen[pi]) {
        seen[pi] = 1; pts.push(pi);
      }
    }
    if (pts.length < 6) {                 /* 全空开局：补中心附近 */
      pi = Math.floor(N / 2) * N + Math.floor(N / 2);
      if (pi >= 0 && pi < board.length && board[pi] === EMPTY && !seen[pi]) {
        seen[pi] = 1; pts.push(pi);
      }
    }
    if (limit > 0 && pts.length > limit) {   /* hard：粗排后截断候选，控制思考时间 */
      scored = [];
      for (k = 0; k < pts.length; k++) {
        p = Rules.xy(N, pts[k]);
        scored.push({ i: pts[k], s: edgeValue(N, p.x, p.y) + Math.random() * 1.5 });
      }
      scored.sort(function (a, b) { return b.s - a.s; });
      tmp = [];
      for (k = 0; k < limit && k < scored.length; k++) tmp.push(scored[k].i);
      pts = tmp;
    }
    for (k = 0; k < pts.length; k++) {
      p = Rules.xy(N, pts[k]);
      r = Rules.attempt(board, N, p.x, p.y, color, koPoint);
      if (r.ok) legal.push({ x: p.x, y: p.y, i: pts[k], r: r });
    }
    return legal;
  }

  /* 接回气少块：该点落子后，附近原本气 <= 2 的己方块气数增加量
     [gyh 2026-11-10 新增] */
  function rescue(board, N, i, color, after) {
    var ns = Rules.neighbors(N, i), k, n, before, aft, sum = 0;
    for (k = 0; k < ns.length; k++) {
      n = ns[k];
      if (board[n] !== color) continue;
      before = Rules.group(board, N, n).liberties.length;
      aft = Rules.group(after, N, n).liberties.length;
      if (before <= 2 && aft > before) sum += aft - before;
    }
    return sum;
  }

  function evalCandidate(c, color, d, board, N) {
    var r = c.r, i = c.i, mine = Rules.group(r.board, N, i), score = 0;
    if (d.localOnly) {                 /* easy：局部启发 + 少量随机 */
      score += r.captured * 80;
      if (r.atari) score += 14;
      score += rescue(board, N, i, color, r.board) * 24;
      score += edgeValue(N, c.x, c.y) * 2;
      score += Math.random() * 28;
      return score;
    }
    /* medium / hard：一层评估（气 / 提子 / 连接 / 逼气 / 边角） */
    score += r.captured * 60;
    if (r.atari) score += 18;
    score += Math.min(mine.liberties.length, 8) * 2;
    var ns = Rules.neighbors(N, i), k, n, g, friendly = 0, minEnemy = 9;
    for (k = 0; k < ns.length; k++) {
      n = ns[k];
      if (r.board[n] === color) friendly++;
      else if (r.board[n] !== EMPTY) {
        g = Rules.group(r.board, N, n);
        if (g.liberties.length < minEnemy) minEnemy = g.liberties.length;
      }
    }
    score += friendly * 3;
    if (minEnemy < 9) score += (5 - minEnemy) * 4;
    score += edgeValue(N, c.x, c.y) * 3;
    if (mine.liberties.length <= 1 && r.captured === 0) score -= 28;  /* 自紧气 / 填眼 */
    if (d.influence) score += influence(board, N, i, color) * 1.2;     /* hard：领地影响 */
    score += (Math.random() - 0.5) * d.randomness * 40;
    return score;
  }

  function bestMove(color, d) {
    var legal = legalCandidates(state.board, state.N, color, state.koPoint, d.candidates);
    if (!legal.length) return null;
    var best = null, bestScore = -Infinity, t0 = nowMs(), k, sc;
    for (k = 0; k < legal.length; k++) {
      if (nowMs() - t0 > d.timeBudget) break;      /* 思考时间预算，19 路也不卡死 */
      sc = evalCandidate(legal[k], color, d, state.board, state.N);
      if (sc > bestScore) { bestScore = sc; best = legal[k]; }
    }
    if (!best) best = legal[0];
    /* 收官：所有点都是坏点则停一手，促成「双方连续停手」结束 */
    if (bestScore < -6 && state.moves > state.N * state.N * 0.7) return null;
    return { x: best.x, y: best.y, score: bestScore };
  }

  function aiMove() {
    state.aiThinking = false;
    state.aiTimer = 0;
    if (state.status !== 'running' || state.turn !== WHITE) return;

    var mv = bestMove(WHITE, diffDef());
    if (!mv) {
      state.passCount++;
      showToast(t('msg_no_moves'), 1000);
      state.turn = BLACK;
      if (state.passCount >= 2) { endGame(); return; }
      draw(); refreshHud(); saveState();
      return;
    }
    var r = Rules.attempt(state.board, state.N, mv.x, mv.y, WHITE, state.koPoint);
    if (!r.ok) {                       /* 理论不会发生，保守当作停一手 */
      state.passCount++;
      state.turn = BLACK;
      if (state.passCount >= 2) { endGame(); return; }
      draw(); saveState();
      return;
    }
    applyMove(r, WHITE, mv.x, mv.y);
    state.capW += r.captured;
    sfx('place');
    if (r.captured > 0) { showToast(t('msg_capture') + ' ' + r.captured, 900); sfx('coin'); }
    state.turn = BLACK;
    state.passCount = 0;
    draw();
    refreshHud();
    saveState();
    if (state.moves >= state.N * state.N * 2) endGame();   /* 手数上限兜底 */
  }

  function doHint() {
    if (state.status !== 'running' || state.turn !== BLACK || state.aiThinking) return;
    if (state.hintLeft === 0) { sfx('warn'); return; }
    var d = diffDef();
    var mv = bestMove(BLACK, d);
    if (!mv) { showToast(t('msg_no_moves'), 1000); return; }
    state.hintCell = Rules.idx(state.N, mv.x, mv.y);
    if (state.hintLeft > 0) state.hintLeft--;
    sfx('tick');
    draw();
    refreshHud();
    updateHintMeta();
    saveState();
  }

  /* ---------------- 切档：幂等落盘 + 清场后 toast，绝不用 window.confirm ----------------
     [gyh 2026-11-10 新增] */
  function stopLoops() {
    cancelAi();
    clearToast();
  }
  function switchDiff(diff) {
    if (!DIFF[diff]) return;
    /* 无论是否同档，第一步就幂等写盘 */
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) { /* ignore */ }
    if (diff !== state.diff) {
      stopLoops();                    /* 先清 AI / 旧 toast */
      state.diff = diff;
      syncDiffs();
      sfx('toggle');
      newGame();                      /* 清场 + 重开到 ready */
    } else {
      syncDiffs();
      sfx('select');
    }
    /* 提示条必须在 newGame()/清场之后显示，否则会被清掉 */
    showToast(t('confirm_diff'), 2400);
  }

  /* ---------------- 输入 ---------------- */

  function bindInput() {
    dom.canvas.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;       /* 只响应左键 / 触屏 */
      var c = eventCell(e);
      if (c) doPlayerMove(c.x, c.y);
    });
    dom.canvas.addEventListener('pointermove', function (e) {
      var c = (state.status === 'running' && state.turn === BLACK && !state.aiThinking) ? eventCell(e) : null;
      var ni = c ? Rules.idx(state.N, c.x, c.y) : -1;
      var ok = c && state.board[ni] === EMPTY;
      var next = ok ? { x: c.x, y: c.y, i: ni } : null;
      var cur = next ? next.i : -1, prev = hoverCell ? hoverCell.i : -1;
      hoverCell = next;
      if (cur !== prev) draw();
    });
    dom.canvas.addEventListener('pointerleave', function () {
      if (hoverCell) { hoverCell = null; draw(); }
    });

    dom.btnStart.addEventListener('click', function () {
      saveState();                    /* 点击后立即写断点存档 */
      sfx('click');
      if (state.status === 'ready') start();
      else if (state.status === 'paused') resume();
      else if (state.status === 'gameover') restart();
      /* running：只写盘，不重开 */
    });
    dom.btnStartCard.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'paused') resume();
      else if (state.status === 'ready') start();
      else if (state.status === 'gameover') restart();
    });
    dom.btnPause.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'running') pause();
      else if (state.status === 'paused') resume();
    });
    dom.btnRestart.addEventListener('click', function () { sfx('click'); restart(); });
    dom.btnAgain.addEventListener('click', function () { sfx('click'); restart(); });
    dom.btnUndo.addEventListener('click', function () { doUndo(); });
    dom.btnHint.addEventListener('click', function () { doHint(); });
    dom.btnPass.addEventListener('click', function () { doPass(); });

    dom.diffs.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
      if (btn && dom.diffs.contains(btn)) switchDiff(btn.getAttribute('data-diff'));
    });
    dom.overlay.addEventListener('click', function (e) {
      if (e.target === dom.overlay) dom.overlay.hidden = true;
    });

    function onResize() { fitCanvas(); draw(); }
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) { new window.ResizeObserver(onResize).observe(dom.stageWrap); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) saveState(); });
    window.addEventListener('pagehide', function () { saveState(); });
  }

  function onLangChange() {
    clearToast();
    syncButtons();
    if (!dom.card.hidden) showCard(dom.card.getAttribute('data-kind') || 'ready');
    if (!dom.overlay.hidden) renderResult();
    refreshHud();
    updateHintMeta();
    draw();
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    dom = {
      canvas: $('canvas'),
      stageWrap: $('stage-wrap'),
      diffs: $('diffs'),
      btnStart: $('btn-start'),
      btnPause: $('btn-pause'),
      btnRestart: $('btn-restart'),
      btnUndo: $('btn-undo'),
      btnHint: $('btn-hint'),
      btnPass: $('btn-pass'),
      btnStartCard: $('btn-start-card'),
      btnAgain: $('btn-again'),
      card: $('card'),
      cardTitle: $('card-title'),
      cardSub: $('card-sub'),
      overlay: $('overlay'),
      overlayTitle: $('overlay-title'),
      overlaySub: $('overlay-sub'),
      overlayMoves: $('overlay-moves'),
      recordBadge: $('record-badge'),
      toast: $('toast'),
      hudTerritory: $('hud-territory'),
      hudCaptures: $('hud-captures'),
      hudMoves: $('hud-moves'),
      hudTime: $('hud-time'),
      hintMeta: $('hint-meta')
    };

    var savedDiff = null;
    try { savedDiff = window.localStorage.getItem(KEY_DIFF); } catch (e) { /* ignore */ }
    if (savedDiff && DIFF[savedDiff]) state.diff = savedDiff;

    ensureBest();
    state.best = readBest();
    try { window.localStorage.setItem(KEY_DIFF, state.diff); } catch (e) { /* 开局即落盘 */ }

    syncDiffs();
    if (!loadState()) newGame();

    fitCanvas();
    bindInput();
    tickerId = window.setInterval(function () {
      if (state.status === 'running') dom.hudTime.textContent = fmtTime(elapsedMs());
    }, 250);

    document.addEventListener('ys:langchange', onLangChange);
    onLangChange();                  /* 补一遍动态文案（I18N.apply 已先跑过） */
  }

  /* 暴露纯规则层，供自动化自测直接调用（不构成额外交付文件）
     [gyh 2026-11-10 新增] */
  window.__GO_RULES__ = Rules;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
