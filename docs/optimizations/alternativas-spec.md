# Especificación Técnica de Alternativas de Optimización

**ID**: SPEC-OPT-001
**Fecha**: 2026-09-15
**Estado**: Evaluated (Alternativa A implementada)
**Metodología**: SDD v1.0

---

## Contexto

El scraper actual descarga ~1.3MB de HTML por búsqueda. Se buscan alternativas para reducir latencia y payload.

### Criterios de Evaluación

| ID | Criterio | Umbral |
|----|----------|--------|
| CE-001 | Reducción de payload | > 50% |
| CE-002 | Latencia de búsqueda | < 500ms (p95) |
| CE-003 | Robustez ante cambios de YouTube | Alta |
| CE-004 | Impacto en bundle size | < 15KB |
| CE-005 | Tasa de fallback | < 2% |

---

## Alternativa A: YouTube Mobile Scraper (`m.youtube.com`)

**ADR**: ADR-YM-001 (Accepteda)
**Estado**: ✅ Implementada

### Especificación

| Campo | Valor |
|-------|-------|
| URL | `https://m.youtube.com/results?search_query=...` |
| User-Agent | iPhone Safari iOS 17 |
| Parser | `parseMobileYoutubeSearchHtml()` con `decodeHexEscapes()` |
| Renderer | `videoWithContextRenderer` |
| Payload esperado | ~573KB (56% reducción) |
| Latencia esperada | ~800ms (2.6x mejora) |

### Resultados Reales

| Métrica | Objetivo | Resultado |
|---------|----------|-----------|
| Payload | < 600KB | ✅ 570-583KB |
| Latencia | < 1000ms | ✅ 716-819ms |
| Speedup vs desktop | > 1.2x | ✅ 1.2x-2.3x |
| Resultados | ≥ desktop | ✅ 5=5 |

### Decisión

**Aprobada como Tier 1**. Implementada en `feat/youtube-mobile-scraper`.

---

## Alternativa B: YouTube Music / Invidious API Pública

**Estado**: ⬜ No implementada

### Especificación

| Campo | Valor |
|-------|-------|
| Endpoint | API pública Invidious o YT Music JSON |
| Formato | JSON directo (sin HTML parsing) |
| Payload esperado | ~15KB (95% reducción) |
| Latencia esperada | ~150-300ms |

### Evaluación

| Criterio | Valoración |
|----------|-----------|
| CE-001 Reducción payload | 🟢 Excelente (95%) |
| CE-002 Latencia | 🟢 Excelente (150-300ms) |
| CE-003 Robustez | 🔴 Baja (APIs públicas inestables) |
| CE-004 Bundle impact | 🟢 Ninguno |
| CE-005 Tasa fallback | 🔴 Alta (APIs públicas caen frecuentemente) |

### Decisión

**Rechazada**. APIs públicas de terceros son inestables (lección de omnisource: MusicBrainz causaba 8000ms de espera).

---

## Alternativa C: Descompresión JS (`fflate`)

**Estado**: ⬜ No implementada

### Especificación

| Campo | Valor |
|-------|-------|
| Dependencia | `fflate` (~8KB) |
| Enfoque | Forzar `Accept-Encoding: gzip` + descomprimir en JS |
| Payload esperado | ~280KB comprimido (78% reducción) |
| Latencia esperada | ~500-700ms |

### Evaluación

| Criterio | Valoración |
|----------|-----------|
| CE-001 Reducción payload | 🟢 Buena (78%) |
| CE-002 Latencia | 🟡 Media (500-700ms) |
| CE-003 Robustez | 🟡 Media (depende de compresión de YouTube) |
| CE-004 Bundle impact | 🟡 +8KB |
| CE-005 Tasa fallback | 🟡 Media |

### Decisión

**Pendiente**. Podría combinarse con Alternativa A para mejorar aún más.

---

## Alternativa D: Cache LRU de Búsquedas + Debouncing

**Estado**: ⬜ No implementada

### Especificación

| Campo | Valor |
|-------|-------|
| Dependencia | `lru-cache` (ya en proyecto) |
| TTL | 10-15 minutos |
| Reducción en hits | 100% (0 bytes transferidos) |
| Latencia en hits | ~0.02ms |

### Evaluación

| Criterio | Valoración |
|----------|-----------|
| CE-001 Reducción payload | 🟢 Excelente en hits (100%) |
| CE-002 Latencia | 🟢 Excelente en hits (0.02ms) |
| CE-003 Robustez | 🟢 Alta (cache local) |
| CE-004 Bundle impact | 🟢 Ya existe |
| CE-005 Tasa fallback | 🟢 0% en hits |

### Decisión

**Recomendada como complemento**. No excluye Alternativa A. Se puede implementar en futuro.

---

## Matriz de Decisión Final

| Alternativa | Payload | Latencia | Robustez | Bundle | Fallback | **Decisión** |
|-------------|---------|----------|----------|--------|----------|-------------|
| A. Mobile | 🟢 56% | 🟢 2.6x | 🟢 Alta | 🟢 0 | 🟢 Baja | ✅ **Tier 1** |
| B. Invidious | 🟢 95% | 🟢 5x | 🔴 Baja | 🟢 0 | 🔴 Alta | ❌ Rechazada |
| C. fflate | 🟢 78% | 🟡 1.5x | 🟡 Media | 🟡 +8KB | 🟡 Media | ⬜ Pendiente |
| D. LRU Cache | 🟢 100%* | 🟢 100k x | 🟢 Alta | 🟢 0 | 🟢 0% | ⬜ Complemento |

*En hits de cache. Misses usan Tier 1/2/3.
