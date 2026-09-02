import { describe, it, expect, vi } from 'vitest';
import { normalizeUrl, getStreamInfo, getPlaylistInfo } from '../../src/core/extractor.js';

describe('Core Extractor', () => {
  describe('normalizeUrl', () => {
    it('should keep full http/https URLs intact', () => {
      expect(normalizeUrl('https://www.youtube.com/watch?v=123')).toBe('https://www.youtube.com/watch?v=123');
      expect(normalizeUrl('http://youtu.be/123')).toBe('http://youtu.be/123');
    });

    it('should convert raw video IDs to full YouTube URLs', () => {
      expect(normalizeUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });
  });

  describe('getStreamInfo', () => {
    it('should parse yt-dlp json output correctly', async () => {
      const mockExecYtdlp = vi.fn().mockResolvedValue(JSON.stringify({
        url: 'https://rr5---sn-4g5edn6r.googlevideo.com/videoplayback?id=123',
        duration: 213,
        title: 'Never Gonna Give You Up',
        ext: 'm4a',
        acodec: 'mp4a.40.2'
      }));

      const result = await getStreamInfo('dQw4w9WgXcQ', mockExecYtdlp);

      expect(mockExecYtdlp).toHaveBeenCalledWith([
        '-f',
        'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      ]);

      expect(result).toEqual({
        streamUrl: 'https://rr5---sn-4g5edn6r.googlevideo.com/videoplayback?id=123',
        duration: 213,
        title: 'Never Gonna Give You Up',
        container: 'm4a',
        codec: 'mp4a.40.2'
      });
    });

    it('should throw if yt-dlp output does not contain url', async () => {
      const mockExecYtdlp = vi.fn().mockResolvedValue(JSON.stringify({
        title: 'No URL Video'
      }));

      await expect(getStreamInfo('invalid', mockExecYtdlp)).rejects.toThrow('No stream URL returned by yt-dlp');
    });
  });

  describe('getPlaylistInfo', () => {
    it('should parse NDJSON playlist entries correctly', async () => {
      const ndjson = [
        JSON.stringify({
          playlist_id: 'PL123',
          playlist_title: 'My Playlist',
          id: 'v1',
          title: 'Track 1',
          duration: 180,
          thumbnails: [{ url: 'https://img.com/1.jpg' }],
          channel: 'Artist 1'
        }),
        JSON.stringify({
          id: 'v2',
          title: 'Track 2',
          duration: 240,
          thumbnail: 'https://img.com/2.jpg',
          channel: 'Artist 2'
        })
      ].join('\n');

      const mockExecYtdlp = vi.fn().mockResolvedValue(ndjson);

      const result = await getPlaylistInfo('https://youtube.com/playlist?list=PL123', mockExecYtdlp);

      expect(result.id).toBe('PL123');
      expect(result.title).toBe('My Playlist');
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toEqual({
        id: 'v1',
        title: 'Track 1',
        duration: 180,
        thumbnail: 'https://img.com/1.jpg',
        channel: 'Artist 1'
      });
      expect(result.entries[1]).toEqual({
        id: 'v2',
        title: 'Track 2',
        duration: 240,
        thumbnail: 'https://img.com/2.jpg',
        channel: 'Artist 2'
      });
    });

    it('should throw if playlist has no valid entries', async () => {
      const mockExecYtdlp = vi.fn().mockResolvedValue('');
      await expect(getPlaylistInfo('https://youtube.com/playlist?list=empty', mockExecYtdlp)).rejects.toThrow('No entries found in playlist');
    });
  });
});
