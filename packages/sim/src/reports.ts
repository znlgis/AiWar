import type { Confidence, GameState, Narrative, Report, SourceId } from './types.js'

const DELAY: Record<SourceId, number> = {
  scout: 1, border: 0, deserter: 2, merchant: 3, envoy: 2, court: 2, counsel: 0, note: 0,
}

export function pushReport(
  state: GameState,
  source: SourceId,
  place: string,
  text: string,
  confidence: Confidence,
  delayOverride?: number,
  important = false,
): Report {
  const delay = delayOverride ?? DELAY[source]
  const report: Report = {
    id: 'r' + (++state.reportSeq),
    tick: state.tick,
    arriveTick: state.tick + delay,
    source,
    place,
    confidence,
    text,
    important,
  }
  state.reports.push(report)
  return report
}

export function reportLine(
  state: GameState,
  narrative: Narrative,
  source: SourceId,
  place: string,
  kind: string,
  params: Record<string, string>,
  confidence: Confidence,
  delay?: number,
  important = false,
): Report {
  const salt = state.narrativeSalt++
  const text = narrative.line(kind, params, salt) || fallback(kind, params)
  return pushReport(state, source, place, text, confidence, delay, important)
}

export function fallback(kind: string, params: Record<string, string>): string {
  const place = params.city ?? params.place ?? params.army ?? '前线'
  if (kind.startsWith('battle')) return place + '传来战报，两军接战，胜负未分。'
  if (kind.startsWith('siege')) return place + '方向有攻城消息传来。'
  if (kind.startsWith('supply')) return '粮道有警。'
  return place + '方面有新的军情。'
}

export function visibleReports(state: GameState): Report[] {
  return state.reports.filter(r => r.arriveTick <= state.tick)
}

export function confidenceFor(state: GameState, base: Confidence): Confidence {
  const d = state.difficulty
  if (d === 'hist' || d === 'normal') return base
  if (base === 'high') return 'mid'
  return 'low'
}
