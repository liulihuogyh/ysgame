/* ==========================================================================
   打砖块（Breakout）· 游戏逻辑
   - canvas 绘制，固定逻辑坐标系 480×640，按 devicePixelRatio 缩放
   - 挡板击球位置决定反弹角度；球速随关卡/难度缓慢上升
   - 三种掉落道具：W 加宽 / M 多球 / S 慢速，都有持续时间
   - 三档难度 + 至少 5 关 + 3 条命 + 连击加分 + 按难度隔离的断点存档
   - 统一走全站音效引擎 window.YSound.play
   [gyh 2026-11-08 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var W = 480;                 // 逻辑宽
  var H = 640;                 // 逻辑高
  var STATE_V = 1;
  var MAX_LEVEL = 5;
  var START_LIVES = 3;
  var BALL_R = 7;
  var PADDLE_H = 14;
  var PADDLE_Y = H - 52;
  var PADDLE_KEY_SPEED = 430;  // 键盘移动速度（逻辑像素/秒）
  var DROP_SPEED = 95;         // 道具下落速度
  var BRICK_TOP = 86;
  var BRICK_H = 20;
  var BRICK_GAP = 6;
  var ROW_GAP = 9;
  var PAD_X = 22;
  var MAX_BALLS = 6;
  var COMBO_MS = 1600;
  var WIDE_MS = 12000;
  var SLOW_MS = 10000;
  var MULTI_MS = 15000;

  var KEY_STATE = 'ysgame-breakout-state';
  var KEY_BEST = 'ysgame-breakout-best';
  var KEY_DIFF = 'ysgame-breakout-diff';

  // [gyh 2026-11-08 新增] 三档：球初速 / 挡板宽度 / 砖块行数 / 硬度 / 掉落率 / 每关提速
  var DIFFS = {
    easy:   { speed: 250, paddleW: 116, rows: 4, cols: 8,  hardRatio: 0,    powerRate: 0.30, speedStep: 14 },
    medium: { speed: 310, paddleW: 92,  rows: 5, cols: 9,  hardRatio: 0.12, powerRate: 0.24, speedStep: 18 },
    hard:   { speed: 370, paddleW: 72,  rows: 6, cols: 10, hardRatio: 0.24, powerRate: 0.18, speedStep: 22 }
  };

  // 低饱和柔和色，一行一个色系，避免刺眼荧光
  var COLORS = [
    '#C8A9A0', '#A8B9A2', '#B3AEC6', '#C9B48C',
    '#9FB2B8', '#C7AAB4', '#B6BFA0', '#C2AB9B'
  ];

  var POWER_COLORS = { W: '#8FA88C', M: '#B08AAE', S: '#8FA6B8' };

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium',
    status: 'ready',   // ready | running | paused | levelclear | gameover | win
    score: 0,
    lives: START_LIVES,
    level: 1,
    combo: 0,
    comboMs: 0,
    isRecord: false,
    bestAtStart: 0,
    bricks: [],
    balls: [],
    drops: []
  };

  var paddle = { x: (W - 92) / 2, y: PADDLE_Y, w: 92, h: PADDLE_H };
  var power = { wideMs: 0, slowMs: 0, multiMs: 0 };

  var dom = {};
  var ctx = null;
  var lastTs = 0;
  var lastSave = 0;
  var lastSfx = {};
  var keyLeft = false;
  var keyRight = false;

  /* ---------------- 小工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  // 字典里的 {score} {level} 占位符，用 split/join 替换（I18N.t 本身不替换）
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

  // 动态文案：同时挂 data-i18n，切语言时 I18N.apply() 会自动重绘
  function setI18n(el, key) {
    el.setAttribute('data-i18n', key);
    el.textContent = t(key);
  }

  function diffDef() { return DIFFS[state.diff] || DIFFS.medium; }
  function baseW() { return diffDef().paddleW; }
  function ballSpeed() {
    return diffDef().speed + (state.level - 1) * diffDef().speedStep;
  }

  function nowMs() {
    return (window.performance && window.performance.now)
      ? window.performance.now() : Date.now();
  }

  // 每次调用前判断 window.YSound；高频碰撞可传节流毫秒，避免吵
  function sfx(name, opts, throttle) {
    if (!window.YSound) return;
    var now = nowMs();
    if (throttle) {
      if (lastSfx[name] && now - lastSfx[name] < throttle) return;
      lastSfx[name] = now;
    }
    window.YSound.play(name, opts || {});
  }

  /* ---------------- 最高分（按难度分开存） ---------------- */

  function readBest() {
    var b = readJSON(KEY_BEST, {});
    if (!b || typeof b !== 'object' || Array.isArray(b)) return {};
    return b;
  }

  function bestOf(diff) {
    var b = readBest();
    return (typeof b[diff] === 'number' && b[diff] > 0) ? b[diff] : 0;
  }

  function settleBest() {
    if (!state.isRecord) return;
    var b = readBest();
    if (state.score > (b[state.diff] || 0)) {
      b[state.diff] = state.score;
      writeJSON(KEY_BEST, b);
    }
  }

  // 键始终存在，按难度分别存最高分；已有纪录不覆盖
  function ensureBest() {
    var b = readJSON(KEY_BEST, null);
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      writeJSON(KEY_BEST, { easy: 0, medium: 0, hard: 0 });
    }
  }

  /* ---------------- 砖块 / 关卡 ---------------- */

  function buildBricks() {
    var d = diffDef();
    var extraRows = Math.min(state.level - 1, 2);
    var rows = d.rows + extraRows;
    var cols = Math.min(d.cols + Math.floor((state.level - 1) / 2), 11);
    var hardRatio = Math.min(0.45, d.hardRatio + (state.level - 1) * 0.04);
    var bw = (W - PAD_X * 2 - BRICK_GAP * (cols - 1)) / cols;
    var bricks = [];

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var hp = Math.random() < hardRatio ? 2 : 1;
        bricks.push({
          x: PAD_X + c * (bw + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + ROW_GAP),
          w: bw,
          h: BRICK_H,
          hp: hp,
          maxHp: hp,
          ci: r % COLORS.length,
          alive: true
        });
      }
    }
    state.bricks = bricks;
  }

  function bricksLeft() {
    var n = 0;
    for (var i = 0; i < state.bricks.length; i++) {
      if (state.bricks[i].alive) n++;
    }
    return n;
  }

  function makeBall(stuck) {
    return {
      x: paddle.x + paddle.w / 2,
      y: paddle.y - BALL_R - 2,
      vx: 0,
      vy: 0,
      r: BALL_R,
      stuck: !!stuck
    };
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
    // 把固定的 480×640 逻辑坐标映射到物理像素
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
    draw(0);
  }

  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTopBar() {
    var chips = [];
    if (power.wideMs > 0) chips.push({ c: 'W', s: Math.ceil(power.wideMs / 1000), col: POWER_COLORS.W });
    if (power.multiMs > 0) chips.push({ c: 'M', s: Math.ceil(power.multiMs / 1000), col: POWER_COLORS.M });
    if (power.slowMs > 0) chips.push({ c: 'S', s: Math.ceil(power.slowMs / 1000), col: POWER_COLORS.S });

    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    var x = 12;
    for (var i = 0; i < chips.length; i++) {
      ctx.fillStyle = chips[i].col;
      rrect(x, 18, 48, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#FFFDF8';
      ctx.textAlign = 'center';
      ctx.fillText(chips[i].c + ' ' + chips[i].s + 's', x + 24, 30);
      x += 56;
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(69, 75, 89, .55)';
    ctx.fillText('Lv ' + state.level + '/' + MAX_LEVEL, W - 14, 30);
  }

  function drawBricks() {
    for (var i = 0; i < state.bricks.length; i++) {
      var b = state.bricks[i];
      if (!b.alive) continue;

      ctx.fillStyle = COLORS[b.ci % COLORS.length];
      rrect(b.x, b.y, b.w, b.h, 5);
      ctx.fill();

      // 顶部一条柔和高光
      ctx.fillStyle = 'rgba(255, 253, 248, .34)';
      rrect(b.x + 2, b.y + 2, b.w - 4, 4, 2);
      ctx.fill();

      if (b.maxHp === 2) {
        ctx.fillStyle = 'rgba(69, 75, 89, .15)';
        rrect(b.x, b.y, b.w, b.h, 5);
        ctx.fill();
        if (b.hp === 2) {
          // 硬砖：中间一个小点，提示要敲两下
          ctx.fillStyle = 'rgba(255, 253, 248, .6)';
          ctx.fillRect(b.x + b.w / 2 - 2, b.y + b.h / 2 - 2, 4, 4);
        } else {
          ctx.strokeStyle = 'rgba(69, 75, 89, .34)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(b.x + b.w * 0.32, b.y + 2);
          ctx.lineTo(b.x + b.w * 0.52, b.y + b.h - 2);
          ctx.stroke();
        }
      }
    }
  }

  function drawDrops() {
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < state.drops.length; i++) {
      var d = state.drops[i];
      ctx.fillStyle = POWER_COLORS[d.kind] || '#8FA88C';
      rrect(d.x, d.y, d.w, d.h, 7);
      ctx.fill();
      ctx.fillStyle = '#FFFDF8';
      ctx.fillText(d.kind, d.x + d.w / 2, d.y + d.h / 2);
    }
  }

  function drawPaddle() {
    ctx.fillStyle = power.wideMs > 0 ? '#6E8E76' : '#7E9B84';
    rrect(paddle.x, paddle.y, paddle.w, paddle.h, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 253, 248, .4)';
    rrect(paddle.x + 3, paddle.y + 2, paddle.w - 6, 3, 2);
    ctx.fill();
  }

  function drawBalls() {
    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      ctx.fillStyle = '#5F6B7A';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 253, 248, .75)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCombo() {
    if (state.combo < 2) return;
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(107, 122, 194, .7)';
    ctx.fillText('x' + state.combo, W / 2, 54);
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#EFE8DA';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(69, 75, 89, .07)';
    ctx.fillRect(0, 68, W, 1);

    drawTopBar();
    drawBricks();
    drawDrops();
    drawPaddle();
    drawBalls();
    drawCombo();
  }

  /* ---------------- 碰撞 ---------------- */

  function circleRect(b, rx, ry, rw, rh) {
    var nx = clamp(b.x, rx, rx + rw);
    var ny = clamp(b.y, ry, ry + rh);
    var dx = b.x - nx;
    var dy = b.y - ny;
    return dx * dx + dy * dy <= b.r * b.r;
  }

  // 按较小的穿透轴翻转速度，并把球推出矩形，避免粘连
  function bounceRect(b, rx, ry, rw, rh) {
    var nx = clamp(b.x, rx, rx + rw);
    var ny = clamp(b.y, ry, ry + rh);
    var dx = b.x - nx;
    var dy = b.y - ny;
    var overlapX = b.r - Math.abs(dx);
    var overlapY = b.r - Math.abs(dy);

    if (overlapX < overlapY) {
      b.vx = Math.abs(b.vx) * (dx < 0 ? -1 : 1);
      b.x += dx < 0 ? -overlapX : overlapX;
    } else {
      b.vy = Math.abs(b.vy) * (dy < 0 ? -1 : 1);
      b.y += dy < 0 ? -overlapY : overlapY;
    }
  }

  function wallHit() {
    sfx('bounce', { gain: 0.5 }, 60);
  }

  function paddleHit(b) {
    var hit = clamp((b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
    // 太靠中间给一点随机偏移，别让球一直垂直来回
    if (Math.abs(hit) < 0.05) hit = Math.random() < 0.5 ? -0.08 : 0.08;
    var angle = hit * 1.05;      // 最大约 ±60°，不是固定 45°
    var sp = ballSpeed();
    b.vx = sp * Math.sin(angle);
    b.vy = -sp * Math.cos(angle);
    b.y = paddle.y - b.r - 0.5;
    state.combo = 0;
    state.comboMs = 0;
    sfx('bounce');
  }

  function addScore(n) {
    state.score += n;
    if (!state.isRecord && state.score > state.bestAtStart) {
      state.isRecord = true;
      sfx('perfect');
    }
    if (state.isRecord) settleBest();
    refreshHud();
  }

  function maybeDrop(br) {
    if (Math.random() >= diffDef().powerRate) return;
    var kinds = ['W', 'M', 'S'];
    state.drops.push({
      x: br.x + br.w / 2 - 13,
      y: br.y + br.h / 2 - 11,
      w: 26,
      h: 22,
      kind: kinds[Math.floor(Math.random() * kinds.length)]
    });
    sfx('drop', null, 80);
  }

  function hitBrick(b) {
    for (var i = 0; i < state.bricks.length; i++) {
      var br = state.bricks[i];
      if (!br.alive || !circleRect(b, br.x, br.y, br.w, br.h)) continue;

      bounceRect(b, br.x, br.y, br.w, br.h);
      br.hp -= 1;
      if (br.hp <= 0) {
        br.alive = false;
        state.combo += 1;
        state.comboMs = COMBO_MS;
        addScore(10 + (state.combo - 1) * 4);   // 连击额外分
        maybeDrop(br);
        if (state.combo >= 3) sfx('combo', { combo: state.combo }, 160);
      }
      sfx('brick', { combo: state.combo }, 40);
      saveState();
      return;   // 一个子步只处理一块砖
    }
  }

  /* ---------------- 道具 ---------------- */

  function syncPaddleWidth() {
    var target = baseW() * (power.wideMs > 0 ? 1.6 : 1);
    if (Math.abs(paddle.w - target) > 0.5) {
      var center = paddle.x + paddle.w / 2;
      paddle.w = target;
      paddle.x = clamp(center - target / 2, 0, W - target);
    }
  }

  function splitBalls() {
    var src = state.balls.slice();
    for (var i = 0; i < src.length; i++) {
      var b = src[i];
      if (b.stuck) {
        b.stuck = false;
        b.vx = ballSpeed() * 0.25;
        b.vy = -ballSpeed() * 0.97;
      }
      for (var k = 0; k < 2; k++) {
        if (state.balls.length >= MAX_BALLS) break;
        var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || ballSpeed();
        var ang = Math.atan2(b.vy, b.vx) + (k === 0 ? 0.4 : -0.4);
        state.balls.push({
          x: b.x, y: b.y,
          vx: sp * Math.cos(ang), vy: sp * Math.sin(ang),
          r: b.r, stuck: false
        });
      }
      if (state.balls.length >= MAX_BALLS) break;
    }
  }

  function collapseBalls() {
    if (state.balls.length <= 1) return;
    var keep = null;
    for (var i = 0; i < state.balls.length; i++) {
      if (!state.balls[i].stuck) { keep = state.balls[i]; break; }
    }
    state.balls = [keep || state.balls[0]];
  }

  function applyPower(kind) {
    if (kind === 'W') power.wideMs = WIDE_MS;
    else if (kind === 'S') power.slowMs = SLOW_MS;
    else if (kind === 'M') { power.multiMs = MULTI_MS; splitBalls(); }
    syncPaddleWidth();   // 立刻同步宽度，别让存档比画面慢一帧
    sfx('powerup');
    saveState(true);
  }

  function updateDrops(dt) {
    for (var i = state.drops.length - 1; i >= 0; i--) {
      var d = state.drops[i];
      d.y += DROP_SPEED * dt / 1000;
      if (d.y > H + 30) { state.drops.splice(i, 1); continue; }
      var caught = d.x + d.w >= paddle.x && d.x <= paddle.x + paddle.w &&
        d.y + d.h >= paddle.y && d.y <= paddle.y + paddle.h;
      if (caught) {
        state.drops.splice(i, 1);
        applyPower(d.kind);
      }
    }
  }

  /* ---------------- 每帧推进 ---------------- */

  function stepBalls(sdt) {
    for (var i = state.balls.length - 1; i >= 0; i--) {
      var b = state.balls[i];
      if (b.stuck) {
        b.x = paddle.x + paddle.w / 2;
        b.y = paddle.y - b.r - 2;
        continue;
      }

      b.x += b.vx * sdt / 1000;
      b.y += b.vy * sdt / 1000;

      // 左右墙 / 顶墙
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); wallHit(); }
      else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); wallHit(); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); wallHit(); }

      // 挡板：只在下落时接球
      if (b.vy > 0 && circleRect(b, paddle.x, paddle.y, paddle.w, paddle.h)) paddleHit(b);

      hitBrick(b);

      // 底边不反弹，球整个越界就算漏球
      if (b.y - b.r > H) state.balls.splice(i, 1);
    }

    if (bricksLeft() === 0) { levelClear(); return; }
    if (state.balls.length === 0) loseLife();
  }

  function update(dt) {
    var move = PADDLE_KEY_SPEED * dt / 1000;
    if (keyLeft) paddle.x -= move;
    if (keyRight) paddle.x += move;

    // 倒计时用真实时间，不受慢速道具影响
    if (power.wideMs > 0) power.wideMs = Math.max(0, power.wideMs - dt);
    if (power.slowMs > 0) power.slowMs = Math.max(0, power.slowMs - dt);
    if (power.multiMs > 0) {
      power.multiMs = Math.max(0, power.multiMs - dt);
      if (power.multiMs === 0) collapseBalls();
    }
    if (state.comboMs > 0) {
      state.comboMs = Math.max(0, state.comboMs - dt);
      if (state.comboMs === 0) state.combo = 0;
    }

    syncPaddleWidth();
    paddle.x = clamp(paddle.x, 0, W - paddle.w);
    updateDrops(dt);

    // 慢速道具通过缩放时间步长实现，不改球速向量
    var eff = dt * (power.slowMs > 0 ? 0.62 : 1);
    var steps = Math.max(1, Math.ceil(eff / 6));
    var sdt = eff / steps;
    for (var s = 0; s < steps; s++) {
      if (state.status !== 'running') break;
      stepBalls(sdt);
    }
  }

  function loop(ts) {
    window.requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(ts - lastTs, 50) : 0;
    lastTs = ts;
    if (state.status === 'running') update(dt);
    draw(ts);
  }

  /* ---------------- 记分板 / 卡片 / 结算 ---------------- */

  function refreshHud() {
    dom.score.textContent = String(state.score);
    dom.lives.textContent = String(state.lives);
    dom.level.textContent = String(state.level);
    dom.best.textContent = String(Math.max(state.bestAtStart, state.isRecord ? state.score : 0));
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
    if (state.status === 'paused') {
      setI18n(dom.btnPause, 'btn_resume');
      dom.btnPause.disabled = false;
    } else {
      setI18n(dom.btnPause, 'btn_pause');
      dom.btnPause.disabled = (state.status !== 'running');
    }
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

  // 只负责填充结算卡片内容，切语言时也会复用（副标题带占位符，要自己 tf）
  function renderResult() {
    var cfg;
    if (state.status === 'levelclear') cfg = { title: 'level_clear_title', sub: 'level_clear_sub' };
    else if (state.status === 'gameover') cfg = { title: 'gameover_title', sub: 'gameover_sub' };
    else cfg = { title: 'win_title', sub: 'win_sub' };

    setI18n(dom.overlayTitle, cfg.title);
    dom.overlaySub.textContent = tf(cfg.sub, { score: state.score, level: state.level });
    dom.overlayScore.textContent = String(state.score);
    dom.overlayLevel.textContent = String(state.level);
    dom.recordBadge.hidden = !state.isRecord;
    dom.overlay.hidden = false;
  }

  function showResult() {
    hideCard();
    renderResult();
    if (typeof dom.overlay.scrollIntoView === 'function') {
      dom.overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ---------------- 开局 / 状态切换 ---------------- */

  function resetServe() {
    state.balls = [makeBall(true)];
    power.multiMs = 0;
    state.drops = [];
    state.combo = 0;
    state.comboMs = 0;
    state.status = 'ready';
    showCard('ready');
    syncButtons();
    refreshHud();
  }

  function newGame() {
    state.score = 0;
    state.lives = START_LIVES;
    state.level = 1;
    state.combo = 0;
    state.comboMs = 0;
    state.isRecord = false;
    state.bestAtStart = bestOf(state.diff);
    power.wideMs = 0;
    power.slowMs = 0;
    power.multiMs = 0;
    state.drops = [];
    buildBricks();
    paddle.w = baseW();
    paddle.x = (W - paddle.w) / 2;
    state.balls = [makeBall(true)];
    state.status = 'ready';
    hideOverlay();
    showCard('ready');
    syncButtons();
    refreshHud();
    saveState(true);
  }

  function launch() {
    if (state.status !== 'ready') return;
    var sp = ballSpeed();
    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      if (!b.stuck) continue;
      b.stuck = false;
      b.vx = sp * (Math.random() * 0.4 - 0.2);
      b.vy = -sp;
      var m = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || sp;
      b.vx = b.vx / m * sp;
      b.vy = b.vy / m * sp;
    }
    state.status = 'running';
    hideCard();
    syncButtons();
    sfx('start');
    saveState(true);
  }

  function pause() {
    if (state.status !== 'running') return;
    state.status = 'paused';
    showCard('pause');
    syncButtons();
    saveState(true);
  }

  function resume() {
    if (state.status !== 'paused') return;
    state.status = 'running';
    hideCard();
    syncButtons();
    saveState(true);
  }

  function loseLife() {
    state.lives -= 1;
    state.combo = 0;
    state.comboMs = 0;
    state.drops = [];
    sfx('lose');
    if (state.lives <= 0) {
      state.lives = 0;
      state.status = 'gameover';
      settleBest();
      showResult();
    } else {
      if (state.lives === 1) sfx('warn');
      resetServe();
    }
    saveState(true);
  }

  function levelClear() {
    if (state.status !== 'running') return;
    if (state.level >= MAX_LEVEL) {
      state.status = 'win';
      sfx('win');
    } else {
      state.status = 'levelclear';
      sfx('levelup');
    }
    settleBest();
    showResult();
    saveState(true);
  }

  function nextLevel() {
    if (state.level >= MAX_LEVEL) { newGame(); return; }
    state.level += 1;
    buildBricks();
    hideOverlay();
    resetServe();
    saveState(true);
  }

  function switchDiff(diff) {
    if (!DIFFS[diff] || diff === state.diff) return;
    var inProgress = (state.status === 'running' || state.status === 'paused' || state.status === 'ready') &&
      (state.score > 0 || state.level > 1 || state.lives < START_LIVES);
    if (inProgress && !window.confirm(t('confirm_diff'))) return;

    saveState(true);                 // 先存好当前难度，隔离到各自的槽
    state.diff = diff;
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) {}
    syncDiffs();
    sfx('toggle');
    if (!loadState()) newGame();     // 目标难度有断点就续玩，否则开新局
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    var bricks = [];
    for (var i = 0; i < state.bricks.length; i++) {
      var b = state.bricks[i];
      bricks.push({ x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp, maxHp: b.maxHp, ci: b.ci, alive: b.alive });
    }
    var balls = [];
    for (var j = 0; j < state.balls.length; j++) {
      var q = state.balls[j];
      balls.push({ x: q.x, y: q.y, vx: q.vx, vy: q.vy, r: q.r, stuck: q.stuck });
    }
    var drops = [];
    for (var k = 0; k < state.drops.length; k++) {
      var d = state.drops[k];
      drops.push({ x: d.x, y: d.y, w: d.w, h: d.h, kind: d.kind });
    }
    return {
      score: state.score, lives: state.lives, level: state.level,
      status: state.status, combo: state.combo, comboMs: state.comboMs,
      isRecord: state.isRecord,
      bricks: bricks, balls: balls, drops: drops,
      paddle: { x: paddle.x, w: paddle.w },
      power: { wideMs: power.wideMs, slowMs: power.slowMs, multiMs: power.multiMs }
    };
  }

  // 高频事件（打砖）做 120ms 节流，关键事件传 force=true
  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 120) return;
    lastSave = now;

    var root = readJSON(KEY_STATE, null);
    if (!root || root.v !== STATE_V || !root.data ||
        typeof root.data !== 'object' || Array.isArray(root.data)) {
      root = { v: STATE_V, data: {} };
    }
    root.data[state.diff] = snapshot();
    writeJSON(KEY_STATE, root);
  }

  function loadState() {
    var root = readJSON(KEY_STATE, null);
    if (!root || root.v !== STATE_V || !root.data || typeof root.data !== 'object') return false;
    var s = root.data[state.diff];
    if (!s || typeof s !== 'object') return false;
    if (!Array.isArray(s.bricks) || !Array.isArray(s.balls)) return false;
    if (typeof s.score !== 'number' || typeof s.lives !== 'number' || typeof s.level !== 'number') return false;
    if (s.level < 1 || s.level > MAX_LEVEL || s.lives < 0 || s.lives > START_LIVES) return false;
    if (!s.bricks.length || !s.balls.length) return false;

    state.score = Math.max(0, Math.floor(s.score));
    state.lives = s.lives;
    state.level = s.level;
    state.combo = typeof s.combo === 'number' ? s.combo : 0;
    state.comboMs = typeof s.comboMs === 'number' ? s.comboMs : 0;
    state.isRecord = !!s.isRecord;
    state.bestAtStart = bestOf(state.diff);

    state.bricks = [];
    for (var i = 0; i < s.bricks.length; i++) {
      var b = s.bricks[i];
      if (!b || typeof b.x !== 'number' || typeof b.y !== 'number' ||
          typeof b.w !== 'number' || typeof b.h !== 'number' || typeof b.hp !== 'number') return false;
      state.bricks.push({
        x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp,
        maxHp: b.maxHp === 2 ? 2 : 1,
        ci: typeof b.ci === 'number' ? b.ci : 0,
        alive: b.alive !== false
      });
    }

    paddle.w = baseW();
    var p = (s.paddle && typeof s.paddle === 'object') ? s.paddle : null;
    paddle.x = (p && typeof p.x === 'number') ? clamp(p.x, 0, W - paddle.w) : (W - paddle.w) / 2;

    var pw = (s.power && typeof s.power === 'object') ? s.power : {};
    power.wideMs = typeof pw.wideMs === 'number' ? pw.wideMs : 0;
    power.slowMs = typeof pw.slowMs === 'number' ? pw.slowMs : 0;
    power.multiMs = typeof pw.multiMs === 'number' ? pw.multiMs : 0;
    syncPaddleWidth();

    state.balls = [];
    for (var j = 0; j < s.balls.length; j++) {
      var q = s.balls[j];
      if (!q || typeof q.x !== 'number' || typeof q.y !== 'number') return false;
      state.balls.push({
        x: q.x, y: q.y,
        vx: typeof q.vx === 'number' ? q.vx : 0,
        vy: typeof q.vy === 'number' ? q.vy : -ballSpeed(),
        r: BALL_R, stuck: !!q.stuck
      });
    }

    state.drops = [];
    if (Array.isArray(s.drops)) {
      for (var k = 0; k < s.drops.length; k++) {
        var d = s.drops[k];
        if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
        if (d.kind !== 'W' && d.kind !== 'M' && d.kind !== 'S') continue;
        state.drops.push({ x: d.x, y: d.y, w: 26, h: 22, kind: d.kind });
      }
    }

    var st = s.status;
    if (st === 'levelclear' || st === 'gameover' || st === 'win') {
      state.status = st;
      showResult();
    } else {
      var flying = false;
      for (var m = 0; m < state.balls.length; m++) {
        if (!state.balls[m].stuck) { flying = true; break; }
      }
      state.status = flying ? 'paused' : 'ready';
      hideOverlay();
      showCard(flying ? 'pause' : 'ready');
    }
    syncButtons();
    refreshHud();
    return true;
  }

  /* ---------------- 输入 ---------------- */

  function movePaddleTo(clientX) {
    var rect = dom.canvas.getBoundingClientRect();
    if (!rect.width) return;
    var lx = (clientX - rect.left) / rect.width * W;
    paddle.x = clamp(lx - paddle.w / 2, 0, W - paddle.w);
  }

  function bindInput() {
    // 鼠标 / 手指移动挡板
    dom.canvas.addEventListener('pointermove', function (e) {
      movePaddleTo(e.clientX);
    });

    // 触屏按下即发射 / 继续；同时把挡板挪到触点
    dom.canvas.addEventListener('pointerdown', function (e) {
      movePaddleTo(e.clientX);
      if (state.status === 'ready') launch();
      else if (state.status === 'paused') resume();
    });

    // 点一下也能开始（兼容不支持 pointerdown 的环境）
    dom.canvas.addEventListener('click', function () {
      if (state.status === 'ready') launch();
    });

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var key = e.key;
      var tag = e.target && e.target.tagName;

      if (key === ' ' || key === 'Spacebar') {
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;
        e.preventDefault();
        if (state.status === 'running') pause();
        else if (state.status === 'paused') resume();
        else if (state.status === 'ready') launch();
        return;
      }
      if (key === 'p' || key === 'P') {
        if (state.status === 'running') pause();
        else if (state.status === 'paused') resume();
        return;
      }
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        keyLeft = true; e.preventDefault();
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        keyRight = true; e.preventDefault();
      }
    });

    document.addEventListener('keyup', function (e) {
      var key = e.key;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') keyLeft = false;
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') keyRight = false;
    });

    window.addEventListener('blur', function () {
      keyLeft = false;
      keyRight = false;
    });

    dom.btnStart.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'paused') resume();
      else if (state.status === 'ready') launch();
    });

    dom.btnPause.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'running') pause();
      else if (state.status === 'paused') resume();
    });

    dom.btnRestart.addEventListener('click', function () {
      sfx('click');
      newGame();
    });

    dom.btnAgain.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'levelclear') nextLevel();
      else newGame();
    });

    dom.diffs.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
      if (!btn || !dom.diffs.contains(btn)) return;
      switchDiff(btn.getAttribute('data-diff'));
    });

    dom.overlay.addEventListener('click', function (e) {
      if (e.target === dom.overlay) hideOverlay();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.status === 'running') pause();
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
      lives: document.getElementById('lives'),
      level: document.getElementById('level'),
      best: document.getElementById('best'),
      diffs: document.getElementById('diffs'),
      btnPause: document.getElementById('btn-pause'),
      btnRestart: document.getElementById('btn-restart'),
      btnStart: document.getElementById('btn-start'),
      btnAgain: document.getElementById('btn-again'),
      card: document.getElementById('card'),
      cardTitle: document.getElementById('card-title'),
      cardSub: document.getElementById('card-sub'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlaySub: document.getElementById('overlay-sub'),
      overlayScore: document.getElementById('overlay-score'),
      overlayLevel: document.getElementById('overlay-level'),
      recordBadge: document.getElementById('record-badge')
    };

    var savedDiff = null;
    try { savedDiff = window.localStorage.getItem(KEY_DIFF); } catch (e) {}
    if (savedDiff && DIFFS[savedDiff]) state.diff = savedDiff;

    ensureBest();
    state.bestAtStart = bestOf(state.diff);
    syncDiffs();
    if (!loadState()) newGame();

    fitCanvas();
    bindInput();
    window.requestAnimationFrame(loop);

    // 静态文案由 I18N 重绘；卡片、暂停按钮、带占位符的结算副标题要自己补
    document.addEventListener('ys:langchange', function () {
      syncDiffs();
      syncButtons();
      if (!dom.card.hidden) showCard(dom.card.dataset.kind || 'ready');
      if (!dom.overlay.hidden) renderResult();
      refreshHud();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
