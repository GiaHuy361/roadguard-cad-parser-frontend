import { withCdpPage, sleep } from './cdp-helper.mjs'
import path from 'path'
import fs from 'fs'

const BASE = 'http://localhost:5173'
const dxfPath = path.resolve(process.cwd(), '../roadguard-cad-parser/3. BDTK.dxf')
const results = []

function assert(desc, condition, detail = null) {
  if (condition) {
    console.log(`[PASS] ${desc}`)
    results.push({ desc, pass: true })
  } else {
    console.error(`[FAIL] ${desc}`, detail || '')
    results.push({ desc, pass: false, detail })
    throw new Error(`Assertion failed: ${desc}`)
  }
}

const stateQuery = `(() => {
  const isVisible = (el) => !!el && !el.closest('[hidden]') && el.getClientRects().length > 0;
  const landing = document.querySelector('.landing');
  const studioHeader = Array.from(document.querySelectorAll('header')).find(h => 
    h.querySelector('nav[aria-label="Chế độ hiển thị không gian làm việc"]')
  );
  const homeBtn = Array.from(document.querySelectorAll('header a')).find(a => 
    a.textContent.includes('Về Cửa Ngõ') || a.getAttribute('title')?.includes('Về trang giới thiệu')
  );
  return {
    pathname: window.location.pathname,
    hash: window.location.hash,
    landingVisible: isVisible(landing),
    studioVisible: isVisible(studioHeader),
    hasHomeBtn: !!homeBtn,
    title: document.title,
    hasContent: document.body.innerText.length > 50
  };
})()`

const clickButtonByText = (text) => `(() => {
  const btns = Array.from(document.querySelectorAll('button, a'));
  const target = btns.find(b => !b.closest('[hidden]') && b.textContent.includes(${JSON.stringify(text)}));
  if (target) {
    target.click();
    return true;
  }
  return false;
})()`

async function waitForStudio(evaluate, maxWaitMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const s = await evaluate(stateQuery)
    if (s.studioVisible) return s
    await sleep(400)
  }
  return await evaluate(stateQuery)
}

async function waitForLanding(evaluate, maxWaitMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const s = await evaluate(stateQuery)
    if (s.landingVisible) return s
    await sleep(400)
  }
  return await evaluate(stateQuery)
}

console.log('======================================================================')
console.log('CAD & GIS STUDIO — SPA ROUTING & HEADLESS BROWSER VERIFICATION')
console.log('======================================================================')

// ── Test Suite 1: Direct Landing Load & Navigation to Studio ──
await withCdpPage(9301, BASE + '/', async ({ evaluate, uploadFile, send, consoleErrors }) => {
  await sleep(2500)
  let s = await evaluate(stateQuery)
  assert('T1.1: Direct GET / loads Landing Page', s.landingVisible && !s.studioVisible && s.pathname === '/', s)
  assert('T1.2: Document title is set for Landing Page', s.title.includes('CAD & GIS STUDIO'), s.title)

  // Click CTA to open Studio
  const clickedCta = await evaluate(clickButtonByText('Khởi Chạy Studio')) || await evaluate(clickButtonByText('Mở CAD & GIS STUDIO')) || await evaluate(clickButtonByText('Mở Studio'))
  assert('T1.3: CTA button clicked successfully', clickedCta === true)

  s = await waitForStudio(evaluate)
  assert('T1.4: Navigated to /studio and Studio workspace is visible', s.studioVisible && !s.landingVisible && s.pathname === '/studio', s)
  assert('T1.5: "Về Cửa Ngõ" button is present in Studio header', s.hasHomeBtn, s)

  // Click Về Cửa Ngõ to return to Landing
  const clickedHome = await evaluate(clickButtonByText('Về Cửa Ngõ'))
  assert('T1.6: Clicked "Về Cửa Ngõ" in Studio header', clickedHome === true)

  s = await waitForLanding(evaluate)
  assert('T1.7: Returned to Landing Page at / cleanly', s.landingVisible && !s.studioVisible && s.pathname === '/', s)
})

// ── Test Suite 2: Direct /studio Access & Data Session Persistence ──
await withCdpPage(9302, BASE + '/studio', async ({ evaluate, uploadFile, send, consoleErrors }) => {
  let s = await waitForStudio(evaluate)
  assert('T2.1: Direct GET /studio loads Studio workspace without 404', s.studioVisible && !s.landingVisible && s.pathname === '/studio', s)

  if (fs.existsSync(dxfPath)) {
    await uploadFile('input[type="file"]', dxfPath)
    await sleep(600)
    await evaluate(clickButtonByText('Phân Tích & Dựng Tuyến'))
    await sleep(8000)

    const checkLength = await evaluate(`(() => /746[.,]57/.test(document.body.innerText))()`)
    assert('T2.2: Analyzed 3. BDTK.dxf in /studio and rendered 746.57m', checkLength === true)

    // Navigate to Landing
    await evaluate(clickButtonByText('Về Cửa Ngõ'))
    s = await waitForLanding(evaluate)
    assert('T2.3: Navigated back to Landing Page', s.landingVisible && s.pathname === '/')

    // Return to Studio via CTA
    await evaluate(clickButtonByText('Mở Studio'))
    s = await waitForStudio(evaluate)
    const retainedLength = await evaluate(`(() => /746[.,]57/.test(document.body.innerText))()`)
    assert('T2.4: Returned to /studio with session data fully preserved (746.57m still mounted)', s.studioVisible && retainedLength === true)
  }

  // Test browser History back and forward
  await evaluate('history.back()')
  s = await waitForLanding(evaluate)
  assert('T2.5: Browser back returns to Landing Page', s.landingVisible && s.pathname === '/')

  await evaluate('history.forward()')
  s = await waitForStudio(evaluate)
  assert('T2.6: Browser forward returns to Studio workspace', s.studioVisible && s.pathname === '/studio')
})

console.log('======================================================================')
console.log(`ALL ${results.length}/${results.length} SPA ROUTING TESTS PASSED!`)
console.log('======================================================================')
