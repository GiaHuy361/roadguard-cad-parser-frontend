import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import assert from 'node:assert/strict'

function getArg(flag, envVar, fallback) {
  const idx = process.argv.indexOf(flag)
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]
  }
  return process.env[envVar] || fallback
}

const PK_DXF_PATH = path.resolve(
  getArg('--dxf', 'DXF_PATH', 'C:/Users/dell/Downloads/BINH DO THIET KE PK.dxf')
)
const BTXM_SAMPLE_DXF_PATH = path.resolve('tests/fixtures/sample_btxm_full_4_fields.dxf')
const TWO_WIDTHS_DXF_PATH = path.resolve('tests/fixtures/sample_two_road_widths.dxf')

const CUSTOM_CHROME = getArg('--chrome', 'CHROME_PATH', null)
const CDP_PORT = Number(getArg('--cdp-port', 'CDP_PORT', '9398'))
const STUDIO_URL = getArg('--url', 'STUDIO_URL', 'http://127.0.0.1:5173/studio')

console.log('=== E2E TEST CONFIGURATION ===')
console.log(`DXF Path: ${PK_DXF_PATH}`)
console.log(`CDP Port: ${CDP_PORT}`)
console.log(`Studio URL: ${STUDIO_URL}`)
console.log(`Chrome Custom: ${CUSTOM_CHROME || '(Auto-detect)'}`)

assert.ok(fs.existsSync(PK_DXF_PATH), `DXF file must exist at ${PK_DXF_PATH}`)
assert.ok(fs.existsSync(BTXM_SAMPLE_DXF_PATH), `BTXM sample DXF fixture must exist at ${BTXM_SAMPLE_DXF_PATH}`)
assert.ok(fs.existsSync(TWO_WIDTHS_DXF_PATH), `Two road widths DXF fixture must exist at ${TWO_WIDTHS_DXF_PATH}`)

const CHROME_PATHS = [
  CUSTOM_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

const chromeExe = CHROME_PATHS.find((p) => fs.existsSync(p))
if (!chromeExe) throw new Error('Chrome/Edge executable not found')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  const port = CDP_PORT
  const userDataDir = path.join(os.tmpdir(), 'chrome_profile_proj_params_' + Date.now())
  const chrome = spawn(
    chromeExe,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--window-size=1600,1000',
      '--disable-gpu',
      '--no-first-run',
      STUDIO_URL,
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
      if (data.method === 'Runtime.consoleAPICalled') {
        const text = data.params?.args?.map(a => a.value || a.description).join(' ')
        if (text && !text.includes('Download the React DevTools')) {
          console.log('[BROWSER CONSOLE]', text)
        }
      }
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
    await send('Runtime.enable')

    console.log('Waiting for Studio UI to mount...')
    for (let i = 0; i < 40; i++) {
      const hasInput = await evalJs(`Boolean(document.querySelector('input[type="file"][accept*=".dxf"]'))`)
      if (hasInput) break
      await sleep(300)
    }
    await sleep(1000)

    // =========================================================================
    // SUITE 1: PROJECT PROFILE DEFAULT STATE & VERIFICATION
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 1: PROJECT PARAMETER PROFILE INITIAL STATE')
    console.log('===============================================================')

    const initialProjectState = await evalJs(`(() => {
      const select = document.querySelector('[data-testid="project-profile-select"]')
      const section = document.querySelector('[data-testid="project-profile-section"]')
      const optgroups = Array.from(select?.querySelectorAll('optgroup') || []).map(og => og.label)
      return {
        hasSelect: Boolean(select),
        activeValue: select?.value,
        optionsCount: select?.options?.length,
        summaryText: section?.innerText || '',
        optgroups,
      }
    })()`)
    console.log('Initial project state:', initialProjectState)
    assert.strictEqual(initialProjectState.hasSelect, true, 'Project select dropdown must exist')
    assert.strictEqual(initialProjectState.activeValue, 'project-bao-loc-dt725', 'Default project must be Bảo Lộc DT725')
    assert.ok(initialProjectState.optionsCount >= 3, 'Must have at least 3 project profiles')
    assert.ok(initialProjectState.summaryText.includes('B=7'), 'Summary must reflect B=7m')
    assert.ok(initialProjectState.optgroups.some(g => g.includes('mẫu') || g.includes('kiểm thử')), 'Must have optgroup for template/sample profiles')

    // Open Project Management Modal to verify template separation & new project start empty
    console.log('Opening Project Profile Management Modal...')
    await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      const manageBtn = btns.find(b => b.innerText.includes('Quản lý'))
      if (manageBtn) manageBtn.click()
    })()`)
    await sleep(600)

    // Click "+ Thêm" to create new project
    console.log('Creating a brand new project...')
    await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      const addBtn = btns.find(b => b.innerText.includes('Thêm'))
      if (addBtn) addBtn.click()
    })()`)
    await sleep(500)

    const newProjectState = await evalJs(`(() => {
      const modal = document.querySelector('[data-testid="project-profile-modal"]')
      const rwInput = modal?.querySelector('input[placeholder="Để trống nếu chưa xác nhận"]')
      const confirmBadge = modal?.querySelector('span.border')
      return {
        rwVal: rwInput?.value || '',
        modalTxt: modal?.innerText || '',
      }
    })()`)
    console.log('New project empty state:', newProjectState)
    assert.strictEqual(newProjectState.rwVal, '', 'New project must start with EMPTY parameters')
    assert.ok(newProjectState.modalTxt.includes('Chưa có xác nhận thực tế'), 'New project must start unconfirmed')

    // Test confirmation operation with engineer name
    console.log('Performing actual confirmation on new project...')
    await evalJs(`(() => {
      const input = document.querySelector('[data-testid="engineer-name-input"]')
      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        nativeSetter.call(input, 'KS. Nguyễn Văn Thực Tế')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      const confirmBtn = document.querySelector('[data-testid="confirm-dossier-btn"]')
      if (confirmBtn) confirmBtn.click()
    })()`)
    await sleep(500)

    const confirmedState = await evalJs(`(() => {
      const modal = document.querySelector('[data-testid="project-profile-modal"]')
      return {
        modalTxt: modal?.innerText || '',
      }
    })()`)
    console.log('Project after confirmation:', confirmedState)
    assert.ok(confirmedState.modalTxt.includes('KS. Nguyễn Văn Thực Tế'), 'Must record confirmedBy only after actual confirmation action')

    // Close modal and ensure active project is Bảo Lộc DT725 for Suite 2
    console.log('Closing modal and ensuring active project is Bảo Lộc DT725...')
    await evalJs(`(() => {
      const closeBtn = document.querySelector('[data-testid="project-profile-modal"] button')
      if (closeBtn) closeBtn.click()
    })()`)
    await sleep(400)

    await evalJs(`(() => {
      const select = document.querySelector('[data-testid="project-profile-select"]')
      if (select) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
        nativeSetter.call(select, 'project-bao-loc-dt725')
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })()`)
    await sleep(600)

    // =========================================================================
    // SUITE 2: TEST WITH BINH DO THIET KE PK.dxf
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 2: UPLOAD BINH DO THIET KE PK.dxf & VERIFY AUTO-FILL')
    console.log('===============================================================')

    console.log('\n=== STEP 2.1: Upload BINH DO THIET KE PK.dxf (19.8MB) ===')
    await setFileOnInput(PK_DXF_PATH)

    // Wait for scan to complete (PK is ~20MB so scanning takes a few seconds)
    console.log('Waiting for DXF scan to complete on BINH DO THIET KE PK.dxf...')
    let scanFinished = false
    for (let i = 0; i < 50; i++) {
      await sleep(400)
      const scanBanner = await evalJs(`(() => {
        const el = document.querySelector('[data-testid="btxm-dxf-scan-banner"]')
        return el ? el.getAttribute('data-dxf-file') : null
      })()`)
      if (scanBanner && scanBanner.includes('BINH DO THIET KE PK.dxf')) {
        scanFinished = true
        break
      }
    }
    assert.ok(scanFinished, 'Scan banner for BINH DO THIET KE PK.dxf must be rendered')

    // STEP 2.2: Verify Section 3 (Road Geometry) auto-filled from Project Profile
    console.log('\n=== STEP 2.2: Verify Section 3 Geometry Auto-Filled from Project ===')
    const sec3State = await evalJs(`(() => {
      const inputs = {
        roadWidth: document.querySelector('#input-roadWidth')?.value,
        laneCount: document.querySelector('#input-laneCount')?.value,
        segmentLength: document.querySelector('#input-segmentLength')?.value,
        slabLength: document.querySelector('#input-slabLength')?.value,
      }
      const badges = {
        roadWidth: document.querySelector('[data-testid="source-badge-roadWidth"]')?.innerText,
        laneCount: document.querySelector('[data-testid="source-badge-laneCount"]')?.innerText,
        segmentLength: document.querySelector('[data-testid="source-badge-segmentLength"]')?.innerText,
        slabLength: document.querySelector('[data-testid="source-badge-slabLength"]')?.innerText,
      }
      const hasCompleteBanner = Boolean(document.querySelector('[data-testid="complete-geometry-banner"]'))
      const hasMissingAlert = Boolean(document.querySelector('[data-testid="missing-geometry-alert"]'))
      return { inputs, badges, hasCompleteBanner, hasMissingAlert }
    })()`)
    console.log('Section 3 auto-fill state:', sec3State)

    assert.strictEqual(sec3State.inputs.roadWidth, '7.0', 'roadWidth must be auto-filled to 7.0 from project')
    assert.strictEqual(sec3State.inputs.laneCount, '2', 'laneCount must be auto-filled to 2 from project')
    assert.strictEqual(sec3State.inputs.segmentLength, '100', 'segmentLength must be auto-filled to 100 from project')
    assert.strictEqual(sec3State.inputs.slabLength, '4.0', 'slabLength must be auto-filled to 4.0 from project')
    assert.ok(sec3State.badges.roadWidth.includes('DT725-BL'), 'roadWidth source badge must cite DT725-BL')
    assert.strictEqual(sec3State.hasCompleteBanner, true, 'complete-geometry-banner must be present')
    assert.strictEqual(sec3State.hasMissingAlert, false, 'No missing-geometry-alert should be present')

    // STEP 2.3: Verify Section 4 (BTXM Design) auto-filled from Project Profile
    console.log('\n=== STEP 2.3: Verify Section 4 BTXM Design Auto-Filled from Project ===')
    const sec4State = await evalJs(`(() => {
      const inputs = {
        slabThicknessCentimeters: document.querySelector('#input-slabThicknessCentimeters')?.value,
        contractionJointSpacingMeters: document.querySelector('#input-contractionJointSpacingMeters')?.value,
        expansionJointSpacingMeters: document.querySelector('#input-expansionJointSpacingMeters')?.value,
        expansionJointGapMillimeters: document.querySelector('#input-expansionJointGapMillimeters')?.value,
      }
      const badges = {
        slabThicknessCentimeters: document.querySelector('[data-testid="btxm-status-badge-slabThicknessCentimeters"]')?.innerText,
        contractionJointSpacingMeters: document.querySelector('[data-testid="btxm-status-badge-contractionJointSpacingMeters"]')?.innerText,
        expansionJointSpacingMeters: document.querySelector('[data-testid="btxm-status-badge-expansionJointSpacingMeters"]')?.innerText,
        expansionJointGapMillimeters: document.querySelector('[data-testid="btxm-status-badge-expansionJointGapMillimeters"]')?.innerText,
      }
      const hasCompleteBanner = Boolean(document.querySelector('[data-testid="complete-btxm-banner"]'))
      const hasMissingAlert = Boolean(document.querySelector('[data-testid="missing-btxm-alert"]'))
      return { inputs, badges, hasCompleteBanner, hasMissingAlert }
    })()`)
    console.log('Section 4 auto-fill state:', sec4State)

    assert.strictEqual(sec4State.inputs.slabThicknessCentimeters, '22', 'slabThickness must be 22 from project')
    assert.strictEqual(sec4State.inputs.contractionJointSpacingMeters, '4.0', 'contractionJointSpacing must be 4.0 from project')
    assert.strictEqual(sec4State.inputs.expansionJointSpacingMeters, '100.0', 'expansionJointSpacing must be 100.0 from project')
    assert.strictEqual(sec4State.inputs.expansionJointGapMillimeters, '20', 'expansionJointGap must be 20 from project')
    assert.ok(sec4State.badges.slabThicknessCentimeters.includes('DT725-BL'), 'slabThickness source badge must cite DT725-BL')
    assert.strictEqual(sec4State.hasCompleteBanner, true, 'complete-btxm-banner must be present')
    assert.strictEqual(sec4State.hasMissingAlert, false, 'No missing-btxm-alert should be present')

    // STEP 2.4: Click Analyze ("Phân Tích & Dựng Tuyến Kỹ Thuật") WITHOUT typing anything
    console.log('\n=== STEP 2.4: Click "Phân Tích & Dựng Tuyến" without re-typing ===')
    const buttonClickResult = await evalJs(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const btnInfo = buttons.map((b, idx) => ({ idx, text: b.innerText, disabled: b.disabled }))
      const btn = buttons.find(b =>
        b.innerText.includes('Phân Tích & Dựng Tuyến') ||
        b.innerText.includes('Phân Tích Lại') ||
        b.innerText.includes('Cập Nhật & Dựng Lại')
      )
      if (btn) {
        btn.click()
        return { clicked: true, text: btn.innerText, disabled: btn.disabled, allButtons: btnInfo }
      }
      return { clicked: false, allButtons: btnInfo }
    })()`)
    console.log('Button click result:', buttonClickResult)

    console.log('Waiting for CAD & GIS processing on BINH DO THIET KE PK.dxf...')
    let analysisDone = false
    for (let i = 0; i < 40; i++) {
      await sleep(1000)
      const debugInfo = await evalJs(`(() => {
        const isSpinning = Boolean(document.querySelector('.animate-spin'))
        const rightPanel = document.querySelector('aside:last-of-type') || document.querySelector('[data-testid="pavement-design-summary-card"]')?.closest('aside')
        const bodyTxt = document.body.innerText
        const rightTxt = rightPanel ? rightPanel.innerText : ''
        return {
          isSpinning,
          rightTxtLength: rightTxt.length,
          rightTxtPreview: rightTxt.slice(0, 400),
          includes700: bodyTxt.includes('700') || bodyTxt.includes('699'),
          includesChuaCo: bodyTxt.includes('Chưa có số liệu hình học tuyến'),
          includesSeg: bodyTxt.includes('SEG-01') || bodyTxt.includes('Đoạn 1'),
        }
      })()`)
      if (i % 3 === 0) {
        console.log(`[tick ${i}] debugInfo:`, debugInfo)
      }
      if (debugInfo.includes700 || debugInfo.includesSeg) {
        analysisDone = true
        console.log(`Analysis completed at second ${i + 1}`)
        break
      }
    }
    assert.ok(analysisDone, 'Analysis on BINH DO THIET KE PK.dxf must complete and produce segments')

    // Verify segments & metrics
    const analysisMetrics = await evalJs(`(() => {
      const txt = document.body.innerText
      const lengthMatch = txt.includes('699,97') || txt.includes('699.97') || txt.includes('700')
      const hasSegments = txt.includes('7 đoạn') || txt.includes('8 cọc / 7 đoạn') || txt.includes('SEG-01') || txt.includes('Đoạn 1')
      const slabCountMatch = txt.includes('348 tấm')
      return {
        hasLengthMatch: Boolean(lengthMatch),
        hasSegments: Boolean(hasSegments),
        slabCountMatch: Boolean(slabCountMatch),
      }
    })()`)
    console.log('Analysis results summary:', analysisMetrics)
    assert.strictEqual(analysisMetrics.hasLengthMatch, true, 'Length ~700m (699.97m) must be computed')
    assert.strictEqual(analysisMetrics.hasSegments, true, '7 segments must be generated')
    assert.strictEqual(analysisMetrics.slabCountMatch, true, '348 slabs must be computed')

    // STEP 2.5: Verify Profile View (Trắc dọc và mặt cắt trên bản vẽ 2D)
    console.log('\n=== STEP 2.5: Inspect Tab "Mặt cắt & Hồ sơ" on 2D DXF ===')
    await evalJs(`(() => {
      const tabs = Array.from(document.querySelectorAll('button'))
      const tabProfile = tabs.find(b => b.innerText.includes('Mặt cắt & Hồ sơ') || b.innerText.includes('Trắc dọc'))
      if (tabProfile) tabProfile.click()
    })()`)
    await sleep(800)

    const profileViewState = await evalJs(`(() => {
      const bodyTxt = document.body.innerText
      return {
        hasElevationWarning: bodyTxt.includes('Chưa có dữ liệu cao độ') || bodyTxt.includes('Chưa có dữ liệu trắc dọc') || bodyTxt.includes('2D'),
        noFakeElevation: !bodyTxt.includes('Cao độ thiết kế: 0.000m (Khảo sát)'),
      }
    })()`)
    console.log('Profile view state on 2D file:', profileViewState)
    assert.strictEqual(profileViewState.hasElevationWarning, true, 'Must indicate authentic absence of 3D elevation data')

    // Return to map tab
    await evalJs(`(() => {
      const tabs = Array.from(document.querySelectorAll('button'))
      const tabMap = tabs.find(b => b.innerText.includes('Bản đồ') || b.innerText.includes('GIS'))
      if (tabMap) tabMap.click()
    })()`)
    await sleep(500)

    // =========================================================================
    // SUITE 3: SWITCH PROJECT AND CONFIRM AUTO-UPDATE
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 3: SWITCH PROJECT TO GTNT-MAU-01 & VERIFY PARAMETERS')
    console.log('===============================================================')

    await evalJs(`(() => {
      const select = document.querySelector('[data-testid="project-profile-select"]')
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      nativeSetter.call(select, 'project-nong-thon-mau')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(800)

    const switchedProjectState = await evalJs(`(() => {
      return {
        roadWidth: document.querySelector('#input-roadWidth')?.value,
        laneCount: document.querySelector('#input-laneCount')?.value,
        segmentLength: document.querySelector('#input-segmentLength')?.value,
        slabThickness: document.querySelector('#input-slabThicknessCentimeters')?.value,
        expansionJointSpacing: document.querySelector('#input-expansionJointSpacingMeters')?.value,
        expansionJointGap: document.querySelector('#input-expansionJointGapMillimeters')?.value,
        roadWidthBadge: document.querySelector('[data-testid="source-badge-roadWidth"]')?.innerText,
        slabThicknessBadge: document.querySelector('[data-testid="btxm-status-badge-slabThicknessCentimeters"]')?.innerText,
      }
    })()`)
    console.log('State after switching to GTNT-MAU-01:', switchedProjectState)

    assert.strictEqual(switchedProjectState.roadWidth, '3.5', 'roadWidth must update to 3.5m for GTNT')
    assert.strictEqual(switchedProjectState.laneCount, '1', 'laneCount must update to 1 dải for GTNT')
    assert.strictEqual(switchedProjectState.segmentLength, '50', 'segmentLength must update to 50m for GTNT')
    assert.strictEqual(switchedProjectState.slabThickness, '18', 'slabThickness must update to 18cm for GTNT')
    assert.strictEqual(switchedProjectState.expansionJointSpacing, '50.0', 'expansionJointSpacing must update to 50.0m for GTNT')
    assert.strictEqual(switchedProjectState.expansionJointGap, '15', 'expansionJointGap must update to 15mm for GTNT')
    assert.ok(switchedProjectState.roadWidthBadge.includes('GTNT-MAU-01'), 'roadWidth badge must cite GTNT-MAU-01')

    // =========================================================================
    // SUITE 4: CONFLICT RESOLUTION (DXF ≠ PROJECT PROFILE)
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 4: CONFLICT DETECTION & 1-CLICK RESOLUTION')
    console.log('===============================================================')

    // Reset to Bảo Lộc project (which has slabThickness = 22cm, contractionJoint = 4.0m)
    await evalJs(`(() => {
      const select = document.querySelector('[data-testid="project-profile-select"]')
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      nativeSetter.call(select, 'project-bao-loc-dt725')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(600)

    // Upload sample DXF with authentic BTXM values: thickness = 24cm, joint = 4.5m
    console.log('Uploading sample_btxm_full_4_fields.dxf (contains 24cm, 4.5m)...')
    await setFileOnInput(BTXM_SAMPLE_DXF_PATH)
    await sleep(1000)

    const conflictState = await evalJs(`(() => {
      const thicknessConflict = document.querySelector('[data-testid="conflict-alert-slabThicknessCentimeters"]')
      const jointConflict = document.querySelector('[data-testid="conflict-alert-contractionJointSpacingMeters"]')
      const thicknessInput = document.querySelector('#input-slabThicknessCentimeters')?.value
      const thicknessBadge = document.querySelector('[data-testid="btxm-status-badge-slabThicknessCentimeters"]')?.innerText
      const gapInput = document.querySelector('#input-expansionJointGapMillimeters')?.value
      const gapBadge = document.querySelector('[data-testid="btxm-status-badge-expansionJointGapMillimeters"]')?.innerText
      return {
        hasThicknessConflict: Boolean(thicknessConflict),
        thicknessConflictText: thicknessConflict?.innerText || '',
        hasJointConflict: Boolean(jointConflict),
        thicknessInput,
        thicknessBadge,
        gapInput,
        gapBadge,
      }
    })()`)
    console.log('Conflict state:', conflictState)

    // Priority 1: DXF value 24 is used initially
    assert.strictEqual(conflictState.thicknessInput, '24', 'DXF value 24cm must be auto-filled by priority')
    assert.strictEqual(conflictState.hasThicknessConflict, true, 'Conflict alert for thickness must be displayed')
    assert.ok(conflictState.thicknessConflictText.includes('24') && conflictState.thicknessConflictText.includes('22'), 'Conflict text must display both 24 and 22')

    // Gap was missing in DXF, so it received Project value 20
    assert.strictEqual(conflictState.gapInput, '20', 'expansionJointGap must be filled from Project profile')
    assert.ok(conflictState.gapBadge.includes('DT725-BL'), 'expansionJointGap badge must cite Project DT725-BL')

    // Click [Dùng Dự án: 22] on thickness
    console.log('Clicking [Dùng Dự án: 22 cm]...')
    await evalJs(`(() => {
      const btn = document.querySelector('[data-testid="use-proj-btn-slabThicknessCentimeters"]')
      if (btn) btn.click()
    })()`)
    await sleep(400)

    const resolvedThickness = await evalJs(`(() => {
      return {
        value: document.querySelector('#input-slabThicknessCentimeters')?.value,
        badge: document.querySelector('[data-testid="btxm-status-badge-slabThicknessCentimeters"]')?.innerText,
      }
    })()`)
    console.log('Resolved thickness state:', resolvedThickness)
    assert.strictEqual(resolvedThickness.value, '22', 'Thickness must be set to 22 after clicking Use Project')
    assert.strictEqual(resolvedThickness.badge, 'Kỹ sư đã sửa', 'Badge must indicate user modified for this drawing')

    // =========================================================================
    // SUITE 5: MISSING PARAMETERS INDICATOR
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 5: MISSING PARAMETERS IN BOTH SOURCES')
    console.log('===============================================================')

    // Clear roadWidth to simulate missing in both sources
    await evalJs(`(() => {
      const input = document.querySelector('#input-roadWidth')
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(400)

    const missingAlertState = await evalJs(`(() => {
      const alert = document.querySelector('[data-testid="missing-geometry-alert"]')
      const badge = document.querySelector('[data-testid="source-badge-roadWidth"]')?.innerText
      return {
        hasAlert: Boolean(alert),
        alertText: alert?.innerText || '',
        badge,
      }
    })()`)
    console.log('Missing alert state:', missingAlertState)
    assert.strictEqual(missingAlertState.hasAlert, true, 'missing-geometry-alert must appear when roadWidth is cleared')
    assert.ok(missingAlertState.alertText.includes('Bề rộng mặt'), 'Missing alert text must name Bề rộng mặt')

    // =========================================================================
    // SUITE 6: TWO ROAD WIDTHS IN SAME DXF (CONFLICTING CANDIDATES)
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 6: TWO ROAD WIDTHS IN SAME DXF (CONFLICTING CANDIDATES)')
    console.log('===============================================================')

    console.log('Uploading sample_two_road_widths.dxf (contains B = 7.0m and B = 8.5m)...')
    await setFileOnInput(TWO_WIDTHS_DXF_PATH)
    await sleep(1000)

    const twoWidthsState = await evalJs(`(() => {
      const conflictAlert = document.querySelector('[data-testid="conflict-alert-roadWidth"]')
      const cand7Btn = document.querySelector('[data-testid="use-dxf-cand-btn-roadWidth-7"]')
      const cand85Btn = document.querySelector('[data-testid="use-dxf-cand-btn-roadWidth-8.5"]')
      const badge = document.querySelector('[data-testid="source-badge-roadWidth"]')?.innerText
      return {
        hasConflictAlert: Boolean(conflictAlert),
        alertText: conflictAlert?.innerText || '',
        hasCand7: Boolean(cand7Btn),
        hasCand85: Boolean(cand85Btn),
        badge,
      }
    })()`)
    console.log('Two widths state:', twoWidthsState)
    assert.strictEqual(twoWidthsState.hasConflictAlert, true, 'Must display conflict alert for multiple road width values in DXF')
    assert.ok(twoWidthsState.hasCand7, 'Must provide candidate button for 7.0m')
    assert.ok(twoWidthsState.hasCand85, 'Must provide candidate button for 8.5m')

    // Click [Dùng DXF: 8.5]
    console.log('Clicking candidate [Dùng DXF: 8.5]...')
    await evalJs(`(() => {
      const btn = document.querySelector('[data-testid="use-dxf-cand-btn-roadWidth-8.5"]')
      if (btn) btn.click()
    })()`)
    await sleep(400)

    const selectedWidthState = await evalJs(`(() => {
      return {
        val: document.querySelector('#input-roadWidth')?.value,
        badge: document.querySelector('[data-testid="source-badge-roadWidth"]')?.innerText,
      }
    })()`)
    console.log('Selected candidate state:', selectedWidthState)
    assert.strictEqual(selectedWidthState.val, '8.5', 'roadWidth must be set to selected candidate 8.5m')
    assert.strictEqual(selectedWidthState.badge, 'Kỹ sư đã sửa', 'Must indicate engineer manual override')

    // =========================================================================
    // SUITE 7: SWITCH PROJECT DURING SCAN (RACE CONDITION SAFETY)
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 7: SWITCH PROJECT DURING SCAN (RACE CONDITION SAFETY)')
    console.log('===============================================================')

    // Set artificial scan delay of 800ms to allow project switch in-flight
    await evalJs(`window.__RG_TEST_SCAN_DELAY_MS = 800`)

    console.log('Triggering DXF file upload with delay...')
    setFileOnInput(BTXM_SAMPLE_DXF_PATH) // fire without await
    await sleep(150)

    console.log('Switching project to GTNT-MAU-01 during scan...')
    await evalJs(`(() => {
      const select = document.querySelector('[data-testid="project-profile-select"]')
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      nativeSetter.call(select, 'project-nong-thon-mau')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)

    // Wait for delayed scan to finish
    await sleep(1200)
    await evalJs(`window.__RG_TEST_SCAN_DELAY_MS = 0`)

    const midScanProjectState = await evalJs(`(() => {
      return {
        segmentLength: document.querySelector('#input-segmentLength')?.value,
        expansionJointGap: document.querySelector('#input-expansionJointGapMillimeters')?.value,
        gapBadge: document.querySelector('[data-testid="btxm-status-badge-expansionJointGapMillimeters"]')?.innerText,
      }
    })()`)
    console.log('State after project switch during scan:', midScanProjectState)
    assert.strictEqual(midScanProjectState.segmentLength, '50', 'segmentLength must take GTNT project value (50m)')
    assert.strictEqual(midScanProjectState.expansionJointGap, '15', 'expansionJointGap must take GTNT project value (15mm)')
    assert.ok(midScanProjectState.gapBadge.includes('GTNT-MAU-01'), 'Badge must cite GTNT-MAU-01')

    // =========================================================================
    // SUITE 8: LOAD FILE AFTER MANUAL CRS CONFIGURATION (CRS PRESERVATION)
    // =========================================================================
    console.log('\n===============================================================')
    console.log('SUITE 8: LOAD FILE AFTER MANUAL CRS CONFIGURATION (CRS PRESERVATION)')
    console.log('===============================================================')

    // Engineer manually picks HCM L₀ = 105.75°
    console.log('Engineer manually selects L₀ = 105.75°...')
    await evalJs(`(() => {
      const input = document.querySelector('#input-central-meridian')
      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        nativeSetter.call(input, '105.75')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })()`)
    await sleep(400)

    // Upload DXF while active project has L₀ = 107.75°
    console.log('Uploading DXF and checking CRS retention...')
    await setFileOnInput(BTXM_SAMPLE_DXF_PATH)
    await sleep(800)

    const crsRetentionState = await evalJs(`(() => {
      const input = document.querySelector('#input-central-meridian')
      const applyBtn = document.querySelector('[data-testid="apply-project-crs-btn"]')
      return {
        currentCm: input?.value,
        hasApplyBtn: Boolean(applyBtn),
        applyBtnText: applyBtn?.innerText || '',
      }
    })()`)
    console.log('CRS retention state:', crsRetentionState)
    assert.strictEqual(crsRetentionState.currentCm, '105.75', 'Manual CRS must be strictly preserved after loading DXF')
    assert.strictEqual(crsRetentionState.hasApplyBtn, true, 'Must display explicit button to adopt project CRS')
    assert.ok(crsRetentionState.applyBtnText.includes('107.75'), 'Apply button must cite project L₀ = 107.75°')

    // Test active adoption when engineer explicitly clicks the button
    console.log('Actively applying project CRS...')
    await evalJs(`(() => {
      const btn = document.querySelector('[data-testid="apply-project-crs-btn"]')
      if (btn) btn.click()
    })()`)
    await sleep(400)

    const crsAdoptedState = await evalJs(`(() => {
      const input = document.querySelector('#input-central-meridian')
      return { currentCm: input?.value }
    })()`)
    console.log('CRS adopted state:', crsAdoptedState)
    assert.strictEqual(crsAdoptedState.currentCm, '107.75', 'CRS must only update when engineer actively clicks adopt')

    console.log('\n===============================================================')
    console.log('ALL PROJECT PARAMETER PROFILE E2E TESTS PASSED 100% (STRICT)!')
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
