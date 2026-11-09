/* ==========================================================================
   黑白棋 Reversi · 游戏逻辑
   纯 ES5 + IIFE + var，和站内其它游戏保持一致（无框架、无打包、无依赖）。

   玩法：8×8 棋盘，中央 4 子开局，玩家执黑先手、AI 执白。
        八个方向夹住对方连续棋子即翻转，只能下在合法格；一方无合法落点
        自动跳过并提示，双方都无子可下 / 棋盘下满时结束，子多者胜（平局另判）。
        合法落点默认高亮，提示按钮再强调最佳落点；悔棋一次撤「玩家 + AI」两手。
   AI：easy   位置权重贪心 + 30% 随机扰动 + 主动拒绝送角，深度 0；
       medium 位置权重 + 行动力惩罚 + 深度 2 极小化极大；
       hard   位置权重 + 角 / 稳定子 + 行动力 + 深度 4 alpha-beta +
              按阶段调整权重（开局重行动力、终局重子数）+ 节点 / 时间上限。
   存档：ysgame-reversi-state（v:1，按难度分桶，含整盘 / 执子方 / 悔棋栈 /
        回合 / 分数 / 阶段）、ysgame-reversi-best（最高分，纯数字）、
        ysgame-reversi-diff（当前难度）；全部 try/catch + 尺寸校验。
   音效：统一走 js/sound.js 的 YSound，主题由 body[data-dict="greversi"] 自动识别。
   文案：只用 greversi 字典已有 key；带 {score}/{level} 的用 tf() 替换。

   [reversi-dev 2026-11-09 新增] 批次四
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var SIZE = 8;
  var CELL = 60;
  var W = SIZE * CELL;   // 480
  var H = W;

  var EMPTY = 0;
  var BLACK = 1;   // 玩家
  var WHITE = 2;   // AI

  var STATE_KEY = 'ysgame-reversi-state';
  var BEST_KEY = 'ysgame-reversi-best';
  var DIFF_KEY = 'ysgame-reversi-diff';

  var DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  var CORNERS = [[0, 0], [0, 7], [7, 0], [7, 7]];

  /* 位置权重：角 +120、C 位 -40、X 位 -60、边 +10，内部 3~15 */
  var POS = [
    [120, -40,  10,  10,  10,  10, -40, 120],
    [-40, -60,  -5,  -5,  -5,  -5, -60, -40],
    [ 10,  -5,  15,   3,   3,  15,  -5,  10],
    [ 10,  -5,   3,   3,   3,   3,  -5,  10],
    [ 10,  -5,   3,   3,   3,   3,  -5,  10],
    [ 10,  -5,  15,   3,   3,  15,  -5,  10],
    [-40, -60,  -5,  -5,  -5,  -5, -60, -40],
    [120, -40,  10,  10,  10,  10, -40, 120]
  ];

  /* 三档参数：强度真正拉开，simple 也绝非走过场 */
  var DIFFS = {
    easy:   { thinkMs: 260, depth: 0, noise: 0.30 },
    medium: { thinkMs: 330, depth: 2, maxNodes: 4000,  maxMs: 90,  dynamic: false, stable: false },
    hard:   { thinkMs: 420, depth: 4, maxNodes: 20000, maxMs: 300, dynamic: true,  stable: true }
  };

  /* ---------------- DOM ---------------- */

  var $ = function (id) { return document.getElementById(id); };
  var cv = null;
  var ctx = null;
  var overlay = null;
  var card = null;
  var toast = null;
  var aiTimer = null;
  var animRaf = null;
  var toastTimer = null;
  var resizeTimer = null;

  /* ---------------- 状态 ---------------- */

  function emptyBoard() {
    var b = [], r, c;
    for (r = 0; r < SIZE; r++) {
      b.push([]);
      for (c = 0; c < SIZE; c++) b[r].push(EMPTY);
    }
    return b;
  }

  function initBoard() {
    var b = emptyBoard();
    b[3][3] = WHITE; b[4][4] = WHITE;
    b[3][4] = BLACK; b[4][3] = BLACK;
    return b;
  }

  function cloneBoard(b) {
    var o = [], r;
    for (r = 0; r < SIZE; r++) o.push(b[r].slice());
    return o;
  }

  var state = {
    diff: 'medium',
    board: initBoard(),
    turn: 'you',              // 'you' | 'ai'
    phase: 'ready',           // 'ready' | 'playing' | 'paused' | 'over'
    history: [],              // 悔棋栈：{ r, c, role, flips:[{r,c}] }
    round: 1,
    moves: 0,                 // 玩家落子数
    black: 2,
    white: 2,
    lastMove: null,           // { r, c }
    hint: null,               // { r, c }
    hover: null,              // { r, c }
    cursor: { r: 2, c: 3 },  // 键盘光标（初始指向一个合法落点）
    legal: [],                // 当前玩家合法落点
    anim: null,               // 翻子补间
    best: 0,                  // 最高分（玩家单局最多黑子数）
    toastKey: null,
    toastNotice: false,       // 当前 toast 是否为可换行的「页面内提示条」
    resultKind: null
  };

  /* ---------------- 工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  /** 带 {score}/{level} 占位符的文案用 split/join 自己替换，不残留花括号 */
  function tf(key, vars) {
    var s = t(key), k;
    for (k in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, k)) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      }
    }
    return s;
  }

  function sfx(name) {
    if (window.YSound) window.YSound.play(name);
  }

  function now() {
    return (window.performance && window.performance.now)
      ? window.performance.now() : Date.now();
  }

  function inB(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function isCorner(r, c) { return (r === 0 || r === 7) && (c === 0 || c === 7); }

  /* ---------------- 规则（纯逻辑，可独立验证） ---------------- */

  /** 落在 (r,c) 能翻转的对方棋子坐标；空数组表示该点非法 */
  function flipsFor(b, r, c, role) {
    if (!inB(r, c) || b[r][c] !== EMPTY) return [];
    var opp = 3 - role, out = [], d, k, rr, cc, line;
    for (d = 0; d < 8; d++) {
      line = [];
      k = 1;
      while (true) {
        rr = r + DIRS[d][0] * k;
        cc = c + DIRS[d][1] * k;
        if (!inB(rr, cc) || b[rr][cc] === EMPTY) { line = null; break; }
        if (b[rr][cc] === opp) { line.push({ r: rr, c: cc }); k++; continue; }
        break; // 末端是自己的子
      }
      if (line && line.length) {
        for (k = 0; k < line.length; k++) out.push(line[k]);
      }
    }
    return out;
  }

  function legalMoves(b, role) {
    var out = [], r, c, f;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        if (b[r][c] !== EMPTY) continue;
        f = flipsFor(b, r, c, role);
        if (f.length) out.push({ r: r, c: c, flips: f });
      }
    }
    return out;
  }

  /** 原地落子 / 撤销（供搜索 make-unmake，避免反复 clone） */
  function makeMove(b, mv, role) {
    b[mv.r][mv.c] = role;
    var i, f;
    for (i = 0; i < mv.flips.length; i++) {
      f = mv.flips[i];
      b[f.r][f.c] = role;
    }
  }

  function unmakeMove(b, mv, role) {
    var opp = 3 - role, i, f;
    b[mv.r][mv.c] = EMPTY;
    for (i = 0; i < mv.flips.length; i++) {
      f = mv.flips[i];
      b[f.r][f.c] = opp;
    }
  }

  function countPieces(b) {
    var black = 0, white = 0, empty = 0, r, c;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        if (b[r][c] === BLACK) black++;
        else if (b[r][c] === WHITE) white++;
        else empty++;
      }
    }
    return { black: black, white: white, empty: empty };
  }

  /** 当前局面的走向：结束 / 跳过 / 正常，纯函数，advance 与自测共用 */
  function outcome(b, role) {
    var opp = 3 - role;
    var my = legalMoves(b, role);
    var op = legalMoves(b, opp);
    var empty = countPieces(b).empty;
    if (empty === 0 || (my.length === 0 && op.length === 0)) {
      return { over: true, pass: false, next: null };
    }
    if (my.length === 0) return { over: false, pass: true, next: opp };
    return { over: false, pass: false, next: role };
  }

  function winnerOf(b) {
    var c = countPieces(b);
    return c.black > c.white ? BLACK : (c.black < c.white ? WHITE : 0);
  }

  /* ---------------- AI ---------------- */

  /** 候选排序：位置权重高的先看，提升 alpha-beta 剪枝效率 */
  function orderMoves(moves) {
    moves.sort(function (a, b) { return POS[b.r][b.c] - POS[a.r][a.c]; });
    return moves;
  }

  /** 从四个角沿两条边数连续同色子（含角，不重复计数），近似「稳定子」 */
  function stableEdge(b, role) {
    var total = 0, i, k, m, r, c, val, base, dd;
    var corners = [[0, 0], [0, 7], [7, 0], [7, 7]];
    var dirs = [
      [[0, 1], [1, 0]], [[0, -1], [1, 0]],
      [[0, 1], [-1, 0]], [[0, -1], [-1, 0]]
    ];
    for (i = 0; i < 4; i++) {
      base = corners[i];
      if (b[base[0]][base[1]] !== role) continue;
      val = 1;
      for (k = 0; k < 2; k++) {
        dd = dirs[i][k];
        for (m = 1; m < SIZE; m++) {
          r = base[0] + dd[0] * m;
          c = base[1] + dd[1] * m;
          if (!inB(r, c) || b[r][c] !== role) break;
          val++;
        }
      }
      total += val;
    }
    return total;
  }

  /** 局面评估：返回 player 视角分。hard 按已空位数分阶段调权 */
  function evaluate(b, player, cfg) {
    var opp = 3 - player;
    var cnt = countPieces(b);
    var myMoves = legalMoves(b, player);
    var opMoves = legalMoves(b, opp);
    var terminal = cnt.empty === 0 || (myMoves.length === 0 && opMoves.length === 0);
    var discDiff = (player === BLACK)
      ? cnt.black - cnt.white : cnt.white - cnt.black;

    if (terminal) {
      return discDiff * 100 +
        (discDiff > 0 ? 100000 : (discDiff < 0 ? -100000 : 0));
    }

    var posDiff = 0, cornerDiff = 0, r, c, i, cr;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        if (b[r][c] === player) posDiff += POS[r][c];
        else if (b[r][c] === opp) posDiff -= POS[r][c];
      }
    }
    for (i = 0; i < 4; i++) {
      cr = CORNERS[i];
      if (b[cr[0]][cr[1]] === player) cornerDiff++;
      else if (b[cr[0]][cr[1]] === opp) cornerDiff--;
    }

    var stableDiff = cfg.stable
      ? (stableEdge(b, player) - stableEdge(b, opp)) : 0;
    var mobDiff = myMoves.length - opMoves.length;

    var wPos, wMob, wCorner, wStable, wDisc;
    if (cfg.dynamic) {
      if (cnt.empty > 40) {
        wPos = 1.0; wMob = 9;  wCorner = 45; wStable = 5;  wDisc = -1;
      } else if (cnt.empty > 12) {
        wPos = 1.0; wMob = 6;  wCorner = 50; wStable = 9;  wDisc = 1;
      } else {
        wPos = 0.6; wMob = 2;  wCorner = 35; wStable = 12; wDisc = 14;
      }
    } else {
      /* medium：固定权重，位置表 + 行动力（对手合法落点数）惩罚 */
      wPos = 1.0; wMob = 7; wCorner = 20; wStable = 0; wDisc = 0;
    }

    return wPos * posDiff + wMob * mobDiff + wCorner * cornerDiff +
      wStable * stableDiff + wDisc * discDiff;
  }

  /**
   * negamax + alpha-beta。pass 时换手且深度 -1（防死循环）；
   * 节点数 / 时间到上限立即返回静态评估，绝不长时间占用主线程。
   */
  function negamax(b, player, depth, alpha, beta, cfg, sctx) {
    sctx.nodes++;
    if (depth <= 0 || sctx.nodes > cfg.maxNodes || Date.now() > sctx.deadline) {
      return evaluate(b, player, cfg);
    }
    var myMoves = legalMoves(b, player);
    if (myMoves.length === 0) {
      var oppMoves0 = legalMoves(b, 3 - player);
      if (oppMoves0.length === 0) return evaluate(b, player, cfg);
      return -negamax(b, 3 - player, depth - 1, -beta, -alpha, cfg, sctx);
    }
    orderMoves(myMoves);
    var best = -Infinity, i, mv, val;
    for (i = 0; i < myMoves.length; i++) {
      mv = myMoves[i];
      makeMove(b, mv, player);
      val = -negamax(b, 3 - player, depth - 1, -beta, -alpha, cfg, sctx);
      unmakeMove(b, mv, player);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** 为 role 选一手。传入的 b 会被 make/unmake 完全还原，是纯函数 */
  function chooseMove(b, diff, role) {
    var cfg = DIFFS[diff] || DIFFS.medium;
    var moves = orderMoves(legalMoves(b, role));
    if (!moves.length) return null;
    var opp = 3 - role, i, mv, j, score, givesCorner, oppMoves;
    var scored, head, val, alpha, pick, sctx;

    if (diff === 'easy') {
      scored = [];
      for (i = 0; i < moves.length; i++) {
        mv = moves[i];
        /* 只看当前：位置权重 + 翻子数，再叠 30% 随机扰动 */
        score = POS[mv.r][mv.c] + mv.flips.length * 1.5;
        score += (Math.random() * 2 - 1) * (cfg.noise * 60);
        /* 主动拒绝「落子后把角送给对手」的明显坏手 */
        makeMove(b, mv, role);
        oppMoves = legalMoves(b, opp);
        givesCorner = false;
        for (j = 0; j < oppMoves.length; j++) {
          if (isCorner(oppMoves[j].r, oppMoves[j].c)) { givesCorner = true; break; }
        }
        unmakeMove(b, mv, role);
        if (givesCorner) score -= 200;
        scored.push({ mv: mv, s: score });
      }
      scored.sort(function (a, b2) { return b2.s - a.s; });
      return scored[0].mv;
    }

    /* medium / hard：极小化极大 + alpha-beta（root 也累积 alpha） */
    sctx = { nodes: 0, deadline: Date.now() + cfg.maxMs };
    alpha = -Infinity;
    pick = moves[0];
    for (i = 0; i < moves.length; i++) {
      mv = moves[i];
      makeMove(b, mv, role);
      val = -negamax(b, opp, cfg.depth - 1, -Infinity, -alpha, cfg, sctx);
      unmakeMove(b, mv, role);
      val += POS[mv.r][mv.c] * 0.01; // 同分时偏向好位置
      if (val > alpha) { alpha = val; pick = mv; }
      if (sctx.nodes > cfg.maxNodes || Date.now() > sctx.deadline) break;
    }
    return pick;
  }

  /** 提示：用 medium 强度替玩家算一个最佳落点 */
  function bestPlayerMove(b) {
    return chooseMove(cloneBoard(b), 'medium', BLACK);
  }

  /* ---------------- 存档 ---------------- */

  function loadRoot() {
    try {
      var d = JSON.parse(localStorage.getItem(STATE_KEY));
      if (d && d.v === 1 && d.tiers) return d;
    } catch (e) { /* 坏了当没有 */ }
    return null;
  }

  function loadBest() {
    try {
      var n = Number(localStorage.getItem(BEST_KEY));
      if (isFinite(n) && n > 0) return n;
    } catch (e) { /* ignore */ }
    return 0;
  }

  function saveBest() {
    try { localStorage.setItem(BEST_KEY, String(state.best)); }
    catch (e) { /* 隐私模式写不了，不影响玩 */ }
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

  function snapshot() {
    return {
      v: 1,
      diff: state.diff,
      board: cloneBoard(state.board),
      turn: state.turn,
      phase: state.phase,
      status: state.phase === 'over' ? 'over' : 'playing',
      history: state.history.slice(0),
      round: state.round,
      moves: state.moves,
      black: state.black,
      white: state.white,
      lastMove: state.lastMove ? { r: state.lastMove.r, c: state.lastMove.c } : null
    };
  }

  function save() {
    try {
      var root = loadRoot();
      if (!root || root.v !== 1) root = { v: 1, cur: state.diff, tiers: {} };
      if (!root.tiers) root.tiers = {};
      root.cur = state.diff;
      root.tiers[state.diff] = snapshot();
      localStorage.setItem(STATE_KEY, JSON.stringify(root));
    } catch (e) { /* ignore */ }
  }

  /** 尺寸 + 取值校验，损坏的存档一律丢弃重置 */
  function validBucket(b) {
    if (!b || !b.board || b.board.length !== SIZE) return false;
    var r, c, v;
    for (r = 0; r < SIZE; r++) {
      if (!b.board[r] || b.board[r].length !== SIZE) return false;
      for (c = 0; c < SIZE; c++) {
        v = b.board[r][c];
        if (v !== EMPTY && v !== BLACK && v !== WHITE) return false;
      }
    }
    return true;
  }

  function restoreBucket(b) {
    state.board = cloneBoard(b.board);
    state.turn = (b.turn === 'ai') ? 'ai' : 'you';
    state.phase = (b.phase === 'ready' || b.phase === 'playing' ||
      b.phase === 'paused' || b.phase === 'over') ? b.phase : 'playing';
    state.history = (b.history && b.history.length) ? b.history.slice(0) : [];
    state.round = Number(b.round) || 1;
    state.moves = Number(b.moves) || 0;
    state.lastMove = b.lastMove || null;
    state.hint = null;
    state.hover = null;
    state.anim = null;
    state.legal = [];
    state.toastKey = null;
    state.toastNotice = false;
    recount();
    state.resultKind = winnerOf(state.board) === BLACK ? 'win'
      : (winnerOf(state.board) === WHITE ? 'lose' : 'draw');
    $('record-badge').hidden = true;
    toast.hidden = true;
    toast.classList.remove('bk__toast--notice');
    overlay.hidden = true;

    if (state.phase === 'over') {
      hideCard();
      showOverlay();
    } else if (state.phase === 'ready') {
      showCard('ready');
    } else if (state.phase === 'paused') {
      showCard('paused');
    } else {
      hideCard();
      refreshLegal();
    }
    syncButtons();
    updateHud();
    render();
  }

  /* ---------------- 局面控制 ---------------- */

  function recount() {
    var c = countPieces(state.board);
    state.black = c.black;
    state.white = c.white;
  }

  function refreshLegal() {
    state.legal = (state.phase === 'playing' && state.turn === 'you')
      ? legalMoves(state.board, BLACK) : [];
  }

  function applyMove(mv, role) {
    state.history.push({
      r: mv.r, c: mv.c, role: role, flips: mv.flips.slice(0)
    });
    makeMove(state.board, mv, role);
    state.lastMove = { r: mv.r, c: mv.c };
  }

  /** 落子后推进：判结束 / 自动跳过 / 刷新合法落点。返回 false 表示已结束 */
  function advance() {
    recount();
    var role = state.turn === 'you' ? BLACK : WHITE;
    var o = outcome(state.board, role);
    if (o.over) { finish(); return false; }
    if (o.pass) {
      showToast('msg_no_moves');
      sfx('tick');
      state.turn = (o.next === BLACK) ? 'you' : 'ai';
    }
    refreshLegal();
    updateHud();
    return true;
  }

  function finish() {
    if (aiTimer) { window.clearTimeout(aiTimer); aiTimer = null; }
    state.phase = 'over';
    state.turn = 'you';
    state.legal = [];
    recount();
    var kind = winnerOf(state.board) === BLACK ? 'win'
      : (winnerOf(state.board) === WHITE ? 'lose' : 'draw');
    state.resultKind = kind;
    var isRecord = false;

    if (kind === 'win') {
      if (state.black > state.best) {
        state.best = state.black;
        saveBest();
        isRecord = true;
      }
      sfx(isRecord ? 'perfect' : 'win');
    } else {
      /* 字典未提供 draw 专用文案：平局与落败共用 lose 系文案，
         此时 {score} 与 {level} 相等，配合 HUD 黑白子数即为明确结算 */
      sfx('lose');
    }

    $('record-badge').hidden = !isRecord;
    hideCard();
    showOverlay();
    syncButtons();
    updateHud();
    render();
    save();
  }

  function showOverlay() {
    var black = state.black, white = state.white;
    var kind = state.resultKind || winnerOf(state.board);
    var win = (kind === BLACK || kind === 'win');
    /* 平局与落败都走 lose_title / lose_sub，数字相等即表达平局 */
    $('overlay-title').textContent = t(win ? 'win_title' : 'lose_title');
    $('overlay-sub').textContent = tf(win ? 'win_sub' : 'lose_sub',
      { score: black, level: white });
    $('overlay-moves').textContent = String(state.moves);
    $('overlay-discs').textContent = String(black + white);
    overlay.hidden = false;
  }

  function newGame(phase, doSave) {
    if (aiTimer) { window.clearTimeout(aiTimer); aiTimer = null; }
    if (animRaf) { window.cancelAnimationFrame(animRaf); animRaf = null; }
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = null; }

    state.board = initBoard();
    state.turn = 'you';
    state.phase = phase || 'ready';
    state.history = [];
    state.round = 1;
    state.moves = 0;
    recount();
    state.lastMove = null;
    state.hint = null;
    state.hover = null;
    state.anim = null;
    state.legal = [];
    state.cursor = { r: 2, c: 3 };
    state.toastKey = null;
    state.toastNotice = false;
    state.resultKind = null;

    overlay.hidden = true;
    $('record-badge').hidden = true;
    toast.hidden = true;
    toast.classList.remove('bk__toast--notice');

    if (state.phase === 'ready') showCard('ready');
    else hideCard();
    refreshLegal();
    syncButtons();
    updateHud();
    render();
    if (doSave !== false) save();
  }

  function startGame() {
    if (state.phase !== 'ready') return;
    state.phase = 'playing';
    hideCard();
    refreshLegal();
    sfx('start');
    syncButtons();
    updateHud();
    render();
    save();
    if (state.turn === 'ai') scheduleAi();
  }

  function pauseGame() {
    if (state.phase !== 'playing') return;
    if (aiTimer) { window.clearTimeout(aiTimer); aiTimer = null; }
    state.phase = 'paused';
    showCard('paused');
    sfx('toggle');
    syncButtons();
    updateHud();
    render();
    save();
  }

  function resumeGame() {
    if (state.phase !== 'paused') return;
    state.phase = 'playing';
    hideCard();
    refreshLegal();
    sfx('toggle');
    syncButtons();
    updateHud();
    render();
    save();
    if (state.turn === 'ai') scheduleAi();
  }

  function scheduleAi() {
    if (aiTimer) { window.clearTimeout(aiTimer); aiTimer = null; }
    if (state.phase !== 'playing' || state.turn !== 'ai') return;
    var delay = (DIFFS[state.diff] || DIFFS.medium).thinkMs;
    aiTimer = window.setTimeout(aiTurn, delay);
  }

  function playerMove(r, c) {
    if (state.phase !== 'playing' || state.turn !== 'you') return;
    var mv = null, i;
    for (i = 0; i < state.legal.length; i++) {
      if (state.legal[i].r === r && state.legal[i].c === c) { mv = state.legal[i]; break; }
    }
    if (!mv) {
      showToast('msg_invalid');
      sfx('warn');
      return;
    }
    applyMove(mv, BLACK);
    state.moves += 1;
    state.hint = null;
    sfx('place');
    startFlipAnim(mv);
    state.turn = 'ai';
    state.round += 1;
    updateHud();
    render();
    if (!advance()) return;
    syncButtons();
    save();
    if (state.turn === 'ai') scheduleAi();
  }

  function aiTurn() {
    aiTimer = null;
    if (state.phase !== 'playing' || state.turn !== 'ai') return;
    var mv = chooseMove(cloneBoard(state.board), state.diff, WHITE);
    if (mv) {
      applyMove(mv, WHITE);
      sfx('place');
      startFlipAnim(mv);
    }
    /* 若 mv 为空（advance 理论上已先跳过），仍交回玩家由 outcome 兜底 */
    state.turn = 'you';
    state.round += 1;
    updateHud();
    render();
    if (!advance()) return;
    syncButtons();
    save();
    if (state.turn === 'ai') scheduleAi();
  }

  function undo() {
    if (state.phase !== 'playing' && state.phase !== 'paused' && state.phase !== 'over') return;
    if (aiTimer) { window.clearTimeout(aiTimer); aiTimer = null; }
    if (!state.history.length) { sfx('warn'); return; }

    var n = state.history.length, steps = 1, i, m;
    /* 一次撤掉「玩家 + AI」两手，回到玩家上一次可落子的状态 */
    if (n >= 2 && state.history[n - 1].role === WHITE &&
      state.history[n - 2].role === BLACK) steps = 2;
    for (i = 0; i < steps; i++) {
      m = state.history.pop();
      unmakeMove(state.board, m, m.role);
      if (m.role === BLACK) state.moves = Math.max(0, state.moves - 1);
      state.round = Math.max(1, state.round - 1);
    }

    state.phase = 'playing';
    state.turn = 'you';
    state.lastMove = state.history.length
      ? { r: state.history[state.history.length - 1].r,
          c: state.history[state.history.length - 1].c }
      : null;
    state.hint = null;
    state.hover = null;
    state.anim = null;
    state.resultKind = null;
    overlay.hidden = true;
    $('record-badge').hidden = true;
    hideCard();
    recount();
    sfx('slide');
    if (!advance()) return;   // 撤销后若玩家无合法落点，outcome 会自动跳过
    syncButtons();
    updateHud();
    render();
    save();
    if (state.turn === 'ai') scheduleAi();
  }

  function hint() {
    if (state.phase !== 'playing' || state.turn !== 'you') { sfx('warn'); return; }
    var mv = bestPlayerMove(state.board);
    if (!mv) { sfx('warn'); return; }
    state.hint = { r: mv.r, c: mv.c };
    sfx('select');
    render();
  }

  function switchDiff(diff) {
    if (!DIFFS[diff]) return;                 // 非法档：直接忽略
    /* 任一合法档（含当前档）都立即落盘 ysgame-reversi-diff，保证幂等可读 */
    try { localStorage.setItem(DIFF_KEY, diff); } catch (e) { /* ignore */ }
    if (diff === state.diff) { syncDiffs(); return; }

    var hadProgress = (state.moves > 0 && state.phase !== 'over');
    state.diff = diff;
    saveDiff();
    syncDiffs();
    sfx('toggle');
    newGame('playing', true);   // 内部清掉未触发的 AI 定时器并重开新局
    /* 非阻塞确认：提示条必须放在重开之后（newGame 会隐藏 toast），
       用页面内提示条展示 confirm_diff，不弹原生 confirm、不 return */
    if (hadProgress) showToast('confirm_diff', true);
  }

  /* ---------------- 界面 ---------------- */

  function syncDiffs() {
    var btns = document.querySelectorAll('#diffs .seg__btn'), i, on;
    for (i = 0; i < btns.length; i++) {
      on = btns[i].getAttribute('data-diff') === state.diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function syncButtons() {
    var p = state.phase;
    var startBtn = $('btn-start');
    var pauseBtn = $('btn-pause');

    if (p === 'paused') {
      startBtn.setAttribute('data-i18n', 'btn_resume');
      startBtn.textContent = t('btn_resume');
      startBtn.disabled = false;
      pauseBtn.setAttribute('data-i18n', 'btn_resume');
      pauseBtn.textContent = t('btn_resume');
      pauseBtn.disabled = false;
    } else {
      startBtn.setAttribute('data-i18n', 'btn_start');
      startBtn.textContent = t('btn_start');
      startBtn.disabled = (p !== 'ready');
      pauseBtn.setAttribute('data-i18n', 'btn_pause');
      pauseBtn.textContent = t('btn_pause');
      pauseBtn.disabled = (p !== 'playing');
    }
    $('btn-undo').disabled = !(p === 'playing' && state.history.length > 0);
    $('btn-hint').disabled = !(p === 'playing' && state.turn === 'you');
    $('btn-restart').disabled = false;
  }

  function updateHud() {
    $('black').textContent = String(state.black);
    $('white').textContent = String(state.white);
    $('best').textContent = state.best > 0 ? String(state.best) : '--';
    var tv;
    if (state.phase === 'over') tv = '—';
    else if (state.phase === 'paused') tv = t('paused_title');
    else if (state.phase === 'ready') tv = t('label_score');
    else tv = t(state.turn === 'you' ? 'label_score' : 'label_lives');
    $('turn').textContent = tv;
  }

  function showCard(mode) {
    card.hidden = false;
    if (mode === 'paused') {
      $('card-title').textContent = t('paused_title');
      $('card-sub').textContent = t('tagline');
      $('btn-start-card').setAttribute('data-i18n', 'btn_resume');
      $('btn-start-card').textContent = t('btn_resume');
    } else {
      $('card-title').textContent = t('game_title');
      $('card-sub').textContent = t('tagline');
      $('btn-start-card').setAttribute('data-i18n', 'btn_start');
      $('btn-start-card').textContent = t('btn_start');
    }
  }

  function hideCard() { card.hidden = true; }

  /** notice=true 时用可换行的「页面内提示条」样式（切难度确认等长文案），
      约 2.2 秒后自动消失；全站不弹原生 confirm。 */
  function showToast(key, notice) {
    state.toastKey = key;
    state.toastNotice = !!notice;
    toast.textContent = t(key);
    toast.hidden = false;
    if (notice) toast.classList.add('bk__toast--notice');
    else toast.classList.remove('bk__toast--notice');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.hidden = true;
      toast.classList.remove('bk__toast--notice');
      toastTimer = null;
    }, 2200);
  }

  /** 语言原地切换时重画全部动态文本（data-i18n 已由 I18N.apply 处理过一遍） */
  function applyText() {
    var i, nodes, key;
    nodes = document.querySelectorAll('[data-i18n]');
    for (i = 0; i < nodes.length; i++) {
      key = nodes[i].getAttribute('data-i18n');
      nodes[i].textContent = t(key);
    }
    nodes = document.querySelectorAll('[data-i18n-aria]');
    for (i = 0; i < nodes.length; i++) {
      key = nodes[i].getAttribute('data-i18n-aria');
      nodes[i].setAttribute('aria-label', t(key));
    }
    document.title = t('page_title');
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t('page_desc'));

    if (state.phase === 'ready') showCard('ready');
    else if (state.phase === 'paused') showCard('paused');
    if (!overlay.hidden) showOverlay();
    syncButtons();
    updateHud();
    syncDiffs();
    if (!toast.hidden && state.toastKey) showToast(state.toastKey, state.toastNotice);
  }

  /* ---------------- 绘制 ---------------- */

  function setupCanvas() {
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function drawBoard(c) {
    var g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#3E8565');
    g.addColorStop(1, '#2E6B4E');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.strokeStyle = 'rgba(20, 50, 35, .45)';
    c.lineWidth = 1;
    var i, p;
    for (i = 0; i <= SIZE; i++) {
      p = i * CELL + 0.5;
      c.beginPath(); c.moveTo(0, p); c.lineTo(W, p); c.stroke();
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, H); c.stroke();
    }
    /* 四个星位小点（交叉点） */
    c.fillStyle = 'rgba(20, 50, 35, .55)';
    var pts = [[2, 2], [2, 6], [6, 2], [6, 6]];
    for (i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(pts[i][1] * CELL, pts[i][0] * CELL, 2.6, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** 棋子：scale 为横向缩放，用来做「翻硬币」补间 */
  function drawStone(c, r, col, role, alpha, scale) {
    var x = (col + 0.5) * CELL, y = (r + 0.5) * CELL, R = CELL * 0.40;
    c.save();
    c.globalAlpha = (alpha == null) ? 1 : alpha;
    c.translate(x, y);
    c.scale((scale == null) ? 1 : scale, 1);
    c.translate(-x, -y);
    c.shadowColor = 'rgba(20, 40, 30, .35)';
    c.shadowBlur = 4;
    c.shadowOffsetY = 2;
    var g = c.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
    if (role === BLACK) {
      g.addColorStop(0, '#5a5a5a'); g.addColorStop(0.6, '#2b2b2b'); g.addColorStop(1, '#111111');
    } else {
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f4efe3'); g.addColorStop(1, '#d8cbb0');
    }
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    c.shadowColor = 'transparent';
    c.lineWidth = 1;
    c.strokeStyle = role === BLACK ? 'rgba(0,0,0,.5)' : 'rgba(120,105,80,.6)';
    c.stroke();
    c.restore();
  }

  function drawStones(c) {
    var r, col, v, i, cell, scale, shown, p;
    var a = state.anim;
    var animMap = {};
    if (a) {
      for (i = 0; i < a.cells.length; i++) {
        animMap[a.cells[i].r * SIZE + a.cells[i].c] = a.cells[i];
      }
      p = Math.min(1, (now() - a.t0) / a.dur);
    } else {
      p = 1;
    }
    for (r = 0; r < SIZE; r++) {
      for (col = 0; col < SIZE; col++) {
        v = state.board[r][col];
        if (v === EMPTY) continue;
        cell = animMap[r * SIZE + col];
        if (cell) {
          scale = Math.max(0.08, Math.abs(Math.cos(Math.PI * p)));
          shown = p < 0.5 ? cell.from : cell.to;
          drawStone(c, r, col, shown, 1, scale);
        } else if (a && a.placed && a.placed.r === r && a.placed.c === col) {
          drawStone(c, r, col, v, 1, Math.min(1, 0.4 + p * 0.6));
        } else {
          drawStone(c, r, col, v, 1, 1);
        }
      }
    }
  }

  function drawLegal(c) {
    if (state.phase !== 'playing' || state.turn !== 'you') return;
    var i, m, x, y;
    for (i = 0; i < state.legal.length; i++) {
      m = state.legal[i];
      x = (m.c + 0.5) * CELL; y = (m.r + 0.5) * CELL;
      c.save();
      c.fillStyle = 'rgba(255, 253, 248, .30)';
      c.strokeStyle = 'rgba(255, 253, 248, .55)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, CELL * 0.16, 0, Math.PI * 2);
      c.fill(); c.stroke();
      c.restore();
    }
  }

  function drawHint(c) {
    if (!state.hint) return;
    var x = (state.hint.c + 0.5) * CELL, y = (state.hint.r + 0.5) * CELL;
    c.save();
    c.strokeStyle = '#F4C95D';
    c.lineWidth = 3;
    c.fillStyle = 'rgba(244, 201, 93, .28)';
    c.beginPath(); c.arc(x, y, CELL * 0.38, 0, Math.PI * 2);
    c.fill(); c.stroke();
    c.restore();
  }

  function drawHover(c) {
    if (!state.hover || state.phase !== 'playing' || state.turn !== 'you') return;
    var h = state.hover, i, ok = false;
    if (state.board[h.r][h.c] !== EMPTY) return;
    for (i = 0; i < state.legal.length; i++) {
      if (state.legal[i].r === h.r && state.legal[i].c === h.c) { ok = true; break; }
    }
    if (ok) drawStone(c, h.r, h.c, BLACK, 0.35, 1);
  }

  function drawCursor(c) {
    if (state.phase !== 'playing' || state.turn !== 'you') return;
    var x = state.cursor.c * CELL, y = state.cursor.r * CELL;
    c.save();
    c.strokeStyle = 'rgba(255, 253, 248, .9)';
    c.lineWidth = 2;
    c.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
    c.restore();
  }

  function drawLast(c) {
    if (!state.lastMove) return;
    var x = (state.lastMove.c + 0.5) * CELL, y = (state.lastMove.r + 0.5) * CELL;
    c.save();
    c.fillStyle = '#F4C95D';
    c.beginPath(); c.arc(x, y, 3.6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    drawBoard(ctx);
    drawLegal(ctx);
    drawHover(ctx);
    drawCursor(ctx);
    drawHint(ctx);
    drawStones(ctx);
    drawLast(ctx);
  }

  /** 翻子动画 + 一串轻叩音（最多 2 声，别刷屏） */
  function startFlipAnim(mv) {
    var role = state.board[mv.r][mv.c];
    var from = 3 - role;
    var cells = [], i, f, n, k;
    for (i = 0; i < mv.flips.length; i++) {
      f = mv.flips[i];
      cells.push({ r: f.r, c: f.c, from: from, to: role });
    }
    state.anim = {
      t0: now(), dur: 280, cells: cells,
      placed: { r: mv.r, c: mv.c, role: role }
    };
    if (animRaf) window.cancelAnimationFrame(animRaf);
    animRaf = window.requestAnimationFrame(tickAnim);
    n = Math.min(2, Math.max(1, Math.ceil(cells.length / 3)));
    for (k = 0; k < n; k++) {
      (function (idx) {
        window.setTimeout(function () { sfx('tap'); }, 40 + idx * 70);
      })(k);
    }
  }

  function tickAnim() {
    var a = state.anim;
    if (!a) { animRaf = null; render(); return; }
    if ((now() - a.t0) / a.dur >= 1) {
      state.anim = null;
      animRaf = null;
      render();
      return;
    }
    render();
    animRaf = window.requestAnimationFrame(tickAnim);
  }

  /* ---------------- 事件 ---------------- */

  function cellFromEvent(e) {
    var rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    var c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (!inB(r, c)) return null;
    return { r: r, c: c };
  }

  function startOrResume() {
    if (state.phase === 'ready') startGame();
    else if (state.phase === 'paused') resumeGame();
  }

  function bind() {
    var diffBtns = document.querySelectorAll('#diffs .seg__btn'), i;
    for (i = 0; i < diffBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { switchDiff(btn.getAttribute('data-diff')); });
      })(diffBtns[i]);
    }

    $('btn-start').addEventListener('click', function () { sfx('click'); startOrResume(); });
    $('btn-start-card').addEventListener('click', function () { sfx('click'); startOrResume(); });
    $('btn-undo').addEventListener('click', function () { sfx('click'); undo(); });
    $('btn-hint').addEventListener('click', function () { sfx('click'); hint(); });
    $('btn-pause').addEventListener('click', function () {
      sfx('click');
      if (state.phase === 'playing') pauseGame();
      else if (state.phase === 'paused') resumeGame();
    });
    $('btn-restart').addEventListener('click', function () { sfx('start'); newGame('playing', true); });
    $('btn-again').addEventListener('click', function () { sfx('start'); newGame('playing', true); });

    cv.addEventListener('click', function (e) {
      var p = cellFromEvent(e);
      if (p) playerMove(p.r, p.c);
    });
    cv.addEventListener('pointermove', function (e) {
      var p = cellFromEvent(e);
      var changed = (!p && state.hover) || (p && !state.hover) ||
        (p && state.hover && (p.r !== state.hover.r || p.c !== state.hover.c));
      state.hover = p;
      if (changed) render();
    });
    cv.addEventListener('pointerleave', function () {
      if (state.hover) { state.hover = null; render(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var k = e.key, handled = true;
      if (k === 'ArrowUp') state.cursor.r = Math.max(0, state.cursor.r - 1);
      else if (k === 'ArrowDown') state.cursor.r = Math.min(SIZE - 1, state.cursor.r + 1);
      else if (k === 'ArrowLeft') state.cursor.c = Math.max(0, state.cursor.c - 1);
      else if (k === 'ArrowRight') state.cursor.c = Math.min(SIZE - 1, state.cursor.c + 1);
      else if (k === ' ' || k === 'Enter') playerMove(state.cursor.r, state.cursor.c);
      else if (k === 'u' || k === 'U') undo();
      else if (k === 'h' || k === 'H') hint();
      else if (k === 'p' || k === 'P') {
        if (state.phase === 'playing') pauseGame();
        else if (state.phase === 'paused') resumeGame();
      } else handled = false;
      if (handled) { e.preventDefault(); render(); }
    });

    document.addEventListener('ys:langchange', applyText);

    window.addEventListener('resize', function () {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        ctx = setupCanvas();
        render();
      }, 120);
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    cv = $('canvas');
    overlay = $('overlay');
    card = $('card');
    toast = $('toast');
    ctx = setupCanvas();

    state.best = loadBest();
    loadDiff();
    syncDiffs();

    var root = loadRoot();
    var b = root && root.tiers ? root.tiers[state.diff] : null;
    if (b && validBucket(b)) restoreBucket(b);
    else newGame('ready', false);

    bind();
    applyText();
    save();   // 开局即写入自动存档

    /* 刷新时若停在「AI 该走还没走」的中间态，补走一手 */
    if (state.phase === 'playing' && state.turn === 'ai') scheduleAi();
  }

  /* ---------------- 自动化验证用的调试接口（不参与玩法） ---------------- */
  window.__reversi = {
    constants: { SIZE: SIZE, EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE },
    initBoard: initBoard,
    emptyBoard: emptyBoard,
    flipsFor: flipsFor,
    legalMoves: legalMoves,
    makeMove: makeMove,
    unmakeMove: unmakeMove,
    countPieces: countPieces,
    outcome: outcome,
    winnerOf: winnerOf,
    choose: function (diff, role) {
      return chooseMove(cloneBoard(state.board), diff, role || WHITE);
    },
    chooseOn: function (b, diff, role) {
      return chooseMove(cloneBoard(b), diff, role || WHITE);
    },
    load: function (arr) {
      var b = emptyBoard(), r, c, v;
      for (r = 0; r < SIZE; r++) {
        for (c = 0; c < SIZE; c++) {
          v = arr[r] && arr[r][c];
          b[r][c] = (v === BLACK || v === WHITE) ? v : EMPTY;
        }
      }
      newGame('playing', false);
      state.board = b;
      recount();
      refreshLegal();
      updateHud();
      render();
      save();
      return snapshotDebug();
    },
    snapshot: snapshotDebug
  };

  function snapshotDebug() {
    return {
      board: cloneBoard(state.board), turn: state.turn, phase: state.phase,
      moves: state.moves, round: state.round, diff: state.diff,
      black: state.black, white: state.white,
      best: state.best,
      historyLen: state.history.length
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
