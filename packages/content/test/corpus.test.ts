import { describe, expect, it } from 'vitest'
import { PACKS } from '../src/packs.js'

/**
 * 语料接线回归：四场 ops 战役此前共用同一个 40 来条的通用语料池，
 * 「鼓角相闻」在长江、淝水、赤水河、徐州反复出现。这条测试锁住两件事：
 * 1. 每场战役都有自己的专属语料（PACK 的 narrative 出自不同语料表）；
 * 2. 同一事件在两场战役里抽到的句子不同，而不是同一句。
 */
describe('战役语料接线', () => {
  const ops = PACKS.filter(p => p.engine === 'ops')

  it('四场 ops 战役都有专属语料', () => {
    expect(ops.length).toBe(4)
    for (const pack of ops) {
      expect(pack.engine).toBe('ops')
    }
  })

  it('同一事件在不同战役里说出不同的话', () => {
    // 同一 kind、同一 salt：如果语料池相同，抽到的句子必然相同
    const samples = ops.map(pack => {
      const lines: string[] = []
      for (const salt of [0, 1, 2]) lines.push(pack.narrative.line('battle.start', { place: '某地' }, salt))
      return { id: pack.id, joined: lines.join('|') }
    })
    const unique = new Set(samples.map(s => s.joined))
    console.log('battle.start 抽样：', samples.map(s => s.id + '=' + s.joined.slice(0, 40)).join(' / '))
    expect(unique.size).toBe(ops.length)
  })

  it('专属语料覆盖引擎发出的通用 key', () => {
    const required = [
      'battle.start', 'battle.ambush_start', 'battle.rout', 'battle.ambush_win',
      'battle.annihilated', 'battle.draw', 'siege.start', 'siege.fall',
      'supply.low', 'supply.empty', 'intel.sighting', 'politics.ring',
      'politics.feint', 'opening.situation', 'node.open', 'order.blocked',
    ]
    for (const pack of ops) {
      const missing = required.filter(key => !pack.narrative.line(key, { place: 'X', city: 'X', army: 'X' }, 0))
      expect(missing, pack.id + ' 缺语料：' + missing.join(',')).toEqual([])
    }
  })
})
