import { reactive } from 'vue'
import type {
  DecisionOptionDef, DifficultyId, FactionId, GameState, OpsOrderDraft, OpsState, OrderDraft, OpsScore, Score, Task,
} from '@aiwar/sim'
import {
  advanceDay, advanceOpsDay, canIssue, canIssueOpsOrder, createGame, createOpsState, finalize,
  issueOrder, issueOpsOrder, orderSentence, resolveDecision, resolveOpsNode,
  seedOpening, timeoutNode, timeoutOpsNode,
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

function projectNow(): UiState {
  const pack = currentPack()
  if (pack.engine === 'legacy' && legacy) {
    const ui = projectLegacy(legacy, pack.campaign)
    ui.paused = store.ui ? store.ui.paused : true
    ui.speed = store.ui ? store.ui.speed : 1
    ui.decisionSeconds = store.ui?.decisionSeconds ?? 0
    return ui
  }
  if (pack.engine === 'ops' && ops) {
    const hud = pack.rules.hud?.(ops, pack.campaign)
    const score = ops.over ? toScore(pack.rules.score(ops, pack.campaign), pack) : null
    const ui = projectOps(ops, pack.campaign, hud, score)
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

function finish(): void {
  stop()
  if (ops) {
    ops.over = true
    if (!ops.endingId) ops.endingId = 'stalemate'
  }
  store.ui = projectNow()
  store.view = 'result'
  const total = store.ui.score?.total ?? 0
  if (total >= 75) sfx.win()
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

function startDecisionTimer(): void {
  if (!store.ui) return
  const seconds = packDifficulty().decisionSeconds
  store.ui.decisionSeconds = seconds
  if (decisionTimer) window.clearInterval(decisionTimer)
  decisionTimer = window.setInterval(() => {
    if (!store.ui) { window.clearInterval(decisionTimer!); return }
    store.ui.decisionSeconds -= 1
    if (store.ui.decisionSeconds <= 0) {
      window.clearInterval(decisionTimer!)
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
        const data = JSON.parse(raw) as { v: number; difficulty: DifficultyId; seed: number; state: unknown }
        if (data.v === 2 && data.state) {
          store.difficulty = data.difficulty ?? store.difficulty
          store.seed = data.seed ?? newSeed()
          if (pack.engine === 'legacy') legacy = data.state as GameState
          else ops = data.state as OpsState
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
  store.ui.paused = false
  if (timer) window.clearInterval(timer)
  timer = window.setInterval(tickOnce, store.ui.speed * 650)
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
  if (decisionTimer) window.clearInterval(decisionTimer)
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
  if (decisionTimer) window.clearInterval(decisionTimer)
  store.view = 'title'
  store.orderOpen = false
}

export function exitToTitle(): void {
  save()
  backToTitle()
}

export function abandon(): void {
  if (!window.confirm('放弃当前战局并返回标题？')) return
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
