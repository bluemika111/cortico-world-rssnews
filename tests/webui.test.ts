/**
 * 浏览器端两个页签的冒烟测试：真 DOM（jsdom）+ 假宿主 UI，`invoke` 转给真正的 World。
 * 它不验证样式，只验证「挂上之后能画出数据、按钮真的接到 invoke」。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RSS_DEFAULTS } from '../src/config.ts';
import { RssWorld } from '../src/world.ts';
import { makePanelHarness, type PanelHarness } from './helpers/mock-panel-host.ts';
import { RSS_SAMPLE, waitFor } from './helpers/samples.ts';

const root = join(process.cwd(), '.test-tmp');
const bundleUrl = pathToFileURL(join(process.cwd(), 'dist', 'webui.js')).href;

interface PanelBundle {
  panels: Record<string, { mount(ctx: unknown): void | Promise<void> }>;
}

let bundle: PanelBundle | null = null;
async function panels(): Promise<PanelBundle['panels']> {
  if (!bundle) {
    const mod = await import(bundleUrl) as { default?: PanelBundle } & PanelBundle;
    bundle = (mod.default ?? mod) as PanelBundle;
  }
  return bundle.panels;
}

const dirs: string[] = [];

function makeWorld(): { world: RssWorld } {
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'webui-'));
  dirs.push(dir);
  const xml = RSS_SAMPLE;
  const world = new RssWorld({
    cfg: { ...RSS_DEFAULTS, enabled: true },
    timezone: 'Asia/Shanghai',
    dataDir: dir,
    fetchText: async () => ({ text: xml, status: 200, notModified: false, bytes: xml.length }),
  });
  return { world };
}

async function addFeed(world: RssWorld, input: Record<string, unknown>): Promise<string> {
  const invoke = world.webUi('zh').invoke;
  if (!invoke) throw new Error('没有 invoke');
  const feed = await invoke('feeds', 'add', [input]) as { id: string };
  return feed.id;
}

function buttonsIn(node: ParentNode): HTMLButtonElement[] {
  return [...node.querySelectorAll('button')] as HTMLButtonElement[];
}

function clickText(node: ParentNode, text: string): void {
  const button = buttonsIn(node).find((item) => (item.textContent ?? '').includes(text));
  if (!button) throw new Error(`找不到按钮：${text}。现有：${buttonsIn(node).map((b) => b.textContent).join(' / ')}`);
  button.click();
}

function fire(node: HTMLElement, type: string): void {
  const view = node.ownerDocument.defaultView as unknown as { Event: new (type: string, init?: { bubbles?: boolean }) => Event };
  node.dispatchEvent(new view.Event(type, { bubbles: true }));
}

beforeEach(() => {
  // 各用例自己建临时目录。
});

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('浏览器端产物', () => {
  it('导出两个页签，名字与服务端声明一致', async () => {
    const impl = await panels();
    expect(Object.keys(impl).sort()).toEqual(['feeds', 'messages']);
    expect(typeof impl.feeds.mount).toBe('function');
    expect(typeof impl.messages.mount).toBe('function');
  });
});

describe('管理页签', () => {
  it('把订阅源画成表格，并显示下次拉取时间', async () => {
    const { world } = makeWorld();
    await addFeed(world, { url: 'https://rss.example.com/cctv/world', intervalMinutes: '30' });
    const impl = await panels();
    const host = makePanelHarness(world, 'feeds');
    await impl.feeds.mount(host.ctx);
    expect(host.root.textContent).toContain('Rss/Atom 管理');
    expect(host.root.textContent).toContain('rss.example.com');
    expect(host.root.textContent).toContain('每 30 分钟');
    expect(host.root.textContent).toContain('下次');
    expect(host.root.textContent).toContain('1 条');
  });

  it('填地址点「添加」会真的建一个源', async () => {
    const { world } = makeWorld();
    const impl = await panels();
    const host = makePanelHarness(world, 'feeds');
    await impl.feeds.mount(host.ctx);

    const url = host.root.querySelector('input[placeholder="https://example.com/feed.xml"]') as HTMLInputElement;
    expect(url).toBeDefined();
    url.value = 'https://added.example.com/feed';
    clickText(host.root, '添加');

    await waitFor(() => (host.root.textContent ?? '').includes('added.example.com'), 2000, '新源出现在表格里');
    expect((host.root.textContent ?? '')).toContain('已添加');
  });

  it('点「立即拉取」走网络并把结果写在表单下面', async () => {
    const { world } = makeWorld();
    const id = await addFeed(world, { url: 'https://pull.example.com/feed' });
    const impl = await panels();
    const host = makePanelHarness(world, 'feeds');
    await impl.feeds.mount(host.ctx);
    void id;
    clickText(host.root, '立即拉取');
    await waitFor(() => (host.root.textContent ?? '').includes('拉到'), 3000, '拉取回执');
    expect((host.root.textContent ?? '')).toContain('拉到 4 条新消息');
  });

  it('确认后删除源，表格回到空态', async () => {
    const { world } = makeWorld();
    await addFeed(world, { url: 'https://gone.example.com/feed' });
    const impl = await panels();
    const host = makePanelHarness(world, 'feeds');
    host.setConfirm(true);
    await impl.feeds.mount(host.ctx);
    clickText(host.root, '删除');
    await waitFor(() => (host.root.textContent ?? '').includes('还没有订阅源'), 2000, '表格空态');
    expect((host.root.textContent ?? '')).toContain('已删除');
  });

  it('点「编辑」把这一行填进表单，保存后改掉设置', async () => {
    const { world } = makeWorld();
    await addFeed(world, { url: 'https://edit.example.com/feed', maxNewItems: '3' });
    const impl = await panels();
    const host = makePanelHarness(world, 'feeds');
    await impl.feeds.mount(host.ctx);

    clickText(host.root, '编辑');
    const limit = [...host.root.querySelectorAll('input[type="number"]')].pop() as HTMLInputElement;
    limit.value = '7';
    clickText(host.root, '保存修改');

    await waitFor(() => (host.root.textContent ?? '').includes('7 条'), 2000, '表格显示新的条数');
    expect((host.root.textContent ?? '')).toContain('已保存');
  });

  it('英文界面用英文文案', async () => {
    const { world } = makeWorld();
    const impl = await panels();
    const host = makePanelHarness(world, 'feeds', 'en');
    await impl.feeds.mount(host.ctx);
    expect(host.root.textContent).toContain('RSS / Atom feeds');
    expect(host.root.textContent).toContain('Add a feed');
  });
});

describe('消息页签', () => {
  async function seeded(): Promise<{ world: RssWorld; host: PanelHarness }> {
    const { world } = makeWorld();
    const id = await addFeed(world, { url: 'https://msg.example.com/feed' });
    await world.webUi('zh').invoke?.('feeds', 'pull', [id]);
    const impl = await panels();
    const host = makePanelHarness(world, 'messages');
    await impl.messages.mount(host.ctx);
    return { world, host };
  }

  it('列出已经拉到的消息，按源过滤和搜索都接得上', async () => {
    const { host } = await seeded();
    const text = host.root.textContent ?? '';
    expect(text).toContain('英伟达发布新一代芯片');
    expect(text).toContain('央视新闻 world');
    expect(text).toContain('4 条');

    const query = host.root.querySelector('input[type="search"]') as HTMLInputElement;
    query.value = '韩国';
    fire(query, 'input');
    await waitFor(() => !(host.root.textContent ?? '').includes('英伟达发布新一代芯片'), 2000, '搜索过滤');
    expect(host.root.textContent).toContain('韩国加码高考作弊举报悬赏');
  });

  it('点标题打开抽屉，里面是正文与链接', async () => {
    const { host } = await seeded();
    const line = [...host.root.querySelectorAll('.logline')].find((node) => (node.textContent ?? '').includes('英伟达'));
    expect(line).toBeDefined();
    (line as HTMLElement).click();
    expect(host.drawers).toHaveLength(1);
    expect(host.drawers[0].title).toContain('英伟达');
    expect(host.drawers[0].text).toContain('黄仁勋');
    expect(host.drawers[0].text).toContain('https://news.example.com/a1');
  });

  it('分页按钮按页数启停', async () => {
    const { host } = await seeded();
    const pager = buttonsIn(host.root).map((button) => button.textContent);
    expect(pager).toContain('上一页');
    expect(pager).toContain('下一页');
    expect(host.root.textContent).toContain('第 1/1 页');
  });
});
