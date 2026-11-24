/**
 * RSS / Atom 的两个页签：管理（订阅源清单与增删改）和消息（已经拉到的条目，给人看）。
 *
 * 面板只做两件事：把服务端 `invoke` 拿到的状态画出来，把操作交回去。
 * 设置项的默认值来自配置组，这里不放重复的旋钮；每个源自己的节奏与条数在管理页里改。
 */
import type { WebUiPanel, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

interface FeedRow {
  id: string;
  url: string;
  title: string;
  enabled: boolean;
  intervalMinutes: number;
  scheduleTimes: string[];
  scheduleText: string;
  timeoutMs: number;
  maxNewItems: number;
  allowModel: boolean;
  lastFetchedText: string | null;
  lastError: string | null;
  lastNewCount: number;
  nextRunText: string | null;
  messageCount: number;
}

interface FeedsState {
  feeds: FeedRow[];
  defaults: { intervalMinutes: number; timeoutMs: number; maxNewItems: number; allowModel: boolean };
  timezone: string;
  archiveCount: number;
}

interface MessageRow {
  feedId: string;
  feedTitle: string;
  title: string;
  link: string;
  summary: string;
  body: string;
  timeText: string;
}

interface MessagesState {
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  feeds: Array<{ id: string; title: string }>;
  rows: MessageRow[];
}

interface ProbeResult {
  ok: boolean;
  error?: string;
  kind?: string;
  title?: string;
  siteUrl?: string;
  entries?: number;
  bytes?: number;
  sample?: Array<{ title: string; timeText: string; link: string; summary: string }>;
}

const zh = {
  feeds: {
    title: 'Rss/Atom 管理',
    desc: '加源、改节奏、看状态。每个源自己决定多久拉一次、几点拉、超时多长、一次递几条。',
    refresh: '刷新',
    empty: '还没有订阅源。填一个地址，比如 https://example.com/feed.xml',
    colTitle: '名称',
    colUrl: '地址',
    colState: '状态',
    colSchedule: '拉取',
    colLimit: '一次最多',
    colModel: '模型可拉',
    colLast: '上次',
    colActions: '操作',
    addTitle: '添加订阅源',
    editTitle: '修改订阅源',
    url: '订阅地址',
    urlPlaceholder: 'https://example.com/feed.xml',
    name: '名称（留空用源标题）',
    interval: '间隔（分钟，0 = 不按间隔）',
    times: '定时拉取（HH:MM，逗号分隔，可留空）',
    timeout: '超时（秒）',
    maxItems: '一次最多递几条',
    allowModel: '允许她自己拉这个源',
    enabled: '启用',
    add: '添加',
    save: '保存修改',
    cancel: '取消',
    probe: '测试地址',
    edit: '编辑',
    pull: '立即拉取',
    disable: '停用',
    enable: '启用',
    remove: '删除',
    on: '启用',
    off: '停用',
    yes: '可以',
    no: '不可以',
    never: '还没拉过',
    next: '下次',
    messages: '条消息',
    pulled: (fresh: number, handed: number) => (fresh
      ? `拉到 ${fresh} 条新消息（这次递了 ${handed} 条）`
      : `没有新消息（这次递了 ${handed} 条）`),
    removed: '已删除',
    saved: '已保存',
    added: '已添加',
    confirmRemove: '删掉这个订阅源？它的设置和已拉到的消息都会一起消失。',
    probeOk: (r: ProbeResult) => `能读：${r.title || '(没有标题)'} · ${r.kind ?? '未知格式'} · ${r.entries ?? 0} 条`,
    probeFailed: '读不了',
    failed: '失败',
    itemUnit: '条',
    timeoutUnit: '秒',
    copyLink: '复制链接',
  },
  messages: {
    title: 'Rss/Atom 源的消息',
    desc: '已经拉到的条目，从新到旧；点一条看正文和链接。',
    refresh: '刷新',
    clear: '清空消息',
    clearAll: '全部',
    all: '全部来源',
    search: '在标题、摘要里找',
    empty: '还没有消息。管理页加个源、拉一次就有了。',
    noHits: '没有匹配的消息。',
    count: (n: number, page: number, pages: number) => `${n} 条 · 第 ${page}/${pages} 页`,
    prev: '上一页',
    next: '下一页',
    readMore: '点开看正文',
    confirmClear: '清空消息存档？订阅源会留着。',
    cleared: (n: number) => `清掉了 ${n} 条`,
    failed: '失败',
    link: '原文链接',
    emptyBody: '这条消息没有正文，只有标题。',
  },
};

const en: typeof zh = {
  feeds: {
    title: 'RSS / Atom feeds',
    desc: 'Add feeds, adjust cadence, watch state. Each feed decides its own interval, clock times, timeout and item limit.',
    refresh: 'Refresh',
    empty: 'No feed yet. Paste an address, e.g. https://example.com/feed.xml',
    colTitle: 'Name',
    colUrl: 'Address',
    colState: 'State',
    colSchedule: 'Cadence',
    colLimit: 'Per pull',
    colModel: 'Model pulls',
    colLast: 'Last',
    colActions: 'Actions',
    addTitle: 'Add a feed',
    editTitle: 'Edit feed',
    url: 'Feed URL',
    urlPlaceholder: 'https://example.com/feed.xml',
    name: 'Name (empty = feed title)',
    interval: 'Interval (minutes, 0 = none)',
    times: 'Clock times (HH:MM, comma separated, optional)',
    timeout: 'Timeout (seconds)',
    maxItems: 'Items per pull',
    allowModel: 'She may pull this feed',
    enabled: 'Enabled',
    add: 'Add',
    save: 'Save',
    cancel: 'Cancel',
    probe: 'Test address',
    edit: 'Edit',
    pull: 'Pull now',
    disable: 'Disable',
    enable: 'Enable',
    remove: 'Delete',
    on: 'on',
    off: 'off',
    yes: 'yes',
    no: 'no',
    never: 'never',
    next: 'next',
    messages: 'messages',
    pulled: (fresh: number, handed: number) => (fresh
      ? `pulled ${fresh} new items (${handed} handed over)`
      : `nothing new (${handed} items)`),
    removed: 'Deleted',
    saved: 'Saved',
    added: 'Added',
    confirmRemove: 'Delete this feed? Its settings and already pulled messages go with it.',
    probeOk: (r: ProbeResult) => `Readable: ${r.title || '(no title)'} · ${r.kind ?? 'unknown'} · ${r.entries ?? 0} entries`,
    probeFailed: 'Unreadable',
    failed: 'Failed',
    itemUnit: 'items',
    timeoutUnit: 's',
    copyLink: 'Copy link',
  },
  messages: {
    title: 'Feed messages',
    desc: 'Items already pulled, newest first; open one for the body and link.',
    refresh: 'Refresh',
    clear: 'Clear messages',
    clearAll: 'all',
    all: 'All feeds',
    search: 'Search titles and summaries',
    empty: 'No message yet. Add a feed and pull once.',
    noHits: 'No matching message.',
    count: (n: number, page: number, pages: number) => `${n} items · page ${page}/${pages}`,
    prev: 'Previous',
    next: 'Next',
    readMore: 'open for the body',
    confirmClear: 'Clear the message archive? Feeds stay.',
    cleared: (n: number) => `cleared ${n}`,
    failed: 'Failed',
    link: 'Source link',
    emptyBody: 'This item has no body, only a title.',
  },
};

const stringsFor = (language: string) => (String(language).toLowerCase().startsWith('zh') ? zh : en);

/** 把一次点击做成「跑起来、把结果写进一行消息」，失败不抛到界面上。 */
async function attempt<T>(message: HTMLElement, run: () => Promise<T>, done: (value: T) => string): Promise<void> {
  message.classList.remove('bad');
  try {
    message.textContent = done(await run());
  } catch (error) {
    message.classList.add('bad');
    message.textContent = error instanceof Error ? error.message : String(error);
  }
}

function secondsText(ms: number): string {
  return `${Math.round(ms / 1000)}`;
}

const feedsPanel: WebUiPanel = {
  mount: async (ctx: WebUiPanelContext) => {
    const S = stringsFor(ctx.language).feeds;
    const { ui, root } = ctx;

    const card = ui.sheet({ title: S.title, desc: S.desc });
    const status = ui.msgline('');
    const refresh = ui.button(S.refresh);
    const topBar = ui.rowbar();
    topBar.append(refresh, status);

    /** 次要说明：小一号、淡一点。用行内样式引主题变量，不依赖没定义的 class。 */
    const sub = (text: string): HTMLDivElement => {
      const el = ui.h('div', null, text);
      el.style.color = 'var(--ink-soft)';
      el.style.fontSize = '12px';
      el.style.marginTop = '2px';
      return el;
    };
    // ── 表单 ────────────────────────────────────────────────────────
    const form = ui.sheet({ title: S.addTitle });
    const url = ui.input({ placeholder: S.urlPlaceholder, cls: 'mono' });
    const name = ui.input({ placeholder: S.name });
    const interval = ui.input({ type: 'number', value: '' });
    const times = ui.input({ placeholder: '08:00, 20:00' });
    const timeout = ui.input({ type: 'number', value: '' });
    const maxItems = ui.input({ type: 'number', value: '' });
    const allowModel = ui.checkbox(S.allowModel, { checked: true });
    const enabled = ui.checkbox(S.enabled, { checked: true });

    const grid = ui.h('div', 'statgrid');
    grid.append(
      ui.field(S.url, url),
      ui.field(S.name, name),
      ui.field(S.interval, interval),
      ui.field(S.times, times),
      ui.field(S.timeout, timeout),
      ui.field(S.maxItems, maxItems),
    );

    const addButton = ui.button(S.add, { variant: 'primary' });
    const probeButton = ui.button(S.probe);
    const saveButton = ui.button(S.save, { variant: 'primary' });
    const cancelButton = ui.button(S.cancel);
    saveButton.style.display = 'none';
    cancelButton.style.display = 'none';
    const formBar = ui.rowbar();
    formBar.append(addButton, probeButton, saveButton, cancelButton, allowModel.el, enabled.el);
    const formNote = ui.msgline('');
    form.body.append(grid, formBar, formNote);

    // ── 列表 ────────────────────────────────────────────────────────
    const table = ui.table({
      head: [S.colTitle, S.colSchedule, S.colLimit, S.colModel, S.colLast, S.colActions],
      maxHeight: 'calc(100vh - 520px)',
    });
    card.body.append(topBar, table.el);
    root.append(card.el, form.el);

    let editing: string | null = null;
    let lastState: FeedsState | null = null;

    const resetForm = () => {
      editing = null;
      const heading = form.el.querySelector('h3');
      if (heading) heading.textContent = S.addTitle;
      url.value = '';
      name.value = '';
      interval.value = '';
      times.value = '';
      timeout.value = '';
      maxItems.value = '';
      const defaults = lastState?.defaults;
      if (defaults) {
        interval.placeholder = String(defaults.intervalMinutes);
        timeout.placeholder = secondsText(defaults.timeoutMs);
        maxItems.placeholder = String(defaults.maxNewItems);
        allowModel.setChecked(defaults.allowModel);
      }
      enabled.setChecked(true);
      addButton.style.display = '';
      saveButton.style.display = 'none';
      cancelButton.style.display = 'none';
    };

    const formValues = () => ({
      url: url.value.trim(),
      title: name.value.trim(),
      intervalMinutes: interval.value.trim() || undefined,
      scheduleTimes: times.value.trim(),
      timeoutMs: timeout.value.trim() ? String(Number(timeout.value.trim()) * 1000) : undefined,
      maxNewItems: maxItems.value.trim() || undefined,
      allowModel: allowModel.checked,
      enabled: enabled.checked,
    });

    const render = (state: FeedsState) => {
      lastState = state;
      table.clear(S.empty);
      if (!editing) resetForm();

      for (const feed of state.feeds) {
        const errorPill = feed.lastError ? ui.pill(S.failed, 'off') : null;
        const titleCell = ui.h('div');
        titleCell.append(ui.h('div', null, feed.title));
        titleCell.append(sub(feed.url));
        if (errorPill) {
          const err = ui.h('div', 'msgline bad', feed.lastError ?? '');
          titleCell.append(err);
        }

        const limitCell = ui.h('div');
        limitCell.append(ui.h('div', null, `${feed.maxNewItems} ${S.itemUnit}`));
        limitCell.append(sub(`${secondsText(feed.timeoutMs)}${S.timeoutUnit}`));

        const lastCell = ui.h('div');
        lastCell.append(ui.h('div', null, feed.lastFetchedText ?? S.never));
        const detail = feed.lastNewCount > 0 ? `${feed.lastNewCount} ${S.itemUnit}` : `${feed.messageCount} ${S.messages}`;
        lastCell.append(sub(feed.nextRunText ? `${S.next} ${feed.nextRunText}` : detail));

        const actions = ui.h('div', 'rowbar');
        const edit = ui.button(S.edit, { size: 'sm' });
        edit.addEventListener('click', () => {
          editing = feed.id;
          const heading = form.el.querySelector('h3');
          if (heading) heading.textContent = S.editTitle;
          url.value = feed.url;
          name.value = feed.title;
          interval.value = String(feed.intervalMinutes);
          times.value = feed.scheduleTimes.join(', ');
          timeout.value = secondsText(feed.timeoutMs);
          maxItems.value = String(feed.maxNewItems);
          allowModel.setChecked(feed.allowModel);
          enabled.setChecked(feed.enabled);
          addButton.style.display = 'none';
          saveButton.style.display = '';
          cancelButton.style.display = '';
          formNote.textContent = '';
          formNote.classList.remove('bad');
        }, { signal: ctx.signal });

        const pull = ui.button(S.pull, { size: 'sm' });
        pull.addEventListener('click', () => void attempt(formNote, () => ctx.invoke<{ newCount: number; itemCount: number }>('pull', [feed.id]), (result) => {
          void load();
          return S.pulled(result.newCount, result.itemCount);
        }), { signal: ctx.signal });

        const toggle = ui.button(feed.enabled ? S.disable : S.enable, { size: 'sm' });
        toggle.addEventListener('click', () => void attempt(formNote, () => ctx.invoke('update', [feed.id, { enabled: !feed.enabled }]), () => {
          void load();
          return S.saved;
        }), { signal: ctx.signal });

        const remove = ui.button(S.remove, { size: 'sm', variant: 'danger' });
        remove.addEventListener('click', () => void (async () => {
          const ok = await ui.confirm({ title: S.remove, body: S.confirmRemove, danger: true });
          if (!ok) return;
          await attempt(formNote, () => ctx.invoke('remove', [feed.id]), () => {
            void load();
            return S.removed;
          });
        })(), { signal: ctx.signal });

        actions.append(edit, pull, toggle, remove);
        table.addRow([
          { el: titleCell },
          { text: feed.scheduleText },
          { el: limitCell },
          { el: ui.pill(feed.allowModel ? S.yes : S.no, feed.allowModel ? 'on' : 'plain') },
          { el: lastCell },
          { el: actions },
        ]);
      }
    };

    const load = async () => {
      await attempt(status, () => ctx.invoke<FeedsState>('list'), (state) => {
        render(state);
        return `${state.feeds.length} ${S.itemUnit}${state.timezone ? ` · ${state.timezone}` : ''}`;
      });
      await ctx.refresh();
    };

    addButton.addEventListener('click', () => void attempt(formNote, () => ctx.invoke('add', [formValues()]), () => {
      resetForm();
      void load();
      return S.added;
    }), { signal: ctx.signal });

    saveButton.addEventListener('click', () => void attempt(formNote, () => {
      const id = editing;
      if (!id) throw new Error(S.failed);
      return ctx.invoke('update', [id, formValues()]).then((value) => {
        resetForm();
        void load();
        return value;
      });
    }, () => S.saved), { signal: ctx.signal });

    cancelButton.addEventListener('click', () => {
      if (lastState) render(lastState);
      else resetForm();
    }, { signal: ctx.signal });

    probeButton.addEventListener('click', () => void attempt(formNote, () => ctx.invoke<ProbeResult>('probe', [
      url.value.trim(),
      timeout.value.trim() ? Number(timeout.value.trim()) * 1000 : undefined,
    ]), (result) => {
      if (!result.ok) {
        formNote.classList.add('bad');
        return `${S.probeFailed}：${result.error ?? ''}`;
      }
      formNote.classList.remove('bad');
      return S.probeOk(result);
    }), { signal: ctx.signal });

    refresh.addEventListener('click', () => void load(), { signal: ctx.signal });
    await load();
  },
};

const messagesPanel: WebUiPanel = {
  mount: async (ctx: WebUiPanelContext) => {
    const S = stringsFor(ctx.language).messages;
    const { ui, root } = ctx;

    const card = ui.sheet({ title: S.title, desc: S.desc });
    const status = ui.msgline('');
    const feedSelect = ui.select({ options: [S.all] });
    const query = ui.input({ type: 'search', placeholder: S.search });
    const refresh = ui.button(S.refresh, { variant: 'primary' });
    const clear = ui.button(S.clear, { variant: 'danger', size: 'sm' });
    const bar = ui.rowbar();
    bar.append(feedSelect, query, refresh, clear, status);
    // 面板只碰自己的根节点；不依赖全局 document（宿主可能在不同文档里挂它）。
    const doc = (root.ownerDocument ?? globalThis.document) as Document;

    const list = ui.log({ variant: 'conversation', maxHeight: 'calc(100vh - 300px)', empty: S.empty });
    const prev = ui.button(S.prev, { size: 'sm' });
    const next = ui.button(S.next, { size: 'sm' });
    const pageLabel = ui.msgline('');
    const pager = ui.rowbar();
    pager.append(prev, next, pageLabel);

    card.body.append(bar, list.el, pager);
    root.append(card.el);

    let page = 1;
    let feedId = '';
    let last: MessagesState | null = null;

    const showRow = (row: MessageRow) => {
      const titleLine = list.append(row.title, 'plain');
      titleLine.style.cursor = 'pointer';
      titleLine.title = S.readMore;
      list.append(`${row.timeText} · ${row.feedTitle}`, 'dim');
      if (row.summary && row.summary !== row.title) list.append(row.summary, 'plain');
      list.append('', 'dim');

      const open = () => {
        const body = ui.h('div');
        body.append(ui.msgline(`${row.feedTitle} · ${row.timeText}`));
        const text = ui.h('div');
        text.textContent = row.body || row.summary || S.emptyBody;
        text.style.whiteSpace = 'pre-wrap';
        body.append(text);
        if (row.link) {
          const linkRow = ui.rowbar();
          const anchor = ui.h('a', 'mono', row.link);
          anchor.href = row.link;
          anchor.target = '_blank';
          anchor.rel = 'noreferrer';
          linkRow.append(anchor);
          body.append(ui.section(S.link), linkRow);
        }
        ctx.own(ui.drawer(row.title, body));
      };
      titleLine.addEventListener('click', open, { signal: ctx.signal });
    };

    const render = (state: MessagesState) => {
      last = state;
      const options: Array<{ value: string; label: string }> = [{ value: '', label: S.all }];
      for (const feed of state.feeds) options.push({ value: feed.id, label: feed.title });
      const current = feedId;
      feedSelect.replaceChildren(...options.map((option) => {
        const node = doc.createElement('option');
        node.value = option.value;
        node.textContent = option.label;
        return node;
      }));
      feedSelect.value = current;

      list.clear();
      if (!state.rows.length) {
        list.append(query.value.trim() ? S.noHits : S.empty, 'dim');
      } else {
        for (const row of state.rows) showRow(row);
      }
      pageLabel.textContent = S.count(state.total, state.page, state.pageCount);
      prev.disabled = state.page <= 1;
      next.disabled = state.page >= state.pageCount;
    };

    const load = async () => {
      await attempt(status, () => ctx.invoke<MessagesState>('list', [{
        feedId: feedId || undefined,
        query: query.value.trim() || undefined,
        page,
        pageSize: 20,
      }]), (state) => {
        render(state);
        return '';
      });
    };

    feedSelect.addEventListener('change', () => {
      feedId = feedSelect.value;
      page = 1;
      void load();
    }, { signal: ctx.signal });

    query.addEventListener('input', () => {
      page = 1;
      void load();
    }, { signal: ctx.signal });

    refresh.addEventListener('click', () => { page = last?.page ?? 1; void load(); }, { signal: ctx.signal });

    prev.addEventListener('click', () => { page = Math.max(1, page - 1); void load(); }, { signal: ctx.signal });
    next.addEventListener('click', () => { page = Math.min(last?.pageCount ?? 1, page + 1); void load(); }, { signal: ctx.signal });

    clear.addEventListener('click', () => void (async () => {
      const ok = await ui.confirm({ title: S.clear, body: S.confirmClear, danger: true });
      if (!ok) return;
      await attempt(status, () => ctx.invoke<{ cleared: number }>('clear', [feedId || undefined]), (result) => {
        page = 1;
        void load();
        return S.cleared(result.cleared);
      });
    })(), { signal: ctx.signal });

    await load();
  },
};

export default {
  panels: {
    feeds: feedsPanel,
    messages: messagesPanel,
  },
};
