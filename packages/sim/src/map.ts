import type { RoadDef } from './types.js'

export interface PathStep {
  city: string
  days: number
}

const cache = new WeakMap<RoadDef[], Map<string, PathStep[]>>()

function key(from: string, to: string): string {
  return from + '>' + to
}

function adjacency(roads: RoadDef[]): Map<string, { to: string; days: number }[]> {
  const adj = new Map<string, { to: string; days: number }[]>()
  for (const road of roads) {
    if (!adj.has(road.from)) adj.set(road.from, [])
    if (!adj.has(road.to)) adj.set(road.to, [])
    adj.get(road.from)!.push({ to: road.to, days: road.days })
    adj.get(road.to)!.push({ to: road.from, days: road.days })
  }
  return adj
}

export function shortestPath(roads: RoadDef[], from: string, to: string): PathStep[] {
  if (from === to) return []
  let byGoal = cache.get(roads)
  if (!byGoal) { byGoal = new Map(); cache.set(roads, byGoal) }
  const cached = byGoal.get(key(from, to))
  if (cached) return cached
  const adj = adjacency(roads)
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string>()
  const visited = new Set<string>()
  while (true) {
    let current: string | null = null
    let best = Number.POSITIVE_INFINITY
    for (const [city, d] of dist) {
      if (!visited.has(city) && d < best) { best = d; current = city }
    }
    if (current === null || current === to) break
    visited.add(current)
    for (const edge of adj.get(current) ?? []) {
      const next = best + edge.days
      if (next < (dist.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(edge.to, next)
        prev.set(edge.to, current)
      }
    }
  }
  if (!dist.has(to)) { byGoal.set(key(from, to), []); return [] }
  const steps: PathStep[] = []
  let cursor = to
  while (cursor !== from) {
    const before = prev.get(cursor)
    if (!before) break
    const road = roads.find(r => (r.from === before && r.to === cursor) || (r.from === cursor && r.to === before))
    steps.unshift({ city: cursor, days: road?.days ?? 1 })
    cursor = before
  }
  byGoal.set(key(from, to), steps)
  return steps
}

export function distanceDays(roads: RoadDef[], from: string, to: string): number {
  return shortestPath(roads, from, to).reduce((sum, step) => sum + step.days, 0)
}

export function adjacentCities(roads: RoadDef[], city: string): string[] {
  const out = new Set<string>()
  for (const road of roads) {
    if (road.from === city) out.add(road.to)
    if (road.to === city) out.add(road.from)
  }
  return [...out]
}
