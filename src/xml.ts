/**
 * 极简 XML 解析器：只求读得动 RSS 2.0 / Atom / RSS 1.0（RDF）。
 *
 * 它不校验、不抛错、不保留注释：结构坏掉时给出已经读到的部分，让调用方按「读到几条」
 * 决定要不要报错。命名空间前缀原样留在节点名里（`dc:creator`），同时给出 `local`。
 */
import { decodeEntities } from './text.ts';

export interface XmlNode {
  /** 原样节点名，可能带前缀，如 `content:encoded`。 */
  name: string;
  /** 去掉前缀的节点名。 */
  local: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** 本节点连同后代的全部文本（textContent），实体已解开。 */
  text: string;
}

function makeNode(name: string): XmlNode {
  const colon = name.indexOf(':');
  return {
    name,
    local: colon >= 0 ? name.slice(colon + 1) : name,
    attrs: {},
    children: [],
    text: '',
  };
}

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;

function parseAttrs(raw: string, target: Record<string, string>): void {
  ATTR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR.exec(raw)) !== null) {
    const name = match[1];
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    target[name] = decodeEntities(value);
  }
}

/** 找第一个同名子节点。 */
export function child(node: XmlNode | null | undefined, ...names: string[]): XmlNode | null {
  if (!node) return null;
  for (const kid of node.children) {
    for (const name of names) {
      if (kid.name === name || kid.local === name) return kid;
    }
  }
  return null;
}

/** 同名子节点全都要（顺序保留）。 */
export function children(node: XmlNode | null | undefined, ...names: string[]): XmlNode[] {
  if (!node) return [];
  return node.children.filter((kid) => names.some((name) => kid.name === name || kid.local === name));
}

/** 子节点文本，去空白。 */
export function childText(node: XmlNode | null | undefined, ...names: string[]): string {
  return child(node, ...names)?.text.trim() ?? '';
}

/** 解析整份文档；返回 `#document` 根。返回值的 children 是顶层元素。 */
export function parseXml(source: string): XmlNode {
  const doc = makeNode('#document');
  const stack: XmlNode[] = [doc];
  const raw = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const length = raw.length;
  let i = 0;

  const appendText = (text: string): void => {
    if (!text) return;
    const top = stack[stack.length - 1];
    if (!top) return;
    top.text += decodeEntities(text);
  };

  while (i < length) {
    const lt = raw.indexOf('<', i);
    if (lt < 0) {
      appendText(raw.slice(i));
      break;
    }
    if (lt > i) appendText(raw.slice(i, lt));

    if (raw.startsWith('<!--', lt)) {
      const end = raw.indexOf('-->', lt + 4);
      i = end < 0 ? length : end + 3;
      continue;
    }
    if (raw.startsWith('<![CDATA[', lt)) {
      const end = raw.indexOf(']]>', lt + 9);
      const body = raw.slice(lt + 9, end < 0 ? length : end);
      // CDATA 里的内容不解实体：原样就是正文。
      const top = stack[stack.length - 1];
      if (top) top.text += body;
      i = end < 0 ? length : end + 3;
      continue;
    }
    if (raw.startsWith('<?', lt)) {
      const end = raw.indexOf('?>', lt + 2);
      i = end < 0 ? length : end + 2;
      continue;
    }
    if (raw.startsWith('<!', lt)) {
      // DOCTYPE 之类：跳到配对的 '>'，考虑内部的 [] 块。
      let depth = 0;
      let j = lt + 2;
      for (; j < length; j++) {
        const ch = raw[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    const gt = raw.indexOf('>', lt);
    if (gt < 0) break;
    const inner = raw.slice(lt + 1, gt);
    if (inner.startsWith('/')) {
      // 结束标签：弹到匹配的那一层；没有匹配就忽略。
      const name = inner.slice(1).trim();
      for (let k = stack.length - 1; k >= 1; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = gt + 1;
      continue;
    }
    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const space = body.search(/\s/);
    const name = (space < 0 ? body : body.slice(0, space)).trim();
    if (!name) {
      i = gt + 1;
      continue;
    }
    const node = makeNode(name);
    if (space >= 0) parseAttrs(body.slice(space + 1), node.attrs);
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = gt + 1;
  }

  // textContent：后序把子节点文本并进父节点。
  const finalize = (node: XmlNode): void => {
    for (const kid of node.children) finalize(kid);
    let text = node.text;
    for (const kid of node.children) text += kid.text;
    node.text = text;
  };
  finalize(doc);
  // 除了文档根，其余节点的 text 已经是全部后代文本；这里只收拾根节点重复拼接的部分。
  doc.text = '';
  return doc;
}

/** 顶层第一个元素（跳过 XML 声明与注释后剩下的那个）。 */
export function rootElement(doc: XmlNode): XmlNode | null {
  return doc.children.find((kid) => kid.name !== '#text') ?? null;
}
