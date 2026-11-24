/**
 * jsdom 只用来在测试里造一个真 DOM；这里自带最小声明，不额外引 @types/jsdom。
 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    readonly window: {
      document: unknown;
      [key: string]: unknown;
    };
  }
}
