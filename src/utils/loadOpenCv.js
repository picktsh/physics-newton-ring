// OpenCV 按需加载（§5 第四版决策：public 静态脚本 + 业务按需触发）
// 注入 async 经典 script → 50ms 轮询 window.cv 检测下载执行完成 → 等 onRuntimeInitialized 确认 wasm 就绪。
// script error 时 reject 并移除节点；模块级 pending 保证并发/重试幂等。

let pending = null

export function loadOpenCv() {
  if (window.cv && window.cv.Mat) return Promise.resolve(window.cv)
  if (pending) return pending

  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.async = true
    script.src = `${import.meta.env.BASE_URL}opencv.js`
    let poll = null

    const cleanup = () => {
      if (poll) clearInterval(poll)
      poll = null
    }

    script.onerror = () => {
      cleanup()
      script.remove()
      pending = null // 允许重试
      reject(new Error('opencv.js 加载失败'))
    }

    script.onload = () => {
      poll = setInterval(() => {
        const cv = window.cv
        if (!cv) return
        cleanup()
        if (cv.Mat) {
          resolve(cv) // wasm 已就绪
          return
        }
        const prev = cv.onRuntimeInitialized
        cv.onRuntimeInitialized = () => {
          if (typeof prev === 'function') prev()
          resolve(window.cv)
        }
      }, 50)
    }

    document.head.appendChild(script)
  })

  return pending
}
