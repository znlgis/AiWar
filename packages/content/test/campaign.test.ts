import { describe, expect, it } from 'vitest'
import {
  createGame, advanceDay, resolveDecision, timeoutNode, finalize,
} from '@aiwar/sim'
import { guilingCampaign, narrator } from '../src/index.js'

const campaign = guilingCampaign

function run(seed: number, difficulty: 'normal' | 'hist' | 'hard' = 'normal') {
  const state = createGame({ campaign, difficulty, seed })
  const decisions: string[] = []
  let pick = seed
  for (let i = 0; i < campaign.maxTicks + 5; i++) {
    if (state.over) break
    const result = advanceDay(state, campaign, narrator)
    if (result.pendingNode) {
      const node = campaign.decisions.find(d => d.id === result.pendingNode)
      pick = (pick * 1103515245 + 12345) % 2147483647
      const option = node?.options[Math.abs(pick) % node.options.length]?.id
      if (option) {
        resolveDecision(state, campaign, narrator, result.pendingNode, option)
        decisions.push(result.pendingNode + ':' + option)
      } else {
        timeoutNode(state, campaign, narrator)
      }
    }
  }
  const score = finalize(state, campaign)
  return { state, score, decisions }
}

describe('guiling campaign', () => {
  it('runs to completion without crashing', () => {
    const { state, score } = run(42)
    expect(state.tick).toBeGreaterThan(10)
    expect(score.total).toBeGreaterThanOrEqual(0)
    expect(score.total).toBeLessThanOrEqual(100)
    console.log('ENDING', score.endingId, score.grade, score.total, 'tick', state.tick,
      'qiLost', state.casualties.qi, 'weiLost', state.casualties.wei,
      'pressure', Math.round(state.politics.weiPressure), 'returning', state.politics.pangjuanReturning,
      'nodes', state.resolvedNodes.join(','))
  })

  it('is deterministic for same seed', () => {
    const a = run(7)
    const b = run(7)
    expect(a.score.total).toBe(b.score.total)
    expect(a.state.casualties.qi).toBe(b.state.casualties.qi)
    expect(a.state.casualties.wei).toBe(b.state.casualties.wei)
    expect(a.decisions).toEqual(b.decisions)
  })

  it('produces reports and node decisions', () => {
    const { state } = run(11)
    expect(state.reports.length).toBeGreaterThan(3)
    expect(state.resolvedNodes.length).toBeGreaterThan(0)
  })
})
