import type { StreamData, PlaylistData, PlaylistEntry } from './types.js';
import { parseNdjson } from './ndjson.js';

export function normalizeUrl(videoIdOrUrl: string): string {
  if (videoIdOrUrl.startsWith('http://') || videoIdOrUrl.startsWith('https://')) {
    return videoIdOrUrl;
  }
  return `https://www.youtube.com/watch?v=${videoIdOrUrl}`;
}

export type YtdlpExecutor = (args: string[]) => Promise<string>;

export async function getStreamInfo(
  videoIdOrUrl: string,
  execYtdlp: YtdlpExecutor
): Promise<StreamData> {
  const url = normalizeUrl(videoIdOrUrl);
  console.log(`[yt-dlp] Fetching stream info for: ${url}`);

  const stdout = await execYtdlp([
    '-f',
    'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    url
  ]);

  const info = JSON.parse(stdout);
  if (!info.url) {
    throw new Error('No stream URL returned by yt-dlp');
  }

  return {
    streamUrl: info.url,
    duration: info.duration || null,
    title: info.title || null,
    container: info.ext || null,
    codec: info.acodec || null
  };
}

export async function getPlaylistInfo(
  playlistUrl: string,
  execYtdlp: YtdlpExecutor
): Promise<PlaylistData> {
  console.log(`[yt-dlp] Fetching playlist metadata: ${playlistUrl}`);
  
  const stdout = await execYtdlp([
    '--dump-json',
    '--flat-playlist',
    '--no-warnings',
    playlistUrl
  ]);

  const rawEntries = parseNdjson(stdout);
  if (rawEntries.length === 0) {
    throw new Error('No entries found in playlist');
  }

  const playlistTitle = rawEntries.find(entry => entry.playlist_title)?.playlist_title || 'Unknown Playlist';
  const playlistId = rawEntries.find(entry => entry.playlist_id)?.playlist_id || '';

  const entries: PlaylistEntry[] = rawEntries
    .filter(entry => entry && entry.id)
    .map(entry => ({
      id: entry.id,
      title: entry.title || 'Unknown',
      duration: entry.duration || null,
      thumbnail: entry.thumbnail || (entry.thumbnails && entry.thumbnails.length > 0 ? entry.thumbnails[entry.thumbnails.length - 1].url : null),
      channel: entry.channel || null
    }));

  return {
    id: playlistId,
    title: playlistTitle,
    entries
  };
}
