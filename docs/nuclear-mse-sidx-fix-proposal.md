# Propuesta Técnica y Análisis de Arquitectura: Corrección de Streams Largos (> 1h30m) en Nuclear Desktop y NuclearTube

**Fecha**: 2 de Noviembre de 2026  
**Autor**: Michael (god) / NuclearTube Engineering Office  
**Repositorios Implicados**:
- `NuclearTube` (`/Users/jonathanquishpe/JoniDev/MusicProvider`)
- `Nuclear Player Core` (`/Users/jonathanquishpe/JoniDev/nuclear`)
- `nuclear-plugin-youtube` (`NuclearPlayer/nuclear-plugin-youtube`)

---

## 1. Resumen Ejecutivo y Diagnóstico de Causa Raíz

En las pruebas en vivo sobre **Nuclear Desktop** ejecutando pistas de larga duración (> 1h30m, 2h, 3h), la reproducción falla sistemáticamente con el error:
> `SoundError: unsupportedFormat`  
> *"El flujo de audio no está en un formato compatible. Prueba con otra fuente para esta canción."*

### Cadena Causal Demostrada:
1. **Limitación de Scrapers JS en Pistas Largas (Alternativas 2 y 3)**:
   - Los scrapers en JavaScript que llaman a la API Innertube de YouTube sin credenciales autenticadas fallan en tracks de larga duración debido a los desafíos criptográficos obligatorios de YouTube (`n-sig` challenge y tokens `spc`/PO tokens), arrojando `HTTP 403 Forbidden` o purgando el itag 18.
2. **Deficiencia de CORS en Manifiesto HLS Sintético (Alternativa 1 inicial)**:
   - El plugin generó un manifiesto RFC 8216 con `#EXT-X-BYTERANGE` apuntando directamente a `https://rr---sn-....googlevideo.com/videoplayback?...`.
   - Nuclear pasa el stream con `protocol: 'hls'` de forma directa a `Hls.js` sin proxyar los segmentos a través del servidor local Rust (`http://127.0.0.1:9100/stream/...`).
   - El motor WebKit de macOS aplica las políticas de CORS del navegador: como YouTube CDN no incluye cabeceras `Access-Control-Allow-Origin: *` hacia `tauri://localhost` ni `http://localhost:5173`, las peticiones de los segmentos son bloqueadas por el navegador.
3. **Colapso Final en el Core de Nuclear (`openMseSession.ts`)**:
   - Al fallar las alternativas anteriores, se activa el fallback a `api.Ytdlp.getStream()`.
   - `ytdlp_get_stream` en el backend Rust de Nuclear retorna un stream itag 140 (`container: 'm4a'`, AAC fMP4).
   - En `AudioSourceFactory.ts`, Nuclear evalúa `isFmp4(stream)` como `true` y lo despacha obligatoriamente al motor MSE (`openMseSession.ts`).
   - En `packages/hifi/src/fmp4/openMseSession.ts:34`, el tamaño de lectura inicial está hardcodeado a exactamente **8,192 bytes**:
     ```typescript
     const result = await fetcher.fetchRange(0, 8192 - 1, signal);
     ```
   - En pistas que superan ~1h30m, la tabla de índices de fragmentos (caja `sidx`) mide significativamente más de 8 KB (por ejemplo, 8,228 bytes en pistas de 1h53m; 13,424 bytes en pistas de 3h05m).
   - `parseInitSegment` invoca `BinaryReader.checkBounds`, el cual sobrepasa el límite del `DataView` y lanza:
     ```
     RangeError: Offset is outside the bounds of the DataView
     ```
   - El bloque `catch` en `openMseSession.ts:58` captura este error y lanza ciegamente:
     ```typescript
     throw new SoundError('unsupportedFormat');
     ```

---

## 2. Auditoría de la Comunidad de Plugins de Nuclear (`NuclearPlayer`)

Se auditó el ecosistema comunitario en `NuclearPlayer/plugin-registry` y el repositorio oficial `NuclearPlayer/nuclear-plugin-youtube`:

1. **`NuclearPlayer/nuclear-plugin-youtube`**:
   - Código fuente en `src/index.ts`:
     ```typescript
     getStreamUrl: async (candidateId) => {
       const info = await api.Ytdlp.getStream(
         `${YOUTUBE_URL_PREFIX}${candidateId}`,
       );
       return {
         url: info.stream_url,
         protocol: 'https',
         durationMs: info.duration ? info.duration * 1000 : undefined,
         container: info.container ?? undefined,
         codec: info.codec ?? undefined,
         source: { provider: PROVIDER_ID, id: candidateId },
       };
     }
     ```
   - **Resultado**: No pasa ningún flag a `api.Ytdlp` (la API del SDK solo acepta `url: string`). El plugin oficial adolece **exactamente del mismo fallo catastrófico** en cualquier pista > 1h30m, porque delega ciegamente en `AudioSourceFactory` -> `openMseSession.ts` (8 KB).
2. **`NuclearPlayer/nuclear-plugin-soundcloud`**:
   - Retorna streams con `protocol: 'hls'`. Funciona correctamente porque el CDN público de SoundCloud (`*.sndcdn.com`) sí envía cabeceras `Access-Control-Allow-Origin: *`.
3. **`NuclearPlayer/nuclear-plugin-bandcamp`**:
   - Provee audio progresivo MP3 (`container: 'mp3'`, `isFmp4: false`). No pasa por MSE.

---

## 3. Análisis de las Vías de Solución

| Alternativa | Mecanismo | Viabilidad en Nuclear Desktop | Resultado |
|---|---|---|---|
| **Vía A: Forzar WebM Opus (itag 251) vía `yt-dlp`** | Solicitar formato 251 a `api.Ytdlp` | **Inviable sin modificar Rust**: `ytdlp.rs` en Nuclear tiene hardcodeado `-f bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio`. `api.Ytdlp.getStream()` no expone selector de formato ni flags. Scrapers JS sufren 403 por falta de `n-sig`. | Descartada para runtime actual |
| **Vía B: HLS Sintético con Proxy Rust Local** | Reescribir las URLs de los segmentos del M3U8 para dirigirlas a `http://127.0.0.1:${port}/stream/${base64url}` | **100% Viable y Autónoma**: Elude el bloqueo de CORS, soporta peticiones HTTP 206 de rango en `stream_server.rs`, no choca con el límite de 8 KB de MSE y funciona sin tocar el core de Nuclear. | **SOLUCIÓN GANADORA ADOPTADA** |
| **Vía C: Corrección Estructural de Nuclear Core** | Modificar `packages/hifi/src/fmp4/openMseSession.ts` para leer dinámicamente el tamaño de la caja `sidx` | **Imprescindible para el ecosistema general de Nuclear**: Resuelve el bug para todos los plugins que usen fMP4 nativo en futuras versiones. | **PROPUESTA DE PR OFICIAL** |

---

## 4. Implementación en NuclearTube (Solución Vía B)

En `src/core/streamProxy.ts` y `src/core/hlsManifest.ts`:

1. **Detección Dinámica del Puerto de Streaming**:
   - Método 1: Invocación directa a Tauri IPC `__TAURI_INTERNALS__.invoke('stream_server_port')`.
   - Método 2: Sondeo rápido en el rango de puertos locales de Nuclear (`9100` a `9109`).
   - Método 3: Fallback predeterminado a puerto `9100`.
2. **Codificación Base64 URL-Safe sin Relleno (`URL_SAFE_NO_PAD`)**:
   - Coincide de forma exacta con la rutina de decodificación `decode_stream_url` del servidor Axum en Rust (`stream_server.rs`).
3. **Serialización M3U8 Proxyada**:
   - Cada segmento `#EXTINF` y el mapa de inicialización `#EXT-X-MAP` apuntan a:
     `http://127.0.0.1:${port}/stream/${base64url(streamUrl)}`
   - `Hls.js` realiza peticiones a `127.0.0.1:${port}`. El servidor Rust añade `Access-Control-Allow-Origin: *` y retransmite los rangos HTTP 206 a Google Video.
4. **Protección de Datos Binarios en `createHttpAdapter`**:
   - Para la lectura inicial de cajas ISO BMFF (`Range: bytes=0-32767`), se emplea la URL proxyada local en `globalThis.fetch`, preservando el `ArrayBuffer` puro e impidiendo la corrupción por decodificación UTF-8 que ocurría en `api.Http.fetch` (`response.text()`).

---

## 5. Propuesta de PR Oficial para el Repositorio de Nuclear (`packages/hifi`)

### Archivo Afectado:
`packages/hifi/src/fmp4/openMseSession.ts`

### Diff Propuesto:
```diff
--- a/packages/hifi/src/fmp4/openMseSession.ts
+++ b/packages/hifi/src/fmp4/openMseSession.ts
@@ -6,6 +6,7 @@ import {
   waitForSourceOpen,
 } from './MediaSourceAttachment';
 import { MseSession } from './MseSession';
-import { parseInitSegment } from './parser';
+import { findBoxes, parseInitSegment } from './parser';
 import {
   describeFetchFailure,
   isSourceInvalidStatus,
@@ -29,14 +30,37 @@ export type SessionSetupOptions = {
   onSourceInvalid?: () => void;
 };
 
+const INITIAL_HEADER_WINDOW = 32768; // 32 KB accommodates tracks up to 5 hours in a single roundtrip
+
 const fetchHeader = async (
   fetcher: SegmentFetcher,
   signal: AbortSignal,
 ): Promise<Uint8Array | null> => {
-  const result = await fetcher.fetchRange(0, 8192 - 1, signal);
+  let result = await fetcher.fetchRange(0, INITIAL_HEADER_WINDOW - 1, signal);
 
   if (result.kind === 'ok') {
-    return result.bytes;
+    let bytes = result.bytes;
+    
+    // Inspect boxes to verify if sidx extends beyond initial fetch window
+    const boxes = findBoxes(bytes);
+    const sidx = boxes.find((b) => b.type === 'sidx');
+    
+    if (sidx) {
+      const requiredLength = sidx.offset + sidx.size;
+      if (requiredLength > bytes.length) {
+        const expandedResult = await fetcher.fetchRange(0, requiredLength - 1, signal);
+        if (expandedResult.kind === 'ok') {
+          return expandedResult.bytes;
+        }
+        if (expandedResult.kind === 'aborted') {
+          return null;
+        }
+        if (expandedResult.kind === 'httpError' && isSourceInvalidStatus(expandedResult.status)) {
+          throw new StreamInvalidError(expandedResult.status);
+        }
+      }
+    }
+    return bytes;
   }
   if (result.kind === 'aborted') {
     return null;
```

---

## 6. Verificación y Resultados de Testing

- **Suite de Pruebas Unitarias**: 115 tests unitarios en 7 suites pasando al 100% verde (`npm test`).
- **Verificación de Empaquetado**:
  - Bundle `dist/index.js` compilado de forma autónoma (~39.6 KB, 0 dependencias externas en runtime).
  - Paquetes `plugin.zip` y `nucleartube.zip` generados y validados (~11 KB).
  - Staging limpio sincronizado en `/Users/jonathanquishpe/JoniDev/nucleartube-plugin` y `/Users/jonathanquishpe/JoniDev/music-provider-plugin`.
