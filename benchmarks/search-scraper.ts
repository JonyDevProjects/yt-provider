import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { scrapeMobileYoutube, parseYoutubeSearchHtml, decodeHexEscapes, parseMobileYoutubeSearchHtml } from '../src/core/ytScraper.js';
import type { HttpLike, SearchResult } from '../src/core/types.js';
import { calculateMetrics, formatMs } from './metrics.js';
import type { BenchmarkMetrics } from './metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SEARCH_QUERIES = [
  { query: 'Rick Astley Never Gonna Give You Up', category: 'popular' },
  { query: 'Queen Bohemian Rhapsody', category: 'popular' },
  { query: 'Radiohead Creep', category: 'rock' },
  { query: 'PSY Gangnam Style', category: 'kpop' },
  { query: 'Luis Fonsi Despacito', category: 'latin' },
  { query: 'Led Zeppelin Stairway to Heaven', category: 'classic' },
  { query: 'Dire Straits Sultans of Swing', category: 'classic' },
  { query: 'lofi hip hop beats', category: 'genre' },
  { query: 'jazz piano instrumental', category: 'genre' },
  { query: 'electronic music mix 2024', category: 'mix' },
];

const RUNS_PER_QUERY = 5;
const COOLDOWN_MS = 1000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function createRealHttp(): HttpLike {
  return {
    fetch: async (url, init) => {
      const res = await fetch(url, { headers: init?.headers });
      const body = await res.text();
      return { status: res.status, body, headers: Object.fromEntries(res.headers) };
    }
  };
}

interface QueryResult {
  query: string;
  category: string;
  times: number[];
  payloadSizes: number[];
  resultCounts: number[];
  metrics: BenchmarkMetrics;
  payloadMetrics: BenchmarkMetrics;
}

interface BenchmarkRun {
  overallMetrics: BenchmarkMetrics;
  perQuery: QueryResult[];
}

async function runBenchmark(
  http: HttpLike,
  scraperType: 'mobile' | 'desktop'
): Promise<BenchmarkRun> {
  const allTimes: number[] = [];
  const allPayloads: number[] = [];
  const perQuery: QueryResult[] = [];

  for (const { query, category } of SEARCH_QUERIES) {
    const times: number[] = [];
    const payloadSizes: number[] = [];
    const resultCounts: number[] = [];

    for (let run = 0; run < RUNS_PER_QUERY; run++) {
      const start = performance.now();
      let payloadSize = 0;
      let resultCount = 0;

      try {
        if (scraperType === 'mobile') {
          const res = await http.fetch(
            `https://m.youtube.com/results?search_query=${encodeURIComponent(query)}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                'Accept-Language': 'en-US,en;q=0.9'
              }
            }
          );
          payloadSize = res.body.length;
          const results = parseMobileYoutubeSearchHtml(res.body, 10);
          resultCount = results.length;
        } else {
          const res = await http.fetch(
            `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
              }
            }
          );
          payloadSize = res.body.length;
          const results = parseYoutubeSearchHtml(res.body, 10);
          resultCount = results.length;
        }
      } catch (err) {
        console.error(`  [!] Error on run ${run + 1}: ${err}`);
      }

      const elapsed = performance.now() - start;
      times.push(elapsed);
      payloadSizes.push(payloadSize);
      resultCounts.push(resultCount);
      allTimes.push(elapsed);
      allPayloads.push(payloadSize);

      if (run < RUNS_PER_QUERY - 1) {
        await sleep(COOLDOWN_MS);
      }
    }

    perQuery.push({
      query,
      category,
      times,
      payloadSizes,
      resultCounts,
      metrics: calculateMetrics(times),
      payloadMetrics: calculateMetrics(payloadSizes),
    });
  }

  return {
    overallMetrics: calculateMetrics(allTimes),
    perQuery,
  };
}

function generateReport(
  mobile: BenchmarkRun,
  desktop: BenchmarkRun
): string {
  const lines: string[] = [];
  lines.push('# Search Scraper Benchmark Report');
  lines.push(`\n**Date**: ${new Date().toISOString()}`);
  lines.push(`**Platform**: ${os.platform()} ${os.release()} (${os.arch()})`);
  lines.push(`**Node**: ${process.version}`);
  lines.push(`**Runs per query**: ${RUNS_PER_QUERY}`);
  lines.push('');

  lines.push('## Overall Comparison\n');
  lines.push('| Metric | Mobile | Desktop | Delta |');
  lines.push('|--------|--------|---------|-------|');

  const mMean = mobile.overallMetrics.mean;
  const dMean = desktop.overallMetrics.mean;
  const deltaMean = dMean - mMean;
  const deltaPercent = ((deltaMean / dMean) * 100).toFixed(1);

  lines.push(`| Mean Latency | ${formatMs(mMean)} | ${formatMs(dMean)} | ${formatMs(deltaMean)} (${deltaPercent}% faster) |`);
  lines.push(`| p50 Latency | ${formatMs(mobile.overallMetrics.p50)} | ${formatMs(desktop.overallMetrics.p50)} | ${formatMs(desktop.overallMetrics.p50 - mobile.overallMetrics.p50)} |`);
  lines.push(`| p95 Latency | ${formatMs(mobile.overallMetrics.p95)} | ${formatMs(desktop.overallMetrics.p95)} | ${formatMs(desktop.overallMetrics.p95 - mobile.overallMetrics.p95)} |`);
  lines.push(`| StdDev | ${formatMs(mobile.overallMetrics.stddev)} | ${formatMs(desktop.overallMetrics.stddev)} | |`);
  lines.push('');

  const mPayload = mobile.perQuery.reduce((acc, q) => acc + q.payloadMetrics.mean, 0) / mobile.perQuery.length;
  const dPayload = desktop.perQuery.reduce((acc, q) => acc + q.payloadMetrics.mean, 0) / desktop.perQuery.length;
  lines.push(`| Avg Payload | ${(mPayload / 1024).toFixed(0)} KB | ${(dPayload / 1024).toFixed(0)} KB | ${((1 - mPayload / dPayload) * 100).toFixed(0)}% smaller |`);
  lines.push('');

  lines.push('## Per-Query Results\n');
  lines.push('| Query | Mobile p50 | Desktop p50 | Mobile Results | Desktop Results |');
  lines.push('|-------|------------|-------------|----------------|-----------------|');

  for (let i = 0; i < mobile.perQuery.length; i++) {
    const mq = mobile.perQuery[i];
    const dq = desktop.perQuery[i];
    const mResults = mq.resultCounts[0] || 0;
    const dResults = dq.resultCounts[0] || 0;
    lines.push(`| ${mq.query.substring(0, 30)}... | ${formatMs(mq.metrics.p50)} | ${formatMs(dq.metrics.p50)} | ${mResults} | ${dResults} |`);
  }

  lines.push('\n---\n');
  lines.push('## Decision\n');
  lines.push(`Mobile is **${deltaPercent}% faster** on average with **${((1 - mPayload / dPayload) * 100).toFixed(0)}% smaller** payloads.`);

  if (parseFloat(deltaPercent) > 10) {
    lines.push('\n**Recommendation**: Mobile as Tier 1 (primary), Desktop as Tier 2 (fallback).');
  } else {
    lines.push('\n**Recommendation**: Performance difference is marginal. Consider keeping Desktop as Tier 1 for richer metadata fields.');
  }

  return lines.join('\n');
}

async function main() {
  console.log('=== Search Scraper Benchmark ===\n');
  console.log(`Platform: ${os.platform()} ${os.release()} (${os.arch()})`);
  console.log(`Node: ${process.version}`);
  console.log(`Queries: ${SEARCH_QUERIES.length}`);
  console.log(`Runs per query: ${RUNS_PER_QUERY}\n`);

  const http = createRealHttp();

  console.log('--- Running Mobile Benchmark ---');
  const mobile = await runBenchmark(http, 'mobile');
  console.log(`Mobile overall: mean=${formatMs(mobile.overallMetrics.mean)}, p50=${formatMs(mobile.overallMetrics.p50)}, p95=${formatMs(mobile.overallMetrics.p95)}\n`);

  await sleep(2000);

  console.log('--- Running Desktop Benchmark ---');
  const desktop = await runBenchmark(http, 'desktop');
  console.log(`Desktop overall: mean=${formatMs(desktop.overallMetrics.mean)}, p50=${formatMs(desktop.overallMetrics.p50)}, p95=${formatMs(desktop.overallMetrics.p95)}\n`);

  const report = generateReport(mobile, desktop);

  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonData = {
    timestamp: new Date().toISOString(),
    environment: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      nodeVersion: process.version,
    },
    config: {
      queriesCount: SEARCH_QUERIES.length,
      runsPerQuery: RUNS_PER_QUERY,
      cooldownMs: COOLDOWN_MS,
    },
    mobile,
    desktop,
    comparison: {
      mobileMeanMs: mobile.overallMetrics.mean,
      desktopMeanMs: desktop.overallMetrics.mean,
      deltaMs: desktop.overallMetrics.mean - mobile.overallMetrics.mean,
      deltaPercent: ((desktop.overallMetrics.mean - mobile.overallMetrics.mean) / desktop.overallMetrics.mean * 100).toFixed(1),
    },
  };

  fs.writeFileSync(path.join(resultsDir, `search-benchmark-${timestamp}.json`), JSON.stringify(jsonData, null, 2));
  fs.writeFileSync(path.join(resultsDir, 'search-latest.json'), JSON.stringify(jsonData, null, 2));
  fs.writeFileSync(path.join(resultsDir, 'search-report-latest.md'), report);

  console.log(report);
  console.log(`\nResults saved to ${resultsDir}/`);
}

main().catch(console.error);
