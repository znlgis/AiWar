import type {
  OpsCampaign, OpsNarrative, OpsRules, OpsScore, OpsState, OpsArmyState, OpsBattle, ScorePart, OpsCityState,
} from '@aiwar/sim'
import { armiesOf, addReport, shortestRoute, clamp, damageArmy } from '@aiwar/sim'

function army(state: OpsState, id: string): OpsArmyState | undefined { return state.armies[id] }
function cityName(state: OpsState, id?: string): string { return id ? state.cities[id]?.name ?? id : '战场' }
function dist(state: OpsState, a: string, b: string): number { return shortestRoute(state.roads, a, b).length }
function playerTroops(state: OpsState): number {
  return armiesOf(state, state.playerFaction).reduce((s, a) => s + a.troops, 0)
}
function moveToward(state: OpsState, a: OpsArmyState, target: string): void {
  if (a.pos.kind === 'city' && a.pos.city === target) return
  a.order = { task: 'march', target, sinceTick: state.tick, arrived: false, waitTicks: 0 }
  a.route = []
}
function orderPlayer(state: OpsState, target: string, ids?: string[]): void {
  const list = ids ? ids.map(id => army(state, id)).filter((a): a is OpsArmyState => !!a && !a.removed) : armiesOf(state, state.playerFaction)
  for (const a of list) moveToward(state, a, target)
}
function encircle(state: OpsState, targetId: string, by: string[]): boolean {
  const target = army(state, targetId)
  if (!target || target.removed || target.pos.kind !== 'city') return false
  const ring = state.cities[target.pos.city]
  if (!ring) return false
  let present = 0
  for (const id of by) {
    const a = army(state, id)
    if (!a || a.removed || a.pos.kind !== 'city') continue
    if (dist(state, a.pos.city, target.pos.city) <= 1) present++
  }
  return present >= 2
}
function stageCount(state: OpsState): number {
  const gone = (id: string) => { const a = state.armies[id]; return !a || a.removed }
  return [gone('kmt-7'), gone('kmt-12'), ['kmt-2', 'kmt-13', 'kmt-16'].every(gone)].filter(Boolean).length
}

function enemyKilled(state: OpsState, id: string): boolean {
  const a = state.armies[id]
  return !!a && (a.removed || a.troops < 4000)
}

const rules: OpsRules = {
  id: 'huaihai-1948',

  opening(state, campaign, narrative): void {
    addReport(state, 'court', '总前委', narrative.line('opening.situation', {}, 0) || '', 'high', 0, true)
    addReport(state, 'scout', '徐州', '情报：第 2、13、16 兵团守徐州，第 7 兵团在新安镇，第 12 兵团由蒙城北上。', 'mid', 1, true)
    addReport(state, 'note', '总前委', '战役决心：先打第 7 兵团，同时切断徐蚌线。', 'high', 0, false)
    orderPlayer(state, 'xinan')
  },

  triggerNode(state, campaign): string | null {
    const has = (id: string) => state.resolvedNodes.includes(id)
    const day = state.tick
    if (!has('d1') && day >= 2) return 'd1'
    if (!has('d2') && has('d1') && day >= 6) return 'd2'
    if (!has('d3') && has('d2') && (day >= 9 || state.cities.nianzhuang.besieged)) return 'd3'
    if (!has('d4') && has('d3') && (day >= 12 || state.cities.jiawang.besieged)) return 'd4'
    if (!has('d5') && has('d4') && (day >= 15 || state.cities.suxian.besieged)) return 'd5'
    if (!has('d6') && has('d5') && (day >= 20 || state.cities.shuangduiji.besieged)) return 'd6'
    if (!has('d7') && has('d6') && (state.vars.xuzhouRetreat || day >= 30)) return 'd7'
    if (!has('d8') && has('d7') && (state.vars.encircledChen === 1 || day >= 50)) return 'd8'
    return null
  },

  applyDecision(state, campaign, narrative, nodeId, optionId): void {
    switch (nodeId) {
      case 'd1':
        state.flags.strategy = optionId === 'opt2' ? 2 : 1
        addReport(state, 'court', '总前委', optionId === 'opt2' ? '决心打大淮海：准备连续围歼。' : '先打第7兵团，视情况扩大。', 'high', 0, true)
        break
      case 'd2':
        if (optionId === 'opt1') {
          state.vars.cutRail = 1
          orderPlayer(state, 'suxian', ['pl-c'])
          addReport(state, 'court', '总前委', '中野向宿县方向行动，准备切断徐蚌线。', 'high', 0, true)
        }
        break
      case 'd3':
        if (optionId === 'opt1') {
          state.vars.chase7 = 1
          orderPlayer(state, 'nianzhuang')
          addReport(state, 'border', '陇海线', '华野主力沿陇海线追击第7兵团。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          orderPlayer(state, 'caobaji')
          addReport(state, 'court', '总前委', '命令部队先占要点，等敌军停下来再围。', 'mid', 0, true)
        }
        break
      case 'd4':
        if (optionId === 'opt1') {
          const defector = army(state, 'kmt-3')
          if (defector) {
            defector.troops = 0
            defector.removed = true
            state.cities.jiawang.owner = 'pla'
            state.cities.taierzhuang.owner = 'pla'
            state.vars.jiawang = 1
            addReport(state, 'note', '贾汪', '第3绥靖区在贾汪、台儿庄脱离原建制，徐州东北门户打开。', 'high', 0, true)
          }
        } else if (optionId === 'opt3') {
          state.vars.assaultJiawang = 1
          orderPlayer(state, 'jiawang', ['pl-e', 'pl-l'])
          addReport(state, 'court', '总前委', '不强求策反，准备强攻贾汪。', 'mid', 0, true)
        }
        break
      case 'd5':
        if (optionId === 'opt1') {
          state.vars.takeSuxian = 1
          orderPlayer(state, 'suxian', ['pl-c', 'pl-l'])
          addReport(state, 'court', '总前委', '中野攻占宿县，切断徐蚌联系。', 'high', 0, true)
        }
        break
      case 'd6':
        if (optionId === 'opt1') {
          state.vars.eat7 = 1
          orderPlayer(state, 'nianzhuang', ['pl-e', 'pl-e2'])
          orderPlayer(state, 'shuangduiji', ['pl-c'])
          addReport(state, 'court', '总前委', '先吃第7兵团，再打第12兵团。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.twoFronts = 1
          addReport(state, 'court', '总前委', '分兵同时围歼两处，风险很大。', 'mid', 0, true)
        }
        break
      case 'd7':
        if (optionId === 'opt1') {
          state.vars.expectSouthwest = 1
          orderPlayer(state, 'chenguanzhuang', ['pl-c', 'pl-l'])
          orderPlayer(state, 'nianzhuang', ['pl-e', 'pl-e2'])
          addReport(state, 'court', '总前委', '判断徐州集团向西南撤退，主力向永城、陈官庄方向截击。', 'high', 0, true)
          state.vars.pursueSouthwest = 1
        } else if (optionId === 'opt2') {
          state.vars.expectSoutheast = 1
          orderPlayer(state, 'guzhen', ['pl-e', 'pl-e2'])
          addReport(state, 'court', '总前委', '判断徐州集团向东南撤退，主力向固镇方向追击。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.expectSouthwest = 1
          orderPlayer(state, 'chenguanzhuang', ['pl-e', 'pl-e2'])
          orderPlayer(state, 'guzhen', ['pl-c'])
          addReport(state, 'court', '总前委', '分兵两路堵截，兵力有所分散。', 'mid', 0, true)
        } else {
          addReport(state, 'court', '总前委', '不强求包围，仅追歼后尾。', 'mid', 0, true)
        }
        break
      case 'd8':
        orderPlayer(state, 'xuzhou', ['pl-e2'])
        if (optionId === 'opt1') {
          state.vars.siegeNotAssault = 1
          addReport(state, 'court', '陈官庄', '围而不打，先做政治攻势，等待总攻时机。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.generalAssault = 1
          addReport(state, 'court', '陈官庄', '立即总攻陈官庄。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.generalAssault = 1
          state.vars.feintExit = 1
          addReport(state, 'court', '陈官庄', '围三缺一，诱敌突围，在运动中歼敌。', 'high', 0, true)
        } else {
          state.vars.siegeNotAssault = 1
          addReport(state, 'court', '陈官庄', '长期围困，等其自溃。', 'mid', 0, true)
        }
        break
      default:
        break
    }
    void narrative
  },

  aiTick(state, campaign, narrative): void {
    // 敌军 AI：徐州集团按兵不动，第7兵团西撤，第12兵团北上
    if (state.tick % 2 !== 0) return
    const seven = army(state, 'kmt-7')
    if (seven && !seven.removed && state.vars.chase7 !== 1 && state.tick > 8) {
      moveToward(state, seven, 'xuzhou')
    }
    const twelve = army(state, 'kmt-12')
    if (twelve && !twelve.removed && state.tick > 10) {
      moveToward(state, twelve, 'shuangduiji')
    }
    const two = army(state, 'kmt-2')
    if (two && !two.removed && state.tick > 12 && !state.vars.jiawang && state.tick < 20) {
      moveToward(state, two, 'daxujia')
    }
    // 第7兵团覆灭后，华野主力自动南下参加陈官庄合围
    if ((!seven || seven.removed) && state.vars.eat7 === 1 && state.vars.expectSouthwest === 1 && state.tick % 4 === 0) {
      for (const id of ['pl-e', 'pl-e2']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        if (a.pos.kind === 'city' && a.pos.city === 'chenguanzhuang') continue
        moveToward(state, a, 'chenguanzhuang')
      }
    }
    // 包围判定
    if (seven && !seven.removed && seven.pos.kind === 'city') {
      const b = encircle(state, 'kmt-7', ['pl-e', 'pl-e2'])
      if (b && state.vars.encircled7 !== 1) {
        state.vars.encircled7 = 1
        state.vars.encircled7Tick = state.tick
        addReport(state, 'border', cityName(state, seven.pos.city), '第7兵团被包围。', 'high', 0, true)
      }
    }
    // 徐州集团弃城南撤：第7兵团覆灭后，三个兵团经永城向陈官庄方向撤退（与史实一致）
    const sevenDown = !seven || seven.removed
    const encircledLong = state.vars.encircled7 === 1 && state.tick >= (state.vars.encircled7Tick ?? 99) + 7
    if ((sevenDown || encircledLong) && !state.vars.xuzhouRetreat) {
      state.vars.xuzhouRetreat = state.tick
      for (const id of ['kmt-2', 'kmt-13', 'kmt-16']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        moveToward(state, a, 'yongcheng')
      }
      addReport(state, 'scout', '徐州', '徐州集团放弃徐州，向西南方向撤退。', 'mid', 1, true)
    }
    if (state.vars.xuzhouRetreat) {
      for (const id of ['kmt-2', 'kmt-13', 'kmt-16']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        if (a.pos.kind === 'city' && (a.pos.city === 'yongcheng' || a.pos.city === 'chenguanzhuang')) continue
        moveToward(state, a, 'chenguanzhuang')
      }
      // 到达陈官庄地域即构成被围（前提：解放军主力在南线或已追至）
      const atChen = ['kmt-2', 'kmt-13', 'kmt-16'].some(id => {
        const a = army(state, id)
        return !!a && !a.removed && a.pos.kind === 'city' && a.pos.city === 'chenguanzhuang'
      })
      const plaNear = armiesOf(state, state.playerFaction).some(p => p.pos.kind === 'city' && p.pos.city && dist(state, p.pos.city, 'chenguanzhuang') <= 4)
      if (atChen && plaNear && state.vars.encircledChen !== 1) {
        state.vars.encircledChen = 1
        addReport(state, 'border', '陈官庄', '徐州撤退集团被合围于陈官庄地区。', 'high', 0, true)
      }
    }
    void narrative
  },

  onTick(state, campaign, narrative): void {
    // 抵达敌占城市的部队自动转入攻城（玩家只需下达“去某城”的命令）
    for (const a of armiesOf(state, state.playerFaction)) {
      if (a.removed || a.inBattle) continue
      if (a.pos.kind !== 'city') continue
      const city = state.cities[a.pos.city]
      if (!city || city.owner === state.playerFaction || city.garrison < 300) continue
      if (!a.order || a.order.task !== 'assault') {
        a.order = { task: 'assault', target: city.id, sinceTick: state.tick, arrived: true, waitTicks: 0 }
      }
    }
    // 补充兵员：解放区动员与俘虏转化（每天少量补充）
    if (state.tick <= 50) {
      for (const a of armiesOf(state, state.playerFaction)) {
        if (a.removed) continue
        const base = campaign.armies.find(c => c.id === a.id)?.troops ?? a.troops
        a.troops = Math.min(base, Math.round(a.troops + base * 0.0012))
      }
    }
    // 后勤：支前运力——总攻最耗运力，围而不打最省
    if (state.tick % 4 === 0) {
      const diffDrain = state.difficulty === 'hell' ? 1.5 : state.difficulty === 'hard' ? 1.25 : state.difficulty === 'normal' ? 1 : 0.85
      const drain = (state.vars.generalAssault === 1 ? 5 : state.vars.siegeNotAssault === 1 ? 1.2 : 3) * diffDrain
      state.vars.logistics = clamp((state.vars.logistics ?? 100) - drain, 0, 100)
      const lg = state.vars.logistics ?? 100
      if (lg < 35) {
        for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale - 0.25, 5, 100)
        if (state.tick % 12 === 0) addReport(state, 'court', '后方', '支前运力告急，前线粮食与弹药吃紧。', 'mid', 1, true)
      }
    }
    // 双堆集围歼：第12兵团被围后，中野持续压缩；玩家不再改令时保持围困
    const twelve = army(state, 'kmt-12')
    if (twelve && !twelve.removed && state.vars.eat7 === 1 && state.tick % 8 === 0) {
      orderPlayer(state, 'shuangduiji', ['pl-c', 'pl-l'])
    }
    if (twelve && !twelve.removed && twelve.pos.kind === 'city' && twelve.pos.city === 'shuangduiji') {
      const ring = ['pl-c', 'pl-l'].map(id => army(state, id)).filter((a): a is NonNullable<typeof a> => !!a && !a.removed && a.pos.kind === 'city' && a.pos.city === 'shuangduiji')
      if (ring.length > 0) damageArmy(twelve, 0.012, state)
    }
    // 歼灭判定：兵力低于建制两成三，或残部不足五千，即视为建制瓦解（被围歼）
    // 第13兵团只是陈官庄被围三个兵团之一，不能当作「徐州集团」整体
    const labels: Record<string, string> = { 'kmt-7': '第7兵团', 'kmt-12': '第12兵团', 'kmt-13': '第13兵团', 'kmt-2': '第2兵团', 'kmt-16': '第16兵团' }
    for (const id of Object.keys(labels)) {
      const a = army(state, id)
      if (!a || a.removed) continue
      const base = campaign.armies.find(c => c.id === id)?.troops ?? a.troops
      const threshold = state.vars.encircledChen === 1 ? 0.4 : 0.22
      if (a.troops > Math.max(5000, Math.round(base * threshold))) continue
      a.removed = true
      a.troops = 0
      const where = a.pos.kind === 'city' ? a.pos.city : undefined
      addReport(state, 'border', cityName(state, where), labels[id] + '被围歼，建制瓦解。', 'high', 0, true)
      state.log.push('第' + (state.tick + 1) + '日：' + cityName(state, where) + '，' + labels[id] + '被围歼')
    }
    // 第7兵团被围后继续压缩
    const seven = army(state, 'kmt-7')
    if (seven && !seven.removed && state.vars.encircled7 === 1) {
      damageArmy(seven, 0.02, state)
    }
    // 陈官庄集团解决后，中野转向双堆集围歼第12兵团
    const chenAlive = ['kmt-2', 'kmt-13'].some(id => { const a = army(state, id); return !!a && !a.removed })
    if (state.vars.encircledChen === 1 && !chenAlive) {
      for (const id of ['pl-c', 'pl-l']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        if (a.pos.kind === 'city' && a.pos.city === 'shuangduiji') continue
        moveToward(state, a, 'shuangduiji')
      }
      const twelve = army(state, 'kmt-12')
      if (twelve && !twelve.removed) damageArmy(twelve, 0.02, state)
    }
    // 陈官庄被围集团：围而不打靠政治攻势瓦解，总攻更快但自身有损耗
    if (state.vars.encircledChen === 1) {
      for (const id of ['kmt-2', 'kmt-13', 'kmt-16']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        if (a.pos.kind !== 'city' || a.pos.city !== 'chenguanzhuang') continue
        if (state.vars.generalAssault === 1) {
          damageArmy(a, 0.06, state)
          a.morale = clamp(a.morale - 3, 5, 100)
        } else if (state.vars.siegeNotAssault === 1) {
          damageArmy(a, 0.024, state)
          a.morale = clamp(a.morale - 1.2, 5, 100)
        } else {
          damageArmy(a, 0.008, state)
        }
      }
      if (state.vars.generalAssault === 1) {
        for (const p of armiesOf(state, state.playerFaction)) {
          if (p.pos.kind === 'city' && p.pos.city === 'chenguanzhuang') damageArmy(p, 0.004, state)
        }
      }
    }
    void campaign
    void narrative
  },

  checkEnd(state, campaign): void {
    if (state.over) return
    // 三个阶段各自对应一个重兵集团：第7兵团、第12兵团、陈官庄（第2/13/16兵团）
    const gone = (id: string) => { const a = state.armies[id]; return !a || a.removed }
    const sevenDown = gone('kmt-7')
    const twelveDown = gone('kmt-12')
    const xuzhouDown = ['kmt-2', 'kmt-13', 'kmt-16'].every(gone)
    const stages = [sevenDown, twelveDown, xuzhouDown].filter(Boolean).length
    if (stages >= 3) { end(state, 'full'); return }
    if (state.cities.bengbu.owner === 'pla' && state.cities.xuzhou.owner === 'pla') { end(state, 'south'); return }
    if (playerTroops(state) < 130000) { end(state, 'heavy'); return }
    if (state.tick >= 66) end(state, stages >= 2 ? 'partial' : 'stall')
  },

  score(state, campaign): OpsScore {
    const killed = ['kmt-7', 'kmt-12', 'kmt-13', 'kmt-2', 'kmt-16'].filter(id => { const a = state.armies[id]; return !a || a.removed }).length
    const hubs = ['xuzhou', 'suxian', 'bengbu'].filter(id => state.cities[id]?.owner === state.playerFaction).length
    const initial = 480000
    const hurt = Math.max(0, 1 - playerTroops(state) / initial)
    const logistics = state.vars.logistics ?? 100
    const jw = state.vars.jiawang ? 6 : 0
    const parts: ScorePart[] = [
      { key: 'killed', label: '歼敌集团', value: Math.min(30, killed * 6), max: 30, note: '歼灭 ' + killed + ' 个兵团' },
      { key: 'hubs', label: '控制枢纽', value: hubs * 8, max: 24, note: '徐州 / 宿县 / 蚌埠' },
      { key: 'loss', label: '自身伤亡', value: Math.round(clamp(1 - hurt / 0.35, 0, 1) * 15), max: 15, note: '约 ' + Math.round(hurt * 14.5) + ' 万' },
      { key: 'logistics', label: '支前后勤', value: Math.round((logistics / 100) * 10), max: 10, note: logistics > 60 ? '运力充足' : '运力紧张' },
      { key: 'jiawang', label: '战场转向', value: jw, max: 6, note: state.vars.jiawang ? '贾汪转向成功' : '未实现' },
      // 三阶段全部完成是史实主线，给一个明确的分项：原评分天花板 78 低于 S 线 80，打完也拿不到 S
      { key: 'stages', label: '三阶段完成', value: stageCount(state) >= 3 ? 8 : stageCount(state) * 2, max: 8, note: '已完成 ' + stageCount(state) + '/3 阶段' },
      { key: 'time', label: '战役节奏', value: state.tick < 60 ? 5 : 2, max: 5, note: '历 ' + state.tick + ' 日' },
    ]
    const raw = parts.reduce((s, p) => s + p.value, 0)
    const total = Math.min(100, Math.round(raw * campaign.difficulty[state.difficulty].scoreFactor))
    const grade: OpsScore['grade'] = total >= 80 ? 'S' : total >= 66 ? 'A' : total >= 54 ? 'B' : total >= 40 ? 'C' : 'D'
    const endings: Record<string, { title: string; text: string }> = {
      full: { title: '全胜', text: '三个重兵集团依次被解决，徐州枢纽易手。淮海战役达成全部目标。' },
      partial: { title: '大胜', text: '两个集团被歼，敌军退守淮河以南。战役获得决定性胜利，但南线仍有遗憾。' },
      south: { title: '南线突破', text: '徐州、蚌埠相继易手，敌南线体系瓦解。' },
      heavy: { title: '伤亡过重', text: '虽重创敌军，但自身伤亡超出预期，战役节奏被打乱。' },
      stall: { title: '僵持', text: '敌军收缩成功，战役未能打成预期的大规模围歼。' },
    }
    const ending = endings[state.endingId ?? 'stall'] ?? endings.stall
    return {
      grade, total, parts, endingId: state.endingId ?? 'stall',
      endingTitle: ending.title, endingText: ending.text,
      deviation: killed >= 3 ? '完成三阶段围歼，与史实主线一致。' : '与史实主线存在偏差。',
      highlights: [
        { label: '歼敌兵团', value: String(killed) },
        { label: '控制枢纽', value: hubs + '/3' },
        { label: '支前运力', value: Math.round(logistics) + '%' },
        { label: '历时', value: state.tick + ' 日' },
      ],
      lines: dedupe(state.log).slice(-10),
    }
  },

  powerMod(state, campaign, armyId, side): number {
    if (armyId.startsWith('pl-')) {
      // 支前运力直接决定攻势强度：运力不足，弹药粮食跟不上，攻坚与野战都打折
      const lg = state.vars.logistics ?? 100
      const supplyMod = lg >= 70 ? 1 : lg >= 45 ? 0.9 : lg >= 25 ? 0.78 : 0.6
      return (side === 'attacker' ? 2.3 : 1.55) * supplyMod
    }
    return 1
  },

  hud(state, campaign): { pressureText: string; objectiveText: string; stageText: string } {
    const gone = (id: string) => { const a = state.armies[id]; return !a || a.removed }
    const killed = [gone('kmt-7'), gone('kmt-12'), ['kmt-2', 'kmt-13', 'kmt-16'].every(gone)].filter(Boolean).length
    const stage = state.tick < 17 ? '第一阶段' : state.tick < 40 ? '第二阶段' : '第三阶段'
    return {
      pressureText: '已解决 ' + killed + '/3 阶段',
      objectiveText: state.cities.xuzhou.owner === 'pla' ? '徐州已克' : state.cities.suxian.owner === 'pla' ? '徐蚌线已断' : '徐州未克',
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
export { rules as huaihaiRules }