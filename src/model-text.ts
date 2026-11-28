/**
 * 发给模型的文字：事件正文与两个工具的回执。
 * 这里只管「说清楚有什么」，不替她决定要不要开口。
 */
import type { FeedRecord } from './types.ts';

export interface ItemView {
  /** 存档编号，展示成 `#12`；低消耗模式下模型靠它点名要读全文。 */
  seq?: number;
  title: string;
  link: string;
  body: string;
  summary: string;
  publishedAt?: string;
  isNew?: boolean;
}

/** `#12`。没有编号时返回空串，调用方会退化成分行列表。 */
export function seqTag(seq: number | undefined): string {
  return typeof seq === 'number' && Number.isFinite(seq) ? `#${seq}` : '';
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

/**
 * 一条消息写成两三行：时间 + 标题，正文一段，链接一行。
 * `compact`（低消耗模式）时只留 `#编号 · 时间 · 标题`，正文与链接都不给——要读正文用 rss_read。
 */
export function renderItem(
  item: ItemView,
  opts: { timezone: string; maxChars: number; marker?: string; compact?: boolean },
): string {
  const when = fmtLocal(item.publishedAt, opts.timezone);
  const tag = seqTag(item.seq);
  const head = [opts.marker, tag, when, item.title].filter((part) => !!part).join(' · ');
  const lines = [`· ${head}`];
  if (opts.compact) return lines.join('\n');
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

/** 段头：`IT之家（id: f1b92rth）`。一次递给多个源时，id 必须跟着每个源走，别放到末尾。 */
export function feedHeading(title: string, id: string): string {
  return `${title}（id: ${id}）`;
}

/** 定时拉取抓到新消息时推出的事件正文。 */
export function renderNewItemsEvent(
  result: FetchResultView,
  timezone: string,
  maxChars: number,
  lowCost = false,
): string {
  const { feed, items } = result;
  const count = result.newCount;
  const lines: string[] = [`[RSS] ${feedHeading(feed.title, feed.id)}有 ${count} 条新消息`];
  for (const item of items) {
    lines.push(renderItem(item, {
      timezone,
      maxChars,
      marker: item.isNew === false ? '此前' : '新',
      compact: lowCost,
    }));
  }
  if (result.skipped > 0) {
    lines.push(`（还有 ${result.skipped} 条更新的没一并递上：这个源一次最多给 ${feed.maxNewItems} 条）`);
  }
  lines.push('');
  lines.push(
    lowCost
      ? `低消耗模式：上面只有编号、来源、时间、标题。要读哪条的全文，把它的编号交给 rss_read（比如 rss_read {"ids":["${
        seqTag(items[0]?.seq) || '#1'
      }"]}）。要更多或者按关键词翻用 rss_index，想马上再拉一次用 rss_fetch。`
      : '要更多或者要按关键词翻，用 rss_index；想马上再拉一次用 rss_fetch。',
  );
  return lines.join('\n');
}

export interface FetchDigestOptions {
  timezone: string;
  maxChars: number;
  notes?: readonly string[];
  /** 低消耗模式：只列编号、时间、标题。 */
  lowCost?: boolean;
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
    lines.push(`【${feedHeading(result.feed.title, result.feed.id)}】${result.cached ? '· 用的是刚才拉到的结果' : ''}`);
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
      lines.push(renderItem(item, {
        timezone: opts.timezone,
        maxChars: opts.maxChars,
        marker: `${index + 1}.${item.isNew === false ? '（已读过）' : ''}`,
        compact: opts.lowCost === true,
      }));
    });
    if (result.skipped > 0) {
      lines.push(`  （另有 ${result.skipped} 条更新的没递上来：这个源一次最多给 ${result.feed.maxNewItems} 条；要看全用 rss_index）`);
    }
  }
  if (opts.lowCost) {
    lines.push('');
    lines.push('低消耗模式：只有编号、来源、时间、标题。要读全文就把编号交给 rss_read。');
  }
  return lines.join('\n');
}

export interface IndexHit {
  seq?: number;
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
  /** 低消耗模式：命中只列编号与标题，不附正文。 */
  lowCost?: boolean;
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
    const tag = seqTag(hit.seq);
    lines.push(`${number}. ${tag ? `${tag} · ` : ''}「${hit.feed.title}」${when ? `${when} · ` : ''}${hit.title}`);
    if (opts.lowCost) {
      if (hit.matched.length && hit.matched.length < opts.keywords.length) {
        lines.push(`   命中：${hit.matched.join('、')}`);
      }
      return;
    }
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
  if (opts.lowCost) {
    lines.push('');
    lines.push('低消耗模式：只给了编号与标题。要读哪条的全文，把编号交给 rss_read。');
  }
  return lines.join('\n');
}

/** `rss_read` 的回执：把点名的几条完整正文摊开。 */
export interface ReadResultOptions {
  timezone: string;
  /** 每条最长多少字；0 表示不截断（存档本来就有限长）。 */
  maxChars: number;
  entries: readonly ReadEntry[];
  /** 点到的编号不存在，或已经不在存档里。 */
  missing: readonly number[];
  /** 编号格式认不出来的原始输入。 */
  unparsed: readonly string[];
  /** 存档里现有编号的范围。 */
  range: { min: number; max: number } | null;
}

export interface ReadEntry {
  seq: number;
  feedTitle: string;
  title: string;
  link: string;
  body: string;
  summary: string;
  publishedAt?: string;
  fetchedAt?: string;
}

export function renderReadResult(opts: ReadResultOptions): string {
  const lines: string[] = [];
  if (!opts.entries.length) {
    lines.push('没有读到任何消息。');
    if (opts.missing.length) lines.push(`这几个编号不在存档里：${opts.missing.map((seq) => `#${seq}`).join('、')}。`);
    if (opts.unparsed.length) lines.push(`这几个认不出编号：${opts.unparsed.join('、')}（要的是 #12 或 12 这种）。`);
    if (opts.range) {
      lines.push(`现在存档里的编号从 #${opts.range.min} 到 #${opts.range.max}；越老的越可能已经被存档上限挤掉了。`);
    } else {
      lines.push('存档现在是空的：消息页签拉一次就有了。');
    }
    return lines.join('\n');
  }

  lines.push(`读了 ${opts.entries.length} 条：`);
  opts.entries.forEach((entry, index) => {
    const when = fmtLocal(entry.publishedAt ?? entry.fetchedAt, opts.timezone);
    lines.push('');
    lines.push(`${index + 1}. #${entry.seq} · 「${entry.feedTitle}」${when ? `${when} · ` : ''}${entry.title}`);
    const text = opts.maxChars > 0 ? bodyOf({ title: entry.title, link: entry.link, body: entry.body, summary: entry.summary }, opts.maxChars) : (entry.body || entry.summary).trim();
    if (text) lines.push(...text.split('\n').map((line) => `   ${line}`));
    if (entry.link) lines.push(`   ${entry.link}`);
  });

  const problems: string[] = [];
  if (opts.missing.length) problems.push(`不在存档里：${opts.missing.map((seq) => `#${seq}`).join('、')}`);
  if (opts.unparsed.length) problems.push(`认不出：${opts.unparsed.join('、')}`);
  if (problems.length) {
    lines.push('');
    lines.push(`（${problems.join('；')}${opts.range ? `；现有编号 #${opts.range.min}–#${opts.range.max}` : ''}）`);
  }
  return lines.join('\n');
}
