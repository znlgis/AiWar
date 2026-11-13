import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/toy/aiwar-guiling/index.html'
const OUT = resolve('.shots')
const PORT = 9225
const W = 1280
const H = 900
await mkdir(OUT, { recursive: true })
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + resolve('.shots/profile-play'),
  '--window-size=' + W + ',' + H, 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function target() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
      const page = list.find(t => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { }
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
  return new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, m => m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result))
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
  return r.result?.value
}
const click = (text) => ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().includes(" + JSON.stringify(text) + "));if(b){b.click();return true}return false})()")

await send('Page.enable')
await send('Runtime.enable')
send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
send('Page.navigate', { url: URL })
await sleep(2000)
await click('开始战役')
await sleep(500)
await click('开始推演')
await sleep(800)
// speed up twice: x1 -> x2 -> x4
await click('×1')
await sleep(200)
const label = await ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('×'));return b?b.textContent.trim():'none'})()")
console.log('speed label after one click', label)
try { await click('×2') } catch { }
await sleep(300)

let decisions = 0
let ended = false
for (let i = 0; i < 400; i++) {
  const state = await ev("(()=>({over:!!document.querySelector('.result-page'), modal:!!document.querySelector('.overlay .sheet')}))()")
  if (state?.over) { ended = true; break }
  if (state?.modal) {
    // pick recommended (A) then confirm
    const picked = await ev("(()=>{const opts=[...document.querySelectorAll('.option')];if(opts[0]){opts[0].click();return true}return false})()")
    await sleep(150)
    const confirmed = await click('确认此策')
    decisions++
    console.log('decision', decisions, 'picked', picked, 'confirmed', confirmed)
    await sleep(400)
    // ensure running again
    await ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='继续');if(b){b.click();return true}return false})()")
    continue
  }
  await sleep(250)
}
console.log('ended', ended, 'decisions', decisions)
await shot('10-battle-mid')
if (ended) {
  await sleep(400)
  await shot('11-result')
  const grade = await ev("(()=>{const g=document.querySelector('.grade');return g?g.textContent.trim():'none'})()")
  console.log('grade', grade)
}
ws.close()
child.kill()
console.log('done')
