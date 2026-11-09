/* ==========================================================================
   恐龙跳跳 · 游戏逻辑
   - canvas 绘制，固定逻辑坐标系 480×270（横版 16:9），按 devicePixelRatio 缩放
   - 原创几何美术：圆润小兽 + 几何仙人掌 + 剪影飞鸟 + 远山 / 云 / 地面纹理
   - 横版无尽跑酷：角色固定在左侧，地面向左滚动，障碍从右侧按速度接近
   - 可变跳跃高度（按住托举、松开或超时截断上升速度）、下蹲压扁碰撞盒
   - 三档难度真正拉开：初速 / 加速度 / 障碍间隔 / 障碍种类 / 连障概率 / 上限
   - 昼夜切换：每隔一段距离在白天 / 黄昏 / 夜晚三套莫兰迪配色间渐变
   - 自动存档（按难度分桶）、断点续玩，最高分写 ysgame-dino-best
   - 统一走全站音效引擎 window.YSound.play
   [dino-dev 2026-11-09 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var W = 480;
  var H = 270;
  var GROUND_Y = 218;            // 地面顶 y
  var PLAYER_X = 68;             // 小兽固定 x（左侧）
  var PW = 34;                   // 站立碰撞宽
  var PH = 38;                   // 站立碰撞高
  var PH_DUCK = 22;              // 下蹲碰撞高

  var PX_PER_M = 12;             // 12 逻辑像素 = 1 米
  var SEG_M = 350;               // 每 350 米一段：昼夜配色 + 路段 + 里程碑横幅
  var STEP = 1 / 60;             // 固定时间步长（秒）
  var STATE_V = 1;

  // 跳跃物理（单位：逻辑像素 / 秒）
  var JUMP_V = -600;             // 起跳初速
  var G_HOLD = 1500;             // 按住上升时的重力（更轻，跳得更高）
  var G_FALL = 2400;             // 正常 / 下落重力
  var JUMP_CUT = -280;           // 松开或超时后，上升速度上限（截断）
  var MAX_HOLD_MS = 200;         // 最大按住托举时长

  var KEY_STATE = 'ysgame-dino-state';
  var KEY_BEST = 'ysgame-dino-best';
  var KEY_DIFF = 'ysgame-dino-diff';

  var FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

  /* ---------------- 三档难度（数值严格拉开） ---------------- */

  var DIFF = {
    // 简单：初速 180、加速度 6、间隔 1.6~2.4s、只出仙人掌（含双株）、无飞鸟、上限 300
    easy: {
      startSpeed: 180, accel: 6, gapMin: 1.6, gapMax: 2.4, maxSpeed: 300,
      birds: false, birdHigh: false, birdLowRate: 0, birdHighRate: 0,
      doubleChance: 0, cactusW: 18, cactusH: 36, hardCombos: false
    },
    // 中等：初速 230、加速度 9、间隔 1.2~1.8s、加入低空飞鸟、偶尔连续两障碍、上限 400
    medium: {
      startSpeed: 230, accel: 9, gapMin: 1.2, gapMax: 1.8, maxSpeed: 400,
      birds: true, birdHigh: false, birdLowRate: 0.28, birdHighRate: 0,
      doubleChance: 0.20, cactusW: 18, cactusH: 40, hardCombos: false
    },
    // 困难：初速 290、加速度 13、间隔 0.85~1.4s、飞鸟高低混合 + 连障概率更高、上限 520
    hard: {
      startSpeed: 290, accel: 13, gapMin: 0.85, gapMax: 1.4, maxSpeed: 520,
      birds: true, birdHigh: true, birdLowRate: 0.30, birdHighRate: 0.20,
      doubleChance: 0.42, cactusW: 20, cactusH: 44, hardCombos: true
    }
  };

  /* ---------------- 三套莫兰迪昼夜配色 ----------------
     每套字段一致，便于线性插值：颜色用 #RRGGBB，A 结尾是 0~1 的透明度数值。
     ------------------------------------------------- */
  var PALETTES = [
    { // 白天
      skyTop: '#C7D6DA', skyBottom: '#EFE6D3', sun: '#F2D6A8', moon: '#F4ECDA', cloud: '#FBF6EC',
      hillFar: '#B4C2BB', hillNear: '#9BAF9E', ground: '#C9B79A', groundTop: '#B7A184', groundLine: '#9C886C',
      cactus: '#7E9876', cactusDark: '#5C7757', bird: '#8B8496', birdEye: '#FBF6EC',
      sunA: 1, moonA: 0, starA: 0, cloudA: 0.9
    },
    { // 黄昏
      skyTop: '#C6A7A4', skyBottom: '#EAC9A6', sun: '#D98E6C', moon: '#EFE0D0', cloud: '#EBD2BE',
      hillFar: '#AA979C', hillNear: '#8E7B84', ground: '#B79A80', groundTop: '#9E8267', groundLine: '#836A54',
      cactus: '#6E7E62', cactusDark: '#4F5D47', bird: '#7E6276', birdEye: '#F6EADF',
      sunA: 0.85, moonA: 0.2, starA: 0.12, cloudA: 0.8
    },
    { // 夜晚
      skyTop: '#3C4761', skyBottom: '#656A85', sun: '#D9CBB0', moon: '#E9E4D6', cloud: '#7E849E',
      hillFar: '#4C5670', hillNear: '#3C4660', ground: '#545A6C', groundTop: '#454A5B', groundLine: '#333845',
      cactus: '#5B6D69', cactusDark: '#42524E', bird: '#9AA2BE', birdEye: '#2E3546',
      sunA: 0, moonA: 1, starA: 1, cloudA: 0.45
    }
  ];

  // 小兽主体色：始终清晰，夜晚不额外压暗，保证可玩性
  var DINO = {
    body: '#7E9A86', bodyDark: '#5F7B69', belly: '#E4D9C4', spike: '#C9A88C',
    eye: '#FFFDF8', pupil: '#3A4442', blush: '#C99A96'
  };

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium',
    status: 'ready',       // ready | running | paused | gameover
    score: 0,              // 得分 = 跑动米数取整
    dist: 0,               // 精确跑动距离（米）
    best: 0,               // 历史最高分（数字）
    bestAtStart: 0,        // 开局时的历史最高分，用于破纪录判定
    speed: 230,            // 当前地速
    elapsed: 0,            // 本局运行秒数（驱动速度爬升）
    stage: 1,              // 当前路段
    dayPhase: 0,           // 当前昼夜阶段 0/1/2
    isRecord: false,
    lastSeg: 0,            // 上一次里程碑段号
    nextScoreSfx: 100      // 下一个百分音效阈值
  };

  var player = {
    y: GROUND_Y,           // 脚底 y
    vy: 0,
    onGround: true,
    holdMs: 0,             // 本次起跳已托举时长
    cutDone: true,         // 上升速度是否已截断
    jumpHeld: false,       // 跳跃键是否按住
    ducking: false         // 是否下蹲
  };

  var obstacles = [];
  var banner = { ms: 0, title: '', sub: '' };
  var stars = [];
  var clouds = [];
  var bgOff = 0;            // 背景累计滚动量
  var spawnTimer = 0;       // 下一个生成事件的倒计时（秒）
  var pal = null;           // 当前帧配色

  var dom = {};
  var ctx = null;
  var lastTs = 0;
  var acc = 0;
  var lastSave = 0;
  var hudTs = 0;
  var lastSfx = {};
  var duckHeld = false;

  /* ---------------- 小工具 ---------------- */

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function $(id) { return document.getElementById(id); }
  function t(key) { return window.I18N ? window.I18N.t(key) : key; }

  // 字典里的 {score}/{level} 占位符，用 split/join 替换，绝不残留花括号
  function tf(key, map) {
    var s = t(key);
    for (var k in map) {
      if (hasOwn(map, k)) s = s.split('{' + k + '}').join(String(map[k]));
    }
    return s;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) { var u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); }
  function diffDef() { return DIFF[state.diff] || DIFF.medium; }
  function nowMs() { return (window.performance && window.performance.now) ? window.performance.now() : Date.now(); }

  function readJSON(key, fallback) {
    try { var raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式忽略 */ }
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

  /* ---------------- 最高分（单个数字） ---------------- */

  function ensureBest() {
    var raw = null;
    try { raw = window.localStorage.getItem(KEY_BEST); } catch (e) { /* ignore */ }
    if (raw === null) { try { window.localStorage.setItem(KEY_BEST, '0'); } catch (e2) { /* ignore */ } }
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

  function settleBest() {
    if (state.score > state.best) {
      state.best = state.score;
      writeBest(state.best);
    }
  }

  /* ---------------- 昼夜配色插值 ---------------- */

  function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function lerpColor(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + Math.round(lerp(A[0], B[0], t)) + ',' +
      Math.round(lerp(A[1], B[1], t)) + ',' + Math.round(lerp(A[2], B[2], t)) + ')';
  }
  function lerpPalette(a, b, t) {
    var out = {};
    for (var k in a) {
      if (!hasOwn(a, k)) continue;
      out[k] = (typeof a[k] === 'string') ? lerpColor(a[k], b[k], t) : lerp(a[k], b[k], t);
    }
    return out;
  }

  // 依距离在白天 / 黄昏 / 夜晚间渐变；顺带更新路段与昼夜阶段
  function phaseInfo() {
    var f = state.dist / SEG_M;
    var i = Math.floor(f) % 3;
    if (i < 0) i = 0;
    var frac = f - Math.floor(f);
    var blend = smoothstep(0.68, 1, frac);   // 每段末尾 32% 渐变到下一套
    state.dayPhase = i;
    state.stage = Math.floor(f) + 1;
    return { a: PALETTES[i], b: PALETTES[(i + 1) % 3], t: blend };
  }
  function computePalette() {
    var p = phaseInfo();
    return p.t <= 0 ? p.a : lerpPalette(p.a, p.b, p.t);
  }

  /* ---------------- 背景元素 ---------------- */

  function initStars() {
    stars = [];
    for (var i = 0; i < 46; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * GROUND_Y * 0.72,
        r: Math.random() * 1.3 + 0.4, ph: Math.random() * 6.28 });
    }
  }
  function initClouds() {
    clouds = [];
    for (var i = 0; i < 6; i++) {
      clouds.push({ x: Math.random() * (W + 160), y: 26 + Math.random() * 70, s: 0.7 + Math.random() * 0.7 });
    }
  }

  /* ---------------- canvas 尺寸 / DPR ---------------- */

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

  /* ---------------- 绘制辅助 ---------------- */

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

  function cloudShape(x, y, s) {
    ctx.beginPath(); ctx.arc(x, y, 11 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 16 * s, y - 7 * s, 15 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 33 * s, y, 11 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 16 * s, y + 6 * s, 14 * s, 0, Math.PI * 2); ctx.fill();
  }

  function hillLayer(color, baseY, amp, wl, off) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (var x = 0; x <= W; x += 6) {
      ctx.lineTo(x, baseY - amp * (0.5 + 0.5 * Math.sin((x + off) / wl)));
    }
    ctx.lineTo(W, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------- 绘制：背景 ---------------- */

  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars() {
    if (pal.starA < 0.02) return;
    ctx.save();
    ctx.fillStyle = '#F4ECDA';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(nowMs() / 700 + s.ph));
      ctx.globalAlpha = pal.starA * tw;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawCelestial() {
    var cx = W * 0.80, cy = H * 0.30;
    if (pal.sunA > 0.01) {
      ctx.save();
      ctx.fillStyle = pal.sun;
      ctx.globalAlpha = pal.sunA * 0.16;
      ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = pal.sunA * 0.30;
      ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = pal.sunA;
      ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (pal.moonA > 0.01) {
      ctx.save();
      ctx.globalAlpha = pal.moonA;
      ctx.fillStyle = pal.moon;
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = pal.moonA * 0.35;
      ctx.fillStyle = '#B9B2A2';
      ctx.beginPath(); ctx.arc(cx - 4, cy - 3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy + 4, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawClouds() {
    ctx.save();
    ctx.globalAlpha = pal.cloudA;
    ctx.fillStyle = pal.cloud;
    var span = W + 160;
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var x = ((c.x - bgOff * 0.10) % span + span) % span - 80;
      cloudShape(x, c.y, c.s);
    }
    ctx.restore();
  }

  function drawHills() {
    hillLayer(pal.hillFar, GROUND_Y - 6, 40, 96, bgOff * 0.16);
    hillLayer(pal.hillNear, GROUND_Y + 4, 24, 64, bgOff * 0.34);
  }

  function drawGround() {
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = pal.groundTop;
    ctx.fillRect(0, GROUND_Y, W, 4);

    // 原创地面纹理：短横纹 + 小石子，随速度向左滚动
    ctx.strokeStyle = pal.groundLine;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    var step = 28, o = bgOff % step;
    for (var x = -step; x < W + step; x += step) {
      var gx = x - o;
      ctx.beginPath(); ctx.moveTo(gx, GROUND_Y + 11); ctx.lineTo(gx + 9, GROUND_Y + 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx + 16, GROUND_Y + 22); ctx.lineTo(gx + 21, GROUND_Y + 22); ctx.stroke();
      ctx.beginPath(); ctx.arc(gx + 6, GROUND_Y + 32, 1.4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y + 3.5); ctx.lineTo(W, GROUND_Y + 3.5); ctx.stroke();
  }

  /* ---------------- 绘制：仙人掌（原创几何） ---------------- */

  function cactusStalk(cx, baseY, w, h) {
    var r = Math.min(w / 2, 8);
    ctx.fillStyle = pal.cactusDark;
    rrect(cx - w / 2 - 1, baseY - h, w + 2, h, r + 1); ctx.fill();
    ctx.fillStyle = pal.cactus;
    rrect(cx - w / 2, baseY - h, w, h, r); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, baseY - h + r, w / 2 - 1, Math.PI, 0); ctx.fill();

    // 两条圆润手臂（几何 L 形）
    if (h >= 34) {
      var ay = baseY - h * 0.52;
      ctx.fillStyle = pal.cactus;
      rrect(cx - w / 2 - 8, ay, 9, 6, 3); ctx.fill();
      rrect(cx - w / 2 - 8, ay - 8, 6, 12, 3); ctx.fill();
      rrect(cx + w / 2 - 1, ay - 6, 9, 6, 3); ctx.fill();
      rrect(cx + w / 2 + 2, ay - 14, 6, 12, 3); ctx.fill();
    }
    // 竖纹
    ctx.strokeStyle = pal.cactusDark;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 4, baseY - h + 7);
      ctx.lineTo(cx + i * 4, baseY - 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCactus(ob) {
    if (ob.v === 2) {
      // 双株：左高右矮，高度组合更刁钻
      cactusStalk(ob.x + ob.w * 0.30, GROUND_Y, ob.w * 0.42, ob.h);
      cactusStalk(ob.x + ob.w * 0.72, GROUND_Y, ob.w * 0.42, ob.h * 0.72);
    } else {
      cactusStalk(ob.x + ob.w / 2, GROUND_Y, ob.w, ob.h);
    }
  }

  /* ---------------- 绘制：飞鸟剪影（原创，上下扇翅） ---------------- */

  function drawBird(ob) {
    ctx.save();
    ctx.translate(ob.x + ob.w / 2, ob.y + ob.h / 2);
    var flap = Math.sin(ob.ph);
    ctx.fillStyle = pal.bird;

    // 尾羽
    ctx.beginPath();
    ctx.moveTo(-ob.w * 0.28, 0);
    ctx.lineTo(-ob.w * 0.52, -ob.h * 0.32);
    ctx.lineTo(-ob.w * 0.50, ob.h * 0.32);
    ctx.closePath(); ctx.fill();
    // 身体
    ctx.beginPath(); ctx.ellipse(0, 0, ob.w * 0.30, ob.h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    // 头
    ctx.beginPath(); ctx.arc(ob.w * 0.26, -ob.h * 0.10, ob.h * 0.34, 0, Math.PI * 2); ctx.fill();
    // 尖喙
    ctx.beginPath();
    ctx.moveTo(ob.w * 0.26 + ob.h * 0.30, -ob.h * 0.14);
    ctx.lineTo(ob.w * 0.26 + ob.h * 0.62, -ob.h * 0.04);
    ctx.lineTo(ob.w * 0.26 + ob.h * 0.30, ob.h * 0.06);
    ctx.closePath(); ctx.fill();
    // 上翅（随相位上下扇动）
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(-ob.w * 0.24, -ob.h * (0.9 + flap * 1.1), -ob.w * 0.50, -ob.h * 0.18);
    ctx.quadraticCurveTo(-ob.w * 0.26, 1, -2, -2);
    ctx.fill();
    // 下翅（反相）
    ctx.beginPath();
    ctx.moveTo(-2, 2);
    ctx.quadraticCurveTo(-ob.w * 0.22, ob.h * (0.5 - flap * 0.7), -ob.w * 0.44, ob.h * 0.30);
    ctx.quadraticCurveTo(-ob.w * 0.24, 3, -2, 2);
    ctx.fill();
    // 眼
    ctx.fillStyle = pal.birdEye;
    ctx.beginPath(); ctx.arc(ob.w * 0.30, -ob.h * 0.16, 1.5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  /* ---------------- 绘制：圆润小兽（原创几何） ---------------- */

  function spike(x, y) {
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 5);
    ctx.quadraticCurveTo(x, y - 4, x + 3, y + 5);
    ctx.closePath();
    ctx.fill();
  }

  function drawDino() {
    var cx = PLAYER_X + PW / 2;
    var running = (state.status === 'running' && player.onGround);
    var t = bgOff * 0.055;
    var swing = running ? Math.sin(t) * 4 : 0;
    var bob = running ? Math.abs(Math.sin(t)) * 1.6 : 0;
    var airborne = !player.onGround;

    // 地面影子
    ctx.save();
    ctx.globalAlpha = 0.16 * (player.onGround ? 1 : 0.5);
    ctx.fillStyle = '#3A4442';
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 3, 20 - (airborne ? 6 : 0), 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, player.y - bob);
    if (player.ducking) ctx.scale(1, 0.6);   // 下蹲压扁，锚点在脚底

    // 尾巴
    ctx.fillStyle = DINO.bodyDark;
    ctx.beginPath();
    ctx.moveTo(-12, -16);
    ctx.quadraticCurveTo(-30, -20, -34, -8);
    ctx.quadraticCurveTo(-26, -10, -12, -8);
    ctx.closePath(); ctx.fill();

    // 背刺
    ctx.fillStyle = DINO.spike;
    spike(-8, -30); spike(-1, -33); spike(6, -31);

    // 双腿（跑动摆动 / 腾空收起）
    ctx.fillStyle = DINO.bodyDark;
    if (airborne) {
      rrect(-9, -8, 8, 9, 4); ctx.fill();
      rrect(3, -9, 8, 10, 4); ctx.fill();
    } else {
      rrect(-9 + swing * 0.4, -9, 8, 10, 4); ctx.fill();
      rrect(3 - swing * 0.4, -9, 8, 10, 4); ctx.fill();
    }

    // 身体 + 肚皮
    ctx.fillStyle = DINO.body;
    rrect(-16, -30, 30, 24, 12); ctx.fill();
    ctx.fillStyle = DINO.belly;
    rrect(-6, -16, 16, 10, 6); ctx.fill();

    // 小手臂
    ctx.fillStyle = DINO.body;
    rrect(2, -18, 9, 6, 3); ctx.fill();

    // 大头 + 前突口鼻
    ctx.beginPath(); ctx.arc(9, -30, 13, 0, Math.PI * 2); ctx.fill();
    rrect(14, -30, 11, 9, 5); ctx.fill();

    // 鼻孔
    ctx.fillStyle = DINO.bodyDark;
    ctx.beginPath(); ctx.arc(22, -27, 1.1, 0, Math.PI * 2); ctx.fill();

    // 眼睛（白 + 瞳 + 高光）
    ctx.fillStyle = DINO.eye;
    ctx.beginPath(); ctx.arc(12, -34, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = DINO.pupil;
    ctx.beginPath(); ctx.arc(13.2, -34, 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(13.9, -35, 0.9, 0, Math.PI * 2); ctx.fill();

    // 腮红 + 微笑嘴
    ctx.fillStyle = DINO.blush;
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.arc(6, -26, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = DINO.bodyDark;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(17, -25, 4, 0.15 * Math.PI, 0.65 * Math.PI); ctx.stroke();

    ctx.restore();
  }

  /* ---------------- 绘制：里程碑横幅 / 主绘制 ---------------- */

  function drawBanner() {
    if (banner.ms <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, banner.ms / 320);
    ctx.fillStyle = 'rgba(255,253,248,.9)';
    rrect(W / 2 - 130, 40, 260, 48, 16); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#454B59';
    ctx.font = '600 16px ' + FONT;
    ctx.fillText(banner.title, W / 2, 62);
    ctx.fillStyle = '#7C8497';
    ctx.font = '500 12px ' + FONT;
    ctx.fillText(banner.sub, W / 2, 80);
    ctx.restore();
  }

  function draw() {
    if (!ctx || !pal) return;
    drawSky();
    drawStars();
    drawCelestial();
    drawClouds();
    drawHills();
    drawGround();
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      if (ob.k === 'c') drawCactus(ob);
      else drawBird(ob);
    }
    drawDino();
    drawBanner();
  }

  /* ---------------- 输入动作 ---------------- */

  function beginJump() {
    if (state.status !== 'running' || !player.onGround) return;
    player.vy = JUMP_V;
    player.onGround = false;
    player.holdMs = 0;
    player.cutDone = false;
    player.jumpHeld = true;
    sfx('whoosh');            // 起跳
  }

  function endJump() {
    if (!player.jumpHeld && player.onGround) return;
    player.jumpHeld = false;
    // 松开就截断上升速度（短按跳得低）
    if (!player.onGround && player.vy < JUMP_CUT) player.vy = JUMP_CUT;
    player.cutDone = true;
  }

  /* ---------------- 每步推进（dt 单位：秒） ---------------- */

  function updatePlayer(dt) {
    player.ducking = duckHeld && player.onGround;
    if (player.onGround) return;

    var g = G_FALL;
    // 按住期间用更轻的重力，跳得更高
    if (player.jumpHeld && !player.cutDone && player.holdMs < MAX_HOLD_MS && player.vy < 0) {
      g = G_HOLD;
      player.holdMs += dt * 1000;
    }
    // 超过最大按住时间：也截断一次上升速度，避免一直托举
    if (!player.cutDone && player.holdMs >= MAX_HOLD_MS) {
      if (player.vy < JUMP_CUT) player.vy = JUMP_CUT;
      player.cutDone = true;
    }

    player.vy += g * dt;
    player.y += player.vy * dt;
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
      player.onGround = true;
      player.jumpHeld = false;
      sfx('drop', 140);
    }
  }

  function moveObstacles(dt) {
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var ob = obstacles[i];
      ob.x -= state.speed * dt;
      if (ob.k === 'bl' || ob.k === 'bh') {
        ob.ph += dt * 9;
        ob.y = ob.by + Math.sin(ob.ph) * ob.amp;
      }
      if (!ob.scored && ob.x + ob.w < PLAYER_X) ob.scored = true;
      if (ob.x + ob.w < -40) obstacles.splice(i, 1);
    }
  }

  function makeCactus(x, d) {
    var r = Math.random(), v, w, h;
    if (d.hardCombos) v = r < 0.45 ? 2 : (r < 0.75 ? 1 : 0);
    else v = r < 0.30 ? 2 : (r < 0.62 ? 0 : 1);
    if (v === 2) { w = d.cactusW * 1.9; h = d.cactusH * 1.18; }
    else if (v === 1) { w = d.cactusW; h = d.cactusH * 1.35; }
    else { w = d.cactusW; h = d.cactusH; }
    return { k: 'c', x: x, y: GROUND_Y - h, w: w, h: h, v: v, sd: 0,
      ph: 0, amp: 0, by: GROUND_Y - h, scored: false };
  }

  function makeBird(x, level) {
    var by = level === 'bh' ? (GROUND_Y - 96) : (GROUND_Y - 48);
    var amp = level === 'bh' ? 7 : 4;
    return { k: level, x: x, y: by, w: 38, h: 16, v: 0, sd: 0,
      ph: Math.random() * 6.28, amp: amp, by: by, scored: false };
  }

  function makeObstacle(d, isFollow) {
    var x = W + 24;
    if (isFollow) return makeCactus(x, d);   // 连续双障碍第二个只出仙人掌，保证可解
    var r = Math.random();
    if (d.birdHighRate > 0 && r < d.birdHighRate) return makeBird(x, 'bh');
    if (d.birds && r < d.birdHighRate + d.birdLowRate) return makeBird(x, 'bl');
    return makeCactus(x, d);
  }

  function spawnEvent() {
    var d = diffDef();
    var ob = makeObstacle(d, false);
    obstacles.push(ob);
    // 高飞鸟不与任何障碍连放，避免出现「必须跳又不能跳」的无解组合
    if (ob.k !== 'bh' && Math.random() < d.doubleChance) {
      var ob2 = makeObstacle(d, true);
      ob2.x = ob.x + ob.w + state.speed * rand(0.44, 0.56);
      obstacles.push(ob2);
    }
    spawnTimer = rand(d.gapMin, d.gapMax);
  }

  function playerBox() {
    var h = player.ducking ? PH_DUCK : PH;
    // 碰撞盒比视觉明显内缩，留宽容度，别让玩家觉得擦边即死
    return { x: PLAYER_X + 5, y: player.y - h + 3, w: PW - 10, h: h - 5 };
  }
  function obstacleBox(ob) {
    if (ob.k === 'c') return { x: ob.x + 3, y: ob.y + 2, w: ob.w - 6, h: ob.h - 3 };
    return { x: ob.x + 5, y: ob.y + 3, w: ob.w - 10, h: ob.h - 5 };
  }
  function overlap(a, b, f) {
    return a.x + a.w > b.x + f && a.x < b.x + b.w - f &&
      a.y + a.h > b.y + f && a.y < b.y + b.h - f;
  }
  function checkCollisions() {
    var pb = playerBox();
    for (var i = 0; i < obstacles.length; i++) {
      if (overlap(pb, obstacleBox(obstacles[i]), 2)) { gameOver(); return; }
    }
  }

  function checkMilestones() {
    var seg = Math.floor(state.dist / SEG_M);
    if (seg > state.lastSeg) {
      state.lastSeg = seg;
      banner.ms = 1700;
      banner.title = t('win_title');
      banner.sub = tf('win_sub', { score: state.score, level: state.stage });
      sfx('levelup');
    }
  }

  function updateBanner(dt) {
    if (banner.ms > 0) banner.ms -= dt * 1000;
  }

  function step(dt) {
    if (state.status !== 'running') { updateBanner(dt); return; }

    var d = diffDef();
    state.elapsed += dt;
    state.speed = Math.min(d.maxSpeed, d.startSpeed + d.accel * state.elapsed);

    // 分数按跑动距离累加（1 米 = 1 分）
    var metres = state.speed * dt / PX_PER_M;
    state.dist += metres;
    state.score = Math.floor(state.dist);

    if (!state.isRecord && state.score > state.bestAtStart) state.isRecord = true;

    // 每 100 分一次得分音；整 500 分用升关音
    while (state.score >= state.nextScoreSfx) {
      state.nextScoreSfx += 100;
      sfx(state.nextScoreSfx % 500 === 0 ? 'levelup' : 'coin', 80);
    }
    checkMilestones();

    bgOff += state.speed * dt;

    updatePlayer(dt);
    moveObstacles(dt);
    spawnTimer -= dt;
    if (spawnTimer <= 0) spawnEvent();
    checkCollisions();
    updateBanner(dt);
  }

  function loop(ts) {
    window.requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
    lastTs = ts;

    pal = computePalette();     // 每帧更新昼夜阶段 / 路段 / 配色
    acc += dt / 1000;
    var guard = 0;
    while (acc >= STEP && guard < 6) { step(STEP); acc -= STEP; guard++; }
    if (guard >= 6) acc = 0;

    draw();
    if (ts - hudTs > 80) { hudTs = ts; refreshHud(); }
    if (state.status === 'running' && ts - lastSave > 700) { lastSave = ts; saveState(false); }
  }

  /* ---------------- 记分板 / 卡片 / 结算 ---------------- */

  function refreshHud() {
    dom.score.textContent = String(state.score);
    dom.best.textContent = String(Math.max(state.bestAtStart, state.isRecord ? state.score : 0));
    dom.dist.textContent = state.dist.toFixed(1) + 'm';
    dom.hudStage.textContent = String(state.stage);
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
    setI18n(dom.btnPause, state.status === 'paused' ? 'btn_resume' : 'btn_pause');
    dom.btnPause.disabled = !(state.status === 'running' || state.status === 'paused');
  }

  function showCard(kind) {
    dom.card.hidden = false;
    dom.card.setAttribute('data-kind', kind);
    if (kind === 'paused') {
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
    var bestShown = Math.max(state.bestAtStart, state.isRecord ? state.score : 0);
    dom.overlaySub.textContent = tf('lose_sub', { score: state.score, level: bestShown });
    dom.overlayScore.textContent = String(state.score);
    dom.overlayDist.textContent = state.dist.toFixed(0) + 'm';
    dom.recordBadge.hidden = !state.isRecord;
  }

  function showResult() {
    hideCard();
    renderResult();
    dom.overlay.hidden = false;
    if (typeof dom.overlay.scrollIntoView === 'function') {
      dom.overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ---------------- 开局 / 状态切换 ---------------- */

  function newGame() {
    state.status = 'ready';
    state.score = 0;
    state.dist = 0;
    state.bestAtStart = state.best;
    state.isRecord = false;
    state.speed = diffDef().startSpeed;
    state.elapsed = 0;
    state.stage = 1;
    state.dayPhase = 0;
    state.lastSeg = 0;
    state.nextScoreSfx = 100;

    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
    player.holdMs = 0;
    player.cutDone = true;
    player.jumpHeld = false;
    player.ducking = false;
    duckHeld = false;

    obstacles = [];
    bgOff = 0;
    banner.ms = 0;
    spawnTimer = 0.6;          // 开局留一点热身时间

    hideOverlay();
    dom.recordBadge.hidden = true;
    showCard('ready');
    syncButtons();
    refreshHud();
    saveState(true);           // 开局即写入存档
  }

  function start() {
    if (state.status !== 'ready') return;
    state.status = 'running';
    hideCard();
    syncButtons();
    sfx('start');
    saveState(true);
  }

  function pause() {
    if (state.status !== 'running') return;
    state.status = 'paused';
    showCard('paused');
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
    if (state.status !== 'running') return;
    state.status = 'gameover';
    sfx('lose');                                   // 撞击
    if (state.isRecord) {
      settleBest();
      window.setTimeout(function () { sfx('win'); }, 380);   // 破纪录
    }
    showResult();
    syncButtons();
    refreshHud();
    saveState(true);           // 标记结束（status=gameover / ended=true）
  }

  function restart() {
    newGame();
    start();
  }

  /* [gyh 2026-11-09 新增] 切档提示：页面内 toast，不用阻塞式原生确认框 */
  function toastDiff() {
    try {
      var el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.textContent = t('confirm_diff');
      el.style.cssText = 'position:fixed;left:50%;bottom:16%;transform:translateX(-50%);max-width:88%;padding:10px 16px;border-radius:14px;background:rgba(69,75,89,.92);color:#fff;font-size:14px;line-height:1.5;text-align:center;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.18);';
      document.body.appendChild(el);
      window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2200);
    } catch (e) { /* ignore */ }
  }

  function switchDiff(diff) {
    if (!DIFF[diff]) return;
    /* [gyh 2026-11-09 修改] 同档也幂等落盘，切档不再被原生 confirm 拦截 */
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) { /* ignore */ }
    if (diff === state.diff) return;
    var inProgress = (state.status === 'running' || state.status === 'paused') && state.dist > 0;
    if (inProgress) toastDiff();
    state.diff = diff;
    syncDiffs();
    sfx('toggle');
    newGame();                  // 切换即重开
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    var obs = [];
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      obs.push({ k: o.k, x: o.x, y: o.y, w: o.w, h: o.h, v: o.v, sd: o.sd,
        ph: o.ph, amp: o.amp, by: o.by, scored: !!o.scored });
    }
    return {
      v: STATE_V, diff: state.diff, status: state.status,
      ended: state.status === 'gameover',
      score: state.score, dist: state.dist, best: state.best,
      speed: state.speed, elapsed: state.elapsed,
      stage: state.stage, dayPhase: state.dayPhase,
      isRecord: state.isRecord, lastSeg: state.lastSeg,
      nextScoreSfx: state.nextScoreSfx, bgOff: bgOff,
      spawnTimer: spawnTimer, bannerMs: banner.ms,
      player: {
        y: player.y, vy: player.vy, onGround: player.onGround,
        holdMs: player.holdMs, cutDone: player.cutDone,
        jumpHeld: player.jumpHeld, ducking: player.ducking
      },
      obstacles: obs
    };
  }

  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 250) return;
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
    if (!s || typeof s !== 'object' || s.v !== STATE_V) return false;
    if (typeof s.score !== 'number' || typeof s.dist !== 'number' ||
        typeof s.speed !== 'number' || typeof s.elapsed !== 'number' ||
        s.score < 0 || s.dist < 0 || s.speed < 0 || s.elapsed < 0) return false;
    if (s.ended || s.status === 'gameover') return false;   // 已结束的局不续玩
    var p = s.player;
    if (!p || typeof p.y !== 'number' || typeof p.vy !== 'number') return false;
    if (!Array.isArray(s.obstacles)) return false;

    state.score = Math.max(0, Math.floor(s.score));
    state.dist = Math.max(0, s.dist);
    state.bestAtStart = state.best;
    state.speed = clamp(s.speed, 0, diffDef().maxSpeed);
    state.elapsed = Math.max(0, s.elapsed);
    state.isRecord = !!s.isRecord;
    state.lastSeg = (typeof s.lastSeg === 'number') ? s.lastSeg : Math.floor(state.dist / SEG_M);
    state.nextScoreSfx = (typeof s.nextScoreSfx === 'number' && s.nextScoreSfx > state.score)
      ? s.nextScoreSfx : (Math.floor(state.score / 100) + 1) * 100;
    bgOff = (typeof s.bgOff === 'number') ? s.bgOff : 0;
    spawnTimer = (typeof s.spawnTimer === 'number' && s.spawnTimer > 0)
      ? s.spawnTimer : rand(diffDef().gapMin, diffDef().gapMax);
    banner.ms = 0;

    player.y = clamp(p.y, GROUND_Y - 140, GROUND_Y);
    player.vy = (typeof p.vy === 'number') ? p.vy : 0;
    player.onGround = !!p.onGround;
    if (player.onGround) { player.y = GROUND_Y; player.vy = 0; }
    player.holdMs = (typeof p.holdMs === 'number') ? p.holdMs : 0;
    player.cutDone = !!p.cutDone;
    player.jumpHeld = false;    // 刷新后不继承按住状态
    player.ducking = false;
    duckHeld = false;

    obstacles = [];
    for (var i = 0; i < s.obstacles.length; i++) {
      var o = s.obstacles[i];
      if (!o || (o.k !== 'c' && o.k !== 'bl' && o.k !== 'bh') ||
          typeof o.x !== 'number' || typeof o.y !== 'number' ||
          typeof o.w !== 'number' || typeof o.h !== 'number') return false;
      obstacles.push({
        k: o.k, x: o.x, y: o.y, w: o.w, h: o.h,
        v: (typeof o.v === 'number') ? o.v : 0,
        sd: (typeof o.sd === 'number') ? o.sd : 0,
        ph: (typeof o.ph === 'number') ? o.ph : 0,
        amp: (typeof o.amp === 'number') ? o.amp : 0,
        by: (typeof o.by === 'number') ? o.by : o.y,
        scored: !!o.scored
      });
    }

    // 刷新后一律先暂停 / 停在起始卡，别让角色自己跑
    if (state.dist > 0) { state.status = 'paused'; hideOverlay(); showCard('paused'); }
    else { state.status = 'ready'; hideOverlay(); showCard('ready'); }
    syncButtons();
    refreshHud();
    return true;
  }

  /* ---------------- 输入 ---------------- */

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var k = e.key;

    if (k === 'p' || k === 'P') {
      e.preventDefault();
      if (state.status === 'running') pause();
      else if (state.status === 'paused') resume();
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'w' || k === 'W') {
      if (tag === 'BUTTON' || tag === 'A') return;   // 让聚焦的按钮响应空格
      e.preventDefault();
      if (e.repeat) return;
      if (state.status === 'ready') { sfx('start'); start(); return; }
      if (state.status === 'gameover') { restart(); return; }
      if (state.status === 'paused') { resume(); return; }
      if (state.status === 'running') beginJump();
      return;
    }
    if (k === 'ArrowDown' || k === 's' || k === 'S') {
      e.preventDefault();
      duckHeld = true;
    }
  }

  function onKeyUp(e) {
    var k = e.key;
    if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'w' || k === 'W') endJump();
    else if (k === 'ArrowDown' || k === 's' || k === 'S') duckHeld = false;
  }

  function onBlur() { duckHeld = false; endJump(); }

  function bindInput() {
    // 触屏 / 鼠标：点舞台任意位置；按住跳得更高
    function onDown(e) {
      var tag = e.target && e.target.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' ||
          tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (state.status === 'ready') { sfx('start'); start(); return; }
      if (state.status === 'paused') { resume(); return; }
      if (state.status === 'gameover') { restart(); return; }
      if (state.status === 'running') beginJump();
      if (dom.stageWrap.setPointerCapture) {
        try { dom.stageWrap.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      }
    }
    function onUp() { if (state.status === 'running') endJump(); }
    dom.stageWrap.addEventListener('pointerdown', onDown);
    // 舞台之外（记分板、提示、页边空白）点任意位置同样能起跳 / 开始，
    // 但过滤按钮、链接与分享面板，避免误触；舞台内由上面的监听处理，不重复
    document.addEventListener('pointerdown', function (e) {
      if (dom.stageWrap.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.ys-share')) return;
      onDown(e);
    });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    dom.btnStart.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'ready') start();
      else if (state.status === 'paused') resume();
      else if (state.status === 'gameover') restart();
    });
    dom.btnCard.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'paused') resume();
      else if (state.status === 'ready') start();
    });
    dom.btnPause.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'running') pause();
      else if (state.status === 'paused') resume();
    });
    dom.btnRestart.addEventListener('click', function () { sfx('click'); restart(); });
    dom.btnAgain.addEventListener('click', function () { sfx('click'); restart(); });

    dom.diffs.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
      if (btn && dom.diffs.contains(btn)) switchDiff(btn.getAttribute('data-diff'));
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
      new window.ResizeObserver(fitCanvas).observe(dom.stageWrap);
    }
  }

  function onLangChange() {
    syncDiffs();
    syncButtons();
    if (!dom.card.hidden) showCard(dom.card.getAttribute('data-kind') || 'ready');
    if (!dom.overlay.hidden) renderResult();
    if (banner.ms > 0) {
      banner.title = t('win_title');
      banner.sub = tf('win_sub', { score: state.score, level: state.stage });
    }
    refreshHud();
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    dom = {
      canvas: $('canvas'),
      stageWrap: $('stage-wrap'),
      score: $('score'),
      best: $('best'),
      dist: $('dist'),
      hudStage: $('stage'),
      diffs: $('diffs'),
      btnStart: $('btn-start'),
      btnPause: $('btn-pause'),
      btnRestart: $('btn-restart'),
      btnCard: $('btn-card'),
      card: $('card'),
      cardTitle: $('card-title'),
      cardSub: $('card-sub'),
      overlay: $('overlay'),
      overlayTitle: $('overlay-title'),
      overlaySub: $('overlay-sub'),
      overlayScore: $('overlay-score'),
      overlayDist: $('overlay-dist'),
      recordBadge: $('record-badge'),
      btnAgain: $('btn-again')
    };

    var savedDiff = null;
    try { savedDiff = window.localStorage.getItem(KEY_DIFF); } catch (e) { /* ignore */ }
    if (savedDiff && DIFF[savedDiff]) state.diff = savedDiff;

    ensureBest();
    state.best = readBest();
    try { window.localStorage.setItem(KEY_DIFF, state.diff); } catch (e) { /* 开局即落盘 */ }

    initStars();
    initClouds();
    syncDiffs();
    if (!loadState()) newGame();

    fitCanvas();
    bindInput();
    window.requestAnimationFrame(loop);

    document.addEventListener('ys:langchange', onLangChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
