import type {
  OpsCampaign, OpsNarrative, OpsRules, OpsScore, OpsState, OpsArmyState, OpsCityState, OpsBattle, FactionId, ScorePart,
} from '@aiwar/sim'
import { armiesOf, addReport, shortestRoute, damageArmy, clamp } from '@aiwar/sim'

const ENEMY_MAIN = ['kmt-central-1', 'kmt-central-2', 'kmt-guizhou', 'kmt-chuan-1', 'kmt-chuan-2', 'kmt-yunnan', 'kmt-hunan']

function army(state: OpsState, id: string): OpsArmyState | undefined { return state.armies[id] }
function cityName(state: OpsState, id?: string): string { return id ? state.cities[id]?.name ?? id : '野外' }
function playerTotal(state: OpsState): number {
  return armiesOf(state, state.playerFaction).reduce((s, a) => s + a.troops, 0)
}
function distance(state: OpsState, a: string, b: string): number {
  return shortestRoute(state.roads, a, b).length
}
function nearestPlayerCity(state: OpsState, from: string): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const army of armiesOf(state, state.playerFaction)) {
    if (army.pos.kind !== 'city') continue
    const d = distance(state, from, army.pos.city)
    if (d < bestD) { bestD = d; best = army.pos.city }
  }
  return best
}

function moveToward(state: OpsState, army: OpsArmyState, target: string): void {
  if (army.pos.kind === 'city' && army.pos.city === target) return
  army.order = { task: 'march', target, sinceTick: state.tick, arrived: false, waitTicks: 0 }
  army.route = []
}

function orderPlayer(state: OpsState, target: string, ids?: string[]): void {
  const list = ids ? ids.map(id => army(state, id)).filter((a): a is OpsArmyState => !!a && !a.removed) : armiesOf(state, state.playerFaction)
  for (const a of list) moveToward(state, a, target)
}

const rules: OpsRules = {
  id: 'siduchishui-1935',

  opening(state, campaign, narrative): void {
    addReport(state, 'court', '军前', '遵义会议后，全军约三万人，四面皆有敌军。北渡长江是既定方向，但川军已在沿江布防。', 'mid', 0, true)
    const enemyCount = ENEMY_MAIN.reduce((s, id) => s + (state.armies[id]?.troops ?? 0), 0)
    addReport(state, 'scout', '赤水河', '侦察汇总：川军一部在土城、赤水城方向，中央军两个纵队在鲁班场、乌江方向，滇军一部在镇雄，湘军一部在松坎。敌军总计约' + Math.round(enemyCount / 10000) + '万。', 'mid', 1, true)
    addReport(state, 'note', '遵义', '全军完成整编待发。遵义会议已确定北渡长江的方向。', 'high', 0, false)
  },

  triggerNode(state, campaign): string | null {
    const done = new Set(state.resolvedNodes)
    const has = (id: string) => done.has(id)
    const at = (city: string) => armiesOf(state, state.playerFaction).some(a => a.pos.kind === 'city' && a.pos.city === city)
    const near = (city: string, n: number) => armiesOf(state, state.playerFaction).some(a => a.pos.kind === 'city' && distance(state, a.pos.city, city) <= n)
    const day = state.tick
    if (!has('d1') && day >= 2) return 'd1'
    if (!has('d2') && has('d1') && (at('tucheng') || day >= 9)) return 'd2'
    if (!has('d3') && has('d2') && (at('zhaxi') || at('taipingdu') || day >= 20)) return 'd3'
    if (!has('d4') && has('d3') && (at('loushanguan') || (at('zunyi') && (state.flags.d2 === 2 || day >= 18)) || day >= 28)) return 'd4'
    if (!has('d5') && has('d4') && (near('yaxi', 1) || at('maotai') || day >= 33)) return 'd5'
    if (!has('d6') && has('d5') && (near('lubanchang', 1) || day >= 40)) return 'd6'
    if (!has('d7') && has('d6') && (at('wujiang') || near('guiyang', 1) || day >= 50)) return 'd7'
    if (!has('d8') && has('d7') && (near('kunming', 2) || at('jiaopingdu') || day >= 68)) return 'd8'
    return null
  },

  applyDecision(state, campaign, narrative, nodeId, optionId): void {
    switch (nodeId) {
      case 'd1':
        state.flags.d1 = optionId === 'opt1' ? 1 : 2
        if (optionId === 'opt1') {
          orderPlayer(state, 'tucheng')
          addReport(state, 'court', '军前', '决定北渡长江。全军向土城、赤水方向开进。', 'high', 0, true)
        } else if (optionId === 'opt4') {
          orderPlayer(state, 'bijie')
          addReport(state, 'court', '军前', '决定南下云南，绕道北上。全军经毕节西进。', 'high', 0, true)
        } else {
          addReport(state, 'court', '军前', '暂留川黔边，观察敌军动向。', 'high', 0, true)
        }
        break
      case 'd2':
        if (optionId === 'opt1') {
          state.flags.d2 = 1
          state.vars.mainged = 1
          for (const a of armiesOf(state, state.playerFaction)) { a.morale = clamp(a.morale - 4, 5, 100); a.fatigue = clamp(a.fatigue + 8, 0, 100) }
          const chuan = army(state, 'kmt-chuan-1')
          if (chuan) chuan.troops += 4500
          addReport(state, 'deserter', '土城', '俘虏供称：当面川军不止四个团，后续仍在增援。', 'mid', 2, true)
        } else if (optionId === 'opt2') {
          state.flags.d2 = 2
          orderPlayer(state, 'yuanhou')
          addReport(state, 'court', '军前', '决定撤出战斗，西渡赤水。全军向太平渡方向转进。', 'high', 0, true)
        } else {
          state.flags.d2 = 3
          state.vars.mainged = 1
          addReport(state, 'deserter', '土城', '敌军增援不断，我军转入防御，时间不利。', 'mid', 2, true)
        }
        break
      case 'd3':
        if (optionId === 'opt1') {
          state.flags.d3 = 1
          for (const a of armiesOf(state, state.playerFaction)) {
            a.stealth = clamp(a.stealth + 0.15, 0, 1)
            a.training = clamp(a.training + 0.05, 0.8, 1.3)
            a.morale = clamp(a.morale - 3, 5, 100)
          }
          state.vars.compact = 1
          addReport(state, 'court', '扎西', '全军缩编为十六个团，机关精简，充实战斗连队。', 'high', 0, true)
          orderPlayer(state, 'taipingdu')
        } else if (optionId === 'opt2') {
          addReport(state, 'court', '扎西', '保持建制，稳定军心。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.flags.d3 = 3
          addReport(state, 'court', '扎西', '部队就地展开，准备建立根据地。', 'mid', 0, true)
        } else {
          state.flags.d3 = 4
          orderPlayer(state, 'chishuicheng')
          addReport(state, 'court', '扎西', '决定强攻川军江防，全军北上。', 'high', 0, true)
        }
        break
      case 'd4':
        if (optionId === 'opt1') {
          orderPlayer(state, 'zunyi')
          const wu = army(state, 'kmt-central-2')
          if (wu) { wu.troops = Math.round(wu.troops * 0.85); wu.morale = clamp(wu.morale - 8, 5, 100) }
          state.cities.loushanguan.owner = 'red'
          state.cities.zunyi.owner = 'red'
          state.vars.zhunyiWin = 1
          addReport(state, 'border', '遵义', '我军再占遵义，吴奇伟纵队向南退去。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.cities.loushanguan.owner = 'red'
          addReport(state, 'border', '娄山关', '我军控制娄山关，就地巩固。', 'high', 0, true)
        } else {
          addReport(state, 'court', '军前', '分兵两路，一路追击、一路西进。', 'mid', 0, true)
        }
        break
      case 'd5':
        if (optionId === 'opt1') {
          state.vars.attackDagu = 1
          const gz = army(state, 'kmt-guizhou')
          if (gz) gz.troops += 6000
          for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale - 3, 5, 100)
          addReport(state, 'scout', '打鼓新场', '侦察发现：打鼓新场周围三日内可到之敌约三个纵队。', 'low', 3, true)
        } else if (optionId === 'opt2') {
          addReport(state, 'court', '苟坝', '决定不打打鼓新场，全军转向西进。', 'high', 0, true)
          orderPlayer(state, 'maotai')
        } else {
          addReport(state, 'court', '苟坝', '以一部佯攻，主力待机。', 'mid', 0, true)
        }
        break
      case 'd6':
        if (optionId === 'opt1') {
          state.vars.attackLu = 1
          for (const a of armiesOf(state, state.playerFaction)) a.fatigue = clamp(a.fatigue + 10, 0, 100)
          addReport(state, 'deserter', '鲁班场', '敌预筑工事坚固，强攻代价甚大。', 'mid', 2, true)
        } else if (optionId === 'opt2') {
          orderPlayer(state, 'maotai')
          const zhou = army(state, 'kmt-central-1')
          if (zhou) { zhou.troops = Math.round(zhou.troops * 0.92); zhou.morale = clamp(zhou.morale - 6, 5, 100) }
          for (const a of armiesOf(state, state.playerFaction)) a.fatigue = clamp(a.fatigue + 6, 0, 100)
          addReport(state, 'border', '鲁班场', '有限攻击后撤出，敌军被牵制在原地。', 'high', 0, true)
        } else {
          orderPlayer(state, 'maotai')
          addReport(state, 'court', '军前', '绕过鲁班场，直接向茅台方向转进。', 'high', 0, true)
        }
        break
      case 'd7':
        if (optionId === 'opt2') {
          state.flags.feint = 1
          state.vars.feintDays = 0
          const yunnan = army(state, 'kmt-yunnan')
          if (yunnan) moveToward(state, yunnan, 'guiyang')
          const guizhou = army(state, 'kmt-guizhou')
          if (guizhou) moveToward(state, guizhou, 'guiyang')
          addReport(state, 'envoy', '贵阳', '我军一部逼近贵阳，敌急调滇军东援。', 'mid', 1, true)
          orderPlayer(state, 'kunming')
        } else if (optionId === 'opt1') {
          orderPlayer(state, 'songkan')
          addReport(state, 'court', '军前', '决定东进湘西，会合红二、红六军团。', 'high', 0, true)
        } else {
          addReport(state, 'court', '军前', '就地停留，另作打算。', 'mid', 0, true)
        }
        break
      case 'd8':
        if (optionId === 'opt1') {
          state.flags.crossStart = 1
          state.vars.ferry = 0
          // 渡江窗口：难度越高，追兵越近、船工越难集中，渡完全军需要的天数越多
          state.vars.ferryHold = state.difficulty === 'hell' ? 11 : state.difficulty === 'hard' ? 9 : state.difficulty === 'normal' ? 8 : 7
          orderPlayer(state, 'jiaopingdu')
          addReport(state, 'court', '金沙江', '决定主力由皎平渡渡江，一部向龙街佯动。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.flags.crossStart = 2
          state.vars.ferry = 0
          state.vars.ferryHold = state.difficulty === 'hell' ? 14 : state.difficulty === 'hard' ? 12 : 10
          orderPlayer(state, 'kunming')
          addReport(state, 'court', '金沙江', '全军转向龙街渡口，准备强渡。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.flags.crossStart = 3
          state.vars.ferry = 0
          state.vars.ferryHold = 9
          addReport(state, 'court', '金沙江', '分兵多路，同时抢渡。', 'mid', 0, true)
        } else {
          state.flags.crossStart = 4
          state.vars.ferry = 0
          state.vars.ferryHold = 14
          addReport(state, 'court', '金沙江', '就地阻击，等待时机。', 'low', 0, true)
        }
        break
      default:
        break
    }
    void narrative
  },

  aiTick(state, campaign, narrative): void {
    const feintActive = (state.flags.feint ?? 0) === 1 && (state.vars.feintDays ?? 0) < 6
    if (state.flags.feint === 1) state.vars.feintDays = (state.vars.feintDays ?? 0) + 1
    // 敌军协同差、情报滞后：按难度刷新追击目标（史实 8 天 / 普通 7 天 / 困难 4 天 / 地狱 3 天）
    const diff = campaign.difficulty[state.difficulty]
    const cadence = diff.id === 'hell' ? 3 : diff.id === 'hard' ? 4 : diff.id === 'normal' ? 7 : 8
    for (const id of ENEMY_MAIN) {
      const enemy = army(state, id)
      if (!enemy || enemy.removed) continue
      if (state.tick % cadence !== 0) continue
      if ((id === 'kmt-chuan-1' || id === 'kmt-chuan-2') && !feintActive) continue
      const fromCity = enemy.pos.kind === 'city' ? enemy.pos.city : enemy.pos.from
      if (!fromCity) continue
      const next = feintActive && (id === 'kmt-yunnan' || id === 'kmt-guizhou')
        ? 'guiyang'
        : nearestPlayerCity(state, fromCity)
      if (!next) continue
      if (enemy.pos.kind === 'city' && (next === enemy.pos.city || distance(state, enemy.pos.city, next) <= 1)) continue
      moveToward(state, enemy, next)
    }
    // 敌军逼近报告
    if (state.tick % 5 === 0) {
      const ring = computeRing(state)
      if (ring > 50) {
        const lead = armiesOf(state, state.playerFaction)[0]
        const leadCity = lead && lead.pos.kind === 'city' ? lead.pos.city : undefined
        addReport(state, 'scout', cityName(state, leadCity), narrative.line('politics.ring', { place: '四周' }, state.narrativeSalt++), 'mid', 1, ring > 80)
      }
    }
    void campaign
  },

  onTick(state, campaign, narrative): void {
    // 沿途补充：宣传与动员带来少量兵员（历史红军沿途扩红）
    if (state.tick <= 90) {
      for (const a of armiesOf(state, state.playerFaction)) {
        if (a.removed) continue
        const base = campaign.armies.find(c => c.id === a.id)?.troops ?? a.troops
        a.troops = Math.min(base, Math.round(a.troops + base * 0.0015))
      }
    }
    // 合围度
    state.vars.ring = computeRing(state)
    // 渡江判定
    if (state.flags.crossStart) {
      const crossing = state.vars.ferry ?? 0
      const total = state.vars.ferryHold ?? 7
      const atFerry = armiesOf(state, state.playerFaction).some(a => a.pos.kind === 'city' && (a.pos.city === 'jiaopingdu' || a.pos.city === 'kunming'))
      // 高难度下敌军封锁半径更大，渡口更容易被盯死
      const blockRadius = state.difficulty === 'hell' ? 3 : state.difficulty === 'hard' ? 2 : 1
      const enemyNear = ENEMY_MAIN.some(id => {
        const e = army(state, id)
        if (!e || e.removed || e.pos.kind !== 'city') return false
        return distance(state, e.pos.city, 'jiaopingdu') <= blockRadius
      })
      if (atFerry && !enemyNear) {
        state.vars.ferry = Math.min(total, crossing + 1)
        if (state.vars.ferry === 1) addReport(state, 'court', '皎平渡', narrative.line('politics.ferry', { n: '七' }, state.narrativeSalt++), 'high', 0, true)
      } else if (enemyNear && atFerry) {
        addReport(state, 'border', '皎平渡', narrative.line('politics.chase', {}, state.narrativeSalt++), 'mid', 0, true)
      }
      if (state.vars.ferry >= total) state.flags.crossed = 1
    }
    // 一渡、二渡等渡河事件
    if (state.tick === 8 && state.flags.d2 === 2) {
      addReport(state, 'court', '赤水河', narrative.line('river.cross', {}, state.narrativeSalt++), 'high', 0, true)
    }
    void campaign
  },

  checkEnd(state, campaign): void {
    if (state.over) return
    const total = playerTotal(state)
    const initial = campaign.armies.filter(a => a.faction === state.playerFaction).reduce((s, a) => s + a.troops, 0)
    if (total <= initial * 0.25) { end(state, 'wiped'); return }
    if ((state.vars.ring ?? 0) >= 100) { end(state, 'encircled'); return }
    if (state.flags.crossed === 1) { end(state, 'crossing'); return }
    if (state.tick >= 110) { end(state, state.flags.crossStart ? 'halfway' : 'timeout') }
  },

  score(state, campaign): OpsScore {
    const initial = campaign.armies.filter(a => a.faction === state.playerFaction).reduce((s, a) => s + a.troops, 0)
    const saved = playerTotal(state) / Math.max(1, initial)
    const crossed = state.flags.crossed === 1
    const enemyLoss = ENEMY_MAIN.reduce((s, id) => s + (state.casualties[id.split('-')[0] === 'kmt' ? campaign.armies.find(a => a.id === id)?.faction ?? 'kmt' : (army(state, id)?.faction ?? 'kmt')] ?? 0), 0)
    const enemyInitial = campaign.armies.filter(a => a.faction !== state.playerFaction).reduce((s, a) => s + a.troops, 0)
    const enemyLossTotal = campaign.armies.filter(a => a.faction !== state.playerFaction).reduce((s, a) => {
      const now = army(state, a.id)
      return s + (now ? Math.max(0, a.troops - now.troops) : a.troops)
    }, 0)
    const parts: ScorePart[] = [
      { key: 'cross', label: '战略转移', value: crossed ? 30 : state.flags.crossStart ? 12 : 0, max: 30, note: crossed ? '渡过金沙江' : '尚未渡江' },
      { key: 'saved', label: '兵力保存', value: Math.round(clamp(saved / 0.7, 0, 1) * 25), max: 25, note: '保存约 ' + Math.round(saved * 100) + '%' },
      { key: 'enemy', label: '敌军折损', value: Math.round(clamp(enemyLossTotal / Math.max(1, enemyInitial) / 0.15, 0, 1) * 15), max: 15, note: '约 ' + Math.round(enemyLossTotal / 10000 * 10) / 10 + ' 万' },
      { key: 'feint', label: '欺骗与佯动', value: state.flags.feint ? 15 : 0, max: 15, note: state.flags.feint ? '调动敌军成功' : '未实施' },
      { key: 'compact', label: '组织与机动', value: state.vars.compact ? 10 : 4, max: 10, note: state.vars.compact ? '扎西整编' : '未整编' },
      { key: 'time', label: '行军效率', value: state.tick < 80 ? 5 : 2, max: 5, note: '历 ' + state.tick + ' 日' },
    ]
    const raw = parts.reduce((s, p) => s + p.value, 0)
    const total = Math.min(100, Math.round(raw * campaign.difficulty[state.difficulty].scoreFactor))
    const grade: OpsScore['grade'] = total >= 75 ? 'S' : total >= 66 ? 'A' : total >= 54 ? 'B' : total >= 40 ? 'C' : 'D'
    const endings: Record<string, { title: string; text: string }> = {
      crossing: { title: '巧渡金沙江', text: '主力渡过金沙江，追兵被甩在江东。战略转移取得决定性胜利。' },
      encircled: { title: '合围', text: '敌军数路收口，我军被压在狭小地域。机动空间耗尽。' },
      wiped: { title: '主力溃散', text: '部队损失过重，建制难以维持，只能分散突围。' },
      halfway: { title: '半渡而击', text: '渡江中断，后卫被追兵截住。主力虽过江，损失惨重。' },
      timeout: { title: '滞留江东', text: '时间耗尽，追兵合围，渡江计划落空。' },
    }
    const ending = endings[state.endingId ?? 'timeout'] ?? endings.timeout
    void enemyLoss
    const highlights = [
      { label: '渡过金沙江', value: crossed ? '是' : '否' },
      { label: '保存兵力', value: Math.round(saved * 100) + '%' },
      { label: '敌军折损', value: '约 ' + Math.round(enemyLossTotal / 10000 * 10) / 10 + ' 万' },
      { label: '合围度', value: Math.round(state.vars.ring ?? 0) + '%' },
      { label: '历时', value: state.tick + ' 日' },
    ]
    return {
      grade, total, parts, endingId: state.endingId ?? 'timeout',
      endingTitle: ending.title, endingText: ending.text,
      deviation: crossed ? '完成战略转移；历史以皎平渡为主渡口，你的路径可能不同。' : '未能完成渡江，与史实走向不同。',
      highlights,
      lines: dedupe(state.log).slice(-10),
    }
  },

  powerMod(state, campaign, armyId, side): number {
    if (armyId.startsWith('red-')) return (state.flags.d2 === 1 ? 0.95 : 1) * (state.vars.compact ? 1.05 : 1)
    if (state.vars.attackLu && armyId === 'kmt-central-1') return 1.1
    if (state.vars.attackDagu && armyId === 'kmt-guizhou') return 1.15
    if (side === 'defender' && state.cities) return 1
    return 1
  },

  hud(state, campaign): { pressureText: string; objectiveText: string; stageText: string } {
    const ring = Math.round(state.vars.ring ?? 0)
    const crossed = state.flags.crossed === 1
    const ferry = state.vars.ferry ?? 0
    const hold = state.vars.ferryHold ?? 7
    return {
      pressureText: '合围度 ' + ring + '%',
      objectiveText: crossed ? '已渡江' : state.flags.crossStart ? '渡江中 ' + ferry + '/' + hold : '待渡江',
      stageText: state.resolvedNodes.length >= 8 ? '战役后段' : state.resolvedNodes.length >= 4 ? '战役中段' : '战役前段',
    }
  },
}

function computeRing(state: OpsState): number {
  const players = armiesOf(state, state.playerFaction)
  if (players.length === 0) return 100
  let count = 0
  for (const id of ENEMY_MAIN) {
    const e = state.armies[id]
    if (!e || e.removed || e.pos.kind !== 'city') continue
    for (const p of players) {
      if (p.pos.kind !== 'city') continue
      const d = shortestRoute(state.roads, e.pos.city, p.pos.city).length
      if (d <= 2) { count += 1; break }
    }
  }
  return Math.min(100, count * 14)
}

function dedupe(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) if (out[out.length - 1] !== line) out.push(line)
  return out
}

function end(state: OpsState, endingId: string): void {
  state.over = true
  state.endingId = endingId
}

export default rules
export { rules as siduRules, computeRing }