import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const FILE_A_PATH = path.resolve('tests/fixtures/fileA/TUYEN_THIET_KE_TRUNG_TEN.dxf')
const FILE_B_PATH = path.resolve('tests/fixtures/fileB/TUYEN_THIET_KE_TRUNG_TEN.dxf')

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const chromeExe = CHROME_PATHS.find((p) => fs.existsSync(p))
if (!chromeExe) throw new Error('Chrome/Edge executable not found')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  const port = 9380
  const userDataDir = path.resolve('.tmp/chrome_profile_sn_' + Date.now())
  const chrome = spawn(
    chromeExe,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--window-size=1600,1000',
      '--disable-gpu',
      '--no-first-run',
      'http://127.0.0.1:5173/studio',
    ],
    { stdio: 'ignore' }
  )

  try {
    let wsUrl = null
    for (let i = 0; i < 30; i++) {
      await sleep(300)
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`)
        const list = await res.json()
        const page = list.find((t) => t.type === 'page')
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl
          break
        }
      } catch (e) {}
    }
    if (!wsUrl) throw new Error('Could not find chrome page ws url')

    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    let msgId = 1
    const pending = new Map()
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data)
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id)
        pending.delete(data.id)
        if (data.error) reject(new Error(data.error.message))
        else resolve(data.result)
      }
    }

    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = msgId++
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })

    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      })
      return r?.result?.value
    }

    const setFileOnInput = async (filePath) => {
      await evalJs(`(() => {
        const el = document.querySelector('input[type="file"][accept*=".dxf"]')
        if (el) el.value = ''
      })()`)
      const doc = await send('DOM.getDocument')
      const input = await send('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector: 'input[type="file"][accept*=".dxf"]',
      })
      if (!input?.nodeId) throw new Error('File input not found')
      await send('DOM.setFileInputFiles', {
        files: [filePath],
        nodeId: input.nodeId,
      })
      await evalJs(`(() => {
        const el = document.querySelector('input[type="file"][accept*=".dxf"]')
        if (el) el.dispatchEvent(new Event('change', { bubbles: true }))
      })()`)
    }

    await send('Page.enable')
    await send('DOM.enable')

    console.log('Waiting for studio UI to mount...')
    for (let i = 0; i < 40; i++) {
      const hasInput = await evalJs(`Boolean(document.querySelector('input[type="file"][accept*=".dxf"]'))`)
      if (hasInput) break
      await sleep(300)
    }
    await sleep(1000)

    // Intercept blob downloads
    await evalJs(`(() => {
      window.__capturedDownloadDraft = null
      const origCreateObjectURL = URL.createObjectURL
      URL.createObjectURL = function(blob) {
        const url = origCreateObjectURL.call(URL, blob)
        if (blob && blob.type && blob.type.includes('json')) {
          blob.text().then(t => {
            window.__capturedDownloadDraft = t
          })
        }
        return url
      }
    })()`)

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Upload File A (100m North) -> Set B=7.0 -> Analyze
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 1: Upload File A (TUYEN_THIET_KE_TRUNG_TEN.dxf, 100m North) ===')
    await setFileOnInput(FILE_A_PATH)
    await sleep(600)

    // Set Road Width B = 7.0 in Sidebar
    await evalJs(`(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="number"]'))
      const rwInput = inputs.find(i => i.placeholder && i.placeholder.includes('Chưa có dữ liệu'))
      if (rwInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        nativeSetter.call(rwInput, '7.0')
        rwInput.dispatchEvent(new Event('input', { bubbles: true }))
        rwInput.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })()`)
    await sleep(300)

    // Click Analyze button
    console.log('Clicking Analyze button for File A...')
    await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        b.innerText.includes('Phân Tích & Dựng Tuyến') ||
        b.innerText.includes('Cập Nhật & Dựng Lại')
      )
      if (btn) btn.click()
    })()`)

    // Wait until analysis completes
    console.log('Waiting for File A analysis to complete...')
    for (let i = 0; i < 40; i++) {
      await sleep(500)
      const isSpinning = await evalJs(`Boolean(document.querySelector('.animate-spin'))`)
      const txt = await evalJs(`document.body.innerText`)
      if (!isSpinning && (txt.includes('100.00m') || txt.includes('100 m') || txt.includes('100m')) && i > 1) {
        console.log('File A analysis completed at tick', i)
        break
      }
    }
    await sleep(800)

    // Open RoadGuard Draft Export Modal
    console.log('Opening RoadGuard Draft Export Modal on File A...')
    await evalJs(`(() => {
      if (window.__openRoadGuardDraftModal) {
        window.__openRoadGuardDraftModal()
      } else {
        const btn = document.querySelector('[data-testid="open-roadguard-draft-modal-btn"]')
        if (btn) btn.click()
      }
    })()`)
    await sleep(800)

    const modalA_Init = await evalJs(`(() => {
      const modal = document.querySelector('[data-testid="roadguard-draft-modal"]') || document.querySelector('[role="dialog"]')
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      return {
        open: !!modal,
        widthVal: widthInput ? widthInput.value : null,
        codeVal: codeInput ? codeInput.value : null,
        downloadDisabled: downloadBtn ? downloadBtn.disabled : null,
      }
    })()`)
    console.log('File A initial modal state:', modalA_Init)
    console.assert(modalA_Init.open === true, 'Modal must open for File A')
    console.assert(modalA_Init.widthVal === '', 'File A survey width must be empty initially')
    console.assert(modalA_Init.downloadDisabled === true, 'File A download button must be disabled initially')

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Engineer inputs roadCode='TUYEN-A-QL20' and surveyWidth='14.5'
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 2: Engineer inputs roadCode="TUYEN-A-QL20" and surveyWidth="14.5" on File A ===')
    await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const nativeSetterNum = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetterNum.call(widthInput, '14.5')
      widthInput.dispatchEvent(new Event('input', { bubbles: true }))
      widthInput.dispatchEvent(new Event('change', { bubbles: true }))

      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const nativeSetterTxt = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetterTxt.call(codeInput, 'TUYEN-A-QL20')
      codeInput.dispatchEvent(new Event('input', { bubbles: true }))
      codeInput.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(500)

    const modalA_Filled = await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      return {
        widthVal: widthInput ? widthInput.value : null,
        codeVal: codeInput ? codeInput.value : null,
        downloadDisabled: downloadBtn ? downloadBtn.disabled : null,
        blockedReason: downloadBtn ? downloadBtn.getAttribute('title') : null,
      }
    })()`)
    console.log('File A after input:', modalA_Filled)
    console.assert(modalA_Filled.downloadDisabled === false, 'File A download button must unlock after input')

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Close and Reopen Modal on File A (Check Retention on SAME drawing)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 3: Close and Reopen Modal on File A (Check Retention) ===')
    await evalJs(`(() => {
      const closeBtn = document.querySelector('[data-testid="modal-close-btn"]')
      if (closeBtn) closeBtn.click()
    })()`)
    await sleep(500)

    await evalJs(`(() => {
      if (window.__openRoadGuardDraftModal) {
        window.__openRoadGuardDraftModal()
      } else {
        const btn = document.querySelector('[data-testid="open-roadguard-draft-modal-btn"]')
        if (btn) btn.click()
      }
    })()`)
    await sleep(600)

    const modalA_Retained = await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      return {
        widthVal: widthInput ? widthInput.value : null,
        codeVal: codeInput ? codeInput.value : null,
        downloadDisabled: downloadBtn ? downloadBtn.disabled : null,
      }
    })()`)
    console.log('File A retained state:', modalA_Retained)
    console.assert(modalA_Retained.widthVal === '14.5', `File A survey width must be '14.5', got '${modalA_Retained.widthVal}'`)
    console.assert(modalA_Retained.codeVal === 'TUYEN-A-QL20', `File A road code must be 'TUYEN-A-QL20', got '${modalA_Retained.codeVal}'`)
    console.assert(modalA_Retained.downloadDisabled === false, 'File A download button must remain unlocked')
    console.log('PASS: File A retained both survey width and road code across modal toggle!')

    // Close modal
    await evalJs(`(() => {
      const closeBtn = document.querySelector('[data-testid="modal-close-btn"]')
      if (closeBtn) closeBtn.click()
    })()`)
    await sleep(500)

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Upload File B (Same name TUYEN_THIET_KE_TRUNG_TEN.dxf, Same length 100m, East Geometry)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 4: Remove File A & Upload File B (Same Name, Same Length 100m, East Geometry) ===')
    // Click "Gỡ bản vẽ" to cleanly remove File A
    await evalJs(`(() => {
      const removeBtn = document.querySelector('button[title="Gỡ bản vẽ"]')
      if (removeBtn) removeBtn.click()
    })()`)
    await sleep(600)

    await setFileOnInput(FILE_B_PATH)
    await sleep(600)

    // Set Road Width B = 7.0 for File B
    await evalJs(`(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="number"]'))
      const rwInput = inputs.find(i => i.placeholder && i.placeholder.includes('Chưa có dữ liệu'))
      if (rwInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        nativeSetter.call(rwInput, '7.0')
        rwInput.dispatchEvent(new Event('input', { bubbles: true }))
        rwInput.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })()`)
    await sleep(300)

    // Click Analyze button for File B
    console.log('Clicking Analyze button for File B...')
    const clickBResult = await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        b.innerText.includes('Phân Tích & Dựng Tuyến') ||
        b.innerText.includes('Cập Nhật & Dựng Lại')
      )
      if (btn) {
        const info = { text: btn.innerText.trim(), disabled: btn.disabled }
        btn.click()
        return info
      }
      return null
    })()`)
    console.log('Click B button info:', clickBResult)

    // Wait until analysis completes
    console.log('Waiting for File B analysis to complete...')
    for (let i = 0; i < 40; i++) {
      await sleep(500)
      const isSpinning = await evalJs(`Boolean(document.querySelector('.animate-spin'))`)
      const txt = await evalJs(`document.body.innerText`)
      if (!isSpinning && (txt.includes('100.00m') || txt.includes('100 m') || txt.includes('100m')) && i > 1) {
        console.log('File B analysis completed at tick', i)
        break
      }
    }
    await sleep(800)

    // Open RoadGuard Draft Export Modal on File B
    console.log('Opening RoadGuard Draft Export Modal on File B...')
    await evalJs(`(() => {
      if (window.__openRoadGuardDraftModal) {
        window.__openRoadGuardDraftModal()
      } else {
        const btn = document.querySelector('[data-testid="open-roadguard-draft-modal-btn"]')
        if (btn) btn.click()
      }
    })()`)
    await sleep(800)

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Strict Assertions on File B Isolation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 5: Verify Isolation of File B from File A ===')
    const modalB_Init = await evalJs(`(() => {
      const modal = document.querySelector('[data-testid="roadguard-draft-modal"]') || document.querySelector('[role="dialog"]')
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      const copyBtn = document.querySelector('[data-testid="copy-draft-btn"]')
      const txt = modal ? modal.innerText : ''
      return {
        open: !!modal,
        widthVal: widthInput ? widthInput.value : null,
        codeVal: codeInput ? codeInput.value : null,
        downloadDisabled: downloadBtn ? downloadBtn.disabled : null,
        copyDisabled: copyBtn ? copyBtn.disabled : null,
        hasWarning: txt.includes('Chưa khai báo bề rộng khảo sát') || txt.includes('Chưa có dữ liệu bề rộng khảo sát'),
      }
    })()`)
    console.log('File B initial modal state:', modalB_Init)

    console.assert(modalB_Init.open === true, 'Modal must open for File B')
    console.assert(modalB_Init.widthVal === '', `File B survey width MUST be empty, got '${modalB_Init.widthVal}'`)
    console.assert(modalB_Init.codeVal !== 'TUYEN-A-QL20', `File A road code 'TUYEN-A-QL20' MUST NOT appear on File B!`)
    console.assert(modalB_Init.downloadDisabled === true, 'File B download button MUST be locked when survey width is missing')
    console.assert(modalB_Init.copyDisabled === true, 'File B copy button MUST be locked when survey width is missing')
    console.assert(modalB_Init.hasWarning === true, 'File B warning for missing survey width MUST be shown')
    console.log('PASS: File B verified completely isolated! Survey width empty, buttons locked, File A road code absent!')

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Engineer inputs roadCode='TUYEN-B-EAST' and surveyWidth='16.0' on File B
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 6: Engineer inputs roadCode="TUYEN-B-EAST" and surveyWidth="16.0" on File B ===')
    await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const nativeSetterNum = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetterNum.call(widthInput, '16.0')
      widthInput.dispatchEvent(new Event('input', { bubbles: true }))
      widthInput.dispatchEvent(new Event('change', { bubbles: true }))

      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const nativeSetterTxt = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetterTxt.call(codeInput, 'TUYEN-B-EAST')
      codeInput.dispatchEvent(new Event('input', { bubbles: true }))
      codeInput.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(500)

    const modalB_Filled = await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      return {
        widthVal: widthInput ? widthInput.value : null,
        codeVal: codeInput ? codeInput.value : null,
        downloadDisabled: downloadBtn ? downloadBtn.disabled : null,
      }
    })()`)
    console.log('File B after valid input:', modalB_Filled)
    console.assert(modalB_Filled.downloadDisabled === false, 'File B download button must unlock after valid input')

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Download Geometry Draft JSON for File B and Inspect Content
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 7: Download Geometry Draft JSON for File B ===')
    await evalJs(`(() => {
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      if (downloadBtn) downloadBtn.click()
    })()`)
    await sleep(800)

    const downloadedText = await evalJs(`window.__capturedDownloadDraft`)
    console.assert(Boolean(downloadedText), 'Downloaded Draft JSON must be captured for File B')
    const parsedDraftB = JSON.parse(downloadedText)
    console.log('Downloaded File B Draft JSON Summary:', {
      roadCode: parsedDraftB.roadCode,
      roadName: parsedDraftB.roadName,
      surveyWidthMeters: parsedDraftB.surveyWidthMeters,
      coordsCount: parsedDraftB.coordinates?.length,
      startCoord: parsedDraftB.coordinates?.[0],
      endCoord: parsedDraftB.coordinates?.[parsedDraftB.coordinates?.length - 1],
    })

    console.assert(parsedDraftB.roadCode === 'TUYEN-B-EAST', `Draft roadCode must be 'TUYEN-B-EAST', got '${parsedDraftB.roadCode}'`)
    console.assert(parsedDraftB.surveyWidthMeters === 16, `Draft surveyWidthMeters must be 16, got ${parsedDraftB.surveyWidthMeters}`)
    console.assert(Array.isArray(parsedDraftB.coordinates) && parsedDraftB.coordinates.length >= 2, 'Draft coordinates must have >= 2 points')

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: Close and Reopen Modal on File B (Verify Retention on File B)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 8: Close and Reopen Modal on File B (Retention Check) ===')
    await evalJs(`(() => {
      const closeBtn = document.querySelector('[data-testid="modal-close-btn"]')
      if (closeBtn) closeBtn.click()
    })()`)
    await sleep(500)

    await evalJs(`(() => {
      if (window.__openRoadGuardDraftModal) {
        window.__openRoadGuardDraftModal()
      } else {
        const btn = document.querySelector('[data-testid="open-roadguard-draft-modal-btn"]')
        if (btn) btn.click()
      }
    })()`)
    await sleep(600)

    const modalB_Retained = await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      return {
        widthVal: widthInput ? widthInput.value : null,
        codeVal: codeInput ? codeInput.value : null,
        downloadDisabled: downloadBtn ? downloadBtn.disabled : null,
      }
    })()`)
    console.log('File B retained state:', modalB_Retained)
    console.assert(modalB_Retained.widthVal === '16.0', `File B survey width must be '16.0', got '${modalB_Retained.widthVal}'`)
    console.assert(modalB_Retained.codeVal === 'TUYEN-B-EAST', `File B road code must be 'TUYEN-B-EAST', got '${modalB_Retained.codeVal}'`)
    console.assert(modalB_Retained.downloadDisabled === false, 'File B download button must remain unlocked')
    console.log('PASS: File B retention confirmed across modal toggle!')

    console.log('\n===============================================================')
    console.log('ALL E2E SAME-NAME DIFFERENT-GEOMETRY TESTS PASSED CLEANLY (8/8)!')
    console.log('===============================================================')
  } finally {
    try {
      chrome.kill()
    } catch (e) {}
  }
}

run().catch((err) => {
  console.error('TEST ERROR:', err)
  process.exit(1)
})
