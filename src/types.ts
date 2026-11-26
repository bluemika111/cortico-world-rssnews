/** 订阅数据与消息存档的形状；store.ts 负责落盘，world.ts 负责用。 */

export interface FeedRecord {
  /** 本插件内部的稳定 id，`f` 开头。 */
  id: string;
  /** 订阅地址。 */
  url: string;
  /** 显示名；没填过时先用主机名，拉到源之后换成源自己的标题。 */
  title: string;
  enabled: boolean;
  /** 每隔多少分钟拉一次；0 表示不按间隔。 */
  intervalMinutes: number;
  /** 每天定时拉取的时刻，`HH:MM`，按部署时区。 */
  scheduleTimes: string[];
  /** 这个源自己的超时，毫秒。 */
  timeoutMs: number;
  /** 一次最多递几条新消息。 */
  maxNewItems: number;
  /** 是否允许模型主动拉取这个源（两个工具都看它）。 */
  allowModel: boolean;
  addedAt: string;
  lastAttemptAt?: string;
  lastFetchedAt?: string;
  lastError?: string;
  /** 最近一次成功拉取时新条目的数量。 */
  lastNewCount?: number;
  /** 定时拉取已经用掉的槽，`YYYY-MM-DD HH:MM`，避免同一分钟拉两次。 */
  lastSlot?: string;
  etag?: string;
  lastModified?: string;
  /** 见过的条目去重键，最近 400 个。 */
  seen: string[];
}

/** 给人看的一条消息（消息页签、索引工具与 rss_read 共用）。 */
export interface ArchiveEntry {
  /** 全局递增的短编号，展示成 `#12`；模型用它来点名要读哪一条。 */
  seq: number;
  feedId: string;
  entryId: string;
  title: string;
  link: string;
  summary: string;
  body: string;
  publishedAt?: string;
  fetchedAt: string;
}

export interface FeedInput {
  /** 添加时必填；改设置时不给就不动它。 */
  url?: string;
  title?: string;
  enabled?: boolean;
  intervalMinutes?: number | string;
  scheduleTimes?: string[] | string;
  timeoutMs?: number | string;
  maxNewItems?: number | string;
  allowModel?: boolean;
}

/** 新建订阅源时从配置里取的默认值。 */
export interface FeedDefaults {
  intervalMinutes: number;
  timeoutMs: number;
  maxNewItems: number;
  allowModel: boolean;
}
