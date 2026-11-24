/**
 * 发给模型的文字：事件正文与两个工具的回执。
 * 这里只管「说清楚有什么」，不替她决定要不要开口。
 */
import type { FeedRecord } from './types.ts';

export interface ItemView {
  title: string;
  link: string;
  body: string;
  summary: string;
  publishedAt?: string;
  isNew?: boolean;
}

export interface FetchResultView {
  feed: FeedRecord;
  error?: string;
  items: ItemView[];
  newCount: number;
  /** 超出「一次最多递几条」而没有递上来的新消息数量。 */
  skipped: number;
  /** 这次没有走网络（存档里就有）。 */
  cached?: boolean;
}

/** 部署时区里的 `YYYY-MM-DD HH:MM`。 */
export function fmtLocal(iso: string | undefined, timezone: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const values = formatter.formatToParts(date);
  const pick = (type: string) => values.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

/** 把调度说成人话，给环境提示词与工具回执用。 */
export function describeSchedule(feed: FeedRecord): string {
  const parts: string[] = [];
  if (feed.intervalMinutes > 0) parts.push(`每 ${feed.intervalMinutes} 分钟`);
  if (feed.scheduleTimes.length) parts.push(`每天 ${feed.scheduleTimes.join('、')}`);
  return parts.length ? parts.join(' · ') : '只在手动拉取时';
}

function bodyOf(item: ItemView, maxChars: number): string {
  if (maxChars <= 0) return '';
  const text = (item.body || item.summary || '').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** 一条消息写成两三行：时间 + 标题，正文一段，链接一行。 */
export function renderItem(item: ItemView, opts: { timezone: string; maxChars: number; marker?: string }): string {
  const when = fmtLocal(item.publishedAt, opts.timezone);
  const head = [opts.marker, when, item.title].filter((part) => !!part).join(' · ');
  const lines = [`· ${head}`];
  const body = bodyOf(item, opts.maxChars);
  if (body) lines.push(...body.split('\n').map((line) => `  ${line}`));
  if (item.link) lines.push(`  ${item.link}`);
  return lines.join('\n');
}

/** 一堆源里的一行，给「有哪些订阅源」这类地方用。 */
export function renderFeedLine(feed: FeedRecord): string {
  const flags = [
    feed.enabled ? '' : '已停用',
    `一次最多 ${feed.maxNewItems} 条`,
    `超时 ${(feed.timeoutMs / 1000).toFixed(0)} 秒`,
    feed.allowModel ? '可主动拉取' : '不允许模型拉取',
  ].filter((part) => !!part);
  return `- ${feed.title}（${feed.id}）${describeSchedule(feed)} · ${flags.join(' · ')}`;
}

/** 订阅源一览；没有源时给一句能听懂的空态。 */
export function renderFeedList(feeds: readonly FeedRecord[]): string {
  if (!feeds.length) return '（还没有订阅任何源）';
  return feeds.map((feed) => renderFeedLine(feed)).join('\n');
}

/** 定时拉取抓到新消息时推出的事件正文。 */
export function renderNewItemsEvent(result: FetchResultView, timezone: string, maxChars: number): string {
  const { feed, items } = result;
  const count = result.newCount;
  const head = `[RSS] ${feed.title} 有 ${count} 条新消息`;
  const lines: string[] = [head];
  for (const item of items) {
    lines.push(renderItem(item, { timezone, maxChars, marker: item.isNew === false ? '此前' : '新' }));
  }
  if (result.skipped > 0) {
    lines.push(`（还有 ${result.skipped} 条更新的没一并递上：这个源一次最多给 ${feed.maxNewItems} 条）`);
  }
  lines.push('');
  lines.push(
    `要更多或者要按关键词翻，用 rss_index（这个源的 id 是 ${feed.id}）；想马上再拉一次用 rss_fetch。`,
  );
  return lines.join('\n');
}

export interface FetchDigestOptions {
  timezone: string;
  maxChars: number;
  notes?: readonly string[];
}

/** `rss_fetch` 的回执：每个源一段。 */
export function renderFetchDigest(results: readonly FetchResultView[], opts: FetchDigestOptions): string {
  const lines: string[] = [];
  const notes = [...(opts.notes ?? [])];
  if (!results.length) {
    lines.push('现在没有可以拉取的源：要么还没订阅，要么这些源都停用了 / 不允许模型拉取。');
    if (notes.length) lines.push('', ...notes);
    return lines.join('\n');
  }
  const totalNew = results.reduce((sum, result) => sum + result.newCount, 0);
  lines.push(`RSS 立即拉取：${results.length} 个源，新消息共 ${totalNew} 条。`);
  if (notes.length) lines.push('', ...notes);

  for (const result of results) {
    lines.push('');
    lines.push(`【${result.feed.title}】（${result.feed.id}）${result.cached ? '· 用的是刚才拉到的结果' : ''}`);
    if (result.error) {
      lines.push(`  拉取失败：${result.error}`);
      continue;
    }
    if (!result.items.length) {
      lines.push('  这个源现在没有条目。');
      continue;
    }
    if (result.newCount === 0) lines.push('  没有新消息；下面是最近的几条：');
    result.items.forEach((item, index) => {
      lines.push(renderItem(item, { timezone: opts.timezone, maxChars: opts.maxChars, marker: `${index + 1}.${item.isNew === false ? '（已读过）' : ''}` }));
    });
    if (result.skipped > 0) {
      lines.push(`  （另有 ${result.skipped} 条更新的没递上来：这个源一次最多给 ${result.feed.maxNewItems} 条；要看全用 rss_index）`);
    }
  }
  return lines.join('\n');
}

export interface IndexHit {
  feed: FeedRecord;
  title: string;
  link: string;
  body: string;
  summary: string;
  publishedAt?: string;
  matched: string[];
}

export interface IndexDigestOptions {
  timezone: string;
  maxChars: number;
  keywords: readonly string[];
  mode: 'any' | 'all';
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  scanned: number;
  feedCount: number;
  truncated: number;
  hits: readonly IndexHit[];
}

/** `rss_index` 的回执：命中几条、这一页是哪几条、下一页怎么取。 */
export function renderIndexDigest(opts: IndexDigestOptions): string {
  const lines: string[] = [];
  const words = opts.keywords.join(' / ');
  if (!opts.total) {
    lines.push(`RSS 索引 · 关键词「${words}」· 在 ${opts.feedCount} 个源、${opts.scanned} 条消息里没有命中。`);
    lines.push('换更短的词、去掉限定词，或者放宽到 any（任一关键词命中）再试一次。');
    return lines.join('\n');
  }

  const headParts = [
    `RSS 索引 · 关键词「${words}」`,
    `匹配方式 ${opts.mode}`,
    `在 ${opts.feedCount} 个源、${opts.scanned} 条消息里命中 ${opts.total} 条`,
    `第 ${opts.page}/${opts.pageCount} 页`,
  ];
  lines.push(headParts.join(' · '));
  if (opts.truncated > 0) {
    lines.push(`（有的源条目超过单源上限，只翻了最新的那一部分；这次一共略过 ${opts.truncated} 条）`);
  }
  lines.push('');

  opts.hits.forEach((hit, index) => {
    const when = fmtLocal(hit.publishedAt, opts.timezone);
    const number = (opts.page - 1) * opts.pageSize + index + 1;
    lines.push(`${number}. 「${hit.feed.title}」${when ? `${when} · ` : ''}${hit.title}`);
    const body = bodyOf({ title: hit.title, link: hit.link, body: hit.body, summary: hit.summary }, opts.maxChars);
    if (body) lines.push(...body.split('\n').map((line) => `   ${line}`));
    if (hit.link) lines.push(`   ${hit.link}`);
    if (hit.matched.length && hit.matched.length < opts.keywords.length) {
      lines.push(`   命中：${hit.matched.join('、')}`);
    }
  });

  const rest = opts.total - opts.page * opts.pageSize;
  if (rest > 0) {
    const next = Math.min(opts.pageCount, opts.page + 1);
    lines.push('');
    lines.push(`还有 ${rest} 条：把 page 传 ${next} 再调一次。`);
  }
  return lines.join('\n');
}
