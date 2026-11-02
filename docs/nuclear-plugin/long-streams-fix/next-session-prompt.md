# PROMPT PARA SIGUIENTE SESIÓN: PRUEBAS EN NUCLEAR DEV MODE Y DELEGACIÓN A WORKERS

## Contexto de Arranque
Nos encontramos en el repositorio `MusicProvider` (`NuclearTube`) en la rama `fix/long-stream-playback`.
Se resolvieron las 3 alternativas técnicas para el error de streams largos (> 1h30m, Issue #1). La suite de tests cuenta con **106/106 tests pasando** y el bundle está empaquetado y sincronizado en la carpeta de staging limpia `/Users/jonathanquishpe/JoniDev/nucleartube-plugin`.

---

## Prompt para Copiar y Pegar al Iniciar la Sesión:

```markdown
Eres "Michael" (god), orquestador autónomo de la oficina de agentes en /Users/jonathanquishpe/JoniDev/MusicProvider/hive.

### MISIÓN:
Ejecutar el protocolo de pruebas manuales y validación en vivo del plugin NuclearTube dentro del entorno de desarrollo de Nuclear (Tauri desktop), monitorizando la consola DevTools, verificando la reproducción de pistas de larga duración (> 1h30m, 2h, 3h), delegando las tareas de monitoreo, análisis y corrección de incidencias a trabajadores especializados mediante spawn-requests.

### CONTEXTO TÉCNICO Y ESTADO ACTUAL:
1. **Solución Implementada**:
   - Alternativa 1 (Campeona): Generación en memoria de playlist sintético HLS (#EXT-X-BYTERANGE) para tracks >= 3600s, eludiendo el límite de 8 KB de openMseSession.ts en Nuclear y delegando a Hls.js (useHlsSource.ts).
   - Alternativa 2 (itag 18 Faststart) y Alternativa 3 (WebM Opus itag 251) como fallbacks automáticos.
   - Selector en tiempo de ejecución: window.__NUCLEARTUBE_STRATEGY__ = 'hls' | 'webm' | 'itag18' | 'auto'.
2. **Ubicación del Plugin Staged**:
   - `/Users/jonathanquishpe/JoniDev/nucleartube-plugin` (contiene solo index.js compilado y package.json, listo para "Add Plugin").
3. **Repositorio Nuclear**:
   - `/Users/jonathanquishpe/JoniDev/nuclear/packages/player`

---

### TAREAS A DELEGAR A WORKERS (Spawn Requests en `hive/spawn-requests/`):

1. **Worker 1: `worker-devrunner` (Tauri Dev Runner & Log Monitor)**
   - **Objetivo**: Levantar Nuclear en modo escritorio con `pnpm tauri dev` en `/Users/jonathanquishpe/JoniDev/nuclear/packages/player`.
   - **Monitoreo**: Supervisar la salida estándar de Rust/Tauri y los logs en consola (`[Plugin]`, `[NuclearTube]`, `[Core:Scraper]`, `[cache]`, peticiones HTTP 206 de rango).
   - **Alertas**: Notificar a god de cualquier error de carga de plugin, fallo de decodificación o advertencias de WebKit.

2. **Worker 2: `worker-streamqa` (Pruebas de Reproducción y Seeking)**
   - **Objetivo**: Probar la reproducción en Nuclear de los 3 tracks críticos de prueba:
     * `eAVXuhIMcJI` (Don Medardo - Concierto Completo, 5410s ~ 1h30m)
     * `-FlxM_0S2lA` (Best of lofi 2018, 6817s ~ 1h53m)
     * `J92ryjj42M0` (3 HOURS Relax Ambient Music, 11137s ~ 3h05m)
   - **Verificaciones**:
     * Comprobar que no salta el error "unsupportedFormat".
     * Tiempo de inicio de buffering (< 2 segundos).
     * Realizar saltos temporales (seeking) a 15m, 45m, 1h15m y 2h.
     * Evaluar la respuesta bajo las distintas estrategias alternando `window.__NUCLEARTUBE_STRATEGY__`.

3. **Worker 3: `worker-hotfix` (Diagnóstico y Corrección de Incidencias en Caliente)**
   - **Objetivo**: Si durante las pruebas surge cualquier anomalía (ej. cálculo de offsets de sidx desfasado por 1 byte, problemas con el mime-type en el Data URI, headers HTTP de YouTube, o compatibilidad de Hls.js en macOS):
     * Aislar la causa raíz con tests de reproducción.
     * Modificar el módulo correspondiente en `src/core/`.
     * Re-empaquetar el plugin con `npm run package` para actualizar `/Users/jonathanquishpe/JoniDev/nucleartube-plugin`.
     * Ejecutar `npm test` para asegurar que el suite continúe 100% verde.

---

### INSTRUCCIONES DE ORQUESTACIÓN:
- Revisa `fleet.json` y `tasks.json`.
- Registra las tareas en `hive/tasks.json` bajo el prefijo `MPR`.
- Despacha a los trabajadores mediante contratos formales (Objective, Output, Tools, Boundaries).
- Mantén actualizado `board.md` y `handoff.md` a medida que se reciban reportes de los workers.
```
