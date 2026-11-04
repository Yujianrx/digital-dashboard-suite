import { createApp } from 'vue'
import App from './App.vue'
import { registerEcharts } from './plugins/echarts'
import './restaurant/style.css'
const app = createApp(App)
registerEcharts(app)
const ready=(window as Window & {__sharedStorageReady?:Promise<unknown>}).__sharedStorageReady || Promise.resolve()
ready.then(() => app.mount('#app')).catch(() => {})
