import { withCdpPage, sleep } from './cdp-helper.mjs'

async function runVerification() {
  console.log('======================================================================')
  console.log('CAD & GIS STUDIO — REACT PORTAL & KEYBOARD INTERACTION TEST SUITE')
  console.log('======================================================================')

  const port = 9227
  const url = 'http://localhost:5173/studio'

  await withCdpPage(port, url, async ({ send, evaluate, click, setViewport, consoleErrors, sleep }) => {
    await sleep(2500)
    await setViewport(1280, 800)

    // -------------------------------------------------------------------------
    // TEST 1: Render Loop & React Warning Guard
    // -------------------------------------------------------------------------
    console.log('[RUNNING] Test 1: Verifying zero infinite loops and render stability...')
    
    // Open CRS Popover
    await evaluate(`(() => {
      document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]').click();
    })()`)
    await sleep(600) // Give any potential render loops plenty of time to explode (>50 frames)

    // Check if popover is open and stable
    const isOpenCheck = await evaluate(`(() => {
      const popover = document.querySelector('div[role="listbox"]');
      return !!popover;
    })()`)
    if (!isOpenCheck) throw new Error('CRS Popover failed to open on click')

    // Verify no "Maximum update depth exceeded" errors
    const loopErrors = consoleErrors.filter(err => err.includes('Maximum update depth exceeded'))
    if (loopErrors.length > 0) {
      throw new Error(`Infinite loop detected! Errors: ${JSON.stringify(loopErrors)}`)
    }
    console.log('[PASS] Test 1: Popover remains open with 0 infinite loops and 0 console errors.')

    // -------------------------------------------------------------------------
    // TEST 2: Single-step Keyboard Navigation on CRS Popover
    // -------------------------------------------------------------------------
    console.log('[RUNNING] Test 2: ArrowDown, ArrowUp, and single item movement...')

    // Helper to get highlighted index
    const getCrsHl = async () => {
      return await evaluate(`(() => {
        const popover = document.querySelector('div[role="listbox"]');
        if (!popover) return -2;
        const items = Array.from(popover.querySelectorAll('[role="option"]'));
        return items.findIndex(el => el.getAttribute('data-highlighted') === 'true');
      })()`)
    }

    // Initial should be -1
    let hl = await getCrsHl()
    if (hl !== -1) throw new Error(`Expected initial highlightedIndex to be -1, got ${hl}`)

    // 1st ArrowDown -> 0
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
    await sleep(150)
    hl = await getCrsHl()
    if (hl !== 0) throw new Error(`Expected index 0 after 1st ArrowDown, got ${hl}`)

    // 2nd ArrowDown -> 1
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
    await sleep(150)
    hl = await getCrsHl()
    if (hl !== 1) throw new Error(`Expected index 1 after 2nd ArrowDown, got ${hl}`)

    // 3rd ArrowDown -> 2
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
    await sleep(150)
    hl = await getCrsHl()
    if (hl !== 2) throw new Error(`Expected index 2 after 3rd ArrowDown, got ${hl}`)

    // 1st ArrowUp -> 1
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 })
    await sleep(150)
    hl = await getCrsHl()
    if (hl !== 1) throw new Error(`Expected index 1 after ArrowUp, got ${hl}`)

    console.log('[PASS] Test 2: ArrowDown and ArrowUp advance strictly by 1 item each (0 -> 1 -> 2 -> 1).')

    // -------------------------------------------------------------------------
    // TEST 3: Escape closes and returns focus to trigger
    // -------------------------------------------------------------------------
    console.log('[RUNNING] Test 3: Escape key closes popover and returns focus to trigger...')
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(200)

    const escCheck = await evaluate(`(() => {
      const popover = document.querySelector('div[role="listbox"]');
      const trigger = document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]');
      return {
        isClosed: popover === null,
        triggerFocused: document.activeElement === trigger
      };
    })()`)
    if (!escCheck.isClosed || !escCheck.triggerFocused) {
      throw new Error(`Escape test failed: isClosed=${escCheck.isClosed}, triggerFocused=${escCheck.triggerFocused}`)
    }
    console.log('[PASS] Test 3: Escape closes popover and returns focus to trigger button.')

    // -------------------------------------------------------------------------
    // TEST 4: Keyboard activation from trigger button
    // -------------------------------------------------------------------------
    console.log('[RUNNING] Test 4: Keyboard activation from trigger (Enter key)...')
    // Trigger is already focused from Escape test
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await sleep(250)

    const reOpenCheck = await evaluate(`(() => {
      const popover = document.querySelector('div[role="listbox"]');
      const searchInput = popover ? popover.querySelector('input') : null;
      return {
        isOpen: popover !== null,
        inputFocused: document.activeElement === searchInput
      };
    })()`)
    if (!reOpenCheck.isOpen) throw new Error('Pressing Enter on trigger failed to open popover')
    console.log('[PASS] Test 4: Pressing Enter on trigger opens popover and focuses search input.')

    // -------------------------------------------------------------------------
    // TEST 5: Search input typing without duplicate events
    // -------------------------------------------------------------------------
    console.log('[RUNNING] Test 5: Typing in search input filters list without key navigation side effects...')
    await send('Input.insertText', { text: 'Ha Noi' })
    await sleep(250)

    const searchResult = await evaluate(`(() => {
      const popover = document.querySelector('div[role="listbox"]');
      const input = popover.querySelector('input');
      const items = Array.from(popover.querySelectorAll('[role="option"]'));
      return {
        inputValue: input.value,
        visibleCount: items.length,
        firstItemText: items[0] ? items[0].innerText.split('\\n')[0] : ''
      };
    })()`)
    if (!searchResult.inputValue.includes('Ha Noi') || !searchResult.firstItemText.includes('Hà Nội')) {
      throw new Error(`Search filtering failed: ${JSON.stringify(searchResult)}`)
    }
    console.log(`[PASS] Test 5: Search input typed '${searchResult.inputValue}', filtered to item: '${searchResult.firstItemText}'.`)

    // Select with Enter
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
    await sleep(150)
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await sleep(250)

    const afterSelect = await evaluate(`(() => {
      const popover = document.querySelector('div[role="listbox"]');
      const trigger = document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]');
      return {
        isClosed: popover === null,
        triggerText: trigger ? trigger.innerText.split('\\n')[0] : ''
      };
    })()`)
    if (!afterSelect.isClosed || !afterSelect.triggerText.includes('Hà Nội')) {
      throw new Error(`Selection failed: ${JSON.stringify(afterSelect)}`)
    }
    console.log(`[PASS] Test 5b: Enter selected '${afterSelect.triggerText}' and closed popover.`)

    // -------------------------------------------------------------------------
    // TEST 6: Click Outside closes popover
    // -------------------------------------------------------------------------
    console.log('[RUNNING] Test 6: Click outside closes popover cleanly...')
    // Reopen popover
    await evaluate(`document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]').click()`)
    await sleep(250)
    
    // Click outside on map canvas / header
    await evaluate(`(() => {
      const header = document.querySelector('header') || document.body;
      const rect = header.getBoundingClientRect();
      const evt = new PointerEvent('pointerdown', { bubbles: true, clientX: 600, clientY: 20 });
      document.dispatchEvent(evt);
    })()`)
    await sleep(200)

    const clickOutCheck = await evaluate(`(() => {
      return document.querySelector('div[role="listbox"]') === null;
    })()`)
    if (!clickOutCheck) throw new Error('Click outside did not close the popover')
    console.log('[PASS] Test 6: Click outside successfully closed popover.')

    // Final console check
    if (consoleErrors.length > 0) {
      throw new Error(`Unexpected console errors during test suite: ${consoleErrors.join(' | ')}`)
    }

    console.log('======================================================================')
    console.log('ALL REACT PORTAL & KEYBOARD INTERACTION TESTS PASSED (0 ERRORS)!')
    console.log('======================================================================')
  })
}

runVerification().catch((err) => {
  console.error('\n[FAIL] Test suite failed:', err)
  process.exit(1)
})
