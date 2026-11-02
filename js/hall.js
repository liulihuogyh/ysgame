/* --------------------------------------------------------------------------
   大厅分类筛选

   游戏到六款以后，光按「状态」分层已经不够用：想找棋类还得一行行扫。
   分类数据全部写在 HTML 的 data-cat 上，这里只负责显示与隐藏，不生成内容，
   所以关掉 JS 也不会白屏，最多是标签点了没反应。

   为什么用 append / remove 而不是 display:none：
   卡片网格里「最后一张铺满整行」用的是 :last-child:nth-child(odd)，
   被隐藏的元素仍然参与 nth-child 计数，会让第二行留出半格空位。
   直接从 DOM 里摘掉，选择器才会按当前可见的数量重新算。

   [gyh 2026-11-03 新增]
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  var tabBar = document.querySelector('.ys-tabs');
  var grid = document.getElementById('hallGrid');
  if (!tabBar || !grid) return;

  var tabs = Array.prototype.slice.call(tabBar.querySelectorAll('.ys-tab'));
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.game-card'));
  var chipList = document.getElementById('hallChips');
  var chips = chipList
    ? Array.prototype.slice.call(chipList.querySelectorAll('.ys-chip'))
    : [];
  var soonCount = document.getElementById('soonCount');
  var soonHint = document.querySelector('.ys-soon__hint');
  var empty = document.getElementById('hallEmpty');

  function inCategory(el, cat) {
    if (cat === 'all') return true;
    var list = ' ' + (el.getAttribute('data-cat') || '') + ' ';
    return list.indexOf(' ' + cat + ' ') !== -1;
  }

  /* 按原始顺序把命中的节点重新 append 回去，没命中的摘掉；返回命中数量 */
  function pour(list, host, cat) {
    if (!host) return 0;
    var shown = 0;
    list.forEach(function (el) {
      if (inCategory(el, cat)) {
        host.appendChild(el);
        shown += 1;
      } else if (el.parentNode === host) {
        host.removeChild(el);
      }
    });
    return shown;
  }

  function select(cat) {
    tabs.forEach(function (tab) {
      tab.setAttribute('aria-pressed', tab.getAttribute('data-cat') === cat ? 'true' : 'false');
    });

    var shownCards = pour(cards, grid, cat);
    var shownChips = pour(chips, chipList, cat);

    if (soonCount) soonCount.textContent = shownChips;
    if (empty) empty.hidden = shownCards > 0;

    /* 这个分类里没有下一批的条目时，「高亮的是下一批」这句会误导，先收起来 */
    if (soonHint) {
      soonHint.hidden = !chipList || !chipList.querySelector('.ys-chip.is-next');
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      select(tab.getAttribute('data-cat'));
    });
  });
})();
