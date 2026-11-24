/** World 测试共用的假宿主：记录推送的事件与投递口径。 */
import type { EventEnvelope, PushOptions, WorldHost } from 'cortico/core/types.ts';

export class FakeHost implements WorldHost {
  events: EventEnvelope[] = [];
  pushOpts: Array<PushOptions | undefined> = [];
  logs: Array<{ level: 'info' | 'warn'; message: string; meta?: Record<string, unknown> }> = [];

  store = {
    get: () => undefined,
    latestCursor: () => 0,
    range: () => [],
    around: () => [],
    grep: () => [],
  } as unknown as WorldHost['store'];

  blob = (): { bytes: Uint8Array; mime: string } | null => null;
  modelFacts = { model: () => 'test', accepts: () => false, contextWindow: () => 128_000 };
  log = {
    child() {
      return this;
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      this.logs.push({ level: 'info', message, ...(meta ? { meta } : {}) });
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      this.logs.push({ level: 'warn', message, ...(meta ? { meta } : {}) });
    },
    error() {},
    debug() {},
    trace() {},
    emit() {},
  } as unknown as WorldHost['log'];

  async pushEvent(
    e: Omit<EventEnvelope, 'cursor' | 'origin' | 'contextDelivery' | 'blobs'>,
    opts?: PushOptions,
  ): Promise<EventEnvelope> {
    const full = { ...e, cursor: this.events.length + 1, origin: 'external' } as EventEnvelope;
    this.events.push(full);
    this.pushOpts.push(opts);
    return full;
  }

  async pushDeferred(): Promise<void> {}

  async withdrawPending(): Promise<boolean> {
    return false;
  }

  async drainPendingEvents(): Promise<EventEnvelope[]> {
    return [];
  }

  reportUsage(): void {}
}
