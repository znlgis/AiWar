import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean)
const EDGE = CANDIDATES.find((p) => existsSync(p))
if (!EDGE) { console.error('没有找到可用的 Chromium 浏览器（用 CHROME 环境变量指定）'); process.exit(2) }

const URL_ = process.argv[2] ?? 'http://127.0.0.1:4173/toy/aiwar-guiling/index.html'
const OUT = resolve('.shots')
const PORT = Number(process.env.PORT ?? 9250)
await mkdir(OUT, { recursive: true })
// profile 放临时目录：原来的 .shots/profile-* 每个几百 MB 且从不清理
const profile = resolve(tmpdir(), 'aiwar-smoke-' + Date.now())
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' })
child.on('error', (e) => { console.error('浏览器启动失败：' + e.message); process.exit(2) })

const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws, code = 0
try {
  async function target() {
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
        const page = list.find((t) => t.type === 'page')
        if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
      } catch {}
      await sleep(200)
    }
    throw new Error('没拿到调试目标')
  }
  ws = new WebSocket(await target())
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return }
    if (msg.method === 'Runtime.exceptionThrown') errors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300))
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300))
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push('log: ' + msg.params.entry.text.slice(0, 300))
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)))
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 300)
    return r.result && r.result.value
  }
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(resolve(OUT, name + '.png'), Buffer.from(r.data, 'base64'))
  }
  const clickText = (text) => ev('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().indexOf(' + JSON.stringify(text) + ')>=0);if(b){b.click();return true}return false})()')

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: URL_ })
  await sleep(2500)

  const mounted = await ev('!!document.querySelector("#app")?.children?.length')
  console.log('mounted:', mounted)
  await shot('smoke-1-title')

  // 进入战役 → 简报 → 推演
  await clickText('开始战役'); await sleep(600)
  await shot('smoke-2-briefing')
  await clickText('开始推演'); await sleep(2500)
  await shot('smoke-3-battle')

  // 速度控件：应为 ×1 → ×2 → ×4 → ×1
  const labels = []
  for (let i = 0; i < 4; i++) {
    labels.push(await ev('(()=>{const b=[...document.querySelectorAll("button")].find(x=>/^×[0-9]+$/.test(x.textContent.trim()));return b?b.textContent.trim():"none"})()'))
    await clickText('×')
    await sleep(200)
  }
  console.log('speed labels:', labels.join(' → '))

  // 地图与战报是否真的渲染了内容
  const shape = await ev('(()=>({svg:!!document.querySelector(".map-svg"), roads:document.querySelectorAll(".map-svg path").length, reports:document.querySelectorAll(".report").length, cities:document.querySelectorAll(".city-label").length}))()')
  console.log('render:', JSON.stringify(shape))
  await shot('smoke-4-battle-later')

  if (mounted !== true || !shape?.svg || shape?.roads < 3) { console.error('渲染检查未通过'); code = 1 }
  if (errors.length) { console.error('页面错误 ' + errors.length + ' 条：'); for (const e of errors.slice(0, 10)) console.error(' - ' + e); code = 1 }
  else console.log('无控制台错误')
} finally {
  try { ws?.close() } catch {}
  child.kill()
}
process.exitCode = code
