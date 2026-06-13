import { createServer, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { handleProxyRequest } from './mediaProxy'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const distDirectory = resolve(process.env.STATIC_DIR ?? 'dist')

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function serveApp(requestPath: string, response: ServerResponse) {
  const decodedPath = decodeURIComponent(requestPath.split('?')[0])
  const relativePath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  let filePath = join(distDirectory, relativePath || 'index.html')

  if (!filePath.startsWith(distDirectory) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDirectory, 'index.html')
  }

  if (!existsSync(filePath)) {
    response.statusCode = 503
    response.end('App build missing. Run npm run build first.')
    return
  }

  response.setHeader('Content-Type', contentTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream')
  response.setHeader('Cache-Control', filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable')
  createReadStream(filePath).pipe(response)
}

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ ok: true }))
    return
  }

  void handleProxyRequest(request, response).then((handled) => {
    if (!handled) {
      serveApp(request.url ?? '/', response)
    }
  })
})

server.listen(port, host, () => {
  process.stdout.write(`WebOS Radio app and proxy listening on http://${host}:${port}\n`)
})
