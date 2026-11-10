/* ==========================================================================
   国际象棋 · 全部逻辑单文件实现（规则 / AI / 渲染 / 存档 / 交互）
   纯 ES5：IIFE + var + 'use strict'，无 let/const/class/箭头函数/模板字符串。
   棋盘为原创 Canvas 2D 几何绘制 + Unicode 棋符，无任何图片 / 字体 / 外链资源。
   [gyh 2026-11-10 新增] 批次六
   ========================================================================== */
(function () {
  'use strict';

  var I = window.I18N;
  var S = window.YSound;

  var STATE_KEY = 'ysgame-chess-state';
  var BEST_KEY = 'ysgame-chess-best';
  var DIFF_KEY = 'ysgame-chess-diff';

  /* 三档真实差异：搜索深度 / 悔棋 / 提示 / 落点高亮 / 计时 / 节点与时间上限 / 位置表
     [gyh 2026-11-10 新增] */
  var DIFFS = {
    easy: {
      depth: 1, undos: Infinity, hints: Infinity, alwaysLegal: true,
      timed: false, delay: 240, maxNodes: 1200, timeMs: 220,
      usePST: false, greedy: true
    },
    medium: {
      depth: 2, undos: 3, hints: Infinity, alwaysLegal: true,
      timed: true, delay: 320, maxNodes: 6000, timeMs: 520,
      usePST: false, greedy: false
    },
    hard: {
      depth: 3, undos: 1, hints: 3, alwaysLegal: false,
      timed: true, delay: 380, maxNodes: 16000, timeMs: 900,
      usePST: true, greedy: false
    }
  };

  /* 子力价值（应用型 1..6：兵 马 象 车 后 王）与显示用的简版点数 */
  var VAL = [0, 100, 320, 330, 500, 900, 20000];
  var SMALL = [0, 1, 3, 3, 5, 9, 0];
  var MATE = 1000000;
  /* 实心 Unicode 棋符：兵 马 象 车 后 王（黑白共用字形，靠填色区分） */
  var GLYPH = { 1: '\u265F', 2: '\u265E', 3: '\u265D', 4: '\u265C', 5: '\u265B', 6: '\u265A' };
  var PROMO_TYPES = [5, 4, 3, 2];

  /* 位置价值表：按兵种给「中心化 + 兵推进 / 王退守」加权，纯计算生成，非外链数据
     [gyh 2026-11-10 新增] */
  function buildPST() {
    var weight = [0, 2, 6, 4, 2, 1, 3];
    var pst = {};
    for (var t = 1; t <= 6; t++) {
      var arr = new Array(64);
      for (var pi = 0; pi < 64; pi++) {
        var f = pi & 7;
        var rank = pi >> 3; /* 0 = 白方底线(第1横线)，7 = 第8横线 */
        var cf = 3.5 - Math.abs(3.5 - f);
        var cr = 3.5 - Math.abs(3.5 - rank);
        var v = Math.round((cf + cr) * weight[t]);
        if (t === 1) { v += rank * 4; }
        if (t === 6) { v -= rank * 6; }
        arr[pi] = v;
      }
      pst[t] = arr;
    }
    return pst;
  }
  var PST = buildPST();

  /* ---------------- DOM ---------------- */
  var canvas, ctx, stage, card, cardTitle, cardSub, cardBtn,
      overlay, overlayTitle, overlaySub, overlayMoves, recordBadge,
      diffsBox, toastEl, promoBox, promoTitle, promoRow, extrasEl;

  var state = null;
  var best = 0;
  var view = { cssW: 0, cssH: 0, dpr: 1, S: 1 };
  var aiTimer = null, toastTimer = null, loopId = null, lastDownT = 0;
  var searchNodes = 0, searchDeadline = 0, searchAbort = false, searchMax = 0;

  /* ---------------- 小工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function t(key) { return I ? I.t(key) : key; }
  function isEn() { return !!(I && I.lang === 'en'); }
  function play(name) { if (S && S.play) { try { S.play(name); } catch (e) {} } }
  function cfg() { return DIFFS[state.diff] || DIFFS.medium; }

  function sq(r, c) { return r * 8 + c; }
  function rowOf(i) { return i >> 3; }
  function colOf(i) { return i & 7; }
  function onBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function sideOf(code) { return code > 0 ? 'w' : 'b'; }
  function typeOf(code) { return code > 0 ? code : -code; }

  /* ---------------- 局面构造 ---------------- */
  function posKey(b, turn, cast, ep) {
    var s = turn;
    s += (cast[0] ? 'K' : '-') + (cast[1] ? 'Q' : '-') +
         (cast[2] ? 'k' : '-') + (cast[3] ? 'q' : '-');
    s += '|' + ep + '|';
    for (var i = 0; i < 64; i++) { s += String.fromCharCode(65 + b[i] + 6); }
    return s;
  }
  function makePos(b, turn, cast, ep, half, full) {
    return {
      board: b, turn: turn, castling: cast, ep: ep,
      half: half, full: full, key: posKey(b, turn, cast, ep)
    };
  }
  function initialPos() {
    var b = new Array(64), i, c;
    for (i = 0; i < 64; i++) { b[i] = 0; }
    var back = [4, 2, 3, 5, 6, 3, 2, 4];
    for (c = 0; c < 8; c++) {
      b[sq(0, c)] = -back[c];
      b[sq(1, c)] = -1;
      b[sq(6, c)] = 1;
      b[sq(7, c)] = back[c];
    }
    return makePos(b, 'w', [true, true, true, true], -1, 0, 1);
  }
  function clonePos(p) {
    return {
      board: p.board.slice(), turn: p.turn, castling: p.castling.slice(),
      ep: p.ep, half: p.half, full: p.full, key: p.key
    };
  }

  function mk(from, to, opt) {
    opt = opt || {};
    return {
      from: from, to: to, promo: opt.promo || 0,
      ep: !!opt.ep, castle: opt.castle || null, double: !!opt.double
    };
  }
  function addPawnMove(moves, from, to, isPromo) {
    if (isPromo) {
      moves.push(mk(from, to, { promo: 5 }));
      moves.push(mk(from, to, { promo: 4 }));
      moves.push(mk(from, to, { promo: 3 }));
      moves.push(mk(from, to, { promo: 2 }));
    } else {
      moves.push(mk(from, to));
    }
  }

  /* ---------------- 伪合法走法生成 ---------------- */
  var KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var ALLDIR = DIAG.concat(ORTH);

  function genPseudo(pos, side, fromSq) {
    var b = pos.board, moves = [];
    var lo = fromSq >= 0 ? fromSq : 0;
    var hi = fromSq >= 0 ? fromSq : 63;
    var opp = side === 'w' ? 'b' : 'w';
    var i, r, c, code, tp, nr, nc, to, tgt, k, d, dirs;

    for (i = lo; i <= hi; i++) {
      code = b[i];
      if (!code || sideOf(code) !== side) { continue; }
      tp = typeOf(code);
      r = rowOf(i); c = colOf(i);

      if (tp === 1) { /* 兵 */
        var dir = side === 'w' ? -1 : 1;
        var startRow = side === 'w' ? 6 : 1;
        var promoRow = side === 'w' ? 0 : 7;
        var r1 = r + dir;
        if (onBoard(r1, c) && b[sq(r1, c)] === 0) {
          addPawnMove(moves, i, sq(r1, c), r1 === promoRow);
          var r2 = r + 2 * dir;
          if (r === startRow && onBoard(r2, c) && b[sq(r2, c)] === 0) {
            moves.push(mk(i, sq(r2, c), { double: true }));
          }
        }
        for (var dc = -1; dc <= 1; dc += 2) {
          nc = c + dc;
          if (!onBoard(r1, nc)) { continue; }
          to = sq(r1, nc);
          tgt = b[to];
          if (tgt !== 0 && sideOf(tgt) === opp) {
            addPawnMove(moves, i, to, r1 === promoRow);
          } else if (tgt === 0 && to === pos.ep) {
            moves.push(mk(i, to, { ep: true }));
          }
        }
      } else if (tp === 2) { /* 马 */
        for (k = 0; k < 8; k++) {
          nr = r + KNIGHT[k][0]; nc = c + KNIGHT[k][1];
          if (!onBoard(nr, nc)) { continue; }
          to = sq(nr, nc); tgt = b[to];
          if (tgt === 0 || sideOf(tgt) === opp) { moves.push(mk(i, to)); }
        }
      } else if (tp === 6) { /* 王 + 王车易位 */
        for (k = 0; k < 8; k++) {
          nr = r + KING[k][0]; nc = c + KING[k][1];
          if (!onBoard(nr, nc)) { continue; }
          to = sq(nr, nc); tgt = b[to];
          if (tgt === 0 || sideOf(tgt) === opp) { moves.push(mk(i, to)); }
        }
        var homeRow = side === 'w' ? 7 : 0;
        if (i === sq(homeRow, 4)) {
          var rookCode = side === 'w' ? 4 : -4;
          var kR = side === 'w' ? pos.castling[0] : pos.castling[2];
          var qR = side === 'w' ? pos.castling[1] : pos.castling[3];
          if (kR && b[sq(homeRow, 5)] === 0 && b[sq(homeRow, 6)] === 0 &&
              b[sq(homeRow, 7)] === rookCode &&
              !isAttacked(pos, sq(homeRow, 4), opp) &&
              !isAttacked(pos, sq(homeRow, 5), opp) &&
              !isAttacked(pos, sq(homeRow, 6), opp)) {
            moves.push(mk(i, sq(homeRow, 6), { castle: 'K' }));
          }
          if (qR && b[sq(homeRow, 1)] === 0 && b[sq(homeRow, 2)] === 0 &&
              b[sq(homeRow, 3)] === 0 && b[sq(homeRow, 0)] === rookCode &&
              !isAttacked(pos, sq(homeRow, 4), opp) &&
              !isAttacked(pos, sq(homeRow, 3), opp) &&
              !isAttacked(pos, sq(homeRow, 2), opp)) {
            moves.push(mk(i, sq(homeRow, 2), { castle: 'Q' }));
          }
        }
      } else { /* 象 / 车 / 后：滑行 */
        if (tp === 3) { dirs = DIAG; }
        else if (tp === 4) { dirs = ORTH; }
        else { dirs = ALLDIR; }
        for (d = 0; d < dirs.length; d++) {
          nr = r + dirs[d][0]; nc = c + dirs[d][1];
          while (onBoard(nr, nc)) {
            to = sq(nr, nc); tgt = b[to];
            if (tgt === 0) { moves.push(mk(i, to)); }
            else {
              if (sideOf(tgt) === opp) { moves.push(mk(i, to)); }
              break;
            }
            nr += dirs[d][0]; nc += dirs[d][1];
          }
        }
      }
    }
    return moves;
  }

  /* ---------------- 攻击 / 将军判定 ---------------- */
  function isAttacked(pos, target, by) {
    var b = pos.board;
    var tr = rowOf(target), tc = colOf(target);
    var pr, i, r, c, to, code, d, nr, nc;
    if (by === 'w') {
      pr = tr + 1;
      if (onBoard(pr, tc - 1) && b[sq(pr, tc - 1)] === 1) { return true; }
      if (onBoard(pr, tc + 1) && b[sq(pr, tc + 1)] === 1) { return true; }
    } else {
      pr = tr - 1;
      if (onBoard(pr, tc - 1) && b[sq(pr, tc - 1)] === -1) { return true; }
      if (onBoard(pr, tc + 1) && b[sq(pr, tc + 1)] === -1) { return true; }
    }
    var nCode = by === 'w' ? 2 : -2;
    for (i = 0; i < 8; i++) {
      r = tr + KNIGHT[i][0]; c = tc + KNIGHT[i][1];
      if (onBoard(r, c) && b[sq(r, c)] === nCode) { return true; }
    }
    var kCode = by === 'w' ? 6 : -6;
    for (i = 0; i < 8; i++) {
      r = tr + KING[i][0]; c = tc + KING[i][1];
      if (onBoard(r, c) && b[sq(r, c)] === kCode) { return true; }
    }
    var bq = by === 'w' ? 3 : -3;
    var rq = by === 'w' ? 4 : -4;
    var qq = by === 'w' ? 5 : -5;
    for (d = 0; d < 4; d++) {
      nr = tr + DIAG[d][0]; nc = tc + DIAG[d][1];
      while (onBoard(nr, nc)) {
        code = b[sq(nr, nc)];
        if (code !== 0) {
          if (code === bq || code === qq) { return true; }
          break;
        }
        nr += DIAG[d][0]; nc += DIAG[d][1];
      }
    }
    for (d = 0; d < 4; d++) {
      nr = tr + ORTH[d][0]; nc = tc + ORTH[d][1];
      while (onBoard(nr, nc)) {
        code = b[sq(nr, nc)];
        if (code !== 0) {
          if (code === rq || code === qq) { return true; }
          break;
        }
        nr += ORTH[d][0]; nc += ORTH[d][1];
      }
    }
    return false;
  }
  function findKing(pos, side) {
    var kc = side === 'w' ? 6 : -6;
    for (var i = 0; i < 64; i++) { if (pos.board[i] === kc) { return i; } }
    return -1;
  }
  function inCheck(pos, side) {
    var k = findKing(pos, side);
    if (k < 0) { return false; }
    return isAttacked(pos, k, side === 'w' ? 'b' : 'w');
  }

  /* ---------------- 走子（make/unmake 用复制，安全简单） ---------------- */
  function makeMove(pos, m) {
    var b = pos.board.slice();
    var code = b[m.from];
    var side = sideOf(code);
    var tp = typeOf(code);
    var cap = b[m.to];
    var fr = rowOf(m.from), fc = colOf(m.from);
    b[m.from] = 0;
    if (m.ep) { b[m.to + (side === 'w' ? 8 : -8)] = 0; }
    b[m.to] = m.promo ? (side === 'w' ? m.promo : -m.promo) : code;
    if (m.castle === 'K') {
      var rfK = fr * 8 + 7, rtK = fr * 8 + 5;
      b[rtK] = b[rfK]; b[rfK] = 0;
    } else if (m.castle === 'Q') {
      var rfQ = fr * 8 + 0, rtQ = fr * 8 + 3;
      b[rtQ] = b[rfQ]; b[rfQ] = 0;
    }
    var cast = pos.castling.slice();
    if (tp === 6) {
      if (side === 'w') { cast[0] = false; cast[1] = false; }
      else { cast[2] = false; cast[3] = false; }
    }
    if (m.from === 63) { cast[0] = false; }
    if (m.from === 56) { cast[1] = false; }
    if (m.from === 7) { cast[2] = false; }
    if (m.from === 0) { cast[3] = false; }
    if (m.to === 63) { cast[0] = false; }
    if (m.to === 56) { cast[1] = false; }
    if (m.to === 7) { cast[2] = false; }
    if (m.to === 0) { cast[3] = false; }
    var dir = side === 'w' ? -1 : 1;
    var ep = m.double ? sq(fr + dir, fc) : -1;
    var half = (tp === 1 || cap !== 0 || m.ep) ? 0 : pos.half + 1;
    var full = pos.full + (side === 'b' ? 1 : 0);
    var turn = side === 'w' ? 'b' : 'w';
    return makePos(b, turn, cast, ep, half, full);
  }
  function legalMoves(pos, side, fromSq) {
    var pseudo = genPseudo(pos, side, fromSq);
    var out = [], i, np;
    for (i = 0; i < pseudo.length; i++) {
      np = makeMove(pos, pseudo[i]);
      if (!inCheck(np, side)) { out.push(pseudo[i]); }
    }
    return out;
  }

  /* ---------------- 终局判定 ---------------- */
  function insufficient(b) {
    var minors = 0, i, p, tp;
    for (i = 0; i < 64; i++) {
      p = b[i];
      if (p === 0) { continue; }
      tp = typeOf(p);
      if (tp === 6) { continue; }
      if (tp === 2 || tp === 3) { minors++; continue; }
      return false;
    }
    return minors <= 1;
  }
  function gameStatus(pos, rep) {
    var moves = legalMoves(pos, pos.turn, -1);
    if (!moves.length) {
      if (inCheck(pos, pos.turn)) {
        return { over: true, winner: pos.turn === 'w' ? 'b' : 'w', reason: 'checkmate' };
      }
      return { over: true, winner: null, reason: 'stalemate' };
    }
    if (insufficient(pos.board)) { return { over: true, winner: null, reason: 'material' }; }
    if (pos.half >= 100) { return { over: true, winner: null, reason: 'fifty' }; }
    var cnt = 0, i;
    for (i = 0; i < rep.length; i++) { if (rep[i] === pos.key) { cnt++; } }
    if (cnt >= 3) { return { over: true, winner: null, reason: 'repetition' }; }
    return { over: false };
  }

  /* ---------------- 局面评估 / AI ----------------
     [gyh 2026-11-10 新增] medium 仅子力，hard 叠加位置价值表，二者均带 alpha-beta
     与节点 / 时间双上限；easy 用吃子贪心 + 明显随机扰动的深度 1 搜索。
     ------------------------------------------------ */
  function evaluate(pos) {
    var score = 0, i, p, tp, v, pi;
    var usePst = cfg().usePST;
    for (i = 0; i < 64; i++) {
      p = pos.board[i];
      if (!p) { continue; }
      tp = typeOf(p);
      v = VAL[tp];
      if (usePst) {
        pi = p > 0 ? ((7 - rowOf(i)) * 8 + colOf(i)) : (rowOf(i) * 8 + colOf(i));
        v += PST[tp][pi];
      }
      score += p > 0 ? v : -v;
    }
    return score;
  }
  function relEval(pos) { return pos.turn === 'w' ? evaluate(pos) : -evaluate(pos); }

  function orderMoves(pos, moves) {
    var i, m, tgt, s;
    for (i = 0; i < moves.length; i++) {
      m = moves[i]; s = 0;
      tgt = pos.board[m.to];
      if (tgt) { s += 10 * VAL[typeOf(tgt)] - VAL[typeOf(pos.board[m.from])]; }
      if (m.ep) { s += 10 * VAL[1]; }
      if (m.promo) { s += VAL[m.promo]; }
      m._s = s;
    }
    moves.sort(function (a, b) { return b._s - a._s; });
  }

  function search(pos, depth, alpha, beta, ply) {
    searchNodes++;
    if (searchNodes > searchMax) { searchAbort = true; }
    if ((searchNodes & 63) === 0 && Date.now() > searchDeadline) { searchAbort = true; }
    if (searchAbort || depth <= 0) { return relEval(pos); }
    var moves = legalMoves(pos, pos.turn, -1);
    if (!moves.length) {
      if (inCheck(pos, pos.turn)) { return -MATE + ply; }
      return 0;
    }
    orderMoves(pos, moves);
    var bestScore = -Infinity, i, sc, np;
    for (i = 0; i < moves.length; i++) {
      np = makeMove(pos, moves[i]);
      sc = -search(np, depth - 1, -beta, -alpha, ply + 1);
      if (sc > bestScore) { bestScore = sc; }
      if (bestScore > alpha) { alpha = bestScore; }
      if (alpha >= beta) { break; }
      if (searchAbort) { break; }
    }
    return bestScore;
  }
  function chooseSearchMove(pos, depth) {
    searchNodes = 0; searchAbort = false;
    var c = cfg();
    searchMax = c.maxNodes;
    searchDeadline = Date.now() + c.timeMs;
    var moves = legalMoves(pos, pos.turn, -1);
    if (!moves.length) { return null; }
    orderMoves(pos, moves);
    var bestScore = -Infinity, pool = [], alpha = -Infinity, beta = Infinity, i, sc, np;
    for (i = 0; i < moves.length; i++) {
      np = makeMove(pos, moves[i]);
      sc = -search(np, depth - 1, -beta, -alpha, 1);
      if (sc > bestScore + 0.5) { bestScore = sc; pool = [moves[i]]; }
      else if (Math.abs(sc - bestScore) <= 0.5) { pool.push(moves[i]); }
      if (bestScore > alpha) { alpha = bestScore; }
      if (searchAbort) { break; }
    }
    if (!pool.length) { pool = [moves[0]]; }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function chooseEasyMove(pos) {
    var moves = legalMoves(pos, pos.turn, -1);
    if (!moves.length) { return null; }
    var bestScore = -Infinity, pool = [], i, m, tgt, s;
    for (i = 0; i < moves.length; i++) {
      m = moves[i]; s = 0;
      tgt = pos.board[m.to];
      if (tgt) { s += VAL[typeOf(tgt)]; }
      if (m.ep) { s += VAL[1]; }
      if (m.promo) { s += VAL[m.promo]; }
      s += Math.random() * 70; /* 明显随机扰动，easy 明显更弱 */
      if (s > bestScore) { bestScore = s; pool = [m]; }
      else if (s === bestScore) { pool.push(m); }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function aiMove() {
    if (state.status !== 'playing' || state.pos.turn !== 'b') { return; }
    var m = cfg().greedy ? chooseEasyMove(state.pos) : chooseSearchMove(state.pos, cfg().depth);
    if (!m) { return; }
    commitMove(m);
  }

  /* ---------------- 存档 / 读档 ---------------- */
  function saveState() {
    if (!state) { return; }
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        v: 1, diff: state.diff,
        board: state.pos.board, turn: state.pos.turn, castling: state.pos.castling,
        ep: state.pos.ep, half: state.pos.half, full: state.pos.full,
        repHistory: state.repHistory, steps: state.steps,
        undoLeft: state.undoLeft === Infinity ? -1 : state.undoLeft,
        hintLeft: state.hintLeft === Infinity ? -1 : state.hintLeft,
        status: state.status, started: state.started,
        over: state.over, lastMove: state.lastMove, elapsedBase: state.elapsedBase
      }));
    } catch (e) {}
  }
  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(STATE_KEY); } catch (e) { return null; }
    if (!raw) { return null; }
    try {
      var d = JSON.parse(raw);
      if (!d || !d.board || d.board.length !== 64) { return null; }
      return d;
    } catch (e) { return null; }
  }
  function loadDiff() {
    var d = 'medium';
    try {
      var s = localStorage.getItem(DIFF_KEY);
      if (s === 'easy' || s === 'medium' || s === 'hard') { d = s; }
    } catch (e) {}
    return d;
  }
  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(n) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) {} }

  /* ---------------- HUD / 难度按钮 / 卡片 / 结算 ---------------- */
  function materialScore() {
    var s = 0, i, p;
    for (i = 0; i < 64; i++) {
      p = state.pos.board[i];
      if (!p) { continue; }
      s += (p > 0 ? 1 : -1) * SMALL[typeOf(p)];
    }
    return s;
  }
  function fmtTime(ms) {
    var total = Math.floor(ms / 1000);
    var mm = Math.floor(total / 60), ss = total % 60;
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function elapsed() {
    return state.elapsedBase + (state.runStart ? Date.now() - state.runStart : 0);
  }
  function updateTimeHUD() {
    var el = $('time');
    if (!el) { return; }
    el.textContent = cfg().timed ? fmtTime(elapsed()) : '--';
  }
  function syncExtras() {
    if (!extrasEl) { return; }
    var u = state.undoLeft === Infinity ? '\u221E' : String(state.undoLeft);
    var h = state.hintLeft === Infinity ? '\u221E' : String(state.hintLeft);
    extrasEl.textContent = t('btn_undo') + ' ' + u + '   \u00B7   ' + t('btn_hint') + ' ' + h;
  }
  function syncHUD() {
    if (!state) { return; }
    $('score').textContent = (function () { var s = materialScore(); return s > 0 ? '+' + s : String(s); })();
    $('steps').textContent = String(state.steps);
    $('turn').textContent = String(state.pos.full);
    $('best').textContent = best ? String(best) : '--';
    updateTimeHUD();
    syncExtras();
  }
  function syncDiffs() {
    var btns = diffsBox.querySelectorAll('.seg__btn'), i, b, on;
    for (i = 0; i < btns.length; i++) {
      b = btns[i];
      on = b.getAttribute('data-diff') === state.diff;
      if (on) { b.classList.add('is-active'); } else { b.classList.remove('is-active'); }
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  function renderCard() {
    if (!state) { return; }
    if (state.status === 'paused') {
      cardTitle.textContent = t('paused_title');
      cardSub.textContent = t('tagline');
      cardBtn.textContent = t('btn_resume');
      card.hidden = false;
    } else if (!state.started) {
      cardTitle.textContent = t('game_title');
      cardSub.textContent = t('tagline');
      cardBtn.textContent = t('btn_start');
      card.hidden = false;
    } else {
      card.hidden = true;
    }
  }
  function renderOverlay() {
    if (!state.over) { return; }
    var o = state.over;
    var score = Math.max(1, state.pos.full);
    if (o.winner === 'w') {
      overlayTitle.textContent = t('win_title');
      overlaySub.textContent = t('win_sub').replace(/\{score\}/g, String(score)) +
        ' \u00B7 ' + t('msg_checkmate');
    } else if (o.winner === 'b') {
      overlayTitle.textContent = t('lose_title');
      overlaySub.textContent = t('lose_sub').replace(/\{score\}/g, String(score)) +
        ' \u00B7 ' + t('msg_checkmate');
    } else {
      overlayTitle.textContent = t('msg_draw');
      overlaySub.textContent = o.reason === 'stalemate' ? t('msg_stalemate') : t('msg_draw');
    }
    overlayMoves.textContent = String(state.steps);
    recordBadge.hidden = !o.record;
  }

  /* ---------------- toast ---------------- */
  function showToast(msg) {
    if (!toastEl) { return; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
      toastEl.textContent = '';
      toastTimer = null;
    }, 2400);
  }
  function hideToast() {
    if (toastEl) { toastEl.hidden = true; toastEl.textContent = ''; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  }

  /* ---------------- 升变选择框 ---------------- */
  function buildPromo() {
    var i, btn, tp;
    for (i = 0; i < PROMO_TYPES.length; i++) {
      tp = PROMO_TYPES[i];
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bk__promoBtn';
      btn.setAttribute('data-promo', String(tp));
      btn.textContent = GLYPH[tp];
      (function (tt) {
        btn.addEventListener('click', function () { choosePromo(tt); });
      })(tp);
      promoRow.appendChild(btn);
    }
  }
  function showPromo() {
    promoTitle.textContent = t('msg_promote_choose');
    promoBox.hidden = false;
  }
  function hidePromo() { if (promoBox) { promoBox.hidden = true; } }
  function isPromoOpen() { return !!(promoBox && !promoBox.hidden); }
  function choosePromo(tp) {
    var p = state.pending;
    hidePromo();
    state.pending = null;
    if (!p) { return; }
    var chosen = null, i;
    for (i = 0; i < p.matches.length; i++) {
      if (p.matches[i].promo === tp) { chosen = p.matches[i]; break; }
    }
    if (!chosen) { chosen = p.matches[0]; }
    play('powerup');
    commitMove(chosen);
  }

  /* ---------------- 绘制 ---------------- */
  function resize() {
    if (!ctx) { return; }
    var avail = stage.clientWidth || 320;
    var cssW = Math.max(220, Math.min(avail, 520));
    var cssH = cssW;
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    view.cssW = cssW; view.cssH = cssH; view.dpr = dpr;
    view.S = cssW / 8;
    draw();
  }
  function idxFromClient(cx, cy) {
    var rect = canvas.getBoundingClientRect();
    var sx = view.cssW / (rect.width || view.cssW);
    var sy = view.cssH / (rect.height || view.cssH);
    var px = (cx - rect.left) * sx;
    var py = (cy - rect.top) * sy;
    var gx = Math.floor(px / view.S);
    var gy = Math.floor(py / view.S);
    if (gx < 0 || gx > 7 || gy < 0 || gy > 7) { return -1; }
    return gy * 8 + gx;
  }
  function fillSq(i, color) {
    var s = view.S;
    ctx.fillStyle = color;
    ctx.fillRect(colOf(i) * s, rowOf(i) * s, s, s);
  }
  function ringSq(i, color, width) {
    var s = view.S;
    var x = (colOf(i) + 0.5) * s, y = (rowOf(i) + 0.5) * s;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.40, 0, Math.PI * 2);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  function dotSq(i) {
    var s = view.S;
    var x = (colOf(i) + 0.5) * s, y = (rowOf(i) + 0.5) * s;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(38, 48, 68, .32)';
    ctx.fill();
  }
  function drawPieces() {
    var s = view.S, i, p, x, y, glyph;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = Math.round(s * 0.70) +
      'px "Segoe UI Symbol","Apple Symbols","Noto Sans Symbols 2","DejaVu Sans",serif';
    ctx.lineJoin = 'round';
    for (i = 0; i < 64; i++) {
      p = state.pos.board[i];
      if (!p) { continue; }
      x = (colOf(i) + 0.5) * s;
      y = (rowOf(i) + 0.5) * s;
      glyph = GLYPH[typeOf(p)];
      ctx.lineWidth = Math.max(1.2, s * 0.045);
      ctx.strokeStyle = p > 0 ? '#2B2F42' : '#F7F3EA';
      ctx.strokeText(glyph, x, y);
      ctx.fillStyle = p > 0 ? '#FFFDF8' : '#333A5C';
      ctx.fillText(glyph, x, y);
    }
  }
  function draw() {
    if (!ctx || !state) { return; }
    var s = view.S, w = view.cssW, h = view.cssH, r, c, i;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (r = 0; r < 8; r++) {
      for (c = 0; c < 8; c++) {
        ctx.fillStyle = ((r + c) % 2 === 0) ? '#EFE3C9' : '#A9825E';
        ctx.fillRect(c * s, r * s, s, s);
      }
    }
    /* 坐标：底行标 a-h，左列标 1-8，纯 ASCII，无语言依赖 */
    ctx.font = Math.max(9, Math.round(s * 0.15)) + 'px sans-serif';
    ctx.fillStyle = 'rgba(43, 47, 66, .55)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    for (c = 0; c < 8; c++) { ctx.fillText(String.fromCharCode(97 + c), (c + 1) * s - s * 0.06, h - s * 0.04); }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (r = 0; r < 8; r++) { ctx.fillText(String(8 - r), s * 0.06, r * s + s * 0.04); }

    if (state.lastMove) {
      fillSq(state.lastMove.from, 'rgba(240, 200, 90, .40)');
      fillSq(state.lastMove.to, 'rgba(240, 200, 90, .40)');
    }
    if (state.status === 'playing' && inCheck(state.pos, state.pos.turn)) {
      var k = findKing(state.pos, state.pos.turn);
      if (k >= 0) { fillSq(k, 'rgba(200, 70, 70, .50)'); }
    }
    if (state.selected >= 0) { fillSq(state.selected, 'rgba(107, 122, 194, .55)'); }

    var showLegal = state.legal.length &&
      (state.legalUntil === 0 || Date.now() < state.legalUntil);
    if (showLegal) {
      for (i = 0; i < state.legal.length; i++) {
        if (state.pos.board[state.legal[i]] === 0) { dotSq(state.legal[i]); }
        else { ringSq(state.legal[i], 'rgba(38, 48, 68, .48)', Math.max(2, s * 0.07)); }
      }
    }
    if (state.hintMove && Date.now() < state.hintUntil) {
      ringSq(state.hintMove[0], 'rgba(156, 122, 194, .85)', Math.max(2, s * 0.07));
      ringSq(state.hintMove[1], 'rgba(156, 122, 194, .85)', Math.max(2, s * 0.07));
    }
    drawPieces();
  }

  /* ---------------- 回合计时 / tick ---------------- */
  function startTimer() { if (cfg().timed && !state.runStart) { state.runStart = Date.now(); } }
  function stopTimer() {
    if (state.runStart) {
      state.elapsedBase += Date.now() - state.runStart;
      state.runStart = 0;
    }
  }
  function tick() {
    if (!state || state.status !== 'playing') { return; }
    updateTimeHUD();
    var changed = false;
    if (state.legalUntil && Date.now() > state.legalUntil) {
      state.legal = []; state.legalUntil = 0; changed = true;
    }
    if (state.hintUntil && Date.now() > state.hintUntil) {
      state.hintMove = null; state.hintUntil = 0; changed = true;
    }
    if (changed) { draw(); }
  }
  function startLoop() { if (!loopId) { loopId = setInterval(tick, 220); } }
  function stopLoop() { if (loopId) { clearInterval(loopId); loopId = null; } }

  /* ---------------- 核心流程 ---------------- */
  function pushUndo() {
    state.undoStack.push({
      pos: clonePos(state.pos),
      repHistory: state.repHistory.slice(),
      steps: state.steps,
      lastMove: state.lastMove ? { from: state.lastMove.from, to: state.lastMove.to } : null,
      elapsedBase: state.elapsedBase,
      over: state.over
    });
  }
  function commitMove(m) {
    var captured = (state.pos.board[m.to] !== 0) || m.ep;
    pushUndo();
    state.pos = makeMove(state.pos, m);
    state.repHistory.push(state.pos.key);
    state.steps++;
    state.lastMove = { from: m.from, to: m.to };
    state.selected = -1; state.legal = []; state.legalUntil = 0;
    state.hintMove = null; state.hintUntil = 0;

    if (m.castle) { showToast(t('msg_castle')); play('rotate'); }
    else if (m.promo) { showToast(t('msg_promote')); play('levelup'); }
    else if (captured) { play('boom'); }
    else { play('place'); }

    saveState();
    syncHUD();
    var gs = gameStatus(state.pos, state.repHistory);
    draw();
    if (gs.over) { finish(gs); return; }
    if (inCheck(state.pos, state.pos.turn)) { showToast(t('msg_check')); play('warn'); }
    else if (captured && !m.promo && !m.castle) { showToast(t('msg_capture')); }

    if (state.pos.turn === 'b') { scheduleAI(); }
    else { state.locked = false; }
  }
  function finish(gs) {
    clearTimeout(aiTimer); aiTimer = null;
    stopTimer(); stopLoop();
    state.status = 'over'; state.locked = true;
    var record = false;
    if (gs.winner === 'w') {
      var moves = Math.max(1, state.pos.full);
      if (best === 0 || moves < best) { best = moves; saveBest(best); record = true; }
      play(record ? 'perfect' : 'win');
    } else {
      play('lose');
    }
    state.over = { winner: gs.winner, reason: gs.reason, record: record };
    overlay.hidden = false; card.hidden = true; hidePromo();
    renderOverlay();
    syncHUD();
    saveState();
    draw();
  }
  function scheduleAI() {
    state.locked = true;
    clearTimeout(aiTimer);
    aiTimer = setTimeout(function () {
      aiTimer = null;
      if (state.status === 'playing' && state.pos.turn === 'b') { aiMove(); }
    }, cfg().delay);
    syncHUD();
  }

  function resetGame() {
    clearTimeout(aiTimer); aiTimer = null;
    stopTimer();
    hideToast();
    hidePromo();
    var c = cfg();
    state.pos = initialPos();
    state.repHistory = [state.pos.key];
    state.undoStack = [];
    state.steps = 0;
    state.undoLeft = c.undos;
    state.hintLeft = c.hints;
    state.selected = -1; state.legal = []; state.legalUntil = 0;
    state.hintMove = null; state.hintUntil = 0;
    state.lastMove = null;
    state.status = 'playing'; state.started = true; state.locked = false;
    state.over = null;
    state.elapsedBase = 0; state.runStart = 0;
    state.pending = null;
    overlay.hidden = true; card.hidden = true;
    saveState(); /* [gyh 2026-11-10 新增] 开局立刻写完整局面 */
    syncHUD(); startTimer(); startLoop();
    draw();
  }
  function startGame() {
    if (state.status === 'paused') { resumeGame(); return; }
    resetGame();
    play('start');
  }
  function resumeGame() {
    state.status = 'playing'; state.locked = false; state.started = true;
    card.hidden = true;
    startTimer(); startLoop();
    saveState(); syncHUD(); play('toggle'); draw();
    if (state.pos.turn === 'b') { scheduleAI(); }
  }
  function togglePause() {
    if (state.status === 'over') { return; }
    if (state.status === 'paused') { resumeGame(); return; }
    clearTimeout(aiTimer); aiTimer = null;
    stopTimer(); stopLoop();
    state.status = 'paused'; state.locked = true;
    saveState(); renderCard(); syncHUD(); play('toggle'); draw();
  }
  /* [gyh 2026-11-10 新增] 切档：先幂等写盘（含点到当前同档），再清场，最后才显示提示条 */
  function switchDiff(diff) {
    if (!DIFFS[diff]) { return; }
    try { localStorage.setItem(DIFF_KEY, diff); } catch (e) {}
    state.diff = diff;
    syncDiffs();
    resetGame();
    showToast(t('confirm_diff'));
    play('toggle');
  }

  function clearSelection() {
    state.selected = -1; state.legal = []; state.legalUntil = 0;
    draw();
  }
  function selectPiece(i) {
    var code = state.pos.board[i];
    if (!code || code < 0) { return; }
    var ms = legalMoves(state.pos, 'w', i);
    state.selected = i;
    state.legal = [];
    var k, to;
    for (k = 0; k < ms.length; k++) {
      to = ms[k].to;
      if (state.legal.indexOf(to) < 0) { state.legal.push(to); }
    }
    state.hintMove = null;
    if (cfg().alwaysLegal) {
      state.legalUntil = 0; /* 持久高亮 */
    } else if (state.hintLeft === Infinity || state.hintLeft > 0) {
      if (state.hintLeft !== Infinity) { state.hintLeft -= 1; }
      state.legalUntil = Date.now() + 1600; /* 短暂提示 */
    } else {
      state.legal = []; state.legalUntil = 0;
    }
    if (!ms.length) { showToast(t('msg_no_moves')); }
    play('select');
    syncHUD(); draw();
  }
  function doPlayerMove(from, to) {
    var ms = legalMoves(state.pos, 'w', from), matches = [], i;
    for (i = 0; i < ms.length; i++) { if (ms[i].to === to) { matches.push(ms[i]); } }
    if (!matches.length) { return false; }
    if (matches[0].promo) {
      state.pending = { from: from, to: to, matches: matches };
      showPromo();
      return true;
    }
    commitMove(matches[0]);
    return true;
  }
  function handleTap(i) {
    if (i < 0) { return; }
    if (!state.started) {
      state.started = true; card.hidden = true; saveState(); play('start');
    }
    if (state.status !== 'playing' || state.locked || state.pos.turn !== 'w') { return; }
    if (isPromoOpen()) { return; }
    var code = state.pos.board[i];
    var mine = code > 0;
    if (state.selected >= 0) {
      if (i === state.selected) { clearSelection(); return; }
      if (doPlayerMove(state.selected, i)) { return; }
      if (mine) { selectPiece(i); return; }
      clearSelection(); showToast(t('msg_invalid')); play('warn'); draw(); return;
    }
    if (mine) { selectPiece(i); }
  }
  function undo() {
    if (!state.started || state.status === 'paused') { return; }
    if (state.undoLeft !== Infinity && state.undoLeft <= 0) {
      play('warn'); showToast(t('msg_invalid')); return;
    }
    clearTimeout(aiTimer); aiTimer = null;
    hidePromo();
    var snap = null;
    while (state.undoStack.length) {
      snap = state.undoStack.pop();
      if (snap.pos.turn === 'w') { break; }
    }
    if (!snap) { return; }
    state.pos = clonePos(snap.pos);
    state.repHistory = snap.repHistory.slice();
    state.steps = snap.steps;
    state.lastMove = snap.lastMove;
    state.elapsedBase = snap.elapsedBase;
    state.runStart = 0;
    if (state.undoLeft !== Infinity) { state.undoLeft -= 1; }
    state.status = 'playing'; state.locked = false; state.over = null;
    state.started = true;
    state.selected = -1; state.legal = []; state.legalUntil = 0;
    state.hintMove = null; state.hintUntil = 0; state.pending = null;
    overlay.hidden = true; card.hidden = true;
    saveState(); syncHUD(); renderCard(); startTimer(); startLoop(); draw();
    play('tap');
  }
  function hint() {
    if (state.status !== 'playing' || state.locked || state.pos.turn !== 'w') { return; }
    if (state.hintLeft !== Infinity && state.hintLeft <= 0) { play('warn'); return; }
    var moves = legalMoves(state.pos, 'w', -1);
    if (!moves.length) { showToast(t('msg_no_moves')); return; }
    var m = moves[Math.floor(Math.random() * moves.length)];
    state.hintMove = [m.from, m.to];
    state.hintUntil = Date.now() + 1900;
    state.selected = -1; state.legal = []; state.legalUntil = 0;
    if (state.hintLeft !== Infinity) { state.hintLeft -= 1; }
    play('tick'); syncHUD(); draw();
  }

  /* ---------------- 输入 ---------------- */
  function coords(e) {
    if (e.touches && e.touches.length) { return { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
    if (e.changedTouches && e.changedTouches.length) { return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }; }
    return { x: e.clientX, y: e.clientY };
  }
  function onDown(e) {
    if (e.cancelable) { e.preventDefault(); }
    lastDownT = Date.now();
    var c = coords(e);
    handleTap(idxFromClient(c.x, c.y));
  }
  function onClick(e) {
    if (Date.now() - lastDownT < 600) { return; }
    var c = coords(e);
    handleTap(idxFromClient(c.x, c.y));
  }
  function onKey(e) {
    var k = e.key || String.fromCharCode(e.keyCode || e.which || 0);
    var lower = k.length === 1 ? k.toLowerCase() : k;
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (!state.started) { startGame(); }
      else if (state.status === 'paused') { resumeGame(); }
      return;
    }
    if (lower === 'u') { undo(); return; }
    if (lower === 'h') { hint(); return; }
    if (lower === 'p') { togglePause(); }
  }
  function bind() {
    $('btn-start').addEventListener('click', startGame);
    $('btn-undo').addEventListener('click', undo);
    $('btn-hint').addEventListener('click', hint);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-restart').addEventListener('click', startGame);
    $('btn-again').addEventListener('click', startGame);
    cardBtn.addEventListener('click', function () {
      if (state.status === 'paused') { resumeGame(); } else { startGame(); }
    });
    var btns = diffsBox.querySelectorAll('.seg__btn'), i;
    for (i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { switchDiff(b.getAttribute('data-diff')); });
      })(btns[i]);
    }
    if (window.PointerEvent) { canvas.addEventListener('pointerdown', onDown); }
    else {
      canvas.addEventListener('mousedown', onDown);
      canvas.addEventListener('touchstart', onDown, false);
    }
    canvas.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    document.addEventListener('ys:langchange', function () {
      hideToast();
      renderCard();
      if (state.status === 'over') { renderOverlay(); }
      promoTitle.textContent = t('msg_promote_choose');
      syncHUD();
      draw();
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    canvas = $('canvas');
    ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) { return; }
    stage = document.querySelector('.bk__stage');
    card = $('card'); cardTitle = $('card-title'); cardSub = $('card-sub');
    cardBtn = $('btn-start-card');
    overlay = $('overlay'); overlayTitle = $('overlay-title');
    overlaySub = $('overlay-sub'); overlayMoves = $('overlay-moves');
    recordBadge = $('record-badge');
    diffsBox = $('diffs'); toastEl = $('toast');
    promoBox = $('promo'); promoTitle = $('promo-title'); promoRow = $('promo-row');
    extrasEl = $('extras');
    buildPromo();

    best = loadBest();
    var saved = loadState();
    var diff = (saved && DIFFS[saved.diff]) ? saved.diff : loadDiff();
    try { localStorage.setItem(DIFF_KEY, diff); } catch (e) {}

    var pos, rep, steps, undoLeft, hintLeft, status, started, over, lastMove, elapsedBase;
    if (saved) {
      pos = makePos(saved.board.slice(), saved.turn, saved.castling.slice(),
        saved.ep, saved.half || 0, saved.full || 1);
      rep = (saved.repHistory && saved.repHistory.length) ? saved.repHistory.slice() : [pos.key];
      steps = saved.steps || 0;
      undoLeft = (saved.undoLeft === -1 || saved.undoLeft === null || saved.undoLeft === undefined)
        ? Infinity : (parseInt(saved.undoLeft, 10) || 0);
      hintLeft = (saved.hintLeft === -1 || saved.hintLeft === null || saved.hintLeft === undefined)
        ? Infinity : (parseInt(saved.hintLeft, 10) || 0);
      status = (saved.status === 'over' || saved.status === 'paused') ? saved.status : 'playing';
      started = saved.started !== false;
      over = saved.over || null;
      lastMove = saved.lastMove || null;
      elapsedBase = saved.elapsedBase || 0;
    } else {
      pos = initialPos();
      rep = [pos.key];
      steps = 0;
      undoLeft = DIFFS[diff].undos;
      hintLeft = DIFFS[diff].hints;
      status = 'playing';
      started = false;
      over = null;
      lastMove = null;
      elapsedBase = 0;
    }
    if (status === 'over' && !over) { over = { winner: 'b', reason: 'checkmate', record: false }; }

    state = {
      diff: diff, pos: pos, repHistory: rep, undoStack: [],
      steps: steps, undoLeft: undoLeft, hintLeft: hintLeft,
      selected: -1, legal: [], legalUntil: 0, hintMove: null, hintUntil: 0,
      lastMove: lastMove, status: status, started: started,
      locked: status !== 'playing', over: over,
      elapsedBase: elapsedBase, runStart: 0, pending: null
    };

    saveState(); /* [gyh 2026-11-10 新增] 首屏即落盘，刷新恢复同一盘棋 */
    bind();
    syncDiffs(); syncHUD(); resize(); renderCard();
    if (status === 'over') { overlay.hidden = false; renderOverlay(); }
    else if (status === 'playing') {
      if (state.started) { startLoop(); startTimer(); }
      if (state.pos.turn === 'b') { scheduleAI(); }
    }
    draw();
  }

  /* ---------------- 自测钩子：仅供 _temp/b6-chess-smoke.js 驱动特殊局面
     [gyh 2026-11-10 新增] 不拆文件、不影响正常玩法，未调用时完全静默
     ------------------------------------------------ */
  window.__chessTest = {
    setup: function (b64, opts) {
      opts = opts || {};
      clearTimeout(aiTimer); aiTimer = null;
      state.pos = makePos(b64.slice(), opts.turn || 'w',
        (opts.castling || [false, false, false, false]).slice(),
        opts.ep == null ? -1 : opts.ep, opts.half || 0, opts.full || 1);
      state.repHistory = [state.pos.key];
      state.undoStack = [];
      state.steps = 0;
      state.undoLeft = cfg().undos; state.hintLeft = cfg().hints;
      state.selected = -1; state.legal = []; state.legalUntil = 0;
      state.hintMove = null; state.hintUntil = 0; state.lastMove = null;
      state.status = 'playing'; state.started = true; state.locked = false;
      state.over = null; state.elapsedBase = 0; state.runStart = 0;
      state.pending = null;
      hidePromo(); hideToast();
      card.hidden = true; overlay.hidden = true;
      saveState(); syncHUD(); renderCard(); draw();
      return true;
    },
    tap: function (r, c) { handleTap(sq(r, c)); return true; },
    legal: function (r, c) {
      var ms = legalMoves(state.pos, state.pos.turn, sq(r, c));
      var out = [], u = [], i;
      for (i = 0; i < ms.length; i++) { out.push(ms[i].to); }
      for (i = 0; i < out.length; i++) { if (u.indexOf(out[i]) < 0) { u.push(out[i]); } }
      return u;
    },
    board: function () { return state.pos.board.slice(); },
    turn: function () { return state.pos.turn; },
    promoOpen: function () { return isPromoOpen(); },
    choosePromo: function (tp) { choosePromo(tp); return true; },
    state: function () {
      return {
        status: state.status, started: state.started, diff: state.diff,
        steps: state.steps, over: state.over, full: state.pos.full,
        turn: state.pos.turn, locked: state.locked
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
