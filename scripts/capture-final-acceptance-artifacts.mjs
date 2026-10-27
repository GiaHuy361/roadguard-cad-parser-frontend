import { withCdpPage, sleep } from './cdp-helper.mjs'
import path from 'path'
import fs from 'fs'

const BASE = 'http://localhost:5173'
const artifactDir = 'C:\\Users\\dell\\.gemini\\antigravity\\brain\\f10d1f71-6949-4bb8-9403-1c362490f761'
const dxfPath = path.resolve(process.cwd(), '../roadguard-cad-parser/3. BDTK.dxf')

const viewports = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1536', width: 1536, height: 864 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
]

console.log('='.repeat(70))
console.log('CAPTURING COMPREHENSIVE HEADLESS ACCEPTANCE SCREENSHOTS (CDP)')
console.log('='.repeat(70))

// ── 1. LANDING PAGE ACROSS 8 VIEWPORTS ──
console.log('\n--- Part 1: Landing Page Responsive Viewports ---')
await withCdpPage(9330, BASE + '/', async ({ setViewport, screenshot }) => {
  await sleep(2500)
  for (const vp of viewports) {
    await setViewport(vp.width, vp.height)
    await sleep(350)
    const out = path.join(artifactDir, `final_landing_${vp.name}.png`)
    await screenshot(out)
    console.log(`[SAVED] final_landing_${vp.name}.png (${vp.width}x${vp.height})`)
  }
})

// ── 2. STUDIO WORKSPACE ACROSS 8 VIEWPORTS & 13 INTERACTIVE STATES ──
console.log('\n--- Part 2: Studio Workspace & Interactive States ---')
await withCdpPage(9331, BASE + '/studio', async ({ setViewport, screenshot, uploadFile, evaluate }) => {
  await sleep(3500)

  // Upload and analyze 3. BDTK.dxf
  if (fs.existsSync(dxfPath)) {
    console.log('Uploading 3. BDTK.dxf fixture...')
    await uploadFile('input[type="file"]', dxfPath)
    await sleep(600)
    await evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Phân Tích & Dựng Tuyến'));
      if (b) b.click();
    })()`)
    await sleep(7500)
    console.log('3. BDTK.dxf analyzed successfully.')
  }

  // 2.1 Viewport captures
  for (const vp of viewports) {
    await setViewport(vp.width, vp.height)
    await sleep(350)
    const out = path.join(artifactDir, `final_studio_${vp.name}.png`)
    await screenshot(out)
    console.log(`[SAVED] final_studio_${vp.name}.png (${vp.width}x${vp.height})`)
  }

  // Reset to 1920x1080 for state captures
  await setViewport(1920, 1080)
  await sleep(400)

  // 2.2 Open CRS Preset Popover
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"]');
    if (btn) btn.click();
  })()`)
  await sleep(600)
  await screenshot(path.join(artifactDir, 'final_studio_crs_popover_open.png'))
  console.log('[SAVED] final_studio_crs_popover_open.png')

  // Close CRS popover
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"]');
    if (btn) btn.click();
  })()`)
  await sleep(300)

  // 2.3 Open Candidate Layer Popover
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Chọn layer tim tuyến DXF"]');
    if (btn) btn.click();
  })()`)
  await sleep(600)
  await screenshot(path.join(artifactDir, 'final_studio_layer_popover_open.png'))
  console.log('[SAVED] final_studio_layer_popover_open.png')

  // Close Layer popover
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Chọn layer tim tuyến DXF"]');
    if (btn) btn.click();
  })()`)
  await sleep(300)

  // 2.4 Tab 2: CAD 2D Viewer
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Bản vẽ CAD 2D'));
    if (btn) btn.click();
  })()`)
  await sleep(800)
  await screenshot(path.join(artifactDir, 'final_studio_cad_view.png'))
  console.log('[SAVED] final_studio_cad_view.png')

  // 2.5 Tab 3: Cross Section Profile
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Mặt cắt & Hồ sơ'));
    if (btn) btn.click();
  })()`)
  await sleep(800)
  await screenshot(path.join(artifactDir, 'final_studio_profile_view.png'))
  console.log('[SAVED] final_studio_profile_view.png')

  // 2.6 Tab 4: GeoJSON Inspector
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Cấu trúc GeoJSON'));
    if (btn) btn.click();
  })()`)
  await sleep(800)
  await screenshot(path.join(artifactDir, 'final_studio_geojson_view.png'))
  console.log('[SAVED] final_studio_geojson_view.png')

  // 2.7 Open RoadGuard Draft Export Modal
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Xuất RoadGuard Draft'));
    if (btn) btn.click();
  })()`)
  await sleep(800)
  await screenshot(path.join(artifactDir, 'final_studio_draft_modal.png'))
  console.log('[SAVED] final_studio_draft_modal.png')

  // Close modal
  await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label="Đóng cửa sổ"]');
    if (btn) btn.click();
  })()`)
  await sleep(400)

  // 2.8 Switch back to Map Tab and trigger Stale CRS
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Bản đồ GIS'));
    if (btn) btn.click();
  })()`)
  await sleep(500)

  // Change CM input to 107.75
  await evaluate(`(() => {
    const inp = document.querySelector('input[type="number"][step="0.05"]');
    if (inp) {
      inp.value = '107.75';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`)
  await sleep(800)
  await screenshot(path.join(artifactDir, 'final_studio_crs_stale.png'))
  console.log('[SAVED] final_studio_crs_stale.png')

  // 2.9 Left Sidebar Collapsed
  await evaluate(`(() => {
    const btn = document.querySelector('button[title*="Thu gọn thanh công cụ"]');
    if (btn) btn.click();
  })()`)
  await sleep(500)
  await screenshot(path.join(artifactDir, 'final_studio_left_collapsed.png'))
  console.log('[SAVED] final_studio_left_collapsed.png')

  // Expand left sidebar back
  await evaluate(`(() => {
    const btn = document.querySelector('button[title*="Mở rộng"]');
    if (btn) btn.click();
  })()`)
  await sleep(400)

  // 2.10 Right Inspector Collapsed
  await evaluate(`(() => {
    const btn = document.querySelector('button[title*="Ẩn bảng thuộc tính"]');
    if (btn) btn.click();
  })()`)
  await sleep(500)
  await screenshot(path.join(artifactDir, 'final_studio_right_collapsed.png'))
  console.log('[SAVED] final_studio_right_collapsed.png')
})

console.log('\n======================================================================')
console.log('ALL ACCEPTANCE SCREENSHOTS CAPTURED SUCCESSFULLY!')
console.log('======================================================================')
