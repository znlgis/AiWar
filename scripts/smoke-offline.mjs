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
if (!EDGE) { console.error('没有找到可用的 Chromium 浏览器'); process.exit(2) }

const URL_ = process.argv[2] ?? 'http://127.0.0.1:4173/toy/aiwar-guiling/index.html'
const OUT = resolve('.shots')
const PORT = Number(process.env.PORT ?? 9253)
await mkdir(OUT, { recursive: true })
const profile = resolve(tmpdir(), 'aiwar-offline-' + Date.now())
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' })
child.on('error', (e) => { console.error('浏览器启动失败：' + e.message); process.exit(2) })

const errors = []
const external = []
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
    if (msg.method === 'Runtime.exceptionThrown') errors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 200))
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push('log: ' + msg.params.entry.text.slice(0, 200))
    if (msg.method === 'Network.requestWillBeSent') {
      const u = msg.params.request.url
      // 只用页面自身的加载（同源 toy 预览）来判定离线：任何站外请求都算违规
      if (/^https?:/.test(u) && !u.startsWith('http://127.0.0.1:4173/')) external.push(u.slice(0, 90))
    }
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)))
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 240)
    return r.result && r.result.value
  }
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(resolve(OUT, name + '.png'), Buffer.from(r.data, 'base64'))
  }
  const clickText = (t) => ev('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().indexOf(' + JSON.stringify(t) + ')>=0);if(b){b.click();return true}return false})()')

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Page.navigate', { url: URL_ })
  await sleep(2500)

  const mounted = await ev('!!document.querySelector("#app")?.children?.length')
  await clickText('开始战役'); await sleep(600)
  await clickText('开始推演')
  // 决策是条件触发的（n1 在第 3 日左右），不能靠固定 sleep 等：轮询到弹窗再操作
  let decided = false
  for (let i = 0; i < 20 && !decided; i++) {
    await sleep(600)
    const hasModal = await ev('!!document.querySelector(".overlay .sheet .option")')
    if (!hasModal) continue
    await ev('(()=>{const o=document.querySelector(".overlay .sheet .option");if(o)o.click()})()')
    await sleep(200)
    decided = (await clickText('确认此策')) === true
  }
  await sleep(1200)
  await shot('compliance-mobile-battle')

  const shape = await ev('(()=>({svg:!!document.querySelector(".map-svg"),roads:document.querySelectorAll(".map-svg path").length,reports:document.querySelectorAll(".report").length,overflow:(document.documentElement.scrollWidth>window.innerWidth)}))()')
  // 存档写入是否发生在关键节点（不应每次点击都写）
  const storage = await ev('Object.keys(localStorage).filter(k=>k.startsWith("aiwar"))')

  console.log('mounted:', mounted)
  console.log('decision-confirmed:', decided)
  console.log('render:', JSON.stringify(shape))
  console.log('localStorage keys:', JSON.stringify(storage))
  console.log('external requests:', external.length ? JSON.stringify([...new Set(external)]) : 'none')

  if (mounted !== true) { console.error('Vue 未挂载'); code = 1 }
  if (!shape?.svg || shape?.roads < 3) { console.error('地图未渲染'); code = 1 }
  if (external.length) { console.error('出现站外请求'); code = 1 }
  if (errors.length) { console.error('页面错误 ' + errors.length + ' 条'); for (const e of errors.slice(0, 8)) console.error(' - ' + e); code = 1 }
  else console.log('无控制台错误')
} finally {
  try { ws?.close() } catch {}
  child.kill()
}
process.exitCode = code
