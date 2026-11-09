(function () {
  'use strict';
  // [gyh 2026-11-09 新增] 中国象棋规则引擎：纯 ES5、IIFE、无 DOM 依赖
  // 棋盘为长度 90 的数组，idx = y * 9 + x；y=0 黑方底线，y=9 红方底线。
  var root = typeof window !== 'undefined' ? window : global;
  var W = 9, H = 10, SIZE = W * H;
  var RED = 'r', BLACK = 'b';
  // [gyh 2026-11-09 新增] 子力价值表
  var VAL = { K: 10000, A: 200, B: 200, N: 400, R: 900, C: 450, P: 100 };

  // [gyh 2026-11-09 新增] 棋子颜色：红大写、黑小写、空格 0
  function pieceColor(code) {
    if (code === 0 || code === '0' || code === null || code === undefined) return null;
    var c = String(code);
    if (c.length !== 1) return null;
    if ('KABNRCP'.indexOf(c) >= 0) return RED;
    if ('kabnrcp'.indexOf(c) >= 0) return BLACK;
    return null;
  }

  function sq(x, y) { return y * W + x; }
  function inBoard(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }
  function isEmpty(board, idx) { return pieceColor(board[idx]) === null; }
  function opponent(s) { return s === RED ? BLACK : RED; }
  // [gyh 2026-11-09 新增] 九宫范围判定
  function inPalace(side, x, y) {
    if (x < 3 || x > 5) return false;
    return side === RED ? (y >= 7 && y <= 9) : (y >= 0 && y <= 2);
  }

  // [gyh 2026-11-09 新增] 生成某棋子的伪合法落点（不含"己方被将"过滤）
  function genMoves(board, from) {
    var code = board[from];
    var side = pieceColor(code);
    if (!side) return [];
    var x = from % W, y = (from / W) | 0;
    var t = String(code).toUpperCase();
    var res = [], i, nx, ny, to, tc, dx, dy;

    // [gyh 2026-11-09 新增] 落点为空格或敌子才算候选
    function add(ax, ay) {
      if (!inBoard(ax, ay)) return;
      var idx = sq(ax, ay);
      if (pieceColor(board[idx]) !== side) res.push(idx);
    }

    if (t === 'R') {
      // [gyh 2026-11-09 新增] 车：直线滑动，遇己子停、遇敌子吃后停
      var rd = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (i = 0; i < 4; i++) {
        nx = x + rd[i][0]; ny = y + rd[i][1];
        while (inBoard(nx, ny)) {
          to = sq(nx, ny); tc = pieceColor(board[to]);
          if (tc === side) break;
          res.push(to);
          if (tc !== null) break;
          nx += rd[i][0]; ny += rd[i][1];
        }
      }
    } else if (t === 'C') {
      // [gyh 2026-11-09 新增] 炮：不吃子同车；吃子需恰好一个炮架
      var cd = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (i = 0; i < 4; i++) {
        nx = x + cd[i][0]; ny = y + cd[i][1];
        var jumped = false;
        while (inBoard(nx, ny)) {
          to = sq(nx, ny); tc = pieceColor(board[to]);
          if (!jumped) {
            if (tc === null) res.push(to); else jumped = true;
          } else if (tc !== null) {
            if (tc !== side) res.push(to);
            break;
          }
          nx += cd[i][0]; ny += cd[i][1];
        }
      }
    } else if (t === 'N') {
      // [gyh 2026-11-09 新增] 马：走日 + 蹩马腿
      var nd = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
      for (i = 0; i < 8; i++) {
        dx = nd[i][0]; dy = nd[i][1];
        var lx = x + (dx === 2 ? 1 : (dx === -2 ? -1 : 0));
        var ly = y + (dy === 2 ? 1 : (dy === -2 ? -1 : 0));
        if (!inBoard(lx, ly) || !isEmpty(board, sq(lx, ly))) continue;
        add(x + dx, y + dy);
      }
    } else if (t === 'B') {
      // [gyh 2026-11-09 新增] 象：走田 + 塞象眼 + 不可过河
      var bd = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
      for (i = 0; i < 4; i++) {
        nx = x + bd[i][0]; ny = y + bd[i][1];
        if (!inBoard(nx, ny)) continue;
        if (side === RED && ny < 5) continue;
        if (side === BLACK && ny > 4) continue;
        var ex = x + bd[i][0] / 2, ey = y + bd[i][1] / 2;
        if (!isEmpty(board, sq(ex, ey))) continue;
        add(nx, ny);
      }
    } else if (t === 'A' || t === 'K') {
      // [gyh 2026-11-09 新增] 士斜走 / 将直走，仅限九宫内一格
      var pd = t === 'A'
        ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        : [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (i = 0; i < 4; i++) {
        nx = x + pd[i][0]; ny = y + pd[i][1];
        if (!inPalace(side, nx, ny)) continue;
        add(nx, ny);
      }
    } else if (t === 'P') {
      // [gyh 2026-11-09 新增] 兵：未过河只前进，过河后可横走，永不后退
      var up = side === RED ? -1 : 1;
      add(x, y + up);
      var crossed = side === RED ? (y <= 4) : (y >= 5);
      if (crossed) { add(x - 1, y); add(x + 1, y); }
    }
    return res;
  }

  // [gyh 2026-11-09 新增] 复制棋盘并落子，不修改入参
  function applyMove(board, from, to) {
    var nb = board.slice();
    nb[to] = board[from];
    nb[from] = 0;
    return nb;
  }

  // [gyh 2026-11-09 新增] 是否被将军（含将帅照面）
  function inCheck(board, side) {
    var rk = -1, bk = -1, i;
    for (i = 0; i < SIZE; i++) {
      if (board[i] === 'K') rk = i;
      else if (board[i] === 'k') bk = i;
    }
    // [gyh 2026-11-09 新增] 飞将：两将同列且中间无子，视为被将状态
    if (rk >= 0 && bk >= 0 && (rk % W) === (bk % W)) {
      var col = rk % W;
      var y1 = (rk / W) | 0, y2 = (bk / W) | 0;
      var lo = y1 < y2 ? y1 : y2, hi = y1 < y2 ? y2 : y1, clear = true;
      for (var yy = lo + 1; yy < hi; yy++) {
        if (!isEmpty(board, sq(col, yy))) { clear = false; break; }
      }
      if (clear) return true;
    }
    var kingSq = side === RED ? rk : bk;
    if (kingSq < 0) return false;
    var opp = opponent(side);
    for (i = 0; i < SIZE; i++) {
      if (pieceColor(board[i]) !== opp) continue;
      if (genMoves(board, i).indexOf(kingSq) >= 0) return true;
    }
    return false;
  }

  // [gyh 2026-11-09 新增] 合法着法：过滤走后己方仍被将军的着法
  function legalMoves(board, side, from) {
    if (typeof from !== 'number' || from !== (from | 0) || from < 0 || from >= SIZE) return [];
    if (pieceColor(board[from]) !== side) return [];
    var pseudo = genMoves(board, from), res = [], i, nb;
    for (i = 0; i < pseudo.length; i++) {
      nb = applyMove(board, from, pseudo[i]);
      if (!inCheck(nb, side)) res.push(pseudo[i]);
    }
    return res;
  }

  // [gyh 2026-11-09 新增] 全部合法着法
  function allMoves(board, side) {
    var res = [], i, j, tos;
    for (i = 0; i < SIZE; i++) {
      if (pieceColor(board[i]) !== side) continue;
      tos = legalMoves(board, side, i);
      for (j = 0; j < tos.length; j++) res.push([i, tos[j]]);
    }
    return res;
  }

  // [gyh 2026-11-09 新增] 终局：无着法时，被将=将死，否则=困毙，均判对方胜
  function isOver(board, sideToMove) {
    if (allMoves(board, sideToMove).length > 0) {
      return { over: false, winner: null, reason: null };
    }
    return {
      over: true,
      winner: opponent(sideToMove),
      reason: inCheck(board, sideToMove) ? 'checkmate' : 'stalemate'
    };
  }

  // [gyh 2026-11-09 新增] 标准开局布局
  function initialBoard() {
    var b = [], i, px = [0, 2, 4, 6, 8];
    for (i = 0; i < SIZE; i++) b.push(0);
    var backB = ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'];
    var backR = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'];
    for (i = 0; i < 9; i++) { b[i] = backB[i]; b[sq(i, 9)] = backR[i]; }
    b[sq(1, 2)] = 'c'; b[sq(7, 2)] = 'c';
    for (i = 0; i < px.length; i++) {
      b[sq(px[i], 3)] = 'p';
      b[sq(px[i], 6)] = 'P';
    }
    b[sq(1, 7)] = 'C'; b[sq(7, 7)] = 'C';
    return b;
  }

  // [gyh 2026-11-09 新增] 子力价值，过河兵加成
  function pieceValue(code, idx) {
    var c = String(code).toUpperCase();
    var v = VAL[c] || 0;
    if (c === 'P') {
      var y = (idx / W) | 0;
      if (pieceColor(code) === RED ? (y <= 4) : (y >= 5)) v += 80;
    }
    return v;
  }

  // [gyh 2026-11-09 新增] 简单位置价值
  function positionBonus(code, idx) {
    var x = idx % W, y = (idx / W) | 0;
    var c = String(code).toUpperCase(), col = pieceColor(code);
    var center = 4 - Math.abs(4 - x);
    if (c === 'N' || c === 'C' || c === 'R') return center * 2;
    if (c === 'P') return (col === RED ? (9 - y) : y) * 3;
    return 0;
  }

  // [gyh 2026-11-09 新增] 伪合法着法总数，用作移动性指标
  function mobility(board, side) {
    var m = 0;
    for (var i = 0; i < SIZE; i++) {
      if (pieceColor(board[i]) === side) m += genMoves(board, i).length;
    }
    return m;
  }

  // [gyh 2026-11-09 新增] 局面评估（当前行棋方视角）
  function evaluate(board, side, level) {
    var score = 0, i, code, col, v;
    for (i = 0; i < SIZE; i++) {
      code = board[i]; col = pieceColor(code);
      if (!col) continue;
      v = pieceValue(code, i);
      if (level !== 'easy') v += positionBonus(code, i);
      score += (col === side ? v : -v);
    }
    // [gyh 2026-11-09 新增] hard：将军/被将权重 + 移动性
    if (level === 'hard') {
      var opp = opponent(side);
      if (inCheck(board, opp)) score += 40;
      if (inCheck(board, side)) score -= 40;
      score += (mobility(board, side) - mobility(board, opp)) * 2;
    }
    return score;
  }

  // [gyh 2026-11-09 新增] negamax + alpha-beta，节点上限兜底保证有限时间返回
  function search(board, side, depth, alpha, beta, level, ctx) {
    ctx.nodes++;
    if (ctx.nodes > ctx.limit || depth <= 0) return evaluate(board, side, level);
    var moves = allMoves(board, side);
    if (moves.length === 0) return -100000 + (ctx.rootDepth - depth);
    var best = -Infinity, opp = opponent(side), i, val, nb;
    for (i = 0; i < moves.length; i++) {
      nb = applyMove(board, moves[i][0], moves[i][1]);
      val = -search(nb, opp, depth - 1, -beta, -alpha, level, ctx);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // [gyh 2026-11-09 新增] AI 选点：easy 深度1、medium 深度2、hard 深度3
  function bestMove(board, side, level) {
    if (level !== 'easy' && level !== 'hard') level = 'medium';
    var depth = level === 'easy' ? 1 : (level === 'hard' ? 3 : 2);
    var limit = level === 'easy' ? 2000 : (level === 'hard' ? 20000 : 4000);
    var moves = allMoves(board, side);
    if (moves.length === 0) return null;
    var ctx = { nodes: 0, limit: limit, rootDepth: depth };
    var opp = opponent(side), scored = [], i, nb, val, alpha = -Infinity;
    for (i = 0; i < moves.length; i++) {
      nb = applyMove(board, moves[i][0], moves[i][1]);
      val = depth === 1
        ? evaluate(nb, side, level)
        : -search(nb, opp, depth - 1, -Infinity, -alpha, level, ctx);
      scored.push({ m: moves[i], v: val });
      if (val > alpha) alpha = val;
    }
    scored.sort(function (a, b) { return b.v - a.v; });
    // [gyh 2026-11-09 新增] easy：30% 概率从次优着里挑
    if (level === 'easy' && scored.length > 1 && Math.random() < 0.3) {
      return scored[1 + Math.floor(Math.random() * Math.min(3, scored.length - 1))].m;
    }
    return scored[0].m;
  }

  var api = {
    W: W, H: H,
    initialBoard: initialBoard,
    legalMoves: legalMoves,
    allMoves: allMoves,
    inCheck: inCheck,
    isOver: isOver,
    applyMove: applyMove,
    pieceColor: pieceColor,
    bestMove: bestMove
  };
  root.XQRules = api;
  if (typeof window !== 'undefined' && window !== root) window.XQRules = api;
})();
