import { performance } from 'perf_hooks';
import { parseInnertubeResponse, INNERTUBE_SEARCH_ENDPOINT, INNERTUBE_CLIENT_CONTEXT } from '../../src/core/innertubeScraper.js';
import { BENCHMARK_TRACKS } from '../tracks.js';
import type { BenchmarkTrack } from '../tracks.js';
import { calculateMetrics, formatMs } from '../metrics.js';
import type { SearchSample, SearchModelResult, TrackSearchMetric } from './model-html.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes a single Innertube JSON search measurement.
 */
export async function executeInnertubeSearch(query: string, limit: number = 10): Promise<SearchSample> {
  const payload = {
    context: INNERTUBE_CLIENT_CONTEXT,
    query
  };
  const bodyStr = JSON.stringify(payload);

  let res: Response | null = null;
  let t0 = 0;
  let t1 = 0;
  let lastErr: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      t0 = performance.now();
      res = await fetch(INNERTUBE_SEARCH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'close'
        },
        body: bodyStr
      });
      if (res && res.ok) {
        break;
      }
    } catch (err: any) {
      lastErr = err;
      await sleep(200 * (attempt + 1));
    }
  }

  if (!res || !res.ok) {
    throw new Error(lastErr ? (lastErr.cause?.message || lastErr.message) : `Innertube HTTP Error ${res?.status}`);
  }

  const jsonText = await res.text();
  t1 = performance.now();
  const networkMs = t1 - t0;
  const payloadBytes = Buffer.byteLength(jsonText, 'utf8');

  const p0 = performance.now();
  const json = JSON.parse(jsonText);
  const results = parseInnertubeResponse(json, limit);
  const p1 = performance.now();
  const parseMs = p1 - p0;
  const totalMs = networkMs + parseMs;

  return {
    networkMs,
    parseMs,
    totalMs,
    payloadBytes,
    resultCount: results.length
  };
}

/**
 * Runs the Innertube Search Benchmark across the defined tracks.
 */
export async function runInnertubeSearchBenchmark(options: {
  tracks?: BenchmarkTrack[];
  iterations?: number;
  cooldownMs?: number;
  verbose?: boolean;
} = {}): Promise<SearchModelResult> {
  const tracks = options.tracks || BENCHMARK_TRACKS;
  const iterations = options.iterations ?? 5;
  const cooldownMs = options.cooldownMs ?? 300;
  const verbose = options.verbose ?? true;

  if (verbose) {
    console.log('===============================================================');
    console.log('  Benchmark de Búsqueda — Modelo Optimizado Innertube JSON');
    console.log('===============================================================');
    console.log(`Queries: ${tracks.length} | Iteraciones: ${iterations} | Cooldown: ${cooldownMs}ms\n`);
  }

  // Warmup run (discarded)
  if (verbose) process.stdout.write('🔥 Realizando warmup inicial Innertube...');
  try {
    await executeInnertubeSearch('Warmup test');
    if (verbose) console.log(' OK\n');
  } catch (err: any) {
    if (verbose) console.log(` (Warmup advertencia: ${err.message})\n`);
  }

  const trackMetrics: TrackSearchMetric[] = [];
  const allNetworkMs: number[] = [];
  const allParseMs: number[] = [];
  const allTotalMs: number[] = [];
  const allPayloadBytes: number[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const query = `${track.artist} - ${track.title}`;
    if (verbose) {
      console.log(`[${i + 1}/${tracks.length}] Query: "${query}" [${track.category}]`);
    }

    const samples: SearchSample[] = [];
    let trackError: string | undefined;

    for (let r = 0; r < iterations; r++) {
      try {
        const sample = await executeInnertubeSearch(query, 10);
        samples.push(sample);
        allNetworkMs.push(sample.networkMs);
        allParseMs.push(sample.parseMs);
        allTotalMs.push(sample.totalMs);
        allPayloadBytes.push(sample.payloadBytes);

        if (verbose) {
          console.log(`   Iteración ${r + 1}: Total ${formatMs(sample.totalMs)} (Red: ${formatMs(sample.networkMs)}, Parse: ${formatMs(sample.parseMs)}, Payload: ${(sample.payloadBytes / 1024).toFixed(1)} KB, Resultados: ${sample.resultCount})`);
        }

        if (cooldownMs > 0 && r < iterations - 1) {
          await sleep(cooldownMs);
        }
      } catch (err: any) {
        trackError = err.message || String(err);
        if (verbose) {
          console.error(`   ❌ Iteración ${r + 1} Error: ${trackError}`);
        }
      }
    }

    const networkMetrics = calculateMetrics(samples.map(s => s.networkMs));
    const parseMetrics = calculateMetrics(samples.map(s => s.parseMs));
    const totalMetrics = calculateMetrics(samples.map(s => s.totalMs));
    const avgPayloadBytes = samples.length > 0
      ? samples.reduce((acc, s) => acc + s.payloadBytes, 0) / samples.length
      : 0;

    trackMetrics.push({
      query,
      track,
      samples,
      networkMetrics,
      parseMetrics,
      totalMetrics,
      avgPayloadBytes,
      error: trackError
    });

    if (verbose) {
      console.log(`   --> Total Medio: ${formatMs(totalMetrics.mean)} | Parse Medio: ${formatMs(parseMetrics.mean)} | Payload: ${(avgPayloadBytes / 1024).toFixed(1)} KB\n`);
    }

    if (cooldownMs > 0 && i < tracks.length - 1) {
      await sleep(cooldownMs);
    }
  }

  const overallNetworkMetrics = calculateMetrics(allNetworkMs);
  const overallParseMetrics = calculateMetrics(allParseMs);
  const overallTotalMetrics = calculateMetrics(allTotalMs);
  const overallAvgPayloadBytes = allPayloadBytes.length > 0
    ? allPayloadBytes.reduce((a, b) => a + b, 0) / allPayloadBytes.length
    : 0;

  return {
    model: 'innertube',
    modelName: 'Modelo Innertube JSON (WEB_REMIX API)',
    timestamp: new Date().toISOString(),
    iterationsPerQuery: iterations,
    trackMetrics,
    overallNetworkMetrics,
    overallParseMetrics,
    overallTotalMetrics,
    overallAvgPayloadBytes
  };
}
