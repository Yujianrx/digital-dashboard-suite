<script setup lang="ts">
import BorderBox13 from "@/components/datav/border-box-13/border-box-13.vue";
defineProps<{ title: string; eyebrow?: string; tag?: string }>();
</script>
<template>
  <section class="panel">
    <BorderBox13 :color="['#234158', '#69bdf5']"
      ><header class="panel-head">
        <div>
          <span class="panel-eyebrow">{{ eyebrow }}</span>
          <h2>{{ title }}</h2>
        </div>
        <span v-if="tag" class="panel-tag">{{ tag }}</span
        ><slot name="actions" />
      </header>
      <div class="panel-body"><slot /></div
    ></BorderBox13>
  </section>
</template>
