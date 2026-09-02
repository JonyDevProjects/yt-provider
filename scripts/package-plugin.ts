import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const STAGING_DIR = path.join(ROOT_DIR, 'dist', 'plugin-staging');
const EXTERNAL_STAGING_DIR = path.resolve(ROOT_DIR, '..', 'nucleartube-plugin');
const OFFICIAL_ZIP = path.join(ROOT_DIR, 'plugin.zip');
const LEGACY_ZIP = path.join(ROOT_DIR, 'nucleartube.zip');

async function packagePlugin() {
  console.log('📦 Starting NuclearTube Plugin packaging...');

  // 1. Build bundle with tsup
  console.log('🔨 Building standalone bundle with tsup...');
  execSync('npm run build:plugin', { cwd: ROOT_DIR, stdio: 'inherit' });

  const bundlePath = path.join(DIST_DIR, 'index.js');
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Bundle not found at ${bundlePath}`);
  }
  const bundleStat = fs.statSync(bundlePath);
  console.log(`✅ Bundle generated: ${bundlePath} (${Math.round(bundleStat.size / 1024)} KB)`);

  // 2. Read and extract clean package.json manifest for Nuclear
  const rootPkgPath = path.join(ROOT_DIR, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

  const cleanManifest = {
    name: rootPkg.name || 'nucleartube',
    version: rootPkg.version || '1.0.0',
    description: rootPkg.description || 'High-performance YouTube music search, playlist extraction, and streaming provider for Nuclear utilizing yt-dlp',
    author: rootPkg.author || 'iJonyDev',
    main: 'index.js',
    category: 'streaming',
    categories: ['streaming', 'metadata'],
    nuclear: rootPkg.nuclear || {
      displayName: 'NuclearTube',
      category: 'streaming',
      categories: ['streaming', 'metadata'],
      permissions: [],
      icon: rootPkg.nuclear?.icon
    }
  };

  // 3. Prepare Staging directory
  if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  const stagingBundlePath = path.join(STAGING_DIR, 'index.js');
  const stagingPkgPath = path.join(STAGING_DIR, 'package.json');

  fs.copyFileSync(bundlePath, stagingBundlePath);
  fs.writeFileSync(stagingPkgPath, JSON.stringify(cleanManifest, null, 2) + '\n', 'utf8');

  console.log(`📁 Staging directory prepared at ${STAGING_DIR}`);

  // Also sync external dev staging folder if available for Nuclear manual testing
  try {
    for (const extDir of [EXTERNAL_STAGING_DIR, path.resolve(ROOT_DIR, '..', 'music-provider-plugin')]) {
      if (fs.existsSync(extDir)) {
        fs.rmSync(extDir, { recursive: true, force: true });
      }
      fs.mkdirSync(extDir, { recursive: true });
      fs.copyFileSync(bundlePath, path.join(extDir, 'index.js'));
      fs.writeFileSync(path.join(extDir, 'package.json'), JSON.stringify(cleanManifest, null, 2) + '\n', 'utf8');
      console.log(`🔄 Synced clean staging to ${extDir}`);
    }
  } catch (err: any) {
    console.warn(`⚠️ Could not sync external staging dir: ${err.message}`);
  }

  // 4. Create ZIP archives (official plugin.zip and legacy alias)
  for (const zipPath of [OFFICIAL_ZIP, LEGACY_ZIP]) {
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    const zip = new AdmZip();
    zip.addLocalFile(stagingBundlePath);
    zip.addLocalFile(stagingPkgPath);
    zip.writeZip(zipPath);

    const zipStat = fs.statSync(zipPath);
    console.log(`📦 Zip Archive created: ${zipPath} (${Math.round(zipStat.size / 1024)} KB)`);

    // Verify ZIP contents
    const verifyZip = new AdmZip(zipPath);
    const zipEntries = verifyZip.getEntries().map((e) => e.entryName);
    console.log(`🔍 Verified entries for ${path.basename(zipPath)}:`, zipEntries);

    if (!zipEntries.includes('index.js') || !zipEntries.includes('package.json') || zipEntries.length !== 2) {
      throw new Error(`Unexpected ZIP structure in ${zipPath}: ${JSON.stringify(zipEntries)}`);
    }
  }

  console.log(`\n🎉 Packaging complete!`);
  console.log(`📋 Manifest:`);
  console.log(JSON.stringify(cleanManifest, null, 2));
  console.log(`✨ Standalone artifact verification passed!\n`);
}

packagePlugin().catch((err) => {
  console.error('❌ Packaging failed:', err);
  process.exit(1);
});
