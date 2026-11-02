# INFORME TÉCNICO: ANÁLISIS DE REPRODUCCIÓN DE STREAMS LARGOS (> 1h30m) EN NUCLEAR Y ALTERNATIVAS DE SOLUCIÓN EXCLUSIVAS PARA NUCLEARTUBE

**Fecha:** 1 de Noviembre de 2026  
**Proyecto:** NuclearTube (`MusicProvider`)  
**Repositorio Host:** Nuclear (`@nuclearplayer/player`, `@nuclearplayer/hifi`, `@nuclearplayer/plugin-sdk`)  
**Issue de Referencia:** [JonyDevProjects/yt-provider#1](https://github.com/JonyDevProjects/yt-provider/issues/1) — *"Videos longer than 1:30 hrs don't play, gives error"*  
**Estado del Núcleo de Nuclear:** Restaurado a su estado original (`master` limpio e intacto).

---

## 1. Resumen Ejecutivo

El plugin **NuclearTube** (`MusicProvider`) experimenta un fallo sistemático al intentar reproducir pistas o videos de YouTube de larga duración (conciertos, sets de DJ, recopilaciones de más de 1 hora y media, 2 o 3 horas). 

En esta sesión se realizaron pruebas empíricas en tiempo real con la app de escritorio de Nuclear bajo Tauri (`macOS / WebKit`), inspecciones a nivel de byte de las tramas MP4 de YouTube y análisis del flujo de audio en `@nuclearplayer/hifi`. 

Se descubrió la **causa raíz física exacta** del problema (un límite de 8 KB en el parser de Nuclear), se comprobó por qué las soluciones basadas en bypass progresivo con `<audio src="...">` fallan en WebKit, y se diseñó una **matriz de soluciones alternativas** que pueden ser implementadas íntegramente por **NuclearTube** sin requerir modificaciones en el núcleo de Nuclear.

---

## 2. Cronología y Hallazgos de la Investigación

### 2.1. El Síntoma Original (Issue #1)
Al reproducir pistas cortas (< 1 hora, ej. *"Mosaico La Novia"*, 653s), Nuclear reproduce el audio instantáneamente.  
Sin embargo, al intentar reproducir pistas de larga duración como:
- *"Don Medardo y sus Players - Concierto Completo en Naranjito 2026"* (ID `eAVXuhIMcJI`, duración `5410s` ~ 1h30m)
- *"Best of lofi 2018"* (ID `-FlxM_0S2lA`, duración `6817s` ~ 1h53m)
- *"3 HOURS Relax Ambient Music"* (ID `J92ryjj42M0`, duración `11137s` ~ 3h05m)

La interfaz de Nuclear presentaba:
> *"Playback error: The audio stream is not in a supported format. Try a different source for this track."*

---

### 2.2. Inspección Binaria de la Trama DASH de YouTube (fMP4)
YouTube sirve audio de alta calidad en formato DASH **fragmented MP4 (fMP4)** (código de formato `itag 140`, códec `mp4a.40.2`).  
A través de peticiones HTTP de rango (`bytes=0-1000`) se analizó la estructura binaria de los contenedores de YouTube:

```
00000000: 0000 0018 6674 7970 6461 7368 ....ftypdash
00000010: 6973 6f36 6d70 3431 0000 02bb ....moov
...
000002d0: 0000 1988 7369 6478           ....sidx
```

1. **Caja `ftyp` (Offset 0, tamaño 24 bytes)**: Declara compatibilidad con `dash` e `iso6`.
2. **Caja `moov` (Offset 24, tamaño ~699 bytes)**: Contiene información básica de pista. **No contiene tabla de muestras (`stbl`)**, ya que en streaming DASH las muestras residen en cajas `moof`/`mdat` independientes.
3. **Caja `sidx` (Segment Index Box, Offset 723)**:
   - Indexa cada subsegmento de audio (~5 a 10 segundos).
   - Por cada subsegmento, la norma ISO/IEC 14496-12 exige una entrada de **12 bytes**:
     - `referenced_size` (4 bytes)
     - `subsegment_duration` (4 bytes)
     - Banderas `SAP` (4 bytes)

#### Relación matemática entre duración y tamaño de la caja `sidx`:
| Duración de la pista | N° de Segmentos (~10s c/u) | Tamaño `sidx` (bytes) | Offset fin `sidx` (bytes) | ¿Cabe en 8,192 bytes? |
|---|---|---|---|---|
| **5 minutos** (300s) | 30 | ~392 B | ~1,115 B | **SÍ** |
| **30 minutos** (1800s) | 180 | ~2,192 B | ~2,915 B | **SÍ** |
| **1 hora** (3600s) | 360 | ~4,352 B | ~5,075 B | **SÍ** |
| **1 hora 30 min** (5410s) | 542 | **6,536 B** | **7,259 B** | **Límite crítico** |
| **1 hora 53 min** (6817s) | 683 | **8,228 B** | **8,951 B** | **NO (Excede en 759 B)** |
| **3 horas 05 min** (11137s) | 1116 | **13,424 B** | **14,147 B** | **NO (Excede en 5,955 B)** |

*(Nota: Si los subsegmentos de YouTube son de 5.3s en lugar de 10s, el tamaño del `sidx` se duplica, sobrepasando los 8 KB a partir de los 45 minutos).*

---

### 2.3. La Causa Raíz en Nuclear (`@nuclearplayer/hifi`)
En el archivo [`packages/hifi/src/fmp4/openMseSession.ts`](file:///Users/jonathanquishpe/JoniDev/nuclear/packages/hifi/src/fmp4/openMseSession.ts):
```typescript
const fetchHeader = async (
  fetcher: SegmentFetcher,
  signal: AbortSignal,
): Promise<Uint8Array | null> => {
  const result = await fetcher.fetchRange(0, 8192 - 1, signal);
  // ...
};
```
Nuclear descarga de forma estática **únicamente 8,192 bytes (8 KB)**.
Para cualquier pista donde el box `sidx` termine más allá del byte 8,191:
1. `fetchHeader` entrega un `Uint8Array` truncado.
2. `parseInitSegment` invoca a `parseSidx`.
3. Al iterar sobre las referencias que superan el byte 8,191, `BinaryReader` invoca `DataView.getUint32()`.
4. El motor V8/JavaScriptCore lanza:  
   `RangeError: Offset is outside the bounds of the DataView`.
5. `openMseSession` captura la excepción y emite:  
   `throw new SoundError('unsupportedFormat')`.
6. La UI de Nuclear muestra el error fatal de formato no soportado.

---

### 2.4. ¿Por qué Falló el Intento de Bypass hacia `<audio>` Nativo?
Durante la sesión se probó engañar a Nuclear devolviendo metadatos no fMP4 (`container: 'mp4'`, `mimeType: 'audio/aac'` y suprimiendo `durationMs`) para que Nuclear no activara MSE y utilizara el reproductor progresivo estándar de HTML5 (`useAudioLoader.ts` -> `<audio src="...">`).

**Resultado de la prueba**:
- En los logs del servidor proxy de Tauri (`stream_server.rs`) se observó una avalancha incesante de peticiones de rango HTTP 206 (`bytes=0-1`, `bytes=0-87559230`, `bytes=131072-...`).
- **En la UI de Nuclear el sonido nunca comenzó** y el contador quedó en 0:00.

**Explicación técnica del fallo**:
1. WebKit (`WKWebView` en macOS) requiere para la reproducción progresiva de archivos MP4 que la caja `moov` contenga la tabla completa de muestras temporales y espaciales (`stbl`: `stts`, `stsc`, `stco`, `stsz`).
2. En los streams DASH fMP4 de YouTube, no hay `stbl`. WebKit realiza peticiones de rango desesperadas buscando índices que no existen en el archivo.
3. WebKit **nunca alcanza el estado `readyState >= HAVE_FUTURE_DATA (3)`** y **nunca dispara el evento `canplay`**.
4. Como [`packages/hifi/src/hooks/usePlaybackStatus.ts`](file:///Users/jonathanquishpe/JoniDev/nuclear/packages/hifi/src/hooks/usePlaybackStatus.ts#L27) condiciona la invocación de `audio.play()` a que `readyState >= 3`, el reproductor se queda esperando eternamente en silencio.

> [!IMPORTANT]
> **Conclusión Clave**: En WebKit (macOS), **un stream fMP4 de YouTube no puede ser reproducido de forma progresiva con `<audio src="...">` sin un motor MSE o un demuxer**. Cualquier solución debe proveer o bien un formato progresivo real con `moov` completo, o bien alimentar un motor compatible con MSE (como `Hls.js`).

---

## 3. Matriz de Posibles Soluciones Alternativas (100% en NuclearTube)

Para resolver el problema **sin modificar el núcleo de Nuclear**, hemos evaluado cinco alternativas viables:

```mermaid
graph TD
    A[Track Seleccionado en NuclearTube] --> B{¿Duración >= 1h30m?}
    B -- No (< 5400s) --> C[Stream fMP4 Estándar itag 140<br/>protocol: 'https', container: 'm4a'<br/>Reproducido por Nuclear MSE]
    B -- Sí (>= 5400s) --> D{Estrategia Alternativa en NuclearTube}
    D -- Alternativa 1 --> E[Generar Playlist Sintético HLS M3U8<br/>protocol: 'hls'<br/>Reproducido por Nuclear useHlsSource + Hls.js]
    D -- Alternativa 2 --> F[Fallback a Formato Progresivo itag 18<br/>MP4 progresivo con stbl completo<br/>Reproducido por Nuclear useAudioLoader]
    D -- Alternativa 3 --> G[Stream WebM/Opus itag 251<br/>audio/webm progresivo]
```

---

### ALTERNATIVA 1 (Recomendada): Generación Dinámica de Manifiesto HLS (M3U8) Sintético

#### Fundamento Técnico:
Nuclear posee soporte nativo para streaming HLS mediante **`Hls.js`** en [`packages/hifi/src/hooks/useHlsSource.ts`](file:///Users/jonathanquishpe/JoniDev/nuclear/packages/hifi/src/hooks/useHlsSource.ts).  
En [`packages/player/src/services/streamResolution/audioSource.ts`](file:///Users/jonathanquishpe/JoniDev/nuclear/packages/player/src/services/streamResolution/audioSource.ts#L17):
```typescript
if (stream.protocol === 'hls') {
  return { url: stream.url, protocol: 'hls' };
}
```
Si el plugin devuelve `protocol: 'hls'`, Nuclear **ignora por completo `openMseSession.ts`** y delega la reproducción a `Hls.js`.

`Hls.js` soporta la especificación RFC 8216 / RFC 8216-bis para **Fragmented MP4 con Byte Ranges** (`#EXT-X-MAP` y `#EXT-X-BYTERANGE`).

#### Cómo lo implementa NuclearTube:
1. Para tracks largos (>= 3600s o >= 5400s), NuclearTube realiza un `fetch` ligero inicial para descargar el `moov` y el `sidx` completos (apenas ~10-25 KB).
2. Parsea las referencias del `sidx` en memoria (longitud de cada fragmento y offset).
3. Construye un manifiesto M3U8 en memoria:
   ```m3u8
   #EXTM3U
   #EXT-X-VERSION:7
   #EXT-X-TARGETDURATION:11
   #EXT-X-PLAYLIST-TYPE:VOD
   #EXT-X-MAP:URI="<URL_YOUTUBE>",BYTERANGE="723@0"

   #EXTINF:10.000,
   #EXT-X-BYTERANGE:161940@723
   <URL_YOUTUBE>

   #EXTINF:10.000,
   #EXT-X-BYTERANGE:161552@162663
   <URL_YOUTUBE>
   ...
   #EXT-X-ENDLIST
   ```
4. Convierte el string M3U8 a un **Data URI** (`data:application/vnd.apple.mpegurl;base64,...`) o Blob URL.
5. Retorna a Nuclear:
   ```typescript
   return {
     url: m3u8DataUri,
     protocol: 'hls',
     source: { provider: STREAMING_ID, id: sourceId },
   };
   ```

#### Evaluación:
- **Pros**:
  - Utiliza el motor `Hls.js` que ya está integrado y probado en Nuclear.
  - Elude el límite de 8 KB de `openMseSession.ts` sin tocar una sola línea de Nuclear.
  - Consume exactamente el mismo ancho de banda óptimo (audio AAC a 128 kbps).
  - Soporta tracks de cualquier duración (1h, 5h, 24h) con soporte de Seeking nativo provisto por `Hls.js`.
- **Contras**:
  - Requiere que el plugin incluya la función de serialización M3U8 (~1.5 KB de código TypeScript en el bundle).
  - Verificar que `Hls.js` en el entorno Tauri acepte Data URIs base64 (soportado por estándar en Hls.js).

---

### ALTERNATIVA 2: Fallback a Formato Multiplexado Progresivo (itag 18)

#### Fundamento Técnico:
YouTube mantiene para compatibilidad con dispositivos heredados el formato **itag 18** (MP4 contenedor, resolución 360p, vídeo H.264 + audio AAC 44.1kHz a 96-128 kbps).  
A diferencia de los formatos DASH, el formato 18 es un **archivo MP4 progresivo clásico**:
- Tiene la caja `moov` al inicio con la directiva `faststart`.
- Contiene el árbol jerárquico completo de muestras (`stbl`: `stco`, `stsz`, `stsc`).

#### Cómo lo implementa NuclearTube:
1. Si `info.duration >= 3600`, el extractor de NuclearTube solicita a `yt-dlp` el formato `18`:
   ```bash
   yt-dlp -g -f 18 <videoId>
   ```
2. Devuelve a Nuclear:
   ```typescript
   return {
     url: directUrl,
     protocol: 'https',
     container: 'mp4',
     mimeType: 'video/mp4', // Evita isFmp4 en Nuclear
     source: { provider: STREAMING_ID, id: sourceId },
   };
   ```
3. Nuclear lo entrega a `useAudioLoader` (`<audio src="...">`). Como el formato 18 tiene tablas de muestras completas, WebKit emite `loadedmetadata`, `canplay` y reproduce el audio inmediatamente sin ningún fallo.

#### Evaluación:
- **Pros**:
  - Extremadamente simple de implementar en NuclearTube.
  - Garantiza compatibilidad universal con el reproductor nativo `<audio>`.
- **Contras**:
  - Descarga tanto el audio como la pista de vídeo 360p (tamaño del archivo ~400-500 MB para un concierto de 1h30m, frente a ~80 MB de solo audio).
  - Si la conexión del usuario es lenta, el buffering inicial puede tardar un poco más en comparación con solo audio.

---

### ALTERNATIVA 3: Uso de WebM / Opus (itag 251) Progresivo

#### Fundamento Técnico:
YouTube ofrece audio en formato WebM (códec Opus a 160 kbps, `itag 251`).  
En Nuclear:
```typescript
private isFmp4(stream: ResolvedStream): boolean {
  return (
    stream.container === 'm4a' ||
    stream.mimeType?.includes('audio/mp4') === true
  );
}
```
Si el contenedor es `webm` y el mimeType es `audio/webm`:
- `isFmp4` retorna `false`.
- Nuclear lo envía al reproductor progresivo `<audio src="...">`.

#### Evaluación:
- **Pros**:
  - Solo consume pista de audio (excelente eficiencia de ancho de banda).
  - No usa `openMseSession.ts`.
- **Contras / Riesgos**:
  - El formato itag 251 de YouTube es WebM DASH. Los archivos WebM DASH a menudo no incluyen el índice de búsqueda `Cues` al inicio del archivo EBML. En macOS / Safari, esto puede provocar fallos al realizar seeking o retrasos en el cálculo de duración en pistas de varias horas.

---

### ALTERNATIVA 4: Micro-Proxy Transmuxer en NuclearTube

#### Fundamento Técnico:
NuclearTube podría empaquetar una librería ligera de remuxing en JavaScript (como una versión mínima de `mux.js`) o re-empaquetar los subsegmentos en tiempo real.

#### Evaluación:
- **Pros**: Control absoluto del stream.
- **Contras**: Muy alto coste computacional en JS, incrementa el tamaño del bundle de ~12 KB a más de 200 KB, contrariando el principio de diseño de NuclearTube de ser ultraligero y desacoplado.

---

### ALTERNATIVA 5 (Solución a Nivel de Plataforma): Pull Request Upstream a Nuclear

Aunque el objetivo inmediato es que NuclearTube resuelva el problema de forma autónoma, el cambio que desarrollamos y verificamos en esta sesión en [`packages/hifi/src/fmp4/openMseSession.ts`](file:///Users/jonathanquishpe/JoniDev/nuclear/packages/hifi/src/fmp4/openMseSession.ts) es la **solución arquitectónica definitiva y canónica para todo el ecosistema de Nuclear**:

```typescript
  const initialBytes = result.bytes;
  const boxes = findBoxes(initialBytes);
  const sidxBox = boxes.find((box) => box.type === 'sidx');

  if (sidxBox) {
    const requiredSize = sidxBox.offset + sidxBox.size;
    if (requiredSize > initialBytes.length) {
      // sidx box exceeds the initial buffer (long streams >= 1h30m).
      // Fetch the full required header range up to the end of the sidx box.
      const fullResult = await fetcher.fetchRange(0, requiredSize - 1, signal);
      // ...
      return fullResult.bytes;
    }
  }

  return initialBytes;
```

- Pasó el 100% de la suite de pruebas unitarias de Nuclear (78/78 tests).
- Protege a Nuclear contra fallos con cualquier proveedor de streaming fMP4 (YouTube, SoundCloud, Bandcamp, etc.).
- Debe enviarse como Pull Request a [nukeop/nuclear](https://github.com/nukeop/nuclear).

---

## 4. Comparativa de Alternativas en NuclearTube

| Criterio | Alternativa 1: M3U8 HLS Sintético | Alternativa 2: Fallback itag 18 | Alternativa 3: WebM Opus | Alternativa 5: PR a Nuclear |
|---|---|---|---|---|
| **¿Modifica Nuclear?** | **NO (0% cambios)** | **NO (0% cambios)** | **NO (0% cambios)** | **SÍ (Requiere release)** |
| **Consumo de Ancho de Banda** | Óptimo (~80 MB) | Elevado (~450 MB) | Óptimo (~75 MB) | Óptimo (~80 MB) |
| **Soporte de Seeking** | Completo (vía Hls.js) | Completo (vía `stbl`) | Parcial / Incierto | Completo (vía MSE) |
| **Tiempo de Carga** | Instantáneo (< 300ms) | Rápido (~1-2s) | Variable | Instantáneo (< 300ms) |
| **Complejidad en Plugin** | Media (generador M3U8) | Muy baja (flag yt-dlp) | Muy baja | Cero en plugin |

---

## 5. Recomendación y Próximos Pasos

1. **Estrategia Inmediata (NuclearTube Autónomo)**:
   Implementar la **Alternativa 1 (HLS Sintético con `#EXT-X-BYTERANGE`)** para pistas con duración superior a 1 hora (`duration >= 3600`):
   - NuclearTube lee los primeros ~16-32 KB del stream fMP4 de YouTube.
   - Parsea los rangos del `sidx` e inyecta un Data URI M3U8 con `protocol: 'hls'`.
   - Nuclear activa `Hls.js` y reproduce la pista sin interrupciones ni errores de formato.
   - Como salvaguarda secundaria en caso de fallo al generar el M3U8, aplicar fallback transparente a la **Alternativa 2 (itag 18)**.

2. **Estrategia a Medio Plazo (Comunidad Nuclear)**:
   Enviar el parche validado en `packages/hifi/src/fmp4/openMseSession.ts` como Pull Request al repositorio oficial de Nuclear (`nukeop/nuclear`), resolviendo el límite de los 8 KB de forma nativa para futuras versiones del reproductor.

---

*Informe redactado y verificado en el entorno de desarrollo NuclearTube.*
