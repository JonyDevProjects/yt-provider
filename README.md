# yt-provider (YouTube Provider for Nuclear)

[![CI](https://github.com/JonyDevProjects/yt-provider/actions/workflows/ci.yml/badge.svg)](https://github.com/JonyDevProjects/yt-provider/actions/workflows/ci.yml)
[![Release](https://github.com/JonyDevProjects/yt-provider/actions/workflows/release.yml/badge.svg)](https://github.com/JonyDevProjects/yt-provider/actions/workflows/release.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/JonyDevProjects/yt-provider/releases/tag/v1.0.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**yt-provider** is a YouTube streaming, metadata, and playlist provider plugin for [Nuclear Music Player](https://nuclear.js.org/) built with `@nuclearplayer/plugin-sdk`.

## Features

- **YouTube Track Search & Metadata**: Track search and discovery using isomorphic scraping without requiring YouTube Data API keys.
- **Direct Stream Playback**: Resolves audio streams directly through Nuclear's native `api.Ytdlp` with safe HTTP range parameters.
- **YouTube Playlists**: Fetches and imports public YouTube playlists by URL.
- **Lightweight Bundle**: Self-contained CommonJS bundle (~9 KB) with zero external runtime dependencies.

## Installation

### From Nuclear Plugin Store
1. Open Nuclear.
2. Navigate to **Settings** > **Plugins** > **Store**.
3. Find **YouTube Provider** (`yt-provider`) and click **Install**.

### Manual Installation (Development)
1. Clone this repository:
   ```bash
   git clone https://github.com/JonyDevProjects/yt-provider.git
   cd yt-provider
   npm install
   ```
2. Build the standalone bundle and package archive:
   ```bash
   npm run package
   ```
3. In Nuclear, go to **Settings** > **Plugins** > **Add Plugin** and select the staging folder (`dist/plugin-staging`).

## Development

```bash
# Install dependencies
npm install

# Build standalone plugin bundle
npm run build:plugin

# Package plugin.zip for Nuclear
npm run package

# Run test suite
npm test
```

## Architecture

- `src/index.ts`: Entry point registering `StreamingProvider`, `PlaylistProvider`, and `MetadataProvider` with `@nuclearplayer/plugin-sdk`.
- `src/core/ytScraper.ts`: Isomorphic YouTube search scraper with fallback handling.
- `src/core/extractor.ts`: Helpers for parsing and normalizing stream and playlist entries.
- `src/core/ndjson.ts`: Streaming line parser for safe playlist processing.
- `scripts/package-plugin.ts`: Generates the official `plugin.zip` containing `index.js` and `package.json`.

### License

MIT
