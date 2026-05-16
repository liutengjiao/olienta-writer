import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const tauriDir = resolve(appDir, 'src-tauri')
const smokeUrl = process.env.OLIENTA_SMOKE_URL ?? 'http://localhost:1420'

const steps = [
  { label: 'copy check', command: 'npm', args: ['run', 'check:copy'], cwd: appDir },
  { label: 'frontend build', command: 'npm', args: ['run', 'build'], cwd: appDir },
  { label: 'frontend lint', command: 'npm', args: ['run', 'lint'], cwd: appDir },
  { label: 'frontend logic smoke', command: 'npm', args: ['run', 'smoke:logic'], cwd: appDir },
  { label: 'dev server smoke', command: 'npm', args: ['run', 'smoke:dev'], cwd: appDir, needsDevServer: true },
  { label: 'workflow smoke', command: 'cargo', args: ['test', 'core_writing_workflow_smoke', '--', '--nocapture'], cwd: tauriDir },
  { label: 'rust tests', command: 'cargo', args: ['test'], cwd: tauriDir },
]

function commandFor(step) {
  const isWindows = process.platform === 'win32'
  return {
    command: isWindows && step.command === 'npm' ? 'npm.cmd' : step.command,
    shell: isWindows,
  }
}

function runStep(step) {
  return new Promise((resolveStep, rejectStep) => {
    const { command, shell } = commandFor(step)
    const child = spawn(command, step.args, {
      cwd: step.cwd,
      shell,
      stdio: 'inherit',
    })

    child.on('error', rejectStep)
    child.on('exit', (code) => {
      if (code === 0) resolveStep()
      else rejectStep(new Error(`${step.label} failed with exit code ${code}`))
    })
  })
}

async function isDevServerReachable() {
  try {
    const response = await fetch(smokeUrl, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

function startDevServer() {
  const step = { command: 'npm', args: ['run', 'dev'], cwd: appDir }
  const { command, shell } = commandFor(step)
  const child = spawn(command, step.args, {
    cwd: step.cwd,
    shell,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    if (text.toLowerCase().includes('error')) process.stdout.write(text)
  })
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))

  return child
}

async function waitForDevServer(timeoutMs = 20000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isDevServerReachable()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`dev server did not become reachable at ${smokeUrl}`)
}

async function ensureDevServer() {
  if (await isDevServerReachable()) {
    console.log(`dev server already reachable at ${smokeUrl}`)
    return null
  }

  console.log(`starting dev server at ${smokeUrl}`)
  const child = startDevServer()
  await waitForDevServer()
  return child
}

function stopDevServer(child) {
  if (!child || child.killed) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  child.kill('SIGTERM')
}

let devServer = null

try {
  for (const step of steps) {
    console.log(`\n==> ${step.label}`)
    if (step.needsDevServer) {
      devServer = await ensureDevServer()
    }
    await runStep(step)
  }

  console.log('\nVerification passed.')
} finally {
  stopDevServer(devServer)
}
