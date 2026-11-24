/**
 * 文本整理：把 HTML 摘要变成一行行能读的纯文本。
 * RSS 的 description 常常是转义过的 HTML（`&lt;p&gt;…`），XML 解析解开一层实体之后
 * 我们拿到的仍是标签，所以这里再剥一次。
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
  times: '×',
  copy: '©',
  reg: '®',
  laquo: '«',
  raquo: '»',
  bull: '•',
};

/** 解实体；认不出的原样留着（宁可显示 `&foo;` 也不要吞掉正文）。 */
export function decodeEntities(input: string): string {
  if (!input.includes('&')) return input;
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** 去掉脚本与样式块，删标签，解实体，按行收拢空白。 */
export function stripHtml(input: string): string {
  if (!input) return '';
  let text = input;
  // 注释与脚本/样式内容整体丢掉；<br>、</p>、</div> 这类块级边界换成换行。
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|figcaption)>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '· ');
  text = text.replace(/<[^>]*>/g, ' ');
  // 标签属性里没转义的实体在这一步之后才暴露出来，所以再解一次。
  text = decodeEntities(text);
  return collapse(text);
}

/** 全角空格、不换行空格、制表符都收成普通空格；连续空行压成一行。 */
export function collapse(input: string): string {
  if (!input) return '';
  const lines = input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2000-\u200a\u3000\t]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim());
  const out: string[] = [];
  for (const line of lines) {
    if (!line) {
      // 只留一个空行，且不留开头那个。
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/** 压成单行（用于标题、摘要这类放不下的地方）。 */
export function oneLine(input: string): string {
  return collapse(input).replace(/\s+/g, ' ').trim();
}

/** 按字符截断，保留可读的省略号。 */
export function clip(input: string, max: number): string {
  const text = input ?? '';
  if (max <= 0) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** 粗略判断一段文字是不是中文写的（正文已是中文时不必翻译/不必再解释）。 */
export function looksChinese(input: string): boolean {
  const text = input.slice(0, 400);
  if (!text) return false;
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return cjk / Math.max(1, text.length) >= 0.1;
}

/** 稳定的短哈希，给没有 guid 也没有链接的条目凑一个去重键。 */
export function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
