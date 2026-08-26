import type { HttpLike, SearchResult } from './types.js';
import { searchInnertube } from './innertubeScraper.js';

export interface CacheEntry {
  results: SearchResult[];
  expiresAt: number;
}

export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
export const CACHE_MAX_ENTRIES = 50;

export const searchCache = new Map<string, CacheEntry>();

export function clearSearchCache(): void {
  searchCache.clear();
}

export function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export function parseYoutubeSearchHtml(html: string, limit: number = 10): SearchResult[] {
  // Try multiple regex patterns to support different YouTube HTML layouts & minifications
  let jsonStr: string | null = null;

  const patterns = [
    /var ytInitialData = (\{.+?\});<\/script>/,
    /ytInitialData\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/,
    /window\["ytInitialData"\]\s*=\s*(\{.+?\});/,
    /ytInitialData\s*=\s*(\{.+?\});/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      try {
        JSON.parse(match[1]); // Validate JSON integrity
        jsonStr = match[1];
        break;
      } catch {
        // Continue to next pattern if parsing failed
      }
    }
  }

  if (!jsonStr) {
    throw new Error('No ytInitialData found in HTML');
  }

  const json = JSON.parse(jsonStr);
  const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
  if (!contents) {
    throw new Error('Invalid ytInitialData structure');
  }

  let videos: any[] = [];
  for (const section of contents) {
    if (section.itemSectionRenderer?.contents) {
      const found = section.itemSectionRenderer.contents
        .filter((c: any) => c.videoRenderer)
        .map((c: any) => c.videoRenderer);
      videos = videos.concat(found);
    }
  }

  return videos.slice(0, limit).map(v => {
    const thumbs = v.thumbnail?.thumbnails || [];
    const thumbnail = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : null;
    const durationStr = v.lengthText?.simpleText || '';
    return {
      id: v.videoId,
      title: v.title?.runs?.[0]?.text || 'Unknown',
      duration: parseDuration(durationStr),
      thumbnail,
      channel: v.ownerText?.runs?.[0]?.text || 'Unknown'
    };
  });
}

export async function scrapeYoutube(
  http: HttpLike,
  query: string,
  limit: number = 10,
  fallbackFn?: (query: string, limit: number) => Promise<SearchResult[]>
): Promise<SearchResult[]> {
  try {
    console.log(`[Core:Scraper] Starting YouTube scrape for: "${query}"`);
    const res = await http.fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (res.status !== 200) {
      console.warn(`[Core:Scraper] YouTube returned status ${res.status}`);
    }

    const html = typeof res.body === 'string' ? res.body : '';
    const results = parseYoutubeSearchHtml(html, limit);
    console.log(`[Core:Scraper] Scrape parsed ${results.length} videos`);
    return results;
  } catch (error) {
    console.error(`[Core:Scraper] YouTube scrape failed:`, error);
    if (fallbackFn) {
      console.log(`[Core:Scraper] Using fallback function...`);
      return fallbackFn(query, limit);
    }
    throw error;
  }
}

/**
 * Unified search with 3-tier fallback chain and in-memory LRU cache:
 * Level 1: Innertube JSON API (~200ms, ~40KB)
 * Level 2: HTML Scraping (~760ms, ~1.8MB)
 * Level 3: Native Ytdlp SDK (~1200ms)
 */
export async function searchUnified(
  http: HttpLike,
  query: string,
  limit: number = 10,
  fallbackFn?: (query: string, limit: number) => Promise<SearchResult[]>
): Promise<SearchResult[]> {
  const cacheKey = `${query.trim().toLowerCase()}::${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      // Refresh key for LRU ordering
      searchCache.delete(cacheKey);
      searchCache.set(cacheKey, cached);
      return cached.results;
    }
    searchCache.delete(cacheKey);
  }

  let results: SearchResult[] | null = null;

  // Tier 1: Innertube JSON API
  try {
    const innerResults = await searchInnertube(http, query, limit);
    if (innerResults && innerResults.length > 0) {
      results = innerResults;
    }
  } catch (err) {
    console.warn(`[Core:Search] Innertube search failed, falling back to Level 2 HTML:`, err);
  }

  // Tier 2: HTML Scraping
  if (!results || results.length === 0) {
    try {
      console.log(`[Core:Search] Attempting Level 2 HTML scrape for: "${query}"`);
      const htmlResults = await scrapeYoutube(http, query, limit);
      if (htmlResults && htmlResults.length > 0) {
        results = htmlResults;
      }
    } catch (err) {
      console.warn(`[Core:Search] HTML scrape failed, falling back to Level 3:`, err);
    }
  }

  // Tier 3: Deep fallbackFn (Nuclear Ytdlp SDK)
  if ((!results || results.length === 0) && fallbackFn) {
    console.log(`[Core:Search] Attempting Level 3 fallback function for: "${query}"`);
    try {
      results = await fallbackFn(query, limit);
    } catch (err) {
      console.error(`[Core:Search] Level 3 fallback failed:`, err);
      results = [];
    }
  }

  if (!results) {
    results = [];
  }

  if (results.length > 0) {
    if (searchCache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey) searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, {
      results,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
  }

  return results;
}
