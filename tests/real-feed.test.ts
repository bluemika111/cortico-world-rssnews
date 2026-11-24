/**
 * 真实源验收：默认跳过，用 `RSS_E2E=1` 打开。
 * 默认跑一个公开博客源；想验自己的源就传 `RSS_E2E_URL=https://…`。
 * 搜什么词是从首条标题里现取的，所以对任何源都成立。
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { RSS_DEFAULTS } from '../src/config.ts';
import { parseFeed } from '../src/feed.ts';
import { fetchFeedText } from '../src/http.ts';
import { RssWorld } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';

const FEED_URL = process.env.RSS_E2E_URL ?? 'https://www.ruanyifeng.com/blog/atom.xml';
const RUN = process.env.RSS_E2E === '1';
const suite = RUN ? describe : describe.skip;

async function toolText(world: RssWorld, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const tool = world.tools().find((item) => item.name === name);
  if (!tool) throw new Error(`没有工具 ${name}`);
  const host = new FakeHost();
  const out = await tool.handler(args, { role: 'e2e', log: host.log } as unknown as ToolCallContext);
  return typeof out === 'string' ? out : out.text;
}

/** 从标题里挑一个能搜到的词：中文取前两个字，英文取第一个够长的单词。 */
export function pickKeyword(title: string): string {
  const cjk = title.match(/[\u3400-\u9fff]{2,}/);
  if (cjk) return cjk[0].slice(0, 2);
  const word = title.split(/[^A-Za-z0-9]+/).find((part) => part.length >= 4);
  return word ?? title.slice(0, 4);
}

suite('真实源', () => {
  it('能拉下来、能解析出条目', async () => {
    const response = await fetchFeedText(FEED_URL, { timeoutMs: 30_000 });
    expect(response.status).toBe(200);
    const feed = parseFeed(response.text);
    expect(feed.entries.length).toBeGreaterThan(0);
    expect(feed.title.length).toBeGreaterThan(0);
    expect(feed.entries[0].title.length).toBeGreaterThan(0);
    console.log(`[e2e] ${feed.title}：${feed.entries.length} 条，首条「${feed.entries[0].title}」`);
  }, 60_000);

  it('立即拉取与关键词索引都真的能用', async () => {
    mkdirSync(join(process.cwd(), '.test-tmp'), { recursive: true });
    const dir = mkdtempSync(join(process.cwd(), '.test-tmp', 'e2e-'));
    try {
      const world = new RssWorld({
        cfg: { ...RSS_DEFAULTS, enabled: true },
        timezone: 'Asia/Shanghai',
        dataDir: dir,
      });
      const invoke = world.webUi('zh').invoke;
      const feed = await invoke?.('feeds', 'add', [{
        url: FEED_URL,
        maxNewItems: '3',
        timeoutMs: '45000',
      }]) as { id: string };
      expect(feed.id.length).toBeGreaterThan(0);

      const fetched = await toolText(world, 'rss_fetch');
      console.log(`[e2e] rss_fetch:\n${fetched.slice(0, 700)}`);
      expect(fetched).toContain('新消息共');

      // 关键词从这次拉到的条目里取，换个源也照样成立。
      const firstLine = fetched.split('\n').find((line) => /^\s*·\s*\d+\./.test(line)) ?? '';
      const keyword = pickKeyword(firstLine.replace(/^\s*·\s*\d+\.\s*/, '').split('·').pop() ?? '');
      expect(keyword.length).toBeGreaterThan(0);
      console.log(`[e2e] 用「${keyword}」做索引`);

      const indexed = await toolText(world, 'rss_index', { feeds: [FEED_URL], keywords: [keyword] });
      console.log(`[e2e] rss_index:\n${indexed.slice(0, 900)}`);
      expect(indexed).toContain('命中');

      const page2 = await toolText(world, 'rss_index', { feeds: [FEED_URL], keywords: [keyword], page: 2 });
      expect(page2).toContain('页');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
