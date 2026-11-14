import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/toy/aiwar-guiling/index.html'
const OUT = resolve('.shots'); const PORT = 9232
await mkdir(OUT, { recursive: true })
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + resolve('.shots/profile-mobile2'),
  '--window-size=390,844', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function target() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
      const page = list.find(t => t.type === 'page')
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(200)
  }
  throw new Error('no target')
}
const ws = new WebSocket(await target())
let id = 0; const pending = new Map()
ws.addEventListener('message', ev => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) } })
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
function send(method, params = {}) { return new Promise((resolve2, reject) => { const mid = ++id; pending.set(mid, m => m.error ? reject(new Error(JSON.stringify(m.error))) : resolve2(m.result)); ws.send(JSON.stringify({ id: mid, method, params })) }) }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(resolve(OUT, name + '.png'), Buffer.from(r.data, 'base64')); console.log('shot', name) }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'EXC'; return r.result && r.result.value }
async function clickText(text) { const q = JSON.stringify(text); return ev('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().indexOf(' + q + ')>=0);if(b){b.click();return true}return false})()') }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Page.navigate', { url: URL }); await sleep(2200)
await clickText('四渡赤水'); await sleep(300)
await clickText('开始战役'); await sleep(500)
await clickText('开始推演'); await sleep(1600)
// dismiss modal by choosing first option then confirm
await ev("(()=>{const o=document.querySelector('.overlay .sheet button');if(o){o.click();return true}return false})()")
await sleep(300)
await clickText('确认此策')
await sleep(1200)
await shot('44-mobile-battle-nomodal')
const metrics = await ev("(()=>{const t=document.querySelector('.toolbar')||document.querySelector('header');const bar=t?t.getBoundingClientRect():null;const btns=[...document.querySelectorAll('button')].slice(0,10).map(b=>({txt:b.textContent.trim().slice(0,6),r:b.getBoundingClientRect()}));return {bar,btns,vw:innerWidth,scrollW:document.documentElement.scrollWidth}})()")
console.log('METRICS', JSON.stringify(metrics).slice(0, 1800))
ws.close(); child.kill(); console.log('done')
