import { describe, it, expect, vi } from 'vitest';
import {
  extractVideoId,
  isFormat18,
  findFormat18,
  extractUrlFromFormat,
  parsePlayerResponseFromHtml,
  toItag18Stream,
  resolveItag18Stream,
  type YouTubeFormat,
  type StreamingData
} from '../../src/core/itag18Resolver.js';
import type { HttpLike } from '../../src/core/types.js';

describe('itag 18 Faststart Resolver', () => {
  describe('extractVideoId', () => {
    it('should extract plain 11-char video ID', () => {
      expect(extractVideoId('eAVXuhIMcJI')).toBe('eAVXuhIMcJI');
      expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from standard watch URL', () => {
      expect(extractVideoId('https://www.youtube.com/watch?v=eAVXuhIMcJI')).toBe('eAVXuhIMcJI');
      expect(extractVideoId('https://www.youtube.com/watch?v=eAVXuhIMcJI&t=120s')).toBe('eAVXuhIMcJI');
    });

    it('should extract video ID from short youtu.be URL', () => {
      expect(extractVideoId('https://youtu.be/eAVXuhIMcJI')).toBe('eAVXuhIMcJI');
      expect(extractVideoId('https://youtu.be/eAVXuhIMcJI?si=12345')).toBe('eAVXuhIMcJI');
    });

    it('should extract video ID from embed URL', () => {
      expect(extractVideoId('https://www.youtube.com/embed/eAVXuhIMcJI')).toBe('eAVXuhIMcJI');
    });

    it('should return empty string for empty or non-string input', () => {
      expect(extractVideoId('')).toBe('');
      expect(extractVideoId(null as any)).toBe('');
      expect(extractVideoId(undefined as any)).toBe('');
    });
  });

  describe('isFormat18', () => {
    it('should return true for format with itag 18 as number', () => {
      expect(isFormat18({ itag: 18 })).toBe(true);
    });

    it('should return true for format with itag 18 as string', () => {
      expect(isFormat18({ itag: '18' })).toBe(true);
    });

    it('should return false for other itags', () => {
      expect(isFormat18({ itag: 140 })).toBe(false);
      expect(isFormat18({ itag: 251 })).toBe(false);
      expect(isFormat18({ itag: 22 })).toBe(false);
    });

    it('should return false for null or invalid objects', () => {
      expect(isFormat18(null)).toBe(false);
      expect(isFormat18(undefined)).toBe(false);
      expect(isFormat18({})).toBe(false);
    });
  });

  describe('findFormat18', () => {
    it('should find format 18 in formats array', () => {
      const streamingData: StreamingData = {
        formats: [
          { itag: 22, url: 'https://cdn.example.com/22' },
          { itag: 18, url: 'https://cdn.example.com/18' }
        ]
      };
      const found = findFormat18(streamingData);
      expect(found).toBeDefined();
      expect(found?.itag).toBe(18);
      expect(found?.url).toBe('https://cdn.example.com/18');
    });

    it('should find format 18 in adaptiveFormats array if not in formats', () => {
      const streamingData: StreamingData = {
        formats: [{ itag: 140, url: 'https://cdn.example.com/140' }],
        adaptiveFormats: [{ itag: 18, url: 'https://cdn.example.com/18-adaptive' }]
      };
      const found = findFormat18(streamingData);
      expect(found).toBeDefined();
      expect(found?.itag).toBe(18);
      expect(found?.url).toBe('https://cdn.example.com/18-adaptive');
    });

    it('should return null if format 18 is not present', () => {
      const streamingData: StreamingData = {
        formats: [{ itag: 140, url: 'https://cdn.example.com/140' }],
        adaptiveFormats: [{ itag: 251, url: 'https://cdn.example.com/251' }]
      };
      expect(findFormat18(streamingData)).toBeNull();
      expect(findFormat18(null)).toBeNull();
      expect(findFormat18(undefined)).toBeNull();
    });
  });

  describe('extractUrlFromFormat', () => {
    it('should return format.url directly when present', () => {
      const format: YouTubeFormat = {
        itag: 18,
        url: 'https://rr1---sn-example.googlevideo.com/videoplayback?itag=18'
      };
      expect(extractUrlFromFormat(format)).toBe('https://rr1---sn-example.googlevideo.com/videoplayback?itag=18');
    });

    it('should extract url from signatureCipher query string', () => {
      const targetUrl = 'https://rr1---sn-example.googlevideo.com/videoplayback?itag=18&test=1';
      const cipher = `url=${encodeURIComponent(targetUrl)}&sp=sig&s=sample_sig`;
      const format: YouTubeFormat = {
        itag: 18,
        signatureCipher: cipher
      };
      expect(extractUrlFromFormat(format)).toBe(targetUrl);
    });

    it('should extract url from legacy cipher property', () => {
      const targetUrl = 'https://rr2---sn-example.googlevideo.com/videoplayback?itag=18&legacy=1';
      const cipher = `url=${encodeURIComponent(targetUrl)}&sp=sig`;
      const format: YouTubeFormat = {
        itag: 18,
        cipher
      };
      expect(extractUrlFromFormat(format)).toBe(targetUrl);
    });

    it('should return null if neither url nor cipher is present', () => {
      const format: YouTubeFormat = { itag: 18 };
      expect(extractUrlFromFormat(format)).toBeNull();
    });
  });

  describe('parsePlayerResponseFromHtml', () => {
    it('should parse ytInitialPlayerResponse from script variable', () => {
      const mockPlayerResponse = {
        playabilityStatus: { status: 'OK' },
        streamingData: {
          formats: [
            { itag: 18, url: 'https://rr3---sn-html.googlevideo.com/videoplayback?itag=18' }
          ]
        }
      };
      const html = `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(mockPlayerResponse)};var other = 1;</script></body></html>`;
      const parsed = parsePlayerResponseFromHtml(html);
      expect(parsed).toEqual(mockPlayerResponse);
    });

    it('should parse window["ytInitialPlayerResponse"] assignment', () => {
      const mockPlayerResponse = {
        streamingData: {
          formats: [{ itag: 18, url: 'https://cdn.example.com/window-18' }]
        }
      };
      const html = `<script>window["ytInitialPlayerResponse"] = ${JSON.stringify(mockPlayerResponse)};</script>`;
      const parsed = parsePlayerResponseFromHtml(html);
      expect(parsed).toEqual(mockPlayerResponse);
    });

    it('should return null for HTML without player response', () => {
      expect(parsePlayerResponseFromHtml('<html><body>No data</body></html>')).toBeNull();
      expect(parsePlayerResponseFromHtml('')).toBeNull();
    });
  });

  describe('toItag18Stream', () => {
    it('should format progressive itag 18 stream for long tracks', () => {
      const stream = toItag18Stream(
        'https://rr1---sn-example.googlevideo.com/videoplayback?itag=18',
        5410, // ~1h30m track in seconds
        'eAVXuhIMcJI'
      );

      expect(stream).toEqual({
        url: 'https://rr1---sn-example.googlevideo.com/videoplayback?itag=18',
        protocol: 'https',
        container: 'mp4',
        mimeType: 'video/mp4',
        durationMs: 5410000,
        source: {
          provider: 'nucleartube-streaming',
          id: 'eAVXuhIMcJI'
        }
      });
    });

    it('should handle custom provider identifier', () => {
      const stream = toItag18Stream(
        'https://cdn.example.com/stream.mp4',
        3600,
        'custom_id',
        'custom-streaming-provider'
      );

      expect(stream.source.provider).toBe('custom-streaming-provider');
      expect(stream.source.id).toBe('custom_id');
      expect(stream.durationMs).toBe(3600000);
    });

    it('should omit durationMs if duration is null or undefined', () => {
      const stream = toItag18Stream('https://cdn.example.com/stream.mp4', null, 'vid123');
      expect(stream.durationMs).toBeUndefined();

      const streamNoDur = toItag18Stream('https://cdn.example.com/stream.mp4', undefined, 'vid123');
      expect(streamNoDur.durationMs).toBeUndefined();
    });

    it('should throw if url is empty or whitespace', () => {
      expect(() => toItag18Stream('', 3600, 'vid123')).toThrow('toItag18Stream requires a valid non-empty stream URL');
      expect(() => toItag18Stream('   ', 3600, 'vid123')).toThrow('toItag18Stream requires a valid non-empty stream URL');
      expect(() => toItag18Stream(null as any, 3600, 'vid123')).toThrow('toItag18Stream requires a valid non-empty stream URL');
    });
  });

  describe('resolveItag18Stream', () => {
    it('should resolve format 18 directly via Tier 1 (Innertube Android API)', async () => {
      const directUrl = 'https://rr1---sn-android.googlevideo.com/videoplayback?itag=18&source=youtube';
      const mockPlayerResponse = {
        playabilityStatus: { status: 'OK' },
        streamingData: {
          formats: [
            {
              itag: 18,
              url: directUrl,
              mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
              bitrate: 649234,
              qualityLabel: '360p'
            }
          ]
        }
      };

      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify(mockPlayerResponse)
        })
      };

      const resolvedUrl = await resolveItag18Stream(mockHttp, 'eAVXuhIMcJI');
      expect(resolvedUrl).toBe(directUrl);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = (mockHttp.fetch as any).mock.calls[0];
      expect(calledUrl).toContain('youtubei/v1/player');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.headers['Content-Type']).toBe('application/json');

      const parsedBody = JSON.parse(calledInit.body);
      expect(parsedBody.videoId).toBe('eAVXuhIMcJI');
      expect(parsedBody.context.client.clientName).toBe('ANDROID');
    });

    it('should fall back to Tier 2 (Web Client) when Tier 1 returns no format 18', async () => {
      const webDirectUrl = 'https://rr2---sn-web.googlevideo.com/videoplayback?itag=18';
      const mockAndroidResponse = {
        playabilityStatus: { status: 'OK' },
        streamingData: {
          formats: [{ itag: 22, url: 'https://cdn.example.com/22' }]
        }
      };
      const mockWebResponse = {
        playabilityStatus: { status: 'OK' },
        streamingData: {
          formats: [{ itag: 18, url: webDirectUrl }]
        }
      };

      const mockHttp: HttpLike = {
        fetch: vi.fn()
          .mockResolvedValueOnce({
            status: 200,
            body: JSON.stringify(mockAndroidResponse)
          })
          .mockResolvedValueOnce({
            status: 200,
            body: JSON.stringify(mockWebResponse)
          })
      };

      const resolvedUrl = await resolveItag18Stream(mockHttp, 'eAVXuhIMcJI');
      expect(resolvedUrl).toBe(webDirectUrl);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(2);

      const secondCallBody = JSON.parse((mockHttp.fetch as any).mock.calls[1][1].body);
      expect(secondCallBody.context.client.clientName).toBe('WEB');
    });

    it('should fall back to Tier 3 (HTML scrape) when Innertube API calls fail', async () => {
      const htmlDirectUrl = 'https://rr3---sn-html.googlevideo.com/videoplayback?itag=18';
      const mockHtmlPlayerResponse = {
        streamingData: {
          formats: [{ itag: 18, url: htmlDirectUrl }]
        }
      };
      const htmlBody = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(mockHtmlPlayerResponse)};</script></html>`;

      const mockHttp: HttpLike = {
        fetch: vi.fn()
          .mockRejectedValueOnce(new Error('Android API network error'))
          .mockResolvedValueOnce({ status: 500, body: 'Server Error' })
          .mockResolvedValueOnce({ status: 200, body: htmlBody })
      };

      const resolvedUrl = await resolveItag18Stream(mockHttp, 'eAVXuhIMcJI');
      expect(resolvedUrl).toBe(htmlDirectUrl);
      expect(mockHttp.fetch).toHaveBeenCalledTimes(3);

      const thirdCallUrl = (mockHttp.fetch as any).mock.calls[2][0];
      expect(thirdCallUrl).toContain('https://www.youtube.com/watch?v=eAVXuhIMcJI');
    });

    it('should throw when all tiers fail to find format 18', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify({
            playabilityStatus: { status: 'OK' },
            streamingData: { formats: [{ itag: 140, url: '...' }] }
          })
        })
      };

      await expect(resolveItag18Stream(mockHttp, 'unknown_id')).rejects.toThrow(
        'No format 18 stream found for video: unknown_id'
      );
    });

    it('should throw for invalid or empty video ID', async () => {
      const mockHttp: HttpLike = { fetch: vi.fn() };
      await expect(resolveItag18Stream(mockHttp, '')).rejects.toThrow('Invalid video ID');
      await expect(resolveItag18Stream(mockHttp, '   ')).rejects.toThrow('Invalid video ID');
      expect(mockHttp.fetch).not.toHaveBeenCalled();
    });

    it('should integrate end-to-end: resolve and format itag 18 stream', async () => {
      const mockDirectUrl = 'https://rr1---sn-test.googlevideo.com/videoplayback?itag=18';
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify({
            streamingData: {
              formats: [{ itag: 18, url: mockDirectUrl }]
            }
          })
        })
      };

      const url = await resolveItag18Stream(mockHttp, 'https://www.youtube.com/watch?v=eAVXuhIMcJI');
      const stream = toItag18Stream(url, 5410, 'eAVXuhIMcJI');

      expect(stream).toEqual({
        url: mockDirectUrl,
        protocol: 'https',
        container: 'mp4',
        mimeType: 'video/mp4',
        durationMs: 5410000,
        source: {
          provider: 'nucleartube-streaming',
          id: 'eAVXuhIMcJI'
        }
      });
    });
  });
});
