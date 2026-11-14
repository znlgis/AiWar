<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Task, Modifier, OrderDraft } from '@aiwar/sim'
import { store, submitOrder, orderPreview, closeOrder, currentPack } from '../../store/game'

const ui = computed(() => store.ui!)
const armies = computed(() => ui.value.armies)
const cities = computed(() => ui.value.cities.filter(c => c.known || c.owner === 'qi'))
const selectedArmies = ref<string[]>([])
const task = ref<Task>('march')
const target = ref('')
const modifiers = ref<Modifier[]>([])
const error = ref('')

const TASKS = computed(() => currentPack().tasks as { id: Task; label: string }[])
const MODS: { id: Modifier; label: string }[] = currentPack().engine === 'legacy'
  ? [
    { id: 'forced', label: '疾行' }, { id: 'stealth', label: '隐蔽' }, { id: 'feignWeak', label: '示弱' },
    { id: 'night', label: '夜行' }, { id: 'dropBaggage', label: '弃辎重' },
  ]
  : []
const ENVOYS = [
  { id: 'chu', label: '遣使赴楚' }, { id: 'qin', label: '遣使赴秦' },
  { id: 'song', label: '遣使赴宋' }, { id: 'wei_state', label: '遣使赴卫' },
]
const isEnvoy = computed(() => task.value === 'envoy')
const needsTarget = computed(() => ['march', 'hold', 'feint', 'assault', 'ambush', 'retreat', 'forage', 'scout'].includes(task.value))
const draft = computed<OrderDraft>(() => ({
  task: task.value,
  armyIds: selectedArmies.value,
  target: target.value || undefined,
  modifier: modifiers.value,
}))
const preview = computed(() => orderPreview(draft.value))
const tokenText = computed(() => task.value === 'hold' ? '驻守不耗军令牌' : '消耗 1 枚军令牌')

function toggleArmy(id: string) {
  const i = selectedArmies.value.indexOf(id)
  if (i >= 0) selectedArmies.value.splice(i, 1)
  else if (selectedArmies.value.length < 3) selectedArmies.value.push(id)
}
function toggleMod(m: Modifier) {
  const i = modifiers.value.indexOf(m)
  if (i >= 0) modifiers.value.splice(i, 1)
  else if (modifiers.value.length < 2) modifiers.value.push(m)
}
function pickTarget(id: string) { target.value = id }
function pickEnvoy(id: string) { target.value = id; task.value = 'envoy' as Task }
function submit() {
  error.value = ''
  if (isEnvoy.value) {
    if (!target.value) { error.value = '先选择遣使对象'; return }
  } else {
    if (selectedArmies.value.length === 0) { error.value = '先选择受令部队'; return }
    if (needsTarget.value && !target.value && task.value !== 'hold') { error.value = '先选择目标城邑'; return }
  }
  const msg = submitOrder({ ...draft.value, armyIds: isEnvoy.value ? [] : selectedArmies.value })
  if (msg) { error.value = msg; return }
  closeOrder()
  selectedArmies.value = []
  modifiers.value = []
  target.value = ''
}
function cancel() { closeOrder() }
</script>

<template>
  <div class="overlay" @click.self="cancel">
    <div class="sheet">
      <header>
        <h2>军令</h2>
        <p class="muted small">{{ tokenText }} · 有 1–2 日传令延迟，令到方行</p>
      </header>

      <section v-if="!isEnvoy">
        <h3>一、受令部队</h3>
        <div class="chips">
          <button v-for="a in armies" :key="a.id" class="chip" :class="{ on: selectedArmies.includes(a.id) }" @click="toggleArmy(a.id)">
            {{ a.name }}<span class="muted">{{ a.task }}</span>
          </button>
        </div>
      </section>

      <section>
        <h3>二、任务</h3>
        <div class="chips">
          <button v-for="t in TASKS" :key="t.id" class="chip" :class="{ on: task === t.id }" @click="task = t.id; target = ''">{{ t.label }}</button>
        </div>
      </section>

      <section v-if="needsTarget">
        <h3>三、目标</h3>
        <div class="chips cities">
          <button v-for="c in cities" :key="c.id" class="chip" :class="{ on: target === c.id }" @click="pickTarget(c.id)">{{ c.name }}</button>
        </div>
      </section>

      <section v-if="!isEnvoy">
        <h3>四、修饰（最多两项）</h3>
        <div class="chips">
          <button v-for="m in MODS" :key="m.id" class="chip" :class="{ on: modifiers.includes(m.id) }" @click="toggleMod(m.id)">{{ m.label }}</button>
        </div>
      </section>

      <section>
        <h3>或：外交</h3>
        <div class="chips">
          <button v-for="e in ENVOYS" :key="e.id" class="chip" :class="{ on: isEnvoy && target === e.id }" @click="pickEnvoy(e.id)">{{ e.label }}</button>
        </div>
      </section>

      <div class="preview">
        <span class="muted small">军令预览</span>
        <p>{{ preview || '尚未选择' }}</p>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <footer>
        <button class="btn ghost" @click="cancel">取消</button>
        <button class="btn primary" @click="submit">发令</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(24, 24, 22, 0.4); z-index: 50; display: flex; align-items: flex-end; justify-content: center; }
.sheet { width: min(720px, 100%); max-height: 92vh; overflow-y: auto; background: #fffdf8; border-radius: 14px 14px 0 0; padding: 20px 22px 26px; box-shadow: 0 -10px 40px rgba(0,0,0,.2); }
header h2 { font-size: 19px; font-family: var(--serif); letter-spacing: .08em; }
section { margin-top: 14px; }
h3 { font-size: 12px; color: var(--ink-3); font-weight: 500; margin-bottom: 7px; letter-spacing: .08em; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--line-2); background: #fff; color: var(--ink-2); border-radius: 16px; padding: 5px 12px; font-size: 12.5px; }
.chip span { margin-left: 5px; font-size: 11px; color: var(--ink-3); }
.chip.on { background: var(--ink); border-color: var(--ink); color: #fff; }
.chip.on span { color: #cfcfcf; }
.preview { margin-top: 16px; border: 1px dashed var(--line-2); border-radius: 8px; padding: 10px 12px; background: var(--paper); }
.preview p { margin: 4px 0 0; font-size: 14px; color: var(--ink); }
.error { color: var(--seal); font-size: 12.5px; margin-top: 10px; }
footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (min-width: 760px) { .overlay { align-items: center; } .sheet { border-radius: 14px; } }
</style>
