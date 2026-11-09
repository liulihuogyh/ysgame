/* ==========================================================================
   飞扬小鸟 · 游戏逻辑（原创几何小鸟穿缝隙）
   - canvas 绘制，固定逻辑坐标系 360×520（竖屏），按 devicePixelRatio 缩放
   - 小鸟固定在左侧约 1/3 处；重力下坠，点一下给一个向上冲量
   - 上下成对管道从右向左移动，随机缝隙高度；穿过一组 +1 分
   - 撞到管道 / 地面 / 天花板即结束；无尽跑分，没有过关
   - 随分数提速并收窄缝隙（都有上下限），三档难度真正拉开
   - 远山 / 云朵 / 地面滚动装饰 + 昼夜配色循环，全部原创几何绘制
   - 自动存档（按难度隔离槽）、最高分记录，统一走全站音效引擎 YSound
   [skybird-dev 2026-11-09 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var W = 360;                 // 逻辑宽
  var H = 520;                 // 逻辑高
  var STATE_V = 1;
  var GROUND_H = 64;           // 地面高度
  var BIRD_X = 116;            // 小鸟固定 x（约 1/3 处）
  var BIRD_R = 13;             // 小鸟半径
  var PIPE_W = 62;             // 管道主体宽
  var PIPE_CAP_H = 18;         // 管道盖檐高
  var MIN_EDGE = 44;           // 缝隙中心离顶部 / 地面的最小余量

  var KEY_STATE = 'ysgame-skybird-state';
  var KEY_BEST = 'ysgame-skybird-best';
  var KEY_DIFF = 'ysgame-skybird-diff';

  // 三档：重力 / 拍翅冲量 / 缝隙 / 水平速度 / 生成间隔 / 相邻落差幅度 /
  //       每 5 分提速比例 / 速度上限 / 缝隙下限 / 每 5 分收窄步长
  var DIFF = {
    easy: {
      gravity: 900, flap: -300, gap: 190, speed: 110, interval: 1.9,
      randAmp: 40, speedup: 0.04, cap: 1.3, gapMin: 132, gapStep: 6
    },
    medium: {
      gravity: 1150, flap: -320, gap: 150, speed: 145, interval: 1.45,
      randAmp: 70, speedup: 0.06, cap: 1.5, gapMin: 100, gapStep: 5
    },
    hard: {
      gravity: 1400, flap: -340, gap: 118, speed: 185, interval: 1.10,
      randAmp: 100, speedup: 0.08, cap: 1.7, gapMin: 84, gapStep: 4
    }
  };

  // 昼夜三段配色（低饱和原创几何），随飞行距离平滑循环
  var SKIES = [
    { top: '#8FC7E8', bot: '#DCEFF6', hill2: '#8AA695', hill: '#9FB8A8',
      ground: '#DCC49B', pipe: '#8FA88C', pipeEdge: '#6E886C' },  // 白天
    { top: '#E8A87C', bot: '#F7DEC4', hill2: '#9C7A76', hill: '#B4938A',
      ground: '#D8B98F', pipe: '#A88C86', pipeEdge: '#876E68' },  // 黄昏
    { top: '#313C60', bot: '#5A6490', hill2: '#3C4566', hill: '#4C5578',
      ground: '#6B6480', pipe: '#5E6E78', pipeEdge: '#454F60' }   // 夜晚
  ];
  var PALETTE_KEYS = ['top', 'bot', 'hill2', 'hill', 'ground', 'pipe', 'pipeEdge'];

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium',
    status: 'ready',   // ready | running | paused | gameover
    score: 0,
    distance: 0,
    isRecord: false,
    bestAtStart: 0
  };

  var bird = { x: BIRD_X, y: H * 0.42, vy: 0, flapT: 0, rot: 0 };
  var pipes = [];
  var spawnT = 0;           // 下一根管道生成倒计时（秒）
  var lastGapY = (H - GROUND_H) / 2;  // 上一根管道的缝隙中心
  var scrollX = 0;         // 背景 / 地面滚动累计（像素）
  var clouds = [];
  var stars = [];
  var banner = { ms: 0, title: '', sub: '' };

  var dom = {};
  var ctx = null;
  var lastTs = 0;
  var lastSave = 0;
  var lastSfx = {};
  var toastMs = 0;

  /* ---------------- 小工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  // 字典里的 {score}/{level} 占位符，用 split/join 替换
  function tf(key, map) {
    var s = t(key);
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        s = s.split('{' + k + '}').join(String(map[k]));
      }
    }
    return s;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function diffDef() { return DIFF[state.diff] || DIFF.medium; }

  function nowMs() {
    return (window.performance && window.performance.now)
      ? window.performance.now() : Date.now();
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
    } catch (e) { /* 隐私模式下写不进去，忽略 */ }
  }

  function setI18n(el, key) {
    if (!el) return;
    el.setAttribute('data-i18n', key);
    el.textContent = t(key);
  }

  function sfx(name, opts, throttle) {
    if (!window.YSound) return;
    var n = nowMs();
    if (throttle) {
      if (lastSfx[name] && n - lastSfx[name] < throttle) return;
      lastSfx[name] = n;
    }
    window.YSound.play(name, opts || {});
  }

  /* ---------------- 最高分（纯数字，可直接读出） ---------------- */

  function readBest() {
    try {
      var n = Number(window.localStorage.getItem(KEY_BEST));
      return (isFinite(n) && n > 0) ? Math.floor(n) : 0;
    } catch (e) { return 0; }
  }

  function writeBest(n) {
    try {
      window.localStorage.setItem(KEY_BEST, String(Math.floor(n)));
    } catch (e) { /* 忽略 */ }
  }

  function settleBest() {
    if (state.score > readBest()) writeBest(state.score);
  }

  function ensureBest() {
    try {
      var raw = window.localStorage.getItem(KEY_BEST);
      var n = Number(raw);
      // 缺失或损坏（非数字）都重置为数字 0，保证随时能读出合法数字
      if (raw === null || !isFinite(n) || n < 0) {
        window.localStorage.setItem(KEY_BEST, '0');
      }
    } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 难度 / 速度 / 缝隙 ---------------- */

  function speedK() {
    var d = diffDef();
    return Math.min(d.cap, 1 + Math.floor(state.score / 5) * d.speedup);
  }

  function currentGap() {
    var d = diffDef();
    return Math.max(d.gapMin, d.gap - Math.floor(state.score / 5) * d.gapStep);
  }

  // 生成间隔随速度缩短，保持水平间距大致恒定，节奏随分数加快
  function currentInterval(k) {
    return diffDef().interval / k;
  }

  /* ---------------- 配色 / 背景装饰 ---------------- */

  function hex2rgb(h) {
    h = h.charAt(0) === '#' ? h.slice(1) : h;
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16)
    ];
  }

  function lerpColor(a, b, f) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * f) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * f) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * f) + ')';
  }

  function palette() {
    var phase = (state.distance / 1500) % 3;
    if (phase < 0) phase += 3;
    var base = Math.floor(phase);
    var i = base % 3;
    var f = phase - base;
    var A = SKIES[i], B = SKIES[(i + 1) % 3];
    var out = {};
    for (var k = 0; k < PALETTE_KEYS.length; k++) {
      var key = PALETTE_KEYS[k];
      out[key] = lerpColor(A[key], B[key], f);
    }
    // 夜晚权重：phase 接近 2 时最亮（用于星星 / 云朵亮度）
    var dnight = Math.abs(phase - 2);
    dnight = Math.min(dnight, 3 - dnight);
    out.nightW = clamp(1 - dnight, 0, 1);
    return out;
  }

  function initClouds() {
    clouds = [];
    for (var i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * W,
        y: 44 + Math.random() * 150,
        s: 0.7 + Math.random() * 0.7,
        sp: 8 + Math.random() * 10
      });
    }
  }

  function initStars() {
    stars = [];
    for (var i = 0; i < 26; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (H - GROUND_H) * 0.7,
        r: Math.random() * 1.3 + 0.4,
        ph: Math.random() * Math.PI * 2
      });
    }
  }

  function updateClouds(sdt) {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x -= c.sp * sdt;
      if (c.x < -70) {
        c.x = W + 40 + Math.random() * 40;
        c.y = 44 + Math.random() * 150;
      }
    }
  }

  /* ---------------- 管道 ---------------- */

  function spawnPipe(gapNow) {
    var d = diffDef();
    var centerMin = MIN_EDGE + gapNow / 2;
    var centerMax = (H - GROUND_H) - MIN_EDGE - gapNow / 2;
    if (centerMax < centerMin) centerMax = centerMin;
    var delta = (Math.random() * 2 - 1) * d.randAmp;
    var gy = clamp(lastGapY + delta, centerMin, centerMax);
    lastGapY = gy;
    pipes.push({ x: W + 10, gapY: gy, gap: gapNow, scored: false });
  }

  function circleRect(cx, cy, cr, rx, ry, rw, rh) {
    var nx = clamp(cx, rx, rx + rw);
    var ny = clamp(cy, ry, ry + rh);
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= cr * cr;
  }

  function collidePipe(p) {
    var topH = p.gapY - p.gap / 2;
    var botY = p.gapY + p.gap / 2;
    var botH = (H - GROUND_H) - botY;
    var rx = p.x - 3, rw = PIPE_W + 6;   // 含盖檐略宽的部分
    if (circleRect(bird.x, bird.y, BIRD_R, rx, 0, rw, topH)) return true;
    if (circleRect(bird.x, bird.y, BIRD_R, rx, botY, rw, botH)) return true;
    return false;
  }

  /* ---------------- 绘制 ---------------- */

  function fitCanvas() {
    var rect = dom.canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.round(rect.height);
    if (!cssH || cssH < 10) cssH = Math.round(cssW * H / W);

    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var pw = Math.round(cssW * dpr);
    var ph = Math.round(cssH * dpr);
    if (dom.canvas.width !== pw || dom.canvas.height !== ph) {
      dom.canvas.width = pw;
      dom.canvas.height = ph;
    }
    ctx = dom.canvas.getContext('2d');
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
  }

  function drawSky(pal) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.top);
    g.addColorStop(1, pal.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars(pal) {
    if (pal.nightW < 0.05) return;
    ctx.save();
    ctx.fillStyle = '#FDF6E3';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = pal.nightW *
        (0.4 + 0.5 * (0.5 + 0.5 * Math.sin(nowMs() / 700 + s.ph)));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 三角折线山脊：原创几何远山，两层视差滚动
  function ridge(color, baseY, amp, period, factor) {
    var off = (scrollX * factor) % period;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var x = -period - off; x < W + period; x += period) {
      ctx.lineTo(x, baseY);
      ctx.lineTo(x + period / 2, baseY - amp);
      ctx.lineTo(x + period, baseY);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawHills(pal) {
    ridge(pal.hill2, H * 0.60, 44, 150, 0.16);
    ridge(pal.hill, H * 0.70, 34, 118, 0.30);
  }

  function drawClouds(pal) {
    var alpha = 0.55 * (1 - pal.nightW * 0.7);
    ctx.save();
    ctx.fillStyle = 'rgba(255,253,248,' + alpha.toFixed(2) + ')';
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i], s = c.s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 14 * s, c.y - 6 * s, 15 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 30 * s, c.y, 11 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 15 * s, c.y + 6 * s, 14 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function pipeBody(x, y, w, h, pal) {
    ctx.fillStyle = pal.pipe;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = pal.pipeEdge;
    ctx.fillRect(x, y, 4, h);
    ctx.fillRect(x + w - 4, y, 4, h);
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(x + 10, y, 7, h);
  }

  function pipeCap(x, y, w, h, pal) {
    ctx.fillStyle = pal.pipeEdge;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = pal.pipe;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fillRect(x + 8, y + 2, 7, h - 4);
  }

  function drawPipe(p, pal) {
    var topH = p.gapY - p.gap / 2;
    var botY = p.gapY + p.gap / 2;
    var botH = (H - GROUND_H) - botY;
    pipeBody(p.x, 0, PIPE_W, topH, pal);
    pipeCap(p.x - 3, topH - PIPE_CAP_H, PIPE_W + 6, PIPE_CAP_H, pal);
    pipeBody(p.x, botY, PIPE_W, botH, pal);
    pipeCap(p.x - 3, botY, PIPE_W + 6, PIPE_CAP_H, pal);
  }

  function drawGround(pal) {
    var gy = H - GROUND_H;
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, gy, W, GROUND_H);
    ctx.fillStyle = 'rgba(69,75,89,.14)';
    ctx.fillRect(0, gy, W, 5);
    ctx.fillStyle = 'rgba(255,253,248,.30)';
    var off = scrollX % 30;
    for (var x = -30 - off; x < W + 30; x += 30) {
      ctx.fillRect(x, gy + 14, 15, 4);
      ctx.fillRect(x + 12, gy + 30, 11, 4);
      ctx.fillRect(x + 4, gy + 46, 13, 4);
    }
  }

  function drawBird() {
    var by = bird.y;
    if (state.status === 'ready') by += Math.sin(nowMs() / 320) * 4;
    ctx.save();
    ctx.translate(bird.x, by);
    ctx.rotate(bird.rot);

    ctx.fillStyle = '#F4C95D';
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FBE3A0';
    ctx.beginPath();
    ctx.arc(-2, 3, BIRD_R * 0.6, 0, Math.PI * 2);
    ctx.fill();

    var wing = -12 * bird.flapT;
    ctx.fillStyle = '#E8A94B';
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.lineTo(-BIRD_R - 9, -8 + wing);
    ctx.lineTo(-BIRD_R - 4, 9 + wing * 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#E07A4F';
    ctx.beginPath();
    ctx.moveTo(BIRD_R - 3, -3);
    ctx.lineTo(BIRD_R + 10, 1);
    ctx.lineTo(BIRD_R - 3, 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FFFDF8';
    ctx.beginPath();
    ctx.arc(5, -4, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#454B59';
    ctx.beginPath();
    ctx.arc(6, -4, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawScore() {
    if (state.status === 'ready') return;
    var s = String(state.score);
    ctx.save();
    ctx.font = '700 44px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(69,75,89,.38)';
    ctx.strokeText(s, W / 2, 66);
    ctx.fillStyle = '#FFFDF8';
    ctx.fillText(s, W / 2, 66);
    ctx.restore();
  }

  function drawBanner() {
    if (banner.ms <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, banner.ms / 400);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = '700 24px system-ui, -apple-system, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(69,75,89,.4)';
    ctx.strokeText(banner.title, W / 2, H * 0.30);
    ctx.fillStyle = '#FFFDF8';
    ctx.fillText(banner.title, W / 2, H * 0.30);
    ctx.font = '500 13px system-ui, -apple-system, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeText(banner.sub, W / 2, H * 0.30 + 26);
    ctx.fillText(banner.sub, W / 2, H * 0.30 + 26);
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    var pal = palette();
    drawSky(pal);
    drawStars(pal);
    drawHills(pal);
    drawClouds(pal);
    for (var i = 0; i < pipes.length; i++) drawPipe(pipes[i], pal);
    drawGround(pal);
    drawBird();
    drawScore();
    drawBanner();
  }

  /* ---------------- 每帧推进 ---------------- */

  function addScore() {
    state.score += 1;
    if (!state.isRecord && state.score > state.bestAtStart) {
      state.isRecord = true;
      sfx('win');
    }
    settleBest();
    if (state.score % 10 === 0) {
      banner.ms = 1500;
      banner.title = t('win_title');
      banner.sub = tf('win_sub', {
        score: state.score, level: Math.floor(state.score / 10)
      });
      sfx('levelup');
    } else {
      sfx('coin');
    }
    refreshHud();
    saveState(true);
  }

  function flap() {
    bird.vy = diffDef().flap;
    bird.flapT = 1;
    sfx('whoosh', null, 60);
  }

  function update(dt) {
    var sdt = dt / 1000;

    // 云朵缓慢左移（任何状态都动，画面不呆板）
    updateClouds(sdt);

    // 横幅 / 提示计时
    if (banner.ms > 0) {
      banner.ms -= dt;
      if (banner.ms < 0) banner.ms = 0;
    }
    if (toastMs > 0) {
      toastMs -= dt;
      if (toastMs <= 0) dom.toast.hidden = true;
    }

    if (state.status !== 'running') return;

    var d = diffDef();
    var k = speedK();
    var spd = d.speed * k;
    var gapNow = currentGap();

    // 小鸟物理
    bird.vy += d.gravity * sdt;
    bird.y += bird.vy * sdt;
    bird.flapT = Math.max(0, bird.flapT - sdt / 0.18);
    bird.rot += (clamp(bird.vy / 520, -0.5, 1.1) - bird.rot) * Math.min(1, sdt * 10);

    // 距离 / 背景滚动
    state.distance += spd * sdt;
    scrollX += spd * sdt;

    // 生成管道
    spawnT -= sdt;
    if (spawnT <= 0) {
      spawnPipe(gapNow);
      spawnT += currentInterval(k);
    }

    // 移动管道 / 计分 / 碰撞
    for (var i = pipes.length - 1; i >= 0; i--) {
      var p = pipes[i];
      p.x -= spd * sdt;
      if (!p.scored && p.x + PIPE_W + 3 < bird.x - BIRD_R) {
        p.scored = true;
        addScore();
      }
      if (p.x + PIPE_W + 6 < 0) { pipes.splice(i, 1); continue; }
      if (collidePipe(p)) { crash(); return; }
    }

    // 地面 / 天花板
    if (bird.y + BIRD_R >= H - GROUND_H || bird.y - BIRD_R <= 0) {
      crash();
      return;
    }

    // 节流存档
    var now = Date.now();
    if (now - lastSave > 500) { lastSave = now; saveState(false); }
  }

  function loop(ts) {
    window.requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
    lastTs = ts;
    update(dt);
    draw();
  }

  /* ---------------- 记分板 / 卡片 / 结算 ---------------- */

  function refreshHud() {
    dom.score.textContent = String(state.score);
    dom.best.textContent = String(readBest());
    dom.pipes.textContent = String(state.score);
    dom.dist.textContent = String(Math.floor(state.distance / 10));
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
    dom.btnPause.disabled = !(state.status === 'running' || state.status === 'paused');
    // btn-start 始终保持可点：页面加载后即可开局，回归 / 玩家随时可触发
  }

  function showCard(kind) {
    dom.card.hidden = false;
    dom.card.dataset.kind = kind;
    if (kind === 'pause') {
      setI18n(dom.cardTitle, 'paused_title');
      dom.cardSub.hidden = true;
      setI18n(dom.btnCard, 'btn_resume');
    } else {
      setI18n(dom.cardTitle, 'game_title');
      dom.cardSub.hidden = false;
      setI18n(dom.cardSub, 'tagline');
      setI18n(dom.btnCard, 'btn_start');
    }
  }

  function hideCard() { dom.card.hidden = true; }
  function hideOverlay() { dom.overlay.hidden = true; }

  function renderResult() {
    setI18n(dom.overlayTitle, 'lose_title');
    // lose_sub 带 {score}/{level}：{level} 此处语义为「最佳分数」，必须替换
    dom.overlaySub.textContent = tf('lose_sub', {
      score: state.score, level: readBest()
    });
    dom.overlayScore.textContent = String(state.score);
    dom.overlayBest.textContent = String(readBest());
    dom.recordBadge.hidden = !(state.isRecord && state.score > 0);
  }

  function showResult() {
    hideCard();
    renderResult();
    dom.overlay.hidden = false;
    if (typeof dom.overlay.scrollIntoView === 'function') {
      dom.overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function showToast(msg, ms) {
    dom.toast.textContent = msg;
    dom.toast.hidden = false;
    toastMs = ms || 1400;
  }

  /* ---------------- 开局 / 状态切换 ---------------- */

  function newGame() {
    state.score = 0;
    state.distance = 0;
    state.isRecord = false;
    state.bestAtStart = readBest();

    bird.x = BIRD_X;
    bird.y = H * 0.42;
    bird.vy = 0;
    bird.flapT = 0;
    bird.rot = 0;

    pipes = [];
    spawnT = diffDef().interval;
    lastGapY = (H - GROUND_H) / 2;
    scrollX = 0;
    banner.ms = 0;
    lastTs = 0;

    state.status = 'ready';
    hideOverlay();
    showCard('ready');
    syncButtons();
    refreshHud();
    saveState(true);   // 开局即写入存档
  }

  function start() {
    if (state.status !== 'ready') return;
    state.status = 'running';
    hideCard();
    // 起飞先轻抬一下，给玩家一点反应缓冲
    bird.vy = diffDef().flap * 0.6;
    bird.flapT = 1;
    lastTs = 0;
    sfx('start');
    saveState(true);
  }

  function pause() {
    if (state.status !== 'running') return;
    state.status = 'paused';
    showCard('pause');
    syncButtons();
    sfx('toggle');
    saveState(true);
  }

  function resume() {
    if (state.status !== 'paused') return;
    state.status = 'running';
    hideCard();
    syncButtons();
    lastTs = 0;
    sfx('toggle');
    saveState(true);
  }

  function togglePause() {
    if (state.status === 'running') pause();
    else if (state.status === 'paused') resume();
    else if (state.status === 'ready') showToast(t('msg_invalid'));
    else if (state.status === 'gameover') showToast(t('msg_no_moves'));
  }

  function gameOver() {
    state.status = 'gameover';
    settleBest();
    sfx('lose');
    showResult();
    saveState(true);   // 标记结束（status=gameover），不再续玩死局
  }

  function crash() {
    if (state.status !== 'running') return;
    gameOver();
  }

  function restart() {
    newGame();
  }

  // 统一动作输入：running 拍翅 / ready 开始 / paused 继续 / gameover 重开
  function primaryAction() {
    if (state.status === 'running') flap();
    else if (state.status === 'ready') start();
    else if (state.status === 'paused') resume();
    else if (state.status === 'gameover') restart();
  }

  function switchDiff(diff) {
    if (!DIFF[diff]) return;
    // 点任一难度按钮都立即落盘 diff 键（回归会在开局后点 hard 再读这个键）
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) {}
    if (diff === state.diff) { syncDiffs(); return; }  // 点当前档：仅落盘，不打断

    // 不用浏览器原生确认对话框（自动化会 dismiss 对话框导致切难度失效）；
    // 改用页面内 toast 展示 confirm_diff 文案，随后直接重开新局
    showToast(t('confirm_diff'), 1600);
    sfx('toggle');
    state.diff = diff;
    syncDiffs();
    newGame();   // 切换即重开
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    var ps = [];
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      ps.push({ x: p.x, gapY: p.gapY, gap: p.gap, scored: p.scored });
    }
    return {
      v: STATE_V,
      diff: state.diff,
      score: state.score,
      best: readBest(),
      distance: state.distance,
      status: state.status,
      isRecord: state.isRecord,
      bestAtStart: state.bestAtStart,
      bird: { x: bird.x, y: bird.y, vy: bird.vy },
      pipes: ps,
      spawnT: spawnT,
      lastGapY: lastGapY
    };
  }

  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 200) return;
    lastSave = now;

    var root = readJSON(KEY_STATE, null);
    if (!root || root.v !== STATE_V || !root.data ||
        typeof root.data !== 'object' || Array.isArray(root.data)) {
      root = { v: STATE_V, data: {} };
    }
    root.data[state.diff] = snapshot();   // 按难度隔离槽
    writeJSON(KEY_STATE, root);
  }

  function loadState() {
    var root = readJSON(KEY_STATE, null);
    if (!root || root.v !== STATE_V || !root.data ||
        typeof root.data !== 'object' || Array.isArray(root.data)) return false;
    var s = root.data[state.diff];
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;

    // 校验：损坏 / 结束的存档一律不续玩
    if (typeof s.score !== 'number' || typeof s.best !== 'number' ||
        typeof s.distance !== 'number') return false;
    if (!s.bird || typeof s.bird !== 'object' ||
        typeof s.bird.y !== 'number' || typeof s.bird.vy !== 'number') return false;
    if (!Array.isArray(s.pipes)) return false;
    if (s.score < 0 || s.distance < 0) return false;
    if (s.status === 'gameover') return false;   // 撞击结束，重置为新一局

    state.score = Math.floor(s.score);
    state.distance = s.distance;
    state.isRecord = !!s.isRecord;
    state.bestAtStart = typeof s.bestAtStart === 'number' ? s.bestAtStart : readBest();
    if (s.best > readBest()) writeBest(s.best);

    bird.x = BIRD_X;
    bird.y = clamp(s.bird.y, BIRD_R, H - GROUND_H - BIRD_R);
    bird.vy = s.bird.vy;
    bird.flapT = 0;
    bird.rot = clamp(s.bird.vy / 520, -0.5, 1.1);

    pipes = [];
    for (var i = 0; i < s.pipes.length; i++) {
      var p = s.pipes[i];
      if (!p || typeof p.x !== 'number' || typeof p.gapY !== 'number' ||
          typeof p.gap !== 'number') return false;
      pipes.push({ x: p.x, gapY: p.gapY, gap: p.gap, scored: !!p.scored });
    }

    spawnT = typeof s.spawnT === 'number' ? s.spawnT : diffDef().interval;
    lastGapY = typeof s.lastGapY === 'number' ? s.lastGapY : (H - GROUND_H) / 2;
    scrollX = state.distance;
    banner.ms = 0;
    lastTs = 0;

    if (s.status === 'paused') {
      state.status = 'paused';
      hideOverlay();
      showCard('pause');
    } else if (s.status === 'ready') {
      state.status = 'ready';
      hideOverlay();
      showCard('ready');
    } else {
      state.status = 'running';
      hideOverlay();
      hideCard();
    }
    syncButtons();
    refreshHud();
    return true;
  }

  /* ---------------- 输入 ---------------- */

  function closestDiffBtn(node) {
    while (node && node !== dom.diffs) {
      if (node.getAttribute && node.getAttribute('data-diff')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function bindInput() {
    // 点画布任意位置 = 统一动作输入
    dom.canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      primaryAction();
    });

    // 点开始 / 暂停卡片任意位置 = 统一动作输入
    dom.card.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      sfx('click');
      primaryAction();
    });

    // 开始按钮：ready 时立即开局并写入 state 存档；其它状态开新局，始终可点
    dom.btnStart.addEventListener('click', function () {
      sfx('click');
      primaryAction();
    });

    dom.btnPause.addEventListener('click', function () {
      sfx('click');
      togglePause();
    });

    dom.btnRestart.addEventListener('click', function () {
      sfx('click');
      restart();
    });

    dom.btnAgain.addEventListener('click', function () {
      sfx('click');
      restart();
    });

    dom.diffs.addEventListener('click', function (e) {
      var btn = closestDiffBtn(e.target);
      if (!btn || !dom.diffs.contains(btn)) return;
      switchDiff(btn.getAttribute('data-diff'));
    });

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var key = e.key;
      var tag = e.target && e.target.tagName;
      var isForm = (tag === 'BUTTON' || tag === 'A' ||
        tag === 'INPUT' || tag === 'TEXTAREA');

      if (key === 'p' || key === 'P') {
        e.preventDefault();
        togglePause();
        return;
      }
      if (key === ' ' || key === 'Spacebar') {
        if (isForm) return;   // 让聚焦的按钮响应默认空格
        e.preventDefault();
        primaryAction();
        return;
      }
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        e.preventDefault();
        primaryAction();
        return;
      }
    });

    window.addEventListener('blur', function () { lastTs = 0; });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.status === 'running') pause();
      lastTs = 0;
      if (document.hidden) saveState(true);
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
      pipes: document.getElementById('pipes'),
      dist: document.getElementById('dist'),
      diffs: document.getElementById('diffs'),
      btnStart: document.getElementById('btn-start'),
      btnPause: document.getElementById('btn-pause'),
      btnRestart: document.getElementById('btn-restart'),
      btnCard: document.getElementById('btn-card'),
      btnAgain: document.getElementById('btn-again'),
      card: document.getElementById('card'),
      cardTitle: document.getElementById('card-title'),
      cardSub: document.getElementById('card-sub'),
      toast: document.getElementById('toast'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlaySub: document.getElementById('overlay-sub'),
      overlayScore: document.getElementById('overlay-score'),
      overlayBest: document.getElementById('overlay-best'),
      recordBadge: document.getElementById('record-badge')
    };

    var savedDiff = null;
    try { savedDiff = window.localStorage.getItem(KEY_DIFF); } catch (e) {}
    if (savedDiff && DIFF[savedDiff]) state.diff = savedDiff;

    ensureBest();
    state.bestAtStart = readBest();
    initStars();
    initClouds();
    syncDiffs();
    if (!loadState()) newGame();

    // 初始把结算文案里的占位符替换掉，避免任何时刻残留花括号
    renderResult();

    fitCanvas();
    bindInput();
    window.requestAnimationFrame(loop);

    document.addEventListener('ys:langchange', function () {
      syncDiffs();
      syncButtons();
      if (!dom.card.hidden) showCard(dom.card.dataset.kind || 'ready');
      renderResult();       // 无条件替换 {score}/{level}
      banner.ms = 0;        // 语言切换后横幅不残留旧语言
      dom.toast.hidden = true;
      toastMs = 0;
      refreshHud();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
