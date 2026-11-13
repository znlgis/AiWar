import type { Campaign, GameState } from './types.js'
import { createInitialState } from './state.js'

export interface SaveV1 {
  v: 1
  campaignId: string
  difficulty: GameState['difficulty']
  seed: number
  state: GameState
  savedAt: number
}

export function serializeSave(state: GameState): SaveV1 {
  return {
    v: 1,
    campaignId: state.campaignId,
    difficulty: state.difficulty,
    seed: state.seed,
    state,
    savedAt: Date.now(),
  }
}

export function restoreSave(raw: unknown, campaign: Campaign): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const save = raw as Partial<SaveV1>
  if (save.v !== 1 || save.campaignId !== campaign.meta.id || typeof save.seed !== 'number') return null
  if (!save.state || typeof save.state !== 'object') return null
  const state = save.state as GameState
  if (!state.cities || !state.armies) return null
  // 兼容缺省字段，避免旧存档崩溃
  const fresh = createInitialState(campaign, save.difficulty ?? 'normal', save.seed)
  return { ...fresh, ...state }
}
