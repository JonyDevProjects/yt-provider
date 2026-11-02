/**
 * Stream proxy helper for Nuclear desktop.
 * Translates upstream YouTube CDN URLs to Nuclear's local Rust stream proxy:
 *   http://127.0.0.1:${port}/stream/${base64url(url)}
 *
 * This bypasses browser CORS restrictions in WebKit/macOS and provides
 * pristine binary streaming without UTF-8 string encoding corruptions.
 */

const DEFAULT_STREAM_PORT = 9100;
let cachedStreamPort: number | null = null;

/**
 * Encodes a URL into URL-safe base64 without padding (URL_SAFE_NO_PAD),
 * exactly matching Nuclear's Rust stream_server decode_stream_url().
 */
export function encodeStreamUrlBase64(url: string): string {
  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(url, 'utf-8').toString('base64');
  } else if (typeof btoa === 'function') {
    base64 = btoa(unescape(encodeURIComponent(url)));
  } else {
    // Pure TypeScript base64 fallback
    const bytes = new TextEncoder().encode(url);
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

  // Convert to URL_SAFE_NO_PAD
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Discovers Nuclear's active stream server port:
 * 1. Via Tauri IPC: invoke('stream_server_port') if running inside desktop webview.
 * 2. Via probing ports 9100..9109 (Nuclear's bind range).
 * 3. Fallback to 9100.
 */
export async function getStreamServerPort(): Promise<number> {
  if (cachedStreamPort !== null) {
    return cachedStreamPort;
  }

  // 1. Direct Tauri IPC invocation from webview
  try {
    const tauri = (globalThis as any).__TAURI_INTERNALS__;
    if (tauri && typeof tauri.invoke === 'function') {
      const port = await tauri.invoke('stream_server_port');
      if (typeof port === 'number' && port > 0) {
        cachedStreamPort = port;
        return port;
      }
    }
  } catch {
    // Fall back to probe
  }

  // 2. Probe ports 9100 to 9109
  if (typeof globalThis.fetch === 'function') {
    for (let port = 9100; port <= 9109; port++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 150);
        const res = await globalThis.fetch(`http://127.0.0.1:${port}/stream/healthcheck`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        // stream_server returns 400 Bad Request on invalid base64, but has CORS headers!
        if (res.status === 400 || res.status === 404 || res.status === 200) {
          cachedStreamPort = port;
          return port;
        }
      } catch {
        // Port not bound or unreachable, try next
      }
    }
  }

  cachedStreamPort = DEFAULT_STREAM_PORT;
  return DEFAULT_STREAM_PORT;
}

/**
 * Resets the cached port (useful for unit tests).
 */
export function resetCachedStreamPort(): void {
  cachedStreamPort = null;
}

/**
 * Sets a specific stream port (useful for testing).
 */
export function setCachedStreamPort(port: number): void {
  cachedStreamPort = port;
}

/**
 * Wraps an upstream media URL into Nuclear's local stream proxy URL:
 *   http://127.0.0.1:${port}/stream/${encodedUrl}
 */
export function buildProxiedStreamUrl(url: string, port: number = DEFAULT_STREAM_PORT): string {
  const encoded = encodeStreamUrlBase64(url);
  return `http://127.0.0.1:${port}/stream/${encoded}`;
}
