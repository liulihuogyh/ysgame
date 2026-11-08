# YSGame · 云舒的小游戏屋

> YS = 云舒。用女儿的名字做的小游戏屋，域名 [ysgame.xyz](https://ysgame.xyz)。
> 纯静态站点，无后端，Vercel 托管，推送到 GitHub 自动部署。

---

## 目录结构

```
YSGame/
├── index.html                 # 中文游戏大厅
├── about.html                 # 关于 / 品牌故事
├── privacy.html               # 隐私政策（AdSense 必需）
├── help.html                  # 玩法说明 / FAQ / 联系
├── en/                        # 英文版（独立页面，便于海外分享与收录）
│   ├── index.html
│   ├── about.html
│   ├── privacy.html
│   └── help.html
├── vercel.json                # 必须保留 "src": "**/*" 全量部署
├── package.json
├── robots.txt / sitemap.xml    # 双语 hreflang 已写在 sitemap 里
├── css/
│   └── style.css              # 全站设计系统（莫兰迪配色、导航、卡片、内容页）
├── js/
│   ├── common.js              # 导航交互、语言切换、音效开关、当前页高亮
│   ├── sound.js               # 音效引擎：纯 WebAudio 合成，八款游戏八套音色
│   ├── i18n.js                # 中英字典（common + 每款游戏一份）与原地切换
│   ├── share.js               # 分享面板：系统分享 / 微信 / 微博 / X / 复制链接
│   └── hall.js                # 大厅分类标签：按 data-cat 筛选卡片与待做清单
├── assets/
│   ├── fonts/                 # 自托管字体（Instrument Sans + Newsreader）
│   ├── og-zh.png              # 全站中文分享图 1200×630
│   ├── og-en.png
│   ├── og-sudoku.png          # 每款游戏一张，转发时不重样
│   ├── og-g2048.png
│   ├── og-minesweeper.png
│   ├── og-jigsaw.png
│   ├── og-match3.png
│   └── og-snake.png
├── docs/                      # 部署/运营文档归档
│   ├── ROADMAP.md             # 游戏清单与开发批次（唯一来源）
│   └── og-cards.html          # 分享图模板
└── games/
    ├── sudoku/
    │   ├── index.html         # 中英共用一份，靠 i18n.js 切换
    │   ├── css/style.css      # 数独专属样式（在全局样式之后加载）
    │   ├── js/sudoku.js       # 题目生成与求解
    │   ├── js/game.js         # 游戏逻辑与交互
    │   └── assets/            # 图片、音效
    ├── 2048/
    │   ├── index.html
    │   ├── css/style.css      # 棋盘、方块配色与动画
    │   └── js/game2048.js     # 滑动合并、撤销、存档
    ├── minesweeper/
    │   ├── index.html
    │   ├── css/style.css      # 方格、数字配色、插旗与布雷图标
    │   └── js/minesweeper.js  # 首点保护、洪水翻开、和弦、计时与存档
    ├── jigsaw/
    │   ├── index.html
    │   ├── css/style.css      # 切片网格、选中态、原图预览
    │   └── js/jigsaw.js       # 三幅内置 SVG 画面、洗牌、交换、最佳用时
    ├── match3/
    │   ├── index.html
    │   ├── css/style.css      # 六种糖果形状（mask）、消除与落下动画
    │   └── js/match3.js       # 三连判定、连锁加分、无解重排、存档
    ├── snake/
    │   ├── index.html
    │   ├── css/style.css      # 画布、开始/暂停卡片、手机方向键
    │   └── js/snake.js        # canvas 渲染、转向队列、加速、最高分
    ├── sokoban/
    │   ├── index.html
    │   ├── css/style.css      # 格子墙地、箱子与小人、3×3 方向键
    │   └── js/sokoban.js      # 45 关地图（三档）、推箱判定、撤销栈、存档
    └── npuzzle/
        ├── index.html
        ├── css/style.css      # 百分比定位的数字块、空格凹槽、拼好时的呼吸动画
        └── js/npuzzle.js      # 随机走打乱（必有解）、可解性校验、撤销栈、每档最佳
```

**约定：** 每个游戏一个独立子文件夹，互不干扰；公共样式和脚本放在根 `css/`、`js/`。

---

## 双语是怎么做的（重要）

采用了两种不同策略，别混用：

| 页面 | 做法 | 原因 |
| --- | --- | --- |
| 首页 / about / privacy / help | **两份独立 HTML**，中文在根目录，英文在 `en/` | 社交平台的抓取器不执行 JS，独立 URL 才能让分享出去的英文标题和 `og:image` 生效，也便于搜索引擎按 `hreflang` 分别收录 |
| 游戏页（`games/<name>/`） | **一份 HTML + `js/i18n.js` 原地切换** | 游戏页 UI 文案少，复制整份 HTML 会连带 1500 行游戏逻辑一起维护，不划算 |

两边通过 `localStorage['ys_lang']` 联动：访问 `/en/` 会自动记住英文偏好，随后点进游戏页也是英文。

**给内容页加东西时，记得两个语言都改。** 游戏页的新文案加进 `js/i18n.js` 的 `zh` / `en` 字典，HTML 上写 `data-i18n="键名"`。

---

## 字体

英文用 **Instrument Sans**（正文）+ **Newsreader**（标题），都是 latin 子集的可变字重 woff2，自托管在 `assets/fonts/`，共约 111KB。

不直接引 Google Fonts CDN，原因有三：国内访问会卡、欧洲有 GDPR 判例风险、第三方请求会拖慢首屏。中文不加载任何外部字体，走系统栈（苹方 / 微软雅黑）。

---

## 本地预览

```bash
# 方式一（需要 Python）
python -m http.server 8000

# 方式二（需要 Node）
npx --yes serve . -l 8000
```

浏览器打开 <http://localhost:8000>。

> 直接双击 `index.html` 也能看样式，但 `localStorage` 在 `file://` 下行为不一致，建议用本地服务器。

---

## 部署

1. 把改动提交到 GitHub 仓库 `liulihuogyh/ysgame`。
2. Vercel 会自动拉取并部署。
3. 验证 `https://ysgame.xyz`；再打开 Vercel 项目页 **Settings → Domains**，
   看看那里列出的 `.vercel.app` 生产域名是否也能打开。

> 备用域名由 **Vercel 项目名**生成，和 GitHub 仓库名是两回事。项目改名为 `ysgame` 后，
> Vercel 会分配一个新的 `.vercel.app` 域名，具体以面板里显示的为准。

**注意：** `vercel.json` 里的 `"src": "**/*"` 不能删，否则只部署 `index.html`，样式脚本会全部 404。

---

## 新增一款游戏的步骤

1. 新建 `games/<game-name>/` 目录，放 `index.html` + 自己的 `css/`、`js/`。
2. 页面 `<head>` 里先引入全局样式，再引入游戏自己的样式：
   ```html
   <link rel="stylesheet" href="../../css/style.css">
   <link rel="stylesheet" href="css/style.css">
   ```
3. 页面底部按顺序引入脚本（前两个顺序不能换，`share.js` 必须排在游戏脚本之前）：
   ```html
   <script src="../../js/i18n.js"></script>
   <script src="../../js/common.js"></script>
   <script src="../../js/share.js"></script>
   <script src="js/<game>.js"></script>
   ```
4. 复制任意一个内容页的 `<header class="ys-nav">` 和 `<footer class="ys-footer">`，
   把相对路径改成 `../../`；`body` 上写 `data-page`、`data-dict="<游戏名>"` 和
   `data-alt-lang-url=""`（空值表示原地切换语言，`data-dict` 用来挑字典）。
   导航结构分三层，别再把控件塞回二级菜单：
   `.ys-brand`（标识）→ `.ys-nav__links`（页面链接，手机上收进汉堡）→
   `.ys-nav__utility`（分享 / 语言 / 音效，和汉堡按钮同一行，手机上始终可见）。
5. 界面文案一律写 `data-i18n="键名"`，并在 `js/i18n.js` 的 `dicts.<游戏名>` 里加中英两版；
   JS 里给用户看的文字用 `I18N.t('键名')` 取，不要硬编码中文。
   导航、页脚、广告位这类全站文案在 `common` 里，各游戏不用重复写。
6. **两个首页都要加卡片，并标好分类**：
   - `index.html` 的 `#hallGrid` 里加一张
     `<a class="game-card" data-cat="puzzle" href="games/<game-name>/index.html">`，
     记得填 `--card-bg / --card-a / --card-b` 三个色变量；
   - `en/index.html` 同样加一张，链接写 `../games/<game-name>/index.html?lang=en`。
   - `data-cat` 只能是 `puzzle`（益智）/ `arcade`（街机）/ `board`（棋类）/ `casual`（休闲），
     写错这张卡在任何分类里都不会出现。
7. **从待做清单里摘掉这款**：删掉 `#hallChips` 里对应的 `<li class="ys-chip">`，
   把 `<b id="soonCount">` 的数字减一；`docs/ROADMAP.md` 里同步状态与计数。
8. 分享图：在 `docs/og-cards.html` 的 `CONF` 里加一项，并补对应的 art 分支，
   访问 `?g=<game-name>` 截一张 1200×630 存成 `assets/og-<game-name>.png`。
9. 别漏掉这几处：`sitemap.xml` 加一条、`help.html` 与 `en/help.html` 补玩法、
   `privacy.html` 与 `en/privacy.html` 补新的 localStorage 键、README 的目录树与待办。

游戏页通用组件（`.g-head` / `.g-title` / `.g-tagline` / `.g-hud` / `.hud-box` /
`.seg` / `.g-btn` / `.result` / `.g-hint`）已经提到根 `css/style.css`，
新游戏直接复用，游戏自己的 CSS 只写棋盘和专属动效即可。

大厅的分类筛选不生成任何内容，只读 HTML 上的 `data-cat`，所以关掉 JS 也只是标签点了没反应，
卡片不会消失。筛选时是把卡片从 DOM 里摘掉再按原顺序 append 回来，而不是 `display:none`——
网格里「最后一张铺满整行」用的是 `:nth-child(odd)`，隐藏的元素照样参与计数，会让第二行留出半格空位。

---

## 设计规范速查

| 项目 | 值 |
| --- | --- |
| 背景 | `#F7F3EA` 淡米色 + 三层径向光晕 |
| 主色 | `#6B7AC2` 低饱和蓝紫，深色 `#55639F` |
| 辅色 | 陶土 `#C3A29E` / 雾绿 `#9FB8A8` / 沙黄 `#DCC49B` |
| 正文 | `#454B59`，次要 `#7C8497` |
| 圆角 | 卡片 26px / 按钮胶囊形 |
| 字体 | 系统字体栈，中文优先 PingFang SC / 微软雅黑 |

所有颜色都定义在 `css/style.css` 的 `:root` 里，改配色只需要改那一处。

---

## 待办

- [x] 重构目录结构，数独迁到 `games/sudoku/`
- [x] 游戏大厅首页
- [x] about / privacy / help 三个内容页
- [x] 中英双语（`/en/` + 游戏页 i18n）
- [x] 社交分享图 og-zh / og-en
- [x] 2048（滑动合并、撤销、最高分、断点续玩）
- [x] 扫雷（9×9 / 16×16、首点保护、右键与长按插旗、和弦、最佳用时）
- [x] 分享（导航入口 + 结算卡片入口，每款游戏一张分享图）
- [x] 拼图（3×3 / 4×4、三幅内置 SVG 画面、看原图、最佳用时）
- [x] 消消乐（8×8、三连消除、连锁加分、30 步 1200 分、无解重排）
- [x] 贪吃蛇（17×17、键盘 / 滑动 / 方向键、随长度加速、暂停）
- [x] 大厅分类标签（全部 / 益智 / 街机 / 棋类 / 休闲）+ 待做清单 chip
- [x] 推箱子（简单 / 中等 / 困难三档各 15 关，共 45 关，撤销栈、滑动手势、按住连走、每关最少步数）
- [x] 数字华容道（3×3 / 4×4 / 5×5、点按与滑动、撤销、每档最佳步数）
- [ ] 剩余 26 款，按批次推进，详见 `docs/ROADMAP.md`
  （下一批：俄罗斯方块、打砖块）
- [ ] 申请 AdSense（站点内容充实并运行 1~2 个月后）
