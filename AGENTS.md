# AGENTS.md

给后续会话的工作笔记。先读 [README.md](README.md)：那里说了功能、安装与验收源。

## 一句话

`cortico-world-rssnews` 是 Cortico World 扩展（world id `rss`），给 Coopanion 加 RSS / Atom 订阅：
多源、每源独立节奏、新消息以事件递给她，外加「立即拉取」与「关键词索引」两个工具。

## 结构

| 文件 | 职责 |
|---|---|
| `src/definition.ts` | `WorldDefinition`：默认配置、`create`、自描述（工具 / 事件 / 一句话）。 |
| `src/index.ts` | 包入口，默认导出定义。 |
| `src/config.ts` | `worlds.rss` 配置段、默认值与配置组（只放**新源默认值**这类全局旋钮）。 |
| `src/world.ts` | 世界本体：定时 tick、拉取与去重、两个工具、`webUi` 声明与 `invoke` 数据面。 |
| `src/feed.ts` / `src/xml.ts` | RSS 2.0 / Atom / RDF 解析，自带 XML 解析器（无运行时依赖）。 |
| `src/http.ts` | fetch 包装：超时、体积上限、ETag/304、HTML 误判。 |
| `src/store.ts` | `feeds.json` + `archive.json` 的读写、去重键、消息存档分页。 |
| `src/schedule.ts` | 「现在该拉谁」：间隔、定时时刻、时区、下一次时间。 |
| `src/search.ts` | 关键词匹配（标题/正文/时间）与分页。 |
| `src/model-text.ts` | 给模型的文字：事件正文、两个工具的回执、环境提示词里的源清单。 |
| `src/strings.ts` | 页面文案（中/英）。 |
| `src/webui/client.ts` | 浏览器端两个页签，构建成 `dist/webui.js`。 |

## 别重新验证的事实

- 契约 `cortico.api = 6`，与 Coopanion 0.2.20 一致；工具名必须带 `<短名>_` 前缀，所以是 `rss_fetch` / `rss_index`。
- **`webUi().panels` 就是页签**：宿主把没有 `slot` 的面板渲染成世界页的标签页（`webui-pages/host.ts` 的 `tabbed()`）。
  顺序即显示顺序，`feeds` 在前、`messages` 在后。
- 面板数据面是 `invoke(panel, method, args)`，第一个参数永远是面板 id。写测试时最容易错的就是这里。
- 事件用 `rss.new_items`，`senderKey` 是源的 id；默认 `debounce`，配置 `wakeOnNewItems` 时 `flush`。
- 定时靠 15 秒一拍自检（`TICK_MS`），不维护「下一次时间」表；`nextRunAt()` 只给界面显示用。
- 同一分钟只拉一次：定时那一轮把 `lastSlot = "YYYY-MM-DD HH:MM"` 记进订阅记录。
- **索引工具不写去重记录**：`rss_index` 拉到的条目只进存档，定时推送仍认为它们是新的。
- 12 秒内重复调用 `rss_fetch` 复用上次结果，45 秒内重复索引复用上次下载（翻页时用）。
- 首轮 304 不会走解析；`ETag` / `Last-Modified` 存在订阅记录里。
- 一次拉取最多往存档写 30 条；存档总量受 `worlds.rss.archiveLimit` 约束。

## 踩过的坑

- **改设置不能带 url**：`asFeedInput()` 只有在真的填了地址时才写 `url`，否则 `store.update` 会拿空串校验失败。
- **模板路径不能用 `packageDir`**：装配层给的 `packageDir` 是 **bot 包**（`build/cortico/bots/<bot>`），
  不是扩展包；拿它拼 `src/ENV_PROMPT.md` 会读到不存在的 bot 模板，挂载时直接
  `ENOENT ... bots/<bot>/src/ENV_PROMPT.md`。`resolveEnvPromptPath()` 先用 `import.meta.url` 旁边的文件，
  只有打包跑测试（URL 指向产物）时才退回包目录。
- **改工具 / 事件 / 提示词之后必须 `npm run gen:describe`**，否则 `checkDescribe` 报不一致。
- **改了 `src/webui/client.ts` 必须 `npm run build`**：`dist/webui.js` 是构建产物，不构建就是旧页签。
- 沙箱里 `npm install` 不能跑生命周期脚本（spawn EPERM）：用 `npm install --ignore-scripts --cache .npm-cache`。
  esbuild 的二进制来自 `@esbuild/win32-x64`，跳过脚本照样能用。
- 沙箱里 `vitest` 可能起不来（同样是 spawn）：`npm run test:local` 走 esbuild + `scripts/vitest-shim.ts`，
  那个兼容层只实现本项目用到的断言（`toThrow` / `toEqual` / `not` / `rejects` 等），加新断言时记得补。
- `test:local` 打包时要 `--external:jsdom`：jsdom 是 CJS，打进 ESM 产物后它的动态 `require('node:fs')` 会炸。
- **面板里不要用全局 `document`**：用 `ctx.root.ownerDocument`（测试宿主是 jsdom 文档，没有全局 document）。
- `tests/helpers/mock-panel-host.ts` 故意只实现面板用到的 `WebUi` 成员；面板一旦用了没实现的成员会直接炸出来。
  表格的 `clear(empty)` 之后 `addRow` 会撤掉空态占位——那是宿主的行为，测试断言依赖它。
- 依赖只装在本包内，不要动 Coopanion 的软件目录。

## 本地验证

```bash
npm run typecheck           # Node 侧 + 浏览器侧
npm run test:local          # 沙箱里能跑的那条
npm run build               # dist/webui.js
npm run gen:describe        # describe.json
$env:RSS_E2E='1'; npm run test:local   # 真实源（联网，约 1 分钟）
```

只有 `RSS_E2E=1` 时 `tests/real-feed.test.ts` 才登记用例；默认源是阮一峰博客的 `atom.xml`，
用 `RSS_E2E_URL` 换成自己的源。关键词从首条标题里现取，所以用例不绑定任何站点。
**仓库里不要写自己家里/自建的源地址**：本地验收走 `RSS_E2E_URL` 传，别落进代码。

## 用 Coopanion 自己那份框架验一遍

沙箱里 `tsx` 起不来（esbuild 的同步 worker 要 spawn），所以探针改成 esbuild 打包 + 别名指向安装目录里的框架源码：

```powershell
$app = "$env:LOCALAPPDATA\Programs\Coopanion\resources\app\build\cortico\src"
node_modules\.bin\esbuild.cmd scratch/probe-app-framework.ts --bundle --platform=node --format=esm `
  --alias:cortico=$app --alias:cortico-app=$app `
  --external:electron --external:koffi --external:sherpa-onnx-node --outfile=scratch/.probe.mjs
node scratch/.probe.mjs
```

它做的事：用 Coopanion 的 `parseExtensionManifest` 读我们的 manifest、用它的 `dryMountWorld` 干装载、
用它的 `checkDescribe` 比对 `describe.json`。只读那个目录，不写、不装任何东西。

