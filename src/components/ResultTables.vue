<script setup>
import { computed } from 'vue'
import { NCard, NEmpty, NDescriptions, NDescriptionsItem, NStatistic, NTag } from 'naive-ui'
import KatexFormula from './KatexFormula.vue'

// 表1 / 表2 / 平均曲率半径 + 不确定度五步明细的共用展示组件。
// 数据页（JSON 回显）、导出页（预览）、识别页（结果区）三处复用，保证口径一致。
const props = defineProps({
  payload: { type: Object, default: null },
})

const has = computed(() => !!(props.payload && props.payload.diameterData?.length))
const u = computed(() => props.payload?.uncertainty)
const showU = computed(() => !!(u.value && u.value.valid))

// 把 1.818e-1 之类的科学计数法转成 KaTeX 的 ×10⁻¹ 规范写法
function sci(n) {
  if (n == null || !isFinite(n) || n === 0) return '0'
  const [mant, exp] = Number(n).toExponential(3).split('e')
  return `${mant}\\times10^{${parseInt(exp, 10)}}`
}

// 结果小结：R = (均值 ± 扩展不确定度) m
const resultLatex = computed(() =>
  u.value ? `R = (${u.value.meanText}\\,\\pm\\,${u.value.uText})\\ \\text{m}` : '',
)

// 五步评定的公式（数值来自 u，符号与结构以 LaTeX 排版）
const step1Latex = computed(() =>
  u.value ? `\\Delta = ${u.value.deltaInstrument}\\ \\text{mm}` : '',
)
const step2Latex = computed(() =>
  u.value ? `u_B(D) = \\sqrt{2}\\,\\Delta = ${u.value.uBDText}\\ \\text{mm}` : '',
)
const step3Latex = computed(() =>
  u.value
    ? `\\dfrac{u_B(R)}{R} = ${(u.value.uBRel * 100).toFixed(4)}\\%\\;\\Rightarrow\\; u_B = ${u.value.uBText}\\ \\text{m}`
    : '',
)
const step4Latex = computed(() =>
  u.value
    ? `s = ${sci(u.value.s)}\\ \\text{m},\\quad \\sum_i (R_i-\\bar{R})^2 = ${sci(u.value.sumSqDev)},\\quad \\nu_A = ${u.value.nuA}\\;\\Rightarrow\\; u_A = ${u.value.uAText}\\ \\text{m}`
    : '',
)
const step5Latex = computed(() =>
  u.value
    ? `u_C = \\sqrt{u_A^2+u_B^2} = ${u.value.uCText}\\ \\text{m},\\quad \\nu_{\\text{eff}} = ${u.value.nuEffText},\\quad U = k\\,u_C = ${u.value.uText}\\ \\text{m}\\ (k=${u.value.kText})`
    : '',
)
const finalLatex = computed(() =>
  u.value
    ? `R = (${u.value.meanText}\\,\\pm\\,${u.value.uText})\\ \\text{m},\\quad U_R = \\dfrac{U}{R} = ${u.value.relativeText.replace('%', '\\%')}`
    : '',
)
</script>

<template>
  <n-empty v-if="!has" description="暂无测量结果" class="py-10" />
  <div v-else class="flex flex-col gap-4">
    <!-- 结果小结 -->
    <n-card :bordered="false" class="bg-card" size="small">
      <div class="flex flex-wrap items-end gap-6">
        <n-statistic label="平均曲率半径 R̄" :value="(payload.averageR || 0).toFixed(3)">
          <template #suffix>m</template>
        </n-statistic>
        <n-statistic v-if="showU" label="测量结果 (p=0.683)">
          <span class="text-lg font-semibold">
            <KatexFormula :latex="resultLatex" />
          </span>
        </n-statistic>
        <n-statistic label="像素标定" :value="payload.pixelScale || '—'">
          <template #suffix>mm/像素</template>
        </n-statistic>
        <n-tag v-if="showU" type="info" :bordered="false" round>
          相对不确定度 U/R = {{ u.relativeText }}
        </n-tag>
      </div>
    </n-card>

    <!-- 表1：各暗环直径测量数据 -->
    <n-card :bordered="false" class="bg-card" size="small" title="表1 · 各暗环直径测量数据">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="bg-black/5">
              <th class="border border-gray-400/30 px-3 py-2">环编号 (k)</th>
              <th class="border border-gray-400/30 px-3 py-2">直径 (像素)</th>
              <th class="border border-gray-400/30 px-3 py-2">直径 (mm)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in payload.diameterData" :key="`d${it.number}`">
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">{{ it.number }}</td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">
                {{ it.diameterPixel.toFixed(2) }}
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">
                {{ it.diameterMM.toFixed(3) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </n-card>

    <!-- 表2：曲率半径计算结果（逐差法） -->
    <n-card :bordered="false" class="bg-card" size="small" title="表2 · 曲率半径计算结果（逐差法）">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="bg-black/5">
              <th class="border border-gray-400/30 px-3 py-2">分组</th>
              <th class="border border-gray-400/30 px-3 py-2">m</th>
              <th class="border border-gray-400/30 px-3 py-2">n</th>
              <th class="border border-gray-400/30 px-3 py-2">Dm²−Dn² (mm²)</th>
              <th class="border border-gray-400/30 px-3 py-2">曲率半径 R (m)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in payload.radiusData" :key="`r${i}`">
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">{{ it.group }}</td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">{{ it.m }}</td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">{{ it.n }}</td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">
                {{ it.diffSquaredText }}
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">{{ it.radiusText }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </n-card>

    <!-- 不确定度五步评定明细 -->
    <n-card
      v-if="showU"
      :bordered="false"
      class="bg-card"
      size="small"
      title="不确定度评定明细（A 类 + B 类，五步）"
    >
      <n-descriptions label-placement="left" bordered :column="1" size="small">
        <n-descriptions-item label="① 仪器示值误差限 Δ">
          <KatexFormula :latex="step1Latex" />
          <span class="ml-1 opacity-70">（正态分布 p=0.683, k=1）</span>
        </n-descriptions-item>
        <n-descriptions-item label="② 直径 B 类 u_B(D)">
          <KatexFormula :latex="step2Latex" />
        </n-descriptions-item>
        <n-descriptions-item label="③ R 的 B 类相对不确定度">
          <KatexFormula :latex="step3Latex" />
        </n-descriptions-item>
        <n-descriptions-item label="④ A 类不确定度 u_A">
          <KatexFormula :latex="step4Latex" />
        </n-descriptions-item>
        <n-descriptions-item label="⑤ 合成 u_C 与扩展 U">
          <KatexFormula :latex="step5Latex" />
        </n-descriptions-item>
        <n-descriptions-item label="最终结果">
          <KatexFormula :latex="finalLatex" />
        </n-descriptions-item>
      </n-descriptions>

      <!-- 逐组 B 类相对不确定度明细 -->
      <details v-if="u.perGroup?.length" class="mt-3 text-sm">
        <summary class="cursor-pointer opacity-70">展开逐组 B 类相对不确定度</summary>
        <div class="mt-2 overflow-x-auto">
          <table class="w-full border-collapse text-xs">
            <thead>
              <tr class="bg-black/5">
                <th class="border border-gray-400/30 px-2 py-1">分组</th>
                <th class="border border-gray-400/30 px-2 py-1">Dm (mm)</th>
                <th class="border border-gray-400/30 px-2 py-1">Dn (mm)</th>
                <th class="border border-gray-400/30 px-2 py-1">Dm²−Dn²</th>
                <th class="border border-gray-400/30 px-2 py-1">相对 u_B(R)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(g, i) in u.perGroup" :key="`pg${i}`">
                <td class="border border-gray-400/30 px-2 py-1 text-center">{{ g.group }}</td>
                <td class="border border-gray-400/30 px-2 py-1 text-center">
                  {{ g.Dm.toFixed(4) }}
                </td>
                <td class="border border-gray-400/30 px-2 py-1 text-center">
                  {{ g.Dn.toFixed(4) }}
                </td>
                <td class="border border-gray-400/30 px-2 py-1 text-center">
                  {{ g.diffSq.toFixed(4) }}
                </td>
                <td class="border border-gray-400/30 px-2 py-1 text-center">
                  {{ (g.rel * 100).toFixed(4) }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </n-card>
  </div>
</template>
