# Fix del Bug "Restart After Install" en el Plugin Nuclear de MusicProvider

**ID**: PL-002
**Spec**: `docs/nuclear-plugin/restart-fix/spec.md` (ver abajo)
**Fecha**: 2026-08-18
**Estado**: Complete
**Metodología**: SDD v1.0
**Severidad**: Media

---

## 1. Requisitos (Spec)

### Contexto
Tras cargar o instalar el plugin `MusicProvider` en Nuclear, la fuente **no aparece inmediatamente** disponible. El usuario se ve obligado a **reiniciar completamente** la aplicación.

### Requisitos Funcionales

| ID | Requisito | Prioridad | Criterio de Aceptación |
|----|-----------|-----------|----------------------|
| FR-RF-001 | Plugin aparece sin reiniciar después de instalación desde UI | P1 | Proveedor visible en lista de fuentes inmediatamente |
| FR-RF-002 | Plugin funciona correctamente en startup normal | P1 | Búsqueda y playback funcionan |
| FR-RF-003 | Deshabilitar plugin remueve proveedores de la lista | P2 | Proveedor no visible cuando plugin deshabilitado |

### Fuera de Alcance
- Cambios en el código fuente de Nuclear (pluginSDK)
- Soporte para múltiples instancias del mismo plugin

---

## 2. Análisis de Causa Raíz

### Hallazgo 1: `onLoad` nunca se ejecuta durante instalación desde UI

| Code path | `load()` con api | `onLoad` se ejecuta | `onEnable` se ejecuta |
|-----------|-----------------|--------------------|--------------------|
| **App startup** | `loader.load(api)` | ✅ Sí | ✅ Sí |
| **Instalación desde UI** | `managedPluginLoader.load()` SIN api | ❌ **No** | ✅ Sí |

**Mecanismo**: En `PluginLoader.ts` línea 168: `if (instance.onLoad && api)` — el parámetro `api` es opcional.

### Hallazgo 2: `providersHost.register()` notifica a la UI automáticamente

`register()` llama a `notify()` → `useProvidersStore.subscribe()` → UI reactiva. El problema no es la notificación — es que `register` nunca se llama.

### Hallazgo 3: La solución correcta

| Hook | Cuándo se llama | Responsabilidad correcta |
|------|----------------|------------------------|
| `onLoad(api)` | Solo en startup CON api | Inicialización ligera. **NO registrar proveedores.** |
| `onEnable(api)** | Siempre (startup + UI) | **Crear y registrar** proveedores |
| `onDisable(api)` | UI toggle | Desregistrar proveedores |
| `onUnload(api)` | Descarga del plugin | Desregistrar todos |

---

## 3. Decisiones de Diseño (ADR)

### ADR-RF-001: Registro en onEnable vs onDisable

- **Status**: Accepted
- **Contexto**: ¿Debe `onDisable` desregistrar proveedores?
- **Opción A**: `onDisable` desregistra — proveedores no visibles cuando deshabilitado
- **Opción B**: `onDisable` no desregistra — menos overhead pero UX confusa
- **Decisión**: Opción A — patrón más limpio, coincide con comportamiento esperado
- **Consecuencias**: Si usuario rehabilita, `onEnable` vuelve a registrar (idempotente gracias a `Map.set`)

---

## 4. Solución Implementada

### Cambio principal: mover registro de `onLoad` a `onEnable`

```typescript
// ANTES (bug)
onLoad: async (api) => {
  api.Providers.register(streamingProvider);   // ← Nunca se llama desde UI
},
onEnable: async (_api) => {
  console.log(`[${PROVIDER_NAME}] Plugin enabled`);  // ← No registra nada
},

// DESPUÉS (fix)
onEnable: async (api) => {
  api.Providers.register(streamingProvider);   // ← Se llama desde UI y startup
},
onDisable: async (api) => {
  api.Providers.unregister(STREAMING_ID);      // ← Limpia al deshabilitar
},
```

---

## 5. Matriz de Trazabilidad

| Requisito | ADR | Tareas | Tests | Archivos | Resultado |
|-----------|-----|--------|-------|----------|-----------|
| FR-RF-001 | ADR-RF-001 | T-RF-001 | TC-RF-001 | src/index.ts | ✅ Pass |
| FR-RF-002 | — | T-RF-001 | TC-RF-002 | src/index.ts | ✅ Pass |
| FR-RF-003 | ADR-RF-001 | T-RF-002 | TC-RF-003 | src/index.ts | ✅ Pass |

---

## 6. Tareas

| Tarea | Descripción | Estado | Fecha |
|-------|-------------|--------|-------|
| T-RF-001 | Mover registro de proveedores de onLoad a onEnable | ✅ | 2026-08-18 |
| T-RF-002 | Agregar unregister en onDisable | ✅ | 2026-08-18 |
| T-RF-003 | Actualizar tests (onLoad → onEnable) | ✅ | 2026-08-18 |
| T-RF-004 | Agregar test de registro/desregistro | ✅ | 2026-08-18 |
| T-RF-005 | Verificar npx vitest run | ✅ | 2026-08-18 |
| T-RF-006 | Verificar npx tsc --noEmit | ✅ | 2026-08-18 |

---

## 7. Log de Desviaciones

Ninguna. La solución se implementó según el plan.

---

## 8. Riesgos

| Riesgo | Probabilidad | Impacto | Contingencia |
|--------|-------------|---------|-------------|
| `onEnable` no se llama en algún code path | Baja | Alto | Logging en todos los hooks |
| Doble registro causa duplicados | Media | Baja | `Map.set` es idempotente |
| `onDisable` interfiere con bootstrap | Baja | Medio | `resolveActiveOnBootstrap` se llama antes |

---

## 9. Estructura de Archivos

```
docs/nuclear-plugin/restart-fix/
├── README.md              ← Este archivo (plan + spec + resultados)
├── findings.md            ← Hallazgos técnicos detallados
├── session-log.md         ← Log de sesión por sesión
└── next-session-prompt.md ← Prompt de arranque para siguiente sesión
```

---

## 10. Session Log

### Sesión 1 (2026-08-18) — Investigación y Fix

1. ✅ Leer bug report existente
2. ✅ Leer src/index.ts — identificar registro en onLoad
3. ✅ Leer PluginLoader.ts — confirmar onLoad solo se ejecuta con api
4. ✅ Leer pluginStore.ts — confirmar load() SIN api en UI
5. ✅ Leer providersHost.ts — confirmar register() notifica UI
6. ✅ Mover registro a onEnable + unregister en onDisable
7. ✅ Actualizar tests
8. ✅ Guardar hallazgos en Engram

**Conclusión**: Bug resuelto. Plugin aparece sin reiniciar.
