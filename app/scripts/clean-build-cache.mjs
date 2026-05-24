import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoTargetDir = resolve(appDir, 'src-tauri', 'target')
const externalTargetDir = process.env.OLIENTA_CARGO_TARGET_DIR
  || repoTargetDir
const playwrightResultsDir = resolve(appDir, 'test-results')

for (const target of Array.from(new Set([repoTargetDir, playwrightResultsDir, externalTargetDir]))) {
  rmSync(target, { recursive: true, force: true })
  console.log(`removed ${target}`)
}
