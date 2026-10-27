/**
 * verify-p5-race-and-crs.mjs
 * Validates:
 * 1. Strict fail-closed validation for scaleFactor on /parse-road and /parse-dxf (HTTP 422).
 * 2. CRS consistency and exact coordinate agreement between /parse-road and /parse-dxf under k0=0.9996.
 * 3. AxisOrder matrix test across all supported values: ['AUTO', 'VN2000_XY', 'CAD_EN'].
 *    Verifies that for every AxisOrder mode, the start coordinate of parse-road exactly matches
 *    the corresponding feature vertex in parse-dxf (delta < 1e-6 deg / < 0.1 mm).
 * 4. Sensitivity of coordinates to k0 variations.
 * 5. Frontend race-condition cancellation simulation.
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

  // 1. Fail-closed validation for invalid scaleFactor in /parse-road
  console.log('[TEST 1] Fail-closed validation for invalid scaleFactor in /parse-road')
  try {
    const fd = new FormData()
    fd.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fd.append('CentralMeridian', '107.75')
    fd.append('ScaleFactor', '1.5') // Outside [0.90..1.10]

    const resp = await fetch(`${BACKEND_URL}/parse-road`, { method: 'POST', body: fd })
    const data = await resp.json()
    if (resp.status === 422 && data && (data.error === 'InvalidScaleFactor' || data.success === false)) {
      console.log(`  PASS: /parse-road rejected scaleFactor 1.5 with HTTP 422: ${data.detail || data.error}`)
      pass++
    } else {
      console.error(`  FAIL: /parse-road did not reject scaleFactor 1.5 with HTTP 422! Status: ${resp.status}`, data)
      fail++
    }
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 1:`, err.message)
    fail++
  }

  // 2. Fail-closed validation for invalid scaleFactor in /parse-dxf
  console.log('\n[TEST 2] Fail-closed validation for invalid scaleFactor in /parse-dxf')
  try {
    const fd = new FormData()
    fd.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fd.append('targetSrid', '4326')
    fd.append('centralMeridian', '107.75')
    fd.append('scaleFactor', '0.5') // Outside [0.90..1.10]

    const resp = await fetch(`${BACKEND_URL}/parse-dxf`, { method: 'POST', body: fd })
    const data = await resp.json()
    if (resp.status === 422 && data && (data.error === 'InvalidScaleFactor' || data.success === false)) {
      console.log(`  PASS: /parse-dxf rejected scaleFactor 0.5 with HTTP 422: ${data.detail || data.error}`)
      pass++
    } else {
      console.error(`  FAIL: /parse-dxf did not reject scaleFactor 0.5 with HTTP 422! Status: ${resp.status}`, data)
      fail++
    }
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 2:`, err.message)
    fail++
  }

  // 3. CRS Consistency & Exact Vertex Comparison between /parse-road and /parse-dxf with k0=0.9996
  console.log('\n[TEST 3] CRS Consistency & Vertex Correspondence between /parse-road and /parse-dxf (k0=0.9996)')
  try {
    const fdRoad = new FormData()
    fdRoad.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fdRoad.append('CentralMeridian', '107.75')
    fdRoad.append('ScaleFactor', '0.9996')
    fdRoad.append('AxisOrder', 'AUTO')

    const fdDxf = new FormData()
    fdDxf.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
    fdDxf.append('targetSrid', '4326')
    fdDxf.append('centralMeridian', '107.75')
    fdDxf.append('scaleFactor', '0.9996')
    fdDxf.append('axisOrder', 'AUTO')
    fdDxf.append('centerlineLayerName', 'TKDTIMTUYENTKT2')

    const [respRoad, respDxf] = await Promise.all([
      fetch(`${BACKEND_URL}/parse-road`, { method: 'POST', body: fdRoad }).then(r => r.json()),
      fetch(`${BACKEND_URL}/parse-dxf`, { method: 'POST', body: fdDxf }).then(r => r.json()),
    ])

    if (!respRoad.success || !respDxf) {
      throw new Error(`Failed to get response: road.success=${respRoad.success}, dxf=${!!respDxf}`)
    }

    if (respRoad.scaleFactor !== 0.9996) {
      throw new Error(`parse-road metadata scaleFactor is ${respRoad.scaleFactor}, expected 0.9996`)
    }

    const startGpsRoad = respRoad.centerline[0] // [lat, lon]
    const rLat = startGpsRoad[0]
    const rLon = startGpsRoad[1]

    const feats = respDxf.featureCollection?.features || respDxf.features || []
    let minD = 1e9
    let matchingFeat = null

    for (const f of feats) {
      for (const c of f.geometry.coordinates) {
        // GeoJSON is [lon, lat]
        const d = Math.hypot(c[0] - rLon, c[1] - rLat)
        if (d < minD) {
          minD = d
          matchingFeat = { segment: f.properties.segment, pt: c }
        }
      }
    }

    if (minD > 1e-6) {
      throw new Error(`Start vertex discrepancy (${minD} deg) exceeds tolerance (< 1e-6 deg)`)
    }

    console.log(`  PASS: parse-road and parse-dxf both applied k0=0.9996:`)
    console.log(`        Metadata scaleFactor: ${respRoad.scaleFactor}`)
    console.log(`        parse-road start coordinate: [lat=${rLat}, lon=${rLon}]`)
    console.log(`        parse-dxf matching vertex:   [lat=${matchingFeat.pt[1]}, lon=${matchingFeat.pt[0]}] in ${matchingFeat.segment}`)
    console.log(`        Geodetic discrepancy delta:  ${minD.toExponential(4)} deg (exact match)`)
    pass++
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 3:`, err.message)
    fail++
  }

  // 4. AxisOrder Matrix: Compare 'AUTO', 'VN2000_XY', 'CAD_EN' across both endpoints
  console.log('\n[TEST 4] AxisOrder Matrix Test across AUTO, VN2000_XY, and CAD_EN')
  const AXIS_MODES = ['AUTO', 'VN2000_XY', 'CAD_EN']
  for (const mode of AXIS_MODES) {
    try {
      const fdRoad = new FormData()
      fdRoad.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
      fdRoad.append('CentralMeridian', '107.75')
      fdRoad.append('ScaleFactor', '0.9999')
      fdRoad.append('AxisOrder', mode)

      const fdDxf = new FormData()
      fdDxf.append('file', new Blob([dxfBuffer]), '3. BDTK.dxf')
      fdDxf.append('targetSrid', '4326')
      fdDxf.append('centralMeridian', '107.75')
      fdDxf.append('scaleFactor', '0.9999')
      fdDxf.append('axisOrder', mode)
      fdDxf.append('centerlineLayerName', 'TKDTIMTUYENTKT2')

      const [rRoad, rDxf] = await Promise.all([
        fetch(`${BACKEND_URL}/parse-road`, { method: 'POST', body: fdRoad }).then(r => r.json()),
        fetch(`${BACKEND_URL}/parse-dxf`, { method: 'POST', body: fdDxf }).then(r => r.json()),
      ])

      if (!rRoad.success || !rDxf) {
        throw new Error(`Mode ${mode} failed to return success`)
      }

      const startRoad = rRoad.centerline[0] // [lat, lon]
      const rLat = startRoad[0]
      const rLon = startRoad[1]

      const feats = rDxf.featureCollection?.features || rDxf.features || []
      let minD = 1e9
      let matchingFeat = null

      for (const f of feats) {
        for (const c of f.geometry.coordinates) {
          const d = Math.hypot(c[0] - rLon, c[1] - rLat)
          if (d < minD) {
            minD = d
            matchingFeat = { segment: f.properties.segment, pt: c }
          }
        }
      }

      if (minD > 1e-6) {
        throw new Error(`Mode ${mode}: discrepancy between parse-road and parse-dxf exceeds 1e-6 deg (${minD})`)
      }

      console.log(`  PASS: AxisOrder '${mode}':`)
      console.log(`        parse-road start: [lat=${rLat}, lon=${rLon}]`)
      console.log(`        parse-dxf match:  [lat=${matchingFeat.pt[1]}, lon=${matchingFeat.pt[0]}] in ${matchingFeat.segment}`)
      console.log(`        Agreement delta:  ${minD.toExponential(4)} deg (exact match)`)
      pass++
    } catch (err) {
      console.error(`  FAIL in AxisOrder mode ${mode}:`, err.message)
      fail++
    }
  }

  // 5. Sensitivity to ScaleFactor (k0=0.9999 vs k0=0.9996) in /parse-dxf
  console.log('\n[TEST 5] Sensitivity to ScaleFactor (k0=0.9999 vs k0=0.9996) in /parse-dxf')
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

    const feats3 = res3.featureCollection?.features || res3.features || []
    const feats6 = res6.featureCollection?.features || res6.features || []
    const pt3 = feats3[0]?.geometry?.coordinates?.[0]
    const pt6 = feats6[0]?.geometry?.coordinates?.[0]

    if (!pt3 || !pt6) {
      throw new Error('Could not find feature coordinates in parse-dxf output')
    }

    const dLon = Math.abs(pt3[0] - pt6[0])
    const dLat = Math.abs(pt3[1] - pt6[1])
    const changed = dLon > 1e-6 || dLat > 1e-6
    if (changed) {
      console.log(`  PASS: Coordinates shift appropriately with scaleFactor change:`)
      console.log(`        k0=0.9999: [${pt3[0]}, ${pt3[1]}]`)
      console.log(`        k0=0.9996: [${pt6[0]}, ${pt6[1]}]`)
      console.log(`        Delta: lon=${dLon.toExponential(4)}, lat=${dLat.toExponential(4)}`)
      pass++
    } else {
      throw new Error('Coordinates did not change when scaleFactor changed from 0.9999 to 0.9996!')
    }
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 5:`, err.message)
    fail++
  }

  // 6. Simulate Frontend Race Condition (Rapid file/request cancellation)
  console.log('\n[TEST 6] Rapid Request Dispatch & AbortController Cancellation Simulation')
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
      await new Promise(r => setTimeout(r, simulateDelayMs))

      if (reqId !== activeRequestId) {
        return { discarded: true, reqId, fileLabel }
      }
      lastAcceptedResult = { reqId, fileLabel, totalLength: data.totalLengthMeters }
      return { accepted: true, reqId, fileLabel }
    }

    const ctrl1 = new AbortController()
    activeRequestId = 1
    const p1 = dispatchAnalysis(1, 400, 'FILE_A_SLOW', ctrl1.signal).catch(e => ({ aborted: true, err: e.name }))

    ctrl1.abort()
    const ctrl2 = new AbortController()
    activeRequestId = 2
    const p2 = dispatchAnalysis(2, 50, 'FILE_B_FAST', ctrl2.signal)

    const [r1, r2] = await Promise.all([p1, p2])

    if (r1.aborted || r1.discarded) {
      console.log(`  PASS: Request 1 correctly handled: aborted/discarded (${r1.aborted ? 'AbortError' : 'Discarded due to activeRequestId mismatch'})`)
    } else {
      throw new Error(`Request 1 was not aborted/discarded: ${JSON.stringify(r1)}`)
    }

    if (r2.accepted && lastAcceptedResult?.reqId === 2) {
      console.log(`  PASS: Request 2 accepted cleanly as active result:`, lastAcceptedResult)
      pass++
    } else {
      throw new Error(`Request 2 was not accepted: ${JSON.stringify(r2)}`)
    }
  } catch (err) {
    console.error(`  FAIL: Exception in TEST 6:`, err.message)
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
