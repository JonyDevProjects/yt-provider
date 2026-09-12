# Plan: Merge feat/innertube-search-optimization a main

**Fecha**: 2026-09-03
**Objetivo**: Integrar la funcionalidad de búsqueda Innertube al branch principal de forma segura

---

## Contexto Actual

### Estado de las Ramas
| Rama | Commit HEAD | Estado |
|------|-------------|--------|
| `main` | `f2620a7` | Producción |
| `develop` | `f2620a7` | **Identical a main** |
| `feat/innertube-search-optimization` | `dd5beca` | 2 commits adelante |

### Commits Pendientes de Merge
```
dd5beca feat(search): implement Innertube WEB_REMIX search engine with 3-tier fallback and canonical thumbnail resolution
6b1b126 docs: add Innertube JSON search optimization plan
```

### Archivos Afectados (25 archivos, +4815/-21 líneas)
- **Core**: `src/core/innertubeScraper.ts` (nuevo), `src/core/ytScraper.ts`, `src/core/types.ts`, `src/core/index.ts`
- **Entry**: `src/index.ts`
- **Tests**: `tests/core/innertubeScraper.test.ts`, `tests/core/ytScraper.test.ts`, `tests/index.test.ts`
- **Fixtures**: 4 archivos JSON nuevos para mocks Innertube
- **Benchmarks**: 5 archivos nuevos para comparación de latencia
- **Docs**: 3 archivos de documentación de optimización
- **Config**: `package.json` (scripts de benchmark)

---

## Estrategia de Merge

### Por qué crear rama de test
El usuario necesita verificar que los cambios no rompen nada antes de integrar a main. Dado que main y develop están sincronizados, podemos:
1. Crear una rama temporal `test/merge-innertube` desde main
2. Mergear la feature branch
3. Ejecutar todos los tests
4. Si pasa, actualizar develop y finalmente main

---

## Plan de Ejecución

### Paso 1: Crear rama de test desde main
```bash
git checkout main
git pull origin main
git checkout -b test/merge-innertube
```

### Paso 2: Mergear feat/innertube-search-optimization
```bash
git merge feat/innertube-search-optimization --no-edit
```

### Paso 3: Ejecutar suite completa de tests
```bash
# Verificación de tipos
npx tsc --noEmit

# Tests unitarios
npm test

# Verificar que el bundle se genera correctamente
npm run build:plugin

# Verificar que no hay require() problemáticos
grep "require(" dist/index.js || echo "✅ No problematic requires found"

# Verificar que el plugin.zip se genera
npm run package
```

### Paso 4: Verificar integridad del plugin
```bash
# Simular carga del plugin en Nuclear
node -e "
const code = require('fs').readFileSync('dist/index.js','utf8');
const m = {exports: {}};
new Function('exports','module','require',code)(m.exports, m, ()=>{throw new Error('not allowed')});
const plugin = m.exports.default || m.exports;
console.log('Plugin keys:', Object.keys(plugin));
console.log('onLoad:', typeof plugin.onLoad);
console.log('onEnable:', typeof plugin.onEnable);
"
```

### Paso 5: Si todo pasa - Actualizar develop
```bash
git checkout develop
git merge test/merge-innertube --no-edit
git push origin develop
```

### Paso 6: Mergear a main
```bash
git checkout main
git merge develop --no-edit
git push origin main
```

### Paso 7: Limpiar ramas temporales
```bash
git branch -d test/merge-innertube
git push origin --delete test/merge-innertube  # Si se push
```

### Paso 8: Actualizar Plugin en Nuclear Store
Según la documentación oficial de Nuclear (`submitting.md`), **no necesitas PR al registry para actualizar funcionalidad**. Nuclear descarga automáticamente la última versión.

#### 8.1: Preparar Nuevo Release
```bash
# Verificar que el package.json tiene la versión correcta
cat package.json | grep version

# Generar plugin.zip actualizado
npm run package

# Verificar que plugin.zip se generó
ls -la plugin.zip
```

#### 8.2: Crear Release en GitHub
1. Ir a https://github.com/JonyDevProjects/yt-provider/releases
2. Click **"Create a new release"**
3. **Tag**: `v1.1.0` (o incrementar según semver)
4. **Title**: `v1.1.0 - Innertube Search Optimization`
5. **Description**:
   ```markdown
   ## What's New
   - Innertube WEB_REMIX search engine with 3-tier fallback
   - Canonical thumbnail resolution
   - Performance benchmarks and optimization documentation
   
   ## Changes
   - Added `innertubeScraper.ts` for direct YouTube Music API access
   - Updated `ytScraper.ts` with fallback chain: Innertube → HTML → Ytdlp SDK
   - New benchmarking tools for search latency comparison
   ```
6. **Attach**: Subir `plugin.zip` generado
7. Click **"Publish release""

#### 8.3: Verificar Actualización Automática
- Los usuarios verán la actualización en **Settings > Plugins > Store**
- Nuclear descarga la nueva versión automáticamente
- No requiere acción manual del usuario

#### 8.4: Actualizar Metadata en Registry (Solo si es necesario)
Si necesitas cambiar metadata (nombre, descripción, categoría), entonces:
1. Fork https://github.com/NuclearPlayer/plugin-registry
2. Editar `plugins.json` con los cambios
3. Submit PR

**Nota**: Para esta actualización (solo funcionalidad), NO se necesita PR al registry.

---

## Checklist de Verificación

### Antes del Merge
- [ ] Working tree limpio en main
- [ ] No hay cambios pendientes en feat/innertube-search-optimization
- [ ] La feature branch tiene los 2 commits esperados

### Durante el Merge
- [ ] No hay conflictos de merge
- [ ] Los archivos se combinan correctamente

### Después del Merge
- [ ] `npx tsc --noEmit` pasa (0 errores de tipo)
- [ ] `npm test` pasa (todos los tests)
- [ ] `npm run build:plugin` genera dist/index.js
- [ ] Bundle no tiene require() problemáticos
- [ ] `npm run package` genera plugin.zip
- [ ] Plugin simula carga correctamente en Nuclear

### Actualización en Store
- [ ] Versión en package.json actualizada (ej: v1.1.0)
- [ ] plugin.zip generado y verificado
- [ ] Release creado en GitHub con plugin.zip adjunto
- [ ] Nuclear descarga automáticamente la nueva versión

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Conflictos de merge | Baja | Ambas ramas comparten el mismo base, feature branch es lineal |
| Tests fallan después del merge | Media | Ejecutar suite completa antes de merge a main |
| Bundle rompe en Nuclear | Baja | Verificar require() y simular carga del plugin |
| Regresión en funcionalidad existente | Baja | Tests cubren funcionalidad core (search, stream, playlist) |

---

## Archivos Clave para Revisión

### Core (Funcionalidad Nueva)
- `src/core/innertubeScraper.ts` - Motor de búsqueda Innertube
- `src/core/ytScraper.ts` - Cadena de fallback 3-tier
- `src/core/types.ts` - Tipos adicionales

### Entry Point
- `src/index.ts` - Registro del nuevo proveedor

### Tests
- `tests/core/innertubeScraper.test.ts` - Tests del scraper Innertube
- `tests/core/ytScraper.test.ts` - Tests actualizados del scraper

---

## Notas Importantes

1. **main y develop están sincronizados**: Ambos apuntan al mismo commit (`f2620a7`). Esto simplifica el merge.

2. **La feature branch es lineal**: No hay commits divergentes, solo 2 commits adelante de main.

3. **Tests existentes cubren funcionalidad core**: Los tests en `tests/core/` y `tests/index.test.ts` validan search, stream, y playlist.

4. **El plugin ya está en Nuclear Store**: PR #12 fue mergeado. Estos cambios son optimizaciones, no fixes críticos.

5. **Benchmarks son opcionales**: Los archivos de benchmark en la feature branch son para referencia, no afectan funcionalidad.

---

## Comandos de Verificación Rápida

```bash
# Verificar estado antes de empezar
git status
git log --oneline -5

# Ejecutar verificación completa
npx tsc --noEmit && npm test && npm run build:plugin && npm run package

# Verificar que todo está limpio
git status
```

---

## Cronograma Sugerido

1. **Preparación** (2 min): Verificar estado, crear rama de test
2. **Merge** (1 min): Ejecutar merge de feature branch
3. **Tests** (5 min): Ejecutar suite completa de verificación
4. **Integración** (3 min): Actualizar develop y main
5. **Limpieza** (1 min): Eliminar rama temporal
6. **Release** (5 min): Preparar y publicar nuevo release en GitHub

**Total estimado**: ~17 minutos

---

## Firma del Plan

**Autor**: CommandCode
**Fecha**: 2026-09-03
**Versión**: 1.1
**Estado**: ✅ COMPLETADO

---

## Registro de Ejecución

### Ejecutado: 2026-09-03

#### Pasos Completados
1. ✅ Verificar estado y crear rama de test
2. ✅ Mergear feat/innertube-search-optimization (conflictos resueltos)
3. ✅ Ejecutar suite completa de tests (43/43 pasaron)
4. ✅ Verificar integridad del plugin
5. ✅ Actualizar develop
6. ✅ Mergear a main
7. ✅ Limpiar ramas temporales
8. ✅ Push a origin (main y develop actualizados)

#### Conflictos Resueltos
- `package.json`: Se mantuvo versión main (NuclearTube naming + icono custom)
- `assets/icon.svg`: Se mantuvo versión main (icono NuclearTube)

#### Estado Final
- **main**: `2c4a2c9` (Merge feat/innertube-search-optimization into test branch)
- **develop**: `2c4a2c9` (Sincronizado con main)
- **test/merge-innertube**: Eliminada

#### Próximos Pasos (Paso 8 del Plan)
1. Crear release v1.1.0 en GitHub
2. Adjuntar plugin.zip (7 KB)
3. Nuclear descarga automáticamente la nueva versión

### Estado: ✅ PASO 8 COMPLETADO (2026-09-11)

#### Acciones Realizadas
1. ✅ Versión actualizada a 1.1.0 en package.json
2. ✅ plugin.zip regenerado con nueva versión
3. ✅ Commit y push de cambio de versión
4. ✅ Release v1.1.0 creado en GitHub con plugin.zip adjunto

#### Release Details
- **URL**: https://github.com/JonyDevProjects/yt-provider/releases/tag/v1.1.0
- **Tag**: v1.1.0
- **Asset**: plugin.zip (7 KB)
- **Fecha**: 2026-09-11

#### Resultado Final
Nuclear descargará automáticamente la nueva versión (v1.1.0) para todos los usuarios.
No se requiere PR al registry ya que es solo actualización de funcionalidad.

---

## Notas Adicionales

### Proceso de Actualización Automática
Según la documentación oficial de Nuclear (`submitting.md`):
- **No necesitas PR al registry** para actualizar funcionalidad
- **Nuclear descarga automáticamente** la última versión del plugin
- **Solo necesitas PR** si cambias metadata (nombre, descripción, categoría)

### Flujo de Actualización
1. Merge a main → 2. Crear release con plugin.zip → 3. Nuclear actualiza automáticamente

### Ejemplo de Release
```
Tag: v1.1.0
Title: v1.1.0 - Innertube Search Optimization
Assets: plugin.zip (generado con npm run package)
```
