// 确定性随机：纯函数派生，不需要序列化 RNG 状态。
// 同一 seed + domain + tick + salt 永远得到同一个数，读档/复算完全一致。

export type Rng = (domain: string, salt?: number) => number

function hash32(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function mulberry32(a: number): number {
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function makeRng(seed: number, tick: number): Rng {
  return (domain: string, salt = 0) => mulberry32(hash32(seed + '|' + tick + '|' + domain + '|' + salt))
}

export function pick<T>(rng: Rng, list: readonly T[], domain: string, salt = 0): T {
  const index = Math.floor(rng(domain, salt) * list.length) % list.length
  return list[index] as T
}

export function chance(rng: Rng, p: number, domain: string, salt = 0): boolean {
  return rng(domain, salt) < p
}

export function jitter(rng: Rng, domain: string, salt = 0, spread = 0.15): number {
  return 1 + (rng(domain, salt) * 2 - 1) * spread
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1)
}
