<script setup lang="ts">
import { computed } from 'vue'
import { currentPack, toTitle, store } from '../store/game'
import { APP_VERSION } from '../version'

const pack = computed(() => currentPack())
const appVersion = APP_VERSION
</script>

<template>
  <main class="page about-page">
    <div class="wrap">
      <button class="back" @click="toTitle">返回标题</button>
      <h1 class="serif">玩法与史料</h1>

      <section class="card">
        <h2>这是一款什么游戏</h2>
        <p>历史战场推演 + 关键节点决策 + 有限情报博弈。你只能看到前线战报与最新势力范围；战场由推演内核与敌方 AI 决定，结果不必与史实一致。</p>
        <p class="muted small">当前战役：{{ pack.meta.title }} · {{ pack.meta.subtitle }} · 你扮演：{{ pack.meta.playerRole }}</p>
      </section>

      <section class="card">
        <h2>规则</h2>
        <ul>
          <li><b>时间</b>：一回合一日；可暂停、加速、单步。</li>
          <li><b>决策</b>：关键节点弹出选择；逾时按难度执行默认方案，质量随难度下降。</li>
          <li><b>军令</b>：军令牌点选「部队 → 任务 → 目标」，无自由文本输入；军令有传令延迟。</li>
          <li><b>情报</b>：战报有来源、送达延迟、可信度；同一件事可能被不同来源说成两样。势力图上只显示已探明信息与敌军最后出现位置。</li>
          <li><b>难度</b>：难度影响情报质量、决策窗口与关键事件（风向、敌军是否自乱）的走势，不给敌方兵力数值加成。</li>
          <li><b>地图</b>：可拖动平移，滚轮或双指缩放，双击复位；右下角有缩放按钮。</li>
          <li><b>音效</b>：战鼓、号角、翻简与胜负音由 WebAudio 实时合成，无音频文件；顶栏可静音。</li>
          <li><b>存档</b>：按战役自动存档于浏览器本地；战役进行中不提供手动读档回退。</li>
        </ul>
      </section>

      <section class="card">
        <h2>史料依据</h2>
        <div v-for="h in pack.meta.history" :key="h.title" class="history">
          <h3>{{ h.title }}</h3>
          <p>{{ h.text }}</p>
        </div>
        <p class="disclaimer">{{ pack.meta.disclaimer }}</p>
      </section>

      <section class="card">
        <h2>制作说明</h2>
        <p>所有资源随包发布，运行时不需要联网；战报文案由语料库在运行时组合生成；推演与敌方决策由确定性规则内核完成，同一随机种子与同一串决策会得到同一结局。</p>
        <p class="muted small">当前难度：{{ pack.difficulty[store.difficulty].name }} · 版本 {{ appVersion }}</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.about-page { overflow-y: auto; }
.wrap { width: min(780px, 100%); margin: 0 auto; padding: 26px 22px 44px; display: flex; flex-direction: column; gap: 14px; }
.back { align-self: flex-start; background: none; border: none; color: var(--ink-3); font-size: 13px; padding: 0; }
h1 { font-size: 34px; letter-spacing: .1em; margin: 4px 0 6px; }
h2 { font-size: 14px; letter-spacing: .08em; color: var(--ink-2); margin-bottom: 10px; }
h3 { font-size: 13px; margin-bottom: 4px; }
p, li { font-size: 13.5px; line-height: 1.9; color: var(--ink-2); }
ul { margin: 0; padding-left: 18px; }
.history { padding: 8px 0; border-top: 1px dashed var(--line); }
.history:first-of-type { border-top: none; }
.history p { margin: 0; }
.disclaimer { font-size: 11.5px; color: var(--ink-3); border-top: 1px solid var(--line); padding-top: 10px; margin-top: 12px; }
</style>
