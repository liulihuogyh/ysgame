/* ==========================================================================
   五子棋 · 游戏逻辑
   纯 ES5 + IIFE，和站内其它游戏保持一致（无框架、无打包、无依赖）。

   玩法：15×15 棋盘，玩家执黑先手、AI 执白，canvas + devicePixelRatio 绘制。
        横 / 竖 / 两斜连五判胜，最后一手高亮、胜负连线、棋盘满判平局。
        悔棋一次撤回「玩家 + AI」两手（不限次数）；提示每局三次。
   难度：三档 AI 强度分明，均为「对每个空位算 我方得分 + 对方得分 × 防守权重」的
        评分表 + 邻域候选，hard 额外对 top-N 候选做 2 层推演。
   存档：ysgame-gomoku-state（v:1，按难度分桶，含棋盘 / 回合 / 悔棋栈 / AI 强度）、
        ysgame-gomoku-best、ysgame-gomoku-diff，全部 try/catch，刷新断点续玩。
   音效：统一走 js/sound.js 的 YSound，主题由 body[data-dict="ggomoku"] 自动识别。

   [gyh 2026-11-08 新增]
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var SIZE = 15;
  var CELL = 36;
  var PAD = 26;
  var W = PAD * 2 + (SIZE - 1) * CELL;   // 556
  var H = W;

  var EMPTY = 0;
  var BLACK = 1;   // 玩家
  var WHITE = 2;   // AI

  var STATE_KEY = 'ysgame-gomoku-state';
  var BEST_KEY = 'ysgame-gomoku-best';
  var DIFF_KEY = 'ysgame-gomoku-diff';
  var HINTS_PER_GAME = 3;

  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  /* 棋型分：数量级拉开，保证「成五 > 活四 > 四三 > 冲四 > 双三 > 活三 ...」 */
  var SCORE = {
    FIVE: 10000000,
    LIVE_FOUR: 1000000,
    FOUR_THREE: 500000,
    RUSH_FOUR: 100000,
    DOUBLE_THREE: 50000,
    LIVE_THREE: 10000,
    SLEEP_THREE: 1000,
    LIVE_TWO: 200,
    SLEEP_TWO: 20
  };

  /* 三档差异：
     easy   ——  coarse 评分（只认 成五/四/活三 级别），半径 1，分数接近时随机；
                但防守权重高，能稳定识别并封堵玩家活三 / 冲四，也会主动连自己活三。
     medium ——  完整棋型表（活四/冲四/活三/眠三/活二/眠二）+ 双三 / 四三组合加成，半径 2，
                几乎不随机，进攻防守加权。
     hard   ——  medium 评分 + 对 top-N 候选做 2 层推演（我落一手 → 对手最佳应手 → 我再应一手），
                先判「自己成五 / 必防对手成五」，再比综合分。 */
  var DIFFS = {
    easy:   { radius: 1, defense: 1.25, noise: 0.30, coarse: true,  topN: 0, depth: 0, thinkMs: 180 },
    medium: { radius: 2, defense: 1.00, noise: 0.04, coarse: false, topN: 0, depth: 0, thinkMs: 240 },
    hard:   { radius: 2, defense: 1.05, noise: 0,    coarse: false, topN: 8,  depth: 1, thinkMs: 320 }
  };

  /* ------------------------------------------------------------------
     中英文兜底字典：i18n.js 的 ggomoku 字典由别人并行补齐，这里只在
     I18N.t(key) 返回裸 key 时兜底，保证并行开发期与切语言都不出现裸 key。
     只使用「统一 key 清单」内的 key。
     ------------------------------------------------------------------ */
  var FB = {
    zh: {
      page_title: '五子棋 · 在线玩 | YSGame 云舒的小游戏屋',
      page_desc: '免费在线五子棋：15×15 木纹棋盘，你执黑先手，和会思考的电脑对弈。简单 / 中等 / 困难三档 AI 强度分明，支持悔棋、提示、自动存档与断点续玩。无需注册登录，打开就能玩。',
      game_title: '五子棋',
      tagline: '你执黑先手，在木纹棋盘上和电脑慢慢下一盘',
      share_line: '来下一盘五子棋，三档难度，不用登录。',
      difficulty_group_aria: '选择难度',
      diff_easy: '简单', diff_medium: '中等', diff_hard: '困难',
      confirm_diff: '切换难度会重新开始本局，确定吗？',
      label_turn: '回合', label_moves: '步数', label_best: '最佳', label_hints: '提示',
      board_aria: '五子棋棋盘',
      hint_controls: '点棋盘交叉处落子，你执黑先手、电脑执白。悔棋不限次数，提示每局三次，随时可以重开。',
      btn_hint: '提示', btn_undo: '悔棋', btn_restart: '重开一局', btn_again: '再来一局',
      new_record: '新纪录',
      win_title: '你赢了', win_sub: '五子连珠，用了 {moves} 步。',
      lose_title: '电脑赢了', lose_sub: '这一局电脑先连成五子，再来一次。',
      draw_title: '平局', draw_sub: '棋盘下满了，谁也没连成五子。',
      turn_you: '轮到你', turn_ai: '电脑', thinking: '思考中…'
    },
    en: {
      page_title: 'Gomoku, free to play | YSGame',
      page_desc: 'A free online Gomoku on a 15x15 wooden board. You play black first against a thinking computer, with three AI levels, undo, hints and autosave. No account needed.',
      game_title: 'Gomoku',
      tagline: 'You take black, and play a slow game against the computer',
      share_line: 'A quiet game of Gomoku, three levels, no sign-up.',
      difficulty_group_aria: 'Choose a difficulty',
      diff_easy: 'Easy', diff_medium: 'Medium', diff_hard: 'Hard',
      confirm_diff: 'Switching difficulty restarts this round. Continue?',
      label_turn: 'Turn', label_moves: 'Moves', label_best: 'Best', label_hints: 'Hints',
      board_aria: 'Gomoku board',
      hint_controls: 'Tap a crossing to place a stone. You are black and move first. Undo is unlimited; you get three hints per game, and can restart any time.',
      btn_hint: 'Hint', btn_undo: 'Undo', btn_restart: 'Restart', btn_again: 'Play again',
      new_record: 'New record',
      win_title: 'You win', win_sub: 'Five in a row, in {moves} moves.',
      lose_title: 'Computer wins', lose_sub: 'The computer got five first. Have another go.',
      draw_title: 'Draw', draw_sub: 'The board is full and nobody made five.',
      turn_you: 'Your turn', turn_ai: 'Computer', thinking: 'Thinking...'
    }
  };

  /* ---------------- DOM ---------------- */

  var $ = function (id) { return document.getElementById(id); };
  var boardCv = null;
  var boardCtx = null;
  var overlay = null;
  var recordBadge = null;
  var overlayInfo = null;
  var aiTimer = null;

  /* ---------------- 状态 ---------------- */

  function emptyBoard() {
    var b = [], r, c;
    for (r = 0; r < SIZE; r++) {
      b.push([]);
      for (c = 0; c < SIZE; c++) b[r].push(EMPTY);
    }
    return b;
  }

  function emptyBest() { return { easy: 0, medium: 0, hard: 0 }; }

  var state = {
    diff: 'medium',
    board: emptyBoard(),
    turn: 'you',              // 'you' | 'ai'
    moves: 0,                 // 玩家落子数（即「获胜步数」）
    history: [],              // 悔棋栈：{ r, c, role }
    aiStrength: 'medium',     // 本局 AI 强度（写入存档）
    hintsLeft: HINTS_PER_GAME,
    status: 'playing',        // 'playing' | 'over'
    thinking: false,
    lastMove: null,           // { r, c }
    winLine: null,            // 五连坐标数组
    winner: 0,                // 0 平 / 1 玩家 / 2 AI
    hint: null,               // { r, c }
    hover: null,              // { r, c }
    recordShown: false,
    best: emptyBest()
  };

  /* ---------------- 工具 ---------------- */

  function t(key) {
    var v = window.I18N ? window.I18N.t(key) : key;
    if (v === key || v == null) {
      var lang = (window.I18N && window.I18N.lang === 'en') ? 'en' : 'zh';
      if (FB[lang] && FB[lang][key] != null) return FB[lang][key];
      if (FB.zh[key] != null) return FB.zh[key];
      return key;
    }
    return v;
  }

  /** I18N.t 只收 1 个参数；带占位符的文案用 split/join 自己替换，不挂静态 data-i18n */
  function tf(key, vars) {
    var s = t(key), k;
    for (k in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, k)) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      }
    }
    return s;
  }

  function sfx(name, opts) {
    if (window.YSound) window.YSound.play(name, opts);
  }

  function overlayVars() {
    return {
      moves: state.moves, steps: state.moves, n: state.moves,
      score: state.moves, count: state.moves,
      best: state.best[state.diff] || 0, time: '', diff: state.diff
    };
  }

  function cloneBoard(b) {
    var o = [], r;
    for (r = 0; r < SIZE; r++) o.push(b[r].slice());
    return o;
  }

  function inB(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

  function isFull(b) {
    var r, c;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) if (b[r][c] === EMPTY) return false;
    }
    return true;
  }

  /* ---------------- 存档 ---------------- */

  function loadRoot() {
    try {
      var d = JSON.parse(localStorage.getItem(STATE_KEY));
      if (d && d.v === 1 && d.tiers) return d;
    } catch (e) { /* 存档坏了当没有 */ }
    return null;
  }

  function loadBest() {
    try {
      var d = JSON.parse(localStorage.getItem(BEST_KEY));
      if (d && d.v === 1 && d.tiers) {
        return {
          easy: Number(d.tiers.easy) || 0,
          medium: Number(d.tiers.medium) || 0,
          hard: Number(d.tiers.hard) || 0
        };
      }
    } catch (e) { /* ignore */ }
    return emptyBest();
  }

  function saveBest() {
    try { localStorage.setItem(BEST_KEY, JSON.stringify({ v: 1, tiers: state.best })); }
    catch (e) { /* 隐私模式写不了，不影响玩 */ }
  }

  function loadDiff() {
    try {
      var d = localStorage.getItem(DIFF_KEY);
      if (d && DIFFS[d]) state.diff = d;
    } catch (e) { /* ignore */ }
  }

  function saveDiff() {
    try { localStorage.setItem(DIFF_KEY, state.diff); } catch (e) { /* ignore */ }
  }

  function snapshotBucket() {
    return {
      board: cloneBoard(state.board),
      turn: state.turn,
      moves: state.moves,
      history: state.history.slice(0),
      aiStrength: state.aiStrength,
      hintsLeft: state.hintsLeft,
      status: state.status,
      lastMove: state.lastMove,
      winLine: state.winLine,
      winner: state.winner
    };
  }

  function save() {
    try {
      var root = loadRoot();
      if (!root || root.v !== 1) root = { v: 1, cur: state.diff, tiers: {} };
      if (!root.tiers) root.tiers = {};
      root.cur = state.diff;
      root.tiers[state.diff] = snapshotBucket();
      localStorage.setItem(STATE_KEY, JSON.stringify(root));
    } catch (e) { /* ignore */ }
  }

  function validBucket(b) {
    return !!(b && b.board && b.board.length === SIZE &&
      b.board[0] && b.board[0].length === SIZE);
  }

  function restoreBucket(b) {
    state.board = cloneBoard(b.board);
    state.turn = (b.turn === 'ai') ? 'ai' : 'you';
    state.moves = Number(b.moves) || 0;
    state.history = (b.history || []).slice(0);
    state.aiStrength = b.aiStrength || state.diff;
    state.hintsLeft = (b.hintsLeft == null) ? HINTS_PER_GAME : Number(b.hintsLeft);
    state.status = b.status || 'playing';
    state.lastMove = b.lastMove || null;
    state.winLine = b.winLine || null;
    state.winner = b.winner || 0;
    state.thinking = false;
    state.hint = null;
    state.hover = null;
    state.recordShown = false;
    recordBadge.hidden = true;
    if (state.status === 'over') {
      showOverlay(state.winner === 1 ? 'win' : (state.winner === 2 ? 'lose' : 'draw'));
    } else {
      overlay.hidden = true;
      overlayInfo = null;
    }
    updateHud();
    render();
  }

  /* ---------------- 胜负判定 ---------------- */

  /** 假设 role 落在 (r,c)（该点当前为空）是否立刻成五 */
  function isFiveAt(b, r, c, role) {
    var d, k, rr, cc, cnt;
    for (d = 0; d < 4; d++) {
      cnt = 1;
      for (k = 1; k < 5; k++) {
        rr = r + DIRS[d][0] * k; cc = c + DIRS[d][1] * k;
        if (inB(rr, cc) && b[rr][cc] === role) cnt++; else break;
      }
      for (k = 1; k < 5; k++) {
        rr = r - DIRS[d][0] * k; cc = c - DIRS[d][1] * k;
        if (inB(rr, cc) && b[rr][cc] === role) cnt++; else break;
      }
      if (cnt >= 5) return true;
    }
    return false;
  }

  /** 落子后调用（b[r][c] 已设），返回五连坐标数组或 null */
  function winLineAt(b, r, c) {
    var role = b[r][c], d, k, rr, cc, pts;
    for (d = 0; d < 4; d++) {
      pts = [{ r: r, c: c }];
      for (k = 1; k < 5; k++) {
        rr = r + DIRS[d][0] * k; cc = c + DIRS[d][1] * k;
        if (inB(rr, cc) && b[rr][cc] === role) pts.push({ r: rr, c: cc }); else break;
      }
      for (k = 1; k < 5; k++) {
        rr = r - DIRS[d][0] * k; cc = c - DIRS[d][1] * k;
        if (inB(rr, cc) && b[rr][cc] === role) pts.unshift({ r: rr, c: cc }); else break;
      }
      if (pts.length >= 5) return pts;
    }
    return null;
  }

  /* ---------------- 棋型评分 ----------------
     evalDir：以 (r,c) 为中心取长度 9 的窗口（我方=1 / 空=0 / 对方或墙=2），
     枚举所有长度 5 的窗口（起点 0..4，都覆盖中心 index 4，保证威胁经过新落的子）：
       - 某窗口 n1==5 → 成五
       - 某窗口 n1==4 且无阻挡 → 记一个「成五点」；不同成五点数 >=2 即活四
       - n1==3 窗口数 >=2 视为活三，==1 眠三；n1==2 同理分活二 / 眠二
     ------------------------------------------------- */

  function evalDir(b, r, c, dr, dc, role) {
    var v = [], k, rr, cc, x;
    for (k = -4; k <= 4; k++) {
      if (k === 0) { v.push(1); continue; }         // 中心：假设已落 role
      rr = r + dr * k; cc = c + dc * k;
      if (!inB(rr, cc)) { v.push(2); continue; }     // 墙视作阻挡
      x = b[rr][cc];
      if (x === EMPTY) v.push(0);
      else if (x === role) v.push(1);
      else v.push(2);
    }

    var winPts = {}, winCount = 0, threeRaw = 0, twoRaw = 0;
    var i, j, n1, n2, zeros, val;
    for (i = 0; i < 5; i++) {
      n1 = 0; n2 = 0; zeros = [];
      for (j = 0; j < 5; j++) {
        val = v[i + j];
        if (val === 1) n1++;
        else if (val === 2) n2++;
        else zeros.push(i + j);
      }
      if (n2 > 0) continue;                          // 该窗口被堵，不成威胁
      if (n1 === 5) return { five: true, four: 0, three: 0, two: 0 };
      if (n1 === 4) {
        if (!winPts[zeros[0]]) { winPts[zeros[0]] = 1; winCount++; }
      } else if (n1 === 3) threeRaw++;
      else if (n1 === 2) twoRaw++;
    }
    return {
      five: false,
      four: winCount,
      three: threeRaw >= 2 ? 2 : (threeRaw === 1 ? 1 : 0),
      two: twoRaw >= 2 ? 2 : (twoRaw === 1 ? 1 : 0)
    };
  }

  /** 假设 b[r][c] = role，评估这一手对 role 的价值 */
  function shapeAt(b, r, c, role, coarse) {
    var openFour = 0, rushFour = 0, liveThree = 0, sleepThree = 0, liveTwo = 0, sleepTwo = 0;
    var d, info;
    for (d = 0; d < 4; d++) {
      info = evalDir(b, r, c, DIRS[d][0], DIRS[d][1], role);
      if (info.five) return SCORE.FIVE;
      if (info.four >= 2) openFour++;
      else if (info.four === 1) rushFour++;
      if (info.three === 2) liveThree++;
      else if (info.three === 1) sleepThree++;
      if (info.two === 2) liveTwo++;
      else if (info.two === 1) sleepTwo++;
    }

    /* 组合威胁：活四 / 双冲四 / 四三 / 双三，都是「下一手必胜」级别 */
    if (openFour > 0) return SCORE.LIVE_FOUR;
    if (rushFour >= 2) return SCORE.LIVE_FOUR;
    if (rushFour >= 1 && liveThree >= 1) return SCORE.FOUR_THREE;
    if (liveThree >= 2) return SCORE.DOUBLE_THREE;
    if (rushFour >= 1) return SCORE.RUSH_FOUR;

    var s;
    if (coarse) {
      /* easy：只用粗粒度（活三 / 眠三），忽略活二细分，布局明显更弱 */
      s = liveThree * SCORE.LIVE_THREE + sleepThree * SCORE.SLEEP_THREE;
    } else {
      s = liveThree * SCORE.LIVE_THREE + sleepThree * SCORE.SLEEP_THREE +
        liveTwo * SCORE.LIVE_TWO + sleepTwo * SCORE.SLEEP_TWO;
      if (liveThree + sleepThree + liveTwo + sleepTwo >= 2) s += 20;
    }
    return s > 0 ? s : 1;
  }

  /* ---------------- AI ---------------- */

  /** 候选点：radius 邻域内有子的空位；空盘返回天元 */
  function candidates(b, radius) {
    var out = [], r, c, dr, dc, rr, cc, near;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        if (b[r][c] !== EMPTY) continue;
        near = false;
        for (dr = -radius; dr <= radius && !near; dr++) {
          for (dc = -radius; dc <= radius && !near; dc++) {
            if (dr === 0 && dc === 0) continue;
            rr = r + dr; cc = c + dc;
            if (inB(rr, cc) && b[rr][cc] !== EMPTY) near = true;
          }
        }
        if (near) out.push({ r: r, c: c });
      }
    }
    if (!out.length) out.push({ r: 7, c: 7 });
    return out;
  }

  /** 局面下 role 的最佳落点（用于 hard 的推演，不含随机 / 递归） */
  function bestReply(b, cfg, role) {
    var opp = role === 1 ? 2 : 1;
    var cand = candidates(b, cfg.radius);
    var best = null, i, m, my, op, base;
    for (i = 0; i < cand.length; i++) {
      m = cand[i];
      if (isFiveAt(b, m.r, m.c, role)) {
        return { r: m.r, c: m.c, my: SCORE.FIVE, base: SCORE.FIVE * 2 };
      }
      b[m.r][m.c] = role; my = shapeAt(b, m.r, m.c, role, false);
      b[m.r][m.c] = opp;  op = shapeAt(b, m.r, m.c, opp, false);
      b[m.r][m.c] = EMPTY;
      base = my + op * cfg.defense;
      if (!best || base > best.base) best = { r: m.r, c: m.c, my: my, base: base };
    }
    return best;
  }

  /** 为 role 选一手。board 会被临时改动但完全还原，是纯函数。 */
  function chooseFor(b, diff, role) {
    var cfg = DIFFS[diff] || DIFFS.medium;
    var opp = role === 1 ? 2 : 1;
    var cand = candidates(b, cfg.radius);
    var i, m, my, op;

    /* 1) 自己成五优先；2) 必防对手成五（所有档的硬规则） */
    for (i = 0; i < cand.length; i++) {
      m = cand[i];
      if (isFiveAt(b, m.r, m.c, role)) return { r: m.r, c: m.c };
    }
    for (i = 0; i < cand.length; i++) {
      m = cand[i];
      if (isFiveAt(b, m.r, m.c, opp)) return { r: m.r, c: m.c };
    }

    /* 3) 逐点算 我方得分 + 对方得分 × 防守权重 */
    var scored = [];
    for (i = 0; i < cand.length; i++) {
      m = cand[i];
      b[m.r][m.c] = role; my = shapeAt(b, m.r, m.c, role, cfg.coarse);
      b[m.r][m.c] = opp;  op = shapeAt(b, m.r, m.c, opp, cfg.coarse);
      b[m.r][m.c] = EMPTY;
      scored.push({ r: m.r, c: m.c, my: my, op: op, base: my + op * cfg.defense });
    }
    scored.sort(function (a, b2) { return b2.base - a.base; });

    if (!scored.length) return { r: 7, c: 7 };

    /* hard：对 top-N 候选做 2 层推演（我落 → 对手最佳应 → 我再应），多考虑一步 */
    if (cfg.depth > 0 && cfg.topN > 0) {
      var top = scored.slice(0, Math.min(cfg.topN, scored.length));
      var bestTot = -Infinity, pick = top[0], t0, oppBest, myNext, q, total;
      for (i = 0; i < top.length; i++) {
        t0 = top[i];
        b[t0.r][t0.c] = role;
        oppBest = bestReply(b, cfg, opp);            // 对手最强应手
        myNext = 0;
        if (oppBest) {
          b[oppBest.r][oppBest.c] = opp;
          q = bestReply(b, cfg, role);               // 我再走一步的价值
          if (q) myNext = q.my;
          b[oppBest.r][oppBest.c] = EMPTY;
        }
        b[t0.r][t0.c] = EMPTY;
        total = t0.base - (oppBest ? oppBest.base * 0.9 : 0) + myNext * 0.35;
        if (total > bestTot) { bestTot = total; pick = t0; }
      }
      return { r: pick.r, c: pick.c };
    }

    /* easy：分数接近时随机（引入不确定性 → 明显弱），但唯一明显最佳点仍稳定选中 */
    if (cfg.noise > 0) {
      var head = scored[0];
      var pool = [head], k;
      for (k = 1; k < scored.length && k < 5; k++) {
        if (scored[k].base >= head.base * (1 - cfg.noise)) pool.push(scored[k]);
        else break;
      }
      if (pool.length > 1) {
        var idx = Math.floor(Math.random() * pool.length);
        return { r: pool[idx].r, c: pool[idx].c };
      }
      return { r: head.r, c: head.c };
    }

    /* medium：取综合分最高 */
    return { r: scored[0].r, c: scored[0].c };
  }

  /* ---------------- 局面控制 ---------------- */

  function placeStone(r, c, role) {
    state.board[r][c] = role;
    state.history.push({ r: r, c: c, role: role });
    state.lastMove = { r: r, c: c };
    if (role === BLACK) state.moves += 1;
  }

  function newGame(doSave) {
    if (aiTimer) { window.clearTimeout(aiTimer); aiTimer = null; }
    state.board = emptyBoard();
    state.turn = 'you';
    state.moves = 0;
    state.history = [];
    state.aiStrength = state.diff;
    state.hintsLeft = HINTS_PER_GAME;
    state.status = 'playing';
    state.thinking = false;
    state.lastMove = null;
    state.winLine = null;
    state.winner = 0;
    state.hint = null;
    state.hover = null;
    state.recordShown = false;
    overlay.hidden = true;
    recordBadge.hidden = true;
    overlayInfo = null;
    if (doSave !== false) save();
    updateHud();
    render();
  }

  function playerMove(r, c) {
    if (state.status !== 'playing' || state.turn !== 'you' || state.thinking) return;
    if (state.board[r][c] !== EMPTY) { sfx('error'); return; }
    placeStone(r, c, BLACK);
    sfx('place');
    state.hint = null;
    var line = winLineAt(state.board, r, c);
    if (line) { finish('win', line); return; }
    if (isFull(state.board)) { finish('draw', null); return; }

    state.turn = 'ai';
    state.thinking = true;
    save();                                  // 中间态：轮到 AI，刷新可断点续玩
    updateHud();
    render();
    aiTimer = window.setTimeout(aiTurn, (DIFFS[state.diff] || DIFFS.medium).thinkMs);
  }

  function aiTurn() {
    aiTimer = null;
    if (state.status !== 'playing' || state.turn !== 'ai') return;
    var diff = state.aiStrength || state.diff;
    var mv = chooseFor(state.board, diff, WHITE);
    if (mv) {
      placeStone(mv.r, mv.c, WHITE);
      sfx('input');
      var line = winLineAt(state.board, mv.r, mv.c);
      if (line) { finish('lose', line); return; }
      if (isFull(state.board)) { finish('draw', null); return; }
    }
    state.turn = 'you';
    state.thinking = false;
    save();
    updateHud();
    render();
  }

  function undo() {
    if (aiTimer) { window.clearTimeout(aiTimer); aiTimer = null; }
    var n = state.history.length;
    if (n === 0) { sfx('error'); return; }
    var steps;
    if (n >= 2 && state.history[n - 2].role === BLACK && state.history[n - 1].role === WHITE) steps = 2;
    else if (state.history[n - 1].role === WHITE) steps = Math.min(2, n);
    else steps = 1;
    var i, m;
    for (i = 0; i < steps; i++) {
      m = state.history.pop();
      state.board[m.r][m.c] = EMPTY;
      if (m.role === BLACK) state.moves = Math.max(0, state.moves - 1);
    }
    state.turn = 'you';
    state.thinking = false;
    state.status = 'playing';
    state.winner = 0;
    state.winLine = null;
    state.hint = null;
    state.recordShown = false;
    state.lastMove = state.history.length
      ? { r: state.history[state.history.length - 1].r, c: state.history[state.history.length - 1].c }
      : null;
    overlay.hidden = true;
    recordBadge.hidden = true;
    overlayInfo = null;
    sfx('undo');
    save();
    updateHud();
    render();
  }

  function hint() {
    if (state.status !== 'playing' || state.turn !== 'you' || state.thinking) { sfx('error'); return; }
    if (state.hintsLeft <= 0) { sfx('error'); return; }
    var mv = chooseFor(cloneBoard(state.board), state.diff, BLACK);
    if (!mv) return;
    state.hint = { r: mv.r, c: mv.c };
    state.hintsLeft -= 1;
    sfx('hint');
    save();
    updateHud();
    render();
  }

  function finish(kind, line) {
    if (aiTimer) { window.clearTimeout(aiTimer); aiTimer = null; }
    state.status = 'over';
    state.thinking = false;
    state.winner = kind === 'win' ? BLACK : (kind === 'lose' ? WHITE : 0);
    state.winLine = line;
    state.turn = 'you';
    var isRecord = false;
    if (kind === 'win') {
      var prev = state.best[state.diff] || 0;
      if (prev === 0 || state.moves < prev) {
        state.best[state.diff] = state.moves;
        saveBest();
        isRecord = true;
      }
      sfx(isRecord ? 'record' : 'win');
    } else if (kind === 'lose') sfx('lose');
    else sfx('warn');

    if (isRecord) {
      state.recordShown = true;
      recordBadge.hidden = false;
      recordBadge.textContent = t('new_record');
    }
    showOverlay(kind);
    save();
    updateHud();
    render();
  }

  function switchDiff(diff) {
    if (!DIFFS[diff] || diff === state.diff) return;
    if (state.moves > 0 && state.status === 'playing') {
      if (!window.confirm(t('confirm_diff'))) { syncDiffs(); return; }
    }
    save();                                  // 先把当前档存进对应桶
    state.diff = diff;
    saveDiff();
    syncDiffs();
    sfx('toggle');
    var root = loadRoot();
    var b = root && root.tiers ? root.tiers[diff] : null;
    if (b && validBucket(b)) restoreBucket(b);
    else newGame(false);
    save();
    if (state.status === 'playing' && state.turn === 'ai') {
      state.thinking = true;
      updateHud();
      aiTimer = window.setTimeout(aiTurn, DIFFS[diff].thinkMs);
    }
  }

  function syncDiffs() {
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === state.diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* ---------------- 界面 ---------------- */

  function updateHud() {
    $('moves').textContent = String(state.moves);
    var best = state.best[state.diff] || 0;
    $('best').textContent = best > 0 ? String(best) : '--';
    $('hints').textContent = String(state.hintsLeft);
    var tv;
    if (state.status === 'over') tv = '—';
    else if (state.thinking) tv = t('thinking');
    else tv = t(state.turn === 'you' ? 'turn_you' : 'turn_ai');
    $('turn').textContent = tv;
    $('btn-hint').disabled = state.hintsLeft <= 0 || state.status !== 'playing' ||
      state.turn !== 'you' || state.thinking;
    $('btn-undo').disabled = state.history.length === 0;
  }

  function showOverlay(kind) {
    var titleKey = kind === 'win' ? 'win_title' : (kind === 'lose' ? 'lose_title' : 'draw_title');
    var subKey = kind === 'win' ? 'win_sub' : (kind === 'lose' ? 'lose_sub' : 'draw_sub');
    overlayInfo = { title: titleKey, sub: subKey };
    $('overlay-title').textContent = t(titleKey);
    $('overlay-sub').textContent = tf(subKey, overlayVars());
    $('overlay-moves').textContent = String(state.moves);
    overlay.hidden = false;
  }

  /** 语言原地切换时，I18N.apply 只管 data-i18n；这里用 t()/tf() 重画全部文本，
      顺便在字典尚未补齐时把裸 key 兜成内置文案。 */
  function applyText() {
    var i, nodes, key;
    nodes = document.querySelectorAll('[data-i18n]');
    for (i = 0; i < nodes.length; i++) {
      key = nodes[i].getAttribute('data-i18n');
      nodes[i].textContent = t(key);
    }
    nodes = document.querySelectorAll('[data-i18n-aria]');
    for (i = 0; i < nodes.length; i++) {
      key = nodes[i].getAttribute('data-i18n-aria');
      nodes[i].setAttribute('aria-label', t(key));
    }
    document.title = t('page_title');
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t('page_desc'));
    if (!recordBadge.hidden) recordBadge.textContent = t('new_record');
    if (overlayInfo && !overlay.hidden) {
      $('overlay-title').textContent = t(overlayInfo.title);
      $('overlay-sub').textContent = tf(overlayInfo.sub, overlayVars());
    }
    updateHud();
    syncDiffs();
  }

  /* ---------------- 绘制 ---------------- */

  function setupCanvas() {
    var dpr = window.devicePixelRatio || 1;
    boardCv.width = Math.round(W * dpr);
    boardCv.height = Math.round(H * dpr);
    var c = boardCv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function px(c) { return PAD + c * CELL; }
  function py(r) { return PAD + r * CELL; }

  function drawBackground(c) {
    var g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#F0DFBA');
    g.addColorStop(1, '#E4CEA2');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    /* 几道淡木纹，别抢棋子的戏 */
    c.strokeStyle = 'rgba(150,110,60,.06)';
    c.lineWidth = 1;
    var i, y;
    for (i = 0; i < 8; i++) {
      y = 18 + i * 74;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(W * 0.3, y + 9, W * 0.62, y - 9, W, y + 3);
      c.stroke();
    }
  }

  function drawGrid(c) {
    var i, p, span = (SIZE - 1) * CELL;
    c.strokeStyle = 'rgba(92,66,38,.62)';
    c.lineWidth = 1;
    for (i = 0; i < SIZE; i++) {
      p = PAD + i * CELL;
      c.beginPath(); c.moveTo(PAD, p + 0.5); c.lineTo(PAD + span, p + 0.5); c.stroke();
      c.beginPath(); c.moveTo(p + 0.5, PAD); c.lineTo(p + 0.5, PAD + span); c.stroke();
    }
    c.lineWidth = 1.6;
    c.strokeStyle = 'rgba(92,66,38,.78)';
    c.strokeRect(PAD + 0.5, PAD + 0.5, span, span);
  }

  function drawStars(c) {
    var pts = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]], i;
    c.fillStyle = 'rgba(80,56,30,.8)';
    for (i = 0; i < pts.length; i++) {
      c.beginPath();
      c.arc(px(pts[i][1]), py(pts[i][0]), 3.4, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawStone(c, r, col, role, alpha) {
    var x = px(col), y = py(r), R = CELL * 0.43;
    c.save();
    c.globalAlpha = (alpha == null) ? 1 : alpha;
    c.shadowColor = 'rgba(40,30,15,.35)';
    c.shadowBlur = 5;
    c.shadowOffsetY = 2;
    var g = c.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
    if (role === BLACK) {
      g.addColorStop(0, '#6b6b6b'); g.addColorStop(0.6, '#333333'); g.addColorStop(1, '#151515');
    } else {
      g.addColorStop(0, '#fffdf8'); g.addColorStop(0.7, '#f3ecdd'); g.addColorStop(1, '#d6c8ac');
    }
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    c.shadowColor = 'transparent';
    c.lineWidth = 1;
    c.strokeStyle = role === BLACK ? 'rgba(0,0,0,.5)' : 'rgba(120,100,70,.6)';
    c.stroke();
    c.restore();
  }

  function drawHint(c) {
    if (!state.hint) return;
    var x = px(state.hint.c), y = py(state.hint.r);
    c.save();
    c.strokeStyle = 'rgba(85,99,159,.92)';
    c.lineWidth = 2.5;
    c.fillStyle = 'rgba(85,99,159,.22)';
    c.beginPath(); c.arc(x, y, CELL * 0.44, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
  }

  function drawHover(c) {
    if (!state.hover || state.turn !== 'you' || state.status !== 'playing' || state.thinking) return;
    if (state.board[state.hover.r][state.hover.c] !== EMPTY) return;
    drawStone(c, state.hover.r, state.hover.c, BLACK, 0.3);
  }

  function drawStones(c) {
    var r, col;
    for (r = 0; r < SIZE; r++) {
      for (col = 0; col < SIZE; col++) {
        if (state.board[r][col] !== EMPTY) drawStone(c, r, col, state.board[r][col], 1);
      }
    }
  }

  function drawLast(c) {
    if (!state.lastMove) return;
    var x = px(state.lastMove.c), y = py(state.lastMove.r);
    c.save();
    c.fillStyle = '#C4563B';
    c.beginPath(); c.arc(x, y, 4.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.85)';
    c.lineWidth = 1.4;
    c.stroke();
    c.restore();
  }

  function drawWinLine(c) {
    var L = state.winLine;
    if (!L || !L.length) return;
    var a = L[0], b = L[L.length - 1];
    var x1 = px(a.c), y1 = py(a.r), x2 = px(b.c), y2 = py(b.r);
    c.save();
    c.strokeStyle = 'rgba(181,74,47,.88)';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.fillStyle = '#B54A2F';
    c.beginPath(); c.arc(x1, y1, 5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x2, y2, 5, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function render() {
    var c = boardCtx;
    if (!c) return;
    c.clearRect(0, 0, W, H);
    drawBackground(c);
    drawGrid(c);
    drawStars(c);
    drawHint(c);
    drawHover(c);
    drawStones(c);
    drawLast(c);
    drawWinLine(c);
  }

  /* ---------------- 事件 ---------------- */

  function cellFromEvent(e) {
    var rect = boardCv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    var c = Math.round((x - PAD) / CELL);
    var r = Math.round((y - PAD) / CELL);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    if (Math.abs(x - px(c)) > CELL * 0.48 || Math.abs(y - py(r)) > CELL * 0.48) return null;
    return { r: r, c: c };
  }

  function bind() {
    var diffBtns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < diffBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { switchDiff(btn.getAttribute('data-diff')); });
      })(diffBtns[i]);
    }

    $('btn-hint').addEventListener('click', function () { sfx('click'); hint(); });
    $('btn-undo').addEventListener('click', function () { sfx('click'); undo(); });
    $('btn-restart').addEventListener('click', function () { sfx('start'); newGame(true); });
    $('btn-again').addEventListener('click', function () { sfx('start'); newGame(true); });

    boardCv.addEventListener('click', function (e) {
      var p = cellFromEvent(e);
      if (p) playerMove(p.r, p.c);
    });
    boardCv.addEventListener('pointermove', function (e) {
      var p = cellFromEvent(e);
      var changed = (!p && state.hover) || (p && !state.hover) ||
        (p && state.hover && (p.r !== state.hover.r || p.c !== state.hover.c));
      state.hover = p;
      if (changed) render();
    });
    boardCv.addEventListener('pointerleave', function () {
      if (state.hover) { state.hover = null; render(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var k = e.key;
      if (k === 'u' || k === 'U') { undo(); e.preventDefault(); }
      else if (k === 'h' || k === 'H') { hint(); e.preventDefault(); }
    });

    document.addEventListener('ys:langchange', applyText);

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        boardCtx = setupCanvas();
        render();
      }, 120);
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    boardCv = $('board');
    overlay = $('overlay');
    recordBadge = $('recordBadge');
    boardCtx = setupCanvas();

    state.best = loadBest();
    loadDiff();
    syncDiffs();

    var root = loadRoot();
    var b = root && root.tiers ? root.tiers[state.diff] : null;
    if (b && validBucket(b)) restoreBucket(b);
    else newGame(false);

    bind();
    applyText();
    save();

    /* 刷新时若停在「AI 该走还没走」的中间态，补走一手，断点续玩才完整 */
    if (state.status === 'playing' && state.turn === 'ai') {
      state.thinking = true;
      updateHud();
      aiTimer = window.setTimeout(aiTurn, (DIFFS[state.aiStrength] || DIFFS[state.diff] || DIFFS.medium).thinkMs);
    }
  }

  /* ---------------- 自动化验证用的调试接口（不参与玩法） ---------------- */
  window.__gomoku = {
    choose: function (diff, role) { return chooseFor(cloneBoard(state.board), diff, role || WHITE); },
    load: function (arr) {
      var b = emptyBoard(), r, c, v;
      for (r = 0; r < SIZE; r++) {
        for (c = 0; c < SIZE; c++) {
          v = arr[r] && arr[r][c];
          b[r][c] = (v === BLACK || v === WHITE) ? v : EMPTY;
        }
      }
      newGame(false);
      state.board = b;
      var n = 0, i, j;
      for (i = 0; i < SIZE; i++) for (j = 0; j < SIZE; j++) if (b[i][j] === BLACK) n++;
      state.moves = n;
      state.hover = null;
      updateHud();
      render();
      save();
    },
    snapshot: function () {
      return {
        board: cloneBoard(state.board), turn: state.turn, moves: state.moves,
        diff: state.diff, status: state.status, hintsLeft: state.hintsLeft,
        historyLen: state.history.length, thinking: state.thinking
      };
    },
    evalAt: function (r, c, role, diff) {
      var cfg = DIFFS[diff] || DIFFS.medium;
      return shapeAt(state.board, r, c, role || BLACK, cfg.coarse);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
