/* ==========================================================================
   Puzzle Cube 魔方 · 页面逻辑（Canvas 伪三维渲染 / 交互 / 存档 / 切档 / 结算）
   状态模型完全交给 js/cube-core.js（window.CubeCore），本文件不自己算置换。
   纯 ES5 + var + IIFE + 'use strict'，无框架、无图片、无字体、无外部资源。
   [gyh 2026-11-09 新增] 批次五
   ========================================================================== */
(function () {
  'use strict';

  var Core = window.CubeCore;
  var I18N = window.I18N;
  // [gyh 2026-11-09 新增] 依赖尚未就绪时安静退出，公共脚本仍可正常工作
  if (!Core || !I18N) return;

  /* ---------------- 常量 ---------------- */
  // [gyh 2026-11-09 新增] 三档真实拉开：阶数 / 打乱 / 提示 / 计时 / 动画 / 撤销计步
  var DIFF = {
    easy:   { n: 2, scramble: 6,  hints: -1, timed: false, turnMs: 260, countUndo: false },
    medium: { n: 3, scramble: 14, hints: 3,  timed: true,  turnMs: 200, countUndo: false },
    hard:   { n: 3, scramble: 25, hints: 1,  timed: true,  turnMs: 140, countUndo: true  }
  };
  var SAVE_STATE = 'ysgame-cube-state';
  var SAVE_BEST  = 'ysgame-cube-best';
  var SAVE_DIFF  = 'ysgame-cube-diff';
  var HALF_BASE  = 0.42;

  /* ---------------- DOM ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) return;

  /* ---------------- 运行状态 ---------------- */
  var diff = 'medium', cfg = DIFF[diff];
  var state = null, solvedState = null;
  var undoStack = [], scrambleSeq = [];
  var steps = 0, elapsedMs = 0, hintsLeft = 3;
  var running = false, paused = false, busy = false, finished = false, rev = false;
  var yaw = -0.6, pitch = 0.5;            // 初始视角能同时看到 U / R / F 三面
  var VW = 1, VH = 1;                     // CSS 像素尺寸
  var timerId = 0, animId = 0, hintTimer = 0, toastTimer = 0, lastT = 0;
  var hintActive = false, hintFace = null, lastWin = null;

  /* ---------------- 小工具 ---------------- */
  // [gyh 2026-11-09 新增] 音效统一走白名单内的名字
  function sfx(name) {
    try { if (window.YSound) window.YSound.play(name); } catch (e) {}
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function halfFor(n) { return (n === 3 ? 1 : 2) * HALF_BASE; }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function readJSON(key) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }
  // [gyh 2026-11-09 新增] 页面内提示条：可换行，重开/清场之后再调用，绝不弹原生对话框
  function toast(msg, notice) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.whiteSpace = 'normal';
    el.style.textAlign = 'center';
    if (el.classList) el.classList.toggle('bk__toast--notice', !!notice);
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; toastTimer = 0; }, 2000);
  }

  /* ---------------- 3D 数学 ---------------- */
  // [gyh 2026-11-09 新增] 绕任意单位轴旋转（Rodrigues），用于转层动画
  function rotateAxis(v, axis, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    var d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
    var cx = axis[1] * v[2] - axis[2] * v[1];
    var cy = axis[2] * v[0] - axis[0] * v[2];
    var cz = axis[0] * v[1] - axis[1] * v[0];
    return [
      v[0] * c + cx * s + axis[0] * d * (1 - c),
      v[1] * c + cy * s + axis[1] * d * (1 - c),
      v[2] * c + cz * s + axis[2] * d * (1 - c)
    ];
  }
  // 先按 yaw 绕 y、再按 pitch 绕 x；纯旋转，对方向向量同样适用
  function viewTransform(v) {
    var cY = Math.cos(yaw), sY = Math.sin(yaw);
    var x1 = v[0] * cY + v[2] * sY;
    var y1 = v[1];
    var z1 = -v[0] * sY + v[2] * cY;
    var cX = Math.cos(pitch), sX = Math.sin(pitch);
    return [x1, y1 * cX - z1 * sX, y1 * sX + z1 * cX];
  }
  function vecRoundEq(a, b) {
    return Math.round(a[0]) === Math.round(b[0]) &&
           Math.round(a[1]) === Math.round(b[1]) &&
           Math.round(a[2]) === Math.round(b[2]);
  }
  // 四角 = p ± half*t1 ± half*t2，t1/t2 取与法向垂直的两个切向量
  function stickerQuad(p, n, h) {
    var ax = Math.round(n[0]), ay = Math.round(n[1]);
    var t1, t2;
    if (ax)      { t1 = [0, 1, 0]; t2 = [0, 0, 1]; }
    else if (ay) { t1 = [1, 0, 0]; t2 = [0, 0, 1]; }
    else         { t1 = [1, 0, 0]; t2 = [0, 1, 0]; }
    var sg = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    var q = [];
    for (var i = 0; i < 4; i++) {
      var a = sg[i][0], b = sg[i][1];
      q.push([
        p[0] + a * h * t1[0] + b * h * t2[0],
        p[1] + a * h * t1[1] + b * h * t2[1],
        p[2] + a * h * t1[2] + b * h * t2[2]
      ]);
    }
    return q;
  }
  function inLayer(p, face) {
    var x = Math.round(p[0]), y = Math.round(p[1]), z = Math.round(p[2]);
    if (face === 'U') return y === 1;
    if (face === 'D') return y === -1;
    if (face === 'R') return x === 1;
    if (face === 'L') return x === -1;
    if (face === 'F') return z === 1;
    if (face === 'B') return z === -1;
    return false;
  }
  function faceAxis(face) {
    if (face === 'U') return [0, 1, 0];
    if (face === 'D') return [0, -1, 0];
    if (face === 'R') return [1, 0, 0];
    if (face === 'L') return [-1, 0, 0];
    if (face === 'F') return [0, 0, 1];
    return [0, 0, -1];
  }

  /* ---------------- 投影与渲染 ---------------- */
  // [gyh 2026-11-09 新增] 把 state 摊成待绘制四边形列表
  function buildQuads(st, hFace) {
    var h = halfFor(st.n), out = [];
    for (var i = 0; i < st.stickers.length; i++) {
      var s = st.stickers[i];
      out.push({
        q: stickerQuad(s.p, s.n, h),
        n: [s.n[0], s.n[1], s.n[2]],
        c: s.c,
        p: [s.p[0], s.p[1], s.p[2]],
        hl: !!(hFace && inLayer(s.p, hFace))
      });
    }
    return out;
  }
  function drawScene(quads) {
    ctx.clearRect(0, 0, VW, VH);
    var list = [], i, k;
    for (i = 0; i < quads.length; i++) {
      var it = quads[i], rq = [], dep = 0;
      for (k = 0; k < 4; k++) {
        var v = viewTransform(it.q[k]);
        rq.push(v);
        dep += v[2];
      }
      dep /= 4;
      var rn = viewTransform(it.n);
      if (rn[2] <= 0.0001) continue;          // 背面剔除，避免看到立方体内部
      list.push({ q: rq, dep: dep, c: it.c, hl: it.hl });
    }
    list.sort(function (a, b) { return a.dep - b.dep; }); // 画家算法：远的先画

    var maxAbs = 1 + halfFor(state ? state.n : 3);
    var R = Math.sqrt(3) * maxAbs;
    var scale = Math.min(VW, VH) * 0.48 / R;  // 固定外接球缩放，320px 也不溢出
    var cx = VW / 2, cy = VH / 2;
    ctx.lineJoin = 'round';

    for (var j = 0; j < list.length; j++) {
      var o = list[j], pts = [];
      for (k = 0; k < 4; k++) pts.push([cx + o.q[k][0] * scale, cy - o.q[k][1] * scale]);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var e = 1; e < 4; e++) ctx.lineTo(pts[e][0], pts[e][1]);
      ctx.closePath();
      ctx.fillStyle = Core.COLORS[o.c] || '#CCCCCC';
      ctx.fill();
      ctx.lineWidth = o.hl ? Math.max(2.5, scale * 0.13) : Math.max(1, scale * 0.045);
      ctx.strokeStyle = o.hl ? '#FFCF4A' : 'rgba(28,32,44,.6)';
      ctx.stroke();
      // 一点高光：内缩四边形叠半透明白 + 上沿细亮线
      var gx = 0, gy = 0;
      for (var g = 0; g < 4; g++) { gx += pts[g][0] / 4; gy += pts[g][1] / 4; }
      ctx.beginPath();
      for (var h = 0; h < 4; h++) {
        var ix = gx + (pts[h][0] - gx) * 0.80, iy = gy + (pts[h][1] - gy) * 0.80;
        if (h === 0) ctx.moveTo(ix, iy); else ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineWidth = Math.max(1, scale * 0.03);
      ctx.strokeStyle = 'rgba(255,255,255,.4)';
      ctx.stroke();
    }
  }
  function render() {
    if (!state) return;
    drawScene(buildQuads(state, hintActive ? hintFace : null));
  }
  // [gyh 2026-11-09 新增] 按容器宽度重算并适配 devicePixelRatio
  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    VW = w; VH = h;
    render();
  }

  /* ---------------- 物理式转层动画骨架 ---------------- */
  // 探测 CubeCore.turn 实际转了 +90 还是 -90，使动画终点与终态严格吻合
  function findSticker(st, p, n, c) {
    for (var i = 0; i < st.stickers.length; i++) {
      var t = st.stickers[i];
      if (c && t.c !== c) continue;
      if (vecRoundEq(t.p, p) && vecRoundEq(t.n, n)) return true;
    }
    return false;
  }
  function layerMatches(base, idxs, axis, sign, finalState) {
    var a = sign * Math.PI / 2;
    for (var j = 0; j < idxs.length; j++) {
      var s = base.stickers[idxs[j]];
      if (!findSticker(finalState,
            rotateAxis(s.p, axis, a), rotateAxis(s.n, axis, a), s.c)) return false;
    }
    return true;
  }
  function detectSign(base, idxs, axis, finalState) {
    var j, i, b, f, pp, pm;
    // 首选：core 原地改 stickers，数组索引稳定，直接比同索引终态位置
    for (j = 0; j < idxs.length; j++) {
      i = idxs[j];
      if (!finalState.stickers[i]) break;
      b = base.stickers[i]; f = finalState.stickers[i];
      pp = rotateAxis(b.p, axis, Math.PI / 2);
      pm = rotateAxis(b.p, axis, -Math.PI / 2);
      if (vecRoundEq(pp, pm)) continue;        // p 落在旋转轴上，换一张
      if (vecRoundEq(f.p, pp)) return 1;
      if (vecRoundEq(f.p, pm)) return -1;
    }
    // 兜底：整层贴纸集合比对，不依赖数组顺序
    var a1 = layerMatches(base, idxs, axis, 1, finalState);
    var a2 = layerMatches(base, idxs, axis, -1, finalState);
    if (a1 && !a2) return 1;
    if (a2 && !a1) return -1;
    return 1;
  }
  // [gyh 2026-11-09 新增] 先留旋转前四角，turn 得终态，rAF 按角度插值，动画期间锁输入
  function doTurn(face, dir) {
    if (busy || paused || finished) return;
    if (!running) startGame();
    if (busy || !state) return;

    var base = Core.clone(state);
    var layerSet = [], idxs = [], i;
    for (i = 0; i < base.stickers.length; i++) {
      if (inLayer(base.stickers[i].p, face)) { layerSet[i] = true; idxs.push(i); }
    }
    if (!idxs.length) { sfx('warn'); toast(I18N.t('msg_invalid')); return; }

    var baseQuads = buildQuads(base, hintActive ? hintFace : null);
    var axis = faceAxis(face);

    Core.turn(state, face, dir);               // 原地转层 → 终态
    var sign = detectSign(base, idxs, axis, state);

    undoStack.push(base);
    if (undoStack.length > 80) undoStack.shift();
    steps += 1;
    sfx('rotate');
    saveState();
    updateHUD();

    busy = true;
    var dur = cfg.turnMs;
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    function frame(now) {
      var t = Math.min(1, ((now || Date.now()) - t0) / dur);
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var theta = e * sign * Math.PI / 2;
      var quads = [];
      for (var k = 0; k < baseQuads.length; k++) {
        var b = baseQuads[k];
        if (layerSet[k]) {
          quads.push({
            q: [rotateAxis(b.q[0], axis, theta), rotateAxis(b.q[1], axis, theta),
                rotateAxis(b.q[2], axis, theta), rotateAxis(b.q[3], axis, theta)],
            n: rotateAxis(b.n, axis, theta),
            c: b.c, p: b.p, hl: b.hl
          });
        } else quads.push(b);                 // 其余层直接画终态（转层前后不变）
      }
      drawScene(quads);
      if (t < 1) {
        animId = requestAnimationFrame(frame);
      } else {
        animId = 0; busy = false;
        render();
        if (Core.isSolved(state)) finish();
      }
    }
    animId = requestAnimationFrame(frame);
  }

  /* ================= 交互 / 存档 / 切档 / 结算（第二批补齐） ================= */
  /* ---------------- 存档 ---------------- */
  // [gyh 2026-11-09 新增] 开局立刻写，state 只含纯 JSON 贴纸数据
  function saveState() {
    if (!state) return;
    writeJSON(SAVE_STATE, {
      diff: diff,
      state: { n: state.n, stickers: state.stickers },
      scramble: scrambleSeq,
      steps: steps,
      elapsed: Math.floor(elapsedMs),
      hints: hintsLeft,
      rev: rev
    });
  }
  function loadSave() {
    var o = readJSON(SAVE_STATE);
    if (!o || typeof o !== 'object' || !DIFF[o.diff]) return null;
    return o;
  }
  function getBest() {
    var b = readJSON(SAVE_BEST);
    return (b && typeof b === 'object') ? b : {};
  }
  // [gyh 2026-11-09 新增] easy 只看步数、medium 计时计入、hard 步数+计时
  function better(cur, st, sec) {
    if (!cur || typeof cur.steps !== 'number') return true;
    if (diff === 'easy') return st < cur.steps;
    if (diff === 'medium') return sec < cur.seconds ||
      (sec === cur.seconds && st < cur.steps);
    return st < cur.steps || (st === cur.steps && sec < cur.seconds);
  }
  function hintText() { return hintsLeft < 0 ? '\u221E' : String(hintsLeft); }
  function bestText() {
    var b = getBest()[diff];
    if (!b || typeof b.steps !== 'number') return '--';
    return diff === 'easy' ? String(b.steps) : fmtTime(b.seconds);
  }

  /* ---------------- HUD / 计时 ---------------- */
  function updateHUD() {
    var el;
    el = $('size');  if (el) el.textContent = cfg.n === 3 ? '3\u00D73' : '2\u00D72';
    el = $('steps'); if (el) el.textContent = String(steps);
    el = $('time');  if (el) el.textContent = fmtTime(Math.floor(elapsedMs / 1000));
    el = $('best');  if (el) el.textContent = bestText();
  }
  function paintTime() {
    var el = $('time');
    if (el) el.textContent = fmtTime(Math.floor(elapsedMs / 1000));
  }
  function startTimer() {
    stopTimer();
    lastT = Date.now();
    timerId = setInterval(function () {
      var now = Date.now();
      if (running && !paused && !finished) elapsedMs += now - lastT;
      lastT = now;
      paintTime();
    }, 250);
    paintTime();
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = 0; } }

  /* ---------------- 卡片 / 暂停 / 结算 ---------------- */
  function showCard(mode) {
    var card = $('card'), t = $('card-title'), s = $('card-sub'), b = $('btn-start-card');
    if (!card) return;
    card.hidden = false;
    if (t) t.textContent = I18N.t(mode === 'pause' ? 'paused_title' : 'game_title');
    if (s) s.textContent = I18N.t('tagline');
    if (b) b.textContent = I18N.t(mode === 'pause' ? 'btn_resume' : 'btn_start');
  }
  function hideCard() { var c = $('card'); if (c) c.hidden = true; }
  function hideOverlay() { var o = $('overlay'); if (o) o.hidden = true; }

  // [gyh 2026-11-09 新增] 语言切换后覆盖被 I18N.apply 重置的动态文案
  function paintDynamicTexts() {
    var bp = $('btn-pause');
    if (bp) bp.textContent = I18N.t(paused ? 'btn_resume' : 'btn_pause');
    var card = $('card');
    if (card && !card.hidden) showCard(paused ? 'pause' : 'start');
    var ov = $('overlay');
    if (ov && !ov.hidden && lastWin) paintOverlay(lastWin.seconds, lastWin.isRecord);
  }
  function startGame() {
    if (paused) { togglePause(); return; }
    if (finished) { newGame(true); return; }
    running = true;
    hideCard();
    startTimer();
    sfx('start');
    paintDynamicTexts();
  }
  function togglePause() {
    if (!running || finished) return;
    paused = !paused;
    if (paused) showCard('pause'); else hideCard();
    sfx('click');
    paintDynamicTexts();
  }
  // [gyh 2026-11-09 新增] win_sub 的两个占位符都必须替换后再显示
  function paintOverlay(seconds, isRecord) {
    var ov = $('overlay');
    if (!ov) return;
    var a = $('overlay-title'), b = $('overlay-sub');
    var m = $('overlay-moves'), t = $('overlay-time'), r = $('record-badge');
    if (a) a.textContent = I18N.t('win_title');
    if (b) b.textContent = I18N.t('win_sub')
      .replace('{score}', String(steps))
      .replace('{level}', String(seconds));
    if (m) m.textContent = String(steps);
    if (t) t.textContent = fmtTime(seconds);
    if (r) r.hidden = !isRecord;
    ov.hidden = false;
  }
  function finish() {
    finished = true;
    stopTimer();
    var seconds = Math.floor(elapsedMs / 1000);
    var b = getBest();
    var isRecord = better(b[diff], steps, seconds);
    if (isRecord) { b[diff] = { steps: steps, seconds: seconds }; writeJSON(SAVE_BEST, b); }
    lastWin = { seconds: seconds, isRecord: isRecord };
    sfx('win');
    if (isRecord) sfx('levelup');
    paintOverlay(seconds, isRecord);
    updateHUD();
    saveState();
  }

  /* ---------------- 局面操作 ---------------- */
  // [gyh 2026-11-09 新增] 重开：先取消 rAF / 清 timer，再重建局面并立即写存档
  function newGame(autoStart) {
    if (animId) { cancelAnimationFrame(animId); animId = 0; }
    busy = false;
    stopTimer();
    cfg = DIFF[diff];
    solvedState = Core.create(cfg.n);
    state = Core.clone(solvedState);
    scrambleSeq = Core.scramble(state, cfg.scramble, Math.random) || [];
    undoStack = [];
    steps = 0;
    elapsedMs = 0;
    hintsLeft = cfg.hints;
    hintActive = false; hintFace = null;
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = 0; }
    finished = false;
    lastWin = null;
    rev = false;
    var rb = $('btn-rev');
    if (rb) rb.setAttribute('aria-pressed', 'false');
    hideOverlay();
    saveState();                              // 开局立刻写
    updateHUD();
    resizeCanvas();
    if (autoStart) {
      running = true; paused = false; hideCard(); startTimer();
    } else {
      running = false; paused = false; showCard('start');
    }
    paintDynamicTexts();
  }
  function canAct() { return !busy && !paused && !finished; }
  function undo() {
    if (!canAct()) return;
    if (!undoStack.length) { sfx('warn'); toast(I18N.t('msg_no_moves')); return; }
    state = undoStack.pop();
    if (cfg.countUndo) steps += 1;            // hard：撤销也计入步数
    else steps = Math.max(0, steps - 1);
    sfx('swap');
    saveState(); updateHUD(); render();
    toast(I18N.t('btn_undo'));
  }
  function useHint() {
    if (!canAct()) return;
    if (hintsLeft === 0) { sfx('warn'); toast(I18N.t('msg_no_moves')); return; }
    if (hintsLeft > 0) hintsLeft -= 1;
    var f = 'U';
    if (scrambleSeq.length) {
      var mv = scrambleSeq[scrambleSeq.length - 1 - (steps % scrambleSeq.length)];
      if (mv && mv.face) f = mv.face;
    }
    hintFace = f; hintActive = true;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintActive = false; hintTimer = 0; render(); }, 1500);
    sfx('coin');
    toast(I18N.t('label_lives') + ' ' + hintText(), true);
    saveState(); updateHUD(); render();
  }
  function resetSolve() {
    if (!canAct()) return;
    state = Core.clone(solvedState);
    undoStack = [];
    steps = 0;
    sfx('lock');
    saveState(); updateHUD(); render();
    toast(I18N.t('msg_solved'));
  }

  /* ---------------- 切档 ---------------- */
  function syncDiffs() {
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  // [gyh 2026-11-09 新增] 含点到当前同档：先幂等落盘，再取消动画/timer 重开，最后才显示页面内提示
  function switchDiff(d) {
    if (!DIFF[d]) return;
    try { localStorage.setItem(SAVE_DIFF, d); } catch (e) {}
    diff = d; cfg = DIFF[d];
    syncDiffs();
    if (animId) { cancelAnimationFrame(animId); animId = 0; }
    busy = false;
    stopTimer();
    newGame(true);
    toast(I18N.t('confirm_diff'), true);
    sfx('select');
  }

  /* ---------------- 事件绑定 ---------------- */
  function on(id, fn) {
    var el = $(id);
    if (el) el.addEventListener('click', fn);
  }
  function bindDrag() {
    var dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; lx = e.clientX; ly = e.clientY;
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      yaw += (e.clientX - lx) * 0.01;
      pitch += (e.clientY - ly) * 0.01;
      if (pitch > 1.4) pitch = 1.4;
      if (pitch < -1.4) pitch = -1.4;
      lx = e.clientX; ly = e.clientY;
      if (!busy) render();                    // 动画中由 rAF 用新角度重绘
    });
    var end = function () { dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
  }
  function bindEvents() {
    var i;
    var dbs = document.querySelectorAll('#diffs .seg__btn');
    for (i = 0; i < dbs.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { switchDiff(b.getAttribute('data-diff')); });
      })(dbs[i]);
    }
    var lbs = document.querySelectorAll('#layers .layer-btn[data-face]');
    for (i = 0; i < lbs.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          doTurn(b.getAttribute('data-face'), rev ? -1 : 1);
        });
      })(lbs[i]);
    }
    on('btn-rev', function () {
      rev = !rev;
      var el = $('btn-rev');
      if (el) el.setAttribute('aria-pressed', rev ? 'true' : 'false');
      sfx('toggle');
      saveState();
    });
    on('btn-start', startGame);
    on('btn-start-card', function () {
      if (paused) togglePause(); else startGame();
    });
    on('btn-scramble', function () {
      if (busy) return;
      newGame(true); sfx('whoosh'); toast(I18N.t('msg_scrambled'));
    });
    on('btn-reset', resetSolve);
    on('btn-undo', undo);
    on('btn-hint', useHint);
    on('btn-pause', togglePause);
    on('btn-restart', function () {
      if (busy) return;
      newGame(true); sfx('start');
    });
    on('btn-again', function () { newGame(true); sfx('start'); });

    // [gyh 2026-11-09 新增] 键盘 U/D/L/R/F/B 转层，Shift 反向，P 暂停
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var k = e.key || '';
      if (k === 'p' || k === 'P') { e.preventDefault(); togglePause(); return; }
      var up = k.toUpperCase();
      if (up.length === 1 && 'UDLRFB'.indexOf(up) >= 0) {
        e.preventDefault();
        doTurn(up, e.shiftKey ? -1 : 1);
      }
    });
    bindDrag();
    document.addEventListener('ys:langchange', function () {
      paintDynamicTexts();
      updateHUD();
    });
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
  }

  /* [gyh 2026-11-09 新增] 启动：恢复存档或开新局，刷新仍是同一局面 */
  function boot() {
    var d = null;
    try { d = localStorage.getItem(SAVE_DIFF); } catch (e) {}
    diff = (d && DIFF[d]) ? d : 'medium';
    cfg = DIFF[diff];
    try { localStorage.setItem(SAVE_DIFF, diff); } catch (e) {}
    syncDiffs();

    var saved = loadSave();
    var restored = false;
    if (saved && saved.diff === diff && saved.state) {
      var st = Core.restore(saved.state);
      if (st && st.n === cfg.n && st.stickers && st.stickers.length) {
        state = st;
        solvedState = Core.create(cfg.n);
        scrambleSeq = saved.scramble || [];
        steps = typeof saved.steps === 'number' ? saved.steps : 0;
        elapsedMs = typeof saved.elapsed === 'number' ? saved.elapsed : 0;
        hintsLeft = typeof saved.hints === 'number' ? saved.hints : cfg.hints;
        rev = !!saved.rev;
        restored = true;
      }
    }
    bindEvents();
    if (!restored) {
      newGame(false);
    } else {
      var rb = $('btn-rev');
      if (rb) rb.setAttribute('aria-pressed', rev ? 'true' : 'false');
      undoStack = [];
      hintActive = false; hintFace = null; lastWin = null;
      finished = false; running = false; paused = false;
      hideOverlay();
      saveState();
      updateHUD();
      resizeCanvas();
      showCard('start');
      paintDynamicTexts();
    }
  }

  /* [gyh 2026-11-09 新增] 启动 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
