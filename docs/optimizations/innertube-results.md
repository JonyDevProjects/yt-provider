# Resultados Oficiales de Optimización: Innertube JSON API vs. HTML Scraping

**Proyecto:** `yt-provider` (YouTube Provider para Nuclear)  
**Fecha de Evaluación:** 2026-08-24  
**Rama:** `feat/innertube-search-optimization`  
**Decisión:** ✅ **GO — Implementación Aprobada para Producción**

---

## 1. Resumen Ejecutivo de la Evaluación A/B

Se completó la batería de pruebas comparativas A/B intercaladas con 100 muestras reales sobre 10 pistas representativas en diferentes categorías (`short`, `standard`, `long`, `mix`), midiendo latencia total, tiempo de red (TTFB + descarga), tiempo de cómputo en parseo (V8 CPU) y volumen de datos transferidos.

| Métrica | Línea Base (HTML Scraping) | Motor Innertube JSON | Mejora / Delta | Impacto |
|---|:---:|:---:|:---:|:---|
| **Latencia Total (Media)** | `724.98 ms` | **`495.04 ms`** | **-31.7% (-230 ms)** | Percepción de búsqueda significativamente más rápida |
| **Latencia P95** | `880.63 ms` | **`624.06 ms`** | **-29.1% (-256 ms)** | Mayor consistencia en condiciones de red variables |
| **Tiempo de Red (TTFB + Tráfico)** | `715.68 ms` | **`491.38 ms`** | **-31.3%** | Menor overhead TLS/HTTP |
| **Tiempo de Parseo CPU (V8)** | `9.31 ms` | **`3.66 ms`** | **2.5x más rápido** | Cero regex pesado en threads de UI |
| **Tamaño de Payload Promedio** | `1,343.4 KB` | **`213.9 KB`** | **-84.1% (~1.1 MB menos)** | Ahorro drástico de ancho de banda |
| **Caché en Memoria (Hit Rate)** | N/A | **< 1.0 ms** | **Instantáneo** | Cero requests de red en consultas repetidas |

---

## 2. Detalle de Rendimiento por Canción

| # | Query | Tipo | HTML Latencia | Innertube Latencia | Reducción Latencia | HTML Payload | Innertube Payload |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `Queen - We Will Rock You` | short | 669.41 ms | **518.42 ms** | -22.6% | 1,298.8 KB | **234.0 KB** |
| 2 | `Rick Astley - Never Gonna Give You Up` | standard | 763.67 ms | **463.35 ms** | -39.3% | 1,338.2 KB | **232.0 KB** |
| 3 | `Radiohead - Creep` | standard | 652.97 ms | **436.58 ms** | -33.1% | 1,313.7 KB | **211.4 KB** |
| 4 | `PSY - Gangnam Style` | standard | 719.21 ms | **456.70 ms** | -36.5% | 1,303.5 KB | **231.6 KB** |
| 5 | `Luis Fonsi - Despacito ft. Daddy Yankee` | standard | 697.22 ms | **485.95 ms** | -30.3% | 1,308.5 KB | **234.1 KB** |
| 6 | `Queen - Bohemian Rhapsody` | standard | 757.17 ms | **492.28 ms** | -35.0% | 1,309.0 KB | **234.3 KB** |
| 7 | `Led Zeppelin - Stairway to Heaven` | long | 820.74 ms | **570.48 ms** | -30.5% | 1,314.4 KB | **234.1 KB** |
| 8 | `Dire Straits - Sultans Of Swing (Alchemy Live)` | long | 640.20 ms | **471.43 ms** | -26.4% | 1,314.9 KB | **178.6 KB** |
| 9 | `Pink Floyd - Echoes (Live at Pompeii)` | long | 739.76 ms | **468.69 ms** | -36.6% | 1,322.5 KB | **187.1 KB** |
| 10 | `Lofi Girl - Study Mix` | mix | 789.50 ms | **586.55 ms** | -25.7% | 1,610.8 KB | **161.5 KB** |

---

## 3. Arquitectura de Resiliencia Validada

El flujo de búsqueda unificado implementa una estrategia de **3 niveles de fallback invisible**:
1. **Nivel 1:** Innertube JSON API (`POST https://music.youtube.com/youtubei/v1/search`) — ~490 ms en frío, 214 KB.
2. **Nivel 2:** HTML Scraper clásico (`GET https://www.youtube.com/results`) — ~725 ms, 1.34 MB.
3. **Nivel 3:** `api.Ytdlp.search()` — Fallback a binario yt-dlp vía Rust Tauri IPC en Nuclear.

Adicionalmente, el **Caché LRU en RAM** (`50 entradas`, `TTL = 5 min`) garantiza que cualquier búsqueda repetida dentro de la sesión de Nuclear responda en `< 1 ms` sin consumir cuota ni conexiones de red.

---

## 4. Decisión de Go / No-Go

* **Criterio de Red:** ✅ Superado con -84.1% de transferencia de red.
* **Criterio de CPU:** ✅ 2.5x más veloz en parseo sin expresiones regulares complejas.
* **Criterio de Resiliencia:** ✅ 100% de fallback probado ante errores de red y formatos variables.
* **Criterio de Dependencias:** ✅ Zero nuevas dependencias añadidas a `package.json`.
* **Criterio de Testing:** ✅ 41/41 tests unitarios pasando con 100% cobertura en `innertubeScraper.ts` y 95.85% en `ytScraper.ts`.

**Dictamen:** **GO (Aprobado para despliegue y empaquetado en Nuclear Store)**.
