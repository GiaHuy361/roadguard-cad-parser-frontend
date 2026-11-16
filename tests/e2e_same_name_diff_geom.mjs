import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import assert from 'node:assert/strict'

const FILE_A_PATH = path.resolve('tests/fixtures/fileA/TUYEN_THIET_KE_TRUNG_TEN.dxf')
const FILE_B_PATH = path.resolve('tests/fixtures/fileB/TUYEN_THIET_KE_TRUNG_TEN.dxf')
const MULTI_TIM_DXF_PATH = path.resolve('tests/fixtures/DXF_2_TIM_TRUNG_TEN.dxf')

assert.ok(fs.existsSync(FILE_A_PATH), 'File A must exist')
assert.ok(fs.existsSync(FILE_B_PATH), 'File B must exist')
assert.ok(fs.existsSync(MULTI_TIM_DXF_PATH), 'Multi-tim DXF fixture must exist')

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const chromeExe = CHROME_PATHS.find((p) => fs.existsSync(p))
if (!chromeExe) throw new Error('Chrome/Edge executable not found')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  const port = 9395
  const userDataDir = path.join(os.tmpdir(), 'chrome_profile_e2e_' + Date.now())
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

    // =========================================================================
    // SUITE 1: TWO DXF FILES WITH THE SAME NAME BUT DIFFERENT GEOMETRY
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 1: TWO DXF FILES WITH SAME NAME & LENGTH, DIFFERENT GEOM')
    console.log('===============================================================')

    // STEP 1: Upload File A (100m North) -> Set B=7.0 -> Analyze
    console.log('\n=== STEP 1.1: Upload File A (TUYEN_THIET_KE_TRUNG_TEN.dxf, 100m North) ===')
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
    await evalJs(`window.__openRoadGuardDraftModal()`)
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
    assert.strictEqual(modalA_Init.open, true, 'Modal must open for File A')
    assert.strictEqual(modalA_Init.widthVal, '', 'File A survey width must be empty initially')
    assert.strictEqual(modalA_Init.downloadDisabled, true, 'File A download button must be disabled initially')

    // STEP 2: Engineer inputs roadCode='TUYEN-A-QL20' and surveyWidth='14.5'
    console.log('\n=== STEP 1.2: Engineer inputs roadCode="TUYEN-A-QL20" and surveyWidth="14.5" on File A ===')
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
    assert.strictEqual(modalA_Filled.downloadDisabled, false, 'File A download button must unlock after input')

    // STEP 3: Close and Reopen Modal on File A (Check Retention)
    console.log('\n=== STEP 1.3: Close and Reopen Modal on File A (Check Retention) ===')
    await evalJs(`document.querySelector('[data-testid="modal-close-btn"]')?.click()`)
    await sleep(500)
    await evalJs(`window.__openRoadGuardDraftModal()`)
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
    assert.strictEqual(modalA_Retained.widthVal, '14.5', `File A survey width must be '14.5'`)
    assert.strictEqual(modalA_Retained.codeVal, 'TUYEN-A-QL20', `File A road code must be 'TUYEN-A-QL20'`)
    assert.strictEqual(modalA_Retained.downloadDisabled, false, 'File A download button must remain unlocked')
    await evalJs(`document.querySelector('[data-testid="modal-close-btn"]')?.click()`)
    await sleep(500)

    // STEP 4: Remove File A & Upload File B (Same Name, Same Length 100m, East Geometry)
    console.log('\n=== STEP 1.4: Remove File A & Upload File B ===')
    await evalJs(`document.querySelector('button[title="Gỡ bản vẽ"]')?.click()`)
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
    await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        b.innerText.includes('Phân Tích & Dựng Tuyến') ||
        b.innerText.includes('Cập Nhật & Dựng Lại')
      )
      if (btn) btn.click()
    })()`)

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

    // Open Modal on File B
    console.log('Opening RoadGuard Draft Export Modal on File B...')
    await evalJs(`window.__openRoadGuardDraftModal()`)
    await sleep(800)

    // STEP 5: Strict Assertions on File B Isolation
    console.log('\n=== STEP 1.5: Verify Isolation of File B from File A ===')
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
    assert.strictEqual(modalB_Init.open, true, 'Modal must open for File B')
    assert.strictEqual(modalB_Init.widthVal, '', 'File B survey width MUST be empty')
    assert.notStrictEqual(modalB_Init.codeVal, 'TUYEN-A-QL20', 'File A road code MUST NOT appear on File B')
    assert.strictEqual(modalB_Init.downloadDisabled, true, 'File B download button MUST be locked')
    assert.strictEqual(modalB_Init.copyDisabled, true, 'File B copy button MUST be locked')
    assert.strictEqual(modalB_Init.hasWarning, true, 'File B warning for missing survey width MUST be shown')

    // STEP 6: Engineer inputs roadCode='TUYEN-B-EAST' and surveyWidth='16.0' on File B
    console.log('\n=== STEP 1.6: Engineer inputs roadCode="TUYEN-B-EAST" and surveyWidth="16.0" on File B ===')
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
    assert.strictEqual(modalB_Filled.downloadDisabled, false, 'File B download button must unlock after valid input')

    // STEP 7: Download Geometry Draft JSON for File B
    console.log('\n=== STEP 1.7: Download Geometry Draft JSON for File B ===')
    await evalJs(`(() => {
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      if (downloadBtn) downloadBtn.click()
    })()`)
    await sleep(800)

    const downloadedTextB = await evalJs(`window.__capturedDownloadDraft`)
    assert.ok(downloadedTextB, 'Downloaded Draft JSON must be captured for File B')
    const parsedDraftB = JSON.parse(downloadedTextB)
    console.log('Downloaded File B Draft JSON Summary:', {
      roadCode: parsedDraftB.roadCode,
      roadName: parsedDraftB.roadName,
      surveyWidthMeters: parsedDraftB.surveyWidthMeters,
      coordsCount: parsedDraftB.coordinates?.length,
      startCoord: parsedDraftB.coordinates?.[0],
      endCoord: parsedDraftB.coordinates?.[parsedDraftB.coordinates?.length - 1],
    })
    assert.strictEqual(parsedDraftB.roadCode, 'TUYEN-B-EAST')
    assert.strictEqual(parsedDraftB.surveyWidthMeters, 16)
    assert.ok(Array.isArray(parsedDraftB.coordinates) && parsedDraftB.coordinates.length >= 2)

    // STEP 8: Close and Reopen Modal on File B (Verify Retention on File B)
    console.log('\n=== STEP 1.8: Close and Reopen Modal on File B (Retention Check) ===')
    await evalJs(`document.querySelector('[data-testid="modal-close-btn"]')?.click()`)
    await sleep(500)
    await evalJs(`window.__openRoadGuardDraftModal()`)
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
    assert.strictEqual(modalB_Retained.widthVal, '16.0')
    assert.strictEqual(modalB_Retained.codeVal, 'TUYEN-B-EAST')
    assert.strictEqual(modalB_Retained.downloadDisabled, false)
    await evalJs(`document.querySelector('[data-testid="modal-close-btn"]')?.click()`)
    await sleep(500)

    // =========================================================================
    // SUITE 2: ONE DXF WITH TWO CENTERLINES SHARING SAME NAME / LAYER
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 2: SINGLE DXF WITH TWO CENTERLINES (SAME NAME/LAYER)')
    console.log('===============================================================')

    // STEP 2.1: Remove previous drawing and load multi-centerline DXF
    console.log('\n=== STEP 2.1: Upload DXF_2_TIM_TRUNG_TEN.dxf ===')
    await evalJs(`document.querySelector('button[title="Gỡ bản vẽ"]')?.click()`)
    await sleep(600)
    await setFileOnInput(MULTI_TIM_DXF_PATH)
    await sleep(600)

    // Set Road Width B = 7.0
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
    console.log('Clicking Analyze button for Multi-Tim DXF...')
    await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        b.innerText.includes('Phân Tích & Dựng Tuyến') ||
        b.innerText.includes('Cập Nhật & Dựng Lại')
      )
      if (btn) btn.click()
    })()`)

    for (let i = 0; i < 40; i++) {
      await sleep(500)
      const isSpinning = await evalJs(`Boolean(document.querySelector('.animate-spin'))`)
      const txt = await evalJs(`document.body.innerText`)
      if (!isSpinning && (txt.includes('100.00m') || txt.includes('110.00m') || txt.includes('160.00m')) && i > 1) {
        console.log('Multi-tim DXF analysis completed at tick', i)
        break
      }
    }
    await sleep(800)

    // Open Modal
    console.log('Opening RoadGuard Draft Export Modal on Multi-Tim DXF...')
    await evalJs(`window.__openRoadGuardDraftModal()`)
    await sleep(800)

    // Check centerline select has 2 centerlines
    const selectInfo = await evalJs(`(() => {
      const select = document.querySelector('[data-testid="centerline-feature-select"]')
      if (!select) return null
      return {
        optionsCount: select.options.length,
        selectedIndex: select.selectedIndex,
        optionsText: Array.from(select.options).map(o => o.text)
      }
    })()`)
    console.log('Centerline select info:', selectInfo)
    assert.ok(selectInfo, 'Centerline select must be rendered for multi-centerline DXF')
    assert.strictEqual(selectInfo.optionsCount, 2, 'Must have exactly 2 selectable centerlines')

    // STEP 2.2: Input surveyWidth and roadCode on Tim A (idx 0)
    console.log('\n=== STEP 2.2: Input on Tim A (idx 0): roadCode="TIM-A-CHINH", surveyWidth="14.0" ===')
    const timA_Init = await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      return {
        widthVal: widthInput?.value,
        codeVal: codeInput?.value,
        downloadDisabled: downloadBtn?.disabled
      }
    })()`)
    console.log('Tim A initial modal state:', timA_Init)
    assert.strictEqual(timA_Init.widthVal, '', 'Tim A survey width must be empty initially')
    assert.strictEqual(timA_Init.downloadDisabled, true, 'Tim A download must be locked initially')

    await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const nativeSetterNum = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetterNum.call(widthInput, '14.0')
      widthInput.dispatchEvent(new Event('input', { bubbles: true }))
      widthInput.dispatchEvent(new Event('change', { bubbles: true }))

      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const nativeSetterTxt = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetterTxt.call(codeInput, 'TIM-A-CHINH')
      codeInput.dispatchEvent(new Event('input', { bubbles: true }))
      codeInput.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(400)

    const timA_Filled = await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      return {
        widthVal: widthInput?.value,
        codeVal: codeInput?.value,
        downloadDisabled: downloadBtn?.disabled
      }
    })()`)
    console.log('Tim A after input:', timA_Filled)
    assert.strictEqual(timA_Filled.widthVal, '14.0')
    assert.strictEqual(timA_Filled.codeVal, 'TIM-A-CHINH')
    assert.strictEqual(timA_Filled.downloadDisabled, false, 'Tim A download must unlock')

    // STEP 2.3: Switch to Tim B (idx 1) -> Verify Isolation from Tim A
    console.log('\n=== STEP 2.3: Switch to Tim B (idx 1) — Verify Isolation ===')
    await evalJs(`(() => {
      const select = document.querySelector('[data-testid="centerline-feature-select"]')
      const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      nativeSelectSetter.call(select, '1')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(600)

    const timB_Init = await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      const copyBtn = document.querySelector('[data-testid="copy-draft-btn"]')
      const modal = document.querySelector('[data-testid="roadguard-draft-modal"]')
      return {
        widthVal: widthInput?.value,
        codeVal: codeInput?.value,
        downloadDisabled: downloadBtn?.disabled,
        copyDisabled: copyBtn?.disabled,
        hasWarning: modal?.innerText.includes('Chưa khai báo bề rộng khảo sát') || modal?.innerText.includes('Chưa có dữ liệu bề rộng khảo sát')
      }
    })()`)
    console.log('Tim B state (must NOT inherit Tim A):', timB_Init)
    assert.strictEqual(timB_Init.widthVal, '', 'Tim B survey width MUST be empty, must NOT inherit Tim A')
    assert.notStrictEqual(timB_Init.codeVal, 'TIM-A-CHINH', 'Tim B road code must NOT inherit Tim A')
    assert.strictEqual(timB_Init.downloadDisabled, true, 'Tim B download MUST be locked')
    assert.strictEqual(timB_Init.copyDisabled, true, 'Tim B copy MUST be locked')
    assert.strictEqual(timB_Init.hasWarning, true, 'Tim B warning banner for missing survey width MUST be displayed')

    // STEP 2.4: Switch BACK to Tim A (idx 0) -> Verify Tim A Values Retained
    console.log('\n=== STEP 2.4: Switch back to Tim A (idx 0) — Verify Retention ===')
    await evalJs(`(() => {
      const select = document.querySelector('[data-testid="centerline-feature-select"]')
      const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      nativeSelectSetter.call(select, '0')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(600)

    const timA_Restored = await evalJs(`(() => {
      const widthInput = document.querySelector('[data-testid="survey-width-input"]')
      const codeInput = document.querySelector('[data-testid="road-code-input"]')
      const downloadBtn = document.querySelector('[data-testid="download-draft-btn"]')
      return {
        widthVal: widthInput?.value,
        codeVal: codeInput?.value,
        downloadDisabled: downloadBtn?.disabled
      }
    })()`)
    console.log('Tim A restored state:', timA_Restored)
    assert.strictEqual(timA_Restored.widthVal, '14.0', 'Tim A survey width must be preserved as 14.0')
    assert.strictEqual(timA_Restored.codeVal, 'TIM-A-CHINH', 'Tim A road code must be preserved as TIM-A-CHINH')
    assert.strictEqual(timA_Restored.downloadDisabled, false, 'Tim A download must remain unlocked')

    // STEP 2.5: Download Draft JSON for Tim A & Inspect Content
    console.log('\n=== STEP 2.5: Download Geometry Draft JSON for Tim A ===')
    await evalJs(`(() => {
      const btn = document.querySelector('[data-testid="download-draft-btn"]')
      if (btn) btn.click()
    })()`)
    await sleep(800)

    const draftTextTimA = await evalJs(`window.__capturedDownloadDraft`)
    assert.ok(draftTextTimA, 'Draft JSON for Tim A must be captured')
    const parsedDraftTimA = JSON.parse(draftTextTimA)
    console.log('Parsed Tim A Draft JSON:', {
      roadCode: parsedDraftTimA.roadCode,
      surveyWidthMeters: parsedDraftTimA.surveyWidthMeters,
      coordsCount: parsedDraftTimA.coordinates?.length,
      startCoord: parsedDraftTimA.coordinates?.[0],
      endCoord: parsedDraftTimA.coordinates?.[parsedDraftTimA.coordinates?.length - 1],
    })
    assert.strictEqual(parsedDraftTimA.roadCode, 'TIM-A-CHINH')
    assert.strictEqual(parsedDraftTimA.surveyWidthMeters, 14)
    assert.ok(Array.isArray(parsedDraftTimA.coordinates) && parsedDraftTimA.coordinates.length >= 2)

    console.log('\n===============================================================')
    console.log('ALL E2E SUITES PASSED CLEANLY WITH STRICT ASSERTIONS (100%)!')
    console.log('===============================================================')
  } finally {
    try {
      chrome.kill()
    } catch (e) {}
  }
}

run().catch((err) => {
  console.error('FATAL TEST ERROR:', err)
  process.exit(1)
})
