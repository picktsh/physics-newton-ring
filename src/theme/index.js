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
  },
  light: {
    base: '#f5f6f8',
    card: '#ffffff',
    layout: '#ffffff',
    primary: '#2080f0',
    text: '#30343a',
    hover: '#eceef1',
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
  }
}
