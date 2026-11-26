# cortico-world-rssnews

给 Coopanion（Cortico）加一份 **RSS 新闻**：订阅任意多个 RSS / Atom 源，每个源按自己的节奏被拉下来，新消息以
事件递给她；她也可以按需拉取，或者按关键词翻订阅源。

仓库：<https://github.com/bluemika111/cortico-world-rssnews>（MIT）

世界页有两个页签：

| 页签 | 内容 |
|---|---|
| **Rss/Atom 管理** | 订阅源清单与增删改：地址、名称、间隔、定时时刻、超时、一次最多几条、是否启用、允不允许模型拉取；每行还能立即拉取、停用、删除。 |
| **Rss/Atom 源的消息** | 已经拉到的条目，从新到旧，每行带模型用的同一个编号；可按源筛、按关键词搜、翻页，点标题看正文与原文链接。 |

## 每个源自己的设置

| 设置 | 默认 | 说明 |
|---|---|---|
| 订阅地址 | — | 只支持 `http` / `https`。同一个地址不会重复订阅。 |
| 名称 | 源标题 | 首轮拉到源之后自动换成源自己的标题（`<channel><title>` / `<feed><title>`）；手填过就不动。 |
| 每隔多久拉一次 | 30 分钟 | 0 表示不按间隔拉。 |
| 定时拉取时间 | 空 | `HH:MM` 列表，按部署时区，每天在这些时刻各拉一次。与间隔同时开着时，谁先到算谁。 |
| 拉取超时 | 20 秒 | 单源网络超时，上限 300 秒。源慢就调大。 |
| 一次最多递几条 | 3 | 到点抓到的**新**消息最多递这么多条；超出的这次不递，也不追着补发。 |
| 是否启用 | 开 | 关掉后定时与手动都不拉。 |
| 允许模型主动拉取 | 开 | 关掉后她的两个工具都不会碰这个源。 |

新加订阅源时的默认值来自配置组（`worlds.rss.default*`），加完可以逐个改。

## 低消耗模式

配置组里的 `worlds.rss.lowCost`（默认关）。开着的时候，事件与两个工具**只给编号、来源、时间、标题**，
正文和链接都不给——要读哪条，她自己拿编号调 `rss_read`。这是为了不把一大段新闻正文塞进每一轮上下文。

```
[RSS] 央视新闻 world 有 3 条新消息
· 新 · #12 · 2026-11-24 15:57 · 英伟达发布新一代芯片
· 新 · #11 · 2026-11-24 14:10 · 韩国加码高考作弊举报悬赏
```

她接着说 `rss_read {"ids":["#12"]}` 就能拿到那条的全文。编号是**存档里稳定递增**的：同一条消息在事件、
`rss_fetch`、`rss_index` 里用的是同一个号，下一轮对话也还是它；编号只增不减，清档也不回收，
所以旧号不会指到别的消息上。消息页签每一行也显示同一个编号，你在界面上能对得上。

开关关着时行为不变（正文按「递给模型的正文长度」截断，照旧带链接）。`rss_read` 两种模式下都能用。

## 她那边看到什么

**事件** `rss.new_items`：某个源到点拉到新消息时推一条，正文是编号、标题、时间（不省上下文时还带摘要和链接）。
是事实，不是命令；要不要开口由她决定。默认攒到下次活动再给（`debounce`），打开「新消息叫醒她」后立即投递（`flush`）。

**工具**

1. `rss_fetch` —— 立即拉取。不带参数就拉所有「启用且允许模型拉取」的源；`feeds` 给名字 / id / 网址可以只拉指定几个。
   每个源给到它自己的「一次最多几条」，新消息优先；这一轮没有新的，就给最近的几条并标明已读过。
   同一个源 12 秒内连着调用会复用上一次的结果。
2. `rss_index` —— 关键词索引。`feeds`（至少一个）+ `keywords`（至少一个，分别匹配标题、正文、时间；默认命中任一，
   `mode: "all"` 要求全中）+ `page`。每个源翻最新 50 条，命中结果按时间从新到旧排，一页最多 5 条，回执末尾说还有几条。
3. `rss_read` —— 按编号读全文。`{"ids": ["#12", 13]}`，一次最多 10 条，纯读存档不走网络。
   编号认不出、不在存档里、被上限挤掉，都会在回执里说明并给出当前编号范围。

索引只读：它拉到的条目进消息存档，但不记为「已推送」，所以定时推送照样会把它们递过来。

## 安装

先拿到这个包，两种来源任选：

```bash
npm i cortico-world-rssnews          # 已发布到 npm（包页：https://www.npmjs.com/package/cortico-world-rssnews）
git clone https://github.com/bluemika111/cortico-world-rssnews   # 仓库里带着构建好的 dist/webui.js，clone 即可用
```

Coopanion 的扩展装在部署的 `extensions/` 里。三种方式：

**A. 用界面装（推荐）**：Coopanion → 扩展 →「从本机目录安装」→ 选 clone 下来的目录；
npm 上审核通过后也可以直接在扩展页「从 npm 安装」搜 `cortico-world-rssnews`。
Coopanion 会自己把它登记进扩展目录并装好依赖，不需要在它的软件目录里手动跑安装脚本。

**B. 手工登记**（本地开发就这么用）：

```jsonc
// <部署>/extensions/package.json
{
  "dependencies": {
    "cortico-world-rssnews": "link:<clone 下来的目录>" // 本地开发
    // "cortico-world-rssnews": "^0.1.0"               // 从 npm 装
  }
}
```

在 `extensions/` 里跑一次它的包管理器安装，重启 Coopanion，然后在设置 → World 里打开「RSS 新闻」。
`worlds.rss.enabled` 默认是 `false`，由部署决定什么时候启用。

首次挂载会立刻按节奏走一拍：间隔到点、或者从没拉过的源会马上拉一轮，之后每 15 秒检查一次谁到点了。

## 数据放在哪

部署的 `data/`（`WorldContext.dataDir`）下：

- `feeds.json`：订阅设置与每个源最近 400 个去重键。
- `archive.json`：消息存档，最多 `worlds.rss.archiveLimit` 条（默认 500），新的在前。

两个文件都是「写临时文件再改名」，断电不会留下半个 JSON。

## 验收用的源

`RSS_E2E=1 npm test` 默认跑 <https://www.ruanyifeng.com/blog/atom.xml>（Atom，条目少而稳）；想验自己的源就传地址：

```bash
# PowerShell
$env:RSS_E2E_URL='https://你的源'; $env:RSS_E2E='1'; npm test
# bash
RSS_E2E_URL=https://你的源 RSS_E2E=1 npm test
```

用例不绑定任何站点：关键词是从首条标题里现取的，拉取、索引、翻页都真的走网络。

慢源（单次十几秒）要给每个源把超时调到 30 秒；「一次最多递几条」设 3 时第一轮只递 3 条，
回执里会说明还有多少条没一并递上，剩下的用 `rss_index` 翻。

## 已知边界

- 只解析 RSS 2.0 / Atom / RSS 1.0（RDF）。返回 HTML 页面的地址（反爬、要登录）会明确报「返回的是网页而不是 RSS / Atom」。
- 正文是「去标签 + 解实体」后的纯文本，图片与富文本格式不保留，链接单独一行。
- 一次拉取最多往存档里写 30 条（新源第一轮可能几十条），更早的条目仍在源里，用 `rss_index` 现翻。
- 定时拉取不补漏：机器休眠期间错过的时刻不会在醒来后逐个补拉，下一拍按间隔继续。
- 去重按 `guid` / `id`，其次链接；两者都没有时用「标题 + 时间」。同一条消息同一个源只推一次。

## 开发

依赖全部装在本包内（不要装到 Coopanion 的软件目录）：

```bash
npm install
# 受限环境（不允许跑安装脚本）时：npm install --ignore-scripts --cache .npm-cache
# esbuild 的平台二进制来自 @esbuild/win32-x64，跳过脚本也能用。
```

```bash
npm run build        # dist/webui.js（浏览器端两个页签）
npm run typecheck    # Node 侧 + 浏览器侧
npm test             # vitest
npm run test:local   # 沙箱里 vitest 起不来时的退路：esbuild 打包 + 极简兼容层
npm run gen:describe # 重新生成 describe.json（改工具 / 事件 / 提示词之后必跑）
RSS_E2E=1 npm test   # 加上真实源验收（会联网）
```

`tests/webui.test.ts` 用 jsdom 造 DOM、用一个只实现面板真正用到的那部分 `WebUi` 的假宿主，把两个页签真的挂起来，
`invoke` 直接转给 World，所以按钮点下去走的是真数据面。`jsdom` 只是开发依赖，运行时不需要它。

改了 `src/webui/client.ts` 之后必须重新 `build`，否则页签还是旧的 `dist/webui.js`。

## 许可

MIT，与 Coopanion / Cortico 一致。
