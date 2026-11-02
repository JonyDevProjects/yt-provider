# Fix de Reproducción de Streams Largos (> 1h30m) en NuclearTube

Este directorio documenta la investigación, hallazgos y alternativas de ingeniería para solucionar el problema reportado en la issue [JonyDevProjects/yt-provider#1](https://github.com/JonyDevProjects/yt-provider/issues/1):
*"Videos longer than 1:30 hrs don't play, gives error & Loading time is very long"*.

---

## Documentación del Módulo

- **[INFORME TÉCNICO COMPLETO Y ALTERNATIVAS](../../INFORME_STREAMS_LARGOS_Y_ALTERNATIVAS.md)**: Estudio exhaustivo de la causa raíz binaria y matriz comparativa de soluciones alternativas que no modifican el núcleo de Nuclear.
- **[Hallazgos de Investigación](findings.md)**: Análisis detallado de las cajas fMP4 de YouTube (`ftyp`, `moov`, `sidx`) y el cuello de botella de los 8 KB en `@nuclearplayer/hifi`.
- **[Registro de Sesión](session-log.md)**: Bitácora cronológica de experimentos, pruebas empíricas con WebKit/Tauri y resultados obtenidos.

---

## Resumen del Diagnóstico

1. **Causa Raíz**:
   - YouTube sirve audio fMP4 DASH (itag 140). Los segmentos se indexan en el box `sidx` a razón de 12 bytes por segmento.
   - En tracks de >1h30m, el `sidx` excede 8,192 bytes.
   - Nuclear HiFi (`openMseSession.ts`) descarga sólo 8,192 bytes fijos, provocando un `RangeError` en `DataView` al parsear el `sidx` truncado y emitiendo `SoundError('unsupportedFormat')`.
2. **Incompatibilidad del Bypass Progresivo**:
   - WebKit (`WKWebView` en macOS) no reproduce fMP4 de YouTube progresivamente con `<audio src="...">` debido a la ausencia de la tabla de muestras `moov/stbl`, quedando congelado sin disparar `canplay`.
3. **Estrategia Elegida para NuclearTube**:
   - Implementar un **manifiesto HLS (M3U8) sintético** con directivas `#EXT-X-BYTERANGE` para pistas largas (`protocol: 'hls'`).
   - Nuclear delega automáticamente la reproducción a su motor integrado `Hls.js`, sorteando el límite de 8 KB de `openMseSession.ts` sin necesidad de alterar el núcleo de Nuclear.
