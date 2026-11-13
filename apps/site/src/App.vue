<script setup lang="ts">
import { onMounted } from 'vue'
import { store, checkSave } from './store/game'
import TitleView from './views/TitleView.vue'
import BriefingView from './views/BriefingView.vue'
import BattleView from './views/BattleView.vue'
import ResultView from './views/ResultView.vue'
import AboutView from './views/AboutView.vue'

onMounted(() => { checkSave() })
</script>

<template>
  <div class="app-shell">
    <TitleView v-if="store.view === 'title'" />
    <BriefingView v-else-if="store.view === 'briefing'" />
    <BattleView v-else-if="store.view === 'battle'" />
    <ResultView v-else-if="store.view === 'result'" />
    <AboutView v-else-if="store.view === 'about'" />
  </div>
</template>
