/* ==========================================================================
   经典横版跳跃 · 游戏逻辑
   纯 ES5 + IIFE，和站内其它游戏保持一致（无框架、无打包、无依赖）。

   玩法：480x270 固定逻辑坐标的横版卷轴，devicePixelRatio 缩放，
        requestAnimationFrame 主循环 + 固定时间步长；重力、跳跃、左右加速
        与摩擦、AABB 平台碰撞（落地 / 顶头 / 撞墙）、镜头跟随玩家。
        地面与浮空砖块平台、缺口、巡逻敌人（可踩）、金币、水管障碍、
        终点旗杆；道具「无敌星」短暂无敌并在 HUD 显示倒计时。
   关卡：至少 3 关，逐关更长、缺口更宽、敌人更多；三档难度参数真正拉开。
   存档：断点续玩（按难度分桶，含关卡 / 分数 / 生命 / 已过关记录 / 检查点）。
   美术：全部由 canvas 几何像素块绘制，无任何外部图片、音频或关卡素材。
   音效：统一走 js/sound.js 的 YSound，主题由 body[data-dict="gmario"] 自动识别。

   [gyh 2026-11-08 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var W = 480;
  var H = 270;
  var GROUND_Y = 230;                 // 地面顶 y
  var GROUND_H = H - GROUND_Y;        // 地面厚 40
  var MAX_LEVEL = 3;
  var STATE_V = 1;

  var STATE_KEY = 'ysgame-mario-state';
  var BEST_KEY = 'ysgame-mario-best';
  var DIFF_KEY = 'ysgame-mario-diff';

  // 物理，单位：逻辑像素 / 秒
  var GRAVITY = 1600;
  var MOVE_ACC = 1500;
  var AIR_ACC = 1000;
  var MAX_SPEED = 190;
  var GROUND_FRICTION = 2000;
  var AIR_FRICTION = 260;
  var JUMP_V = -480;                  // 跳高约 72px，满速水平跨距约 114px
  var STOMP_V = -300;
  var COYOTE = 0.09;                  // 离地后仍可起跳的宽限（秒）
  var STEP = 1 / 60;                  // 固定时间步长（秒）
  var PLAYER_W = 18;
  var PLAYER_H = 24;
  var STAR_MS = 6000;                 // 无敌星持续
  var HURT_INVULN_MS = 1200;          // 受伤后短暂无敌

  // [gyh 2026-11-08 新增] 三档：生命 / 敌人速度 / 缺口 / 敌人数量 / 金币 / 水管 / 额外陷阱
  var DIFFS = {
    easy:   { lives: 3, enemyMul: 0.8, gapBase: 46, gapStep: 10, enemyBase: 2, enemyPer: 1, coinRate: 1.0,  pipes: 1, traps: 0, segs: 3, runBase: 180 },
    medium: { lives: 2, enemyMul: 1.0, gapBase: 62, gapStep: 14, enemyBase: 3, enemyPer: 2, coinRate: 0.8,  pipes: 2, traps: 0, segs: 4, runBase: 200 },
    hard:   { lives: 1, enemyMul: 1.3, gapBase: 78, gapStep: 18, enemyBase: 4, enemyPer: 2, coinRate: 0.55, pipes: 3, traps: 1, segs: 5, runBase: 220 }
  };

  // 站内统一的低饱和配色，避免街机荧光感
  var C = {
    ground: '#93AC89', groundTop: '#B7CBA6', groundDark: '#7E9776',
    brick: '#CDB99B', brickTop: '#E2D2B6', brickLine: '#B49E7C',
    pipe: '#8FAE9B', pipeDark: '#71907E',
    coin: '#E1C277', coinInner: '#C9A355',
    enemy: '#C2938B', enemyDark: '#A8756E', enemyEye: '#FFFDF8',
    star: '#E0C068', starDark: '#C4A24E',
    player: '#6C7FC0', playerDark: '#55639F', skin: '#F1D9BE',
    pole: '#9AA0A8', poleDark: '#7E858E', flag: '#C8807A',
    mover: '#9FB2C4', moverTop: '#C6D3DE'
  };

  /* ------------------------------------------------------------------
     内置文案兜底：只用「统一 key 清单」里的 key。
     gmario 字典由站内统一维护，正常情况走 I18N.t；字典尚未就位或漏翻时
     用这里的中英文兜底，避免页面出现裸 i18n key。
     I18N.t 只收一个参数；带占位符的文案由 tf() 自行 split/join 替换。
     [gyh 2026-11-08 新增]
     ------------------------------------------------------------------ */
  var FB = {
    zh: {
      page_title: '经典横版跳跃 · 在线玩 | YSGame 云舒的小游戏屋',
      page_desc: '免费在线经典横版跳跃：左右奔跑、跳过缺口、踩掉巡逻小怪、收集金币与无敌星，冲向终点旗杆。简单 / 中等 / 困难三档，三关递进，自动存档、断点续玩，键盘与触屏都能玩。',
      game_title: '经典横版跳跃',
      tagline: '跑起来，跳过去，一路奔向终点的小旗',
      share_line: '一局几分钟，随手转发给想一起玩的人。',
      difficulty_group_aria: '选择难度',
      diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
      confirm_diff: '切换难度会按该难度的存档重新开始，当前进度会丢掉。',
      label_score: '分数', label_best: '最高分', label_time: '用时', label_moves: '步数',
      label_level: '关卡', label_lives: '生命', label_pairs: '配对', label_combo: '连击',
      label_hints: '提示', label_turn: '回合',
      btn_start: '开始', btn_restart: '重开一局', btn_again: '再来一局', btn_hint: '提示',
      btn_undo: '撤销', btn_pause: '暂停', btn_resume: '继续', btn_shuffle: '重排', btn_next: '下一关',
      board_aria: '经典横版跳跃画面',
      hint_controls: '← → 或 A / D 左右移动，空格 / ↑ / W 跳跃，P 暂停。手机上按住画面下方的左 / 右 / 跳按钮也能玩。',
      win_title: '过关了', win_sub: '第 {level} 关完成，当前 {score} 分。',
      lose_title: '再试一次', lose_sub: '这次拿到 {score} 分，再来一局吧。',
      new_record: '新纪录', paused_title: '暂停中',
      draw_title: '平局', draw_sub: '不分胜负。',
      turn_you: '你', turn_ai: '对手', thinking: '思考中',
      label_matched: '已配', label_remaining: '剩余'
    },
    en: {
      page_title: 'Classic Side-Scroller, free to play | YSGame',
      page_desc: 'A free online side-scrolling platform jumper: run, leap over gaps, stomp patrolling critters, grab coins and a brief invincibility star, then reach the goal flag. Three difficulties, three levels, autosave, keyboard and touch.',
      game_title: 'Classic Side-Scroller',
      tagline: 'Run, leap, and make it to the little flag at the end',
      share_line: 'A few quiet minutes. Pass it on to someone who might like it.',
      difficulty_group_aria: 'Choose difficulty',
      diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
      confirm_diff: 'Switching difficulty restarts from that tier save. Your current progress will be lost.',
      label_score: 'Score', label_best: 'Best', label_time: 'Time', label_moves: 'Moves',
      label_level: 'Level', label_lives: 'Lives', label_pairs: 'Pairs', label_combo: 'Combo',
      label_hints: 'Hints', label_turn: 'Turn',
      btn_start: 'Start', btn_restart: 'Restart', btn_again: 'Play again', btn_hint: 'Hint',
      btn_undo: 'Undo', btn_pause: 'Pause', btn_resume: 'Resume', btn_shuffle: 'Shuffle', btn_next: 'Next level',
      board_aria: 'Classic side-scroller game screen',
      hint_controls: 'Arrow keys or A / D to move, Space / Up / W to jump, P to pause. On a phone, hold the Left / Right / Jump buttons below the screen.',
      win_title: 'Level cleared', win_sub: 'Level {level} done. Score {score}.',
      lose_title: 'Try again', lose_sub: 'You scored {score}. Give it another go.',
      new_record: 'New record', paused_title: 'Paused',
      draw_title: 'Draw', draw_sub: 'No winner this time.',
      turn_you: 'You', turn_ai: 'Rival', thinking: 'Thinking',
      label_matched: 'Matched', label_remaining: 'Left'
    }
  };

  /* ---------------- DOM ---------------- */

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('board');
  var ctx = null;
  var veil = $('veil');
  var veilText = $('veilText');
  var overlay = $('overlay');
  var recordBadge = $('recordBadge');
  var btnPause = $('btn-pause');
  var powerBar = $('powerBar');
  var powerFill = $('powerFill');
  var powerNum = $('powerNum');

  /* ---------------- 状态 ---------------- */

  var diff = 'medium';
  var status = 'ready';               // ready | running | paused | levelclear | win | lose
  var score = 0;
  var lives = 3;
  var level = 1;
  var cleared = {};                   // 已过关记录：{ levelNo: true }
  var checkpointIndex = 0;
  var checkpointX = 0;
  var starMs = 0;
  var hurtInvulnMs = 0;
  var isRecord = false;
  var best = { easy: 0, medium: 0, hard: 0 };
  var lvl = null;
  var player = null;
  var camX = 0;
  var anim = 0;
  var overlayInfo = null;
  var input = { left: false, right: false, jump: false };
  var jumpQueued = false;
  var prevJump = false;
  var lastTs = 0;
  var acc = 0;
  var lastSaveTs = 0;
  var resizeTimer = null;
  var lastSfx = {};

  /* ---------------- 小工具 ---------------- */

  function t(key) {
    var s = window.I18N ? window.I18N.t(key) : key;
    if (s === key) {
      var lang = (window.I18N && window.I18N.lang === 'en') ? 'en' : 'zh';
      if (FB[lang] && FB[lang][key] != null) return FB[lang][key];
      if (FB.zh[key] != null) return FB.zh[key];
    }
    return s;
  }

  // I18N.t 不带占位符替换；{score} / {level} 之类在此自行 split/join
  function tf(key, map) {
    var s = t(key);
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        s = s.split('{' + k + '}').join(String(map[k]));
      }
    }
    return s;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
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

  function isInvuln() { return starMs > 0 || hurtInvulnMs > 0; }
  function diffDef() { return DIFFS[diff] || DIFFS.medium; }

  /* ---------------- 存档（按难度分桶，全部 try/catch） ---------------- */

  function loadDiff() {
    try {
      var d = window.localStorage.getItem(DIFF_KEY);
      if (d && DIFFS[d]) diff = d;
    } catch (e) { /* ignore */ }
  }

  function saveDiff() {
    try { window.localStorage.setItem(DIFF_KEY, diff); } catch (e) { /* ignore */ }
  }

  function loadBest() {
    var b = readJSON(BEST_KEY, null);
    if (!b || b.v !== STATE_V || !b.tiers || typeof b.tiers !== 'object' || Array.isArray(b.tiers)) {
      return { easy: 0, medium: 0, hard: 0 };
    }
    return {
      easy: Number(b.tiers.easy) || 0,
      medium: Number(b.tiers.medium) || 0,
      hard: Number(b.tiers.hard) || 0
    };
  }

  function saveBest() {
    writeJSON(BEST_KEY, { v: STATE_V, tiers: best });
  }

  function save() {
    var all = readJSON(STATE_KEY, null);
    if (!all || all.v !== STATE_V || !all.tiers || typeof all.tiers !== 'object' || Array.isArray(all.tiers)) {
      all = { v: STATE_V, tiers: {} };
    }
    all.tiers[diff] = {
      level: level,
      score: score,
      lives: lives,
      checkpoint: checkpointIndex,
      cleared: cleared,
      diff: diff
    };
    writeJSON(STATE_KEY, all);
  }

  // 从某个难度的桶恢复：关卡 / 分数 / 生命 / 已过关记录 / 检查点
  function loadTier(dKey) {
    var all = readJSON(STATE_KEY, null);
    if (!all || all.v !== STATE_V || !all.tiers || typeof all.tiers !== 'object') return false;
    var s = all.tiers[dKey];
    if (!s || typeof s !== 'object') return false;

    score = Math.max(0, Number(s.score) || 0);
    lives = Math.max(1, Number(s.lives) || DIFFS[dKey].lives);
    level = clamp(Math.floor(Number(s.level) || 1), 1, MAX_LEVEL);
    cleared = (s.cleared && typeof s.cleared === 'object') ? s.cleared : {};
    checkpointIndex = Math.max(0, Math.floor(Number(s.checkpoint) || 0));

    lvl = buildLevel(level, dKey);
    if (checkpointIndex > lvl.checkpoints.length - 1) checkpointIndex = lvl.checkpoints.length - 1;
    checkpointX = lvl.checkpoints[checkpointIndex];

    starMs = 0;
    hurtInvulnMs = 0;
    isRecord = false;
    spawnPlayer();
    status = 'ready';                 // 刷新后一律先暂停，别让角色自己跑
    overlayInfo = null;
    overlay.hidden = true;
    recordBadge.hidden = true;
    return true;
  }

  /* ---------------- 关卡生成（原创程序化布局） ---------------- */

  function addGround(l, x, w) {
    l.ground.push({ x: x, y: GROUND_Y, w: w, h: GROUND_H, oneWay: false });
  }

  function makeMover(x, y, w, h, minX, maxX, speed) {
    return {
      x: x, y: y, w: w, h: h, minX: minX, maxX: maxX,
      vx: speed, dx: 0, oneWay: true, isMover: true
    };
  }

  // [gyh 2026-11-08 新增] 逐关更长（段数 + 每段长）、缺口更宽、敌人更多
  function buildLevel(lev, dKey) {
    var D = DIFFS[dKey] || DIFFS.medium;
    var l = {
      ground: [], platforms: [], coins: [], enemies: [], pipes: [],
      stars: [], movers: [], checkpoints: [], solids: [],
      flagX: 0, width: 0
    };

    var x = 0;
    addGround(l, x, 300);              // 起始安全平地
    l.checkpoints.push(40);            // 起点检查点
    x += 300;

    var segs = D.segs + (lev - 1);
    var gapW = D.gapBase + (lev - 1) * D.gapStep;
    var enemyTotal = D.enemyBase + (lev - 1) * D.enemyPer;
    var runBase = D.runBase + (lev - 1) * 45;
    var enemiesPlaced = 0;
    var pipesPlaced = 0;
    var starPlaced = false;

    for (var i = 0; i < segs; i++) {
      var gap = gapW + (i % 2) * 6;

      // 宽缺口 / hard 陷阱：缺口中间放踏板或来回移动的平台
      if (gap > 76 || D.traps) {
        var mid = x + gap / 2;
        if (D.traps && (i % 2 === 0)) {
          l.movers.push(makeMover(mid - 24, 172, 48, 10, x + 8, x + gap - 8, 46 * D.enemyMul));
        } else {
          l.platforms.push({ x: mid - 26, y: 170, w: 52, h: 12, oneWay: true });
        }
      }

      // 缺口上方的引导金币（弧线），按难度密度削减
      var arcN = D.coinRate >= 1 ? 3 : (D.coinRate >= 0.8 ? 2 : 1);
      for (var a = 0; a < arcN; a++) {
        var p = (a + 1) / (arcN + 1);
        l.coins.push({
          x: x + gap * p,
          y: 176 - 16 * Math.sin(Math.PI * p),
          r: 6, taken: false
        });
      }
      x += gap;

      var run = runBase + 60 + (i % 3) * 30;
      addGround(l, x, run);
      l.checkpoints.push(x + 24);

      // 水管障碍（要跳过去），第一段不放，给玩家缓冲
      if (pipesPlaced < D.pipes && i >= 1) {
        var ph = 40;
        l.pipes.push({ x: x + 78, y: GROUND_Y - ph, w: 34, h: ph, oneWay: false });
        pipesPlaced++;
      }

      // 浮空砖块平台 + 平台金币（单向平台，可从下方穿过、从上方站上）
      if (i % 2 === 1) {
        var px = x + Math.round(run * 0.42);
        var py = 160;
        l.platforms.push({ x: px, y: py, w: 72, h: 12, oneWay: true });
        l.coins.push({ x: px + 18, y: py - 18, r: 6, taken: false });
        l.coins.push({ x: px + 54, y: py - 18, r: 6, taken: false });
      }

      // 巡逻敌人，分散到各段平地
      if (enemiesPlaced < enemyTotal) {
        var cnt = Math.min(2, enemyTotal - enemiesPlaced);
        for (var e = 0; e < cnt; e++) {
          var ex = x + 128 + e * 76;
          if (ex + 20 > x + run - 20) continue;
          var speed = (40 + (e % 2) * 12 + (i % 2) * 8) * D.enemyMul;
          l.enemies.push({
            x: ex, y: GROUND_Y - 18, w: 18, h: 18,
            vx: (e % 2 === 0 ? 1 : -1) * speed,
            minX: x + 24, maxX: x + run - 24,
            alive: true, anim: 0
          });
          enemiesPlaced++;
        }
      }

      // 地面金币串
      var coinN = D.coinRate >= 1 ? 3 : (D.coinRate >= 0.8 ? 2 : 1);
      for (var c = 0; c < coinN; c++) {
        l.coins.push({ x: x + 40 + c * 26, y: GROUND_Y - 34, r: 6, taken: false });
      }

      // 每关至少一个无敌星，放在中段、需要跳一下才够得到
      if (!starPlaced && i === Math.floor(segs / 2)) {
        l.stars.push({ x: x + run * 0.5, y: GROUND_Y - 62, r: 9, taken: false });
        starPlaced = true;
      }

      x += run;
    }

    // 终点平地 + 旗杆
    addGround(l, x, 340);
    l.flagX = x + 230;
    l.width = x + 340;

    // 实体列表：地面 / 水管实心，浮空平台 / 移动平台单向
    l.solids = l.ground.concat(l.pipes).concat(l.platforms).concat(l.movers);
    return l;
  }

  function spawnPlayer() {
    player = {
      x: checkpointX, y: GROUND_Y - PLAYER_H - 2,
      w: PLAYER_W, h: PLAYER_H,
      vx: 0, vy: 0, onGround: false, coyote: 0, facing: 1
    };
    camX = clamp(player.x - W * 0.35, 0, Math.max(0, lvl.width - W));
  }

  function startLevel() {
    lvl = buildLevel(level, diff);
    checkpointIndex = 0;
    checkpointX = lvl.checkpoints[0];
    starMs = 0;
    hurtInvulnMs = 0;
    prevJump = false;
    jumpQueued = false;
    anim = 0;
    spawnPlayer();
  }

  /* ---------------- 新局 / 开始 / 暂停 / 切难度 ---------------- */

  function newGame(dKey) {
    diff = dKey || diff;
    score = 0;
    lives = diffDef().lives;
    level = 1;
    cleared = {};
    isRecord = false;
    startLevel();
    status = 'ready';
    overlayInfo = null;
    overlay.hidden = true;
    recordBadge.hidden = true;
    updateHud();
    updateVeil();
    save();
  }

  function start() {
    if (status === 'lose' || status === 'win' || status === 'levelclear') newGame(diff);
    if (status !== 'running') {
      status = 'running';
      overlay.hidden = true;
      overlayInfo = null;
      sfx('start');
      updateVeil();
      save();
    }
  }

  function togglePause() {
    if (status === 'lose' || status === 'win' || status === 'levelclear') return;
    if (status === 'ready') { start(); return; }
    if (status === 'running') { status = 'paused'; sfx('click'); }
    else if (status === 'paused') { status = 'running'; sfx('click'); }
    updateVeil();
    save();
  }

  function switchDiff(nd) {
    if (!DIFFS[nd] || nd === diff) return;
    if ((status === 'running' || status === 'paused') && score > 0) {
      if (!window.confirm(t('confirm_diff'))) { syncDiffs(); return; }
    }
    save();                            // 先存旧难度进度
    diff = nd;
    saveDiff();
    syncDiffs();
    sfx('toggle');
    if (!loadTier(diff)) newGame(diff);   // 按难度隔离恢复 / 重开
    updateHud();
    updateVeil();
    refreshDynamicText();
    draw();
  }

  function nextLevel() {
    if (level >= MAX_LEVEL) return;
    level += 1;
    startLevel();
    status = 'running';
    overlay.hidden = true;
    overlayInfo = null;
    sfx('start');
    updateHud();
    updateVeil();
    save();
  }

  /* ---------------- 结算 / 生命 ---------------- */

  function settleBest() {
    if (score > (best[diff] || 0)) {
      best[diff] = score;
      isRecord = true;
      saveBest();
      recordBadge.hidden = false;
      sfx('record');
    }
  }

  function showOverlay(titleKey, subKey, vars, kind, subFn) {
    overlayInfo = { title: titleKey, sub: subKey, vars: vars, kind: kind, subFn: subFn || null };
    $('overlay-title').textContent = t(titleKey);
    $('overlay-sub').textContent = subFn ? subFn() : tf(subKey, vars);
    $('overlay-score').textContent = String(score);
    $('btn-next').hidden = (kind !== 'next');
    $('btn-again').hidden = (kind !== 'again');
    overlay.hidden = false;
    if (overlay.scrollIntoView) {
      try { overlay.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
    }
  }

  function levelClear() {
    if (status !== 'running') return;
    score += 500 + lives * 100;
    cleared[level] = true;
    sfx('flag');
    settleBest();
    save();
    var vars = { score: score, level: level, points: score, lv: level };
    if (level >= MAX_LEVEL) {
      status = 'win';
      sfx('win');
      showOverlay('win_title', 'win_sub', vars, 'again');
    } else {
      status = 'levelclear';
      sfx('levelup');
      // 字典 win_title 是「全部通关」，单关过关改用「已过关」+ 关卡进度
      showOverlay('label_matched', null, null, 'next', function () {
        return t('label_level') + ' ' + level + '/' + MAX_LEVEL;
      });
    }
    updateHud();
    updateVeil();
  }

  function gameOver() {
    if (status === 'lose') return;
    status = 'lose';
    sfx('lose');
    settleBest();
    save();
    showOverlay('lose_title', 'lose_sub', { score: score, level: level, points: score, lv: level }, 'again');
    updateHud();
    updateVeil();
  }

  function respawn() {
    player.x = checkpointX;
    player.y = GROUND_Y - player.h - 2;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.coyote = 0;
    jumpQueued = false;
    hurtInvulnMs = HURT_INVULN_MS;
    camX = clamp(player.x - W * 0.35, 0, Math.max(0, lvl.width - W));
  }

  // 掉进缺口 / 侧面碰到敌人，都扣一条命；命归零则结束
  function loseLife() {
    if (status !== 'running') return;
    lives -= 1;
    sfx('boom');
    if (lives <= 0) {
      lives = 0;
      gameOver();
      return;
    }
    respawn();
    updateHud();
    save();
  }

  /* ---------------- 物理（固定时间步长） ---------------- */

  function updateMovers(dt) {
    for (var i = 0; i < lvl.movers.length; i++) {
      var m = lvl.movers[i];
      var ox = m.x;
      m.x += m.vx * dt;
      if (m.x < m.minX) { m.x = m.minX; m.vx = -m.vx; }
      if (m.x + m.w > m.maxX) { m.x = m.maxX - m.w; m.vx = -m.vx; }
      m.dx = m.x - ox;
    }
  }

  function resolveHorizontal(prevX) {
    for (var i = 0; i < lvl.solids.length; i++) {
      var s = lvl.solids[i];
      if (s.oneWay) continue;         // 单向平台不挡侧面
      if (!overlaps(player.x, player.y, player.w, player.h, s.x, s.y, s.w, s.h)) continue;
      if (prevX + player.w <= s.x + 0.5) {
        player.x = s.x - player.w;
        player.vx = 0;
      } else if (prevX >= s.x + s.w - 0.5) {
        player.x = s.x + s.w;
        player.vx = 0;
      }
    }
  }

  function resolveVertical(prevY, prevBottom) {
    player.onGround = false;
    for (var i = 0; i < lvl.solids.length; i++) {
      var s = lvl.solids[i];
      if (!overlaps(player.x, player.y, player.w, player.h, s.x, s.y, s.w, s.h)) continue;
      if (s.oneWay) {
        // 单向平台：只有从上方下落时才接住，上升 / 侧面一律穿过
        if (player.vy >= 0 && prevBottom <= s.y + 3) {
          player.y = s.y - player.h;
          player.vy = 0;
          player.onGround = true;
          if (s.isMover && s.dx) player.x += s.dx;
        }
        continue;
      }
      if (player.vy >= 0 && prevBottom <= s.y + 3) {
        player.y = s.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0 && prevY >= s.y + s.h - 3) {
        player.y = s.y + s.h;         // 顶头
        player.vy = 0;
        sfx('brick', {}, 140);
      } else {
        if (player.x + player.w / 2 < s.x + s.w / 2) player.x = s.x - player.w;
        else player.x = s.x + s.w;
        player.vx = 0;
      }
    }
  }

  function updateEnemies(dt, prevBottom, vyBefore) {
    if (status !== 'running') return;
    for (var i = 0; i < lvl.enemies.length; i++) {
      var e = lvl.enemies[i];
      if (!e.alive) continue;
      e.x += e.vx * dt;
      if (e.x < e.minX) { e.x = e.minX; e.vx = -e.vx; }
      if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -e.vx; }
      e.anim += dt;
      if (!overlaps(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) continue;

      var stomp = vyBefore > 0 && prevBottom <= e.y + 8;
      if (stomp) {
        e.alive = false;
        player.vy = STOMP_V;
        player.onGround = false;
        score += 150;
        sfx('brick');
        updateHud();
        save();
      } else if (isInvuln()) {
        e.alive = false;
        score += 150;
        sfx('pop');
        updateHud();
        save();
      } else {
        loseLife();
      }
    }
  }

  function collectCoins() {
    if (status !== 'running') return;
    for (var i = 0; i < lvl.coins.length; i++) {
      var c = lvl.coins[i];
      if (c.taken) continue;
      if (overlaps(player.x, player.y, player.w, player.h, c.x - c.r, c.y - c.r, c.r * 2, c.r * 2)) {
        c.taken = true;
        score += 100;
        sfx('coin');
        updateHud();
        save();
      }
    }
  }

  function collectStars() {
    if (status !== 'running') return;
    for (var i = 0; i < lvl.stars.length; i++) {
      var s = lvl.stars[i];
      if (s.taken) continue;
      if (overlaps(player.x, player.y, player.w, player.h, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2)) {
        s.taken = true;
        starMs = STAR_MS;
        score += 50;
        sfx('powerup');
        updateHud();
        save();
      }
    }
  }

  function checkCheckpoint() {
    for (var i = lvl.checkpoints.length - 1; i > checkpointIndex; i--) {
      if (player.x >= lvl.checkpoints[i]) {
        checkpointIndex = i;
        checkpointX = lvl.checkpoints[i];
        save();
        break;
      }
    }
  }

  function checkFlag() {
    if (status !== 'running') return;
    if (player.x + player.w >= lvl.flagX) levelClear();
  }

  function update(dt) {
    anim += dt;
    if (starMs > 0) starMs = Math.max(0, starMs - dt * 1000);
    if (hurtInvulnMs > 0) hurtInvulnMs = Math.max(0, hurtInvulnMs - dt * 1000);

    var dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var accV = player.onGround ? MOVE_ACC : AIR_ACC;
    if (dir !== 0) {
      player.vx += dir * accV * dt;
      player.facing = dir;
    } else {
      var fr = player.onGround ? GROUND_FRICTION : AIR_FRICTION;
      if (player.vx > 0) player.vx = Math.max(0, player.vx - fr * dt);
      else if (player.vx < 0) player.vx = Math.min(0, player.vx + fr * dt);
    }
    player.vx = clamp(player.vx, -MAX_SPEED, MAX_SPEED);

    var wantJump = jumpQueued || (input.jump && !prevJump);
    jumpQueued = false;
    prevJump = input.jump;
    if (wantJump && (player.onGround || player.coyote > 0)) {
      player.vy = JUMP_V;
      player.onGround = false;
      player.coyote = 0;
      sfx('bounce');
    }

    player.vy += GRAVITY * dt;
    if (player.vy > 760) player.vy = 760;

    updateMovers(dt);

    var vyBefore = player.vy;      // 记录碰撞前的下落速度，供踩敌判定使用
    var prevX = player.x;
    var prevY = player.y;
    var prevBottom = player.y + player.h;

    player.x += player.vx * dt;
    resolveHorizontal(prevX);
    player.y += player.vy * dt;
    resolveVertical(prevY, prevBottom);

    if (player.x < 0) { player.x = 0; player.vx = 0; }
    if (player.x > lvl.width - player.w) { player.x = lvl.width - player.w; player.vx = 0; }

    if (player.onGround) player.coyote = COYOTE;
    else player.coyote = Math.max(0, player.coyote - dt);

    updateEnemies(dt, prevBottom, vyBefore);
    collectCoins();
    collectStars();
    checkCheckpoint();
    checkFlag();

    if (player.y > H + 24) loseLife();   // 掉进缺口

    camX = clamp(player.x - W * 0.35, 0, Math.max(0, lvl.width - W));
  }

  /* ---------------- 绘制（全部原创几何像素块） ---------------- */

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

  function drawCloud(x, y) {
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 16, y - 7, 15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 33, y, 11, 0, Math.PI * 2); ctx.fill();
  }

  function drawBackdrop() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#DDEBE9');
    g.addColorStop(1, '#F5EFDE');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var off = camX * 0.18;
    ctx.fillStyle = '#C7D6C4';
    for (var i = 0; i < 7; i++) {
      var hx = i * 150 - (off % 150) - 40;
      ctx.beginPath();
      ctx.moveTo(hx, GROUND_Y);
      ctx.lineTo(hx + 58, GROUND_Y - 58);
      ctx.lineTo(hx + 124, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#D6E1D0';
    for (var j = 0; j < 6; j++) {
      var hx2 = j * 190 - (off * 0.6 % 190) - 30;
      ctx.beginPath();
      ctx.moveTo(hx2, GROUND_Y);
      ctx.lineTo(hx2 + 72, GROUND_Y - 32);
      ctx.lineTo(hx2 + 152, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }

    var coff = camX * 0.28;
    ctx.fillStyle = 'rgba(255,253,248,.72)';
    for (var c = 0; c < 7; c++) {
      var cx = c * 200 + 80 - coff;
      cx = ((cx % 1400) + 1400) % 1400 - 200;
      drawCloud(cx, 38 + (c % 3) * 26);
    }
  }

  function drawGround() {
    for (var i = 0; i < lvl.ground.length; i++) {
      var s = lvl.ground[i];
      ctx.fillStyle = C.ground;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = C.groundTop;
      ctx.fillRect(s.x, s.y, s.w, 5);
      ctx.strokeStyle = C.groundDark;
      ctx.lineWidth = 1;
      for (var gx = s.x + 16; gx < s.x + s.w; gx += 16) {
        ctx.beginPath(); ctx.moveTo(gx, s.y + 5); ctx.lineTo(gx, s.y + s.h); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(s.x, s.y + 20); ctx.lineTo(s.x + s.w, s.y + 20); ctx.stroke();
    }
  }

  function drawBrickRect(x, y, w, h, top, body, line) {
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = top;
    ctx.fillRect(x, y, w, 3);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (var bx = x + 16; bx < x + w; bx += 16) {
      ctx.beginPath(); ctx.moveTo(bx, y + 3); ctx.lineTo(bx, y + h); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
  }

  function drawPlatforms() {
    for (var i = 0; i < lvl.platforms.length; i++) {
      var p = lvl.platforms[i];
      drawBrickRect(p.x, p.y, p.w, p.h, C.brickTop, C.brick, C.brickLine);
    }
  }

  function drawPipes() {
    for (var i = 0; i < lvl.pipes.length; i++) {
      var p = lvl.pipes[i];
      ctx.fillStyle = C.pipe;
      rrect(p.x, p.y, p.w, p.h, 4);
      ctx.fill();
      ctx.fillStyle = C.pipeDark;
      ctx.fillRect(p.x - 3, p.y, p.w + 6, 7);
      ctx.fillStyle = C.pipe;
      ctx.fillRect(p.x - 3, p.y + 7, p.w + 6, 3);
      ctx.strokeStyle = C.pipeDark;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x + 8, p.y + 10); ctx.lineTo(p.x + 8, p.y + p.h); ctx.stroke();
    }
  }

  function drawMovers() {
    for (var i = 0; i < lvl.movers.length; i++) {
      var m = lvl.movers[i];
      ctx.fillStyle = C.mover;
      rrect(m.x, m.y, m.w, m.h, 3);
      ctx.fill();
      ctx.fillStyle = C.moverTop;
      ctx.fillRect(m.x + 2, m.y, m.w - 4, 3);
      ctx.fillStyle = C.pipeDark;
      ctx.fillRect(m.x + 4, m.y + 5, 4, 3);
      ctx.fillRect(m.x + m.w - 8, m.y + 5, 4, 3);
    }
  }

  function drawCoins() {
    for (var i = 0; i < lvl.coins.length; i++) {
      var c = lvl.coins[i];
      if (c.taken) continue;
      var sw = 0.4 + 0.6 * Math.abs(Math.cos(anim * 3 + c.x * 0.02));
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(anim * 4 + c.x * 0.01) * 1.5);
      ctx.scale(sw, 1);
      ctx.fillStyle = C.coin;
      ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.coinInner;
      ctx.beginPath(); ctx.arc(0, 0, c.r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawStars() {
    for (var i = 0; i < lvl.stars.length; i++) {
      var s = lvl.stars[i];
      if (s.taken) continue;
      ctx.save();
      ctx.translate(s.x, s.y + Math.sin(anim * 3) * 2);
      ctx.rotate(anim * 1.4);
      ctx.fillStyle = C.starDark;
      starPath(s.r);
      ctx.fill();
      ctx.fillStyle = C.star;
      ctx.rotate(0.18);
      starPath(s.r * 0.78);
      ctx.fill();
      ctx.restore();
    }
  }

  function starPath(r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = (i % 2 === 0) ? r : r * 0.45;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var px = Math.cos(a) * rr;
      var py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawEnemies() {
    for (var i = 0; i < lvl.enemies.length; i++) {
      var e = lvl.enemies[i];
      if (!e.alive) continue;
      var bob = Math.sin(e.anim * 6) * 1.4;
      ctx.fillStyle = C.enemyDark;
      ctx.fillRect(e.x + 2, e.y + e.h - 3 + bob, 5, 4);
      ctx.fillRect(e.x + e.w - 7, e.y + e.h - 3 + bob, 5, 4);
      ctx.fillStyle = C.enemy;
      rrect(e.x, e.y + bob, e.w, e.h - 2, 5);
      ctx.fill();
      ctx.fillStyle = C.enemyEye;
      ctx.fillRect(e.x + 4, e.y + 5 + bob, 4, 4);
      ctx.fillRect(e.x + e.w - 8, e.y + 5 + bob, 4, 4);
      ctx.fillStyle = '#5A4A46';
      ctx.fillRect(e.x + 6, e.y + 6 + bob, 2, 2);
      ctx.fillRect(e.x + e.w - 6, e.y + 6 + bob, 2, 2);
    }
  }

  function drawFlag() {
    var fx = lvl.flagX;
    var fy = GROUND_Y;
    ctx.fillStyle = C.poleDark;
    ctx.fillRect(fx - 7, fy - 6, 15, 6);
    ctx.fillStyle = C.pole;
    ctx.fillRect(fx - 2, fy - 118, 4, 118);
    ctx.fillStyle = C.flag;
    ctx.beginPath(); ctx.arc(fx, fy - 118, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx + 2, fy - 112);
    ctx.lineTo(fx + 34, fy - 104);
    ctx.lineTo(fx + 2, fy - 96);
    ctx.closePath();
    ctx.fill();
  }

  // 原创「圆头小人」：圆脑袋 + 帽檐 + 方块身体 + 摆动双腿，纯几何
  function drawPlayer() {
    var x = player.x;
    var y = player.y;
    ctx.save();
    if (isInvuln() && Math.floor(anim * 12) % 2 === 0) ctx.globalAlpha = 0.55;

    if (starMs > 0) {
      ctx.strokeStyle = 'rgba(224,192,104,.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + player.w / 2, y + player.h / 2, player.w + 5 + Math.sin(anim * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    var swing = Math.sin(anim * 14) * Math.min(1, Math.abs(player.vx) / MAX_SPEED) * 3;
    ctx.fillStyle = C.playerDark;
    ctx.fillRect(x + 2, y + player.h - 6, 6, 6 + swing);
    ctx.fillRect(x + player.w - 8, y + player.h - 6, 6, 6 - swing);

    ctx.fillStyle = C.player;
    rrect(x + 1, y + 9, player.w - 2, player.h - 13, 4);
    ctx.fill();

    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.arc(x + player.w / 2, y + 7, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.player;
    ctx.beginPath(); ctx.arc(x + player.w / 2, y + 7, 7, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(x + 1, y + 3, player.w - 2, 3);

    ctx.fillStyle = '#454B59';
    var ex = player.facing > 0 ? 1.5 : -1.5;
    ctx.fillRect(x + player.w / 2 - 3 + ex, y + 8, 2, 2);
    ctx.fillRect(x + player.w / 2 + 2 + ex, y + 8, 2, 2);
    ctx.restore();
  }

  function draw() {
    if (!ctx || !lvl || !player) return;
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    ctx.save();
    ctx.translate(-camX, 0);
    drawGround();
    drawPlatforms();
    drawPipes();
    drawMovers();
    drawCoins();
    drawStars();
    drawEnemies();
    drawFlag();
    drawPlayer();
    ctx.restore();
  }

  function fitCanvas() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.round(rect.height);
    if (!cssH || cssH < 10) cssH = Math.round(cssW * H / W);

    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var pw = Math.round(cssW * dpr);
    var ph = Math.round(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx = canvas.getContext('2d');
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
    draw();
  }

  /* ---------------- 界面 ---------------- */

  function updateHud() {
    $('score').textContent = String(score);
    $('best').textContent = (best[diff] > 0) ? String(best[diff]) : '--';
    $('level').textContent = String(level) + '/' + String(MAX_LEVEL);
    $('lives').textContent = String(lives);
  }

  function updateVeil() {
    btnPause.textContent = (status === 'paused') ? t('btn_resume') : t('btn_pause');
    if (status === 'ready') {
      veil.hidden = false;
      veilText.textContent = t('btn_start');
    } else if (status === 'paused') {
      veil.hidden = false;
      veilText.textContent = t('paused_title');
    } else {
      veil.hidden = true;
    }
  }

  function syncPowerBar() {
    if (starMs > 0) {
      powerBar.hidden = false;
      powerFill.style.width = (starMs / STAR_MS * 100).toFixed(1) + '%';
      powerNum.textContent = (starMs / 1000).toFixed(1);
    } else {
      powerBar.hidden = true;
    }
  }

  function syncDiffs() {
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // I18N.apply 只管 data-i18n；字典缺 key 时会留下裸 key，这里补一层兜底
  function repairStaticI18n() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var k = nodes[i].getAttribute('data-i18n');
      if (nodes[i].textContent === k) nodes[i].textContent = t(k);
    }
    var ar = document.querySelectorAll('[data-i18n-aria]');
    for (var j = 0; j < ar.length; j++) {
      var ak = ar[j].getAttribute('data-i18n-aria');
      if (ar[j].getAttribute('aria-label') === ak) ar[j].setAttribute('aria-label', t(ak));
    }
    if (document.title === 'page_title') document.title = t('page_title');
  }

  // 语言原地切换时重绘：静态兜底 + 动态文案（暂停按钮 / 遮罩 / 结算卡）
  function refreshDynamicText() {
    repairStaticI18n();
    syncDiffs();
    updateVeil();
    updateHud();
    if (overlayInfo && !overlay.hidden) {
      $('overlay-title').textContent = t(overlayInfo.title);
      $('overlay-sub').textContent = overlayInfo.subFn ? overlayInfo.subFn() : tf(overlayInfo.sub, overlayInfo.vars);
      $('btn-next').hidden = (overlayInfo.kind !== 'next');
      $('btn-again').hidden = (overlayInfo.kind !== 'again');
    }
  }

  /* ---------------- 输入 ---------------- */

  function bindHold(id, key) {
    var el = $(id);
    function on(e) {
      if (e.preventDefault) e.preventDefault();
      input[key] = true;
      if (key === 'jump') jumpQueued = true;
      el.classList.add('is-down');
      if (el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); } catch (e2) { /* ignore */ }
      }
    }
    function off(e) {
      if (e && e.preventDefault) e.preventDefault();
      input[key] = false;
      el.classList.remove('is-down');
    }
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('lostpointercapture', off);
  }

  function bind() {
    var diffs = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < diffs.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { switchDiff(btn.getAttribute('data-diff')); });
      })(diffs[i]);
    }

    $('btn-start').addEventListener('click', function () { sfx('click'); start(); });
    btnPause.addEventListener('click', togglePause);
    $('btn-restart').addEventListener('click', function () { sfx('click'); newGame(diff); start(); });
    $('btn-again').addEventListener('click', function () { sfx('click'); newGame(diff); start(); });
    $('btn-next').addEventListener('click', function () { sfx('click'); nextLevel(); });

    // 触屏三键：按住生效（左 / 右 / 跳）
    bindHold('pad-left', 'left');
    bindHold('pad-right', 'right');
    bindHold('pad-jump', 'jump');

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var k = e.key;
      var handled = true;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.left = true;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.right = true;
      else if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        if (!input.jump) jumpQueued = true;
        input.jump = true;
      } else if (k === 'p' || k === 'P') togglePause();
      else handled = false;
      if (handled) e.preventDefault();
    });

    document.addEventListener('keyup', function (e) {
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.left = false;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.right = false;
      else if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'w' || k === 'W') input.jump = false;
    });

    // 切到后台自动暂停
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && status === 'running') {
        status = 'paused';
        updateVeil();
        save();
      }
    });

    document.addEventListener('ys:langchange', refreshDynamicText);

    window.addEventListener('resize', function () {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { fitCanvas(); }, 120);
    });
  }

  /* ---------------- 主循环 ---------------- */

  function loop(ts) {
    window.requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(ts - lastTs, 50) : 0;
    lastTs = ts;

    if (status === 'running') {
      acc += dt / 1000;
      var guard = 0;
      while (acc >= STEP && guard < 8) {
        update(STEP);
        acc -= STEP;
        guard++;
      }
      if (guard >= 8) acc = 0;
    } else {
      acc = 0;
    }

    // 定期落盘，保证断点续玩
    if (ts - lastSaveTs > 3000) {
      lastSaveTs = ts;
      if (status !== 'lose' && status !== 'win') save();
    }

    draw();
    syncPowerBar();
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    ctx = canvas.getContext('2d');
    loadDiff();
    best = loadBest();
    saveDiff();                    // 三个存档键开局即落盘
    saveBest();
    syncDiffs();
    if (!loadTier(diff)) newGame(diff);
    bind();
    refreshDynamicText();
    fitCanvas();
    window.requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
