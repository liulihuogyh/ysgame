/* ==========================================================================
   掌控太阳系 · Solar System（纯 ES5 / IIFE / 单文件自包含）
   伪 3D 太阳系：八行星轨道、拖拽旋转、滚轮缩放、点行星看资料卡；
   闯关模式行星知识问答，三档难度在「题数 / 时限 / 标签可见性」上真实拉开。
   存档：ysgame-solarsystem-state / -best / -diff
   [gyh 2026-11-10 新增] 批次七
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function t(k) { return window.I18N ? window.I18N.t(k) : k; }
  function lang() { return (window.I18N && window.I18N.lang) || 'zh'; }
  function sfx(name) {
    if (window.YSound && window.YSound.play) {
      try { window.YSound.play(name); } catch (e) {}
    }
  }
  function soundOn() {
    return !(window.YSGame && typeof window.YSGame.isSoundOn === 'function' && !window.YSGame.isSoundOn());
  }

  var STATE_KEY = 'ysgame-solarsystem-state';
  var BEST_KEY = 'ysgame-solarsystem-best';
  var DIFF_KEY = 'ysgame-solarsystem-diff';

  /* 三档：轨道速度、标签常显、闯关题数、单题时限 */
  var DIFF = {
    easy:   { k: 0.085, labelsAlways: true,  quizCount: 5,  quizTime: 22 },
    medium: { k: 0.150, labelsAlways: false, quizCount: 8,  quizTime: 14 },
    hard:   { k: 0.250, labelsAlways: false, quizCount: 12, quizTime: 8  }
  };

  /* 八大行星（display 半径由真实半径换算并夹取） */
  var PLANETS = [
    { orbit: 58, color: '#b9b0a3', realR: 4879,
      zh: { name: '水星', d: '4,879 km', dist: '0.39 AU', period: '88 天', fact: '离太阳最近，没有大气，昼夜温差超过 600℃。' },
      en: { name: 'Mercury', d: '4,879 km', dist: '0.39 AU', period: '88 days', fact: 'Closest to the Sun, airless, with day-night swings over 600°C.' } },
    { orbit: 98, color: '#d9a86c', realR: 12104,
      zh: { name: '金星', d: '12,104 km', dist: '0.72 AU', period: '225 天', fact: '被浓密二氧化碳包裹，表面比水星还热，是地球的「姊妹星」。' },
      en: { name: 'Venus', d: '12,104 km', dist: '0.72 AU', period: '225 days', fact: 'Wrapped in thick CO₂, even hotter than Mercury — Earth’s near-twin in size.' } },
    { orbit: 140, color: '#4f8fe0', realR: 12742,
      zh: { name: '地球', d: '12,742 km', dist: '1.00 AU', period: '365 天', fact: '目前已知唯一有生命、70% 表面被液态水覆盖的行星。' },
      en: { name: 'Earth', d: '12,742 km', dist: '1.00 AU', period: '365 days', fact: 'The only known world with life, ~70% covered by liquid water.' } },
    { orbit: 182, color: '#c1502e', realR: 6779,
      zh: { name: '火星', d: '6,779 km', dist: '1.52 AU', period: '687 天', fact: '红色的氧化铁表面，拥有太阳系最高的山——奥林匹斯山。' },
      en: { name: 'Mars', d: '6,779 km', dist: '1.52 AU', period: '687 days', fact: 'Rusty iron-oxide surface; home to Olympus Mons, the tallest mountain.' } },
    { orbit: 238, color: '#caa46a', realR: 139820,
      zh: { name: '木星', d: '139,820 km', dist: '5.20 AU', period: '11.9 年', fact: '最大的行星，质量比其余七颗加起来还重，有大红斑风暴。' },
      en: { name: 'Jupiter', d: '139,820 km', dist: '5.20 AU', period: '11.9 yr', fact: 'The biggest planet — heavier than the other seven combined, with the Great Red Spot.' } },
    { orbit: 286, color: '#e0c486', realR: 116460,
      zh: { name: '土星', d: '116,460 km', dist: '9.58 AU', period: '29.5 年', fact: '以明亮宽阔的冰岩光环闻名，密度比水还小。' },
      en: { name: 'Saturn', d: '116,460 km', dist: '9.58 AU', period: '29.5 yr', fact: 'Famous for bright icy rings; less dense than water.' } },
    { orbit: 322, color: '#9fd3d8', realR: 50724,
      zh: { name: '天王星', d: '50,724 km', dist: '19.2 AU', period: '84 年', fact: '自转轴几乎躺倒，像在轨道上「滚动」，呈淡青色。' },
      en: { name: 'Uranus', d: '50,724 km', dist: '19.2 AU', period: '84 yr', fact: 'Spins on its side and looks pale cyan.' } },
    { orbit: 356, color: '#4f6fd0', realR: 49244,
      zh: { name: '海王星', d: '49,244 km', dist: '30.0 AU', period: '165 年', fact: '最远的行星，风速可超 2000 km/h，是太阳系最强劲的风。' },
      en: { name: 'Neptune', d: '49,244 km', dist: '30.0 AU', period: '165 yr', fact: 'Farthest planet, with the fastest winds — over 2,000 km/h.' } }
  ];
  var SUN = {
    zh: { name: '太阳', d: '1,391,000 km', dist: '—', period: '—', fact: '占太阳系总质量 99.86% 的恒星，每秒把约 6 亿吨氢聚变成氦。' },
    en: { name: 'Sun', d: '1,391,000 km', dist: '—', period: '—', fact: 'A star holding 99.86% of the system’s mass; fuses ~600M tons of hydrogen per second.' }
  };

  /* ---------------- 运行时 ---------------- */
  var diff = 'medium';
  var mode = 'cruise';
  var canvas = null, ctx = null, wrap = null;
  var dpr = 1, cssW = 0, cssH = 0;
  var rot = -0.5;            // 用户拖拽旋转角
  var zoom = 1.0;            // 滚轮缩放
  var drag = null;           // {x,y}
  var hoverIdx = -1, selIdx = -1;
  var animId = 0, lastT = 0;
  var angles = [];
  for (var pi = 0; pi < PLANETS.length; pi++) {
    angles[pi] = pi * 0.9 + 0.4;
  }
  var state = null;
  var score = 0, best = 0;
  var quizActive = false, quizIdx = 0, quizTimer = 0, quizLeft = 0, quizBank = [], quizLock = false;
  var toastTimer = 0;

  function def() { return DIFF[diff] || DIFF.medium; }

  /* ---------------- 存档 ---------------- */
  function readJSON(key) {
    try { var o = JSON.parse(localStorage.getItem(key)); return o && o.data ? o.data : null; }
    catch (e) { return null; }
  }
  function saveState() {
    var d = { v: 1, data: { diff: diff, mode: mode, score: score } };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function readBest() {
    var n = 0; try { n = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { n = 0; }
    return n;
  }
  function writeBest(n) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) {} }
  function readDiff() {
    var d = 'medium'; try { d = localStorage.getItem(DIFF_KEY) || 'medium'; } catch (e) {}
    return DIFF[d] ? d : 'medium';
  }

  /* ---------------- 画布尺寸 ---------------- */
  function resize() {
    if (!wrap || !canvas) return;
    cssW = wrap.clientWidth || 320;
    cssH = Math.round(cssW * 0.72);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------------- 绘制 ---------------- */
  function planetScreen(i) {
    var p = PLANETS[i];
    var a = angles[i];
    var x = p.orbit * Math.cos(a);
    var y = p.orbit * Math.sin(a);
    // 整体旋转（用户拖拽）
    var ca = Math.cos(rot), sa = Math.sin(rot);
    var xr = x * ca - y * sa;
    var yr = x * sa + y * ca;
    var scale = (Math.min(cssW, cssH) * 0.46) / (PLANETS[PLANETS.length - 1].orbit + 18) * zoom;
    var cx = cssW / 2, cy = cssH * 0.46;
    var sx = cx + xr * scale;
    var sy = cy + yr * scale * 0.42;          // 俯视倾斜
    var depth = yr;                            // 越大越靠后
    var rr = Math.max(2.6, Math.min(11, Math.sqrt(p.realR) / 30));
    return { x: sx, y: sy, r: rr * Math.max(0.6, Math.min(1.15, 1 + depth / 700)), depth: depth };
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);
    var cx = cssW / 2, cy = cssH * 0.46;
    var scale = (Math.min(cssW, cssH) * 0.46) / (PLANETS[PLANETS.length - 1].orbit + 18) * zoom;

    // 轨道
    for (var i = 0; i < PLANETS.length; i++) {
      var p = PLANETS[i];
      ctx.beginPath();
      ctx.ellipse(cx, cy, p.orbit * scale, p.orbit * scale * 0.42, rot, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(150,180,220,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 太阳
    var sunR = 13 * Math.max(0.7, Math.min(1.2, zoom));
    var grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, sunR * 2.4);
    grd.addColorStop(0, '#fff3c4');
    grd.addColorStop(0.45, '#ffd166');
    grd.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, sunR * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcf5c';
    ctx.beginPath(); ctx.arc(cx, cy, sunR, 0, Math.PI * 2); ctx.fill();

    // 行星（按 depth 排序，远的先画）
    var order = [];
    for (var j = 0; j < PLANETS.length; j++) order.push(j);
    order.sort(function (a, b) { return planetScreen(a).depth - planetScreen(b).depth; });

    var L = lang();
    for (var k = 0; k < order.length; k++) {
      var idx = order[k];
      var s = planetScreen(idx);
      var pl = PLANETS[idx];
      var dim = s.depth < 0 ? 0.78 : 1;        // 背面稍暗
      ctx.globalAlpha = dim;
      ctx.fillStyle = pl.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      // 选中高亮圈
      if (idx === selIdx || idx === hoverIdx) {
        ctx.strokeStyle = '#ffd27a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 4, 0, Math.PI * 2); ctx.stroke();
      }

      // 标签
      var showLabel = def().labelsAlways || idx === selIdx || idx === hoverIdx;
      if (showLabel) {
        ctx.fillStyle = '#dfeaff';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pl[L].name, s.x, s.y - s.r - 6);
      }
    }
  }

  function tick(now) {
    if (!lastT) lastT = now;
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    var K = def().k;
    for (var i = 0; i < PLANETS.length; i++) {
      angles[i] += (K / Math.sqrt(PLANETS[i].orbit)) * dt * 60;
    }
    draw();
    animId = window.requestAnimationFrame(tick);
  }

  /* ---------------- 命中测试 ---------------- */
  function hitPlanet(px, py) {
    var bestIdx = -1, bestD = 1e9;
    for (var i = 0; i < PLANETS.length; i++) {
      var s = planetScreen(i);
      var d = Math.sqrt((px - s.x) * (px - s.x) + (py - s.y) * (py - s.y));
      if (d <= s.r + 7 && d < bestD) { bestD = d; bestIdx = i; }
    }
    // 点太阳
    var cx = cssW / 2, cy = cssH * 0.46;
    if (bestIdx < 0 && Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)) <= 16) return -2;
    return bestIdx;
  }

  function showInfo(idx) {
    var card = $('info-card'), name = $('info-name'), list = $('info-list'), fact = $('info-fact');
    if (!card) return;
    var L = lang();
    var src = idx === -2 ? SUN : PLANETS[idx][L];
    name.textContent = src.name;
    list.innerHTML =
      '<li>' + t('label_diameter') + '：<b>' + src.d + '</b></li>' +
      '<li>' + t('label_distance') + '：<b>' + src.dist + '</b></li>' +
      '<li>' + t('label_period') + '：<b>' + src.period + '</b></li>';
    fact.textContent = src.fact;
    card.hidden = false;
    $('quiz-card').hidden = true;
  }

  /* ---------------- 问答题库 ---------------- */
  function buildBank() {
    var Q = [
      { q: { zh: '最大的行星是？', en: 'Which is the biggest planet?' }, ans: 4 },
      { q: { zh: '离太阳最近的行星是？', en: 'Closest planet to the Sun?' }, ans: 0 },
      { q: { zh: '离太阳最远的行星是？', en: 'Farthest planet from the Sun?' }, ans: 7 },
      { q: { zh: '以明亮光环闻名的行星是？', en: 'Famous for bright rings?' }, ans: 5 },
      { q: { zh: '我们的地球是？', en: 'Our home planet?' }, ans: 2 },
      { q: { zh: '被称为红色行星的是？', en: 'Known as the red planet?' }, ans: 3 },
      { q: { zh: '体积最小的行星是？', en: 'The smallest planet?' }, ans: 0 },
      { q: { zh: '离太阳第二近的行星是？', en: 'Second closest to the Sun?' }, ans: 1 },
      { q: { zh: '自转轴几乎「躺倒」的行星是？', en: 'Spins on its side?' }, ans: 6 },
      { q: { zh: '体积仅次于木星的气态巨行星是？', en: 'Second-largest gas giant?' }, ans: 5 },
      { q: { zh: '与地球大小相近的「姊妹星」是？', en: 'Earth’s near-twin in size?' }, ans: 1 },
      { q: { zh: '已知唯一有生命的行星是？', en: 'Only known planet with life?' }, ans: 2 }
    ];
    var count = def().quizCount;
    var picks = Q.slice(0, count);
    var bank = [];
    for (var i = 0; i < picks.length; i++) {
      var q = picks[i];
      var opts = [q.ans];
      var pool = [0, 1, 2, 3, 4, 5, 6, 7];
      // 去掉答案后随机取 3 个干扰项
      var rest = [];
      for (var r = 0; r < pool.length; r++) if (pool[r] !== q.ans) rest.push(pool[r]);
      for (var s2 = rest.length - 1; s2 > 0; s2--) {
        var rnd = Math.floor(Math.random() * (s2 + 1));
        var tmp = rest[s2]; rest[s2] = rest[rnd]; rest[rnd] = tmp;
      }
      for (var d = 0; d < 3; d++) opts.push(rest[d]);
      // 洗牌选项
      for (var o = opts.length - 1; o > 0; o--) {
        var r2 = Math.floor(Math.random() * (o + 1));
        var t2 = opts[o]; opts[o] = opts[r2]; opts[r2] = t2;
      }
      var ansPos = 0;
      for (var a = 0; a < opts.length; a++) if (opts[a] === q.ans) ansPos = a;
      bank.push({ q: q.q, opts: opts, ans: ansPos });
    }
    return bank;
  }

  function fmtTime(sec) { return sec + 's'; }

  function renderQuestion() {
    var L = lang();
    var q = quizBank[quizIdx];
    $('quiz-q').textContent = (quizIdx + 1) + '. ' + q.q[L];
    var box = $('quiz-opts');
    box.innerHTML = '';
    quizLock = false;
    for (var i = 0; i < q.opts.length; i++) {
      (function (oi) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ss__opt';
        b.textContent = PLANETS[q.opts[oi]][L].name;
        b.addEventListener('click', function () { onAnswer(oi); });
        box.appendChild(b);
      })(i);
    }
    $('quiz-fb').textContent = '';
    $('quiz-fb').className = 'ss__quiz-fb';
    quizLeft = def().quizTime;
    $('time').textContent = fmtTime(quizLeft);
    if (quizTimer) window.clearInterval(quizTimer);
    quizTimer = window.setInterval(function () {
      quizLeft--;
      $('time').textContent = fmtTime(Math.max(0, quizLeft));
      if (quizLeft <= 0) {
        window.clearInterval(quizTimer); quizTimer = 0;
        if (!quizLock) revealCorrect(-1);
      }
    }, 1000);
  }

  function onAnswer(oi) {
    if (quizLock) return;
    var q = quizBank[quizIdx];
    var btns = $('quiz-opts').querySelectorAll('.ss__opt');
    quizLock = true;
    if (oi === q.ans) {
      var gain = 10 + Math.max(0, quizLeft);
      score += gain;
      btns[oi].classList.add('is-correct');
      var fb = $('quiz-fb');
      fb.textContent = t('msg_correct') + ' +' + gain;
      fb.className = 'ss__quiz-fb is-ok';
      sfx('win');
    } else {
      btns[oi].classList.add('is-wrong');
      revealCorrect(oi);
      var fb2 = $('quiz-fb');
      fb2.textContent = t('msg_wrong');
      fb2.className = 'ss__quiz-fb is-bad';
      sfx('error');
    }
    for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
    updateHud();
    if (quizTimer) { window.clearInterval(quizTimer); quizTimer = 0; }
    window.setTimeout(nextQuestion, 950);
  }

  function revealCorrect(wrongOi) {
    var q = quizBank[quizIdx];
    var btns = $('quiz-opts').querySelectorAll('.ss__opt');
    for (var i = 0; i < btns.length; i++) {
      if (i === q.ans) btns[i].classList.add('is-correct');
    }
  }

  function nextQuestion() {
    quizIdx++;
    if (quizIdx >= quizBank.length) { finishQuiz(); return; }
    renderQuestion();
  }

  function finishQuiz() {
    quizActive = false;
    if (quizTimer) { window.clearInterval(quizTimer); quizTimer = 0; }
    var isRecord = score > best;
    if (isRecord) { best = score; writeBest(best); }
    $('overlay-title').textContent = t('btn_quiz') + ' · ' + t('label_score');
    $('overlay-sub').textContent = isRecord ? t('new_record') : '';
    $('record-badge').hidden = !isRecord;
    $('overlay-score').textContent = score;
    $('overlay').hidden = false;
    updateHud();
    saveState();
    if (isRecord) sfx('record'); else sfx('win');
  }

  function startQuiz() {
    quizActive = true;
    score = 0;
    quizIdx = 0;
    quizBank = buildBank();
    $('overlay').hidden = true;
    $('info-card').hidden = true;
    $('quiz-card').hidden = false;
    $('beat-readout').textContent = '';
    updateHud();
    renderQuestion();
    saveState();
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    $('score').textContent = score;
    $('best').textContent = best > 0 ? best : '--';
    if (!quizActive) $('time').textContent = '--';
  }

  /* ---------------- 提示条 ---------------- */
  function showToast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = 0; }
    toastTimer = window.setTimeout(function () { el.hidden = true; }, 2400);
  }

  /* ---------------- 难度切换 ---------------- */
  function switchDiff(newDiff) {
    if (!DIFF[newDiff]) return;
    diff = newDiff;
    try { localStorage.setItem(DIFF_KEY, diff); } catch (e) {}
    paintDiff();
    saveState();
    showToast(t('confirm_diff'));
    // 重新进入当前模式
    if (mode === 'quiz' && quizActive) startQuiz();
    else { $('info-card').hidden = true; $('quiz-card').hidden = true; }
  }

  function paintDiff() {
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-diff') === diff;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* ---------------- 启动 ---------------- */
  function start() {
    saveState();                       // 开局立即落盘
    if (mode === 'quiz') {
      startQuiz();
    } else {
      $('overlay').hidden = true;
      $('info-card').hidden = true;
      $('quiz-card').hidden = true;
      $('beat-readout').textContent = t('cruise_hint');
      if (window.YSound) sfx('start');
    }
  }

  function bindModes() {
    var btns = document.querySelectorAll('#modes .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          mode = b.getAttribute('data-mode');
          var all = document.querySelectorAll('#modes .seg__btn');
          for (var j = 0; j < all.length; j++) {
            var on = all[j] === b;
            all[j].classList.toggle('is-active', on);
            all[j].setAttribute('aria-pressed', on ? 'true' : 'false');
          }
          if (mode === 'cruise') {
            quizActive = false;
            if (quizTimer) { window.clearInterval(quizTimer); quizTimer = 0; }
            $('quiz-card').hidden = true;
            $('info-card').hidden = true;
            $('beat-readout').textContent = t('cruise_hint');
          } else {
            $('info-card').hidden = true;
            $('beat-readout').textContent = '';
          }
        });
      })(btns[i]);
    }
  }

  function bindCanvas() {
    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      var cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x: cx, y: cy };
    }
    canvas.addEventListener('mousedown', function (e) {
      var p = pos(e); drag = p;
    });
    window.addEventListener('mousemove', function (e) {
      if (drag) {
        var p = pos(e);
        rot += (p.x - drag.x) * 0.01;
        drag = p;
      } else if (mode === 'cruise') {
        var pp = pos(e);
        hoverIdx = hitPlanet(pp.x, pp.y);
        if (hoverIdx >= 0 || hoverIdx === -2) canvas.style.cursor = 'pointer';
        else canvas.style.cursor = 'grab';
      }
    });
    window.addEventListener('mouseup', function () { drag = null; });
    canvas.addEventListener('click', function (e) {
      if (mode !== 'cruise') return;
      var p = pos(e);
      var h = hitPlanet(p.x, p.y);
      if (h >= -2) { selIdx = (h === -2 ? -2 : h); showInfo(selIdx); sfx('click'); }
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoom = Math.max(0.6, Math.min(2.2, zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
    }, { passive: false });
    // 触摸拖拽
    canvas.addEventListener('touchstart', function (e) { drag = pos(e); }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (drag) { var p = pos(e); rot += (p.x - drag.x) * 0.01; drag = p; }
    }, { passive: true });
    canvas.addEventListener('touchend', function () { drag = null; });
  }

  function bindUi() {
    $('btn-start').addEventListener('click', function () { start(); });
    $('btn-restart').addEventListener('click', function () {
      if (mode === 'quiz') startQuiz(); else start();
    });
    $('btn-again').addEventListener('click', function () {
      if (mode === 'quiz') startQuiz(); else start();
    });
    var btns = document.querySelectorAll('#diffs .seg__btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { switchDiff(b.getAttribute('data-diff')); });
      })(btns[i]);
    }
  }

  function boot() {
    canvas = $('canvas');
    wrap = $('canvas-wrap');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    if (window.addEventListener) window.addEventListener('resize', resize);

    best = readBest();
    diff = readDiff();
    paintDiff();
    bindModes();
    bindCanvas();
    bindUi();
    updateHud();

    // 恢复上次存档里的模式
    var saved = readJSON(STATE_KEY);
    if (saved && saved.mode === 'quiz') mode = 'quiz';
    var mbtns = document.querySelectorAll('#modes .seg__btn');
    for (var i = 0; i < mbtns.length; i++) {
      var on = mbtns[i].getAttribute('data-mode') === mode;
      mbtns[i].classList.toggle('is-active', on);
      mbtns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    lastT = 0;
    animId = window.requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
