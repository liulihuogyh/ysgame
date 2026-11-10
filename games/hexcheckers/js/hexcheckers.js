/* ==========================================================================
   跳棋 / Hex Checkers · 游戏逻辑
   - 纯 ES5（IIFE + var + 'use strict'），Canvas 2D 原创几何绘制，无任何外链资源
   - 棋盘：cube 坐标 (x+y+z=0)，中央正六边形（半径 4，61 孔）+ 六个三角营区
     （各 10 孔），共 121 孔标准六角星；玩家占下方营区，目标正对面上方营区
   - 走法：6 方向相邻步；或隔任意一颗相邻棋子跳到正后方空孔，落点可继续
     起跳形成连跳（BFS 求连跳可达集，中途不混用相邻步）
   - 终点禁区：其它四个角营区只允许「经过」不允许作为回合终点，保证收敛；
     进入自己目标营区的棋子锁定，胜负必然收敛
   - 三档真实拉开：子数 6/10/10、悔棋 不限/3/1、提示 不限/不限/3、
     计时 无/有/有、AI 贪心 / 最长连跳+前进 / 整齐度+堵跳板+1 层对手预测
   - 自动存档 ysgame-hexcheckers-state / -diff / -best，开局即落盘，刷新恢复
   - 切档用页面内 .bk__toast 显示 confirm_diff，且在 newGame() 清场之后显示
   - 音效统一走 window.YSound.play，只用白名单音色
   [gyh 2026-11-10 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var W = 480;
  var H = 440;
  var S = 15;                       // 六角网格基准尺寸（相邻孔中心距 = sqrt(3)*S）
  var SQ3 = Math.sqrt(3);
  var CX = W / 2;
  var CY = H / 2;
  var CELL_R = 7.2;                 // 孔半径
  var MARBLE_R = 9.6;               // 玻璃珠半径
  var TOL = S * 1.7;                // 点击容差（逻辑像素），覆盖一个孔的邻域
  var STATE_V = 1;
  var HUMAN = 1;
  var AI = 2;

  var KEY_STATE = 'ysgame-hexcheckers-state';
  var KEY_DIFF = 'ysgame-hexcheckers-diff';
  var KEY_BEST = 'ysgame-hexcheckers-best';

  /* ---------------- 三档难度（数值严格拉开、可量化） ----------------
     [gyh 2026-11-10 新增] 每档参数都在 DIFF 里，玩法与 AI 读取同一份定义 */
  var DIFF = {
    // 简单：6 子（1+2+3）、悔棋不限、始终高亮全部可达点、无计时、AI 贪心
    easy: {
      pieces: 6, undo: -1, hints: -1, timer: false,
      ai: 'greedy', alwaysHighlight: true, maxCand: 36, timeCap: 70
    },
    // 中等：10 子（1+2+3+4）、悔棋 3、可达点高亮、记步数与用时、AI 最长连跳+前进
    medium: {
      pieces: 10, undo: 3, hints: -1, timer: true,
      ai: 'jump', alwaysHighlight: false, maxCand: 48, timeCap: 90
    },
    // 困难：10 子、悔棋 1、提示每局 3 次、记步数与用时、AI 加整齐度+堵跳板+1 层预测
    hard: {
      pieces: 10, undo: 1, hints: 3, timer: true,
      ai: 'predict', alwaysHighlight: false, maxCand: 40, timeCap: 110,
      replyCap: 16, topN: 14
    }
  };

  /* ---------------- 原创几何配色 ---------------- */
  var COLORS = {
    human: { light: '#DDF3EE', base: '#7FC8B0', dark: '#3C7A69' },
    ai: { light: '#FBD3C4', base: '#F2A38B', dark: '#A45443' }
  };

  // 六个三角营区的三个极点（尖端 + 底边两端），用于绘制营区底色
  var CAMP_TRI = {
    S:  [[-4, -4, 8], [-4, -1, 5], [-1, -4, 5]],
    N:  [[4, 4, -8], [4, 1, -5], [1, 4, -5]],
    XP: [[8, -4, -4], [5, -4, -1], [5, -1, -4]],
    XN: [[-8, 4, 4], [-5, 1, 4], [-5, 4, 1]],
    YP: [[-4, 8, -4], [-4, 5, -1], [-1, 5, -4]],
    YN: [[4, -8, 4], [4, -5, 1], [1, -5, 4]]
  };

  /* ======================================================================
     纯逻辑层：棋盘 / 邻居 / 跳跃 / BFS 连跳可达集
     [gyh 2026-11-10 新增] 同一文件内暴露 window.__hexRules__ 供纯逻辑自测，
     绝不拆成第 4 个交付文件
     ====================================================================== */

  var DIRS = [
    [1, -1, 0], [1, 0, -1], [0, 1, -1],
    [-1, 1, 0], [-1, 0, 1], [0, -1, 1]
  ];

  var CELLS = [];        // [{x,y,z}] 共 121
  var KEY = {};          // "x,y,z" -> index
  var NB = [];           // NB[i][d] 相邻格 index / -1
  var JL = [];           // JL[i][d] 跳过 NB[i][d] 后的落点 index / -1
  var CAMP = [];         // 每格所属营区
  var S_CELLS = [];      // 下方营区（玩家起点 / AI 目标）
  var N_CELLS = [];      // 上方营区（AI 起点 / 玩家目标）
  var OTHER_CELLS = [];  // 其余四个角营区（禁止作为终点）

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // 六角星 = 两个边长 13 的大三角形（各 91 孔）叠加，交集为中央六边形 61 孔
  function inStar(x, y, z) {
    return (x <= 4 && y <= 4 && z <= 4) || (x >= -4 && y >= -4 && z >= -4);
  }

  function campOf(c) {
    if (c.z <= -5) return 'N';
    if (c.z >= 5) return 'S';
    if (c.x <= -5) return 'XN';
    if (c.x >= 5) return 'XP';
    if (c.y <= -5) return 'YN';
    if (c.y >= 5) return 'YP';
    return 'C';
  }

  function buildBoard() {
    var x, y, z, i, d, nx, ny, nz, ox, oy, oz, oi, li, k;
    for (x = -8; x <= 8; x++) {
      for (y = -8; y <= 8; y++) {
        z = -x - y;
        if (z < -8 || z > 8) continue;
        if (!inStar(x, y, z)) continue;
        KEY[x + ',' + y + ',' + z] = CELLS.length;
        CELLS.push({ x: x, y: y, z: z });
      }
    }
    for (i = 0; i < CELLS.length; i++) {
      NB[i] = [];
      JL[i] = [];
      for (d = 0; d < 6; d++) {
        nx = CELLS[i].x + DIRS[d][0];
        ny = CELLS[i].y + DIRS[d][1];
        nz = CELLS[i].z + DIRS[d][2];
        oi = KEY[nx + ',' + ny + ',' + nz];
        if (oi === undefined) { NB[i][d] = -1; JL[i][d] = -1; continue; }
        NB[i][d] = oi;
        ox = nx + DIRS[d][0];
        oy = ny + DIRS[d][1];
        oz = nz + DIRS[d][2];
        li = KEY[ox + ',' + oy + ',' + oz];
        JL[i][d] = (li === undefined) ? -1 : li;
      }
      CAMP[i] = campOf(CELLS[i]);
      if (CAMP[i] === 'S') S_CELLS.push(i);
      else if (CAMP[i] === 'N') N_CELLS.push(i);
      else if (CAMP[i] !== 'C') OTHER_CELLS.push(i);
    }
  }

  // 终点禁区：其它四个角营区只允许经过，不允许作为回合终点（保证胜负收敛）
  function terminalAllowed(i) {
    return CAMP[i] === 'C' || CAMP[i] === 'S' || CAMP[i] === 'N';
  }

  /* [gyh 2026-11-10 新增] BFS 连跳可达集：
     从 from 起，沿 6 方向跨过任意一颗相邻棋子落到空孔，落点继续起跳；
     visited 防环，guard 防病态数据；中途绝不混入相邻步。 */
  function jumpTargets(b, from) {
    var res = {}, seen = {}, q = [{ c: from, p: [] }], head = 0, guard = 0;
    var cur, d, over, land, np, k;
    seen[from] = true;
    while (head < q.length && guard < 4000) {
      guard++;
      cur = q[head++];
      for (d = 0; d < 6; d++) {
        over = NB[cur.c][d];
        land = JL[cur.c][d];
        if (over < 0 || land < 0) continue;
        if (b[over] === 0) continue;      // 跳板必须是任意一颗棋子
        if (b[land] !== 0) continue;      // 落点必须为空
        if (seen[land]) continue;
        seen[land] = true;
        np = cur.p.concat([land]);
        res[land] = np;
        q.push({ c: land, p: np });
      }
    }
    return res;
  }

  // 某颗棋子的完整可达集：相邻步（hops=0）+ 连跳落点（hops=路径长度）
  function legalMoves(boardArr, from) {
    var b = boardArr.slice();
    b[from] = 0;                          // 棋子被「拿起」，起点视为空
    var all = {}, d, n, jumps, k, i;
    for (d = 0; d < 6; d++) {
      n = NB[from][d];
      if (n >= 0 && b[n] === 0 && terminalAllowed(n)) {
        all[n] = { hops: 0, path: [n], via: 'step' };
      }
    }
    jumps = jumpTargets(b, from);
    for (k in jumps) {
      if (!hasOwn(jumps, k)) continue;
      i = parseInt(k, 10);
      if (!terminalAllowed(i)) continue; // 禁区只允许经过，不作终点
      all[i] = { hops: jumps[k].length, path: jumps[k], via: 'jump' };
    }
    return all;
  }

  buildBoard();

  var RULES = {
    CELLS: CELLS, NB: NB, JL: JL, CAMP: CAMP, DIRS: DIRS,
    S: S_CELLS, N: N_CELLS, OTHER: OTHER_CELLS,
    cellIndex: function (x, y, z) {
      var k = KEY[x + ',' + y + ',' + z];
      return k === undefined ? -1 : k;
    },
    campOf: campOf,
    terminalAllowed: terminalAllowed,
    jumpTargets: jumpTargets,
    legalMoves: legalMoves
  };
  window.__hexRules__ = RULES;

  /* ---------------- 状态 ---------------- */

  var board = [];                 // 长度 121：0 空 / 1 玩家 / 2 AI
  var state = {
    diff: 'medium',
    status: 'ready',              // ready | playing | paused | over
    turn: 'human',                // human | ai
    moves: 0,
    aiMoves: 0,
    maxHops: 0,
    time: 0,
    undoLeft: 3,
    hintsLeft: 999,
    history: [],
    selected: -1,
    reachable: {},
    hint: null,
    trail: null,
    winner: 0,                   // 0 未分 / 1 玩家 / 2 AI
    isRecord: false,
    best: 0,
    passStreak: 0
  };

  var dom = {};
  var ctx = null;
  var STARS = [];
  var timers = [];
  var rafId = 0;
  var loopRunning = false;
  var lastTs = 0;
  var hudTs = 0;
  var lastSave = 0;
  var lastSfx = {};
  var aiTimer = 0;
  var toastTimer = 0;
  var toastKey = null;

  /* ---------------- 小工具 ---------------- */

  function $(id) { return document.getElementById(id); }
  function t(key) { return window.I18N ? window.I18N.t(key) : key; }
  function tf(key, map) {
    var s = t(key), k;
    for (k in map) {
      if (hasOwn(map, k)) s = s.split('{' + k + '}').join(String(map[k]));
    }
    return s;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v, d) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : d; }
  function diffDef() { return DIFF[state.diff] || DIFF.medium; }
  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }
  function readJSON(k, f) {
    try { var raw = window.localStorage.getItem(k); return raw ? JSON.parse(raw) : f; }
    catch (e) { return f; }
  }
  function writeJSON(k, v) {
    try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function setI18n(el, key) {
    if (!el) return;
    el.setAttribute('data-i18n', key);
    el.textContent = t(key);
  }
  function sfx(name, throttle) {
    if (!window.YSound) return;
    var now = nowMs();
    if (throttle) {
      if (lastSfx[name] && now - lastSfx[name] < throttle) return;
      lastSfx[name] = now;
    }
    window.YSound.play(name);
  }
  function later(fn, ms) {
    var id = window.setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  }
  function fmtTime(sec) {
    var s = Math.floor(sec), m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  /* [gyh 2026-11-10 新增] 页面内 toast：固定 #toast（.bk__toast），
     切档时先清场隐藏、重开之后再显示，避免被 newGame() 清掉 */
  function showToast(text, ms, key) {
    toastKey = key || null;
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      var i = timers.indexOf(toastTimer);
      if (i >= 0) timers.splice(i, 1);
      toastTimer = 0;
    }
    if (!dom.toast) return;
    dom.toast.textContent = text;
    dom.toast.hidden = false;
    toastTimer = later(function () {
      toastTimer = 0;
      dom.toast.hidden = true;
      toastKey = null;
    }, ms || 1200);
  }
  function showToastKey(key, ms) { showToast(t(key), ms, key); }

  /* ---------------- 最佳记录 ---------------- */

  function ensureBest() {
    try {
      if (window.localStorage.getItem(KEY_BEST) === null) {
        window.localStorage.setItem(KEY_BEST, '0');
      }
    } catch (e) { /* ignore */ }
  }
  function readBest() {
    try {
      var n = Number(window.localStorage.getItem(KEY_BEST));
      return (isFinite(n) && n > 0) ? Math.floor(n) : 0;
    } catch (e) { return 0; }
  }
  function writeBest(n) {
    try { window.localStorage.setItem(KEY_BEST, String(Math.floor(n))); } catch (e) { /* ignore */ }
  }

  /* ---------------- 局面封装 ---------------- */

  /* [gyh 2026-11-10 新增] easy 六子布局：仍在下方三角营区内（1+2+3 六子的
     三角阵型），刻意留出一处跳板链空位，保证开局就能走出真实连跳（hops>=2），
     不让简单档的连跳沦为空摆设。AI 起点取中心对称镜像。 */
  var EASY_S = [
    [-4, -4, 8], [-4, -3, 7], [-3, -4, 7],
    [-4, -2, 6], [-3, -3, 6], [-1, -4, 5]
  ];

  function startCells(side) {
    var camp = side === 'human' ? S_CELLS : N_CELLS;
    var n = diffDef().pieces, i, c, idx, out = [];
    if (n === 6) {
      for (i = 0; i < EASY_S.length; i++) {
        c = EASY_S[i];
        idx = side === 'human'
          ? RULES.cellIndex(c[0], c[1], c[2])
          : RULES.cellIndex(-c[0], -c[1], -c[2]);
        if (idx >= 0) out.push(idx);
      }
      return out;
    }
    if (n >= camp.length) return camp.slice();
    var arr = camp.slice();
    // 取靠近尖端的 n 个孔（|z| 最大）
    arr.sort(function (a, b) { return Math.abs(CELLS[b].z) - Math.abs(CELLS[a].z); });
    return arr.slice(0, n);
  }
  function targetCells(side) { return side === 'human' ? N_CELLS : S_CELLS; }
  function inTarget(i, side) {
    return side === 'human' ? CAMP[i] === 'N' : CAMP[i] === 'S';
  }
  function movablePieces(side, b) {
    var v = side === 'human' ? HUMAN : AI, r = [], i;
    for (i = 0; i < b.length; i++) {
      if (b[i] === v && !inTarget(i, side)) r.push(i); // 目标营区内的子锁定
    }
    return r;
  }
  function progress(i, side) { return side === 'human' ? -CELLS[i].z : CELLS[i].z; }
  function applyMove(b, from, to) {
    var v = b[from];
    b[to] = v;
    b[from] = 0;
    return b;
  }
  function allMoves(side, b) {
    var out = [], ps = movablePieces(side, b), i, k, mv, to;
    for (i = 0; i < ps.length; i++) {
      mv = legalMoves(b, ps[i]);
      for (k in mv) {
        if (!hasOwn(mv, k)) continue;
        to = parseInt(k, 10);
        out.push({
          from: ps[i], to: to, hops: mv[to].hops,
          path: mv[to].path, via: mv[to].via
        });
      }
    }
    return out;
  }
  function checkWin(side, b) {
    var v = side === 'human' ? HUMAN : AI, i;
    for (i = 0; i < b.length; i++) {
      if (b[i] === v && !inTarget(i, side)) return false;
    }
    return true;
  }
  function progressSum(side, b) {
    var v = side === 'human' ? HUMAN : AI, sum = 0, i;
    for (i = 0; i < b.length; i++) if (b[i] === v) sum += progress(i, side);
    return sum;
  }

  /* ======================================================================
     AI：三档各自真实不同的评估，且都有节点 / 时间上限防卡死
     [gyh 2026-11-10 新增]
     ====================================================================== */

  function quickScore(b, m, side) {
    return (progress(m.to, side) - progress(m.from, side)) +
      m.hops * 2 + (inTarget(m.to, side) ? 20 : 0);
  }
  // 营区排布整齐度：目标营区里己方棋子数 + 平均深入程度（hard 用）
  function tidyScore(b, side) {
    var tgt = targetCells(side), v = side === 'human' ? HUMAN : AI;
    var cnt = 0, depth = 0, i;
    for (i = 0; i < tgt.length; i++) {
      if (b[tgt[i]] === v) { cnt++; depth += Math.abs(CELLS[tgt[i]].z) - 4; }
    }
    return cnt * 4 + (cnt ? depth / cnt : 0);
  }
  // 堵住对手跳板：对手可用连跳点越少越好（hard 用）
  function blockScore(b, side) {
    var opp = side === 'human' ? 'ai' : 'human';
    var moves = allMoves(opp, b), pts = 0, i;
    for (i = 0; i < moves.length; i++) if (moves[i].via === 'jump') pts++;
    return -pts;
  }
  // easy：贪心选「让最靠后的子前进最多」的一步
  function greedyPick(moves, side, b) {
    var ps = movablePieces(side, b), i, p, minProg = 1e9, lag = -1;
    var pool = [], best = null, bs = -1e9, sc;
    for (i = 0; i < ps.length; i++) {
      p = progress(ps[i], side);
      if (p < minProg) { minProg = p; lag = ps[i]; }
    }
    for (i = 0; i < moves.length; i++) if (moves[i].from === lag) pool.push(moves[i]);
    if (!pool.length) pool = moves;
    for (i = 0; i < pool.length; i++) {
      sc = (progress(pool[i].to, side) - progress(pool[i].from, side)) * 10 +
        pool[i].hops * 0.5 + (inTarget(pool[i].to, side) ? 5 : 0);
      if (sc > bs) { bs = sc; best = pool[i]; }
    }
    return best;
  }
  // medium：最长单步连跳 + 向前距离；hard：再加整齐度、堵跳板、1 层对手回应预测
  function evalFull(b2, m, side, level, start, cap) {
    var prog = progress(m.to, side) - progress(m.from, side);
    var enter = inTarget(m.to, side) ? 26 : 0;
    var sc = prog * 1.0 + m.hops * 2.4 + enter + tidyScore(b2, side) * 1.1;
    if (level === 'predict') {
      sc += blockScore(b2, side) * 0.55;
      var opp = side === 'human' ? 'ai' : 'human';
      var replies = allMoves(opp, b2);
      replies.sort(function (a, c) { return quickScore(b2, c, opp) - quickScore(b2, a, opp); });
      var n = Math.min(replies.length, diffDef().replyCap || 16);
      var bestReply = -1e9, rb, rs, j;
      for (j = 0; j < n; j++) {
        if (nowMs() - start > cap) break;
        rb = applyMove(b2.slice(), replies[j].from, replies[j].to);
        rs = quickScore(b2, replies[j], opp) + tidyScore(rb, opp) * 1.1;
        if (rs > bestReply) bestReply = rs;
      }
      if (bestReply > -1e9) sc -= bestReply * 0.5;
    }
    return sc;
  }
  function pickBest(moves, side, b, level) {
    var d = diffDef(), start = nowMs(), cap = d.timeCap;
    var sorted = moves.slice(), best = null, bestScore = -1e9;
    var lim, i, m, b2, sc;
    sorted.sort(function (a, c) { return quickScore(b, c, side) - quickScore(b, a, side); });
    lim = Math.min(sorted.length, level === 'predict' ? (d.topN || 14) : d.maxCand);
    for (i = 0; i < lim; i++) {
      if (nowMs() - start > cap) break;      // 时间上限
      m = sorted[i];
      b2 = applyMove(b.slice(), m.from, m.to);
      sc = evalFull(b2, m, side, level, start, cap);
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    return best || sorted[0] || null;
  }

  function scheduleAI() {
    if (state.status !== 'playing' || state.turn !== 'ai') return;
    clearAITimer();
    aiTimer = later(function () { aiTimer = 0; aiMove(); }, 320);
  }
  function clearAITimer() {
    if (aiTimer) {
      window.clearTimeout(aiTimer);
      var i = timers.indexOf(aiTimer);
      if (i >= 0) timers.splice(i, 1);
      aiTimer = 0;
    }
  }
  function aiMove() {
    if (state.status !== 'playing' || state.turn !== 'ai') return;
    var moves = allMoves('ai', board), best, d = diffDef();
    if (!moves.length) { handleNoMoves('ai'); return; }
    if (d.ai === 'greedy') best = greedyPick(moves, 'ai', board);
    else best = pickBest(moves, 'ai', board, d.ai);
    if (!best) best = moves[0];
    commitMove('ai', best);
  }

  /* ---------------- 走子 / 回合 ---------------- */

  function pushHistory() {
    state.history.push({
      board: board.slice(), moves: state.moves, aiMoves: state.aiMoves,
      maxHops: state.maxHops, time: state.time, turn: state.turn
    });
    if (state.history.length > 14) state.history.shift();
  }

  function commitMove(side, m) {
    board = applyMove(board.slice(), m.from, m.to);
    if (side === 'human') {
      state.moves++;
      if (m.hops > state.maxHops) state.maxHops = m.hops;
    } else {
      state.aiMoves++;
    }
    if (m.hops >= 2) {
      state.trail = { from: m.from, path: m.path.slice(), ms: 900, side: side };
      showToastKey('msg_jump', 900);
      sfx('combo');
    } else {
      sfx(m.via === 'jump' ? 'bounce' : 'move');
    }
    if (checkWin(side, board)) { finish(side); return; }
    // 回合数上限兜底，保证任何情况下胜负都能收敛
    if (state.moves + state.aiMoves >= 300) {
      finish(progressSum('human', board) >= progressSum('ai', board) ? 'human' : 'ai');
      return;
    }
    state.turn = side === 'human' ? 'ai' : 'human';
    state.selected = -1;
    state.reachable = {};
    state.hint = null;
    state.passStreak = 0;
    refreshHud();
    syncButtons();
    saveState(true);
    if (state.turn === 'ai') scheduleAI();
    draw();
  }

  function handleNoMoves(side) {
    showToastKey('msg_no_moves', 1200);
    sfx('warn');
    state.passStreak++;
    if (state.passStreak >= 2) {
      finish(progressSum('human', board) >= progressSum('ai', board) ? 'human' : 'ai');
      return;
    }
    state.turn = side === 'human' ? 'ai' : 'human';
    state.selected = -1;
    state.reachable = {};
    saveState(true);
    syncButtons();
    if (state.turn === 'ai') scheduleAI();
  }

  function finish(winner) {
    state.status = 'over';
    state.winner = winner === 'human' ? HUMAN : AI;
    state.turn = 'human';
    clearAITimer();
    state.selected = -1;
    state.reachable = {};
    state.hint = null;
    if (winner === 'human') {
      if (state.best === 0 || state.moves < state.best) {
        state.best = state.moves;
        writeBest(state.best);
        state.isRecord = true;
      }
      showToastKey('msg_win', 1200);
      sfx('win');
      if (state.isRecord) later(function () { sfx('levelup'); }, 300);
    } else {
      sfx('lose');
    }
    showResult();
    syncButtons();
    refreshHud();
    saveState(true);
    draw();
  }

  function handleCell(idx) {
    if (state.status !== 'playing' || state.turn !== 'human') return;
    if (idx < 0 || idx >= board.length) return;
    var v = board[idx];
    if (state.selected >= 0 && idx === state.selected) {
      state.selected = -1; state.reachable = {}; state.hint = null;
      sfx('toggle'); draw(); return;
    }
    if (state.selected >= 0 && hasOwn(state.reachable, idx)) {
      pushHistory();
      var mv = state.reachable[idx];
      commitMove('human', {
        from: state.selected, to: idx, hops: mv.hops, path: mv.path, via: mv.via
      });
      return;
    }
    if (v === HUMAN) {
      if (inTarget(idx, 'human')) { showToastKey('msg_invalid', 900); sfx('warn'); return; }
      state.selected = idx;
      state.reachable = legalMoves(board, idx);
      state.hint = null;
      sfx('select'); draw(); return;
    }
    if (state.selected >= 0) {
      showToastKey(v === AI ? 'msg_select' : 'msg_no_jump', 1000);
      state.selected = -1; state.reachable = {};
      sfx('warn');
    } else {
      showToastKey('msg_select', 1000);
      sfx('warn');
    }
    draw();
  }

  function undo() {
    if (state.status !== 'playing' || state.turn !== 'human') return;
    var d = diffDef();
    if (d.undo >= 0 && state.undoLeft <= 0) {
      showToast(t('btn_undo') + ' ×0', 1000); sfx('warn'); return;
    }
    if (!state.history.length) { sfx('warn'); return; }
    clearAITimer();
    var h = state.history.pop();
    board = h.board.slice();
    state.moves = h.moves;
    state.aiMoves = h.aiMoves;
    state.maxHops = h.maxHops;
    state.time = h.time;
    state.turn = 'human';
    state.selected = -1;
    state.reachable = {};
    state.hint = null;
    state.trail = null;
    if (d.undo >= 0) state.undoLeft--;
    sfx('swap');
    refreshHud(); syncButtons(); saveState(true); draw();
  }

  function hint() {
    var d = diffDef();
    if (state.status !== 'playing' || state.turn !== 'human') return;
    if (d.hints >= 0 && state.hintsLeft <= 0) {
      showToast(t('btn_hint') + ' ×0', 1000); sfx('warn'); return;
    }
    var moves = allMoves('human', board);
    if (!moves.length) { showToastKey('msg_no_moves', 1200); sfx('warn'); return; }
    var best = pickBest(moves, 'human', board, 'jump');
    if (!best) best = moves[0];
    if (d.hints >= 0) state.hintsLeft--;
    state.selected = best.from;
    state.reachable = legalMoves(board, best.from);
    state.hint = { from: best.from, to: best.to };
    showToastKey('btn_hint', 900);
    sfx('input');
    syncButtons(); saveState(true); draw();
  }

  /* ======================================================================
     Canvas 2D 原创几何绘制：六角星、孔位、玻璃珠棋子、高亮与连跳轨迹
     [gyh 2026-11-10 新增]
     ====================================================================== */

  function initStars() {
    STARS = [];
    for (var i = 0; i < 44; i++) {
      STARS.push({
        x: Math.random() * W, y: Math.random() * H * 0.72,
        r: Math.random() * 1.3 + 0.4, ph: Math.random() * 6.28
      });
    }
  }

  function fitCanvas() {
    var rect = dom.canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.round(rect.height);
    if (!cssH || cssH < 10) cssH = Math.round(cssW * H / W);
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    if (dom.canvas.width !== pw || dom.canvas.height !== ph) {
      dom.canvas.width = pw;
      dom.canvas.height = ph;
    }
    ctx = dom.canvas.getContext('2d');
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
  }

  function xyzPx(x, y, z) {
    return { x: CX + SQ3 * S * (x + z / 2), y: CY + 1.5 * S * z };
  }
  function cellPx(i) { return xyzPx(CELLS[i].x, CELLS[i].y, CELLS[i].z); }
  function out(p, k) {
    return { x: CX + (p.x - CX) * k, y: CY + (p.y - CY) * k };
  }
  function polyPath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1C2038');
    g.addColorStop(1, '#353C61');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.fillStyle = '#FFFDF8';
    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i];
      ctx.globalAlpha = 0.18 + 0.4 * (0.5 + 0.5 * Math.sin(state.time * 0.6 + s.ph));
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  function drawCamp(camp, fill, stroke) {
    var tri = CAMP_TRI[camp], pts = [], i;
    if (!tri) return;
    for (i = 0; i < 3; i++) pts.push(out(xyzPx(tri[i][0], tri[i][1], tri[i][2]), 1.055));
    ctx.save();
    ctx.fillStyle = fill; polyPath(pts); ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.6; polyPath(pts); ctx.stroke();
    ctx.restore();
  }

  function drawStar() {
    var t1 = [out(xyzPx(-8, 4, 4), 1.055), out(xyzPx(4, -8, 4), 1.055), out(xyzPx(4, 4, -8), 1.055)];
    var t2 = [out(xyzPx(8, -4, -4), 1.055), out(xyzPx(-4, 8, -4), 1.055), out(xyzPx(-4, -4, 8), 1.055)];
    var hc = [[4, -4, 0], [4, 0, -4], [0, 4, -4], [-4, 4, 0], [-4, 0, 4], [0, -4, 4]];
    var hex = [], i, k;
    for (k = 0; k < 6; k++) hex.push(out(xyzPx(hc[k][0], hc[k][1], hc[k][2]), 1.07));

    ctx.save();
    ctx.fillStyle = 'rgba(127,200,176,.10)'; polyPath(t1); ctx.fill();
    ctx.fillStyle = 'rgba(242,163,139,.10)'; polyPath(t2); ctx.fill();
    ctx.strokeStyle = 'rgba(190,235,217,.55)'; ctx.lineWidth = 2; polyPath(t1); ctx.stroke();
    ctx.strokeStyle = 'rgba(251,211,196,.55)'; ctx.lineWidth = 2; polyPath(t2); ctx.stroke();
    ctx.restore();

    drawCamp('S', 'rgba(127,200,176,.16)', 'rgba(190,235,217,.85)');
    drawCamp('N', 'rgba(242,163,139,.16)', 'rgba(251,211,196,.85)');
    var oc = ['XN', 'XP', 'YN', 'YP'];
    for (k = 0; k < oc.length; k++) {
      drawCamp(oc[k], 'rgba(120,132,180,.10)', 'rgba(150,162,205,.35)');
    }

    ctx.save();
    ctx.fillStyle = 'rgba(32,36,59,.30)'; polyPath(hex); ctx.fill();
    ctx.strokeStyle = 'rgba(201,206,228,.35)'; ctx.lineWidth = 1.4; polyPath(hex); ctx.stroke();
    ctx.restore();
  }

  function drawHoles() {
    var i, p;
    for (i = 0; i < CELLS.length; i++) {
      p = cellPx(i);
      ctx.fillStyle = 'rgba(10,12,24,.55)';
      ctx.beginPath(); ctx.arc(p.x, p.y, CELL_R, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(201,206,228,.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, CELL_R - 1.6, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,253,248,.10)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, CELL_R - 0.8, 0.55 * Math.PI, 1.15 * Math.PI); ctx.stroke();
    }
  }

  function drawMarble(x, y, r, col, sel, locked) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#0A0C18';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.72, r * 0.92, r * 0.36, 0, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
    var g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.42, r * 0.12, x, y, r);
    g.addColorStop(0, col.light);
    g.addColorStop(0.55, col.base);
    g.addColorStop(1, col.dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,253,248,.42)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r - 0.5, 0, 6.283); ctx.stroke();
    ctx.globalAlpha = 0.75; ctx.fillStyle = '#FFFDF8';
    ctx.beginPath(); ctx.ellipse(x - r * 0.32, y - r * 0.38, r * 0.3, r * 0.17, -0.5, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
    if (locked) {
      ctx.fillStyle = 'rgba(255,233,168,.95)';
      ctx.beginPath(); ctx.arc(x + r * 0.5, y - r * 0.5, 2.1, 0, 6.283); ctx.fill();
    }
    if (sel) {
      ctx.strokeStyle = '#FFE9A8'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(x, y, r + 3.4, 0, 6.283); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMarbles() {
    var i, p, v, col;
    for (i = 0; i < board.length; i++) {
      v = board[i];
      if (!v) continue;
      p = cellPx(i);
      col = v === HUMAN ? COLORS.human : COLORS.ai;
      drawMarble(p.x, p.y, MARBLE_R, col, i === state.selected,
        inTarget(i, v === HUMAN ? 'human' : 'ai'));
    }
  }

  function drawHighlights() {
    if (state.status !== 'playing') return;
    var k, to, p, mv, pulse = 0.5 + 0.5 * Math.sin(nowMs() / 240);
    // easy：未选子时也淡淡高亮全部己方棋子可达点
    if (diffDef().alwaysHighlight && state.selected < 0) {
      var ps = movablePieces('human', board), i;
      ctx.save();
      ctx.globalAlpha = 0.20; ctx.fillStyle = '#7FC8B0';
      for (i = 0; i < ps.length; i++) {
        var mv2 = legalMoves(board, ps[i]);
        for (k in mv2) {
          if (!hasOwn(mv2, k)) continue;
          p = cellPx(parseInt(k, 10));
          ctx.beginPath(); ctx.arc(p.x, p.y, 4.2, 0, 6.283); ctx.fill();
        }
      }
      ctx.restore();
    }
    if (state.selected < 0) return;
    var sp = cellPx(state.selected);
    ctx.save();
    ctx.strokeStyle = '#FFE9A8'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 14 + pulse * 1.8, 0, 6.283); ctx.stroke();
    ctx.restore();
    for (k in state.reachable) {
      if (!hasOwn(state.reachable, k)) continue;
      to = parseInt(k, 10); mv = state.reachable[to]; p = cellPx(to);
      if (mv.via === 'step') {
        ctx.save();
        ctx.fillStyle = 'rgba(127,200,176,.9)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 5.2, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(190,235,217,.9)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 8.4, 0, 6.283); ctx.stroke();
        ctx.restore();
      } else {
        var big = mv.hops >= 2;
        ctx.save();
        ctx.strokeStyle = big ? '#F3D08A' : '#FFE9A8';
        ctx.lineWidth = big ? 2.4 : 1.8;
        ctx.beginPath(); ctx.arc(p.x, p.y, 8.8 + pulse * (big ? 2.2 : 1), 0, 6.283); ctx.stroke();
        if (big) { ctx.beginPath(); ctx.arc(p.x, p.y, 5.6, 0, 6.283); ctx.stroke(); }
        ctx.fillStyle = 'rgba(243,208,138,.85)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, 6.283); ctx.fill();
        ctx.restore();
      }
    }
    if (state.hint) {
      var a = cellPx(state.hint.from), b = cellPx(state.hint.to);
      var ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,233,168,.85)'; ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - 9 * Math.cos(ang - 0.4), b.y - 9 * Math.sin(ang - 0.4));
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - 9 * Math.cos(ang + 0.4), b.y - 9 * Math.sin(ang + 0.4));
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTrail() {
    if (!state.trail) return;
    var tr = state.trail, pts = [cellPx(tr.from)], i;
    for (i = 0; i < tr.path.length; i++) pts.push(cellPx(tr.path[i]));
    ctx.save();
    ctx.globalAlpha = clamp(tr.ms / 900, 0, 1);
    ctx.strokeStyle = tr.side === 'human' ? '#7FC8B0' : '#F2A38B';
    ctx.lineWidth = 2.4; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#FFFDF8';
    for (i = 1; i < pts.length; i++) {
      ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 2.6, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    drawBackground();
    drawStar();
    drawHoles();
    drawTrail();
    drawHighlights();
    drawMarbles();
  }

  /* ---------------- 记分板 / 卡片 / 结算 ---------------- */

  function refreshHud() {
    dom.moves.textContent = String(state.moves);
    dom.hops.textContent = String(state.maxHops);
    dom.time.textContent = fmtTime(state.time);
    dom.best.textContent = state.best > 0 ? String(state.best) : '-';
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
    var d = diffDef();
    setI18n(dom.btnPause, state.status === 'paused' ? 'btn_resume' : 'btn_pause');
    dom.btnPause.disabled = !(state.status === 'playing' || state.status === 'paused');
    var humanTurn = state.status === 'playing' && state.turn === 'human';
    dom.btnUndo.disabled = !humanTurn || state.history.length === 0 ||
      (d.undo >= 0 && state.undoLeft <= 0);
    dom.btnHint.disabled = !humanTurn || (d.hints >= 0 && state.hintsLeft <= 0);
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

  function showResult() {
    var win = state.winner === HUMAN;
    setI18n(dom.overlayTitle, win ? 'win_title' : 'lose_title');
    // win_sub / lose_sub 含 {score} 占位符，显示前一律替换掉
    dom.overlaySub.textContent = win
      ? tf('win_sub', { score: state.moves })
      : tf('lose_sub', { score: state.aiMoves });
    dom.overlayMoves.textContent = String(state.moves);
    dom.recordBadge.hidden = !state.isRecord;
    hideCard();
    dom.overlay.hidden = false;
    if (typeof dom.overlay.scrollIntoView === 'function') {
      dom.overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ---------------- 开局 / 状态切换 ---------------- */

  function newGame() {
    var d = diffDef(), i, j;
    state.status = 'ready';
    state.turn = 'human';
    state.moves = 0;
    state.aiMoves = 0;
    state.maxHops = 0;
    state.time = 0;
    state.undoLeft = d.undo >= 0 ? d.undo : 999;
    state.hintsLeft = d.hints >= 0 ? d.hints : 999;
    state.history = [];
    state.selected = -1;
    state.reachable = {};
    state.hint = null;
    state.trail = null;
    state.winner = 0;
    state.isRecord = false;
    state.passStreak = 0;

    board = new Array(CELLS.length);
    for (i = 0; i < board.length; i++) board[i] = 0;
    var hs = startCells('human'), as = startCells('ai');
    for (j = 0; j < hs.length; j++) board[hs[j]] = HUMAN;
    for (j = 0; j < as.length; j++) board[as[j]] = AI;

    dom.overlay.hidden = true;
    dom.recordBadge.hidden = true;
    showCard('ready');
    syncButtons();
    syncDiffs();
    refreshHud();
    saveState(true);              // 开局即写入存档（含完整棋子位置）
  }

  function start() {
    if (state.status !== 'ready') return;
    state.status = 'playing';
    state.turn = 'human';
    hideCard();
    syncButtons();
    sfx('start');
    saveState(true);              // 点 #btn-start 立即落盘
    draw();
  }

  function pause() {
    if (state.status !== 'playing') return;
    clearAITimer();
    state.status = 'paused';
    showCard('paused');
    syncButtons();
    saveState(true);
  }

  function resume() {
    if (state.status !== 'paused') return;
    state.status = 'playing';
    hideCard();
    syncButtons();
    saveState(true);
    if (state.turn === 'ai') scheduleAI();
    draw();
  }

  function restart() { newGame(); start(); }

  /* [gyh 2026-11-10 新增] 切档：含同档一律先幂等写盘；清场 + newGame 之后
     才显示 confirm_diff 提示条，绝不使用原生 window.confirm */
  function switchDiff(diff) {
    if (!hasOwn(DIFF, diff)) return;
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) { /* ignore */ }
    stopLoops();                  // 先清计时器 / 动画帧 / 旧 toast
    state.diff = diff;
    syncDiffs();
    sfx('toggle');
    newGame();                    // 清场 + 重开
    startLoop();
    showToastKey('confirm_diff', 2200);   // 重开之后再显示，不会被清掉
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    var hist = [], i, h;
    for (i = 0; i < state.history.length; i++) {
      h = state.history[i];
      hist.push({
        board: h.board.slice(), moves: h.moves, aiMoves: h.aiMoves,
        maxHops: h.maxHops, time: h.time, turn: h.turn
      });
    }
    return {
      v: STATE_V, diff: state.diff, status: state.status, turn: state.turn,
      board: board.slice(), moves: state.moves, aiMoves: state.aiMoves,
      maxHops: state.maxHops, time: state.time, undoLeft: state.undoLeft,
      hintsLeft: state.hintsLeft, winner: state.winner, isRecord: state.isRecord,
      passStreak: state.passStreak, history: hist
    };
  }
  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 250) return;
    lastSave = now;
    writeJSON(KEY_STATE, snapshot());
  }
  function loadState() {
    var s = readJSON(KEY_STATE, null);
    if (!s || typeof s !== 'object' || s.v !== STATE_V) return false;
    if (s.diff !== state.diff) return false;
    if (!Array.isArray(s.board) || s.board.length !== CELLS.length) return false;
    var i, ok = true;
    for (i = 0; i < s.board.length; i++) {
      if (s.board[i] !== 0 && s.board[i] !== 1 && s.board[i] !== 2) { ok = false; break; }
    }
    if (!ok) return false;

    board = s.board.slice();
    state.moves = num(s.moves, 0);
    state.aiMoves = num(s.aiMoves, 0);
    state.maxHops = num(s.maxHops, 0);
    state.time = num(s.time, 0);
    state.undoLeft = num(s.undoLeft, diffDef().undo >= 0 ? diffDef().undo : 999);
    state.hintsLeft = num(s.hintsLeft, diffDef().hints >= 0 ? diffDef().hints : 999);
    state.winner = num(s.winner, 0);
    state.isRecord = !!s.isRecord;
    state.passStreak = num(s.passStreak, 0);
    state.history = [];
    if (Array.isArray(s.history)) {
      for (i = 0; i < s.history.length; i++) {
        var h = s.history[i];
        if (h && Array.isArray(h.board) && h.board.length === CELLS.length) {
          state.history.push({
            board: h.board.slice(), moves: num(h.moves, 0), aiMoves: num(h.aiMoves, 0),
            maxHops: num(h.maxHops, 0), time: num(h.time, 0),
            turn: h.turn === 'ai' ? 'ai' : 'human'
          });
        }
      }
    }
    state.selected = -1;
    state.reachable = {};
    state.hint = null;
    state.trail = null;
    state.turn = s.turn === 'ai' ? 'ai' : 'human';
    // 刷新后一律先停在起始 / 暂停卡，不继承半空的 AI 回合
    if (s.status === 'over') {
      state.status = 'over';
      showResult();
    } else if (s.status === 'playing' || s.status === 'paused') {
      state.status = 'paused';
      dom.overlay.hidden = true;
      showCard('paused');
    } else {
      state.status = 'ready';
      dom.overlay.hidden = true;
      showCard('ready');
    }
    syncButtons();
    refreshHud();
    return true;
  }

  /* ---------------- 循环 / 计时器管理 ---------------- */

  function stopLoops() {
    loopRunning = false;
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
    timers = [];
    aiTimer = 0;
    toastTimer = 0;
    if (dom.toast) { dom.toast.hidden = true; dom.toast.textContent = ''; }
    toastKey = null;
  }

  function startLoop() {
    if (loopRunning && rafId) return;
    loopRunning = true;
    lastTs = 0;
    hudTs = 0;
    if (!rafId) rafId = window.requestAnimationFrame(frame);
  }

  function frame(ts) {
    rafId = 0;
    if (!loopRunning) return;
    var dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
    lastTs = ts;
    if (state.status === 'playing' && diffDef().timer) state.time += dt / 1000;
    if (state.trail) {
      state.trail.ms -= dt;
      if (state.trail.ms <= 0) state.trail = null;
    }
    draw();
    if (ts - hudTs > 100) { hudTs = ts; refreshHud(); }
    rafId = window.requestAnimationFrame(frame);
  }

  /* ---------------- 输入 ---------------- */

  function onCanvasTap(clientX, clientY) {
    if (!dom.canvas) return;
    var rect = dom.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var lx = (clientX - rect.left) * (W / rect.width);
    var ly = (clientY - rect.top) * (H / rect.height);
    var best = -1, bestD = 1e9, i, p, dx, dy, dd;
    for (i = 0; i < CELLS.length; i++) {
      p = cellPx(i);
      dx = p.x - lx; dy = p.y - ly;
      dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; best = i; }
    }
    if (best >= 0 && bestD <= TOL * TOL) handleCell(best);
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var k = e.key;
    if (k === 'p' || k === 'P') {
      e.preventDefault();
      if (state.status === 'playing') pause();
      else if (state.status === 'paused') resume();
      return;
    }
    if (k === ' ' || k === 'Spacebar') {
      if (tag === 'BUTTON' || tag === 'A') return;
      e.preventDefault();
      if (state.status === 'ready') start();
      else if (state.status === 'paused') resume();
      else if (state.status === 'over') restart();
      // playing 时空格不触发任何走子，避免误操作
    }
  }

  function bindInput() {
    dom.canvas.addEventListener('pointerdown', function (e) {
      onCanvasTap(e.clientX, e.clientY);
    });
    dom.btnStart.addEventListener('click', function () {
      saveState(true);
      sfx('click');
      if (state.status === 'ready') start();
      else if (state.status === 'paused') resume();
      else if (state.status === 'over') restart();
    });
    dom.btnStartCard.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'paused') resume();
      else if (state.status === 'ready') start();
      else if (state.status === 'over') restart();
    });
    dom.btnPause.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'playing') pause();
      else if (state.status === 'paused') resume();
    });
    dom.btnRestart.addEventListener('click', function () { sfx('click'); restart(); });
    dom.btnAgain.addEventListener('click', function () { sfx('click'); restart(); });
    dom.btnUndo.addEventListener('click', function () { sfx('click'); undo(); });
    dom.btnHint.addEventListener('click', function () { sfx('click'); hint(); });
    dom.diffs.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
      if (btn && dom.diffs.contains(btn)) switchDiff(btn.getAttribute('data-diff'));
    });
    dom.overlay.addEventListener('click', function (e) {
      if (e.target === dom.overlay) dom.overlay.hidden = true;
    });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.status === 'playing') pause();
      if (document.hidden) saveState(true);
    });
    window.addEventListener('pagehide', function () { saveState(true); });
    window.addEventListener('resize', fitCanvas);
    if (window.ResizeObserver) {
      new window.ResizeObserver(fitCanvas).observe(dom.stageWrap);
    }
  }

  function onLangChange() {
    syncDiffs();
    syncButtons();
    if (!dom.card.hidden) showCard(dom.card.getAttribute('data-kind') || 'ready');
    if (!dom.overlay.hidden) showResult();
    refreshHud();
    if (!dom.toast.hidden && toastKey) dom.toast.textContent = t(toastKey);
  }

  /* ---------------- 调试接口（同一文件内，供纯逻辑自测） ---------------- */

  window.__hexTest__ = {
    state: function () {
      return {
        diff: state.diff, status: state.status, turn: state.turn,
        moves: state.moves, aiMoves: state.aiMoves, maxHops: state.maxHops,
        time: state.time, undoLeft: state.undoLeft, hintsLeft: state.hintsLeft,
        winner: state.winner, isRecord: state.isRecord, best: state.best,
        cells: CELLS.length
      };
    },
    board: function () { return board.slice(); },
    setup: function (b, opts) {
      if (!Array.isArray(b) || b.length !== CELLS.length) return false;
      var o = opts || {};
      board = b.slice();
      if (o.status) state.status = o.status;
      if (o.turn) state.turn = o.turn;
      if (typeof o.moves === 'number') state.moves = o.moves;
      state.selected = -1;
      state.reachable = {};
      state.hint = null;
      state.trail = null;
      saveState(true);
      refreshHud();
      syncButtons();
      draw();
      return true;
    },
    tapCell: function (idx) { handleCell(idx); },
    reachable: function (from) { return legalMoves(board, from); },
    cellIndex: function (x, y, z) { return RULES.cellIndex(x, y, z); }
  };

  /* ---------------- 初始化 ---------------- */

  function init() {
    dom = {
      canvas: $('canvas'),
      stageWrap: $('stage-wrap'),
      diffs: $('diffs'),
      btnStart: $('btn-start'),
      btnStartCard: $('btn-start-card'),
      btnPause: $('btn-pause'),
      btnRestart: $('btn-restart'),
      btnAgain: $('btn-again'),
      btnUndo: $('btn-undo'),
      btnHint: $('btn-hint'),
      card: $('card'),
      cardTitle: $('card-title'),
      cardSub: $('card-sub'),
      overlay: $('overlay'),
      overlayTitle: $('overlay-title'),
      overlaySub: $('overlay-sub'),
      overlayMoves: $('overlay-moves'),
      recordBadge: $('record-badge'),
      toast: $('toast'),
      moves: $('hud-moves'),
      hops: $('hud-hops'),
      time: $('hud-time'),
      best: $('hud-best')
    };

    var savedDiff = null;
    try { savedDiff = window.localStorage.getItem(KEY_DIFF); } catch (e) { /* ignore */ }
    if (savedDiff && hasOwn(DIFF, savedDiff)) state.diff = savedDiff;

    ensureBest();
    state.best = readBest();
    try { window.localStorage.setItem(KEY_DIFF, state.diff); } catch (e) { /* 默认 medium 落盘 */ }

    initStars();
    syncDiffs();
    if (!loadState()) newGame();

    fitCanvas();
    bindInput();
    startLoop();

    document.addEventListener('ys:langchange', onLangChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
