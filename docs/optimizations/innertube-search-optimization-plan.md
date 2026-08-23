# Plan de Optimización de Búsqueda: YouTube Innertube JSON API vs. HTML Scraping

**Proyecto:** `yt-provider` (YouTube Provider para Nuclear)  
**Fecha:** 2026-08-23  
**Estado:** 📋 Especificación y Plan de Medición  
**Objetivo:** Reducir la latencia de búsqueda de metadatos de **~760 ms** a **~150–250 ms** y disminuir el volumen de transferencia de red en un **~97%** mediante la adopción de la API interna JSON de YouTube (Innertube `WEB_REMIX`), manteniendo compatibilidad total con el SDK de Nuclear y alta disponibilidad con fallback automático.

---

## 1. Resumen Ejecutivo y Diagnóstico

### Estado Actual (Línea Base: Scraping HTML)
En la versión actual (`v1.0.0`), el plugin resuelve las búsquedas mediante scraping de la página web de resultados de YouTube:
* **Endpoint consultado:** `GET https://www.youtube.com/results?search_query=<query>`
* **Mecanismo de extracción:** Descarga del HTML completo, búsqueda de la variable JavaScript `ytInitialData` mediante expresiones regulares, parseo JSON de ese sub-árbol y navegación de nodos `itemSectionRenderer`.
* **Rendimiento actual:**
  * **Tamaño del Payload:** ~1.5 MB – 2.0 MB de HTML, scripts embebidos y layouts CSS por cada búsqueda.
  * **Latencia media observada:** **~760 ms** (I/O de red + procesamiento en V8).
  * **Overhead de CPU:** Escaneo de regex sobre buffers de texto de 2 MB y parseo de árboles de layout complejos.

### Propuesta de Optimización (Innertube JSON API)
Adoptar el endpoint interno que utiliza el cliente oficial de YouTube Music Web (`WEB_REMIX`):
* **Endpoint propuesto:** `POST https://music.youtube.com/youtubei/v1/search`
* **Mecanismo de extracción:** Envío de payload JSON minimalista y recepción directa de un payload JSON estructurado de metadatos de audio.
* **Beneficios esperados:**
  * **Tamaño del Payload:** **~30 KB – 60 KB** (reducción del **~97%** en tráfico de red).
  * **Latencia estimada:** **150 ms – 250 ms** (aceleración estimada de **3x a 4x**).
  * **Eficiencia de CPU:** Parseo directo con `JSON.parse()` sin expresiones regulares sobre megabytes de HTML.
  * **Calidad de Metadatos:** Metadatos nativamente clasificados por artista, álbum, duración exacta y thumbnails de alta resolución.

---

## 2. Arquitectura de la Solución Propuesta

```
                                  ┌────────────────────────────────┐
                                  │   Nuclear Search / Track Query │
                                  └───────────────┬────────────────┘
                                                  │
                                                  ▼
                                    ┌───────────────────────────┐
                                    │    ytScraper.search()     │
                                    └─────────────┬─────────────┘
                                                  │
                    ┌─────────────────────────────┴─────────────────────────────┐
                    │                                                           │
                    ▼                                                           ▼
       [Vía Primaria (Alta Velocidad)]                             [Vía Secundaria (Fallback)]
       • POST /youtubei/v1/search                                  • GET /results (HTML Scraper)
       • Payload JSON: ~40 KB                                      • Payload HTML: ~1.8 MB
       • Latencia: ~200 ms                                         • Latencia: ~760 ms
       • Client: WEB_REMIX                                         • Regex ytInitialData
                    │                                                           │
                    └─────────────────────────────┬─────────────────────────────┘
                                                  │
                                                  ▼
                                    ┌───────────────────────────┐
                                    │      SearchResult[]       │
                                    │ (id, title, duration, etc)│
                                    └───────────────────────────┘
```

### Especificación de la Petición Innertube

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

---

## 3. Protocolo de Benchmarking y Medición

Para validar empíricamente la mejora antes de adoptar el cambio de forma definitiva, se establece un arnés de pruebas automatizado (`benchmarks/search-benchmark.ts`).

### 3.1. Métricas Objetivo

| Métrica | Definición | Método Actual (HTML) | Meta Innertube | Unidad |
|---|---|:---:|:---:|:---:|
| **Payload Size** | Volumen de bytes transferidos por la red | ~1,850 KB | **< 60 KB** | `KB` |
| **Parsing Time (CPU)** | Tiempo de V8 en extraer y mapear resultados | ~18 ms | **< 2 ms** | `ms` |
| **Network TTFB** | Tiempo hasta recibir el primer byte | ~680 ms | **< 190 ms** | `ms` |
| **Latencia Total (Media)** | Tiempo total de ejecución de la búsqueda | ~760 ms | **< 220 ms** | `ms` |
| **Latencia P95** | Percentil 95 de latencia en condiciones variables | ~980 ms | **< 320 ms** | `ms` |

### 3.2. Batería de Pruebas (Test Suite)

Se utilizará una matriz balanceada de 10 consultas representativas:

1. `Queen - Bohemian Rhapsody` (Clásico con metadatos extensos)
2. `Radiohead - Creep` (Track estándar)
3. `Rick Astley - Never Gonna Give You Up` (CDN de altísima demanda)
4. `Daft Punk - Around the World` (Música electrónica / Beats repetitivos)
5. `Rosalía - DESPECHÁ` (Caracteres especiales y acentos en español)
6. `Miles Davis - Kind of Blue` (Jazz / Álbumes)
7. `Ludwig van Beethoven - Symphony No. 9` (Música clásica / Títulos largos)
8. `Bizarrap - Shakira Music Sessions 53` (Pop / Trending actual)
9. `Pink Floyd - Echoes` (Pista de larga duración)
10. `Lofi Girl - Chill Beats` (Streams / Mixes continuos)

### 3.3. Metodología de Ejecución

* **Calentamiento (Warmup):** 1 ronda descartada para estabilizar DNS, TLS y JIT de V8.
* **Iteraciones:** 5 ejecuciones consecutivas por cada una de las 10 canciones (**50 muestras por método**, 100 peticiones en total).
* **Control de Variabilidad:** Medición intercalada (Run 1 HTML, Run 1 Innertube, Run 2 HTML, Run 2 Innertube) para anular fluctuaciones temporales de la conexión de red del ISP.

---

## 4. Plan Detallado de Implementación por Fases

### 🔹 Fase 1: Arnés de Benchmarking y Medición de Línea Base
1. Crear el script `benchmarks/search-benchmark.ts`.
2. Ejecutar la medición sobre la implementación HTML actual (`scrapeYoutubeHtml`).
3. Registrar la línea base oficial en `benchmarks/results/baseline-search-latency.md`.

### 🔹 Fase 2: Implementación del Motor Innertube JSON
1. Crear `src/core/innertubeScraper.ts` con la función `searchInnertube(http, query, limit)`.
2. Implementar el parser JSON de respuestas `musicShelfRenderer` / `itemSectionRenderer`.
3. Crear tests unitarios en `tests/core/innertubeScraper.test.ts` con fixtures mockeados para garantizar cobertura del 100%.

### 🔹 Fase 3: Ejecución del Benchmark Comparativo A/B
1. Ejecutar el arnés comparativo `npm run benchmark:search`.
2. Recopilar métricas de latencia Media, Mediana (P50), P95, CPU Parsing y Payload Size.
3. Generar el informe comparativo consolidado en `benchmarks/results/search-latency-comparison.md`.

### 🔹 Fase 4: Integración en el Core del Plugin con Fallback
1. Actualizar `src/core/ytScraper.ts` para que intente prioritariamente `searchInnertube` y, ante cualquier error de red o cambio de esquema, recurra automáticamente a `scrapeYoutubeHtml`.
2. Validar que la suite de pruebas unitarias (`npm test`) y empaquetado (`npm run package`) pasen al 100%.

### 🔹 Fase 5: Verificación Manual en Nuclear Desktop
1. Probar el plugin compilado dentro de Nuclear Desktop (`pnpm tauri dev`).
2. Medir con DevTools (`Cmd + Option + I`) la latencia percibida en la barra de búsqueda en tiempo real.
3. Confirmar que la UI muestra los resultados instantáneamente sin artefactos ni parpadeos.

---

## 5. Criterios de Aceptación y Análisis de Riesgos

### Criterios de Éxito
* ✅ **Reducción de Latencia:** Disminución de al menos un **50%** en la latencia promedio de búsqueda.
* ✅ **Reducción de Ancho de Banda:** Disminución de al menos un **90%** en el tamaño del payload transferido.
* ✅ **Zero Dependencias Externas:** Mantener el bundle CommonJS en **< 12 KB** sin librerías pesadas en runtime.
* ✅ **Resiliencia 100%:** Ante cualquier falla en el endpoint de YouTube Music, el plugin debe responder usando el scraper HTML sin interrumpir la experiencia del usuario.

### Análisis de Riesgos y Mitigación

| Riesgo Identificado | Impacto | Estrategia de Mitigación |
|---|:---:|---|
| **Cambio de formato en respuesta JSON de YouTube Music** | Medio | Fallback automático y transparente al scraper HTML tradicional (`scrapeYoutubeHtml`). |
| **Bloqueos por User-Agent / Headers en Tauri** | Bajo | Uso de User-Agent moderno estándar de Chrome/macOS y headers homogéneos compatibles con `reqwest`. |
| **Búsquedas de videos no musicales** | Bajo | La API de YouTube Music indexa todo el catálogo de YouTube, pero si una consulta no musical requiere YouTube estándar, el fallback lo cubre. |

