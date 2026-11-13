import { reactive } from 'vue'

// WebAudio 合成音效：不打包任何音频文件，零网络请求。
export const audioState = reactive({ enabled: true, ready: false })

const STORAGE_KEY = 'aiwar.sound.v1'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

export function initAudio(): void {
  try {
    audioState.enabled = localStorage.getItem(STORAGE_KEY) !== '0'
  } catch { /* 忽略存储异常 */ }
  const unlock = () => {
    const c = getCtx()
    if (c && c.state === 'suspended') void c.resume()
    audioState.ready = true
  }
  window.addEventListener('pointerdown', unlock, { once: true, passive: true })
  window.addEventListener('keydown', unlock, { once: true })
  window.addEventListener('touchend', unlock, { once: true, passive: true })
}

export function toggleAudio(): void {
  audioState.enabled = !audioState.enabled
  try { localStorage.setItem(STORAGE_KEY, audioState.enabled ? '1' : '0') } catch { /* 忽略 */ }
  if (audioState.enabled) click()
}

function envelope(c: AudioContext, gain: number, attack: number, release: number): GainNode {
  const g = c.createGain()
  const t = c.currentTime
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release)
  return g
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number, delay = 0): void {
  const c = getCtx()
  if (!c || !audioState.enabled || c.state !== 'running') return
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + delay)
  const g = envelope(c, gain, 0.012, duration)
  osc.connect(g).connect(c.destination)
  osc.start(c.currentTime + delay)
  osc.stop(c.currentTime + delay + duration + 0.05)
}

function noise(duration: number, gain: number, lowpass: number, delay = 0): void {
  const c = getCtx()
  if (!c || !audioState.enabled || c.state !== 'running') return
  const length = Math.max(1, Math.floor(c.sampleRate * duration))
  const buffer = c.createBuffer(1, length, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = lowpass
  const g = c.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(c.destination)
  src.start(c.currentTime + delay)
}

export function click(): void {
  tone(720, 0.035, 'triangle', 0.035)
}

export function drum(big = false): void {
  tone(big ? 82 : 98, big ? 0.26 : 0.15, 'sine', big ? 0.16 : 0.1)
  noise(big ? 0.2 : 0.11, big ? 0.09 : 0.045, big ? 420 : 700)
}

export function horn(): void {
  tone(196, 0.42, 'sawtooth', 0.035)
  tone(247, 0.42, 'sawtooth', 0.028, 0.14)
  tone(294, 0.5, 'sawtooth', 0.024, 0.28)
}

export function paper(): void {
  noise(0.08, 0.032, 2600)
}

export function win(): void {
  const notes = [392, 494, 587, 784]
  notes.forEach((n, i) => tone(n, 0.3, 'triangle', 0.05, i * 0.09))
}

export function lose(): void {
  const notes = [330, 294, 247, 196]
  notes.forEach((n, i) => tone(n, 0.4, 'sine', 0.055, i * 0.12))
}

export const sfx = { click, drum, horn, paper, win, lose, toggleAudio }
