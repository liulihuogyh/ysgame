/**
 * YSGame 游戏页国际化
 * 游戏页只有一份 HTML，语言在这里原地切换（不像内容页那样跳转 /en/）
 * [gyh 2026-11-02 新增]
 */
(function () {
  'use strict';

  var LANG_KEY = 'ys_lang';

  var dict = {
    zh: {
      /* 导航 */
      brand_sub: '云舒的小游戏屋',
      nav_home: '游戏大厅',
      nav_about: '关于',
      nav_help: '帮助',
      lang_btn: 'EN',
      lang_aria: 'Switch to English',

      /* 游戏页 */
      page_title: '数独 · 在线玩 | YSGame 云舒的小游戏屋',
      page_desc: '免费在线数独游戏，五种难度（入门到专家），支持撤销、提示、错误检查和断点续玩。无需注册登录，打开就能玩。',
      game_title: '数独',
      tagline: '慢慢推理，一格一格把秩序填回来',

      label_level: '难度',
      label_time: '用时',
      label_hints: '提示',

      btn_new: '新游戏',
      btn_menu: '选择难度',
      btn_undo: '↶ 撤销',
      btn_erase: '🗑️ 橡皮',
      btn_hint: '💡 提示',
      btn_check: '✓ 检查',

      menu_title: '选择难度',
      menu_sub: '选一个适合当下心情的难度，慢慢来。',

      diff_easy_label: '🌱 入门（54 个已知数）',
      diff_medium_label: '🌿 简单（36 个已知数）',
      diff_hard_label: '🌳 中等（29 个已知数）',
      diff_expert_label: '🔥 困难（23 个已知数）',
      diff_master_label: '⚡ 专家（17 个已知数）',

      diff_easy: '入门',
      diff_medium: '简单',
      diff_hard: '中等',
      diff_expert: '困难',
      diff_master: '专家',

      ad_placeholder: '广告位（申请 AdSense 后替换）',

      modal_title: '🎉 恭喜完成',
      modal_time: '用时',
      modal_level: '难度',
      modal_hints: '用掉提示',
      modal_errors: '错误次数',
      btn_again: '再来一局',

      alert_no_hints: '提示次数用完了。',
      alert_given: '这是题目给出的数字，不需要提示。',
      alert_errors: '有几个格子填错了，标红的那些需要再想想。',
      alert_no_errors: '目前没有发现错误。',
      confirm_new: '要开始新的一局吗？当前的进度会丢失。',

      /* 页脚 */
      footer_brand: 'YSGame · 云舒的小游戏屋',
      footer_desc: '一个人维护的休闲小游戏合集。全部免费，不注册、不登录、不弹窗打扰。',
      footer_games: '游戏',
      footer_all: '全部游戏',
      footer_about: '关于',
      footer_story: '品牌故事',
      footer_help: '玩法说明',
      footer_privacy: '隐私政策',
      footer_copy: '一个爸爸的业余作品'
    },

    en: {
      brand_sub: "Yunshu's little arcade",
      nav_home: 'Games',
      nav_about: 'About',
      nav_help: 'Help',
      lang_btn: '中文',
      lang_aria: '切换到中文',

      page_title: 'Sudoku, free to play | YSGame',
      page_desc: 'A quiet online Sudoku with five difficulty levels, undo, hints, mistake checking and automatic save. No account, no sign-up.',
      game_title: 'Sudoku',
      tagline: 'Slow reasoning, one square at a time',

      label_level: 'Level',
      label_time: 'Time',
      label_hints: 'Hints',

      btn_new: 'New game',
      btn_menu: 'Difficulty',
      btn_undo: '↶ Undo',
      btn_erase: '🗑️ Erase',
      btn_hint: '💡 Hint',
      btn_check: '✓ Check',

      menu_title: 'Choose a level',
      menu_sub: 'Pick whichever suits your mood. Nothing here is timed against anyone.',

      diff_easy_label: '🌱 Beginner (54 given)',
      diff_medium_label: '🌿 Easy (36 given)',
      diff_hard_label: '🌳 Medium (29 given)',
      diff_expert_label: '🔥 Hard (23 given)',
      diff_master_label: '⚡ Expert (17 given)',

      diff_easy: 'Beginner',
      diff_medium: 'Easy',
      diff_hard: 'Medium',
      diff_expert: 'Hard',
      diff_master: 'Expert',

      ad_placeholder: 'Ad space',

      modal_title: '🎉 Solved',
      modal_time: 'Time',
      modal_level: 'Level',
      modal_hints: 'Hints used',
      modal_errors: 'Mistakes',
      btn_again: 'Play another',

      alert_no_hints: 'No hints left.',
      alert_given: 'That number came with the puzzle.',
      alert_errors: 'A few cells are off. The red ones need another look.',
      alert_no_errors: 'No mistakes so far.',
      confirm_new: 'Start a new game? Your current progress will be lost.',

      footer_brand: "YSGame · Yunshu's little arcade",
      footer_desc: 'Quiet games, kept by one person. Free, no account, no pop-ups.',
      footer_games: 'Games',
      footer_all: 'All games',
      footer_about: 'About',
      footer_story: 'The story',
      footer_help: 'How to play',
      footer_privacy: 'Privacy',
      footer_copy: "A dad's side project"
    }
  };

  function detectLang() {
    var q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'zh' || q === 'en') return q;

    var saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh' || saved === 'en') return saved;

    return 'zh';
  }

  var api = {
    lang: detectLang(),

    t: function (key) {
      var table = dict[this.lang] || dict.zh;
      var val = table[key];
      if (val !== undefined) return val;
      return dict.zh[key] !== undefined ? dict.zh[key] : key;
    },

    apply: function () {
      var lang = this.lang;
      var isEn = lang === 'en';

      document.documentElement.lang = isEn ? 'en' : 'zh-CN';
      document.body.classList.toggle('lang-en', isEn);

      // 纯文本节点
      var nodes = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < nodes.length; i++) {
        var key = nodes[i].getAttribute('data-i18n');
        nodes[i].textContent = this.t(key);
      }

      // 需要保留 HTML 的节点（含 <br> 等多半不用，留作扩展）
      var htmlNodes = document.querySelectorAll('[data-i18n-html]');
      for (var j = 0; j < htmlNodes.length; j++) {
        htmlNodes[j].innerHTML = this.t(htmlNodes[j].getAttribute('data-i18n-html'));
      }

      // title / aria-label
      var ariaNodes = document.querySelectorAll('[data-i18n-aria]');
      for (var k = 0; k < ariaNodes.length; k++) {
        ariaNodes[k].setAttribute('aria-label', this.t(ariaNodes[k].getAttribute('data-i18n-aria')));
      }

      // 链接目标要跟着语言走：英文模式指向 /en/，中文模式指向根目录
      var linkNodes = document.querySelectorAll('[data-href-zh]');
      for (var m = 0; m < linkNodes.length; m++) {
        var target = isEn
          ? linkNodes[m].getAttribute('data-href-en')
          : linkNodes[m].getAttribute('data-href-zh');
        if (target) linkNodes[m].setAttribute('href', target);
      }

      document.title = this.t('page_title');
      var desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', this.t('page_desc'));

      document.dispatchEvent(new CustomEvent('ys:langchange', { detail: { lang: lang } }));
    },

    setLang: function (lang) {
      if (lang !== 'zh' && lang !== 'en') return;

      this.lang = lang;
      localStorage.setItem(LANG_KEY, lang);

      // 让地址栏也能直接分享对应语言
      var url = new URL(window.location.href);
      if (lang === 'en') {
        url.searchParams.set('lang', 'en');
      } else {
        url.searchParams.delete('lang');
      }
      window.history.replaceState({}, '', url);

      this.apply();
    }
  };

  window.I18N = api;

  function boot() {
    api.apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
