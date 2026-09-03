# Línea Base Oficial: Latencia de Búsqueda HTML (Scraping www.youtube.com)

**Fecha:** 8/24/2026, 12:48:46 AM  
**Plataforma:** darwin (arm64) | Node: v24.15.0 | CPU: Apple M1 Pro  
**Metodología:** 5 iteraciones por query sobre 10 canciones (50 muestras totales)  

## 1. Resumen Global de Métricas (Línea Base HTML)

| Métrica | Media | Mediana (p50) | p95 | p99 | Min | Max | StdDev |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Latencia Total** | **786.91 ms** | 697.18 ms | 1.23 s | 1.44 s | 577.60 ms | 1.46 s | ±220.00 ms |
| **Red (TTFB + Descarga)** | **776.64 ms** | 683.17 ms | 1.23 s | 1.42 s | 560.69 ms | 1.42 s | ±219.21 ms |
| **Parseo (Regex ytInitialData)** | **10.26 ms** | 7.28 ms | 23.82 ms | 29.14 ms | 4.32 ms | 31.64 ms | ±6.26 ms |
| **Tamaño de Payload** | **1345.3 KB** | — | — | — | — | — | — |

## 2. Detalle por Canción

| # | Query | Categoría | Latencia Total Media | Red Media | Parse Media | Payload (KB) |
|---|---|:---:|:---:|:---:|:---:|:---:|
| 1 | `Queen - We Will Rock You` | `short` | 636.06 ms | 626.94 ms | 9.12 ms | 1291.1 KB |
| 2 | `Rick Astley - Never Gonna Give You Up` | `standard` | 871.84 ms | 863.45 ms | 8.39 ms | 1324.0 KB |
| 3 | `Radiohead - Creep` | `standard` | 980.53 ms | 968.03 ms | 12.50 ms | 1313.5 KB |
| 4 | `PSY - Gangnam Style` | `standard` | 726.51 ms | 718.24 ms | 8.27 ms | 1298.8 KB |
| 5 | `Luis Fonsi - Despacito ft. Daddy Yankee` | `standard` | 739.97 ms | 730.28 ms | 9.69 ms | 1305.8 KB |
| 6 | `Queen - Bohemian Rhapsody` | `standard` | 698.16 ms | 691.71 ms | 6.45 ms | 1313.8 KB |
| 7 | `Led Zeppelin - Stairway to Heaven` | `long` | 824.57 ms | 811.57 ms | 13.01 ms | 1309.0 KB |
| 8 | `Dire Straits - Sultans Of Swing (Alchemy Live)` | `long` | 792.79 ms | 782.24 ms | 10.55 ms | 1317.4 KB |
| 9 | `Pink Floyd - Echoes (Live at Pompeii)` | `long` | 794.57 ms | 780.56 ms | 14.01 ms | 1318.4 KB |
| 10 | `Lofi Girl / Chillhop - Lofi Hip Hop Chill Beats - Study Mix` | `mix` | 804.08 ms | 793.44 ms | 10.64 ms | 1661.0 KB |

## 3. Observaciones Clave

- **Cuello de botella principal:** Transferencia de red (~1345 KB de HTML por búsqueda) representando > 95% de la latencia total.
- **Costo de parseo V8:** El escaneo con regex y deserialización de árboles JSON en páginas HTML toma ~10.26 ms.
- **Objetivo de optimización con Innertube:** Reducir el payload a < 60 KB y la latencia global a < 250 ms.
