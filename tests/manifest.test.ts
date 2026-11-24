/**
 * 发布前检查（`pnpm check:extension`）在这里以测试的形式跑：
 * manifest 解析、包与定义的一致性、`describe.json` 与代码里的自描述逐字相同。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXTENSION_API_VERSIONS, parseExtensionManifest } from 'cortico/extensions/manifest.ts';
import { checkDescribe } from 'cortico/extensions/describe-export.ts';
import { RSS } from '../src/definition.ts';

const pkgDir = process.cwd();
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as Record<string, unknown>;

let scratchDir: string;
beforeEach(() => { scratchDir = mkdtempSync(join(tmpdir(), 'rss-check-')); });
afterEach(() => rmSync(scratchDir, { recursive: true, force: true }));

describe('扩展契约', () => {
  it('manifest 认得出是 world，契约版本与框架一致', () => {
    const parsed = parseExtensionManifest(pkg, 'en');
    if (!parsed.ok) throw new Error(`manifest 不合法：${parsed.reasons.join('；')}`);
    expect(parsed.manifest.kind).toBe('world');
    expect(parsed.manifest.api).toBe(EXTENSION_API_VERSIONS.world);
    expect(parsed.warnings).toEqual([]);
  });

  it('包的 id 与定义一致，并且有浏览器端产物声明', () => {
    expect(RSS.id).toBe('rss');
    expect(pkg.name).toBe('cortico-world-rssnews');
    const cortico = pkg.cortico as Record<string, unknown>;
    expect(cortico.webUiClient).toBe('dist/webui.js');
    expect(pkg.files).toContain('dist');
  });

  it('describe.json 与代码里的自描述逐字相同', async () => {
    const report = await checkDescribe('world', RSS, 'describe.json', {
      scratchDir,
      packageDir: pkgDir,
      repoRoot: pkgDir,
      language: 'zh',
    });
    expect(report.failures).toEqual([]);
  });

  it('describe.json 会随包发布', () => {
    expect(pkg.files).toContain('describe.json');
  });

  it('两个工具的声明都在 describe 里，事件类型一致', () => {
    const names = (RSS.describe?.tools ?? []).map((tool) => tool.name);
    expect(names).toEqual(['rss_fetch', 'rss_index']);
    expect((RSS.describe?.events ?? []).map((event) => event.type)).toEqual(['rss.new_items']);
    expect(RSS.describe?.tools.every((tool) => tool.tags.includes('read'))).toBe(true);
  });

  it('默认配置是关的，配置组覆盖的键都有默认值', () => {
    const defaults = RSS.defaults();
    expect(defaults.enabled).toBe(false);
    expect(defaults.defaultTimeoutMs).toBe(20_000);
    expect(defaults.defaultMaxNewItems).toBe(3);
    const world = RSS.create({
      id: 'rss',
      cfg: defaults,
      timezone: 'Asia/Shanghai',
      botName: 'test',
      botDir: scratchDir,
      packageDir: pkgDir,
      dataDir: join(scratchDir, 'data'),
      repoRoot: pkgDir,
      secret: () => '',
      storeSecret: () => {},
      persist: () => {},
      restart: async () => {},
    });
    const group = world.webUi?.('zh')?.config?.[0];
    for (const path of Object.keys(group?.schema.properties ?? {})) {
      const key = path.replace(/^worlds\.rss\./, '');
      expect((defaults as unknown as Record<string, unknown>)[key]).toBeDefined();
    }
  });
});
