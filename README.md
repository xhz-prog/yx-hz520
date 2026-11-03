# yx-hz520
# 两个人的小小宇宙 · 情侣空间

一个**纯原生**（HTML + CSS + JavaScript，零框架、零依赖、零后端）的浪漫情侣空间单页网站。
所有内容只保存在**当前浏览器的 localStorage** 里：刷新页面、关闭浏览器再打开，纪念日、照片、愿望、留言都还在。

> 双击 `index.html` 即可使用，不需要安装任何东西，也不需要联网。

## 1. 打开方式

- **本机直接打开**：双击 `index.html`（Edge / Chrome / Firefox / Safari 均可）。
- 或在这一目录起一个静态服务器（可选，仅为避免个别浏览器对 `file://` 的限制）：

  ```powershell
  # 任选其一，然后浏览器打开 http://localhost:8000
  python -m http.server 8000
  # 或
  npx serve .
  ```

> 建议固定用同一个浏览器、同一个文件路径打开，数据就一直在。清除浏览器数据 / 换浏览器 / 换电脑 / 无痕模式都不会保留数据。

## 2. 在手机上打开

数据存在**手机浏览器自己的本地存储**里，所以手机打开后就是一台独立的小空间（和电脑上的数据互不影响）。

### 方式一：同 Wi-Fi 局域网访问（最快，需要电脑开着）

1. 电脑和手机连**同一个 Wi-Fi**；
2. 双击本项目里的 `启动手机访问.bat`（需要电脑装了 Node.js），窗口会显示：
   ```
   手机访问：http://192.168.x.x:8000
   ```
3. 手机浏览器输入这个地址，就能用了。建议在浏览器菜单里选「添加到主屏幕」，之后像 App 一样一点就开。
4. 关闭那个黑色窗口 = 停止服务；手机里已经保存的数据不会丢，下次再启动还是同一个地址、同一份数据。

打不开时按顺序排查：

- 手机和电脑是否真的在同一个 Wi-Fi（不要一个连 Wi-Fi、一个连网线到不同网络）；
- 校园网 / 公司网 / 酒店网常开启「设备隔离（AP 隔离）」，设备之间不能互访。此时改用**手机开热点、电脑连手机热点**，再用窗口里显示的地址访问；
- Windows 防火墙弹窗时选「允许访问」（专用网络）；
- 换一个端口：命令行运行 `set PORT=8080 && node serve.mjs`，手机地址改成 `:8080`。

### 方式二：部署到免费静态托管（最稳，手机随时可开）

把整个 `couple-space/` 文件夹上传到任意静态托管，得到一个 https 链接，手机在任何网络下都能打开：

- **Netlify Drop**：打开 <https://app.netlify.com/drop>，把文件夹拖进去；
- **GitHub Pages**：新建仓库上传文件，Settings → Pages 选择分支；
- **Vercel / Cloudflare Pages**：导入文件夹即可。

这种方式不依赖电脑开机，也不受校园网设备隔离影响。注意：换网址 = 换了一份新的本地数据，所以定下来后一直用同一个链接。

### 方式三：把文件传到手机离线打开

Android 可用「文件管理器 + Chrome」打开 `index.html`（部分机型需要允许 Chrome 访问文件）；iPhone 的 Safari 不能直接打开本地 HTML，需要借助支持本地网页的 App。离线打开时数据同样存在该浏览器/App 里，但换 App 就换一份数据，不如方式一、二方便。

> 三种方式的共同点：**数据只存在打开它的那个浏览器里**，不会自动在电脑和手机之间同步。如果需要两边同步，得加后端或做「导出 / 导入备份」功能。

## 3. 功能一览

| 模块 | 能力 |
| --- | --- |
| 纪念日计时 | 第 N 天、精确到秒的「已共同走过 X 天 X 时 X 分 X 秒」、下一个周年倒计时；可编辑双方名字与开始日期 |
| 相册 | 单张上传、多选批量导入、拖拽导入；自动压缩后存入本地；瀑布流画廊；点击放大灯箱（左右切换 / 键盘方向键 / 手机滑动 / Esc 关闭）；单张删除（列表内二次确认，灯箱内直接删） |
| 愿望清单 | 添加、勾选完成、删除；待完成 / 已完成分区分页；勾选时播放柔和庆祝动画 |
| 留言板 | 新增留言（落款 + 内容）、删除、按时间倒序、字数统计、记住上次落款 |
| 全局 | 爱心飘落、分区入场动效、滚动导航高亮、轻提示 toast、本地存储容量异常提示、多标签页同步 |

## 4. 目录结构与模块职责

```
couple-space/
├── index.html              页面结构（分区注释：Hero / 计时 / 相册 / 愿望 / 留言 / 灯箱）
├── serve.mjs               手机访问用的零依赖静态服务器（Node 版）
├── 启动手机访问.bat        双击启动上方的服务器，并在窗口里显示手机访问地址
├── css/
│   ├── base.css            设计变量、重置、排版、骨架、导航、Hero、分区标题、页脚、响应式
│   ├── components.css      按钮、卡片、表单、拖拽区、相册、灯箱、愿望、留言、空状态、toast
│   └── animations.css      所有 @keyframes 与动画类（入场 / 爱心 / 勾选庆祝 / 灯箱 / toast）
└── js/
    ├── utils.js            纯工具：DOM、文本清洗、日期、图片压缩、toast
    ├── store.js            数据层：localStorage 读写、清洗校验、commit + 失败回滚、多标签同步
    ├── timer.js            计时模块：纪念日 / 第 N 天 / 周年倒计时 / 编辑面板
    ├── gallery.js          相册模块：导入、压缩、渲染、灯箱、删除
    ├── wishes.js           愿望模块：添加、勾选、删除、分区分页
    ├── messages.js         留言模块：添加、删除、倒序、字数统计
    ├── hearts.js           爱心飘落 canvas（可整体关闭）
    └── main.js             启动编排、统计数字、入场动画、导航高亮、存储提示
```

> `serve.mjs` 和 `启动手机访问.bat` 只用于手机访问，删掉不影响页面本身的功能。

模块之间只通过两个全局命名空间通信：`window.LoveUtils`（工具）与 `window.LoveStore`（数据）。
每个业务模块都是一个 IIFE，只暴露 `init()`（或 `init/render`），互不引用内部变量。

## 5. 数据是怎么存的

- localStorage key：`loveSpace.v1`；损坏数据的备份 key：`loveSpace.v1.backup`。
- 结构：

  ```js
  {
    version: 1,
    couple: { nameA, nameB, startDate },          // 纪念日
    gallery: [{ id, dataUrl, name, width, height, createdAt }],
    wishes:  [{ id, text, done, createdAt, doneAt, order }],
    messages:[{ id, author, text, createdAt }],
    lastAuthor: "上次留言的落款"
  }
  ```

- **写入规则**：任何修改都必须走 `LoveStore.commit(mutator)`。它会先快照当前状态，再执行修改并整体写入 localStorage；**修改抛错或写入失败（容量不足等）时自动回滚内存状态**，保证「页面上看到的」和「真正存下来的」永远一致，不会出现刷新后内容消失的假成功。
- **读取规则**：启动时 `LoveStore.load()` 会用 `sanitizeState()` 清洗所有数据（丢弃非法图片、截断超长文本、修正非法日期、限制数组上限），旧字段名自动兼容。

## 6. 想改样式 / 动画 / 功能

### 改配色与排版

打开 `css/base.css` 顶部的 `:root`，所有颜色、圆角、阴影、间距、缓动都在这里：

```css
--bg:#fbf5f0; --surface:#fffcf9; --ink:#3d3033;
--rose:#c97f89; --rose-deep:#a95d69; --gold:#c4a079;
--ease-soft: cubic-bezier(.32,.72,0,1);
```

### 改动画

所有动画集中在 `css/animations.css`：

- `.reveal` / `.is-visible`：入场（`main.js` 的 `initReveal()` 控制触发）
- `medallionFloat`、`orbitSpin`、`heartPulse`：Hero 纪念章
- `wishCelebrate`、`heartRise`、`checkPop`：愿望勾选庆祝
- `lightboxFade`、`toastIn/out`：灯箱与轻提示
- 文件末尾的 `@media (prefers-reduced-motion: reduce)` 会关闭全部动画，别删。

### 改业务

- 加一个字段：在 `store.js` 的 `createDefaultState / sanitizeState / snapshotState` 三处同步加即可。
- 加一个模块：新建 `js/xxx.js`，IIFE 里用 `LoveStore.getState()` 读、`LoveStore.commit()` 写、`LoveStore.subscribe()` 订阅重渲染，然后在 `index.html` 底部按顺序引入，`main.js` 的 `boot()` 里 `LoveXxx.init()`。
- 换图片压缩参数：`gallery.js` 里 `Utils.compressImage(file, { maxEdge: 1280, quality: 0.82, targetBytes: 260 * 1024 })`。

## 7. 边界处理

- 图片：读取失败 / 压缩失败自动跳过并提示；`toDataURL` 返回空图（`data:,`）会被判为失败，绝不写入半张照片；超大画布自动降级尺寸与质量；单张原图上限 30MB、一次最多 30 张、相册最多 200 张。
- 存储：写入前整体快照，失败即回滚；容量不足时页面顶部出现提示条，并建议删除照片。
- 输入：所有文本统一走 `Utils.cleanText()`（去控制字符、合并空白、按字符截断、emoji 不截半）；渲染全部用 `textContent`，不做 `innerHTML` 拼接，天然防 XSS。
- 无障碍：灯箱打开时背景 `inert` + Tab 焦点陷阱；按钮均有可读文本 / `aria-label`；`prefers-reduced-motion` 下关闭动画。

## 8. 自测记录

两套测试均针对最终代码运行通过：

| 测试 | 覆盖 | 结果 |
| --- | --- | --- |
| 真实浏览器（Edge + Playwright，`file://` 与 `http://` 双协议） | 上传 / 压缩 / 批量 / 灯箱 / 删除 / 愿望 / 留言 / XSS / 持久化 / Quota 回滚 / 390 与 1440 无横向溢出 / reduced-motion / 无 JS 报错 | **42 / 42 PASS** |
| jsdom 逻辑测试（`qa/`） | 数据清洗、上限、持久化、回滚、计时、渲染、CSS 断点、无障碍等 | **82 / 82 PASS，1 INFO** |

测试产物与说明见 `../qa/`（`report.md`、`report.json`、`README.md`）；真实浏览器截图流程也在该 README 里。

## 9. 注意

- 数据在**本机浏览器**里，换设备不会同步；清除站点数据会一起清空。
- 无痕 / 隐私模式关闭窗口后会清空；部分浏览器会禁用本地存储，此时页面顶部会有提示。
- 想长期备份照片，建议保留原图；页面里的照片是压缩后的版本。
