import type {
  OpsNarrative, OpsRules, OpsScore, OpsState, OpsArmyState, OpsTask, ScorePart, SourceId,
} from '@aiwar/sim'
import { armiesOf, addReport, shortestRoute, clamp, damageArmy, recordCity } from '@aiwar/sim'
import { FEISHUI_CORPUS } from './corpus.js'

// ---------------- 通用小工具 ----------------
function army(state: OpsState, id: string): OpsArmyState | undefined { return state.armies[id] }
function dist(state: OpsState, a: string, b: string): number { return shortestRoute(state.roads, a, b).length }
function playerTroops(state: OpsState): number {
  return armiesOf(state, state.playerFaction).reduce((s, a) => s + a.troops, 0)
}
function jinAt(state: OpsState, city: string): boolean {
  return armiesOf(state, state.playerFaction).some(a => a.pos.kind === 'city' && a.pos.city === city)
}
function moveToward(state: OpsState, a: OpsArmyState, target: string, task: OpsTask = 'march'): void {
  // 已经在目标城就不重复下军令：与原实现一致，避免把「抵达后转驻守」冲成「原地行军」。
  if (task === 'march' && a.pos.kind === 'city' && a.pos.city === target) return
  a.order = { task, target, sinceTick: state.tick, arrived: false, waitTicks: 0 }
  a.route = []
}
/** 只给指定部队下令；ids 里不存在或已覆灭的部队自动跳过（决策可能在任意局面下被调用） */
function orderTo(state: OpsState, ids: readonly string[], target: string, task: OpsTask = 'march'): void {
  for (const id of ids) {
    const a = army(state, id)
    if (a && !a.removed) moveToward(state, a, target, task)
  }
}
function orderAll(state: OpsState, target: string, task: OpsTask = 'march'): void {
  for (const a of armiesOf(state, state.playerFaction)) moveToward(state, a, target, task)
}
function holdAll(state: OpsState, task: OpsTask = 'hold'): void {
  for (const a of armiesOf(state, state.playerFaction)) {
    if (a.removed) continue
    const here = a.pos.kind === 'city' ? a.pos.city : a.pos.to
    moveToward(state, a, here, task)
  }
}
function moraleOf(state: OpsState, ids: readonly string[], delta: number): void {
  for (const id of ids) {
    const a = army(state, id)
    if (a && !a.removed) a.morale = clamp(a.morale + delta, 5, 100)
  }
}
function fatigueOf(state: OpsState, ids: readonly string[], delta: number): void {
  for (const id of ids) {
    const a = army(state, id)
    if (a && !a.removed) a.fatigue = clamp(a.fatigue + delta, 0, 100)
  }
}
function bump(state: OpsState, key: string, delta: number): void {
  state.vars[key] = clamp((state.vars[key] ?? 0) + delta, -99, 99)
}

// 主线四部：北府兵、晋军主力、水军、荆州军。新增的刘牢之、谢琰、胡彬三部不自动西进，
// 否则寿阳城下的兵力对比会平白多出近两万人，史实路线会变成碾压，评级与难度梯度都要失真。
const MAIN_JIN = ['jin-bei', 'jin-main', 'jin-shui', 'jin-west'] as const

// ---------------- 语料 ----------------
function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '')
}
/**
 * 取一条战报正文：先问 narrator，取不到再用本役语料兜底。
 * 为什么不是反过来：packs.ts 已经按 makeOpsNarrator(FEISHUI_CORPUS) 接线，narrator 里的池子
 * 是「通用 BASE + 本役专属」合并后的完整池，选中率与随机分布都在那一层统一；rules 若自己先挑，
 * 相当于绕过 narrator 的池子，同一个 key 的句子会以另一套节奏重复出现，反而更单调。
 * 兜底存在的理由：rules 会被单测直接调用（decisions/debrief 都自己 new 了 makeOpsNarrator()），
 * 那时 narrative 里没有本役语料，若不再兜一层，feishui.* 这类新 key 会静默返回空串、战报变成空行。
 */
function sayLine(state: OpsState, narrative: OpsNarrative, kind: string, params: Record<string, string> = {}): string {
  const salt = state.narrativeSalt++
  const fromNarrator = narrative.line(kind, params, salt)
  if (fromNarrator) return fromNarrator
  const pool = FEISHUI_CORPUS[kind]
  if (pool && pool.length > 0) {
    const picked = pool[Math.abs(salt) % pool.length] ?? pool[0] ?? ''
    return fill(picked, params)
  }
  return ''
}
function say(
  state: OpsState, narrative: OpsNarrative, source: SourceId, place: string, kind: string,
  params: Record<string, string>, confidence: 'high' | 'mid' | 'low', delay = 0, important = true,
): void {
  const text = sayLine(state, narrative, kind, params) || place + '方面有新的军情。'
  addReport(state, source, place, text, confidence, delay, important)
}

// ---------------- 规则 ----------------
const rules: OpsRules = {
  id: 'feishui-383',

  opening(state, campaign, narrative): void {
    say(state, narrative, 'court', '建康', 'opening.situation', {}, 'high', 0, true)
    say(state, narrative, 'scout', '淮河', 'intel.sighting', { place: '颍口', band: '八至十五万' }, 'mid', 1, true)
    say(state, narrative, 'note', '广陵', 'feishui.muster', {}, 'high', 0, false)
    addReport(state, 'envoy', '寿阳', '朝廷命征讨大都督率北府兵西进；荆州桓冲另以水陆攻襄阳、沔北，牵制秦军西线。', 'high', 0, false)
    void campaign
  },

  triggerNode(state, campaign): string | null {
    const has = (id: string) => state.resolvedNodes.includes(id)
    const day = state.tick
    if (!has('d1') && day >= 2) return 'd1'
    if (!has('d2') && (day >= 5 || jinAt(state, 'shouyang'))) return 'd2'
    if (!has('d3') && (day >= 9 || state.cities.luojian.besieged)) return 'd3'
    if (!has('d4') && (day >= 13 || state.vars.luojianWin)) return 'd4'
    if (!has('d5') && (day >= 18 || jinAt(state, 'dongjindu'))) return 'd5'
    // d9 卡在 d5 与 d6 之间：请退之后的涉渡时机只有一两天可决，放在追击节点之前才对得上时序。
    if (!has('d9') && has('d5') && day >= 20) return 'd9'
    if (!has('d6') && (state.vars.qinCollapse || day >= 24)) return 'd6'
    // d10 与主战场并行：硖石被围是十月的旧账，十一月才有余力回头处置。
    if (!has('d10') && has('d3') && day >= 26) return 'd10'
    if (!has('d7') && day >= 28) return 'd7'
    if (!has('d8') && (state.over || day >= 36)) return 'd8'
    // d11 是善后节点：要么已经打出北伐之议，要么战事拖到四旬之后。
    if (!has('d11') && (state.vars.northExpedition === 1 || day >= 42)) return 'd11'
    void campaign
    return null
  },

  applyDecision(state, campaign, narrative, nodeId, optionId): void {
    switch (nodeId) {
      // 先手：西线牵制 vs 全线固守。四个选项都要在盘面上留下痕迹，
      // 否则「选了等于没选」，玩家决策页上会出现四个一模一样的按钮。
      case 'd1': {
        state.flags.d1 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.advance = 1
          orderTo(state, MAIN_JIN, 'shouyang')
          say(state, narrative, 'court', '建康', 'feishui.morale', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.holdHuai = 1
          holdAll(state)
          fatigueOf(state, MAIN_JIN, -2)
          moraleOf(state, ['qin-front'], 2)
          say(state, narrative, 'court', '淮河', 'feishui.hold', {}, 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.holdYangtze = 1
          orderTo(state, ['jin-bei', 'jin-main', 'jin-shui'], 'jiankang')
          orderTo(state, ['jin-west'], 'jiangling')
          state.cities.hefei.grain = Math.max(0, state.cities.hefei.grain - 2)
          state.cities.shouyang.grain = Math.max(0, state.cities.shouyang.grain - 4)
          moraleOf(state, MAIN_JIN, -3)
          say(state, narrative, 'court', '建康', 'feishui.court', {}, 'mid', 0, true)
        } else {
          state.vars.raidSupply = 1
          orderTo(state, ['jin-shui', 'jin-hu'], 'yingkou', 'feint')
          const front = army(state, 'qin-front')
          if (front && !front.removed) {
            front.foodDays = Math.max(0, front.foodDays - 3)
            front.morale = clamp(front.morale - 1, 5, 100)
          }
          const main = army(state, 'qin-main')
          if (main && !main.removed) main.foodDays = Math.max(0, main.foodDays - 2)
          say(state, narrative, 'scout', '淮上', 'feishui.raid', {}, 'mid', 1, true)
        }
        break
      }
      // 寿阳告急：先派谁。派谁去，谁就背上疲劳与损耗，不能只是换个文案。
      case 'd2': {
        state.flags.d2 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.forwardBei = 1
          orderTo(state, ['jin-bei'], 'shouyang')
          moraleOf(state, ['jin-bei', 'jin-yan'], 1)
          say(state, narrative, 'court', '军前', 'feishui.muster', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.navyUp = 1
          orderTo(state, ['jin-shui'], 'shouyang')
          state.cities.shouyang.grain = Math.max(0, state.cities.shouyang.grain - 1)
          moraleOf(state, ['jin-shui'], 2)
          say(state, narrative, 'scout', '淮水', 'politics.ferry', { place: '淮水' }, 'mid', 1, true)
        } else if (optionId === 'opt3') {
          state.vars.holdGuangling = 1
          holdAll(state)
          state.cities.guangling.garrison += 1500
          moraleOf(state, ['jin-bei'], -2)
          say(state, narrative, 'court', '广陵', 'feishui.hold', {}, 'mid', 0, true)
        } else {
          state.vars.westEast = 1
          orderTo(state, ['jin-west'], 'shouyang')
          fatigueOf(state, ['jin-west'], 4)
          state.cities.jiangling.garrison = Math.max(500, state.cities.jiangling.garrison - 2000)
          say(state, narrative, 'court', '江陵', 'feishui.grain', {}, 'mid', 1, true)
        }
        break
      }
      // 洛涧：本役第一个胜负手。突袭能破封锁，强攻则是拿人命换时间。
      case 'd3': {
        state.flags.d3 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.raidLuo = 1
          orderTo(state, ['jin-bei'], 'luojian')
          moraleOf(state, ['jin-lao'], 2)
          say(state, narrative, 'court', '军前', 'feishui.morale', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.massAssault = 1
          orderTo(state, MAIN_JIN, 'luojian', 'assault')
          fatigueOf(state, MAIN_JIN, 3)
          moraleOf(state, ['qin-liang'], 2)
          say(state, narrative, 'border', '洛涧', 'battle.start', { place: '洛涧' }, 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.bypassLuo = 1
          orderTo(state, MAIN_JIN, 'shouyang')
          moraleOf(state, MAIN_JIN, -2)
          moraleOf(state, ['qin-liang'], 3)
          state.cities.shouyang.grain = Math.max(0, state.cities.shouyang.grain - 1)
          say(state, narrative, 'court', '淮上', 'politics.feint', { place: '寿阳' }, 'mid', 0, true)
        } else {
          state.vars.holdLine = 1
          holdAll(state)
          fatigueOf(state, ['jin-bei'], -4)
          moraleOf(state, ['qin-front'], 3)
          say(state, narrative, 'court', '军前', 'feishui.hold', {}, 'mid', 0, true)
        }
        break
      }
      // 朱序情报：信与不信，差别在「早打两天」还是「等秦军到齐」。
      case 'd4': {
        state.flags.d4 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.trustZhu = 1
          bump(state, 'suspicion', 1)
          say(state, narrative, 'envoy', '寿阳', 'feishui.zhuxu', {}, 'mid', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.scoutFirst = 1
          const bei = army(state, 'jin-bei')
          if (bei && !bei.removed) moveToward(state, bei, bei.pos.kind === 'city' ? bei.pos.city : 'shouyang', 'scout')
          state.vars.scouting = 1
          moraleOf(state, ['jin-bei'], -1)
          say(state, narrative, 'scout', '淮上', 'feishui.scout', {}, 'mid', 0, true)
          say(state, narrative, 'scout', '八公山', 'feishui.bagong', {}, 'mid', 1, true)
        } else if (optionId === 'opt3') {
          state.vars.ignoreZhu = 1
          holdAll(state)
          moraleOf(state, ['qin-front'], 2)
          moraleOf(state, ['jin-bei'], -2)
          say(state, narrative, 'court', '建康', 'feishui.court', {}, 'low', 1, true)
        } else {
          state.vars.doubleBluff = 1
          orderTo(state, ['jin-shui'], 'xiacai', 'feint')
          moraleOf(state, ['qin-liang'], -2)
          const bei = army(state, 'jin-bei')
          if (bei) bei.stealth = clamp(bei.stealth + 0.1, 0, 1)
          say(state, narrative, 'scout', '下蔡', 'feishui.feint', { place: '下蔡' }, 'mid', 1, true)
        }
        break
      }
      // 淝水：请退是本役招牌。四个选项给出的不是文案差异，而是完全不同的战斗形态。
      case 'd5': {
        state.flags.d5 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.askRetreat = 1
          say(state, narrative, 'court', '淝水', 'feishui.river', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.forceCross = 1
          orderTo(state, MAIN_JIN, 'dongjindu')
          moraleOf(state, ['jin-bei'], -2)
          fatigueOf(state, MAIN_JIN, 4)
          moraleOf(state, ['qin-front'], 2)
          say(state, narrative, 'border', '淝水', 'battle.start', { place: '淝水' }, 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.standoff = 1
          orderTo(state, MAIN_JIN, 'dongjindu', 'hold')
          const front = army(state, 'qin-front')
          if (front && !front.removed) front.foodDays = Math.max(0, front.foodDays - 3)
          state.cities.shouyang.grain = Math.max(0, state.cities.shouyang.grain - 3)
          moraleOf(state, ['jin-bei'], -1)
          say(state, narrative, 'court', '合肥', 'feishui.grain', {}, 'mid', 1, true)
        } else {
          state.vars.flankMove = 1
          orderTo(state, ['jin-main'], 'qinggang')
          orderTo(state, ['jin-shui'], 'dongjindu', 'feint')
          moraleOf(state, ['jin-bei'], -1)
          moraleOf(state, ['qin-front'], -1)
          say(state, narrative, 'scout', '青冈', 'feishui.feint', { place: '青冈' }, 'mid', 1, true)
        }
        break
      }
      // 涉渡时机：新增节点，对应档案里「秦军退到一半 / 退完」的分歧。
      case 'd9': {
        state.flags.d9 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.crossNow = 1
          orderTo(state, ['jin-bei', 'jin-main', 'jin-yan'], 'dongjindu')
          moraleOf(state, ['jin-bei', 'jin-main', 'jin-yan'], 4)
          moraleOf(state, ['qin-front'], -4)
          say(state, narrative, 'border', '淝水', 'feishui.crossing', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.crossLate = 1
          orderTo(state, ['jin-bei', 'jin-main'], 'dongjindu', 'hold')
          moraleOf(state, ['jin-bei'], 2)
          moraleOf(state, ['qin-front'], 1)
          say(state, narrative, 'court', '淝水', 'feishui.cross_late', {}, 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.crossFlank = 1
          orderTo(state, ['jin-main'], 'qinggang')
          orderTo(state, ['jin-bei'], 'dongjindu')
          fatigueOf(state, ['jin-main'], 3)
          moraleOf(state, ['jin-bei'], 1)
          say(state, narrative, 'scout', '淝水上游', 'feishui.feint', { place: '淝水上游' }, 'mid', 1, true)
        } else {
          state.vars.holdBank = 1
          orderTo(state, ['jin-bei', 'jin-main'], 'dongjindu', 'hold')
          const front = army(state, 'qin-front')
          if (front && !front.removed) front.morale = clamp(front.morale + 2, 5, 100)
          moraleOf(state, ['jin-bei', 'jin-main'], -3)
          state.cities.hefei.grain = Math.max(0, state.cities.hefei.grain - 2)
          say(state, narrative, 'court', '东津渡', 'feishui.hold', {}, 'mid', 0, true)
        }
        break
      }
      // 追击：战果、疲劳、侧翼三者互斥。
      case 'd6': {
        state.flags.d6 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.pursue = 1
          orderAll(state, 'qinggang')
          bump(state, 'suspicion', 1)
          say(state, narrative, 'border', '青冈', 'feishui.pursuit', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.stopShort = 1
          holdAll(state)
          moraleOf(state, ['jin-bei', 'jin-main'], 1)
          state.cities.qinggang.grain += 2
          say(state, narrative, 'court', '军前', 'feishui.aftermath', {}, 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.splitPursue = 1
          orderTo(state, ['jin-bei'], 'qinggang', 'pursue')
          orderTo(state, ['jin-main'], 'shouyang')
          orderTo(state, ['jin-west'], 'hefei')
          moraleOf(state, ['qin-front'], -2)
          say(state, narrative, 'border', '淮上', 'politics.chase', { place: '青冈' }, 'high', 0, true)
        } else {
          state.vars.recoverShouyang = 1
          orderAll(state, 'shouyang')
          const shou = state.cities.shouyang
          if (shou.owner !== state.playerFaction) {
            const from = shou.owner
            shou.owner = state.playerFaction
            shou.garrison = Math.max(shou.garrison, 3000)
            shou.grain = Math.max(5, shou.grain)
            recordCity(state, { city: shou.id, name: shou.name, tick: state.tick + 1, from, to: state.playerFaction, cause: 'assault' })
          } else {
            shou.garrison += 1000
          }
          say(state, narrative, 'court', '寿阳', 'feishui.aftermath', {}, 'high', 0, true)
        }
        break
      }
      // 荆州方向：分兵与不分兵，决定的是主战场的兵力密度。
      case 'd7': {
        state.flags.d7 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.rejectWest = 1
          orderTo(state, ['jin-west'], 'jiangling', 'hold')
          moraleOf(state, ['jin-west'], 1)
          say(state, narrative, 'court', '建康', 'feishui.court', {}, 'mid', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.westReinforce = 1
          const main = army(state, 'jin-main')
          const west = army(state, 'jin-west')
          if (main && !main.removed) { main.troops = Math.max(1000, main.troops - 3000) }
          if (west && !west.removed) { west.troops += 3000; west.morale = clamp(west.morale + 2, 5, 100) }
          say(state, narrative, 'court', '江陵', 'feishui.grain', {}, 'mid', 1, true)
        } else if (optionId === 'opt3') {
          state.vars.westIndependent = 1
          orderTo(state, ['jin-west'], 'xiangyang', 'assault')
          moraleOf(state, ['jin-west'], -1)
          say(state, narrative, 'court', '襄阳', 'politics.ring', { place: '襄阳' }, 'mid', 0, true)
        } else {
          state.vars.allWest = 1
          orderTo(state, MAIN_JIN, 'jiangling')
          moraleOf(state, ['qin-front'], 3)
          state.cities.hefei.garrison = Math.max(300, state.cities.hefei.garrison - 1000)
          say(state, narrative, 'court', '江陵', 'feishui.court', {}, 'mid', 0, true)
        }
        break
      }
      // 战后：北伐与庙堂猜忌是同一枚钱的两面。
      case 'd8': {
        state.flags.d8 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.northExpedition = 1
          bump(state, 'suspicion', 3)
          moraleOf(state, ['jin-bei', 'jin-main'], 2)
          orderTo(state, ['jin-bei'], 'pengcheng')
          say(state, narrative, 'court', '建康', 'feishui.aftermath', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.garrisonHuai = 1
          orderTo(state, MAIN_JIN, 'hefei', 'hold')
          bump(state, 'suspicion', -1)
          state.cities.hefei.garrison += 2000
          say(state, narrative, 'court', '合肥', 'feishui.hold', {}, 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.manageJing = 1
          orderTo(state, ['jin-west'], 'jiangling')
          state.cities.jiangling.grain += 3
          bump(state, 'suspicion', -1)
          say(state, narrative, 'court', '江陵', 'feishui.grain', {}, 'mid', 1, true)
        } else {
          state.vars.peaceTalk = 1
          bump(state, 'suspicion', -2)
          moraleOf(state, ['jin-bei', 'jin-main'], -2)
          say(state, narrative, 'envoy', '建康', 'politics.ring', { place: '建康' }, 'low', 1, true)
        }
        break
      }
      // 硖石：救是战术收益，不救是战略收益。新增节点。
      case 'd10': {
        state.flags.d10 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.abandonXiashi = 1
          state.cities.xiashi.garrison = Math.max(300, state.cities.xiashi.garrison - 800)
          state.cities.xiashi.grain = Math.max(0, state.cities.xiashi.grain - 2)
          moraleOf(state, ['jin-hu'], -2)
          say(state, narrative, 'court', '硖石', 'feishui.abandon', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.saveXiashi = 1
          orderTo(state, ['jin-hu'], 'xiashi')
          state.cities.xiashi.grain += 6
          moraleOf(state, ['jin-hu', 'jin-shui'], 3)
          say(state, narrative, 'court', '硖石', 'politics.ferry', { place: '硖石' }, 'mid', 1, true)
        } else if (optionId === 'opt3') {
          state.vars.feintXiacai = 1
          orderTo(state, ['jin-hu'], 'xiacai', 'feint')
          state.cities.xiacai.garrison = Math.max(300, state.cities.xiacai.garrison - 300)
          moraleOf(state, ['qin-liang'], -3)
          say(state, narrative, 'scout', '下蔡', 'feishui.feint', { place: '下蔡' }, 'mid', 1, true)
        } else {
          state.vars.loseXiashi = 1
          const xia = state.cities.xiashi
          if (xia.owner !== 'qin') {
            const from = xia.owner
            xia.owner = 'qin'
            xia.garrison = 600
            xia.grain = 2
            recordCity(state, { city: xia.id, name: xia.name, tick: state.tick + 1, from, to: 'qin', cause: 'assault' })
          }
          orderTo(state, ['jin-hu'], 'qinggang', 'retreat')
          moraleOf(state, MAIN_JIN, -3)
          say(state, narrative, 'court', '硖石', 'feishui.morale', {}, 'mid', 0, true)
        }
        break
      }
      // 善后：新增节点。猜忌值在这里第一次可以被玩家主动压低或拉高。
      case 'd11': {
        state.flags.d11 = optionId === 'opt1' ? 1 : optionId === 'opt2' ? 2 : optionId === 'opt3' ? 3 : 4
        if (optionId === 'opt1') {
          state.vars.yieldCredit = 1
          bump(state, 'suspicion', -2)
          moraleOf(state, MAIN_JIN, 1)
          say(state, narrative, 'court', '建康', 'feishui.aftermath', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.northExpedition = 1
          bump(state, 'suspicion', 3)
          moraleOf(state, ['jin-bei', 'jin-main'], 2)
          orderTo(state, ['jin-bei'], 'pengcheng')
          say(state, narrative, 'court', '淮北', 'feishui.aftermath', {}, 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.yieldCommand = 1
          bump(state, 'suspicion', -3)
          moraleOf(state, MAIN_JIN, -2)
          state.cities.jingkou.garrison += 2000
          say(state, narrative, 'court', '京口', 'feishui.court', {}, 'mid', 1, true)
        } else {
          state.vars.alignHuan = 1
          bump(state, 'suspicion', 2)
          moraleOf(state, ['jin-west'], 4)
          fatigueOf(state, ['jin-west'], -2)
          say(state, narrative, 'court', '江陵', 'feishui.court', {}, 'mid', 1, true)
        }
        break
      }
      default:
        break
    }
    void campaign
  },

  aiTick(state, campaign, narrative): void {
    // 秦军分批到达：每 3 天从项城向颍口增兵
    if (state.tick % 3 === 0 && state.tick <= 24) {
      const main = army(state, 'qin-main')
      const front = army(state, 'qin-front')
      if (main && front && front.troops < 300000) {
        const move = Math.min(15000, main.troops - 60000)
        if (move > 0) { main.troops -= move; front.troops += move }
      }
    }
    if (state.tick % 2 !== 0) return
    const front = army(state, 'qin-front')
    if (front && !front.removed && state.tick > 4) moveToward(state, front, 'shouyang')
    const liang = army(state, 'qin-liang')
    // 梁成部据洛涧而守（史实：梁成屯洛涧，刘牢之直前渡水击破之），被破后才退往东津渡
    if (liang && !liang.removed && state.vars.luojianWin && state.tick > 6) moveToward(state, liang, 'dongjindu')
    // 洛涧之战判定
    if (state.vars.raidLuo && !state.vars.luojianWin) {
      const bei = army(state, 'jin-bei')
      // 兵临洛涧即可发起突袭：原先要求「与梁成部同驻一城」，
      // 但部队在抵达同城前就会先被判定接战/被别的命令改派，条件实际永远不成立（64 种组合里 0 命中）。
      if (bei && liang && liang.pos.kind === 'city' && bei.pos.kind === 'city' && dist(state, bei.pos.city, liang.pos.city) <= 1) {
        state.vars.luojianWin = 1
        damageArmy(liang, 0.35, state)
        liang.morale = clamp(liang.morale - 15, 5, 100)
        const l = army(state, 'jin-bei')
        if (l) l.morale = clamp(l.morale + 8, 5, 100)
        say(state, narrative, 'border', '洛涧', 'feishui.luojian', {}, 'high', 0, true)
        addReport(state, 'court', '洛涧', '五千精锐直前渡水，梁成部不能拒，淮上木栅尽撤。', 'high', 0, true)
      }
    }
    // 淝水后撤崩溃
    if (state.vars.askRetreat && !state.vars.qinCollapse && !state.vars.qinSteady && state.tick > 20) {
      // 秦军自乱概率：史实几乎必乱；高难度下秦军更稳，需要先打掉其组织
      // 哈希打散，保证不同 seed / tick 上的判定均匀分布
      const roll = (Math.imul(state.seed ^ (state.tick * 2246822519), 3266489917) >>> 0) % 100 / 100
      const collapseChance = state.difficulty === 'hell' ? 0.5 : state.difficulty === 'hard' ? 0.68 : state.difficulty === 'normal' ? 0.82 : 0.95
      if (roll < collapseChance) {
        state.vars.qinCollapse = 1
        for (const id of ['qin-front', 'qin-main', 'qin-liang']) {
          const a = army(state, id)
          if (!a || a.removed) continue
          damageArmy(a, 0.28, state)
          a.morale = clamp(a.morale - 30, 5, 100)
        }
        // 张蚝部与东路秦军同样在退潮里掉队：后撤令不会只执行一半。
        for (const id of ['qin-zhang', 'qin-east']) {
          const a = army(state, id)
          if (!a || a.removed) continue
          damageArmy(a, 0.12, state)
          a.morale = clamp(a.morale - 12, 5, 100)
        }
        state.vars.suspicion = (state.vars.suspicion ?? 0) + 1
        say(state, narrative, 'deserter', '淝水', 'feishui.cascade', {}, 'high', 0, true)
        addReport(state, 'border', '淝水', '晋军涉渡，秦军大溃，苻融马倒，殁于阵中。', 'high', 1, true)
      } else {
        state.vars.qinSteady = 1
        say(state, narrative, 'deserter', '淝水', 'battle.draw', { place: '淝水' }, 'mid', 1, true)
        addReport(state, 'border', '淝水', '秦军后撤有序，阵脚未乱，晋军涉渡受阻。', 'mid', 1, true)
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
      // 每 6 天补一条沿途瓦解的战报：让「后撤级联」在战报流里看得见，而不只是一个内部标记。
      if (state.tick % 6 === 0) {
        say(state, narrative, 'deserter', '青冈', 'feishui.cascade', {}, 'mid', 1, false)
      }
    }
    void campaign
    void narrative
  },

  /**
   * 本役专属的四个持续性事件（每次进入下一日结算，条件满足即发生一次）：
   * 1. 洛涧先胜的士气转折：把一次前哨战的胜利兑换成全军的士气与敌军的动摇；
   * 2. 朱序内应：一次性提高情报可信度，用后即消耗（暴露风险由信任值提高体现）；
   * 3. 秦军后援分批到达：逼玩家在「兵力到达曲线」上找窗口，晚打就更难打；
   * 4. 庙堂猜忌：军功累积到阈值，朝议反噬，直接扣士气。
   */
  onTick(state, campaign, narrative): void {
    // 1. 洛涧先胜 → 全军士气转折
    if (state.vars.luojianWin === 1 && state.vars.luojianMorale !== 1) {
      state.vars.luojianMorale = 1
      bump(state, 'suspicion', 1)
      for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale + 3, 5, 100)
      for (const id of ['qin-front', 'qin-liang', 'qin-zhang']) {
        const q = army(state, id)
        if (q && !q.removed) q.morale = clamp(q.morale - 3, 5, 100)
      }
      say(state, narrative, 'border', '洛涧', 'feishui.luojian', {}, 'high', 0, true)
    }
    // 2. 朱序内应：信任了才有一手准情报；情报到手，北府兵的判断更正、胆子更大
    if (state.vars.trustZhu === 1 && state.vars.zhuBurned !== 1 && state.tick >= 15) {
      state.vars.zhuBurned = 1
      state.vars.intelBoost = 1
      const bei = army(state, 'jin-bei')
      if (bei && !bei.removed) bei.morale = clamp(bei.morale + 2, 5, 100)
      say(state, narrative, 'envoy', '寿阳', 'feishui.zhuxu', {}, 'mid', 0, true)
    }
    // 3. 秦军后援分批到达：凉州、幽冀、蜀汉诸军不是一天到齐的，
    //    每 6 天补 6000 人；上限两次，避免把秦军补成铁板一块、玩家无从下手。
    const extra = state.vars.reinforceCount ?? 0
    if (state.vars.qinCollapse !== 1 && state.tick >= 12 && state.tick <= 26 && state.tick % 6 === 0 && extra < 2) {
      state.vars.reinforceCount = extra + 1
      const qinFront = army(state, 'qin-front')
      const qinMain = army(state, 'qin-main')
      if (qinFront && qinMain && !qinFront.removed && !qinMain.removed) {
        const move = Math.min(6000, Math.max(0, qinMain.troops - 60000))
        qinMain.troops -= move
        qinFront.troops += move
      }
      say(state, narrative, 'scout', '颍口', 'feishui.reinforce', {}, 'mid', 1, false)
      // 十一月淮上早寒：援军冒寒而来，这一段用天气语料，不进任何判定
      if (state.tick >= 18) say(state, narrative, 'note', '淮上', 'feishui.winter', {}, 'low', 1, false)
    }
    // 4. 庙堂猜忌：与战果挂钩，只看数值不看叙事，所以「赢了战争、输了政治」是可复现的
    const suspicion = state.vars.suspicion ?? 0
    if (suspicion >= 4 && state.vars.courtWarned !== 1) {
      state.vars.courtWarned = 1
      for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale - 1, 5, 100)
      say(state, narrative, 'court', '建康', 'feishui.court', {}, 'mid', 1, true)
    }
    void campaign
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
    void campaign
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
    const suspicion = state.vars.suspicion ?? 0
    const deviation = state.vars.qinCollapse
      ? (suspicion >= 4 ? '淝水后撤崩溃与史实相符，但军功过盛，朝议已有异辞。' : '淝水后撤崩溃与史实相符。')
      : '未出现秦军自乱，与史实不同。'
    return {
      grade, total, parts, endingId: state.endingId ?? 'stalemate',
      endingTitle: ending.title, endingText: ending.text,
      deviation,
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
    const stage = state.tick < 10 ? '前哨战' : state.tick < 20 ? '决战' : state.tick < 28 ? '涉渡与追击' : '追击与善后'
    void campaign
    return {
      pressureText: status,
      objectiveText: state.cities.shouyang.owner === 'jin' ? '寿阳在我' : '寿阳已失',
      stageText: stage,
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
