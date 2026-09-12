<script setup>
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import BasicLayout from '@/layouts/BasicLayout.vue'
import AccessLock from '@/components/AccessLock.vue'
import { useTheme } from '@/composables/useTheme'

const { naiveTheme, themeOverrides } = useTheme()
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <basic-layout />
    </n-message-provider>
    <access-lock />
  </n-config-provider>
</template>
