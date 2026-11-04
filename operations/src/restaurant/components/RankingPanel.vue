<script setup lang="ts">
import Panel from "./Panel.vue";
import { money, number, delta } from "../format";
defineProps<{ rows: any[] }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>
<template>
  <Panel title="门店营收排行" eyebrow="STORE LEADERBOARD" tag="TOP 10"
    ><div class="ranking-table">
      <table>
        <thead>
          <tr>
            <th>排名 / 门店</th>
            <th>营收（元）</th>
            <th>订单</th>
            <th>环比</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows.slice(0, 10)" :key="r.id">
            <td>
              <button
                @click="emit('select', r.id)"
                :data-testid="'rank-' + r.id"
              >
                <span class="rank-number" :class="{ accent: i < 3 }">{{
                  String(i + 1).padStart(2, "0")
                }}</span
                >{{ r.name }}
              </button>
            </td>
            <td>{{ money(r.revenue, true) }}</td>
            <td>{{ number(r.orders) }}</td>
            <td
              :class="
                r.mom == null ? 'muted' : r.mom >= 0 ? 'positive' : 'negative'
              "
            >
              {{ delta(r.mom) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="empty">当前范围无门店</p>
    </div></Panel
  >
</template>
