import { describe, expect, it } from 'vitest'
import { advanceOpsDay, createOpsState, getRules, registerRules, resolveOpsNode, timeoutOpsNode } from '@aiwar/sim'
import { siduCampaign } from '../src/ops/siduchishui/data.js'
import siduRules from '../src/ops/siduchishui/rules.js'
import { makeOpsNarrator } from '../src/ops/narrator.js'

registerRules(siduRules)
const narrative = makeOpsNarrator()

const PICKS: Record<string, string> = { d1: 'opt1', d2: 'opt2', d3: 'opt1', d4: 'opt1', d5: 'opt2', d6: 'opt2', d7: 'opt2', d8: 'opt1' }

function run(seed: number, difficulty: 'hist' | 'normal' | 'hard' = 'normal') {
  const state = createOpsState(siduCampaign, difficulty, seed)
  siduRules.opening(state, siduCampaign, narrative)
  let decisions = 0
  for (let i = 0; i < 140; i++) {
    if (state.over) break
    const result = advanceOpsDay(state, siduCampaign, narrative, siduRules)
    if (result.pendingNode) {
      const pick = PICKS[result.pendingNode] ?? 'opt1'
      resolveOpsNode(state, siduCampaign, narrative, siduRules, result.pendingNode, pick)
      decisions++
    }
  }
  const score = siduRules.score(state, siduCampaign)
  return { state, score, decisions }
}

describe('sidu campaign', () => {
  it('runs to an ending', () => {
    const { state, score, decisions } = run(1)
    console.log('SIDU', score.endingId, score.grade, score.total, 'tick', state.tick, 'decisions', decisions,
      'ring', Math.round(state.vars.ring ?? 0), 'ferry', state.vars.ferry, 'crossed', state.flags.crossed,
      'red', Object.entries(state.armies).filter(([, a]) => a.faction === 'red').map(([, a]) => a.troops).join('/'))
    expect(state.tick).toBeGreaterThan(5)
    expect(score.total).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic', () => {
    const a = run(7)
    const b = run(7)
    expect(a.score.total).toBe(b.score.total)
    expect(a.state.tick).toBe(b.state.tick)
  })

  it('resolves every decision node it reports', () => {
    const { state } = run(3)
    expect(state.resolvedNodes.length).toBeGreaterThan(0)
    for (const id of state.resolvedNodes) {
      expect(siduCampaign.decisions.some(d => d.id === id)).toBe(true)
    }
  })
})
