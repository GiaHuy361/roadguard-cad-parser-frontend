import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForDebuggerUrl(port, timeoutMs = 12000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (res.ok) {
        const pages = await res.json()
        const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl)
        if (page) return page.webSocketDebuggerUrl
      }
    } catch {
      // retry
    }
    await sleep(200)
  }
  throw new Error(`Timed out waiting for Chrome DevTools Protocol on port ${port}`)
}

export async function withCdpPage(port, url, fn) {
  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`Chrome executable not found at: ${CHROME_PATH}`)
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-cdp-'))
  const proc = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1920,1080',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      url,
    ],
    { stdio: 'ignore' }
  )

  try {
    const wsUrl = await waitForDebuggerUrl(port)
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })

    let msgId = 1
    const pending = new Map()
    const consoleErrors = []

    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data)
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id)
        pending.delete(data.id)
        if (data.error) reject(new Error(data.error.message))
        else resolve(data.result)
      } else if (data.method === 'Runtime.exceptionThrown') {
        const ed = data.params?.exceptionDetails
        consoleErrors.push(
          ed?.exception?.description || ed?.text || JSON.stringify(ed)
        )
      } else if (data.method === 'Runtime.consoleAPICalled' && data.params?.type === 'error') {
        const args = (data.params.args || []).map((a) => a.value || a.description || '').join(' ')
        consoleErrors.push(args)
      }
    })

    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = msgId++
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('DOM.enable')

    const setViewport = async (width, height) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 768,
      })
      await sleep(400)
    }

    const screenshot = async (outPath) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'))
    }

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      return res?.result?.value
    }

    const uploadFile = async (selector, filePath) => {
      const { root } = await send('DOM.getDocument')
      const { nodeId } = await send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector,
      })
      if (!nodeId) throw new Error(`File input not found: ${selector}`)
      await send('DOM.setFileInputFiles', {
        nodeId,
        files: [filePath],
      })
    }

    await fn({ send, setViewport, screenshot, evaluate, uploadFile, consoleErrors, sleep })
    ws.close()
  } finally {
    proc.kill()
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}
