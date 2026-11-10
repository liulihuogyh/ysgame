/* ==========================================================================
   围棋死活题 · Go Problems（纯 ES5 / IIFE / 单文件自包含）
   自包含围棋引擎：落子 / 提子 / 禁着点 / 两眼活棋判定。
   内置死活题库，黑先，目标杀白或做活黑；三档难度在「题量 / 提示 / 看正解」
   上真实拉开。存档：ysgame-tsumego-state / -best / -diff
   [gyh 2026-11-10 新增] 批次七
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function t(k) { return window.I18N ? window.I18N.t(k) : k; }
  function lang() { return (window.I18N && window.I18N.lang) || 'zh'; }
  function sfx(name) {
    if (window.YSound && window.YSound.play) {
      try { window.YSound.play(name); } catch (e) {}
    }
  }
  function soundOn() {
    return !(window.YSGame && typeof window.YSGame.isSoundOn === 'function' && !window.YSGame.isSoundOn());
  }

  var STATE_KEY = 'ysgame-tsumego-state';
  var BEST_KEY = 'ysgame-tsumego-best';
  var DIFF_KEY = 'ysgame-tsumego-diff';
  var N = 9;                       // 9x9 棋盘

  /* 三档：题量、提示策略、看正解门槛 */
  var DIFF = {
    easy:   { pool: 3, autoHint: true,  solveAfter: 0, points: 10 },
    medium: { pool: 5, autoHint: false, solveAfter: 0, points: 20 },
    hard:   { pool: 6, autoHint: false, solveAfter: 3, points: 30 }
  };

  /* ---------------- 围棋引擎（纯逻辑，可独立测试） ---------------- */
  /* board: 长度 81 的一维数组，0 空 / 1 黑 / 2 白 */
  function makeBoard() { var b = []; for (var i = 0; i < N * N; i++) b.push(0); return b; }
  function idx(x, y) { return y * N + x; }
  function inB(x, y) { return x >= 0 && x < N && y >= 0 && y < N; }
  function get(b, x, y) { return b[idx(x, y)]; }
  function set(b, x, y, v) { b[idx(x, y)] = v; }

  function neighbors(x, y) {
    var r = [];
    if (x > 0) r.push({ x: x - 1, y: y });
    if (x < N - 1) r.push({ x: x + 1, y: y });
    if (y > 0) r.push({ x: x, y: y - 1 });
    if (y < N - 1) r.push({ x: x, y: y + 1 });
    return r;
  }

  /* 返回同色连通块及其气（空点集合） */
  function groupAndLibs(b, x, y) {
    var color = get(b, x, y);
    var stones = [], libSet = {}, seen = {};
    var stack = [{ x: x, y: y }];
    seen[idx(x, y)] = true;
    while (stack.length) {
      var c = stack.pop();
      stones.push(c);
      var ns = neighbors(c.x, c.y);
      for (var i = 0; i < ns.length; i++) {
        var n = ns[i], ni = idx(n.x, n.y), v = get(b, n.x, n.y);
        if (v === 0) { libSet[ni] = true; }
        else if (v === color && !seen[ni]) { seen[ni] = true; stack.push(n); }
      }
    }
    var libs = [];
    for (var k in libSet) if (Object.prototype.hasOwnProperty.call(libSet, k)) libs.push(parseInt(k, 10));
    return { stones: stones, libs: libs };
  }

  /* 落子：处理提子与禁着点；返回 {ok, captured} */
  function place(b, x, y, color) {
    if (get(b, x, y) !== 0) return { ok: false, captured: 0 };
    set(b, x, y, color);
    var opp = color === 1 ? 2 : 1;
    var captured = 0;
    var ns = neighbors(x, y);
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i];
      if (get(b, n.x, n.y) === opp) {
        var g = groupAndLibs(b, n.x, n.y);
        if (g.libs.length === 0) {
          for (var j = 0; j < g.stones.length; j++) { set(b, g.stones[j].x, g.stones[j].y, 0); captured++; }
        }
      }
    }
    // 禁着点：落子后自身无气且未提子
    var self = groupAndLibs(b, x, y);
    if (self.libs.length === 0 && captured === 0) {
      set(b, x, y, 0);
      return { ok: false, captured: 0 };
    }
    return { ok: true, captured: captured };
  }

  /* 数「眼」：统计相邻空点中完全被本黑块（或边界）包围且无白相邻者 */
  function countEyes(b, seed) {
    if (get(b, seed.x, seed.y) !== 1) return 0;
    var g = groupAndLibs(b, seed.x, seed.y);
    var set = {};
    for (var i = 0; i < g.stones.length; i++) set[idx(g.stones[i].x, g.stones[i].y)] = true;
    var eyeCount = 0, seen = {};
    for (var s = 0; s < g.stones.length; s++) {
      var st = g.stones[s];
      var ns = neighbors(st.x, st.y);
      for (var j = 0; j < ns.length; j++) {
        var n = ns[j];
        if (!inB(n.x, n.y)) continue;
        if (get(b, n.x, n.y) !== 0) continue;
        var key = idx(n.x, n.y);
        if (seen[key]) continue;
        seen[key] = true;
        var isEye = true;
        var mns = neighbors(n.x, n.y);
        for (var k = 0; k < mns.length; k++) {
          var m = mns[k];
          if (!inB(m.x, m.y)) continue;          // 边界视作黑墙
          var v = get(b, m.x, m.y);
          if (v === 0) { isEye = false; break; }  // 还有空邻点 → 不是真眼
          if (v === 2) { isEye = false; break; }
          if (v === 1 && !set[idx(m.x, m.y)]) { isEye = false; break; }
        }
        if (isEye) eyeCount++;
      }
    }
    return eyeCount;
  }

  /* 目标白块是否已被吃（全部离场） */
  function targetDead(b, coords) {
    for (var i = 0; i < coords.length; i++) {
      if (get(b, coords[i].x, coords[i].y) === 2) return false;
    }
    return true;
  }

  /* ---------------- 题库 ----------------
     每题：name、goal('kill'|'live')、target(白块坐标 / 活棋取黑种子)、vital(正解点)、
     board(9 行 × 9 列，'.'空 'B'黑 'W'白)、desc(双语)。 */
  var PROBLEMS = [
    {
      goal: 'kill', seed: null, vital: { x: 4, y: 3 },
      target: [{ x: 4, y: 4 }],
      board: [
        '.........',
        '.........',
        '.........',
        '.........',
        '...BWB...',
        '....B....',
        '.........',
        '.........',
        '.........'
      ],
      desc: { zh: '白子只剩一口气，黑先把它提掉。', en: 'The white stone has one liberty — capture it.' }
    },
    {
      goal: 'live', seed: { x: 2, y: 3 }, vital: { x: 4, y: 4 },
      target: [],
      board: [
        '.........',
        '.........',
        '.........',
        '..BBBBB..',
        '..B...B..',
        '..BBBBB..',
        '.........',
        '.........',
        '.........'
      ],
      desc: { zh: '黑棋里面是三个空点，落一子做出两只眼。', en: 'Three empty points inside — play to make two eyes.' }
    },
    {
      goal: 'kill', seed: null, vital: { x: 3, y: 3 },
      target: [{ x: 3, y: 4 }, { x: 4, y: 4 }],
      board: [
        '.........',
        '.........',
        '.........',
        '....B....',
        '..BWWB...',
        '...BB....',
        '.........',
        '.........',
        '.........'
      ],
      desc: { zh: '两颗白子连成一块、只剩一气，黑先提子。', en: 'Two whites, one liberty left — capture them.' }
    },
    {
      goal: 'live', seed: { x: 3, y: 3 }, vital: { x: 4, y: 4 },
      target: [],
      board: [
        '.........',
        '.........',
        '...BBB...',
        '...B.B...',
        '...B.B...',
        '...B.B...',
        '...BBB...',
        '.........',
        '.........'
      ],
      desc: { zh: '竖着三个空点，落中间一子做成两只眼。', en: 'A vertical 3-space — play the middle to live.' }
    },
    {
      goal: 'kill', seed: null, vital: { x: 3, y: 3 },
      target: [{ x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }],
      board: [
        '.........',
        '.........',
        '.........',
        '....BB...',
        '..BWWWB..',
        '...BBB...',
        '.........',
        '.........',
        '.........'
      ],
      desc: { zh: '三颗白子只有一气，黑先全部提掉。', en: 'Three whites with one liberty — capture all.' }
    },
    {
      goal: 'live', seed: { x: 2, y: 4 }, vital: { x: 4, y: 5 },
      target: [],
      board: [
        '.........',
        '.........',
        '.........',
        '.........',
        '..BBBBB..',
        '..B...B..',
        '..BBBBB..',
        '.........',
        '.........'
      ],
      desc: { zh: '黑棋里面是三个空点，落一子做出两只眼。', en: 'Three empty points inside — play to make two eyes.' }
    }
  ];

  function loadBoard(rows) {
    var b = makeBoard();
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var ch = rows[y].charAt(x);
        if (ch === 'B') set(b, x, y, 1);
        else if (ch === 'W') set(b, x, y, 2);
      }
    }
    return b;
  }

  /* ---------------- 运行时 ---------------- */
  var diff = 'medium';
  var canvas = null, ctx = null, wrap = null, dpr = 1, cssW = 0;
  var board = null, cur = 0, wrong = 0, solved = 0;
  var score = 0, best = 0, lastMove = null;
  var toastTimer = 0;
  var pool = [];

  function def() { return DIFF[diff] || DIFF.medium; }

  /* ---------------- 存档 ---------------- */
  function readJSON(key) {
    try { var o = JSON.parse(localStorage.getItem(key)); return o && o.data ? o.data : null; }
    catch (e) { return null; }
  }
  function saveState() {
    var d = { v: 1, data: { diff: diff, cur: cur, score: score } };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function readBest() {
    var n = 0; try { n = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { n = 0; }
    return n;
  }
  function writeBest(n) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) {} }
  function readDiff() {
    var d = 'medium'; try { d = localStorage.getItem(DIFF_KEY) || 'medium'; } catch (e) {}
    return DIFF[d] ? d : 'medium';
  }

  /* ---------------- 画布 ---------------- */
  function resize() {
    if (!wrap || !canvas) return;
    cssW = wrap.clientWidth || 320;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * dpr);
    canvas.style.height = cssW + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function grid() {
    var pad = cssW * 0.06;
    var span = cssW - pad * 2;
    var step = span / (N - 1);
    return { pad: pad, step: step };
  }
  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssW);
    var g = grid();
    // 棋盘底
    ctx.fillStyle = '#e9c98a';
    ctx.fillRect(g.pad - 6, g.pad - 6, cssW - (g.pad - 6) * 2, cssW - (g.pad - 6) * 2);
    // 网格
    ctx.strokeStyle = '#5b4423';
    ctx.lineWidth = 1;
    for (var i = 0; i < N; i++) {
      var p = g.pad + i * g.step;
      ctx.beginPath(); ctx.moveTo(g.pad, p); ctx.lineTo(cssW - g.pad, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, g.pad); ctx.lineTo(p, cssW - g.pad); ctx.stroke();
    }
    // 星位
    var stars = [2, 4, 6];
    for (var a = 0; a < stars.length; a++) for (var b = 0; b < stars.length; b++) {
      ctx.fillStyle = '#5b4423';
      ctx.beginPath(); ctx.arc(g.pad + stars[a] * g.step, g.pad + stars[b] * g.step, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // 棋子
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var v = get(board, x, y);
      if (v === 0) continue;
      var cx = g.pad + x * g.step, cy = g.pad + y * g.step, r = g.step * 0.45;
      if (v === 1) { ctx.fillStyle = '#1b1b1b'; }
      else { ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#999'; ctx.lineWidth = 1; }
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      if (v === 2) ctx.stroke();
    }
    // 提示点
    var p0 = PROBLEMS[cur];
    if (p0 && (def().autoHint || wrong >= 1 || (wrong >= def().solveAfter && def().solveAfter > 0))) {
      var vx = g.pad + p0.vital.x * g.step, vy = g.pad + p0.vital.y * g.step;
      ctx.fillStyle = 'rgba(220,60,60,0.55)';
      ctx.beginPath(); ctx.arc(vx, vy, g.step * 0.18, 0, Math.PI * 2); ctx.fill();
    }
    // 最后一手
    if (lastMove) {
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2;
      var lx = g.pad + lastMove.x * g.step, ly = g.pad + lastMove.y * g.step;
      ctx.beginPath(); ctx.arc(lx, ly, g.step * 0.28, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /* ---------------- 题目流程 ---------------- */
  function loadProblem(i) {
    cur = i;
    wrong = 0;
    lastMove = null;
    var p = pool[i];
    board = loadBoard(p.board);
    updateHud();
    draw();
    setFeedback('');
  }

  function setFeedback(msg, cls) {
    var el = $('feedback');
    if (!el) return;
    el.textContent = msg;
    el.className = 'tsu__feedback' + (cls ? ' ' + cls : '');
  }

  function solvedProblem() {
    var p = pool[cur];
    if (p.goal === 'kill') return targetDead(board, p.target);
    return countEyes(board, p.seed) >= 2;
  }

  function onBoardClick(e) {
    if (!board) return;
    var rect = canvas.getBoundingClientRect();
    var px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    var g = grid();
    var gx = Math.round((px - g.pad) / g.step);
    var gy = Math.round((py - g.pad) / g.step);
    if (gx < 0 || gx >= N || gy < 0 || gy >= N) return;
    // 超出交叉点容差则忽略
    var cx = g.pad + gx * g.step, cy = g.pad + gy * g.step;
    if (Math.abs(px - cx) > g.step * 0.45 || Math.abs(py - cy) > g.step * 0.45) return;

    var res = place(board, gx, gy, 1);
    if (!res.ok) { setFeedback(t('msg_invalid'), 'is-bad'); sfx('error'); return; }
    lastMove = { x: gx, y: gy };

    if (solvedProblem()) {
      score += def().points;
      solved++;
      var msg = p.goal === 'kill' ? t('msg_dead') : t('msg_alive');
      setFeedback(t('msg_solved') + ' · ' + msg, 'is-ok');
      sfx('win');
      var isRecord = score > best;
      if (isRecord) { best = score; writeBest(best); }
      updateHud();
      saveState();
      draw();
      window.setTimeout(nextProblem, 1100);
      return;
    }
    // 没做对：回退这一步，提示错误
    wrong++;
    set(board, gx, gy, 0);
    lastMove = null;
    setFeedback(t('msg_wrong'), 'is-bad');
    sfx('error');
    draw();
  }

  function nextProblem() {
    if (cur + 1 >= pool.length) { finish(); return; }
    loadProblem(cur + 1);
  }

  function finish() {
    var isRecord = score > best;
    if (isRecord) { best = score; writeBest(best); }
    $('overlay-title').textContent = t('msg_solved');
    $('overlay-sub').textContent = isRecord ? t('new_record') : (solved + '/' + pool.length);
    $('record-badge').hidden = !isRecord;
    $('overlay-score').textContent = score;
    $('overlay').hidden = false;
    updateHud();
    saveState();
    if (isRecord) sfx('record'); else sfx('win');
  }

  function updateHud() {
    $('problem').textContent = (cur + 1) + '/' + pool.length;
    $('score').textContent = score;
    $('best').textContent = best > 0 ? best : '--';
  }

  function showToast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = 0; }
    toastTimer = window.setTimeout(function () { el.hidden = true; }, 2400);
  }

  function paintDiff() {
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function switchDiff(newDiff) {
    if (!DIFF[newDiff]) return;
    diff = newDiff;
    try { localStorage.setItem(DIFF_KEY, diff); } catch (e) {}
    pool = PROBLEMS.slice(0, def().pool);
    paintDiff();
    saveState();
    showToast(t('confirm_diff'));
    $('overlay').hidden = true;
    loadProblem(0);
  }

  function start() {
    pool = PROBLEMS.slice(0, def().pool);
    score = 0;
    solved = 0;
    $('overlay').hidden = true;
    loadProblem(0);
    saveState();
    if (window.YSound) sfx('start');
  }

  function bindUi() {
    $('btn-start').addEventListener('click', function () { start(); });
    $('btn-restart').addEventListener('click', function () { loadProblem(0); });
    $('btn-again').addEventListener('click', function () { start(); });
    $('btn-hint').addEventListener('click', function () {
      // 手动点提示：困难档需达到门槛，否则只给一次机会
      wrong = Math.max(wrong, 1);
      draw();
      showToast(t('hint_controls'));
    });
    $('btn-solve').addEventListener('click', function () {
      if (def().solveAfter > 0 && wrong < def().solveAfter) {
        showToast(t('msg_wrong'));
        return;
      }
      var p = pool[cur];
      var res = place(board, p.vital.x, p.vital.y, 1);
      if (res.ok) {
        lastMove = { x: p.vital.x, y: p.vital.y };
        if (solvedProblem()) {
          score += def().points; solved++;
          setFeedback(t('msg_solved') + ' · ' + (p.goal === 'kill' ? t('msg_dead') : t('msg_alive')), 'is-ok');
          var isRecord = score > best; if (isRecord) { best = score; writeBest(best); }
          updateHud(); saveState(); draw();
          window.setTimeout(nextProblem, 1100);
          return;
        }
      }
      set(board, p.vital.x, p.vital.y, 0);
      lastMove = null;
      draw();
    });
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { switchDiff(b.getAttribute('data-diff')); });
      })(btns[i]);
    }
  }

  function boot() {
    canvas = $('canvas');
    wrap = $('canvas-wrap');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    if (window.addEventListener) window.addEventListener('resize', resize);

    best = readBest();
    diff = readDiff();
    pool = PROBLEMS.slice(0, def().pool);
    paintDiff();
    bindUi();

    canvas.addEventListener('click', onBoardClick);
    canvas.addEventListener('touchstart', function (e) { onBoardClick(e); }, { passive: true });

    // 恢复存档进度
    var saved = readJSON(STATE_KEY);
    if (saved && typeof saved.cur === 'number' && saved.cur < pool.length) {
      cur = saved.cur; score = saved.score || 0;
    }
    updateHud();
    loadProblem(cur);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
