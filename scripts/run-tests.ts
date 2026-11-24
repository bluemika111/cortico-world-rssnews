/**
 * 本地测试入口：把测试文件打进来，用 vitest-shim 跑。
 * 打包命令见 package.json 的 test:local。
 */
import { run } from './vitest-shim.ts';
import '../tests/feed.test.ts';
import '../tests/schedule.test.ts';
import '../tests/search.test.ts';
import '../tests/store.test.ts';
import '../tests/world.test.ts';
import '../tests/webui.test.ts';
import '../tests/manifest.test.ts';
import '../tests/real-feed.test.ts';

await run();
