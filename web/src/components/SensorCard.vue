<script setup>
/**
 * 传感器卡片组件 — 可复用
 *
 * 用于 Dashboard 的 2×2 网格，展示温度、湿度、土壤 ADC、水泵状态。
 * 支持两种渲染模式：
 *   1. 数值模式（有值 + 单位）：温度/湿度/土壤 ADC
 *   2. 状态模式（active + activeLabel）：水泵（动态脉冲指示）
 *
 * @prop {string}         icon        - Emoji 图标（🌡️💧🌿⚡）
 * @prop {string}         label       - 中文标签（温度/空气湿度/土壤 ADC/水泵）
 * @prop {string|number}  value       - 传感器数值（数值模式显示大字）
 * @prop {string}         unit        - 单位（°C / % / raw）
 * @prop {string}         borderClass - 左侧主题色边框 CSS 类
 * @prop {string}         valueClass  - 数值颜色 CSS 类
 * @prop {number}         delay       - 入场动画延迟（毫秒，实现 staggered 递进效果）
 * @prop {boolean}        active      - 激活态（水泵正转/反转时点亮绿点并脉冲）
 * @prop {string}         activeLabel - 激活态文字（显示状态文字替代数值）
 */
defineProps({
  icon:        { type: String, required: true },
  label:       { type: String, required: true },
  value:       { type: [String, Number], required: true },
  unit:        { type: String, default: '' },
  borderClass: { type: String, required: true },
  valueClass:  { type: String, required: true },
  delay:       { type: Number, default: 0 },
  active:      { type: Boolean, default: false },
  activeLabel: { type: String, default: '' },
})
</script>

<template>
  <div
    class="sfp-sensor-card rounded-2xl p-4 shadow-lg animate-card-in"
    :class="[borderClass, { 'sfp-border-l-pump': active, 'sfp-border-l-pump-idle': !active && activeLabel }]"
    :style="{ animationDelay: `${delay}ms` }"
  >
    <div class="flex items-center gap-1.5 mb-2">
      <span class="text-xs">{{ icon }}</span>
      <span class="text-xs text-[rgb(var(--sfp-text-muted))]">{{ label }}</span>
    </div>
    <div v-if="!activeLabel" class="flex items-baseline gap-1">
      <span class="text-3xl font-bold" :class="valueClass">{{ value }}</span>
      <span v-if="unit" class="text-sm text-[rgb(var(--sfp-text-muted))]">{{ unit }}</span>
    </div>
    <div v-else class="flex items-center gap-2">
      <span
        class="w-2.5 h-2.5 rounded-full"
        :class="active
          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse-dot'
          : 'bg-[rgb(var(--sfp-dot-inactive))]'"
      />
      <span class="text-xl font-bold" :class="active ? 'sfp-val-pump-active' : 'sfp-val-pump-idle'">
        {{ activeLabel }}
      </span>
    </div>
  </div>
</template>
