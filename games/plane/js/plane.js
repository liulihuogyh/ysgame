/* ==========================================================================
   星际飞机大战（Star Fighter）· 游戏逻辑
   - canvas 绘制，固定逻辑坐标系 420×640（竖屏），按 devicePixelRatio 缩放
   - 玩家飞机在底部，自动开火（节流发射）；方向键 / WASD / 拖动控制
   - 敌机编队俯冲、发射弹幕（向下）；清完一波进入下一波（levelup 音）
   - 道具掉落：P=火力升级 / S=护盾 / W=僚机
   - 三档难度真正拉开：敌机速度 / 弹幕密度 / 道具频率 / 敌人血量 / 射速
   - 自动存档（按难度隔离）、断点续玩，best 写 ysgame-plane-best
   - 统一走全站音效引擎 window.YSound.play
   [gyh 2026-11-08 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var W = 420;                 // 逻辑宽
  var H = 640;                 // 逻辑高
  var STATE_V = 1;
  var START_LIVES = 3;

  var PW = 38;                 // 玩家飞机宽
  var PH = 30;                 // 玩家飞机高
  var PLAYER_MIN_Y = H * 0.5;  // 玩家可活动上方边界
  var PLAYER_MAX_Y = H - 34;   // 玩家可活动下方边界
  var PLAYER_KEY_SPEED = 320;  // 键盘移动速度（逻辑像素/秒）
  var PLAYER_BULLET_SPEED = 540;

  var E_W = 30;                // 敌机宽
  var E_H = 26;                // 敌机高

  var DROP_SPEED = 130;        // 道具下落速度
  var SHIELD_MS = 6000;        // 护盾持续时间
  var INVULN_MS = 1500;        // 掉命后短暂无敌（重新部署）
  var MAX_EBULLETS = 150;      // 敌弹上限，避免困难档卡顿
  var MAX_PARTICLES = 140;

  var KEY_STATE = 'ysgame-plane-state';
  var KEY_BEST = 'ysgame-plane-best';
  var KEY_DIFF = 'ysgame-plane-diff';

  // [gyh 2026-11-08 新增] 三档：敌机速度 / 弹幕密度 / 道具频率 / 敌人血量 / 玩家射速
  var DIFF = {
    // 简单：敌机慢、弹幕稀疏（单发/慢）、道具频繁、玩家子弹强、敌人血量低
    easy: {
      enemySpeed: 58, enemyFireRate: 1500, bulletDensity: 1, powerupRate: 0.46,
      playerFireRate: 240, enemyHp: 1, waveBase: 7, eBulletSpeed: 150
    },
    // 中等：敌机中速、弹幕中等（偶尔多发）
    medium: {
      enemySpeed: 100, enemyFireRate: 950, bulletDensity: 2, powerupRate: 0.22,
      playerFireRate: 300, enemyHp: 2, waveBase: 9, eBulletSpeed: 215
    },
    // 困难：敌机快、弹幕密集（扇形/交叉多发，接近弹幕地狱但可躲）、道具稀少、敌人血量高、射速高
    hard: {
      enemySpeed: 150, enemyFireRate: 540, bulletDensity: 3, powerupRate: 0.12,
      playerFireRate: 360, enemyHp: 3, waveBase: 11, eBulletSpeed: 300
    }
  };

  // 低饱和几何像素配色（莫兰迪调，科幻但不刺眼）
  var ENEMY_COLORS = ['#C9A0A8', '#A8B9A2', '#B3AEC6', '#C9B48C', '#B7A6C2'];
  var POWER_COLOR = { P: '#8FA88C', S: '#8FA6B8', W: '#B08AAE' };

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium',
    status: 'ready',   // ready | running | paused | gameover
    score: 0,
    lives: START_LIVES,
    wave: 1,
    isRecord: false,
    bestAtStart: 0,
    betweenWaves: false,
    nextWave: 1
  };

  // 玩家飞机（几何中心）
  var player = {
    x: W / 2, y: H - 70,
    fireLevel: 0,   // 0..3
    wingmen: 0,     // 0..2
    shieldMs: 0,
    invulnMs: 0,
    fireT: 0
  };

  var enemies = [];
  var pBullets = [];   // 玩家子弹
  var eBullets = [];   // 敌弹
  var drops = [];      // 掉落道具
  var particles = [];
  var stars = [];
  var banner = { ms: 0, title: '', sub: '' };

  var dom = {};
  var ctx = null;
  var lastTs = 0;
  var lastSave = 0;
  var lastSfx = {};
  var pointerActive = false;
  var pointerTX = W / 2, pointerTY = H - 70;

  var keyState = { up: false, down: false, left: false, right: false };

  /* ---------------- 小工具 ---------------- */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  // 字典里的 {wave}/{score} 占位符，用 split/join 替换
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

  function nowMs() {
    return (window.performance && window.performance.now)
      ? window.performance.now() : Date.now();
  }

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

  function ensureBest() {
    var b = readJSON(KEY_BEST, null);
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      writeJSON(KEY_BEST, { easy: 0, medium: 0, hard: 0 });
    }
  }

  /* ---------------- 星空背景 ---------------- */

  function initStars() {
    stars = [];
    for (var i = 0; i < 70; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.4,
        sp: Math.random() * 22 + 8,
        ph: Math.random() * Math.PI * 2
      });
    }
  }

  function updateStars(dt) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.y += s.sp * dt / 1000;
      if (s.y > H + 2) { s.y = -2; s.x = Math.random() * W; }
    }
  }

  /* ---------------- 波次 / 敌机 ---------------- */

  function spawnWave(n) {
    var d = diffDef();
    var count = d.waveBase + Math.floor((n - 1) * 1.2);
    count = Math.min(count, 22);

    var speedK = Math.min(1.5, 1 + (n - 1) * 0.045);
    var hpK = d.enemyHp + Math.floor((n - 1) / 4);

    // 排成几行的编队，从顶部进入
    var cols = Math.min(6 + Math.floor(n / 3), 9);
    var rows = Math.ceil(count / cols);
    var gapX = 12;
    var cellW = (W - 40) / cols;
    var startY = -E_H;

    var made = 0;
    for (var r = 0; r < rows && made < count; r++) {
      for (var c = 0; c < cols && made < count; c++) {
        var cx = 20 + cellW * (c + 0.5) + (Math.random() * 6 - 3);
        var cy = startY - r * (E_H + 16);
        enemies.push({
          x: cx,
          y: cy,
          vx: (Math.random() < 0.5 ? -1 : 1) * d.enemySpeed * 0.7 * speedK,
          vy: d.enemySpeed * 0.4 * speedK,
          hp: hpK,
          maxHp: hpK,
          ci: made % ENEMY_COLORS.length,
          fireT: 600 + Math.random() * d.enemyFireRate,
          phase: Math.random() * Math.PI * 2,
          amp: 14 + Math.random() * 22,
          diveT: 1500 + Math.random() * 2500
        });
        made++;
      }
    }
  }

  function startWave(n) {
    state.wave = n;
    state.betweenWaves = false;
    banner.ms = 0;
    spawnWave(n);
    refreshHud();
  }

  function clearWave() {
    if (state.betweenWaves) return;
    state.betweenWaves = true;
    state.nextWave = state.wave + 1;
    var bonus = 200 + state.wave * 50;
    addScore(bonus);
    banner.ms = 1700;
    banner.title = t('win_title');
    banner.sub = tf('win_sub', { wave: state.wave, score: state.score });
    sfx('levelup');
  }

  function addScore(n) {
    state.score += n;
    if (!state.isRecord && state.score > state.bestAtStart) {
      state.isRecord = true;
      sfx('record');
    }
    if (state.isRecord) settleBest();
    refreshHud();
  }

  /* ---------------- 子弹 ---------------- */

  function fireBullet(x, y, vx, vy) {
    pBullets.push({ x: x, y: y, vx: vx, vy: vy, r: 3 });
  }

  function fireFrom(x, y, level) {
    var sp = PLAYER_BULLET_SPEED;
    if (level <= 0) {
      fireBullet(x, y, 0, -sp);
    } else if (level === 1) {
      fireBullet(x - 7, y, 0, -sp);
      fireBullet(x + 7, y, 0, -sp);
    } else {
      fireBullet(x, y, 0, -sp);
      fireBullet(x, y, -sp * 0.22, -sp * 0.97);
      fireBullet(x, y, sp * 0.22, -sp * 0.97);
    }
  }

  function firePlayer() {
    var rate = diffDef().playerFireRate;
    if (player.fireLevel >= 3) rate = Math.round(rate * 0.66);
    player.fireT -= 1;
    if (player.fireT > 0) return;
    player.fireT = rate;
    fireFrom(player.x, player.y - PH / 2, player.fireLevel);
    if (player.wingmen >= 1) fireFrom(player.x - 26, player.y, player.fireLevel === 0 ? 0 : 1);
    if (player.wingmen >= 2) fireFrom(player.x + 26, player.y, player.fireLevel === 0 ? 0 : 1);
    sfx('click', null, 70);
  }

  function enemyFire(e) {
    if (eBullets.length >= MAX_EBULLETS) return;
    if (e.y < 0 || e.y > H * 0.82) return;
    var d = diffDef();
    var sp = d.eBulletSpeed;
    var density = d.bulletDensity;

    if (density === 1) {
      // 单发直下
      eBullets.push({ x: e.x, y: e.y + E_H / 2, vx: 0, vy: sp, r: 3.5 });
    } else {
      var ang = Math.atan2(player.y - e.y, player.x - e.x);
      var spread = density === 2 ? 0.16 : 0.13;
      var n = density === 2 ? 2 : 5;
      for (var i = 0; i < n; i++) {
        var a = ang + (i - (n - 1) / 2) * spread;
        eBullets.push({
          x: e.x, y: e.y + E_H / 2,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3.5
        });
      }
    }
  }

  /* ---------------- 道具 ---------------- */

  function maybeDropPower(x, y) {
    if (Math.random() >= diffDef().powerupRate) return;
    var r = Math.random();
    var kind = r < 0.45 ? 'P' : (r < 0.72 ? 'S' : 'W');
    drops.push({ x: x, y: y, w: 22, h: 22, kind: kind });
  }

  function applyPower(kind) {
    if (kind === 'P') player.fireLevel = Math.min(3, player.fireLevel + 1);
    else if (kind === 'S') player.shieldMs = SHIELD_MS;
    else if (kind === 'W') player.wingmen = Math.min(2, player.wingmen + 1);
    sfx('powerup');
  }

  /* ---------------- 粒子 ---------------- */

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      if (particles.length >= MAX_PARTICLES) break;
      var a = Math.random() * Math.PI * 2;
      var sp = Math.random() * 160 + 40;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 420 + Math.random() * 260, max: 680,
        r: Math.random() * 2.4 + 1, color: color
      });
    }
  }

  /* ---------------- 碰撞 ---------------- */

  function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  function circleRect(cx, cy, cr, rx, ry, rw, rh) {
    var nx = clamp(cx, rx, rx + rw);
    var ny = clamp(cy, ry, ry + rh);
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= cr * cr;
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

  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0E1430');
    g.addColorStop(1, '#1A1F46');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(nowMs() / 600 + s.ph));
      ctx.globalAlpha = 0.35 + 0.5 * tw;
      ctx.fillStyle = '#CFE0F2';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayerShip(cx, cy, color, scale) {
    scale = scale || 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // 机翼
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-PW / 2, PH / 2);
    ctx.lineTo(-PW / 6, -PH / 4);
    ctx.lineTo(PW / 6, -PH / 4);
    ctx.lineTo(PW / 2, PH / 2);
    ctx.closePath();
    ctx.fill();

    // 机身
    ctx.fillStyle = '#EAF6FB';
    ctx.beginPath();
    ctx.moveTo(0, -PH / 2);
    ctx.lineTo(PW / 5, PH / 3);
    ctx.lineTo(-PW / 5, PH / 3);
    ctx.closePath();
    ctx.fill();

    // 座舱
    ctx.fillStyle = '#5FB6D6';
    ctx.beginPath();
    ctx.arc(0, -PH / 8, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawEnemyShip(e) {
    var cx = e.x, cy = e.y;
    var col = ENEMY_COLORS[e.ci % ENEMY_COLORS.length];
    ctx.save();
    ctx.translate(cx, cy);

    // 倒三角机身（朝向玩家）
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, E_H / 2);
    ctx.lineTo(E_W / 2, -E_H / 3);
    ctx.lineTo(-E_W / 2, -E_H / 3);
    ctx.closePath();
    ctx.fill();

    // 机翼
    ctx.fillStyle = '#EAEFF6';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-E_W / 2, -E_H / 6, E_W, 4);
    ctx.globalAlpha = 1;

    // 核心（血量越高越亮）
    ctx.fillStyle = e.hp < e.maxHp ? '#EAF6FB' : '#F3D9C0';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawBullets() {
    ctx.save();
    // 玩家子弹（青色上行）
    ctx.fillStyle = '#BFE9F2';
    for (var i = 0; i < pBullets.length; i++) {
      var b = pBullets[i];
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r, b.r * 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 敌弹（暖色下行）
    ctx.fillStyle = '#E8B0A0';
    for (var j = 0; j < eBullets.length; j++) {
      var e = eBullets[j];
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(232,176,160,.35)';
      ctx.beginPath();
      ctx.arc(e.x, e.y - e.vy * 0.012, e.r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#E8B0A0';
    }
    ctx.restore();
  }

  function drawDrops() {
    ctx.save();
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      ctx.fillStyle = POWER_COLOR[d.kind] || '#8FA88C';
      ctx.beginPath();
      var r = 11;
      var x = d.x, y = d.y;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFDF8';
      ctx.fillText(d.kind, x, y + 0.5);
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    // 护盾环
    if (player.shieldMs > 0) {
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(nowMs() / 120);
      ctx.strokeStyle = '#9FD8EC';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PW / 2 + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // 短暂无敌闪烁
    var blink = player.invulnMs > 0 && (Math.floor(nowMs() / 120) % 2 === 0);
    if (!blink) {
      drawPlayerShip(player.x, player.y, '#8FD3E8');
      // 引擎尾焰
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#F3C98C';
      var fl = 4 + Math.random() * 4;
      ctx.beginPath();
      ctx.moveTo(player.x - 3, player.y + PH / 3);
      ctx.lineTo(player.x, player.y + PH / 3 + fl);
      ctx.lineTo(player.x + 3, player.y + PH / 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTopHud() {
    // 火力 / 护盾 / 僚机 状态条
    var chips = [];
    if (player.fireLevel > 0) chips.push({ t: 'P' + player.fireLevel, c: POWER_COLOR.P });
    if (player.shieldMs > 0) chips.push({ t: 'S' + Math.ceil(player.shieldMs / 1000), c: POWER_COLOR.S });
    if (player.wingmen > 0) chips.push({ t: 'W' + player.wingmen, c: POWER_COLOR.W });

    ctx.save();
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    var x = 12;
    for (var i = 0; i < chips.length; i++) {
      ctx.fillStyle = chips[i].c;
      ctx.beginPath();
      ctx.arc(x + 9, 18, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFDF8';
      ctx.textAlign = 'center';
      ctx.fillText(chips[i].t, x + 9, 19);
      x += 26;
    }
    ctx.restore();
  }

  function drawBanner() {
    if (banner.ms <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, banner.ms / 400);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#EAF6FB';
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(banner.title, W / 2, H / 2 - 14);
    ctx.font = '500 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#B7C6E0';
    ctx.fillText(banner.sub, W / 2, H / 2 + 14);
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    drawBackground();

    if (state.status === 'running' || state.status === 'paused' || state.status === 'gameover') {
      drawParticles();
      drawDrops();
      for (var i = 0; i < enemies.length; i++) drawEnemyShip(enemies[i]);
      drawBullets();
      if (state.status !== 'gameover') drawPlayer();
      drawTopHud();
      drawBanner();
      // 僚机（仅显示）
      if (state.status !== 'gameover' && player.wingmen > 0) {
        if (player.wingmen >= 1) drawPlayerShip(player.x - 26, player.y, '#7FC2DA', 0.8);
        if (player.wingmen >= 2) drawPlayerShip(player.x + 26, player.y, '#7FC2DA', 0.8);
      }
    } else {
      drawParticles();
    }
  }

  /* ---------------- 每帧推进 ---------------- */

  function updatePlayer(dt) {
    var sdt = dt;
    if (pointerActive) {
      player.x += (pointerTX - player.x) * Math.min(1, sdt / 60);
      player.y += (pointerTY - player.y) * Math.min(1, sdt / 60);
    } else {
      var dx = 0, dy = 0;
      if (keyState.left) dx -= 1;
      if (keyState.right) dx += 1;
      if (keyState.up) dy -= 1;
      if (keyState.down) dy += 1;
      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
      player.x += dx * PLAYER_KEY_SPEED * sdt / 1000;
      player.y += dy * PLAYER_KEY_SPEED * sdt / 1000;
    }
    player.x = clamp(player.x, PW / 2, W - PW / 2);
    player.y = clamp(player.y, PLAYER_MIN_Y, PLAYER_MAX_Y);

    if (player.shieldMs > 0) player.shieldMs = Math.max(0, player.shieldMs - dt);
    if (player.invulnMs > 0) player.invulnMs = Math.max(0, player.invulnMs - dt);
  }

  function moveEnemies(dt) {
    var d = diffDef();
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      var sdt = dt / 1000;
      // 编队横移 + 缓慢下压
      e.x += e.vx * sdt;
      e.y += e.vy * sdt + Math.sin(nowMs() / 500 + e.phase) * e.amp * sdt * 0.4;

      // 撞墙反弹
      if (e.x < E_W / 2) { e.x = E_W / 2; e.vx = Math.abs(e.vx); }
      else if (e.x > W - E_W / 2) { e.x = W - E_W / 2; e.vx = -Math.abs(e.vx); }

      // 偶尔俯冲：朝玩家方向加速下压
      e.diveT -= dt;
      if (e.diveT <= 0) {
        e.diveT = 2000 + Math.random() * 2500;
        if (e.y > 0 && e.y < H * 0.55) {
          e.vy = d.enemySpeed * 1.3;
          e.vx += (player.x - e.x) * 0.6;
        }
      }
      // 下压速度缓慢回落到巡航值
      var cruise = d.enemySpeed * 0.4;
      if (e.vy > cruise) e.vy = Math.max(cruise, e.vy - d.enemySpeed * 0.6 * sdt);

      // 越过底部：飞出战场，移除（不扣命，靠弹幕/撞击施压）
      if (e.y > H + E_H) { enemies.splice(i, 1); continue; }

      // 开火
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = d.enemyFireRate * (0.6 + Math.random() * 0.8) * Math.max(0.55, 1 - (state.wave - 1) * 0.03);
        enemyFire(e);
      }

      // 撞机：与玩家矩形相交
      if (state.status === 'running' &&
          pointInRect(e.x, e.y, player.x - PW / 2, player.y - PH / 2, PW, PH)) {
        enemies.splice(i, 1);
        burst(e.x, e.y, ENEMY_COLORS[e.ci % ENEMY_COLORS.length], 10);
        hitPlayer();
      }
    }

    if (enemies.length === 0 && !state.betweenWaves && state.status === 'running') {
      clearWave();
    }
  }

  function moveBullets(dt) {
    var sdt = dt / 1000;
    var i;
    // 玩家子弹上行
    for (i = pBullets.length - 1; i >= 0; i--) {
      var b = pBullets[i];
      b.x += b.vx * sdt;
      b.y += b.vy * sdt;
      if (b.y < -10 || b.x < -10 || b.x > W + 10) { pBullets.splice(i, 1); continue; }
      // 命中敌机
      var hit = false;
      for (var j = enemies.length - 1; j >= 0; j--) {
        var e = enemies[j];
        if (circleRect(b.x, b.y, b.r, e.x - E_W / 2, e.y - E_H / 2, E_W, E_H)) {
          e.hp -= 1;
          burst(b.x, b.y, '#CFE0F2', 4);
          pBullets.splice(i, 1);
          hit = true;
          if (e.hp <= 0) {
            enemies.splice(j, 1);
            burst(e.x, e.y, ENEMY_COLORS[e.ci % ENEMY_COLORS.length], 12);
            addScore(120);
            maybeDropPower(e.x, e.y);
            sfx('coin');
          }
          break;
        }
      }
      if (hit) continue;
    }

    // 敌弹下行
    for (i = eBullets.length - 1; i >= 0; i--) {
      var eb = eBullets[i];
      eb.x += eb.vx * sdt;
      eb.y += eb.vy * sdt;
      if (eb.y > H + 10 || eb.y < -10 || eb.x < -10 || eb.x > W + 10) {
        eBullets.splice(i, 1); continue;
      }
      if (state.status === 'running' &&
          circleRect(eb.x, eb.y, eb.r, player.x - PW / 2, player.y - PH / 2, PW, PH)) {
        eBullets.splice(i, 1);
        hitPlayer();
      }
    }
  }

  function moveDrops(dt) {
    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      d.y += DROP_SPEED * dt / 1000;
      if (d.y > H + 20) { drops.splice(i, 1); continue; }
      if (pointInRect(d.x, d.y, player.x - PW / 2, player.y - PH / 2, PW, PH)) {
        drops.splice(i, 1);
        applyPower(d.kind);
      }
    }
  }

  function moveParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function hitPlayer() {
    if (player.shieldMs > 0 || player.invulnMs > 0) return;
    state.lives -= 1;
    player.shieldMs = 0;
    player.fireLevel = 0;
    player.wingmen = 0;
    player.invulnMs = INVULN_MS;
    burst(player.x, player.y, '#8FD3E8', 16);
    sfx('boom');
    if (state.lives <= 0) {
      state.lives = 0;
      gameOver();
    }
    refreshHud();
    saveState(true);
  }

  function update(dt) {
    updateStars(dt);
    if (state.status !== 'running') { moveParticles(dt); return; }

    // 波次之间的过场
    if (state.betweenWaves) {
      banner.ms -= dt;
      moveDrops(dt);
      moveBullets(dt);
      moveParticles(dt);
      updatePlayer(dt);
      if (banner.ms <= 0) startWave(state.nextWave);
      return;
    }

    // 自动开火
    firePlayer();
    moveEnemies(dt);
    moveBullets(dt);
    moveDrops(dt);
    moveParticles(dt);
    updatePlayer(dt);

    // 节流存档
    var now = Date.now();
    if (now - lastSave > 600) { lastSave = now; saveState(false); }
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
    dom.lives.textContent = String(state.lives);
    dom.wave.textContent = String(state.wave);
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
    if (state.status === 'paused') setI18n(dom.btnPause, 'btn_resume');
    else setI18n(dom.btnPause, 'btn_pause');
    dom.btnPause.disabled = (state.status !== 'running' && state.status !== 'paused');
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

  function renderResult() {
    setI18n(dom.overlayTitle, 'lose_title');
    dom.overlaySub.textContent = tf('lose_sub', { wave: state.wave, score: state.score });
    dom.overlayScore.textContent = String(state.score);
    dom.overlayWave.textContent = String(state.wave);
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

  function newGame() {
    state.score = 0;
    state.lives = START_LIVES;
    state.wave = 1;
    state.isRecord = false;
    state.betweenWaves = false;
    state.bestAtStart = bestOf(state.diff);

    player.x = W / 2; player.y = H - 70;
    player.fireLevel = 0; player.wingmen = 0;
    player.shieldMs = 0; player.invulnMs = 0; player.fireT = 0;

    enemies = []; pBullets = []; eBullets = []; drops = []; particles = [];
    banner.ms = 0;

    state.status = 'ready';
    hideOverlay();
    showCard('ready');
    syncButtons();
    refreshHud();
    saveState(true);
  }

  function start() {
    if (state.status !== 'ready') return;
    state.status = 'running';
    hideCard();
    startWave(1);
    player.fireT = 0;
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

  function gameOver() {
    state.status = 'gameover';
    settleBest();
    sfx('lose');
    showResult();
    saveState(true);
  }

  function restart() {
    newGame();
  }

  function switchDiff(diff) {
    if (!DIFF[diff] || diff === state.diff) return;
    var inProgress = (state.status === 'running' || state.status === 'paused' || state.status === 'ready') &&
      (state.score > 0 || state.wave > 1 || state.lives < START_LIVES);
    if (inProgress && !window.confirm(t('confirm_diff'))) return;

    saveState(true);
    state.diff = diff;
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) {}
    syncDiffs();
    sfx('toggle');
    if (!loadState()) newGame();
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    var ens = [];
    var i;
    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      ens.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, hp: e.hp, maxHp: e.maxHp,
        ci: e.ci, fireT: e.fireT, phase: e.phase, amp: e.amp, diveT: e.diveT });
    }
    var pbs = [];
    for (i = 0; i < pBullets.length; i++) {
      var b = pBullets[i];
      pbs.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r });
    }
    var ebs = [];
    for (i = 0; i < eBullets.length; i++) {
      var eb = eBullets[i];
      ebs.push({ x: eb.x, y: eb.y, vx: eb.vx, vy: eb.vy, r: eb.r });
    }
    var drs = [];
    for (i = 0; i < drops.length; i++) {
      var d = drops[i];
      drs.push({ x: d.x, y: d.y, kind: d.kind });
    }
    return {
      score: state.score, lives: state.lives, wave: state.wave,
      status: state.status, isRecord: state.isRecord,
      betweenWaves: state.betweenWaves, nextWave: state.nextWave,
      player: {
        x: player.x, y: player.y, fireLevel: player.fireLevel,
        wingmen: player.wingmen, shieldMs: player.shieldMs, invulnMs: player.invulnMs
      },
      enemies: ens, pBullets: pbs, eBullets: ebs, drops: drs
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
    root.data[state.diff] = snapshot();
    writeJSON(KEY_STATE, root);
  }

  function loadState() {
    var root = readJSON(KEY_STATE, null);
    if (!root || root.v !== STATE_V || !root.data || typeof root.data !== 'object') return false;
    var s = root.data[state.diff];
    if (!s || typeof s !== 'object') return false;
    if (typeof s.score !== 'number' || typeof s.lives !== 'number' || typeof s.wave !== 'number') return false;
    if (s.lives < 0 || s.lives > START_LIVES || s.wave < 1) return false;

    state.score = Math.max(0, Math.floor(s.score));
    state.lives = s.lives;
    state.wave = s.wave;
    state.isRecord = !!s.isRecord;
    state.betweenWaves = !!s.betweenWaves;
    state.nextWave = typeof s.nextWave === 'number' ? s.nextWave : (s.wave + 1);
    state.bestAtStart = bestOf(state.diff);

    var p = (s.player && typeof s.player === 'object') ? s.player : null;
    player.x = (p && typeof p.x === 'number') ? clamp(p.x, PW / 2, W - PW / 2) : (W / 2);
    player.y = (p && typeof p.y === 'number') ? clamp(p.y, PLAYER_MIN_Y, PLAYER_MAX_Y) : (H - 70);
    player.fireLevel = (p && typeof p.fireLevel === 'number') ? p.fireLevel : 0;
    player.wingmen = (p && typeof p.wingmen === 'number') ? p.wingmen : 0;
    player.shieldMs = (p && typeof p.shieldMs === 'number') ? p.shieldMs : 0;
    player.invulnMs = (p && typeof p.invulnMs === 'number') ? p.invulnMs : 0;
    player.fireT = 0;

    enemies = [];
    if (Array.isArray(s.enemies)) {
      for (var i = 0; i < s.enemies.length; i++) {
        var e = s.enemies[i];
        if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') return false;
        enemies.push({
          x: e.x, y: e.y,
          vx: typeof e.vx === 'number' ? e.vx : 0,
          vy: typeof e.vy === 'number' ? e.vy : 40,
          hp: typeof e.hp === 'number' ? e.hp : 1,
          maxHp: typeof e.maxHp === 'number' ? e.maxHp : 1,
          ci: typeof e.ci === 'number' ? e.ci : 0,
          fireT: typeof e.fireT === 'number' ? e.fireT : 1000,
          phase: typeof e.phase === 'number' ? e.phase : 0,
          amp: typeof e.amp === 'number' ? e.amp : 16,
          diveT: typeof e.diveT === 'number' ? e.diveT : 2000
        });
      }
    }

    pBullets = [];
    if (Array.isArray(s.pBullets)) {
      for (var j = 0; j < s.pBullets.length; j++) {
        var b = s.pBullets[j];
        if (!b || typeof b.x !== 'number' || typeof b.y !== 'number') continue;
        pBullets.push({ x: b.x, y: b.y, vx: b.vx || 0, vy: b.vy || 0, r: b.r || 3 });
      }
    }
    eBullets = [];
    if (Array.isArray(s.eBullets)) {
      for (var k = 0; k < s.eBullets.length; k++) {
        var eb = s.eBullets[k];
        if (!eb || typeof eb.x !== 'number' || typeof eb.y !== 'number') continue;
        eBullets.push({ x: eb.x, y: eb.y, vx: eb.vx || 0, vy: eb.vy || 0, r: eb.r || 3.5 });
      }
    }
    drops = [];
    if (Array.isArray(s.drops)) {
      for (var m = 0; m < s.drops.length; m++) {
        var d = s.drops[m];
        if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
        if (d.kind !== 'P' && d.kind !== 'S' && d.kind !== 'W') continue;
        drops.push({ x: d.x, y: d.y, w: 22, h: 22, kind: d.kind });
      }
    }

    if (s.status === 'gameover') {
      state.status = 'gameover';
      showResult();
    } else if (s.status === 'paused') {
      state.status = 'paused';
      hideOverlay();
      showCard('pause');
    } else if (enemies.length === 0) {
      // 存档时刚好清完一波：直接补刷同一波，避免卡死
      state.status = 'running';
      hideOverlay();
      hideCard();
      startWave(state.wave);
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

  function pointerToLogical(clientX, clientY) {
    var rect = dom.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerTX = clamp((clientX - rect.left) / rect.width * W, PW / 2, W - PW / 2);
    pointerTY = clamp((clientY - rect.top) / rect.height * H, PLAYER_MIN_Y, PLAYER_MAX_Y);
  }

  function bindInput() {
    dom.canvas.addEventListener('pointermove', function (e) {
      if (pointerActive) pointerToLogical(e.clientX, e.clientY);
    });

    dom.canvas.addEventListener('pointerdown', function (e) {
      pointerActive = true;
      pointerToLogical(e.clientX, e.clientY);
      if (state.status === 'ready') start();
      else if (state.status === 'paused') resume();
    });

    var release = function () { pointerActive = false; };
    dom.canvas.addEventListener('pointerup', release);
    dom.canvas.addEventListener('pointercancel', release);
    dom.canvas.addEventListener('pointerleave', release);

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var key = e.key;
      var tag = e.target && e.target.tagName;

      if (key === 'p' || key === 'P') {
        if (state.status === 'running') pause();
        else if (state.status === 'paused') resume();
        return;
      }
      if (key === ' ' || key === 'Spacebar') {
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;
        e.preventDefault();
        if (state.status === 'ready') start();
        else if (state.status === 'running') pause();
        else if (state.status === 'paused') resume();
        return;
      }
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') { keyState.left = true; e.preventDefault(); }
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') { keyState.right = true; e.preventDefault(); }
      else if (key === 'ArrowUp' || key === 'w' || key === 'W') { keyState.up = true; e.preventDefault(); }
      else if (key === 'ArrowDown' || key === 's' || key === 'S') { keyState.down = true; e.preventDefault(); }
    });

    document.addEventListener('keyup', function (e) {
      var key = e.key;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') keyState.left = false;
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') keyState.right = false;
      else if (key === 'ArrowUp' || key === 'w' || key === 'W') keyState.up = false;
      else if (key === 'ArrowDown' || key === 's' || key === 'S') keyState.down = false;
    });

    window.addEventListener('blur', function () {
      keyState.left = keyState.right = keyState.up = keyState.down = false;
      pointerActive = false;
    });

    dom.btnStart.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'paused') resume();
      else if (state.status === 'ready') start();
    });

    dom.btnPause.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'running') pause();
      else if (state.status === 'paused') resume();
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
      best: document.getElementById('best'),
      wave: document.getElementById('wave'),
      lives: document.getElementById('lives'),
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
      overlayWave: document.getElementById('overlay-wave'),
      recordBadge: document.getElementById('record-badge')
    };

    var savedDiff = null;
    try { savedDiff = window.localStorage.getItem(KEY_DIFF); } catch (e) {}
    if (savedDiff && DIFF[savedDiff]) state.diff = savedDiff;

    ensureBest();
    state.bestAtStart = bestOf(state.diff);
    initStars();
    syncDiffs();
    if (!loadState()) newGame();

    fitCanvas();
    bindInput();
    window.requestAnimationFrame(loop);

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
