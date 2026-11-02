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
