<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { NCard, NInput, NButton } from 'naive-ui'

// 入口动态密码软锁（原样搬入旧 access-lock.js，含 2026/9/25 自动失效，§11.5#7）。
// 纯前端防君子：遮罩盖住应用，校验通过或本次会话已解锁(sessionStorage)才移除。
// 密码规则：本地时间 日/时 各 ×2，补零拼接成 4 位；容差当前小时或前一小时。
const STORAGE_KEY = 'nr_access_unlocked'
const LOCK_DISABLE_AT = new Date('2026/9/25 00:00:00')

function pad2(n) {
  n = String(n)
  return n.length < 2 ? '0' + n : n
}

function passwordOf(date) {
  const d = date.getDate() * 2
  const h = date.getHours() * 2
  return pad2(d) + pad2(h)
}

function isCorrect(value, now = new Date()) {
  const prev = new Date(now.getTime() - 3600000)
  return value === passwordOf(now) || value === passwordOf(prev)
}

function isLockDisabled(now = new Date()) {
  return now.getTime() >= LOCK_DISABLE_AT.getTime()
}

const visible = ref(false)
const input = ref('')
const error = ref(false)

onMounted(() => {
  if (isLockDisabled()) return
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') return
  } catch {
    /* sessionStorage 不可用时按未解锁处理 */
  }
  visible.value = true
})

function onInput(v) {
  const digits = String(v).replace(/\D/g, '')
  if (digits === input.value) {
    // 过滤后与原值相同（如又输入了一个非法字符）时 Vue 不会重渲染，
    // 需借下一帧强制回写，清掉原生输入框里残留的非数字字符。
    input.value = ''
    nextTick(() => {
      input.value = digits
    })
  } else {
    input.value = digits
  }
  error.value = false
}

function submit() {
  const v = input.value.replace(/\D/g, '')
  if (v.length === 4 && isCorrect(v)) {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* 忽略持久化失败 */
    }
    visible.value = false
  } else {
    error.value = true
  }
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[3000] flex items-center justify-center bg-base">
    <!-- 遮罩底色用 base 而非 layout：浅色下 layout 与 card 同为纯白，卡片会看不出底色 -->
    <n-card class="w-80 shadow-md" bordered>
      <p class="mb-3 text-center font-semibold">请输入 4 位访问密码</p>
      <n-input
        :value="input"
        type="password"
        size="large"
        maxlength="4"
        placeholder="4 位数字"
        :input-props="{ inputmode: 'numeric', autocomplete: 'one-time-code' }"
        @update:value="onInput"
        @keydown.enter="submit"
      />
      <p v-show="error" class="mt-2 text-xs text-red-400">密码错误，请重试</p>
      <n-button type="primary" block size="large" class="mt-4" @click="submit">进入</n-button>
    </n-card>
  </div>
</template>
