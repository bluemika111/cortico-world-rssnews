/**
 * RSS / Atom 订阅：每个源按自己的节奏被拉下来，新消息写成事件递给她。
 * 三个工具给她主动权：`rss_fetch` 立即拉取，`rss_index` 按关键词翻订阅源，
 * `rss_read` 按编号读某条的全文（低消耗模式下这就是唯一看正文的入口）。
 *
 * 这个文件只管「什么时候拉、拉回来算新还是旧、递给谁」；解析、网络、落盘、文案各有自己的模块。
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Language } from 'cortico/core/language.ts';
import type { PushOptions, ToolDef, ToolOutcome, World, WorldHost, WorldWebUiDecl } from 'cortico/core/types.ts';
import { nowIso } from 'cortico/core/util.ts';
import { RSS_DEFAULTS, rssConfigGroup, type RssConfigSection } from './config.ts';
import { parseFeed, type FeedEntry, type ParsedFeed } from './feed.ts';
import { fetchFeedText, type FetchFeedTextOptions, type FetchFeedTextResult } from './http.ts';
import {
  describeSchedule,
  fmtLocal,
  renderFeedList,
  renderFetchDigest,
  renderIndexDigest,
  renderNewItemsEvent,
  renderReadResult,
  type FetchResultView,
  type IndexHit,
  type ItemView,
  type ReadEntry,
} from './model-text.ts';
import { clampInt, dueReason, localTimeParts, nextRunAt } from './schedule.ts';
import { haystackOf, normalizeKeywords, paginate, type MatchMode } from './search.ts';
import { FeedStore, type ArchiveQuery } from './store.ts';
import { text as strings } from './strings.ts';
import type { ArchiveEntry, FeedDefaults, FeedInput, FeedRecord } from './types.ts';

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));
/** 查该不该拉一轮的节拍。一分钟内必然跨过一次定时点，漏不了。 */
const TICK_MS = 15_000;
/** 工具连着调两次时复用上一次的结果，免得同一个源被连着打。 */
const CACHE_MS = 12_000;
/** 索引工具的复用窗口比立即拉取长一点：翻页时不该每页都重新下载。 */
const INDEX_CACHE_MS = 45_000;
/** 一次拉取最多往存档里写多少条（新源第一轮可能有几十条，没必要全留）。 */
const ARCHIVE_PER_FETCH = 30;
/** 索引工具一页最多几条。 */
const INDEX_PAGE_MAX = 5;
/** `rss_read` 一次最多读几条全文。 */
const READ_LIMIT = 10;

export const PANEL_FEEDS = 'feeds';
export const PANEL_MESSAGES = 'messages';

/**
 * 模板文件在哪：**先认本模块旁边的那个**。
 * 装配层给的 `packageDir` 是 bot 包的目录（`build/cortico/bots/<bot>`），不是扩展包；
 * 拿它拼 `src/ENV_PROMPT.md` 会读到一个不存在的 bot 模板，挂载时就是 ENOENT。
 * 只有打包跑测试（`import.meta.url` 指向产物，模块旁边没有模板）时才退回包目录。
 */
export function resolveEnvPromptPath(moduleFile: string, packageDir?: string): string {
  if (existsSync(moduleFile)) return moduleFile;
  if (packageDir) {
    const candidate = join(packageDir, 'src', 'ENV_PROMPT.md');
    if (existsSync(candidate)) return candidate;
  }
  return moduleFile;
}

export type FetchTextFn = (url: string, opts: FetchFeedTextOptions) => Promise<FetchFeedTextResult>;

interface LogLike {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface RssWorldOptions {
  cfg: RssConfigSection;
  timezone: string;
  /** 订阅数据目录；缺省时只在内存里（干装载与测试）。 */
  dataDir?: string;
  /** 包目录：环境提示词模板按它定位，别指望打包后的 `import.meta.url`。 */
  packageDir?: string;
  log?: LogLike;
  /** 测试注入：时钟。 */
  now?: () => number;
  /** 测试注入：网络层。 */
  fetchText?: FetchTextFn;
}

/** 全部工具的声明；`describe` 与 `tools()` 都从这里取。 */
export const RSS_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'rss_fetch',
    description:
      'Pull the RSS/Atom feeds right now and return their newest items. Without arguments it pulls every enabled feed that allows model pulls; pass "feeds" (ids, titles or URLs) to pull only those. Each feed returns at most that feed\'s own "max new items" count, newest first; when nothing is new you get its latest items marked as already read. Hits the network: a slow feed can take tens of seconds, so do not call it repeatedly to poll.',
    tags: ['read'],
    interruptible: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        feeds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Feed ids, titles or URLs. Omit to pull every enabled feed that allows model pulls.',
        },
      },
    },
  },
  {
    name: 'rss_index',
    description:
      'Search the subscribed feeds by keyword. Fetches the newest entries of the given feeds (up to 50 per feed), matches every keyword against title, body and time, and returns the matches newest first, at most 5 per page. Pass page (1-based) to read further pages; the receipt reports how many matches remain.',
    tags: ['read'],
    interruptible: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        feeds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Feeds to search: ids, titles or URLs.',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Keywords; each is matched against title, body and time. Default mode matches any keyword.',
        },
        page: { type: 'integer', minimum: 1, description: '1-based page of matches. Defaults to 1.' },
        mode: {
          type: 'string',
          enum: ['any', 'all'],
          description: 'any (default): at least one keyword matches. all: every keyword matches.',
        },
      },
      required: ['feeds', 'keywords'],
    },
  },
  {
    name: 'rss_read',
    description:
      'Read the full text of messages by their number. Every message handed over by rss_fetch, rss_index or an rss.new_items event carries a number like "#12"; pass those numbers here to get the whole body, the source feed, the time and the link. Read-only, no network. In low-cost mode this is the only way to see the body.',
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ids: {
          type: 'array',
          items: { type: ['string', 'number'] },
          minItems: 1,
          description: 'Message numbers, e.g. ["#12", "13", 14].',
        },
      },
      required: ['ids'],
    },
  },
];

/** 索引时每个源翻到的条目与失败原因。 */
interface IndexFeedResult {
  feed: FeedRecord;
  /** 带存档编号的条目；编号在写档时分配。 */
  entries: Array<FeedEntry & { seq?: number }>;
  /** 源里条目多于上限时被略过的数量。 */
  truncated: number;
  error?: string;
}

export class RssWorld implements World {  readonly id = 'rss';

  private host: WorldHost | null = null;
  private readonly store: FeedStore;
  private readonly clock: () => number;
  private readonly fetchText: FetchTextFn;
  /** 挂载后换成宿主的 logger；构造时先给个空实现，干装载与测试不会到处打日志。 */
  private log: LogLike;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly inFlight = new Map<string, Promise<FetchResultView>>();
  private readonly recentPulls = new Map<string, { at: number; result: FetchResultView }>();
  private readonly recentIndex = new Map<string, { at: number; result: IndexFeedResult }>();

  constructor(private readonly opts: RssWorldOptions) {
    this.clock = opts.now ?? Date.now;
    this.fetchText = opts.fetchText ?? fetchFeedText;
    this.log = opts.log ?? { info: () => {}, warn: () => {} };
    this.store = new FeedStore({
      dir: opts.dataDir ?? null,
      archiveLimit: () => this.cfg().archiveLimit ?? RSS_DEFAULTS.archiveLimit,
      log: { warn: (message, meta) => this.log.warn(message, meta) },
    });
  }

  private cfg(): RssConfigSection {
    return this.opts.cfg;
  }

  private timezone(): string {
    return this.opts.timezone || 'UTC';
  }

  private nowMs(): number {
    return this.clock();
  }

  /**
   * 模板路径。扩展自己的文件只有模块 URL 这一种可靠定位方式；详见 `resolveEnvPromptPath`。
   */
  private envPromptPath(): string {
    return resolveEnvPromptPath(ENV_PROMPT_FILE, this.opts.packageDir);
  }

  // ── 契约 ────────────────────────────────────────────────────────────

  envPromptVars(): Record<string, string> {
    const feeds = this.store.list();
    const enabled = feeds.filter((feed) => feed.enabled);
    const lastSuccess = feeds
      .map((feed) => feed.lastFetchedAt)
      .filter((value): value is string => !!value)
      .sort()
      .pop();
    const archive = this.store.archive().length;
    const lowCost = this.lowCost();
    return {
      'rss.feeds': renderFeedList(feeds),
      'rss.state': [
        feeds.length
          ? `${feeds.length} 个源（${enabled.length} 个启用）；${lastSuccess ? `最近一次成功拉取在 ${fmtLocal(lastSuccess, this.timezone())}` : '还没成功拉取过'}`
          : '还没有订阅任何源。',
        lowCost ? '低消耗模式开着：消息只给编号与标题，正文要用 rss_read 按编号读。' : '',
      ].filter(Boolean).join(' '),
      'rss.archive': `${archive} 条`,
      'rss.timezone': this.timezone(),
    };
  }

  tools(): ToolDef[] {
    return [
      {
        ...RSS_TOOL_DECLS[0],
        handler: (args, ctx) => this.fetchTool(args, ctx.signal),
      },
      {
        ...RSS_TOOL_DECLS[1],
        handler: (args, ctx) => this.indexTool(args, ctx.signal),
      },
      {
        ...RSS_TOOL_DECLS[2],
        handler: async (args) => this.readTool(args),
      },
    ];
  }

  webUi(language: Language = 'zh'): WorldWebUiDecl {
    const t = strings(language);
    const feeds = this.store.list();
    const enabled = feeds.filter((feed) => feed.enabled);
    const broken = enabled.filter((feed) => !!feed.lastError);
    const pulling = this.inFlight.size > 0;
    const lastSuccess = feeds.map((feed) => feed.lastFetchedAt).filter((v): v is string => !!v).sort().pop();

    return {
      label: t.moduleLabel,
      lamps: [
        {
          label: t.lampFeeds,
          state: enabled.length ? (broken.length ? 'error' : 'online') : 'offline',
          hint: enabled.length
            ? `${enabled.length}/${feeds.length} 个源启用${broken.length ? `，${broken.length} 个上次拉取失败` : ''}`
            : t.lampFeedsOff,
        },
        {
          label: t.lampPull,
          state: pulling ? 'loading' : lastSuccess ? (broken.length ? 'error' : 'online') : 'offline',
          hint: pulling
            ? t.lampPullRunning
            : lastSuccess
              ? `${t.lampPullOk} · 最近 ${fmtLocal(lastSuccess, this.timezone())}`
              : t.lampPullIdle,
        },
      ],
      badges: [
        { label: t.badgeFeeds, value: feeds.length, tone: enabled.length ? 'on' : 'plain' },
        { label: t.badgeMessages, value: this.store.archive().length, tone: 'plain' },
      ],
      panels: [
        { id: PANEL_FEEDS, title: t.panelFeedsTitle, description: t.panelFeedsDescription },
        { id: PANEL_MESSAGES, title: t.panelMessagesTitle, description: t.panelMessagesDescription },
      ],
      invoke: (panel, method, args) => this.invoke(panel, method, args),
      config: [rssConfigGroup()],
      promptDocs: [
        {
          key: 'worlds.rss.envPrompt',
          title: t.promptDocTitle,
          description: t.promptDocDescription,
          path: this.envPromptPath(),
          role: 'envPrompt',
          vars: [
            { name: 'rss.feeds', description: '订阅源清单：名字、id、拉取节奏与一次最多几条。', multiline: true },
            { name: 'rss.state', description: '源的数量、启用数量与最近一次成功拉取的时间。' },
            { name: 'rss.archive', description: '消息存档里现在有多少条。' },
            { name: 'rss.timezone', description: '部署的时区，消息时间按它显示。' },
          ],
        },
      ],
    };
  }

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    this.log = host.log as unknown as LogLike;
    this.store.load();
    this.running = true;
    this.recentPulls.clear();
    this.recentIndex.clear();
    // 挂载后先按节奏走一拍：间隔到点却没拉过的源（含新加的源、重启前漏掉的那次）会立刻补上。
    void this.tick().catch(() => {});
    this.schedule();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.host = null;
    this.inFlight.clear();
  }

  // ── 定时 ────────────────────────────────────────────────────────────

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.tick()
        .catch(() => {})
        .finally(() => this.schedule());
    }, TICK_MS);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (!this.running || !this.host) return;
    const now = this.nowMs();
    for (const feed of this.store.list()) {
      const reason = dueReason(feed, now, this.timezone());
      if (!reason) continue;
      if (this.inFlight.has(feed.id)) continue;
      // 定时那一轮把这一分钟的槽记掉，免得同一分钟里第二次 tick 再来一遍。
      void this.runFeed(feed, 'schedule', { slot: reason === 'time', cacheMs: 0 }).catch(() => {});
    }
  }

  // ── 拉取 ────────────────────────────────────────────────────────────

  /**
   * 拉一个源。同一时刻同一个源只跑一次；`cacheMs` 之内再问就复用上一次的结果。
   * 失败不抛：回执里写明原因，由调用方决定怎么呈现。
   */
  private async runFeed(
    feed: FeedRecord,
    source: 'schedule' | 'tool' | 'manual',
    opts: { signal?: AbortSignal; slot?: boolean; cacheMs?: number } = {},
  ): Promise<FetchResultView> {
    const running = this.inFlight.get(feed.id);
    if (running) return running;

    const cacheMs = opts.cacheMs ?? CACHE_MS;
    const cached = this.recentPulls.get(feed.id);
    if (cacheMs > 0 && cached && this.nowMs() - cached.at < cacheMs) return { ...cached.result, cached: true };

    const work = this.pullFeed(feed, source, opts)
      .then((result) => {
        this.recentPulls.set(feed.id, { at: this.nowMs(), result });
        return result;
      })
      .catch((error: unknown) => ({
        feed,
        error: error instanceof Error ? error.message : String(error),
        items: [] as ItemView[],
        newCount: 0,
        skipped: 0,
      }))
      .finally(() => {
        this.inFlight.delete(feed.id);
      });
    this.inFlight.set(feed.id, work);
    return work;
  }

  private async pullFeed(
    feed: FeedRecord,
    source: 'schedule' | 'tool' | 'manual',
    opts: { signal?: AbortSignal; slot?: boolean },
  ): Promise<FetchResultView> {
    const at = this.nowMs();
    const stamp = new Date(at).toISOString();
    const patch: Record<string, unknown> = { lastAttemptAt: stamp };
    if (opts.slot) {
      const { dateKey, hhmm } = localTimeParts(at, this.timezone());
      patch.lastSlot = `${dateKey} ${hhmm}`;
    }
    // 先记一次尝试：即使这次超时，间隔也从现在开始算，不会每 15 秒重试一次。
    this.store.update(feed.id, patch as Parameters<FeedStore['update']>[1]);

    try {
      const response = await this.fetchText(feed.url, {
        timeoutMs: feed.timeoutMs,
        ...(feed.etag ? { etag: feed.etag } : {}),
        ...(feed.lastModified ? { lastModified: feed.lastModified } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
      });

      if (response.notModified) {
        this.store.update(feed.id, { lastFetchedAt: stamp, lastError: '', lastNewCount: 0 });
        return {
          feed,
          items: this.archiveItems(feed.id, feed.maxNewItems),
          newCount: 0,
          skipped: 0,
          cached: true,
        };
      }

      const parsed = parseFeed(response.text);
      return this.ingest(feed, parsed, {
        at,
        source,
        ...(response.etag ? { etag: response.etag } : {}),
        ...(response.lastModified ? { lastModified: response.lastModified } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.update(feed.id, { lastError: message });
      this.log.warn(`拉取「${feed.title}」失败`, { error: message, url: feed.url });
      return { feed, error: message, items: [], newCount: 0, skipped: 0 };
    }
  }

  /** 把解析结果并进订阅记录：算新旧、存档、必要时推事件。 */
  private ingest(
    feed: FeedRecord,
    parsed: ParsedFeed,
    meta: { at: number; source: 'schedule' | 'tool' | 'manual'; etag?: string; lastModified?: string },
  ): FetchResultView {
    const stamp = new Date(meta.at).toISOString();
    const entries = sortNewestFirst(parsed.entries);
    const known = new Set(feed.seen);
    const fresh = entries.filter((entry) => !known.has(entry.id));

    // 源自己的标题比主机名好用；只在还顶着主机名时换。
    const adoptTitle = parsed.title && (!feed.title || feed.title === hostOf(feed.url)) ? parsed.title : undefined;

    const patch: Record<string, unknown> = {
      lastFetchedAt: stamp,
      lastError: '',
      lastNewCount: fresh.length,
    };
    if (meta.etag) patch.etag = meta.etag;
    if (meta.lastModified) patch.lastModified = meta.lastModified;
    if (adoptTitle) patch.title = adoptTitle;
    this.store.update(feed.id, patch as Parameters<FeedStore['update']>[1]);
    if (fresh.length) this.store.markSeen(feed.id, fresh.map((entry) => entry.id));

    // 先写存档：编号在那里分配，回头递给模型的每一条才带得上 #n。
    const seqOf = new Map<string, number>();
    if (entries.length) {
      const stored = this.store.pushArchive(
        entries.slice(0, ARCHIVE_PER_FETCH).map((entry) => this.toArchive(feed, entry, stamp)),
      );
      for (const row of stored) seqOf.set(row.entryId, row.seq);
    }

    // 存档里已经有这条（比如上一轮写过）时也要拿到原编号。
    const seqFor = (entryId: string): number | undefined => {
      if (seqOf.has(entryId)) return seqOf.get(entryId);
      return this.store.archive().find((row) => row.feedId === feed.id && row.entryId === entryId)?.seq;
    };

    const handedOver = fresh.length
      ? fresh.slice(0, feed.maxNewItems).map((entry) => this.toView(entry, true, seqFor(entry.id)))
      : entries.slice(0, feed.maxNewItems).map((entry) => this.toView(entry, false, seqFor(entry.id)));

    const result: FetchResultView = {
      feed,
      items: handedOver,
      newCount: fresh.length,
      skipped: Math.max(0, fresh.length - handedOver.filter((item) => item.isNew).length),
    };

    if (fresh.length && feed.enabled) {
      const text = renderNewItemsEvent(result, this.timezone(), this.clampBody(), this.lowCost());
      this.pushEvent(feed, text).catch((error: unknown) => {
        this.log.warn('新消息事件投递失败', { error: String(error) });
      });
    }

    this.log.info(`拉取「${feed.title}」：${entries.length} 条，新 ${fresh.length} 条`, {
      source: meta.source,
      url: feed.url,
    });
    return result;
  }

  private toView(entry: FeedEntry, isNew: boolean, seq?: number): ItemView {
    return {
      ...(typeof seq === 'number' ? { seq } : {}),
      title: entry.title,
      link: entry.link,
      body: entry.body,
      summary: entry.summary,
      ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
      isNew,
    };
  }

  /** 存档行；编号由 `pushArchive` 分配，这里不带。 */
  private toArchive(feed: FeedRecord, entry: FeedEntry, fetchedAt: string): Omit<ArchiveEntry, 'seq'> {
    return {
      feedId: feed.id,
      entryId: entry.id,
      title: entry.title,
      link: entry.link,
      summary: entry.summary,
      // 存档留个够读的长度：界面要能看正文，但也不该把整篇长文塞进 JSON。
      body: entry.body.length > 4000 ? `${entry.body.slice(0, 3999)}…` : entry.body,
      ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
      fetchedAt,
    };
  }

  private archiveItems(feedId: string, limit: number): ItemView[] {
    return this.store
      .archive()
      .filter((entry) => entry.feedId === feedId)
      .slice(0, Math.max(1, limit))
      .map((entry) => ({
        seq: entry.seq,
        title: entry.title,
        link: entry.link,
        body: entry.body,
        summary: entry.summary,
        ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
        isNew: false,
      }));
  }

  private clampBody(): number {
    return Math.min(2000, Math.max(0, this.cfg().maxBodyChars ?? RSS_DEFAULTS.maxBodyChars));
  }

  /** 低消耗模式：只给编号、来源、时间、标题；正文留给 rss_read。 */
  private lowCost(): boolean {
    return this.cfg().lowCost === true;
  }

  private async pushEvent(feed: FeedRecord, text: string): Promise<void> {
    const host = this.host;
    if (!host) return;
    const opts: PushOptions = { trigger: this.cfg().wakeOnNewItems ? 'flush' : 'debounce' };
    await host.pushEvent(
      {
        type: 'rss.new_items',
        ts: nowIso(this.timezone()),
        source: this.id,
        senderKey: feed.id,
        text,
      },
      opts,
    );
  }

  // ── 工具：立即拉取 ──────────────────────────────────────────────────

  private async fetchTool(args: Record<string, unknown>, signal?: AbortSignal): Promise<string | ToolOutcome> {
    const all = this.store.list();
    const requested = Array.isArray(args.feeds) ? (args.feeds as unknown[]).map((item) => String(item ?? '')).filter(Boolean) : [];
    const notes: string[] = [];
    let targets: FeedRecord[];

    if (requested.length) {
      const { feeds, missing } = this.store.resolve(requested);
      if (missing.length) {
        notes.push(`没找到这些源：${missing.join('、')}。现有的源：${all.map((feed) => `${feed.title}（${feed.id}）`).join('、') || '无'}。`);
      }
      targets = [];
      for (const feed of feeds) {
        if (!feed.enabled) {
          notes.push(`「${feed.title}」已停用，跳过。`);
          continue;
        }
        if (!feed.allowModel) {
          notes.push(`「${feed.title}」设为不允许模型主动拉取，跳过。`);
          continue;
        }
        targets.push(feed);
      }
      if (!targets.length) {
        return {
          text: ['没有可拉的源。', ...notes].join('\n'),
          failed: true,
        };
      }
    } else {
      targets = all.filter((feed) => feed.enabled && feed.allowModel);
      if (!targets.length) {
        if (!all.length) {
          return {
            text: '还没有订阅任何源。先在「Rss/Atom 管理」里加一个，比如 https://example.com/feed.xml。',
            failed: true,
          };
        }
        const reasons = all.map((feed) => `- ${feed.title}（${feed.id}）：${feed.enabled ? '不允许模型主动拉取' : '已停用'}`);
        return {
          text: ['所有源现在都不能由模型拉取：', ...reasons, '要改的话去「Rss/Atom 管理」页。'].join('\n'),
          failed: true,
        };
      }
    }

    const results = await Promise.all(
      targets.map((feed) => this.runFeed(feed, 'tool', { ...(signal ? { signal } : {}) })),
    );
    return renderFetchDigest(results, {
      timezone: this.timezone(),
      maxChars: this.clampBody(),
      notes,
      lowCost: this.lowCost(),
    });
  }

  // ── 工具：关键词索引 ────────────────────────────────────────────────

  private async indexTool(args: Record<string, unknown>, signal?: AbortSignal): Promise<string | ToolOutcome> {
    const refs = Array.isArray(args.feeds)
      ? (args.feeds as unknown[]).map((item) => String(item ?? '')).filter(Boolean)
      : typeof args.feeds === 'string'
        ? [args.feeds]
        : [];
    const keywords = normalizeKeywords(args.keywords);
    const mode: MatchMode = args.mode === 'all' ? 'all' : 'any';
    const page = clampInt(args.page, 1, 9999, 1);
    const all = this.store.list();

    if (!refs.length) {
      return {
        text: `rss_index 需要至少一个源。现有的源：${all.map((feed) => `${feed.title}（${feed.id}）`).join('、') || '无'}。`,
        failed: true,
      };
    }
    if (!keywords.length) {
      return { text: 'rss_index 需要至少一个关键词。', failed: true };
    }

    const { feeds, missing } = this.store.resolve(refs);
    const notes: string[] = [];
    if (missing.length) {
      notes.push(`没找到这些源：${missing.join('、')}。现有的源：${all.map((feed) => `${feed.title}（${feed.id}）`).join('、') || '无'}。`);
    }
    const usable = feeds.filter((feed) => {
      if (!feed.enabled) {
        notes.push(`「${feed.title}」已停用，跳过。`);
        return false;
      }
      if (!feed.allowModel) {
        notes.push(`「${feed.title}」设为不允许模型主动拉取，跳过。`);
        return false;
      }
      return true;
    });

    if (!usable.length) {
      return { text: ['没有可搜索的源。', ...notes].join('\n'), failed: true };
    }

    const limit = Math.min(50, Math.max(1, this.cfg().indexFetchLimit ?? RSS_DEFAULTS.indexFetchLimit));
    const fetched = await Promise.all(usable.map((feed) => this.indexFetch(feed, limit, signal)));

    const hits: IndexHit[] = [];
    let scanned = 0;
    let truncated = 0;
    for (const result of fetched) {
      if (result.error) {
        notes.push(`「${result.feed.title}」拉取失败：${result.error}`);
        continue;
      }
      scanned += result.entries.length;
      truncated += result.truncated;
      for (const entry of result.entries) {
        // 每条只算一次 haystack，多个关键词共用。
        const haystack = haystackOf(entry, this.timezone());
        const matched = keywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));
        if (mode === 'all' ? matched.length !== keywords.length : matched.length === 0) continue;
        hits.push({
          ...(typeof entry.seq === 'number' ? { seq: entry.seq } : {}),
          feed: result.feed,
          title: entry.title,
          link: entry.link,
          body: entry.body,
          summary: entry.summary,
          ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
          matched,
        });
      }
    }

    hits.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    const pageSize = Math.min(INDEX_PAGE_MAX, Math.max(1, this.cfg().indexPageSize ?? RSS_DEFAULTS.indexPageSize));
    const paged = paginate(hits, page, pageSize);

    const digest = renderIndexDigest({
      timezone: this.timezone(),
      maxChars: this.clampBody(),
      keywords,
      mode,
      page: paged.page,
      pageSize: paged.pageSize,
      total: paged.total,
      pageCount: paged.pageCount,
      scanned,
      feedCount: fetched.filter((result) => !result.error).length,
      truncated,
      hits: paged.rows,
      lowCost: this.lowCost(),
    });

    return notes.length ? `${digest}\n\n${notes.join('\n')}` : digest;
  }

  /** 索引工具的网络那一半：只取最新的 N 条，不碰去重记录（定时拉取该怎么推还怎么推）。 */
  private async indexFetch(feed: FeedRecord, limit: number, signal?: AbortSignal): Promise<IndexFeedResult> {
    const cached = this.recentIndex.get(feed.id);
    if (cached && this.nowMs() - cached.at < INDEX_CACHE_MS) return cached.result;

    try {
      const response = await this.fetchText(feed.url, {
        timeoutMs: feed.timeoutMs,
        ...(signal ? { signal } : {}),
      });
      if (response.notModified) {
        const result: IndexFeedResult = { feed, entries: [], truncated: 0 };
        this.recentIndex.set(feed.id, { at: this.nowMs(), result });
        return result;
      }
      const parsed = parseFeed(response.text);
      const entries = sortNewestFirst(parsed.entries);
      const limited = entries.slice(0, limit);
      const stamp = new Date(this.nowMs()).toISOString();
      // 索引命中的条目也要有编号，低消耗模式下模型才能用 rss_read 读全文。
      const seqOf = new Map<string, number>();
      if (limited.length) {
        const stored = this.store.pushArchive(limited.map((entry) => this.toArchive(feed, entry, stamp)));
        for (const row of stored) seqOf.set(row.entryId, row.seq);
      }
      const result: IndexFeedResult = {
        feed,
        entries: limited.map((entry) => {
          const seq = seqOf.get(entry.id) ?? this.archiveSeq(feed.id, entry.id);
          return typeof seq === 'number' ? { ...entry, seq } : entry;
        }),
        truncated: Math.max(0, entries.length - limit),
      };
      this.recentIndex.set(feed.id, { at: this.nowMs(), result });
      return result;
    } catch (error) {
      return {
        feed,
        entries: [],
        truncated: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** 存档里这条消息的编号（之前写过就有）。 */
  private archiveSeq(feedId: string, entryId: string): number | undefined {
    return this.store.archive().find((row) => row.feedId === feedId && row.entryId === entryId)?.seq;
  }

  // ── 工具：按编号读全文 ──────────────────────────────────────────────

  /**
   * `rss_read`：模型拿着 `#12` 这样的编号来要正文。纯读存档，不发网络请求。
   * 编号认不出、越界、已被存档上限挤掉，都写进回执，不当作失败——它只是想知道那条讲了什么。
   */
  private readTool(args: Record<string, unknown>): string | ToolOutcome {
    const raw = Array.isArray(args.ids) ? args.ids : args.ids === undefined ? [] : [args.ids];
    const wanted: number[] = [];
    const unparsed: string[] = [];
    for (const item of raw) {
      const parsed = parseSeq(item);
      if (parsed === null) {
        unparsed.push(String(item ?? ''));
        continue;
      }
      if (!wanted.includes(parsed)) wanted.push(parsed);
    }
    if (!wanted.length && !unparsed.length) {
      return { text: 'rss_read 需要至少一个编号，比如 {"ids":["#12","13"]}。', failed: true };
    }

    const titles = new Map(this.store.list().map((feed) => [feed.id, feed.title]));
    const entries: ReadEntry[] = [];
    const missing: number[] = [];
    // 一次最多读 10 条：再多就该用 rss_index 缩小范围，而不是把整档塞进上下文。
    for (const seq of wanted.slice(0, READ_LIMIT)) {
      const row = this.store.bySeq(seq);
      if (!row) {
        missing.push(seq);
        continue;
      }
      entries.push({
        seq: row.seq,
        feedTitle: titles.get(row.feedId) ?? row.feedId,
        title: row.title,
        link: row.link,
        body: row.body,
        summary: row.summary,
        ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
        fetchedAt: row.fetchedAt,
      });
    }
    const overflow = wanted.slice(READ_LIMIT);

    const text = renderReadResult({
      timezone: this.timezone(),
      // 读全文就是全文：不套「递给模型的正文长度」，存档本身已经限到 4000 字。
      maxChars: 0,
      entries,
      missing,
      unparsed,
      range: this.store.seqRange(),
    });
    const suffix = overflow.length
      ? `\n\n（这次只要前 ${READ_LIMIT} 条：#${overflow.join('、#')} 没读。分两次调。）`
      : '';
    return entries.length ? `${text}${suffix}` : { text: `${text}${suffix}`, failed: true };
  }

  // ── WebUI ───────────────────────────────────────────────────────────

  private async invoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel === PANEL_FEEDS) {
      switch (method) {
        case 'list':
          return this.feedsView();
        case 'add': {
          const feed = this.store.add(asFeedInput(args[0]), this.feedDefaults());
          this.log.info(`新增订阅源「${feed.title}」`, { url: feed.url });
          return this.feedView(feed);
        }
        case 'update': {
          const id = String(args[0] ?? '');
          const feed = this.store.update(id, asFeedInput(args[1]));
          if (!feed) throw new Error(`没有这个订阅源：${id}`);
          return this.feedView(feed);
        }
        case 'remove': {
          const id = String(args[0] ?? '');
          return { removed: this.store.remove(id) };
        }
        case 'pull': {
          const feed = this.requireFeed(args[0]);
          const result = await this.runFeed(feed, 'manual', { cacheMs: 0 });
          return {
            feedId: feed.id,
            feedTitle: feed.title,
            newCount: result.newCount,
            itemCount: result.items.length,
            error: result.error ?? null,
            titles: result.items.map((item) => item.title),
          };
        }
        case 'probe':
          return this.probe(args[0], args[1]);
        default:
          throw new Error(`未知方法：${panel}.${method}`);
      }
    }

    if (panel === PANEL_MESSAGES) {
      switch (method) {
        case 'list':
          return this.messagesView((args[0] ?? {}) as ArchiveQuery);
        case 'clear':
          return { cleared: this.store.clearArchive(args[0] ? String(args[0]) : undefined) };
        default:
          throw new Error(`未知方法：${panel}.${method}`);
      }
    }

    throw new Error(`未知面板：${panel}`);
  }

  private requireFeed(ref: unknown): FeedRecord {
    const key = String(ref ?? '');
    const feed = this.store.find(key);
    if (!feed) throw new Error(`没有这个订阅源：${key}`);
    return feed;
  }

  private feedDefaults(): FeedDefaults {
    const cfg = this.cfg();
    return {
      intervalMinutes: cfg.defaultIntervalMinutes ?? RSS_DEFAULTS.defaultIntervalMinutes,
      timeoutMs: cfg.defaultTimeoutMs ?? RSS_DEFAULTS.defaultTimeoutMs,
      maxNewItems: cfg.defaultMaxNewItems ?? RSS_DEFAULTS.defaultMaxNewItems,
      allowModel: cfg.defaultAllowModel !== false,
    };
  }

  /** 管理页的一次条目：设置 + 运行状态，都是能直接进 JSON 的值。 */
  private feedView(feed: FeedRecord): Record<string, unknown> {
    const now = this.nowMs();
    const next = nextRunAt(feed, now, this.timezone());
    return {
      id: feed.id,
      url: feed.url,
      title: feed.title,
      enabled: feed.enabled,
      intervalMinutes: feed.intervalMinutes,
      scheduleTimes: feed.scheduleTimes,
      scheduleText: describeSchedule(feed),
      timeoutMs: feed.timeoutMs,
      maxNewItems: feed.maxNewItems,
      allowModel: feed.allowModel,
      addedAt: feed.addedAt,
      lastAttemptAt: feed.lastAttemptAt ?? null,
      lastFetchedAt: feed.lastFetchedAt ?? null,
      lastFetchedText: feed.lastFetchedAt ? fmtLocal(feed.lastFetchedAt, this.timezone()) : null,
      lastError: feed.lastError ?? null,
      lastNewCount: feed.lastNewCount ?? 0,
      nextRunAt: next,
      nextRunText: next ? fmtLocal(new Date(next).toISOString(), this.timezone()) : null,
      seenCount: feed.seen.length,
      messageCount: this.store.archive().filter((entry) => entry.feedId === feed.id).length,
    };
  }

  private feedsView(): Record<string, unknown> {
    const feeds = this.store.list();
    return {
      feeds: feeds.map((feed) => this.feedView(feed)),
      defaults: this.feedDefaults(),
      timezone: this.timezone(),
      archiveCount: this.store.archive().length,
      running: this.inFlight.size > 0,
    };
  }

  private messagesView(query: ArchiveQuery): Record<string, unknown> {
    const page = this.store.archivePage({
      feedId: query.feedId,
      query: query.query,
      page: query.page,
      pageSize: clampInt(query.pageSize, 1, 100, 20),
    });
    const titles = new Map(this.store.list().map((feed) => [feed.id, feed.title]));
    return {
      total: page.total,
      page: page.page,
      pageCount: page.pageCount,
      pageSize: page.pageSize,
      feeds: this.store.list().map((feed) => ({ id: feed.id, title: feed.title })),
      rows: page.rows.map((entry) => ({
        feedId: entry.feedId,
        feedTitle: titles.get(entry.feedId) ?? entry.feedId,
        seq: entry.seq,
        title: entry.title,
        link: entry.link,
        summary: entry.summary,
        body: entry.body,
        timeText: fmtLocal(entry.publishedAt ?? entry.fetchedAt, this.timezone()),
        publishedAt: entry.publishedAt ?? null,
      })),
    };
  }

  /** 只读探一口：验证地址能不能用、解析出几条，不落任何状态。 */
  private async probe(url: unknown, timeout: unknown): Promise<Record<string, unknown>> {
    const address = String(url ?? '').trim();
    if (!address) return { ok: false, error: '先填一个订阅地址' };
    const timeoutMs = clampInt(timeout, 1000, 300_000, this.feedDefaults().timeoutMs);
    try {
      const response = await this.fetchText(address, { timeoutMs });
      const parsed = parseFeed(response.text);
      return {
        ok: true,
        kind: parsed.kind,
        title: parsed.title,
        siteUrl: parsed.siteUrl,
        description: parsed.description,
        entries: parsed.entries.length,
        bytes: response.bytes,
        sample: parsed.entries.slice(0, 3).map((entry) => ({
          title: entry.title,
          timeText: fmtLocal(entry.publishedAt, this.timezone()),
          link: entry.link,
          summary: entry.summary.slice(0, 160),
        })),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function sortNewestFirst(entries: readonly FeedEntry[]): FeedEntry[] {
  return [...entries].sort((a, b) => {
    const ak = a.publishedAt ?? '';
    const bk = b.publishedAt ?? '';
    if (ak === bk) return 0;
    return bk.localeCompare(ak);
  });
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * 编号解析：接受 `#12`、`12`、`＃12`、`" 12 "`，也接受数字本身。
 * 认不出返回 null（交给调用方写进「认不出」那一栏）。
 */
export function parseSeq(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^[#＃\s]+/, '');
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return parsed > 0 ? parsed : null;
}

/** 界面来的参数什么形状都可能有，这里只挑认识的键。 */
function asFeedInput(raw: unknown): FeedInput {
  const value = (raw ?? {}) as Record<string, unknown>;
  const input: FeedInput = {};
  // 改设置时不会带 url；只有真的填了地址才动它。
  if (typeof value.url === 'string' && value.url.trim()) input.url = value.url.trim();
  if (typeof value.title === 'string') input.title = value.title;
  if (typeof value.enabled === 'boolean') input.enabled = value.enabled;
  if (value.intervalMinutes !== undefined) input.intervalMinutes = String(value.intervalMinutes);
  if (value.scheduleTimes !== undefined) {
    input.scheduleTimes = Array.isArray(value.scheduleTimes)
      ? value.scheduleTimes.map((item) => String(item))
      : String(value.scheduleTimes);
  }
  if (value.timeoutMs !== undefined) input.timeoutMs = String(value.timeoutMs);
  if (value.maxNewItems !== undefined) input.maxNewItems = String(value.maxNewItems);
  if (typeof value.allowModel === 'boolean') input.allowModel = value.allowModel;
  return input;
}
