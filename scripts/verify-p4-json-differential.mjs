/**
 * verify-p4-json-differential.mjs
 * Differential test between Frontend JS builder and Backend Python builder
 * for RoadGuard GeometryDraft JSON export.
 */

import { buildRoadGuardGeometryDraft } from '../src/utils/crsTransformEngine.js'

const BACKEND_URL = 'http://localhost:5198/api/cad'

async function callBackendDraftExport(payload) {
  const resp = await fetch(`${BACKEND_URL}/export-roadguard-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }
  return await resp.json()
}

// Generate test WGS84 centerlines
const TEST_CASES = [
  {
    name: 'Synthetic Straight Alignment (UTM Zone 48N)',
    sourceCrs: 32648,
    roadCode: 'ROAD-SYNTH-48N',
    roadName: 'Tuyến thử nghiệm 48N',
    changeReason: 'Thiết kế sơ bộ phục vụ kiểm thử differential test',
    stationOriginMeters: 0,
    roadWidth: 7.5,
    surveyWidthMeters: 14.0,
    centerlineWgs84: [
      [106.650000, 10.750000],
      [106.652000, 10.752500],
      [106.655000, 10.756000],
      [106.658000, 10.760000],
      [106.662000, 10.765000],
    ],
  },
  {
    name: 'Synthetic S-Curve Alignment (UTM Zone 49N)',
    sourceCrs: 32649,
    roadCode: 'ROAD-SYNTH-49N',
    roadName: 'Tuyến cong chữ S 49N',
    changeReason: 'Kiểm thử tọa độ múi 49N và tính toán độ dài',
    stationOriginMeters: 150.0,
    roadWidth: 11.0,
    surveyWidthMeters: 20.0,
    centerlineWgs84: [
      [108.200000, 15.900000],
      [108.203000, 15.904000],
      [108.207000, 15.907000],
      [108.212000, 15.908500],
      [108.218000, 15.908000],
      [108.223000, 15.906000],
      [108.228000, 15.903000],
    ],
  },
  {
    name: 'Synthetic with duplicate adjacent points (Deduplication Check)',
    sourceCrs: 32648,
    roadCode: 'ROAD-DEDUP-TEST',
    roadName: 'Tuyến kiểm tra lọc điểm trùng',
    changeReason: 'Kiểm tra thuật toán loại bỏ duplicate adjacent points',
    stationOriginMeters: 0,
    roadWidth: 7.0,
    surveyWidthMeters: 12.0,
    centerlineWgs84: [
      [106.700000, 10.800000],
      [106.700000, 10.800000], // Duplicate!
      [106.703000, 10.803000],
      [106.703000, 10.803000], // Duplicate!
      [106.707000, 10.807000],
    ],
  },
]

async function runDifferentialTests() {
  console.log('========================================================================')
  console.log('CAD & GIS STUDIO — P4: DIFFERENTIAL TEST JS BUILDER VS PYTHON BUILDER')
  console.log('========================================================================\n')

  let totalPass = 0
  let totalFail = 0

  for (const tc of TEST_CASES) {
    console.log(`[TEST CASE] ${tc.name}`)
    
    // 1. Run Frontend JS Builder
    const jsResult = buildRoadGuardGeometryDraft({
      centerlineWgs84: tc.centerlineWgs84,
      sourceCrs: tc.sourceCrs,
      stationOriginMeters: tc.stationOriginMeters,
      changeReason: tc.changeReason,
      roadCode: tc.roadCode,
      roadName: tc.roadName,
      roadWidth: tc.roadWidth,
      surveyWidthMeters: tc.surveyWidthMeters,
    })

    if (!jsResult.valid) {
      console.error(`  FAIL: JS Builder returned invalid:`, jsResult.errors)
      totalFail++
      continue
    }

    // 2. Run Backend Python Builder via HTTP
    const pyResult = await callBackendDraftExport({
      centerlineWgs84: tc.centerlineWgs84,
      sourceCrs: tc.sourceCrs,
      stationOriginMeters: tc.stationOriginMeters,
      changeReason: tc.changeReason,
      roadCode: tc.roadCode,
      roadName: tc.roadName,
      roadWidth: tc.roadWidth,
      surveyWidthMeters: tc.surveyWidthMeters,
    })

    if (!pyResult.success) {
      console.error(`  FAIL: Python Builder failed:`, pyResult.error, pyResult.detail)
      totalFail++
      continue
    }

    const jsDraft = jsResult.draft
    const pyDraft = pyResult.draft

    // 3. Compare Schema Keys
    const jsKeys = Object.keys(jsDraft).sort()
    const pyKeys = Object.keys(pyDraft).sort()
    const keysMatch = JSON.stringify(jsKeys) === JSON.stringify(pyKeys)
    if (!keysMatch) {
      console.error(`  FAIL: Schema keys mismatch! JS: ${jsKeys.join(', ')} vs PY: ${pyKeys.join(', ')}`)
      totalFail++
      continue
    }

    // 4. Compare Fixed Fields
    let fieldsPass = true
    const fixedFields = ['sourceKind', 'sourceCrs', 'stationOriginMeters', 'changeReason', 'sourceFileId', 'trackIndex', 'trackSegmentIndex', 'surveyWidthMeters', 'roadCode', 'roadName']
    for (const f of fixedFields) {
      if (jsDraft[f] !== pyDraft[f]) {
        console.error(`  FAIL: Field '${f}' mismatch: JS=${JSON.stringify(jsDraft[f])} vs PY=${JSON.stringify(pyDraft[f])}`)
        fieldsPass = false
      }
    }

    // 5. Compare Coordinates
    const jsCoords = jsDraft.coordinates
    const pyCoords = pyDraft.coordinates
    if (jsCoords.length !== pyCoords.length) {
      console.error(`  FAIL: Coordinates length mismatch: JS=${jsCoords.length} vs PY=${pyCoords.length}`)
      fieldsPass = false
    }

    let maxCoordDiff = 0
    for (let i = 0; i < Math.min(jsCoords.length, pyCoords.length); i++) {
      const dx = Math.abs(jsCoords[i].x - pyCoords[i].x)
      const dy = Math.abs(jsCoords[i].y - pyCoords[i].y)
      const diff = Math.max(dx, dy)
      if (diff > maxCoordDiff) maxCoordDiff = diff
    }

    // Tolerance: coordinates must match within < 0.0001m (< 0.1mm)
    const coordPass = maxCoordDiff < 0.0001
    if (!coordPass) {
      console.error(`  FAIL: Coordinates max diff ${maxCoordDiff}m exceeds 0.0001m`)
      fieldsPass = false
    }

    // 6. Compare Length (toOffsetMeters in widthProfile)
    const jsLen = jsDraft.widthProfile[0].toOffsetMeters
    const pyLen = pyDraft.widthProfile[0].toOffsetMeters
    const lenDiff = Math.abs(jsLen - pyLen)
    const lenPass = lenDiff < 0.00001 // < 0.01 mm

    if (!lenPass) {
      console.error(`  FAIL: Length mismatch: JS=${jsLen}m vs PY=${pyLen}m (diff=${lenDiff}m)`)
      fieldsPass = false
    }

    if (fieldsPass && coordPass && lenPass) {
      console.log(`  PASS: Schema keys match: ${jsKeys.length} fields`)
      console.log(`        Point count: JS=${jsCoords.length}, PY=${pyCoords.length}`)
      console.log(`        Max coordinate delta: ${(maxCoordDiff * 1000).toFixed(4)} mm (tolerance < 0.1 mm)`)
      console.log(`        Length delta: ${(lenDiff * 1000).toFixed(6)} mm (JS=${jsLen.toFixed(4)}m, PY=${pyLen.toFixed(4)}m)`)
      totalPass++
    } else {
      totalFail++
    }
    console.log('')
  }

  // Also test with actual real DXF centerline from 3. BDTK.dxf
  console.log('[TEST CASE] Real DXF Centerline from 3. BDTK.dxf via /parse-road')
  try {
    const fs = await import('fs')
    const path = await import('path')
    const { toLngLat } = await import('../src/utils/roadEngineeringBuilder.js')
    const dxfBuffer = fs.readFileSync('d:/DO_AN/roadguard-cad-parser/3. BDTK.dxf')
    const blob = new Blob([dxfBuffer])
    const formData = new FormData()
    formData.append('file', blob, '3. BDTK.dxf')
    formData.append('CentralMeridian', '107.75')
    formData.append('ScaleFactor', '0.9999')
    formData.append('AxisOrder', 'xy')

    const parseResp = await fetch(`${BACKEND_URL}/parse-road`, {
      method: 'POST',
      body: formData,
    })
    const parseData = await parseResp.json()
    const rawCenterline = parseData.centerline || []
    const centerlineWgs84 = rawCenterline.map(toLngLat)
    console.log(`  Retrieved ${centerlineWgs84.length} WGS-84 vertices from 3. BDTK.dxf`)

    const jsReal = buildRoadGuardGeometryDraft({
      centerlineWgs84,
      sourceCrs: 32648,
      stationOriginMeters: 0,
      changeReason: 'Nghiệm thu hình học tuyến từ 3. BDTK.dxf',
      roadCode: 'ROAD-BDTK-01',
      roadName: 'Đường giao thông nông thôn BDTK',
      roadWidth: 7.0,
      surveyWidthMeters: 14.0,
    })

    const pyReal = await callBackendDraftExport({
      centerlineWgs84,
      sourceCrs: 32648,
      stationOriginMeters: 0,
      changeReason: 'Nghiệm thu hình học tuyến từ 3. BDTK.dxf',
      roadCode: 'ROAD-BDTK-01',
      roadName: 'Đường giao thông nông thôn BDTK',
      roadWidth: 7.0,
      surveyWidthMeters: 14.0,
    })

    const jsDraft = jsReal.draft
    const pyDraft = pyReal.draft

    let realDiff = 0
    for (let i = 0; i < jsDraft.coordinates.length; i++) {
      const dx = Math.abs(jsDraft.coordinates[i].x - pyDraft.coordinates[i].x)
      const dy = Math.abs(jsDraft.coordinates[i].y - pyDraft.coordinates[i].y)
      const d = Math.max(dx, dy)
      if (d > realDiff) realDiff = d
    }

    const realLenDiff = Math.abs(jsDraft.widthProfile[0].toOffsetMeters - pyDraft.widthProfile[0].toOffsetMeters)
    console.log(`  PASS: Real DXF Differential check:`)
    console.log(`        Vertices: ${jsDraft.coordinates.length}`)
    console.log(`        Max coordinate delta: ${(realDiff * 1000).toFixed(4)} mm`)
    console.log(`        Length delta: ${(realLenDiff * 1000).toFixed(6)} mm (JS=${jsDraft.widthProfile[0].toOffsetMeters.toFixed(4)}m, PY=${pyDraft.widthProfile[0].toOffsetMeters.toFixed(4)}m)`)
    totalPass++
  } catch (err) {
    console.error(`  FAIL in real DXF test:`, err.message)
    totalFail++
  }

  // Also test with Dong Nai DXF (binh do dieu chinh lan 1.dxf)
  console.log('\n[TEST CASE] Real DXF Dong Nai (binh do dieu chinh lan 1.dxf - YEUTOCONGTUYEN 700.73m)')
  try {
    const fs = await import('fs')
    const { toLngLat } = await import('../src/utils/roadEngineeringBuilder.js')
    const dxfBuffer = fs.readFileSync('C:/Users/dell/Downloads/binh do dieu chinh lan 1.dxf')
    const blob = new Blob([dxfBuffer])
    const formData = new FormData()
    formData.append('file', blob, 'binh do dieu chinh lan 1.dxf')
    formData.append('CentralMeridian', '107.75')
    formData.append('ScaleFactor', '0.9999')
    formData.append('AxisOrder', 'xy')
    formData.append('CenterlineLayerName', 'YEUTOCONGTUYEN')

    const parseResp = await fetch(`${BACKEND_URL}/parse-road`, {
      method: 'POST',
      body: formData,
    })
    const parseData = await parseResp.json()
    const rawCenterline = parseData.centerline || []
    const centerlineWgs84 = rawCenterline.map(toLngLat)
    console.log(`  Retrieved ${centerlineWgs84.length} WGS-84 vertices (parsed length: ${parseData.totalLengthMeters}m)`)

    const jsReal = buildRoadGuardGeometryDraft({
      centerlineWgs84,
      sourceCrs: 32648,
      stationOriginMeters: 0,
      changeReason: 'Dựng tuyến Đồng Nai YEUTOCONGTUYEN 700.73m',
      roadCode: 'ROAD-DNI-YEUTOCONGTUYEN',
      roadName: 'Đường tỉnh Đồng Nai - Yếu tố cong',
      roadWidth: 7.0,
      surveyWidthMeters: 14.0,
    })

    const pyReal = await callBackendDraftExport({
      centerlineWgs84,
      sourceCrs: 32648,
      stationOriginMeters: 0,
      changeReason: 'Dựng tuyến Đồng Nai YEUTOCONGTUYEN 700.73m',
      roadCode: 'ROAD-DNI-YEUTOCONGTUYEN',
      roadName: 'Đường tỉnh Đồng Nai - Yếu tố cong',
      roadWidth: 7.0,
      surveyWidthMeters: 14.0,
    })

    const jsDraft = jsReal.draft
    const pyDraft = pyReal.draft

    let realDiff = 0
    for (let i = 0; i < jsDraft.coordinates.length; i++) {
      const dx = Math.abs(jsDraft.coordinates[i].x - pyDraft.coordinates[i].x)
      const dy = Math.abs(jsDraft.coordinates[i].y - pyDraft.coordinates[i].y)
      const d = Math.max(dx, dy)
      if (d > realDiff) realDiff = d
    }

    const realLenDiff = Math.abs(jsDraft.widthProfile[0].toOffsetMeters - pyDraft.widthProfile[0].toOffsetMeters)
    console.log(`  PASS: Real Dong Nai DXF Differential check:`)
    console.log(`        Vertices: ${jsDraft.coordinates.length}`)
    console.log(`        Max coordinate delta: ${(realDiff * 1000).toFixed(4)} mm`)
    console.log(`        Length delta: ${(realLenDiff * 1000).toFixed(6)} mm (JS=${jsDraft.widthProfile[0].toOffsetMeters.toFixed(4)}m, PY=${pyDraft.widthProfile[0].toOffsetMeters.toFixed(4)}m)`)
    totalPass++
  } catch (err) {
    console.error(`  FAIL in real Dong Nai DXF test:`, err.message)
    totalFail++
  }

  console.log(`\n========================================================================`)
  console.log(`P4 DIFFERENTIAL TEST RESULTS: ${totalPass} PASSED, ${totalFail} FAILED`)
  console.log(`========================================================================`)
  if (totalFail > 0) process.exit(1)
}

runDifferentialTests().catch(err => {
  console.error('Fatal error during differential test:', err)
  process.exit(1)
})
