import { describe, expect, it } from 'vitest';
import { childText, parseXml, rootElement } from '../src/xml.ts';
import { FeedFormatError, parseDate, parseFeed } from '../src/feed.ts';
import { stripHtml } from '../src/text.ts';
import { ATOM_SAMPLE, RDF_SAMPLE, RSS_SAMPLE } from './helpers/samples.ts';

describe('XML 解析', () => {
  it('认根元素、属性与 textContent', () => {
    const doc = parseXml('<a x="1"><b>hi</b><c/></a>');
    const root = rootElement(doc);
    expect(root?.name).toBe('a');
    expect(root?.attrs.x).toBe('1');
    expect(root?.text).toBe('hi');
    expect(childText(root, 'b')).toBe('hi');
  });

  it('CDATA 与实体各解一次', () => {
    const doc = parseXml('<a><b><![CDATA[<p>原样</p>]]></b><c>&lt;p&gt;&amp;amp;&lt;/p&gt;</c></a>');
    const root = rootElement(doc);
    expect(childText(root, 'b')).toBe('<p>原样</p>');
    // 实体解一层：`&lt;p&gt;` → `<p>`，`&amp;amp;` → `&amp;`
    expect(childText(root, 'c')).toBe('<p>&amp;</p>');
  });

  it('注释/声明/DOCTYPE 被跳过，不闭合的标签不炸', () => {
    const doc = parseXml('<?xml version="1.0"?><!-- c --><!DOCTYPE rss><rss><item><title>t</title></item></rss>');
    expect(rootElement(doc)?.name).toBe('rss');
  });
});

describe('HTML 摘要', () => {
  it('剥标签、留段落、解二次实体', () => {
    const text = stripHtml('<p>第一段&nbsp;正文</p><p>第二段</p><script>x()</script>');
    expect(text).toBe('第一段 正文\n第二段');
  });
});

describe('RSS 2.0', () => {
  const feed = parseFeed(RSS_SAMPLE);

  it('认频道信息与条目', () => {
    expect(feed.kind).toBe('rss');
    expect(feed.title).toBe('央视新闻 world');
    expect(feed.siteUrl).toBe('https://news.example.com/world');
    expect(feed.entries).toHaveLength(4);
  });

  it('条目字段齐：标题、纯文本正文、链接、时间、作者', () => {
    const first = feed.entries[0];
    expect(first.title).toBe('英伟达发布新一代芯片');
    expect(first.link).toBe('https://news.example.com/a1');
    expect(first.body).toContain('黄仁勋');
    expect(first.body).toContain('\n');
    expect(first.body).not.toContain('<p>');
    expect(first.publishedAt).toBe('2026-11-24T07:57:21.000Z');
    expect(first.author).toBe('央视新闻');
    expect(first.id).toBe('guid-1');
  });

  it('摘要比正文短', () => {
    expect(feed.entries[0].summary.length).toBeGreaterThan(0);
    expect(feed.entries[0].summary).not.toContain('\n');
  });
});

describe('Atom', () => {
  const feed = parseFeed(ATOM_SAMPLE);

  it('认 feed 标题与 alternate 链接', () => {
    expect(feed.kind).toBe('atom');
    expect(feed.title).toBe('某人的博客');
    expect(feed.siteUrl).toBe('https://blog.example.com/');
    expect(feed.entries).toHaveLength(2);
  });

  it('HTML 标题解实体、内容取 content、作者取 name', () => {
    const first = feed.entries[0];
    expect(first.title).toBe('Hello & world');
    expect(first.link).toBe('https://blog.example.com/p1');
    expect(first.body).toContain('正文第一段');
    expect(first.publishedAt).toBe('2026-11-24T07:00:00.000Z');
    expect(first.author).toBe('阿豆');
  });

  it('没有链接时退回 id 当去重键', () => {
    expect(feed.entries[1].link).toBe('');
    expect(feed.entries[1].id).toBe('urn:uuid:2');
  });
});

describe('RSS 1.0 / RDF', () => {
  it('认 channel + item 与 dc:date', () => {
    const feed = parseFeed(RDF_SAMPLE);
    expect(feed.kind).toBe('rdf');
    expect(feed.title).toBe('RDF 站点');
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0].title).toBe('第一条');
    expect(feed.entries[0].publishedAt).toBe('2026-11-22T02:00:00.000Z');
  });
});

describe('边界', () => {
  it('HTML 页面不算源', () => {
    expect(() => parseFeed('<!DOCTYPE html><html><body>nope</body></html>')).toThrow(FeedFormatError);
  });

  it('空源解析成功但没有条目', () => {
    const feed = parseFeed('<rss><channel><title>空</title></channel></rss>');
    expect(feed.entries).toHaveLength(0);
  });

  it('时间两种写法都认，认不出来返回 undefined', () => {
    expect(parseDate('Tue, 24 Nov 2026 07:57:21 GMT')).toBe('2026-11-24T07:57:21.000Z');
    expect(parseDate('2026-11-24T07:57:21+08:00')).toBe('2026-11-23T23:57:21.000Z');
    expect(parseDate('2026-11-24 07:57:21')).toBeDefined();
    expect(parseDate('昨天下午')).toBeUndefined();
  });
});
