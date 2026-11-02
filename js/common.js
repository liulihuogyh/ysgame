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
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    paintSoundButton();
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

      // 点击页面其它位置收起
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

  /* ---------------- 启动 ---------------- */

  function boot() {
    initNav();
    initLang();
    syncLangFromPage();
    initFooter();
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
