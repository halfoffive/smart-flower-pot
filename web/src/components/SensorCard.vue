<script setup>
/**
 * 单个传感器卡片组件 — 可复用
 *
 * @prop {string} icon - 图标 emoji
 * @prop {string} label - 卡片标签
 * @prop {string|number} value - 显示值
 * @prop {string} unit - 单位文本
 * @prop {string} borderClass - 左侧边框 CSS 类
 * @prop {string} valueClass - 数值颜色 CSS 类
 * @prop {number} delay - 入场动画延迟（毫秒）
 * @prop {boolean} active - 是否激活态（影响指示点）
 * @prop {string} activeLabel - 激活态文字
 */
defineProps({
  icon: { type: String, required: true },
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  unit: { type: String, default: '' },
  borderClass: { type: String, required: true },
  valueClass: { type: String, required: true },
  delay: { type: Number, default: 0 },
  active: { type: Boolean, default: false },
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
