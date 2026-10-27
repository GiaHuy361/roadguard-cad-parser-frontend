import { withCdpPage, sleep } from './cdp-helper.mjs'
import path from 'path'
import fs from 'fs'

const ARTIFACT_DIR = 'C:\\Users\\dell\\.gemini\\antigravity\\brain\\f10d1f71-6949-4bb8-9403-1c362490f761'

async function run() {
  console.log('======================================================================')
  console.log('TESTING & CAPTURING LANDING PAGE FOOTER ACROSS VIEWPORTS')
  console.log('======================================================================')

  const port = 9229
  const url = 'http://localhost:5173/'

  await withCdpPage(port, url, async ({ send, evaluate, setViewport, screenshot, consoleErrors, sleep }) => {
    await sleep(2000)

    const viewports = [
      { name: 'desktop_1920x1080', w: 1920, h: 1080, file: 'footer_desktop_1920x1080.png' },
      { name: 'desktop_1440x900', w: 1440, h: 900, file: 'footer_desktop_1440x900.png' },
      { name: 'tablet_1024x768', w: 1024, h: 768, file: 'footer_tablet_1024x768.png' },
      { name: 'mobile_390x844', w: 390, h: 844, file: 'footer_mobile_390x844.png' }
    ]

    for (const vp of viewports) {
      console.log(`\nTesting viewport: ${vp.name} (${vp.w}x${vp.h})...`)
      await setViewport(vp.w, vp.h)
      await sleep(250)

      // Scroll footer into view inside the .landing scroll container
      await evaluate(`(() => {
        const footer = document.querySelector('footer');
        if (footer) {
          footer.scrollIntoView({ block: 'end', behavior: 'instant' });
        }
      })()`)
      await sleep(400)

      // Validate footer structure & viewport visibility
      const validation = await evaluate(`(() => {
        const footer = document.querySelector('footer');
        if (!footer) return { exists: false };
        const rect = footer.getBoundingClientRect();
        const hasImg = footer.querySelector('img') !== null;
        const text = footer.innerText;
        const hasOpenStudio = text.includes('Mở Studio');
        const hasVersion = text.includes('v2.5');
        const hasBrandCopy = text.includes('CAD & GIS STUDIO') && text.includes('Không gian xử lý dữ liệu kỹ thuật');
        const hasSpecs = text.includes('DXF · VN-2000 · WGS-84 · GeoJSON');

        // Check horizontal overflow
        const overflow = document.documentElement.scrollWidth > window.innerWidth || footer.scrollWidth > window.innerWidth;

        // Check if footer is visible in viewport
        const isVisibleInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        return {
          exists: true,
          rect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) },
          hasImg,
          hasOpenStudio,
          hasVersion,
          hasBrandCopy,
          hasSpecs,
          overflow,
          isVisibleInViewport,
          windowHeight: window.innerHeight
        };
      })()`)

      console.log(`Validation metrics for ${vp.name}:`, validation)
      if (!validation.exists) throw new Error(`Footer not found at ${vp.name}`)
      if (!validation.isVisibleInViewport) throw new Error(`Footer not scrolled into viewport at ${vp.name}!`)
      if (validation.hasImg) throw new Error(`Footer still contains logo img at ${vp.name}!`)
      if (validation.hasOpenStudio) throw new Error(`Footer still contains 'Mở Studio' link at ${vp.name}!`)
      if (validation.hasVersion) throw new Error(`Footer still contains hardcoded version at ${vp.name}!`)
      if (!validation.hasBrandCopy) throw new Error(`Footer missing required brand copy at ${vp.name}!`)
      if (!validation.hasSpecs) throw new Error(`Footer missing required specs text at ${vp.name}!`)
      if (validation.overflow) throw new Error(`Footer caused horizontal overflow at ${vp.name}!`)

      // Capture screenshot
      const outPath = path.join(ARTIFACT_DIR, vp.file)
      await screenshot(outPath)
      console.log(`[SAVED] ${vp.file} (Footer visible at bottom of viewport: y=${validation.rect.top}px to ${validation.rect.bottom}px)`)
    }

    if (consoleErrors.length > 0) {
      console.warn('Console warnings/errors during run:', consoleErrors)
    }

    console.log('\n======================================================================')
    console.log('ALL FOOTER VIEWPORT TESTS & SCREENSHOTS PASSED!')
    console.log('======================================================================')
  })
}

run().catch((err) => {
  console.error('\n[FAIL] Footer test failed:', err)
  process.exit(1)
})
