/**
 * 调度：每轮问一句「这个源现在该拉了吗」，不去维护一张下一次时间的表。
 * 间隔与定时两种口径可以同时开着，谁先到算谁。
 */
import type { FeedRecord } from './types.ts';

export type DueReason = 'interval' | 'time';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return HHMM.test(value.trim());
}

/** 接受 `'08:00, 12:30'`、`['08:00','12:30']` 或带空格的写法；去重、排序、只留合法项。 */
export function parseScheduleTimes(raw: unknown): string[] {
  const parts: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) parts.push(String(item));
  } else if (typeof raw === 'string') {
    parts.push(...raw.split(/[,，;；\s]+/));
  } else if (raw !== undefined && raw !== null) {
    parts.push(String(raw));
  }
  const out = new Set<string>();
  for (const part of parts) {
    const value = part.trim();
    if (!value) continue;
    // 允许写 `8:00`，补成 `08:00`。
    const padded = /^\d:\d{2}$/.test(value) ? `0${value}` : value;
    if (isValidTime(padded)) out.add(padded);
  }
  return [...out].sort();
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function normalizeInterval(value: unknown, fallback: number): number {
  return clampInt(value, 0, 1440, fallback);
}

export function normalizeTimeout(value: unknown, fallback: number): number {
  return clampInt(value, 1000, 300_000, fallback);
}

export function normalizeMaxNewItems(value: unknown, fallback: number): number {
  return clampInt(value, 1, 50, fallback);
}

/** 部署时区里的日期键与时刻。小时用 h23，避免午夜解析成 `24`。 */
export function localTimeParts(at: number | Date, timezone: string): { dateKey: string; hhmm: string } {
  const date = typeof at === 'number' ? new Date(at) : at;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    dateKey: `${pick('year')}-${pick('month')}-${pick('day')}`,
    hhmm: `${pick('hour')}:${pick('minute')}`,
  };
}

/** 现在该不该拉这个源。 */
export function dueReason(feed: FeedRecord, nowMs: number, timezone: string): DueReason | null {
  if (!feed.enabled) return null;
  if (feed.intervalMinutes > 0) {
    const last = feed.lastAttemptAt ? Date.parse(feed.lastAttemptAt) : Number.NaN;
    if (!Number.isFinite(last)) return 'interval';
    if (nowMs - last >= feed.intervalMinutes * 60_000) return 'interval';
  }
  if (feed.scheduleTimes.length) {
    const { dateKey, hhmm } = localTimeParts(nowMs, timezone);
    if (feed.scheduleTimes.includes(hhmm) && feed.lastSlot !== `${dateKey} ${hhmm}`) return 'time';
  }
  return null;
}

/**
 * 下一次预计拉取的时刻（毫秒，给界面用）。两种口径取最早的那个。
 * 定时靠一分钟一分钟往前试，最多两天——比在时区里反解墙上时间可靠。
 */
export function nextRunAt(feed: FeedRecord, nowMs: number, timezone: string): number | null {
  const candidates: number[] = [];
  if (feed.intervalMinutes > 0) {
    const last = feed.lastAttemptAt ? Date.parse(feed.lastAttemptAt) : Number.NaN;
    candidates.push(Number.isFinite(last) ? last + feed.intervalMinutes * 60_000 : nowMs);
  }
  if (feed.scheduleTimes.length) {
    const wanted = new Set(feed.scheduleTimes);
    const start = Math.floor(nowMs / 60_000) * 60_000;
    for (let step = 0; step <= 2880; step++) {
      const at = start + step * 60_000;
      const { dateKey, hhmm } = localTimeParts(at, timezone);
      if (!wanted.has(hhmm)) continue;
      if (feed.lastSlot === `${dateKey} ${hhmm}`) continue;
      candidates.push(at);
      break;
    }
  }
  if (!candidates.length) return null;
  return Math.min(...candidates);
}
