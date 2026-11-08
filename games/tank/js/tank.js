/**
 * 坦克大战 · Battle Tank
 * 原创几何像素坦克防守，绝不使用任何任天堂 / Battle City 商标素材。
 * IIFE + 'use strict' + var，无框架、无外部资源，全 canvas 渲染。
 * [tank-dev 2026-11-08 新增]
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 基础引用
   * ------------------------------------------------------------------ */
  var I18N = window.I18N;
  function snd(name) { if (window.YSound) { try { window.YSound.play(name); } catch (e) {} } }
  function t(key) { return I18N ? I18N.t(key) : key; }

  /* ------------------------------------------------------------------ *
   * 常量
   * ------------------------------------------------------------------ */
  var COLS = 13, ROWS = 13, SIZE = 480;
  var CELL = SIZE / COLS;            // 单格像素（浮点）
  var TANK = CELL * 0.84;            // 坦克绘制尺寸
  var BULLET = 5;                    // 子弹半径

  var EMPTY = 0, BRICK = 1, STEEL = 2, BASE = 3;

  var PLAYER_SPEED = 112;            // 玩家移动速度 px/s
  var PLAYER_BULLET_SPEED = 320;     // 玩家子弹速度
  var PLAYER_COOLDOWN = 0.32;        // 玩家开炮冷却 s

  // 三档难度：真正拉开差距
  var DIFF = {
    easy:   { maxOnScreen: 3, total: 8,  speed: 48, bulletSpeed: 130, fireMin: 1.30, fireMax: 2.10, aiMode: 'random' },
    medium: { maxOnScreen: 4, total: 14, speed: 66, bulletSpeed: 170, fireMin: 0.90, fireMax: 1.50, aiMode: 'toBase' },
    hard:   { maxOnScreen: 6, total: 20, speed: 94, bulletSpeed: 220, fireMin: 0.50, fireMax: 0.95, aiMode: 'hunt'   }
  };

  var DIRS = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  // 基地（2x2）所在格子
  var BASE_CELLS = [[10, 6], [10, 7], [11, 6], [11, 7]];
  // 基地堡垒砖墙
  var FORTRESS = [[9, 5], [9, 6], [9, 7], [9, 8], [10, 5], [11, 5], [10, 8], [11, 8]];
  // 敌方出生点（内部顶行）
  var SPAWN_POINTS = [[1, 1], [1, 6], [1, 11]];
  // 玩家出生格
  var PLAYER_SPAWN = [11, 4];

  /* ------------------------------------------------------------------ *
   * localStorage
   * ------------------------------------------------------------------ */
  var KEY_DIFF = 'ysgame-tank-diff';
  var KEY_STATE = 'ysgame-tank-state';
  var KEY_BEST = 'ysgame-tank-best';

  function loadDiff() {
    try { var d = localStorage.getItem(KEY_DIFF); if (DIFF[d]) return d; } catch (e) {}
    return 'medium';
  }
  function saveDiff(d) { try { localStorage.setItem(KEY_DIFF, d); } catch (e) {} }

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY_STATE);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1 || !DIFF[s.diff]) return null;
      return s;
    } catch (e) { return null; }
  }
  function saveState() {
    try {
      if (!G) return;
      var s = { v: 1, diff: G.diff, level: G.level, score: G.score, lives: G.lives, seed: G.seed };
      localStorage.setItem(KEY_STATE, JSON.stringify(s));
    } catch (e) {}
  }
  function clearState() { try { localStorage.removeItem(KEY_STATE); } catch (e) {} }

  function loadBest() {
    try { var b = parseInt(localStorage.getItem(KEY_BEST), 10); return isNaN(b) ? 0 : b; } catch (e) { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem(KEY_BEST, String(v)); } catch (e) {} }

  /* ------------------------------------------------------------------ *
   * DOM
   * ------------------------------------------------------------------ */
  var canvas, ctx, dpr = 1;
  var el = {};

  /* ------------------------------------------------------------------ *
   * 运行状态
   * ------------------------------------------------------------------ */
  var G = null;                  // 当前对局
  var raf = null, last = 0;
  var running = false;           // 是否处于游戏进行中（驱动 update）
  var paused = false;
  var started = false;           // 是否已点过开始
  var currentDiff = 'medium';
  var resumeData = null;         // 存档（用于开局续玩）
  var uiMode = 'start';          // start | paused | win | lose | null
  var toastTimer = 0;

  // 输入
  var keyStack = [];             // 键盘方向栈
  var keyFire = false;
  var touchDir = null;           // 触屏方向盘当前方向
  var touchFire = false;

  /* ------------------------------------------------------------------ *
   * 工具
   * ------------------------------------------------------------------ */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // 网格对齐：把坐标吸附到所在格中心
  function snapCenter(v) {
    var c = Math.round((v - CELL / 2) / CELL);
    return c * CELL + CELL / 2;
  }
  function cellOf(v) { return Math.floor(v / CELL); }
  function centerOf(c) { return c * CELL + CELL / 2; }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ *
   * 关卡 / 对局构建
   * ------------------------------------------------------------------ */
  function genLayout(G) {
    var rng = mulberry32(((G.seed ^ (G.level * 0x9E3779B9)) >>> 0) || 1);
    var g = [];
    var r, c;
    for (r = 0; r < ROWS; r++) { g[r] = []; for (c = 0; c < COLS; c++) g[r][c] = EMPTY; }

    // 外围钢墙
    for (c = 0; c < COLS; c++) { g[0][c] = STEEL; g[ROWS - 1][c] = STEEL; }
    for (r = 0; r < ROWS; r++) { g[r][0] = STEEL; g[r][COLS - 1] = STEEL; }

    // 基地 + 堡垒
    for (var i = 0; i < BASE_CELLS.length; i++) g[BASE_CELLS[i][0]][BASE_CELLS[i][1]] = BASE;
    for (i = 0; i < FORTRESS.length; i++) g[FORTRESS[i][0]][FORTRESS[i][1]] = BRICK;

    // 保留格（不生成随机砖）
    function reserved(r, c) {
      if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) return true;
      for (var k = 0; k < BASE_CELLS.length; k++) if (BASE_CELLS[k][0] === r && BASE_CELLS[k][1] === c) return true;
      for (k = 0; k < FORTRESS.length; k++) if (FORTRESS[k][0] === r && FORTRESS[k][1] === c) return true;
      for (k = 0; k < SPAWN_POINTS.length; k++) if (SPAWN_POINTS[k][0] === r && SPAWN_POINTS[k][1] === c) return true;
      if (PLAYER_SPAWN[0] === r && PLAYER_SPAWN[1] === c) return true;
      return false;
    }

    // 随机砖墙 / 少量钢墙
    for (r = 1; r < ROWS - 1; r++) {
      for (c = 1; c < COLS - 1; c++) {
        if (reserved(r, c)) continue;
        var v = rng();
        if (v < 0.16) g[r][c] = BRICK;
        else if (v < 0.185) g[r][c] = STEEL;
      }
    }

    // 清出出生与活动通道
    var clears = [
      [2, 1], [2, 6], [2, 11],            // 敌方出生点下方
      [11, 3], [11, 5], [10, 4],          // 玩家出生周边
      [8, 4], [9, 4], [10, 4], [11, 4]    // 玩家上行通道
    ];
    for (i = 0; i < clears.length; i++) g[clears[i][0]][clears[i][1]] = EMPTY;

    G.grid = g;
  }

  function makeTank(x, y, isPlayer) {
    return {
      x: x, y: y,
      facing: isPlayer ? 'up' : 'down',
      isPlayer: !!isPlayer,
      alive: true,
      speed: isPlayer ? PLAYER_SPEED : DIFF[currentDiff].speed,
      cooldown: 0,
      invuln: isPlayer ? 1.2 : 0,
      // 敌方专用
      aiTimer: rand(0.3, 0.9),
      stuck: 0,
      fireCd: rand(0.4, 1.0),
      aiMode: isPlayer ? null : DIFF[currentDiff].aiMode,
      color: isPlayer ? '#4C9A5A' : ['#B5483D', '#5B6E8C', '#C9A23A'][Math.floor(rand(0, 3))]
    };
  }

  function createGame(diff, level, score, lives, seed) {
    var cfg = DIFF[diff];
    var G2 = {
      diff: diff,
      level: level,
      score: score,
      lives: lives,
      seed: (seed == null) ? (Math.floor(Math.random() * 1e9) >>> 0) : seed,
      grid: null,
      enemies: [],
      bullets: [],
      fx: [],
      player: null,
      baseAlive: true,
      spawnQueue: cfg.total + (level - 1) * 2,
      spawnTimer: 0.4,
      killed: 0,
      status: 'play',
      bestStart: loadBest(),
      newRecord: false
    };
    genLayout(G2);
    G2.player = makeTank(centerOf(PLAYER_SPAWN[1]), centerOf(PLAYER_SPAWN[0]), true);
    return G2;
  }

  /* ------------------------------------------------------------------ *
   * 碰撞
   * ------------------------------------------------------------------ */
  function tankRect(x, y) {
    var h = TANK / 2;
    return { l: x - h, r: x + h, t: y - h, b: y + h };
  }
  function rectsOverlap(a, b) {
    return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  }
  function tileBlockedForTank(g, r, c) {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
    var v = g[r][c];
    return v === BRICK || v === STEEL || v === BASE;
  }
  // 矩形是否撞墙（坦克用）
  function blockedByWalls(g, rect) {
    var c0 = cellOf(rect.l), c1 = cellOf(rect.r);
    var r0 = cellOf(rect.t), r1 = cellOf(rect.b);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (tileBlockedForTank(g, r, c)) return true;
      }
    }
    return false;
  }
  function blockedByTanks(self, rect) {
    if (G.player && G.player.alive && G.player !== self && rectsOverlap(rect, tankRect(G.player.x, G.player.y))) return true;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.alive && e !== self && rectsOverlap(rect, tankRect(e.x, e.y))) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * 移动
   * ------------------------------------------------------------------ */
  function moveTank(tt, dt, moving) {
    if (!tt.alive) return;
    if (!moving) return;
    var d = DIRS[tt.facing];
    var sp = tt.speed * dt;

    // 垂直于移动方向吸附到格中心，保证能进走廊
    if (d.x !== 0) tt.y = snapCenter(tt.y);
    else tt.x = snapCenter(tt.x);

    var nx = tt.x + d.x * sp;
    var ny = tt.y + d.y * sp;
    var rect = tankRect(nx, ny);
    if (!blockedByWalls(G.grid, rect) && !blockedByTanks(tt, rect)) {
      tt.x = nx; tt.y = ny;
      if (!tt.isPlayer) tt.stuck = 0;
    } else {
      if (!tt.isPlayer) tt.stuck += dt;
    }
  }

  /* ------------------------------------------------------------------ *
   * 开炮
   * ------------------------------------------------------------------ */
  function fire(tt) {
    if (tt.cooldown > 0) return;
    var d = DIRS[tt.facing];
    var bx = tt.x + d.x * (TANK / 2 + 4);
    var by = tt.y + d.y * (TANK / 2 + 4);
    G.bullets.push({
      x: bx, y: by,
      dx: d.x, dy: d.y,
      speed: tt.isPlayer ? PLAYER_BULLET_SPEED : DIFF[G.diff].bulletSpeed,
      owner: tt.isPlayer ? 'player' : 'enemy',
      alive: true
    });
    tt.cooldown = tt.isPlayer ? PLAYER_COOLDOWN : 0.45;
    if (tt.isPlayer) snd('click');
  }

  function spawnFx(x, y, kind) {
    G.fx.push({ x: x, y: y, t: 0, life: kind === 'boom' ? 0.4 : 0.28, kind: kind });
  }

  function destroyEnemy(e) {
    e.alive = false;
    G.score += 100 + G.level * 20;
    G.killed++;
    spawnFx(e.x, e.y, 'boom');
    snd('boom');
    if (G.score > G.bestStart) G.newRecord = true;
    updateHud();
  }

  function playerDie() {
    var p = G.player;
    if (!p.alive || p.invuln > 0) return;
    p.alive = false;
    G.lives--;
    spawnFx(p.x, p.y, 'boom');
    snd('boom');
    saveState();
    updateHud();
    if (G.lives <= 0) {
      gameOver('lose');
    } else {
      p.respawn = 1.0; // 重生计时
    }
  }

  /* ------------------------------------------------------------------ *
   * 敌方 AI
   * ------------------------------------------------------------------ */
  function chooseEnemyDir(e) {
    var opts = ['up', 'down', 'left', 'right'];
    var mode = e.aiMode;
    var pick = null;

    if (mode === 'random') {
      pick = opts[Math.floor(rand(0, 4))];
    } else {
      // 选目标：hunt 优先玩家（在范围内），否则基地
      var tx = centerOf(6.5), ty = centerOf(10.5);
      if (mode === 'hunt' && G.player && G.player.alive) {
        tx = G.player.x; ty = G.player.y;
      }
      var dx = tx - e.x, dy = ty - e.y;
      var horiz = Math.abs(dx) >= Math.abs(dy);
      var cand = [];
      if (horiz) { if (dx > 0) cand.push('right'); else if (dx < 0) cand.push('left'); if (dy > 0) cand.push('down'); else if (dy < 0) cand.push('up'); }
      else { if (dy > 0) cand.push('down'); else if (dy < 0) cand.push('up'); if (dx > 0) cand.push('right'); else if (dx < 0) cand.push('left'); }
      if (cand.length === 0) cand = opts;
      // 70% 朝目标，30% 随机（避免卡死）
      if (Math.random() < 0.3) pick = opts[Math.floor(rand(0, 4))];
      else pick = cand[0];
    }

    // 避免立刻反向（除非卡住）
    if (e.stuck > 0.45) { pick = opts[Math.floor(rand(0, 4))]; e.stuck = 0; }
    e.facing = pick;
  }

  function spawnEnemyAtFreePoint() {
    var pts = SPAWN_POINTS.slice();
    // 打乱
    for (var i = pts.length - 1; i > 0; i--) { var j = Math.floor(rand(0, i + 1)); var tmp = pts[i]; pts[i] = pts[j]; pts[j] = tmp; }
    for (i = 0; i < pts.length; i++) {
      var r = pts[i][0], c = pts[i][1];
      if (G.grid[r][c] !== EMPTY) continue;
      var x = centerOf(c), y = centerOf(r);
      var rect = tankRect(x, y);
      if (blockedByTanks(null, rect)) continue;
      var e = makeTank(x, y, false);
      e.invuln = 0.3; // 出生时极短保护
      G.enemies.push(e);
      spawnFx(x, y, 'spawn');
      return true;
    }
    return false;
  }

  function aliveEnemies() {
    var n = 0;
    for (var i = 0; i < G.enemies.length; i++) if (G.enemies[i].alive) n++;
    return n;
  }

  /* ------------------------------------------------------------------ *
   * 子弹更新
   * ------------------------------------------------------------------ */
  function updateBullets(dt) {
    for (var i = 0; i < G.bullets.length; i++) {
      var b = G.bullets[i];
      if (!b.alive) continue;
      var dist = b.speed * dt;
      var steps = Math.max(1, Math.ceil(dist / (CELL * 0.35)));
      var sdt = dt / steps;
      for (var s = 0; s < steps; s++) {
        b.x += b.dx * b.speed * sdt;
        b.y += b.dy * b.speed * sdt;
        if (b.x < 0 || b.y < 0 || b.x > SIZE || b.y > SIZE) { b.alive = false; break; }

        // 命中砖墙 / 钢墙 / 基地
        var c = cellOf(b.x), r = cellOf(b.y);
        if (r >= 0 && c >= 0 && r < ROWS && c < COLS) {
          var tile = G.grid[r][c];
          if (tile === BRICK) {
            G.grid[r][c] = EMPTY;
            spawnFx(b.x, b.y, 'brick');
            if (b.owner === 'player') snd('coin');
            b.alive = false; break;
          } else if (tile === STEEL) {
            if (b.owner === 'player') snd('click');
            b.alive = false; break;
          } else if (tile === BASE) {
            G.baseAlive = false;
            spawnFx(centerOf(6.5), centerOf(10.5), 'boom');
            snd('boom');
            b.alive = false; break;
          }
        }

        // 命中坦克
        var targets = b.owner === 'player' ? G.enemies : (G.player ? [G.player] : []);
        var hit = null;
        for (var k = 0; k < targets.length; k++) {
          var tg = targets[k];
          if (!tg.alive) continue;
          if (tg.invuln > 0) continue;
          var rr = tankRect(tg.x, tg.y);
          if (b.x >= rr.l && b.x <= rr.r && b.y >= rr.t && b.y <= rr.b) { hit = tg; break; }
        }
        if (hit) {
          if (b.owner === 'player') destroyEnemy(hit);
          else playerDie();
          b.alive = false; break;
        }
      }
    }
    // 清理
    var keep = [];
    for (i = 0; i < G.bullets.length; i++) if (G.bullets[i].alive) keep.push(G.bullets[i]);
    G.bullets = keep;
  }

  /* ------------------------------------------------------------------ *
   * 主更新
   * ------------------------------------------------------------------ */
  function update(dt) {
    // 玩家输入
    var dir = touchDir || (keyStack.length ? keyStack[keyStack.length - 1] : null);
    if (G.player.alive) {
      if (dir) G.player.facing = dir;
      moveTank(G.player, dt, !!dir && !paused);
      if ((touchFire || keyFire) && !paused) fire(G.player);
    }
    if (G.player.cooldown > 0) G.player.cooldown -= dt;
    if (G.player.invuln > 0) G.player.invuln -= dt;
    if (!G.player.alive && G.player.respawn != null) {
      G.player.respawn -= dt;
      if (G.player.respawn <= 0) {
        G.player.respawn = null;
        G.player.alive = true;
        G.player.x = centerOf(PLAYER_SPAWN[1]);
        G.player.y = centerOf(PLAYER_SPAWN[0]);
        G.player.facing = 'up';
        G.player.invuln = 1.6;
      }
    }

    // 敌方
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive) continue;
      if (e.cooldown > 0) e.cooldown -= dt;
      if (e.invuln > 0) e.invuln -= dt;
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) { e.aiTimer = rand(0.5, 1.1); chooseEnemyDir(e); }
      moveTank(e, dt, true);
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = rand(DIFF[G.diff].fireMin, DIFF[G.diff].fireMax);
        fire(e);
      }
    }

    // 子弹
    updateBullets(dt);

    // 敌坦生成
    if (G.spawnQueue > 0) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0 && aliveEnemies() < DIFF[G.diff].maxOnScreen) {
        if (spawnEnemyAtFreePoint()) {
          G.spawnQueue--;
          G.spawnTimer = rand(0.6, 1.4);
        } else {
          G.spawnTimer = 0.4;
        }
      }
    }

    // 特效
    for (i = 0; i < G.fx.length; i++) G.fx[i].t += dt;
    var fkeep = [];
    for (i = 0; i < G.fx.length; i++) if (G.fx[i].t < G.fx[i].life) fkeep.push(G.fx[i]);
    G.fx = fkeep;

    // 胜负判定
    if (G.status === 'play') {
      if (!G.baseAlive || G.lives <= 0) {
        gameOver('lose');
      } else if (G.spawnQueue <= 0 && aliveEnemies() === 0) {
        levelClear();
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------------ */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTile(r, c, type) {
    var x = c * CELL, y = r * CELL;
    if (type === BRICK) {
      ctx.fillStyle = '#B5793F';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = 'rgba(90,52,24,0.55)';
      ctx.fillRect(x, y + CELL * 0.46, CELL, CELL * 0.08);
      ctx.fillRect(x + CELL * 0.46, y, CELL * 0.08, CELL * 0.46);
      ctx.fillRect(x - CELL * 0.04, y + CELL * 0.46, CELL * 0.08, CELL * 0.54);
      ctx.fillStyle = 'rgba(255,225,190,0.18)';
      ctx.fillRect(x, y, CELL, CELL * 0.12);
    } else if (type === STEEL) {
      ctx.fillStyle = '#9098A1';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = '#C3CAD2';
      ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      ctx.fillStyle = '#6E767F';
      ctx.fillRect(x + CELL * 0.5 - 1, y + 2, 2, CELL - 4);
      ctx.fillRect(x + 2, y + CELL * 0.5 - 1, CELL - 4, 2);
    }
  }

  function drawBase() {
    if (!G.baseAlive) {
      // 废墟
      var bx = centerOf(6.5), by = centerOf(10.5);
      ctx.fillStyle = '#6B6B6B';
      roundRect(bx - CELL * 0.7, by - CELL * 0.7, CELL * 1.4, CELL * 1.4, 6);
      ctx.fill();
      ctx.fillStyle = '#4A4A4A';
      ctx.font = (CELL * 0.7) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✶', bx, by);
      return;
    }
    var x = 6 * CELL, y = 10 * CELL, w = 2 * CELL, h = 2 * CELL;
    // 平台
    ctx.fillStyle = '#D9C7A0';
    roundRect(x + 3, y + 3, w - 6, h - 6, 6); ctx.fill();
    // 鹰形（几何）：身体三角 + 双翼
    var cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = '#5A4A2E';
    ctx.beginPath();
    ctx.moveTo(cx, cy - CELL * 0.34);
    ctx.lineTo(cx - CELL * 0.30, cy + CELL * 0.18);
    ctx.lineTo(cx, cy + CELL * 0.04);
    ctx.lineTo(cx + CELL * 0.30, cy + CELL * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7A6536';
    ctx.fillRect(cx - 1.5, cy - CELL * 0.30, 3, CELL * 0.5);
  }

  function drawTank(tt) {
    if (!tt.alive) return;
    // 重生闪烁
    if (tt.invuln > 0 && Math.floor(tt.invuln * 12) % 2 === 0) return;
    var x = tt.x, y = tt.y, s = TANK, h = s / 2;
    var col = tt.color;
    ctx.save();
    ctx.translate(x, y);
    // 履带
    ctx.fillStyle = 'rgba(40,40,40,0.85)';
    roundRect(-h, -h, s * 0.26, s, 3); ctx.fill();
    roundRect(h - s * 0.26, -h, s * 0.26, s, 3); ctx.fill();
    // 车体
    ctx.fillStyle = col;
    roundRect(-h + s * 0.18, -h + s * 0.16, s * 0.64, s * 0.68, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(-h + s * 0.22, -h + s * 0.20, s * 0.56, s * 0.20, 3); ctx.fill();
    // 炮塔
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.20, 0, Math.PI * 2); ctx.stroke();
    // 炮管
    var d = DIRS[tt.facing];
    ctx.strokeStyle = col;
    ctx.lineWidth = s * 0.14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(d.x * h * 0.95, d.y * h * 0.95);
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(b) {
    ctx.fillStyle = b.owner === 'player' ? '#FFE08A' : '#FF9A6B';
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFx(f) {
    var p = f.t / f.life;
    if (f.kind === 'brick') {
      ctx.strokeStyle = 'rgba(181,121,63,' + (1 - p) + ')';
      ctx.lineWidth = 2;
      var rr = CELL * 0.3 * p;
      ctx.strokeRect(f.x - rr, f.y - rr, rr * 2, rr * 2);
    } else if (f.kind === 'spawn') {
      ctx.strokeStyle = 'rgba(120,200,140,' + (1 - p) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, TANK * (0.4 + p * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    } else { // boom
      var rad = TANK * (0.3 + p * 0.9);
      var grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
      grad.addColorStop(0, 'rgba(255,220,140,' + (1 - p) + ')');
      grad.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function render() {
    if (!ctx) return;
    // 背景
    ctx.fillStyle = '#E9EEF1';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // 网格
    ctx.strokeStyle = 'rgba(120,135,150,0.10)';
    ctx.lineWidth = 1;
    for (var i = 1; i < COLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(SIZE, i * CELL); ctx.stroke();
    }
    if (!G) return;
    // 地块
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var v = G.grid[r][c];
        if (v === BRICK || v === STEEL) drawTile(r, c, v);
      }
    }
    drawBase();
    // 特效
    for (var i = 0; i < G.fx.length; i++) drawFx(G.fx[i]);
    // 坦克
    for (i = 0; i < G.enemies.length; i++) drawTank(G.enemies[i]);
    drawTank(G.player);
    // 子弹
    for (i = 0; i < G.bullets.length; i++) drawBullet(G.bullets[i]);
  }

  /* ------------------------------------------------------------------ *
   * 游戏循环
   * ------------------------------------------------------------------ */
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) hideToast(); }
    if (running && !paused && G && G.status === 'play') update(dt);
    render();
  }

  function startLoop() {
    if (raf) cancelAnimationFrame(raf);
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ *
   * UI 控制
   * ------------------------------------------------------------------ */
  function updateHud() {
    if (el.score) el.score.textContent = G ? G.score : 0;
    if (el.best) el.best.textContent = G ? Math.max(G.bestStart, G.score) : loadBest();
    if (el.level) el.level.textContent = G ? G.level : 1;
    if (el.lives) el.lives.textContent = G ? G.lives : 3;
  }

  function showCard() {
    if (el.card) el.card.hidden = false;
  }
  function hideCard() {
    if (el.card) el.card.hidden = true;
  }

  function paintUI() {
    // 根据当前 uiMode 刷新需要本地化的动态文案
    if (uiMode === 'start') {
      if (el.cardTitle) el.cardTitle.textContent = t('game_title');
      if (el.cardSub) {
        if (resumeData) {
          el.cardSub.textContent = t('btn_resume') + ' · ' + t('label_level') + ' ' + resumeData.level + ' · ' + resumeData.score + ' ' + t('label_score');
        } else {
          el.cardSub.textContent = t('tagline');
        }
      }
    } else if (uiMode === 'paused') {
      if (el.cardTitle) el.cardTitle.textContent = t('paused_title');
      if (el.cardSub) el.cardSub.textContent = '';
    }
    if (el.btnPause) {
      el.btnPause.textContent = paused ? t('btn_resume') : t('btn_pause');
    }
  }

  function showToast(msg, ms) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.hidden = false;
    toastTimer = (ms || 2600) / 1000;
  }
  function hideToast() { if (el.toast) el.toast.hidden = true; }

  function showOverlay(type) {
    if (!el.overlay) return;
    var lvl = G.level, sc = G.score;
    if (type === 'win') {
      el.overlayTitle.textContent = t('win_title');
      el.overlaySub.textContent = t('win_sub').replace('{level}', lvl).replace('{wave}', G.killed).replace('{score}', sc);
      if (el.btnNext) el.btnNext.hidden = false;
      if (el.btnAgain) el.btnAgain.hidden = true;
    } else {
      el.overlayTitle.textContent = t('lose_title');
      el.overlaySub.textContent = t('lose_sub').replace('{level}', lvl).replace('{score}', sc);
      if (el.btnNext) el.btnNext.hidden = true;
      if (el.btnAgain) el.btnAgain.hidden = false;
    }
    el.overlayScore.textContent = sc;
    el.overlayLevel.textContent = lvl;
    // 破纪录
    if (G.newRecord && G.score > G.bestStart) {
      el.recordBadge.hidden = false;
      saveBest(G.score);
    } else {
      el.recordBadge.hidden = true;
    }
    el.overlay.hidden = false;
  }
  function hideOverlay() { if (el.overlay) el.overlay.hidden = true; }

  /* ------------------------------------------------------------------ *
   * 流程
   * ------------------------------------------------------------------ */
  function startGame() {
    hideCard();
    hideOverlay();
    hideToast();
    paused = false;
    started = true;
    if (resumeData) {
      G = createGame(resumeData.diff, resumeData.level, resumeData.score, resumeData.lives, resumeData.seed);
      resumeData = null;
    } else {
      G = createGame(currentDiff, 1, 0, 3, null);
    }
    saveState();
    currentDiff = G.diff;
    running = true;
    uiMode = null;
    updateHud();
    snd('start');
    startLoop();
  }

  function newGame() {
    started = true;
    resumeData = null;
    G = createGame(currentDiff, 1, 0, 3, null);
    saveState();
    running = true;
    paused = false;
    hideCard(); hideOverlay(); hideToast();
    uiMode = null;
    updateHud();
    snd('start');
    startLoop();
  }

  function levelClear() {
    if (G.status !== 'play') return;
    G.status = 'win';
    running = false;
    uiMode = 'win';
    saveState();
    if (G.newRecord && G.score > G.bestStart) { /* 记录已在结算时写 */ }
    snd('win');
    showOverlay('win');
  }

  function gameOver(type) {
    if (G.status !== 'play') return;
    G.status = 'lose';
    running = false;
    uiMode = 'lose';
    clearState(); // 本局结束，不再续玩
    if (G.score > G.bestStart) { G.newRecord = true; saveBest(G.score); }
    snd('lose');
    showOverlay('lose');
  }

  function nextLevel() {
    var nl = G.level + 1;
    var ns = G.score, nlives = G.lives, seed = G.seed;
    G = createGame(G.diff, nl, ns, nlives, seed);
    saveState();
    running = true;
    paused = false;
    started = true;
    hideOverlay(); hideToast();
    uiMode = null;
    updateHud();
    snd('levelup');
    startLoop();
  }

  function togglePause() {
    if (!started || !G || G.status !== 'play') return;
    paused = !paused;
    if (paused) {
      uiMode = 'paused';
      showCard();
      paintUI();
      snd('toggle');
    } else {
      uiMode = null;
      hideCard();
      snd('toggle');
    }
    if (el.btnPause) el.btnPause.textContent = paused ? t('btn_resume') : t('btn_pause');
  }

  function setDiff(d) {
    if (!DIFF[d]) return;
    currentDiff = d;
    saveDiff(d);
    paintDiff();
    if (started && G && G.status === 'play') {
      // 切换难度即重开
      newGame();
    } else {
      // 未开始：重建预览
      G = createGame(d, resumeData ? resumeData.level : 1, resumeData ? resumeData.score : 0, resumeData ? resumeData.lives : 3, resumeData ? resumeData.seed : null);
      updateHud();
    }
  }

  function paintDiff() {
    var btns = el.diffs ? el.diffs.querySelectorAll('.seg__btn') : [];
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === currentDiff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* ------------------------------------------------------------------ *
   * 输入
   * ------------------------------------------------------------------ */
  function isDirKey(code) {
    return code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight' ||
           code === 'KeyW' || code === 'KeyS' || code === 'KeyA' || code === 'KeyD';
  }
  function codeToDir(code) {
    if (code === 'ArrowUp' || code === 'KeyW') return 'up';
    if (code === 'ArrowDown' || code === 'KeyS') return 'down';
    if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
    if (code === 'ArrowRight' || code === 'KeyD') return 'right';
    return null;
  }

  function onKeyDown(e) {
    if (isDirKey(e.code)) {
      e.preventDefault();
      var d = codeToDir(e.code);
      if (d && keyStack.indexOf(d) === -1) { keyStack.push(d); snd('select'); }
    } else if (e.code === 'KeyJ' || e.code === 'Space') {
      e.preventDefault();
      keyFire = true;
    } else if (e.code === 'KeyP') {
      e.preventDefault();
      togglePause();
    }
  }
  function onKeyUp(e) {
    if (isDirKey(e.code)) {
      var d = codeToDir(e.code);
      var idx = keyStack.indexOf(d);
      if (idx !== -1) keyStack.splice(idx, 1);
    } else if (e.code === 'KeyJ' || e.code === 'Space') {
      keyFire = false;
    }
  }

  function bindDpad() {
    var map = { 'pad-up': 'up', 'pad-left': 'left', 'pad-right': 'right', 'pad-down': 'down' };
    Object.keys(map).forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      var dir = map[id];
      var press = function (e) {
        e.preventDefault();
        touchDir = dir;
        btn.classList.add('is-down');
      };
      var release = function (e) {
        if (e) e.preventDefault();
        if (touchDir === dir) touchDir = null;
        btn.classList.remove('is-down');
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('pointercancel', release);
    });
    var fireBtn = document.getElementById('pad-fire');
    if (fireBtn) {
      var fp = function (e) { e.preventDefault(); touchFire = true; fireBtn.classList.add('is-down'); };
      var fr = function (e) { if (e) e.preventDefault(); touchFire = false; fireBtn.classList.remove('is-down'); };
      fireBtn.addEventListener('pointerdown', fp);
      fireBtn.addEventListener('pointerup', fr);
      fireBtn.addEventListener('pointerleave', fr);
      fireBtn.addEventListener('pointercancel', fr);
    }
  }

  /* ------------------------------------------------------------------ *
   * 初始化
   * ------------------------------------------------------------------ */
  function setupCanvas() {
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(SIZE * dpr);
    canvas.height = Math.round(SIZE * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cacheEls() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    el.score = document.getElementById('score');
    el.best = document.getElementById('best');
    el.level = document.getElementById('level');
    el.lives = document.getElementById('lives');
    el.diffs = document.getElementById('diffs');
    el.btnPause = document.getElementById('btn-pause');
    el.btnRestart = document.getElementById('btn-restart');
    el.btnHint = document.getElementById('btn-hint');
    el.btnStart = document.getElementById('btn-start');
    el.card = document.getElementById('card');
    el.cardTitle = document.getElementById('card-title');
    el.cardSub = document.getElementById('card-sub');
    el.toast = document.getElementById('toast');
    el.overlay = document.getElementById('overlay');
    el.overlayTitle = document.getElementById('overlay-title');
    el.overlaySub = document.getElementById('overlay-sub');
    el.recordBadge = document.getElementById('record-badge');
    el.overlayScore = document.getElementById('overlay-score');
    el.overlayLevel = document.getElementById('overlay-level');
    el.btnNext = document.getElementById('btn-next');
    el.btnAgain = document.getElementById('btn-again');
  }

  function bindUI() {
    el.btnStart.addEventListener('click', function () { snd('select'); startGame(); });
    el.btnRestart.addEventListener('click', function () { snd('select'); newGame(); });
    el.btnPause.addEventListener('click', function () { togglePause(); });
    el.btnHint.addEventListener('click', function () {
      snd('select');
      showToast(t('hint_controls'), 3200);
    });
    if (el.btnAgain) el.btnAgain.addEventListener('click', function () { snd('select'); newGame(); });
    if (el.btnNext) el.btnNext.addEventListener('click', function () { snd('select'); nextLevel(); });

    // 难度切换
    if (el.diffs) {
      el.diffs.addEventListener('click', function (e) {
        var b = e.target.closest('.seg__btn');
        if (!b) return;
        var d = b.getAttribute('data-diff');
        if (d === currentDiff) return;
        // 进行中切换需确认（会丢失进度）
        if (started && G && G.status === 'play') {
          if (!window.confirm(t('confirm_diff'))) { paintDiff(); return; }
        }
        snd('select');
        setDiff(d);
      });
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', setupCanvas);
    bindDpad();

    if (window.I18N) {
      document.addEventListener('ys:langchange', function () { paintUI(); updateHud(); });
    }
  }

  function init() {
    cacheEls();
    setupCanvas();
    currentDiff = loadDiff();
    resumeData = loadState();
    paintDiff();

    // 预览对局（未开始，仅展示棋盘）
    G = createGame(currentDiff, resumeData ? resumeData.level : 1,
                   resumeData ? resumeData.score : 0, resumeData ? resumeData.lives : 3,
                   resumeData ? resumeData.seed : null);
    updateHud();
    uiMode = 'start';
    paintUI();
    showCard();

    bindUI();
    startLoop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
