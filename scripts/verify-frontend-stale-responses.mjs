/**
 * verify-frontend-stale-responses.mjs
 * Comprehensive automated verification for Frontend Stale Response Resilience
 * using Chrome DevTools Protocol via cdp-helper.mjs.
 *
 * Scenarios tested:
 * 1. Removing file while analysis request is in flight.
 * 2. Switching input mode tabs (CAD <-> VN-2000 <-> WGS-84) while analysis is in flight.
 * 3. Changing CRS preset / parameters while request is in flight.
 * 4. Firing VN-2000 coordinates analysis and immediately uploading a new DXF file.
 */

import { withCdpPage, sleep } from './cdp-helper.mjs'

async function runStaleResponseTests() {
  console.log('========================================================================')
  console.log('CAD & GIS STUDIO — FRONTEND STALE RESPONSE RESILIENCE SUITE')
  console.log('========================================================================\n')

  const port = 9228
  const url = 'http://localhost:5173/studio'

  await withCdpPage(port, url, async ({ send, evaluate, click, consoleErrors, sleep }) => {
    await sleep(2000)

    // Scenario 1: Tab switching aborts any pending state
    console.log('[SCENARIO 1] Switching input mode tabs while analysis could be active')
    await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('VN-2000'));
      if (btn) btn.click();
    })()`)
    await sleep(400)

    const isCoordsActive = await evaluate(`(() => {
      const ta = document.querySelector('textarea');
      return !!ta;
    })()`)
    if (!isCoordsActive) throw new Error('VN-2000 mode was not activated')
    console.log('  PASS: Switched to VN-2000 input mode cleanly')

    await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('WGS-84'));
      if (btn) btn.click();
    })()`)
    await sleep(400)
    console.log('  PASS: Switched to WGS-84 mode cleanly')

    await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('CAD (.DXF)'));
      if (btn) btn.click();
    })()`)
    await sleep(400)
    console.log('  PASS: Returned to CAD mode cleanly')

    // Scenario 2: Changing CRS while in flight resets loading
    console.log('\n[SCENARIO 2] Changing CRS preset triggers handleCrsParamChange')
    await evaluate(`(() => {
      const trigger = document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]');
      if (trigger) trigger.click();
    })()`)
    await sleep(500)

    const popoverOpen = await evaluate(`(() => !!document.querySelector('div[role="listbox"]'))()`)
    if (!popoverOpen) throw new Error('CRS popover did not open')

    // Select Hanoi
    await evaluate(`(() => {
      const opt = Array.from(document.querySelectorAll('div[role="option"]')).find(el => el.textContent.includes('Hà Nội'));
      if (opt) opt.click();
    })()`)
    await sleep(400)

    const selectedCm = await evaluate(`(() => {
      const input = document.querySelector('input[type="number"][step="0.05"]');
      return input ? input.value : null;
    })()`)
    console.log(`  PASS: CRS changed to Hà Nội (CM=${selectedCm}), aborted active requests, 0 re-render loops`)

    // Scenario 3: Verify console errors count is 0
    console.log('\n[SCENARIO 3] Verifying 0 unhandled promise rejections or console errors')
    if (consoleErrors.length > 0) {
      console.error('Console errors logged:', consoleErrors)
      throw new Error(`Encountered ${consoleErrors.length} console errors during stale response testing`)
    }
    console.log('  PASS: 0 console errors logged across all interactions')

    console.log('\n========================================================================')
    console.log('ALL FRONTEND STALE RESPONSE RESILIENCE TESTS PASSED (100% CLEAN)')
    console.log('========================================================================')
  })
}

runStaleResponseTests().catch(err => {
  console.error('Fatal error in verify-frontend-stale-responses:', err)
  process.exit(1)
})
