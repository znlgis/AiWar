// 把两套引擎的状态接到同一个战报生成器上。
//
// legacy（围魏救赵）与 ops（其余四场）的状态结构不同，但对战报而言需要的只有
// 六样东西：势力称呼、双方折损、城邑账本、决策账本、军令账本、日志。
// 这两个适配器就是那层转换，让 debrief.ts 保持单一入口。

import type { Campaign, GameState, OpsCampaign, OpsScore, OpsState, Score } from './index.js'
import type { Debrief } from './debrief.js'
import { buildDebrief, type DebriefInput } from './debrief.js'
import { normalizeLedgers } from './ledger.js'

function sumEnemyCasualties(map: Record<string, number>, playerFaction: string): number {
  let total = 0
  for (const [faction, value] of Object.entries(map)) {
    if (faction === playerFaction) continue
    total += value
  }
  return total
}

/** ops 引擎（赤壁 / 淝水 / 四渡赤水 / 淮海） */
export function debriefForOps(
  state: OpsState,
  campaign: OpsCampaign,
  score: OpsScore,
  opts: { abandoned?: boolean; playerLabel?: string; enemyLabel?: string } = {},
): Debrief {
  const playerFaction = state.playerFaction
  const factionNames: Record<string, string> = {}
  for (const [id, def] of Object.entries(campaign.factions)) factionNames[id] = def.name
  const cityOwners: Record<string, { name: string; owner: string }> = {}
  for (const city of Object.values(state.cities)) cityOwners[city.id] = { name: city.name, owner: city.owner }
  const input: DebriefInput = {
    campaignId: campaign.meta.id,
    playerLabel: opts.playerLabel ?? factionNames[playerFaction] ?? '我军',
    enemyLabel: opts.enemyLabel ?? (campaign.enemyFactions.map(id => factionNames[id] ?? '敌军').join('、') || '敌军'),
    score: opsScoreToScore(score, opts.playerLabel, opts.enemyLabel),
    endingId: state.endingId,
    tick: state.tick,
    abandoned: opts.abandoned === true,
    ledgers: normalizeLedgers(state),
    casualties: {
      player: state.casualties[playerFaction] ?? 0,
      enemy: sumEnemyCasualties(state.casualties, playerFaction),
    },
    citiesTaken: state.citiesTaken,
    log: state.log,
    departmentNames: factionNames,
    playerFaction,
    cityOwners,
  }
  return buildDebrief(input)
}

/** legacy 引擎（围魏救赵） */
export function debriefForLegacy(
  state: GameState,
  campaign: Campaign,
  score: Score,
  opts: { abandoned?: boolean; playerLabel?: string; enemyLabel?: string } = {},
): Debrief {
  const playerFaction = campaign.playerFaction
  const factionNames: Record<string, string> = {}
  for (const [id, def] of Object.entries(campaign.factions)) factionNames[id] = def.name
  const casualties = state.casualties as Record<string, number>
  const cityOwners: Record<string, { name: string; owner: string }> = {}
  for (const city of Object.values(state.cities)) cityOwners[city.id] = { name: city.name, owner: city.owner }
  const input: DebriefInput = {
    campaignId: campaign.meta.id,
    playerLabel: opts.playerLabel ?? factionNames[playerFaction] ?? '齐军',
    enemyLabel: opts.enemyLabel ?? factionNames.wei ?? '魏军',
    score,
    endingId: state.endingId,
    tick: state.tick,
    abandoned: opts.abandoned === true,
    ledgers: normalizeLedgers(state),
    casualties: {
      player: casualties[playerFaction] ?? 0,
      enemy: sumEnemyCasualties(casualties, playerFaction),
    },
    citiesTaken: state.citiesTaken,
    log: state.log,
    departmentNames: factionNames,
    playerFaction,
    cityOwners,
  }
  return buildDebrief(input)
}

/** OpsScore 与 Score 结构一致（同名同义），这里只补齐 sides 以便战报统一取用 */
function opsScoreToScore(raw: OpsScore, playerLabel?: string, enemyLabel?: string): Score {
  return { ...raw, sides: { player: playerLabel ?? '我军', enemy: enemyLabel ?? '敌军' } }
}
