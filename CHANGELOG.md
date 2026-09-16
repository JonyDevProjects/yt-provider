# Changelog

## v1.1.0 (2026-09-15)

### Added
- **YouTube Mobile Scraper**: Scraping contra `m.youtube.com` como Tier 1 en la cadena de búsqueda
- **Tiered Fallback Architecture**: Cadena mobile → desktop → yt-dlp para resiliencia
- **`decodeHexEscapes()`**: Decodificador de hex escapes (`\xNN`) del HTML mobile de YouTube
- **`parseMobileYoutubeSearchHtml()`**: Parser para `videoWithContextRenderer` (mobile)
- **`scrapeMobileYoutube()`**: Fetch con User-Agent de iPhone Safari
- **Search Benchmark**: `benchmarks/search-scraper.ts` para comparar mobile vs desktop
- **SDD Methodology**: `docs/METHODOLOGY.md` con ciclo de vida de 6 fases, ADRs, y matrices de trazabilidad

### Improved
- **Latencia de búsqueda**: 1.2x-2.3x más rápido con YouTube Mobile (716-819ms vs 867-1895ms)
- **Payload reducido**: 56% menos datos (570-583KB vs 1366-2637KB)
- **Documentación**: Todos los planes actualizados con requisitos formales (FR-XXX), ADRs, y trazabilidad

### Fixed
- Parser de YouTube Mobile corrige problemas de codificación hex que causaban fallos de JSON.parse

### Removed
- `docs/future-roadmap/` (fuera de alcance: age-restriction, Spoti5, CI/CD)

### Technical Details
- Branch: `feat/youtube-mobile-scraper` → `develop` → `main`
- Tests: 32/32 passing
- Bundle: 12.17KB
- TypeScript: 0 errors

---

## v1.0.0 (2026-08-18)

### Added
- Plugin Nuclear con StreamingProvider, PlaylistProvider, MetadataProvider
- Búsqueda de tracks via `api.Ytdlp.search()`
- Streaming de audio via `api.Ytdlp.getStream()`
- Extracción de playlists via `api.Ytdlp.getPlaylist()`
- Caché LRU para URLs de stream
- Fix "Restart After Install" (registro en `onEnable`)

### Technical Details
- Bundle: 26.41KB → 12.17KB (after optimizations)
- Tests: 23 → 32
