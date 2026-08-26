import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseDuration,
  parseYoutubeSearchHtml,
  scrapeYoutube,
  searchUnified,
  searchCache,
  clearSearchCache,
  CACHE_MAX_ENTRIES
} from '../../src/core/ytScraper.js';
import type { HttpLike } from '../../src/core/types.js';
import normalInnertubeFixture from '../fixtures/innertube-response-normal.json';

describe('Core YouTube Scraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSearchCache();
  });

  describe('parseDuration', () => {
    it('should parse mm:ss format', () => {
      expect(parseDuration('3:45')).toBe(225);
      expect(parseDuration('0:30')).toBe(30);
    });

    it('should parse hh:mm:ss format', () => {
      expect(parseDuration('1:02:30')).toBe(3750);
    });

    it('should return 0 for invalid or empty text', () => {
      expect(parseDuration('')).toBe(0);
      expect(parseDuration('live')).toBe(0);
    });
  });

  describe('parseYoutubeSearchHtml', () => {
    it('should parse valid ytInitialData HTML', () => {
      const mockInitialData = {
        contents: {
          twoColumnSearchResultsRenderer: {
            primaryContents: {
              sectionListRenderer: {
                contents: [
                  {
                    itemSectionRenderer: {
                      contents: [
                        {
                          videoRenderer: {
                            videoId: 'dQw4w9WgXcQ',
                            title: { runs: [{ text: 'Rick Astley - Never Gonna Give You Up' }] },
                            lengthText: { simpleText: '3:33' },
                            thumbnail: {
                              thumbnails: [
                                { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg' },
                                { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }
                              ]
                            },
                            ownerText: { runs: [{ text: 'RickAstleyVEVO' }] }
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      };

      const html = `<html><head><script>var ytInitialData = ${JSON.stringify(mockInitialData)};</script></head><body></body></html>`;

      const results = parseYoutubeSearchHtml(html, 5);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'dQw4w9WgXcQ',
        title: 'Rick Astley - Never Gonna Give You Up',
        duration: 213,
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        channel: 'RickAstleyVEVO'
      });
    });

    it('should throw error if ytInitialData is missing', () => {
      const html = '<html><body>No data here</body></html>';
      expect(() => parseYoutubeSearchHtml(html)).toThrow('No ytInitialData found in HTML');
    });
  });

  describe('scrapeYoutube with HttpLike', () => {
    it('should fetch via HttpLike and parse results', async () => {
      const mockInitialData = {
        contents: {
          twoColumnSearchResultsRenderer: {
            primaryContents: {
              sectionListRenderer: {
                contents: [
                  {
                    itemSectionRenderer: {
                      contents: [
                        {
                          videoRenderer: {
                            videoId: 'abc12345678',
                            title: { runs: [{ text: 'Sample Song' }] },
                            lengthText: { simpleText: '4:00' },
                            thumbnail: { thumbnails: [{ url: 'https://thumb.jpg' }] },
                            ownerText: { runs: [{ text: 'Sample Artist' }] }
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      };

      const html = `var ytInitialData = ${JSON.stringify(mockInitialData)};</script>`;

      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: html
        })
      };

      const results = await scrapeYoutube(mockHttp, 'Sample Song', 10);

      expect(mockHttp.fetch).toHaveBeenCalledWith(
        'https://www.youtube.com/results?search_query=Sample%20Song',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.any(String),
            'Accept-Language': 'en-US,en;q=0.9'
          })
        })
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('abc12345678');
      expect(results[0].title).toBe('Sample Song');
    });

    it('should invoke fallbackFn if scraping fails', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockRejectedValue(new Error('Network error'))
      };

      const fallbackFn = vi.fn().mockResolvedValue([
        {
          id: 'fallback123',
          title: 'Fallback Song',
          duration: 120,
          thumbnail: null,
          channel: 'Fallback Artist'
        }
      ]);

      const results = await scrapeYoutube(mockHttp, 'Test', 5, fallbackFn);

      expect(fallbackFn).toHaveBeenCalledWith('Test', 5);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('fallback123');
    });
  });

  describe('searchUnified (3-Tier Fallback Chain)', () => {
    const mockHtmlBody = `var ytInitialData = ${JSON.stringify({
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        videoRenderer: {
                          videoId: 'htmlVideo123',
                          title: { runs: [{ text: 'HTML Song' }] },
                          lengthText: { simpleText: '3:00' },
                          thumbnail: { thumbnails: [{ url: 'https://htmlthumb.jpg' }] },
                          ownerText: { runs: [{ text: 'HTML Channel' }] }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    })};</script>`;

    it('Tier 1: should return Innertube results immediately when successful', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify(normalInnertubeFixture)
        })
      };

      const fallbackFn = vi.fn();
      const results = await searchUnified(mockHttp, 'Rick Astley', 5, fallbackFn);

      expect(mockHttp.fetch).toHaveBeenCalledTimes(1);
      expect(mockHttp.fetch).toHaveBeenCalledWith(
        expect.stringContaining('youtubei/v1/search'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(fallbackFn).not.toHaveBeenCalled();
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('dQw4w9WgXcQ');
    });

    it('Tier 2: should fall back to HTML scraping when Innertube fails', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('youtubei/v1/search')) {
            throw new Error('Innertube Network Error');
          }
          return {
            status: 200,
            body: mockHtmlBody
          };
        })
      };

      const fallbackFn = vi.fn();
      const results = await searchUnified(mockHttp, 'HTML Query', 5, fallbackFn);

      expect(mockHttp.fetch).toHaveBeenCalledTimes(2);
      expect(fallbackFn).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('htmlVideo123');
      expect(results[0].title).toBe('HTML Song');
    });

    it('Tier 3: should fall back to fallbackFn when both Innertube and HTML scraping fail', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockRejectedValue(new Error('Total Network Failure'))
      };

      const fallbackFn = vi.fn().mockResolvedValue([
        {
          id: 'ytdlpTrack123',
          title: 'Ytdlp Native Song',
          duration: 180,
          thumbnail: 'https://ytdlpthumb.jpg',
          channel: 'Ytdlp Channel'
        }
      ]);

      const results = await searchUnified(mockHttp, 'Deep Fallback Query', 5, fallbackFn);

      expect(fallbackFn).toHaveBeenCalledWith('Deep Fallback Query', 5);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ytdlpTrack123');
    });

    it('should return empty array if all 3 tiers fail without throwing unhandled exception', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockRejectedValue(new Error('Total Network Failure'))
      };

      const fallbackFn = vi.fn().mockRejectedValue(new Error('Fallback Fn Failed'));

      const results = await searchUnified(mockHttp, 'Total Failure Query', 5, fallbackFn);
      expect(results).toEqual([]);
    });
  });

  describe('searchUnified LRU Caching', () => {
    it('should cache results and return cached data on subsequent identical calls', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify(normalInnertubeFixture)
        })
      };

      const firstResults = await searchUnified(mockHttp, 'Cached Query', 5);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(1);
      expect(firstResults).toHaveLength(2);

      // Second identical call
      const secondResults = await searchUnified(mockHttp, 'Cached Query', 5);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(1); // No new network call
      expect(secondResults).toEqual(firstResults);
    });

    it('should differentiate cache keys by limit and query casing/whitespace', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify(normalInnertubeFixture)
        })
      };

      await searchUnified(mockHttp, '  Queen  ', 5);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(1);

      // Same query with different casing/trimming should hit cache
      await searchUnified(mockHttp, 'queen', 5);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(1);

      // Different limit should be a cache miss
      await searchUnified(mockHttp, 'queen', 10);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(2);
    });

    it('should evict expired cache entries', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify(normalInnertubeFixture)
        })
      };

      await searchUnified(mockHttp, 'Expiring Query', 5);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(1);

      // Manually simulate expiration
      const cacheKey = 'expiring query::5';
      const entry = searchCache.get(cacheKey);
      if (entry) {
        entry.expiresAt = Date.now() - 1000;
      }

      // Should re-fetch
      await searchUnified(mockHttp, 'Expiring Query', 5);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(2);
    });

    it('should evict oldest entry when reaching CACHE_MAX_ENTRIES', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify(normalInnertubeFixture)
        })
      };

      // Fill cache to limit
      for (let i = 0; i < CACHE_MAX_ENTRIES; i++) {
        await searchUnified(mockHttp, `Query ${i}`, 1);
      }
      expect(searchCache.size).toBe(CACHE_MAX_ENTRIES);
      expect(searchCache.has('query 0::1')).toBe(true);

      // Insert one more
      await searchUnified(mockHttp, 'New Overflow Query', 1);
      expect(searchCache.size).toBe(CACHE_MAX_ENTRIES);
      // First key should have been evicted
      expect(searchCache.has('query 0::1')).toBe(false);
      expect(searchCache.has('new overflow query::1')).toBe(true);
    });
  });
});
