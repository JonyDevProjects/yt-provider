# Prompt para Siguiente Sesión: YouTube Mobile Scraper

## Contexto
Branch `feat/youtube-mobile-scraper` creada con documentación scaffold. Plan aprobado en `docs/nuclear-plugin/youtube-mobile/README.md`.

## Estado Actual
- Fase 1 completada (branch + documentación)
- Fases 2-8 pendientes

## Próxima Tarea
Implementar Fase 2: Parser Mobile en `src/core/ytScraper.ts`

### Archivos a Modificar
- `src/core/ytScraper.ts` — Agregar `decodeHexEscapes()` y `parseMobileYoutubeSearchHtml()`

### Referencias
- `docs/nuclear-plugin/youtube-mobile/findings.md` — Estructura mobile y mapeo de campos
- `docs/nuclear-plugin/youtube-mobile/README.md` — Plan completo con especificaciones

### Verificación
```bash
npx tsc --noEmit  # Sin errores de tipo
npx vitest run    # Tests existentes pasan
```
