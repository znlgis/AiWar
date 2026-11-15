// 地形层绘制：山系用「山」字形短笔触，河流用柔和折线，湖泊海岸为闭合面。
//
// 古地图上的山不是等高线，是一排排「山」字形的笔触；照这个画，既不会让画面
// 变成现代地形图，又能让玩家一眼看出哪一带是山。所有几何都是纯函数，按画布
// 坐标计算，和推演数据无关。

export type Pt = [number, number]

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/** 折线 → 平滑路径：拐点用二次贝塞尔，段长不足时退回直线 */
export function smoothLinePath(points: Pt[], corner = 0.35): string {
  if (points.length < 2) return ''
  const parts: string[] = ['M' + round1(points[0]![0]) + ' ' + round1(points[0]![1])]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!
    const cur = points[i]!
    const next = points[i + 1]!
    const inLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
    const outLen = Math.hypot(next[0] - cur[0], next[1] - cur[1])
    if (inLen < 2 || outLen < 2) { parts.push('L' + round1(cur[0]) + ' ' + round1(cur[1])); continue }
    const tIn = Math.min(corner, inLen * 0.4)
    const tOut = Math.min(corner, outLen * 0.4)
    const ax = cur[0] + ((prev[0] - cur[0]) / inLen) * tIn
    const ay = cur[1] + ((prev[1] - cur[1]) / inLen) * tIn
    const bx = cur[0] + ((next[0] - cur[0]) / outLen) * tOut
    const by = cur[1] + ((next[1] - cur[1]) / outLen) * tOut
    parts.push('L' + round1(ax) + ' ' + round1(ay))
    parts.push('Q' + round1(cur[0]) + ' ' + round1(cur[1]) + ' ' + round1(bx) + ' ' + round1(by))
  }
  const last = points[points.length - 1]!
  parts.push('L' + round1(last[0]) + ' ' + round1(last[1]))
  return parts.join(' ')
}

/** 闭合面路径（湖泊、海岸） */
export function closedAreaPath(points: Pt[], corner = 6): string {
  if (points.length < 3) return ''
  const parts: string[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!
    const cur = points[i]!
    const next = points[(i + 1) % n]!
    const inLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
    const outLen = Math.hypot(next[0] - cur[0], next[1] - cur[1])
    if (inLen < 4 || outLen < 4) { parts.push((i === 0 ? 'M' : 'L') + round1(cur[0]) + ' ' + round1(cur[1])); continue }
    const tIn = Math.min(corner, inLen * 0.4)
    const tOut = Math.min(corner, outLen * 0.4)
    const ax = cur[0] + ((prev[0] - cur[0]) / inLen) * tIn
    const ay = cur[1] + ((prev[1] - cur[1]) / inLen) * tIn
    const bx = cur[0] + ((next[0] - cur[0]) / outLen) * tOut
    const by = cur[1] + ((next[1] - cur[1]) / outLen) * tOut
    parts.push((i === 0 ? 'M' : 'L') + round1(ax) + ' ' + round1(ay))
    parts.push('Q' + round1(cur[0]) + ' ' + round1(cur[1]) + ' ' + round1(bx) + ' ' + round1(by))
  }
  parts.push('Z')
  return parts.join(' ')
}

/**
 * 山系：沿折线每隔 step 像素画一个「山」字形（一竖两侧各一笔），
 * 山峰高度随行数轻微起伏，避免机械重复。返回一串可直接拼进 path 的段落。
 */
export function ridgeHatch(points: Pt[], opts: { step?: number; height?: number; width?: number; jitter?: number } = {}): string {
  const step = opts.step ?? 26
  const height = opts.height ?? 11
  const width = opts.width ?? 9
  const jitter = opts.jitter ?? 0.35
  if (points.length < 2) return ''
  const parts: string[] = []
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1) continue
    const ux = (b[0] - a[0]) / len
    const uy = (b[1] - a[1]) / len
    // 法线方向：山峰朝向折线的「上方」，让一排山看起来是同一侧的山坡
    const nx = -uy
    const ny = ux
    let d = carry
    while (d <= len) {
      const cx = a[0] + ux * d
      const cy = a[1] + uy * d
      // 用位置哈希做确定性起伏，同一帧重绘不会跳动
      const seed = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233)) % 1
      const h = height * (1 - jitter / 2 + seed * jitter)
      const w = width
      const tipX = cx + nx * h
      const tipY = cy + ny * h
      const leftX = cx - ux * w + nx * 1.5
      const leftY = cy - uy * w + ny * 1.5
      const rightX = cx + ux * w + nx * 1.5
      const rightY = cy + uy * w + ny * 1.5
      parts.push(
        'M' + round1(leftX) + ' ' + round1(leftY) +
        'L' + round1(tipX) + ' ' + round1(tipY) +
        'L' + round1(rightX) + ' ' + round1(rightY),
      )
      d += step
    }
    carry = d - len
  }
  return parts.join(' ')
}

/** 折线上按比例取点，用于给河流标签定位 */
export function pointAlong(points: Pt[], t: number): Pt {
  if (points.length === 0) return [0, 0]
  if (points.length === 1) return points[0]!
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1])
    lengths.push(l)
    total += l
  }
  let target = total * Math.max(0, Math.min(1, t))
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i]!) {
      const a = points[i]!
      const b = points[i + 1]!
      const p = lengths[i]! === 0 ? 0 : target / lengths[i]!
      return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p]
    }
    target -= lengths[i]!
  }
  return points[points.length - 1]!
}
