import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = process.argv[2] ?? 'http://127.0.0.1:4173/toy/aiwar-guiling/index.html'
const OUT = resolve('.shots')
const W = Number(process.env.W ?? 1280)
const H = Number(process.env.H ?? 900)
const PORT = Number(process.env.CDP ?? 9223)

await mkdir(OUT, { recursive: true })

const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + resolve('.shots/profile-' + PORT + '-' + W),
  '--window-size=' + W + ',' + H,
  'about:blank',
]
const child = spawn(EDGE, args, { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list')
      const list = await res.json()
      const page = list.find(t => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* retry */ }
    await sleep(200)
  }
  throw new Error('no CDP target')
}

const wsUrl = await getTarget()
const ws = new WebSocket(wsUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
})
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, msg => msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result))
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(OUT, name + '.png'), Buffer.from(r.data, 'base64'))
  console.log('shot', name)
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) console.log('eval error', JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result?.value
}
const clickText = (text) => evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().includes(" + JSON.stringify(text) + "));if(b){b.click();return true}return false})()")

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 })
await send('Page.navigate', { url: URL })
await sleep(2200)
await shot('01-title')
console.log('title click', await clickText('开始战役'))
await sleep(600)
await shot('02-briefing')
console.log('brief click', await clickText('开始推演'))
await sleep(900)
await shot('03-battle')
await sleep(2600)
await shot('04-decision')
console.log('decision present', await evaluate("!!document.querySelector('.overlay .sheet')"))
console.log('errors', await evaluate("window.__errs ? window.__errs.length : 'n/a'"))
ws.close()
child.kill()
console.log('done')