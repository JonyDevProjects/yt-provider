import type {
  NuclearPlugin,
  NuclearPluginAPI,
  StreamingProvider,
  StreamCandidate,
  Stream,
  YtdlpStreamInfo as SDKStreamInfo,
  Track,
  PlaylistProvider,
  Playlist,
  MetadataProvider
} from '@nuclearplayer/plugin-sdk';
import { scrapeYoutube as coreScrapeYoutube } from './core/ytScraper.js';
import type { StreamData, HttpLike, SearchResult } from './core/types.js';

const PROVIDER_ID = 'nucleartube';
const PROVIDER_NAME = 'NuclearTube';

const STREAMING_ID = `${PROVIDER_ID}-streaming`;
const PLAYLIST_ID = `${PROVIDER_ID}-playlist`;
const METADATA_ID = `${PROVIDER_ID}-metadata`;

function sdkToInternal(info: SDKStreamInfo): StreamData {
  return {
    streamUrl: info.stream_url,
    duration: info.duration,
    title: info.title,
    container: info.container,
    codec: info.codec,
  };
}

function toStreamCandidate(
  id: string,
  title: string,
  duration: number | null,
  thumbnail: string | null,
): StreamCandidate {
  return {
    id,
    title,
    durationMs: duration ? Math.round(duration * 1000) : undefined,
    thumbnail: thumbnail ?? undefined,
    failed: false,
    source: { provider: STREAMING_ID, id },
  };
}

function toStream(url: string, info: StreamData, sourceId: string): Stream {
  const ext = info.container || '';
  const mimeType = ext.includes('m4a') || ext.includes('mp4')
    ? 'audio/mp4'
    : ext.includes('webm')
      ? 'audio/webm'
      : ext.includes('opus')
        ? 'audio/ogg'
        : undefined;

  // Append a range parameter to force the YouTube CDN to return an HTTP 206 Partial Content response.
  // This circumvents issues where internal players (like Web Audio API) fetch without Range headers,
  // which YouTube rejects with HTTP 403 for long streams, causing infinite loading loops.
  const chunkedUrl = url.includes('&range=') ? url : `${url}&range=0-99999999999`;

  return {
    url: chunkedUrl,
    protocol: 'https',
    mimeType,
    codec: info.codec || undefined,
    container: info.container || undefined,
    durationMs: info.duration ? Math.round(info.duration * 1000) : undefined,
    source: { provider: STREAMING_ID, id: sourceId },
  };
}

function createHttpAdapter(api: NuclearPluginAPI): HttpLike {
  return {
    fetch: async (url: string, init?: { headers?: Record<string, string>; method?: string }) => {
      // Do NOT send manual Accept-Encoding when using reqwest default client without gzip feature,
      // as reqwest will return raw compressed binary bytes into response.text() causing string corruption.
      const res = await api.Http.fetch(url, {
        headers: init?.headers,
        method: init?.method
      });
      const body = typeof res.body === 'string' ? res.body : await (res as any).text?.() || '';
      return {
        status: res.status,
        body,
        headers: (res as any).headers
      };
    }
  };
}

async function scrapeYoutube(api: NuclearPluginAPI, query: string, limit: number): Promise<SearchResult[]> {
  const http = createHttpAdapter(api);
  return coreScrapeYoutube(http, query, limit, async (fallbackQuery, fallbackLimit) => {
    // Fallback to Nuclear's Ytdlp which delegates to Rust yt-dlp backend
    const results = await api.Ytdlp.search(fallbackQuery, fallbackLimit);
    return (results as any[]).map(r => ({
      id: r.id || r.videoId,
      title: r.title || 'Unknown',
      duration: r.duration || null,
      thumbnail: r.thumbnail || null,
      channel: r.channel || r.author || null
    }));
  });
}

function isValidVideoId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  // Non-empty string without unsafe control characters or spaces
  return id.trim().length > 0 && !/\s/.test(id);
}

const plugin: NuclearPlugin = {
  onLoad: async (_api: NuclearPluginAPI) => {
    console.log(`[${PROVIDER_NAME}] Plugin loaded`);
  },
  onEnable: async (api: NuclearPluginAPI) => {
    console.log(`[${PROVIDER_NAME}] Plugin enabled`);
    
    const streamingProvider: StreamingProvider = {
      id: STREAMING_ID,
      kind: 'streaming',
      name: PROVIDER_NAME,
      searchForTrack: async (artist: string, title: string, album?: string) => {
        const query = album
          ? `${artist} - ${title} - ${album}`
          : `${artist} - ${title}`;
        
        const results = await scrapeYoutube(api, query, 10);
        return results.map(r =>
          toStreamCandidate(r.id, r.title, r.duration, r.thumbnail),
        );
      },
      searchForTrackV2: async (track: Track) => {
        const artist = track.artists?.[0]?.name || '';
        const title = track.title;
        const album = track.album?.title;
        
        const query = album
          ? `${artist} - ${title} - ${album}`
          : `${artist} - ${title}`;
          
        const results = await scrapeYoutube(api, query, 10);
        return results.map(r =>
          toStreamCandidate(r.id, r.title, r.duration, r.thumbnail),
        );
      },
      getStreamUrl: async (candidateId: string) => {
        if (!isValidVideoId(candidateId)) {
          throw new Error(`Invalid video ID format: ${candidateId}`);
        }
        const sdkInfo = await api.Ytdlp.getStream(candidateId);
        const info = sdkToInternal(sdkInfo);
        return toStream(info.streamUrl, info, candidateId);
      },
    };

    const playlistProvider: PlaylistProvider = {
      id: PLAYLIST_ID,
      kind: 'playlists',
      name: PROVIDER_NAME,
      matchesUrl: (url: string) => {
        return url.includes('youtube.com/') || url.includes('youtu.be/') || url.startsWith('ytsearch');
      },
      fetchPlaylistByUrl: async (url: string) => {
        const ytdlpPlaylist = await api.Ytdlp.getPlaylist(url);
        const now = new Date().toISOString();
        
        const playlist: Playlist = {
          id: ytdlpPlaylist.id || btoa(encodeURIComponent(url)),
          name: ytdlpPlaylist.title || 'Unknown Playlist',
          isReadOnly: true,
          createdAtIso: now,
          lastModifiedIso: now,
          items: ytdlpPlaylist.entries.map((entry) => {
            return {
              id: entry.id,
              addedAtIso: now,
              track: {
                title: entry.title,
                artists: entry.channel ? [{ name: entry.channel, roles: [] }] : [],
                durationMs: entry.duration ? Math.round(entry.duration * 1000) : undefined,
                source: { provider: STREAMING_ID, id: entry.id },
                artwork: entry.thumbnails?.length ? {
                  items: entry.thumbnails.map(t => ({
                    url: t.url,
                    width: t.width ?? undefined,
                    height: t.height ?? undefined,
                    purpose: 'thumbnail'
                  }))
                } : undefined
              }
            };
          })
        };
        return playlist;
      }
    };

    const metadataProvider: MetadataProvider = {
      id: METADATA_ID,
      kind: 'metadata',
      name: PROVIDER_NAME,
      searchCapabilities: ['tracks', 'unified'],
      streamingProviderId: STREAMING_ID,
      search: async (params) => {
        const query = params.query;
        if (!query) return {};

        const results = await scrapeYoutube(api, query, 20);
        return {
          tracks: results.map((r) => ({
            title: r.title,
            artists: r.channel ? [{ name: r.channel, roles: [] }] : [],
            durationMs: r.duration ? Math.round(r.duration * 1000) : undefined,
            artwork: r.thumbnail
              ? { items: [{ url: r.thumbnail, purpose: 'thumbnail' }] }
              : undefined,
            source: { provider: STREAMING_ID, id: r.id },
          })),
        };
      },
    };

    api.Providers.register(streamingProvider);
    api.Providers.register(playlistProvider);
    api.Providers.register(metadataProvider);
  },
  onDisable: async (api: NuclearPluginAPI) => {
    console.log(`[${PROVIDER_NAME}] Plugin disabled`);
    api.Providers.unregister(STREAMING_ID);
    api.Providers.unregister(PLAYLIST_ID);
    api.Providers.unregister(METADATA_ID);
  },
  onUnload: async (api: NuclearPluginAPI) => {
    console.log(`[${PROVIDER_NAME}] Plugin unloaded`);
    api.Providers.unregister(STREAMING_ID);
    api.Providers.unregister(PLAYLIST_ID);
    api.Providers.unregister(METADATA_ID);
  },
};

export default plugin;
