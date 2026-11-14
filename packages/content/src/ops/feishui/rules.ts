import type {
  OpsCampaign, OpsNarrative, OpsRules, OpsScore, OpsState, OpsArmyState, ScorePart,
} from '@aiwar/sim'
import { armiesOf, addReport, shortestRoute, clamp, damageArmy } from '@aiwar/sim'

function army(state: OpsState, id: string): OpsArmyState | undefined { return state.armies[id] }
function dist(state: OpsState, a: string, b: string): number { return shortestRoute(state.roads, a, b).length }
function moveToward(state: OpsState, a: OpsArmyState, target: string): void {
  if (a.pos.kind === 'city' && a.pos.city === target) return
  a.order = { task: 'march', target, sinceTick: state.tick, arrived: false, waitTicks: 0 }
  a.route = []
}
function playerTroops(state: OpsState): number {
  return armiesOf(state, state.playerFaction).reduce((s, a) => s + a.troops, 0)
}
function jinAt(state: OpsState, city: string): boolean {
  return armiesOf(state, state.playerFaction).some(a => a.pos.kind === 'city' && a.pos.city === city)
}

const rules: OpsRules = {
  id: 'feishui-383',

  opening(state, campaign, narrative): void {
    addReport(state, 'court', '建康', narrative.line('opening.situation', {}, 0) || '', 'high', 0, true)
    addReport(state, 'scout', '淮河', '情报：秦军前锋进抵颍口，后续大军分批南下；淮河沿线已有秦军活动。', 'mid', 1, true)
    addReport(state, 'note', '广陵', '北府兵已集结，水军待命。朝廷命征讨大都督率军西进。', 'high', 0, false)
  },

  triggerNode(state, campaign): string | null {
    const has = (id: string) => state.resolvedNodes.includes(id)
    const day = state.tick
    if (!has('d1') && day >= 2) return 'd1'
    if (!has('d2') && (day >= 5 || jinAt(state, 'shouyang'))) return 'd2'
    if (!has('d3') && (day >= 9 || state.cities.luojian.besieged)) return 'd3'
    if (!has('d4') && (day >= 13 || state.vars.luojianWin)) return 'd4'
    if (!has('d5') && (day >= 18 || jinAt(state, 'dongjindu'))) return 'd5'
    if (!has('d6') && (state.vars.qinCollapse || day >= 24)) return 'd6'
    if (!has('d7') && day >= 28) return 'd7'
    if (!has('d8') && (state.over || day >= 36)) return 'd8'
    return null
  },

  applyDecision(state, campaign, narrative, nodeId, optionId): void {
    switch (nodeId) {
      case 'd1':
        if (optionId === 'opt1') {
          state.vars.advance = 1
          for (const a of armiesOf(state, state.playerFaction)) moveToward(state, a, 'shouyang')
          addReport(state, 'court', '建康', '晋军主动西进，抢占寿阳。', 'high', 0, true)
        } else {
          addReport(state, 'court', '建康', '决定坚守淮河一线。', 'mid', 0, true)
        }
        break
      case 'd2':
        if (optionId === 'opt1') {
          const bei = army(state, 'jin-bei')
          if (bei) moveToward(state, bei, 'shouyang')
          addReport(state, 'court', '建康', '北府兵主力增援寿阳。', 'high', 0, true)
        }
        break
      case 'd3':
        if (optionId === 'opt1') {
          state.vars.raidLuo = 1
          const bei = army(state, 'jin-bei')
          if (bei) moveToward(state, bei, 'luojian')
          addReport(state, 'court', '广陵', '五千精锐夜袭洛涧。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          for (const a of armiesOf(state, state.playerFaction)) moveToward(state, a, 'luojian')
          addReport(state, 'court', '军前', '主力强攻洛涧。', 'mid', 0, true)
        }
        break
      case 'd4':
        if (optionId === 'opt1') {
          state.vars.trustZhu = 1
          addReport(state, 'envoy', '寿阳', '朱序传信：秦军未集，宜速击其前锋。决定信之。', 'mid', 0, true)
        } else {
          addReport(state, 'envoy', '寿阳', '对朱序的情报存疑，先做侦察。', 'low', 0, true)
        }
        break
      case 'd5':
        if (optionId === 'opt1') {
          state.vars.askRetreat = 1
          addReport(state, 'court', '淝水', '遣使请秦军后撤，以便晋军渡河决战。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.forceCross = 1
          for (const a of armiesOf(state, state.playerFaction)) moveToward(state, a, 'dongjindu')
          addReport(state, 'court', '淝水', '准备强渡淝水。', 'mid', 0, true)
        }
        break
      case 'd6':
        if (optionId === 'opt1') {
          state.vars.pursue = 1
          for (const a of armiesOf(state, state.playerFaction)) moveToward(state, a, 'qinggang')
          addReport(state, 'court', '军前', '追至青冈，扩大战果。', 'high', 0, true)
        }
        break
      case 'd7':
        if (optionId === 'opt1') {
          addReport(state, 'court', '建康', '拒绝分兵西援，集中兵力于淮南。', 'high', 0, true)
        }
        break
      case 'd8':
        if (optionId === 'opt1') {
          state.vars.northExpedition = 1
          addReport(state, 'court', '建康', '乘胜北伐，收复淮北。', 'high', 0, true)
        }
        break
      default:
        break
    }
    void narrative
  },

  aiTick(state, campaign, narrative): void {
    // 秦军分批到达：每 3 天从项城向颍口增兵
    if (state.tick % 3 === 0 && state.tick <= 24) {
      const main = army(state, 'qin-main')
      const front = army(state, 'qin-front')
      if (main && front && front.troops < 260000) {
        const move = Math.min(15000, main.troops - 60000)
        if (move > 0) { main.troops -= move; front.troops += move }
      }
    }
    if (state.tick % 2 !== 0) return
    const front = army(state, 'qin-front')
    if (front && !front.removed && state.tick > 4) moveToward(state, front, 'shouyang')
    const liang = army(state, 'qin-liang')
    if (liang && !liang.removed && state.tick > 6) moveToward(state, liang, 'dongjindu')
    // 洛涧之战判定
    if (state.vars.raidLuo && !state.vars.luojianWin) {
      const bei = army(state, 'jin-bei')
      if (bei && liang && liang.pos.kind === 'city' && bei.pos.kind === 'city' && dist(state, bei.pos.city, liang.pos.city) === 0) {
        state.vars.luojianWin = 1
        damageArmy(liang, 0.35, state)
        liang.morale = clamp(liang.morale - 15, 5, 100)
        const l = army(state, 'jin-bei')
        if (l) l.morale = clamp(l.morale + 8, 5, 100)
        addReport(state, 'border', '洛涧', '北府兵破梁成部，秦军淮河封锁被打破。', 'high', 0, true)
      }
    }
    // 淝水后撤崩溃
    if (state.vars.askRetreat && !state.vars.qinCollapse && !state.vars.qinSteady && state.tick > 20) {
      const roll = ((state.seed + state.tick * 37) % 100) / 100
      if (roll < 0.9) {
        state.vars.qinCollapse = 1
        for (const id of ['qin-front', 'qin-main', 'qin-liang']) {
          const a = army(state, id)
          if (!a || a.removed) continue
          damageArmy(a, 0.28, state)
          a.morale = clamp(a.morale - 30, 5, 100)
        }
        addReport(state, 'deserter', '淝水', '秦军后撤时阵脚大乱，朱序在阵后高呼，全线动摇。', 'high', 0, true)
        addReport(state, 'border', '淝水', '晋军涉渡，秦军大溃，苻融死于阵中。', 'high', 1, true)
      } else {
        state.vars.qinSteady = 1
        addReport(state, 'deserter', '淝水', '秦军后撤有序，晋军涉渡受阻。', 'mid', 1, true)
      }
    }
    // 秦军崩溃后持续瓦解
    if (state.vars.qinCollapse) {
      for (const id of ['qin-front', 'qin-main']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        damageArmy(a, 0.02, state)
        if (a.troops < 10000) { a.removed = true; a.troops = 0 }
      }
    }
    void narrative
  },

  checkEnd(state, campaign): void {
    if (state.over) return
    const qinMain = state.armies['qin-main']
    const qinFront = state.armies['qin-front']
    const qinBroken = (!qinMain || qinMain.removed) && (!qinFront || qinFront.removed)
    if (qinBroken) { end(state, 'crushed'); return }
    if (state.vars.qinCollapse && state.tick >= 30) { end(state, 'victory'); return }
    if (playerTroops(state) < 20000) { end(state, 'rout'); return }
    if (state.tick >= 60) end(state, state.vars.qinCollapse ? 'won' : 'stalemate')
  },

  score(state, campaign): OpsScore {
    const qinMain = state.armies['qin-main']
    const qinFront = state.armies['qin-front']
    const qinBroken = (!qinMain || qinMain.removed) && (!qinFront || qinFront.removed)
    const saved = playerTroops(state) / 80000
    const losses = (state.casualties.qin ?? 0) + (state.casualties.kmt ?? 0)
    const parts: ScorePart[] = [
      { key: 'victory', label: '战役目标', value: qinBroken ? 30 : state.vars.qinCollapse ? 24 : 5, max: 30, note: qinBroken ? '秦军主力覆灭' : state.vars.qinCollapse ? '秦军溃退' : '未分胜负' },
      { key: 'luojian', label: '洛涧先胜', value: state.vars.luojianWin ? 15 : 0, max: 15, note: state.vars.luojianWin ? '破梁成部' : '未取胜' },
      { key: 'qi', label: '士气与组织', value: state.vars.qinCollapse && !state.vars.qinSteady ? 15 : 6, max: 15, note: state.vars.qinSteady ? '秦军未乱' : '秦军自乱' },
      { key: 'saved', label: '晋军保存', value: Math.round(clamp(saved / 0.8, 0, 1) * 20), max: 20, note: '保存约 ' + Math.round(saved * 100) + '%' },
      { key: 'enemy', label: '敌军折损', value: Math.round(clamp(losses / 150000, 0, 1) * 10), max: 10, note: '约 ' + Math.round(losses / 10000) + ' 万' },
      { key: 'time', label: '时间效率', value: state.tick < 30 ? 5 : 3, max: 5, note: '历 ' + state.tick + ' 日' },
    ]
    const raw = parts.reduce((s, p) => s + p.value, 0)
    const total = Math.min(100, Math.round(raw * campaign.difficulty[state.difficulty].scoreFactor))
    const grade: OpsScore['grade'] = total >= 75 ? 'S' : total >= 66 ? 'A' : total >= 54 ? 'B' : total >= 40 ? 'C' : 'D'
    const endings: Record<string, { title: string; text: string }> = {
      crushed: { title: '淝水大捷', text: '秦军主力全线崩溃，南征失败。东晋以八万之众大破号称百万的大军。' },
      victory: { title: '淝水取胜', text: '秦军溃退，晋军乘胜追击。江淮转危为安。' },
      won: { title: '击退秦军', text: '秦军退去，北伐开始。史料记载你这一局与淝水之战的主线相近。' },
      rout: { title: '晋军溃败', text: '北府兵损失过重，寿阳失守，建康震动。' },
      stalemate: { title: '相持', text: '两军相持不下，战役在漫长的对峙中结束。' },
    }
    const ending = endings[state.endingId ?? 'stalemate'] ?? endings.stalemate
    return {
      grade, total, parts, endingId: state.endingId ?? 'stalemate',
      endingTitle: ending.title, endingText: ending.text,
      deviation: state.vars.qinCollapse ? '淝水后撤崩溃与史实相符。' : '未出现秦军自乱，与史实不同。',
      highlights: [
        { label: '洛涧', value: state.vars.luojianWin ? '胜' : '未胜' },
        { label: '秦军状态', value: state.vars.qinCollapse ? '崩溃' : state.vars.qinSteady ? '有序' : '对峙' },
        { label: '晋军保存', value: Math.round(Math.min(1, saved) * 100) + '%' },
        { label: '历时', value: state.tick + ' 日' },
      ],
      lines: dedupe(state.log).slice(-10),
    }
  },

  hud(state, campaign): { pressureText: string; objectiveText: string; stageText: string } {
    const status = state.vars.qinCollapse ? '秦军溃退' : state.vars.luojianWin ? '洛涧后对峙' : '秦军压境'
    return {
      pressureText: status,
      objectiveText: state.cities.shouyang.owner === 'jin' ? '寿阳在我' : '寿阳已失',
      stageText: state.tick < 10 ? '前哨战' : state.tick < 24 ? '决战' : '追击与善后',
    }
  },
}

function dedupe(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) if (out[out.length - 1] !== line) out.push(line)
  return out
}
function end(state: OpsState, id: string): void { state.over = true; state.endingId = id }

export default rules
export { rules as feishuiRules }
