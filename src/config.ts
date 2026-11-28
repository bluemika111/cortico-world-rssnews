import type { ConfigGroup } from 'cortico/core/types.ts';

/** config.json 的 worlds.rss 段；键扁平，WebUI 的配置接口写不了对象。 */
export interface RssConfigSection {
  enabled: boolean;
  /** 低消耗模式：只递编号、来源、时间、标题，正文用 rss_read 按编号去读。 */
  lowCost: boolean;
  /** 新消息到达时叫醒她（true）还是只排队等她下次活动（false）。 */
  wakeOnNewItems: boolean;
  /** 递给模型的正文最多多少字；0 表示只给标题与时间。 */
  maxBodyChars: number;
  /** 新加订阅源时的默认拉取间隔（分钟）。 */
  defaultIntervalMinutes: number;
  /** 新加订阅源时的默认超时（毫秒）。 */
  defaultTimeoutMs: number;
  /** 新加订阅源时一次最多递几条新消息。 */
  defaultMaxNewItems: number;
  /** 新加订阅源时默认允不允许模型主动拉取。 */
  defaultAllowModel: boolean;
  /** 消息存档最多留多少条。 */
  archiveLimit: number;
  /** 索引工具每个源最多翻多少条。 */
  indexFetchLimit: number;
  /** 索引工具每页给几条。 */
  indexPageSize: number;
}

export const RSS_DEFAULTS: RssConfigSection = {
  enabled: false,
  lowCost: true,
  wakeOnNewItems: false,
  maxBodyChars: 1200,
  defaultIntervalMinutes: 30,
  defaultTimeoutMs: 20_000,
  defaultMaxNewItems: 5,
  defaultAllowModel: true,
  archiveLimit: 500,
  indexFetchLimit: 50,
  indexPageSize: 5,
};

export function rssConfigGroup(): ConfigGroup {
  return {
    id: 'world:rss',
    owner: 'world:rss',
    schema: {
      type: 'object',
      title: 'RSS / Atom 订阅',
      properties: {
        'worlds.rss.lowCost': {
          type: 'boolean',
          title: '低消耗模式',
          description: '开着时，事件与工具回执只给编号、来源、时间、标题，不附正文；她自己用 rss_read 按编号读全文。省上下文，代价是多一次工具调用。',
          'x-hot': true,
        },
        'worlds.rss.wakeOnNewItems': {
          type: 'boolean',
          title: '新消息叫醒她',
          description: '开着时一抓到新消息就叫醒她；关着时只排队，等她下次活动一并知道。',
          'x-hot': true,
        },
        'worlds.rss.maxBodyChars': {
          type: 'integer',
          title: '递给模型的正文长度',
          description: '事件与 rss_fetch / rss_index 回执里每条正文最多带多少字（0 表示只给标题与时间）。rss_read 读全文不受这条限制，界面里的消息也不受。',
          minimum: 0,
          maximum: 4000,
          'x-hot': true,
        },
        'worlds.rss.defaultIntervalMinutes': {
          type: 'integer',
          title: '新订阅源的默认间隔（分钟）',
          description: '只在添加订阅源时当默认值；每个源自己的间隔在「Rss/Atom 管理」里改。0 表示不按间隔拉。',
          minimum: 0,
          maximum: 1440,
          'x-hot': true,
        },
        'worlds.rss.defaultTimeoutMs': {
          type: 'integer',
          title: '新订阅源的默认超时（毫秒）',
          description: '默认 20000。源慢的时候可以调大，单源上限 300000。',
          minimum: 1000,
          maximum: 300_000,
          'x-hot': true,
        },
        'worlds.rss.defaultMaxNewItems': {
          type: 'integer',
          title: '新订阅源的默认推送条数',
          description: '一次最多递几条新消息，默认 3。',
          minimum: 1,
          maximum: 50,
          'x-hot': true,
        },
        'worlds.rss.defaultAllowModel': {
          type: 'boolean',
          title: '新订阅源默认允许模型拉取',
          description: '关掉后新加的源默认不允许模型主动拉取，需要在管理页里逐个打开。',
          'x-hot': true,
        },
        'worlds.rss.archiveLimit': {
          type: 'integer',
          title: '消息存档上限',
          description: '消息页签保留多少条；超出时丢最老的。',
          minimum: 50,
          maximum: 5000,
          'x-hot': true,
        },
      },
    },
  };
}
