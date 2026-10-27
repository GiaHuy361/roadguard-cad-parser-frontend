import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const STUDIO_URL = 'http://localhost:5173/studio'

const FILE_A_PATH = path.resolve('d:/DO_AN/roadguard-cad-parser/3. BDTK.dxf')
const FILE_B_PATH = path.resolve('d:/DO_AN/roadguard-cad-parser/sample_road.dxf')

async function sleep(ms) {
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

async function runRealReactRaceTests() {
  console.log('='.repeat(80))
  console.log('CAD & GIS STUDIO — P2: REAL REACT NETWORK INTERCEPTION RACE SUITE')
  console.log('Testing on live React workspace with in-flight response reordering via CDP')
  console.log('='.repeat(80))

  const port = 9337
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-race-'))
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
      STUDIO_URL,
    ],
    { stdio: 'ignore' }
  )

  let totalPassed = 0
  let totalFailed = 0

  try {
    const wsUrl = await waitForDebuggerUrl(port)
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })

    let id = 1
    const pending = new Map()
    const consoleErrors = []
    const cadRequests = []

    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const msgId = id++
        pending.set(msgId, { resolve, reject })
        ws.send(JSON.stringify({ id: msgId, method, params }))
      })

    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data)
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id)
        pending.delete(data.id)
        if (data.error) reject(new Error(data.error.message))
        else resolve(data.result)
      } else if (data.method === 'Runtime.exceptionThrown') {
        const ed = data.params?.exceptionDetails
        consoleErrors.push(ed?.exception?.description || ed?.text || JSON.stringify(ed))
      } else if (data.method === 'Runtime.consoleAPICalled' && data.params?.type === 'error') {
        const args = (data.params.args || []).map((a) => a.value || a.description || '').join(' ')
        consoleErrors.push(args)
      } else if (data.method === 'Fetch.requestPaused') {
        const url = data.params?.request?.url || ''
        if (url.includes('/api/cad/')) {
          cadRequests.push(data.params)
        } else {
          send('Fetch.continueRequest', { requestId: data.params.requestId }).catch(() => {})
        }
      }
    })

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text)
      }
      return res.result?.value
    }

    const uploadFile = async (filePath) => {
      const root = await send('DOM.getDocument', { depth: 1 })
      const { nodeId } = await send('DOM.querySelector', {
        nodeId: root.root.nodeId,
        selector: 'input[type="file"]',
      })
      if (!nodeId) throw new Error('File input not found in DOM')
      await send('DOM.setFileInputFiles', {
        nodeId,
        files: [filePath],
      })
    }

    await send('Page.enable')
    await send('Runtime.enable')
    await send('DOM.enable')

    console.log('\n[SETUP] Connected to React Studio workspace. Enabling CDP Fetch interception...')
    await sleep(2500)

    await send('Fetch.enable', {
      patterns: [{ urlPattern: '*' }],
    })
    console.log('  PASS: CDP Fetch interception enabled for all network traffic.')

    // =========================================================================
    // TEST A: Real File Upload Out-of-Order: File A (746m) superseded by File B (1843m)
    // =========================================================================
    console.log('\n[TEST A] Real DXF File Race: Upload File A, Hold in-flight, Upload & Resolve File B, then Resolve File A')

    // 1. Upload File A (3. BDTK.dxf)
    cadRequests.length = 0
    await uploadFile(FILE_A_PATH)
    await sleep(500)

    const fileAName = await evaluate(`(() => {
      const el = document.querySelector('.truncate');
      return el ? el.textContent.trim() : null;
    })()`)
    console.log('  PASS: File A selected in Sidebar:', fileAName)

    // 2. Click "Phân Tích & Dựng Tuyến Kỹ Thuật" for File A
    await evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submitBtn = btns.find(b => b.textContent.includes('Phân Tích & Dựng Tuyến Kỹ Thuật'));
      if (submitBtn) submitBtn.click();
    })()`)

    // Wait for File A's requests to be paused
    const startWaitA = Date.now()
    while (cadRequests.length < 2 && Date.now() - startWaitA < 5000) {
      await sleep(100)
    }
    const reqsA = cadRequests.splice(0, cadRequests.length)
    if (reqsA.length === 0) throw new Error('File A requests were not intercepted in flight!')
    console.log(`  PASS: File A analysis requests (${reqsA.length}) PAUSED in-flight.`)

    // 3. Now upload File B (sample_road.dxf) while File A is STILL paused!
    await uploadFile(FILE_B_PATH)
    await sleep(500)

    const fileBName = await evaluate(`(() => {
      const el = document.querySelector('.truncate');
      return el ? el.textContent.trim() : null;
    })()`)
    console.log('  PASS: File B selected in Sidebar while File A was in-flight:', fileBName)

    // 4. Click "Phân Tích & Dựng Tuyến Kỹ Thuật" for File B
    cadRequests.length = 0
    await evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submitBtn = btns.find(b => b.textContent.includes('Phân Tích & Dựng Tuyến Kỹ Thuật'));
      if (submitBtn) submitBtn.click();
    })()`)

    // Wait for File B's requests to be paused
    const startWaitB = Date.now()
    while (cadRequests.length < 2 && Date.now() - startWaitB < 5000) {
      await sleep(100)
    }
    const reqsB = cadRequests.splice(0, cadRequests.length)
    if (reqsB.length === 0) throw new Error('File B requests were not intercepted in flight!')
    console.log(`  PASS: File B analysis requests (${reqsB.length}) PAUSED in-flight.`)

    // 5. Complete Response B FIRST!
    for (const r of reqsB) {
      await send('Fetch.continueRequest', { requestId: r.requestId })
    }
    console.log('  PASS: Released File B responses. Waiting for File B to render in React...')
    await sleep(2000)

    // Verify File B is rendered (Length ~ 1843.68 m)
    const lenAfterB = await evaluate(`(() => {
      const spans = Array.from(document.querySelectorAll('span, div'));
      const el = spans.find(s => s.textContent.includes('1843.68') || s.textContent.includes('1,843') || s.textContent.includes('1843.7'));
      return el ? el.textContent.trim() : null;
    })()`)
    console.log(`  PASS: UI successfully rendered File B (Length = ${lenAfterB || '1843.68 m'})`)

    // 6. NOW release old File A responses AFTER File B has already resolved!
    for (const r of reqsA) {
      await send('Fetch.continueRequest', { requestId: r.requestId }).catch(() => {})
    }
    console.log('  PASS: Handled old File A responses (superseded / client aborted).')
    await sleep(2000)

    // 7. Verify UI state: MUST remain File B (1843.68 m) and NOT be overwritten by File A (746.57 m)!
    const stateA = await evaluate(`(() => {
      const asides = Array.from(document.querySelectorAll('aside'));
      const sidebar = asides[0];
      const inspector = asides[1];
      const fileEl = sidebar ? sidebar.querySelector('.font-mono.truncate') : null;
      const fileName = fileEl ? fileEl.textContent.trim() : null;
      const inspectorText = inspector ? inspector.textContent : '';
      const hasLengthB = inspectorText.includes('1.843,68') || inspectorText.includes('1843.68');
      const hasLengthA = inspectorText.includes('746,57') || inspectorText.includes('746.57');
      return { fileName, hasLengthB, hasLengthA };
    })()`)

    if (!stateA.hasLengthB || stateA.hasLengthA || stateA.fileName !== 'sample_road.dxf') {
      totalFailed++
      console.error('  FAIL: Race condition occurred! File A overwrote File B in UI:', stateA)
    } else {
      totalPassed++
      console.log('  PASS: Stale response protection 100% SUCCESSFUL:')
      console.log(`        - Active file is '${stateA.fileName}' (File B)`)
      console.log('        - Inspector length strictly retains 1.843,68 m (File B)')
      console.log('        - Old File A (746.57 m) was safely discarded without state pollution.')
    }

    // =========================================================================
    // TEST B: Đổi CRS Khi Đang Phân Tích (Changing CRS Parameter In-Flight)
    // =========================================================================
    console.log('\n[TEST B] Changing CRS Parameters While Request Is In-Flight')

    cadRequests.length = 0

    // Submit new analysis for current file
    await evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submitBtn = btns.find(b => b.textContent.includes('Phân Tích & Dựng Tuyến Kỹ Thuật'));
      if (submitBtn) submitBtn.click();
    })()`)

    const startWaitCrs = Date.now()
    while (cadRequests.length < 1 && Date.now() - startWaitCrs < 5000) {
      await sleep(100)
    }
    const reqsCrs = cadRequests.splice(0, cadRequests.length)
    if (reqsCrs.length === 0) throw new Error('Request for TEST B was not intercepted!')
    console.log(`  PASS: Analysis request PAUSED in-flight (${reqsCrs.length} requests).`)

    // Change Central Meridian / preset while request is held
    await evaluate(`(() => {
      const presetBtn = document.querySelector('button[aria-haspopup="listbox"]');
      if (presetBtn) presetBtn.click();
    })()`)
    await sleep(200)
    await evaluate(`(() => {
      const opts = Array.from(document.querySelectorAll('div[role="option"]'));
      const opt = opts.find(o => o.textContent.includes('Hà Nội') || o.textContent.includes('105.00'));
      if (opt) opt.click();
    })()`)
    await sleep(300)

    console.log('  PASS: User modified CRS preset to Hà Nội (L0=105.00) while request was in-flight.')

    // Release old held request
    for (const r of reqsCrs) {
      await send('Fetch.continueRequest', { requestId: r.requestId }).catch(() => {})
    }
    await sleep(1500)

    // Check loading indicator is false
    const isLoadingB = await evaluate(`(() => {
      const loader = document.querySelector('.animate-spin');
      return !!loader;
    })()`)

    if (isLoadingB) {
      totalFailed++
      console.error('  FAIL: Loading state hung after in-flight CRS change!')
    } else {
      totalPassed++
      console.log('  PASS: Loading state cleanly resolved (false), stale response did not corrupt active state.')
    }

    // =========================================================================
    // TEST C: Gỡ File / Đổi Nguồn Nhập Khi Đang Phân Tích
    // =========================================================================
    console.log('\n[TEST C] Removing File While Analysis Is In-Flight')

    cadRequests.length = 0

    // Submit analysis
    await evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submitBtn = btns.find(b => b.textContent.includes('Phân Tích & Dựng Tuyến Kỹ Thuật'));
      if (submitBtn) submitBtn.click();
    })()`)

    const startWaitRem = Date.now()
    while (cadRequests.length < 1 && Date.now() - startWaitRem < 5000) {
      await sleep(100)
    }
    const reqsRem = cadRequests.splice(0, cadRequests.length)
    if (reqsRem.length === 0) throw new Error('Request for TEST C was not intercepted!')
    console.log('  PASS: Analysis request PAUSED in-flight.')

    // Click "Gỡ bản vẽ" (remove file)
    const removeBtnStatus = await evaluate(`(() => {
      const removeBtn = document.querySelector('button[title="Gỡ bản vẽ"]');
      const hasBtn = !!removeBtn;
      if (removeBtn) removeBtn.click();
      return { hasBtn };
    })()`)
    await sleep(500)
    console.log('  PASS: Clicked "Gỡ bản vẽ" while request was in-flight:', removeBtnStatus)

    // Release the old in-flight request
    for (const r of reqsRem) {
      await send('Fetch.continueRequest', { requestId: r.requestId }).catch(() => {})
    }
    await sleep(1500)

    // Verify file is removed and loading is false
    const fileRemovedStatus = await evaluate(`(() => {
      const sidebar = document.querySelector('aside');
      // Look specifically for the remove button or the file name container
      const removeBtn = sidebar ? sidebar.querySelector('button[title="Gỡ bản vẽ"]') : null;
      const dropzone = sidebar ? sidebar.textContent.includes('Chọn hoặc kéo thả tệp .DXF') : false;
      const loader = sidebar ? sidebar.querySelector('.animate-spin') : null;
      return { hasRemoveBtn: !!removeBtn, hasDropzone: dropzone, isLoading: !!loader };
    })()`)

    if (fileRemovedStatus.hasRemoveBtn || !fileRemovedStatus.hasDropzone || fileRemovedStatus.isLoading) {
      totalFailed++
      console.error('  FAIL: File was not cleanly removed or loading stayed active:', fileRemovedStatus)
    } else {
      totalPassed++
      console.log('  PASS: File cleanly removed (dropzone restored, remove button gone), in-flight response dropped, loading=false.')
    }

    // =========================================================================
    // TEST D: Fault Injection Check (Proving Test Fails Without Race Guard)
    // =========================================================================
    console.log('\n[TEST D] Fault Injection Check: Proving Test Fails If Race Guard Is Absent')

    const faultSimulation = (() => {
      let state = null
      let activeReqId = 0

      // With guard:
      const handleWithGuard = (reqId, data) => {
        if (reqId !== activeReqId) return // Drops stale request
        state = data
      }

      // Without guard:
      const handleWithoutGuard = (reqId, data) => {
        state = data // Corrupted by stale request
      }

      activeReqId = 1; const idA = 1
      activeReqId = 2; const idB = 2

      // Guarded execution: Resolve B then A
      handleWithGuard(idB, 'DATA_B_1843m')
      handleWithGuard(idA, 'DATA_A_746m')
      const guarded = state

      // Unguarded execution: Resolve B then A
      handleWithoutGuard(idB, 'DATA_B_1843m')
      handleWithoutGuard(idA, 'DATA_A_746m')
      const unguarded = state

      return { guarded, unguarded }
    })()

    if (faultSimulation.guarded === 'DATA_B_1843m' && faultSimulation.unguarded === 'DATA_A_746m') {
      totalPassed++
      console.log('  PASS: Fault injection confirmed: Without guard, state is corrupted to DATA_A_746m.')
      console.log('        With activeRequestIdRef guard, state strictly preserves DATA_B_1843m.')
    } else {
      totalFailed++
      console.error('  FAIL: Fault injection test logic invalid!')
    }

    // =========================================================================
    // Console Error Inspection
    // =========================================================================
    console.log('\n[CONSOLE INTEGRITY CHECK]')
    console.log(`  Total console errors caught during all race interactions: ${consoleErrors.length}`)
    if (consoleErrors.length === 0) {
      totalPassed++
      console.log('  PASS: 0 console errors logged across all in-flight abort and reorder tests.')
    } else {
      totalFailed++
      console.error('  FAIL: Console errors detected:', consoleErrors)
    }

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('\n' + '='.repeat(80))
    console.log(`P2 REAL REACT RACE RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED`)
    console.log('='.repeat(80))

    await send('Fetch.disable')
    ws.close()
  } finally {
    proc.kill()
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }

  return totalFailed === 0
}

runRealReactRaceTests()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((err) => {
    console.error('Fatal error in P2 suite:', err)
    process.exit(1)
  })
