/** 测试用的样例源与一个小工具：等某个条件成立。 */

export const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
<channel>
<title>央视新闻 world</title>
<link>https://news.example.com/world</link>
<description>央视新闻 world - Powered by RSSHub</description>
<lastBuildDate>Tue, 24 Nov 2026 08:25:17 GMT</lastBuildDate>
<item>
  <title>英伟达发布新一代芯片</title>
  <description>&lt;p&gt;黄仁勋在发布会上介绍了新架构，称这是英伟达最重要的一次更新。&lt;/p&gt;&lt;p&gt;第二段正文。&lt;/p&gt;</description>
  <link>https://news.example.com/a1</link>
  <guid isPermaLink="false">guid-1</guid>
  <pubDate>Tue, 24 Nov 2026 07:57:21 GMT</pubDate>
  <dc:creator>央视新闻</dc:creator>
</item>
<item>
  <title>韩国加码高考作弊举报悬赏</title>
  <description>&lt;p&gt;赏金最高 5 亿韩元。&lt;/p&gt;</description>
  <link>https://news.example.com/a2</link>
  <guid isPermaLink="false">guid-2</guid>
  <pubDate>Tue, 24 Nov 2026 06:10:00 GMT</pubDate>
</item>
<item>
  <title>伊朗法院要求美国支付赔偿金</title>
  <description>据伊朗方面消息，伊朗司法机构已作出裁决。</description>
  <link>https://news.example.com/a3</link>
  <guid isPermaLink="false">guid-3</guid>
  <pubDate>Tue, 24 Nov 2026 05:00:00 GMT</pubDate>
</item>
<item>
  <title>哥伦比亚爆炸袭击受伤人数升至19人</title>
  <description>当地警方通报了最新情况。</description>
  <link>https://news.example.com/a4</link>
  <guid isPermaLink="false">guid-4</guid>
  <pubDate>Tue, 24 Nov 2026 04:30:00 GMT</pubDate>
</item>
</channel>
</rss>`;

export const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>某人的博客</title>
  <link rel="alternate" type="text/html" href="https://blog.example.com/"/>
  <subtitle>写点技术</subtitle>
  <updated>2026-11-24T08:00:00Z</updated>
  <entry>
    <title type="html">Hello &amp;amp; world</title>
    <link rel="alternate" href="https://blog.example.com/p1"/>
    <link rel="replies" href="https://blog.example.com/p1/comments"/>
    <id>urn:uuid:1</id>
    <published>2026-11-24T07:00:00Z</published>
    <updated>2026-11-24T07:30:00Z</updated>
    <author><name>阿豆</name></author>
    <summary type="html">&lt;b&gt;摘要一段&lt;/b&gt;</summary>
    <content type="html">&lt;p&gt;正文第一段&lt;/p&gt;&lt;p&gt;正文第二段&lt;/p&gt;</content>
  </entry>
  <entry>
    <title>没有链接的条目</title>
    <id>urn:uuid:2</id>
    <updated>2026-11-23T07:00:00Z</updated>
    <content type="text">纯文本正文。</content>
  </entry>
</feed>`;

export const RDF_SAMPLE = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://rdf.example.com/">
    <title>RDF 站点</title>
    <link>https://rdf.example.com/</link>
    <description>RSS 1.0 样例</description>
    <items><rdf:Seq><rdf:li resource="https://rdf.example.com/1"/></rdf:Seq></items>
  </channel>
  <item rdf:about="https://rdf.example.com/1">
    <title>第一条</title>
    <link>https://rdf.example.com/1</link>
    <description>正文一</description>
    <dc:date>2026-11-22T10:00:00+08:00</dc:date>
  </item>
</rdf:RDF>`;

/** 轮询等到条件成立；超时抛错。 */
export async function waitFor(condition: () => boolean, timeoutMs = 3000, label = 'condition'): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`等待超时：${label}`);
}
