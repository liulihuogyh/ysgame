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
│   └── i18n.js                # 中英字典（common + 每款游戏一份）与原地切换
├── assets/
│   ├── fonts/                 # 自托管字体（Instrument Sans + Newsreader）
│   ├── og-zh.png              # 中文社交分享图 1200×630
│   └── og-en.png
├── docs/                      # 部署/运营文档归档
└── games/
    ├── sudoku/
    │   ├── index.html         # 中英共用一份，靠 i18n.js 切换
    │   ├── css/style.css      # 数独专属样式（在全局样式之后加载）
    │   ├── js/sudoku.js       # 题目生成与求解
    │   ├── js/game.js         # 游戏逻辑与交互
    │   └── assets/            # 图片、音效
    └── 2048/
        ├── index.html
        ├── css/style.css      # 棋盘、方块配色与动画
        └── js/game2048.js     # 滑动合并、撤销、存档
    └── minesweeper/
        ├── index.html
        ├── css/style.css      # 方格、数字配色、插旗与布雷图标
        └── js/minesweeper.js  # 首点保护、洪水翻开、和弦、计时与存档
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
3. 页面底部按顺序引入三个脚本（顺序不能换）：
   ```html
   <script src="../../js/i18n.js"></script>
   <script src="../../js/common.js"></script>
   <script src="js/<game>.js"></script>
   ```
4. 复制任意一个内容页的 `<header class="ys-nav">` 和 `<footer class="ys-footer">`，
   把相对路径改成 `../../`；`body` 上写 `data-page`、`data-dict="<游戏名>"` 和
   `data-alt-lang-url=""`（空值表示原地切换语言，`data-dict` 用来挑字典）。
5. 界面文案一律写 `data-i18n="键名"`，并在 `js/i18n.js` 的 `dicts.<游戏名>` 里加中英两版；
   JS 里给用户看的文字用 `I18N.t('键名')` 取，不要硬编码中文。
   导航、页脚、广告位这类全站文案在 `common` 里，各游戏不用重复写。
6. **两个首页都要加卡片**：
   - `index.html` 里把 `<div class="game-card game-card--locked">` 改成
     `<a class="game-card" href="games/<game-name>/index.html">`，`badge` 改成「已上线」；
   - `en/index.html` 里做同样的改动，链接写 `../games/<game-name>/index.html?lang=en`。
7. 两边的「N 款游戏，现在能玩 M 款 / M of N ready」数字要一起改。

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
- [ ] 拼图
- [ ] 消消乐
- [ ] 贪吃蛇
- [ ] 申请 AdSense（站点内容充实并运行 1~2 个月后）
