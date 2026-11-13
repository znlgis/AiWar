import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { initStore } from './store/game'
import { initAudio } from './audio/sfx'

initStore()
initAudio()
createApp(App).mount('#app')