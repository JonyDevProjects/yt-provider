# Hallazgos Técnicos: YouTube Mobile vs Desktop

**Fecha**: 2026-09-15

---

## 1. Estructura JSON: Mobile vs Desktop

### Desktop (`www.youtube.com`)

```
ytInitialData (JSON crudo)
└── contents
    └── twoColumnSearchResultsRenderer
        └── primaryContents
            └── sectionListRenderer
                └── contents[N]
                    └── itemSectionRenderer
                        └── contents[]
                            └── videoRenderer  ← cada resultado
```

### Mobile (`m.youtube.com`)

```
ytInitialData (string con hex escapes)
└── contents
    └── sectionListRenderer  ← NO hay twoColumnSearchResultsRenderer
        └── contents[N]
            └── itemSectionRenderer
                └── contents[]
                    └── videoWithContextRenderer  ← cada resultado
```

**Diferencia clave**: Mobile NO tiene `twoColumnSearchResultsRenderer` ni `primaryContents`. La estructura es más directa.

---

## 2. Codificación de ytInitialData

### Desktop
```javascript
var ytInitialData = {"responseContext":...};</script>
```
JSON crudo, parseable directamente con `JSON.parse()`.

### Mobile
```javascript
var ytInitialData = '\x7b\x22responseContext\x22:...\x7d';
```
String literal single-quoted con hex escapes. Requiere decoding antes de `JSON.parse()`.

**Mapeo de hex escapes comunes**:
| Hex | Carácter | Hex | Carácter |
|---|---|---|---|
| `\x7b` | `{` | `\x7d` | `}` |
| `\x22` | `"` | `\x5b` | `[` |
| `\x5d` | `]` | `\x3a` | `:` |
| `\x2c` | `,` | `\x5c` | `\` |

---

## 3. Mapeo de Campos: videoRenderer vs videoWithContextRenderer

| Campo | Desktop (`videoRenderer`) | Mobile (`videoWithContextRenderer`) |
|---|---|---|
| Video ID | `v.videoId` | `v.videoId` (igual) |
| Título | `v.title.runs[0].text` | `v.headline.runs[0].text` |
| Canal | `v.ownerText.runs[0].text` | `v.shortBylineText.runs[0].text` |
| Duración | `v.lengthText.simpleText` | `v.lengthText.runs[0].text` |
| Thumbnail | `v.thumbnail.thumbnails` | `v.thumbnail.thumbnails` (igual) |

---

## 4. Rendimiento Medido (3 runs promedio)

| Métrica | Desktop | Mobile | Delta |
|---|---|---|---|
| HTML size | 1,319 KB | 573 KB | **-56%** |
| Fetch time | 2,184 ms | 835 ms | **-62%** |
| Parse time | 20.2 ms | 14.4 ms | **-29%** |
| Total time | 2,207 ms | 851 ms | **-62%** |
| Videos found | 19 | 19 | 0% |

**Conclusión**: Mobile es 2.6x más rápido y usa 56% menos datos, con la misma cantidad de resultados.

---

## 5. User-Agent Requerido

```
Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1
```

Este header identifica la petición como iPhone Safari, lo que hace que YouTube sirva la versión mobile.

---

## 6. Regex para Extraer ytInitialData

### Desktop (4 patrones, orden de preferencia)
```regex
/var ytInitialData = (\{.+?\});<\/script>/
/ytInitialData\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/
/window\["ytInitialData"\]\s*=\s*(\{.+?\});/
/ytInitialData\s*=\s*(\{.+?\});/
```

### Mobile (1 patrón)
```regex
/var ytInitialData = '(.+?)';/
```

---

## 7. Edge Cases Conocidos

1. **Live streams**: Pueden no tener `lengthText` → duración será 0
2. **Shorts**: Pueden usar un renderer diferente → ignorados por el parser
3. **Age-restricted**: Pueden no aparecer en mobile → fallback a desktop
4. **Consent wall**: Sin User-Agent correcto, YouTube muestra consent page sin `ytInitialData`
