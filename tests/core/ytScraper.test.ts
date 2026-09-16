import { describe, it, expect, vi } from 'vitest';
import { parseDuration, parseYoutubeSearchHtml, scrapeYoutube, decodeHexEscapes, parseMobileYoutubeSearchHtml, scrapeMobileYoutube } from '../../src/core/ytScraper.js';
import type { HttpLike } from '../../src/core/types.js';

describe('Core YouTube Scraper', () => {
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

  describe('decodeHexEscapes', () => {
    it('should decode \\x7b to { and \\x7d to }', () => {
      expect(decodeHexEscapes('\\x7b\\x7d')).toBe('{}');
    });

    it('should decode \\x22 to double quote', () => {
      expect(decodeHexEscapes('\\x22hello\\x22')).toBe('"hello"');
    });

    it('should pass through strings without hex escapes', () => {
      expect(decodeHexEscapes('no escapes here')).toBe('no escapes here');
    });

    it('should decode mixed hex and normal text', () => {
      expect(decodeHexEscapes('\\x7b"key"\\x3a\\x22value\\x22\\x7d')).toBe('{"key":"value"}');
    });
  });

  describe('parseMobileYoutubeSearchHtml', () => {
    it('should parse hex-encoded mobile ytInitialData with videoWithContextRenderer', () => {
      const mockData = {
        contents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    {
                      videoWithContextRenderer: {
                        videoId: 'jNQXAC9IVRw',
                        headline: { runs: [{ text: 'Me at the zoo' }] },
                        shortBylineText: { runs: [{ text: 'jawed' }] },
                        lengthText: { runs: [{ text: '0:19' }] },
                        thumbnail: {
                          thumbnails: [
                            { url: 'https://i.ytimg.com/vi/jNQXAC9IVRw/default.jpg' },
                            { url: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg' }
                          ]
                        }
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      };

      const jsonStr = JSON.stringify(mockData);
      const hexEncoded = jsonStr
        .replace(/{/g, '\\x7b').replace(/}/g, '\\x7d')
        .replace(/"/g, '\\x22');

      const html = `<html><script>var ytInitialData = '${hexEncoded}';</script></html>`;
      const results = parseMobileYoutubeSearchHtml(html, 5);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'jNQXAC9IVRw',
        title: 'Me at the zoo',
        duration: 19,
        thumbnail: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
        channel: 'jawed'
      });
    });

    it('should throw if mobile ytInitialData is missing', () => {
      const html = '<html><body>No data</body></html>';
      expect(() => parseMobileYoutubeSearchHtml(html)).toThrow('No mobile ytInitialData found');
    });

    it('should handle multiple videoWithContextRenderer items', () => {
      const mockData = {
        contents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    {
                      videoWithContextRenderer: {
                        videoId: 'vid1',
                        headline: { runs: [{ text: 'Song 1' }] },
                        shortBylineText: { runs: [{ text: 'Artist 1' }] },
                        lengthText: { runs: [{ text: '3:00' }] },
                        thumbnail: { thumbnails: [{ url: 'https://thumb1.jpg' }] }
                      }
                    },
                    {
                      videoWithContextRenderer: {
                        videoId: 'vid2',
                        headline: { runs: [{ text: 'Song 2' }] },
                        shortBylineText: { runs: [{ text: 'Artist 2' }] },
                        lengthText: { runs: [{ text: '4:30' }] },
                        thumbnail: { thumbnails: [{ url: 'https://thumb2.jpg' }] }
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      };

      const jsonStr = JSON.stringify(mockData);
      const hexEncoded = jsonStr
        .replace(/{/g, '\\x7b').replace(/}/g, '\\x7d')
        .replace(/"/g, '\\x22');

      const html = `<script>var ytInitialData = '${hexEncoded}';</script>`;
      const results = parseMobileYoutubeSearchHtml(html, 10);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('vid1');
      expect(results[1].id).toBe('vid2');
    });
  });

  describe('scrapeMobileYoutube', () => {
    it('should fetch from m.youtube.com and parse results', async () => {
      const mockData = {
        contents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    {
                      videoWithContextRenderer: {
                        videoId: 'mobile123',
                        headline: { runs: [{ text: 'Mobile Song' }] },
                        shortBylineText: { runs: [{ text: 'Mobile Artist' }] },
                        lengthText: { runs: [{ text: '2:45' }] },
                        thumbnail: { thumbnails: [{ url: 'https://mobile-thumb.jpg' }] }
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      };

      const hexEncoded = JSON.stringify(mockData)
        .replace(/{/g, '\\x7b').replace(/}/g, '\\x7d')
        .replace(/"/g, '\\x22');
      const html = `<script>var ytInitialData = '${hexEncoded}';</script>`;

      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({ status: 200, body: html })
      };

      const results = await scrapeMobileYoutube(mockHttp, 'test query', 5);

      expect(mockHttp.fetch).toHaveBeenCalledWith(
        'https://m.youtube.com/results?search_query=test%20query',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('iPhone')
          })
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mobile123');
    });

    it('should throw on non-200 status', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({ status: 403, body: '' })
      };

      await expect(scrapeMobileYoutube(mockHttp, 'test', 5))
        .rejects.toThrow('YouTube Mobile returned status 403');
    });
  });

  describe('Tiered fallback integration', () => {
    it('should fall back to desktop when mobile scrape fails', async () => {
      const desktopData = {
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
                            videoId: 'desktop123',
                            title: { runs: [{ text: 'Desktop Song' }] },
                            lengthText: { simpleText: '5:00' },
                            thumbnail: { thumbnails: [{ url: 'https://desktop-thumb.jpg' }] },
                            ownerText: { runs: [{ text: 'Desktop Artist' }] }
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

      const mockHttp: HttpLike = {
        fetch: vi.fn()
          .mockResolvedValueOnce({ status: 500, body: '' })  // Mobile fails
          .mockResolvedValueOnce({                             // Desktop succeeds
            status: 200,
            body: `var ytInitialData = ${JSON.stringify(desktopData)};</script>`
          })
      };

      const results = await scrapeYoutube(mockHttp, 'test', 10);

      expect(mockHttp.fetch).toHaveBeenCalledTimes(2);
      expect(mockHttp.fetch.mock.calls[0][0]).toContain('m.youtube.com');
      expect(mockHttp.fetch.mock.calls[1][0]).toContain('www.youtube.com');
      expect(results[0].id).toBe('desktop123');
    });

    it('should invoke fallbackFn when both mobile and desktop fail', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockRejectedValue(new Error('Network error'))
      };
      const fallbackFn = vi.fn().mockResolvedValue([{
        id: 'ytDlp123', title: 'yt-dlp Song', duration: 60, thumbnail: null, channel: 'yt-dlp Artist'
      }]);

      const results = await scrapeYoutube(mockHttp, 'test', 5, fallbackFn);

      expect(fallbackFn).toHaveBeenCalledWith('test', 5);
      expect(results[0].id).toBe('ytDlp123');
    });

    it('should throw when all tiers fail and no fallbackFn provided', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockRejectedValue(new Error('Network error'))
      };

      await expect(scrapeYoutube(mockHttp, 'test', 5))
        .rejects.toThrow('All YouTube scrape tiers failed');
    });
  });
});
