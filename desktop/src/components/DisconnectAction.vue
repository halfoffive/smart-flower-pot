<script setup>
/**
 * 断开连接操作卡片
 */
import { inject } from 'vue'

const { disconnect } = inject('connection')
</script>

<template>
  <div class="sfp-card rounded-2xl p-4 shadow-lg animate-card-in text-center" style="animation-delay: 500ms">
    <p class="text-xs text-[rgb(var(--sfp-text-muted))] mb-3">设备已连接，可随时断开</p>
    <button
      class="px-8 py-2.5 sfp-btn-danger rounded-xl font-medium text-sm transition-all duration-200 active:scale-95"
      @click="disconnect"
    >
      断开连接
    </button>
  </div>
</template>
