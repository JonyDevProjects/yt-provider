import type { Stream } from '@nuclearplayer/plugin-sdk';
import type { HttpLike } from './types.js';

export const ITAG_WEBM_OPUS_160K = 251;
export const ITAG_WEBM_OPUS_70K = 250;
export const ITAG_WEBM_OPUS_50K = 249;

export interface WebmFormat {
  itag: number;
  url?: string;
  signatureCipher?: string;
  cipher?: string;
  mimeType: string;
  bitrate?: number;
  averageBitrate?: number;
  audioQuality?: string;
  approxDurationMs?: string;
  contentLength?: string;
}

/**
 * Normalizes video ID or URL to a clean 11-character YouTube video ID.
 */
export function normalizeVideoId(videoIdOrUrl: string): string {
  if (videoIdOrUrl === null || videoIdOrUrl === undefined || typeof videoIdOrUrl !== 'string') {
    throw new Error('Video ID is required');
  }
  const trimmed = videoIdOrUrl.trim();
  if (trimmed.length === 0) {
    throw new Error('Video ID cannot be empty');
  }

  // Handle YouTube URL patterns
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
    const vParam = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (vParam) return vParam[1];

    const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];

    const embedMatch = trimmed.match(/(?:embed|v)\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];
  }

  return trimmed;
}

/**
 * Extracts stream URL from a format object, decoding cipher parameters if present.
 */
export function extractUrlFromFormat(format: WebmFormat): string | null {
  if (!format) return null;

  if (typeof format.url === 'string' && format.url.length > 0) {
    return format.url;
  }

  const cipher = format.signatureCipher || format.cipher;
  if (typeof cipher === 'string' && cipher.length > 0) {
    const params = new URLSearchParams(cipher);
    const rawUrl = params.get('url');
    if (rawUrl) {
      const decodedUrl = decodeURIComponent(rawUrl);
      const sig = params.get('sig') || params.get('s');
      const sp = params.get('sp') || 'sig';
      if (sig && !decodedUrl.includes(`${sp}=`)) {
        const sep = decodedUrl.includes('?') ? '&' : '?';
        return `${decodedUrl}${sep}${sp}=${encodeURIComponent(sig)}`;
      }
      return decodedUrl;
    }
  }

  return null;
}

/**
 * Finds the most suitable WebM Opus audio format from a list of formats.
 * Priority: itag 251 (160k Opus) > itag 250 (70k Opus) > itag 249 (50k Opus) > highest bitrate audio/webm.
 */
export function findWebmFormat(formats: WebmFormat[]): WebmFormat | null {
  if (!Array.isArray(formats) || formats.length === 0) return null;

  // 1. Direct match for itag 251 (WebM Opus ~160kbps)
  const itag251 = formats.find(f => f && f.itag === ITAG_WEBM_OPUS_160K);
  if (itag251) return itag251;

  // 2. Fallback to other WebM Opus itags: 250 (~70kbps) or 249 (~50kbps)
  const itag250 = formats.find(f => f && f.itag === ITAG_WEBM_OPUS_70K);
  if (itag250) return itag250;

  const itag249 = formats.find(f => f && f.itag === ITAG_WEBM_OPUS_50K);
  if (itag249) return itag249;

  // 3. Fallback to any audio/webm format, sorted by highest bitrate
  const webmFormats = formats.filter(
    f => f && typeof f.mimeType === 'string' && f.mimeType.toLowerCase().includes('audio/webm')
  );
  if (webmFormats.length > 0) {
    webmFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return webmFormats[0];
  }

  return null;
}

/**
 * Safely extracts a JSON object assigned to a JS variable inside an HTML script tag
 * using balanced brace counting to avoid regex backtracking or premature truncation.
 */
export function extractJsonFromHtmlAssignment(html: string, varName: string): any | null {
  const index = html.indexOf(varName);
  if (index === -1) return null;

  const equalIndex = html.indexOf('=', index + varName.length);
  if (equalIndex === -1) return null;

  const startIndex = html.indexOf('{', equalIndex);
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < html.length; i++) {
    const char = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          const jsonStr = html.substring(startIndex, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Parses player response from YouTube watch page HTML.
 */
export function parsePlayerResponseFromHtml(html: string): any | null {
  const fromBraces = extractJsonFromHtmlAssignment(html, 'ytInitialPlayerResponse');
  if (fromBraces) return fromBraces;

  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var\s|<\/script>)/s,
    /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/s,
    /window\["ytInitialPlayerResponse"\]\s*=\s*(\{.+?\});/s,
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch {
        // Try next pattern
      }
    }
  }

  return null;
}

async function fetchFromYoutubei(
  http: HttpLike,
  videoId: string,
  client: 'ANDROID' | 'WEB' = 'ANDROID'
): Promise<any | null> {
  const isAndroid = client === 'ANDROID';
  const endpoint = 'https://www.youtube.com/youtubei/v1/player';

  const body = JSON.stringify({
    videoId,
    context: {
      client: isAndroid
        ? {
            clientName: 'ANDROID',
            clientVersion: '19.09.37',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US'
          }
        : {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'en',
            gl: 'US'
          }
    }
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': isAndroid
      ? 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  if (isAndroid) {
    headers['X-YouTube-Client-Name'] = '3';
    headers['X-YouTube-Client-Version'] = '19.09.37';
  }

  const res = await http.fetch(endpoint, {
    method: 'POST',
    headers,
    body
  });

  if (res.status !== 200 || !res.body) {
    return null;
  }

  try {
    return typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
  } catch {
    return null;
  }
}

async function fetchFromWatchPage(http: HttpLike, videoId: string): Promise<any | null> {
  const res = await http.fetch(
    `https://www.youtube.com/watch?v=${videoId}&bpctr=9999999999&has_verified=1`,
    {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }
  );

  if (res.status !== 200 || !res.body) {
    return null;
  }

  const html = typeof res.body === 'string' ? res.body : '';
  return parsePlayerResponseFromHtml(html);
}

/**
 * Resolves direct itag 251 (WebM Opus) stream URL from YouTube using tiered resolution:
 * 1. YouTubei Android Client context (no signature cipher, unthrottled direct URL)
 * 2. YouTubei Web Client context
 * 3. Watch page HTML scrape (fallback)
 */
export async function resolveWebmStream(
  http: HttpLike,
  videoIdOrUrl: string
): Promise<string> {
  const videoId = normalizeVideoId(videoIdOrUrl);

  // Tier 1: YouTubei Player API (Android client)
  try {
    const androidResponse = await fetchFromYoutubei(http, videoId, 'ANDROID');
    if (androidResponse?.streamingData) {
      const formats = [
        ...(androidResponse.streamingData.adaptiveFormats || []),
        ...(androidResponse.streamingData.formats || [])
      ];
      const format = findWebmFormat(formats);
      if (format) {
        const streamUrl = extractUrlFromFormat(format);
        if (streamUrl) return streamUrl;
      }
    }
  } catch (error) {
    console.warn(`[WebmResolver] Android Innertube request failed for ${videoId}:`, error);
  }

  // Tier 2: YouTubei Player API (Web client)
  try {
    const webResponse = await fetchFromYoutubei(http, videoId, 'WEB');
    if (webResponse?.streamingData) {
      const formats = [
        ...(webResponse.streamingData.adaptiveFormats || []),
        ...(webResponse.streamingData.formats || [])
      ];
      const format = findWebmFormat(formats);
      if (format) {
        const streamUrl = extractUrlFromFormat(format);
        if (streamUrl) return streamUrl;
      }
    }
  } catch (error) {
    console.warn(`[WebmResolver] Web Innertube request failed for ${videoId}:`, error);
  }

  // Tier 3: Watch Page Scraping (HTML ytInitialPlayerResponse)
  try {
    const playerResponse = await fetchFromWatchPage(http, videoId);
    if (playerResponse?.streamingData) {
      const formats = [
        ...(playerResponse.streamingData.adaptiveFormats || []),
        ...(playerResponse.streamingData.formats || [])
      ];
      const format = findWebmFormat(formats);
      if (format) {
        const streamUrl = extractUrlFromFormat(format);
        if (streamUrl) return streamUrl;
      }
    }
  } catch (error) {
    console.warn(`[WebmResolver] Watch page scrape failed for ${videoId}:`, error);
  }

  throw new Error(`Unable to resolve WebM Opus stream for video: ${videoId}`);
}

/**
 * Transforms resolved direct WebM stream URL into a Nuclear Stream object.
 * Returns: { url, protocol: 'https', container: 'webm', mimeType: 'audio/webm', durationMs, source: { provider, id: sourceId } }
 */
export function toWebmStream(
  url: string,
  duration?: number | null,
  sourceId: string = '',
  provider: string = 'nucleartube-streaming'
): Stream {
  if (!url || typeof url !== 'string') {
    throw new Error('Stream URL is required');
  }

  // Append a range parameter to force the YouTube CDN to return an HTTP 206 Partial Content response.
  // This circumvents issues where internal players fetch without Range headers, causing HTTP 403 on long streams.
  const chunkedUrl = url.includes('&range=') || url.includes('?range=')
    ? url
    : url.includes('?')
      ? `${url}&range=0-99999999999`
      : `${url}?range=0-99999999999`;

  const durationMs =
    duration && typeof duration === 'number' && duration > 0
      ? Math.round(duration * 1000)
      : undefined;

  return {
    url: chunkedUrl,
    protocol: 'https',
    container: 'webm',
    mimeType: 'audio/webm',
    codec: 'opus',
    durationMs,
    source: {
      provider,
      id: sourceId
    }
  };
}
