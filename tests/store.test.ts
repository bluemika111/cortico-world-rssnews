import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FeedStore } from '../src/store.ts';
import type { FeedDefaults } from '../src/types.ts';

const defaults: FeedDefaults = { intervalMinutes: 30, timeoutMs: 20_000, maxNewItems: 3, allowModel: true };
const root = join(process.cwd(), '.test-tmp');

let dir: string;
let store: FeedStore;

beforeEach(() => {
  mkdirSync(root, { recursive: true });
  dir = mkdtempSync(join(root, 'store-'));
  store = new FeedStore({ dir, archiveLimit: () => 100 });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('订阅源', () => {
  it('添加时用默认值，标题留空就用主机名', () => {
    const feed = store.add({ url: 'https://rss.example.com/cctv/world' }, defaults);
    expect(feed.id.startsWith('f')).toBe(true);
    expect(feed.title).toBe('rss.example.com');
    expect(feed.intervalMinutes).toBe(30);
    expect(feed.timeoutMs).toBe(20_000);
    expect(feed.maxNewItems).toBe(3);
    expect(feed.allowModel).toBe(true);
    expect(feed.enabled).toBe(true);
  });

  it('每个源自己的设置会被夹到合法范围', () => {
    const feed = store.add({
      url: 'https://a.example.com/feed',
      intervalMinutes: '5',
      scheduleTimes: '08:00, 20:00',
      timeoutMs: '35000',
      maxNewItems: '2',
      allowModel: false,
    }, defaults);
    expect(feed.intervalMinutes).toBe(5);
    expect(feed.scheduleTimes).toEqual(['08:00', '20:00']);
    expect(feed.timeoutMs).toBe(35_000);
    expect(feed.maxNewItems).toBe(2);
    expect(feed.allowModel).toBe(false);
  });

  it('拒绝非 http(s) 与重复地址', () => {
    expect(() => store.add({ url: 'ftp://x/y' }, defaults)).toThrow();
    store.add({ url: 'https://dup.example.com/feed' }, defaults);
    expect(() => store.add({ url: 'https://dup.example.com/feed/' }, defaults)).toThrow();
  });

  it('按 id / 网址 / 名字都能找到', () => {
    const feed = store.add({ url: 'https://find.example.com/feed', title: '找得到' }, defaults);
    expect(store.find(feed.id)?.id).toBe(feed.id);
    expect(store.find(feed.url)?.id).toBe(feed.id);
    expect(store.find('找得到')?.id).toBe(feed.id);
    expect(store.resolve([feed.id, 'nope']).missing).toEqual(['nope']);
  });

  it('修改与删除', () => {
    const feed = store.add({ url: 'https://edit.example.com/feed' }, defaults);
    const updated = store.update(feed.id, { title: '新名字', intervalMinutes: '0', enabled: false });
    expect(updated?.title).toBe('新名字');
    expect(updated?.intervalMinutes).toBe(0);
    expect(updated?.enabled).toBe(false);
    expect(store.remove(feed.id)).toBe(true);
    expect(store.remove(feed.id)).toBe(false);
    expect(store.list()).toHaveLength(0);
  });
});

describe('落盘', () => {
  it('重启后订阅与去重记录还在', () => {
    const feed = store.add({ url: 'https://persist.example.com/feed', title: '持久' }, defaults);
    store.markSeen(feed.id, ['a', 'b']);
    store.update(feed.id, { lastFetchedAt: '2026-11-24T08:00:00.000Z' });

    const again = new FeedStore({ dir, archiveLimit: () => 100 });
    again.load();
    const reloaded = again.list()[0];
    expect(reloaded.title).toBe('持久');
    expect(reloaded.seen).toEqual(['a', 'b']);
    expect(reloaded.lastFetchedAt).toBe('2026-11-24T08:00:00.000Z');
    expect(JSON.parse(readFileSync(join(dir, 'feeds.json'), 'utf8')).feeds).toHaveLength(1);
  });

  it('没有数据目录时只在内存里，不炸', () => {
    const memory = new FeedStore({ dir: null, archiveLimit: () => 100 });
    const feed = memory.add({ url: 'https://memory.example.com/feed' }, defaults);
    expect(memory.list()).toHaveLength(1);
    memory.markSeen(feed.id, ['x']);
    expect(memory.get(feed.id)?.seen).toEqual(['x']);
  });

  it('去重键超过上限时裁掉最老的', () => {
    const feed = store.add({ url: 'https://seen.example.com/feed' }, defaults);
    store.markSeen(feed.id, Array.from({ length: 450 }, (_, index) => `k${index}`));
    const seen = store.get(feed.id)?.seen ?? [];
    expect(seen).toHaveLength(400);
    expect(seen[0]).toBe('k50');
  });
});

describe('消息编号', () => {
  it('每条新消息拿到递增的编号，重推不换号', () => {
    const feed = store.add({ url: 'https://seq.example.com/feed' }, defaults);
    const first = store.pushArchive([
      { feedId: feed.id, entryId: 'e1', title: 'A', link: '', summary: '', body: '', fetchedAt: '2026-11-24T01:00:00.000Z' },
      { feedId: feed.id, entryId: 'e2', title: 'B', link: '', summary: '', body: '', fetchedAt: '2026-11-24T02:00:00.000Z' },
    ]);
    expect(first.map((row) => row.seq)).toEqual([1, 2]);
    expect(store.bySeq(1)?.entryId).toBe('e1');

    // 同一条再来一次：不重复、不换号
    const again = store.pushArchive([
      { feedId: feed.id, entryId: 'e1', title: 'A', link: '', summary: '', body: '', fetchedAt: '2026-11-24T03:00:00.000Z' },
    ]);
    expect(again).toHaveLength(0);
    expect(store.bySeq(1)?.entryId).toBe('e1');

    const third = store.pushArchive([
      { feedId: feed.id, entryId: 'e3', title: 'C', link: '', summary: '', body: '', fetchedAt: '2026-11-24T04:00:00.000Z' },
    ]);
    expect(third[0].seq).toBe(3);
    expect(store.seqRange()).toEqual({ min: 1, max: 3 });
  });

  it('编号跨重启保持，清档也不回收', () => {
    const feed = store.add({ url: 'https://seq2.example.com/feed' }, defaults);
    store.pushArchive([
      { feedId: feed.id, entryId: 'e1', title: 'A', link: '', summary: '', body: '', fetchedAt: '2026-11-24T01:00:00.000Z' },
    ]);
    store.clearArchive();
    const again = new FeedStore({ dir, archiveLimit: () => 100 });
    again.load();
    expect(again.seqRange()).toBe(null);
    const after = again.pushArchive([
      { feedId: feed.id, entryId: 'e2', title: 'B', link: '', summary: '', body: '', fetchedAt: '2026-11-24T02:00:00.000Z' },
    ]);
    // 旧编号 1 已经不在存档里，但新号继续往后走，不回头复用
    expect(after[0].seq).toBe(2);
  });

  it('老存档没有编号时按时间补，且只补一次', () => {
    const legacyDir = mkdtempSync(join(root, 'legacy-'));
    writeFileSync(join(legacyDir, 'archive.json'), JSON.stringify({
      version: 1,
      entries: [
        { feedId: 'f1', entryId: 'new', title: '新', link: '', summary: '', body: '', publishedAt: '2026-11-24T05:00:00.000Z', fetchedAt: '2026-11-24T05:00:00.000Z' },
        { feedId: 'f1', entryId: 'old', title: '旧', link: '', summary: '', body: '', publishedAt: '2026-11-24T01:00:00.000Z', fetchedAt: '2026-11-24T01:00:00.000Z' },
      ],
    }), 'utf8');

    const legacy = new FeedStore({ dir: legacyDir, archiveLimit: () => 100 });
    legacy.load();
    // 旧的号更小
    expect(legacy.bySeq(1)?.entryId).toBe('old');
    expect(legacy.bySeq(2)?.entryId).toBe('new');

    const reopened = new FeedStore({ dir: legacyDir, archiveLimit: () => 100 });
    reopened.load();
    expect(reopened.bySeq(1)?.entryId).toBe('old');

    const next = reopened.pushArchive([
      { feedId: 'f1', entryId: 'newest', title: '最新', link: '', summary: '', body: '', fetchedAt: '2026-11-24T06:00:00.000Z' },
    ]);
    expect(next[0].seq).toBe(3);

    const saved = JSON.parse(readFileSync(join(legacyDir, 'archive.json'), 'utf8')) as { nextSeq?: number };
    expect(saved.nextSeq).toBe(3);
    rmSync(legacyDir, { recursive: true, force: true });
  });
});

describe('消息存档', () => {
  it('新的在前、同一条不重复、可筛可翻页', () => {
    const feed = store.add({ url: 'https://arch.example.com/feed' }, defaults);
    store.pushArchive([
      { feedId: feed.id, entryId: 'e1', title: '英伟达一', link: 'l1', summary: 's1', body: 'b1', publishedAt: '2026-11-24T01:00:00.000Z', fetchedAt: '2026-11-24T02:00:00.000Z' },
      { feedId: feed.id, entryId: 'e2', title: '黄仁勋二', link: 'l2', summary: 's2', body: 'b2', publishedAt: '2026-11-24T03:00:00.000Z', fetchedAt: '2026-11-24T04:00:00.000Z' },
    ]);
    store.pushArchive([
      { feedId: feed.id, entryId: 'e1', title: '英伟达一', link: 'l1', summary: 's1', body: 'b1', publishedAt: '2026-11-24T01:00:00.000Z', fetchedAt: '2026-11-24T05:00:00.000Z' },
    ]);

    const all = store.archive();
    expect(all).toHaveLength(2);
    expect(all[0].entryId).toBe('e2');

    const filtered = store.archivePage({ query: '英伟达' });
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0].entryId).toBe('e1');

    const paged = store.archivePage({ pageSize: 1, page: 2 });
    expect(paged.page).toBe(2);
    expect(paged.pageCount).toBe(2);
    expect(paged.rows).toHaveLength(1);
  });

  it('删源时把它的消息一起带走，清空只清消息', () => {
    const one = store.add({ url: 'https://one.example.com/feed' }, defaults);
    const two = store.add({ url: 'https://two.example.com/feed' }, defaults);
    store.pushArchive([
      { feedId: one.id, entryId: 'a', title: 'A', link: '', summary: '', body: '', fetchedAt: '2026-11-24T01:00:00.000Z' },
      { feedId: two.id, entryId: 'b', title: 'B', link: '', summary: '', body: '', fetchedAt: '2026-11-24T01:00:00.000Z' },
    ]);
    store.remove(one.id);
    expect(store.archive()).toHaveLength(1);
    expect(store.clearArchive()).toBe(1);
    expect(store.archive()).toHaveLength(0);
  });

  it('存档量受上限约束', () => {
    const small = new FeedStore({ dir: mkdtempSync(join(root, 'limit-')), archiveLimit: () => 50 });
    const feed = small.add({ url: 'https://limit.example.com/feed' }, defaults);
    small.pushArchive(Array.from({ length: 80 }, (_, index) => ({
      feedId: feed.id,
      entryId: `e${index}`,
      title: `T${index}`,
      link: '',
      summary: '',
      body: '',
      publishedAt: `2026-11-24T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
      fetchedAt: '2026-11-24T00:00:00.000Z',
    })));
    expect(small.archive().length).toBeLessThanOrEqual(50);
  });
});
