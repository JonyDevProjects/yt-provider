# Documentación Técnica: yt-provider (YouTube Provider para Nuclear)

**Estado del Proyecto:** ✅ Versión `v1.0.0` empaquetada, validada y enviada a Nuclear Plugin Store ([PR #12](https://github.com/NuclearPlayer/plugin-registry/pull/12)).

Este documento centraliza la arquitectura, el diseño de módulos y el índice de documentación para el desarrollo del plugin **yt-provider** para [Nuclear Music Player](https://nuclear.js.org/).

---

## 1. Visión y Propósito del Proyecto

**yt-provider** es un plugin oficial en TypeScript para **Nuclear** (`@nuclearplayer/plugin-sdk`) que implementa proveedores de streaming, metadatos y listas de reproducción de YouTube:

### Principios de Diseño
1. **Aislamiento y Cero Dependencias en Runtime**: Empaquetado con `tsup` en un bundle CommonJS autónomo de **~9 KB** sin requerir `node_modules` en tiempo de ejecución.
2. **Resolución Fresca de Streams**: Consulta en tiempo real a `api.Ytdlp.getStream(id)` en el momento de reproducción para evitar enlaces 403 por caducidad de firmas temporales.
3. **Búsqueda de Catálogo Ágil**: Scraper isomórfico (`src/core/ytScraper.ts`) sin APIs de terceros ni claves de Google.
4. **Streaming Seguro con NDJSON**: Procesamiento línea por línea para listas de reproducción masivas evitando desbordamientos de memoria (OOM).
5. **Permisos Mínimos**: Requiere exclusivamente permisos de red (`net`).

---

## 2. Estructura del Código Fuente

```
src/
├── index.ts               # Punto de entrada y registro con @nuclearplayer/plugin-sdk
└── core/
    ├── index.ts           # Exportaciones consolidadas del motor core
    ├── extractor.ts       # Extractor y formateador de streams y metadatos
    ├── ytScraper.ts       # Scraper de búsqueda de tracks y playlists
    ├── ndjson.ts          # Parser asíncrono para streaming NDJSON
    └── types.ts           # Definiciones de tipos del dominio y del SDK
```

---

## 3. Índice de Documentación

### 🔌 1. Integración con Nuclear (`docs/nuclear-plugin/`)
- [IMPLEMENTATION_PLAN.md](./nuclear-plugin/IMPLEMENTATION_PLAN.md) — Plan integral de implementación y ciclo de vida en Nuclear.
- [VALUE_PROPOSITION.md](./nuclear-plugin/VALUE_PROPOSITION.md) — Propuesta de valor y comparativa frente a subprocesos pesados.
- [architecture_mapping.md](./nuclear-plugin/architecture_mapping.md) — Mapeo de tipos y correspondencia entre yt-provider y Nuclear SDK.
- [integration_guide.md](./nuclear-plugin/integration_guide.md) — Guía práctica para probar e instalar el plugin en Nuclear Desktop.

### 🗺️ 2. Fases de Evolución y Roadmap (`docs/future-roadmap/`)
- [future_roadmap_and_architecture.md](./future-roadmap/future_roadmap_and_architecture.md) — Visión global de evolución.
- **[Fase 5: Publicación en Nuclear Plugin Store](./future-roadmap/phase5/)**:
  - [README.md](./future-roadmap/phase5/README.md) — Requisitos de publicación en Nuclear Plugin Store.
  - [session-log.md](./future-roadmap/phase5/session-log.md) — Bitácora de la Fase 5 y entrega del PR oficial.

### 🧪 3. Estrategia de Pruebas (`docs/testing/`)
- [README.md](./testing/README.md) — Guía de pruebas automatizadas (Vitest) y verificación manual en Nuclear Desktop con Tauri DevTools.

### 📊 4. Optimizaciones y Lecciones Aprendidas (`docs/optimizations/`)
- [nuclear-plugin-latency-2026-08-18.md](./optimizations/nuclear-plugin-latency-2026-08-18.md) — Análisis de latencia en búsqueda y reproducción.
- [lessons-learned.md](./optimizations/lessons-learned.md) — Lecciones aprendidas en el entorno sandbox de Tauri/Nuclear.

### 📖 5. Referencias Técnicas (`docs/reference/`)
- [dependency_analysis.md](./reference/dependency_analysis.md) — Justificación técnica del stack de desarrollo.
- [gitflow.md](./reference/gitflow.md) — Políticas de ramas, releases y convenciones de commits.

---

## 4. Flujo de Desarrollo

1. **Modificar código**: En `src/`.
2. **Ejecutar tests**: `npm test`
3. **Empaquetar plugin**: `npm run package` (genera `plugin.zip` con `index.js` y `package.json`).
4. **Probar en Nuclear Desktop**: Cargar `dist/plugin-staging` en Nuclear (`pnpm tauri dev`) y verificar en DevTools (`Cmd + Option + I`).
