import type { OpsRules } from './opsTypes.js'

const registry = new Map<string, OpsRules>()

export function registerRules(rules: OpsRules): void {
  registry.set(rules.id, rules)
}

export function getRules(id: string): OpsRules {
  const found = registry.get(id)
  if (!found) throw new Error('未注册的战役规则: ' + id)
  return found
}

export function listRuleIds(): string[] {
  return [...registry.keys()]
}
