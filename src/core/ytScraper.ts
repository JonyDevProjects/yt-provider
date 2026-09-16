import type { HttpLike, SearchResult } from './types.js';

export function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export function decodeHexEscapes(str: string): string {
  return str
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');
}

export function parseMobileYoutubeSearchHtml(html: string, limit: number = 10): SearchResult[] {
  const match = html.match(/var ytInitialData = '(.+?)';/);
  if (!match || !match[1]) {
    throw new Error('No mobile ytInitialData found in HTML');
  }

  let json: any;
  try {
    const jsonStr = decodeHexEscapes(match[1]);
    json = JSON.parse(jsonStr);
  } catch {
    // Fallback: try raw JSON parse (in case YouTube changes format)
    try {
      json = JSON.parse(match[1]);
    } catch {
      throw new Error('Failed to decode mobile ytInitialData');
    }
  }
  const contents = json.contents?.sectionListRenderer?.contents;
  if (!contents) {
    throw new Error('Invalid mobile ytInitialData structure');
  }

  let videos: any[] = [];
  for (const section of contents) {
    if (section.itemSectionRenderer?.contents) {
      const found = section.itemSectionRenderer.contents
        .filter((c: any) => c.videoWithContextRenderer)
        .map((c: any) => c.videoWithContextRenderer);
      videos = videos.concat(found);
    }
  }

  return videos.slice(0, limit).map(v => {
    const thumbs = v.thumbnail?.thumbnails || [];
    const thumbnail = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : null;
    const durationStr = v.lengthText?.runs?.[0]?.text || '';
    return {
      id: v.videoId,
      title: v.headline?.runs?.[0]?.text || 'Unknown',
      duration: parseDuration(durationStr),
      thumbnail,
      channel: v.shortBylineText?.runs?.[0]?.text || 'Unknown'
    };
  });
}

export async function scrapeMobileYoutube(
  http: HttpLike,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  console.log(`[Core:Scraper] Starting YouTube Mobile scrape for: "${query}"`);
  const res = await http.fetch(
    `https://m.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }
  );

  if (res.status !== 200) {
    throw new Error(`YouTube Mobile returned status ${res.status}`);
  }

  const html = typeof res.body === 'string' ? res.body : '';
  const results = parseMobileYoutubeSearchHtml(html, limit);
  console.log(`[Core:Scraper] Mobile scrape parsed ${results.length} videos`);
  return results;
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
  // Tier 1: Mobile scrape (m.youtube.com — faster, smaller payload)
  try {
    const mobileResults = await scrapeMobileYoutube(http, query, limit);
    if (mobileResults.length > 0) {
      return mobileResults;
    }
    console.warn('[Core:Scraper] Mobile scrape returned 0 results, falling back to desktop');
  } catch (error) {
    console.warn('[Core:Scraper] Mobile scrape failed:', error);
  }

  // Tier 2: Desktop scrape (www.youtube.com — larger, more fields)
  try {
    console.log(`[Core:Scraper] Trying desktop scrape for: "${query}"`);
    const res = await http.fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (res.status !== 200) {
      console.warn(`[Core:Scraper] Desktop YouTube returned status ${res.status}`);
    }

    const html = typeof res.body === 'string' ? res.body : '';
    const results = parseYoutubeSearchHtml(html, limit);
    if (results.length > 0) {
      console.log(`[Core:Scraper] Desktop scrape parsed ${results.length} videos`);
      return results;
    }
    console.warn('[Core:Scraper] Desktop scrape returned 0 results');
  } catch (error) {
    console.error('[Core:Scraper] Desktop scrape failed:', error);
  }

  // Tier 3: External fallback (e.g. yt-dlp)
  if (fallbackFn) {
    console.log('[Core:Scraper] Using external fallback function...');
    return fallbackFn(query, limit);
  }

  throw new Error('All YouTube scrape tiers failed');
}
