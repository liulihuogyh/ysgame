/* ==========================================================================
   台球（Billiards）· 游戏逻辑
   - canvas 绘制，固定逻辑坐标系 600×340，按 devicePixelRatio 缩放、按容器宽度重算高度
   - 正经俯视 2D 台球：球-球弹性碰撞（按质量沿法线分解 + 位置修正防粘连）、
     球-库边反弹（袋口开口不反弹）、台呢指数摩擦、静止阈值
   - 六个袋口（四角 + 上下边中点），进袋判定 + 进袋收缩动画，白球落袋罚分并重新摆球
   - 拖杆瞄准：按住朝击球反方向拖动，虚线显示首撞点 / 目标球去向 / 反弹方向，
     力度条随拖动距离变化，松开出杆；键盘方向键微调、空格蓄力、P 暂停
   - 三档难度真正拉开：球数 / 袋口 / 摩擦 / 瞄准线 / 杆数上限 / 罚分 同时变化
   - 按难度分桶的断点续玩存档、最高分，切档幂等落盘 + 页面内 toast 重摆
   - 统一走全站音效引擎 window.YSound.play，纯 ES5
   [gyh 2026-11-09 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 几何常量 ---------------- */

  var W = 600, H = 340;
  var FRAME = 24;
  var TX = FRAME, TY = FRAME;
  var TW = W - 2 * FRAME, TH = H - 2 * FRAME;   // 台呢区 552×292
  var MID_X = TX + TW / 2;
  var R = 9.5;                                  // 球半径
  var HEAD_X = TX + TW * 0.26, HEAD_Y = TY + TH / 2;   // 开球点
  var FOOT_X = TX + TW * 0.70, FOOT_Y = TY + TH / 2;   // 置球点

  var CUSHION = 0.84;          // 库边恢复系数
  var BALL_E = 0.94;           // 球-球恢复系数
  var STOP_SPEED = 9;          // 静止阈值（逻辑像素/秒）
  var MAX_SPEED = 860;         // 满力击球初速（逻辑像素/秒）
  var STEP = 1 / 160;          // 固定物理步长（秒），每步位移远小于球直径，杜绝穿透
  var CHARGE_TIME = 1.05;      // 空格蓄满所需秒数
  var STATE_V = 1;

  var KEY_STATE = 'ysgame-billiards-state';
  var KEY_BEST = 'ysgame-billiards-best';
  var KEY_DIFF = 'ysgame-billiards-diff';

  var FONT = 'system-ui, -apple-system, sans-serif';

  /* ---------------- 三档难度（球数/袋口/摩擦/辅助线/杆数/罚分 同时变化） ---------------- */
  /* [gyh 2026-11-09 新增] */
  var DIFF = {
    // 简单：4 球、大袋口、低摩擦（滚得远）、完整辅助线、无杆数上限、罚 1 分
    easy:   { balls: 4, pocket: 24, friction: 0.85, aim: 'full',  shotLimit: 0,  foul: 1, maxDrag: 200 },
    // 中等：6 球、标准袋口、中等摩擦、只画首撞点、24 杆上限、罚 1 分
    medium: { balls: 6, pocket: 19, friction: 1.40, aim: 'first', shotLimit: 24, foul: 1, maxDrag: 170 },
    // 困难：9 球、窄袋口、高摩擦（要算力度）、短距离指示、16 杆上限、白球落袋罚 2 分
    hard:   { balls: 9, pocket: 15, friction: 2.10, aim: 'short', shotLimit: 16, foul: 2, maxDrag: 150 }
  };

  /* ---------------- 原创配色（纯 canvas 绘制，无图片/字体/CDN） ---------------- */

  var TABLE = {
    frameHi: '#8A6244', frameLo: '#4A3122',
    cushion: '#1C4636', cushionHi: '#35694F',
    clothA: '#356F52', clothB: '#2A5B43',
    pocket: '#121816', pocketRim: '#0B100D'
  };
  var CUE = '#FBF8F0';
  var BALL_COLORS = [
    '#C0654F', '#D6A24A', '#3E7A63', '#4A6FA5', '#8A6A9B', '#C87A4A',
    '#5E9098', '#8A5A44', '#C08A86', '#7E9A86', '#B08AAE', '#9FB2B8'
  ];

  // 六个袋口：四角 + 上/下边中点
  var POCKETS = [
    { x: TX,       y: TY },
    { x: MID_X,    y: TY },
    { x: TX + TW,  y: TY },
    { x: TX,       y: TY + TH },
    { x: MID_X,    y: TY + TH },
    { x: TX + TW,  y: TY + TH }
  ];

  /* ---------------- 状态 ---------------- */

  var state = {
    diff: 'medium',
    status: 'aiming',   // aiming | rolling | paused | win | lose
    prevStatus: 'aiming',
    result: '',
    cardKind: '',       // '' | 'ready' | 'paused'
    score: 0,
    shots: 0,
    isRecord: false,
    bestAtStart: 0,
    cuePotted: false,   // 白球已落袋、待球停稳后重摆
    balls: [],
    anims: []
  };

  var aim = {
    angle: 0, power: 0, active: false, dragging: false,
    startX: 0, startY: 0, pointerId: null
  };
  var charging = false;

  var dom = {};
  var ctx = null;
  var rafId = 0;
  var lastTs = 0;
  var acc = 0;
  var lastSave = 0;
  var lastSaveTs = 0;
  var toastTimer = 0;
  var lastSfx = {};

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
  function diffDef() { return DIFF[state.diff] || DIFF.medium; }
  function shotLimit() { return diffDef().shotLimit; }
  function mouth() { return diffDef().pocket * 0.85; }
  function ballColor(n) { return BALL_COLORS[(n - 1) % BALL_COLORS.length]; }
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

  // 动态文案：同时挂 data-i18n，切语言时 I18N.apply() 会自动重绘
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

  /* ---------------- 最高分（按难度分开存） ---------------- */

  function readBest() {
    var b = readJSON(KEY_BEST, null);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return {};
    return b;
  }
  function bestOf(d) {
    var b = readBest();
    return (typeof b[d] === 'number' && b[d] > 0) ? b[d] : 0;
  }
  function ensureBest() {
    var b = readJSON(KEY_BEST, null);
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      writeJSON(KEY_BEST, { easy: 0, medium: 0, hard: 0 });
    }
  }
  function settleBest() {
    if (!state.isRecord) return;
    var b = readBest();
    if (state.score > (b[state.diff] || 0)) {
      b[state.diff] = state.score;
      writeJSON(KEY_BEST, b);
    }
  }
  function markRecord() {
    if (!state.isRecord && state.score > state.bestAtStart) {
      state.isRecord = true;
      settleBest();
      sfx('perfect');
    }
  }

  /* ---------------- 球 / 球堆 ---------------- */

  function makeBall(x, y, n, cue) {
    return { x: x, y: y, vx: 0, vy: 0, n: n, cue: !!cue, mass: 1 };
  }

  // 三角形球堆：顶点朝白球方向，逐行向右展开
  function rack(n) {
    var out = [], gap = 2 * R + 1.4, placed = 0, row = 0;
    while (placed < n) {
      for (var k = 0; k <= row && placed < n; k++) {
        out.push(makeBall(
          FOOT_X + row * gap * 0.87,
          FOOT_Y + (k - row / 2) * gap,
          placed + 1, false
        ));
        placed++;
      }
      row++;
    }
    return out;
  }

  function getCue() {
    for (var i = 0; i < state.balls.length; i++) {
      if (state.balls[i].cue) return state.balls[i];
    }
    return null;
  }
  function targetCount() {
    var n = 0;
    for (var i = 0; i < state.balls.length; i++) if (!state.balls[i].cue) n++;
    return n;
  }
  function allStopped() {
    for (var i = 0; i < state.balls.length; i++) {
      if (state.balls[i].vx !== 0 || state.balls[i].vy !== 0) return false;
    }
    return true;
  }

  function spotFree(x, y) {
    if (x < TX + R || x > TX + TW - R || y < TY + R || y > TY + TH - R) return false;
    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i], dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < (2 * R + 1) * (2 * R + 1)) return false;
    }
    return true;
  }

  // 白球落袋后重新摆球，尽量放回开球点，被占则就近找空位
  function respotCue() {
    var x = HEAD_X, y = HEAD_Y;
    if (!spotFree(x, y)) {
      var found = false;
      for (var dy = -1; dy <= 1 && !found; dy++) {
        for (var dx = 0; dx <= 6 && !found; dx++) {
          var nx = HEAD_X + dx * (2 * R + 2), ny = HEAD_Y + dy * (2 * R + 2);
          if (spotFree(nx, ny)) { x = nx; y = ny; found = true; }
        }
      }
      if (!found) { x = TX + TW * 0.5; y = TY + TH * 0.5; }
    }
    state.balls.push(makeBall(x, y, 0, true));
    sfx('place', 80);
  }

  /* ---------------- 袋口开口 / 碰撞几何 ---------------- */

  function openOnLeft(b, mh) {
    return Math.abs(b.y - TY) < mh || Math.abs(b.y - (TY + TH)) < mh;
  }
  function openOnRight(b, mh) {
    return Math.abs(b.y - TY) < mh || Math.abs(b.y - (TY + TH)) < mh;
  }
  function openOnTop(b, mh) {
    return Math.abs(b.x - TX) < mh || Math.abs(b.x - (TX + TW)) < mh || Math.abs(b.x - MID_X) < mh;
  }
  function openOnBottom(b, mh) {
    return Math.abs(b.x - TX) < mh || Math.abs(b.x - (TX + TW)) < mh || Math.abs(b.x - MID_X) < mh;
  }

  function nearestPocket(b) {
    var best = POCKETS[0], bd = Infinity;
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i], dx = b.x - p.x, dy = b.y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = POCKETS[i]; }
    }
    return best;
  }
  function potCandidate(b) {
    var cap2 = diffDef().pocket * diffDef().pocket;
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i], dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < cap2) return p;
    }
    return null;
  }
  // 球心越过库边线（只可能发生在袋口开口走廊内）→ 兜底判进最近袋，杜绝卡在库边外
  function outOfTable(b) {
    return b.x < TX - 0.5 || b.x > TX + TW + 0.5 || b.y < TY - 0.5 || b.y > TY + TH + 0.5;
  }

  /* ---------------- 物理：库边反弹 ---------------- */

  function wallBounce(b) {
    var mh = mouth(), bounced = false;
    // 垂直库边（左右）：只有角袋开口
    if (b.x - R < TX) {
      if (!openOnLeft(b, mh)) { b.x = TX + R; b.vx = Math.abs(b.vx) * CUSHION; bounced = true; }
    } else if (b.x + R > TX + TW) {
      if (!openOnRight(b, mh)) { b.x = TX + TW - R; b.vx = -Math.abs(b.vx) * CUSHION; bounced = true; }
    }
    // 水平库边（上下）：角袋 + 中袋开口
    if (b.y - R < TY) {
      if (!openOnTop(b, mh)) { b.y = TY + R; b.vy = Math.abs(b.vy) * CUSHION; bounced = true; }
    } else if (b.y + R > TY + TH) {
      if (!openOnBottom(b, mh)) { b.y = TY + TH - R; b.vy = -Math.abs(b.vy) * CUSHION; bounced = true; }
    }
    if (bounced) sfx('bounce', 45);
  }

  /* ---------------- 物理：球-球弹性碰撞 ---------------- */
  /* [gyh 2026-11-09 新增] 沿法线分解冲量（等质量），并按质量反比做位置修正防粘连 */
  function collideBalls() {
    var balls = state.balls, min = 2 * R, min2 = min * min;
    for (var i = 0; i < balls.length; i++) {
      for (var j = i + 1; j < balls.length; j++) {
        var a = balls[i], b = balls[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d2 = dx * dx + dy * dy;
        if (d2 >= min2) continue;
        var d = Math.sqrt(d2), nx, ny;
        if (d < 1e-6) { nx = 1; ny = 0; d = 0; }
        else { nx = dx / d; ny = dy / d; }

        // 位置修正：按质量反比把两球分开，避免重叠粘连
        var overlap = min - d;
        var im1 = 1 / a.mass, im2 = 1 / b.mass, imSum = im1 + im2;
        a.x -= nx * overlap * (im1 / imSum);
        a.y -= ny * overlap * (im1 / imSum);
        b.x += nx * overlap * (im2 / imSum);
        b.y += ny * overlap * (im2 / imSum);

        // 相对速度沿法线分量；分离中则不再施加冲量
        var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        var vn = rvx * nx + rvy * ny;
        if (vn > 0) continue;
        var jimp = -(1 + BALL_E) * vn / imSum;
        a.vx -= jimp * im1 * nx; a.vy -= jimp * im1 * ny;
        b.vx += jimp * im2 * nx; b.vy += jimp * im2 * ny;
        sfx('bounce', 40);
      }
    }
  }

  /* ---------------- 物理：进袋处理 ---------------- */

  function handlePots(potted) {
    var hadFoul = false, scored = false;
    for (var i = 0; i < potted.length; i++) {
      var b = potted[i].ball, p = potted[i].pocket;
      var idx = state.balls.indexOf(b);
      if (idx >= 0) state.balls.splice(idx, 1);
      // 进袋动画：向袋口中心收缩并缩小淡出
      state.anims.push({
        x: b.x, y: b.y, tx: p.x, ty: p.y,
        color: b.cue ? CUE : ballColor(b.n),
        life: 0.36, max: 0.36
      });
      if (b.cue) {
        hadFoul = true;
        state.cuePotted = true;
        state.score -= diffDef().foul;
        if (state.score < 0) state.score = 0;
        sfx('warn');
      } else {
        state.score += 10;
        scored = true;
        sfx('drop', 40);
      }
    }
    if (hadFoul) showToast(t('msg_foul'));
    else if (scored) showToast(t('msg_potted'));
    if (scored) { sfx('coin', 60); markRecord(); }
    refreshHud();
    saveState(true);   // 进袋是关键事件，立即落盘
  }

  /* ---------------- 物理：固定步长推进 ---------------- */

  function physicsStep(dt) {
    var i, b;
    var damp = Math.exp(-diffDef().friction * dt);
    for (i = 0; i < state.balls.length; i++) {
      b = state.balls[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= damp; b.vy *= damp;
      if (Math.sqrt(b.vx * b.vx + b.vy * b.vy) < STOP_SPEED) { b.vx = 0; b.vy = 0; }
    }

    collideBalls();
    for (i = 0; i < state.balls.length; i++) wallBounce(state.balls[i]);

    var potted = [];
    for (i = state.balls.length - 1; i >= 0; i--) {
      b = state.balls[i];
      var p = potCandidate(b);
      if (!p && outOfTable(b)) p = nearestPocket(b);   // 兜底：开口飞出必进最近袋
      if (p) potted.push({ ball: b, pocket: p });
    }
    if (potted.length) handlePots(potted);
  }

  // 一杆结束（球全部停稳）：重摆白球 / 判清台 / 判杆数用尽
  function settle() {
    if (state.status !== 'rolling') return;
    if (state.anims.length > 0) return;   // 等进袋动画播完
    for (var i = 0; i < state.balls.length; i++) {
      state.balls[i].vx = 0; state.balls[i].vy = 0;
    }
    if (state.cuePotted) { respotCue(); state.cuePotted = false; }
    if (targetCount() === 0) { win(); return; }
    if (shotLimit() > 0 && state.shots >= shotLimit()) { lose(); return; }
    state.status = 'aiming';
    refreshHud();
    saveState(true);
  }

  /* ---------------- 出杆 ---------------- */

  function canShoot() {
    return state.status === 'aiming' && dom.card.hidden &&
      !state.cuePotted && getCue() !== null && allStopped();
  }

  function fire(power, angle) {
    if (!canShoot()) {
      if (state.status === 'rolling') showToast(t('msg_no_moves'));
      else if (state.cuePotted) showToast(t('msg_invalid'));
      return;
    }
    var cue = getCue();
    var sp = MAX_SPEED * clamp(power, 0.06, 1);
    cue.vx = Math.cos(angle) * sp;
    cue.vy = Math.sin(angle) * sp;
    state.shots += 1;
    state.status = 'rolling';
    aim.active = false; aim.dragging = false; aim.power = 0;
    charging = false;
    syncPower(false);
    sfx('whoosh');
    refreshHud();
    saveState(true);
  }

  /* ---------------- 瞄准射线：求白球第一接触点 ---------------- */

  function firstContact(cx, cy, dx, dy) {
    var cands = [], i, t, along;
    // 目标球：当作半径 2R 的膨胀圆，求射线最近正交点
    for (i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      if (b.cue) continue;
      var ox = cx - b.x, oy = cy - b.y;
      var bq = ox * dx + oy * dy;
      var cq = ox * ox + oy * oy - (2 * R) * (2 * R);
      var disc = bq * bq - cq;
      if (disc < 0) continue;
      t = -bq - Math.sqrt(disc);
      if (t > 0.001) cands.push({ t: t, type: 'ball', ball: b });
    }
    // 库边：球心可达矩形 [TX+R, TX+TW-R] × [TY+R, TY+TH-R]
    var xmin = TX + R, xmax = TX + TW - R, ymin = TY + R, ymax = TY + TH - R;
    if (dx > 1e-6) {
      t = (xmax - cx) / dx; along = cy + t * dy;
      if (t > 0.001 && along >= ymin && along <= ymax) cands.push({ t: t, type: 'wall', nx: -1, ny: 0 });
    } else if (dx < -1e-6) {
      t = (xmin - cx) / dx; along = cy + t * dy;
      if (t > 0.001 && along >= ymin && along <= ymax) cands.push({ t: t, type: 'wall', nx: 1, ny: 0 });
    }
    if (dy > 1e-6) {
      t = (ymax - cy) / dy; along = cx + t * dx;
      if (t > 0.001 && along >= xmin && along <= xmax) cands.push({ t: t, type: 'wall', nx: 0, ny: -1 });
    } else if (dy < -1e-6) {
      t = (ymin - cy) / dy; along = cx + t * dx;
      if (t > 0.001 && along >= xmin && along <= xmax) cands.push({ t: t, type: 'wall', nx: 0, ny: 1 });
    }
    var best = null;
    for (i = 0; i < cands.length; i++) {
      if (!best || cands[i].t < best.t) best = cands[i];
    }
    if (!best) best = { t: 0, type: 'wall', nx: -dx, ny: -dy, ball: null };
    best.px = cx + dx * best.t;
    best.py = cy + dy * best.t;
    return best;
  }

  /* ---------------- 绘制 ---------------- */

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

  function drawPockets() {
    var cap = diffDef().pocket;
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i];
      ctx.fillStyle = TABLE.pocketRim;
      ctx.beginPath(); ctx.arc(p.x, p.y, cap + 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = TABLE.pocket;
      ctx.beginPath(); ctx.arc(p.x, p.y, cap, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,253,248,.10)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, cap - 1.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  }

  function drawTable() {
    ctx.clearRect(0, 0, W, H);
    // 木框
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, TABLE.frameHi); g.addColorStop(1, TABLE.frameLo);
    ctx.fillStyle = g; rrect(0, 0, W, H, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(255,235,205,.18)'; ctx.lineWidth = 2;
    rrect(3, 3, W - 6, H - 6, 17); ctx.stroke();
    // 库边橡胶
    ctx.fillStyle = TABLE.cushion; rrect(TX - 6, TY - 6, TW + 12, TH + 12, 12); ctx.fill();
    ctx.strokeStyle = TABLE.cushionHi; ctx.lineWidth = 2;
    rrect(TX - 6, TY - 6, TW + 12, TH + 12, 12); ctx.stroke();
    // 台呢
    var cg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
    cg.addColorStop(0, TABLE.clothA); cg.addColorStop(1, TABLE.clothB);
    ctx.fillStyle = cg; ctx.fillRect(TX, TY, TW, TH);
    // 台呢细斜纹（原创）
    ctx.save(); ctx.globalAlpha = 0.045; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    for (var x = TX + 8; x < TX + TW; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, TY); ctx.lineTo(x - 10, TY + TH); ctx.stroke();
    }
    ctx.restore();
    // 开球线 + 置球点
    ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = '#F4ECDA'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(HEAD_X, TY + R); ctx.lineTo(HEAD_X, TY + TH - R); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
    ctx.fillStyle = 'rgba(244,236,218,.35)';
    ctx.beginPath(); ctx.arc(HEAD_X, HEAD_Y, 2.4, 0, Math.PI * 2); ctx.fill();
    drawPockets();
  }

  function drawCueStick(cue, dx, dy) {
    var pull = R + 3 + aim.power * 60;       // 后撤距离随力度变化
    var tipX = cue.x - dx * pull, tipY = cue.y - dy * pull;
    var endX = cue.x - dx * (pull + 120), endY = cue.y - dy * (pull + 120);
    ctx.save(); ctx.lineCap = 'round';
    var g = ctx.createLinearGradient(tipX, tipY, endX, endY);
    g.addColorStop(0, '#C9A57A'); g.addColorStop(0.12, '#E8D2AE'); g.addColorStop(1, '#6B4A32');
    ctx.strokeStyle = g; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.strokeStyle = '#5E7A86'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX - dx * 3, tipY - dy * 3); ctx.stroke();
    ctx.restore();
  }

  function drawAim() {
    if (state.status !== 'aiming' || !aim.active) return;
    var cue = getCue();
    if (!cue) return;
    var dx = Math.cos(aim.angle), dy = Math.sin(aim.angle);
    var mode = diffDef().aim;
    var fc = firstContact(cue.x, cue.y, dx, dy);
    // hard 只给短距离指示，但仍以首撞点为上限，避免虚线穿出库边
    var len = (mode === 'short') ? Math.min(70, fc.t) : fc.t;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,253,248,.82)'; ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(cue.x + dx * len, cue.y + dy * len); ctx.stroke();
    ctx.setLineDash([]);

    if (mode !== 'short' && fc) {
      // 幽灵白球标出首撞点
      ctx.strokeStyle = 'rgba(255,253,248,.7)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cue.x + dx * len, cue.y + dy * len, R, 0, Math.PI * 2); ctx.stroke();
      if (mode === 'full') {
        if (fc.type === 'ball' && fc.ball) {
          // 目标球去向（沿碰撞法线）+ 白球分离方向（切线分量）
          var nx = fc.ball.x - fc.px, ny = fc.ball.y - fc.py;
          var nd = Math.sqrt(nx * nx + ny * ny) || 1; nx /= nd; ny /= nd;
          var dot = dx * nx + dy * ny;
          var tx = dx - dot * nx, ty = dy - dot * ny;
          var td = Math.sqrt(tx * tx + ty * ty) || 1; tx /= td; ty /= td;
          ctx.strokeStyle = 'rgba(230,197,100,.9)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(fc.px, fc.py); ctx.lineTo(fc.px + nx * 46, fc.py + ny * 46); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,253,248,.55)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(fc.px, fc.py); ctx.lineTo(fc.px + tx * 40, fc.py + ty * 40); ctx.stroke();
        } else {
          // 撞库反弹方向
          var dotW = dx * fc.nx + dy * fc.ny;
          var rx = dx - 2 * dotW * fc.nx, ry = dy - 2 * dotW * fc.ny;
          ctx.strokeStyle = 'rgba(143,191,140,.92)'; ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.moveTo(fc.px, fc.py); ctx.lineTo(fc.px + rx * 52, fc.py + ry * 52); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    ctx.restore();
    drawCueStick(cue, dx, dy);
  }

  function drawBalls() {
    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      ctx.fillStyle = 'rgba(10,20,14,.22)';
      ctx.beginPath(); ctx.ellipse(b.x + 1.5, b.y + 2.5, R * 0.95, R * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b.cue ? CUE : ballColor(b.n);
      ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(20,30,24,.25)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(b.x - R * 0.32, b.y - R * 0.34, R * 0.3, 0, Math.PI * 2); ctx.fill();
      if (!b.cue) {
        ctx.fillStyle = 'rgba(250,247,238,.92)';
        ctx.beginPath(); ctx.arc(b.x, b.y, R * 0.52, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3A4442';
        ctx.font = '600 ' + Math.round(R * 0.8) + 'px ' + FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(b.n), b.x, b.y + 0.5);
      }
    }
  }

  function drawAnims() {
    for (var i = 0; i < state.anims.length; i++) {
      var a = state.anims[i];
      var u = 1 - a.life / a.max;   // 0 → 1
      var cx = a.x + (a.tx - a.x) * u, cy = a.y + (a.ty - a.y) * u;
      var rr = R * (1 - u * 0.85);
      ctx.save(); ctx.globalAlpha = 1 - u * 0.4;
      ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, rr), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(cx - rr * 0.3, cy - rr * 0.3, rr * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawHint() {
    if (state.status !== 'aiming' || aim.active) return;
    ctx.save();
    ctx.fillStyle = 'rgba(244,236,218,.55)';
    ctx.font = '500 12px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('msg_aim'), W / 2, TY + TH - 16);
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    drawTable();
    drawAim();
    drawBalls();
    drawAnims();
    drawHint();
  }

  /* ---------------- canvas 尺寸 / DPR ---------------- */

  function fitCanvas() {
    var rect = dom.canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.round(cssW * H / W);   // 按容器宽度重算高度，保持球桌宽高比
    dom.canvas.style.height = cssH + 'px';
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    if (dom.canvas.width !== pw || dom.canvas.height !== ph) {
      dom.canvas.width = pw; dom.canvas.height = ph;
    }
    ctx = dom.canvas.getContext('2d');
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
    draw();
  }

  function toLogical(cx, cy) {
    var rect = dom.canvas.getBoundingClientRect();
    var sx = rect.width ? W / rect.width : 1;
    var sy = rect.height ? H / rect.height : 1;
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
  }

  /* ---------------- 记分板 / 卡片 / 结算 ---------------- */

  function refreshHud() {
    dom.score.textContent = String(state.score);
    dom.balls.textContent = String(targetCount());
    dom.shots.textContent = shotLimit() > 0 ? (state.shots + '/' + shotLimit()) : String(state.shots);
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
    setI18n(dom.btnPause, state.status === 'paused' ? 'btn_resume' : 'btn_pause');
    dom.btnPause.disabled = !(state.status === 'aiming' || state.status === 'rolling' || state.status === 'paused');
  }

  function syncPower(on, power) {
    if (power === undefined) power = aim.power;
    if (on) {
      dom.power.classList.add('is-on');
      dom.powerFill.style.width = Math.round(clamp(power, 0, 1) * 100) + '%';
    } else {
      dom.power.classList.remove('is-on');
      dom.powerFill.style.width = '0%';
    }
  }

  function showToast(text) {
    clearToastTimer();
    dom.toast.textContent = text;
    dom.toast.hidden = false;
    toastTimer = window.setTimeout(function () { dom.toast.hidden = true; }, 2000);
  }
  function clearToastTimer() {
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = 0; }
  }

  function showCard(kind) {
    state.cardKind = kind;
    dom.card.hidden = false;
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
  function hideCard() { dom.card.hidden = true; state.cardKind = ''; }

  // 副标题带占位符，必须自己 tf 替换后再显示
  function renderResult() {
    var winGame = state.result === 'win';
    setI18n(dom.overlayTitle, winGame ? 'win_title' : 'lose_title');
    dom.overlaySub.textContent = winGame
      ? tf('win_sub', { score: state.score, level: state.shots })
      : tf('lose_sub', { score: state.score });
    dom.overlayScore.textContent = String(state.score);
    dom.overlayShots.textContent = String(state.shots);
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

  function newGame(welcome) {
    state.anims = [];
    state.cuePotted = false;
    state.score = 0;
    state.shots = 0;
    state.result = '';
    state.isRecord = false;
    state.bestAtStart = bestOf(state.diff);
    state.balls = rack(diffDef().balls).concat([makeBall(HEAD_X, HEAD_Y, 0, true)]);
    aim.angle = 0; aim.power = 0; aim.active = false; aim.dragging = false; aim.pointerId = null;
    charging = false;
    state.status = 'aiming';
    state.prevStatus = 'aiming';
    dom.overlay.hidden = true;
    dom.recordBadge.hidden = true;
    syncPower(false);
    // [gyh 2026-11-09 修改] newGame 绝不碰 toast，避免清掉切档提示
    if (welcome) showCard('ready'); else hideCard();
    syncButtons();
    refreshHud();
    saveState(true);   // 开局即写入存档
  }

  // 主按钮：点击后立即写状态；按当前状态决定开始 / 继续 / 重开
  function primaryAction() {
    sfx('click');
    saveState(true);   // [gyh 2026-11-09 新增] 满足 #btn-start 点击立即落盘
    if (state.status === 'paused') resume();
    else if (state.status === 'win' || state.status === 'lose') newGame(false);
    else if (!dom.card.hidden) hideCard();   // 欢迎卡 → 进入可击球状态
  }

  function pause() {
    if (state.status !== 'aiming' && state.status !== 'rolling') return;
    state.prevStatus = state.status;
    state.status = 'paused';
    aimUp(false);
    showCard('paused');
    syncButtons();
    saveState(true);
  }
  function resume() {
    if (state.status !== 'paused') return;
    state.status = (state.prevStatus === 'rolling' && !allStopped()) ? 'rolling' : 'aiming';
    hideCard();
    syncButtons();
    saveState(true);
  }

  function win() {
    state.status = 'win'; state.result = 'win';
    sfx('win'); sfx('levelup', 120);
    settleBest();
    showResult();
    refreshHud();
    saveState(true);
  }
  function lose() {
    state.status = 'lose'; state.result = 'lose';
    sfx('lose');
    settleBest();
    showResult();
    refreshHud();
    saveState(true);
  }

  /* [gyh 2026-11-09 新增] 切档：幂等落盘 + 停循环清定时器 + 重摆 + 重开后显示页面内 toast */
  function switchDiff(diff) {
    if (!DIFF[diff]) return;
    try { window.localStorage.setItem(KEY_DIFF, diff); } catch (e) { /* ignore */ }
    stopLoop();              // 先取消 rAF，避免旧物理循环继续写状态
    clearToastTimer();       // 清掉旧提示定时器
    state.diff = diff;
    syncDiffs();
    sfx('toggle');
    newGame(false);          // 重摆一局（内部清场 / 隐藏卡片 / 落盘）
    showToast(t('confirm_diff'));   // toast 必须在重开/清场之后创建显示
    startLoop();
  }

  /* ---------------- 存档 ---------------- */

  function snapshot() {
    var balls = [];
    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      balls.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, n: b.n, cue: b.cue });
    }
    return {
      v: STATE_V, diff: state.diff, status: state.status, result: state.result,
      score: state.score, shots: state.shots, remain: targetCount(),
      isRecord: state.isRecord, cuePotted: state.cuePotted,
      angle: aim.angle, balls: balls
    };
  }

  function saveState(force) {
    var now = Date.now();
    if (!force && now - lastSave < 150) return;
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
    if (!s || typeof s !== 'object' || !Array.isArray(s.balls)) return false;
    if (typeof s.score !== 'number' || typeof s.shots !== 'number') return false;

    state.balls = [];
    var hasCue = false;
    for (var i = 0; i < s.balls.length; i++) {
      var b = s.balls[i];
      if (!b || typeof b.x !== 'number' || typeof b.y !== 'number') return false;
      var cue = !!b.cue;
      if (cue) hasCue = true;
      state.balls.push({
        x: clamp(b.x, TX + R, TX + TW - R),
        y: clamp(b.y, TY + R, TY + TH - R),
        vx: 0, vy: 0,   // 刷新恢复台面位置，速度清零，避免切后台回来球乱飞
        n: (typeof b.n === 'number') ? b.n : (i + 1),
        cue: cue, mass: 1
      });
    }
    state.score = Math.max(0, Math.floor(s.score));
    state.shots = Math.max(0, Math.floor(s.shots));
    state.isRecord = !!s.isRecord;
    // 恢复后台面必须立即能击球：不继承"白球落袋待重摆"，缺白球就补摆一颗
    state.cuePotted = false;
    if (!hasCue) respotCue();
    state.bestAtStart = bestOf(state.diff);
    aim.angle = (typeof s.angle === 'number') ? s.angle : 0;
    aim.power = 0; aim.active = false; aim.dragging = false;
    state.anims = [];
    state.result = (s.result === 'win' || s.result === 'lose') ? s.result : '';

    if (state.result === 'win' || s.status === 'win') { state.status = 'win'; showResult(); }
    else if (state.result === 'lose' || s.status === 'lose') { state.status = 'lose'; showResult(); }
    else {
      state.status = 'aiming'; state.result = '';
      dom.overlay.hidden = true;
      hideCard();   // 恢复台面后直接可击球
    }
    syncButtons();
    refreshHud();
    return true;
  }

  /* ---------------- 输入：拖杆 / 键盘 ---------------- */

  function aimDown(cx, cy) {
    if (state.status !== 'aiming' || !dom.card.hidden) return false;
    if (!canShoot()) {
      if (state.cuePotted) showToast(t('msg_invalid'));
      return false;
    }
    aim.dragging = true; aim.active = true;
    aim.startX = cx; aim.startY = cy; aim.power = 0;
    syncPower(true, 0);
    return true;
  }
  function aimMove(cx, cy) {
    if (!aim.dragging) return;
    var vx = aim.startX - cx, vy = aim.startY - cy;   // 击球方向 = 拖动反方向
    var len = Math.sqrt(vx * vx + vy * vy);
    if (len > 1) aim.angle = Math.atan2(vy, vx);
    aim.power = clamp(len / diffDef().maxDrag, 0, 1);
    syncPower(true, aim.power);
  }
  function aimUp(doFire) {
    if (!aim.dragging) return;
    aim.dragging = false;
    var power = aim.power;
    aim.active = false;
    aim.pointerId = null;
    if (!doFire || power < 0.05) { syncPower(false); return; }
    fire(power, aim.angle);
  }

  function onPointerDown(e) {
    var p = toLogical(e.clientX, e.clientY);
    if (aimDown(p.x, p.y)) {
      aim.pointerId = e.pointerId;
      if (dom.canvas.setPointerCapture) {
        try { dom.canvas.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      }
      e.preventDefault();
    }
  }
  function onPointerMove(e) {
    if (!aim.dragging) return;
    if (aim.pointerId != null && e.pointerId != null && e.pointerId !== aim.pointerId) return;
    var p = toLogical(e.clientX, e.clientY);
    aimMove(p.x, p.y);
    e.preventDefault();
  }
  function onPointerUp() { if (aim.dragging) aimUp(true); }
  function onPointerCancel() { if (aim.dragging) aimUp(false); }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var k = e.key;

    if (k === 'p' || k === 'P') {
      e.preventDefault();
      if (state.status === 'paused') resume();
      else if (state.status === 'aiming' || state.status === 'rolling') pause();
      return;
    }
    if (k === ' ' || k === 'Spacebar') {
      if (tag === 'BUTTON' || tag === 'A') return;   // 让聚焦的按钮响应空格
      e.preventDefault();
      if (e.repeat) return;
      if (state.status === 'paused') { resume(); return; }
      if (state.status === 'win' || state.status === 'lose') { newGame(false); return; }
      if (!dom.card.hidden) { primaryAction(); return; }
      if (state.status === 'aiming' && canShoot()) {
        charging = true; aim.active = true; aim.power = 0;
        syncPower(true, 0);
      } else if (state.status === 'rolling') {
        showToast(t('msg_no_moves'));
      }
      return;
    }
    // 方向键微调瞄准角度，并显示辅助线
    var d = 0;
    if (k === 'ArrowLeft') d = -0.03;
    else if (k === 'ArrowRight') d = 0.03;
    else if (k === 'ArrowUp') d = -0.012;
    else if (k === 'ArrowDown') d = 0.012;
    if (d !== 0) {
      if (state.status !== 'aiming' || !dom.card.hidden) return;
      e.preventDefault();
      aim.angle += d;
      aim.active = true;
      syncPower(true, aim.power);
    }
  }
  function onKeyUp(e) {
    if (e.key === ' ' || e.key === 'Spacebar') {
      if (charging) {
        charging = false;
        fire(aim.power > 0.05 ? aim.power : 0.3, aim.angle);
      }
    }
  }
  function onBlur() {
    if (charging) { charging = false; syncPower(false); }
    aimUp(false);
  }

  function bindInput() {
    if (window.PointerEvent) {
      dom.canvas.addEventListener('pointerdown', onPointerDown);
      dom.canvas.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    } else {
      // 触屏兜底：把 TouchEvent 的触点换算成逻辑坐标
      dom.canvas.addEventListener('touchstart', function (e) {
        var tch = e.changedTouches[0];
        if (!tch) return;
        var p = toLogical(tch.clientX, tch.clientY);
        if (aimDown(p.x, p.y)) e.preventDefault();
      }, { passive: false });
      dom.canvas.addEventListener('touchmove', function (e) {
        var tch = e.changedTouches[0];
        if (tch && aim.dragging) {
          var p = toLogical(tch.clientX, tch.clientY);
          aimMove(p.x, p.y);
          e.preventDefault();
        }
      }, { passive: false });
      dom.canvas.addEventListener('touchend', function () { aimUp(true); });
      dom.canvas.addEventListener('touchcancel', function () { aimUp(false); });
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    dom.btnStart.addEventListener('click', primaryAction);
    dom.btnCard.addEventListener('click', primaryAction);
    dom.btnPause.addEventListener('click', function () {
      sfx('click');
      if (state.status === 'paused') resume(); else pause();
    });
    dom.btnRestart.addEventListener('click', function () { sfx('click'); newGame(false); });
    dom.btnAgain.addEventListener('click', function () { sfx('click'); newGame(false); });

    dom.diffs.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
      if (btn && dom.diffs.contains(btn)) switchDiff(btn.getAttribute('data-diff'));
    });
    dom.overlay.addEventListener('click', function (e) {
      if (e.target === dom.overlay) dom.overlay.hidden = true;
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && (state.status === 'rolling' || state.status === 'aiming')) pause();
      if (document.hidden) saveState(true);
    });
    window.addEventListener('pagehide', function () { saveState(true); });
    window.addEventListener('resize', fitCanvas);
    if (window.ResizeObserver) {
      new window.ResizeObserver(fitCanvas).observe(dom.stageWrap);
    }
  }

  /* ---------------- 主循环（固定步长 + delta 限幅） ---------------- */

  function updateAnims(dt) {
    var s = dt / 1000;
    for (var i = state.anims.length - 1; i >= 0; i--) {
      state.anims[i].life -= s;
      if (state.anims[i].life <= 0) state.anims.splice(i, 1);
    }
  }

  function loop(ts) {
    rafId = window.requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(ts - lastTs, 50) : 16;   // 切后台回来限幅 50ms
    lastTs = ts;

    if (charging && state.status === 'aiming') {
      aim.power = clamp(aim.power + (dt / 1000) / CHARGE_TIME, 0, 1);
      syncPower(true, aim.power);
    }

    if (state.status === 'rolling') {
      acc += dt / 1000;
      var guard = 0;
      while (acc >= STEP && guard < 12) {
        physicsStep(STEP);
        acc -= STEP; guard++;
        if (state.status !== 'rolling') break;
      }
      if (guard >= 12) acc = 0;
      if (state.status === 'rolling' && allStopped() && state.anims.length === 0) settle();
      if (ts - lastSaveTs > 800) { lastSaveTs = ts; saveState(false); }
    } else {
      acc = 0;
    }

    updateAnims(dt);
    draw();
  }

  function startLoop() {
    if (!rafId) { lastTs = 0; rafId = window.requestAnimationFrame(loop); }
  }
  function stopLoop() {
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    lastTs = 0; acc = 0;
  }

  /* ---------------- 语言切换重绘 ---------------- */

  function onLangChange() {
    syncDiffs();
    syncButtons();
    if (state.cardKind) showCard(state.cardKind);
    if (!dom.overlay.hidden) renderResult();
    refreshHud();
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    dom = {
      canvas: $('canvas'),
      stageWrap: $('stage-wrap'),
      diffs: $('diffs'),
      score: $('score'),
      balls: $('balls'),
      shots: $('shots'),
      best: $('best'),
      btnStart: $('btn-start'),
      btnPause: $('btn-pause'),
      btnRestart: $('btn-restart'),
      btnCard: $('btn-card'),
      btnAgain: $('btn-again'),
      card: $('card'),
      cardTitle: $('card-title'),
      cardSub: $('card-sub'),
      toast: $('toast'),
      power: $('power'),
      powerFill: $('power-fill'),
      overlay: $('overlay'),
      overlayTitle: $('overlay-title'),
      overlaySub: $('overlay-sub'),
      overlayScore: $('overlay-score'),
      overlayShots: $('overlay-shots'),
      recordBadge: $('record-badge')
    };

    var savedDiff = null;
    try { savedDiff = window.localStorage.getItem(KEY_DIFF); } catch (e) { /* ignore */ }
    if (savedDiff && DIFF[savedDiff]) state.diff = savedDiff;

    ensureBest();
    state.bestAtStart = bestOf(state.diff);
    try { window.localStorage.setItem(KEY_DIFF, state.diff); } catch (e) { /* 开局即落盘 */ }
    syncDiffs();

    if (!loadState()) newGame(true);   // 有断点就恢复台面，否则摆一局 + 欢迎卡
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
