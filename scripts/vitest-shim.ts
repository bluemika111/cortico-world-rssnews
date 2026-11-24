/**
 * 极简 vitest 兼容层：只实现本项目用到的断言与钩子。
 * 用途：沙箱里 vitest 起不来（禁止 spawn），用 esbuild 打包后直接跑。
 * 真实项目仍以 vitest 为准；这里只做本地验证。
 */

type Fn = () => void | Promise<void>;
interface Case { name: string; fn: Fn }
interface Suite { name: string; tests: Case[]; beforeEach: Fn[]; afterEach: Fn[] }

const suites: Suite[] = [];
let current: Suite | null = null;
const beforeAlls: Fn[] = [];
const afterAlls: Fn[] = [];
/** 文件顶层（不在任何 describe 里）登记的钩子，对所有用例生效。 */
const globalBeforeEach: Fn[] = [];
const globalAfterEach: Fn[] = [];

export function beforeAll(fn: Fn): void {
  beforeAlls.push(fn);
}

export function afterAll(fn: Fn): void {
  afterAlls.push(fn);
}

export function beforeEach(fn: Fn): void {
  if (current) current.beforeEach.push(fn);
  else globalBeforeEach.push(fn);
}

export function afterEach(fn: Fn): void {
  if (current) current.afterEach.push(fn);
  else globalAfterEach.push(fn);
}

function enter(name: string): Suite {
  const suite: Suite = { name, tests: [], beforeEach: [], afterEach: [] };
  suites.push(suite);
  return suite;
}

export function describe(name: string, fn: () => void): void {
  const prev = current;
  const suite = enter(name);
  current = suite;
  fn();
  current = prev;
}

/** 跳过：不登记的用例就是最好的跳过。 */
describe.skip = (_name: string, _fn: () => void): void => {};

export function it(name: string, fn: Fn): void {
  if (!current) {
    current = enter('(root)');
  }
  current.tests.push({ name, fn });
}

it.skip = (_name: string, _fn: Fn): void => {};

function fail(message: string): never {
  throw new Error(message);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function show(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

class Expectation {
  constructor(private readonly actual: unknown, private readonly negated = false) {}

  private check(ok: boolean, message: string): void {
    if (this.negated ? ok : !ok) fail(this.negated ? `not: ${message}` : message);
  }

  toBe(expected: unknown): void {
    this.check(Object.is(this.actual, expected), `expected ${show(this.actual)} to be ${show(expected)}`);
  }

  toEqual(expected: unknown): void {
    this.check(deepEqual(this.actual, expected), `expected ${show(this.actual)} to equal ${show(expected)}`);
  }

  toMatchObject(expected: unknown): void {
    this.check(subset(this.actual, expected), `expected ${show(this.actual)} to match ${show(expected)}`);
  }

  toHaveLength(n: number): void {
    const len = (this.actual as { length?: number })?.length;
    this.check(len === n, `expected length ${String(len)} to be ${n}`);
  }

  toContain(item: unknown): void {
    const ok = typeof this.actual === 'string'
      ? this.actual.includes(String(item))
      : Array.isArray(this.actual) && this.actual.includes(item);
    this.check(ok, `expected ${show(this.actual)} to contain ${show(item)}`);
  }

  toBeDefined(): void {
    this.check(this.actual !== undefined, 'expected value to be defined');
  }

  toBeUndefined(): void {
    this.check(this.actual === undefined, 'expected value to be undefined');
  }

  toBeTruthy(): void {
    this.check(Boolean(this.actual), `expected ${show(this.actual)} to be truthy`);
  }

  toBeFalsy(): void {
    this.check(!this.actual, `expected ${show(this.actual)} to be falsy`);
  }

  toBeGreaterThan(n: number): void {
    this.check((this.actual as number) > n, `expected ${String(this.actual)} to be greater than ${n}`);
  }

  toBeLessThan(n: number): void {
    this.check((this.actual as number) < n, `expected ${String(this.actual)} to be less than ${n}`);
  }

  toBeLessThanOrEqual(n: number): void {
    this.check((this.actual as number) <= n, `expected ${String(this.actual)} to be at most ${n}`);
  }

  toBeGreaterThanOrEqual(n: number): void {
    this.check((this.actual as number) >= n, `expected ${String(this.actual)} to be at least ${n}`);
  }

  /** `toThrow()` / `toThrow(ErrorClass)` / `toThrow('片段')`。 */
  toThrow(expected?: unknown): void {
    let threw = false;
    let caught: unknown;
    try {
      (this.actual as () => unknown)();
    } catch (error) {
      threw = true;
      caught = error;
    }
    if (!threw) {
      this.check(this.negated, 'expected the function to throw');
      return;
    }
    if (typeof expected === 'function') {
      const ok = caught instanceof (expected as new (...args: never[]) => unknown);
      this.check(ok, `expected the thrown value to be ${(expected as { name?: string }).name}, got ${String(caught)}`);
      return;
    }
    if (typeof expected === 'string') {
      this.check(String(caught).includes(expected), `expected the thrown message to include ${expected}, got ${String(caught)}`);
      return;
    }
    // 没给期望时，抛了就算满足。
    this.check(true, '');
  }

  get not(): Expectation {
    return new Expectation(this.actual, !this.negated);
  }

  get rejects(): { toThrow(message?: string): Promise<void> } {
    const promise = this.actual as Promise<unknown>;
    return {
      toThrow: async (message?: string) => {
        try {
          await promise;
        } catch (error) {
          if (message && !String(error).includes(message)) {
            fail(`expected rejection to include ${message}, got ${String(error)}`);
          }
          return;
        }
        fail('expected promise to reject');
      },
    };
  }
}

function subset(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
  if (actual === null || typeof actual !== 'object') return false;
  return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
    subset((actual as Record<string, unknown>)[key], value),
  );
}

export function expect(actual: unknown): Expectation {
  return new Expectation(actual);
}

export async function run(): Promise<void> {
  let pass = 0;
  let failed = 0;
  for (const fn of beforeAlls) await fn();
  for (const suite of suites) {
    for (const test of suite.tests) {
      const hooks = [...globalBeforeEach, ...suite.beforeEach];
      const cleanups = [...suite.afterEach, ...globalAfterEach];
      try {
        for (const hook of hooks) await hook();
        await test.fn();
        for (const hook of cleanups) await hook();
        pass++;
        console.log(`✓ ${suite.name} › ${test.name}`);
      } catch (error) {
        failed++;
        // 某个用例中途失败时也要跑收尾钩子，免得临时目录泄漏影响后一个用例。
        try {
          for (const hook of cleanups) await hook();
        } catch {
          // 收尾失败不覆盖原始失败。
        }
        console.error(`✗ ${suite.name} › ${test.name}\n  ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  for (const fn of afterAlls) await fn();
  console.log(`\n${pass} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
