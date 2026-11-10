/* ==========================================================================
   飞行棋 · Aeroplane Chess（Canvas 2D / 纯 ES5 / 单文件自包含）
   两方对弈：玩家红、电脑蓝。24 格外圈 + 各自 4 格归航道。
   位置编码：pos = -1 停机坪；0..23 外圈；24..27 归航道；28 已到家。
   存档：ysgame-flightchess-state / -best / -diff
   [gyh 2026-11-10 新增] 批次六
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function t(k) { return window.I18N ? window.I18N.t(k) : k; }
  function tf(k, vars) {
    var s = t(k);
    for (var n in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, n)) {
        s = s.split('{' + n + '}').join(String(vars[n]));
      }
    }
    return s;
  }
  function sfx(name) {
    if (window.YSound && window.YSound.play) {
      try { window.YSound.play(name); } catch (e) { /* 音效不可用时静默 */ }
    }
  }

  var STATE_KEY = 'ysgame-flightchess-state';
  var BEST_KEY = 'ysgame-flightchess-best';
  var DIFF_KEY = 'ysgame-flightchess-diff';
  var TRACK = 24;
  var HOME_LEN = 4;
  var FINISH = TRACK + HOME_LEN;      // 28
  var START = { r: 0, b: 12 };       // 两方外圈起点
  var TURN_CAP = 300;

  /* [gyh 2026-11-10 新增] 三档真实拉开：飞机数 / 起飞门槛 / 悔棋 / 提示 / AI 决策 */
  var DIFF = {
    easy:   { planes: 2, takeoff: 5, undos: Infinity, hints: Infinity, timed: false, ai: 0 },
    medium: { planes: 3, takeoff: 6, undos: 3,        hints: Infinity, timed: true,  ai: 1 },
    hard:   { planes: 4, takeoff: 6, undos: 1,        hints: 3,        timed: true,  ai: 2 }
  };

  var COLORS = {
    r: { main: '#C98376', dark: '#8C4C42', light: '#F6DCD4' },
    b: { main: '#6E9DAB', dark: '#3F6B78', light: '#D9ECF1' }
  };
  var BOARD_BG = '#F7ECE7';
  var LINE = '#D8B8AC';

  var canvas = $('canvas');
  var ctx = canvas.getContext('2d');
  var stage = $('stage-wrap');
  var overlay = $('overlay');
  var card = $('card');

  var state = null;
  var timerId = 0;
  var aiTimer = 0;
  var toastTimer = 0;
  var hintTimer = 0;
  var hintIndex = -1;
  var dpr = 1;
  var W = 320, H = 320, PAD = 30, STEP = 40, L0 = 30, T0 = 30;
  var hitBoxes = [];

  /* ------------------------------ 工具 ------------------------------ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function copyPlanes(p) {
    return { r: p.r.slice(0), b: p.b.slice(0) };
  }
  function def() { return DIFF[state.diff] || DIFF.medium; }
  function other(s) { return s === 'r' ? 'b' : 'r'; }
  function absSlot(s, pos) { return (START[s] + pos) % TRACK; }

  function isEn() {
    return !!(window.I18N && window.I18N.lang === 'en');
  }
  function sideName(s) {
    if (isEn()) return s === 'r' ? 'Red' : 'Blue';
    return s === 'r' ? '红方' : '蓝方';
  }

  /* ------------------------------ 存档 ------------------------------ */
  function readJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.data ? o.data : null;
    } catch (e) { return null; }
  }
  function saveState() {
    if (!state) return;
    var d = {
      v: 1,
      data: {
        diff: state.diff, planes: copyPlanes(state.planes),
        turn: state.turn, round: state.round, roll: state.roll,
        phase: state.phase, moves: state.moves, elapsed: state.elapsed,
        undosLeft: state.undosLeft === Infinity ? -1 : state.undosLeft,
        hintsLeft: state.hintsLeft === Infinity ? -1 : state.hintsLeft,
        history: state.history, extraRoll: state.extraRoll
      }
    };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(d)); } catch (e) { /* 隐私模式 */ }
  }
  function readBest() {
    var n = 0;
    try { n = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { n = 0; }
    return n;
  }
  function writeBest(n) {
    try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* 隐私模式 */ }
  }
  function readDiff() {
    var d = 'medium';
    try { d = localStorage.getItem(DIFF_KEY) || 'medium'; } catch (e) { d = 'medium'; }
    return DIFF[d] ? d : 'medium';
  }

  /* ------------------------------ 状态 ------------------------------ */
  function freshState(diff) {
    var n = DIFF[diff].planes;
    var r = [], b = [], i;
    for (i = 0; i < n; i++) { r.push(-1); b.push(-1); }
    return {
      diff: diff,
      planes: { r: r, b: b },
      turn: 'r',
      round: 1,
      roll: 0,
      phase: 'ready',
      moves: 0,
      elapsed: 0,
      undosLeft: DIFF[diff].undos,
      hintsLeft: DIFF[diff].hints,
      history: [],
      extraRoll: false,
      best: readBest(),
      result: null
    };
  }

  function clearTimers() {
    if (timerId) { clearInterval(timerId); timerId = 0; }
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = 0; }
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = 0; }
    hintIndex = -1;
  }

  function newGame(restore) {
    clearTimers();
    var saved = restore ? readJSON(STATE_KEY) : null;
    var diff = readDiff();
    if (saved && DIFF[saved.diff]) {
      state = freshState(saved.diff);
      state.planes = {
        r: (saved.planes && saved.planes.r ? saved.planes.r : []).slice(0),
        b: (saved.planes && saved.planes.b ? saved.planes.b : []).slice(0)
      };
      // [gyh 2026-11-10 新增] 档位决定飞机数，恢复时按当前档补齐或截断，避免 NaN
      var n = DIFF[state.diff].planes;
      var i;
      while (state.planes.r.length < n) state.planes.r.push(-1);
      while (state.planes.b.length < n) state.planes.b.push(-1);
      state.planes.r.length = n;
      state.planes.b.length = n;
      for (i = 0; i < n; i++) {
        if (typeof state.planes.r[i] !== 'number' || !isFinite(state.planes.r[i])) state.planes.r[i] = -1;
        if (typeof state.planes.b[i] !== 'number' || !isFinite(state.planes.b[i])) state.planes.b[i] = -1;
        state.planes.r[i] = clamp(state.planes.r[i], -1, FINISH);
        state.planes.b[i] = clamp(state.planes.b[i], -1, FINISH);
      }
      state.turn = saved.turn === 'b' ? 'b' : 'r';
      state.round = Math.max(1, parseInt(saved.round, 10) || 1);
      state.roll = clamp(parseInt(saved.roll, 10) || 0, 0, 6);
      state.moves = Math.max(0, parseInt(saved.moves, 10) || 0);
      state.elapsed = Math.max(0, parseInt(saved.elapsed, 10) || 0);
      state.undosLeft = saved.undosLeft === -1 ? Infinity : Math.max(0, parseInt(saved.undosLeft, 10) || 0);
      state.hintsLeft = saved.hintsLeft === -1 ? Infinity : Math.max(0, parseInt(saved.hintsLeft, 10) || 0);
      state.history = [];
      state.extraRoll = !!saved.extraRoll;
      state.phase = saved.phase === 'over' ? 'choose' : (state.roll > 0 ? 'choose' : 'idle');
      if (state.turn === 'b') state.phase = 'ai';
    } else {
      state = freshState(diff);
      state.phase = 'idle';
    }
    state.best = readBest();
    overlay.hidden = true;
    $('toast').hidden = true;
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
    syncDiffs();
    syncHud();
    resize();
    // [gyh 2026-11-10 新增] 有存档进度时直接续玩，不弹开始卡遮住棋盘；新局才显示开始卡
    if (saved && state.moves > 0) {
      hideCard();
      state.phase = state.turn === 'r' ? (state.roll > 0 ? 'choose' : 'idle') : 'ai';
    } else {
      showCard('start');
    }
    saveState();   // 开局立即落盘
    timerId = setInterval(tick, 1000);
    if (state.phase === 'ai') scheduleAi();
    draw();
  }

  function tick() {
    if (!state || state.phase === 'ready' || state.phase === 'paused' || state.phase === 'over') return;
    if (!def().timed) return;
    state.elapsed += 1;
    syncHud();
    if (state.elapsed % 5 === 0) saveState();
  }

  /* ------------------------------ 视图 ------------------------------ */
  function syncDiffs() {
    var box = $('diffs');
    if (!box) return;
    var btns = box.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var on = b.getAttribute('data-diff') === state.diff;
      if (on) b.classList.add('is-active'); else b.classList.remove('is-active');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function syncHud() {
    $('score').textContent = state.roll ? String(state.roll) : '--';
    $('steps').textContent = String(state.moves);
    $('turn').textContent = String(state.round);
    $('time').textContent = def().timed ? fmtTime(state.elapsed) : '--:--';
    $('best').textContent = state.best > 0 ? String(state.best) : '--';
    $('btn-undo').disabled = !(state.undosLeft > 0 && state.history.length > 0);
    $('btn-hint').disabled = !(state.turn === 'r' && state.phase === 'choose' && state.hintsLeft > 0);
    $('btn-roll').disabled = !(state.turn === 'r' && (state.phase === 'idle' || state.phase === 'choose') && !state.roll);
    $('btn-pause').textContent = t(state.phase === 'paused' ? 'btn_resume' : 'btn_pause');
    $('btn-start').textContent = t('btn_restart');
  }

  function showCard(mode) {
    card.hidden = false;
    if (mode === 'paused') {
      $('card-title').textContent = t('paused_title');
      $('card-sub').textContent = t('tagline');
      $('btn-start-card').textContent = t('btn_resume');
    } else if (mode === 'start') {
      $('card-title').textContent = t('game_title');
      $('card-sub').textContent = t('tagline');
      $('btn-start-card').textContent = t('btn_start');
    } else {
      card.hidden = true;
    }
  }
  function hideCard() { card.hidden = true; }

  function showToast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.style.whiteSpace = 'normal';
    el.style.textAlign = 'center';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function finish(winner) {
    state.phase = 'over';
    state.result = winner;
    clearTimers();
    var win = winner === 'r';
    if (win) {
      state.best = readBest() + 1;
      writeBest(state.best);
      sfx('win');
    } else {
      sfx('lose');
    }
    $('overlay-title').textContent = t(win ? 'win_title' : 'lose_title');
    $('overlay-sub').textContent = tf(win ? 'win_sub' : 'lose_sub', { score: state.round });
    $('overlay-moves').textContent = String(state.moves);
    $('record-badge').hidden = !win;
    overlay.hidden = false;
    syncHud();
    saveState();
    draw();
  }

  function allHome(s) {
    var p = state.planes[s];
    for (var i = 0; i < p.length; i++) if (p[i] !== FINISH) return false;
    return true;
  }
  function progress(s) {
    var p = state.planes[s], sum = 0;
    for (var i = 0; i < p.length; i++) sum += (p[i] < 0 ? 0 : p[i]);
    return sum;
  }

  /* ------------------------------ 规则 ------------------------------ */
  function movable(s, roll) {
    var out = [], p = state.planes[s], i;
    for (i = 0; i < p.length; i++) {
      if (p[i] === FINISH) continue;
      if (p[i] === -1) {
        if (roll >= def().takeoff) out.push(i);
      } else if (p[i] + roll <= FINISH) {
        out.push(i);
      }
    }
    return out;
  }

  function landing(s, index, roll) {
    var p = state.planes[s], cur = p[index];
    if (cur === -1) return 0;                       // 起飞到跑道起点
    var np = cur + roll;
    if (np > FINISH) return cur;
    if (np > 0 && np < TRACK && np % 6 === 0) np += 4;   // 同色格跳 4 格
    if (np > FINISH) np = cur;                    // 跳格越过终点则不动
    return np;
  }

  function bumpAt(s, np) {
    if (np < 0 || np >= TRACK) return false;
    var o = other(s), op = state.planes[o];
    var slot = absSlot(s, np), hit = false;
    for (var i = 0; i < op.length; i++) {
      if (op[i] >= 0 && op[i] < TRACK && absSlot(o, op[i]) === slot) {
        op[i] = -1;
        hit = true;
      }
    }
    return hit;
  }

  function takeoffCount(s) {
    var p = state.planes[s], n = 0;
    for (var i = 0; i < p.length; i++) if (p[i] === -1) n++;
    return n;
  }

  function movePlane(s, index, roll) {
    var p = state.planes[s], cur = p[index];
    var np = landing(s, index, roll);
    var wasGrounded = cur === -1;
    if (!wasGrounded && np === cur) { showToast(t('msg_invalid')); return false; }

    p[index] = np;
    state.moves += 1;
    var bumped = bumpAt(s, np);
    if (wasGrounded) { showToast(t('msg_takeoff')); sfx('start'); }
    else if (bumped) { showToast(t('msg_hit')); sfx('combo'); }
    else { sfx('move'); }
    if (np === FINISH) { showToast(t('msg_home')); sfx('levelup'); }

    if (allHome(s)) { finish(s); return true; }
    if (state.round >= TURN_CAP) {
      finish(progress('r') >= progress('b') ? 'r' : 'b');
      return true;
    }
    return true;
  }

  /* [gyh 2026-11-10 新增] AI 三档：随机 / 优先级 / 期望收益 */
  function aiPick(s, roll, list) {
    var d = def(), i, idx, score, bestI = list[0], bestS = -1e9;
    if (d.ai === 0) return list[rand(list.length)];
    for (i = 0; i < list.length; i++) {
      idx = list[i];
      var cur = state.planes[s][idx];
      var np = landing(s, idx, roll);
      score = 0;
      if (cur === -1) score += (d.ai === 1 ? 30 : 34);
      if (np === FINISH) score += (d.ai === 1 ? 90 : 96);
      if (np > cur) score += (np - cur) * (d.ai === 1 ? 1 : 1.4);
      if (d.ai === 1) {
        // 简单优先级：能撞子优先
        if (np >= 0 && np < TRACK) {
          var slot = absSlot(s, np), op = state.planes[other(s)];
          for (var j = 0; j < op.length; j++) {
            if (op[j] >= 0 && op[j] < TRACK && absSlot(other(s), op[j]) === slot) score += 70;
          }
        }
      } else {
        if (np >= 0 && np < TRACK) {
          var sl = absSlot(s, np), opp = state.planes[other(s)];
          for (var k = 0; k < opp.length; k++) {
            if (opp[k] >= 0 && opp[k] < TRACK && absSlot(other(s), opp[k]) === sl) score += 100;
          }
          // 避免停在对手前方 1~6 格内被撞
          var risk = 0;
          for (var m = 0; m < opp.length; m++) {
            if (opp[m] < 0 || opp[m] >= TRACK) continue;
            var gap = (sl - absSlot(other(s), opp[m]) + TRACK) % TRACK;
            if (gap >= 1 && gap <= 6) risk += (7 - gap) * 3;
          }
          score -= risk;
        }
        if (roll >= d.takeoff) score += 10;         // 连掷机会
        score += (np >= TRACK ? 12 : 0);            // 尽早进归航道
      }
      if (score > bestS) { bestS = score; bestI = idx; }
    }
    return bestI;
  }

  function snapshot() {
    return {
      planes: copyPlanes(state.planes), turn: state.turn, round: state.round,
      roll: state.roll, moves: state.moves, elapsed: state.elapsed
    };
  }

  function doRoll(s) {
    if (state.phase === 'over' || state.phase === 'paused') return;
    if (s === 'r' && state.roll > 0) return;
    var roll = 1 + rand(6);
    state.roll = roll;
    sfx('tap');
    showToast(tf('msg_roll', { score: roll }));

    var list = movable(s, roll);
    if (!list.length) {
      if (takeoffCount(s) > 0 && roll < def().takeoff) showToast(t('msg_need_six'));
      else showToast(t('msg_no_moves'));
      state.roll = 0;
      state.extraRoll = false;
      endTurn(s, roll);
      return;
    }
    if (s === 'r') {
      state.phase = 'choose';
      syncHud();
      draw();
    } else {
      state.phase = 'ai';
      var pick = aiPick(s, roll, list);
      aiTimer = setTimeout(function () {
        aiTimer = 0;
        movePlane(s, pick, roll);
        var again = roll >= def().takeoff;
        state.roll = 0;
        state.extraRoll = again;
        syncHud();
        draw();
        if (state.phase === 'over') return;
        if (again) { scheduleAi(); }
        else { endTurn(s, roll); }
      }, 560);
    }
  }

  function endTurn(s, lastRoll) {
    if (state.phase === 'over') return;
    var again = lastRoll >= def().takeoff;
    if (!again) {
      state.turn = other(s);
      state.round += 1;
    }
    state.roll = 0;
    state.phase = state.turn === 'r' ? 'idle' : 'ai';
    syncHud();
    saveState();
    draw();
    if (state.turn === 'b') scheduleAi();
    else if (again) showToast(t('msg_roll').split('{score}').join(String(lastRoll)));
  }

  function scheduleAi() {
    if (!state || state.phase === 'over' || state.phase === 'paused') return;
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = setTimeout(function () {
      aiTimer = 0;
      if (state && state.turn === 'b' && state.phase !== 'over' && state.phase !== 'paused') doRoll('b');
    }, 620);
  }

  function playerMove(index) {
    if (state.phase !== 'choose' || state.turn !== 'r') return;
    var list = movable('r', state.roll);
    var ok = false, i;
    for (i = 0; i < list.length; i++) if (list[i] === index) ok = true;
    if (!ok) { sfx('warn'); showToast(t('msg_invalid')); return; }
    var roll = state.roll;
    state.history.push(snapshot());
    if (state.history.length > 12) state.history.shift();
    movePlane('r', index, roll);
    if (state.phase === 'over') return;
    state.roll = 0;
    state.extraRoll = roll >= def().takeoff;
    endTurn('r', roll);
  }

  function undo() {
    if (!(state.undosLeft > 0) || !state.history.length) { sfx('warn'); return; }
    var snap = state.history.pop();
    state.planes = snap.planes;
    state.turn = 'r';
    state.round = snap.round;
    state.roll = 0;
    state.moves = snap.moves;
    state.elapsed = snap.elapsed;
    state.phase = 'idle';
    state.extraRoll = false;
    if (state.undosLeft !== Infinity) state.undosLeft -= 1;
    clearTimers();
    overlay.hidden = true;
    timerId = setInterval(tick, 1000);
    sfx('slide');
    showToast(t('btn_undo'));
    syncHud();
    saveState();
    draw();
  }

  function hint() {
    if (!(state.hintsLeft > 0) || state.turn !== 'r' || state.phase !== 'choose') { sfx('warn'); return; }
    var list = movable('r', state.roll);
    if (!list.length) return;
    hintIndex = aiPick('r', state.roll, list);
    if (state.hintsLeft !== Infinity) state.hintsLeft -= 1;
    sfx('tick');
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintIndex = -1; hintTimer = 0; draw(); }, 1600);
    syncHud();
    saveState();
    draw();
  }

  function togglePause() {
    if (state.phase === 'over') return;
    if (state.phase === 'paused') {
      state.phase = state.turn === 'r' ? (state.roll > 0 ? 'choose' : 'idle') : 'ai';
      hideCard();
      timerId = setInterval(tick, 1000);
      sfx('click');
      if (state.turn === 'b') scheduleAi();
    } else {
      state.prevPhase = state.phase;
      state.phase = 'paused';
      clearTimers();
      showCard('paused');
      sfx('toggle');
    }
    syncHud();
    draw();
  }

  /* [gyh 2026-11-10 新增] 切档：先幂等落盘，清场后再显示页面内 toast，绝不用 window.confirm */
  function switchDiff(d) {
    if (!DIFF[d]) return;
    try { localStorage.setItem(DIFF_KEY, d); } catch (e) { /* 隐私模式 */ }
    clearTimers();
    state = freshState(d);
    state.phase = 'idle';
    overlay.hidden = true;
    $('toast').hidden = true;
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
    syncDiffs();
    syncHud();
    showCard('start');
    resize();
    saveState();
    timerId = setInterval(tick, 1000);
    draw();
    showToast(t('confirm_diff'));
    sfx('select');
  }

  /* ------------------------------ 绘制 ------------------------------ */
  function trackPt(slot) {
    var s = ((slot % TRACK) + TRACK) % TRACK;
    var side = Math.floor(s / 6), k = s % 6;
    if (side === 0) return { x: L0 + k * STEP, y: T0 };
    if (side === 1) return { x: L0 + TRACK / 4 * STEP, y: T0 + k * STEP };
    if (side === 2) return { x: L0 + TRACK / 4 * STEP - k * STEP, y: T0 + TRACK / 4 * STEP };
    return { x: L0, y: T0 + TRACK / 4 * STEP - k * STEP };
  }
  function homePt(s, k) {
    var st = trackPt(START[s]);
    var cx = L0 + 3 * STEP, cy = T0 + 3 * STEP;
    var dx = cx - st.x, dy = cy - st.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: st.x + dx / len * STEP * (k + 0.35), y: st.y + dy / len * STEP * (k + 0.35) };
  }
  function hangarPt(s, i) {
    var x, y;
    if (s === 'r') { x = L0 - STEP * 0.55 + (i % 2) * STEP * 0.62; y = T0 + 6 * STEP + STEP * 0.35 + Math.floor(i / 2) * STEP * 0.62; }
    else { x = L0 + 6 * STEP - STEP * 0.45 - (i % 2) * STEP * 0.62; y = T0 - STEP * 0.75 + Math.floor(i / 2) * STEP * 0.62; }
    return { x: x, y: y };
  }
  function goalPt(s, i) {
    var cx = L0 + 3 * STEP, cy = T0 + 3 * STEP;
    return { x: cx + (i % 2) * STEP * 0.5 - STEP * 0.25, y: cy + Math.floor(i / 2) * STEP * 0.5 - STEP * 0.25 + (s === 'r' ? 0 : STEP * 0.18) };
  }
  function planePt(s, pos, i) {
    if (pos === -1) return hangarPt(s, i);
    if (pos === FINISH) return goalPt(s, i);
    if (pos >= TRACK) return homePt(s, pos - TRACK + 1);
    return trackPt(absSlot(s, pos));
  }

  function resize() {
    if (!stage) return;
    var cssW = stage.clientWidth || 320;
    W = cssW;
    H = cssW;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    PAD = W * 0.115;
    STEP = (W - PAD * 2) / 6;
    L0 = PAD; T0 = PAD;
  }

  function cell(x, y, fill, stroke, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.lineWidth = 1.4; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawPlane(x, y, s, bright) {
    var c = COLORS[s];
    var r = Math.max(7, STEP * 0.23);
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,35,.22)';
    ctx.shadowBlur = bright ? 12 : 5;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = bright ? c.light : c.main;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.dark;
    ctx.stroke();
    // 机头小三角
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.62);
    ctx.lineTo(x - r * 0.42, y + r * 0.38);
    ctx.lineTo(x + r * 0.42, y + r * 0.38);
    ctx.closePath();
    ctx.fillStyle = c.dark;
    ctx.fill();
    ctx.restore();
  }

  function drawDice() {
    var cx = L0 + 3 * STEP, cy = T0 + 3 * STEP - STEP * 0.55;
    var sz = STEP * 0.92;
    ctx.save();
    ctx.fillStyle = '#FFFDF9';
    ctx.strokeStyle = '#C98376';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - sz / 2, cy - sz / 2, sz, sz, sz * 0.2);
    else ctx.rect(cx - sz / 2, cy - sz / 2, sz, sz);
    ctx.fill(); ctx.stroke();
    var v = state.roll || 0;
    var dots = {
      1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
      4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
      6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
    };
    var arr = dots[v] || [];
    for (var i = 0; i < arr.length; i++) {
      cell(cx + arr[i][0] * sz * 0.26, cy + arr[i][1] * sz * 0.26, '#8C4C42', null, Math.max(2, sz * 0.065));
    }
    ctx.restore();
  }

  function draw() {
    if (!state || !ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, W, H);

    // 外框
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(L0 - STEP * 0.36, T0 - STEP * 0.36, 6 * STEP + STEP * 0.72, 6 * STEP + STEP * 0.72);

    // 外圈 24 格
    var i, p, c;
    for (i = 0; i < TRACK; i++) {
      p = trackPt(i);
      var ownR = (i - START.r + TRACK) % TRACK % 6 === 0;
      var ownB = (i - START.b + TRACK) % TRACK % 6 === 0;
      var fill = ownR ? COLORS.r.light : (ownB ? COLORS.b.light : '#FBF4EF');
      cell(p.x, p.y, fill, LINE, Math.max(6, STEP * 0.22));
    }
    // 归航道
    for (c = 0; c < 2; c++) {
      var s = c === 0 ? 'r' : 'b';
      for (i = 1; i <= HOME_LEN; i++) {
        p = homePt(s, i);
        cell(p.x, p.y, COLORS[s].light, COLORS[s].dark, Math.max(5, STEP * 0.16));
      }
    }
    // 停机坪底座
    for (c = 0; c < 2; c++) {
      var ss = c === 0 ? 'r' : 'b';
      var n = state.planes[ss].length;
      for (i = 0; i < n; i++) {
        p = hangarPt(ss, i);
        cell(p.x, p.y, '#EFE2DA', '#D8B8AC', Math.max(6, STEP * 0.2));
      }
    }

    drawDice();

    // 当前可动提示环
    var list = (state.turn === 'r' && state.phase === 'choose' && state.roll > 0) ? movable('r', state.roll) : [];
    hitBoxes = [];
    for (c = 0; c < 2; c++) {
      var side = c === 0 ? 'r' : 'b';
      var arr = state.planes[side];
      for (i = 0; i < arr.length; i++) {
        p = planePt(side, arr[i], i);
        var selectable = side === 'r' && list.indexOf(i) >= 0;
        var hl = selectable || (side === 'r' && hintIndex === i);
        if (hl) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(10, STEP * 0.32), 0, Math.PI * 2);
          ctx.lineWidth = 3;
          ctx.strokeStyle = hintIndex === i ? '#E0A32A' : '#8C4C42';
          ctx.stroke();
        }
        drawPlane(p.x, p.y, side, hl);
        if (selectable) hitBoxes.push({ x: p.x, y: p.y, i: i });
      }
    }

    // 中央状态文字
    ctx.fillStyle = '#8C6B60';
    ctx.font = Math.max(10, Math.round(STEP * 0.28)) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sideName(state.turn) + (state.phase === 'paused' ? ' · --' : ''),
      L0 + 3 * STEP, T0 + 3 * STEP + STEP * 0.75);
  }

  /* ------------------------------ 交互 ------------------------------ */
  function canvasPoint(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
    var cy = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  }
  function onCanvasTap(e) {
    if (!state || state.phase === 'over' || state.phase === 'paused') return;
    var pt = canvasPoint(e);
    var i, b, dx, dy, best = -1, bestD = 1e9;
    for (i = 0; i < hitBoxes.length; i++) {
      b = hitBoxes[i];
      dx = pt.x - b.x; dy = pt.y - b.y;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = b.i; }
    }
    var r = Math.max(22, STEP * 0.62);
    if (best >= 0 && bestD <= r * r) { playerMove(best); return; }
    // 点中央骰子区域也可掷骰
    var cx = L0 + 3 * STEP, cy = T0 + 3 * STEP - STEP * 0.55;
    if (Math.abs(pt.x - cx) < STEP && Math.abs(pt.y - cy) < STEP) {
      if (state.turn === 'r' && !state.roll) doRoll('r');
    }
  }

  function bind() {
    var box = $('diffs');
    var btns = box.querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { switchDiff(b.getAttribute('data-diff')); });
      })(btns[i]);
    }
    $('btn-start').addEventListener('click', function () {
      clearTimers();
      newGame(false);
      hideCard();
      state.phase = 'idle';
      sfx('start');
      syncHud();
      saveState();
      draw();
    });
    $('btn-start-card').addEventListener('click', function () {
      if (state.phase === 'paused') { togglePause(); return; }
      clearTimers();
      newGame(false);
      hideCard();
      state.phase = 'idle';
      sfx('start');
      syncHud();
      saveState();
      draw();
    });
    $('btn-restart').addEventListener('click', function () {
      clearTimers();
      newGame(false);
      hideCard();
      state.phase = 'idle';
      sfx('start');
      syncHud();
      saveState();
      draw();
    });
    $('btn-again').addEventListener('click', function () {
      clearTimers();
      newGame(false);
      hideCard();
      state.phase = 'idle';
      sfx('start');
      syncHud();
      saveState();
      draw();
    });
    $('btn-roll').addEventListener('click', function () {
      if (state.phase === 'paused' || state.phase === 'over') return;
      if (state.turn !== 'r') return;
      if (state.roll > 0) return;
      hideCard();
      state.phase = 'idle';
      doRoll('r');
    });
    $('btn-undo').addEventListener('click', undo);
    $('btn-hint').addEventListener('click', hint);
    $('btn-pause').addEventListener('click', togglePause);
    canvas.addEventListener('pointerdown', onCanvasTap);
    canvas.addEventListener('click', function (e) { e.preventDefault(); });
    window.addEventListener('resize', function () { resize(); draw(); });
    document.addEventListener('keydown', function (e) {
      var k = e.key || '';
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        if (state.turn === 'r' && !state.roll && state.phase !== 'over' && state.phase !== 'paused') doRoll('r');
      } else if (k === 'p' || k === 'P') { togglePause(); }
      else if (k === 'h' || k === 'H') { hint(); }
      else if (k === 'u' || k === 'U') { undo(); }
    });
    // [gyh 2026-11-10 新增] 语言切换后重设动态文案
    document.addEventListener('ys:langchange', function () {
      if (!state) return;
      syncHud();
      if (state.phase === 'paused') showCard('paused');
      else if (card.hidden === false) showCard('start');
      draw();
    });
  }

  bind();
  newGame(true);
})();
