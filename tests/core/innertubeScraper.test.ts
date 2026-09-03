import { describe, it, expect, vi } from 'vitest';
import {
  searchInnertube,
  parseInnertubeResponse,
  getThumbnailUrl,
  INNERTUBE_SEARCH_ENDPOINT,
  INNERTUBE_CLIENT_CONTEXT
} from '../../src/core/innertubeScraper.js';
import type { HttpLike } from '../../src/core/types.js';
import normalFixture from '../fixtures/innertube-response-normal.json';
import emptyFixture from '../fixtures/innertube-response-empty.json';
import errorFixture from '../fixtures/innertube-response-error.json';
import fallbackFixture from '../fixtures/innertube-response-fallback-section.json';

describe('Innertube Scraper', () => {
  describe('parseInnertubeResponse', () => {
    it('should parse musicShelfRenderer results from normal fixture', () => {
      const results = parseInnertubeResponse(normalFixture, 10);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        duration: 213,
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        channel: 'Rick Astley'
      });
      expect(results[1]).toEqual({
        id: '9bZkp7q19f0',
        title: 'Gangnam Style',
        duration: 252,
        thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg',
        channel: 'PSY'
      });
    });

    it('should parse itemSectionRenderer results from fallback fixture', () => {
      const results = parseInnertubeResponse(fallbackFixture, 10);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'generic123',
        title: 'Generic Video Title',
        duration: 300,
        thumbnail: 'https://i.ytimg.com/vi/generic123/hqdefault.jpg',
        channel: 'Generic Channel'
      });
    });

    it('should return empty array for empty fixture', () => {
      const results = parseInnertubeResponse(emptyFixture, 10);
      expect(results).toEqual([]);
    });

    it('should return empty array for null, undefined, or non-object inputs', () => {
      expect(parseInnertubeResponse(null as any)).toEqual([]);
      expect(parseInnertubeResponse(undefined as any)).toEqual([]);
      expect(parseInnertubeResponse('invalid' as any)).toEqual([]);
    });

    it('should respect the limit parameter', () => {
      const results = parseInnertubeResponse(normalFixture, 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dQw4w9WgXcQ');
    });

    it('should handle tabbedSearchResultsRenderer and twoColumnSearchResultsRenderer structures', () => {
      const tabbedData = {
        contents: {
          tabbedSearchResultsRenderer: {
            tabs: [
              {
                tabRenderer: {
                  content: {
                    sectionListRenderer: {
                      contents: fallbackFixture.contents.sectionListRenderer.contents
                    }
                  }
                }
              }
            ]
          }
        }
      };
      const results = parseInnertubeResponse(tabbedData, 10);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('generic123');

      const twoColumnData = {
        contents: {
          twoColumnSearchResultsRenderer: {
            primaryContents: {
              sectionListRenderer: {
                contents: fallbackFixture.contents.sectionListRenderer.contents
              }
            }
          }
        }
      };
      const results2 = parseInnertubeResponse(twoColumnData, 10);
      expect(results2).toHaveLength(1);
      expect(results2[0].id).toBe('generic123');
    });

    it('should handle alternative videoId and duration extraction paths', () => {
      const customMusicData = {
        contents: [
          {
            musicShelfRenderer: {
              contents: [
                {
                  musicResponsiveListItemRenderer: {
                    navigationEndpoint: {
                      watchEndpoint: { videoId: 'navWatch123' }
                    },
                    flexColumns: [
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: { runs: [{ text: 'Song Title' }] }
                        }
                      },
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: { runs: [{ text: 'Artist Name' }, { text: ' • ' }, { text: '3:45' }] }
                        }
                      }
                    ],
                    thumbnail: {
                      thumbnails: [{ url: 'https://thumb.jpg' }]
                    }
                  }
                },
                {
                  // Missing videoId should be skipped
                  musicResponsiveListItemRenderer: {
                    flexColumns: [
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: { runs: [{ text: 'No ID' }] }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      };

      const results = parseInnertubeResponse(customMusicData, 10);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'navWatch123',
        title: 'Song Title',
        duration: 225,
        thumbnail: 'https://i.ytimg.com/vi/navWatch123/hqdefault.jpg',
        channel: 'Artist Name'
      });
    });

    it('should handle items with canonical i.ytimg.com thumbnails and fallback for simpleText', () => {
      const data = {
        contents: [
          {
            musicShelfRenderer: {
              contents: [
                {
                  musicResponsiveListItemRenderer: {
                    playlistItemData: { videoId: 'noThumb123' },
                    title: { runs: [{ text: 'Fallback Title' }] },
                    ownerText: { runs: [{ text: 'Fallback Channel' }] }
                  }
                }
              ]
            }
          },
          {
            itemSectionRenderer: {
              contents: [
                {
                  videoRenderer: {
                    videoId: 'genericNoThumb',
                    title: { simpleText: 'Generic Title Only' }
                  }
                },
                {
                  // Empty videoRenderer without id should be ignored
                  videoRenderer: {}
                }
              ]
            }
          }
        ]
      };

      const results = parseInnertubeResponse(data, 10);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'noThumb123',
        title: 'Fallback Title',
        duration: null,
        thumbnail: 'https://i.ytimg.com/vi/noThumb123/hqdefault.jpg',
        channel: 'Fallback Channel'
      });

      // When musicShelf is empty, generic items are parsed
      const genericOnlyData = {
        contents: [data.contents[1]]
      };
      const genericResults = parseInnertubeResponse(genericOnlyData, 10);
      expect(genericResults).toHaveLength(1);
      expect(genericResults[0]).toEqual({
        id: 'genericNoThumb',
        title: 'Generic Title Only',
        duration: null,
        thumbnail: 'https://i.ytimg.com/vi/genericNoThumb/hqdefault.jpg',
        channel: null
      });
    });

    it('should parse musicCardShelfRenderer (hero card + child contents)', () => {
      const cardData = {
        contents: [
          {
            musicCardShelfRenderer: {
              title: {
                runs: [
                  {
                    text: 'Queen Hero',
                    navigationEndpoint: { watchEndpoint: { videoId: 'heroQueen1' } }
                  }
                ]
              },
              subtitle: { runs: [{ text: 'Queen Official' }] },
              thumbnail: {
                musicThumbnailRenderer: {
                  thumbnail: { thumbnails: [{ url: 'https://hero-thumb.jpg' }] }
                }
              },
              contents: [
                {
                  musicResponsiveListItemRenderer: {
                    playlistItemData: { videoId: 'childQueen2' },
                    flexColumns: [
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: { runs: [{ text: 'Child Song' }] }
                        }
                      },
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: { runs: [{ text: 'Queen' }] }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            itemSectionRenderer: {
              contents: [
                {
                  musicResponsiveListItemRenderer: {
                    playlistItemData: { videoId: 'sectionItem3' },
                    flexColumns: [
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: { runs: [{ text: 'Section Song' }] }
                        }
                      },
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: { runs: [{ text: 'Section Artist' }] }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      };

      const results = parseInnertubeResponse(cardData, 10);
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        id: 'heroQueen1',
        title: 'Queen Hero',
        duration: null,
        thumbnail: 'https://i.ytimg.com/vi/heroQueen1/hqdefault.jpg',
        channel: 'Queen Official'
      });
      expect(results[1].id).toBe('childQueen2');
      expect(results[2].id).toBe('sectionItem3');
    });

    it('should test getThumbnailUrl fallback behavior', () => {
      expect(getThumbnailUrl('abc12345678')).toBe('https://i.ytimg.com/vi/abc12345678/hqdefault.jpg');
      expect(getThumbnailUrl(null, [{ url: 'https://fallback.jpg' }])).toBe('https://fallback.jpg');
      expect(getThumbnailUrl('', [{ url: 'https://fallback.jpg' }])).toBe('https://fallback.jpg');
      expect(getThumbnailUrl(null, [])).toBeNull();
      expect(getThumbnailUrl('invalid/path', [{ url: 'https://raw.jpg' }])).toBe('https://raw.jpg');
    });
  });

  describe('searchInnertube', () => {
    it('should send POST request with correct payload and headers, and return parsed results', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify(normalFixture)
        })
      };

      const results = await searchInnertube(mockHttp, 'Rick Astley', 5);

      expect(mockHttp.fetch).toHaveBeenCalledTimes(1);
      expect(mockHttp.fetch).toHaveBeenCalledWith(
        INNERTUBE_SEARCH_ENDPOINT,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': expect.any(String),
            'Accept-Language': 'en-US,en;q=0.9'
          }),
          body: JSON.stringify({
            context: INNERTUBE_CLIENT_CONTEXT,
            query: 'Rick Astley'
          })
        })
      );

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('dQw4w9WgXcQ');
    });

    it('should handle response body provided as pre-parsed object', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: normalFixture as any
        })
      };

      const results = await searchInnertube(mockHttp, 'Rick Astley', 5);
      expect(results).toHaveLength(2);
    });

    it('should throw error when HTTP status is not 200', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 429,
          body: JSON.stringify(errorFixture)
        })
      };

      await expect(searchInnertube(mockHttp, 'Test Query', 10)).rejects.toThrow(
        'Innertube request failed with status 429'
      );
    });

    it('should throw error when response contains an error object', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify(errorFixture)
        })
      };

      await expect(searchInnertube(mockHttp, 'Test Query', 10)).rejects.toThrow(
        'Resource has been exhausted'
      );
    });

    it('should throw error when body contains invalid JSON', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: 'Not valid JSON'
        })
      };

      await expect(searchInnertube(mockHttp, 'Test Query', 10)).rejects.toThrow();
    });
  });
});
