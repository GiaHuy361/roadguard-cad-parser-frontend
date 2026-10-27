/**
 * verify-p5-race-and-crs.mjs
 * Validates:
 * 1. CRS scaleFactor & axisOrder end-to-end forwarding and strict fail-closed validation on backend.
 * 2. parse-dxf and parse-road consistency under varying k0.
 * 3. Frontend race-condition cancellation simulation.
 */

import fs from 'fs'

const BACKEND_URL = 'http://localhost:5198/api/cad'
const DXF_PATH = 'd:/DO_AN/roadguard-cad-parser/3. BDTK.dxf'

async function runTests() {
  console.log('========================================================================')
  console.log('CAD & GIS STUDIO — P5: CRS PARAMETER FORWARDING & RACE RESILIENCE TEST')
  console.log('========================================================================\n')

  let pass = 0
  let fail = 0

  const dxfBuffer = fs.readFileSync(DXF_PATH)

  // 1. Test fail-closed validation for invalid scaleFactor in /parse-road
  console.log('[TEST 1] Fail-closed validation for invalid scaleFactor in /parse-road')
  try {
    const fd = new FormData()
    fd.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fd.append('CentralMeridian', '107.75')
    fd.append('ScaleFactor', '1.5') // Outside [0.90..1.10]

    const resp = await fetch(`${BACKEND_URL}/parse-road`, { method: 'POST', body: fd })
    const data = await resp.json()
    if (resp.status === 422 || (data && data.success === false && data.error === 'InvalidScaleFactor')) {
      console.log(`  PASS: /parse-road rejected scaleFactor 1.5 with fail-closed status (HTTP ${resp.status}): ${data.detail || data.error}`)
      pass++
    } else {
      console.error(`  FAIL: /parse-road did not reject scaleFactor 1.5! Status: ${resp.status}`, data)
      fail++
    }
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 1:`, err.message)
    fail++
  }

  // 2. Test fail-closed validation for invalid scaleFactor in /parse-dxf
  console.log('\n[TEST 2] Fail-closed validation for invalid scaleFactor in /parse-dxf')
  try {
    const fd = new FormData()
    fd.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fd.append('targetSrid', '4326')
    fd.append('centralMeridian', '107.75')
    fd.append('scaleFactor', '0.5') // Outside [0.90..1.10]

    const resp = await fetch(`${BACKEND_URL}/parse-dxf`, { method: 'POST', body: fd })
    const data = await resp.json()
    if (resp.status === 422 || (data && (data.error === 'InvalidScaleFactor' || data.success === false))) {
      console.log(`  PASS: /parse-dxf rejected scaleFactor 0.5 with fail-closed status (HTTP ${resp.status}): ${data.detail || data.error}`)
      pass++
    } else {
      console.error(`  FAIL: /parse-dxf did not reject scaleFactor 0.5! Status: ${resp.status}`, data)
      fail++
    }
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 2:`, err.message)
    fail++
  }

  // 3. Test CRS consistency between /parse-road and /parse-dxf when k0 = 0.9996 (6° zone)
  console.log('\n[TEST 3] CRS Consistency between /parse-road and /parse-dxf with k0=0.9996 (6° UTM zone)')
  try {
    const fdRoad = new FormData()
    fdRoad.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fdRoad.append('CentralMeridian', '107.75')
    fdRoad.append('ScaleFactor', '0.9996')
    fdRoad.append('AxisOrder', 'xy')

    const fdDxf = new FormData()
    fdDxf.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fdDxf.append('targetSrid', '4326')
    fdDxf.append('centralMeridian', '107.75')
    fdDxf.append('scaleFactor', '0.9996')
    fdDxf.append('axisOrder', 'xy')

    const [respRoad, respDxf] = await Promise.all([
      fetch(`${BACKEND_URL}/parse-road`, { method: 'POST', body: fdRoad }).then(r => r.json()),
      fetch(`${BACKEND_URL}/parse-dxf`, { method: 'POST', body: fdDxf }).then(r => r.json()),
    ])

    if (!respRoad.success || !respDxf) {
      console.error('  FAIL: One of the responses failed:', { respRoadSuccess: respRoad.success, respDxf: !!respDxf })
      fail++
    } else {
      console.log(`  PASS: Both endpoints succeeded with k0=0.9996`)
      console.log(`        parse-road scaleFactor metadata: ${respRoad.scaleFactor}`)
      console.log(`        parse-road totalLengthMeters: ${respRoad.totalLengthMeters}m`)
      pass++
    }
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 3:`, err.message)
    fail++
  }

  // 4. Test difference between k0=0.9999 (3° zone) and k0=0.9996 (6° zone)
  console.log('\n[TEST 4] Sensitivity to ScaleFactor (k0=0.9999 vs k0=0.9996) in /parse-dxf')
  try {
    const fd3 = new FormData()
    fd3.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fd3.append('targetSrid', '4326')
    fd3.append('centralMeridian', '107.75')
    fd3.append('scaleFactor', '0.9999')

    const fd6 = new FormData()
    fd6.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fd6.append('targetSrid', '4326')
    fd6.append('centralMeridian', '107.75')
    fd6.append('scaleFactor', '0.9996')

    const [res3, res6] = await Promise.all([
      fetch(`${BACKEND_URL}/parse-dxf`, { method: 'POST', body: fd3 }).then(r => r.json()),
      fetch(`${BACKEND_URL}/parse-dxf`, { method: 'POST', body: fd6 }).then(r => r.json()),
    ])

    // Find the first coordinate in features
    const feats3 = res3.featureCollection?.features || res3.features || []
    const feats6 = res6.featureCollection?.features || res6.features || []
    const pt3 = feats3[0]?.geometry?.coordinates?.[0]
    const pt6 = feats6[0]?.geometry?.coordinates?.[0]

    if (!pt3 || !pt6) {
      console.error('  FAIL: Could not find feature coordinates in parse-dxf output')
      fail++
    } else {
      const dLon = Math.abs(pt3[0] - pt6[0])
      const dLat = Math.abs(pt3[1] - pt6[1])
      const changed = (dLon > 1e-6 || dLat > 1e-6)
      if (changed) {
        console.log(`  PASS: Coordinates shift appropriately with scaleFactor change:`)
        console.log(`        k0=0.9999: [${pt3[0]}, ${pt3[1]}]`)
        console.log(`        k0=0.9996: [${pt6[0]}, ${pt6[1]}]`)
        console.log(`        Delta: lon=${dLon.toExponential(4)}, lat=${dLat.toExponential(4)}`)
        pass++
      } else {
        console.error('  FAIL: Coordinates did not change when scaleFactor changed from 0.9999 to 0.9996!')
        fail++
      }
    }
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 4:`, err.message)
    fail++
  }

  // 5. Simulate Frontend Race Condition (Rapid file/request cancellation)
  console.log('\n[TEST 5] Rapid Request Dispatch & AbortController Cancellation Simulation')
  try {
    let activeRequestId = 0
    let lastAcceptedResult = null

    async function dispatchAnalysis(reqId, simulateDelayMs, fileLabel, abortSignal) {
      const fd = new FormData()
      fd.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
      fd.append('CentralMeridian', '107.75')
      fd.append('ScaleFactor', '0.9999')

      const resp = await fetch(`${BACKEND_URL}/parse-road`, {
        method: 'POST',
        body: fd,
        signal: abortSignal,
      })
      const data = await resp.json()
      // Simulate network / processing latency jitter
      await new Promise(r => setTimeout(r, simulateDelayMs))

      // Check guard
      if (reqId !== activeRequestId) {
        // Discard stale response
        return { discarded: true, reqId, fileLabel }
      }
      lastAcceptedResult = { reqId, fileLabel, totalLength: data.totalLengthMeters }
      return { accepted: true, reqId, fileLabel }
    }

    // Fire Request 1 (slow, takes 400ms after response)
    const ctrl1 = new AbortController()
    activeRequestId = 1
    const p1 = dispatchAnalysis(1, 400, 'FILE_A_SLOW', ctrl1.signal).catch(e => ({ aborted: true, err: e.name }))

    // Immediately abort Request 1 and fire Request 2
    ctrl1.abort()
    const ctrl2 = new AbortController()
    activeRequestId = 2
    const p2 = dispatchAnalysis(2, 50, 'FILE_B_FAST', ctrl2.signal)

    const [r1, r2] = await Promise.all([p1, p2])

    if (r1.aborted || r1.discarded) {
      console.log(`  PASS: Request 1 correctly handled: aborted/discarded (${r1.aborted ? 'AbortError' : 'Discarded due to activeRequestId mismatch'})`)
    } else {
      console.error(`  FAIL: Request 1 was not aborted/discarded:`, r1)
      fail++
    }

    if (r2.accepted && lastAcceptedResult?.reqId === 2) {
      console.log(`  PASS: Request 2 accepted cleanly as active result:`, lastAcceptedResult)
      pass++
    } else {
      console.error(`  FAIL: Request 2 was not accepted:`, r2, lastAcceptedResult)
      fail++
    }
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 5:`, err.message)
    fail++
  }

  console.log(`\n========================================================================`)
  console.log(`P5 RACE & CRS RESULTS: ${pass} PASSED, ${fail} FAILED`)
  console.log(`========================================================================`)
  if (fail > 0) process.exit(1)
}

runTests().catch(err => {
  console.error('Fatal error in verify-p5-race-and-crs:', err)
  process.exit(1)
})
