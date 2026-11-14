import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { initStore } from './store/game'
import { initAudio } from './audio/sfx'

// 音效初始化在 mount 之前同步执行；某些浏览器（iOS 低电量模式、旧 WebView）构造 AudioContext 会抛错，
// 不兜住就会在挂载前中断，页面停在空白 #app 上。
try { initStore() } catch (error) { console.error('[aiwar] 存档初始化失败', error) }
try { initAudio() } catch (error) { console.error('[aiwar] 音效初始化失败', error) }

const app = createApp(App)
app.config.errorHandler = (error) => { console.error('[aiwar]', error) }
app.mount('#app')