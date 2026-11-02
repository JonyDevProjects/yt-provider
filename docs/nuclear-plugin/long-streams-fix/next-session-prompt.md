# Prompt para Siguiente Sesión: Fix de Reproducción de Streams Largos (Issue #1)

## Contexto
Trabajando en la rama `fix/long-stream-playback`. Se investigó y diagnosticó la causa del error *"The audio stream is not in a supported format"* reportado en GitHub Issue #1 para pistas de más de 1 hora y media. La solución SDD está documentada en `docs/nuclear-plugin/long-streams-fix/`.

## Estado Actual
- Documentación SDD creada (`README.md`, `findings.md`, `session-log.md`).
- Implementación de `MSE_MAX_DURATION_SECONDS = 3600` en `src/index.ts`.
- Tests unitarios en `tests/index.test.ts` pasando al 100%.
- Bundle empaquetado en `plugin.zip` y `dist/plugin-staging`.

## Verificación
```bash
npx tsc --noEmit
npx vitest run
npm run package
```
