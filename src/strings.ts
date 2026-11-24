/** 这个 World 在页面上用的文案。只有中英两份，其余语言按英文走。 */
import type { Language } from 'cortico/core/language.ts';

export interface RssStrings {
  moduleLabel: string;
  panelFeedsTitle: string;
  panelFeedsDescription: string;
  panelMessagesTitle: string;
  panelMessagesDescription: string;
  promptDocTitle: string;
  promptDocDescription: string;
  lampFeeds: string;
  lampFeedsOn: string;
  lampFeedsOff: string;
  lampFeedBroken: string;
  lampPull: string;
  lampPullIdle: string;
  lampPullRunning: string;
  lampPullOk: string;
  lampPullError: string;
  badgeFeeds: string;
  badgeMessages: string;
}

const zh: RssStrings = {
  moduleLabel: 'RSS 新闻',
  panelFeedsTitle: 'Rss/Atom 管理',
  panelFeedsDescription: '订阅源清单：地址、拉取节奏、超时、一次递几条、允不允许她自己来拉。',
  panelMessagesTitle: 'Rss/Atom 源的消息',
  panelMessagesDescription: '已经拉到的消息，按时间从新到旧排；点一条看正文。',
  promptDocTitle: 'RSS / Atom 订阅 · 环境提示词',
  promptDocDescription: '说明这些事件是什么、两个工具各自什么时候用。',
  lampFeeds: '订阅源',
  lampFeedsOn: '开着',
  lampFeedsOff: '没有启用的源',
  lampFeedBroken: '上次拉取失败',
  lampPull: '拉取',
  lampPullIdle: '还没拉过',
  lampPullRunning: '正在拉',
  lampPullOk: '正常',
  lampPullError: '有源拉取失败',
  badgeFeeds: '订阅源',
  badgeMessages: '消息',
};

const en: RssStrings = {
  moduleLabel: 'RSS News',
  panelFeedsTitle: 'RSS / Atom feeds',
  panelFeedsDescription: 'The subscription list: address, cadence, timeout, how many items per pull, and whether she may pull it herself.',
  panelMessagesTitle: 'Feed messages',
  panelMessagesDescription: 'Messages already pulled, newest first; click one to read the body.',
  promptDocTitle: 'RSS / Atom · environment prompt',
  promptDocDescription: 'What these events are and when each of the two tools applies.',
  lampFeeds: 'Feeds',
  lampFeedsOn: 'on',
  lampFeedsOff: 'no active feed',
  lampFeedBroken: 'last pull failed',
  lampPull: 'Pull',
  lampPullIdle: 'never pulled',
  lampPullRunning: 'pulling',
  lampPullOk: 'healthy',
  lampPullError: 'a feed failed',
  badgeFeeds: 'Feeds',
  badgeMessages: 'Messages',
};

/** 简体中文（含繁体）读中文表，其余语言读英文表。 */
export function text(language?: Language | string): RssStrings {
  const tag = String(language ?? 'zh').toLowerCase();
  return tag.startsWith('zh') ? zh : en;
}
