import type { HttpLike, SearchResult } from './types.js';
import { parseDuration } from './ytScraper.js';

export const INNERTUBE_SEARCH_ENDPOINT = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';

export const INNERTUBE_CLIENT_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240101.01.00',
    hl: 'en',
    gl: 'US'
  }
};

/**
 * Resolves a reliable, high-availability thumbnail URL.
 * Uses canonical YouTube CDN (i.ytimg.com) for video items to avoid 429 rate limits from googleusercontent.com.
 */
export function getThumbnailUrl(videoId?: string | null, rawThumbs?: any[]): string | null {
  if (videoId && typeof videoId === 'string' && !videoId.includes('/') && videoId.trim().length > 0) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  if (Array.isArray(rawThumbs) && rawThumbs.length > 0) {
    return rawThumbs[rawThumbs.length - 1]?.url || null;
  }
  return null;
}

function parseResponsiveItem(renderer: any): SearchResult | null {
  if (!renderer || typeof renderer !== 'object') return null;

  const videoId =
    renderer.playlistItemData?.videoId ||
    renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
    renderer.doubleTapCommand?.watchEndpoint?.videoId ||
    renderer.navigationEndpoint?.watchEndpoint?.videoId ||
    renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

  if (!videoId) return null;

  const titleRuns = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  const title = titleRuns?.map((r: any) => r.text).join('') || renderer.title?.runs?.[0]?.text || renderer.title?.simpleText || 'Unknown';

  const artistRuns = renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  const channel = artistRuns?.[0]?.text || renderer.ownerText?.runs?.[0]?.text || null;

  let durationStr =
    renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicThumbnailOverlayTimeStatusRenderer?.text?.simpleText ||
    renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicThumbnailOverlayTimeStatusRenderer?.text?.runs?.[0]?.text ||
    '';

  // Search for duration in all flex columns (not just artist column)
  if (!durationStr && Array.isArray(renderer.flexColumns)) {
    for (const col of renderer.flexColumns) {
      const runs = col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
      if (Array.isArray(runs)) {
        for (const run of runs) {
          if (run.text && /^\d+:\d+(:\d+)?$/.test(run.text.trim())) {
            durationStr = run.text.trim();
            break;
          }
        }
        if (durationStr) break;
      }
    }
  }

  const thumbs =
    renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    renderer.thumbnail?.musicThumbnailRenderer?.thumbnails ||
    renderer.thumbnail?.thumbnails ||
    [];
  const thumbnail = getThumbnailUrl(videoId, thumbs);

  return {
    id: videoId,
    title,
    duration: durationStr ? parseDuration(durationStr) : null,
    thumbnail,
    channel
  };
}

/**
 * Parses the raw Innertube JSON response from WEB_REMIX search endpoint.
 * Extracts results from musicCardShelfRenderer, musicShelfRenderer, and itemSectionRenderer.
 */
export function parseInnertubeResponse(json: any, limit: number = 10): SearchResult[] {
  if (!json || typeof json !== 'object') {
    return [];
  }

  let sections: any[] = [];
  if (Array.isArray(json.contents?.sectionListRenderer?.contents)) {
    sections = json.contents.sectionListRenderer.contents;
  } else if (Array.isArray(json.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents)) {
    sections = json.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents;
  } else if (Array.isArray(json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents)) {
    sections = json.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
  } else if (Array.isArray(json.contents)) {
    sections = json.contents;
  }

  const musicResults: SearchResult[] = [];
  const genericResults: SearchResult[] = [];

  for (const section of sections) {
    // 1. Music Card Shelf (Top Result / Hero Card + child items)
    if (section.musicCardShelfRenderer) {
      const card = section.musicCardShelfRenderer;
      
      // Add child items from card contents (these are the actual tracks with correct videoIds)
      if (Array.isArray(card.contents)) {
        for (const item of card.contents) {
          const parsed = parseResponsiveItem(item.musicResponsiveListItemRenderer || item);
          if (parsed) musicResults.push(parsed);
        }
      }
      
      // Only add the hero card if it has child items (indicates it's a track, not album/playlist)
      // and if the hero card itself has a valid videoId
      if (musicResults.length === 0 && card.contents?.length === 0) {
        const cardVideoId =
          card.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
          card.buttons?.[0]?.buttonRenderer?.navigationEndpoint?.watchEndpoint?.videoId;
        
        if (cardVideoId) {
          const title = card.title?.runs?.map((r: any) => r.text).join('') || card.header?.musicCardShelfHeaderBasicRenderer?.title?.runs?.[0]?.text || 'Unknown';
          const channel = card.subtitle?.runs?.[0]?.text || null;
          const thumbs = card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || card.thumbnail?.musicThumbnailRenderer?.thumbnails || [];
          const thumbnail = getThumbnailUrl(cardVideoId, thumbs);
          musicResults.push({
            id: cardVideoId,
            title,
            duration: null,
            thumbnail,
            channel
          });
        }
      }
    }

    // 2. Music Shelf Renderer (YouTube Music items)
    if (section.musicShelfRenderer?.contents) {
      for (const item of section.musicShelfRenderer.contents) {
        const parsed = parseResponsiveItem(item.musicResponsiveListItemRenderer || item);
        if (parsed) musicResults.push(parsed);
      }
    }

    // 3. Item Section Renderer (can contain musicResponsiveListItemRenderer or generic videoRenderer)
    if (section.itemSectionRenderer?.contents) {
      for (const c of section.itemSectionRenderer.contents) {
        if (c.musicResponsiveListItemRenderer) {
          const parsed = parseResponsiveItem(c.musicResponsiveListItemRenderer);
          if (parsed) musicResults.push(parsed);
        } else if (c.videoRenderer && c.videoRenderer.videoId) {
          const v = c.videoRenderer;
          const thumbs = v.thumbnail?.thumbnails || [];
          const thumbnail = getThumbnailUrl(v.videoId, thumbs);
          const durationStr = v.lengthText?.simpleText || v.lengthText?.runs?.[0]?.text || '';
          const title = v.title?.runs?.map((r: any) => r.text).join('') || v.title?.simpleText || 'Unknown';
          const channel = v.ownerText?.runs?.map((r: any) => r.text).join('') || null;

          genericResults.push({
            id: v.videoId,
            title,
            duration: durationStr ? parseDuration(durationStr) : null,
            thumbnail,
            channel
          });
        }
      }
    }
  }

  const combined = musicResults.length > 0 ? musicResults : genericResults;
  return combined.slice(0, limit);
}

/**
 * Searches YouTube Music via Innertube WEB_REMIX API.
 */
export async function searchInnertube(
  http: HttpLike,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const payload = {
    context: INNERTUBE_CLIENT_CONTEXT,
    query
  };

  const res = await http.fetch(INNERTUBE_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    body: JSON.stringify(payload)
  });

  if (res.status !== 200) {
    throw new Error(`Innertube request failed with status ${res.status}`);
  }

  const json = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
  if (!json || json.error) {
    throw new Error(json?.error?.message || 'Invalid Innertube response');
  }

  return parseInnertubeResponse(json, limit);
}
