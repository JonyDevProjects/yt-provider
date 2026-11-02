import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  encodeStreamUrlBase64,
  getStreamServerPort,
  resetCachedStreamPort,
  setCachedStreamPort,
  buildProxiedStreamUrl,
} from '../../src/core/streamProxy.js';

describe('Stream Proxy Helper', () => {
  beforeEach(() => {
    resetCachedStreamPort();
  });

  afterEach(() => {
    resetCachedStreamPort();
    vi.restoreAllMocks();
  });

  describe('encodeStreamUrlBase64', () => {
    it('should encode URL using URL_SAFE_NO_PAD base64', () => {
      const url = 'https://rr3---sn-4g5ednkk.googlevideo.com/videoplayback?expire=123456&ei=abc';
      const encoded = encodeStreamUrlBase64(url);

      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
      
      // Decoded check
      let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4 !== 0) {
        base64 += '=';
      }
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      expect(decoded).toBe(url);
    });

    it('should handle special characters and query strings without padding', () => {
      const sample = 'https://example.com/test?a=1&b=2+3/4';
      const encoded = encodeStreamUrlBase64(sample);
      expect(encoded.endsWith('=')).toBe(false);
    });
  });

  describe('buildProxiedStreamUrl', () => {
    it('should format proxied stream URL with default port 9100', () => {
      const url = 'https://googlevideo.com/stream';
      const proxied = buildProxiedStreamUrl(url);
      expect(proxied.startsWith('http://127.0.0.1:9100/stream/')).toBe(true);
      expect(proxied).toContain(encodeStreamUrlBase64(url));
    });

    it('should format proxied stream URL with custom port', () => {
      const url = 'https://googlevideo.com/stream';
      const proxied = buildProxiedStreamUrl(url, 9105);
      expect(proxied.startsWith('http://127.0.0.1:9105/stream/')).toBe(true);
    });
  });

  describe('getStreamServerPort', () => {
    it('should return cached port if set', async () => {
      setCachedStreamPort(9103);
      const port = await getStreamServerPort();
      expect(port).toBe(9103);
    });

    it('should query Tauri IPC invoke if available in window', async () => {
      const originalTauri = (globalThis as any).__TAURI_INTERNALS__;
      (globalThis as any).__TAURI_INTERNALS__ = {
        invoke: vi.fn().mockResolvedValue(9102),
      };

      try {
        const port = await getStreamServerPort();
        expect(port).toBe(9102);
        expect((globalThis as any).__TAURI_INTERNALS__.invoke).toHaveBeenCalledWith('stream_server_port');
      } finally {
        (globalThis as any).__TAURI_INTERNALS__ = originalTauri;
      }
    });

    it('should fall back to default port 9100 when Tauri invoke fails or is absent', async () => {
      const originalTauri = (globalThis as any).__TAURI_INTERNALS__;
      delete (globalThis as any).__TAURI_INTERNALS__;

      // Mock fetch probe failing
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

      try {
        const port = await getStreamServerPort();
        expect(port).toBe(9100);
      } finally {
        (globalThis as any).__TAURI_INTERNALS__ = originalTauri;
      }
    });
  });
});
