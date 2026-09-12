<script setup>
import { computed } from 'vue'
import { NCard, NEmpty, NDescriptions, NDescriptionsItem, NStatistic, NTag } from 'naive-ui'

// 表1 / 表2 / 平均曲率半径 + 不确定度五步明细的共用展示组件。
// 数据页（JSON 回显）、导出页（预览）、识别页（结果区）三处复用，保证口径一致。
const props = defineProps({
  payload: { type: Object, default: null },
})

const has = computed(() => !!(props.payload && props.payload.diameterData?.length))
const u = computed(() => props.payload?.uncertainty)
const showU = computed(() => !!(u.value && u.value.valid))
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
            R = ({{ u.meanText }} ± {{ u.uText }}) m
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
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">{{ it.diffSquaredText }}</td>
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
          {{ u.deltaInstrument }} mm（正态分布 p=0.683, k=1）
        </n-descriptions-item>
        <n-descriptions-item label="② 直径 B 类 u_B(D)">
          √2 · Δ = {{ u.uBDText }} mm
        </n-descriptions-item>
        <n-descriptions-item label="③ R 的 B 类相对不确定度">
          {{ (u.uBRel * 100).toFixed(4) }}% → u_B = {{ u.uBText }} m
        </n-descriptions-item>
        <n-descriptions-item label="④ A 类不确定度 u_A">
          s = {{ u.s ? u.s.toExponential(3) : '—' }} m，Σ(Rᵢ−R̄)² = {{ u.sumSqDev ? u.sumSqDev.toExponential(3) : '—' }}，
          ν_A = {{ u.nuA }} → u_A = {{ u.uAText }} m
        </n-descriptions-item>
        <n-descriptions-item label="⑤ 合成 u_C 与扩展 U">
          u_C = √(u_A²+u_B²) = {{ u.uCText }} m；ν_eff = {{ u.nuEffText }}；U = u_C = {{ u.uText }} m (k={{ u.kText }})
        </n-descriptions-item>
        <n-descriptions-item label="最终结果">
          R = ({{ u.meanText }} ± {{ u.uText }}) m，U/R = {{ u.relativeText }}
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
                <td class="border border-gray-400/30 px-2 py-1 text-center">{{ g.Dm.toFixed(4) }}</td>
                <td class="border border-gray-400/30 px-2 py-1 text-center">{{ g.Dn.toFixed(4) }}</td>
                <td class="border border-gray-400/30 px-2 py-1 text-center">{{ g.diffSq.toFixed(4) }}</td>
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
