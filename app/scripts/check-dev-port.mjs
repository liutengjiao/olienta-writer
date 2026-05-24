import net from 'node:net'

const port = Number(process.env.OLIENTA_DEV_PORT ?? 1420)
const host = process.env.OLIENTA_DEV_HOST ?? '127.0.0.1'

function checkPortAvailable() {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', (error) => {
      resolve({ available: false, error })
    })

    server.once('listening', () => {
      server.close(() => resolve({ available: true }))
    })

    server.listen(port, host)
  })
}

const result = await checkPortAvailable()

if (!result.available) {
  console.error(`Olienta desktop dev needs http://localhost:${port}, but that port is already in use.`)
  console.error('')
  console.error('Close the previous Vite/desktop dev window, or run this in PowerShell:')
  console.error(`  Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ }`)
  console.error('')
  console.error('For browser-only preview, run npm run dev; Vite can automatically choose another port.')
  process.exit(1)
}

console.log(`Port ${port} is available for Olienta desktop dev.`)
