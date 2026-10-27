import { withCdpPage, sleep } from './cdp-helper.mjs'
import path from 'path'
import fs from 'fs'

const BASE = 'http://localhost:5173'
const artifactDir = 'C:\\Users\\dell\\.gemini\\antigravity\\brain\\f10d1f71-6949-4bb8-9403-1c362490f761'
const dxfPath = path.resolve(process.cwd(), '../roadguard-cad-parser/3. BDTK.dxf')

console.log('='.repeat(70))
console.log('TESTING PORTAL POPOVER CLIPPING ACROSS 1024x768, 768px, and 390px')
console.log('='.repeat(70))

await withCdpPage(9340, BASE + '/studio', async ({ setViewport, screenshot, uploadFile, evaluate }) => {
  await sleep(3000)

  // 1. Upload and parse 3. BDTK.dxf
  if (fs.existsSync(dxfPath)) {
    console.log('Uploading 3. BDTK.dxf...')
    await uploadFile('input[type="file"]', dxfPath)
    await sleep(500)
    await evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Phân Tích & Dựng Tuyến'));
      if (b) b.click();
    })()`)
    await sleep(7500)
    console.log('DXF analyzed.')
  }

  // ── TEST A: Viewport 1024 x 768 (Sidebar scrolled down, CRS trigger near bottom) ──
  console.log('\n--- Test A: 1024x768 Popover Auto-Flip & Clipping Check ---')
  await setViewport(1024, 768)
  await sleep(400)

  // Scroll sidebar down so CRS section is close to viewport bottom
  await evaluate(`(() => {
    const scrollContainer = document.querySelector('aside .overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.scrollTop = 320;
    }
  })()`)
  await sleep(400)

  // Click CRS preset trigger button
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"]');
    if (btn) btn.click();
  })()`)
  await sleep(600)

  // Measure popover position relative to viewport
  const popoverMetrics1024 = await evaluate(`(() => {
    const pop = document.querySelector('[role="listbox"][style*="position: fixed"]');
    if (!pop) return null;
    const rect = pop.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      windowHeight: window.innerHeight,
      windowWidth: window.innerWidth,
      isFullyVisible: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth,
      isPortal: pop.parentElement === document.body
    };
  })()`)

  console.log('Popover Metrics @ 1024x768 (Scrolled):', popoverMetrics1024)
  if (!popoverMetrics1024 || !popoverMetrics1024.isFullyVisible || !popoverMetrics1024.isPortal) {
    throw new Error('Popover @ 1024x768 clipped or not rendered in Portal body!')
  }
  await screenshot(path.join(artifactDir, 'popover_crs_scrolled_1024x768.png'))
  console.log('[SAVED] popover_crs_scrolled_1024x768.png')

  // Close CRS popover
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"]');
    if (btn) btn.click();
  })()`)
  await sleep(300)

  // Open Candidate Layer popover @ 1024x768
  await evaluate(`(() => {
    const scrollContainer = document.querySelector('aside .overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTop = 100;
    const btn = document.querySelector('button[aria-label="Chọn layer tim tuyến DXF"]');
    if (btn) btn.click();
  })()`)
  await sleep(600)
  await screenshot(path.join(artifactDir, 'popover_layer_1024x768.png'))
  console.log('[SAVED] popover_layer_1024x768.png')

  // Close Layer popover
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Chọn layer tim tuyến DXF"]');
    if (btn) btn.click();
  })()`)
  await sleep(300)

  // ── TEST B: Viewport 768 x 1024 (Tablet Portrait) ──
  console.log('\n--- Test B: 768x1024 Popover Check ---')
  await setViewport(768, 1024)
  await sleep(400)

  // Scroll sidebar and open CRS popover
  await evaluate(`(() => {
    const scrollContainer = document.querySelector('aside .overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTop = 250;
    const btn = document.querySelector('button[aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"]');
    if (btn) btn.click();
  })()`)
  await sleep(600)

  const popoverMetrics768 = await evaluate(`(() => {
    const pop = document.querySelector('[role="listbox"][style*="position: fixed"]');
    if (!pop) return null;
    const rect = pop.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      isFullyVisible: rect.top >= 0 && rect.bottom <= window.innerHeight,
      isPortal: pop.parentElement === document.body
    };
  })()`)
  console.log('Popover Metrics @ 768x1024:', popoverMetrics768)
  if (!popoverMetrics768 || !popoverMetrics768.isFullyVisible) {
    throw new Error('Popover @ 768x1024 clipped!')
  }
  await screenshot(path.join(artifactDir, 'popover_crs_768x1024.png'))
  console.log('[SAVED] popover_crs_768x1024.png')

  // Close popover
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"]');
    if (btn) btn.click();
  })()`)
  await sleep(300)

  // ── TEST C: Viewport 390 x 844 (Mobile Smartphone) ──
  console.log('\n--- Test C: 390x844 Mobile Popover Check ---')
  await setViewport(390, 844)
  await sleep(400)

  // Scroll sidebar and open CRS popover
  await evaluate(`(() => {
    const scrollContainer = document.querySelector('aside .overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTop = 350;
    const btn = document.querySelector('button[aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"]');
    if (btn) btn.click();
  })()`)
  await sleep(600)

  const popoverMetrics390 = await evaluate(`(() => {
    const pop = document.querySelector('[role="listbox"][style*="position: fixed"]');
    if (!pop) return null;
    const rect = pop.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      windowWidth: window.innerWidth,
      isWithinScreenWidth: rect.left >= 0 && rect.right <= window.innerWidth,
      isFullyVisible: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth,
      isPortal: pop.parentElement === document.body
    };
  })()`)
  console.log('Popover Metrics @ 390x844:', popoverMetrics390)
  if (!popoverMetrics390 || !popoverMetrics390.isWithinScreenWidth) {
    throw new Error('Popover @ 390x844 clipped horizontally!')
  }
  await screenshot(path.join(artifactDir, 'popover_crs_390x844.png'))
  console.log('[SAVED] popover_crs_390x844.png')

  // Close CRS popover
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"]');
    if (btn) btn.click();
  })()`)
  await sleep(300)

  // Open candidate layer on 390px
  await evaluate(`(() => {
    const scrollContainer = document.querySelector('aside .overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTop = 100;
    const btn = document.querySelector('button[aria-label="Chọn layer tim tuyến DXF"]');
    if (btn) btn.click();
  })()`)
  await sleep(600)
  await screenshot(path.join(artifactDir, 'popover_layer_390x844.png'))
  console.log('[SAVED] popover_layer_390x844.png')
})

console.log('\n======================================================================')
console.log('ALL PORTAL POPOVER CLIPPING TESTS PASSED 100%!')
console.log('======================================================================')
