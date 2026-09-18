<script setup>
import { NQrCode } from 'naive-ui'

// 当前 host + 路径（hash 路由下取 # 之前部分），手机扫码即打开同一站点。
// 用 naive-ui 内置 NQrCode（自带 qrcodegen，零外部依赖），任意部署 host 自适应。
const url = `${window.location.origin}${window.location.pathname}`
// 图标走 BASE_URL 拼相对路径，兼容 vite base:'./' 的子路径部署（与 BasicLayout 的 logoSrc 一致）
const iconSrc = `${import.meta.env.BASE_URL}favicon.svg`
</script>

<template>
  <div class="flex flex-col items-center gap-2">
    <div class="flex w-max overflow-hidden rounded-lg bg-white p-8px">
      <n-qr-code
        :size="128"
        :value="url"
        padding="0"
        color="var(--c-primary)"
        :icon-src="iconSrc"
        type="svg"
      />
    </div>
    <span class="truncate text-xs opacity-60">手机扫码查看</span>
  </div>
</template>
