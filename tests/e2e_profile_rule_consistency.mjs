import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import assert from 'node:assert/strict'

function getArg(flag, envVar, fallback) {
  const idx = process.argv.indexOf(flag)
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return process.env[envVar] || fallback
}

const BTXM_DXF = path.resolve('tests/fixtures/sample_btxm_full_4_fields.dxf') // DXF: thick 24, gap 20, contraction 4.5, expansion 60, no road geometry
const CENTERLINE_DXF = path.resolve('tests/fixtures/fileA/TUYEN_THIET_KE_TRUNG_TEN.dxf') // centerline 100m, no BTXM notes
const CUSTOM_CHROME = getArg('--chrome', 'CHROME_PATH', null)
const CDP_PORT = Number(getArg('--cdp-port', 'CDP_PORT', '9399'))
const STUDIO_URL = getArg('--url', 'STUDIO_URL', 'http://127.0.0.1:5173/studio')

for (const f of [BTXM_DXF, CENTERLINE_DXF]) assert.ok(fs.existsSync(f), `fixture missing: ${f}`)
const chromeExe = [
  CUSTOM_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]
  .filter(Boolean)
  .find((p) => fs.existsSync(p))
if (!chromeExe) throw new Error('Chrome/Edge executable not found')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const REAL_PROFILE = {
  id: 'project-real-1',
  name: 'Dự án thật 1',
  code: 'REAL-1',
  isTemplate: false,
  crs: { province: 'Lâm Đồng', centralMeridian: '107.75', scaleFactor: '0.9999', axisOrder: 'AUTO' },
  params: {
    roadWidth: '6.5', laneCount: '2', segmentLength: '100', slabLength: '4.0',
    slabThicknessCentimeters: '20', contractionJointSpacingMeters: '4.0',
    expansionJointSpacingMeters: '80.0', expansionJointGapMillimeters: '15', surveyWidthMeters: '',
  },
  confirmedAt: null,
  confirmedBy: null,
}
const TEMPLATE_PROFILE = {
  id: 'project-bao-loc-dt725',
  name: '[Mẫu kiểm thử] ĐT.725',
  code: 'DT725-BL',
  isTemplate: true,
  crs: { province: 'Lâm Đồng', centralMeridian: '107.75', scaleFactor: '0.9999', axisOrder: 'AUTO' },
  params: {
    roadWidth: '7.0', laneCount: '2', segmentLength: '100', slabLength: '4.0',
    slabThicknessCentimeters: '22', contractionJointSpacingMeters: '4.0',
    expansionJointSpacingMeters: '100.0', expansionJointGapMillimeters: '20', surveyWidthMeters: '14.0',
  },
  confirmedAt: '2026-10-15',
  confirmedBy: 'Hồ sơ mẫu',
}

async function run() {
  const userDataDir = path.join(os.tmpdir(), 'chrome_profile_rule_' + Date.now())
  const chrome = spawn(
    chromeExe,
    [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`, '--headless=new', '--window-size=1600,1000', '--disable-gpu', '--no-first-run', STUDIO_URL],
    { stdio: 'ignore' }
  )
  try {
    let wsUrl = null
    for (let i = 0; i < 30 && !wsUrl; i++) {
      await sleep(300)
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
        wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl || null
      } catch {}
    }
    if (!wsUrl) throw new Error('no chrome page')
    const ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    let msgId = 1
    const pending = new Map()
    ws.onmessage = (evt) => {
      const d = JSON.parse(evt.data)
      if (d.id && pending.has(d.id)) {
        const { resolve, reject } = pending.get(d.id)
        pending.delete(d.id)
        d.error ? reject(new Error(d.error.message)) : resolve(d.result)
      }
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = msgId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
    const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value
    const FILE_SEL = 'input[type="file"][accept*=".dxf"]'
    const setFile = async (filePath) => {
      await evalJs(`(() => { const el = document.querySelector('${FILE_SEL}'); if (el) el.value = '' })()`)
      const doc = await send('DOM.getDocument')
      const input = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: FILE_SEL })
      assert.ok(input?.nodeId, 'file input not found')
      await send('DOM.setFileInputFiles', { files: [filePath], nodeId: input.nodeId })
      await evalJs(`document.querySelector('${FILE_SEL}').dispatchEvent(new Event('change', { bubbles: true }))`)
    }
    const setInput = (selector, value) => evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    const selectProject = (id) => evalJs(`(() => {
      const el = document.querySelector('[data-testid="project-profile-select"]')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      setter.call(el, ${JSON.stringify(id)})
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    const vals = () => evalJs(`(() => {
      const g = (k) => document.querySelector('#input-' + k)?.value ?? null
      return {
        roadWidth: g('roadWidth'), laneCount: g('laneCount'), segmentLength: g('segmentLength'), slabLength: g('slabLength'),
        thick: g('slabThicknessCentimeters'), contraction: g('contractionJointSpacingMeters'),
        expansion: g('expansionJointSpacingMeters'), gap: g('expansionJointGapMillimeters'),
      }
    })()`)
    const badge = (sel) => evalJs(`document.querySelector('[data-testid="${sel}"]')?.innerText ?? null`)
    const clickByText = (text, scope = 'document') => evalJs(`(() => {
      const b = Array.from(${scope}.querySelectorAll('button')).find((x) => x.innerText.includes(${JSON.stringify(text)}) && !x.disabled)
      if (b) { b.click(); return true } return false
    })()`)
    const waitMount = async () => {
      for (let i = 0; i < 40; i++) {
        if (await evalJs(`Boolean(document.querySelector('${FILE_SEL}'))`)) break
        await sleep(300)
      }
      await sleep(800)
    }
    const waitAnalysis = async (needle) => {
      for (let i = 0; i < 40; i++) {
        await sleep(500)
        const spin = await evalJs(`Boolean(document.querySelector('.animate-spin'))`)
        const txt = await evalJs('document.body.innerText')
        if (!spin && i > 1 && txt.includes(needle)) return true
      }
      return false
    }
    const seed = async (profiles, active) => {
      await evalJs(`(() => {
        localStorage.setItem('roadguard_project_profiles_v1', ${JSON.stringify(JSON.stringify(profiles))})
        localStorage.setItem('roadguard_active_project_id_v1', ${JSON.stringify(active)})
      })()`)
      await send('Page.reload')
      await waitMount()
    }

    await send('Page.enable'); await send('DOM.enable'); await send('Runtime.enable')
    await waitMount()

    // ================= SUITE A: file.text() failure =================
    console.log('\n=== SUITE A: file.text() failure follows the same rule ===')
    await seed([REAL_PROFILE, TEMPLATE_PROFILE], '')

    const breakText = () => evalJs(`(() => { window.__origText = File.prototype.text; File.prototype.text = () => Promise.reject(new Error('simulated file.text() failure')) })()`)
    const restoreText = () => evalJs(`(() => { File.prototype.text = window.__origText })()`)

    // A1: no profile selected -> all blank
    await breakText()
    await setFile(BTXM_DXF); await sleep(1200)
    let v = await vals()
    console.log('A1 (no profile, text() fails):', v)
    assert.deepEqual(Object.values(v), Array(8).fill(''), 'No profile + unreadable DXF -> every field blank')

    // A2: unconfirmed real profile -> still blank
    await selectProject('project-real-1'); await sleep(500)
    v = await vals()
    console.log('A2 (unconfirmed real profile):', v)
    assert.deepEqual(Object.values(v), Array(8).fill(''), 'Unconfirmed real profile must not supply numbers')
    await setFile(BTXM_DXF); await sleep(1200)
    v = await vals()
    assert.deepEqual(Object.values(v), Array(8).fill(''), 'Unconfirmed real profile + text() failure -> blank')

    // A3: template profile chosen explicitly -> filled and labelled as sample, even on text() failure
    await selectProject('project-bao-loc-dt725'); await sleep(500)
    await setFile(BTXM_DXF); await sleep(1200)
    v = await vals()
    console.log('A3 (template, text() fails):', v)
    assert.equal(v.roadWidth, '7.0'); assert.equal(v.thick, '22'); assert.equal(v.gap, '20')
    assert.ok((await badge('source-badge-roadWidth')).includes('Từ hồ sơ mẫu: DT725-BL'))

    // A4: manual entry survives switching profile after failure
    await setInput('#input-roadWidth', '9.5'); await sleep(300)
    await selectProject('project-real-1'); await sleep(500)
    v = await vals()
    console.log('A4 (manual 9.5 then switch to unconfirmed real):', v)
    assert.equal(v.roadWidth, '9.5', 'Manual value kept'); assert.equal(v.thick, '', 'Profile-derived value dropped'); assert.equal(v.laneCount, '')
    await restoreText()

    // A5: good scan, unconfirmed profile -> DXF numbers only
    await setFile(BTXM_DXF); await sleep(1500)
    v = await vals()
    console.log('A5 (DXF ok, unconfirmed real):', v)
    assert.equal(v.thick, '24'); assert.equal(v.roadWidth, ''); assert.equal(v.laneCount, '')

    // ====== SUITE B: confirm -> edit profile -> rebuild on the same drawing ======
    console.log('\n=== SUITE B: confirm -> edit -> rebuild on the same drawing ===')
    await seed([REAL_PROFILE, TEMPLATE_PROFILE], 'project-real-1')
    await setFile(CENTERLINE_DXF); await sleep(1500)
    v = await vals()
    console.log('B1 (unconfirmed real, centerline DXF):', v)
    assert.equal(v.roadWidth, '', 'Unconfirmed profile supplies nothing')

    const openModalAndEditReal = async () => {
      await clickByText('Quản lý'); await sleep(600)
      await evalJs(`(() => {
        const modal = document.querySelector('[data-testid="project-profile-modal"]')
        const span = Array.from(modal.querySelectorAll('span')).find((s) => s.innerText.trim() === 'REAL-1')
        span.closest('div[class*="cursor-pointer"]').click()
      })()`)
      await sleep(400)
    }
    const confirmInModal = async (name) => {
      await setInput('[data-testid="engineer-name-input"]', name); await sleep(200)
      await evalJs(`document.querySelector('[data-testid="confirm-dossier-btn"]').click()`)
      await sleep(500)
    }
    const closeModal = async () => {
      await evalJs(`document.querySelector('[data-testid="project-profile-modal"] button').click()`)
      await sleep(500)
    }

    await openModalAndEditReal()
    await confirmInModal('KS. Nguyễn Văn Thật')
    await closeModal()
    v = await vals()
    console.log('B2 (after confirm, no re-upload):', v)
    assert.equal(v.roadWidth, '6.5', 'Confirming fills immediately'); assert.equal(v.laneCount, '2'); assert.equal(v.segmentLength, '100')
    assert.ok((await badge('source-badge-roadWidth')).includes('Từ dự án: REAL-1'))

    assert.ok(await clickByText('Phân Tích & Dựng Tuyến'), 'Build button usable right after confirm')
    assert.ok(await waitAnalysis('100'), 'Build completes after confirm')
    await sleep(800)

    // manual entry on this drawing
    await setInput('#input-laneCount', '3'); await sleep(300)

    // edit profile -> confirmation lost
    await openModalAndEditReal()
    await setInput('input[placeholder="Để trống nếu chưa xác nhận"]', '7.5'); await sleep(300)
    assert.ok((await evalJs(`document.querySelector('[data-testid="project-profile-modal"]').innerText`)).includes('Chưa có xác nhận thực tế'))
    assert.ok(await clickByText('Lưu thay đổi', `document.querySelector('[data-testid="project-profile-modal"]')`))
    await sleep(600)
    await closeModal()
    v = await vals()
    console.log('B3 (profile edited -> unconfirmed):', v)
    assert.equal(v.roadWidth, '', 'Profile-derived fields cleared as soon as confirmation is lost')
    assert.equal(v.segmentLength, '')
    assert.equal(v.laneCount, '3', 'Manual entry kept')

    // re-confirm -> refill with edited numbers
    await openModalAndEditReal()
    await confirmInModal('KS. Nguyễn Văn Thật')
    await closeModal()
    v = await vals()
    console.log('B4 (re-confirmed):', v)
    assert.equal(v.roadWidth, '7.5', 'Re-confirm fills edited value'); assert.equal(v.laneCount, '3', 'Manual still kept')

    assert.ok(await clickByText('Cập Nhật & Dựng Lại'), 'Rebuild button present on same drawing')
    assert.ok(await waitAnalysis('100'), 'Rebuild completes on the same drawing')
    const bText = await evalJs('document.body.innerText')
    assert.ok(bText.includes('B = 7.5') || bText.includes('7.5'), 'Rebuild uses re-confirmed B = 7.5')

    // ====== SUITE C: slow scan on File B -> click Build immediately -> no File A numbers in request ======
    console.log('\n=== SUITE C: slow scan on File B -> immediate Build -> no File A leakage ===')
    const CONFIRMED_REAL = {
      ...REAL_PROFILE,
      confirmedAt: '2026-11-16',
      confirmedBy: 'KS. Nguyễn Văn Thật',
    }
    await seed([CONFIRMED_REAL, TEMPLATE_PROFILE], 'project-real-1')

    // Intercept XMLHttpRequest to record /api/cad/parse-road FormData payloads
    await evalJs(`(() => {
      window.__capturedParseRoadReqs = []
      const origOpen = XMLHttpRequest.prototype.open
      const origSend = XMLHttpRequest.prototype.send
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__reqUrl = url
        return origOpen.apply(this, arguments)
      }
      XMLHttpRequest.prototype.send = function(body) {
        if (this.__reqUrl && String(this.__reqUrl).includes('/api/cad/parse-road') && body instanceof FormData) {
          const fileEntry = body.get('File')
          window.__capturedParseRoadReqs.push({
            roadWidth: body.get('RoadWidth'),
            fileName: fileEntry && fileEntry.name ? fileEntry.name : null,
            ts: Date.now(),
          })
        }
        return origSend.apply(this, arguments)
      }
    })()`)

    // Upload File A and enter manual numbers on File A
    await setFile(BTXM_DXF)
    await sleep(1000)
    await setInput('#input-roadWidth', '13.5')
    await setInput('#input-laneCount', '4')
    await sleep(300)
    v = await vals()
    console.log('C1 (File A with manual 13.5/4 and DXF 24):', v)
    assert.equal(v.roadWidth, '13.5')
    assert.equal(v.laneCount, '4')
    assert.equal(v.thick, '24')

    // Slow down File B scan and switch to File B
    await evalJs(`window.__RG_TEST_SCAN_DELAY_MS = 1800`)
    await setFile(CENTERLINE_DXF)
    await sleep(100) // File B is still scanning!

    // Immediately verify File A's manual inputs & DXF extractions were wiped synchronously,
    // confirmed project profile values auto-filled for File B, and Build button is blocked during scan
    const midScanState = await evalJs(`(() => {
      const btn = document.querySelector('[data-testid="analyze-route-btn"]')
      if (btn) btn.click() // Attempt immediate click while scanning
      return {
        roadWidth: document.querySelector('#input-roadWidth')?.value ?? null,
        laneCount: document.querySelector('#input-laneCount')?.value ?? null,
        thick: document.querySelector('#input-slabThicknessCentimeters')?.value ?? null,
        btnDisabled: btn?.disabled ?? null,
        btnText: btn?.innerText ?? '',
        reqsDuringScan: window.__capturedParseRoadReqs.length,
      }
    })()`)
    console.log('C2 (during slow scan of File B):', midScanState)
    assert.equal(midScanState.roadWidth, '6.5', 'File A manual 13.5 must be wiped immediately; confirmed profile 6.5 fills for File B')
    assert.equal(midScanState.laneCount, '2', 'File A manual 4 must be wiped immediately')
    assert.equal(midScanState.thick, '20', 'File A DXF 24 must be wiped immediately')
    assert.equal(midScanState.btnDisabled, true, 'Build button must be disabled while scanning File B')
    assert.equal(midScanState.reqsDuringScan, 0, 'Immediate click during scan must NOT send any request')

    // Wait for slow scan to finish
    await evalJs(`window.__RG_TEST_SCAN_DELAY_MS = 0`)
    await sleep(2200)

    const postScanState = await evalJs(`(() => {
      const btn = document.querySelector('[data-testid="analyze-route-btn"]')
      return {
        btnDisabled: btn?.disabled ?? null,
        btnText: btn?.innerText ?? '',
      }
    })()`)
    console.log('C3 (after File B scan completes):', postScanState)
    assert.equal(postScanState.btnDisabled, false, 'Build button must be enabled once File B scan finishes')

    // Click Build now and verify the request uses File B + confirmed profile 6.5 (never File A 13.5)
    assert.ok(await clickByText('Phân Tích & Dựng Tuyến'), 'Click Build after File B scan completes')
    assert.ok(await waitAnalysis('100'), 'Build completes for File B')

    const reqs = await evalJs(`window.__capturedParseRoadReqs`)
    console.log('C4 (captured parse-road requests):', reqs)
    assert.equal(reqs.length, 1, 'Exactly one parse-road request sent for File B')
    assert.equal(reqs[0].fileName, 'TUYEN_THIET_KE_TRUNG_TEN.dxf', 'Request must upload File B')
    assert.equal(reqs[0].roadWidth, '6.5', 'Request must use File B / confirmed profile 6.5, NOT File A 13.5')

    console.log('\n=== ALL PROFILE-RULE E2E SUITES PASSED ===')
  } finally {
    try { chrome.kill() } catch {}
  }
}

run().catch((err) => {
  console.error('FATAL TEST ERROR:', err)
  process.exit(1)
})
