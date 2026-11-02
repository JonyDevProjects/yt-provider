import type { HttpLike } from './types.js';

export interface YouTubeFormat {
  itag: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  lastModified?: string;
  contentLength?: string;
  quality?: string;
  qualityLabel?: string;
  fps?: number;
  audioQuality?: string;
  approxDurationMs?: string;
  signatureCipher?: string;
  cipher?: string;
  [key: string]: any;
}

export interface StreamingData {
  formats?: YouTubeFormat[];
  adaptiveFormats?: YouTubeFormat[];
  [key: string]: any;
}

export interface PlayerResponse {
  playabilityStatus?: {
    status?: string;
    reason?: string;
    [key: string]: any;
  };
  streamingData?: StreamingData;
  videoDetails?: {
    videoId?: string;
    title?: string;
    lengthSeconds?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface Itag18StreamResult {
  url: string;
  protocol: 'https';
  container: 'mp4';
  mimeType: 'video/mp4';
  durationMs?: number;
  source: {
    provider: string;
    id: string;
  };
}

/**
 * Extracts the 11-character YouTube video ID from a video ID or URL.
 */
export function extractVideoId(videoIdOrUrl: string): string {
  if (!videoIdOrUrl || typeof videoIdOrUrl !== 'string') {
    return '';
  }
  const trimmed = videoIdOrUrl.trim();
  const match = trimmed.match(/(?:v=|youtu\.be\/|embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
  if (match) {
    return match[1];
  }
  if (!trimmed.includes('/') && !trimmed.includes('?') && !trimmed.includes('&')) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Checks if a given format object represents YouTube format 18
 * (faststart multiplexed 360p MP4 with full stbl sample table).
 */
export function isFormat18(format: any): boolean {
  if (!format || typeof format !== 'object') {
    return false;
  }
  return Number(format.itag) === 18;
}

/**
 * Finds format 18 from streamingData formats or adaptiveFormats.
 */
export function findFormat18(streamingData?: StreamingData | null): YouTubeFormat | null {
  if (!streamingData || typeof streamingData !== 'object') {
    return null;
  }
  const formats = Array.isArray(streamingData.formats) ? streamingData.formats : [];
  const found = formats.find(isFormat18);
  if (found) {
    return found;
  }

  const adaptiveFormats = Array.isArray(streamingData.adaptiveFormats) ? streamingData.adaptiveFormats : [];
  return adaptiveFormats.find(isFormat18) || null;
}

/**
 * Extracts direct URL from format, deciphering standard URL query parameters if wrapped.
 */
export function extractUrlFromFormat(format: YouTubeFormat): string | null {
  if (format.url && typeof format.url === 'string') {
    return format.url;
  }

  const cipher = format.signatureCipher || format.cipher;
  if (cipher && typeof cipher === 'string') {
    const params = new URLSearchParams(cipher);
    const url = params.get('url');
    if (url) {
      return decodeURIComponent(url);
    }
  }

  return null;
}

/**
 * Extracts embedded ytInitialPlayerResponse from desktop YouTube watch page HTML.
 */
export function parsePlayerResponseFromHtml(html: string): PlayerResponse | null {
  if (!html || typeof html !== 'string') {
    return null;
  }

  const patterns = [
    /var ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|<\/script>)/s,
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s,
    /window\["ytInitialPlayerResponse"\]\s*=\s*(\{.+?\});/s
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch {
        // Continue to next regex pattern
      }
    }
  }

  return null;
}

/**
 * Formats a resolved format 18 stream URL into Nuclear-compatible progressive stream metadata.
 * Nuclear's useAudioLoader (<audio src="...">) plays it natively on WebKit without canplay freeze.
 *
 * @param url Direct stream URL for format 18
 * @param duration Duration in seconds
 * @param sourceId Video ID or source identifier
 * @param provider Provider ID (default: 'nucleartube-streaming')
 */
export function toItag18Stream(
  url: string,
  duration?: number | null,
  sourceId?: string,
  provider: string = 'nucleartube-streaming'
): Itag18StreamResult {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('toItag18Stream requires a valid non-empty stream URL');
  }

  const durationMs =
    typeof duration === 'number' && duration > 0
      ? Math.round(duration * 1000)
      : undefined;

  return {
    url,
    protocol: 'https',
    container: 'mp4',
    mimeType: 'video/mp4',
    durationMs,
    source: {
      provider,
      id: sourceId ?? ''
    }
  };
}

/**
 * Resolves the direct URL of YouTube format 18 for a given video ID using YouTube Innertube / Player API.
 * Uses a tiered approach:
 * 1. Innertube Player API with ANDROID client (direct unthrottled format 18 URLs).
 * 2. Innertube Player API with WEB client fallback.
 * 3. YouTube Watch page HTML scrape fallback.
 *
 * @param http HttpLike client
 * @param videoIdOrUrl YouTube video ID or URL
 * @returns Promise<string> Direct URL of format 18 stream
 */
export async function resolveItag18Stream(
  http: HttpLike,
  videoIdOrUrl: string
): Promise<string> {
  const videoId = extractVideoId(videoIdOrUrl);
  if (!videoId || videoId.length === 0) {
    throw new Error(`Invalid video ID: ${videoIdOrUrl}`);
  }

  // Tier 1: YouTube Innertube Player API (Android Client)
  try {
    const androidBody = JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.09.37',
          androidSdkVersion: 30,
          hl: 'en',
          gl: 'US'
        }
      }
    });

    const res = await http.fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': '19.09.37'
      },
      body: androidBody
    });

    if (res.status === 200) {
      const data: PlayerResponse = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
      const format = findFormat18(data.streamingData);
      if (format) {
        const url = extractUrlFromFormat(format);
        if (url) {
          return url;
        }
      }
    }
  } catch (error) {
    console.warn(`[itag18Resolver] Tier 1 (Android) failed for ${videoId}:`, error);
  }

  // Tier 2: YouTube Innertube Player API (Web Client Fallback)
  try {
    const webBody = JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240101.01.00',
          hl: 'en',
          gl: 'US'
        }
      }
    });

    const res = await http.fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: webBody
    });

    if (res.status === 200) {
      const data: PlayerResponse = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
      const format = findFormat18(data.streamingData);
      if (format) {
        const url = extractUrlFromFormat(format);
        if (url) {
          return url;
        }
      }
    }
  } catch (error) {
    console.warn(`[itag18Resolver] Tier 2 (Web) failed for ${videoId}:`, error);
  }

  // Tier 3: Desktop Watch Page HTML Scraping Fallback
  try {
    const res = await http.fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&bpctr=9999999999&has_verified=1`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }
    );

    if (res.status === 200) {
      const html = typeof res.body === 'string' ? res.body : '';
      const playerResponse = parsePlayerResponseFromHtml(html);
      if (playerResponse?.streamingData) {
        const format = findFormat18(playerResponse.streamingData);
        if (format) {
          const url = extractUrlFromFormat(format);
          if (url) {
            return url;
          }
        }
      }
    }
  } catch (error) {
    console.warn(`[itag18Resolver] Tier 3 (HTML scrape) failed for ${videoId}:`, error);
  }

  throw new Error(`No format 18 stream found for video: ${videoId}`);
}
