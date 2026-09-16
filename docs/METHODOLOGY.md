# Metodología de Desarrollo: MusicProvider

**Versión**: 1.0
**Fecha**: 2026-09-15
**Base**: Spec-Driven Development (SDD) + Patrones Propios del Proyecto

---

## 1. Filosofía

Este proyecto sigue **Spec-Driven Development (SDD)** como metodología base, con extensiones propias que responden a las necesidades reales de un proyecto asistido por agentes de IA:

> **Power Inversion**: Las especificaciones generan código; el código no genera especificaciones.

### Principios Fundamentales

1. **Spec antes de Código** — Toda implementación comienza con una especificación escrita
2. **Trazabilidad Bidireccional** — Cada requisito enlaza a diseño, código y evidencia
3. **Puertas de Fase** — No se avanza sin verificación explícita
4. **Test-First** — Los tests se derivan de la spec, no del código
5. **Desviación como Evento de Primera Clase** — Se clasifica, documenta y reconcilia
6. **Aprendizaje Persistente** — Los conocimientos se guardan en Engram

---

## 2. Ciclo de Vida (6 Fases)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 1. REQS     │───▶│ 2. DESIGN   │───▶│ 3. TASKS    │
│ Requisitos  │    │ Diseño      │    │ Tareas      │
└─────────────┘    └─────────────┘    └─────────────┘
       │                                     │
       │            ┌─────────────┐          │
       │            │ 6. DISTILL  │          │
       └────────────│ Aprendizaje │◀─────────┘
                    └─────────────┘
                         │
┌─────────────┐    ┌─────────────┐
│ 4. BUILD    │───▶│ 5. VALIDATE │
│ Construcción│    │ Validación  │
└─────────────┘    └─────────────┘
```

### Fase 1: Requirements (Requisitos)

**Entrada**: Idea / problema / solicitud del usuario
**Salida**: `spec.md` con requisitos formales

#### Template: `spec.md`

```markdown
# [Nombre de la Feature/Fix]

**ID**: [FR-001]
**Fecha**: YYYY-MM-DD
**Autor**: [Usuario/Agente]
**Estado**: Draft | Approved | Implementing | Complete

## Contexto
[Descripción del problema oportunidad en 2-3 oraciones]

## Requisitos Funcionales
| ID | Requisito | Prioridad | Criterio de Aceptación |
|----|-----------|-----------|----------------------|
| FR-001 | [Descripción] | P1/P2/P3 | [Medible, testeable] |

## Requisitos No Funcionales
| ID | Requisito | Umbral |
|----|-----------|--------|
| NFR-001 | Latencia p95 | < 500ms |
| NFR-002 | Payload máximo | < 300KB |

## Fuera de Alcance
- [Lo que explícitamente NO se implementará]

## Preguntas Abiertas
- [ ] [Pregunta que necesita clarificación]
```

#### Checklist de Salida (Gate 1)
- [ ] Todos los requisitos tienen ID y criterio de aceptación medible
- [ ] No quedan marcadores `[NEEDS CLARIFICATION]`
- [ ] Fuera de alcance está definido
- [ ] Requisitos no funcionales tienen umbrales numéricos

---

### Fase 2: Design (Diseño)

**Entrada**: `spec.md` aprobado
**Salida**: `plan.md` + `findings.md` + ADRs

#### Template: `plan.md`

```markdown
# Plan: [Nombre]

**ID**: [PL-001]
**Spec**: [Enlace a spec.md]
**Fecha**: YYYY-MM-DD
**Estado**: Draft | Approved | In Progress | Complete

## Arquitectura
[Diagrama o descripción de la arquitectura propuesta]

## Alternativas Evaluadas
| Alternativa | Pros | Contras | Decisión |
|-------------|------|---------|----------|
| A | ... | ... | ✅/❌ |

## Decisiones de Diseño (ADRs)
| ID | Decisión | Alternativas | Justificación | Consecuencias |
|----|----------|--------------|---------------|---------------|
| ADR-001 | [Qué se decidió] | [Qué se evaluó] | [Por qué] | [Impacto] |

## Plan de Tareas
| Fase | Tarea | Descripción | Estado |
|------|-------|-------------|--------|
| 2.1 | ... | ... | ⬜ |

## Plan de Tests
| Test | Qué valida | Tipo | Archivo |
|------|-----------|------|---------|
| T-001 | [Criterio de aceptación FR-XX] | Unit/Integration/E2E | tests/... |

## Riesgos
| Riesgo | Probabilidad | Impacto | Contingencia |
|--------|-------------|---------|-------------|

## Archivos Relevantes
| Archivo | Propósito | Estado |
|---------|-----------|--------|
```

#### Checklist de Salida (Gate 2)
- [ ] Alternativas documentadas con pros/contras
- [ ] ADRs formalizados (al menos para decisiones arquitectónicas)
- [ ] Plan de tests escrito ANTES de la implementación
- [ ] Cada criterio de aceptación tiene al menos un test asociado
- [ ] Riesgos documentados con contingencias

---

### Fase 3: Tasks (Tareas)

**Entrada**: `plan.md` aprobado
**Salida**: Tareas desglosadas con dependencias

#### Formato de Tareas

Cada tarea debe tener:
- **ID**: T-001, T-002...
- **Dependencias**: Qué tareas deben completarse primero
- **Archivos**: Qué archivos se modifican/crean
- **Verificación**: Cómo se confirma que la tarea está completa

#### Reglas
- Las tareas que afectan los mismos archivos se ejecutan secuencialmente
- Las tareas independientes pueden marcarse como `[P]` (paralelas)
- Cada tarea mapea a al menos un requisito (FR-XXX)

---

### Fase 4: Build (Construcción)

**Entrada**: Tareas desglossadas
**Salida**: Código + Tests + Build verificado

#### Flujo por Tarea

```
1. Marcar tarea como in_progress
2. Escribir test(s) contra el criterio de aceptación
3. Implementar código mínimo para pasar el test
4. Verificar: npx tsc --noEmit && npx vitest run && npx tsup
5. Marcar tarea como completed
6. Actualizar estado en plan.md
```

#### Checklist por Tarea
- [ ] Test(s) escritos antes del código (o durante, nunca después sin justificación)
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npx vitest run` todos pasan
- [ ] `npx tsup` build exitoso
- [ ] Estado actualizado en `plan.md`

---

### Fase 5: Validate (Validación)

**Entrada**: Código implementado
**Salida**: Evidencia de validación + Reconciliación

#### Niveles de Validación

| Nivel | Qué valida | Herramienta |
|-------|-----------|-------------|
| Unit | Funciones aisladas | Vitest |
| Integration | Contrato del plugin | Vitest (mock HttpLike) |
| E2E | Flujo completo en Nuclear | Playwright + Tauri DevTools |
| Benchmark | Rendimiento contra umbrales | `npm run benchmark:search` |
| Manual | Experiencia de usuario | Protocolo en `docs/testing/README.md` |

#### Matriz de Trazabilidad

| Requisito | Test | Archivo | Resultado |
|-----------|------|---------|-----------|
| FR-001 | T-001 | tests/core/ytScraper.test.ts | ✅ Pass |
| NFR-001 | Benchmark | benchmarks/search-scraper.ts | ✅ 716ms < 500ms |

#### Checklist de Validación
- [ ] Todos los tests pasan
- [ ] Benchmark cumple umbrales de NFR
- [ ] Build generado y verificado
- [ ] Matriz de trazabilidad completa

---

### Fase 6: Distill (Aprendizaje)

**Entrada**: Feature completada y validada
**Salida**: Engram persistence + Documentación actualizada

#### Actividades

1. **Engram Persistence** — Guardar aprendizajes clave
   ```bash
   # Patrón de guardado
   Título: [Qué se aprendió]
   Contenido: [Contexto + Hallazgo + Impacto]
   Proyecto: musicprovider
   Tipo: observation
   ```

2. **Deviation Log** — Documentar desviaciones encontradas
   ```markdown
   ### Dev-N: [Título]
   - **Fase**: [En qué fase se detectó]
   - **Plan original**: [Qué se esperaba]
   - **Realidad**: [Qué pasó]
   - **Causa**: [Por qué]
   - **Impacto**: [Alto/Medio/Bajo]
   - **Acción tomada**: [Qué se hizo]
   - **Aprendizaje**: [Qué recordar]
   - **Agente que detectó**: [Quién]
   ```

3. **Session Log** — Actualizar log de sesión
4. **Next-Session Prompt** — Preparar handoff si es necesario
5. **Documentación** — Actualizar README, findings, etc.

---

## 3. Artefactos Únicos del Proyecto

Estos patrones NO existen en SDD estándar y son extensiones propias:

### 3.1 Deviation Logging

**Propósito**: Documentar cada vez que la implementación se desvía del plan.

**Formato**: `Dev-N` donde N es secuencial dentro del plan.

**Campos obligatorios**:
- Fase afectada
- Plan original vs Realidad
- Causa raíz
- Impacto (Alto/Medio/Bajo)
- Acción tomada
- Aprendizaje
- Agente que detectó

**Regla**: Las desviaciones NUNCA se absorben silenciosamente. Siempre se documentan.

### 3.2 Engram Persistence

**Propósito**: Guardar conocimiento durable entre sesiones de agente.

**Cuándo guardar**:
- Al final de cada fase (Gate de salida)
- Cuando se descubre algo inesperado
- Cuando se resuelve un bug complejo
- Cuando se toma una decisión arquitectónica

**Formato**: Observación estructurada con título, contenido y proyecto.

### 3.3 Next-Session Prompt

**Propósito**: Facilitar el handoff entre sesiones de agente.

**Campos**:
- Contexto del estado actual
- Última tarea completada
- Próxima tarea a iniciar
- Archivos relevantes
- Comandos de verificación

### 3.4 Benchmark-Driven Decisions

**Propósito**: Tomar decisiones arquitectónicas basadas en datos medidos, no en suposiciones.

**Flujo**:
1. Definir métricas objetivo en `benchmark-spec.md`
2. Implementar benchmark antes de la feature
3. Ejecutar y capturar resultados
4. Comparar contra umbrales
5. Decidir basado en datos

### 3.5 Tiered Fallback Architecture

**Propósito**: Diseñar sistemas con niveles de degradación graceful.

**Patrón**:
```
Tier 1: [Opción óptima] → Si falla →
Tier 2: [Opción alternativa] → Si falla →
Tier 3: [Último recurso]
```

Cada tier tiene criterios de activación documentados.

---

## 4. Estructura de Directorios

```
docs/
├── METHODOLOGY.md              ← Este archivo
├── nuclear-plugin/
│   ├── IMPLEMENTATION_PLAN.md  ← Plan maestro del proyecto
│   ├── [feature]/
│   │   ├── README.md           ← Plan maestro de la feature
│   │   ├── spec.md             ← Requisitos (Fase 1)
│   │   ├── findings.md         ← Hallazgos de diseño (Fase 2)
│   │   ├── session-log.md      ← Log de sesiones
│   │   └── next-session-prompt.md
│   └── ...
├── optimizations/
│   ├── benchmark-spec.md       ← Especificación de benchmarks
│   └── decision-and-results.md ← Matriz de decisión
├── testing/
│   └── README.md               ← Estrategia de pruebas
└── reference/
    └── ...
```

---

## 5. Puertas de Fase (Gates)

| Gate | Entre qué fases | Checklist obligatorio |
|------|----------------|----------------------|
| **G1** | Requirements → Design | Spec aprobado, criterios medibles, fuera de alcance definido |
| **G2** | Design → Tasks | ADRs documentados, plan de tests escrito, riesgos evaluados |
| **G3** | Tasks → Build | Tareas desglossadas, dependencias mapeadas |
| **G4** | Build → Validate | Todos los tests pasan, build exitoso |
| **G5** | Validate → Distill | Matriz de trazabilidad completa, benchmarks contra umbrales |
| **G6** | Distill → Close | Engram guardado, deviation log actualizado, docs completas |

**Regla**: No se avanza sin pasar el gate. Si un gate falla, se retorna a la fase anterior.

---

## 6. Formato de Requisitos

### IDs Obligatorios

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| Functional Requirement | FR-NNN | FR-001 |
| Non-Functional Requirement | NFR-NNN | NFR-001 |
| Success Criterion | SC-NNN | SC-001 |
| Architecture Decision | ADR-NNN | ADR-001 |
| Task | T-NNN | T-001 |
| Test Case | TC-NNN | TC-001 |
| Deviation | Dev-N | Dev-1 |

### Palabras Clave Normativas (RFC 2119)

- **MUST** / **DEBE**: Requisito obligatorio
- **SHOULD** / **DEBERÍA**: Recomendado, con justificación si no se cumple
- **MAY** / **PUEDE**: Opcional

---

## 7. Anti-Patrones a Evitar

| Anti-Patrón | Descripción | Prevención |
|-------------|-------------|------------|
| **Spec Laundering** | Escribir spec e implementar inmediatamente sin revisión | Respetar puertas de fase |
| **Checkbox Conformance** | Marcar tareas como completas sin evidencia | Exigir evidencia (tests, benchmark) |
| **Silent Deviation** | Absorber cambios sin documentar | Siempre crear Dev-N |
| **Test-After** | Escribir tests después del código sin justificación | Test-first como regla |
| **Stale Contract** | Implementar cambios sin actualizar la spec | Actualizar spec en Fase 6 |
| **Non-Goal Leakage** | Agregar features fuera de alcance sin aprobación | Respetar "Fuera de Alcance" |

---

## 8. Checklist Maestro por Feature

```markdown
## Feature: [Nombre]

### Fase 1: Requirements
- [ ] spec.md creado con FR-XXX y NFR-XXX
- [ ] Criterios de aceptación medibles
- [ ] Fuera de alcance definido
- [ ] Gate 1 aprobado

### Fase 2: Design
- [ ] plan.md creado con arquitectura
- [ ] Alternativas evaluadas con pros/contras
- [ ] ADRs documentados
- [ ] Plan de tests escrito
- [ ] Riesgos documentados
- [ ] Gate 2 aprobado

### Fase 3: Tasks
- [ ] Tareas desglossadas con IDs
- [ ] Dependencias mapeadas
- [ ] Archivos relevantes listados
- [ ] Gate 3 aprobado

### Fase 4: Build
- [ ] Tests escritos (test-first)
- [ ] Código implementado
- [ ] npx tsc --noEmit ✅
- [ ] npx vitest run ✅
- [ ] npx tsup ✅
- [ ] Gate 4 aprobado

### Fase 5: Validate
- [ ] Todos los tests pasan
- [ ] Benchmark contra umbrales
- [ ] Matriz de trazabilidad
- [ ] Gate 5 aprobado

### Fase 6: Distill
- [ ] Engram persistence
- [ ] Deviation log actualizado
- [ ] Session log actualizado
- [ ] Next-session prompt (si aplica)
- [ ] Documentación actualizada
- [ ] Gate 6 aprobado
```
