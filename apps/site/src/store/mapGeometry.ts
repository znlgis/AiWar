// 势力区几何：按「最近城邑」划分辖域，并裁到城邑影响半径内 + 手绘感圆角。
//
// 原实现（makeAreas）拿占领城市的点做凸包再外扩 1.16 倍：凸包会把凹进去的
// 敌占区吞成己方，几个势力叠成几块大三角，这是地图观感最失真的地方。
//
// 这里改用「无限 Voronoi → 裁到城邑影响半径」：
//   1. 对每个种子点，从包围矩形出发，用其它种子的中垂线逐条做半平面裁剪，
//      得到该城邑的 Voronoi 辖域（凸多边形，天生互不重叠）；
//   2. 再裁到以该城邑为心、半径约为「最近邻距离」的圆上——只裁掉向荒野延伸的
//      长楔形，与相邻城邑的中垂线仍在半径内，所以邻居之间依旧接得上；
//   3. 边界做圆角，长边才弯、短边自动退回直边。
// n ≤ 30，O(n²) 完全够用。

export interface Site {
  id: string
  x: number
  y: number
  /** 影响权重：>1 表示辖区更大（都城），<1 表示辖区更小（关隘、渡口） */
  weight: number
  faction: string
}

export type Point = [number, number]
export type Polygon = Point[]

export interface Bounds { x: number; y: number; w: number; h: number }

/** 保留到 A 更近的一侧（中垂线裁剪） */
function clipBisector(poly: Polygon, ax: number, ay: number, bx: number, by: number): Polygon {
  const out: Polygon = []
  if (poly.length === 0) return out
  const inside = (p: Point): boolean => {
    const dex = p[0] - ax
    const dey = p[1] - ay
    const dfx = p[0] - bx
    const dfy = p[1] - by
    return dex * dex + dey * dey <= dfx * dfx + dfy * dfy
  }
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!
    const nxt = poly[(i + 1) % poly.length]!
    const curIn = inside(cur)
    const nxtIn = inside(nxt)
    if (curIn) out.push(cur)
    if (curIn !== nxtIn) {
      const x1 = cur[0], y1 = cur[1]
      const x2 = nxt[0], y2 = nxt[1]
      const d1 = (x1 - ax) ** 2 + (y1 - ay) ** 2 - ((x1 - bx) ** 2 + (y1 - by) ** 2)
      const d2 = (x2 - ax) ** 2 + (y2 - ay) ** 2 - ((x2 - bx) ** 2 + (y2 - by) ** 2)
      const denom = d1 - d2
      const t = Math.abs(denom) < 1e-9 ? 0.5 : d1 / denom
      out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
    }
  }
  return out
}

/** 凸多边形逐边裁剪：把 inner 裁进 outer（outer 为凸） */
function clipConvex(inner: Polygon, outer: Polygon): Polygon {
  if (inner.length < 3 || outer.length < 3) return inner.length >= 3 ? inner : []
  // 保证 outer 为逆时针
  const area = signedArea(outer)
  const ring = area >= 0 ? outer : [...outer].reverse()
  let out = inner
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    out = clipHalfPlaneEdge(out, a, b)
    if (out.length < 3) return []
  }
  return out
}

function signedArea(poly: Polygon): number {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum / 2
}

function clipHalfPlaneEdge(poly: Polygon, a: Point, b: Point): Polygon {
  const out: Polygon = []
  const cross = (p: Point): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!
    const nxt = poly[(i + 1) % poly.length]!
    const cIn = cross(cur) >= 0
    const nIn = cross(nxt) >= 0
    if (cIn) out.push(cur)
    if (cIn !== nIn) {
      const d1 = cross(cur)
      const d2 = cross(nxt)
      const t = Math.abs(d1 - d2) < 1e-9 ? 0.5 : d1 / (d1 - d2)
      out.push([cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t])
    }
  }
  return out
}

function disc(cx: number, cy: number, r: number, sides = 28): Polygon {
  const out: Polygon = []
  for (let k = 0; k < sides; k++) {
    const t = (k / sides) * Math.PI * 2
    out.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r])
  }
  return out
}

export function voronoiCells(sites: Site[], bounds: Bounds): { site: Site; polygon: Polygon }[] {
  const cells: { site: Site; polygon: Polygon }[] = []
  for (let i = 0; i < sites.length; i++) {
    const a = sites[i]!
    let poly: Polygon = [
      [bounds.x, bounds.y],
      [bounds.x + bounds.w, bounds.y],
      [bounds.x + bounds.w, bounds.y + bounds.h],
      [bounds.x, bounds.y + bounds.h],
    ]
    // 最近邻距离决定影响半径：只裁掉向荒野延伸的长楔形，不会切断与邻居的接缝
    let nearest = Number.POSITIVE_INFINITY
    for (let j = 0; j < sites.length; j++) {
      if (i === j) continue
      const b = sites[j]!
      nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y))
    }
    for (let j = 0; j < sites.length; j++) {
      if (i === j) continue
      const b = sites[j]!
      // 权重通过挪动对方位置体现：a 权重更大时，中垂线更靠近 b
      const ratio = (a.weight > 0 ? a.weight : 1) / (b.weight > 0 ? b.weight : 1)
      const bx = a.x + (b.x - a.x) * ratio
      const by = a.y + (b.y - a.y) * ratio
      poly = clipBisector(poly, a.x, a.y, bx, by)
      if (poly.length < 3) break
    }
    if (poly.length >= 3) {
      // 半径取到最近邻的 0.95 倍：相邻城邑的中垂线（在 nearest/2 处）仍落在圆内，
      // 同势力相邻格因此能接成一片，而只把伸向荒野的长楔形切掉。
      const r = (Number.isFinite(nearest) ? nearest * 0.95 : Math.min(bounds.w, bounds.h) * 0.3) * Math.max(0.6, Math.min(1.5, a.weight))
      const clipped = clipConvex(poly, disc(a.x, a.y, r))
      if (clipped.length >= 3) cells.push({ site: a, polygon: clipped })
    }
  }
  return cells
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * 多边形 → 带圆角的手绘感路径。每条边两端各缩进 t，拐点用二次贝塞尔过原顶点；
 * 边长小于 minEdge 时退回直边，避免小格子被圆角磨成畸形。
 */
export function roundedPolygonPath(poly: Polygon, radius = 6, minEdge = 8): string {
  if (poly.length < 3) return ''
  const parts: string[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!
    const cur = poly[i]!
    const next = poly[(i + 1) % n]!
    const inLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
    const outLen = Math.hypot(next[0] - cur[0], next[1] - cur[1])
    if (inLen < minEdge || outLen < minEdge) {
      parts.push((i === 0 ? 'M' : 'L') + round1(cur[0]) + ' ' + round1(cur[1]))
      continue
    }
    const tIn = Math.min(radius, inLen * 0.42)
    const tOut = Math.min(radius, outLen * 0.42)
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

/** 道路 → 略带弧度的手绘线：长路弯得明显、短路几乎不弯 */
export function curvedRoadPath(x1: number, y1: number, x2: number, y2: number, bend = 0.06): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cx = (x1 + x2) / 2 + nx * len * bend
  const cy = (y1 + y2) / 2 + ny * len * bend
  return 'M' + round1(x1) + ' ' + round1(y1) + ' Q' + round1(cx) + ' ' + round1(cy) + ' ' + round1(x2) + ' ' + round1(y2)
}
