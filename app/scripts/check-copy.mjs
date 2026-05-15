import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')

const roots = ['app/src', 'app/src-tauri/src', 'docs']
const extensions = new Set(['.md', '.mjs', '.rs', '.ts', '.tsx'])
const ignoredParts = new Set([
  'node_modules',
  'dist',
  'target',
  '.git',
  'app/src/sample',
])

const mojibakePattern = /�|璇|娌|鍚|鐨|鍊|鏄|鐗|璁|灏|绗|鍥|妯|閰|鐢|鍙|宸|浣|鏈|鏃|閲|鍊欓|寰呭啓|鏆傛棤|鑷姩|鎶藉彇|鍐呭|鍙互|鎵嬪姩|瑙掕壊|鐭ヨ瘑|浣滆€|椤圭洰|绔犺妭|姝ｆ枃/

function hasAllowedExtension(path) {
  return Array.from(extensions).some((extension) => path.endsWith(extension))
}

function isIgnored(path) {
  const normalized = path.replaceAll('\\', '/')
  return Array.from(ignoredParts).some((part) => normalized.includes(part))
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relativePath = relative(repoRoot, fullPath).replaceAll('\\', '/')
    if (isIgnored(relativePath)) continue
    if (entry.isDirectory()) {
      yield* walk(fullPath)
    } else if (entry.isFile() && hasAllowedExtension(entry.name)) {
      yield fullPath
    }
  }
}

const findings = []

for (const root of roots) {
  for await (const filePath of walk(resolve(repoRoot, root))) {
    const content = await readFile(filePath, 'utf8')
    const lines = content.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (mojibakePattern.test(line)) {
        findings.push({
          path: relative(repoRoot, filePath).replaceAll('\\', '/'),
          line: index + 1,
          text: line.trim().slice(0, 160),
        })
      }
    })
  }
}

if (findings.length > 0) {
  console.error(`Copy check failed: ${findings.length} possible mojibake line(s).`)
  for (const finding of findings.slice(0, 80)) {
    console.error(`${finding.path}:${finding.line}: ${finding.text}`)
  }
  if (findings.length > 80) {
    console.error(`...and ${findings.length - 80} more.`)
  }
  process.exit(1)
}

console.log('Copy check passed: no mojibake markers found.')
