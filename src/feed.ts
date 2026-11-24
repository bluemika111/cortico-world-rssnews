/**
 * RSS 2.0 / Atom / RSS 1.0（RDF）三种形状认到同一种条目上。
 * 认不出的文档不报「格式未知」了事：只要能找到 item / entry，就按条目读。
 */
import { child, childText, children, parseXml, rootElement, type XmlNode } from './xml.ts';
import { clip, oneLine, shortHash, stripHtml } from './text.ts';

export type FeedKind = 'rss' | 'atom' | 'rdf' | 'unknown';

export interface FeedEntry {
  /** 去重键：guid / id，其次链接，最后标题哈希。 */
  id: string;
  title: string;
  link: string;
  /** 纯文本正文。 */
  body: string;
  /** 纯文本摘要（比正文短）。 */
  summary: string;
  /** ISO 时间；源没给时缺省。 */
  publishedAt?: string;
  /** 源里原本的时间字符串，时间解析不出来时留着给人看。 */
  publishedRaw?: string;
  author?: string;
}

export interface ParsedFeed {
  kind: FeedKind;
  title: string;
  siteUrl: string;
  description: string;
  updatedAt?: string;
  entries: FeedEntry[];
}

export interface ParseFeedOptions {
  /** 摘要截断长度，缺省 200。 */
  summaryChars?: number;
}

export class FeedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedFormatError';
  }
}

/** RFC 822 / ISO 8601 两种时间写法都过一遍 `Date.parse`；失败返回 undefined。 */
export function parseDate(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  // `Tue, 24 Nov 2026 07:57:21 +0800` 与 `2026-11-24T07:57:21Z` Node 都认；
  // 个别源会写 `2026-11-24 07:57:21`（带空格不带时区），补个 T 再试一次。
  const candidates = [text, text.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?)/, '$1T$2')];
  for (const candidate of candidates) {
    const ms = Date.parse(candidate);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return undefined;
}

function atomLink(entry: XmlNode): string {
  const links = children(entry, 'link');
  let fallback = '';
  for (const link of links) {
    const href = (link.attrs.href ?? '').trim();
    if (!href) {
      // RSS 的 <link> 是文本；Atom 的是 href 属性，两种都允许。
      if (!fallback) fallback = link.text.trim();
      continue;
    }
    const rel = (link.attrs.rel ?? 'alternate').trim();
    if (rel === 'alternate') return href;
    if (!fallback) fallback = href;
  }
  return fallback;
}

function entryBody(entry: XmlNode): string {
  // content:encoded 通常是全文，Atom 的 content 也是全文；description / summary 更短。
  const raw = childText(entry, 'encoded')
    || childText(entry, 'content')
    || childText(entry, 'description')
    || childText(entry, 'summary');
  return stripHtml(raw);
}

function entryAuthor(entry: XmlNode): string | undefined {
  const direct = childText(entry, 'creator', 'author');
  if (direct) return oneLine(direct);
  const authorNode = child(entry, 'author');
  const name = authorNode ? childText(authorNode, 'name') : '';
  return name ? oneLine(name) : undefined;
}

function buildEntry(entry: XmlNode, kind: FeedKind, summaryChars: number): FeedEntry | null {
  const rawTitle = childText(entry, 'title');
  const title = oneLine(stripHtml(rawTitle));
  const link = kind === 'atom' ? atomLink(entry) : (childText(entry, 'link') || atomLink(entry));
  const body = entryBody(entry);
  if (!title && !body && !link) return null;

  const dateRaw = childText(entry, 'pubDate', 'published', 'updated', 'date', 'created');
  const publishedAt = parseDate(dateRaw);
  const guid = childText(entry, 'guid', 'id');
  // 去重键优先 guid、其次链接。两者都没有时用标题 + 时间凑一个，再不行用正文哈希。
  const rawKey = guid || link || `${title}#${publishedAt ?? dateRaw}` || shortHash(body);
  const id = clip(rawKey, 200);
  const author = entryAuthor(entry);

  return {
    id,
    title: title || oneLine(body).slice(0, 80) || link,
    link,
    body,
    summary: clip(oneLine(body), summaryChars),
    ...(publishedAt ? { publishedAt } : {}),
    ...(dateRaw ? { publishedRaw: dateRaw.trim() } : {}),
    ...(author ? { author } : {}),
  };
}

function channelMeta(root: XmlNode, kind: FeedKind): { title: string; siteUrl: string; description: string; updatedAt?: string } {
  const channel = kind === 'atom' ? root : (child(root, 'channel') ?? root);
  const title = oneLine(childText(channel, 'title'));
  const siteUrl = kind === 'atom' ? atomLink({ ...channel, children: children(channel, 'link') } as XmlNode) : childText(channel, 'link');
  const description = oneLine(stripHtml(childText(channel, 'description', 'subtitle', 'tagline')));
  const updatedAt = parseDate(childText(channel, 'lastBuildDate', 'updated', 'pubDate', 'date'));
  return { title, siteUrl, description, ...(updatedAt ? { updatedAt } : {}) };
}

/**
 * 解析一份订阅源。找不到任何条目也算解析成功（空源是常态），
 * 只有连 XML 元素都没有时才抛 `FeedFormatError`。
 */
export function parseFeed(source: string, opts: ParseFeedOptions = {}): ParsedFeed {
  const summaryChars = opts.summaryChars ?? 200;
  const doc = parseXml(source);
  const root = rootElement(doc);
  if (!root) throw new FeedFormatError('内容里没有 XML 元素');

  const lower = root.local.toLowerCase();
  const kind: FeedKind = lower === 'feed' ? 'atom' : lower === 'rdf' ? 'rdf' : lower === 'rss' ? 'rss' : 'unknown';

  const container = kind === 'atom' ? root : (child(root, 'channel') ?? root);
  const entryNodes = kind === 'atom'
    ? children(root, 'entry')
    : children(container, 'item').length
      ? children(container, 'item')
      : children(root, 'item');

  const entries: FeedEntry[] = [];
  const seen = new Set<string>();
  for (const node of entryNodes) {
    const entry = buildEntry(node, kind, summaryChars);
    if (!entry) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }

  const meta = channelMeta(root, kind);
  // 认不出的根元素（典型是 HTML 页面）又没有条目，就别装作读到了源。
  if (kind === 'unknown' && !entries.length) {
    throw new FeedFormatError(`不是 RSS / Atom：根元素是 <${root.name}>，里面也没有 item / entry`);
  }
  return {
    kind,
    title: meta.title,
    siteUrl: meta.siteUrl,
    description: meta.description,
    ...(meta.updatedAt ? { updatedAt: meta.updatedAt } : {}),
    entries,
  };
}
