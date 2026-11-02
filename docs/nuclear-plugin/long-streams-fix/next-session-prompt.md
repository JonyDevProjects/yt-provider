# PROMPT PARA SIGUIENTE SESIÓN: INVESTIGACIÓN PROFUNDA Y RESOLUCIÓN DEFINITIVA DE STREAMS LARGOS (> 1h30m) EN NUCLEAR

## Contexto de Arranque
- **Repositorio**: `MusicProvider` (`NuclearTube`) en la rama `fix/long-stream-playback`.
- **Repositorio Hermano**: `/Users/jonathanquishpe/JoniDev/nuclear` (Tauri Desktop Player).
- **Staging Plugin**: `/Users/jonathanquishpe/JoniDev/nucleartube-plugin`.

---

## Prompt para Copiar y Pegar al Iniciar la Sesión:

```markdown
Eres "Michael" (god), orquestador autónomo de la oficina de agentes en /Users/jonathanquishpe/JoniDev/MusicProvider/hive.

### MISIÓN:
Investigar a fondo y solucionar de forma definitiva el fallo de reproducción de pistas de larga duración (> 1h30m, 2h, 3h) en Nuclear Desktop. En las pruebas de usuario en vivo, la reproducción no inicia y la consola de DevTools arroja `unsupportedFormat` tras agotar los fallbacks. Investigar las limitaciones de runtime de Nuclear, la arquitectura de plugins comunitarios (`NuclearPlayer/nuclear-plugin-youtube`) y diseñar la solución técnica real y funcional.

---

### DIAGNÓSTICO EXACTO DEL FALLO EN VIVO:

1. **¿Por qué falló la Alternativa 1 (HLS Sintético M3U8 en Data URI)?**
   - El plugin generó un Data URI RFC 8216 con `#EXT-X-BYTERANGE` y `protocol: 'hls'`.
   - En Nuclear (`packages/player/src/services/streamResolution/audioSource.ts`):
     ```typescript
     if (stream.protocol === 'hls') {
       return { url: stream.url, protocol: 'hls' };
     }
     ```
     Nuclear pasa el Data URI directo al reproductor **sin proxyar** las URLs de los segmentos a través del servidor local Rust (`http://127.0.0.1:${port}/stream/...`).
   - Los segmentos apuntan a `https://rr---sn-....googlevideo.com/videoplayback?...`.
   - En WebKit/macOS:
     * Si corre `Hls.js`, las peticiones XHR/fetch a Google CDN son bloqueadas por **CORS** (YouTube no envía `Access-Control-Allow-Origin: *` a `tauri://localhost` o `http://localhost:5173`).
     * Si corre AVPlayer nativo, Apple prohíbe que un `data:` URI (origen opaco `null`) realice peticiones de red a orígenes cruzados.
   - Resultado: El reproductor emite error de carga (`MEDIA_ERR_SRC_NOT_SUPPORTED` / error de red), Nuclear marca el candidato como fallido e inicia la cascada de fallbacks.

2. **¿Por qué fallaron las Alternativas 2 (itag 18) y 3 (WebM Opus)?**
   - Ambas dependen de scrapers en JavaScript de la API Innertube sin autenticación.
   - En tracks largos (conciertos > 1h30m), YouTube exige rotaciones de firma (`n-sig`) y tokens PO (`spc`), devolviendo HTTP 403 o eliminando el formato 18 multiplexado.

3. **¿Por qué termina en `unsupportedFormat`?**
   - Al fallar las 3 alternativas, `src/index.ts` ejecuta el fallback final por defecto:
     `return toStream(info.streamUrl, info, candidateId);`
   - Este stream proviene de `api.Ytdlp.getStream()` y es un fMP4 DASH (`container: 'm4a'`).
   - En `AudioSourceFactory.ts`:
     ```typescript
     if (this.isFmp4(stream) && durationMs) {
       return { url: proxyUrl, protocol: 'mse', durationSeconds, codec };
     }
     ```
   - Nuclear detecta `isFmp4` y lo envía obligatoriamente al motor MSE (`useMseSource` -> `openMseSession.ts`).
   - `openMseSession.ts` tiene hardcodeado:
     `const result = await fetcher.fetchRange(0, 8192 - 1, signal);`
   - Como la pista dura > 1h30m, la caja `sidx` mide más de 8,192 bytes (ej. 8,228 bytes en 1h53m; 13,424 bytes en 3h).
   - `parseInitSegment` lanza `RangeError: Offset is outside the bounds of the DataView`.
   - `openMseSession.ts:58` captura el error y lanza:
     `throw new SoundError('unsupportedFormat');`
   - La UI de Nuclear muestra: *"El flujo de audio no está en un formato compatible. Prueba con otra fuente para esta canción."*

---

### LÍNEAS DE INVESTIGACIÓN Y TAREAS PARA LA SESIÓN:

1. **Investigación en la Comunidad de Plugins de Nuclear (`NuclearPlayer`)**:
   - Analizar el repositorio oficial [`NuclearPlayer/nuclear-plugin-youtube`](https://github.com/NuclearPlayer/nuclear-plugin-youtube) y repositorios hermanos en `NuclearPlayer/plugin-registry`.
   - ¿Cómo resuelven el streaming los plugins de YouTube existentes? ¿Qué flags pasan a `api.Ytdlp`?
   - ¿Algún plugin comunitario ha resuelto o reportado problemas con transmisiones de larga duración?

2. **Vía de Solución A: Forzar Extracción WebM Opus (itag 251) mediante el backend `yt-dlp`**:
   - En `packages/player/src/services/streamResolution/audioSource.ts`:
     ```typescript
     private isFmp4(stream: ResolvedStream): boolean {
       return (
         stream.container === 'm4a' ||
         stream.mimeType?.includes('audio/mp4') === true
       );
     }
     ```
   - Si el stream es WebM Opus (`container: 'webm'`, `mimeType: 'audio/webm'`):
     * `isFmp4` es **FALSO**.
     * Nuclear **NO usa MSE** (`openMseSession.ts` nunca se ejecuta y nunca choca con el límite de 8 KB).
     * Nuclear **SÍ aplica el proxy Rust local** (`proxyUrl = http://127.0.0.1:${port}/stream/${base64}`).
     * La URL va a `useAudioLoader` (`<audio src="...">`), con soporte de rangos HTTP 206 y sin problemas de CORS.
   - ¿Puede el plugin solicitar a `api.Ytdlp` o extraer directamente la URL del formato 251 (WebM Opus) con las firmas y tokens de `yt-dlp` nativo?

3. **Vía de Solución B: Proxyar URLs de Segmentos HLS a través del Stream Server de Nuclear**:
   - Nuclear levanta un servidor de streaming local en Rust (`stream_server.rs`).
   - Si el plugin pudiera obtener el puerto local del servidor de streaming (`stream_server_port`) o si Nuclear expusiera un helper, las URLs dentro del M3U8 sintético serían:
     `http://127.0.0.1:${port}/stream/${base64(googleCdnUrl)}`
   - Esto eliminaría el bloqueo de CORS al 100% en HLS.js. Investigar si el plugin puede invocar `stream_server_port` vía Tauri IPC o deducirlo.

4. **Vía de Solución C: Análisis del Core de Nuclear (`openMseSession.ts`)**:
   - Determinar si este bug es una deficiencia estructural de Nuclear que debe ser solucionada en el core (`packages/hifi/src/fmp4/openMseSession.ts`) leyendo dinámicamente el tamaño de la caja `sidx` en lugar de limitarse a 8 KB.
   - Preparar un informe técnico o propuesta de PR para el repositorio `nuclear`.

---

### PLAN DE ACCIÓN REQUERIDO:
1. Desplegar un worker de investigación para auditar `nuclear-plugin-youtube` y los plugins de la comunidad.
2. Probar la viabilidad de entregar streams WebM Opus (itag 251) con proxying de Nuclear.
3. Evaluar si es factible hacer funcionar HLS proxyado o si WebM progresivo es la solución limpia.
4. Actualizar `tasks.json`, `board.md` y `session-log.md` con los avances y resultados concluyentes.
```
