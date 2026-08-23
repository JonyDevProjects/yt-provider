import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NuclearPluginAPI, StreamingProvider, PlaylistProvider } from '@nuclearplayer/plugin-sdk';
import plugin from '../src/index.js';

describe('Nuclear Plugin Integration', () => {
  let registeredProvider: StreamingProvider | undefined;
  let registeredPlaylistProvider: PlaylistProvider | undefined;
  
  const mockApi = {
    Http: {
      fetch: vi.fn(),
    },
    Ytdlp: {
      search: vi.fn(),
      getStream: vi.fn(),
      getPlaylist: vi.fn(),
    },
    Providers: {
      register: vi.fn((provider: any) => {
        if (provider.kind === 'streaming') {
          registeredProvider = provider;
        } else if (provider.kind === 'playlists') {
          registeredPlaylistProvider = provider;
        }
      }),
      unregister: vi.fn(),
    }
  } as unknown as NuclearPluginAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredProvider = undefined;
    registeredPlaylistProvider = undefined;
  });

  it('should register all providers on enable', async () => {
    await plugin.onEnable!(mockApi);
    expect(mockApi.Providers.register).toHaveBeenCalledTimes(3);
    expect(registeredProvider).toBeDefined();
    expect(registeredProvider?.id).toBe('yt-provider-streaming');
    expect(registeredProvider?.kind).toBe('streaming');
    expect(registeredPlaylistProvider).toBeDefined();
    expect(registeredPlaylistProvider?.kind).toBe('playlists');
  });

  it('should unregister all providers on disable', async () => {
    await plugin.onDisable!(mockApi);
    expect(mockApi.Providers.unregister).toHaveBeenCalledTimes(3);
    expect(mockApi.Providers.unregister).toHaveBeenCalledWith('yt-provider-streaming');
    expect(mockApi.Providers.unregister).toHaveBeenCalledWith('yt-provider-playlist');
    expect(mockApi.Providers.unregister).toHaveBeenCalledWith('yt-provider-metadata');
  });

  it('should unregister all providers on unload', async () => {
    await plugin.onUnload!(mockApi);
    expect(mockApi.Providers.unregister).toHaveBeenCalledTimes(3);
    expect(mockApi.Providers.unregister).toHaveBeenCalledWith('yt-provider-streaming');
    expect(mockApi.Providers.unregister).toHaveBeenCalledWith('yt-provider-playlist');
    expect(mockApi.Providers.unregister).toHaveBeenCalledWith('yt-provider-metadata');
  });

  it('should search for track using Ytdlp and map to StreamCandidate', async () => {
    await plugin.onEnable!(mockApi);
    
    // Mock HTTP fetch for scrapeYoutube failure so it falls back to Ytdlp
    (mockApi.Http.fetch as any).mockRejectedValue(new Error('Network error'));

    // Mock Ytdlp search response
    const mockSearchResults = [
      { id: 'vid1', title: 'Test Song', duration: 120, thumbnail: 'thumb.jpg' }
    ];
    (mockApi.Ytdlp.search as any).mockResolvedValue(mockSearchResults);

    const candidates = await registeredProvider!.searchForTrack!('Test Artist', 'Test Song', 'Test Album');
    
    expect(mockApi.Ytdlp.search).toHaveBeenCalledWith('Test Artist - Test Song - Test Album', 10);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      id: 'vid1',
      title: 'Test Song',
      durationMs: 120000,
      thumbnail: 'thumb.jpg',
      failed: false,
      source: { provider: 'yt-provider-streaming', id: 'vid1' }
    });
  });

  it('should search for track using searchForTrackV2', async () => {
    await plugin.onEnable!(mockApi);
    
    // Mock HTTP fetch for scrapeYoutube failure so it falls back to Ytdlp
    (mockApi.Http.fetch as any).mockRejectedValue(new Error('Network error'));

    const mockSearchResults = [
      { id: 'vid2', title: 'Test Song V2', duration: 130, thumbnail: 'thumb2.jpg' }
    ];
    (mockApi.Ytdlp.search as any).mockResolvedValue(mockSearchResults);

    const candidates = await registeredProvider!.searchForTrackV2!({
      title: 'Test Song V2',
      artists: [{ name: 'Test Artist V2', roles: [] }],
      album: { title: 'Test Album V2', source: { provider: 'local', id: '1' } },
      source: { provider: 'local', id: '1' }
    } as any);
    
    expect(mockApi.Ytdlp.search).toHaveBeenCalledWith('Test Artist V2 - Test Song V2 - Test Album V2', 10);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('vid2');
  });

  it('should get stream URL directly from Ytdlp with safe range', async () => {
    await plugin.onEnable!(mockApi);
    
    // Mock Ytdlp getStream response (snake_case)
    const mockSdkStreamInfo = {
      stream_url: 'https://example.com/stream',
      duration: 120,
      title: 'Test Song',
      container: 'm4a',
      codec: 'mp4a.40.2'
    };
    (mockApi.Ytdlp.getStream as any).mockResolvedValue(mockSdkStreamInfo);

    const stream = await registeredProvider!.getStreamUrl!('vid1');
    
    expect(mockApi.Ytdlp.getStream).toHaveBeenCalledTimes(1);
    expect(mockApi.Ytdlp.getStream).toHaveBeenCalledWith('vid1');
    
    expect(stream).toEqual({
      url: 'https://example.com/stream&range=0-99999999999',
      protocol: 'https',
      mimeType: 'audio/mp4',
      codec: 'mp4a.40.2',
      container: 'm4a',
      durationMs: 120000,
      source: { provider: 'yt-provider-streaming', id: 'vid1' },
    });
  });

  it('should fetch and map a playlist', async () => {
    await plugin.onEnable!(mockApi);
    
    const mockPlaylist = {
      id: 'pl1',
      title: 'My Playlist',
      entries: [
        {
          id: 'v1',
          title: 'Track 1',
          duration: 100,
          channel: 'Channel 1',
          thumbnails: [{ url: 'thumb.jpg', width: null, height: null }]
        }
      ]
    };
    (mockApi.Ytdlp.getPlaylist as any).mockResolvedValue(mockPlaylist);

    const playlist = await registeredPlaylistProvider!.fetchPlaylistByUrl!('https://youtube.com/playlist?list=pl1');
    
    expect(mockApi.Ytdlp.getPlaylist).toHaveBeenCalledWith('https://youtube.com/playlist?list=pl1');
    expect(playlist.id).toBe('pl1');
    expect(playlist.name).toBe('My Playlist');
    expect(playlist.items).toHaveLength(1);
    expect(playlist.items[0].track.title).toBe('Track 1');
    expect(playlist.items[0].track.artists[0].name).toBe('Channel 1');
    expect(playlist.items[0].track.durationMs).toBe(100000);
  });
});
