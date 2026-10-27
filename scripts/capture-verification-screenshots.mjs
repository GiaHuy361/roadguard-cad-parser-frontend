import { withCdpPage, sleep } from './cdp-helper.mjs'
import path from 'path'
import fs from 'fs'

const BASE = 'http://localhost:5173'
const artifactDir = 'C:\\Users\\dell\\.gemini\\antigravity\\brain\\f10d1f71-6949-4bb8-9403-1c362490f761'
const dxfPath = path.resolve(process.cwd(), '../roadguard-cad-parser/3. BDTK.dxf')

const viewports = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 }
]

console.log('Capturing responsive screenshots for verification...')

// 1. Landing Page
await withCdpPage(9320, BASE + '/', async ({ setViewport, screenshot }) => {
  await sleep(2500)
  for (const vp of viewports) {
    await setViewport(vp.width, vp.height)
    await sleep(300)
    const out = path.join(artifactDir, `final_landing_${vp.name}.png`)
    await screenshot(out)
    console.log(`Saved: final_landing_${vp.name}.png`)
  }
})

// 2. Studio Workspace with 3. BDTK.dxf
await withCdpPage(9321, BASE + '/studio', async ({ setViewport, screenshot, uploadFile, evaluate }) => {
  await sleep(3500)
  if (fs.existsSync(dxfPath)) {
    await uploadFile('input[type="file"]', dxfPath)
    await sleep(500)
    await evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Phân Tích & Dựng Tuyến'));
      if (b) b.click();
    })()`)
    await sleep(7500)
  }

  for (const vp of viewports) {
    await setViewport(vp.width, vp.height)
    await sleep(400)
    const out = path.join(artifactDir, `final_studio_${vp.name}.png`)
    await screenshot(out)
    console.log(`Saved: final_studio_${vp.name}.png`)
  }
})

console.log('Finished capturing all responsive verification screenshots!')
