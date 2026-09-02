# AGENTS.md

Directrices para agentes de codificación de IA que trabajan en el proyecto NuclearTube (Eje 1).

## Descripción del Proyecto

NuclearTube es un Plugin oficial de TypeScript para el reproductor de música **Nuclear** (`@nuclearplayer/plugin-sdk`) que provee búsqueda de alta velocidad, extracción y resolución de streams de audio (`yt-dlp` / scraper isomórfico) y almacenamiento en caché LRU en memoria RAM (`lru-cache`).

El plugin está completamente desacoplado de frameworks HTTP, se empaqueta de forma autónoma con `tsup` (bundle ultraligero de ~9 KB sin dependencias externas en runtime) y genera el paquete oficial `plugin.zip` para la Nuclear Plugin Store.

## Comandos del Proyecto

```bash
# Instalación de dependencias
npm install

# Compilación del bundle del plugin
npm run build:plugin

# Generación del asset de release para Nuclear Store (plugin.zip)
npm run package

# Ejecutar tests automáticos
npm test
npm run test:e2e

# Benchmarking de latencia y rendimiento
npm run benchmark:all
```

## Reglas de Estilo de Código y TypeScript

- **Tipo de Módulo**: El proyecto usa ESM (`"type": "module"` en package.json). **Es obligatorio usar la extensión `.js` en todas las importaciones locales** de archivos TypeScript (por ejemplo: `import { getPlatformInfo } from './ytdlpSetup.js';`).
- **Desacoplamiento (Prioridad Máxima)**: La lógica core (`ytdlpWrapper.ts`, parsing, caching) NO DEBE depender de frameworks de servidor HTTP (como Express.js). Express es solo una capa temporal. Todo debe estar preparado para consumirse como librería.
- **Testing**: Las pruebas se realizan mediante **Vitest** y **Playwright**. Mantenemos el test suite al 100% verde tras cada cambio.

## El Eje 1: Plugin para Nuclear

El objetivo actual del proyecto es:
1. Extraer la lógica pura de obtención de metadata y streams.
2. Adaptar la interfaz a los estándares del `@nuclearplayer/plugin-sdk`.
3. Empaquetar todo el proyecto como un plugin independiente de Nuclear, permitiéndole a Nuclear usar yt-dlp y yt-search.

- **Ubicación de Referencia**: El código base original de Nuclear se encuentra en el repositorio hermano `../nuclear` (o `~/JoniDev/nuclear`).
- Cuando diseñes nuevas funciones, interfaces o flujos de trabajo, **DEBES revisar el código de Nuclear**. En especial:
  - `packages/plugin-sdk/` para entender cómo se declaran los tipos de plugins y cómo retornan la información.
  - `packages/player/src-tauri/src/ytdlp.rs` para ver cómo el backend oficial de Nuclear consume `yt-dlp`.
- Consulta el skill `nuclear-reference` para más detalles.

### Protocolo de Pruebas Manuales en Nuclear (DevTools)

Para probar este y cualquier otro plugin en el entorno real de Nuclear:
1. **Ejecutar Nuclear en modo escritorio con Tauri**:
   ```bash
   cd ../nuclear/packages/player
   pnpm tauri dev
   ```
   *(No usar solo `npm run dev` ni el navegador web directamente, ya que se requiere el backend Rust para habilitar `isTauri` y las llamadas nativas `http_fetch` / `ytdlp`)*.
2. **Inspeccionar la Consola**:
   - Abrir DevTools en la ventana de Nuclear con **`Cmd + Option + I`** (o F12).
   - Revisar la pestaña **Console** para verificar los logs de ciclo de vida (`[Plugin] loaded/enabled`), logs del core (`[Core:Scraper]`), fallbacks y resolución/hits de caché (`[cache] Stream URL cache HIT/MISS`).
3. **Instalación de Plugins**:
   - Para cargar plugins desde la UI ("Add Plugin"), seleccionar siempre una carpeta externa de staging limpia (ej. `../music-provider-plugin` o `~/music-provider-plugin`) que contenga únicamente el bundle compilado (`index.js`) y el `package.json`, evitando directorios con archivos de desarrollo `.ts` o `node_modules`.
   - Evitar enviar cabeceras manuales `Accept-Encoding: gzip, deflate, br` en `api.Http.fetch`, ya que `reqwest` en Rust no descomprime automáticamente a menos que tenga habilitado el feature en Cargo.toml.

## Ecosistema configurado (Gentle-AI inspired)

Este proyecto tiene configurados los siguientes componentes del ecosistema:

### MCP Servers
| Servidor | Propósito | Comando de setup |
|---|---|---|
| **Engram** | Memoria persistente del proyecto | `cmd mcp add engram -- engram mcp` |

### Skills instalados
- `sdd-workflow` — Ciclo SDD completo (diseño → implementación → verificación)
- `music-provider` — Guía de integración con yt-dlp
- `nuclear-reference` — Referencia cruzada con el repositorio Nuclear
