import { describe, it } from 'vitest'
import { createGame, advanceDay, resolveDecision, finalize } from '@aiwar/sim'
import { guilingCampaign as campaign, narrator } from '../src/index.js'

const HISTORIC: Record<string, string> = { n1: 'opt1', n2: 'opt3', n3: 'opt2', n4: 'opt1', n5: 'opt2', n6: 'opt1', n7: 'opt2' }
const DIRECT: Record<string, string> = { n1: 'opt1', n2: 'opt1', n3: 'opt1', n4: 'opt2', n5: 'opt1', n6: 'opt3', n7: 'opt1' }
const NOSAVE: Record<string, string> = { n1: 'opt3', n2: 'opt2', n3: 'opt1', n4: 'opt1', n5: 'opt1', n6: 'opt4', n7: 'opt1' }

function run(difficulty: any, seed: number, picks: Record<string, string>) {
  const state = createGame({ campaign, difficulty, seed })
  for (let i = 0; i < 120; i++) {
    if (state.over) break
    const r = advanceDay(state, campaign, narrator)
    if (r.pendingNode) resolveDecision(state, campaign, narrator, r.pendingNode, picks[r.pendingNode] ?? 'opt1')
  }
  const score = finalize(state, campaign)
  return {
    ending: score.endingId, grade: score.grade, total: score.total,
    days: state.tick, ambush: state.flags.ambushSuccess === 1,
    weiLost: state.casualties.wei, zhaoSaved: state.cities['handan'].owner === 'zhao',
    nodes: state.resolvedNodes.length,
  }
}

describe('balance', () => {
  it('summary', () => {
    for (const [name, picks] of [['史实路线', HISTORIC], ['直趋邯郸', DIRECT], ['不救赵', NOSAVE]] as const) {
      for (const diff of ['hist', 'normal', 'hard', 'hell'] as const) {
        const rows: ReturnType<typeof run>[] = []
        for (let seed = 1; seed <= 8; seed++) rows.push(run(diff, seed, picks))
        const avg = (f: (r: ReturnType<typeof run>) => number) => (rows.reduce((s, r) => s + f(r), 0) / rows.length).toFixed(1)
        const grades = rows.map(r => r.grade).join('')
        const endings = [...new Set(rows.map(r => r.ending))].join(',')
        const amb = rows.filter(r => r.ambush).length
        console.log(name, diff, 'avg=' + avg(r => r.total), 'grades=' + grades, 'days=' + avg(r => r.days), 'ambush=' + amb + '/8', 'weiLost=' + avg(r => r.weiLost), 'zhaoSaved=' + rows.filter(r => r.zhaoSaved).length + '/8', 'endings=' + endings)
      }
    }
  })
})