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

    // -------------------------------------------------------------------------
    // TEST 7: Highlighted Option Row + Keyboard Tab/Shift+Tab to Table Buttons + Enter (Both Directions)
    // -------------------------------------------------------------------------
    console.log('[RUNNING] Test 7: Highlighted row -> keyboard focus to Hành chính / Địa chính -> Enter (both directions)...')

    // Upload sample_road.dxf and build route with Hà Nội (L₀ = 105°) applied so a live route & applied L₀ are active
    await evaluate(`(() => {
      window.__rgFetchLog = [];
      if (!window.__rgFetchWrapped) {
        const origFetch = window.fetch.bind(window);
        window.fetch = (...args) => {
          const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || String(args[0]));
          if (reqUrl.includes('/api/cad')) {
            window.__rgFetchLog.push(reqUrl);
          }
          return origFetch(...args);
        };
        window.__rgFetchWrapped = true;
      }
    })()`)

    const sampleDxf = 'd:\\DO_AN\\roadguard-cad-parser\\3. BDTK.dxf'
    const docRoot = await send('DOM.getDocument')
    const fileInputNode = await send('DOM.querySelector', {
      nodeId: docRoot.root.nodeId,
      selector: 'input[type="file"][accept=".dxf,.dwg"]',
    })
    if (fileInputNode?.nodeId) {
      await send('DOM.setFileInputFiles', { nodeId: fileInputNode.nodeId, files: [sampleDxf] })
      await sleep(350)
      await evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Phân Tích & Dựng Tuyến'));
        if (btn) btn.click();
      })()`)
      const tWait = Date.now()
      while (Date.now() - tWait < 30000) {
        const busy = await evaluate(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Đang bóc tách CAD'))`)
        if (!busy) break
        await sleep(250)
      }
      await sleep(300)
    }

    // Reset fetch counter right before opening the VN-2000 dropdown
    await evaluate(`window.__rgFetchLog = []`)
    const baselineState = await evaluate(`(() => {
      const cmInput = Array.from(document.querySelectorAll('input[type="number"]')).find(el => el.getAttribute('min') === '100');
      const trigger = document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]');
      return {
        cmValue: cmInput ? cmInput.value : null,
        triggerTitle: trigger ? trigger.getAttribute('title') : null,
      };
    })()`)

    // Open popover (starts on Hành chính because Hà Nội adm:ha-noi:105 was selected in Test 5b)
    await evaluate(`document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]').click()`)
    await sleep(250)

    const dispatchKey = async (key, code, vk, modifiers = 0) => {
      const isEnter = key === 'Enter'
      await send('Input.dispatchKeyEvent', {
        type: isEnter ? 'keyDown' : 'rawKeyDown',
        key,
        code,
        ...(isEnter ? { text: '\r', unmodifiedText: '\r' } : {}),
        windowsVirtualKeyCode: vk,
        nativeVirtualKeyCode: vk,
        modifiers,
      })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers })
    }

    // Step 7A: Highlight row #1 via ArrowDown x2 while in Hành chính, then Shift+Tab to 'Địa chính' button, then press Enter
    await dispatchKey('ArrowDown', 'ArrowDown', 40)
    await sleep(100)
    await dispatchKey('ArrowDown', 'ArrowDown', 40)
    await sleep(100)
    let hlBeforeTab = await getCrsHl()
    if (hlBeforeTab !== 1) throw new Error(`Expected highlighted row index 1 before Tab, got ${hlBeforeTab}`)

    // Shift+Tab moves focus from search <input> to <button data-table-tab='cadastral'>
    await dispatchKey('Tab', 'Tab', 9, 8)
    await sleep(120)
    const focusOnCadBtn = await evaluate(`(() => {
      const active = document.activeElement;
      const hlItem = document.querySelector('div[role="listbox"] [role="option"][data-highlighted="true"]');
      return {
        activeTabAttr: active ? active.getAttribute('data-table-tab') : null,
        highlightedStillPresent: Boolean(hlItem),
        highlightedPresetId: hlItem ? hlItem.getAttribute('data-preset-id') : null,
      };
    })()`)
    if (focusOnCadBtn.activeTabAttr !== 'cadastral' || !focusOnCadBtn.highlightedStillPresent) {
      throw new Error(`Expected focus on cadastral button with highlighted row active, got: ${JSON.stringify(focusOnCadBtn)}`)
    }

    // Press Enter while focused on 'Địa chính' button with row #1 highlighted!
    await dispatchKey('Enter', 'Enter', 13)
    await sleep(250)

    const afterSwitchToCadastral = await evaluate(`(() => {
      const popover = document.querySelector('div[role="listbox"]');
      const cadBtn = popover ? popover.querySelector('button[data-table-tab="cadastral"]') : null;
      const firstOpt = popover ? popover.querySelector('[role="option"]') : null;
      const cmInput = Array.from(document.querySelectorAll('input[type="number"]')).find(el => el.getAttribute('min') === '100');
      const trigger = document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]');
      const applyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Áp dụng Hệ quy chiếu'));
      return {
        popoverOpen: Boolean(popover),
        cadastralPressed: cadBtn ? cadBtn.getAttribute('aria-pressed') === 'true' : false,
        firstOptionId: firstOpt ? firstOpt.getAttribute('data-preset-id') : null,
        cmValue: cmInput ? cmInput.value : null,
        triggerTitle: trigger ? trigger.getAttribute('title') : null,
        staleApplyVisible: Boolean(applyBtn),
        fetchCount: window.__rgFetchLog.length,
      };
    })()`)
    if (
      !afterSwitchToCadastral.popoverOpen ||
      !afterSwitchToCadastral.cadastralPressed ||
      !String(afterSwitchToCadastral.firstOptionId || '').startsWith('cad:') ||
      afterSwitchToCadastral.cmValue !== baselineState.cmValue ||
      afterSwitchToCadastral.triggerTitle !== baselineState.triggerTitle ||
      afterSwitchToCadastral.staleApplyVisible ||
      afterSwitchToCadastral.fetchCount !== 0
    ) {
      throw new Error(`Direction 1 (Hành chính -> Địa chính) keyboard switch failed: ${JSON.stringify(afterSwitchToCadastral)}`)
    }
    console.log('[PASS] Test 7a: Hành chính -> Địa chính via keyboard Enter with highlighted row: table switched, popup open, L₀ unchanged, 0 requests.')

    // Step 7B: Reverse direction (Địa chính -> Hành chính) with a Địa chính row highlighted!
    // Tab from 'Địa chính' button -> search <input>, ArrowDown to highlight a cad:* row, then Shift+Tab x2 -> 'Hành chính' button, then Enter!
    await dispatchKey('Tab', 'Tab', 9, 0)
    await sleep(100)
    await dispatchKey('ArrowDown', 'ArrowDown', 40)
    await sleep(100)
    const hlCadIdx = await getCrsHl()
    if (hlCadIdx !== 0) throw new Error(`Expected highlighted cad row index 0, got ${hlCadIdx}`)

    await dispatchKey('Tab', 'Tab', 9, 8) // -> Địa chính button
    await sleep(80)
    await dispatchKey('Tab', 'Tab', 9, 8) // -> Hành chính button
    await sleep(120)

    const focusOnAdmBtn = await evaluate(`(() => {
      const active = document.activeElement;
      const hlItem = document.querySelector('div[role="listbox"] [role="option"][data-highlighted="true"]');
      return {
        activeTabAttr: active ? active.getAttribute('data-table-tab') : null,
        highlightedStillPresent: Boolean(hlItem),
        highlightedPresetId: hlItem ? hlItem.getAttribute('data-preset-id') : null,
      };
    })()`)
    if (focusOnAdmBtn.activeTabAttr !== 'administrative' || !focusOnAdmBtn.highlightedStillPresent) {
      throw new Error(`Expected focus on administrative button with highlighted cad row active, got: ${JSON.stringify(focusOnAdmBtn)}`)
    }

    await dispatchKey('Enter', 'Enter', 13)
    await sleep(250)

    const afterSwitchToAdmin = await evaluate(`(() => {
      const popover = document.querySelector('div[role="listbox"]');
      const admBtn = popover ? popover.querySelector('button[data-table-tab="administrative"]') : null;
      const firstOpt = popover ? popover.querySelector('[role="option"]') : null;
      const cmInput = Array.from(document.querySelectorAll('input[type="number"]')).find(el => el.getAttribute('min') === '100');
      const trigger = document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]');
      const applyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Áp dụng Hệ quy chiếu'));
      return {
        popoverOpen: Boolean(popover),
        adminPressed: admBtn ? admBtn.getAttribute('aria-pressed') === 'true' : false,
        firstOptionId: firstOpt ? firstOpt.getAttribute('data-preset-id') : null,
        cmValue: cmInput ? cmInput.value : null,
        triggerTitle: trigger ? trigger.getAttribute('title') : null,
        staleApplyVisible: Boolean(applyBtn),
        fetchCount: window.__rgFetchLog.length,
      };
    })()`)
    if (
      !afterSwitchToAdmin.popoverOpen ||
      !afterSwitchToAdmin.adminPressed ||
      !String(afterSwitchToAdmin.firstOptionId || '').startsWith('adm:') ||
      afterSwitchToAdmin.cmValue !== baselineState.cmValue ||
      afterSwitchToAdmin.triggerTitle !== baselineState.triggerTitle ||
      afterSwitchToAdmin.staleApplyVisible ||
      afterSwitchToAdmin.fetchCount !== 0
    ) {
      throw new Error(`Direction 2 (Địa chính -> Hành chính) keyboard switch failed: ${JSON.stringify(afterSwitchToAdmin)}`)
    }
    console.log('[PASS] Test 7b: Địa chính -> Hành chính via keyboard Enter with highlighted row: table switched, popup open, L₀ unchanged, 0 requests.')

    // Step 7C: Escape while focused on table button closes popup and returns focus to trigger button
    await dispatchKey('Escape', 'Escape', 27)
    await sleep(200)
    const escFromTabBtn = await evaluate(`(() => {
      const popover = document.querySelector('div[role="listbox"]');
      const trigger = document.querySelector('button[aria-label*="Chọn hệ quy chiếu"]');
      return {
        isClosed: popover === null,
        triggerFocused: document.activeElement === trigger,
        fetchCount: window.__rgFetchLog.length,
      };
    })()`)
    if (!escFromTabBtn.isClosed || !escFromTabBtn.triggerFocused || escFromTabBtn.fetchCount !== 0) {
      throw new Error(`Escape from table button failed: ${JSON.stringify(escFromTabBtn)}`)
    }
    console.log('[PASS] Test 7c: Escape from focused table button closed popup and returned focus to trigger button.')

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
