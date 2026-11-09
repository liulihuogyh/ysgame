/* [gyh 2026-11-09 新增] 中国象棋：Canvas 渲染 + 交互 + AI 调度 + 存档
   规则全部调用 window.XQRules 固定接口，本文件不实现任何走子规则。纯 ES5 / IIFE / 'use strict'。 */
(function () {
  'use strict';

  var XR = window.XQRules;
  var I = window.I18N;
  var S = window.YSound;

  var W = 9, H = 10, SIZE = W * H;
  var STATE_KEY = 'ysgame-xiangqi-state';
  var BEST_KEY = 'ysgame-xiangqi-best';
  var DIFF_KEY = 'ysgame-xiangqi-diff';
  var DIFFS = {
    easy:   { delay: 260, undos: Infinity, level: 'easy' },
    medium: { delay: 330, undos: 3,        level: 'medium' },
    hard:   { delay: 420, undos: 1,        level: 'hard' }
  };
  // 中文棋子字（红 / 黑）；英文模式用大写字母 + 颜色区分
  var ZH = {
    K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵',
    k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒'
  };

  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext ? canvas.getContext('2d') : null;
  var stage = document.querySelector('.bk__stage');
  var card = document.getElementById('card');
  var cardTitle = document.getElementById('card-title');
  var cardSub = document.getElementById('card-sub');
  var cardBtn = document.getElementById('btn-start-card');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlay-title');
  var overlaySub = document.getElementById('overlay-sub');
  var overlayMoves = document.getElementById('overlay-moves');
  var diffsBox = document.getElementById('diffs');
  var elSide = document.getElementById('side');
  var elTurn = document.getElementById('turn');
  var elSteps = document.getElementById('steps');
  var elUndo = document.getElementById('undo-left');
  var elBest = document.getElementById('best');

  var state = null;
  var best = 0;
  var view = { cssW: 0, cssH: 0, dpr: 1, S: 1, offX: 0, offY: 0 };
  var aiTimer = null;
  var rafId = null;
  var loopOn = false;
  var lastT = 0;
  var pulse = 0;
  var toastTimer = null;
  var lastDownT = 0;

  function isEn() { return !!(I && I.lang === 'en'); }
  function t(key) { return I ? I.t(key) : key; }
  function play(name) { if (S && S.play) { try { S.play(name); } catch (e) {} } }
  function cfg() { return DIFFS[state.diff] || DIFFS.medium; }

  /* ------------------------------------------------------------------
     存档 / 读档
     ------------------------------------------------------------------ */
  function saveState() {
    if (!state) return;
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        v: 1,
        diff: state.diff,
        board: state.board,
        turn: state.turn,
        undoStack: state.undoStack,
        steps: state.steps,
        status: state.status,
        undoLeft: state.undoLeft === Infinity ? -1 : state.undoLeft,
        started: state.started,
        over: state.over
      }));
    } catch (e) {}
  }

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(STATE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var d = JSON.parse(raw);
      if (!d || !d.board || d.board.length !== SIZE) return null;
      return d;
    } catch (e) { return null; }
  }

  function loadDiff() {
    var d = 'medium';
    try {
      var s = localStorage.getItem(DIFF_KEY);
      if (s === 'easy' || s === 'medium' || s === 'hard') d = s;
    } catch (e) {}
    return d;
  }

  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(n) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) {} }

  /* ------------------------------------------------------------------
     HUD / 难度按钮 / 卡片 / 结算文案
     ------------------------------------------------------------------ */
  function sideName(s) {
    if (isEn()) return s === 'r' ? 'Red' : 'Black';
    return s === 'r' ? '红方' : '黑方';
  }

  function syncHUD() {
    if (!state) return;
    elSide.textContent = isEn() ? 'Red' : '红';
    elTurn.textContent = sideName(state.turn) + (state.locked && state.turn === 'b' ? ' …' : '');
    elSteps.textContent = String(state.steps);
    elUndo.textContent = state.undoLeft === Infinity ? '∞' : String(state.undoLeft);
    elBest.textContent = String(best);
  }

  function syncDiffs() {
    var btns = diffsBox.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var on = b.getAttribute('data-diff') === state.diff;
      if (on) b.classList.add('is-active'); else b.classList.remove('is-active');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function renderCard() {
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
    if (!state.over) return;
    var won = state.over.winner === 'r';
    overlayTitle.textContent = t(won ? 'win_title' : 'lose_title');
    var sub = t(won ? 'win_sub' : 'lose_sub').replace(/\{score\}/g, String(Math.max(1, state.steps)));
    var reason = t(state.over.reason === 'stalemate' ? 'msg_stalemate' : 'msg_checkmate');
    overlaySub.textContent = sub + ' · ' + reason;
    overlayMoves.textContent = String(state.steps);
  }

  function showToast(msg) {
    // 重开/清场之后才调用：容器按需创建并显示，2 秒后移除
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'bk__toast';
      stage.appendChild(el);
    }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    el.textContent = msg;
    el.hidden = false;
    toastTimer = setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      toastTimer = null;
    }, 2000);
  }

  /* ------------------------------------------------------------------
     Canvas 坐标换算（含 devicePixelRatio 与 CSS 缩放）
     ------------------------------------------------------------------ */
  function resize() {
    if (!ctx) return;
    var avail = stage.clientWidth || 320;
    var cssW = Math.max(220, Math.min(avail, 560));
    var cssH = Math.round(cssW * 10 / 9); // 9:10 棋盘比例
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    view.cssW = cssW; view.cssH = cssH; view.dpr = dpr;
    var pad = Math.max(16, cssW * 0.05);
    var cw = (cssW - 2 * pad) / 8;
    var ch = (cssH - 2 * pad) / 9;
    var s = Math.min(cw, ch);
    view.S = s;
    view.offX = (cssW - 8 * s) / 2;
    view.offY = (cssH - 9 * s) / 2;
    draw();
  }

  function IX(x) { return view.offX + x * view.S; }
  function IY(y) { return view.offY + y * view.S; }
  function pc(idx) { return { x: IX(idx % W), y: IY(Math.floor(idx / W)) }; }

  function idxFromClient(cx, cy) {
    var rect = canvas.getBoundingClientRect();
    var sx = view.cssW / (rect.width || view.cssW);
    var sy = view.cssH / (rect.height || view.cssH);
    var px = (cx - rect.left) * sx;
    var py = (cy - rect.top) * sy;
    var gx = Math.round((px - view.offX) / view.S);
    var gy = Math.round((py - view.offY) / view.S);
    if (gx < 0 || gx > 8 || gy < 0 || gy > 9) return -1;
    var ix = view.offX + gx * view.S;
    var iy = view.offY + gy * view.S;
    var dx = px - ix, dy = py - iy;
    if (dx * dx + dy * dy > (view.S * 0.62) * (view.S * 0.62)) return -1;
    return gy * W + gx;
  }

  /* ------------------------------------------------------------------
     绘制：木色棋盘 / 楚河汉界 / 九宫 / 棋子 / 各类高亮
     ------------------------------------------------------------------ */
  function drawBoard() {
    var w = view.cssW, h = view.cssH, s = view.S;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#F3E0B8');
    g.addColorStop(1, '#E4C68F');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(122,74,34,0.05)';
    ctx.lineWidth = 1;
    for (var wy = 6; wy < h; wy += 9) {
      ctx.beginPath(); ctx.moveTo(0, wy); ctx.lineTo(w, wy); ctx.stroke();
    }

    ctx.strokeStyle = '#6B4423';
    ctx.lineWidth = 2;
    ctx.strokeRect(IX(0) - 4, IY(0) - 4, 8 * s + 8, 9 * s + 8);

    ctx.strokeStyle = '#7A4A22';
    ctx.lineWidth = 1.2;
    var i;
    for (i = 0; i < 10; i++) {
      ctx.beginPath(); ctx.moveTo(IX(0), IY(i)); ctx.lineTo(IX(8), IY(i)); ctx.stroke();
    }
    for (i = 0; i < 9; i++) {
      if (i === 0 || i === 8) {
        ctx.beginPath(); ctx.moveTo(IX(i), IY(0)); ctx.lineTo(IX(i), IY(9)); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(IX(i), IY(0)); ctx.lineTo(IX(i), IY(4)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(IX(i), IY(5)); ctx.lineTo(IX(i), IY(9)); ctx.stroke();
      }
    }

    // 九宫斜线
    ctx.beginPath(); ctx.moveTo(IX(3), IY(0)); ctx.lineTo(IX(5), IY(2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(IX(5), IY(0)); ctx.lineTo(IX(3), IY(2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(IX(3), IY(7)); ctx.lineTo(IX(5), IY(9)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(IX(5), IY(7)); ctx.lineTo(IX(3), IY(9)); ctx.stroke();

    // 兵 / 炮 位小标记
    drawStarMarks();

    // 楚河汉界
    var yTop = IY(4), yBot = IY(5), midY = (yTop + yBot) / 2;
    ctx.fillStyle = 'rgba(255,250,235,0.35)';
    ctx.fillRect(IX(0), yTop, 8 * s, yBot - yTop);
    ctx.fillStyle = '#7A4A22';
    ctx.font = Math.round(Math.max(14, s * 0.6)) + 'px "KaiTi","STKaiti","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('楚 河', IX(2), midY);
    ctx.fillText('汉 界', IX(6), midY);
  }

  function drawStarMarks() {
    var list = [[1, 2], [7, 2], [1, 7], [7, 7],
                [0, 3], [2, 3], [4, 3], [6, 3], [8, 3],
                [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]];
    var L = view.S * 0.16, G = view.S * 0.12;
    ctx.strokeStyle = 'rgba(122,74,34,0.75)';
    ctx.lineWidth = 1;
    for (var i = 0; i < list.length; i++) {
      var x = list[i][0], y = list[i][1], cx = IX(x), cy = IY(y);
      for (var k = 0; k < 2; k++) {
        var sx = k === 0 ? -1 : 1;
        if ((sx < 0 && x === 0) || (sx > 0 && x === 8)) continue;
        var ox = cx + sx * G;
        ctx.beginPath();
        ctx.moveTo(ox, cy - G - L); ctx.lineTo(ox, cy - G); ctx.lineTo(ox + sx * L, cy - G);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, cy + G + L); ctx.lineTo(ox, cy + G); ctx.lineTo(ox + sx * L, cy + G);
        ctx.stroke();
      }
    }
  }

  function drawPieces() {
    var r = view.S * 0.42;
    for (var y = 0; y < 10; y++) {
      for (var x = 0; x < 9; x++) {
        var idx = y * W + x;
        var code = state.board[idx];
        if (!code || code === 0) continue;
        var col = XR.pieceColor(code);
        if (!col) continue;
        var cx = IX(x), cy = IY(y);

        ctx.beginPath(); ctx.arc(cx + 1.5, cy + 2.5, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(50,30,10,0.22)'; ctx.fill();

        var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
        g.addColorStop(0, '#FFF6E0');
        g.addColorStop(1, '#EAD3A8');
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();

        var ring = col === 'r' ? '#B22A1E' : '#3A342C';
        ctx.lineWidth = Math.max(1.5, view.S * 0.045);
        ctx.strokeStyle = ring; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(122,74,34,0.45)'; ctx.stroke();

        var label;
        if (isEn()) {
          label = String(code).toUpperCase();
          ctx.font = 'bold ' + Math.round(r * 0.95) + 'px "Segoe UI",Arial,sans-serif';
        } else {
          label = ZH[code] || String(code).toUpperCase();
          ctx.font = 'bold ' + Math.round(r * 1.0) + 'px "KaiTi","STKaiti","SimSun",serif';
        }
        ctx.fillStyle = col === 'r' ? '#B22A1E' : '#2B2620';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy + 1);
      }
    }
  }

  function drawLastMove() {
    if (!state.lastMove) return;
    var s = view.S, k = s * 0.46, L = s * 0.14;
    var pts = [state.lastMove.from, state.lastMove.to];
    ctx.strokeStyle = 'rgba(224,163,42,0.9)';
    ctx.lineWidth = Math.max(2, s * 0.05);
    var corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (var i = 0; i < pts.length; i++) {
      var c = pc(pts[i]);
      for (var j = 0; j < 4; j++) {
        var sx = corners[j][0], sy = corners[j][1];
        ctx.beginPath();
        ctx.moveTo(c.x + sx * k, c.y + sy * k - sy * L);
        ctx.lineTo(c.x + sx * k, c.y + sy * k);
        ctx.lineTo(c.x + sx * k - sx * L, c.y + sy * k);
        ctx.stroke();
      }
    }
  }

  function drawCheckGlow() {
    var side = null;
    if (XR.inCheck(state.board, 'r')) side = 'r';
    else if (XR.inCheck(state.board, 'b')) side = 'b';
    if (!side) return;
    var idx = state.board.indexOf(side === 'r' ? 'K' : 'k');
    if (idx < 0) return;
    var c = pc(idx);
    ctx.beginPath();
    ctx.arc(c.x, c.y, view.S * 0.52 + Math.sin(pulse) * 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(210,40,30,' + (0.55 + 0.35 * Math.abs(Math.sin(pulse))) + ')';
    ctx.lineWidth = Math.max(2.5, view.S * 0.09);
    ctx.stroke();
  }

  function drawLegal() {
    if (state.selected < 0 || !state.legal.length) return;
    for (var i = 0; i < state.legal.length; i++) {
      var idx = state.legal[i], c = pc(idx);
      var occupied = state.board[idx] && state.board[idx] !== 0;
      if (occupied) {
        ctx.beginPath(); ctx.arc(c.x, c.y, view.S * 0.46, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(46,125,79,0.9)';
        ctx.lineWidth = Math.max(2.5, view.S * 0.08);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(4, view.S * 0.13), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(46,125,79,0.6)'; ctx.fill();
      }
    }
  }

  function drawHint() {
    if (!state.hint) return;
    var a = pc(state.hint[0]), b = pc(state.hint[1]);
    ctx.strokeStyle = 'rgba(41,110,180,0.9)';
    ctx.lineWidth = Math.max(2.5, view.S * 0.07);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(a.x, a.y, view.S * 0.5, 0, Math.PI * 2);
    ctx.lineWidth = 2.5; ctx.stroke();
  }

  function drawSelection() {
    if (state.selected < 0) return;
    var c = pc(state.selected);
    ctx.beginPath();
    ctx.arc(c.x, c.y, view.S * 0.5 + 2 + Math.sin(pulse) * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(224,163,42,0.95)';
    ctx.lineWidth = Math.max(2.5, view.S * 0.08);
    ctx.stroke();
  }

  function drawCursor() {
    if (state.cursor < 0 || state.locked || state.status !== 'playing' || state.turn !== 'r') return;
    var c = pc(state.cursor), k = view.S * 0.5;
    ctx.strokeStyle = 'rgba(30,90,160,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - k, c.y - k, 2 * k, 2 * k);
  }

  function draw() {
    if (!ctx || !state) return;
    var dpr = view.dpr || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard();
    drawPieces();
    drawLastMove();
    drawCheckGlow();
    drawLegal();
    drawHint();
    drawSelection();
    drawCursor();
  }

  /* ------------------------------------------------------------------
     rAF 动画循环（选中/将军脉冲），切档或重开时先取消
     ------------------------------------------------------------------ */
  function frame(ts) {
    if (!loopOn) return;
    pulse += 0.12;
    if (ts - lastT >= 40) { lastT = ts; draw(); }
    rafId = requestAnimationFrame(frame);
  }
  function startLoop() {
    stopLoop();
    loopOn = true;
    lastT = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    loopOn = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  /* ------------------------------------------------------------------
     游戏流程
     ------------------------------------------------------------------ */
  function resetGame() {
    clearTimeout(aiTimer); aiTimer = null; // 取消旧 AI，防止旧着法落到新棋盘
    stopLoop();                            // 取消旧 rAF
    var c = cfg();
    state.board = XR.initialBoard().slice();
    state.turn = 'r';
    state.undoStack = [];
    state.steps = 0;
    state.status = 'playing';
    state.started = true;
    state.undoLeft = c.undos;
    state.selected = -1;
    state.legal = [];
    state.lastMove = null;
    state.hint = null;
    state.cursor = 85; // 红帅初始位置 (4,9)
    state.locked = false;
    state.over = null;
    overlay.hidden = true;
    card.hidden = true;
    saveState();                           // 开局立刻写存档
    syncHUD();
    startLoop();
    draw();
  }

  function startGame() {
    if (state.status === 'paused') { resumeGame(); return; }
    resetGame();
    play('start');
  }

  function onCardBtn() {
    if (state.status === 'paused') resumeGame();
    else startGame();
  }

  function togglePause() {
    if (state.status === 'over') return;
    if (state.status === 'paused') { resumeGame(); return; }
    clearTimeout(aiTimer); aiTimer = null;
    state.status = 'paused';
    state.locked = true;
    stopLoop();
    saveState();
    renderCard();
    syncHUD();
    play('toggle');
    draw();
  }

  function resumeGame() {
    state.status = 'playing';
    state.locked = false;
    state.started = true;
    card.hidden = true;
    saveState();
    syncHUD();
    startLoop();
    if (state.turn === 'b') scheduleAI();
    play('toggle');
    draw();
  }

  function scheduleAI() {
    state.locked = true;               // 思考期间锁输入
    clearTimeout(aiTimer);
    var delay = cfg().delay;
    aiTimer = setTimeout(function () {
      aiTimer = null;
      if (state.status !== 'playing' || state.turn !== 'b') return;
      doAIMove();
    }, delay);
    syncHUD();
  }

  function doAIMove() {
    var mv = XR.bestMove(state.board, 'b', cfg().level);
    if (!mv) { finish(XR.isOver(state.board, 'b')); return; }
    var from = mv[0], to = mv[1];
    var captured = state.board[to] && state.board[to] !== 0 ? true : false;
    state.undoStack.push({ board: state.board.slice(), mover: 'b', from: from, to: to });
    state.board = XR.applyMove(state.board, from, to);
    state.lastMove = { from: from, to: to };
    state.turn = 'r';
    state.locked = false;
    state.hint = null;
    play(captured ? 'boom' : 'move');

    var over = XR.isOver(state.board, 'r');
    if (over && over.over) { finish(over); return; }
    if (XR.inCheck(state.board, 'r')) { showToast(t('msg_check')); play('warn'); }
    else if (captured) { showToast(t('msg_capture')); }
    saveState();
    syncHUD();
    draw();
  }

  function doPlayerMove(from, to) {
    if (state.status !== 'playing' || state.locked || state.turn !== 'r') return;
    var legal = XR.legalMoves(state.board, 'r', from);
    if (legal.indexOf(to) < 0) {
      showToast(t('msg_invalid'));
      play('warn');
      return;
    }
    var captured = state.board[to] && state.board[to] !== 0 ? true : false;
    state.undoStack.push({ board: state.board.slice(), mover: 'r', from: from, to: to });
    state.board = XR.applyMove(state.board, from, to);
    state.steps += 1;
    state.lastMove = { from: from, to: to };
    state.selected = -1;
    state.legal = [];
    state.hint = null;
    state.cursor = to;
    play(captured ? 'boom' : 'move');

    var over = XR.isOver(state.board, 'b');
    if (over && over.over) { finish(over); return; }
    if (XR.inCheck(state.board, 'b')) { showToast(t('msg_check')); play('warn'); }
    else if (captured) { showToast(t('msg_capture')); }

    state.turn = 'b';
    saveState();
    syncHUD();
    scheduleAI();
    draw();
  }

  function finish(over) {
    clearTimeout(aiTimer); aiTimer = null;
    stopLoop();
    state.status = 'over';
    state.locked = true;
    state.over = { winner: over.winner, reason: over.reason };
    overlay.hidden = false;
    card.hidden = true;
    renderOverlay();
    if (over.winner === 'r') {
      best = loadBest() + 1;
      saveBest(best);
      play('win');
    } else {
      play('lose');
    }
    syncHUD();
    saveState();
    draw();
  }

  function selectPiece(idx) {
    var code = state.board[idx];
    if (!code || code === 0 || XR.pieceColor(code) !== 'r') return;
    state.selected = idx;
    state.legal = XR.legalMoves(state.board, 'r', idx) || [];
    state.cursor = idx;
    state.hint = null;
    if (!state.legal.length) showToast(t('msg_no_moves'));
    play('select');
    draw();
  }

  function clearSelection() {
    state.selected = -1;
    state.legal = [];
    draw();
  }

  function handleTap(idx) {
    if (idx < 0) return;
    if (!state.started) {
      // 首次直接点棋盘也视为开局（兼容自动化直接派发到 canvas 的事件）
      state.started = true;
      card.hidden = true;
      saveState();
      play('start');
    }
    if (state.status !== 'playing' || state.locked || state.turn !== 'r') return;
    var code = state.board[idx];
    var mine = code && code !== 0 && XR.pieceColor(code) === 'r';
    if (state.selected >= 0) {
      if (state.legal.indexOf(idx) >= 0) { doPlayerMove(state.selected, idx); return; }
      if (idx === state.selected) { clearSelection(); return; }
      if (mine) { selectPiece(idx); return; }
      clearSelection();
      showToast(t('msg_invalid'));
      play('warn');
      draw();
      return;
    }
    if (mine) selectPiece(idx);
    else { state.cursor = idx; draw(); }
  }

  function undo() {
    if (state.status === 'over' && !state.undoStack.length) return;
    if (state.undoLeft !== Infinity && state.undoLeft <= 0) { play('warn'); return; }
    clearTimeout(aiTimer); aiTimer = null;
    if (!state.undoStack.length) return;
    // 一次性退回「玩家 + AI」两步：弹到最近一次红方走子之前
    var target = null;
    while (state.undoStack.length) {
      var e = state.undoStack.pop();
      if (e.mover === 'r') { target = e; break; }
    }
    if (!target) return;
    state.board = target.board.slice();
    state.turn = 'r';
    state.selected = -1;
    state.legal = [];
    state.hint = null;
    var top = state.undoStack.length ? state.undoStack[state.undoStack.length - 1] : null;
    state.lastMove = top ? { from: top.from, to: top.to } : null;
    state.steps = Math.max(0, state.steps - 1);
    state.locked = false;
    state.status = 'playing';
    state.started = true;
    state.over = null;
    overlay.hidden = true;
    card.hidden = true;
    if (state.undoLeft !== Infinity) state.undoLeft -= 1;
    play('tap');
    saveState();
    syncHUD();
    startLoop();
    draw();
  }

  function hint() {
    if (state.status !== 'playing' || state.locked || state.turn !== 'r') return;
    var moves = XR.allMoves(state.board, 'r');
    if (!moves.length) { showToast(t('msg_no_moves')); return; }
    var mv = moves[Math.floor(Math.random() * moves.length)];
    state.hint = [mv[0], mv[1]];
    state.cursor = mv[0];
    play('tick');
    draw();
  }

  function switchDiff(diff) {
    if (!DIFFS[diff]) return;
    // 每次切档（含点到当前同档）先幂等落盘
    try { localStorage.setItem(DIFF_KEY, diff); } catch (e) {}
    state.diff = diff;
    syncDiffs();
    resetGame();
    // 提示必须在重开/清场之后才显示，避免被清掉
    showToast(t('confirm_diff'));
    play('toggle');
  }

  /* ------------------------------------------------------------------
     输入：鼠标 / 触屏 / 键盘
     ------------------------------------------------------------------ */
  function coords(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function onDown(e) {
    if (e.cancelable) e.preventDefault();
    lastDownT = Date.now();
    var c = coords(e);
    handleTap(idxFromClient(c.x, c.y));
  }

  function onClick(e) {
    if (Date.now() - lastDownT < 600) return; // 忽略 pointer/touch 的伴随 click
    var c = coords(e);
    handleTap(idxFromClient(c.x, c.y));
  }

  function keyName(e) {
    if (e.key) return e.key;
    var c = e.keyCode || e.which;
    if (c === 38) return 'ArrowUp';
    if (c === 40) return 'ArrowDown';
    if (c === 37) return 'ArrowLeft';
    if (c === 39) return 'ArrowRight';
    if (c === 32) return ' ';
    if (c === 13) return 'Enter';
    return String.fromCharCode(c);
  }

  function moveCursor(dx, dy) {
    var x = state.cursor % W, y = Math.floor(state.cursor / W);
    x += dx; y += dy;
    if (x < 0) x = 0; if (x > 8) x = 8;
    if (y < 0) y = 0; if (y > 9) y = 9;
    state.cursor = y * W + x;
  }

  function onKey(e) {
    var k = keyName(e);
    var lower = k.length === 1 ? k.toLowerCase() : k;
    if (k === ' ' || k === 'Enter' || k.indexOf('Arrow') === 0) e.preventDefault();
    if (!state.started) {
      if (k === ' ' || k === 'Enter') startGame();
      return;
    }
    if (lower === 'u') { undo(); return; }
    if (lower === 'h') { hint(); return; }
    if (lower === 'p') { togglePause(); return; }
    if (state.status !== 'playing' || state.locked || state.turn !== 'r') return;
    if (k === 'ArrowUp') { moveCursor(0, -1); draw(); }
    else if (k === 'ArrowDown') { moveCursor(0, 1); draw(); }
    else if (k === 'ArrowLeft') { moveCursor(-1, 0); draw(); }
    else if (k === 'ArrowRight') { moveCursor(1, 0); draw(); }
    else if (k === ' ' || k === 'Enter') { handleTap(state.cursor); }
  }

  /* ------------------------------------------------------------------
     初始化
     ------------------------------------------------------------------ */
  function bind() {
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-hint').addEventListener('click', hint);
    document.getElementById('btn-pause').addEventListener('click', togglePause);
    document.getElementById('btn-restart').addEventListener('click', startGame);
    document.getElementById('btn-again').addEventListener('click', startGame);
    cardBtn.addEventListener('click', onCardBtn);

    var btns = diffsBox.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { switchDiff(b.getAttribute('data-diff')); });
      })(btns[i]);
    }

    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', onDown);
    } else {
      canvas.addEventListener('mousedown', onDown);
      canvas.addEventListener('touchstart', onDown, false);
    }
    canvas.addEventListener('click', onClick);

    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    document.addEventListener('ys:langchange', function () {
      renderCard();
      syncHUD();
      if (state.status === 'over') renderOverlay();
      draw();
    });
  }

  function init() {
    if (!XR || !ctx) {
      // 规则引擎未就绪时给出占位，避免后续调用直接抛错
      if (cardTitle) cardTitle.textContent = '棋盘载入中';
      return;
    }
    best = loadBest();
    var saved = loadState();
    var diff = (saved && DIFFS[saved.diff]) ? saved.diff : loadDiff();
    try { localStorage.setItem(DIFF_KEY, diff); } catch (e) {}

    var status = 'playing';
    if (saved && (saved.status === 'over' || saved.status === 'paused')) status = saved.status;
    var undoLeft;
    if (saved && (saved.undoLeft === -1 || saved.undoLeft === null || saved.undoLeft === undefined)) undoLeft = Infinity;
    else if (saved) undoLeft = parseInt(saved.undoLeft, 10) || 0;
    else undoLeft = DIFFS[diff].undos;

    state = {
      diff: diff,
      board: saved ? saved.board.slice() : XR.initialBoard().slice(),
      turn: (saved && (saved.turn === 'r' || saved.turn === 'b')) ? saved.turn : 'r',
      undoStack: (saved && saved.undoStack && saved.undoStack.length) ? saved.undoStack : [],
      steps: saved ? (parseInt(saved.steps, 10) || 0) : 0,
      status: status,
      started: saved ? (saved.started !== false) : false,
      undoLeft: undoLeft,
      selected: -1,
      legal: [],
      lastMove: null,
      hint: null,
      cursor: 85,
      locked: status !== 'playing',
      over: (saved && saved.over) ? saved.over : null
    };
    if (status === 'over' && !state.over) state.over = { winner: 'b', reason: 'checkmate' };

    saveState(); // 刷新恢复同一盘棋与轮次，开局立即落盘
    bind();
    syncDiffs();
    syncHUD();
    resize();
    renderCard();

    if (state.status === 'over') {
      overlay.hidden = false;
      renderOverlay();
    } else if (state.status === 'playing') {
      startLoop();
      if (state.turn === 'b') scheduleAI();
    }
    draw();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
