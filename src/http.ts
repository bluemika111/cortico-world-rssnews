/**
 * 拉取订阅源的网络层：超时、体积上限、缓存验证（ETag / Last-Modified），
 * 以及把「拿回来的其实是网页/JSON」翻译成一句人能看懂的错误。
 */

export class FeedHttpError extends Error {
  readonly status?: number;
  readonly kind: 'network' | 'timeout' | 'status' | 'too-large' | 'not-feed' | 'bad-url';
  constructor(message: string, kind: FeedHttpError['kind'], status?: number) {
    super(message);
    this.name = 'FeedHttpError';
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

export interface FetchFeedTextOptions {
  timeoutMs: number;
  /** 响应体上限，缺省 6 MiB。 */
  maxBytes?: number;
  etag?: string;
  lastModified?: string;
  userAgent?: string;
  /** 宿主放弃本次调用时的信号；与超时合并，先到先停。 */
  signal?: AbortSignal;
}

export interface FetchFeedTextResult {
  /** 304 时为空串。 */
  text: string;
  status: number;
  notModified: boolean;
  bytes: number;
  etag?: string;
  lastModified?: string;
}

export const RSS_USER_AGENT = 'Coopanion-RSS/0.1 (+https://github.com/Pal-AI-Lab/Cortico)';

/** 只放行 http(s)：`file:`、`ftp:`、`data:` 一律拒绝。 */
export function assertHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FeedHttpError(`不是合法的网址：${raw}`, 'bad-url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FeedHttpError(`只支持 http / https 网址，这个源用的是 ${url.protocol}`, 'bad-url');
  }
  return url;
}

function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 400).toLowerCase().trimStart();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<head>') && head.includes('<meta');
}

/** 拉一次源。超时/网络错误/非 2xx 都抛 `FeedHttpError`，消息可直接给模型和界面看。 */
export async function fetchFeedText(rawUrl: string, opts: FetchFeedTextOptions): Promise<FetchFeedTextResult> {
  const url = assertHttpUrl(rawUrl);
  const maxBytes = opts.maxBytes ?? 6 * 1024 * 1024;
  const headers: Record<string, string> = {
    accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8',
    'user-agent': opts.userAgent ?? RSS_USER_AGENT,
  };
  if (opts.etag) headers['if-none-match'] = opts.etag;
  if (opts.lastModified) headers['if-modified-since'] = opts.lastModified;

  const timeoutMs = Math.max(1000, Math.round(opts.timeoutMs));
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new FeedHttpError(`拉取超时（${(timeoutMs / 1000).toFixed(0)} 秒内没有拿到响应）`, 'timeout');
    }
    throw new FeedHttpError(
      `连不上这个源：${cause?.code ?? cause?.message ?? (error instanceof Error ? error.message : String(error))}`,
      'network',
    );
  }

  if (response.status === 304) {
    return {
      text: '',
      status: 304,
      notModified: true,
      bytes: 0,
      ...(opts.etag ? { etag: opts.etag } : {}),
      ...(opts.lastModified ? { lastModified: opts.lastModified } : {}),
    };
  }

  if (!response.ok) {
    // 读一点响应体，方便判断是不是被反爬页面拦下来的。
    const peek = await response.text().catch(() => '');
    const hint = looksLikeHtml(peek) ? '，返回的是一张网页，可能需要登录或被反爬拦住' : '';
    throw new FeedHttpError(`源站返回 HTTP ${response.status}${hint}`, 'status', response.status);
  }

  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new FeedHttpError(`响应体 ${(declared / 1024 / 1024).toFixed(1)} MiB，超过上限 ${(maxBytes / 1024 / 1024).toFixed(1)} MiB`, 'too-large');
  }

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new FeedHttpError(`读取响应超时（${(timeoutMs / 1000).toFixed(0)} 秒）`, 'timeout');
    }
    throw new FeedHttpError(`读取响应失败：${error instanceof Error ? error.message : String(error)}`, 'network');
  }

  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > maxBytes) {
    throw new FeedHttpError(`响应体 ${(bytes / 1024 / 1024).toFixed(1)} MiB，超过上限 ${(maxBytes / 1024 / 1024).toFixed(1)} MiB`, 'too-large');
  }
  if (looksLikeHtml(text)) {
    throw new FeedHttpError('这个地址返回的是网页而不是 RSS / Atom，可能不是订阅源地址', 'not-feed');
  }
  if (!text.trim()) {
    throw new FeedHttpError('源返回了空内容', 'not-feed');
  }

  const etag = response.headers.get('etag') ?? undefined;
  const lastModified = response.headers.get('last-modified') ?? undefined;
  return {
    text,
    status: response.status,
    notModified: false,
    bytes,
    ...(etag ? { etag } : {}),
    ...(lastModified ? { lastModified } : {}),
  };
}
