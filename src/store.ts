/**
 * 订阅源的落盘：`feeds.json`（订阅与去重记录）和 `archive.json`（给人看、也给索引工具翻的消息）。
 * 两个文件都小，写的时候先写临时文件再改名，避免断电留下半个 JSON。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shortHash } from './text.ts';
import { normalizeInterval, normalizeMaxNewItems, normalizeTimeout, parseScheduleTimes } from './schedule.ts';
import type { ArchiveEntry, FeedDefaults, FeedInput, FeedRecord } from './types.ts';

const FEEDS_FILE = 'feeds.json';
const ARCHIVE_FILE = 'archive.json';
const FEEDS_VERSION = 1;
const ARCHIVE_VERSION = 1;
/** 每个源记住的去重键上限。 */
const SEEN_LIMIT = 400;

interface StoreLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface FeedStoreOptions {
  /** World 的数据目录；null 时只在内存里（干装载与测试用）。 */
  dir: string | null;
  /** 存档总量上限，读配置的实时值。 */
  archiveLimit: () => number;
  log?: StoreLogger;
}

export interface ArchiveQuery {
  feedId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface ArchivePage {
  rows: ArchiveEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(value.trim());
}

export class FeedStore {
  private feeds: FeedRecord[] = [];
  private archiveEntries: ArchiveEntry[] = [];
  /** 下一条消息的编号；编号只增不减，删档也不回收，免得旧编号指到别的消息。 */
  private nextSeq = 0;
  private loaded = false;
  private readonly dir: string | null;

  constructor(private readonly opts: FeedStoreOptions) {
    this.dir = opts.dir;
  }

  // ── 文件 ────────────────────────────────────────────────────────────

  private pathOf(name: string): string | null {
    if (!this.dir) return null;
    return join(this.dir, name);
  }

  private readJson<T>(name: string): T | null {
    const file = this.pathOf(name);
    if (!file || !existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch (error) {
      this.opts.log?.warn(`读取 ${name} 失败，按空处理`, { error: String(error) });
      return null;
    }
  }

  private writeJson(name: string, value: unknown): void {
    const file = this.pathOf(name);
    if (!file) return;
    try {
      mkdirSync(this.dir as string, { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      renameSync(tmp, file);
    } catch (error) {
      this.opts.log?.warn(`写入 ${name} 失败`, { error: String(error) });
    }
  }

  /** 读一次磁盘。重复调用是空操作。 */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    const feeds = this.readJson<{ version?: number; feeds?: FeedRecord[] }>(FEEDS_FILE);
    if (feeds?.feeds && Array.isArray(feeds.feeds)) {
      this.feeds = feeds.feeds
        .filter((feed): feed is FeedRecord => !!feed && typeof feed === 'object' && typeof feed.url === 'string')
        .map((feed) => this.normalizeLoaded(feed));
    }
    const archive = this.readJson<{ version?: number; nextSeq?: number; entries?: ArchiveEntry[] }>(ARCHIVE_FILE);
    if (archive?.entries && Array.isArray(archive.entries)) {
      this.archiveEntries = archive.entries.filter((entry): entry is ArchiveEntry => !!entry && typeof entry === 'object');
      this.assignMissingSeq(typeof archive.nextSeq === 'number' ? archive.nextSeq : 0);
    }
  }

  /**
   * 老版本存档没有 `seq`：按「谁更旧谁号小」补齐，保证模型手里的编号在下一次读取后还是同一条。
   * 文件里已经记着 `nextSeq` 时直接用它，避免重号。
   */
  private assignMissingSeq(nextSeqFromFile: number): void {
    const missing = this.archiveEntries.filter((entry) => typeof entry.seq !== 'number' || !Number.isFinite(entry.seq));
    let next = Math.max(
      nextSeqFromFile,
      ...this.archiveEntries.map((entry) => (typeof entry.seq === 'number' && Number.isFinite(entry.seq) ? entry.seq : 0)),
    );
    if (!missing.length) {
      this.nextSeq = next;
      return;
    }
    // 存档是「新的在前」，倒着走就是时间顺序。
    const ordered = [...missing].sort((a, b) => {
      const ak = a.publishedAt ?? a.fetchedAt ?? '';
      const bk = b.publishedAt ?? b.fetchedAt ?? '';
      return ak.localeCompare(bk);
    });
    for (const entry of ordered) {
      next += 1;
      entry.seq = next;
    }
    this.nextSeq = next;
    this.persistArchive();
  }

  /** 老版本/手改的文件可能有缺字段，补上能用的默认值。 */
  private normalizeLoaded(feed: FeedRecord): FeedRecord {
    return {
      ...feed,
      title: typeof feed.title === 'string' && feed.title.trim() ? feed.title : hostOf(feed.url),
      enabled: feed.enabled !== false,
      intervalMinutes: normalizeInterval(feed.intervalMinutes, 30),
      scheduleTimes: parseScheduleTimes(feed.scheduleTimes),
      timeoutMs: normalizeTimeout(feed.timeoutMs, 20_000),
      maxNewItems: normalizeMaxNewItems(feed.maxNewItems, 3),
      allowModel: feed.allowModel !== false,
      addedAt: typeof feed.addedAt === 'string' ? feed.addedAt : new Date().toISOString(),
      seen: Array.isArray(feed.seen) ? feed.seen.slice(-SEEN_LIMIT) : [],
    };
  }

  private persistFeeds(): void {
    this.writeJson(FEEDS_FILE, { version: FEEDS_VERSION, feeds: this.feeds });
  }

  private persistArchive(): void {
    this.writeJson(ARCHIVE_FILE, { version: ARCHIVE_VERSION, nextSeq: this.nextSeq, entries: this.archiveEntries });
  }

  // ── 订阅 ────────────────────────────────────────────────────────────

  list(): FeedRecord[] {
    this.load();
    return this.feeds;
  }

  get(id: string): FeedRecord | undefined {
    return this.list().find((feed) => feed.id === id);
  }

  /** 按 id、网址或名字找；名字不区分大小写。 */
  find(ref: string): FeedRecord | undefined {
    const key = String(ref ?? '').trim();
    if (!key) return undefined;
    const lower = key.toLowerCase();
    return this.list().find((feed) => feed.id === key)
      ?? this.list().find((feed) => feed.url.toLowerCase() === lower || feed.url.replace(/\/+$/, '').toLowerCase() === lower.replace(/\/+$/, ''))
      ?? this.list().find((feed) => feed.title.toLowerCase() === lower)
      ?? this.list().find((feed) => feed.title.toLowerCase().includes(lower) && lower.length >= 2);
  }

  /** 一次解析一串引用，顺便报告没找到的那些。 */
  resolve(refs: readonly string[]): { feeds: FeedRecord[]; missing: string[] } {
    const feeds: FeedRecord[] = [];
    const missing: string[] = [];
    for (const ref of refs) {
      const feed = this.find(ref);
      if (!feed) missing.push(String(ref));
      else if (!feeds.some((item) => item.id === feed.id)) feeds.push(feed);
    }
    return { feeds, missing };
  }

  add(input: FeedInput, defaults: FeedDefaults): FeedRecord {
    this.load();
    const url = String(input.url ?? '').trim();
    if (!isHttpUrl(url)) throw new Error('订阅地址必须是 http / https 网址');
    const existing = this.feeds.find((feed) => feed.url.replace(/\/+$/, '') === url.replace(/\/+$/, ''));
    if (existing) throw new Error(`这个地址已经在订阅里了：${existing.title}（${existing.id}）`);

    const now = new Date().toISOString();
    const id = this.freshId(url);
    const feed: FeedRecord = {
      id,
      url,
      title: (input.title ?? '').trim() || hostOf(url),
      enabled: input.enabled !== false,
      intervalMinutes: normalizeInterval(input.intervalMinutes, defaults.intervalMinutes),
      scheduleTimes: parseScheduleTimes(input.scheduleTimes),
      timeoutMs: normalizeTimeout(input.timeoutMs, defaults.timeoutMs),
      maxNewItems: normalizeMaxNewItems(input.maxNewItems, defaults.maxNewItems),
      allowModel: input.allowModel === undefined ? defaults.allowModel : input.allowModel !== false,
      addedAt: now,
      seen: [],
    };
    this.feeds.push(feed);
    this.persistFeeds();
    return feed;
  }

  private freshId(url: string): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = `f${shortHash(`${url}#${attempt}#${this.feeds.length}`)}`;
      if (!this.feeds.some((feed) => feed.id === id)) return id;
    }
    return `f${Date.now().toString(36)}`;
  }

  update(id: string, patch: Partial<FeedInput> & Partial<Pick<FeedRecord, 'lastAttemptAt' | 'lastFetchedAt' | 'lastError' | 'lastSlot' | 'etag' | 'lastModified' | 'lastNewCount'>>): FeedRecord | undefined {
    this.load();
    const feed = this.feeds.find((item) => item.id === id);
    if (!feed) return undefined;

    if (patch.url !== undefined) {
      const url = String(patch.url).trim();
      if (!isHttpUrl(url)) throw new Error('订阅地址必须是 http / https 网址');
      feed.url = url;
    }
    if (patch.title !== undefined) feed.title = String(patch.title).trim() || hostOf(feed.url);
    if (patch.enabled !== undefined) feed.enabled = !!patch.enabled;
    if (patch.intervalMinutes !== undefined) feed.intervalMinutes = normalizeInterval(patch.intervalMinutes, feed.intervalMinutes);
    if (patch.scheduleTimes !== undefined) feed.scheduleTimes = parseScheduleTimes(patch.scheduleTimes);
    if (patch.timeoutMs !== undefined) feed.timeoutMs = normalizeTimeout(patch.timeoutMs, feed.timeoutMs);
    if (patch.maxNewItems !== undefined) feed.maxNewItems = normalizeMaxNewItems(patch.maxNewItems, feed.maxNewItems);
    if (patch.allowModel !== undefined) feed.allowModel = !!patch.allowModel;
    if (patch.lastAttemptAt !== undefined) feed.lastAttemptAt = patch.lastAttemptAt;
    if (patch.lastFetchedAt !== undefined) feed.lastFetchedAt = patch.lastFetchedAt;
    if (patch.lastSlot !== undefined) feed.lastSlot = patch.lastSlot;
    if (patch.etag !== undefined) feed.etag = patch.etag || undefined;
    if (patch.lastModified !== undefined) feed.lastModified = patch.lastModified || undefined;
    if (patch.lastNewCount !== undefined) feed.lastNewCount = patch.lastNewCount;
    if ('lastError' in patch) feed.lastError = patch.lastError ?? undefined;

    this.persistFeeds();
    return feed;
  }

  remove(id: string): boolean {
    this.load();
    const index = this.feeds.findIndex((feed) => feed.id === id);
    if (index < 0) return false;
    this.feeds.splice(index, 1);
    const before = this.archiveEntries.length;
    this.archiveEntries = this.archiveEntries.filter((entry) => entry.feedId !== id);
    this.persistFeeds();
    if (this.archiveEntries.length !== before) this.persistArchive();
    return true;
  }

  /** 把条目记为已见过。键按出现顺序追加，超过上限从最老的裁掉。 */
  markSeen(id: string, keys: readonly string[]): void {
    const feed = this.get(id);
    if (!feed || !keys.length) return;
    const known = new Set(feed.seen);
    for (const key of keys) if (!known.has(key)) { known.add(key); feed.seen.push(key); }
    if (feed.seen.length > SEEN_LIMIT) feed.seen = feed.seen.slice(-SEEN_LIMIT);
    this.persistFeeds();
  }

  /** 某条消息是不是这个源已经见过的。 */
  hasSeen(feed: FeedRecord, key: string): boolean {
    return feed.seen.includes(key);
  }

  // ── 消息存档 ────────────────────────────────────────────────────────

  archive(): readonly ArchiveEntry[] {
    this.load();
    return this.archiveEntries;
  }

  /**
   * 新消息放最前面；同一个源的同一条只留一份。
   * 返回**这次真正写进存档的那些条目**（已经带好 `seq`），调用方拿它去拼给模型的编号。
   */
  pushArchive(entries: readonly (Omit<ArchiveEntry, 'seq'> & { seq?: number })[]): ArchiveEntry[] {
    this.load();
    if (!entries.length) return [];
    const fresh = entries.filter((entry) => !this.archiveEntries.some(
      (existing) => existing.feedId === entry.feedId && existing.entryId === entry.entryId,
    ));
    if (!fresh.length) return [];
    const stored: ArchiveEntry[] = fresh.map((entry) => {
      this.nextSeq += 1;
      return { ...entry, seq: this.nextSeq };
    });
    this.archiveEntries = [...stored, ...this.archiveEntries]
      .sort((a, b) => (b.publishedAt ?? b.fetchedAt).localeCompare(a.publishedAt ?? a.fetchedAt))
      .slice(0, Math.max(20, this.opts.archiveLimit()));
    this.persistArchive();
    return stored;
  }

  /** 按编号取条目；认不出返回 undefined。 */
  bySeq(seq: number): ArchiveEntry | undefined {
    this.load();
    return this.archiveEntries.find((entry) => entry.seq === seq);
  }

  /** 存档里现有的编号范围，给「编号写错了」这类回执用。 */
  seqRange(): { min: number; max: number } | null {
    this.load();
    if (!this.archiveEntries.length) return null;
    const seqs = this.archiveEntries.map((entry) => entry.seq);
    return { min: Math.min(...seqs), max: Math.max(...seqs) };
  }

  clearArchive(feedId?: string): number {
    this.load();
    const before = this.archiveEntries.length;
    this.archiveEntries = feedId ? this.archiveEntries.filter((entry) => entry.feedId !== feedId) : [];
    this.persistArchive();
    return before - this.archiveEntries.length;
  }

  /** 消息页签用：先按源筛，再按关键词筛标题与摘要，最后分页。 */
  archivePage(query: ArchiveQuery = {}): ArchivePage {
    const pageSize = Math.min(100, Math.max(1, Math.round(query.pageSize ?? 20)));
    const feedId = query.feedId?.trim();
    const needle = query.query?.trim().toLowerCase();
    const rows = this.archive().filter((entry) => {
      if (feedId && entry.feedId !== feedId) return false;
      if (!needle) return true;
      return entry.title.toLowerCase().includes(needle)
        || entry.summary.toLowerCase().includes(needle)
        || entry.link.toLowerCase().includes(needle)
        || (entry.publishedAt ?? '').includes(needle);
    });
    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pageCount, Math.max(1, Math.round(query.page ?? 1)));
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), total, page, pageSize, pageCount };
  }
}
