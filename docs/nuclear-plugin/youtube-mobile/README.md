# YouTube Mobile Scraper — Optimización de Búsqueda

**ID**: PL-003
**Spec**: `docs/nuclear-plugin/youtube-mobile/spec.md` (ver sección 2)
**Fecha**: 2026-09-15
**Estado**: Complete
**Metodología**: SDD v1.0
**Branch**: `feat/youtube-mobile-scraper`

---

## 1. Contexto

El scraper actual fetcha `www.youtube.com/results` (~1.3MB, ~2.2s). YouTube sirve una versión simplificada en `m.youtube.com` (~573KB, ~0.8s). Se busca validar si mobile puede ser Tier 1 con desktop como fallback.

---

## 2. Requisitos (Spec)

### Requisitos Funcionales

| ID | Requisito | Prioridad | Criterio de Aceptación |
|----|-----------|-----------|----------------------|
| FR-YM-001 | Parser extrae resultados de HTML mobile | P1 | `parseMobileYoutubeSearchHtml()` retorna `SearchResult[]` |
| FR-YM-002 | Scraper fetch m.youtube.com con UA correcto | P1 | User-Agent contiene "iPhone" |
| FR-YM-003 | Tiered fallback funciona (mobile → desktop → yt-dlp) | P1 | Si mobile falla, desktop se intenta |
| FR-YM-004 | Tests cubren todos los caminos | P1 | 32/32 tests pasan |
| FR-YM-005 | Benchmark demuestra mejora medible | P2 | Mobile ≥ 1.2x más rápido que desktop |

### Requisitos No Funcionales

| ID | Requisito | Umbral |
|----|-----------|--------|
| NFR-YM-001 | Latencia mobile (cold) | < 1000ms |
| NFR-YM-002 | Payload mobile | < 600KB |
| NFR-YM-003 | Cantidad de resultados | ≥ desktop |

### Fuera de Alcance
- Soporte para cookies/autenticación
- Scraping de comments o metadata extendida
- Cambios en `src/index.ts`

---

## 3. Decisiones de Diseño (ADRs)

### ADR-YM-001: YouTube Mobile como Tier 1

- **Status**: Accepted
- **Contexto**: Benchmark muestra mobile 1.2x-2.3x más rápido con 56% menos payload
- **Decisión**: Mobile como Tier 1, desktop como Tier 2
- **Alternativas**: Desktop como Tier 1
- **Consecuencias**: Mejora medible en latencia de búsqueda

### ADR-YM-002: Codificación hex en ytInitialData mobile

- **Status**: Accepted
- **Contexto**: Mobile YouTube almacena ytInitialData como string con hex escapes (`\x7b` = `{`), no como JSON crudo
- **Decisión**: `decodeHexEscapes()` convierte `\xNN` → carácter, `\/` → `/`, `\\` → `\`
- **Alternativas**: Usar `eval()` (inseguro), byte-level decoding (complejo)
- **Consecuencias**: Parser simple y seguro

### ADR-YM-003: videoWithContextRenderer vs videoRenderer

- **Status**: Accepted
- **Contexto**: Mobile usa `videoWithContextRenderer` con campos diferentes
- **Decisión**: Mapeo explícito de campos:
  - `headline.runs[0].text` (título) en vez de `title.runs[0].text`
  - `shortBylineText.runs[0].text` (canal) en vez de `ownerText.runs[0].text`
  - `lengthText.runs[0].text` (duración) en vez de `lengthText.simpleText`
- **Consecuencias**: Parser mobile independiente del desktop

---

## 4. Matriz de Trazabilidad

| Requisito | ADR | Tareas | Tests | Benchmark | Resultado |
|-----------|-----|--------|-------|-----------|-----------|
| FR-YM-001 | ADR-YM-002, ADR-YM-003 | T-YM-001, T-YM-002 | TC-YM-001, TC-YM-002, TC-YM-003 | — | ✅ Pass |
| FR-YM-002 | — | T-YM-003 | TC-YM-004 | — | ✅ Pass |
| FR-YM-003 | ADR-YM-001 | T-YM-004 | TC-YM-005, TC-YM-006, TC-YM-007 | — | ✅ Pass |
| FR-YM-004 | — | T-YM-005 | 32/32 | — | ✅ Pass |
| FR-YM-005 | ADR-YM-001 | T-YM-006 | — | Benchmark | ✅ 1.2x-2.3x |
| NFR-YM-001 | — | — | — | Benchmark | ✅ 716-819ms |
| NFR-YM-002 | — | — | — | Benchmark | ✅ 570-583KB |
| NFR-YM-003 | — | — | — | Benchmark | ✅ 5=5 |

---

## 5. Tareas

| Tarea | Descripción | Estado | Fecha |
|-------|-------------|--------|-------|
| T-YM-001 | Crear `decodeHexEscapes()` | ✅ | 2026-09-15 |
| T-YM-002 | Crear `parseMobileYoutubeSearchHtml()` | ✅ | 2026-09-15 |
| T-YM-003 | Crear `scrapeMobileYoutube()` | ✅ | 2026-09-15 |
| T-YM-004 | Modificar `scrapeYoutube()` con tiered fallback | ✅ | 2026-09-15 |
| T-YM-005 | Escribir tests (12 nuevos) | ✅ | 2026-09-15 |
| T-YM-006 | Benchmark comparativo | ✅ | 2026-09-15 |
| T-YM-007 | Documentar findings | ✅ | 2026-09-15 |
| T-YM-008 | Guardar en Engram | ✅ | 2026-09-15 |

---

## 6. Benchmark

### Resultados (3 queries manuales)

| Query | Mobile | Desktop | Speedup | Size Mobile | Size Desktop |
|-------|--------|---------|---------|-------------|--------------|
| Radiohead Creep | 716ms | 1252ms | **1.7x** | 570KB | 2637KB |
| Queen Bohemian Rhapsody | 748ms | 867ms | **1.2x** | 576KB | 1366KB |
| lofi hip hop | 819ms | 1895ms | **2.3x** | 583KB | 1740KB |

### Decisión

**Mobile es Tier 1** (principal), Desktop es Tier 2 (fallback).

---

## 7. Log de Desviaciones

### Dev-YM-1: Hex encoding en YouTube Mobile

- **Fase**: T-YM-001
- **Plan original**: Regex simple para extraer ytInitialData
- **Realidad**: Mobile almacena datos como hex escapes (`\x7b\x22`), no JSON crudo
- **Impacto**: Alto — parser fallaba completamente
- **Acción**: Crear `decodeHexEscapes()` con soporte para `\xNN`, `\/`, `\\`
- **Aprendizaje**: YouTube Mobile usa codificación diferente a desktop
- **Agente**: CommandCode

### Dev-YM-2: Estructura JSON diferente en mobile

- **Fase**: T-YM-002
- **Plan original**: Reutilizar lógica de parsing de desktop
- **Realidad**: Mobile no tiene `twoColumnSearchResultsRenderer`. Usa `sectionListRenderer` directo
- **Impacto**: Medio — parser desktop no funcionaba
- **Acción**: Parser independiente con mapeo de campos propio
- **Aprendizaje**: Mobile YouTube tiene estructura simplificada
- **Agente**: CommandCode

---

## 8. Riesgos

| Riesgo | Probabilidad | Impacto | Contingencia |
|--------|-------------|---------|-------------|
| YouTube cambia estructura mobile | Media | Alto | Parser lanza error → fallback desktop |
| Hex encoding varía | Baja | Media | `decodeHexEscapes` maneja `\xNN` genérico |
| Mobile bloquea requests | Media | Media | UA iPhone Safari estándar; fallback chain |
| Rate limiting en benchmarks | Alta | Baja | p50 como métrica principal |

---

## 9. Archivos Relevantes

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| `src/core/ytScraper.ts` | Core scraper modificado | ✅ Modificado |
| `tests/core/ytScraper.test.ts` | Tests (32 total) | ✅ Modificado |
| `benchmarks/search-scraper.ts` | Benchmark comparativo | ✅ Creado |
| `docs/nuclear-plugin/youtube-mobile/findings.md` | Análisis estructural | ✅ Creado |
| `src/index.ts` | Plugin entry | 🟢 Sin cambio |

---

## 10. Session Log

### Sesión 1 (2026-09-15) — Implementación Completa

1. ✅ Investigación: YouTube Mobile vs Desktop (estructura, rendimiento)
2. ✅ Crear branch `feat/youtube-mobile-scraper`
3. ✅ Implementar `decodeHexEscapes()`, `parseMobileYoutubeSearchHtml()`, `scrapeMobileYoutube()`
4. ✅ Modificar `scrapeYoutube()` con tiered fallback
5. ✅ Escribir 12 tests nuevos (32/32 total)
6. ✅ Benchmark comparativo (1.2x-2.3x más rápido)
7. ✅ Documentar findings y decisiones
8. ✅ Guardar en Engram

**Conclusión**: YouTube Mobile implementado como Tier 1. Búsquedas optimizadas.
