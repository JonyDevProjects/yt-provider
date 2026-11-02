import { describe, it, expect, vi } from 'vitest';
import {
  findBoxes,
  parseSidx,
  fetchAndParseBoxes,
  generateHlsManifest,
  toHlsDataUri,
  resolveHlsStream,
  type SidxData,
} from '../../src/core/hlsManifest.js';
import { encodeStreamUrlBase64 } from '../../src/core/streamProxy.js';
import type { HttpLike } from '../../src/core/types.js';

// Helper to construct a big-endian ISO BMFF box
function createBox(type: string, payload: Uint8Array): Uint8Array {
  const size = payload.length + 8;
  const box = new Uint8Array(size);
  const view = new DataView(box.buffer);
  
  view.setUint32(0, size);
  for (let i = 0; i < 4; i++) {
    box[4 + i] = type.charCodeAt(i);
  }
  box.set(payload, 8);
  return box;
}

// Helper to create sidx box payload according to ISO 14496-12
function createSidxPayload(options: {
  version?: number;
  referenceId?: number;
  timescale?: number;
  earliestPresentationTime?: number;
  firstOffset?: number;
  segments: Array<{ duration: number; size: number }>;
}): Uint8Array {
  const version = options.version ?? 0;
  const referenceId = options.referenceId ?? 1;
  const timescale = options.timescale ?? 44100;
  const earliestPresentationTime = options.earliestPresentationTime ?? 0;
  const firstOffset = options.firstOffset ?? 0;
  const segments = options.segments;

  const headerSize = version === 0 ? 24 : 32;
  const payloadSize = headerSize + segments.length * 12;
  const buffer = new Uint8Array(payloadSize);
  const view = new DataView(buffer.buffer);

  let pos = 0;
  view.setUint8(pos, version);
  pos += 1; // version (1 byte)
  view.setUint8(pos, 0); // flags (3 bytes)
  view.setUint8(pos + 1, 0);
  view.setUint8(pos + 2, 0);
  pos += 3;

  view.setUint32(pos, referenceId);
  pos += 4;
  view.setUint32(pos, timescale);
  pos += 4;

  if (version === 0) {
    view.setUint32(pos, earliestPresentationTime);
    pos += 4;
    view.setUint32(pos, firstOffset);
    pos += 4;
  } else {
    // 64-bit uints
    const eptHigh = Math.floor(earliestPresentationTime / 0x100000000);
    const eptLow = earliestPresentationTime >>> 0;
    view.setUint32(pos, eptHigh);
    view.setUint32(pos + 4, eptLow);
    pos += 8;

    const foHigh = Math.floor(firstOffset / 0x100000000);
    const foLow = firstOffset >>> 0;
    view.setUint32(pos, foHigh);
    view.setUint32(pos + 4, foLow);
    pos += 8;
  }

  view.setUint16(pos, 0); // reserved (2 bytes)
  pos += 2;
  view.setUint16(pos, segments.length); // reference_count (2 bytes)
  pos += 2;

  for (const seg of segments) {
    // referenced_size with reference_type = 0
    view.setUint32(pos, seg.size & 0x7fffffff);
    // subsegment_duration = duration_in_seconds * timescale
    view.setUint32(pos + 4, Math.round(seg.duration * timescale));
    // starts_with_SAP = 1, SAP_type = 1, delta = 0 -> 0x90000000
    view.setUint32(pos + 8, 0x90000000);
    pos += 12;
  }

  return buffer;
}

// Concatenate multiple Uint8Arrays
function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

describe('HLS Manifest Generator (Alternative 1)', () => {
  describe('findBoxes', () => {
    it('should find top-level ftyp, moov, and sidx boxes', () => {
      const ftyp = createBox('ftyp', new Uint8Array([1, 2, 3, 4]));
      const moov = createBox('moov', new Uint8Array([5, 6, 7, 8, 9, 10]));
      const sidx = createBox('sidx', new Uint8Array([11, 12]));
      const data = concatBytes([ftyp, moov, sidx]);

      const boxes = findBoxes(data);
      expect(boxes).toHaveLength(3);
      expect(boxes[0]).toEqual({ type: 'ftyp', offset: 0, size: 12 });
      expect(boxes[1]).toEqual({ type: 'moov', offset: 12, size: 14 });
      expect(boxes[2]).toEqual({ type: 'sidx', offset: 26, size: 10 });
    });

    it('should handle extended 64-bit size markers (size === 1)', () => {
      // 16-byte box header: size=1, type='free', largeSize=24
      const box = new Uint8Array(24);
      const view = new DataView(box.buffer);
      view.setUint32(0, 1);
      box[4] = 'f'.charCodeAt(0);
      box[5] = 'r'.charCodeAt(0);
      box[6] = 'e'.charCodeAt(0);
      box[7] = 'e'.charCodeAt(0);
      view.setUint32(8, 0); // high 32
      view.setUint32(12, 24); // low 32

      const boxes = findBoxes(box);
      expect(boxes).toHaveLength(1);
      expect(boxes[0]).toEqual({ type: 'free', offset: 0, size: 24 });
    });

    it('should handle truncated data gracefully without throwing', () => {
      const truncated = new Uint8Array([0, 0, 0]); // fewer than 8 bytes
      const boxes = findBoxes(truncated);
      expect(boxes).toHaveLength(0);
    });
  });

  describe('parseSidx', () => {
    it('should parse ISO 14496-12 sidx version 0 correctly', () => {
      const timescale = 44100;
      const sidxPayload = createSidxPayload({
        version: 0,
        timescale,
        firstOffset: 0,
        segments: [
          { duration: 10.0, size: 160000 },
          { duration: 10.5, size: 165000 },
        ],
      });

      const sidxBox = createBox('sidx', sidxPayload);
      const sidxOffset = 723;
      const fileData = new Uint8Array(sidxOffset + sidxBox.length);
      fileData.set(sidxBox, sidxOffset);

      const parsed = parseSidx(fileData, sidxOffset);

      expect(parsed.timescale).toBe(timescale);
      expect(parsed.firstOffset).toBe(0);
      expect(parsed.boxOffset).toBe(sidxOffset);
      expect(parsed.boxSize).toBe(sidxBox.length);
      expect(parsed.initSegmentEnd).toBe(sidxOffset);
      expect(parsed.segments).toHaveLength(2);

      // Anchor point = sidxOffset + sidxBox.length
      const expectedFirstMediaByte = sidxOffset + sidxBox.length;
      expect(parsed.segments[0]).toEqual({
        duration: expect.closeTo(10.0, 3),
        referencedSize: 160000,
        startByte: expectedFirstMediaByte,
        endByte: expectedFirstMediaByte + 160000 - 1,
      });

      expect(parsed.segments[1]).toEqual({
        duration: expect.closeTo(10.5, 3),
        referencedSize: 165000,
        startByte: expectedFirstMediaByte + 160000,
        endByte: expectedFirstMediaByte + 160000 + 165000 - 1,
      });
    });

    it('should parse ISO 14496-12 sidx version 1 correctly', () => {
      const timescale = 48000;
      const sidxPayload = createSidxPayload({
        version: 1,
        timescale,
        firstOffset: 128,
        segments: [
          { duration: 5.2, size: 85000 },
        ],
      });

      const sidxBox = createBox('sidx', sidxPayload);
      const parsed = parseSidx(sidxBox, 0);

      expect(parsed.timescale).toBe(timescale);
      expect(parsed.firstOffset).toBe(128);
      expect(parsed.segments).toHaveLength(1);
      expect(parsed.segments[0].startByte).toBe(sidxBox.length + 128);
      expect(parsed.segments[0].duration).toBeCloseTo(5.2, 3);
    });

    it('should throw if offset is out of buffer bounds', () => {
      const empty = new Uint8Array(10);
      expect(() => parseSidx(empty, 20)).toThrow('outside buffer bounds');
    });
  });

  describe('fetchAndParseBoxes', () => {
    const streamUrl = 'https://rr1---sn-4g5ednsl.googlevideo.com/videoplayback?id=123';

    function buildValidHeaderBytes(): Uint8Array {
      const ftyp = createBox('ftyp', new Uint8Array(16)); // 24 bytes
      const moov = createBox('moov', new Uint8Array(600)); // 608 bytes
      const sidxPayload = createSidxPayload({
        timescale: 44100,
        segments: [
          { duration: 10.0, size: 150000 },
          { duration: 10.0, size: 155000 },
        ],
      });
      const sidx = createBox('sidx', sidxPayload);
      return concatBytes([ftyp, moov, sidx]);
    }

    it('should fetch range 0-32767 and parse all boxes with HttpLike', async () => {
      const headerBytes = buildValidHeaderBytes();
      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 206,
          body: headerBytes,
        }),
      };

      const result = await fetchAndParseBoxes(mockHttp, streamUrl);

      expect(mockHttp.fetch).toHaveBeenCalledWith(streamUrl, {
        headers: { Range: 'bytes=0-32767' },
      });
      expect(result.ftyp.type).toBe('ftyp');
      expect(result.moov.type).toBe('moov');
      expect(result.sidx.type).toBe('sidx');
      expect(result.sidxData.segments).toHaveLength(2);
      expect(result.initRange.start).toBe(0);
      expect(result.initRange.length).toBe(result.sidx.offset);
    });

    it('should support arrayBuffer in HTTP response', async () => {
      const headerBytes = buildValidHeaderBytes();
      const mockHttp = {
        fetch: vi.fn().mockResolvedValue({
          status: 206,
          arrayBuffer: async () => headerBytes.buffer,
        }),
      };

      const result = await fetchAndParseBoxes(mockHttp, streamUrl);
      expect(result.sidxData.segments).toHaveLength(2);
    });

    it('should support binary string body in HTTP response', async () => {
      const headerBytes = buildValidHeaderBytes();
      let binaryStr = '';
      for (let i = 0; i < headerBytes.length; i++) {
        binaryStr += String.fromCharCode(headerBytes[i]);
      }

      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 206,
          body: binaryStr,
        }),
      };

      const result = await fetchAndParseBoxes(mockHttp, streamUrl);
      expect(result.sidxData.segments).toHaveLength(2);
    });

    it('should throw if ftyp box is missing', async () => {
      const moov = createBox('moov', new Uint8Array(100));
      const sidx = createBox('sidx', createSidxPayload({ segments: [] }));
      const badData = concatBytes([moov, sidx]);

      const mockHttp = {
        fetch: vi.fn().mockResolvedValue({ status: 200, body: badData }),
      };

      await expect(fetchAndParseBoxes(mockHttp, streamUrl)).rejects.toThrow('No ftyp box found');
    });

    it('should throw if moov box is missing', async () => {
      const ftyp = createBox('ftyp', new Uint8Array(16));
      const sidx = createBox('sidx', createSidxPayload({ segments: [] }));
      const badData = concatBytes([ftyp, sidx]);

      const mockHttp = {
        fetch: vi.fn().mockResolvedValue({ status: 200, body: badData }),
      };

      await expect(fetchAndParseBoxes(mockHttp, streamUrl)).rejects.toThrow('No moov box found');
    });

    it('should throw if sidx box is missing', async () => {
      const ftyp = createBox('ftyp', new Uint8Array(16));
      const moov = createBox('moov', new Uint8Array(100));
      const badData = concatBytes([ftyp, moov]);

      const mockHttp = {
        fetch: vi.fn().mockResolvedValue({ status: 200, body: badData }),
      };

      await expect(fetchAndParseBoxes(mockHttp, streamUrl)).rejects.toThrow('No sidx box found');
    });
  });

  describe('generateHlsManifest', () => {
    const streamUrl = 'https://googlevideo.com/stream?id=test';
    const sidxData: SidxData = {
      timescale: 44100,
      firstOffset: 0,
      boxOffset: 723,
      boxSize: 200,
      initSegmentEnd: 723,
      segments: [
        {
          duration: 10.005,
          referencedSize: 161940,
          startByte: 923,
          endByte: 162862,
        },
        {
          duration: 9.995,
          referencedSize: 161552,
          startByte: 162863,
          endByte: 324414,
        },
      ],
    };

    it('should build RFC 8216 compliant M3U8 string with byte ranges', () => {
      const manifest = generateHlsManifest(streamUrl, sidxData);

      expect(manifest).toContain('#EXTM3U');
      expect(manifest).toContain('#EXT-X-VERSION:7');
      expect(manifest).toContain('#EXT-X-TARGETDURATION:11'); // Math.ceil(10.005) = 11
      expect(manifest).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
      expect(manifest).toContain('#EXT-X-INDEPENDENT-SEGMENTS');
      expect(manifest).toContain(`#EXT-X-MAP:URI="${streamUrl}",BYTERANGE="723@0"`);

      // Segments
      expect(manifest).toContain('#EXTINF:10.005,');
      expect(manifest).toContain(`#EXT-X-BYTERANGE:161940@923\n${streamUrl}`);

      expect(manifest).toContain('#EXTINF:9.995,');
      expect(manifest).toContain(`#EXT-X-BYTERANGE:161552@162863\n${streamUrl}`);

      expect(manifest).toContain('#EXT-X-ENDLIST');
    });
  });

  describe('toHlsDataUri', () => {
    it('should generate valid base64 data URI', () => {
      const m3u8 = '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-ENDLIST';
      const uri = toHlsDataUri(m3u8);

      expect(uri).toMatch(/^data:application\/vnd\.apple\.mpegurl;base64,/);

      const base64Data = uri.replace('data:application/vnd.apple.mpegurl;base64,', '');
      const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
      expect(decoded).toBe(m3u8);
    });
  });

  describe('resolveHlsStream', () => {
    it('should coordinate box parsing, manifest generation and return HLS stream candidate', async () => {
      const ftyp = createBox('ftyp', new Uint8Array(16));
      const moov = createBox('moov', new Uint8Array(400));
      const sidxPayload = createSidxPayload({
        timescale: 44100,
        segments: [{ duration: 10.0, size: 150000 }],
      });
      const sidx = createBox('sidx', sidxPayload);
      const headerBytes = concatBytes([ftyp, moov, sidx]);

      const mockHttp: HttpLike = {
        fetch: vi.fn().mockResolvedValue({
          status: 206,
          body: headerBytes,
        }),
      };

      const streamUrl = 'https://googlevideo.com/playback';
      const result = await resolveHlsStream(
        mockHttp,
        streamUrl,
        'video-long-123',
        'nucleartube-streaming',
        5400,
      );

      expect(result.protocol).toBe('hls');
      expect(result.source).toEqual({
        provider: 'nucleartube-streaming',
        id: 'video-long-123',
      });
      expect(result.durationMs).toBe(5400000);
      expect(result.url).toMatch(/^data:application\/vnd\.apple\.mpegurl;base64,/);

      // Verify decoded manifest contains expected tags
      const base64Part = result.url.split(',')[1];
      const manifest = Buffer.from(base64Part, 'base64').toString('utf-8');
      expect(manifest).toContain('#EXT-X-VERSION:7');
      expect(manifest).toContain('#EXT-X-BYTERANGE:150000@');
      expect(manifest).toContain('http://127.0.0.1:9100/stream/');
      expect(manifest).toContain(encodeStreamUrlBase64(streamUrl));
    });

    it('should dynamically expand range fetch if sidx box exceeds 32 KB window', async () => {
      const ftyp = createBox('ftyp', new Uint8Array(16));
      const moov = createBox('moov', new Uint8Array(400));
      // Create sidx with 3,000 segments (~36 KB payload)
      const segments = Array.from({ length: 3000 }, () => ({ duration: 10.0, size: 150000 }));
      const sidxPayload = createSidxPayload({
        timescale: 44100,
        segments,
      });
      const sidx = createBox('sidx', sidxPayload);
      const fullHeaderBytes = concatBytes([ftyp, moov, sidx]);

      // First call only returns first 32 KB (truncated sidx)
      const truncated32k = fullHeaderBytes.slice(0, 32768);

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: any) => {
        const range = init?.headers?.Range;
        if (range === 'bytes=0-32767') {
          return { status: 206, body: truncated32k };
        }
        return { status: 206, body: fullHeaderBytes };
      });

      const parsed = await fetchAndParseBoxes({ fetch: mockFetch }, 'https://googlevideo.com/long');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(parsed.sidxData.segments).toHaveLength(3000);
    });

    it('should safely calculate targetDuration without stack overflow on 100,000 segments', () => {
      const segments = Array.from({ length: 100000 }, (_, i) => ({
        duration: i === 50000 ? 12.345 : 9.876,
        referencedSize: 150000,
        startByte: i * 150000,
        endByte: (i + 1) * 150000 - 1,
      }));

      const sidxData: SidxData = {
        timescale: 44100,
        firstOffset: 0,
        boxOffset: 723,
        boxSize: 100000 * 12 + 32,
        initSegmentEnd: 723,
        segments,
      };

      const manifest = generateHlsManifest('https://example.com/test', sidxData);
      expect(manifest).toContain('#EXT-X-TARGETDURATION:13');
    });
  });
});
