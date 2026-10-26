// Copies MapLibre's web worker (+ its shared chunk) into public/maplibre/.
// Once Vite bundles the app, MapLibre's default worker URL (resolved relative to the bundle)
// no longer points to a real file, so the production site fails with "Worker failed to load"
// and no GeoJSON/CAD layers get drawn. CadMap.jsx points setWorkerUrl() at these copies.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'node_modules', 'maplibre-gl', 'dist')
const outDir = join(root, 'public', 'maplibre')
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

mkdirSync(outDir, { recursive: true })
for (const f of files) {
  const from = join(srcDir, f)
  if (!existsSync(from)) {
    console.error(`[copy-maplibre-worker] missing ${from}`)
    process.exit(1)
  }
  copyFileSync(from, join(outDir, f))
}
console.log(`[copy-maplibre-worker] copied ${files.join(', ')} -> public/maplibre`)
