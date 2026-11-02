import type { HttpLike } from './types.js';
import { getStreamServerPort, buildProxiedStreamUrl } from './streamProxy.js';

export interface Fmp4Box {
  type: string;
  offset: number;
  size: number;
}

export interface SidxSegment {
  duration: number; // in seconds (subsegmentDuration / timescale)
  referencedSize: number; // in bytes
  startByte: number; // absolute start byte in stream
  endByte: number; // absolute end byte in stream
}

export interface SidxData {
  timescale: number;
  firstOffset: number;
  boxOffset: number;
  boxSize: number;
  initSegmentEnd: number;
  segments: SidxSegment[];
}

export interface ParsedBoxes {
  ftyp: Fmp4Box;
  moov: Fmp4Box;
  sidx: Fmp4Box;
  sidxData: SidxData;
  initRange: {
    start: number;
    end: number;
    length: number;
  };
}

export interface HlsStreamResult {
  url: string;
  protocol: 'hls';
  source: {
    provider: string;
    id: string;
  };
  durationMs?: number;
}

const BOX_HEADER_SIZE = 8;
const EXTENDED_SIZE_MARKER = 1;

/**
 * Scans top-level ISO BMFF (MP4) boxes in a binary buffer.
 */
export function findBoxes(data: Uint8Array): Fmp4Box[] {
  const boxes: Fmp4Box[] = [];
  let pos = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  while (pos + BOX_HEADER_SIZE <= data.byteLength) {
    let size = view.getUint32(pos);
    let type = '';
    for (let i = 0; i < 4; i++) {
      type += String.fromCharCode(view.getUint8(pos + 4 + i));
    }

    let headerSize = BOX_HEADER_SIZE;
    if (size === EXTENDED_SIZE_MARKER) {
      if (pos + 16 > data.byteLength) break;
      const high = view.getUint32(pos + 8);
      const low = view.getUint32(pos + 12);
      size = high * 0x100000000 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = data.byteLength - pos;
    }

    if (size < headerSize) {
      // Corrupt or truncated box header
      break;
    }

    boxes.push({ type, offset: pos, size });
    pos += size;
  }

  return boxes;
}

/**
 * Parses an ISO 14496-12 Segment Index Box (sidx).
 * Extracts segment duration, referenced_size, and absolute byte offsets.
 *
 * @param bytes Buffer containing the sidx box data
 * @param offset Byte offset where the sidx box starts within `bytes`
 */
export function parseSidx(bytes: Uint8Array, offset: number): SidxData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  
  if (offset + BOX_HEADER_SIZE > bytes.byteLength) {
    throw new Error(`Invalid sidx offset ${offset}: outside buffer bounds`);
  }

  let boxSize = view.getUint32(offset);
  let headerSize = BOX_HEADER_SIZE;
  if (boxSize === EXTENDED_SIZE_MARKER) {
    const high = view.getUint32(offset + 8);
    const low = view.getUint32(offset + 12);
    boxSize = high * 0x100000000 + low;
    headerSize = 16;
  } else if (boxSize === 0) {
    boxSize = bytes.byteLength - offset;
  }

  let cursor = offset + headerSize;
  const version = view.getUint8(cursor);
  cursor += 1; // version (1 byte)
  cursor += 3; // flags (3 bytes)
  cursor += 4; // reference_ID (4 bytes)

  const timescale = view.getUint32(cursor);
  cursor += 4;

  let firstOffset: number;
  if (version === 0) {
    cursor += 4; // earliest_presentation_time (32-bit)
    firstOffset = view.getUint32(cursor);
    cursor += 4;
  } else {
    cursor += 8; // earliest_presentation_time (64-bit)
    const high = view.getUint32(cursor);
    const low = view.getUint32(cursor + 4);
    firstOffset = high * 0x100000000 + low;
    cursor += 8;
  }

  cursor += 2; // reserved (16-bit)
  const referenceCount = view.getUint16(cursor);
  cursor += 2;

  // Anchor point: the first byte of the box immediately following sidx
  const anchorPoint = offset + boxSize;
  let currentByteOffset = anchorPoint + firstOffset;

  const segments: SidxSegment[] = [];

  for (let i = 0; i < referenceCount; i++) {
    if (cursor + 12 > bytes.byteLength) {
      // Truncated sidx reference entries
      break;
    }

    const refSizeRaw = view.getUint32(cursor);
    const referencedSize = refSizeRaw & 0x7fffffff;
    const subsegmentDuration = view.getUint32(cursor + 4);
    // skip 4 bytes: starts_with_SAP (1 bit) + SAP_type (3 bits) + SAP_delta_time (28 bits)
    cursor += 12;

    const startByte = currentByteOffset;
    const endByte = currentByteOffset + referencedSize - 1;
    const duration = timescale > 0 ? subsegmentDuration / timescale : 0;

    segments.push({
      duration,
      referencedSize,
      startByte,
      endByte,
    });

    currentByteOffset += referencedSize;
  }

  return {
    timescale,
    firstOffset,
    boxOffset: offset,
    boxSize,
    initSegmentEnd: offset,
    segments,
  };
}

/**
 * Normalizes HTTP response data into a Uint8Array.
 */
async function toUint8Array(res: any): Promise<Uint8Array> {
  if (typeof res?.bytes === 'function') {
    return await res.bytes();
  }
  if (typeof res?.arrayBuffer === 'function') {
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  }
  if (res?.body instanceof Uint8Array) {
    return res.body;
  }
  if (typeof res?.body === 'string') {
    const str: string = res.body;
    const buf = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      buf[i] = str.charCodeAt(i) & 0xff;
    }
    return buf;
  }
  if (res instanceof Uint8Array) {
    return res;
  }
  throw new Error('Unable to extract byte data from HTTP response');
}

/**
 * Fetches the 0-32767 byte range from streamUrl and parses ftyp, moov, and sidx boxes.
 *
 * @param http HTTP client adapter or fetch function
 * @param streamUrl Direct stream URL from YouTube CDN
 */
export async function fetchAndParseBoxes(
  http: HttpLike | { fetch: any } | ((url: string, init?: any) => Promise<any>),
  streamUrl: string,
): Promise<ParsedBoxes> {
  const fetchFn = typeof http === 'function' ? http : http.fetch.bind(http);
  
  const response = await fetchFn(streamUrl, {
    headers: {
      Range: 'bytes=0-32767',
    },
  });

  let bytes = await toUint8Array(response);
  let boxes = findBoxes(bytes);

  const ftyp = boxes.find((b) => b.type === 'ftyp');
  if (!ftyp) {
    throw new Error('No ftyp box found in stream header (0-32767)');
  }

  const moov = boxes.find((b) => b.type === 'moov');
  if (!moov) {
    throw new Error('No moov box found in stream header (0-32767)');
  }

  let sidx = boxes.find((b) => b.type === 'sidx');
  if (!sidx) {
    throw new Error('No sidx box found in stream header (0-32767)');
  }

  // If the sidx box extends beyond the initial 32 KB window (e.g. tracks > 5-10 hours),
  // dynamically expand the byte-range to fetch the full box without truncation.
  const totalRequiredBytes = sidx.offset + sidx.size;
  if (totalRequiredBytes > bytes.byteLength) {
    const expandedResponse = await fetchFn(streamUrl, {
      headers: {
        Range: `bytes=0-${totalRequiredBytes - 1}`,
      },
    });
    bytes = await toUint8Array(expandedResponse);
    boxes = findBoxes(bytes);
    sidx = boxes.find((b) => b.type === 'sidx') || sidx;
  }

  const sidxData = parseSidx(bytes, sidx.offset);

  const initRange = {
    start: 0,
    end: sidx.offset - 1,
    length: sidx.offset,
  };

  return {
    ftyp,
    moov,
    sidx,
    sidxData,
    initRange,
  };
}

/**
 * Builds an RFC 8216 compliant HLS M3U8 string with #EXT-X-VERSION:7,
 * #EXT-X-TARGETDURATION, #EXT-X-MAP, and #EXT-X-BYTERANGE:length@offset.
 *
 * @param streamUrl Direct stream URL for segments and init map
 * @param sidxData Parsed sidx segment entries and init boundaries
 * @param duration Optional total duration in seconds
 */
export function generateHlsManifest(
  streamUrl: string,
  sidxData: SidxData,
  duration?: number,
): string {
  let maxSegmentDuration = 0;
  for (const s of sidxData.segments) {
    if (s.duration > maxSegmentDuration) {
      maxSegmentDuration = s.duration;
    }
  }
  if (maxSegmentDuration === 0) {
    maxSegmentDuration = duration ?? 10;
  }
  
  const targetDuration = Math.max(1, Math.ceil(maxSegmentDuration));
  const initLength = sidxData.initSegmentEnd > 0 ? sidxData.initSegmentEnd : sidxData.boxOffset;

  const lines: string[] = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    `#EXT-X-MAP:URI="${streamUrl}",BYTERANGE="${initLength}@0"`,
  ];

  for (const segment of sidxData.segments) {
    lines.push(
      `#EXTINF:${segment.duration.toFixed(3)},`,
      `#EXT-X-BYTERANGE:${segment.referencedSize}@${segment.startByte}`,
      streamUrl,
    );
  }

  lines.push('#EXT-X-ENDLIST', '');
  return lines.join('\n');
}

/**
 * Converts an M3U8 playlist string into a Blob URL (preferred in webview)
 * with origin matching the application to prevent opaque origin null errors.
 */
export function toHlsBlobUri(m3u8: string): string | null {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
    try {
      const blob = new Blob([m3u8], { type: 'application/vnd.apple.mpegurl' });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Converts an M3U8 playlist string into a playable URL.
 * Prefers Blob URL in webview/browser contexts; falls back to base64 Data URI.
 */
export function toHlsPlaylistUrl(m3u8: string): string {
  const blobUrl = toHlsBlobUri(m3u8);
  if (blobUrl) {
    return blobUrl;
  }
  return toHlsDataUri(m3u8);
}

/**
 * Converts an M3U8 playlist string into a base64 Data URI
 * data:application/vnd.apple.mpegurl;base64,...
 */
export function toHlsDataUri(m3u8: string): string {
  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(m3u8, 'utf-8').toString('base64');
  } else if (typeof btoa === 'function') {
    base64 = btoa(unescape(encodeURIComponent(m3u8)));
  } else {
    // Pure TypeScript base64 fallback
    const bytes = new TextEncoder().encode(m3u8);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let output = '';
    let i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i++];
      const b1 = i < bytes.length ? bytes[i++] : 0;
      const b2 = i < bytes.length ? bytes[i++] : 0;
      const triple = (b0 << 16) | (b1 << 8) | b2;
      output += chars[(triple >> 18) & 63];
      output += chars[(triple >> 12) & 63];
      output += i > bytes.length + 1 ? '=' : chars[(triple >> 6) & 63];
      output += i > bytes.length ? '=' : chars[triple & 63];
    }
    base64 = output;
  }

  return `data:application/vnd.apple.mpegurl;base64,${base64}`;
}

/**
 * Integration helper for NuclearTube:
 * 1. Obtains the local Nuclear stream proxy port.
 * 2. Proxies segment URLs through http://127.0.0.1:${port}/stream/${base64url} to bypass CORS.
 * 3. Fetches fMP4 box headers to build the segment index.
 * 4. Generates synthetic RFC 8216 HLS playlist with byte ranges.
 * 5. Returns protocol: 'hls' with Blob or Data URI.
 */
export async function resolveHlsStream(
  http: HttpLike | { fetch: any } | ((url: string, init?: any) => Promise<any>),
  streamUrl: string,
  candidateId: string,
  providerId: string,
  durationSeconds?: number | null,
  streamServerPort?: number,
): Promise<HlsStreamResult> {
  const port = streamServerPort ?? (await getStreamServerPort());
  const proxiedSegmentUrl = buildProxiedStreamUrl(streamUrl, port);

  // Fetch box headers via proxied URL first (bypasses CORS in webview), with direct fallback
  let boxes: ParsedBoxes;
  try {
    boxes = await fetchAndParseBoxes(http, proxiedSegmentUrl);
  } catch {
    boxes = await fetchAndParseBoxes(http, streamUrl);
  }

  const { sidxData } = boxes;
  // Crucial: The manifest MUST reference the proxied URL so that Hls.js segment fetches
  // route through 127.0.0.1:${port} which injects Access-Control-Allow-Origin: *!
  const m3u8 = generateHlsManifest(proxiedSegmentUrl, sidxData, durationSeconds ?? undefined);
  const dataUri = toHlsDataUri(m3u8);

  return {
    url: dataUri,
    protocol: 'hls',
    source: {
      provider: providerId,
      id: candidateId,
    },
    durationMs: durationSeconds ? Math.round(durationSeconds * 1000) : undefined,
  };
}
