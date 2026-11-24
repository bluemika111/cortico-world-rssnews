/**
 * 面板测试用的假宿主：真 DOM（jsdom）+ 只实现面板真正用到的那部分 `WebUi`。
 *
 * 故意不把 `WebUi` 的每个成员都实现一遍：面板一旦用了没实现的成员，测试就会在这里炸出来，
 * 正好是我们要的信号。
 */
import { JSDOM } from 'jsdom';
import type { WebUi, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import type { RssWorld } from '../../src/world.ts';

export interface PanelHarness {
  ctx: WebUiPanelContext;
  root: HTMLElement;
  document: Document;
  /** 打开过的抽屉（标题 + 内容文本）。 */
  drawers: Array<{ title: string; text: string }>;
  /** 关掉的确认框都按「确认」处理；要测取消就把它设成 false 的工厂。 */
  setConfirm(answer: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string | null, text?: string | null): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function makeUi(doc: Document, drawers: PanelHarness['drawers']): WebUi {
  const ui = {
    h: (tag: keyof HTMLElementTagNameMap, cls?: string | null, text?: string | null) => el(doc, tag, cls, text),
    esc: (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string),
    sheet: (opts: { title: string; en?: string; desc?: string }) => {
      const card = el(doc, 'div', 'sheet');
      const head = el(doc, 'div', 'shd');
      head.appendChild(el(doc, 'h3', null, opts.title));
      if (opts.desc) head.appendChild(el(doc, 'div', 'sh-desc', opts.desc));
      const body = el(doc, 'div', 'sh-body');
      card.append(head, body);
      return { el: card, body, note: el(doc, 'div', 'sh-note'), desc: head.querySelector('.sh-desc') as HTMLElement | null };
    },
    foldSheet: (id: string, opts: { title: string; desc?: string }) => ui.sheet(opts),
    rowbar: () => el(doc, 'div', 'rowbar'),
    section: (title: string, description?: string) => {
      const box = el(doc, 'div', 'shd');
      box.appendChild(el(doc, 'div', 'sh-title', title));
      if (description) box.appendChild(el(doc, 'div', 'sh-desc', description));
      return box;
    },
    actions: () => el(doc, 'div', 'actions'),
    button: (label: string, opts?: { variant?: string; size?: string; onClick?: (ev: MouseEvent) => void }) => {
      const node = el(doc, 'button', `btn ${opts?.variant ?? ''} ${opts?.size ?? ''}`.trim(), label);
      if (opts?.onClick) node.addEventListener('click', opts.onClick);
      return node;
    },
    copyButton: (text: string | (() => string)) => el(doc, 'button', 'btn sm', typeof text === 'function' ? text() : text),
    pill: (text: string, tone?: string) => el(doc, 'span', `pill ${tone ?? ''}`.trim(), text),
    chip: (text: string) => el(doc, 'span', 'chip', text),
    msgline: (text?: string, bad?: boolean) => el(doc, 'div', bad ? 'msgline bad' : 'msgline', text ?? ''),
    placeholder: (text: string) => el(doc, 'div', 'placeholder', text),
    input: (opts: { value?: string; placeholder?: string; cls?: string; type?: string; onInput?: (v: string) => void; onChange?: (v: string) => void }) => {
      const node = el(doc, 'input', `field ${opts.cls ?? ''}`.trim());
      if (opts.type) node.type = opts.type;
      if (opts.value !== undefined) node.value = opts.value;
      if (opts.placeholder) node.placeholder = opts.placeholder;
      if (opts.onInput) node.addEventListener('input', () => opts.onInput?.(node.value));
      if (opts.onChange) node.addEventListener('change', () => opts.onChange?.(node.value));
      return node;
    },
    select: (opts: { options?: readonly (string | { value: string; label?: string })[] }) => {
      const node = el(doc, 'select', 'field');
      for (const option of opts.options ?? []) {
        const item = doc.createElement('option');
        if (typeof option === 'string') {
          item.value = option;
          item.textContent = option;
        } else {
          item.value = option.value;
          item.textContent = option.label ?? option.value;
        }
        node.appendChild(item);
      }
      return node;
    },
    textarea: (opts: { value?: string; placeholder?: string } = {}) => {
      const node = el(doc, 'textarea', 'field');
      if (opts.value) node.value = opts.value;
      if (opts.placeholder) node.placeholder = opts.placeholder;
      return node;
    },
    promptInput: () => ({ el: el(doc, 'div', 'promptbox'), focus: () => {}, setDisabled: () => {}, setPlaceholder: () => {}, restore: () => {} }),
    checkbox: (label: string, opts?: { checked?: boolean; onChange?: (checked: boolean) => void }) => {
      const wrapper = el(doc, 'label', 'check');
      const input = el(doc, 'input');
      input.type = 'checkbox';
      input.checked = opts?.checked ?? false;
      if (opts?.onChange) input.addEventListener('change', () => opts.onChange?.(input.checked));
      wrapper.append(input, el(doc, 'span', null, label));
      return {
        el: wrapper,
        input,
        get checked() {
          return input.checked;
        },
        setChecked(checked: boolean) {
          input.checked = checked;
        },
      };
    },
    field: (label: string, control: HTMLElement) => {
      const wrapper = el(doc, 'label', 'fieldrow');
      wrapper.append(el(doc, 'span', 'flabel', label), control);
      return wrapper;
    },
    segmented: (items: readonly (string | { value: string; label?: string })[]) => {
      const node = el(doc, 'div', 'segwrap');
      return {
        el: node,
        get value() {
          return '';
        },
        setValue: () => {},
        items: items.length,
      };
    },
    table: (opts?: { head?: readonly string[] }) => {
      const wrap = el(doc, 'div', 'tablewrap');
      const table = el(doc, 'table');
      if (opts?.head?.length) {
        const thead = el(doc, 'thead');
        const row = el(doc, 'tr');
        for (const title of opts.head) row.appendChild(el(doc, 'th', null, title));
        thead.appendChild(row);
        table.appendChild(thead);
      }
      const body = el(doc, 'tbody');
      table.appendChild(body);
      wrap.appendChild(table);
      return {
        el: wrap,
        body,
        addRow: (cells: readonly unknown[]) => {
          // 有真实行进来时先撤掉空态占位（宿主行为如此）。
          body.querySelectorAll('td.placeholder').forEach((node) => node.closest('tr')?.remove());
          const row = el(doc, 'tr');
          for (const cell of cells) {
            const td = el(doc, 'td');
            if (cell === null || cell === undefined) td.textContent = '';
            else if (typeof cell === 'string' || typeof cell === 'number') td.textContent = String(cell);
            else if (cell instanceof Object && 'el' in (cell as Record<string, unknown>)) td.appendChild((cell as { el: HTMLElement }).el);
            else if (cell instanceof Object && 'text' in (cell as Record<string, unknown>)) td.textContent = String((cell as { text: unknown }).text ?? '');
            else if (cell instanceof Object && 'nodeType' in (cell as Record<string, unknown>)) td.appendChild(cell as HTMLElement);
            row.appendChild(td);
          }
          body.appendChild(row);
          return row;
        },
        clear: (empty?: string) => {
          body.replaceChildren();
          if (empty) {
            const row = el(doc, 'tr');
            const td = el(doc, 'td', 'placeholder', empty);
            td.colSpan = 9;
            row.appendChild(td);
            body.appendChild(row);
          }
        },
      };
    },
    kv: (rows: readonly { k: string; v: unknown }[]) => {
      const table = el(doc, 'table', 'kv');
      for (const row of rows) {
        const tr = el(doc, 'tr');
        tr.append(el(doc, 'td', null, row.k), el(doc, 'td', null, String(row.v ?? '')));
        table.appendChild(tr);
      }
      return table;
    },
    log: (opts?: { empty?: string }) => {
      const view = el(doc, 'div', 'logview');
      if (opts?.empty) view.appendChild(el(doc, 'div', 'placeholder', opts.empty));
      const append = (line: string, tone?: string) => {
        const row = el(doc, 'div', `logline ${tone ?? ''}`.trim(), line);
        view.appendChild(row);
        return row;
      };
      return {
        el: view,
        append,
        clear: () => {
          view.replaceChildren();
          if (opts?.empty) view.appendChild(el(doc, 'div', 'placeholder', opts.empty));
        },
        get count() {
          return view.querySelectorAll('.logline').length;
        },
        get stuck() {
          return true;
        },
        scrollToEnd: () => {},
      };
    },
    stat: (item: { k: string; v: unknown }) => {
      const node = el(doc, 'div', 'stat');
      node.append(el(doc, 'div', 'k', item.k), el(doc, 'div', 'v', String(item.v)));
      return node;
    },
    statgrid: () => el(doc, 'div', 'statgrid'),
    progress: () => ({ el: el(doc, 'div', 'progress'), value: 0, max: 1, setValue: () => {}, setLabel: () => {} }),
    toast: () => ({ dispose: () => {} }),
    confirm: async () => confirmAnswer,
    drawer: (title: string, body: string | HTMLElement) => {
      drawers.push({ title, text: typeof body === 'string' ? body : body.textContent ?? '' });
      return { dispose: () => {} };
    },
    lightbox: () => ({ dispose: () => {} }),
    busy: () => ({ dispose: () => {} }),
    disable: () => ({ dispose: () => {} }),
    fmt: {
      count: (n: number | null | undefined) => String(n ?? 0),
      bytes: (n: number | null | undefined) => `${n ?? 0}B`,
      percent: (r: number | null | undefined) => `${Math.round((r ?? 0) * 100)}%`,
      clock: (ts: unknown) => String(ts),
      money: (n: number | null | undefined) => String(n ?? 0),
      duration: (ms: number | null | undefined) => `${ms ?? 0}ms`,
    },
  };
  return ui as unknown as WebUi;
}

let confirmAnswer = true;

/** 造一个能挂面板的上下文；`invoke` 直接转给真正的 World。 */
export function makePanelHarness(world: RssWorld, panelId: string, language = 'zh'): PanelHarness {
  confirmAnswer = true;
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const document = dom.window.document as unknown as Document;
  // jsdom 只认它自己的 AbortSignal，Node 的全局那个会被拒。
  const WindowAbort = (dom.window as unknown as { AbortController: new () => AbortController }).AbortController;
  const controller = new WindowAbort();
  const root = document.createElement('div');
  const drawers: PanelHarness['drawers'] = [];
  const ctx = {
    pageId: 'world:rss',
    panelId,
    language,
    root,
    signal: controller.signal,
    invoke: async (method: string, args?: unknown[]) => {
      const invoke = world.webUi(language as Parameters<RssWorld['webUi']>[0]).invoke;
      if (!invoke) throw new Error('World 没有 invoke');
      return invoke(panelId, method, args ?? []);
    },
    invokeBinary: async () => new Blob(),
    pickPath: async () => null,
    setConfig: async () => '',
    stream: () => ({ send: () => {}, open: false, dispose: () => {} }),
    interval: () => ({ dispose: () => {} }),
    timeout: () => ({ dispose: () => {} }),
    frame: () => ({ dispose: () => {} }),
    own: <T,>(d: T) => d,
    memo: { get: <T,>(_key: string, fallback: T) => fallback, set: () => {} },
    guardLeave: () => ({ dispose: () => {} }),
    scope: {},
    mountSlot: async () => ({ dispose: () => {} }),
    ui: makeUi(document, drawers),
    refresh: async () => {},
  } as unknown as WebUiPanelContext;
  return {
    ctx,
    root,
    document,
    drawers,
    setConfirm: (answer: boolean) => {
      confirmAnswer = answer;
    },
  };
}
