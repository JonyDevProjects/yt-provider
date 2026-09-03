# Plan de Optimización de Búsqueda: YouTube Innertube JSON API vs. HTML Scraping

**Proyecto:** `yt-provider` (YouTube Provider para Nuclear)
**Fecha:** 2026-08-23 | **Refinado:** 2026-08-24
**Rama:** `feat/innertube-search-optimization`
**Estado:** 📋 Plan Refinado — Listo para Ejecución

**Objetivo:** Reducir la latencia de búsqueda de metadatos de **~760 ms** a **~150–250 ms** y disminuir el volumen de transferencia de red en un **~97%** mediante la adopción de la API interna JSON de YouTube (Innertube `WEB_REMIX`), manteniendo compatibilidad total con el SDK de Nuclear y alta disponibilidad con fallback automático.

---

## 1. Diagnóstico y Gap Analysis vs. Codebase Actual

### 1.1. Estado Actual (Línea Base: Scraping HTML)

El scraper actual (`src/core/ytScraper.ts`) resuelve búsquedas mediante scraping de la página web de resultados de YouTube:

* **Endpoint:** `GET https://www.youtube.com/results?search_query=<query>`
* **Extracción:** Regex sobre `ytInitialData` → parseo JSON → navegación de `itemSectionRenderer.contents[].videoRenderer`
* **Rendimiento observado:**
  * Payload: ~1.5–2.0 MB de HTML + scripts + CSS
  * Latencia media: **~760 ms** (I/O red + parsing V8)
  * CPU: Escaneo regex sobre ~2 MB + parseo de árboles de layout

### 1.2. gaps Técnicos Identificados en el Plan Original

| # | Gap | Impacto | Solución Requerida |
|---|-----|---------|-------------------|
| G1 | **`HttpLike` no soporta POST con body** — El interfaz actual solo acepta `headers` y `method` en `fetch()`, sin parámetro `body`. Innertube requiere `POST` con JSON body. | **BLOCKER** | Extender `HttpLike` para aceptar `body?: string` en las opciones de fetch. |
| G2 | **El benchmark existente mide stream resolution, NO search** — `benchmarks/runner.ts` mide latencia de resolución de streams (Fase 3.2), no de búsqueda. | Confusión | Crear un benchmark de búsqueda separado que reutilice `benchmarks/metrics.ts`. |
| G3 | **El plan no especifica la ruta JSON de la respuesta Innertube** — Menciona `musicShelfRenderer` / `itemSectionRenderer` vagamente. | Ambigüedad | Definir la ruta exacta de extracción con ejemplo de respuesta real. |
| G4 | **No se menciona `yt-search`** — Está en `package.json` como dependencia runtime. | Limpieza | Evaluar si se mantiene como fallback profundo o se elimina. |
| G5 | **El plan no aprovecha el patrón `fallbackFn` existente** — `scrapeYoutube()` ya acepta un `fallbackFn` como 4to parámetro. | Redundancia | Encadenar Innertube → HTML → Ytdlp usando el mecanismo existente. |
| G6 | **El plan no define la cadena de fallback completa** — `index.ts` ya tiene: HTML → Ytdlp (Nuclear SDK). | Arquitectura | Definir: Innertube → HTML → Ytdlp como cadena de 3 niveles. |
| G7 | **Sin mención de rate limiting o caching** — Búsquedas repetidas golpean el mismo endpoint. | Performance | Agregar cache LRUsimple en memoria para queries recientes. |

---

## 2. Arquitectura de la Solución

### 2.1. Cadena de Fallback (3 niveles)

```
                     ┌─────────────────────────────┐
                     │   Nuclear Search / Track     │
                     └──────────────┬──────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │     searchUnified()         │
                     │  (orchestrator en index.ts) │
                     └──────────────┬──────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
   [Nivel 1: Innertube]    [Nivel 2: HTML]      [Nivel 3: Ytdlp]
   POST /youtubei/v1/search GET /results         api.Ytdlp.search()
   JSON ~40 KB              HTML ~1.8 MB         SDK Nuclear
   ~200 ms                  ~760 ms              ~1200 ms
   WEB_REMIX client         Regex ytInitialData  yt-dlp nativo
              │                     │                     │
              └─────────────────────┴─────────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │      SearchResult[]         │
                     └─────────────────────────────┘
```

**Regla de fallback:** Si un nivel falla (error de red, respuesta malformada, status != 200), se intenta el siguiente nivel silenciosamente. El usuario nunca ve el error interno.

### 2.2. Extensión del Interfaz `HttpLike`

**Archivo:** `src/core/types.ts`

```typescript
export interface HttpLike {
  fetch(url: string, init?: {
    headers?: Record<string, string>;
    method?: string;
    body?: string;          // ← NUEVO: necesario para POST con JSON body
  }): Promise<HttpLikeResponse>;
}
```

**Justificación:** El adapter en `index.ts` (`createHttpAdapter`) ya delega a `api.Http.fetch()`. El SDK de Nuclear soporta body en peticiones HTTP. Solo necesitamos expender la interfaz interna del Core para que sea compatible.

### 2.3. Especificación de la Petición Innertube

```http
POST https://music.youtube.com/youtubei/v1/search?prettyPrint=false
Content-Type: application/json
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36

{
  "context": {
    "client": {
      "clientName": "WEB_REMIX",
      "clientVersion": "1.20240101.01.00",
      "hl": "en",
      "gl": "US"
    }
  },
  "query": "Radiohead - Creep"
}
```

### 2.4. Ruta de Extracción de la Respuesta Innertube

La respuesta JSON de Innertube tiene esta estructura de navegación:

```
response.contents
  .sectionListRenderer.contents[]
    [.musicShelfRenderer.contents[]          ← resultados musicales (prioridad)
      [.musicResponsiveListItemRenderer
        .flexColumns[]
          [0].musicResponsiveListItemFlexColumnRenderer.text.runs[0].text  ← título
          [1].musicResponsiveListItemFlexColumnRenderer.text.runs[0].text  ← artista
        .thumbnail.musicThumbnailRenderer.thumbnails[].url                 ← thumbnail
        .overlay.musicItemThumbnailOverlayRenderer.content
          .musicThumbnailOverlayTimeStatusRenderer.text.simpleText         ← duración
    ]]
    [.itemSectionRenderer.contents[]         ← resultados genéricos (fallback interno)
      [.videoRenderer
        .videoId                                                                ← id
        .title.runs[0].text                                                     ← título
        .lengthText.simpleText                                                   ← duración
        .thumbnail.thumbnails[].url                                              ← thumbnail
        .ownerText.runs[0].text                                                  ← canal
    ]]
```

**Estrategia de extracción:**
1. Primero intentar `musicShelfRenderer` (resultados nativos de YouTube Music — más precisos para audio)
2. Si no hay resultados, caer a `itemSectionRenderer` (videos genéricos de YouTube)
3. Mapear a `SearchResult[]` usando la interfaz existente

### 2.5. Cache en Memoria

```typescript
// Cache LRU simple para queries recientes (evita requests duplicados)
const searchCache = new Map<string, { results: SearchResult[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const CACHE_MAX_ENTRIES = 50;
```

**Justificación:** En el contexto de Nuclear, el usuario busca un track y el plugin resuelve múltiples candidatos. Búsquedas repetidas del mismo query (o muy similares) no deben golpear la red.

---

## 3. Protocolo de Benchmarking y Medición

### 3.1. Separación de Concerns

El benchmark de búsqueda es **independiente** del benchmark de stream resolution existente (`benchmarks/runner.ts`). Se reutiliza `benchmarks/metrics.ts` (cálculo de percentiles, formateo) pero se crea un runner separado.

### 3.2. Métricas Objetivo

| Métrica | Definición | Método Actual (HTML) | Meta Innertube | Unidad |
|---|---|:---:|:---:|:---:|
| **Payload Size** | Volumen de bytes transferidos | ~1,850 KB | **< 60 KB** | `KB` |
| **Parsing Time (CPU)** | Tiempo de V8 en extraer y mapear resultados | ~18 ms | **< 2 ms** | `ms` |
| **Network TTFB** | Tiempo hasta recibir el primer byte | ~680 ms | **< 190 ms** | `ms` |
| **Latencia Total (Media)** | Tiempo total de ejecución | ~760 ms | **< 220 ms** | `ms` |
| **Latencia P95** | Percentil 95 | ~980 ms | **< 320 ms** | `ms` |

### 3.3. Batería de Pruebas

Se reutilizan tracks de `benchmarks/tracks.ts` (ya existen 10 tracks categorizados). Las queries se construyen como `${artist} - ${title}`:

| # | Query | Categoría | Justificación |
|---|-------|-----------|---------------|
| 1 | Queen - Bohemian Rhapsody | standard | Clásico con metadatos extensos |
| 2 | Radiohead - Creep | standard | Track estándar |
| 3 | Rick Astley - Never Gonna Give You Up | standard | CDN de altísima demanda |
| 4 | Daft Punk - Around the World | standard | Electrónica / beats repetitivos |
| 5 | Rosalía - DESPECHÁ | standard | Acentos y caracteres especiales |
| 6 | Miles Davis - Kind of Blue | standard | Jazz / álbumes |
| 7 | Ludwig van Beethoven - Symphony No. 9 | long | Clásica / títulos largos |
| 8 | Bizarrap - Shakira Music Sessions 53 | standard | Pop trending |
| 9 | Pink Floyd - Echoes | long | Pista larga (~16 min) |
| 10 | Lofi Girl - Chill Beats | mix | Streams / mixes continuos |

### 3.4. Metodología

* **Warmup:** 1 ronda descartada (estabilizar DNS, TLS, JIT)
* **Iteraciones:** 5 ejecuciones por query × 10 queries = **50 muestras por método**
* **Control:** Medición intercalada (HTML, Innertube, HTML, Innertube...) para anular fluctuaciones ISP
* **Salida:** JSON en `benchmarks/results/search-latency-{timestamp}.md` + `report-latest.md`

### 3.5. Scripts

```
benchmarks/
  search/
    runner.ts              ← Runner principal (nuevo)
    model-html.ts          ← Modelo HTML (adaptado de model-api.ts)
    model-innertube.ts     ← Modelo Innertube (nuevo)
    tracks.ts              ← Re-exporta de benchmarks/tracks.ts
  metrics.ts               ← Reutilizado (sin cambios)
  tracks.ts                ← Reutilizado (sin cambios)
```

**Script npm:** `"benchmark:search": "tsx benchmarks/search/runner.ts"`

---

## 4. Plan Detallado de Implementación por Fases

### 🔹 Fase 1: Extensión del Core y Arnés de Benchmarking

**Objetivo:** Preparar la infraestructura técnica y el arnés de medición.

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| T1.1 | `src/core/types.ts` | Agregar `body?: string` a las opciones de `HttpLike.fetch()` |
| T1.2 | `src/core/innertubeScraper.ts` | Crear con `searchInnertube(http, query, limit)` — POST a Innertube, parseo de respuesta, mapeo a `SearchResult[]` |
| T1.3 | `benchmarks/search/model-html.ts` | Adaptar medición de latencia de búsqueda HTML (reutilizar lógica de `model-api.ts`) |
| T1.4 | `benchmarks/search/model-innertube.ts` | Implementar medición de latencia de búsqueda Innertube |
| T1.5 | `benchmarks/search/runner.ts` | Runner comparativo A/B con control intercalado y generación de reporte |
| T1.6 | `package.json` | Agregar script `"benchmark:search"` |

**Criterio de salida:** `npm run benchmark:search` ejecuta ambas mediciones y genera reporte.

### 🔹 Fase 2: Benchmark de Línea Base (HTML Actual)

**Objetivo:** Capturar métricas de la implementación actual antes de cambiar nada.

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| T2.1 | `benchmarks/search/runner.ts` | Ejecutar solo el modelo HTML contra las 10 queries |
| T2.2 | `benchmarks/results/baseline-search-latency.md` | Registrar línea base oficial |

**Criterio de salida:** Documento `baseline-search-latency.md` con métricas completas.

### 🔹 Fase 3: Implementación del Motor Innertube

**Objetivo:** Implementar el scraper Innertube con parsing completo y tests.

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| T3.1 | `src/core/innertubeScraper.ts` | Completar parsing de `musicShelfRenderer` y `itemSectionRenderer` |
| T3.2 | `tests/core/innertubeScraper.test.ts` | Tests unitarios con fixtures JSON reales mockeados (no HTTP real) |
| T3.3 | `tests/core/innertubeScraper.test.ts` | Tests de edge cases: respuesta vacía, formato inesperado, rate limit (429) |

**Fixtures de test (en `tests/fixtures/`):**
* `innertube-response-normal.json` — Respuesta exitosa con `musicShelfRenderer`
* `innertube-response-fallback-section.json` — Respuesta con solo `itemSectionRenderer`
* `innertube-response-empty.json` — Respuesta sin resultados
* `innertube-response-error.json` — Respuesta con error/rate limit

**Criterio de salida:** `npm test` pasa al 100%, cobertura de `innertubeScraper.ts` ≥ 90%.

### 🔹 Fase 4: Integración en el Core con Fallback

**Objetivo:** Integrar Innertube como vía primaria en la cadena de búsqueda.

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| T4.1 | `src/core/ytScraper.ts` | Crear `searchUnified(http, query, limit)` que encadene: Innertube → HTML → fallbackFn |
| T4.2 | `src/index.ts` | Actualizar `scrapeYoutube()` para usar `searchUnified` como入口, pasando `api.Ytdlp.search` como fallback profundo |
| T4.3 | `src/index.ts` | Agregar cache LRU en `searchUnified` (Map con TTL de 5 min, max 50 entries) |
| T4.4 | `tests/core/ytScraper.test.ts` | Tests para la cadena de fallback: mockear cada nivel y verificar que se salta al siguiente |
| T4.5 | `tests/core/ytScraper.test.ts` | Tests de cache: verificar que queries repetidas no re-executan la búsqueda |

**Criterio de salida:** `npm test` pasa al 100%, `npm run build` exitoso.

### 🔹 Fase 5: Benchmark Comparativo A/B

**Objetivo:** Medir la mejora real antes de considerar la feature completa.

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| T5.1 | `benchmarks/search/runner.ts` | Ejecutar benchmark completo: HTML vs Innertube |
| T5.2 | `benchmarks/results/search-comparison.md` | Generar reporte comparativo consolidado |
| T5.3 | `docs/optimizations/innertube-results.md` | Documentar resultados y decisión de go/no-go |

**Criterio de salida:** Latencia Innertube < 220 ms media, payload < 60 KB.

### 🔹 Fase 6: Verificación Manual en Nuclear

**Objetivo:** Validar que el plugin funciona correctamente en el host real.

| Tarea | Descripción |
|-------|-------------|
| T6.1 | Compilar plugin: `npm run build && npm run package` |
| T6.2 | Verificar en Nuclear Desktop: `pnpm tauri dev` |
| T6.3 | Medir con DevTools (`Cmd + Option + I`) la latencia percibida en búsqueda |
| T6.4 | Confirmar que la UI muestra resultados sin artefactos ni parpadeos |
| T6.5 | Probar fallback: simular bloqueo de `music.youtube.com` y verificar que HTML responde |

**Criterio de salida:** Búsqueda funcional en Nuclear, latencia percibida < 300 ms.

---

## 5. Criterios de Aceptación

### Éxito Técnico
* ✅ **Reducción de Latencia:** ≥ 50% de reducción en latencia promedio de búsqueda
* ✅ **Reducción de Ancho de Banda:** ≥ 90% de reducción en payload transferido
* ✅ **Zero Dependencias Nuevas:** No agregar librerías externas; solo código propio
* ✅ **Resiliencia 100%:** Ante cualquier falla de Innertube, el plugin responde vía HTML o Ytdlp
* ✅ **Tests:** Suite completa pasando, cobertura ≥ 90% en nuevos módulos
* ✅ **Bundle:** Mantener `dist/index.js` < 15 KB (estimado actual ~10 KB)

### Éxito de Producto
* ✅ El usuario percibe resultados "instantáneos" en la barra de búsqueda
* ✅ No hay regressions en la funcionalidad existente de streaming/playlists
* ✅ El fallback es invisible: el usuario nunca ve errores de red internos

---

## 6. Análisis de Riesgos y Mitigación

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|:-------:|:------------:|------------|
| YouTube cambia el formato JSON de Innertube | Medio | Baja | Fallback automático a HTML. El parsing usa optional chaining y validación estricta. |
| Rate limiting (429) por requests frecuentes | Alto | Media | Cache LRU con TTL. Headers con User-Agent estándar de Chrome. Backoff exponencial opcional. |
| `music.youtube.com` bloquea requests desde Tauri | Medio | Baja | User-Agent moderno. Si falla, fallback a `youtube.com` HTML. |
| Búsquedas no musicales devuelven pobres resultados en Innertube | Bajo | Media | El fallback a HTML cubre queries no musicales. Innertube indexa todo YouTube. |
| Breaking change en `HttpLike` afecta tests existentes | Bajo | Baja | El cambio es additive (`body?: string`). Tests existentes no envían body, no se rompen. |

---

## 7. Archivos Afectados (Resumen)

### Nuevos
* `src/core/innertubeScraper.ts` — Motor de búsqueda Innertube
* `tests/core/innertubeScraper.test.ts` — Tests unitarios
* `tests/fixtures/innertube-*.json` — Fixtures de respuesta mock
* `benchmarks/search/runner.ts` — Runner de benchmark de búsqueda
* `benchmarks/search/model-html.ts` — Modelo HTML para benchmark
* `benchmarks/search/model-innertube.ts` — Modelo Innertube para benchmark
* `benchmarks/results/baseline-search-latency.md` — Línea base
* `benchmarks/results/search-comparison.md` — Comparativa A/B

### Modificados
* `src/core/types.ts` — Extender `HttpLike` con `body`
* `src/core/ytScraper.ts` — Agregar `searchUnified()` con cadena de fallback + cache
* `src/index.ts` — Integrar `searchUnified` en el pipeline de búsqueda
* `tests/core/ytScraper.test.ts` — Tests de fallback y cache
* `package.json` — Script `benchmark:search`

### Sin cambios
* `benchmarks/runner.ts` — Benchmark de stream resolution (intocable)
* `benchmarks/metrics.ts` — Reutilizado tal cual
* `benchmarks/tracks.ts` — Reutilizado tal cual

---

## 8. Dependencias y Orden de Ejecución

```
Fase 1 (Core + Harness)
  │
  ├──→ Fase 2 (Baseline HTML)  ──┐
  │                               │
  └──→ Fase 3 (Innertube impl) ──┼──→ Fase 4 (Integración)
                                  │         │
                                  └─────────┘
                                            │
                                      Fase 5 (Benchmark A/B)
                                            │
                                      Fase 6 (Verificación Nuclear)
```

* Fase 2 y F3 pueden ejecutarse en paralelo (no dependen una de otra)
* Fase 4 requiere F1 + F3 completados
* Fase 5 requiere F2 + F4 completados
* Fase 6 requiere F5 completado
