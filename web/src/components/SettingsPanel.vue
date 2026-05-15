<script setup>
/**
 * 灌溉设置表单 — 分组布局
 */
import { inject } from 'vue'

const { settings, updateSetting, saveSettings, saving } = inject('connection')

/** 格式化显示值：整数直接显示，浮点保留一位小数 */
function displayValue(key, value) {
  if (key === 'tempMin' || key === 'tempMax') {
    return (value / 10).toFixed(1)
  }
  return value
}

/** 输入变更处理：温度值需 ×10 转换 */
function onInput(key, raw) {
  const parsed = parseFloat(raw)
  if (isNaN(parsed)) return

  if (key === 'tempMin' || key === 'tempMax') {
    updateSetting(key, Math.round(parsed * 10))
  } else {
    updateSetting(key, Math.round(parsed))
  }
}

/** 下拉选择变更处理 */
function onSelect(key, value) {
  updateSetting(key, parseInt(value))
}
</script>

<template>
  <div class="sfp-card rounded-2xl p-5 space-y-5 shadow-lg animate-card-in" style="animation-delay: 400ms">
    <div class="flex items-center gap-2">
      <img src="/potted_plant_3d.png" alt="灌溉设置" class="w-6 h-6" />
      <h2 class="text-base font-bold text-[rgb(var(--sfp-text-primary))]">灌溉设置</h2>
    </div>

    <!-- 温度区间 -->
    <div>
      <h3 class="text-xs font-semibold text-[rgb(var(--sfp-text-muted))] uppercase tracking-wider mb-2">🌡️ 温度区间</h3>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">下限 (°C)</label>
          <input
            type="number"
            :value="displayValue('tempMin', settings.tempMin)"
            class="w-full sfp-input rounded-xl px-3 py-2.5 text-sm"
            @input="onInput('tempMin', $event.target.value)"
          />
        </div>
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">上限 (°C)</label>
          <input
            type="number"
            :value="displayValue('tempMax', settings.tempMax)"
            class="w-full sfp-input rounded-xl px-3 py-2.5 text-sm"
            @input="onInput('tempMax', $event.target.value)"
          />
        </div>
      </div>
    </div>

    <!-- 湿度区间 -->
    <div>
      <h3 class="text-xs font-semibold text-[rgb(var(--sfp-text-muted))] uppercase tracking-wider mb-2">💧 湿度区间</h3>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">下限 (%)</label>
          <input
            type="number"
            :value="settings.humMin"
            class="w-full sfp-input rounded-xl px-3 py-2.5 text-sm"
            @input="onInput('humMin', $event.target.value)"
          />
        </div>
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">上限 (%)</label>
          <input
            type="number"
            :value="settings.humMax"
            class="w-full sfp-input rounded-xl px-3 py-2.5 text-sm"
            @input="onInput('humMax', $event.target.value)"
          />
        </div>
      </div>
    </div>

    <!-- 土壤与比较模式 -->
    <div>
      <h3 class="text-xs font-semibold text-[rgb(var(--sfp-text-muted))] uppercase tracking-wider mb-2">🌿 土壤阈值</h3>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">阈值 (ADC)</label>
          <input
            type="number"
            :value="settings.soilThreshold"
            class="w-full sfp-input rounded-xl px-3 py-2.5 text-sm"
            @input="onInput('soilThreshold', $event.target.value)"
          />
        </div>
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">比较模式</label>
          <select
            class="w-full sfp-select rounded-xl px-3 py-2.5 text-sm"
            :value="settings.compareMode"
            @change="onSelect('compareMode', $event.target.value)"
          >
            <option value="0">低于阈值启动</option>
            <option value="1">高于阈值启动</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 水泵设置 -->
    <div>
      <h3 class="text-xs font-semibold text-[rgb(var(--sfp-text-muted))] uppercase tracking-wider mb-2">⚡ 水泵控制</h3>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">转速 (0-255)</label>
          <input
            type="number"
            :value="settings.pumpSpeed"
            class="w-full sfp-input rounded-xl px-3 py-2.5 text-sm"
            @input="onInput('pumpSpeed', $event.target.value)"
          />
        </div>
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">浇水方向</label>
          <select
            class="w-full sfp-select rounded-xl px-3 py-2.5 text-sm"
            :value="settings.waterDirection"
            @change="onSelect('waterDirection', $event.target.value)"
          >
            <option value="0">正转</option>
            <option value="1">反转</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 保存按钮 -->
    <button
      class="w-full py-3 sfp-btn-primary rounded-xl font-bold text-base transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
      :disabled="saving"
      @click="saveSettings"
    >
      <span v-if="saving" class="sfp-spinner"></span>
      {{ saving ? '保存中...' : '保存设置到设备' }}
    </button>
  </div>
</template>
