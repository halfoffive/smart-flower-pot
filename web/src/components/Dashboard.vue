<script setup>
/**
 * 传感器仪表盘 — 2×2 卡片网格
 */
import { inject, computed } from 'vue'
import SensorCard from './SensorCard.vue'
import { pumpLabel } from '../lib/settings.js'

const { sensor } = inject('connection')

const pumpActive = computed(() => sensor.value?.pump !== 0)
const pumpText = computed(() => sensor.value ? pumpLabel(sensor.value.pump) : '停止')
</script>

<template>
  <div v-if="sensor" class="grid grid-cols-2 gap-3">
    <SensorCard
      icon="🌡️"
      label="温度"
      :value="sensor.temp.toFixed(1)"
      unit="°C"
      border-class="sfp-border-l-temp"
      value-class="sfp-val-temp"
      :delay="100"
    />
    <SensorCard
      icon="💧"
      label="空气湿度"
      :value="sensor.hum"
      unit="%"
      border-class="sfp-border-l-hum"
      value-class="sfp-val-hum"
      :delay="175"
    />
    <SensorCard
      icon="🌿"
      label="土壤 ADC"
      :value="sensor.soil"
      unit="raw"
      border-class="sfp-border-l-soil"
      value-class="sfp-val-soil"
      :delay="250"
    />
    <SensorCard
      icon="⚡"
      label="水泵"
      :value="pumpText"
      border-class="sfp-border-l-pump"
      value-class="sfp-val-pump-active"
      :delay="325"
      :active="pumpActive"
      :active-label="pumpText"
    />
  </div>
  <div v-else class="flex flex-col items-center justify-center sfp-card rounded-2xl p-8 text-center shadow-lg animate-card-in" style="animation-delay: 100ms">
    <span class="text-5xl mb-4">📡</span>
    <h3 class="text-lg font-semibold text-[rgb(var(--sfp-text-primary))] mb-2">等待传感器数据...</h3>
    <p class="text-sm text-[rgb(var(--sfp-text-muted))]">设备已连接，正在获取传感器读数</p>
  </div>
</template>
