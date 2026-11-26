/**
 * 低消耗模式与 `rss_read`：只递编号、来源、时间、标题，正文靠编号补读。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { RSS_DEFAULTS, type RssConfigSection } from '../src/config.ts';
import { parseSeq, RssWorld } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { RSS_SAMPLE, waitFor } from './helpers/samples.ts';

const root = join(process.cwd(), '.test-tmp');
const TZ = 'Asia/Shanghai';
const START = Date.parse('2026-11-24T16:00:00+08:00');
const dirs: string[] = [];

interface Harness {
  world: RssWorld;
  host: FakeHost;
  cfg: RssConfigSection;
}

function harness(overrides: Partial<RssConfigSection> = {}): Harness {
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'lowcost-'));
  dirs.push(dir);
  const cfg: RssConfigSection = { ...RSS_DEFAULTS, ...overrides };
  const host = new FakeHost();
  const world = new RssWorld({
    cfg,
    timezone: TZ,
    dataDir: dir,
    fetchText: async () => ({ text: RSS_SAMPLE, status: 200, notModified: false, bytes: RSS_SAMPLE.length }),
    now: () => START,
  });
  return { world, host, cfg };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

async function callTool(h: Harness, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const tool = h.world.tools().find((item) => item.name === name);
  if (!tool) throw new Error(`没有工具 ${name}`);
  const ctx = { role: 'test', log: h.host.log } as unknown as ToolCallContext;
  const out = await tool.handler(args, ctx);
  return typeof out === 'string' ? out : out.text;
}

function invoke(world: RssWorld) {
  const fn = world.webUi('zh').invoke;
  if (!fn) throw new Error('没有 invoke');
  return fn;
}

async function addFeed(h: Harness, input: Record<string, unknown> = {}): Promise<string> {
  const feed = await invoke(h.world)('feeds', 'add', [{ url: 'https://rss.example.com/cctv/world', ...input }]) as { id: string };
  return feed.id;
}

describe('编号解析', () => {
  it('#12、12、带空格的都认，乱七八糟的返回 null', () => {
    expect(parseSeq('#12')).toBe(12);
    expect(parseSeq('12')).toBe(12);
    expect(parseSeq('＃7')).toBe(7);
    expect(parseSeq('  #3 ')).toBe(3);
    expect(parseSeq(5)).toBe(5);
    expect(parseSeq(0)).toBe(null);
    expect(parseSeq(-2)).toBe(null);
    expect(parseSeq('abc')).toBe(null);
    expect(parseSeq('1.5')).toBe(null);
    expect(parseSeq(null)).toBe(null);
  });
});

describe('低消耗模式', () => {
  it('立即拉取只给编号、时间、标题，不附正文与链接', async () => {
    const h = harness({ lowCost: true });
    await addFeed(h);
    const text = await callTool(h, 'rss_fetch');
    expect(text).toContain('#1');
    expect(text).toContain('英伟达发布新一代芯片');
    expect(text).toContain('2026-11-24 15:57');
    // 正文与链接都不该出现
    expect(text).not.toContain('黄仁勋在发布会上介绍了新架构');
    expect(text).not.toContain('https://news.example.com/a1');
    expect(text).toContain('低消耗模式');
    expect(text).toContain('rss_read');
  });

  it('事件也只给编号与标题', async () => {
    const h = harness({ lowCost: true });
    await addFeed(h, { intervalMinutes: '30' });
    await h.world.start(h.host);
    await waitFor(() => h.host.events.length > 0, 3000, '新消息事件');
    const text = h.host.events[0].text;
    expect(text).toContain('#1');
    expect(text).toContain('英伟达发布新一代芯片');
    expect(text).not.toContain('黄仁勋在发布会上介绍了新架构');
    expect(text).toContain('rss_read');
    await h.world.stop();
  });

  it('索引命中只给标题，同样带编号', async () => {
    const h = harness({ lowCost: true });
    await addFeed(h);
    const text = await callTool(h, 'rss_index', { feeds: ['https://rss.example.com/cctv/world'], keywords: ['英伟达'] });
    expect(text).toContain('命中');
    expect(text).toContain('英伟达发布新一代芯片');
    expect(text).not.toContain('黄仁勋在发布会上介绍了新架构');
    expect(text).toContain('rss_read');
  });

  it('关掉低消耗时正文照旧给', async () => {
    const h = harness({ lowCost: false });
    await addFeed(h);
    const text = await callTool(h, 'rss_fetch');
    expect(text).toContain('黄仁勋在发布会上介绍了新架构');
    expect(text).toContain('https://news.example.com/a1');
  });

  it('环境提示词里说明这个开关开着', async () => {
    const h = harness({ lowCost: true });
    await addFeed(h);
    const vars = await h.world.envPromptVars();
    expect(vars['rss.state']).toContain('低消耗模式开着');
  });
});

describe('按编号读全文', () => {
  it('读到完整正文、来源、时间与链接', async () => {
    const h = harness({ lowCost: true });
    await addFeed(h);
    const fetched = await callTool(h, 'rss_fetch');
    const tag = fetched.match(/#\d+/)?.[0] ?? '';
    expect(tag).not.toBe('');

    const text = await callTool(h, 'rss_read', { ids: [tag] });
    expect(text).toContain('读了 1 条');
    expect(text).toContain(tag);
    expect(text).toContain('英伟达发布新一代芯片');
    expect(text).toContain('黄仁勋在发布会上介绍了新架构');
    expect(text).toContain('https://news.example.com/a1');
    expect(text).toContain('央视新闻 world');
  });

  it('一次读多条，也可以只写数字', async () => {
    const h = harness();
    await addFeed(h);
    await callTool(h, 'rss_fetch');
    const text = await callTool(h, 'rss_read', { ids: ['1', 2, '#3'] });
    expect(text).toContain('读了 3 条');
    expect(text).toContain('英伟达发布新一代芯片');
    expect(text).toContain('韩国加码高考作弊举报悬赏');
    expect(text).toContain('伊朗法院要求美国支付赔偿金');
  });

  it('编号不存在时说明范围，不当作崩溃', async () => {
    const h = harness();
    await addFeed(h);
    await callTool(h, 'rss_fetch');
    const text = await callTool(h, 'rss_read', { ids: ['#999'] });
    expect(text).toContain('#999');
    expect(text).toContain('存档里');
    expect(text).toContain('#1');
  });

  it('认不出的输入单独列出来', async () => {
    const h = harness();
    await addFeed(h);
    await callTool(h, 'rss_fetch');
    const text = await callTool(h, 'rss_read', { ids: ['第一条', '#1'] });
    expect(text).toContain('读了 1 条');
    expect(text).toContain('认不出');
    expect(text).toContain('第一条');
  });

  it('空存档与缺参数都有明确回执', async () => {
    const h = harness();
    expect(await callTool(h, 'rss_read', { ids: ['#1'] })).toContain('存档现在是空的');
    expect(await callTool(h, 'rss_read', {})).toContain('需要至少一个编号');
  });

  it('一次最多读 10 条，多的提示分两次', async () => {
    const h = harness();
    await addFeed(h);
    await callTool(h, 'rss_fetch');
    const ids = Array.from({ length: 12 }, (_, index) => `#${index + 1}`);
    const text = await callTool(h, 'rss_read', { ids });
    expect(text).toContain('这次只要前 10 条');
    expect(text).toContain('没读');
  });

  it('编号与拉取时展示的一致，跨拉取不变', async () => {
    const h = harness({ lowCost: true });
    await addFeed(h);
    const first = await callTool(h, 'rss_fetch');
    const firstTags = [...first.matchAll(/#(\d+) ·/g)].map((match) => match[1]);
    expect(firstTags.length).toBeGreaterThan(0);
    // 再拉一次（没有新消息，给最近的几条）：编号还是那些
    const again = await callTool(h, 'rss_fetch');
    const againTags = [...again.matchAll(/#(\d+) ·/g)].map((match) => match[1]);
    expect(againTags[0]).toBe(firstTags[0]);
  });
});
