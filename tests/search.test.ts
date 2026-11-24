import { describe, expect, it } from 'vitest';
import { haystackOf, matches, normalizeKeywords, paginate, timeHaystack } from '../src/search.ts';

const TZ = 'Asia/Shanghai';

const entry = {
  title: '英伟达发布新一代芯片',
  body: '黄仁勋在发布会上介绍了新架构。',
  summary: '黄仁勋在发布会上介绍了新架构。',
  link: 'https://news.example.com/a1',
  publishedAt: '2026-11-24T07:57:21.000Z',
};

describe('关键词清洗', () => {
  it('去空白、去重、忽略大小写', () => {
    expect(normalizeKeywords([' 英伟达 ', 'NVIDIA', 'nvidia', ''])).toEqual(['英伟达', 'NVIDIA']);
    expect(normalizeKeywords('英伟达，黄仁勋')).toEqual(['英伟达', '黄仁勋']);
    expect(normalizeKeywords(undefined)).toEqual([]);
  });
});

describe('匹配范围', () => {
  it('标题、正文、时间都算', () => {
    expect(matches(entry, ['英伟达'], 'any', TZ)).toBe(true);
    expect(matches(entry, ['黄仁勋'], 'any', TZ)).toBe(true);
    expect(matches(entry, ['2026-11-24'], 'any', TZ)).toBe(true);
    expect(matches(entry, ['15:57'], 'any', TZ)).toBe(true);
    expect(matches(entry, ['不存在的词'], 'any', TZ)).toBe(false);
  });

  it('大小写不敏感', () => {
    expect(matches({ ...entry, title: 'NVIDIA GTC' }, ['nvidia'], 'any', TZ)).toBe(true);
  });

  it('any 命中一个即可，all 要求全中', () => {
    expect(matches(entry, ['英伟达', '不存在的词'], 'any', TZ)).toBe(true);
    expect(matches(entry, ['英伟达', '黄仁勋'], 'all', TZ)).toBe(true);
    expect(matches(entry, ['英伟达', '不存在的词'], 'all', TZ)).toBe(false);
  });

  it('没有关键词不命中', () => {
    expect(matches(entry, [], 'any', TZ)).toBe(false);
  });

  it('时间按部署时区展开成几种写法', () => {
    const hay = timeHaystack(entry.publishedAt, undefined, TZ);
    expect(hay).toContain('2026-11-24 15:57');
    expect(hay).toContain('2026-11-24');
    expect(hay).toContain('15:57');
    expect(haystackOf(entry, TZ)).toContain('news.example.com');
  });
});

describe('分页', () => {
  const items = Array.from({ length: 12 }, (_, index) => index + 1);

  it('一页 5 条，共 3 页', () => {
    const page = paginate(items, 1, 5);
    expect(page.rows).toEqual([1, 2, 3, 4, 5]);
    expect(page.total).toBe(12);
    expect(page.pageCount).toBe(3);
  });

  it('越界页码夹到合法范围', () => {
    expect(paginate(items, 99, 5).page).toBe(3);
    expect(paginate(items, 0, 5).page).toBe(1);
    expect(paginate(items, -3, 5).page).toBe(1);
  });

  it('空列表也有 1 页', () => {
    const page = paginate([], 1, 5);
    expect(page.pageCount).toBe(1);
    expect(page.total).toBe(0);
    expect(page.rows).toHaveLength(0);
  });
});
