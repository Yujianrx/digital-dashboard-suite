import { createApp } from 'vue'
import App from './App.vue'
import { registerEcharts } from './plugins/echarts'
import './restaurant/style.css'
const app = createApp(App)
registerEcharts(app)
app.mount('#app')
