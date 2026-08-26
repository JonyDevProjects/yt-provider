# Reporte Comparativo A/B: Búsqueda HTML vs. Innertube JSON API

**Fecha:** 8/25/2026, 1:42:28 PM  
**Plataforma:** darwin (arm64) | Node: v24.15.0  

## 1. Resumen Ejecutivo de Rendimiento

| Métrica | Scraping HTML (Base) | Innertube JSON (Optimizado) | Delta (%) / Mejora | Cumple Meta |
|---|:---:|:---:|:---:|:---:|
| **Latencia Total (Media)** | 962.17 ms | **824.68 ms** | **-14.3%** | ⚠️ |
| **Latencia P95** | 1.28 s | **1.39 s** | **--8.5%** | ⚠️ |
| **Tiempo de Red (TTFB)** | 953.22 ms | **821.50 ms** | **-13.8%** | ✅ SÍ |
| **Tiempo de Parseo (CPU)** | 8.95 ms | **3.18 ms** | **2.8x más rápido** | ✅ SÍ |
| **Tamaño de Payload** | 1332.2 KB | **214.8 KB** | **-83.9%** | ⚠️ |

## 2. Comparación por Canción

| Query | Total HTML | Total Innertube | Delta Latencia | Payload HTML | Payload Innertube |
|---|:---:|:---:|:---:|:---:|:---:|
| `Queen - We Will Rock You` | 997.47 ms | 763.64 ms | -23.4% | 1318.1 KB | 234.5 KB |
| `Rick Astley - Never Gonna Give You Up` | 962.70 ms | 769.64 ms | -20.1% | 1336.3 KB | 234.9 KB |
| `Radiohead - Creep` | 960.10 ms | 647.51 ms | -32.6% | 1310.9 KB | 211.3 KB |
| `PSY - Gangnam Style` | 1.04 s | 858.60 ms | -17.2% | 1270.8 KB | 229.9 KB |
| `Luis Fonsi - Despacito ft. Daddy Yankee` | 899.90 ms | 907.09 ms | --0.8% | 1308.2 KB | 234.2 KB |
| `Queen - Bohemian Rhapsody` | 1.06 s | 816.90 ms | -23.0% | 1308.1 KB | 234.1 KB |
| `Led Zeppelin - Stairway to Heaven` | 942.44 ms | 741.98 ms | -21.3% | 1306.9 KB | 235.1 KB |
| `Dire Straits - Sultans Of Swing (Alchemy Live)` | 914.42 ms | 795.09 ms | -13.0% | 1321.1 KB | 178.6 KB |
| `Pink Floyd - Echoes (Live at Pompeii)` | 913.30 ms | 801.98 ms | -12.2% | 1318.9 KB | 186.7 KB |
| `Lofi Girl / Chillhop - Lofi Hip Hop Chill Beats - Study Mix` | 933.63 ms | 1.14 s | --22.6% | 1522.6 KB | 169.1 KB |
