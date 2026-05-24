import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]
if (!['dev', 'build'].includes(mode)) {
  console.error('Usage: node scripts/tauri-run.mjs <dev|build>')
  process.exit(1)
}

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appDir, '..')
const targetDir = process.env.OLIENTA_CARGO_TARGET_DIR
  || resolve(appDir, 'src-tauri', 'target')
const configDir = process.env.OLIENTA_CONFIG_DIR
  || resolve(repoRoot, '.olienta-app-config')

mkdirSync(targetDir, { recursive: true })
mkdirSync(configDir, { recursive: true })

const command = process.platform === 'win32' ? 'tauri.cmd' : 'tauri'
const child = spawn(command, [mode], {
  cwd: appDir,
  env: {
    ...process.env,
    CARGO_TARGET_DIR: targetDir,
    OLIENTA_CONFIG_DIR: configDir,
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
