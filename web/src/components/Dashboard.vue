<script setup>
/**
 * 传感器仪表盘 — 2×2 卡片网格
 *
 * 显示传感器实时数据：
 * - 温度（°C，一位小数）
 * - 空气湿度（%）
 * - 土壤 ADC 原始值（0-4095）
 * - 水泵状态（脉冲绿点 = 运行中）
 *
 * 无数据时显示等待提示与进度条动画
 */
import { inject, computed } from 'vue'
import SensorCard from './SensorCard.vue'
import { pumpLabel } from '../lib/settings.js'
import { publicPath } from '../lib/publicPath.js'

/** 静态资源路径前缀（兼容域名根目录和子目录部署） */
const imgPlant = publicPath + 'potted_plant_3d.png'

const { sensor } = inject('connection')

/** 水泵是否处于运行状态（用于脉冲指示点闪烁） */
const pumpActive = computed(() => sensor.value?.pump !== 0)
/** 水泵状态中文描述 */
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
    <img :src="imgPlant" alt="等待数据" class="w-16 h-16 mb-4" />
    <h3 class="text-lg font-semibold text-[rgb(var(--sfp-text-primary))] mb-2">等待传感器数据...</h3>
    <p class="text-sm text-[rgb(var(--sfp-text-muted))]">设备已连接，正在获取传感器读数</p>
    <div class="sfp-progress" style="max-width: 200px;"></div>
  </div>
</template>
