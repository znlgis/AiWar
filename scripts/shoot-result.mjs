import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/toy/aiwar-guiling/index.html'
const PACK = Number(process.env.PACK ?? -1)
const OUT = resolve('.shots')
const PORT = Number(process.env.CDP ?? 9251)
const W = Number(process.env.W ?? 1280)
const H = Number(process.env.H ?? 1000)
await mkdir(OUT, { recursive: true })
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + resolve('.shots/profile-step-' + PORT),
  '--window-size=' + W + ',' + H, 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function target() {
  for (let i = 0; i < 120; i++) {
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
const logs = []
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return }
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC:' + JSON.stringify(msg.params.exceptionDetails).slice(0, 500))
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') logs.push('ERR:' + (msg.params.args ?? []).map(a => a.value ?? a.description).join(' '))
})
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id
  pending.set(mid, m => m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result))
  ws.send(JSON.stringify({ id: mid, method, params }))
})
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 400)
  return r.result?.value
}
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  await writeFile(resolve(OUT, name + '.png'), Buffer.from(r.data, 'base64'))
  console.log('shot', name)
}
const click = (text) => ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().includes(" + JSON.stringify(text) + "));if(b){b.click();return true}return false})()")

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: URL })
await sleep(1800)

// 先在标题页选战役（选完再进入，否则开的是上一场）
if (PACK >= 0) {
  const picked = await ev("(()=>{const b=[...document.querySelectorAll('button.campaign')];if(b[" + PACK + "]){b[" + PACK + "].click();return b[" + PACK + "].textContent.trim().slice(0,12)}return 'none'})()")
  console.log('pack', PACK, '->', picked)
  await sleep(350)
}
await click('开始战役'); await sleep(450)
await click('开始推演'); await sleep(700)

// 先暂停，再用「单步」逐日推进：这是最稳的驱动方式，不依赖计时器
await click('暂停'); await sleep(200)

let steps = 0
let reached = false
for (let i = 0; i < 400; i++) {
  const st = await ev("(()=>({over:!!document.querySelector('.result-page'),modal:!!document.querySelector('.overlay .sheet')}))()")
  if (st?.over) { reached = true; break }
  if (st?.modal) {
    await ev("(()=>{const o=[...document.querySelectorAll('.option')];if(o[0]){o[0].click();return true}return false})()")
    await sleep(90)
    await click('确认此策')
    await sleep(160)
    await click('暂停')
    await sleep(90)
    continue
  }
  const r = await ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='单步');if(b&&!b.disabled){b.click();return 'ok'}return b?'disabled':'none'})()")
  steps++
  if (r !== 'ok') { await click('暂停'); await sleep(80) }
  await sleep(70)
}
console.log('reached', reached, 'steps', steps)
await shot(reached ? '60-result-top' : '60-no-result')
if (reached) {
  const info = await ev("(()=>({verdict:(document.querySelector('.verdict')||{}).textContent,headline:(document.querySelector('.ending')||{}).textContent,chronicle:document.querySelectorAll('.chronicle li').length,metrics:document.querySelectorAll('.metric').length,reading:document.querySelectorAll('.reading').length,decisions:document.querySelectorAll('.decisions tbody tr').length,turn:(document.querySelector('.turn')||{}).textContent,hint:(document.querySelector('.loss p')||{}).textContent}))()")
  console.log('RESULT', JSON.stringify(info))
  await ev("(()=>{const el=document.querySelector('.result-page');if(el)el.scrollTop=560;return 1})()")
  await sleep(300)
  await shot('61-result-mid')
  await ev("(()=>{const el=document.querySelector('.result-page');if(el)el.scrollTop=1200;return 1})()")
  await sleep(300)
  await shot('62-result-lower')
  await ev("(()=>{const el=document.querySelector('.result-page');if(el)el.scrollTop=el.scrollHeight;return 1})()")
  await sleep(300)
  await shot('63-result-bottom')
}
console.log('LOGS', logs.slice(-8).join(' | '))
ws.close(); child.kill()
console.log('done')
