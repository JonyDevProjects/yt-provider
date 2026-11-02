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

6. **Pruebas en Vivo en Nuclear Desktop y Detección de Falla Real**:
   - El usuario probó el plugin en Nuclear Desktop con pistas > 1h30m.
   - **Resultado en vivo**: La reproducción no inicia. La consola emite `unsupportedFormat` tras hacer fallback a la última opción.
   - **Diagnóstico de Causa Raíz**:
     * **Falla de Alternativa 1 (HLS Sintético)**: El Data URI M3U8 contiene URLs directas del CDN de Google (`https://rr...googlevideo.com`). Nuclear usa internamente un proxy Rust local (`http://127.0.0.1:${port}/stream/...`) para eludir CORS en streams HTTP normales, pero `AudioSourceFactory.ts` pasa los streams `protocol: 'hls'` en crudo sin proxy. Al intentar reproducir el Data URI en WebKit/macOS, `Hls.js` o AVPlayer fallan por CORS o restricciones de origen opaco (`data:`), disparando `onError`.
     * **Falla de Alternativas 2 y 3 (itag 18 / WebM)**: Los scrapers JS de Innertube fallan en pistas largas no autenticadas debido a rotación de n-sig y bloqueos 403 de YouTube.
     * **Falla del Fallback Final**: Al fallar las 3 alternativas, `src/index.ts` ejecuta `return toStream(info.streamUrl, info, candidateId)`. Nuclear recibe el stream fMP4 (`container: 'm4a'`), `AudioSourceFactory` lo categoriza como `protocol: 'mse'` y `openMseSession.ts` se estrella contra su límite de 8,192 bytes en `sidx`, lanzando `SoundError('unsupportedFormat')`.

---

## Fecha: 2 de Noviembre de 2026 (Sesión 3 - Resolución Definitiva MPR-8)

### Acciones Realizadas:
1. **Auditoría de Plugins Comunitarios (`NuclearPlayer`)**:
   - Inspección directa del código fuente de `NuclearPlayer/nuclear-plugin-youtube` (`master/src/index.ts`).
   - Se demostró que el plugin oficial simplemente llama a `api.Ytdlp.getStream()` sin flags. En pistas > 1h30m, el plugin oficial de Nuclear experimenta el **mismo fallo exacto** que NuclearTube al chocar contra `openMseSession.ts:34` (8 KB) en el core de Nuclear.
   - En `NuclearPlayer/plugin-registry`, los otros plugins streaming (SoundCloud y Bandcamp) solo funcionan porque SoundCloud envía `Access-Control-Allow-Origin: *` y Bandcamp usa MP3 progresivo estándar.
2. **Implementación de Solución Definitiva (Proxying Local de Segmentos HLS)**:
   - Se creó `src/core/streamProxy.ts` con rutinas de descubrimiento de puerto de stream local (`stream_server_port` vía Tauri IPC `__TAURI_INTERNALS__.invoke` y sondeo 9100..9109).
   - Codificación base64 URL-safe sin padding (`URL_SAFE_NO_PAD`) compatible 1:1 con `stream_server.rs` en Rust.
   - En `src/core/hlsManifest.ts`, cada segmento `#EXTINF` y el mapa `#EXT-X-MAP` se serializan como:
     `http://127.0.0.1:${port}/stream/${base64url(streamUrl)}`
   - Esto permite que `Hls.js` en WebKit descargue todos los subsegmentos sin bloqueos de CORS, ya que el servidor local Axum inyecta `Access-Control-Allow-Origin: *` y retransmite las peticiones HTTP 206 de rango con éxito.
   - Se agregaron helpers `toHlsBlobUri` y `toHlsPlaylistUrl` para orígenes limpios en WebKit.
   - En `createHttpAdapter` (`src/index.ts`), las peticiones iniciales de cajas fMP4 (`0-32767`) se enrutan mediante el proxy local, garantizando la preservación de bytes binarios puros (`ArrayBuffer`) sin sufrir la corrupción por decodificación UTF-8 de `api.Http.fetch`.
3. **Análisis y Propuesta de PR para el Core de Nuclear**:
   - Redacción de [`docs/nuclear-mse-sidx-fix-proposal.md`](file:///Users/jonathanquishpe/JoniDev/MusicProvider/docs/nuclear-mse-sidx-fix-proposal.md) detallando el parche necesario en `packages/hifi/src/fmp4/openMseSession.ts` para que Nuclear core lea dinámicamente el tamaño de la caja `sidx` (iniciando en 32 KB y expandiendo dinámicamente según sea necesario).
4. **Verificación y Empaquetado**:
   - 115 tests unitarios pasando al 100% verde (`npm test`).
   - Bundle compilado con tsup (~39.6 KB).
   - Empaquetado final en `plugin.zip` y `nucleartube.zip` (~11 KB).
   - Staging sincronizado en `/Users/jonathanquishpe/JoniDev/nucleartube-plugin` y `/Users/jonathanquishpe/JoniDev/music-provider-plugin`.
