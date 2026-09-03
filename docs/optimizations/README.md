# Plan de Optimización de Rendimiento: yt-provider

**Estado**: 📋 Especificación y Plan de Benchmarking Activo  
**Objetivo**: Implementar, comparar mediante benchmarks reproducibles y adoptar la optimización de búsqueda mediante Innertube JSON API para minimizar la latencia y el ancho de banda dentro del sandbox de Nuclear sin modificar el backend Rust de Nuclear.

---

## 1. Documentos del Plan

- **[innertube-search-optimization-plan.md](./innertube-search-optimization-plan.md)** — **Plan Maestro de Optimización:** Especificación detallada del paso a paso, medición de línea base vs. Innertube JSON API y protocolo de benchmarking.
- [nuclear-plugin-latency-2026-08-18.md](./nuclear-plugin-latency-2026-08-18.md) — Análisis de latencia histórica y optimizaciones previas en el plugin.
- [lessons-learned.md](./lessons-learned.md) — Lecciones aprendidas en el sandbox de Tauri/Nuclear.
- [alternativas-spec.md](./alternativas-spec.md) — Evaluación conceptual de arquitecturas alternativas.

---

## 2. Alternativas a Evaluar

| Alternativa | Enfoque Técnico | Reducción Estimada de Payload | Latencia Esperada |
|---|---|---|---|
| **A. YouTube Mobile (`m.youtube.com`)** | Scraping sobre endpoint móvil con UA específico | **80% de reducción** (~200KB vs ~1.3MB) | ~300 - 500 ms |
| **B. YouTube Music / Invidious API** | Consumo de endpoint JSON directo | **95% de reducción** (~15KB JSON) | ~150 - 300 ms |
| **C. Descompresión JS (`fflate`)** | Embeber descompresor WASM/JS en bundle y forzar `Accept-Encoding: gzip` | **78% de reducción** (~280KB Gzip) | ~500 - 700 ms |
| **D. Cache LRU de Búsquedas + Debouncing** | Cachear respuestas de búsqueda con TTL en memoria | **100% de reducción en hits** (0 bytes) | ~0.02 ms (instantáneo) |

---

## 3. Criterio de Selección

La estrategia ganadora se seleccionará mediante un benchmark automatizado que evaluará:
1. **Latencia de búsqueda en red fría (Cold search p95)**.
2. **Robustez y estabilidad ante cambios de YouTube**.
3. **Mantenibilidad e impacto en el tamaño del bundle (`dist/index.js`)**.
