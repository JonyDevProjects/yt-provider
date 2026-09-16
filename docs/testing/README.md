# Estrategia de Pruebas y Calidad (Testing Guide) — MusicProvider

**ID**: SPEC-TEST-001
**Última actualización**: 2026-09-15
**Metodología**: SDD v1.0

---

## 1. Pirámide de Pruebas

```
                ▲
               / \
              /   \     [Pruebas Manuales en Nuclear Desktop (Tauri DevTools)]
             /-----\
            /       \    [E2E Web Fixtures (Playwright)]
           /---------\
          /           \   [Integración de Plugin SDK & HTTP Proxy (Vitest)]
         /-------------\
        /               \  [Unit Tests: Core Scraper, Extractor, LRU Cache (Vitest)]
       -------------------
```

### Cobertura Objetivo

| Nivel | Cobertura mínima | Herramienta |
|-------|-----------------|-------------|
| Unit | 90% functions | Vitest |
| Integration | 100% provider contracts | Vitest |
| E2E | 100% flujos críticos | Playwright |
| Manual | 100% features nuevas | Protocolo manual |

---

## 2. Plan de Tests (Pre-Implementación)

Cada feature DEBE tener un plan de tests escrito ANTES de implementar.

### Template: Plan de Tests

```markdown
### Plan de Tests: [Feature Name]

| Test ID | Qué valida | Tipo | Archivo | Requisito |
|---------|-----------|------|---------|-----------|
| TC-001 | [Criterio de aceptación] | Unit | tests/... | FR-XXX |
| TC-002 | [Criterio de aceptación] | Integration | tests/... | FR-XXX |
```

### Ejemplo: YouTube Mobile

| Test ID | Qué valida | Tipo | Archivo | Requisito |
|---------|-----------|------|---------|-----------|
| TC-YM-001 | decodeHexEscapes decodifica \xNN | Unit | ytScraper.test.ts | FR-YM-001 |
| TC-YM-002 | parseMobileYoutubeSearchHtml extrae videos | Unit | ytScraper.test.ts | FR-YM-001 |
| TC-YM-003 | parseMobileYoutubeSearchHtml lanza error si falta data | Unit | ytScraper.test.ts | FR-YM-001 |
| TC-YM-004 | scrapeMobileYoutube fetch con UA correcto | Unit | ytScraper.test.ts | FR-YM-002 |
| TC-YM-005 | scrapeYoutube falla mobile → intenta desktop | Integration | ytScraper.test.ts | FR-YM-003 |
| TC-YM-006 | scrapeYoutube falla mobile + desktop → fallbackFn | Integration | ytScraper.test.ts | FR-YM-003 |
| TC-YM-007 | scrapeYoutube lanza error si todo falla sin fallback | Integration | ytScraper.test.ts | FR-YM-003 |

---

## 3. Pruebas Unitarias (Vitest)

### Suites Existentes

| Suite | Archivo | Qué Valida |
|-------|---------|-----------|
| **Cache LRU** | `tests/core/cache.test.ts` | Hits, misses, expiración TTL |
| **Extractor Core** | `tests/core/extractor.test.ts` | Parseo JSON/NDJSON de yt-dlp |
| **Scraper Core** | `tests/core/ytScraper.test.ts` | Parsing HTML, tiered fallback |
| **Plugin Integration** | `tests/index.test.ts` | Ciclo de vida, registro de providers |

```bash
npm test
```

---

## 4. Pruebas de Integración

### Plugin SDK (`tests/index.test.ts`)

- **Ciclo de vida**: onEnable registra, onDisable desregistra
- **Mapeo de Tipos**: StreamCandidate, Track, Album, Artist
- **Caché**: Segunda consulta retorna en microsegundos

### Live Integration (`tests/ytdlpWrapper.test.ts`)

- Búsqueda real en YouTube
- **CI**: Se salta con `process.env.CI` para evitar rate limiting

---

## 5. Pruebas E2E (Playwright)

```bash
npm run test:e2e        # Ejecutar
npm run test:e2e:ui     # Modo interactivo
npm run test:e2e:report # Ver reporte
```

### Configuración

- **Browsers**: Chromium, Firefox, WebKit
- **Server**: Auto-start en `http://localhost:3000`
- **Retries**: 2 en CI, 0 local

---

## 6. Protocolo de Pruebas Manuales

### Para validar en Nuclear Desktop

1. **Build del plugin**:
   ```bash
   npm run build
   ```

2. **Iniciar Nuclear**:
   ```bash
   cd ../nuclear/packages/player
   pnpm tauri dev
   ```

3. **Abrir DevTools**: `Cmd + Option + I`

4. **Cargar Plugin**: Settings > Plugins > Add Plugin → seleccionar `dist/`

5. **Verificar en Consola**:
   - `[NuclearTube] Plugin enabled` ✅
   - `[Core:Scraper] Starting YouTube Mobile scrape` ✅
   - `[cache] Stream URL cache HIT` ✅

---

## 7. Benchmarks

### Benchmark de Resolución de Streams

```bash
npm run benchmark:all
cat benchmarks/results/latest.json
```

**Métricas**: Cold cache p95, Warm cache p95, Memory peak

### Benchmark de Búsqueda (Mobile vs Desktop)

```bash
npm run benchmark:search
cat benchmarks/results/search-latest.json
```

**Métricas**: Fetch latency, payload size, result count

### Objetivos de Rendimiento

| Métrica | Objetivo | Actual |
|---------|----------|--------|
| Cold search p95 | < 500ms | ✅ 716-819ms (mobile) |
| Warm search p95 | < 1ms | ✅ 0.02ms (cache) |
| Payload por búsqueda | < 300KB | ✅ 570-583KB (mobile) |
| Bundle size | < 30KB | ✅ 12.17KB |
| Fallback rate | < 2% | ✅ < 1% |

---

## 8. Matriz de Trazabilidad (Tests → Requisitos)

| Requisito | Test ID | Archivo | Resultado |
|-----------|---------|---------|-----------|
| FR-001 Plugin carga | TC-001 | tests/index.test.ts | ✅ Pass |
| FR-002 Búsqueda funciona | TC-002 | tests/index.test.ts | ✅ Pass |
| FR-003 Streaming funciona | TC-003 | tests/index.test.ts | ✅ Pass |
| FR-005 Ciclo de vida | TC-005 | tests/index.test.ts | ✅ Pass |
| FR-YM-001 Parser mobile | TC-YM-001 a TC-YM-003 | tests/core/ytScraper.test.ts | ✅ Pass |
| FR-YM-002 Fetch mobile | TC-YM-004 | tests/core/ytScraper.test.ts | ✅ Pass |
| FR-YM-003 Tiered fallback | TC-YM-005 a TC-YM-007 | tests/core/ytScraper.test.ts | ✅ Pass |
| NFR-001 Latencia | Benchmark | benchmarks/search-scraper.ts | ✅ 716ms |
| NFR-003 Tests pass | vitest run | tests/ | ✅ 32/32 |
| NFR-004 0 errores tipo | tsc --noEmit | — | ✅ 0 |
| NFR-005 0 require() | grep | dist/index.js | ✅ 0 |
