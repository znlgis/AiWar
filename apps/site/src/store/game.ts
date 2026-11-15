import { reactive } from 'vue'
import type {
  DecisionOptionDef, DifficultyId, FactionId, GameState, OpsOrderDraft, OpsState, OrderDraft, OpsScore, Score, Task,
} from '@aiwar/sim'
import {
  advanceDay, advanceOpsDay, canIssue, canIssueOpsOrder, createGame, createOpsState, finalize,
  issueOrder, issueOpsOrder, orderSentence, resolveDecision, resolveOpsNode,
  seedOpening, timeoutNode, timeoutOpsNode, debriefForLegacy, debriefForOps, restoreSave,
} from '@aiwar/sim'
import { PACKS, getPack } from '@aiwar/content'
import { projectLegacy, projectOps, type UiState, type ViewName } from './project'
import { sfx } from '../audio/sfx'

export type { ViewName, UiState }
export { PACKS, getPack }
export type { FactionId, Task }

export const store = reactive({
  view: 'title' as ViewName,
  packId: PACKS[0]?.id ?? 'guiling-353bc',
  difficulty: 'normal' as DifficultyId,
  seed: 0,
  ui: null as UiState | null,
  orderOpen: false,
  hasSave: false,
  savedPacks: [] as string[],
})

export function currentPack() {
  return getPack(store.packId)
}

let legacy: GameState | null = null
let ops: OpsState | null = null
let timer: number | null = null
let decisionTimer: number | null = null
let lastReportSeq = 0

const SAVE_PREFIX = 'aiwar.save.v2.'

function packDifficulty() {
  return currentPack().difficulty[store.difficulty]
}

function activeState(): GameState | OpsState | null {
  return legacy ?? ops
}

export function factionColor(f: FactionId): string {
  return (currentPack().campaign.factions as Record<string, { color: string }>)[f]?.color ?? '#666'
}

function toScore(raw: OpsScore, pack: ReturnType<typeof currentPack>): Score {
  return {
    grade: raw.grade,
    total: raw.total,
    parts: raw.parts,
    sides: { player: pack.unitsLabel, enemy: pack.enemyLabel },
    endingId: raw.endingId,
    endingTitle: raw.endingTitle,
    endingText: raw.endingText,
    deviation: raw.deviation,
    highlights: raw.highlights,
    lines: raw.lines,
  } as unknown as Score
}

function projectNow(abandoned = false): UiState {
  const pack = currentPack()
  if (pack.engine === 'legacy' && legacy) {
    const score = legacy.over ? finalize(legacy, pack.campaign) : null
    const debriefScore = score ?? (abandoned ? finalize(legacy, pack.campaign) : null)
    const debrief = debriefScore
      ? debriefForLegacy(legacy, pack.campaign, debriefScore, {
        abandoned,
        playerLabel: pack.unitsLabel,
        enemyLabel: pack.enemyLabel,
      })
      : null
    const ui = projectLegacy(legacy, pack.campaign, debriefScore, debrief)
    ui.paused = store.ui ? store.ui.paused : true
    ui.speed = store.ui ? store.ui.speed : 1
    ui.decisionSeconds = store.ui?.decisionSeconds ?? 0
    return ui
  }
  if (pack.engine === 'ops' && ops) {
    const hud = pack.rules.hud?.(ops, pack.campaign)
    const raw = ops.over || abandoned ? pack.rules.score(ops, pack.campaign) : null
    const score = raw ? toScore(raw, pack) : null
    const debrief = raw
      ? debriefForOps(ops, pack.campaign, raw, {
        abandoned,
        playerLabel: pack.unitsLabel,
        enemyLabel: pack.enemyLabel,
      })
      : null
    const ui = projectOps(ops, pack.campaign, hud, score, { player: pack.unitsLabel, enemy: pack.enemyLabel }, debrief)
    ui.paused = store.ui ? store.ui.paused : true
    ui.speed = store.ui ? store.ui.speed : 1
    ui.decisionSeconds = store.ui?.decisionSeconds ?? 0
    return ui
  }
  throw new Error('尚未开局')
}

function newSeed(): number { return Math.floor(Math.random() * 1e9) }

function save(): void {
  const state = activeState()
  if (!state) return
  const pack = currentPack()
  try {
    const payload = { v: 2, packId: pack.id, engine: pack.engine, difficulty: store.difficulty, seed: store.seed, state, savedAt: Date.now() }
    localStorage.setItem(SAVE_PREFIX + pack.id, JSON.stringify(payload))
    refreshSaves()
  } catch { /* 存储不可用时静默 */ }
}

function refreshSaves(): void {
  const saved: string[] = []
  for (const pack of PACKS) {
    try { if (localStorage.getItem(SAVE_PREFIX + pack.id)) saved.push(pack.id) } catch { /* 忽略 */ }
  }
  store.savedPacks = saved
  store.hasSave = saved.length > 0
}

/**
 * 进入结算页。不论输赢都走这里——包括玩家主动「放弃」的残局。
 * abandoned 为 true 时战报标记「弃局」，仍生成完整编年与分项解读，不再像以前那样直接删档回标题。
 */
function finish(abandoned = false): void {
  stop()
  if (ops && !abandoned) {
    ops.over = true
    if (!ops.endingId) ops.endingId = 'stalemate'
  }
  store.ui = projectNow(abandoned)
  store.view = 'result'
  const verdict = store.ui?.debrief?.verdict
  if (verdict === 'win') sfx.win()
  else sfx.lose()
}

function playReportSound(): void {
  const state = activeState()
  if (!state) return
  const fresh = state.reports.filter(r => r.arriveTick === state.tick && r.important)
  const unseen = fresh.filter(r => Number(String(r.id).replace('r', '')) > lastReportSeq)
  if (unseen.length > 0) {
    lastReportSeq = Math.max(...unseen.map(r => Number(String(r.id).replace('r', ''))))
    sfx.drum(unseen.length > 1)
  }
}

function tickOnce(): void {
  const pack = currentPack()
  if (pack.engine === 'legacy' && legacy) {
    const result = advanceDay(legacy, pack.campaign, pack.narrative)
    store.ui = projectNow()
    if (legacy.tick % 4 === 0) save()
    playReportSound()
    if (legacy.over) { finish(); return }
    if (result.pendingNode) { sfx.horn(); stop(); startDecisionTimer() }
    return
  }
  if (pack.engine === 'ops' && ops) {
    const result = advanceOpsDay(ops, pack.campaign, pack.narrative, pack.rules)
    store.ui = projectNow()
    if (ops.tick % 4 === 0) save()
    playReportSound()
    if (ops.over) { finish(); return }
    if (result.pendingNode) { sfx.horn(); stop(); startDecisionTimer() }
  }
}

function clearDecisionTimer(): void {
  if (decisionTimer !== null) { window.clearInterval(decisionTimer); decisionTimer = null }
}

function startDecisionTimer(): void {
  if (!store.ui) return
  const seconds = packDifficulty().decisionSeconds
  store.ui.decisionSeconds = seconds
  clearDecisionTimer()
  decisionTimer = window.setInterval(() => {
    if (!store.ui) { clearDecisionTimer(); return }
    store.ui.decisionSeconds -= 1
    if (store.ui.decisionSeconds <= 0) {
      clearDecisionTimer()
      timeoutCurrent()
      store.ui = projectNow()
      save()
      if (activeState()?.over) finish()
      else start()
    }
  }, 1000)
}

function timeoutCurrent(): void {
  const pack = currentPack()
  if (pack.engine === 'legacy' && legacy && legacy.pendingNode) {
    timeoutNode(legacy, pack.campaign, pack.narrative)
  } else if (pack.engine === 'ops' && ops && ops.pendingNode) {
    timeoutOpsNode(ops, pack.campaign, pack.narrative, pack.rules)
  }
}

export function startGame(load = false, packId?: string): void {
  legacy = null
  ops = null
  lastReportSeq = 0
  if (packId) store.packId = packId
  const pack = currentPack()
  if (load) {
    try {
      const raw = localStorage.getItem(SAVE_PREFIX + pack.id)
      if (raw) {
        const data = JSON.parse(raw) as { v: number; packId?: string; engine?: string; difficulty: DifficultyId; seed: number; state: unknown }
        // 存档必须与当前战役包同源：否则别的引擎 / 别的战役的档会被硬转成当前状态，
        // projectLegacy 里 state.cities[def.id] 一取不到值就抛错，界面停在空壳。
        const samePack = (data.packId ?? pack.id) === pack.id && (data.engine ?? pack.engine) === pack.engine
        if (data.v === 2 && data.state && samePack) {
          store.difficulty = data.difficulty ?? store.difficulty
          store.seed = data.seed ?? newSeed()
          if (pack.engine === 'legacy') {
            // 走内核的 restoreSave：它会用新版本初始状态兜底缺省字段，并补齐四个账本
            legacy = restoreSave(data.state, pack.campaign)
            if (!legacy) ops = null
          } else {
            ops = data.state as OpsState
          }
        }
      }
    } catch { legacy = null; ops = null }
  }
  if (!legacy && !ops) {
    store.seed = newSeed()
    if (pack.engine === 'legacy') {
      legacy = createGame({ campaign: pack.campaign, difficulty: store.difficulty, seed: store.seed })
      seedOpening(legacy, pack.campaign, pack.narrative)
    } else {
      ops = createOpsState(pack.campaign, store.difficulty, store.seed)
      pack.rules.opening(ops, pack.campaign, pack.narrative)
    }
  }
  store.ui = projectNow()
  store.view = 'battle'
  if (activeState()?.over) finish()
  else start()
}

export function start(): void {
  if (!store.ui) return
  // 有待决节点时必须先定策：否则反复点「继续」会把决策倒计时重置回满值
  if (store.ui.pendingNode) return
  store.ui.paused = false
  if (timer) window.clearInterval(timer)
  // 650ms/日 会让 70 天的战役 50 秒通关，战报来不及读。放慢到约 2 秒/日，
  // 单局回到数分钟量级，×2/×4 加速这时才有意义。
  // speed 是加速倍数：×1 = 2000ms/日，×2 = 1000ms，×4 = 500ms
  timer = window.setInterval(tickOnce, Math.max(200, 2000 / Math.max(0.25, store.ui.speed)))
}

export function stop(): void {
  if (timer) window.clearInterval(timer)
  timer = null
  if (store.ui) store.ui.paused = true
}

export function toggle(): void {
  if (store.ui?.paused) start()
  else stop()
}

export function setSpeed(v: number): void {
  if (!store.ui) return
  store.ui.speed = v
  if (timer) { window.clearInterval(timer); timer = null; start() }
}

export function step(): void {
  if (!store.ui || store.ui.pendingNode) return
  stop()
  tickOnce()
  if (activeState()?.over) return
  if (store.ui?.pendingNode) startDecisionTimer()
}

export function choose(optionId: string): void {
  if (!store.ui?.pendingNode) return
  sfx.click()
  stop()
  clearDecisionTimer()
  const pack = currentPack()
  if (pack.engine === 'legacy' && legacy && legacy.pendingNode) {
    resolveDecision(legacy, pack.campaign, pack.narrative, legacy.pendingNode, optionId)
  } else if (pack.engine === 'ops' && ops && ops.pendingNode) {
    resolveOpsNode(ops, pack.campaign, pack.narrative, pack.rules, ops.pendingNode, optionId)
  }
  store.ui = projectNow()
  save()
  if (activeState()?.over) finish()
  else start()
}

export function openOrder(): void { store.orderOpen = true }
export function closeOrder(): void { store.orderOpen = false }

export function orderPreview(draft: OrderDraft): string {
  const pack = currentPack()
  if (pack.engine === 'legacy' && legacy) return orderSentence(legacy, draft)
  if (!ops) return ''
  const names = draft.armyIds.map(id => ops!.armies[id]?.name).filter(Boolean).join('、')
  const target = draft.target ? (ops.cities[draft.target]?.name ?? draft.target) : '敌境'
  const taskLabel = pack.tasks.find(t => t.id === draft.task)?.label ?? draft.task
  return '令' + (names || '诸军') + ' ' + taskLabel + (target ? ' · ' + target : '')
}

export function submitOrder(draft: OrderDraft): string | null {
  const pack = currentPack()
  if (pack.engine === 'legacy' && legacy) {
    const reason = canIssue(legacy, draft)
    if (reason) return reason
    issueOrder(legacy, draft)
    store.ui = projectNow()
    save()
    return null
  }
  if (!ops) return '尚未开局'
  const opsDraft: OpsOrderDraft = { task: draft.task as OpsOrderDraft['task'], armyIds: draft.armyIds, target: draft.target }
  const reason = canIssueOpsOrder(ops, opsDraft)
  if (reason) return reason
  issueOpsOrder(ops, opsDraft)
  store.ui = projectNow()
  save()
  return null
}

export function backToTitle(): void {
  stop()
  clearDecisionTimer()
  store.view = 'title'
  store.orderOpen = false
}

/**
 * 放弃当前战局：先去结算页看残局战报，再由玩家决定是否返回标题。
 * 原实现是确认后直接删档回标题，等于放弃的那一局什么都不会留下。
 */
export function abandon(): void {
  if (!activeState()) { backToTitle(); return }
  if (!window.confirm('放弃当前战局？会先生成本局的残局战报。')) return
  try { localStorage.removeItem(SAVE_PREFIX + currentPack().id) } catch { /* 忽略 */ }
  clearDecisionTimer()
  refreshSaves()
  finish(true)
}

/** 结算页「丢弃本局并返回标题」 */
export function discardAndExit(): void {
  try { localStorage.removeItem(SAVE_PREFIX + currentPack().id) } catch { /* 忽略 */ }
  legacy = null
  ops = null
  store.ui = null
  refreshSaves()
  backToTitle()
}

export function newCampaign(): void {
  try { localStorage.removeItem(SAVE_PREFIX + currentPack().id) } catch { /* 忽略 */ }
  legacy = null
  ops = null
  store.ui = null
  refreshSaves()
  store.view = 'title'
}

export function toBriefing(packId?: string): void {
  if (packId) store.packId = packId
  store.view = 'briefing'
}
export function toAbout(): void { store.view = 'about' }
export function toTitle(): void { store.view = 'title' }
export function checkSave(): void { refreshSaves() }
export function hasSaveFor(packId: string): boolean { return store.savedPacks.includes(packId) }

export function initStore(): void {
  checkSave()
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save()
  })
}
