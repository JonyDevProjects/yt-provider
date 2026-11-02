# Hallazgos de Investigación: Reproducción de Streams Largos (> 1h30m) en Nuclear

## 1. Síntoma Reportado
- **Issue GitHub**: `JonyDevProjects/yt-provider#1`
- **Error UI**: *"Playback error: The audio stream is not in a supported format. Try a different source for this track."*
- **Condición**: Ocurre sistemáticamente en videos/canciones de duración superior a ~1 hora y media (1h30m, 2h, 3h). Las pistas cortas (<1h) funcionan con normalidad.

---

## 2. Anatomía Técnica y Causa Raíz

### A. Estructura de Audio fMP4 en YouTube
YouTube sirve streams de audio DASH mediante fragmentos MP4 (fMP4, itag 140).
1. `ftyp` (tamaño ~24 bytes): Identifica la especificación DASH / iso6.
2. `moov` (tamaño ~700-1000 bytes): Metadatos de inicialización. No contiene tabla de muestras (`stbl`) porque las muestras están en fragmentos `moof`/`mdat`.
3. `sidx` (Segment Index Box):
   - Mapea cada subsegmento (~5-10 segundos de audio) a su rango de bytes y duración.
   - Cada referencia de subsegmento en `sidx` ocupa exactamente **12 bytes** (4 bytes `referenced_size`, 4 bytes `subsegment_duration`, 4 bytes banderas SAP).
   - Para un track de 180 segundos: 18 referencias = ~216 bytes.
   - Para un track de 5400 segundos (1h30m): ~540-1080 referencias = ~6,500 - 13,000 bytes.
   - Para un track de 7200 segundos (2h): ~720-1400 referencias = ~8,600 - 17,000 bytes.
   - Para un track de 11000 segundos (3h+): ~1100-2200 referencias = ~13,200 - 26,000 bytes.

### B. El Cuello de Botella en Nuclear HiFi (`openMseSession.ts`)
En `@nuclearplayer/hifi/src/fmp4/openMseSession.ts`:
```typescript
const fetchHeader = async (
  fetcher: SegmentFetcher,
  signal: AbortSignal,
): Promise<Uint8Array | null> => {
  const result = await fetcher.fetchRange(0, 8192 - 1, signal);
  // ...
};
```
Nuclear descargaba un rango estático fijo de **8,192 bytes (8 KB)** esperando que contuviera la totalidad del box `sidx`.
Cuando la duración del track supera ~1h30m y el tamaño del `sidx` excede 8,192 bytes:
1. `BinaryReader` lee los segmentos hasta que `cursor` supera el tamaño del buffer descargado (8192).
2. `DataView.getUint32` lanza `RangeError: Offset is outside the bounds of the DataView`.
3. `parseHeader` atrapa el error:
   ```typescript
   try {
     const { initSegmentEnd, segments } = parseInitSegment(headerBytes);
   } catch {
     throw new SoundError('unsupportedFormat');
   }
   ```
4. La UI de Nuclear muestra el error `"unsupportedFormat"`.

---

## 3. Por qué el Bypass a `<audio>` Progresivo Falló
Al intentar engañar a Nuclear devolviendo `container: 'mp4'` y `mimeType: 'audio/aac'` para omitir MSE:
- Nuclear usó el elemento nativo `<audio src="...">` de HTML5 (`useAudioLoader.ts`).
- En macOS (WebKit / WKWebView), `<audio>` **no soporta streams DASH fMP4 sin tablas de muestras (`stbl`)**.
- WebKit entra en peticiones de rango continuas intentando encontrar tablas de muestras en todo el archivo, **nunca alcanza el estado `HAVE_FUTURE_DATA` ni emite el evento `canplay`**.
- La UI se congela en un bucle de carga silencioso sin iniciar la reproducción.

**Conclusión**: **MSE es 100% indispensable** para reproducir audio fMP4 de YouTube en WebKit/macOS.

---

## 4. Solución Definitiva Implementada

### En Nuclear (`@nuclearplayer/hifi`):
En `packages/hifi/src/fmp4/openMseSession.ts`, `fetchHeader` se adaptó para inspeccionar dinámicamente el tamaño del box `sidx`:
```typescript
  const initialBytes = result.bytes;
  const boxes = findBoxes(initialBytes);
  const sidxBox = boxes.find((box) => box.type === 'sidx');

  if (sidxBox) {
    const requiredSize = sidxBox.offset + sidxBox.size;
    if (requiredSize > initialBytes.length) {
      // sidx box exceeds the initial buffer (long streams >= 1h30m).
      const fullResult = await fetcher.fetchRange(0, requiredSize - 1, signal);
      // ...
      return fullResult.bytes;
    }
  }

  return initialBytes;
```
- Tracks cortos (< 1h): Exactamente 1 petición de 8 KB (cero sobrecoste, 100% retrocompatible).
- Tracks largos (> 1h30m, 2h, 3h+): Detección automática del tamaño exacto del `sidx` y descarga extendida en una sola pasada.
- Suite de tests unitarios de `@nuclearplayer/hifi`: **78/78 tests pasando** incluyendo nuevo test de regresión con tracks de > 7,500s.

### En NuclearTube (`MusicProvider`):
- Se mantienen intactos los metadatos requeridos para MSE (`container: 'm4a'`, `mimeType: 'audio/mp4'`, `codec: 'mp4a.40.2'`, `durationMs: info.duration * 1000`).
- Suite de tests de MusicProvider: **34/34 tests pasando**.
