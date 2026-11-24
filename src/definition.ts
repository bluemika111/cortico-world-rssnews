import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { RSS_DEFAULTS, type RssConfigSection } from './config.ts';
import { RSS_TOOL_DECLS, RssWorld } from './world.ts';

export const RSS: WorldDefinition<RssConfigSection> = {
  id: 'rss',
  label: 'RSS / Atom',
  defaults: () => ({ ...RSS_DEFAULTS }),
  create: (ctx) => new RssWorld({
    cfg: ctx.cfg,
    timezone: ctx.timezone,
    dataDir: ctx.dataDir,
    packageDir: ctx.packageDir,
    log: { info: () => {}, warn: () => {} },
  }),
  describe: {
    tools: describeTools(RSS_TOOL_DECLS, {
      rss_fetch: {
        zh: '立刻拉一轮订阅源，新消息优先，每个源给到它自己设定的条数。',
        en: 'Pulls the feeds right now, newest first, up to each feed\'s own item count.',
      },
      rss_index: {
        zh: '按关键词翻订阅源，每页最多 5 条，可翻页。',
        en: 'Searches the feeds by keyword, at most 5 matches per page, with paging.',
      },
    }),
    events: [
      {
        type: 'rss.new_items',
        description: {
          zh: '某个订阅源到了拉取时间、抓到了新消息；正文里有标题、时间、摘要和链接，每个源一次最多给几条是它自己的设置。',
          en: 'A feed came round and had new items; the text carries titles, times, summaries and links, up to that feed\'s own per-pull limit.',
        },
      },
    ],
  },
};
