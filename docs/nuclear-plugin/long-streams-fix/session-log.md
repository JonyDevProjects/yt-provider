# Bitácora de Sesión: Investigación de Streams Largos (> 1h30m)

## Fecha: 1 de Noviembre de 2026

### Acciones Realizadas:
1. **Inspección de Cajas Binarias de YouTube**:
   - Se ejecutó script de inspección binaria sobre el video `eAVXuhIMcJI` (Don Medardo, 5410s), `-FlxM_0S2lA` (Lofi, 6817s) y `J92ryjj42M0` (Ambient, 11137s).
   - Se constató que a partir de ~1h30m el box `sidx` de YouTube excede el tamaño de 8,192 bytes (ej. 8,951 bytes para 1h53m; 14,147 bytes para 3h).
2. **Identificación de la Causa Raíz en Nuclear**:
   - `packages/hifi/src/fmp4/openMseSession.ts` tiene hardcodeado `fetchRange(0, 8192 - 1)`.
   - Se genera `RangeError` al leer más allá del byte 8,191 con `DataView`, lanzando `unsupportedFormat`.
3. **Análisis del Fallo de Bypass Progresivo**:
   - WebKit en macOS no dispara `canplay` en fMP4 con `<audio src="...">` debido a la ausencia de tabla `stbl` en `moov`.
4. **Restauración del Núcleo de Nuclear**:
   - Siguiendo la directriz del usuario, el repositorio hermano `nuclear` (`/Users/jonathanquishpe/JoniDev/nuclear`) fue completamente restaurado a `master` limpio e intacto.
5. **Generación del Informe de Alternativas**:
   - Redacción de [`docs/INFORME_STREAMS_LARGOS_Y_ALTERNATIVAS.md`](file:///Users/jonathanquishpe/JoniDev/MusicProvider/docs/INFORME_STREAMS_LARGOS_Y_ALTERNATIVAS.md) con análisis de 5 alternativas, destacando la generación de manifiestos HLS sintéticos con `#EXT-X-BYTERANGE` y el fallback a formato 18.
6. **Persistencia en Engram**:
   - Observación persistida en Engram CLI con el ID `#368`.

---

## Fecha: 2 de Noviembre de 2026

### Acciones Realizadas:
1. **Delegación Asíncrona en Hive**:
   - Michael (`god`) orquestó y generó tres contratos de trabajo (`MPR-1`, `MPR-2`, `MPR-3`) para tres trabajadores temporales (`worker-hls`, `worker-itag18`, `worker-webm`) en worktrees git aislados.
2. **Implementación de las 3 Alternativas**:
   - `worker-hls` (MPR-1): Implementó `src/core/hlsManifest.ts` con parser de cajas ISO BMFF (`moov`, `sidx` v0/v1), serializador M3U8 RFC 8216 (`#EXT-X-BYTERANGE`) y Data URI Base64 (`protocol: 'hls'`). 15 tests unitarios.
   - `worker-itag18` (MPR-2): Implementó `src/core/itag18Resolver.ts` con resolución multi-tier de MP4 360p multiplexado con tabla `stbl` completa. 29 tests unitarios.
   - `worker-webm` (MPR-3): Implementó `src/core/webmResolver.ts` con resolución multi-tier de WebM Opus (`itag 251`). 25 tests unitarios.
3. **Síntesis y Router Unificado en `src/index.ts`**:
   - Integración de las 3 alternativas con la Alternativa 1 (HLS Sintético) como campeona por defecto para pistas `>= 3600s`.
   - Cascada automática de fallbacks (HLS -> WebM Opus -> itag 18 -> stream directo).
   - Conmutador en tiempo de ejecución vía `globalThis.__NUCLEARTUBE_STRATEGY__ = 'hls' | 'webm' | 'itag18' | 'auto'` para auditoría en DevTools.
4. **Verificación Empírica en Vivo**:
   - Probado contra URL CDN real de YouTube para `eAVXuhIMcJI` (Don Medardo, 5410s): parseo de 542 subsegmentos de `sidx` (6,536 bytes) y emisión de manifiesto M3U8 completo en ~180 ms.
5. **Suite de Pruebas y Empaquetado**:
   - 106/106 tests unitarios pasando al 100% en Vitest.
   - Bundle compilado con tsup (36 KB sin dependencias externas).
   - Release empaquetado en `plugin.zip`, `nucleartube.zip` y sincronizado en staging (`/Users/jonathanquishpe/JoniDev/nucleartube-plugin`).
