import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, normalize, resolve, sep } from 'node:path'

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
  // 必须带分隔符：否则 dist-old/ 这类同前缀的兄弟目录会绕过校验
  if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end('forbidden'); return }
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

server.on('error', (error) => {
  console.error('预览服务启动失败：' + (error.code === 'EADDRINUSE' ? '端口 ' + PORT + ' 已被占用（用 PORT=xxxx 换一个）' : error.message))
  process.exit(1)
})

server.listen(PORT, () => {
  console.log('Toy 子路径预览: http://127.0.0.1:' + PORT + PREFIX + 'index.html')
})
