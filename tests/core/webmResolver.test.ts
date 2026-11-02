import { describe, it, expect, vi } from 'vitest';
import {
  normalizeVideoId,
  findWebmFormat,
  extractUrlFromFormat,
  extractJsonFromHtmlAssignment,
  parsePlayerResponseFromHtml,
  resolveWebmStream,
  toWebmStream,
  ITAG_WEBM_OPUS_160K,
  ITAG_WEBM_OPUS_70K,
  ITAG_WEBM_OPUS_50K
} from '../../src/core/webmResolver.js';
import type { HttpLike } from '../../src/core/types.js';

describe('WebM Resolver (Alternative 3: itag 251)', () => {
  describe('normalizeVideoId', () => {
    it('should return 11-char video ID as-is', () => {
      expect(normalizeVideoId('eAVXuhIMcJI')).toBe('eAVXuhIMcJI');
    });

    it('should extract video ID from standard watch URL', () => {
      expect(normalizeVideoId('https://www.youtube.com/watch?v=eAVXuhIMcJI')).toBe('eAVXuhIMcJI');
      expect(normalizeVideoId('https://www.youtube.com/watch?v=eAVXuhIMcJI&t=120s')).toBe('eAVXuhIMcJI');
    });

    it('should extract video ID from short youtu.be URL', () => {
      expect(normalizeVideoId('https://youtu.be/eAVXuhIMcJI')).toBe('eAVXuhIMcJI');
      expect(normalizeVideoId('https://youtu.be/eAVXuhIMcJI?si=abc123')).toBe('eAVXuhIMcJI');
    });

    it('should extract video ID from embed URL', () => {
      expect(normalizeVideoId('https://www.youtube.com/embed/eAVXuhIMcJI')).toBe('eAVXuhIMcJI');
    });

    it('should throw if video ID is empty or invalid', () => {
      expect(() => normalizeVideoId('')).toThrow('Video ID cannot be empty');
      expect(() => normalizeVideoId('   ')).toThrow('Video ID cannot be empty');
      expect(() => normalizeVideoId(null as any)).toThrow('Video ID is required');
    });
  });

  describe('findWebmFormat', () => {
    it('should select itag 251 when present', () => {
      const formats: any[] = [
        { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000 },
        { itag: 251, mimeType: 'audio/webm; codecs="opus"', bitrate: 160000 },
        { itag: 250, mimeType: 'audio/webm; codecs="opus"', bitrate: 70000 }
      ];

      const match = findWebmFormat(formats);
      expect(match).toBeDefined();
      expect(match?.itag).toBe(ITAG_WEBM_OPUS_160K);
    });

    it('should fall back to itag 250 if itag 251 is missing', () => {
      const formats: any[] = [
        { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000 },
        { itag: 250, mimeType: 'audio/webm; codecs="opus"', bitrate: 70000 },
        { itag: 249, mimeType: 'audio/webm; codecs="opus"', bitrate: 50000 }
      ];

      const match = findWebmFormat(formats);
      expect(match).toBeDefined();
      expect(match?.itag).toBe(ITAG_WEBM_OPUS_70K);
    });

    it('should fall back to itag 249 if 251 and 250 are missing', () => {
      const formats: any[] = [
        { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000 },
        { itag: 249, mimeType: 'audio/webm; codecs="opus"', bitrate: 50000 }
      ];

      const match = findWebmFormat(formats);
      expect(match).toBeDefined();
      expect(match?.itag).toBe(ITAG_WEBM_OPUS_50K);
    });

    it('should fall back to any audio/webm format with highest bitrate', () => {
      const formats: any[] = [
        { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000 },
        { itag: 300, mimeType: 'audio/webm; codecs="vorbis"', bitrate: 96000 },
        { itag: 301, mimeType: 'audio/webm; codecs="vorbis"', bitrate: 128000 }
      ];

      const match = findWebmFormat(formats);
      expect(match).toBeDefined();
      expect(match?.itag).toBe(301);
    });

    it('should return null if no webm audio format is available', () => {
      const formats: any[] = [
        { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000 }
      ];

      expect(findWebmFormat(formats)).toBeNull();
      expect(findWebmFormat([])).toBeNull();
    });
  });

  describe('extractUrlFromFormat', () => {
    it('should extract direct url from format', () => {
      const format: any = {
        itag: 251,
        url: 'https://rr3---sn.googlevideo.com/videoplayback?id=123',
        mimeType: 'audio/webm; codecs="opus"'
      };

      expect(extractUrlFromFormat(format)).toBe('https://rr3---sn.googlevideo.com/videoplayback?id=123');
    });

    it('should extract and decode url from signatureCipher', () => {
      const cipher = 'url=https%3A%2F%2Frr3---sn.googlevideo.com%2Fvideoplayback%3Fid%3D123&sp=sig&s=sample_sig';
      const format: any = {
        itag: 251,
        signatureCipher: cipher,
        mimeType: 'audio/webm; codecs="opus"'
      };

      const extracted = extractUrlFromFormat(format);
      expect(extracted).toContain('https://rr3---sn.googlevideo.com/videoplayback?id=123');
      expect(extracted).toContain('sig=sample_sig');
    });

    it('should return null if neither url nor cipher exists', () => {
      expect(extractUrlFromFormat({ itag: 251, mimeType: 'audio/webm' } as any)).toBeNull();
      expect(extractUrlFromFormat(null as any)).toBeNull();
    });
  });

  describe('HTML assignment & player response parsing', () => {
    it('should extract balanced JSON assignment from HTML', () => {
      const html = `<html><head><script>var ytInitialPlayerResponse = {"streamingData":{"adaptiveFormats":[{"itag":251,"url":"https://example.com/audio.webm"}]}};</script></head></html>`;
      const json = extractJsonFromHtmlAssignment(html, 'ytInitialPlayerResponse');

      expect(json).toBeDefined();
      expect(json?.streamingData?.adaptiveFormats[0]?.itag).toBe(251);
    });

    it('should handle nested braces and quotes correctly', () => {
      const html = `<script>ytInitialPlayerResponse = {"title":"Track {with braces} and ; semicolon","streamingData":{"adaptiveFormats":[]}};</script>`;
      const json = parsePlayerResponseFromHtml(html);

      expect(json).toBeDefined();
      expect(json?.title).toBe('Track {with braces} and ; semicolon');
    });

    it('should return null if variable assignment is not found', () => {
      const html = `<html><body>No data here</body></html>`;
      expect(parsePlayerResponseFromHtml(html)).toBeNull();
    });
  });

  describe('resolveWebmStream', () => {
    it('should resolve itag 251 URL from YouTubei Android response (Tier 1)', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify({
            playabilityStatus: { status: 'OK' },
            streamingData: {
              adaptiveFormats: [
                {
                  itag: 140,
                  mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                  url: 'https://example.com/itag140.m4a'
                },
                {
                  itag: 251,
                  mimeType: 'audio/webm; codecs="opus"',
                  url: 'https://example.com/itag251-android.webm'
                }
              ]
            }
          })
        })
      };

      const url = await resolveWebmStream(mockHttp, 'eAVXuhIMcJI');
      expect(url).toBe('https://example.com/itag251-android.webm');
      expect(mockHttp.fetch).toHaveBeenCalledTimes(1);
    });

    it('should fall back to YouTubei Web response (Tier 2) if Tier 1 fails', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn()
          // First call: Android returns empty/failure
          .mockResolvedValueOnce({
            status: 403,
            body: ''
          })
          // Second call: Web client returns format 251
          .mockResolvedValueOnce({
            status: 200,
            body: JSON.stringify({
              playabilityStatus: { status: 'OK' },
              streamingData: {
                adaptiveFormats: [
                  {
                    itag: 251,
                    mimeType: 'audio/webm; codecs="opus"',
                    url: 'https://example.com/itag251-web.webm'
                  }
                ]
              }
            })
          })
      };

      const url = await resolveWebmStream(mockHttp, 'eAVXuhIMcJI');
      expect(url).toBe('https://example.com/itag251-web.webm');
      expect(mockHttp.fetch).toHaveBeenCalledTimes(2);
    });

    it('should fall back to watch page HTML scrape (Tier 3) if YouTubei fails', async () => {
      const htmlBody = `<html><script>var ytInitialPlayerResponse = {"streamingData":{"adaptiveFormats":[{"itag":251,"url":"https://example.com/itag251-html.webm","mimeType":"audio/webm"}]}};</script></html>`;

      const mockHttp: HttpLike = {
        fetch: vi.fn()
          .mockResolvedValueOnce({ status: 500, body: 'Error' }) // Android fails
          .mockResolvedValueOnce({ status: 500, body: 'Error' }) // Web fails
          .mockResolvedValueOnce({ status: 200, body: htmlBody }) // HTML succeeds
      };

      const url = await resolveWebmStream(mockHttp, 'eAVXuhIMcJI');
      expect(url).toBe('https://example.com/itag251-html.webm');
      expect(mockHttp.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw an error if all tiers fail to find a WebM format', async () => {
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: JSON.stringify({
            streamingData: {
              adaptiveFormats: [
                { itag: 140, mimeType: 'audio/mp4', url: 'https://example.com/140.mp4' }
              ]
            }
          })
        })
      };

      await expect(resolveWebmStream(mockHttp, 'eAVXuhIMcJI')).rejects.toThrow(
        'Unable to resolve WebM Opus stream for video: eAVXuhIMcJI'
      );
    });
  });

  describe('toWebmStream', () => {
    it('should return RFC compliant Stream object with webm container and audio/webm mimeType', () => {
      const rawUrl = 'https://rr3---sn.googlevideo.com/videoplayback?id=xyz';
      const duration = 5410; // seconds (~1h30m)
      const sourceId = 'eAVXuhIMcJI';

      const stream = toWebmStream(rawUrl, duration, sourceId);

      expect(stream).toEqual({
        url: 'https://rr3---sn.googlevideo.com/videoplayback?id=xyz&range=0-99999999999',
        protocol: 'https',
        container: 'webm',
        mimeType: 'audio/webm',
        codec: 'opus',
        durationMs: 5410000,
        source: {
          provider: 'nucleartube-streaming',
          id: 'eAVXuhIMcJI'
        }
      });
    });

    it('should preserve existing range parameter in stream URL', () => {
      const urlWithRange = 'https://example.com/stream.webm?range=0-5000&expire=123';
      const stream = toWebmStream(urlWithRange, 3600, 'vid123');

      expect(stream.url).toBe(urlWithRange);
      expect(stream.container).toBe('webm');
      expect(stream.mimeType).toBe('audio/webm');
    });

    it('should correctly handle undefined or null duration', () => {
      const stream = toWebmStream('https://example.com/stream.webm', null, 'vid123');

      expect(stream.durationMs).toBeUndefined();
      expect(stream.container).toBe('webm');
      expect(stream.mimeType).toBe('audio/webm');
    });

    it('should support custom streaming provider ID', () => {
      const stream = toWebmStream(
        'https://example.com/stream.webm',
        7200,
        'customId',
        'custom-provider'
      );

      expect(stream.source).toEqual({
        provider: 'custom-provider',
        id: 'customId'
      });
    });

    it('should throw if URL is missing or empty', () => {
      expect(() => toWebmStream('', 3600, 'vid')).toThrow('Stream URL is required');
      expect(() => toWebmStream(null as any, 3600, 'vid')).toThrow('Stream URL is required');
    });
  });
});
