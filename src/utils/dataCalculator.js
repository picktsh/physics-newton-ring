import { LAMBDA, INSTRUMENT_ERROR, COVERAGE_K } from './constants'

// 计算层（抽芯自旧 js/data-calculator.js，公式与阈值 1:1 保留，§11.5#4/#5）

// 环半径取值: 优先椭圆拟合的长短半轴均值 (亚像素, 精度高), 椭圆缺失/退化时回退 avgRadius。
export function ringRadius(ring) {
  const e = ring?.ellipse
  if (e && e.size && e.size.width > 0 && e.size.height > 0) {
    return (e.size.width + e.size.height) / 4
  }
  return ring?.avgRadius ?? 0
}

// 计算各暗环直径数据
export function calculateDiameterData(detectedRings, pixelScale) {
  if (!detectedRings || detectedRings.length === 0) {
    return []
  }
  return detectedRings.map((ring) => ({
    number: ring.number,
    diameterPixel: ringRadius(ring) * 2,
    diameterMM: ringRadius(ring) * 2 * pixelScale,
  }))
}

// 逐差法「平方差」列 (Dm²−Dn²) 应保留的小数位: 按误差传播定小数位。
export function squareDiffDecimals(Dm, Dn) {
  const maxD = Math.max(Math.abs(Dm), Math.abs(Dn))
  const p = 2 * maxD * 0.001 // 平方项绝对精度 (直径末位 0.001mm 传播)
  if (!isFinite(p) || p <= 0) return 3
  let exp = Math.floor(Math.log10(p)) // p = lead × 10^exp
  let lead = Math.round(p / Math.pow(10, exp))
  if (lead >= 10) {
    lead = 1
    exp += 1
  } // 修约到 1 位有效数字 (逢十进位跨数量级)
  return Math.max(0, -exp) // 末位所在小数位
}

// 有效数字计数: 先按 decimals 位小数修约表示, 去小数点与前导零后数位数 (含末尾零)
export function countSigFigs(num, decimals) {
  if (!isFinite(num) || num === 0) return 0
  const digits = Math.abs(num).toFixed(decimals).replace('.', '').replace(/^0+/, '')
  return digits.length
}

// 四舍六入五成双 (round-half-to-even): 修约到 decimals 位小数; <半舍去、>半进一、恰好半则末位取偶。
// 1e-9 容差吸收浮点噪声。均值 R̄ 为正, 无需处理负号方向。
export function roundHalfEven(x, decimals) {
  const f = Math.pow(10, decimals)
  const scaled = x * f
  const floor = Math.floor(scaled)
  const frac = scaled - floor
  let n
  if (Math.abs(frac - 0.5) < 1e-9)
    n = floor % 2 === 0 ? floor : floor + 1 // 五成双: 奇进偶舍
  else n = frac > 0.5 ? floor + 1 : floor // 四舍六入
  return (n / f).toFixed(decimals)
}

// 按有效数字修约并用四舍六入五成双格式化为普通小数字符串。
// 修约后若进位跨数量级 (如 9.9995→10.00) 则按新数量级重算一次, 保证恰好 sig 位有效数字。
export function formatSigFigsHalfEven(num, sig) {
  if (!isFinite(num) || num === 0 || sig <= 0) return '0'
  const d = Math.floor(Math.log10(Math.abs(num))) + 1 // 整数位数
  let decimals = Math.max(0, sig - d)
  let text = roundHalfEven(num, decimals)
  const d2 = Math.floor(Math.log10(Math.abs(Number(text)))) + 1
  if (d2 !== d) {
    // 进位跨位: 按新数量级重修约
    decimals = Math.max(0, sig - d2)
    text = roundHalfEven(num, decimals)
  }
  return text
}

// 动态生成分组配置 (步长可调，默认 5；无组数上限，§11.5#5)
function generateDynamicGroups(maxRingNumber, step = 5) {
  if (maxRingNumber < step + 1) {
    return []
  }
  const groups = []
  for (let m = maxRingNumber; m >= step + 1; m--) {
    const n = m - step
    if (n >= 1) {
      groups.push({ m, n })
    }
  }
  return groups
}

// 计算曲率半径 (逐差法，步长 m-n 可人工调节，默认 5)
export function calculateRadiusData(detectedRings, pixelScale, step = 5) {
  if (!detectedRings || detectedRings.length === 0) {
    return []
  }
  const results = []
  const sortedRings = [...detectedRings].sort((a, b) => b.avgRadius - a.avgRadius)
  // 人工可修改编号且去除环后保持原编号，分组范围以最大编号为准 (而非环数)
  const maxRingNumber = Math.max(...sortedRings.map((r) => r.number))
  const dynamicGroups = generateDynamicGroups(maxRingNumber, step)
  dynamicGroups.forEach((group) => {
    const ringM = detectedRings.find((r) => r.number === group.m)
    const ringN = detectedRings.find((r) => r.number === group.n)

    if (ringM && ringN) {
      const Dm = ringRadius(ringM) * 2 * pixelScale
      const Dn = ringRadius(ringN) * 2 * pixelScale
      // R = (Dm² - Dn²) / [4(m-n)λ]
      const diffSquared = Math.pow(Dm, 2) - Math.pow(Dn, 2)
      const R = (diffSquared * 1e-6) / (4 * (group.m - group.n) * LAMBDA)
      const diffSqDecimals = squareDiffDecimals(Dm, Dn)
      // 本组 R 有效数字 = 本组差值 (按显示修约值) 的有效数字; 减法会损失有效数字, 各组位数可不同。
      const radiusSigFigs = countSigFigs(diffSquared, diffSqDecimals)
      const radiusValid = diffSquared > 0 && isFinite(R) && R > 0 && radiusSigFigs > 0
      const radiusText = radiusValid ? formatSigFigsHalfEven(R, radiusSigFigs) : '—'
      const radiusRounded = radiusValid ? Number(radiusText) : R

      results.push({
        group: `D${group.m} 与 D${group.n}`,
        m: group.m,
        n: group.n,
        Dm,
        Dn,
        diffSquared,
        diffSqDecimals,
        diffSquaredText: roundHalfEven(diffSquared, diffSqDecimals),
        radius: R, // 全精度 (仅内部参考, 不显示)
        radiusSigFigs,
        radiusRounded, // 修约后数值: 供 R̄ 与不确定度统计使用
        radiusText, // 修约后字符串: 表2 与 CSV 显示
      })
    }
  })

  return results
}

// 计算平均曲率半径 (用各组修约后的 R, 与表2 显示值一致)
export function calculateAverageRadius(radiusData) {
  if (!radiusData || radiusData.length === 0) {
    return 0
  }
  const total = radiusData.reduce((sum, item) => sum + (item.radiusRounded ?? item.radius), 0)
  return total / radiusData.length
}

// 生成完整的计算结果对象
export function generateCalculationResults(
  diameterData,
  radiusData,
  averageRadius,
  pixelScale,
  uncertainty = null,
) {
  if (!diameterData || diameterData.length === 0) {
    return null
  }
  return {
    diameterData,
    radiusData,
    averageR: averageRadius,
    pixelScale,
    uncertainty,
    timestamp: new Date().toLocaleString('zh-CN'),
  }
}

// 不确定度修约: 一般保留 1 位有效数字, 首位为 1 或 2 时保留 2 位; 采用"只进不舍"(逢余即入)。
// 返回 { text, decimals }: decimals 供均值 R̄ 四舍六入五成双对齐 U 末位。
function sigU(x) {
  if (!isFinite(x) || x === 0) return { text: '0', decimals: 0 }
  const ax = Math.abs(x)
  const exp = Math.floor(Math.log10(ax))
  const lead = Math.floor(ax / Math.pow(10, exp) + 1e-9) // 首位有效数字 (+1e-9 防浮点噪声)
  const sig = lead === 1 || lead === 2 ? 2 : 1
  const q = Math.pow(10, exp - (sig - 1)) // 修约量子
  const r = Math.ceil(ax / q - 1e-9) * q // 只进不舍 (-1e-9 噪声容差)
  const expR = r > 0 ? Math.floor(Math.log10(r)) : exp
  const decimals = Math.max(0, sig - 1 - expR)
  return { text: r.toFixed(decimals), decimals }
}

// 计算平均曲率半径的不确定度 (五步评定): B类(仪器) → B类相对 → A类(多组) → 合成 → 扩展
export function calculateRadiusUncertainty(radiusData, averageRadius) {
  const k = radiusData?.length || 0
  if (k === 0 || !(averageRadius > 0)) return null

  // 1. 直径 D 的 B 类: 单次示值误差限 Δ 按正态 p=0.95、k=2
  const uBx = INSTRUMENT_ERROR / COVERAGE_K
  const uBD = Math.sqrt(2) * uBx

  // 2. R 的 B 类相对不确定度 (逐组)
  const perGroup = radiusData
    .filter((it) => it.m - it.n > 0 && it.diffSquared > 0)
    .map((it) => {
      const Dm = it.Dm || 0
      const Dn = it.Dn || 0
      const rel = ((2 * uBD) / it.diffSquared) * Math.sqrt(Dm * Dm + Dn * Dn)
      return {
        group: it.group,
        m: it.m,
        n: it.n,
        Dm,
        Dn,
        diffSq: it.diffSquared,
        rel,
        uBR: (it.radiusRounded ?? it.radius) * rel,
      }
    })
  const uBRel = perGroup.length ? perGroup.reduce((a, g) => a + g.rel, 0) / perGroup.length : 0
  const uB = averageRadius * uBRel

  // 3. A 类不确定度: u_A(R̄) = [Σ(R_i−R̄)²/(k(k−1))], ν_A = k−1
  let s = 0
  let uA = 0
  let sumSqDev = 0
  let nuA = 0
  if (k >= 2) {
    sumSqDev = radiusData.reduce(
      (sum, it) => sum + Math.pow((it.radiusRounded ?? it.radius) - averageRadius, 2),
      0,
    )
    uA = Math.sqrt(sumSqDev / (k * (k - 1)))
    s = Math.sqrt(sumSqDev / (k - 1))
    nuA = k - 1
  }

  // 4. 合成标准不确定度
  const uC = Math.sqrt(uA * uA + uB * uB)

  // 5. 扩展不确定度 (p=0.95, k=2): U = k·u_C
  let nuEff = Infinity
  if (uA > 0 && uC > 0) nuEff = Math.pow(uC, 4) / (Math.pow(uA, 4) / nuA)
  const U = COVERAGE_K * uC
  const relative = averageRadius > 0 ? U / averageRadius : 0

  const uFmt = sigU(U)
  const decimals = uFmt.decimals
  return {
    valid: uC > 0 && isFinite(uC),
    k,
    mean: averageRadius,
    deltaInstrument: INSTRUMENT_ERROR,
    uBx,
    uBD,
    perGroup,
    uBRel,
    uB,
    s,
    sumSqDev,
    uA,
    nuA,
    uC,
    nuEff,
    U,
    relative,
    meanText: roundHalfEven(averageRadius, decimals),
    uText: uFmt.text,
    uAText: sigU(uA).text,
    uBText: sigU(uB).text,
    uCText: sigU(uC).text,
    uBxText: uBx.toFixed(6),
    uBDText: uBD.toFixed(6),
    nuEffText: isFinite(nuEff) ? nuEff.toFixed(1) : '∞',
    kText: String(COVERAGE_K),
    relativeText: `${sigU(relative * 100).text}%`,
  }
}
