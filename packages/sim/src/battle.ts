import type { ArmyState, Battle, Campaign, GameState, Narrative } from './types.js'
import { clamp, jitter, makeRng } from './rng.js'
import { pushReport } from './reports.js'
import { recordBattle, recordCity } from './ledger.js'
import { applyLosses, nearestFriendlyCity, power, total } from './state.js'

function armiesAtCity(state: GameState, cityId: string, faction?: string): ArmyState[] {
  return state.armyOrder
    .map(id => state.armies[id])
    .filter((a): a is ArmyState => !!a && !a.removed && a.pos.kind === 'city' && a.pos.city === cityId && (!faction || a.faction === faction) && !a.inBattle)
}

function sidePower(state: GameState, ids: string[], weather: GameState['weather']): number {
  let sum = 0
  for (const id of ids) {
    const army = state.armies[id]
    if (!army || army.removed) continue
    sum += power(army, weather)
  }
  return Math.max(1, sum)
}

function sideTroops(state: GameState, ids: string[]): number {
  return ids.reduce((sum, id) => sum + (state.armies[id] ? total(state.armies[id]!.troops) : 0), 0)
}

export function detectBattle(state: GameState, campaign: Campaign, narrative: Narrative): void {
  const wei = state.armies[campaign.roles.weiFieldArmy]
  if (!wei || wei.removed || wei.pos.kind !== 'city' || wei.inBattle) return
  const cityId = wei.pos.city!
  const qi = armiesAtCity(state, cityId, 'qi')
  if (qi.length === 0) return
  const city = state.cities[cityId]
  if (!city) return
  const qiDefends = city.owner === 'qi'
  const attackerIds = qiDefends ? [wei.id] : qi.map(a => a.id)
  const defenderIds = qiDefends ? qi.map(a => a.id) : [wei.id]
  const ambush = !qiDefends && qi.some(a => a.order?.task === 'ambush' && a.order.arrived)
  const battle: Battle = {
    id: 'b' + (++state.battleSeq),
    place: city.name,
    city: cityId,
    attackerIds,
    defenderIds,
    days: 0,
    ambush,
    attackerInitial: sideTroops(state, attackerIds),
    defenderInitial: sideTroops(state, defenderIds),
    firstTick: state.tick + 1,
    log: [],
  }
  for (const id of attackerIds.concat(defenderIds)) {
    const a = state.armies[id]
    if (a) a.inBattle = battle.id
  }
  state.battles.push(battle)
  const text = narrative.line(ambush ? 'battle.ambush_start' : 'battle.start', { place: city.name }, state.narrativeSalt++)
  pushReport(state, 'border', city.name, text, 'high', 0, true)
  state.log.push('第' + (state.tick + 1) + '日：' + city.name + '爆发' + (ambush ? '伏击战' : '会战'))
}

export function battleTick(state: GameState, campaign: Campaign, narrative: Narrative): void {
  const rng = makeRng(state.seed, state.tick)
  for (const battle of [...state.battles]) {
    const atk = battle.attackerIds.map(id => state.armies[id]).filter((a): a is ArmyState => !!a && !a.removed)
    const def = battle.defenderIds.map(id => state.armies[id]).filter((a): a is ArmyState => !!a && !a.removed)
    if (atk.length === 0 || def.length === 0) {
      finishBattle(state, battle, atk.length === 0 ? 'defender' : 'attacker', campaign, narrative)
      continue
    }
    let atkPower = sidePower(state, battle.attackerIds, state.weather)
    let defPower = sidePower(state, battle.defenderIds, state.weather)
    if (battle.ambush) {
      const decay = battle.days === 0 ? 1 : battle.days === 1 ? 0.75 : 0.5
      atkPower *= 1 + (campaign.balance.ambushMultiplier - 1) * decay
      defPower *= 1 - 0.28 * decay
    }
    const shareAtk = atkPower / (atkPower + defPower)
    const shareDef = defPower / (atkPower + defPower)
    const intensity = campaign.balance.battleIntensity * (battle.ambush && battle.days < 2 ? 1.5 : 1)
    const atkRatio = clamp(intensity * shareDef * 2 * jitter(rng, 'atk', battle.days), 0.005, 0.2)
    const defRatio = clamp(intensity * shareAtk * 2 * jitter(rng, 'def', battle.days), 0.005, 0.2)
    let atkLost = 0
    let defLost = 0
    for (const a of atk) {
      const lost = applyLosses(a, atkRatio)
      atkLost += lost
      state.casualties[a.faction] = (state.casualties[a.faction] ?? 0) + lost
      a.morale = clamp(a.morale - 2.5 - (battle.ambush && battle.days === 0 ? 8 : 0), 5, 100)
    }
    for (const d of def) {
      const lost = applyLosses(d, defRatio)
      defLost += lost
      state.casualties[d.faction] = (state.casualties[d.faction] ?? 0) + lost
      d.morale = clamp(d.morale - 2, 5, 100)
    }
    battle.days += 1
    battle.attackerLost = (battle.attackerLost ?? 0) + atkLost
    battle.defenderLost = (battle.defenderLost ?? 0) + defLost
    battle.log.push('第' + battle.days + '日 攻方折损' + Math.round(atkLost) + '，守方折损' + Math.round(defLost))
    const atkNow = sideTroops(state, battle.attackerIds)
    const defNow = sideTroops(state, battle.defenderIds)
    const atkBroken = atkNow < battle.attackerInitial * campaign.balance.routTroopRatio || atk.every(a => a.morale < campaign.balance.routMorale)
    const defBroken = defNow < battle.defenderInitial * campaign.balance.routTroopRatio || def.every(a => a.morale < campaign.balance.routMorale)
    if (battle.days >= 7 || atkBroken || defBroken) {
      const winner = atkBroken && !defBroken ? 'defender' : defBroken && !atkBroken ? 'attacker' : 'draw'
      finishBattle(state, battle, winner, campaign, narrative)
    }
  }
}

function finishBattle(state: GameState, battle: Battle, winner: 'attacker' | 'defender' | 'draw', campaign: Campaign, narrative: Narrative): void {
  const city = battle.city ? state.cities[battle.city] : undefined
  const place = city?.name ?? battle.place
  const losers = winner === 'attacker' ? battle.defenderIds : winner === 'defender' ? battle.attackerIds : []
  for (const id of losers) {
    const army = state.armies[id]
    if (!army) continue
    applyLosses(army, 0.18)
    const haven = nearestFriendlyCity(state, army.faction, city?.id ?? army.pos.city ?? campaign.roles.weiCapital)
    army.pos = { kind: 'city', city: haven ?? army.pos.city, progress: 0 }
    army.route = []
    army.order = null
    army.inBattle = null
    army.morale = clamp(army.morale - 15, 5, 100)
    if (total(army.troops) < 500) {
      army.removed = true
      army.troops = { chariot: 0, infantry: 0, cavalry: 0, crossbow: 0 }
    }
  }
  for (const id of winner === 'attacker' ? battle.attackerIds : winner === 'defender' ? battle.defenderIds : []) {
    const army = state.armies[id]
    if (!army) continue
    army.morale = clamp(army.morale + 8, 5, 100)
  }
  for (const id of battle.attackerIds.concat(battle.defenderIds)) {
    const army = state.armies[id]
    if (army) army.inBattle = null
  }
  const playerSide: 'attacker' | 'defender' | 'none' = battle.attackerIds.some(id => state.armies[id]?.faction === 'qi')
    ? 'attacker'
    : battle.defenderIds.some(id => state.armies[id]?.faction === 'qi') ? 'defender' : 'none'
  recordBattle(state, {
    id: battle.id,
    place,
    city: battle.city,
    tick: battle.firstTick ?? state.tick + 1,
    days: Math.max(1, battle.days),
    attackerLost: Math.round(battle.attackerLost ?? 0),
    defenderLost: Math.round(battle.defenderLost ?? 0),
    attackerInitial: Math.round(battle.attackerInitial),
    defenderInitial: Math.round(battle.defenderInitial),
    winner,
    ambush: battle.ambush,
    playerSide,
  })
  state.battles = state.battles.filter(b => b.id !== battle.id)
  if (winner === 'draw') {
    pushReport(state, 'border', place, narrative.line('battle.draw', { place }, state.narrativeSalt++), 'mid', 0, true)
    state.log.push('第' + (state.tick + 1) + '日：' + place + '会战未分胜负，两军脱离')
    return
  }
  const winnerName = winner === 'attacker'
    ? (state.armies[battle.attackerIds[0] ?? '']?.faction === 'qi' ? '齐军' : '魏军')
    : (state.armies[battle.defenderIds[0] ?? '']?.faction === 'qi' ? '齐军' : '魏军')
  const loserName = winnerName === '齐军' ? '魏军' : '齐军'
  const text = narrative.line(battle.ambush && winner === 'attacker' ? 'battle.ambush_win' : 'battle.rout', {
    place, winner: winnerName, loser: loserName,
  }, state.narrativeSalt++)
  pushReport(state, 'border', place, text, 'high', 0, true)
  state.log.push('第' + (state.tick + 1) + '日：' + place + '之战，' + winnerName + '胜')
  if (battle.ambush) {
    const attackerFaction = state.armies[battle.attackerIds[0] ?? '']?.faction
    const defenderFaction = state.armies[battle.defenderIds[0] ?? '']?.faction
    const qiSideWon = (winner === 'attacker' && attackerFaction === 'qi') || (winner === 'defender' && defenderFaction === 'qi')
    const weiSideLost = (winner === 'attacker' && defenderFaction === 'wei') || (winner === 'defender' && attackerFaction === 'wei')
    if (qiSideWon || weiSideLost || state.flags.weiArmyBroken === 1) state.flags.ambushSuccess = 1
  }
  const weiArmy = state.armies[campaign.roles.weiFieldArmy]
  if (weiArmy && weiArmy.removed) {
    state.flags.weiArmyBroken = 1
    pushReport(state, 'court', '大梁', narrative.line('politics.wei_broken', {}, state.narrativeSalt++), 'mid', 1, true)
  }
}

export function siegeTick(state: GameState, campaign: Campaign, narrative: Narrative): void {
  const weiId = campaign.roles.weiFieldArmy
  for (const city of Object.values(state.cities)) {
    const present = armiesAtCity(state, city.id).filter(a => a.faction !== city.owner)
    if (present.length === 0) {
      if (city.besieged) {
        city.besieged = false
        pushReport(state, 'court', city.name, narrative.line('siege.lift', { city: city.name }, state.narrativeSalt++), 'mid', 1, true)
      }
      continue
    }
    const besiegers = present.filter(a => {
      if (a.faction === 'wei' && a.id === weiId) return true
      return a.order?.task === 'assault' || a.order?.task === 'feint'
    })
    if (besiegers.length === 0) continue
    const attackers = besiegers.reduce((sum, a) => sum + total(a.troops), 0)
    const assault = besiegers.some(a => a.order?.task === 'assault')
    const feint = !assault && besiegers.some(a => a.order?.task === 'feint')
    const intent = assault ? 1.6 : feint ? 0.5 : 1
    const defenderPower = Math.max(600, city.garrison * city.wall)
    const ratio = clamp(attackers / defenderPower, 0.25, 3.2)
    if (!city.besieged) {
      city.besieged = true
      pushReport(state, 'deserter', city.name, narrative.line('siege.start', { city: city.name }, state.narrativeSalt++), 'mid', 1, true)
    }
    const garrisonLoss = city.initialGarrison * campaign.balance.siegeGarrisonLoss * ratio * intent
    city.garrison = Math.max(0, city.garrison - garrisonLoss)
    city.grain = Math.max(0, city.grain - campaign.balance.siegeGrainLoss)
    city.wall = Math.max(0.6, city.wall - 0.006 * ratio)
    city.morale = clamp(city.morale - 1, 5, 100)
    for (const attacker of besiegers) {
      const lost = applyLosses(attacker, clamp(0.004 / ratio, 0.001, 0.02) * (assault ? 1.5 : 1))
      state.casualties[attacker.faction] = (state.casualties[attacker.faction] ?? 0) + lost
      attacker.foodDays = Math.max(0, attacker.foodDays - 0.8)
    }
    const canCapture = assault || besiegers.some(a => a.id === weiId)
    if (canCapture && (city.garrison <= city.initialGarrison * campaign.balance.zhaoFallRatio || city.grain <= 0)) {
      const owner = besiegers[0].faction
      const previousOwner = city.owner
      city.owner = owner
      recordCity(state, { city: city.id, name: city.name, tick: state.tick + 1, from: previousOwner, to: owner, cause: assault ? 'assault' : 'siege' })
      city.garrison = Math.round(city.initialGarrison * 0.15)
      city.grain = Math.max(3, Math.round(city.grain * 0.5))
      city.wall = Math.max(1.2, city.wall)
      city.besieged = false
      city.known = true
      pushReport(state, 'border', city.name, narrative.line('siege.fall', { city: city.name, side: owner === 'qi' ? '齐军' : '魏军' }, state.narrativeSalt++), 'high', 1, true)
      state.log.push('第' + (state.tick + 1) + '日：' + city.name + '陷落，归' + (owner === 'qi' ? '齐' : '魏'))
      if (owner === 'qi') {
        state.citiesTaken.push(city.id)
        state.flags.citiesTaken = state.citiesTaken.length
        if (city.id === campaign.roles.weiCapital) state.flags.daliangTaken = 1
        for (const army of besiegers) army.morale = clamp(army.morale + 6, 5, 100)
      } else {
        if (city.id === campaign.roles.zhaoCapital) state.flags.zhaofallen = 1
        state.casualties.zhao += Math.round(city.initialGarrison * 0.7)
      }
    }
  }
}

export function cleanupArmies(state: GameState): void {
  for (const id of state.armyOrder) {
    const army = state.armies[id]
    if (army && !army.removed && total(army.troops) < 400) {
      army.removed = true
      army.troops = { chariot: 0, infantry: 0, cavalry: 0, crossbow: 0 }
    }
  }
}