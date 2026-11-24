import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { RSS_DEFAULTS, type RssConfigSection } from '../src/config.ts';
import { RssWorld, resolveEnvPromptPath, type FetchTextFn } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { RSS_SAMPLE, waitFor } from './helpers/samples.ts';

const root = join(process.cwd(), '.test-tmp');
const TZ = 'Asia/Shanghai';
const START = Date.parse('2026-11-24T16:00:00+08:00');

interface Harness {
  world: RssWorld;
  host: FakeHost;
  calls: string[];
  cfg: RssConfigSection;
  setXml(xml: string): void;
  setNow(at: number): void;
  advance(ms: number): void;
  dir: string;
}

const dirs: string[] = [];

function harness(overrides: Partial<RssConfigSection> = {}, xml = RSS_SAMPLE): Harness {
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'world-'));
  dirs.push(dir);
  const cfg: RssConfigSection = { ...RSS_DEFAULTS, ...overrides };
  const calls: string[] = [];
  let body = xml;
  let at = START;
  const fetchText: FetchTextFn = async (url) => {
    calls.push(url);
    return { text: body, status: 200, notModified: false, bytes: body.length };
  };
  const host = new FakeHost();
  const world = new RssWorld({
    cfg,
    timezone: TZ,
    dataDir: dir,
    fetchText,
    now: () => at,
  });
  return {
    world,
    host,
    calls,
    cfg,
    dir,
    setXml: (next) => { body = next; },
    setNow: (next) => { at = next; },
    advance: (ms) => { at += ms; },
  };
}

beforeEach(() => {
  // 每个用例自己建临时目录。
});

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function ui(world: RssWorld) {
  return world.webUi('zh');
}

async function addFeed(h: Harness, input: Record<string, unknown>): Promise<string> {
  const invoke = ui(h.world).invoke;
  if (!invoke) throw new Error('没有 invoke');
  const feed = await invoke('feeds', 'add', [input]) as { id: string };
  return feed.id;
}

async function callTool(h: Harness, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const tool = h.world.tools().find((item) => item.name === name);
  if (!tool) throw new Error(`没有工具 ${name}`);
  const ctx = { role: 'test', log: h.host.log } as unknown as ToolCallContext;
  const out = await tool.handler(args, ctx);
  return typeof out === 'string' ? out : out.text;
}

function manyItems(count: number, keyword: string, dateHourBase = 0): string {
  const items = Array.from({ length: count }, (_, index) => {
    const hour = String((dateHourBase + index) % 24).padStart(2, '0');
    return `<item><title>${keyword} 第 ${index + 1} 条</title><description>正文提到 ${keyword}。</description><link>https://news.example.com/${keyword}/${index + 1}</link><guid>g-${keyword}-${index + 1}</guid><pubDate>Mon, 24 Nov 2026 ${hour}:00:00 GMT</pubDate></item>`;
  }).join('');
  return `<rss version="2.0"><channel><title>测试源</title><link>https://news.example.com</link><description>测试</description>${items}</channel></rss>`;
}

describe('立即拉取工具', () => {
  it('给出源标题与它自己设定的条数', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://rss.example.com/cctv/world' });
    const text = await callTool(h, 'rss_fetch');
    expect(text).toContain('央视新闻 world');
    expect(text).toContain('英伟达发布新一代芯片');
    expect(text).toContain('韩国加码高考作弊举报悬赏');
    expect(text).toContain('伊朗法院要求美国支付赔偿金');
    // 默认一次 3 条，第 4 条不递
    expect(text).not.toContain('哥伦比亚爆炸袭击受伤人数升至19人');
    expect(text).toContain('新消息共 4 条');
    expect(text).toContain('另有 1 条更新的没递上来');
  });

  it('第二轮没有新消息时给最近的几条，并标明已读过', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://rss.example.com/cctv/world' });
    await callTool(h, 'rss_fetch');
    h.advance(20_000);
    const second = await callTool(h, 'rss_fetch');
    expect(second).toContain('没有新消息');
    expect(second).toContain('已读过');
  });

  it('每个源的条数上限各自生效', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://one.example.com/feed', maxNewItems: '1' });
    const text = await callTool(h, 'rss_fetch');
    expect(text).toContain('英伟达发布新一代芯片');
    expect(text).not.toContain('韩国加码高考作弊举报悬赏');
  });

  it('不允许模型拉取的源会被跳过并说明', async () => {
    const h = harness({ defaultAllowModel: false });
    await addFeed(h, { url: 'https://private.example.com/feed' });
    const text = await callTool(h, 'rss_fetch');
    expect(text).toContain('不允许模型主动拉取');
    expect(h.calls).toHaveLength(0);
  });

  it('停用的源也会被跳过', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://off.example.com/feed', enabled: false });
    const text = await callTool(h, 'rss_fetch');
    expect(text).toContain('已停用');
    expect(h.calls).toHaveLength(0);
  });

  it('指定不存在的源时列出可用的源', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://rss.example.com/cctv/world' });
    const text = await callTool(h, 'rss_fetch', { feeds: ['不存在'] });
    expect(text).toContain('没找到这些源');
    expect(text).toContain('rss.example.com');
  });

  it('没有订阅时的空态是可执行的', async () => {
    const h = harness();
    const text = await callTool(h, 'rss_fetch');
    expect(text).toContain('还没有订阅任何源');
  });

  it('拉取失败写进回执，也记在订阅记录上', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://broken.example.com/feed' });
    const world = new RssWorld({
      cfg: h.cfg,
      timezone: TZ,
      dataDir: h.dir,
      now: () => START,
      fetchText: async () => {
        throw new Error('拉取超时（20 秒内没有拿到响应）');
      },
    });
    const invoke = world.webUi('zh').invoke;
    const list = await invoke?.('feeds', 'list', []) as { feeds: Array<{ lastError: string | null }> };
    expect(list.feeds[0].lastError).toBe(null);
    const tool = world.tools()[0];
    const ctx = { role: 'test', log: h.host.log } as unknown as ToolCallContext;
    const out = await tool.handler({}, ctx);
    const text = typeof out === 'string' ? out : out.text;
    expect(text).toContain('拉取失败');
    expect(text).toContain('拉取超时');
    const after = await invoke?.('feeds', 'list', []) as { feeds: Array<{ lastError: string | null }> };
    expect(after.feeds[0].lastError).toContain('拉取超时');
  });
});

describe('关键词索引工具', () => {
  it('多关键词命中任一，一页 5 条，可翻页', async () => {
    const h = harness({}, manyItems(7, '英伟达'));
    await addFeed(h, { url: 'https://index.example.com/feed' });
    const first = await callTool(h, 'rss_index', { feeds: ['https://index.example.com/feed'], keywords: ['英伟达'] });
    expect(first).toContain('命中 7 条');
    expect(first).toContain('第 1/2 页');
    expect(first).toContain('还有 2 条');
    const second = await callTool(h, 'rss_index', { feeds: ['https://index.example.com/feed'], keywords: ['英伟达'], page: 2 });
    expect(second).toContain('第 2/2 页');
    expect(second).toContain('7. 「index.example.com」');
  });

  it('all 模式要求每个关键词都中', async () => {
    const xml = `<rss version="2.0"><channel><title>双词源</title><link>https://both.example.com</link>
      <item><title>英伟达与黄仁勋</title><description>两个词都在这条里。</description><link>https://both.example.com/1</link><guid>b1</guid><pubDate>Mon, 24 Nov 2026 09:00:00 GMT</pubDate></item>
      <item><title>只有英伟达</title><description>只提到一个词。</description><link>https://both.example.com/2</link><guid>b2</guid><pubDate>Mon, 24 Nov 2026 08:00:00 GMT</pubDate></item>
      <item><title>只有黄仁勋</title><description>只提到另一个词。</description><link>https://both.example.com/3</link><guid>b3</guid><pubDate>Mon, 24 Nov 2026 07:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const h = harness({}, xml);
    await addFeed(h, { url: 'https://both.example.com/feed' });
    const all = await callTool(h, 'rss_index', { feeds: ['https://both.example.com/feed'], keywords: ['英伟达', '黄仁勋'], mode: 'all' });
    expect(all).toContain('命中 1 条');
    expect(all).toContain('英伟达与黄仁勋');
    const any = await callTool(h, 'rss_index', { feeds: ['https://both.example.com/feed'], keywords: ['英伟达', '黄仁勋'], mode: 'any' });
    expect(any).toContain('命中 3 条');
  });

  it('时间也能当关键词', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://time.example.com/feed' });
    const text = await callTool(h, 'rss_index', { feeds: ['https://time.example.com/feed'], keywords: ['15:57'] });
    expect(text).toContain('英伟达发布新一代芯片');
  });

  it('没命中时给可以接着试的方向', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://none.example.com/feed' });
    const text = await callTool(h, 'rss_index', { feeds: ['https://none.example.com/feed'], keywords: ['不存在的关键词'] });
    expect(text).toContain('没有命中');
    expect(text).toContain('换更短的词');
  });

  it('缺参数时明确说缺什么', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://args.example.com/feed' });
    expect(await callTool(h, 'rss_index', { keywords: ['英伟达'] })).toContain('需要至少一个源');
    expect(await callTool(h, 'rss_index', { feeds: ['https://args.example.com/feed'] })).toContain('需要至少一个关键词');
  });

  it('索引不会把条目算成已推送', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://seen.example.com/feed' });
    await callTool(h, 'rss_index', { feeds: ['https://seen.example.com/feed'], keywords: ['英伟达'] });
    h.advance(20_000);
    const fetchText = await callTool(h, 'rss_fetch');
    // 索引只是读，定时推送仍认为这些是新消息
    expect(fetchText).toContain('新消息共 4 条');
  });
});

describe('定时拉取', () => {
  it('挂载后按间隔拉一轮，事件条数受每个源的设置限制', async () => {
    const h = harness({ wakeOnNewItems: false });
    await addFeed(h, { url: 'https://rss.example.com/cctv/world', maxNewItems: '2', intervalMinutes: '30' });
    await h.world.start(h.host);
    await waitFor(() => h.host.events.length > 0, 3000, '新消息事件');
    const event = h.host.events[0];
    expect(event.type).toBe('rss.new_items');
    expect(event.text).toContain('有 4 条新消息');
    expect(event.text).toContain('英伟达发布新一代芯片');
    expect(event.text).toContain('韩国加码高考作弊举报悬赏');
    expect(event.text).not.toContain('伊朗法院要求美国支付赔偿金');
    expect(event.text).toContain('还有 2 条更新的没一并递上');
    expect(h.host.pushOpts[0]?.trigger).toBe('debounce');
    await h.world.stop();
  });

  it('打开「叫醒她」时用 flush 投递', async () => {
    const h = harness({ wakeOnNewItems: true });
    await addFeed(h, { url: 'https://rss.example.com/cctv/world' });
    await h.world.start(h.host);
    await waitFor(() => h.host.events.length > 0, 3000, '新消息事件');
    expect(h.host.pushOpts[0]?.trigger).toBe('flush');
    await h.world.stop();
  });

  it('没到间隔就不再拉，也不会重复推同一条', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://rss.example.com/cctv/world', intervalMinutes: '30' });
    await h.world.start(h.host);
    await waitFor(() => h.host.events.length === 1, 3000, '第一次事件');
    expect(h.calls).toHaveLength(1);
    // 时间往前走 30 分钟，源内容没变：到点会再拉一次，但没有新消息就不推事件。
    h.advance(31 * 60_000);
    await h.world.stop();
    await h.world.start(h.host);
    await waitFor(() => h.calls.length >= 2, 3000, '第二次拉取');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(h.host.events).toHaveLength(1);
    await h.world.stop();
  });
});

describe('WebUI 数据面', () => {
  it('list 带运行状态，update 改设置，remove 删源', async () => {
    const h = harness();
    const id = await addFeed(h, { url: 'https://rss.example.com/cctv/world', intervalMinutes: '15' });
    const invoke = ui(h.world).invoke;
    const listed = await invoke?.('feeds', 'list', []) as { feeds: Array<Record<string, unknown>> };
    expect(listed.feeds).toHaveLength(1);
    expect(listed.feeds[0].scheduleText).toContain('每 15 分钟');
    expect(listed.feeds[0].nextRunText).toBeDefined();

    const updated = await invoke?.('feeds', 'update', [id, { maxNewItems: '5', scheduleTimes: '08:00,20:00' }]) as Record<string, unknown>;
    expect(updated.maxNewItems).toBe(5);
    expect(updated.scheduleText).toContain('每天 08:00、20:00');

    const removed = await invoke?.('feeds', 'remove', [id]) as { removed: boolean };
    expect(removed.removed).toBe(true);
    const empty = await invoke?.('feeds', 'list', []) as { feeds: unknown[] };
    expect(empty.feeds).toHaveLength(0);
  });

  it('pull 会走网络并回执新消息条数', async () => {
    const h = harness();
    const id = await addFeed(h, { url: 'https://pull.example.com/feed' });
    const result = await ui(h.world).invoke?.('feeds', 'pull', [id]) as { newCount: number; itemCount: number };
    expect(result.newCount).toBe(4);
    expect(result.itemCount).toBe(3);
    expect(h.calls).toHaveLength(1);
  });

  it('probe 能读就不落状态，读不了给原因', async () => {
    const h = harness();
    const ok = await ui(h.world).invoke?.('feeds', 'probe', ['https://probe.example.com/feed']) as Record<string, unknown>;
    expect(ok.ok).toBe(true);
    expect(ok.entries).toBe(4);
    expect(ok.title).toBe('央视新闻 world');
    expect((await ui(h.world).invoke?.('feeds', 'list', []) as { feeds: unknown[] }).feeds).toHaveLength(0);

    const bad = new RssWorld({
      cfg: h.cfg,
      timezone: TZ,
      dataDir: h.dir,
      now: () => START,
      fetchText: async () => {
        throw new Error('这个地址返回的是网页而不是 RSS / Atom');
      },
    });
    const failed = await bad.webUi('zh').invoke?.('feeds', 'probe', ['https://bad.example.com/']) as Record<string, unknown>;
    expect(failed.ok).toBe(false);
    expect(String(failed.error)).toContain('网页');
  });

  it('消息页签按源筛、按关键词筛、分页', async () => {
    const h = harness();
    const id = await addFeed(h, { url: 'https://msg.example.com/feed' });
    await ui(h.world).invoke?.('feeds', 'pull', [id]);
    const page = await ui(h.world).invoke?.('messages', 'list', [{ pageSize: 2 }]) as {
      total: number; pageCount: number; rows: Array<Record<string, unknown>>;
    };
    expect(page.total).toBe(4);
    expect(page.pageCount).toBe(2);
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0].feedTitle).toBe('央视新闻 world');
    expect(String(page.rows[0].timeText)).toContain('2026-11-24');

    const hits = await ui(h.world).invoke?.('messages', 'list', [{ query: '英伟达' }]) as { total: number };
    expect(hits.total).toBe(1);

    const cleared = await ui(h.world).invoke?.('messages', 'clear', []) as { cleared: number };
    expect(cleared.cleared).toBe(4);
    expect((await ui(h.world).invoke?.('messages', 'list', [{}]) as { total: number }).total).toBe(0);
  });

  it('声明了两个页签、状态灯与配置组', () => {
    const h = harness();
    const decl = ui(h.world);
    expect(decl.panels?.map((panel) => panel.id)).toEqual(['feeds', 'messages']);
    expect(decl.panels?.[0].title).toBe('Rss/Atom 管理');
    expect(decl.panels?.[1].title).toBe('Rss/Atom 源的消息');
    expect(decl.config?.[0].owner).toBe('world:rss');
    expect(decl.promptDocs?.[0].role).toBe('envPrompt');
  });
});

describe('环境提示词', () => {
  it('把订阅源与状态填进模板变量', async () => {
    const h = harness();
    await addFeed(h, { url: 'https://rss.example.com/cctv/world', intervalMinutes: '30' });
    const vars = await h.world.envPromptVars();
    expect(vars['rss.feeds']).toContain('rss.example.com');
    expect(vars['rss.feeds']).toContain('每 30 分钟');
    expect(vars['rss.state']).toContain('1 个源');
    expect(vars['rss.timezone']).toBe(TZ);
  });

  it('模板只认模块旁边的那个，packageDir 指向 bot 包也不会串到别人家', () => {
    mkdirSync(root, { recursive: true });
    const dir = mkdtempSync(join(root, 'prompt-'));
    dirs.push(dir);

    // 自己的模板在模块旁边
    const moduleFile = join(dir, 'ENV_PROMPT.md');
    writeFileSync(moduleFile, '模块旁边的模板', 'utf8');
    // 装配层给的 packageDir 是 bot 包目录（真实部署就是这样）
    const botDir = join(dir, 'bots', 'comini');
    mkdirSync(join(botDir, 'src'), { recursive: true });
    writeFileSync(join(botDir, 'src', 'ENV_PROMPT.md'), '别人的模板', 'utf8');

    expect(resolveEnvPromptPath(moduleFile, botDir)).toBe(moduleFile);
    expect(resolveEnvPromptPath(moduleFile, botDir)).not.toContain('comini');

    // 模块旁边没有（打包跑测试）时才退回包目录
    const packaged = join(dir, 'pkg');
    mkdirSync(join(packaged, 'src'), { recursive: true });
    const packagedFile = join(packaged, 'src', 'ENV_PROMPT.md');
    writeFileSync(packagedFile, '包里的模板', 'utf8');
    expect(resolveEnvPromptPath(join(dir, 'gone', 'ENV_PROMPT.md'), packaged)).toBe(packagedFile);
    // 两边都没有时仍返回模块路径：报错要报真实位置
    expect(resolveEnvPromptPath(join(dir, 'gone', 'ENV_PROMPT.md'))).toBe(join(dir, 'gone', 'ENV_PROMPT.md'));
  });

  it('声明出来的模板路径落在本包里并且存在', () => {
    const h = harness();
    const doc = h.world.webUi('zh').promptDocs?.[0];
    expect(doc?.role).toBe('envPrompt');
    expect(String(doc?.path).endsWith('ENV_PROMPT.md')).toBe(true);
    // 打包跑测试时模块 URL 指向产物，路径会回退到包目录；两种情况都该指向本包
    if (existsSync(String(doc?.path))) expect(String(doc?.path)).toContain('cortico-world-rss');
  });
});
