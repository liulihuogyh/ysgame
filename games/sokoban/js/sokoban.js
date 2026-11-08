/**
 * 推箱子 · 游戏逻辑
 * 纯前端、无依赖，十关全部手写并用求解器验证过可解。
 *
 * 规则：小人只能推、不能拉；把每个箱子推到目标点上就过关。
 * 推错了可以撤销（有完整历史栈），卡死了可以重来这一关。
 * [gyh 2026-11-03 新增]
 */
(function () {
  'use strict';

  var STATE_KEY = 'ysgame-soko-state';
  var BEST_KEY = 'ysgame-soko-best';
  var TIER_KEY = 'ysgame-soko-tier';
  var LAST_KEY = 'ysgame-soko-last';
  var MAX_HISTORY = 400;

  /* ------------------------------------------------------------------
     三档难度（每档 10 关，共 30 关），全部用 BFS 求解器验证过可解。
     难度按「最少步数 par」逐级递增：
       简单   6 → 15   步
       中等  18 → 27   步
       困难  36 → 61   步
     # 墙   . 目标   $ 箱子   @ 小人   * 箱在目标上
     [gyh 2026-11-03 修改]
     ------------------------------------------------------------------ */
  var TIERS = {
    'easy': [
      [
        '#######',
        '#   $.#',
        '#.@$  #',
        '#     #',
        '#     #',
        '##  ###',
        '#######'
      ],
      [
        '########',
        '###    #',
        '##     #',
        '#  # $ #',
        '##*# @ #',
        '# # .  #',
        '########'
      ],
      [
        '#######',
        '# .$  #',
        '#  # .#',
        '#  @$ #',
        '# #   #',
        '#    ##',
        '#######'
      ],
      [
        '########',
        '#      #',
        '## .   #',
        '##@$   #',
        '#    # #',
        '# # .$ #',
        '########'
      ],
      [
        '#########',
        '##     ##',
        '#. @$   #',
        '#  $ .  #',
        '# #     #',
        '#    #  #',
        '#########'
      ],
      [
        '########',
        '#      #',
        '#    $ #',
        '## @.  #',
        '# .$   #',
        '#    # #',
        '########'
      ],
      [
        '#######',
        '# #  .#',
        '#    $#',
        '# #   #',
        '#   # #',
        '## $@.#',
        '#######'
      ],
      [
        '########',
        '#      #',
        '#$     #',
        '#.    ##',
        '#      #',
        '# .@$  #',
        '########'
      ],
      [
        '#######',
        '#    ##',
        '# .#  #',
        '# $# ##',
        '#.$   #',
        '# @# ##',
        '#######'
      ],
      [
        '#########',
        '##     .#',
        '#   # $@#',
        '#       #',
        '# $.    #',
        '#     # #',
        '#########'
      ],
    ],
    'medium': [
      [
        '#########',
        '# $. #  #',
        '#    $  #',
        '#    @  #',
        '#    #  #',
        '#   .   #',
        '#   #   #',
        '#########'
      ],
      [
        '#########',
        '#       #',
        '#  #    #',
        '#  #    #',
        '#  #   ##',
        '#  $. # #',
        '#. @$ # #',
        '#########'
      ],
      [
        '##########',
        '# @. .   #',
        '# $ #  $ #',
        '#        #',
        '#        #',
        '#    #$  #',
        '#     .# #',
        '##########'
      ],
      [
        '##########',
        '#        #',
        '#  ##$ # #',
        '#     . ##',
        '# $@# #  #',
        '#.     # #',
        '#        #',
        '##########'
      ],
      [
        '##########',
        '##  #    #',
        '#       .#',
        '#    # $ #',
        '# # # .@##',
        '#  $     #',
        '# #   #  #',
        '##########'
      ],
      [
        '##########',
        '## .$    #',
        '##@$     #',
        '#  .    ##',
        '#.       #',
        '# $      #',
        '# #      #',
        '##########'
      ],
      [
        '#########',
        '#  $.  .#',
        '## #    #',
        '#       #',
        '#.      #',
        '#@$   $ #',
        '##      #',
        '#########'
      ],
      [
        '#########',
        '##      #',
        '#    # @#',
        '#   .##$#',
        '# $   #.#',
        '#   #   #',
        '#    .$ #',
        '#########'
      ],
      [
        '#########',
        '#.   $  #',
        '#  @.  .#',
        '#  $##  #',
        '#     $ #',
        '#     # #',
        '# #     #',
        '#########'
      ],
      [
        '#########',
        '##  @ . #',
        '## #$ $ #',
        '#  # .  #',
        '##   #. #',
        '####  $ #',
        '#       #',
        '#########'
      ],
    ],
    'hard': [
      [
        '##########',
        '##       #',
        '# #    # #',
        '#  $     #',
        '#.  ##   #',
        '#    @$#$#',
        '# #  #  .#',
        '#     .  #',
        '##########'
      ],
      [
        '###########',
        '# #    #  #',
        '#  @ ##   #',
        '#  $ $    #',
        '#     . $##',
        '#    #    #',
        '##     .# #',
        '#   .#    #',
        '###########'
      ],
      [
        '##########',
        '# #      #',
        '#  $     #',
        '##.#  #  #',
        '##  #$   #',
        '#    @   #',
        '#.       #',
        '#  $.#   #',
        '##########'
      ],
      [
        '##########',
        '#.@#     #',
        '# $   #  #',
        '#  #     #',
        '#.#   $  #',
        '#   $  # #',
        '#        #',
        '# #.     #',
        '##########'
      ],
      [
        '###########',
        '##   #  # #',
        '# #$ $@   #',
        '#      #  #',
        '#.        #',
        '#  #    .##',
        '#.$ #    ##',
        '# #       #',
        '###########'
      ],
      [
        '###########',
        '#  .      #',
        '#         #',
        '# . $#    #',
        '#      ## #',
        '##  #  #  #',
        '# . @$$   #',
        '##  #   # #',
        '###########'
      ],
      [
        '###########',
        '#         #',
        '#    . # ##',
        '#      $  #',
        '#    # @  #',
        '#    .    #',
        '##  # $#$ #',
        '# #    # .#',
        '###########'
      ],
      [
        '###########',
        '#      # .#',
        '# $#      #',
        '#    #    #',
        '# @ $   ###',
        '#.$#      #',
        '##        #',
        '##     #. #',
        '###########'
      ],
      [
        '###########',
        '#   .    .#',
        '#   @     #',
        '# $ $ #   #',
        '## ###    #',
        '#.     #  #',
        '# $ #     #',
        '#  #      #',
        '###########'
      ],
      [
        '###########',
        '#.        #',
        '# #       #',
        '# $@ $#  .#',
        '#       # #',
        '#$## #    #',
        '#   #  #  #',
        '#  .      #',
        '###########'
      ],
    ],
  };

  var TIER_ORDER = ['easy', 'medium', 'hard'];

  function levelsOf(tier) {
    return TIERS[tier] || TIERS.easy;
  }

  var DIRS = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1]
  };

  /* ------------------------------------------------------------------
     状态
     ------------------------------------------------------------------ */
  var state = {
    tier: 'easy',
    level: 0,
    w: 0,
    h: 0,
    walls: {},
    goals: [],
    boxes: [],
    player: { r: 0, c: 0 },
    moves: 0,
    pushes: 0,
    started: false,
    startedAt: 0,
    elapsed: 0,
    done: false,
    history: [],
    best: { easy: {}, medium: {}, hard: {} }
  };

  var toastTimer = 0;
  var toastKey = '';
  var holdTimer = 0;
  var holdDelay = 0;
  var swipe = null;

  var dom = {};

  /* ------------------------------------------------------------------
     小工具
     ------------------------------------------------------------------ */

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function key(r, c) {
    return r + ',' + c;
  }

  function isWall(r, c) {
    if (r < 0 || c < 0 || r >= state.h || c >= state.w) return true;
    return !!state.walls[key(r, c)];
  }

  function fmtTime(sec) {
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    var rest = s % 60;
    return m + ':' + (rest < 10 ? '0' : '') + rest;
  }

  function elapsedSec() {
    var sec = state.elapsed;
    if (state.started && !state.done && state.startedAt) {
      sec += (Date.now() - state.startedAt) / 1000;
    }
    return Math.max(0, Math.floor(sec));
  }

  function progressText() {
    var on = 0;
    for (var i = 0; i < state.boxes.length; i++) {
      if (isGoal(state.boxes[i].r, state.boxes[i].c)) on++;
    }
    return on + ' / ' + state.boxes.length;
  }

  /* ------------------------------------------------------------------
     关卡解析
     ------------------------------------------------------------------ */

  function parseLevel(rows) {
    var h = rows.length;
    var w = 0;
    var i, j;

    for (i = 0; i < h; i++) w = Math.max(w, rows[i].length);

    var walls = {};
    var goals = [];
    var boxes = [];
    var player = null;

    for (i = 0; i < h; i++) {
      for (j = 0; j < w; j++) {
        var ch = rows[i].charAt(j) || ' ';
        if (ch === '#') {
          walls[key(i, j)] = true;
        } else if (ch === '.') {
          goals.push({ r: i, c: j });
        } else if (ch === '$') {
          boxes.push({ r: i, c: j });
        } else if (ch === '*') {
          boxes.push({ r: i, c: j });
          goals.push({ r: i, c: j });
        } else if (ch === '@') {
          player = { r: i, c: j };
        } else if (ch === '+') {
          player = { r: i, c: j };
          goals.push({ r: i, c: j });
        }
      }
    }

    return { w: w, h: h, walls: walls, goals: goals, boxes: boxes, player: player };
  }

  function isGoal(r, c) {
    for (var i = 0; i < state.goals.length; i++) {
      if (state.goals[i].r === r && state.goals[i].c === c) return true;
    }
    return false;
  }

  function boxAt(r, c) {
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].r === r && state.boxes[i].c === c) return state.boxes[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------
     渲染
     ------------------------------------------------------------------ */

  function buildBoard() {
    var parsed = parseLevel(levelsOf(state.tier)[state.level]);

    state.w = parsed.w;
    state.h = parsed.h;
    state.walls = parsed.walls;
    state.goals = parsed.goals;
    state.boxes = parsed.boxes;
    state.player = parsed.player;

    dom.board.style.setProperty('--cols', parsed.w);
    dom.board.style.setProperty('--rows', parsed.h);
    dom.board.classList.remove('is-done');

    var frag = document.createDocumentFragment();
    for (var r = 0; r < parsed.h; r++) {
      for (var c = 0; c < parsed.w; c++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        if (parsed.walls[key(r, c)]) cell.className += ' cell--wall';
        if (isGoal(r, c)) cell.className += ' cell--goal';
        frag.appendChild(cell);
      }
    }
    dom.cells.innerHTML = '';
    dom.cells.appendChild(frag);

    dom.actors.innerHTML = '';
    state.boxes.forEach(function (b, index) {
      var el = document.createElement('div');
      el.className = 'actor actor--box';
      el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('--r', b.r);
      el.style.setProperty('--c', b.c);
      el.innerHTML = '<span class="actor__i"></span>';
      b.el = el;
      b.id = index;
      dom.actors.appendChild(el);
    });

    var p = document.createElement('div');
    p.className = 'actor actor--player';
    p.setAttribute('aria-hidden', 'true');
    p.innerHTML = '<span class="actor__i"></span>';
    state.playerEl = p;
    dom.actors.appendChild(p);

    paintActors();
  }

  function paintActors() {
    state.boxes.forEach(function (b) {
      if (!b.el) return;
      b.el.style.setProperty('--r', b.r);
      b.el.style.setProperty('--c', b.c);
      b.el.classList.toggle('is-on-goal', isGoal(b.r, b.c));
    });

    if (state.playerEl) {
      state.playerEl.style.setProperty('--r', state.player.r);
      state.playerEl.style.setProperty('--c', state.player.c);
    }
  }

  function refreshHud() {
    dom.moves.textContent = String(state.moves);
    dom.timer.textContent = fmtTime(elapsedSec());
    var best = state.best[state.tier][state.level];
    dom.best.textContent = best ? String(best) : '--';
    dom.board.setAttribute('aria-label', t('board_aria') + ' · ' + progressText());
  }

  function syncLevelBar() {
    var items = dom.levels.children;
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      var lv = parseInt(el.dataset.level, 10);
      el.classList.toggle('is-active', lv === state.level);
      el.classList.toggle('is-cleared', typeof state.best[state.tier][lv] === 'number');
      el.setAttribute('aria-pressed', lv === state.level ? 'true' : 'false');
    }
  }

  function buildLevelBar() {
    dom.levels.innerHTML = '';
    for (var i = 0; i < levelsOf(state.tier).length; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lv';
      b.dataset.level = String(i);
      b.textContent = String(i + 1);
      b.setAttribute('aria-label', t('level_n').replace('{n}', i + 1));
      b.setAttribute('aria-pressed', 'false');
      dom.levels.appendChild(b);
    }
  }

  /* ------------------------------------------------------------------
     走一步
     ------------------------------------------------------------------ */

  function move(dir) {
    if (state.done) return;

    var d = DIRS[dir];
    if (!d) return;

    var nr = state.player.r + d[0];
    var nc = state.player.c + d[1];

    if (isWall(nr, nc)) {
      bump();
      return;
    }

    var bx = boxAt(nr, nc);

    if (bx) {
      var br = nr + d[0];
      var bc = nc + d[1];
      if (isWall(br, bc) || boxAt(br, bc)) {
        bump();
        return;
      }

      pushHistory({ pr: state.player.r, pc: state.player.c, box: bx, br: bx.r, bc: bx.c });
      bx.r = br;
      bx.c = bc;
      state.player.r = nr;
      state.player.c = nc;
      state.pushes++;
      soundPush();
    } else {
      pushHistory({ pr: state.player.r, pc: state.player.c, box: null });
      state.player.r = nr;
      state.player.c = nc;
      soundStep();
    }

    state.moves++;
    startClock();
    paintActors();
    refreshHud();

    if (isSolved()) {
      win();
      return;
    }

    // 推到角落（不是目标点）就再也推不出来了，提醒一下，不强制打断
    if (bx && !isGoal(bx.r, bx.c) && isCorner(bx.r, bx.c)) {
      showToast(t('deadlock'));
      soundDeadlock();
    }

    save();
  }

  function pushHistory(item) {
    state.history.push(item);
    if (state.history.length > MAX_HISTORY) state.history.shift();
  }

  function isCorner(r, c) {
    return (isWall(r - 1, c) || isWall(r + 1, c)) && (isWall(r, c - 1) || isWall(r, c + 1));
  }

  function isSolved() {
    for (var i = 0; i < state.boxes.length; i++) {
      if (!isGoal(state.boxes[i].r, state.boxes[i].c)) return false;
    }
    return true;
  }

  function undo() {
    if (state.done || !state.history.length) return;

    var h = state.history.pop();
    state.player.r = h.pr;
    state.player.c = h.pc;

    if (h.box) {
      h.box.r = h.br;
      h.box.c = h.bc;
      state.pushes = Math.max(0, state.pushes - 1);
    }

    state.moves = Math.max(0, state.moves - 1);
    hideToast();
    paintActors();
    refreshHud();
    soundUndo();
    save();
  }

  function bump() {
    dom.board.classList.remove('is-bump');
    void dom.board.offsetWidth;   // 重排一次，让连续撞墙也能重新播放
    dom.board.classList.add('is-bump');
    window.setTimeout(function () {
      dom.board.classList.remove('is-bump');
    }, 200);
  }

  /* ------------------------------------------------------------------
     结算
     ------------------------------------------------------------------ */

  function win() {
    state.done = true;
    state.elapsed = Math.max(1, elapsedSec());
    state.startedAt = 0;

    dom.board.classList.add('is-done');
    hideToast();
    soundWin();

    var prev = state.best[state.tier][state.level];
    if (typeof prev !== 'number' || state.moves < prev) {
      state.best[state.tier][state.level] = state.moves;
      saveBest();
    }

    refreshHud();
    syncLevelBar();
    showOverlay();

    // 这一关已经结束，清掉进行中的存档；刷新后回到同一关的初始状态
    try { localStorage.removeItem(STATE_KEY); } catch (e) {}
  }

  function allCleared() {
    for (var i = 0; i < levelsOf(state.tier).length; i++) {
      if (typeof state.best[state.tier][i] !== 'number') return false;
    }
    return true;
  }

  function showOverlay() {
    var tierLen = levelsOf(state.tier).length;
    var last = state.level === tierLen - 1;
    var hasNextTier = TIER_ORDER.indexOf(state.tier) < TIER_ORDER.length - 1;

    // 当前难度十关全清才说「本档通关」，否则只是这一关过了
    var allTier = allCleared();
    var titleKey = allTier ? 'win_tier_all' : 'win_title';
    var subKey = allTier ? 'win_sub_tier_all' : 'win_sub';

    dom.overlayTitle.setAttribute('data-i18n', titleKey);
    dom.overlaySub.setAttribute('data-i18n', subKey);
    dom.overlayTitle.textContent = t(titleKey);
    dom.overlaySub.textContent = t(subKey).replace('{n}', state.level + 1);

    dom.overlayMoves.textContent = String(state.moves);
    dom.overlayTime.textContent = fmtTime(state.elapsed);

    var nextKey;
    if (last && hasNextTier) nextKey = 'btn_next_tier';
    else if (last) nextKey = 'btn_first';
    else nextKey = 'btn_next';
    dom.btnNext.setAttribute('data-i18n', nextKey);
    dom.btnNext.textContent = t(nextKey);

    dom.overlay.hidden = false;
  }

  function hideOverlay() {
    dom.overlay.hidden = true;
  }

  /* ------------------------------------------------------------------
     提示条
     ------------------------------------------------------------------ */

  function showToast(message, msgKey) {
    toastKey = msgKey || '';
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 2800);
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    dom.toast.hidden = true;
    toastKey = '';
  }

  /* ------------------------------------------------------------------
     音效
     ------------------------------------------------------------------ */

  // [gyh 2026-11-03 修改] 改用全站音效引擎。
  // 推箱子走自己的主题：低音、闷、带石头重量，和别的游戏一听就能分开。
  function soundStep() { if (window.YSound) window.YSound.play('step'); }
  function soundPush() { if (window.YSound) window.YSound.play('push'); }
  function soundUndo() { if (window.YSound) window.YSound.play('undo'); }
  function soundWin() { if (window.YSound) window.YSound.play('win'); }
  function soundDeadlock() { if (window.YSound) window.YSound.play('deadlock'); }

  /* ------------------------------------------------------------------
     存档
     ------------------------------------------------------------------ */

  function save() {
    if (state.done) return;
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        v: 1,
        tier: state.tier,
        level: state.level,
        boxes: state.boxes.map(function (b) { return [b.r, b.c]; }),
        player: [state.player.r, state.player.c],
        moves: state.moves,
        pushes: state.pushes,
        started: state.started,
        elapsed: elapsedSec()
      }));
      setLast(state.tier, state.level);
      try { localStorage.setItem(TIER_KEY, state.tier); } catch (e) {}
    } catch (e) {}
  }

  function saveBest() {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(state.best)); } catch (e) {}
  }

  function loadBest() {
    var raw = null;
    try { raw = localStorage.getItem(BEST_KEY); } catch (e) {}
    if (!raw) return;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || typeof data !== 'object') return;

    // 新格式：{ easy:{...}, medium:{...}, hard:{...} }
    for (var ti = 0; ti < TIER_ORDER.length; ti++) {
      var tk = TIER_ORDER[ti];
      if (data[tk] && typeof data[tk] === 'object') {
        for (var k in data[tk]) {
          if (!Object.prototype.hasOwnProperty.call(data[tk], k)) continue;
          var n = parseInt(k, 10);
          if (n >= 0 && n < 30 && typeof data[tk][k] === 'number' && data[tk][k] > 0) {
            state.best[tk][n] = data[tk][k];
          }
        }
      }
    }

    // 旧格式兼容：顶层直接是 { 关卡索引: 步数 }（老版本的 10 关），并入 easy
    for (var lk in data) {
      if (!Object.prototype.hasOwnProperty.call(data, lk)) continue;
      if (TIER_ORDER.indexOf(lk) !== -1) continue;
      var ln = parseInt(lk, 10);
      if (!isNaN(ln) && typeof data[lk] === 'number' && data[lk] > 0) {
        state.best.easy[ln] = data[lk];
      }
    }
  }

  function getLast(tier) {
    var raw = null;
    try { raw = localStorage.getItem(LAST_KEY); } catch (e) {}
    if (!raw) return 0;
    var map;
    try { map = JSON.parse(raw); } catch (e) { return 0; }
    if (map && typeof map[tier] === 'number') return map[tier];
    return 0;
  }

  function setLast(tier, level) {
    var map = {};
    try { map = JSON.parse(localStorage.getItem(LAST_KEY)) || {}; } catch (e) { map = {}; }
    map[tier] = level;
    try { localStorage.setItem(LAST_KEY, JSON.stringify(map)); } catch (e) {}
  }

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(STATE_KEY); } catch (e) {}
    if (!raw) return false;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data || data.v !== 1) return false;

    var tier = (data.tier && TIERS[data.tier]) ? data.tier : 'easy';
    var level = parseInt(data.level, 10);
    if (!(level >= 0 && level < levelsOf(tier).length)) return false;

    var base = parseLevel(levelsOf(tier)[level]);
    if (!Array.isArray(data.boxes) || data.boxes.length !== base.boxes.length) return false;
    if (!Array.isArray(data.player) || data.player.length !== 2) return false;

    var boxes = [];
    for (var i = 0; i < data.boxes.length; i++) {
      var b = data.boxes[i];
      if (!Array.isArray(b) || b.length !== 2) return false;
      var r = b[0];
      var c = b[1];
      if (typeof r !== 'number' || typeof c !== 'number') return false;
      if (r < 0 || r >= base.h || c < 0 || c >= base.w) return false;
      if (base.walls[key(r, c)]) return false;
      boxes.push({ r: r, c: c });
    }

    var pr = data.player[0];
    var pc = data.player[1];
    if (typeof pr !== 'number' || typeof pc !== 'number') return false;
    if (pr < 0 || pr >= base.h || pc < 0 || pc >= base.w) return false;
    if (base.walls[key(pr, pc)]) return false;

    state.tier = tier;
    state.level = level;
    // 存档里的档位可能和 TIER_KEY 不一致（旧存档 / 手动清理过），
    // 这里按最终档位重建选关栏与高亮，避免 UI 和实际关卡错位
    buildLevelBar();
    syncTiers();
    state.moves = typeof data.moves === 'number' ? data.moves : 0;
    state.pushes = typeof data.pushes === 'number' ? data.pushes : 0;
    state.started = !!data.started;
    state.elapsed = typeof data.elapsed === 'number' ? data.elapsed : 0;
    state.startedAt = state.started ? Date.now() : 0;
    state.done = false;
    state.history = [];

    buildBoard();
    // buildBoard 按关卡初始布局建了箱子，这里把位置换成存档里的
    state.boxes.forEach(function (b, index) {
      b.r = boxes[index].r;
      b.c = boxes[index].c;
    });
    state.player.r = pr;
    state.player.c = pc;

    paintActors();
    refreshHud();
    syncLevelBar();
    return true;
  }

  /* ------------------------------------------------------------------
     开局 / 换关
     ------------------------------------------------------------------ */

  function loadLevel(index) {
    var i = parseInt(index, 10);
    if (!(i >= 0 && i < levelsOf(state.tier).length)) return;

    state.level = i;
    state.moves = 0;
    state.pushes = 0;
    state.started = false;
    state.startedAt = 0;
    state.elapsed = 0;
    state.done = false;
    state.history = [];

    hideOverlay();
    hideToast();
    buildBoard();
    refreshHud();
    syncLevelBar();
    setLast(state.tier, i);
    save();
  }

  function restart() {
    if (state.moves > 0 && !state.done) {
      if (!window.confirm(t('confirm_restart'))) return;
    }
    loadLevel(state.level);
  }

  /* ------------------------------------------------------------------
     输入
     ------------------------------------------------------------------ */

  var KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', a: 'left', s: 'down', d: 'right',
    W: 'up', A: 'left', S: 'down', D: 'right'
  };

  function bindInput() {
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      var dir = KEYMAP[e.key];
      if (dir) {
        e.preventDefault();
        move(dir);
        return;
      }

      if (e.key === 'u' || e.key === 'U' || e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        restart();
      }
    });

    dom.levels.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.lv') : null;
      if (!btn || !dom.levels.contains(btn)) return;
      loadLevel(btn.dataset.level);
    });

    dom.btnUndo.addEventListener('click', undo);
    dom.btnRestart.addEventListener('click', restart);
    dom.btnNext.addEventListener('click', function () {
      var tierLen = levelsOf(state.tier).length;
      var last = state.level === tierLen - 1;
      var hasNextTier = TIER_ORDER.indexOf(state.tier) < TIER_ORDER.length - 1;
      if (last && hasNextTier) {
        switchTier(TIER_ORDER[TIER_ORDER.indexOf(state.tier) + 1]);
      } else if (last) {
        loadLevel(0);
      } else {
        loadLevel(state.level + 1);
      }
    });

    if (dom.tiers) {
      dom.tiers.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
        if (!btn || !dom.tiers.contains(btn)) return;
        switchTier(btn.getAttribute('data-diff'));
      });
    }

    bindPad();
    bindSwipe();
  }

  /* ------------------------------------------------------------------
     难度切换
     ------------------------------------------------------------------ */

  function syncTiers() {
    if (!dom.tiers) return;
    var btns = dom.tiers.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var tk = btns[i].getAttribute('data-diff');
      btns[i].classList.toggle('is-active', tk === state.tier);
      // 该难度已通关则打个勾标记
      var cleared = true;
      var len = levelsOf(tk).length;
      for (var j = 0; j < len; j++) {
        if (typeof state.best[tk][j] !== 'number') { cleared = false; break; }
      }
      btns[i].classList.toggle('is-done', cleared);
    }
  }

  function switchTier(tier) {
    if (!TIERS[tier] || tier === state.tier) return;
    if (state.moves > 0 && !state.done) {
      if (!window.confirm(t('confirm_diff'))) return;
    }

    state.tier = tier;
    try { localStorage.setItem(TIER_KEY, tier); } catch (e) {}
    syncTiers();
    buildLevelBar();
    loadLevel(getLast(tier));
  }

  /* 按住方向键连续走：先等 240ms，之后每 130ms 一步 */
  function bindPad() {
    var buttons = dom.pad.querySelectorAll('.pad__btn');

    function stop() {
      window.clearTimeout(holdDelay);
      window.clearInterval(holdTimer);
      holdTimer = 0;
      holdDelay = 0;
      for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('is-pressed');
    }

    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        var dir = btn.dataset.dir;

        btn.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          stop();
          btn.classList.add('is-pressed');
          move(dir);

          holdDelay = window.setTimeout(function () {
            holdTimer = window.setInterval(function () { move(dir); }, 130);
          }, 240);
        });

        btn.addEventListener('pointerup', stop);
        btn.addEventListener('pointercancel', stop);
        btn.addEventListener('pointerleave', stop);

        // 键盘回车/空格触发的 click 没有 pointerdown，单独补一次
        btn.addEventListener('click', function (e) {
          if (e.detail === 0) move(dir);
        });
      })(buttons[i]);
    }
  }

  function bindSwipe() {
    dom.board.addEventListener('pointerdown', function (e) {
      swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });

    dom.board.addEventListener('pointerup', function (e) {
      if (!swipe || swipe.id !== e.pointerId) { swipe = null; return; }

      var dx = e.clientX - swipe.x;
      var dy = e.clientY - swipe.y;
      swipe = null;

      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (Math.abs(dx) >= Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
      else move(dy > 0 ? 'down' : 'up');
    });

    dom.board.addEventListener('pointercancel', function () { swipe = null; });
  }

  /* ------------------------------------------------------------------
     计时
     ------------------------------------------------------------------ */

  function startClock() {
    if (!state.started) {
      state.started = true;
      state.startedAt = Date.now();
    }
  }

  function tick() {
    if (state.started && !state.done) {
      dom.timer.textContent = fmtTime(elapsedSec());
    }
  }

  function pauseClock() {
    if (!state.started || state.done || !state.startedAt) return;
    state.elapsed = elapsedSec();
    state.startedAt = 0;
    save();
  }

  function resumeClock() {
    if (!state.started || state.done || state.startedAt) return;
    state.startedAt = Date.now();
  }

  /* ------------------------------------------------------------------
     启动
     ------------------------------------------------------------------ */

  function init() {
    dom = {
      board: document.getElementById('board'),
      cells: document.getElementById('cells'),
      actors: document.getElementById('actors'),
      levels: document.getElementById('levels'),
      tiers: document.getElementById('tiers'),
      moves: document.getElementById('moves'),
      timer: document.getElementById('timer'),
      best: document.getElementById('best'),
      toast: document.getElementById('toast'),
      pad: document.getElementById('pad'),
      btnUndo: document.getElementById('btn-undo'),
      btnRestart: document.getElementById('btn-restart'),
      btnNext: document.getElementById('btn-next'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlaySub: document.getElementById('overlay-sub'),
      overlayMoves: document.getElementById('overlay-moves'),
      overlayTime: document.getElementById('overlay-time')
    };

    var savedTier = null;
    try { savedTier = localStorage.getItem(TIER_KEY); } catch (e) {}
    if (savedTier && TIERS[savedTier]) state.tier = savedTier;

    loadBest();
    buildLevelBar();
    syncTiers();

    if (!loadState()) loadLevel(getLast(state.tier));

    bindInput();
    window.setInterval(tick, 250);

    window.addEventListener('pagehide', pauseClock);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        pauseClock();
      } else {
        resumeClock();
        refreshHud();
      }
    });

    document.addEventListener('ys:langchange', function () {
      // 静态文案由 I18N 重绘；选关 aria、棋盘 aria、结算卡片、提示条要自己补
      var items = dom.levels.children;
      for (var i = 0; i < items.length; i++) {
        items[i].setAttribute('aria-label', t('level_n').replace('{n}', i + 1));
      }
      syncTiers();
      refreshHud();
      if (!dom.overlay.hidden) showOverlay();
      if (toastKey) dom.toast.textContent = t(toastKey);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
