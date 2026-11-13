import type { Campaign, GameState, Score, ScorePart } from './types.js'

const ENDINGS: Record<string, { title: string; text: string }> = {
  grand: { title: '桂陵大捷', text: '魏军回师途中遭伏，主力大溃。邯郸之围遂解，齐国威震诸侯。此局近乎史实，却胜在你自己手里。' },
  bitter: { title: '惨胜', text: '邯郸已陷，你以魏军主力为代价扳回一局。赵国元气大伤，齐国赢得的是时间与威名。' },
  relief: { title: '解围', text: '魏军回师，邯郸得全。伏击未成，但"攻其所必救"的目的已经达到。' },
  daliang: { title: '大梁城下', text: '齐军攻破大梁，魏国震动。结局出乎史册，却合乎兵理——只是回师之军尚未真正被消灭。' },
  conquest: { title: '乘胜取城', text: '战后齐军席卷魏东，城邑易手。战果之外，你选择了扩张。' },
  rout: { title: '齐军大溃', text: '主力溃散，辎重尽失。围魏救赵成了纸上谈兵。' },
  abandon: { title: '坐视邯郸', text: '齐国按兵不动。邯郸陷落，魏国坐大，天下侧目。' },
  peace: { title: '议和', text: '兵锋未交，使节先行。齐国保全了实力，也错过了重创魏国的机会。' },
  long: { title: '相持', text: '两军相持，胜负未决。战役在漫长的消耗中淡出史册。' },
  stalemate: { title: '未竟', text: '邯郸陷落，魏军未受重创。这一局，齐国更像一个旁观者。' },
}

export function endingFor(state: GameState): { id: string; title: string; text: string } {
  const id = state.endingId ?? 'stalemate'
  const found = ENDINGS[id] ?? ENDINGS.stalemate!
  return { id, title: found.title, text: found.text }
}

export function finalize(state: GameState, campaign: Campaign): Score {
  const diff = campaign.difficulty[state.difficulty]
  const zhao = state.cities[campaign.roles.zhaoCapital]
  const zhaoSaved = zhao ? zhao.owner === 'zhao' : false
  const qiLost = state.casualties.qi
  const weiLost = state.casualties.wei
  const qiInitial = 82000
  const weiInitial = state.armyOrder.reduce((sum, id) => {
    const army = state.armies[id]
    return army && army.faction === 'wei' ? sum + army.initialTroops : sum
  }, 0) + 30000
  const qiLossRatio = Math.min(0.75, qiLost / Math.max(1, qiInitial))
  const weiLossRatio = Math.min(1, weiLost / Math.max(1, weiInitial))
  const w = campaign.weights
  const returned = state.politics.pangjuanReturning || state.flags.weiHome === 1 || state.flags.weiArmyBroken === 1
  const weiBroken = state.flags.weiArmyBroken === 1
  const objectiveBase = zhaoSaved ? 0.5 : 0
  const objectiveReturn = returned ? 0.15 : 0
  const objectiveAmbush = state.flags.ambushSuccess === 1 ? 0.2 : 0
  const objectiveBroken = weiBroken ? 0.15 : 0
  const objective = Math.min(1, objectiveBase + objectiveReturn + objectiveAmbush + objectiveBroken)
  const parts: ScorePart[] = [
    { key: 'objective', label: '战略目标', value: round(objective * w.objective), max: w.objective, note: zhaoSaved ? '邯郸未失' + (returned ? '，魏军回师' : '') : '邯郸已失' },
    { key: 'weiLoss', label: '魏军折损', value: round(Math.min(1, weiLossRatio / 0.4) * w.weiLoss), max: w.weiLoss, note: '约折损 ' + (weiLost / 10000).toFixed(1) + ' 万' },
    { key: 'qiPreserve', label: '齐军保存', value: round((1 - Math.min(1, qiLossRatio / 0.35)) * w.qiPreserve), max: w.qiPreserve, note: qiLossRatio < 0.12 ? '主力尚全' : qiLossRatio < 0.25 ? '有所折损' : qiLossRatio < 0.35 ? '折损较重' : '伤筋动骨' },
    { key: 'zhaoSurvive', label: '赵国存亡', value: round((zhaoSaved ? 1 : 0.25) * w.zhaoSurvive), max: w.zhaoSurvive, note: zhaoSaved ? '邯郸保全' : '邯郸陷落' },
    { key: 'cities', label: '城邑控制', value: round(Math.min(1, state.citiesTaken.length / 2) * w.cities), max: w.cities, note: state.citiesTaken.length ? '取城 ' + state.citiesTaken.length + ' 座' : '未取魏城' },
    { key: 'diplomacy', label: '外交收益', value: round(((state.politics.chuCommitTick > 0 ? 0.5 : 0) + (state.politics.qinCommitTick > 0 ? 0.5 : 0)) * w.diplomacy), max: w.diplomacy, note: state.politics.chuCommitTick > 0 || state.politics.qinCommitTick > 0 ? '楚秦牵制魏国' : '列国未动' },
    { key: 'logistics', label: '后勤与时间', value: round((state.tick < 85 ? 0.75 : 0.45) * w.logistics), max: w.logistics, note: '历 ' + state.tick + ' 日' },
    { key: 'historyEcho', label: '史实呼应', value: round(((state.flags.ambushSuccess ? 0.5 : 0) + (state.flags.feintSuccess ? 0.25 : 0) + (state.flags.qingcheWest ? 0.25 : 0)) * w.historyEcho), max: w.historyEcho, note: '佯动 · 轻车 · 桂陵之谋' },
  ]
  const perfect = zhaoSaved && state.flags.ambushSuccess === 1 && weiBroken
  const victoryBonus = perfect ? 6 : 0
  if (perfect) parts.push({ key: 'perfect', label: '圆满', value: 6, max: 6, note: '伏击大胜 · 邯郸得全 · 魏军主力溃' })
  const raw = parts.reduce((sum, part) => sum + part.value, 0)
  const total = Math.min(100, Math.round(raw * diff.scoreFactor))
  const grade: Score['grade'] = total >= 75 ? 'S' : total >= 66 ? 'A' : total >= 54 ? 'B' : total >= 40 ? 'C' : 'D'
  const ending = endingFor(state)
  return {
    grade,
    total,
    parts,
    endingId: ending.id,
    endingTitle: ending.title,
    endingText: ending.text,
    deviation: deviationOf(state),
    facts: {
      qiLost,
      weiLost,
      zhaoSurvived: zhaoSaved,
      citiesTaken: state.citiesTaken.map(id => state.cities[id]?.name ?? id),
      days: state.tick,
      ambush: state.flags.ambushSuccess === 1,
      lines: timeline(state.log).slice(-12),
    },
  }
}

function timeline(lines: string[]): string[] {
  const out: string[] = []
  let battleKey = ''
  const isBattle = (line: string) => /之战，|爆发伏击战|爆发会战/.test(line)
  const keyOf = (line: string) => {
    const m = line.match(/第\d+日：(.+?)(之战|爆发)/)
    return m ? m[1] : line
  }
  for (const line of lines) {
    if (line === out[out.length - 1]) continue
    if (isBattle(line)) {
      const k = keyOf(line)
      if (k === battleKey) continue
      battleKey = k
    } else if (/陷落|回师|折损|粮|伏击|决策|大捷|会战结束/.test(line)) {
      battleKey = ''
    }
    out.push(line)
  }
  return out
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function deviationOf(state: GameState): string {
  if (state.flags.ambushSuccess && !state.flags.zhaofallen) return '高度贴近史实：示弱诱敌、轻车西驰、桂陵设伏，邯郸得全'
  if (state.flags.ambushSuccess) return '战术贴近史实，结局比史实更烈：邯郸已失，魏军主力仍遭伏击'
  if (state.flags.feintSuccess) return '延续了"示弱骄敌"的思路，但没能收到桂陵伏击之功'
  if (state.flags.zhaofallen) return '邯郸先陷，与史实时序相近，而战果不同'
  return '另辟蹊径，与史实走法差异较大'
}