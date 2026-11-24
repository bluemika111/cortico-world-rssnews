/**
 * 关键词索引：每个关键词分别对标题、正文、时间做包含匹配。
 * 关键词之间默认「命中任一即可」（`any`），也可以要求全中（`all`）。
 */

export type MatchMode = 'any' | 'all';

export interface SearchableEntry {
  title: string;
  body: string;
  summary?: string;
  link?: string;
  publishedAt?: string;
  publishedRaw?: string;
}

/** 时间也参与匹配：本地 `2026-11-24 15:57`、日期、时刻、ISO 原文都放进去。 */
export function timeHaystack(publishedAt: string | undefined, publishedRaw: string | undefined, timezone: string): string {
  const parts: string[] = [];
  if (publishedRaw) parts.push(publishedRaw);
  if (publishedAt) {
    parts.push(publishedAt);
    const date = new Date(publishedAt);
    if (Number.isFinite(date.getTime())) {
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
      const dateKey = `${pick('year')}-${pick('month')}-${pick('day')}`;
      const hhmm = `${pick('hour')}:${pick('minute')}`;
      parts.push(`${dateKey} ${hhmm}`, dateKey, hhmm);
    }
  }
  return parts.join(' ');
}

export function haystackOf(entry: SearchableEntry, timezone: string): string {
  return [
    entry.title,
    entry.summary ?? '',
    entry.body,
    entry.link ?? '',
    timeHaystack(entry.publishedAt, entry.publishedRaw, timezone),
  ].join('\n').toLowerCase();
}

/** 关键词清洗：去空白、去重、忽略大小写；空词丢掉。 */
export function normalizeKeywords(raw: unknown): string[] {
  const list: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) list.push(String(item ?? ''));
  } else if (typeof raw === 'string') {
    list.push(...raw.split(/[,，;；\n]+/));
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const word = item.trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

export function matches(entry: SearchableEntry, keywords: readonly string[], mode: MatchMode, timezone: string): boolean {
  if (!keywords.length) return false;
  const haystack = haystackOf(entry, timezone);
  const hits = keywords.map((keyword) => haystack.includes(keyword.toLowerCase()));
  return mode === 'all' ? hits.every(Boolean) : hits.some(Boolean);
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** 页码从 1 起；越界自动夹到合法范围（而不是给空页）。 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.round(pageSize));
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pageCount, Math.max(1, Math.round(Number.isFinite(page) ? page : 1)));
  const start = (current - 1) * size;
  return { rows: items.slice(start, start + size), total, page: current, pageSize: size, pageCount };
}
