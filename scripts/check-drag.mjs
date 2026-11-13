import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/toy/aiwar-guiling/index.html'
const OUT = resolve('.shots')
const PORT = 9228
await mkdir(OUT, { recursive: true })
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + resolve('.shots/profile-drag'),
  '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' })
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
let id = 0
const pending = new Map()
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
})
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
function send(method, params = {}) {
  return new Promise((resolve2, reject) => {
    const mid = ++id
    pending.set(mid, m => m.error ? reject(new Error(JSON.stringify(m.error))) : resolve2(m.result))
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(OUT, name + '.png'), Buffer.from(r.data, 'base64'))
  console.log('shot', name)
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200)
  return r.result && r.result.value
}
async function clickText(text) {
  const q = JSON.stringify(text)
  return ev('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().indexOf(' + q + ')>=0);if(b){b.click();return true}return false})()')
}
await send('Page.enable')
await send('Runtime.enable')
send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
send('Page.navigate', { url: URL })
await sleep(2200)
await clickText('开始战役')
await sleep(500)
await clickText('开始推演')
await sleep(1000)
await ev('(()=>{const b=[...document.querySelectorAll(".map-tools button")].find(x=>x.textContent.indexOf("+")>=0);if(b){b.click();b.click()}return true})()')
await sleep(300)
const t0 = await ev('(()=>{const g=document.querySelector(".map-svg g");return g?g.getAttribute("transform"):"none"})()')
const box = await ev('(()=>{const r=document.querySelector(".map-svg").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()')
console.log('transform before', t0, 'box', JSON.stringify(box))
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
for (let i = 1; i <= 6; i++) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + i * 20, y: box.y + i * 12, button: 'left', buttons: 1 })
  await sleep(30)
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 120, y: box.y + 72, button: 'left', clickCount: 1 })
await sleep(300)
const t1 = await ev('(()=>{const g=document.querySelector(".map-svg g");return g?g.getAttribute("transform"):"none"})()')
console.log('transform after', t1)
await shot('23-map-drag-real')
ws.close()
child.kill()
console.log('done')
