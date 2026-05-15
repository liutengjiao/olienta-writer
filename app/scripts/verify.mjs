import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const tauriDir = resolve(appDir, 'src-tauri')

const steps = [
  { label: 'frontend build', command: 'npm', args: ['run', 'build'], cwd: appDir },
  { label: 'frontend lint', command: 'npm', args: ['run', 'lint'], cwd: appDir },
  { label: 'dev server smoke', command: 'npm', args: ['run', 'smoke:dev'], cwd: appDir },
  { label: 'rust tests', command: 'cargo', args: ['test'], cwd: tauriDir },
]

function runStep(step) {
  return new Promise((resolveStep, rejectStep) => {
    const isWindows = process.platform === 'win32'
    const command = isWindows && step.command === 'npm' ? 'npm.cmd' : step.command
    const child = spawn(command, step.args, {
      cwd: step.cwd,
      shell: isWindows,
      stdio: 'inherit',
    })

    child.on('error', rejectStep)
    child.on('exit', (code) => {
      if (code === 0) resolveStep()
      else rejectStep(new Error(`${step.label} failed with exit code ${code}`))
    })
  })
}

for (const step of steps) {
  console.log(`\n==> ${step.label}`)
  await runStep(step)
}

console.log('\nVerification passed.')
