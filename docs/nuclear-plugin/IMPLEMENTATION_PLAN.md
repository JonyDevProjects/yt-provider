# Plan de Desarrollo Eje 1: Plugin de Nuclear

**ID**: PL-001
**Spec**: `docs/nuclear-plugin/IMPLEMENTATION_PLAN.md` (este archivo actúa como spec + plan)
**Fecha**: 2026-08-12
**Última actualización**: 2026-09-15
**Estado**: Complete
**Metodología**: Spec-Driven Development (SDD) v1.0

---

## 1. Contexto

**Objetivo**: Abstraer la lógica del actual servidor NodeJS (MusicProvider) e implementar la API estándar `@nuclearplayer/plugin-sdk` para convertirlo en un módulo de distribución standalone que Nuclear pueda consumir nativamente.

---

## 2. Requisitos

### Requisitos Funcionales

| ID | Requisito | Prioridad | Criterio de Aceptación |
|----|-----------|-----------|----------------------|
| FR-001 | Plugin se carga en Nuclear sin errores | P1 | `[NuclearTube] Plugin enabled` en consola |
| FR-002 | Búsqueda de tracks funciona desde Nuclear | P1 | Resultados aparecen en UI de Nuclear |
| FR-003 | Streaming de audio funciona end-to-end | P1 | Track se reproduce completo sin interrupciones |
| FR-004 | Playlists de YouTube se extraen | P2 | Items de playlist mapeados a Track[] |
| FR-005 | Ciclo de vida del plugin funciona correctamente | P1 | onEnable registra, onDisable desregistra |
| FR-006 | Streams largos (+1 hora) funcionan | P1 | Sin bucles de carga infinita |
| FR-007 | Caché LRU evita resoluciones duplicadas | P2 | Segunda consulta retorna en <1ms |

### Requisitos No Funcionales

| ID | Requisito | Umbral |
|----|-----------|--------|
| NFR-001 | Latencia de búsqueda (cold) | p95 < 2000ms |
| NFR-002 | Tamaño del bundle | < 30KB |
| NFR-003 | Tests unitarios | 100% pass |
| NFR-004 | Errores de tipo TypeScript | 0 |
| NFR-005 | Dependencias Node.js en bundle | 0 require() |

### Fuera de Alcance
- Soporte para cookies de autenticación de YouTube
- Regeneración de URLs caducadas durante playback (streams >1 hora ya soportados)
- Integración con Spoti5
- Age-Restricted Content
- CI/CD automatizado (ya resuelto)

---

## 3. Arquitectura

### Diagrama de Componentes

```
┌─────────────────────────────────────────────┐
│                  Nuclear                      │
│  ┌─────────────────────────────────────────┐ │
│  │           Plugin Loader                  │ │
│  │  onLoad → onEnable → register providers │ │
│  └──────────────┬──────────────────────────┘ │
│                 │                             │
│  ┌──────────────▼──────────────────────────┐ │
│  │        NuclearTube Plugin                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │ │
│  │  │ Streaming│ │ Playlist │ │Metadata │ │ │
│  │  │ Provider │ │ Provider │ │Provider │ │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬────┘ │ │
│  │       │             │            │       │ │
│  │  ┌────▼─────────────▼────────────▼────┐ │ │
│  │  │      Core Scraper (ytScraper.ts)    │ │ │
│  │  │  Tier 1: m.youtube.com (mobile)     │ │ │
│  │  │  Tier 2: www.youtube.com (desktop)  │ │ │
│  │  │  Tier 3: api.Ytdlp.search (yt-dlp)  │ │ │
│  │  └─────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 4. Decisiones de Diseño (ADRs)

### ADR-001: Bundler CJS con tsup

- **Status**: Accepted
- **Contexto**: Nuclear carga plugins como CommonJS modules via `require()`. El código fuente es TypeScript ESM.
- **Decisión**: Usar `tsup` con `format: 'cjs'` para generar `dist/index.js`.
- **Alternativas evaluadas**: tsc directo (sin bundling), esbuild manual
- **Consecuencias**: Dependencias se bundlean automáticamente. `external: ['@nuclearplayer/plugin-sdk']` evita duplicar el SDK.

### ADR-002: Condición browser para lru-cache

- **Status**: Accepted
- **Contexto**: `lru-cache` v11 usa `diagnostics_channel` (Node builtin) en su build `node`. Nuclear no soporta este módulo.
- **Decisión**: Agregar `esbuildOptions.conditions: ['browser']` en tsup.config.ts.
- **Alternativas**: Reemplazar lru-cache con Map simple
- **Consecuencias**: Bundle usa el build browser de lru-cache (sin `diagnostics_channel`). Cero `require()` en el bundle.

### ADR-003: Registro de proveedores en onEnable

- **Status**: Accepted
- **Contexto**: `onLoad` no se ejecuta durante instalación desde UI (solo en startup). `onEnable` se ejecuta siempre.
- **Decisión**: Registrar proveedores en `onEnable`, no en `onLoad`.
- **Alternativas**: Registrar en ambos (idempotente)
- **Consecuencias**: Plugin funciona tanto en startup como en instalación desde UI.

### ADR-004: Inyección de Range Header vía query parameter

- **Status**: Accepted
- **Contexto**: YouTube rechaza requests sin Range header (HTTP 403) para streams largos. Nuclear no siempre inyecta este header.
- **Decisión**: Añadir `&range=0-99999999999` a la URL del stream.
- **Alternativas**: Interceptar requests en el plugin (no posible en sandbox)
- **Consecuencias**: CDN de YouTube responde con HTTP 206 automáticamente.

### ADR-005: Tiered Fallback Architecture

- **Status**: Accepted
- **Contexto**: El scraping de YouTube puede fallar por rate limiting, cambios de estructura, o bloqueos.
- **Decisión**: Cadena de fallback: mobile → desktop → yt-dlp
- **Alternativas**: Solo desktop, solo yt-dlp
- **Consecuencias**: Resiliencia alta. Cada tier tiene su propia lógica de parsing.

### ADR-006: YouTube Mobile como Tier 1

- **Status**: Accepted
- **Contexto**: `m.youtube.com` sirve HTML más ligero (~573KB vs ~1.3MB) con latencia ~2.6x menor.
- **Decisión**: Mobile como Tier 1, desktop como Tier 2.
- **Alternativas**: Desktop como Tier 1
- **Consecuencias**: 1.2x-2.3x más rápido en latencia, 2.3x-4.6x menor payload.

---

## 5. Plan de Tareas

### Etapa 1: Preparación del Entorno Plugin

| Tarea | Descripción | Estado | Fecha |
|-------|-------------|--------|-------|
| T-001 | Instalar @nuclearplayer/plugin-sdk, configurar package.json | ✅ | 2026-08-16 |
| T-002 | Configurar tsup.config.ts (CJS → dist/index.js) | ✅ | 2026-08-16 |

### Etapa 2: Refactorización Arquitectónica

| Tarea | Descripción | Estado | Fecha |
|-------|-------------|--------|-------|
| T-003 | Extraer caché LRU de server.ts → src/streamCache.ts | ✅ | 2026-08-16 |
| T-004 | Crear src/index.ts con ciclo de vida Nuclear | ✅ | 2026-08-16 |
| T-005 | Implementar StreamingProvider con api.Ytdlp | ✅ | 2026-08-16 |
| T-006 | Mapear tipos SDK (snake_case) → modelo interno (camelCase) | ✅ | 2026-08-16 |

### Etapa 3: Integración de la API de Nuclear

| Tarea | Descripción | Estado | Fecha |
|-------|-------------|--------|-------|
| T-007 | Implementar searchForTrackV2 usando api.Ytdlp + tipo Track | ✅ | 2026-08-16 |
| T-008 | Agregar manejo de playlists (api.Ytdlp.getPlaylist) | ✅ | 2026-08-16 |

### Etapa 4: Empaquetado y Verificación

| Tarea | Descripción | Estado | Fecha |
|-------|-------------|--------|-------|
| T-009 | Ajustar tests unitarios para validar retornos crudos | ✅ | 2026-08-16 |
| T-010 | CI/CD (test.yml) pasa con nuevo empaquetado | ✅ | 2026-08-16 |

### Etapa 5: Prueba de Fuego (Nuclear Runtime)

| Tarea | Descripción | Estado | Fecha |
|-------|-------------|--------|-------|
| T-011 | Cargar plugin en Nuclear, probar búsqueda y playback | ✅ | 2026-08-16 |

### Etapa 6: Resolución de Edge Cases

| Tarea | Descripción | Estado | Fecha |
|-------|-------------|--------|-------|
| T-012 | Resolver streams largos (range headers) | ✅ | 2026-08-16 |
| T-013 | Prevenir fugas de memoria en caché LRU | ✅ | 2026-08-16 |
| T-014 | Fix "Restart After Install" (registro en onEnable) | ✅ | 2026-08-18 |

### Etapa 7: Optimización de Búsqueda

| Tarea | Descripción | Estado | Fecha |
|-------|-------------|--------|-------|
| T-015 | Implementar YouTube Mobile scraper (Tier 1) | ✅ | 2026-09-15 |
| T-016 | Implementar tiered fallback (mobile → desktop → yt-dlp) | ✅ | 2026-09-15 |
| T-017 | Benchmark comparativo mobile vs desktop | ✅ | 2026-09-15 |

---

## 6. Matriz de Trazabilidad

| Requisito | ADR | Tareas | Tests | Archivos | Resultado |
|-----------|-----|--------|-------|----------|-----------|
| FR-001 | ADR-003 | T-004, T-014 | TC-001 | src/index.ts, tests/index.test.ts | ✅ Pass |
| FR-002 | ADR-005 | T-005, T-007 | TC-002 | src/index.ts, src/core/ytScraper.ts | ✅ Pass |
| FR-003 | ADR-004 | T-012 | TC-003 | src/index.ts | ✅ Pass |
| FR-004 | — | T-008 | TC-004 | src/index.ts | ✅ Pass |
| FR-005 | ADR-003 | T-014 | TC-005 | src/index.ts | ✅ Pass |
| FR-006 | ADR-004 | T-012 | TC-003 | src/index.ts | ✅ Pass |
| FR-007 | — | T-003 | TC-006 | src/streamCache.ts | ✅ Pass |
| NFR-001 | ADR-006 | T-015, T-017 | Benchmark | benchmarks/search-scraper.ts | ✅ 716ms |
| NFR-002 | ADR-001 | T-002 | — | dist/index.js (12.17KB) | ✅ Pass |
| NFR-003 | — | T-009 | vitest | tests/ | ✅ 32/32 |
| NFR-004 | — | T-009 | tsc | — | ✅ 0 errores |
| NFR-005 | ADR-002 | T-002 | grep | dist/index.js | ✅ 0 require() |

---

## 7. Log de Desviaciones

### Dev-1: npm 11 silencia devDependencies con `omit = ["dev"]`
- **Fase**: Etapa 1
- **Plan original**: `npm i -D` instalaría dependencias sin problemas
- **Realidad**: npm mostraba paquetes instalados pero `npx tsup` fallaba
- **Causa**: npm 11.12.1 tenía `omit = ["dev"]` configurado globalmente
- **Impacto**: Alto — sin devDependencies, build y types no disponibles
- **Acción**: `npm i --include=dev` + `npm config delete omit`
- **Aprendizaje**: En npm 11, `omit` puede estar configurado por el entorno. Verificar con `npm ls` después de instalar.
- **Agente**: CommandCode

### Dev-2: `lru-cache` v11 usa `diagnostics_channel` (Node builtin)
- **Fase**: Etapa 1
- **Plan original**: Bundle con `noExternal: ['lru-cache']` sería portable
- **Realidad**: Bundle incluía `require('diagnostics_channel')` no soportado por Nuclear
- **Causa**: lru-cache v11 tiene builds node y browser; tsup resolvía node por defecto
- **Impacto**: Alto — plugin no cargaría en Nuclear
- **Acción**: `esbuildOptions.conditions: ['browser']`
- **Aprendizaje**: Verificar `grep "require(" dist/index.js` después de cada build
- **Agente**: CommandCode

### Dev-3: `@nuclearplayer/model` no está en npm
- **Fase**: Etapa 1
- **Plan original**: Importar tipos desde `@nuclearplayer/model`
- **Realidad**: Paquete no existe (404). Tipos bundled en plugin-sdk
- **Impacto**: Bajo
- **Acción**: Importar todos los tipos desde `@nuclearplayer/plugin-sdk`
- **Aprendizaje**: Usar `import type` para imports del SDK
- **Agente**: CommandCode

### Dev-4: Type mismatch snake_case vs camelCase
- **Fase**: Etapa 2
- **Plan original**: Usar respuestas de `api.Ytdlp.getStream()` directamente
- **Realidad**: SDK usa snake_case, código interno usa camelCase
- **Impacto**: Medio
- **Acción**: Crear `sdkToInternal()` para mapeo explícito
- **Aprendizaje**: Usar funciones de mapeo en boundaries
- **Agente**: CommandCode

### Dev-5: YouTube Mobile usa codificación hex diferente a desktop
- **Fase**: Etapa 7
- **Plan original**: Regex simple para extraer ytInitialData
- **Realidad**: Mobile almacena ytInitialData como string con hex escapes (`\x7b` = `{`)
- **Impacto**: Alto — parser fallaba completamente
- **Acción**: Crear `decodeHexEscapes()` que maneja `\xNN`, `\/`, `\\`
- **Aprendizaje**: YouTube Mobile usa `videoWithContextRenderer` con estructura diferente
- **Agente**: CommandCode

---

## 8. Riesgos y Contingencias

| Riesgo | Probabilidad | Impacto | Contingencia |
|--------|-------------|---------|-------------|
| Nuclear `require` shim más restrictivo | Baja | Alto | Verificar con `grep "require(" dist/index.js` |
| `api.Ytdlp` no disponible en runtime | Baja | Medio | Guard en `onLoad` como safety net |
| Bundle demasiado grande para webview | Baja | Medio | Reemplazar lru-cache con Map simple |
| YouTube cambia estructura HTML | Media | Alto | Tiered fallback (mobile → desktop → yt-dlp) |
| npm `omit=dev` vuelve a aparecer | Baja | Baja | `npm config delete omit` |

---

## 9. Archivos Relevantes

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| `package.json` | Metadata Nuclear, entry point, scripts | ✅ Modificado |
| `tsup.config.ts` | Configuración bundler CJS | ✅ Creado |
| `src/index.ts` | Entry point del plugin Nuclear | ✅ Creado |
| `src/core/ytScraper.ts` | Core scraper con tiered fallback | ✅ Modificado |
| `src/core/types.ts` | Tipos compartidos | 🟢 Sin cambio |
| `tests/index.test.ts` | Tests del plugin | ✅ Modificado |
| `tests/core/ytScraper.test.ts` | Tests del scraper | ✅ Modificado |
| `benchmarks/search-scraper.ts` | Benchmark mobile vs desktop | ✅ Creado |

---

## 10. Ejecución por Sesión

### Sesión 1 (2026-08-16) — Etapas 1 y 2

1. ✅ Instalar dependencias del plugin SDK y tsup
2. ✅ Configurar package.json con metadata Nuclear
3. ✅ Crear tsup.config.ts para bundler CJS
4. ✅ Extraer caché LRU de server.ts → src/streamCache.ts
5. ✅ Crear src/index.ts — entry point del plugin Nuclear
6. ✅ Validación completa (23 tests, 0 errores tipo, bundle limpio)

**Conclusión**: Etapas 1 y 2 completadas. Plugin se carga y ejecuta ciclo de vida completo.

### Sesión 2 (2026-08-16) — Etapas 5 y 6

1. ✅ Carga y pruebas en entorno Nuclear
2. ✅ Diagnóstico y solución: streams largos (range headers)
3. ✅ Prevención de fugas de memoria en caché LRU

**Conclusión**: Etapas 5 y 6 completadas. 29/29 tests pasando.

### Sesión 3 (2026-08-18) — Fix "Restart After Install"

1. ✅ Investigación de causa raíz (onLoad vs onEnable)
2. ✅ Mover registro de proveedores de onLoad a onEnable
3. ✅ Actualizar tests y documentación

**Conclusión**: Bug resuelto. Plugin aparece sin reiniciar.

### Sesión 4 (2026-09-15) — YouTube Mobile Scraper

1. ✅ Investigación de YouTube Mobile vs Desktop
2. ✅ Implementación de parser mobile (decodeHexEscapes, parseMobileYoutubeSearchHtml)
3. ✅ Implementación de tiered fallback
4. ✅ Tests (32/32 pasan)
5. ✅ Benchmark comparativo (1.2x-2.3x más rápido)
6. ✅ Decisión: Mobile = Tier 1

**Conclusión**: Búsquedas optimizadas con 56% menos payload.
