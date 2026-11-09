/* ==========================================================================
   跳一跳 / Stack Jump · 游戏逻辑
   - canvas 绘制，固定逻辑坐标系 480×360（4:3），按 devicePixelRatio 缩放
   - 原创伪 3D 等轴测：沿「前进轴 A（右上）」排列一排等轴测方块，
     每个方块 = 菱形顶面 + 两个平行四边形侧面 + 中心标记；相机跟随当前方块
   - 玩法：按住蓄力 → 松手抛物线飞向下一块 → 落在方块上得分，
     正中中心算完美，连续完美叠连击加分；踩空即结束（1 命）
   - 二维落点判定：沿前进轴 along 对准距离，横向 lateral 对准移动方块；
     移动方块横向摆动、困难档侧向风力让棋子漂移，都真实影响落点
   - 三档难度真正拉开：平台宽 / 间距 / 移动平台概率与速度 / 完美判定半径 /
     蓄力速率 / 窄平台概率 / 风力，全部写进 DIFF 常量
   - 自动存档（ysgame-hop-state）、最高分（ysgame-hop-best）、难度（ysgame-hop-diff）
   - 切档用页面内 toast 提示，先清计时器与动画帧再重开，绝不使用阻塞式弹窗
   - 统一走全站音效引擎 window.YSound.play
   [gyh 2026-11-09 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var W = 480;
  var H = 360;
  var STEP = 1 / 60;                 // 固定时间步长（秒）
  var STATE_V = 1;

  // 等轴测投影基向量（屏幕像素 / 世界单位）
  var AX = 0.88, AY = -0.44;         // 前进轴：往右上
  var BX = 0.86, BY = 0.42;          // 横向轴：往右下
  var ORIGIN_X = W * 0.27;           // 当前方块大致落在屏幕左中
  var ORIGIN_Y = H * 0.60;

  var MAX_JUMP = 320;                // 满蓄力对应的跳跃距离（沿前进轴）
  var MAX_CHARGE = 1.25;             // 蓄力上限（允许蓄过头跳过方块）
  var CHARGE_TIME = 1.8;             // chargeRate=1 时按满到 1.0 所需秒数
  var FLIGHT_T = 0.58;               // 一次跳跃的飞行时长（秒）
  var BASE_SCORE = 10;               // 普通落点基础分
  var PERFECT_BONUS = 10;            // 完美落点额外分（× 连击倍率）
  var PERFECT_EASE = 3;              // 沿前进轴完美判定的基础宽容
  var LAT_PERFECT_EASE = 6;          // 横向完美判定的基础宽容
  var LAND_TOL = 5;                  // 沿前进轴落地宽容
  var LAT_TOL = 26;                  // 横向落地宽容：踩空主要由蓄力距离决定，移动方块主要影响「完美」判定
  var PLAT_DEPTH_RATIO = 0.8;       // 方块横向宽度 / 前进轴宽度
  var PLAT_H = 30;                   // 方块侧面厚度（视觉）
  var LOOKAHEAD = 6;                 // 前方始终保持的方块数量

  var KEY_STATE = 'ysgame-hop-state';
  var KEY_BEST = 'ysgame-hop-best';
  var KEY_DIFF = 'ysgame-hop-diff';

  var FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

  /* ---------------- 三档难度（数值严格拉开、可量化） ---------------- */

  var DIFF = {
    // 简单：宽平台 92、间距 105~155、无移动、完美半径 30%、蓄力 1.0、无风、1 命
    easy: {
      platformW: 92, gapMin: 105, gapMax: 155,
      moveChance: 0, moveAmp: 0, moveSpeed: 0,
      perfectPct: 0.30, chargeRate: 1.0, narrowChance: 0, wind: 0, lives: 1
    },
    // 中等：宽 72、间距 130~200、20% 横向移动、完美 18%、蓄力 1.35、2% 窄平台、无风
    medium: {
      platformW: 72, gapMin: 130, gapMax: 200,
      moveChance: 0.20, moveAmp: 26, moveSpeed: 1.1,
      perfectPct: 0.18, chargeRate: 1.35, narrowChance: 0.02, wind: 0, lives: 1
    },
    // 困难：宽 54、间距 170~250、45% 移动且更快、完美 10%、蓄力 1.75、5% 窄平台、侧风
    hard: {
      platformW: 54, gapMin: 170, gapMax: 250,
      moveChance: 0.45, moveAmp: 30, moveSpeed: 1.9,
      perfectPct: 0.10, chargeRate: 1.75, narrowChance: 0.05, wind: 20, lives: 1
    }
  };

  /* ---------------- 原创几何配色 ---------------- */

  // 方块：顶面亮、两个侧面渐暗、描边
  var PALETTES = [
    { top: '#7FC8B0', sideA: '#4E9C86', sideB: '#3C7A69', line: '#BEEBD9' },
    { top: '#F2A38B', sideA: '#C9705B', sideB: '#A45443', line: '#FBD3C4' },
    { top: '#F3D08A', sideA: '#C9A24E', sideB: '#A07C34', line: '#FBE9BF' },
    { top: '#9AA6E0', sideA: '#6B78BE', sideB: '#525E9B', line: '#CDD4F5' },
    { top: '#A8D8D0', sideA: '#6FB3A8', sideB: '#528C83', line: '#DDF3EE' },
    { top: '#E6A6C9', sideA: '#B8709B', sideB: '#965479', line: '#F6D2E6' }
  ];

  // 小棋子：暖黄几何块 + 深色眼睛
  var HERO = {
    body: '#FFE9A8', bodyDark: '#D9A85A', shine: '#FFF6D8',
    eye: '#FFFDF8', pupil: '#20243B'
  };

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium',
    status: 'ready',       // ready | running | paused | gameover
    phase: 'standby',      // standby | charging | jumping（仅 running 时有意义）
    score: 0,
    best: 0,
    bestAtStart: 0,
    isRecord: false,
    combo: 0,
    maxCombo: 0,
    landings: 0,           // 成功落点次数
    curIndex: 0,           // 当前站立的方块索引 = 高度
    time: 0,               // 本局时钟（驱动移动方块）
    charge: 0,             // 当前蓄力（0 ~ MAX_CHARGE）
    jump: { fromX: 0, toX: 0, t: 0, dist: 0, windVel: 0, peak: 0 },
    flash: { x: 0, lateral: 0, ms: 0, perfect: false }
  };

  var platforms = [];      // [{ x, w, depth, h, lateral, moveAmp, moveSpeed, movePhase, narrow, colorIndex }]
  var hero = { along: 0, lateral: 0, z: 0 };
  var camX = 0;            // 相机沿前进轴的位置
  var stars = [];

  var dom = {};
  var ctx = null;
  var lastTs = 0;
  var acc = 0;
  var lastSave = 0;
  var hudTs = 0;
  var lastSfx = {};
  var rafId = 0;
  var loopRunning = false;
  var timers = [];
  var toasts = [];

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
  function lerp(a, b, k) { return a + (b - a) * k; }
  function diffDef() { return DIFF[state.diff] || DIFF.medium; }
  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

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

  function sfx(name, throttle, opts) {
    if (!window.YSound) return;
    var now = nowMs();
    if (throttle) {
      if (lastSfx[name] && now - lastSfx[name] < throttle) return;
      lastSfx[name] = now;
    }
    window.YSound.play(name, opts || undefined);
  }

  /* [gyh 2026-11-09 新增] 计时器统一登记，切档时可一次清干净 */
  function later(fn, ms) {
    var id = window.setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  }

  /* [gyh 2026-11-09 新增] 页面内 toast：动态创建，重开 / 清场之后再显示，避免被清掉 */
  function showToast(text, ms) {
    var el = document.createElement('div');
    el.className = 'bk__toast';
    el.setAttribute('role', 'status');
    el.textContent = text;
    document.body.appendChild(el);
    toasts.push(el);
    later(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      var i = toasts.indexOf(el);
      if (i >= 0) toasts.splice(i, 1);
    }, ms || 1000);
  }

  /* ---------------- 循环 / 计时器管理 ---------------- */

  function stopLoops() {
    loopRunning = false;
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
    timers = [];
    for (var j = 0; j < toasts.length; j++) {
      if (toasts[j].parentNode) toasts[j].parentNode.removeChild(toasts[j]);
    }
    toasts = [];
  }

  function startLoop() {
    if (loopRunning && rafId) return;
    loopRunning = true;
    lastTs = 0;
    acc = 0;
    if (!rafId) rafId = window.requestAnimationFrame(frame);
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

  /* ---------------- 方块序列 ---------------- */

  function makePlatform(index, x, d) {
    var w = d.platformW;
    var narrow = (d.narrowChance > 0 && index > 0 && Math.random() < d.narrowChance);
    if (narrow) w = Math.round(w * 0.62);
    var moving = (d.moveChance > 0 && index > 0 && Math.random() < d.moveChance);
    return {
      x: x,
      w: w,
      depth: Math.round(w * PLAT_DEPTH_RATIO),
      h: PLAT_H,
      lateral: 0,
      moveAmp: moving ? d.moveAmp : 0,
      moveSpeed: moving ? d.moveSpeed : 0,
      movePhase: rand(0, 6.28),
      narrow: !!narrow,
      colorIndex: Math.floor(Math.random() * PALETTES.length)
    };
  }

  // 方块实时横向中心：移动方块沿横向轴做正弦摆动，落点判定用的就是它
  function platLateral(p, time) {
    return p.lateral + (p.moveAmp ? Math.sin(time * p.moveSpeed + p.movePhase) * p.moveAmp : 0);
  }

  function ensurePlatforms() {
    var d = diffDef();
    while (platforms.length < state.curIndex + LOOKAHEAD) {
      var last = platforms[platforms.length - 1];
      var gap = rand(d.gapMin, d.gapMax);
      platforms.push(makePlatform(platforms.length, last.x + gap, d));
    }
  }

  function initStars() {
    stars = [];
    for (var i = 0; i < 46; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.66,
        r: Math.random() * 1.3 + 0.4,
        ph: Math.random() * 6.28
      });
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

  /* ---------------- 投影 ---------------- */

  // 世界坐标 (along, lateral, z) → 屏幕坐标；z 为抬升高度
  function project(along, lateral, z) {
    var dx = along - camX;
    return {
      x: ORIGIN_X + dx * AX + lateral * BX,
      y: ORIGIN_Y + dx * AY + lateral * BY - z
    };
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

  function quad(p1, p2, p3, p4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
  }

  function topPath(a, b, c, e) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(e.x, e.y);
    ctx.closePath();
  }

  function hill(color, baseY, amp, wl, off) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var x = 0; x <= W; x += 8) {
      ctx.lineTo(x, baseY - amp * (0.5 + 0.5 * Math.sin((x + off) / wl)));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------- 绘制：背景 ---------------- */

  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1C2038');
    g.addColorStop(1, '#353C61');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.fillStyle = '#FFFDF8';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = 0.22 + 0.5 * (0.5 + 0.5 * Math.sin(state.time * 0.8 + s.ph));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();

    hill('rgba(122,140,196,.10)', H * 0.62, 30, 90, camX * 0.05);
    hill('rgba(90,108,168,.12)', H * 0.70, 22, 64, camX * 0.09);
  }

  /* ---------------- 绘制：方块（伪 3D 等轴测） ---------------- */

  function drawOnePlatform(p, index) {
    var lat = platLateral(p, state.time);
    var hw = p.w / 2;
    var hd = p.depth / 2;

    var a = project(p.x - hw, lat - hd, 0);   // 顶面：后左
    var b = project(p.x + hw, lat - hd, 0);   // 顶面：后右
    var c = project(p.x + hw, lat + hd, 0);   // 顶面：前右
    var e = project(p.x - hw, lat + hd, 0);   // 顶面：前左
    var aD = project(p.x - hw, lat - hd, -p.h);
    var bD = project(p.x + hw, lat - hd, -p.h);
    var cD = project(p.x + hw, lat + hd, -p.h);
    var eD = project(p.x - hw, lat + hd, -p.h);

    var pal = PALETTES[p.colorIndex % PALETTES.length];

    // 两个可见侧面（横向 + 侧、前进 + 侧）
    quad(e, c, cD, eD, pal.sideA);
    quad(b, c, cD, bD, pal.sideB);

    // 顶面
    ctx.fillStyle = pal.top;
    topPath(a, b, c, e);
    ctx.fill();

    // 当前站立方块：金色描边；下一块目标：淡虚线引导
    if (index === state.curIndex) {
      ctx.strokeStyle = '#FFE9A8';
      ctx.lineWidth = 2.2;
      topPath(a, b, c, e);
      ctx.stroke();
    } else if (index === state.curIndex + 1) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(255,233,168,.55)';
      ctx.lineWidth = 1.4;
      topPath(a, b, c, e);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      topPath(a, b, c, e);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 中心标记：正中这里算完美落点
    var ctr = project(p.x, lat, 0);
    ctx.fillStyle = 'rgba(32,36,59,.42)';
    ctx.beginPath();
    ctx.arc(ctr.x, ctr.y, 2.3, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,253,248,.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ctr.x, ctr.y, 4.6, 0, 6.283);
    ctx.stroke();

    // 移动方块：顶面上画一小段横向双箭头，提示它会左右滑动
    if (p.moveAmp > 0) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = '#20243B';
      ctx.lineWidth = 1.4;
      var mx = ctr.x, my = ctr.y - 8;
      ctx.beginPath();
      ctx.moveTo(mx - 9, my); ctx.lineTo(mx + 9, my); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - 9, my); ctx.lineTo(mx - 5, my - 3);
      ctx.moveTo(mx - 9, my); ctx.lineTo(mx - 5, my + 3);
      ctx.moveTo(mx + 9, my); ctx.lineTo(mx + 5, my - 3);
      ctx.moveTo(mx + 9, my); ctx.lineTo(mx + 5, my + 3);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFlash() {
    var f = state.flash;
    var span = f.perfect ? 520 : 320;
    var k = clamp(1 - f.ms / span, 0, 1);
    var c = project(f.x, f.lateral, 0);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k) * (f.perfect ? 0.9 : 0.55);
    ctx.strokeStyle = f.perfect ? '#FFE9A8' : '#7FC8B0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 8 + k * 34, 4 + k * 17, 0, 0, 6.283);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlatforms() {
    // 远的先画、近的后画（方块按 x 递增，倒序遍历即可）
    for (var i = platforms.length - 1; i >= 0; i--) {
      var p = platforms[i];
      var dx = p.x - camX;
      if (dx < -150 || dx > 440) continue;
      drawOnePlatform(p, i);
    }
    if (state.flash.ms > 0) drawFlash();
  }

  /* ---------------- 绘制：小棋子 ---------------- */

  function drawHero() {
    var foot = project(hero.along, hero.lateral, hero.z);
    var sh = project(hero.along, hero.lateral, 0);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#0A0C18';
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y + 2, 13, 4.5, 0, 0, 6.283);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(foot.x, foot.y);
    var squash = (state.phase === 'charging') ? (1 - 0.4 * (state.charge / MAX_CHARGE)) : 1;
    ctx.scale(1, squash);

    var bw = 20, bh = 20;
    ctx.fillStyle = HERO.bodyDark;
    rrect(-bw / 2 - 1, -bh - 1, bw + 2, bh + 2, 7);
    ctx.fill();
    ctx.fillStyle = HERO.body;
    rrect(-bw / 2, -bh, bw, bh, 6);
    ctx.fill();
    ctx.fillStyle = HERO.shine;
    rrect(-bw / 2 + 3, -bh + 2, bw - 6, 5, 3);
    ctx.fill();

    ctx.fillStyle = HERO.eye;
    ctx.beginPath(); ctx.arc(-4, -bh * 0.55, 2.6, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -bh * 0.55, 2.6, 0, 6.283); ctx.fill();
    ctx.fillStyle = HERO.pupil;
    ctx.beginPath(); ctx.arc(-3.6, -bh * 0.55, 1.2, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(4.4, -bh * 0.55, 1.2, 0, 6.283); ctx.fill();

    ctx.restore();
  }

  /* ---------------- 绘制：蓄力条 / 提示 / 风力 ---------------- */

  function drawChargeUI() {
    if (state.status !== 'running') return;

    if (state.phase === 'standby') {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#C9CEE4';
      ctx.textAlign = 'center';
      ctx.font = '500 12px ' + FONT;
      ctx.fillText(t('msg_charge'), W / 2, H - 16);
      ctx.restore();
      return;
    }

    if (state.phase === 'charging') {
      // 预测落点圆环：只告诉玩家「会跳到哪」，是否命中由方块位置自己判断
      var predX = hero.along + state.charge * MAX_JUMP;
      var pr = project(predX, hero.lateral, 0);
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#FFE9A8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(pr.x, pr.y, 13, 6, 0, 0, 6.283);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      var bx = W * 0.18, bw = W * 0.64, by = H - 34, bh = 12;
      ctx.fillStyle = 'rgba(255,253,248,.16)';
      rrect(bx, by, bw, bh, 6);
      ctx.fill();
      var ratio = state.charge / MAX_CHARGE;
      var g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#7FC8B0');
      g.addColorStop(0.6, '#F3D08A');
      g.addColorStop(1, '#F2A38B');
      ctx.fillStyle = g;
      rrect(bx, by, Math.max(2, bw * ratio), bh, 6);
      ctx.fill();

      ctx.fillStyle = '#FFFDF8';
      ctx.font = '600 11px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText(t('label_power'), bx, by - 6);
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(ratio * 100) + '%', bx + bw, by - 6);
      ctx.textAlign = 'center';
      return;
    }

    if (state.phase === 'jumping' && state.jump.windVel !== 0) {
      var dir = state.jump.windVel > 0 ? 1 : -1;
      var wx = W / 2, wy = 30;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#9AA6E0';
      ctx.fillStyle = '#9AA6E0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wx - dir * 22, wy);
      ctx.lineTo(wx + dir * 20, wy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wx + dir * 20, wy);
      ctx.lineTo(wx + dir * 12, wy - 5);
      ctx.lineTo(wx + dir * 12, wy + 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function draw() {
    if (!ctx) return;
    drawBackground();
    drawPlatforms();
    drawHero();
    drawChargeUI();
  }

  /* ---------------- 蓄力 / 起跳 / 落点判定 ---------------- */

  function beginCharge() {
    if (state.status !== 'running' || state.phase !== 'standby') return;
    state.phase = 'charging';
    state.charge = 0;
    sfx('tick');
  }

  function releaseCharge() {
    if (state.status !== 'running' || state.phase !== 'charging') return;
    var d = diffDef();
    var dist = state.charge * MAX_JUMP;
    var j = state.jump;
    j.fromX = hero.along;
    j.toX = hero.along + dist;
    j.dist = dist;
    j.t = 0;
    j.peak = 40 + dist * 0.14;
    j.windVel = d.wind > 0 ? rand(-d.wind, d.wind) : 0;
    state.phase = 'jumping';
    sfx('whoosh');
    saveState(true);
  }

  function updateJump(dt) {
    var j = state.jump;
    j.t += dt / FLIGHT_T;
    if (j.t > 1) j.t = 1;
    hero.along = lerp(j.fromX, j.toX, j.t);
    hero.lateral += j.windVel * dt;
    hero.z = 4 * j.peak * j.t * (1 - j.t);
    if (j.t >= 1) {
      hero.z = 0;
      resolveLanding();
    }
  }

  /* [gyh 2026-11-09 新增] 落点判定：沿前进轴 + 横向二维，用方块实时位置 */
  function resolveLanding() {
    var d = diffDef();
    var target = platforms[state.curIndex + 1];
    if (!target) { gameOver(); return; }

    var tLat = platLateral(target, state.time);
    var dAlong = Math.abs(hero.along - target.x);
    var dLat = Math.abs(hero.lateral - tLat);
    var halfW = target.w / 2;
    var halfD = target.depth / 2;
    var landed = (dAlong <= halfW + LAND_TOL) && (dLat <= halfD + LAT_TOL);

    if (!landed) { gameOver(); return; }

    // 成功落点
    state.curIndex += 1;
    state.landings += 1;
    state.phase = 'standby';
    state.charge = 0;
    hero.along = target.x;
    hero.lateral = tLat;
    hero.z = 0;

    var perfect = (dAlong <= target.w * d.perfectPct + PERFECT_EASE) &&
      (dLat <= target.depth * d.perfectPct + LAT_PERFECT_EASE);

    var gain = BASE_SCORE;
    if (perfect) {
      state.combo += 1;                       // 连续完美叠连击
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      gain += PERFECT_BONUS * state.combo;    // 额外分 × 连击倍率
    }
    state.score += gain;
    if (!state.isRecord && state.score > state.bestAtStart) state.isRecord = true;

    ensurePlatforms();

    state.flash = { x: target.x, lateral: tLat, ms: perfect ? 520 : 320, perfect: perfect };
    sfx('drop');
    if (perfect) {
      if (state.combo >= 2) {
        showToast(tf('msg_combo', { score: state.combo }), 950);
        sfx('combo', 0, { combo: state.combo });
      } else {
        showToast(t('msg_perfect'), 900);
        sfx('perfect');
      }
      sfx('coin');
    } else {
      state.combo = 0;                        // 连击断了重置
      sfx('coin');
    }

    refreshHud();
    saveState(true);
  }

  /* ---------------- 每步推进 ---------------- */

  function step(dt) {
    if (state.status !== 'running') return;
    state.time += dt;
    if (state.flash.ms > 0) state.flash.ms -= dt * 1000;

    var cur = platforms[state.curIndex];
    if (cur) camX += (cur.x - camX) * Math.min(1, dt * 6);

    if (state.phase === 'charging') {
      state.charge = Math.min(MAX_CHARGE, state.charge + diffDef().chargeRate / CHARGE_TIME * dt);
      hero.along = cur.x;
    } else if (state.phase === 'jumping') {
      updateJump(dt);
    } else {
      hero.along = cur.x;
      hero.lateral = platLateral(cur, state.time);  // 站在移动方块上会随之晃动
      hero.z = 0;
    }
  }

  function frame(ts) {
    rafId = 0;
    if (!loopRunning) return;

    var dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
    lastTs = ts;
    acc += dt / 1000;
    var guard = 0;
    while (acc >= STEP && guard < 6) { step(STEP); acc -= STEP; guard++; }
    if (guard >= 6) acc = 0;

    draw();
    if (ts - hudTs > 80) { hudTs = ts; refreshHud(); }
    if (state.status === 'running' && Date.now() - lastSave > 700) saveState(false);

    rafId = window.requestAnimationFrame(frame);
  }

  /* ---------------- 记分板 / 卡片 / 结算 ---------------- */

  function refreshHud() {
    dom.score.textContent = String(state.score);
    dom.best.textContent = String(Math.max(state.bestAtStart, state.isRecord ? state.score : 0));
    dom.combo.textContent = String(state.combo);
    dom.height.textContent = String(state.curIndex);
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

  /* [gyh 2026-11-09 新增] 结算文案：win_sub / lose_sub 的占位符一律替换后再显示 */
  function renderResult() {
    var win = state.isRecord;
    setI18n(dom.overlayTitle, win ? 'win_title' : 'lose_title');
    dom.overlaySub.textContent = win
      ? tf('win_sub', { score: state.score, level: state.maxCombo })
      : tf('lose_sub', { score: state.score });
    dom.overlayScore.textContent = String(state.score);
    dom.overlayCombo.textContent = String(state.maxCombo);
    dom.recordBadge.hidden = !win;
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
    var d = diffDef();
    state.status = 'ready';
    state.phase = 'standby';
    state.score = 0;
    state.bestAtStart = state.best;
    state.isRecord = false;
    state.combo = 0;
    state.maxCombo = 0;
    state.landings = 0;
    state.curIndex = 0;
    state.time = 0;
    state.charge = 0;
    state.jump = { fromX: 0, toX: 0, t: 0, dist: 0, windVel: 0, peak: 0 };
    state.flash = { x: 0, lateral: 0, ms: 0, perfect: false };

    platforms = [];
    var startW = Math.round(d.platformW * 1.2);
    platforms.push({
      x: 0, w: startW, depth: Math.round(startW * PLAT_DEPTH_RATIO), h: PLAT_H,
      lateral: 0, moveAmp: 0, moveSpeed: 0, movePhase: 0, narrow: false, colorIndex: 0
    });
    ensurePlatforms();

    hero.along = 0;
    hero.lateral = 0;
    hero.z = 0;
    camX = 0;

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
    state.phase = 'standby';
    hideCard();
    syncButtons();
    sfx('start');
    saveState(true);
  }

  function pause() {
    if (state.status !== 'running') return;
    if (state.phase === 'charging') { state.phase = 'standby'; state.charge = 0; }
    state.status = 'paused';
    showCard('paused');
    syncButtons();
    saveState(true);
  }

  function resume() {
    if (state.status !== 'paused') return;
    state.status = 'running';
    state.phase = 'standby';        // 刷新 / 暂停后回到可蓄力，避免卡在半空
    var cur = platforms[state.curIndex];
    if (cur) { hero.along = cur.x; hero.lateral = platLateral(cur, state.time); hero.z = 0; }
    hideCard();
    syncButtons();
    saveState(true);
  }

  function gameOver() {
    if (state.status !== 'running') return;
    state.status = 'gameover';
    state.phase = 'standby';
    showToast(t('msg_miss'), 1000);
    sfx('lose');
    if (state.isRecord) {
      settleBest();
      later(function () { sfx('win'); }, 380);
    }
    showResult();
    syncButtons();
    refreshHud();
    saveState(true);           // 标记结束，刷新后不续玩
  }

  function restart() {
    newGame();
    start();
  }

  /* [gyh 2026-11-09 新增] 切档：同档也幂等落盘；清场后用页面内 toast 直接重开 */
  function switchDiff(diff) {
    if (!DIFF[diff]) return;
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) { /* ignore */ }
    if (diff === state.diff) return;

    var hadProgress = (state.status === 'running' || state.status === 'paused') && state.landings > 0;
    stopLoops();                 // 先清计时器 / 动画帧 / 旧 toast
    state.diff = diff;
    syncDiffs();
    sfx('toggle');
    newGame();                  // 清场 + 重开
    startLoop();
    if (hadProgress) showToast(t('confirm_diff'), 2200);   // 重开之后再创建显示
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    var ps = [];
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      ps.push({
        x: p.x, w: p.w, depth: p.depth, h: p.h, lateral: p.lateral,
        moveAmp: p.moveAmp, moveSpeed: p.moveSpeed, movePhase: p.movePhase,
        narrow: p.narrow, colorIndex: p.colorIndex
      });
    }
    return {
      v: STATE_V, diff: state.diff, status: state.status,
      ended: state.status === 'gameover',
      score: state.score, best: state.best, bestAtStart: state.bestAtStart,
      isRecord: state.isRecord, combo: state.combo, maxCombo: state.maxCombo,
      landings: state.landings, curIndex: state.curIndex,
      time: state.time, camX: camX, charge: state.charge, phase: state.phase,
      hero: { along: hero.along, lateral: hero.lateral, z: hero.z },
      jump: {
        fromX: state.jump.fromX, toX: state.jump.toX, t: state.jump.t,
        dist: state.jump.dist, windVel: state.jump.windVel, peak: state.jump.peak
      },
      flash: { x: state.flash.x, lateral: state.flash.lateral, ms: state.flash.ms, perfect: state.flash.perfect },
      platforms: ps
    };
  }

  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 250) return;
    lastSave = now;
    writeJSON(KEY_STATE, snapshot());
  }

  function loadState() {
    var s = readJSON(KEY_STATE, null);
    if (!s || typeof s !== 'object' || s.v !== STATE_V) return false;
    if (s.diff !== state.diff) return false;
    if (s.ended || s.status === 'gameover') return false;
    if (typeof s.score !== 'number' || s.score < 0 ||
        typeof s.curIndex !== 'number' || s.curIndex < 0 ||
        !Array.isArray(s.platforms)) return false;

    var ps = [];
    for (var i = 0; i < s.platforms.length; i++) {
      var p = s.platforms[i];
      if (!p || typeof p.x !== 'number' || typeof p.w !== 'number' || p.w <= 0) return false;
      ps.push({
        x: p.x, w: p.w,
        depth: (typeof p.depth === 'number' && p.depth > 0) ? p.depth : Math.round(p.w * PLAT_DEPTH_RATIO),
        h: (typeof p.h === 'number' && p.h > 0) ? p.h : PLAT_H,
        lateral: (typeof p.lateral === 'number') ? p.lateral : 0,
        moveAmp: (typeof p.moveAmp === 'number') ? p.moveAmp : 0,
        moveSpeed: (typeof p.moveSpeed === 'number') ? p.moveSpeed : 0,
        movePhase: (typeof p.movePhase === 'number') ? p.movePhase : 0,
        narrow: !!p.narrow,
        colorIndex: (typeof p.colorIndex === 'number') ? p.colorIndex : 0
      });
    }
    if (s.curIndex >= ps.length) return false;

    platforms = ps;
    state.score = Math.max(0, Math.floor(s.score));
    state.bestAtStart = state.best;
    state.isRecord = !!s.isRecord;
    state.combo = (typeof s.combo === 'number' && s.combo >= 0) ? Math.floor(s.combo) : 0;
    state.maxCombo = (typeof s.maxCombo === 'number' && s.maxCombo >= 0) ? Math.floor(s.maxCombo) : state.combo;
    state.landings = (typeof s.landings === 'number' && s.landings >= 0) ? Math.floor(s.landings) : 0;
    state.curIndex = Math.floor(s.curIndex);
    state.time = (typeof s.time === 'number' && s.time >= 0) ? s.time : 0;
    state.charge = 0;
    state.jump = { fromX: 0, toX: 0, t: 0, dist: 0, windVel: 0, peak: 0 };
    state.flash = { x: 0, lateral: 0, ms: 0, perfect: false };

    var cur = platforms[state.curIndex];
    hero.along = cur.x;
    hero.lateral = platLateral(cur, state.time);
    hero.z = 0;
    camX = cur.x;
    ensurePlatforms();

    // 刷新后一律先停在起始 / 暂停卡，不继承蓄力或半空跳跃
    state.phase = 'standby';
    if (state.landings > 0) { state.status = 'paused'; hideOverlay(); showCard('paused'); }
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
    if (k === ' ' || k === 'Spacebar') {
      if (tag === 'BUTTON' || tag === 'A') return;   // 让聚焦的按钮响应空格
      e.preventDefault();
      if (e.repeat) return;
      if (state.status === 'ready') { start(); return; }
      if (state.status === 'paused') { resume(); return; }
      if (state.status === 'gameover') { restart(); return; }
      if (state.status === 'running' && state.phase === 'standby') beginCharge();
      return;
    }
  }

  function onKeyUp(e) {
    var k = e.key;
    if (k === ' ' || k === 'Spacebar') {
      if (state.status === 'running' && state.phase === 'charging') releaseCharge();
    }
  }

  function onBlur() {
    if (state.status === 'running' && state.phase === 'charging') {
      state.phase = 'standby';
      state.charge = 0;
    }
  }

  function bindInput() {
    function onDown(e) {
      var tag = e.target && e.target.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' ||
          tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (state.status === 'ready') { start(); return; }
      if (state.status === 'paused') { resume(); return; }
      if (state.status === 'gameover') { restart(); return; }
      if (state.status === 'running') beginCharge();
      if (dom.stageWrap.setPointerCapture) {
        try { dom.stageWrap.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      }
    }
    function onUp() {
      if (state.status === 'running' && state.phase === 'charging') releaseCharge();
    }

    dom.stageWrap.addEventListener('pointerdown', onDown);
    // 舞台之外点任意位置同样能蓄力 / 开始，过滤按钮、链接、结算卡片与分享面板
    document.addEventListener('pointerdown', function (e) {
      if (dom.stageWrap.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.ys-share, .result')) return;
      onDown(e);
    });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    dom.btnStart.addEventListener('click', function () {
      saveState(true);          // 点击后立即写断点存档
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
    refreshHud();
    // canvas 内的 msg_charge / label_power 每帧用 t() 实时取，切语言后自动更新
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    dom = {
      canvas: $('canvas'),
      stageWrap: $('stage-wrap'),
      score: $('score'),
      best: $('best'),
      combo: $('combo'),
      height: $('height'),
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
      overlayCombo: $('overlay-combo'),
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
    syncDiffs();
    if (!loadState()) newGame();

    fitCanvas();
    bindInput();
    startLoop();

    document.addEventListener('ys:langchange', onLangChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
