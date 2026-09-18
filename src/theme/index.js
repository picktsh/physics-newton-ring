// §3 视觉基线：单一色板来源。深色为默认，浅色为对照。
// CSS 变量（供 UnoCSS / 全局样式）与 Naive UI themeOverrides 均由此派生，避免色值两处维护。
export const palette = {
  dark: {
    base: '#101014',
    card: '#18181c',
    layout: '#0a0a0d',
    primary: '#2080f0',
    text: '#e6e6ea',
    hover: '#26262c',
    border: '#4b4b52',
  },
  light: {
    base: '#f5f6f8',
    card: '#ffffff',
    layout: '#ffffff',
    primary: '#2080f0',
    text: '#30343a',
    hover: '#eceef1',
    border: '#e0e0e6',
  },
}

// 写入 <html> 的 CSS 变量；UnoCSS 的 bg-base / bg-card / bg-layout / text-primary 等引用它们
export function cssVarsOf(mode) {
  const p = palette[mode] || palette.dark
  return {
    '--c-base': p.base,
    '--c-card': p.card,
    '--c-layout': p.layout,
    '--c-primary': p.primary,
    '--c-text': p.text,
  }
}

export function themeOverridesOf(mode) {
  const p = palette[mode] || palette.dark
  return {
    common: {
      primaryColor: p.primary,
      primaryColorHover: '#4098fc',
      primaryColorPressed: '#1060c9',
      primaryColorSuppl: '#4098fc',
      bodyColor: p.base,
      cardColor: p.card,
      modalColor: p.card,
      popoverColor: p.card,
      tableColor: p.card,
      inputColor: p.card,
      actionColor: p.card,
      hoverColor: p.hover,
      borderRadius: '8px',
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
    // 深色 Input 边框在 naive-ui 里设计为透明（靠半透明填充显形，见 naive-ui input/styles/dark）；
    // 本色板把 inputColor 覆盖为 card 后填充与底色同色，静止边框随之消失，故用 border 令牌补回可见边框。
    // hover/focus 仍走 naive 默认的 primary 蓝边；InputNumber/DatePicker 等复用 Input peer 主题，一并生效。
    // light 的 border 取值与 naive 浅色默认 borderColor 相同，视觉无变化，仅为双主题走同一条代码路径。
    Input: {
      border: `1px solid ${p.border}`,
      borderDisabled: `1px solid ${p.border}`,
    },
    // Layout 家族（n-layout / sider / header / footer）的色板按组件粒度覆盖，不靠原子类压层叠：
    // 默认 siderColor = cardColor（深色下比预期的 --c-layout 浅），侧栏需更暗的底；
    // headerColor = cardColor、color = bodyColor 已恰好等于我们的 card / base，无需覆盖。
    peers: {
      Layout: {
        siderColor: p.layout,
      },
    },
  }
}
