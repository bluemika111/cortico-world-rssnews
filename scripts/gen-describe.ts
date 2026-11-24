/**
 * 生成 describe.json：直接调框架的 `exportDescribe`，保证与 `check:extension` 的比对一条不差。
 * 用 esbuild 打包后运行（Node 不能直接 strip node_modules 里的 TS）：
 *   esbuild scripts/gen-describe.ts --bundle --platform=node --format=esm --outfile=scripts/.gen-describe.mjs
 *   node scripts/.gen-describe.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportDescribe } from 'cortico/extensions/describe-export.ts';
import { RSS } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const scratchDir = mkdtempSync(join(tmpdir(), 'rss-describe-'));
try {
  const file = await exportDescribe('world', RSS, { scratchDir, packageDir: root, repoRoot: root, language: 'zh' });
  if (!file) throw new Error('definition 没有 describe');
  writeFileSync(join(root, 'describe.json'), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  console.log(`describe.json: ${file.tools?.length ?? 0} tools, ${file.events?.length ?? 0} events, ${file.prompts?.length ?? 0} prompts`);
} finally {
  rmSync(scratchDir, { recursive: true, force: true });
}
