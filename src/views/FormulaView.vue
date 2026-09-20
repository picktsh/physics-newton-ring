<script setup>
import { NCard, NAlert, NTag } from 'naive-ui'
import KatexFormula from '@/components/KatexFormula.vue'
import { LAMBDA, INSTRUMENT_ERROR } from '@/utils/constants'

// 「公式原理」静态速查页：汇总本网站涉及的物理公式、推导关系与常量速查表。
// 与结果页（ResultTables 渲染实测数值）解耦——这里只放静态原理，数值口径仍从 constants 引入以保持一致。

// 速查常量（与计算层同源）
const lambdaNM = (LAMBDA * 1e9).toFixed(1) // 钠光波长 (nm)
const lambdaSci = '5.893 \\times 10^{-7}' // 波长科学计数 (m) 的 LaTeX 片段
const deltaMM = INSTRUMENT_ERROR // 示值误差限 (mm)

// 一、测量原理：牛顿环暗环
const fDarkRadius = 'r_k^2 = k\\lambda R \\;\\Rightarrow\\; r_k = \\sqrt{k\\lambda R}'
const fDarkDiameter = 'D_k = 2r_k = 2\\sqrt{k\\lambda R}'
const fRingDiff = 'D_m^2 - D_n^2 = 4(m-n)\\lambda R'

// 二、逐差法求曲率半径
const fRadius = 'R = \\dfrac{D_m^2 - D_n^2}{4(m-n)\\lambda}'
const fRadiusUnit =
  'R\\,[\\text{m}] = \\dfrac{\\left(D_m^2 - D_n^2\\right)[\\text{mm}^2]\\times 10^{-6}}{4(m-n)\\,\\lambda\\,[\\text{m}]}'

// 三、像素 → 毫米换算（标定）
const fPixel = 'D\\,[\\text{mm}] = D_{\\text{px}}\\,[\\text{px}] \\times S\\,[\\text{mm/px}]'

// 四、不确定度五步评定（A 类 + B 类）
const fStep1 = 'u_B(x) = \\dfrac{\\Delta}{k}'
const fStep2 = 'u_B(D) = \\sqrt{2}\\,u_B(x) = \\sqrt{2}\\,\\dfrac{\\Delta}{k}'
const fStep3 = '\\dfrac{u_B(R)}{R} = \\dfrac{2\\,u_B(D)}{D_m^2 - D_n^2}\\sqrt{D_m^2 + D_n^2}'
const fStep4a = 's = \\sqrt{\\dfrac{\\sum_i (R_i - \\bar{R})^2}{k-1}}'
const fStep4b =
  'u_A = \\dfrac{s}{\\sqrt{k}} = \\sqrt{\\dfrac{\\sum_i (R_i-\\bar{R})^2}{k(k-1)}},\\quad \\nu_A = k-1'
const fStep5a = 'u_C = \\sqrt{u_A^2 + u_B^2}'
const fStep5b = 'U = k\\,u_C'
const fFinal = 'R = (\\bar{R} \\pm U)\\ \\text{m},\\qquad U_R = \\dfrac{U}{\\bar{R}}'
</script>

<template>
  <div class="flex flex-col gap-4">
    <n-alert :bordered="false" type="info" title="本页用途">
      汇总牛顿环实验在本工具中用到的全部公式、推导关系与常量速查，供测量与数据处理时对照查阅。
      实测结果（含具体数值）请前往「识别 / 数据展示」页查看。
    </n-alert>

    <!-- 一、测量原理 -->
    <n-card :bordered="false" class="bg-card" size="small" title="一、测量原理 · 牛顿环暗环">
      <p class="mb-3 text-sm opacity-70">
        平凸透镜与平面玻璃间形成空气薄膜，反射光干涉产生同心暗环。第
        <span class="font-mono">k</span> 级暗环满足：
      </p>
      <KatexFormula :latex="fDarkRadius" block />
      <KatexFormula :latex="fDarkDiameter" block />
      <p class="mb-3 mt-4 text-sm opacity-70">
        为消除透镜与玻璃接触形变带来的系统误差，取相隔
        <span class="font-mono">m−n</span> 的两暗环直径平方作差：
      </p>
      <KatexFormula :latex="fRingDiff" block />
    </n-card>

    <!-- 二、逐差法 -->
    <n-card :bordered="false" class="bg-card" size="small" title="二、逐差法求曲率半径">
      <p class="mb-3 text-sm opacity-70">由上式解出透镜曲率半径：</p>
      <KatexFormula :latex="fRadius" block />
      <p class="mb-3 mt-4 text-sm opacity-70">
        本工具中直径以毫米 (mm) 计量、波长以米 (m) 计量，故计算时先作
        <span class="font-mono">mm² → m²</span>（乘
        <span class="font-mono">10⁻⁶</span>）的单位换算：
      </p>
      <KatexFormula :latex="fRadiusUnit" block />
    </n-card>

    <!-- 三、像素标定 -->
    <n-card :bordered="false" class="bg-card" size="small" title="三、像素 → 毫米换算（像素标定）">
      <p class="mb-3 text-sm opacity-70">
        图像中量得的暗环直径以像素计，经像素标定系数
        <span class="font-mono">S</span>（mm/像素，在「像素标定」页设定）换算为实际直径：
      </p>
      <KatexFormula :latex="fPixel" block />
    </n-card>

    <!-- 四、不确定度五步评定 -->
    <n-card
      :bordered="false"
      class="bg-card"
      size="small"
      title="四、不确定度五步评定（A 类 + B 类）"
    >
      <div class="flex flex-col gap-5">
        <section>
          <div class="mb-1 flex items-center gap-2">
            <n-tag size="small" type="info" :bordered="false" round>① 仪器示值误差限</n-tag>
            <span class="text-sm opacity-70">直径单次读数的 B 类分量（正态分布 p=0.95, k=2）</span>
          </div>
          <KatexFormula :latex="fStep1" block />
        </section>
        <section>
          <div class="mb-1 flex items-center gap-2">
            <n-tag size="small" type="info" :bordered="false" round>② 直径 B 类</n-tag>
            <span class="text-sm opacity-70">直径由左右两位置读数相减，合成 √2 倍</span>
          </div>
          <KatexFormula :latex="fStep2" block />
        </section>
        <section>
          <div class="mb-1 flex items-center gap-2">
            <n-tag size="small" type="info" :bordered="false" round>③ R 的 B 类相对不确定度</n-tag>
            <span class="text-sm opacity-70">对逐差法公式作误差传播</span>
          </div>
          <KatexFormula :latex="fStep3" block />
        </section>
        <section>
          <div class="mb-1 flex items-center gap-2">
            <n-tag size="small" type="success" :bordered="false" round>④ A 类不确定度</n-tag>
            <span class="text-sm opacity-70"
              >多组 R 的统计（实验标准差 s 与均值标准不确定度 u_A）</span
            >
          </div>
          <KatexFormula :latex="fStep4a" block />
          <KatexFormula :latex="fStep4b" block />
        </section>
        <section>
          <div class="mb-1 flex items-center gap-2">
            <n-tag size="small" type="warning" :bordered="false" round>⑤ 合成与扩展</n-tag>
            <span class="text-sm opacity-70">A、B 类方和根合成，再乘包含因子得扩展不确定度</span>
          </div>
          <KatexFormula :latex="fStep5a" block />
          <KatexFormula :latex="fStep5b" block />
        </section>
        <section>
          <div class="mb-1 flex items-center gap-2">
            <n-tag size="small" type="primary" :bordered="false" round>最终结果表达</n-tag>
          </div>
          <KatexFormula :latex="fFinal" block />
        </section>
      </div>
    </n-card>

    <!-- 五、常量与速查表 -->
    <n-card :bordered="false" class="bg-card" size="small" title="五、常量与速查表">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="bg-black/5">
              <th class="border border-gray-400/30 px-3 py-2 text-left">符号</th>
              <th class="border border-gray-400/30 px-3 py-2 text-left">含义</th>
              <th class="border border-gray-400/30 px-3 py-2 text-left">取值 / 说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="border border-gray-400/30 px-3 py-1.5">
                <KatexFormula latex="\lambda" />
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5">钠光波长</td>
              <td class="border border-gray-400/30 px-3 py-1.5">
                {{ lambdaNM }} nm = <KatexFormula :latex="`${lambdaSci}\\ \\text{m}`" />
              </td>
            </tr>
            <tr>
              <td class="border border-gray-400/30 px-3 py-1.5"><KatexFormula latex="\Delta" /></td>
              <td class="border border-gray-400/30 px-3 py-1.5">
                图像测量系统示值误差限 <KatexFormula latex="\boldsymbol{\Delta}" />
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5">{{ deltaMM }} mm</td>
            </tr>
            <tr>
              <td class="border border-gray-400/30 px-3 py-1.5"><KatexFormula latex="k" /></td>
              <td class="border border-gray-400/30 px-3 py-1.5">包含因子</td>
              <td class="border border-gray-400/30 px-3 py-1.5">2（正态分布，p = 0.95）</td>
            </tr>
            <tr>
              <td class="border border-gray-400/30 px-3 py-1.5">
                <KatexFormula latex="m-n" />
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5">逐差法环序差（步长）</td>
              <td class="border border-gray-400/30 px-3 py-1.5">默认 5，可在识别页调节</td>
            </tr>
            <tr>
              <td class="border border-gray-400/30 px-3 py-1.5"><KatexFormula latex="S" /></td>
              <td class="border border-gray-400/30 px-3 py-1.5">像素标定系数</td>
              <td class="border border-gray-400/30 px-3 py-1.5">mm / 像素，在「像素标定」页设定</td>
            </tr>
            <tr>
              <td class="border border-gray-400/30 px-3 py-1.5">
                <KatexFormula latex="1\\ \\text{mm}^2" />
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5">面积单位换算</td>
              <td class="border border-gray-400/30 px-3 py-1.5">
                = <KatexFormula latex="10^{-6}\\ \\text{m}^2" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="mt-4 text-sm opacity-70">
        <span class="font-semibold">有效数字与修约规则：</span>
        不确定度 U 一般保留 1 位有效数字，首位为 1 或 2 时保留 2 位，采用「只进不舍」； 平均值 R̄
        的末位与 U 对齐，修约采用「四舍六入五成双」。
      </p>
    </n-card>
  </div>
</template>
