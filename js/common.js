/**
 * YSGame 公共脚本
 * 负责：导航栏交互、音效开关、当前页高亮、页脚年份
 * 所有页面（含 games/ 下的游戏页）共用
 * [gyh 2026-11-02 新增]
 */
(function () {
  'use strict';

  var SOUND_KEY = 'ys_sound'; // 'on' | 'off'，默认 on

  /* ---------------- 音效开关 ---------------- */

  function isSoundOn() {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  }

  function setSound(on) {
    var before = isSoundOn();
    // 关闭前先留一声，写进 localStorage 之后就彻底静音了
    // [gyh 2026-11-08 新增]
    if (before && !on && window.YSound) window.YSound.play('click');

    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    paintSoundButton();

    // 开启后补一声上行，明确告诉玩家「有声了」
    // [gyh 2026-11-08 新增]
    if (!before && on && window.YSound) window.YSound.play('toggle');

    // 广播给页面内其它模块（游戏脚本可监听）
    document.dispatchEvent(
      new CustomEvent('ys:soundchange', { detail: { on: on } })
    );
  }

  function paintSoundButton() {
    var btn = document.getElementById('ysSoundBtn');
    if (!btn) return;
    var on = isSoundOn();
    btn.textContent = on ? '🔊' : '🔇';
    btn.classList.toggle('is-off', !on);
    btn.setAttribute(
      'aria-label',
      on ? '音效已开启，点击关闭' : '音效已关闭，点击开启'
    );
    btn.setAttribute('title', on ? '音效已开启' : '音效已关闭');
    // 手机导航展开时按钮后面跟着文字，英文页不能还挂个「音效」
    btn.setAttribute('data-label', document.documentElement.lang === 'en' ? 'Sound' : '音效');
  }

  /* ---------------- 导航 ---------------- */

  function initNav() {
    var nav = document.querySelector('.ys-nav');
    var toggle = document.getElementById('ysNavToggle');
    var links = document.getElementById('ysNavLinks');

    // 滚动到一定距离后给导航加分隔线
    if (nav) {
      var onScroll = function () {
        nav.classList.toggle('is-scrolled', window.scrollY > 8);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // 移动端展开 / 收起
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var open = links.classList.toggle('is-open');
        toggle.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      // 点击菜单项后收起
      links.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          links.classList.remove('is-open');
          toggle.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });

      // 点击页面其它位置收起（快捷按钮也算「其它位置」）
      document.addEventListener('click', function (e) {
        if (!links.classList.contains('is-open')) return;
        if (links.contains(e.target) || toggle.contains(e.target)) return;
        links.classList.remove('is-open');
        toggle.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    }

    // 当前页高亮
    var page = document.body.getAttribute('data-page');
    if (page) {
      var active = document.querySelector('.ys-nav__links a[data-nav="' + page + '"]');
      if (active) active.classList.add('is-active');
    }
  }

  /* ---------------- 语言切换 ---------------- */

  var LANG_KEY = 'ys_lang'; // 'zh' | 'en'

  function currentLang() {
    if (document.documentElement.lang === 'en') return 'en';
    return 'zh';
  }

  /**
   * 内容页是两份独立 HTML，切换＝跳转；
   * 游戏页只有一份，切换＝原地重绘（交给 I18N 处理）。
   */
  function initLang() {
    var btn = document.getElementById('ysLangBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var alt = document.body.getAttribute('data-alt-lang-url');

      if (alt) {
        localStorage.setItem(LANG_KEY, currentLang() === 'en' ? 'zh' : 'en');
        window.location.href = alt;
        return;
      }

      if (window.I18N) {
        window.I18N.setLang(window.I18N.lang === 'en' ? 'zh' : 'en');
      }
    });
  }

  /**
   * 内容页是静态两份，访问 /en/ 时把语言偏好写进 localStorage，
   * 这样随后点进只有一份的游戏页，也能自动是英文。
   */
  function syncLangFromPage() {
    // 游戏页（data-alt-lang-url="")自己管语言，不覆盖
    if (!document.body.getAttribute('data-alt-lang-url')) return;

    var isEn = document.documentElement.lang === 'en';
    localStorage.setItem(LANG_KEY, isEn ? 'en' : 'zh');
  }

  /* ---------------- 页脚 ---------------- */

  function initFooter() {
    var year = document.getElementById('ysYear');
    if (year) year.textContent = new Date().getFullYear();
  }

  /* ---------------- 全局 UI 音效 ----------------
     只管导航、语言切换和大厅分类标签。游戏内的按钮 / 难度切换
     由各款游戏自己配音，这里统一加会变成一声操作响两遍。
     [gyh 2026-11-08 新增]
     ------------------------------------------------ */

  function ui(name) {
    if (window.YSound) window.YSound.play(name);
  }

  function initUiSound() {
    var lang = document.getElementById('ysLangBtn');
    if (lang) lang.addEventListener('click', function () { ui('click'); });

    var toggle = document.getElementById('ysNavToggle');
    if (toggle) toggle.addEventListener('click', function () { ui('click'); });

    // 大厅的分类标签；内容页没有 .ys-tab，querySelectorAll 空跑即可
    var tabs = document.querySelectorAll('.ys-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () { ui('toggle'); });
    }

    // 点卡片进游戏时给一声轻确认，跳转由浏览器接着处理
    var cards = document.querySelectorAll('#hallGrid .game-card');
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener('click', function () { ui('select'); });
    }
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    initNav();
    initLang();
    syncLangFromPage();
    initFooter();
    initUiSound(); // [gyh 2026-11-08 新增]
    paintSoundButton();

    var btn = document.getElementById('ysSoundBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        setSound(!isSoundOn());
      });
    }

    // 游戏页原地切语言时，音效按钮的文字要跟着换
    document.addEventListener('ys:langchange', paintSoundButton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 对外暴露，供游戏脚本复用 */
  window.YSGame = {
    isSoundOn: isSoundOn,
    setSound: setSound
  };
})();
