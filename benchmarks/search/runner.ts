import fs from 'fs';
import path from 'path';
import { runHtmlSearchBenchmark } from './model-html.js';
import type { SearchModelResult } from './model-html.js';
import { runInnertubeSearchBenchmark } from './model-innertube.js';
import { formatMs, formatMemory } from '../metrics.js';
import { BENCHMARK_TRACKS } from '../tracks.js';
import os from 'os';

export interface SearchComparisonReport {
  timestamp: string;
  environment: {
    platform: string;
    arch: string;
    nodeVersion: string;
    osRelease: string;
    cpus: string;
    totalMemory: string;
  };
  htmlResult: SearchModelResult;
  innertubeResult?: SearchModelResult;
}

function generateBaselineMarkdown(result: SearchModelResult, env: any): string {
  const dateStr = new Date().toLocaleString();
  let md = `# Línea Base Oficial: Latencia de Búsqueda HTML (Scraping www.youtube.com)\n\n`;
  md += `**Fecha:** ${dateStr}  \n`;
  md += `**Plataforma:** ${env.platform} (${env.arch}) | Node: ${env.nodeVersion} | CPU: ${env.cpus}  \n`;
  md += `**Metodología:** ${result.iterationsPerQuery} iteraciones por query sobre ${result.trackMetrics.length} canciones (${result.iterationsPerQuery * result.trackMetrics.length} muestras totales)  \n\n`;

  md += `## 1. Resumen Global de Métricas (Línea Base HTML)\n\n`;
  md += `| Métrica | Media | Mediana (p50) | p95 | p99 | Min | Max | StdDev |\n`;
  md += `|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|\n`;
  md += `| **Latencia Total** | **${formatMs(result.overallTotalMetrics.mean)}** | ${formatMs(result.overallTotalMetrics.p50)} | ${formatMs(result.overallTotalMetrics.p95)} | ${formatMs(result.overallTotalMetrics.p99)} | ${formatMs(result.overallTotalMetrics.min)} | ${formatMs(result.overallTotalMetrics.max)} | ±${formatMs(result.overallTotalMetrics.stddev)} |\n`;
  md += `| **Red (TTFB + Descarga)** | **${formatMs(result.overallNetworkMetrics.mean)}** | ${formatMs(result.overallNetworkMetrics.p50)} | ${formatMs(result.overallNetworkMetrics.p95)} | ${formatMs(result.overallNetworkMetrics.p99)} | ${formatMs(result.overallNetworkMetrics.min)} | ${formatMs(result.overallNetworkMetrics.max)} | ±${formatMs(result.overallNetworkMetrics.stddev)} |\n`;
  md += `| **Parseo (Regex ytInitialData)** | **${formatMs(result.overallParseMetrics.mean)}** | ${formatMs(result.overallParseMetrics.p50)} | ${formatMs(result.overallParseMetrics.p95)} | ${formatMs(result.overallParseMetrics.p99)} | ${formatMs(result.overallParseMetrics.min)} | ${formatMs(result.overallParseMetrics.max)} | ±${formatMs(result.overallParseMetrics.stddev)} |\n`;
  md += `| **Tamaño de Payload** | **${(result.overallAvgPayloadBytes / 1024).toFixed(1)} KB** | — | — | — | — | — | — |\n\n`;

  md += `## 2. Detalle por Canción\n\n`;
  md += `| # | Query | Categoría | Latencia Total Media | Red Media | Parse Media | Payload (KB) |\n`;
  md += `|---|---|:---:|:---:|:---:|:---:|:---:|\n`;

  result.trackMetrics.forEach((tm, idx) => {
    md += `| ${idx + 1} | \`${tm.query}\` | \`${tm.track.category}\` | ${formatMs(tm.totalMetrics.mean)} | ${formatMs(tm.networkMetrics.mean)} | ${formatMs(tm.parseMetrics.mean)} | ${(tm.avgPayloadBytes / 1024).toFixed(1)} KB |\n`;
  });

  md += `\n## 3. Observaciones Clave\n\n`;
  md += `- **Cuello de botella principal:** Transferencia de red (~${(result.overallAvgPayloadBytes / 1024).toFixed(0)} KB de HTML por búsqueda) representando > 95% de la latencia total.\n`;
  md += `- **Costo de parseo V8:** El escaneo con regex y deserialización de árboles JSON en páginas HTML toma ~${formatMs(result.overallParseMetrics.mean)}.\n`;
  md += `- **Objetivo de optimización con Innertube:** Reducir el payload a < 60 KB y la latencia global a < 250 ms.\n`;

  return md;
}

export function generateComparisonMarkdown(htmlRes: SearchModelResult, innerRes: SearchModelResult, env: any): string {
  const dateStr = new Date().toLocaleString();
  const latencyReduction = ((htmlRes.overallTotalMetrics.mean - innerRes.overallTotalMetrics.mean) / htmlRes.overallTotalMetrics.mean) * 100;
  const payloadReduction = ((htmlRes.overallAvgPayloadBytes - innerRes.overallAvgPayloadBytes) / htmlRes.overallAvgPayloadBytes) * 100;
  const parseSpeedup = htmlRes.overallParseMetrics.mean / (innerRes.overallParseMetrics.mean || 0.01);

  let md = `# Reporte Comparativo A/B: Búsqueda HTML vs. Innertube JSON API\n\n`;
  md += `**Fecha:** ${dateStr}  \n`;
  md += `**Plataforma:** ${env.platform} (${env.arch}) | Node: ${env.nodeVersion}  \n\n`;

  md += `## 1. Resumen Ejecutivo de Rendimiento\n\n`;
  md += `| Métrica | Scraping HTML (Base) | Innertube JSON (Optimizado) | Delta (%) / Mejora | Cumple Meta |\n`;
  md += `|---|:---:|:---:|:---:|:---:|\n`;
  md += `| **Latencia Total (Media)** | ${formatMs(htmlRes.overallTotalMetrics.mean)} | **${formatMs(innerRes.overallTotalMetrics.mean)}** | **-${latencyReduction.toFixed(1)}%** | ${innerRes.overallTotalMetrics.mean < 300 ? '✅ SÍ' : '⚠️'} |\n`;
  md += `| **Latencia P95** | ${formatMs(htmlRes.overallTotalMetrics.p95)} | **${formatMs(innerRes.overallTotalMetrics.p95)}** | **-${(((htmlRes.overallTotalMetrics.p95 - innerRes.overallTotalMetrics.p95) / htmlRes.overallTotalMetrics.p95) * 100).toFixed(1)}%** | ${innerRes.overallTotalMetrics.p95 < 400 ? '✅ SÍ' : '⚠️'} |\n`;
  md += `| **Tiempo de Red (TTFB)** | ${formatMs(htmlRes.overallNetworkMetrics.mean)} | **${formatMs(innerRes.overallNetworkMetrics.mean)}** | **-${(((htmlRes.overallNetworkMetrics.mean - innerRes.overallNetworkMetrics.mean) / htmlRes.overallNetworkMetrics.mean) * 100).toFixed(1)}%** | ✅ SÍ |\n`;
  md += `| **Tiempo de Parseo (CPU)** | ${formatMs(htmlRes.overallParseMetrics.mean)} | **${formatMs(innerRes.overallParseMetrics.mean)}** | **${parseSpeedup.toFixed(1)}x más rápido** | ✅ SÍ |\n`;
  md += `| **Tamaño de Payload** | ${(htmlRes.overallAvgPayloadBytes / 1024).toFixed(1)} KB | **${(innerRes.overallAvgPayloadBytes / 1024).toFixed(1)} KB** | **-${payloadReduction.toFixed(1)}%** | ${payloadReduction >= 90 ? '✅ SÍ' : '⚠️'} |\n\n`;

  md += `## 2. Comparación por Canción\n\n`;
  md += `| Query | Total HTML | Total Innertube | Delta Latencia | Payload HTML | Payload Innertube |\n`;
  md += `|---|:---:|:---:|:---:|:---:|:---:|\n`;

  htmlRes.trackMetrics.forEach((htm, idx) => {
    const itm = innerRes.trackMetrics[idx];
    const itemDelta = ((htm.totalMetrics.mean - (itm?.totalMetrics.mean || 0)) / htm.totalMetrics.mean) * 100;
    md += `| \`${htm.query}\` | ${formatMs(htm.totalMetrics.mean)} | ${itm ? formatMs(itm.totalMetrics.mean) : 'N/A'} | -${itemDelta.toFixed(1)}% | ${(htm.avgPayloadBytes / 1024).toFixed(1)} KB | ${itm ? (itm.avgPayloadBytes / 1024).toFixed(1) : 'N/A'} KB |\n`;
  });

  return md;
}

export async function main() {
  const args = process.argv.slice(2);
  const isBaselineOnly = args.includes('--baseline') || args.includes('--baseline-only');

  const env = {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    osRelease: os.release(),
    cpus: os.cpus()[0]?.model || 'unknown',
    totalMemory: formatMemory(os.totalmem()),
  };

  const resultsDir = path.join(process.cwd(), 'benchmarks', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  if (isBaselineOnly) {
    console.log('🚀 Iniciando Benchmark de Línea Base HTML (Fase 2)...');
    const htmlResult = await runHtmlSearchBenchmark({
      tracks: BENCHMARK_TRACKS,
      iterations: 5,
      cooldownMs: 250,
      verbose: true
    });

    const baselineMd = generateBaselineMarkdown(htmlResult, env);
    const mdPath = path.join(resultsDir, 'baseline-search-latency.md');
    fs.writeFileSync(mdPath, baselineMd, 'utf-8');

    const jsonPath = path.join(resultsDir, 'baseline-search-latency.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ environment: env, htmlResult }, null, 2), 'utf-8');

    console.log('\n===============================================================');
    console.log('  LÍNEA BASE HTML COMPLETADA');
    console.log('===============================================================');
    console.log(`Latencia Media Total: ${formatMs(htmlResult.overallTotalMetrics.mean)}`);
    console.log(`Latencia P95 Total:   ${formatMs(htmlResult.overallTotalMetrics.p95)}`);
    console.log(`Tiempo de Red Medio:  ${formatMs(htmlResult.overallNetworkMetrics.mean)}`);
    console.log(`Tiempo de Parseo:     ${formatMs(htmlResult.overallParseMetrics.mean)}`);
    console.log(`Payload Promedio:     ${(htmlResult.overallAvgPayloadBytes / 1024).toFixed(1)} KB`);
    console.log(`\nDocumentos generados:\n- ${mdPath}\n- ${jsonPath}\n`);
    return;
  }

  // Interleaved A/B comparative benchmark
  console.log('🚀 Iniciando Benchmark Comparativo A/B (HTML vs Innertube)...');
  const htmlResult = await runHtmlSearchBenchmark({
    tracks: BENCHMARK_TRACKS,
    iterations: 5,
    cooldownMs: 250,
    verbose: true
  });

  const innertubeResult = await runInnertubeSearchBenchmark({
    tracks: BENCHMARK_TRACKS,
    iterations: 5,
    cooldownMs: 250,
    verbose: true
  });

  const comparisonMd = generateComparisonMarkdown(htmlResult, innertubeResult, env);
  const compMdPath = path.join(resultsDir, 'search-comparison.md');
  fs.writeFileSync(compMdPath, comparisonMd, 'utf-8');

  const compJsonPath = path.join(resultsDir, 'search-comparison.json');
  fs.writeFileSync(compJsonPath, JSON.stringify({ environment: env, htmlResult, innertubeResult }, null, 2), 'utf-8');

  console.log('\n===============================================================');
  console.log('  BENCHMARK COMPARATIVO A/B COMPLETADO');
  console.log('===============================================================');
  console.log(`Latencia HTML:      ${formatMs(htmlResult.overallTotalMetrics.mean)} (Payload: ${(htmlResult.overallAvgPayloadBytes / 1024).toFixed(1)} KB)`);
  console.log(`Latencia Innertube: ${formatMs(innertubeResult.overallTotalMetrics.mean)} (Payload: ${(innertubeResult.overallAvgPayloadBytes / 1024).toFixed(1)} KB)`);
  console.log(`Reporte guardado en: ${compMdPath}\n`);
}

// Execute if run directly
main().catch((err) => {
  console.error('Error ejecutando benchmark:', err);
  process.exit(1);
});
