import { describe, expect, it } from 'vitest';
import {
  dueReason,
  localTimeParts,
  nextRunAt,
  normalizeInterval,
  normalizeMaxNewItems,
  normalizeTimeout,
  parseScheduleTimes,
} from '../src/schedule.ts';
import type { FeedRecord } from '../src/types.ts';

const TZ = 'Asia/Shanghai';

function feed(patch: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: 'f1',
    url: 'https://example.com/feed',
    title: '示例',
    enabled: true,
    intervalMinutes: 0,
    scheduleTimes: [],
    timeoutMs: 20_000,
    maxNewItems: 3,
    allowModel: true,
    addedAt: '2026-11-24T00:00:00.000Z',
    seen: [],
    ...patch,
  };
}

/** 2026-11-24 16:05 +08:00 */
const NOW = Date.parse('2026-11-24T16:05:00+08:00');

describe('定时写法', () => {
  it('各种分隔符都认，排序去重', () => {
    expect(parseScheduleTimes('20:00, 08:00，12:30')).toEqual(['08:00', '12:30', '20:00']);
    expect(parseScheduleTimes(['8:00', '08:00'])).toEqual(['08:00']);
    expect(parseScheduleTimes('')).toEqual([]);
    expect(parseScheduleTimes(undefined)).toEqual([]);
  });

  it('非法时刻被丢掉', () => {
    expect(parseScheduleTimes('25:00, 08:61, 08:00')).toEqual(['08:00']);
  });
});

describe('数值夹取', () => {
  it('间隔、超时、条数都有上下限', () => {
    expect(normalizeInterval('45', 30)).toBe(45);
    expect(normalizeInterval(-5, 30)).toBe(0);
    expect(normalizeInterval('abc', 30)).toBe(30);
    expect(normalizeTimeout(500, 20_000)).toBe(1000);
    expect(normalizeTimeout(999_999, 20_000)).toBe(300_000);
    expect(normalizeMaxNewItems(0, 3)).toBe(1);
    expect(normalizeMaxNewItems(99, 3)).toBe(50);
  });
});

describe('时区', () => {
  it('按部署时区给出日期键与时刻', () => {
    expect(localTimeParts(NOW, TZ)).toEqual({ dateKey: '2026-11-24', hhmm: '16:05' });
    expect(localTimeParts(NOW, 'UTC')).toEqual({ dateKey: '2026-11-24', hhmm: '08:05' });
  });

  it('午夜是 00:00 而不是 24:00', () => {
    expect(localTimeParts(Date.parse('2026-11-24T00:00:00+08:00'), TZ).hhmm).toBe('00:00');
  });
});

describe('该不该拉', () => {
  it('从没拉过的间隔源立刻到期', () => {
    expect(dueReason(feed({ intervalMinutes: 30 }), NOW, TZ)).toBe('interval');
  });

  it('没到间隔就不拉', () => {
    const record = feed({ intervalMinutes: 30, lastAttemptAt: new Date(NOW - 10 * 60_000).toISOString() });
    expect(dueReason(record, NOW, TZ)).toBe(null);
  });

  it('到点了拉', () => {
    const record = feed({ intervalMinutes: 30, lastAttemptAt: new Date(NOW - 31 * 60_000).toISOString() });
    expect(dueReason(record, NOW, TZ)).toBe('interval');
  });

  it('定时时刻命中就拉，同一分钟只拉一次', () => {
    const at = feed({ scheduleTimes: ['16:05'] });
    expect(dueReason(at, NOW, TZ)).toBe('time');
    expect(dueReason({ ...at, lastSlot: '2026-11-24 16:05' }, NOW, TZ)).toBe(null);
    expect(dueReason({ ...at, lastSlot: '2026-11-23 16:05' }, NOW, TZ)).toBe('time');
  });

  it('两种口径取先到的', () => {
    const both = feed({
      intervalMinutes: 30,
      scheduleTimes: ['16:05'],
      lastAttemptAt: new Date(NOW - 5 * 60_000).toISOString(),
    });
    expect(dueReason(both, NOW, TZ)).toBe('time');
    expect(nextRunAt(both, NOW, TZ)).toBe(Date.parse('2026-11-24T16:05:00+08:00'));
  });

  it('停用的源什么都不拉', () => {
    expect(dueReason(feed({ enabled: false, intervalMinutes: 30 }), NOW, TZ)).toBe(null);
    expect(dueReason(feed({ enabled: false, scheduleTimes: ['16:05'] }), NOW, TZ)).toBe(null);
  });

  it('既没间隔也没定时就只手动', () => {
    expect(dueReason(feed(), NOW, TZ)).toBe(null);
    expect(nextRunAt(feed(), NOW, TZ)).toBe(null);
  });

  it('下一次时间跳过已经用掉的槽', () => {
    const record = feed({ scheduleTimes: ['16:05'], lastSlot: '2026-11-24 16:05' });
    expect(nextRunAt(record, NOW, TZ)).toBe(Date.parse('2026-11-25T16:05:00+08:00'));
  });
});
