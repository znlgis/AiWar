import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const DIST = resolve(process.argv[2] ?? 'apps/site/dist')
const PREFIX = '/toy/aiwar-guiling/'
const PORT = Number(process.env.PORT ?? 4173)
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith(PREFIX)) {
    res.writeHead(302, { location: PREFIX + 'index.html' }).end()
    return
  }
  const rel = normalize(decodeURIComponent(url.pathname.slice(PREFIX.length)) || 'index.html')
  const file = resolve(DIST, rel)
  if (!file.startsWith(DIST)) { res.writeHead(403).end('forbidden'); return }
  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + rel)
  }
})

server.listen(PORT, () => {
  console.log('Toy 子路径预览: http://127.0.0.1:' + PORT + PREFIX + 'index.html')
})
