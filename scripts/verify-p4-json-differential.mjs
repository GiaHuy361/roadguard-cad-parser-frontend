/**
 * verify-p4-json-differential.mjs
 * Differential test between Frontend JS builder and Backend Python builder
 * for RoadGuard GeometryDraft JSON export.
 *
 * Enforces strict assertions for:
 * 1. Vertex count
 * 2. Vertex order
 * 3. Coordinate delta < 0.1 mm (< 0.0001 m)
 * 4. Polyline length delta < 0.01 mm (< 0.00001 m)
 * 5. Schema and widthProfile integrity
 * 6. Fault injection (verifies suite strictly FAILS on threshold breach)
 */

import { buildRoadGuardGeometryDraft } from '../src/utils/crsTransformEngine.js'
import { toLngLat } from '../src/utils/roadEngineeringBuilder.js'
import fs from 'fs'

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

/**
 * Strict differential assertion engine
 */
function assertDraftDifferential(testName, jsResult, pyResult, options = {}) {
  const maxCoordTolM = (options.maxCoordMm ?? 0.1) / 1000.0 // 0.1 mm
  const maxLenTolM = (options.maxLenMm ?? 0.01) / 1000.0    // 0.01 mm

  if (!jsResult || !jsResult.valid) {
    throw new Error(`[${testName}] JS Builder returned invalid draft: ${JSON.stringify(jsResult?.errors)}`)
  }
  if (!pyResult || !pyResult.success) {
    throw new Error(`[${testName}] Python Builder returned failure: ${pyResult?.error}: ${pyResult?.detail}`)
  }

  const jsDraft = jsResult.draft
  const pyDraft = pyResult.draft

  // 1. Schema keys comparison
  const jsKeys = Object.keys(jsDraft).sort()
  const pyKeys = Object.keys(pyDraft).sort()
  if (JSON.stringify(jsKeys) !== JSON.stringify(pyKeys)) {
    throw new Error(`[${testName}] Schema keys mismatch: JS=[${jsKeys.join(', ')}] vs PY=[${pyKeys.join(', ')}]`)
  }

  // 2. Fixed fields comparison
  const fixedFields = [
    'sourceKind',
    'sourceCrs',
    'stationOriginMeters',
    'changeReason',
    'sourceFileId',
    'trackIndex',
    'trackSegmentIndex',
    'surveyWidthMeters',
    'roadCode',
    'roadName',
  ]
  for (const f of fixedFields) {
    if (jsDraft[f] !== pyDraft[f]) {
      throw new Error(`[${testName}] Field '${f}' mismatch: JS=${JSON.stringify(jsDraft[f])} vs PY=${JSON.stringify(pyDraft[f])}`)
    }
  }

  // 3. Vertex count assertion
  const jsCoords = jsDraft.coordinates
  const pyCoords = pyDraft.coordinates
  if (!Array.isArray(jsCoords) || !Array.isArray(pyCoords)) {
    throw new Error(`[${testName}] Coordinates field is not an array`)
  }
  if (jsCoords.length !== pyCoords.length) {
    throw new Error(`[${testName}] Vertex count mismatch: JS has ${jsCoords.length} vs PY has ${pyCoords.length}`)
  }
  if (options.expectedVertexCount && jsCoords.length !== options.expectedVertexCount) {
    throw new Error(`[${testName}] Expected vertex count ${options.expectedVertexCount}, got ${jsCoords.length}`)
  }
  if (jsCoords.length < 2) {
    throw new Error(`[${testName}] Degenerate coordinates: length ${jsCoords.length} < 2`)
  }

  // 4. Vertex order and coordinate delta assertion (< 0.1 mm)
  let maxCoordDiff = 0
  for (let i = 0; i < jsCoords.length; i++) {
    const ptJs = jsCoords[i]
    const ptPy = pyCoords[i]
    const dx = Math.abs(ptJs.x - ptPy.x)
    const dy = Math.abs(ptJs.y - ptPy.y)
    const delta = Math.max(dx, dy)
    if (delta > maxCoordDiff) maxCoordDiff = delta

    if (dx > maxCoordTolM || dy > maxCoordTolM) {
      throw new Error(
        `[${testName}] Vertex [${i}] coordinate delta ${(delta * 1000).toFixed(4)}mm exceeds tolerance ${(maxCoordTolM * 1000)}mm! JS=(${ptJs.x}, ${ptJs.y}) vs PY=(${ptPy.x}, ${ptPy.y})`
      )
    }
  }

  // 5. WidthProfile structure assertion
  const jsWp = jsDraft.widthProfile
  const pyWp = pyDraft.widthProfile
  if (!Array.isArray(jsWp) || !Array.isArray(pyWp) || jsWp.length === 0 || pyWp.length === 0) {
    throw new Error(`[${testName}] widthProfile missing or empty`)
  }
  if (jsWp[0].fromOffsetMeters !== 0 || pyWp[0].fromOffsetMeters !== 0) {
    throw new Error(`[${testName}] widthProfile fromOffsetMeters is not 0`)
  }
  if (jsWp[0].widthMeters !== pyWp[0].widthMeters) {
    throw new Error(`[${testName}] widthProfile widthMeters mismatch: JS=${jsWp[0].widthMeters} vs PY=${pyWp[0].widthMeters}`)
  }

  // 6. Length delta assertion (< 0.01 mm)
  const jsLen = jsWp[0].toOffsetMeters
  const pyLen = pyWp[0].toOffsetMeters
  const lenDiff = Math.abs(jsLen - pyLen)
  if (lenDiff > maxLenTolM) {
    throw new Error(
      `[${testName}] Polyline length delta ${(lenDiff * 1000).toFixed(6)}mm exceeds tolerance ${(maxLenTolM * 1000)}mm! JS=${jsLen}m vs PY=${pyLen}m`
    )
  }

  return {
    vertexCount: jsCoords.length,
    maxCoordDiffMm: maxCoordDiff * 1000,
    lenDiffMm: lenDiff * 1000,
    jsLength: jsLen,
    pyLength: pyLen,
  }
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
    try {
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

      const metrics = assertDraftDifferential(tc.name, jsResult, pyResult, { maxCoordMm: 0.1, maxLenMm: 0.01 })
      console.log(`  PASS: Schema, Coordinates & Length strictly validated:`)
      console.log(`        Vertices: ${metrics.vertexCount}`)
      console.log(`        Max coord delta: ${metrics.maxCoordDiffMm.toFixed(4)} mm (< 0.1 mm)`)
      console.log(`        Length delta: ${metrics.lenDiffMm.toFixed(6)} mm (< 0.01 mm)`)
      totalPass++
    } catch (err) {
      console.error(`  FAIL: ${err.message}`)
      totalFail++
    }
    console.log('')
  }

  // Real DXF 1: 3. BDTK.dxf
  console.log('[TEST CASE] Real DXF Centerline from 3. BDTK.dxf (149 vertices)')
  let jsBdtk = null
  let pyBdtk = null
  try {
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

    jsBdtk = buildRoadGuardGeometryDraft({
      centerlineWgs84,
      sourceCrs: 32648,
      stationOriginMeters: 0,
      changeReason: 'Nghiệm thu hình học tuyến từ 3. BDTK.dxf',
      roadCode: 'ROAD-BDTK-01',
      roadName: 'Đường giao thông nông thôn BDTK',
      roadWidth: 7.0,
      surveyWidthMeters: 14.0,
    })

    pyBdtk = await callBackendDraftExport({
      centerlineWgs84,
      sourceCrs: 32648,
      stationOriginMeters: 0,
      changeReason: 'Nghiệm thu hình học tuyến từ 3. BDTK.dxf',
      roadCode: 'ROAD-BDTK-01',
      roadName: 'Đường giao thông nông thôn BDTK',
      roadWidth: 7.0,
      surveyWidthMeters: 14.0,
    })

    const metrics = assertDraftDifferential('3. BDTK.dxf', jsBdtk, pyBdtk, {
      maxCoordMm: 0.1,
      maxLenMm: 0.01,
      expectedVertexCount: 149,
    })
    console.log(`  PASS: 3. BDTK.dxf strictly validated:`)
    console.log(`        Vertices: ${metrics.vertexCount} (exact match: 149)`)
    console.log(`        Max coord delta: ${metrics.maxCoordDiffMm.toFixed(4)} mm (< 0.1 mm)`)
    console.log(`        Length delta: ${metrics.lenDiffMm.toFixed(6)} mm (< 0.01 mm)`)
    console.log(`        Polyline length: JS=${metrics.jsLength.toFixed(4)}m, PY=${metrics.pyLength.toFixed(4)}m`)
    totalPass++
  } catch (err) {
    console.error(`  FAIL in 3. BDTK.dxf test:`, err.message)
    totalFail++
  }

  // Real DXF 2: Dong Nai DXF (binh do dieu chinh lan 1.dxf)
  console.log('\n[TEST CASE] Real DXF Dong Nai (binh do dieu chinh lan 1.dxf - YEUTOCONGTUYEN 119 vertices)')
  try {
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

    const metrics = assertDraftDifferential('Dong Nai DXF', jsReal, pyReal, {
      maxCoordMm: 0.1,
      maxLenMm: 0.01,
      expectedVertexCount: 119,
    })
    console.log(`  PASS: Dong Nai DXF strictly validated:`)
    console.log(`        Vertices: ${metrics.vertexCount} (exact match: 119)`)
    console.log(`        Max coord delta: ${metrics.maxCoordDiffMm.toFixed(4)} mm (< 0.1 mm)`)
    console.log(`        Length delta: ${metrics.lenDiffMm.toFixed(6)} mm (< 0.01 mm)`)
    console.log(`        Polyline length: JS=${metrics.jsLength.toFixed(4)}m, PY=${metrics.pyLength.toFixed(4)}m`)
    totalPass++
  } catch (err) {
    console.error(`  FAIL in Dong Nai DXF test:`, err.message)
    totalFail++
  }

  // Fault Injection Check: Proof that assertions fail when coordinates exceed 0.1mm tolerance
  console.log('\n[TEST CASE] Fault Injection Verification: Proving test fails when coordinate delta > 0.1mm')
  try {
    if (!jsBdtk || !pyBdtk) {
      throw new Error('Baseline BDTK test results not available for mutation check')
    }
    const mutatedPy = JSON.parse(JSON.stringify(pyBdtk))
    // Artificially inject a 0.5mm (0.0005m) discrepancy on vertex 0
    mutatedPy.draft.coordinates[0].x += 0.0005

    let caught = false
    try {
      assertDraftDifferential('MUTATED_COORDS', jsBdtk, mutatedPy, { maxCoordMm: 0.1, maxLenMm: 0.01 })
    } catch (assertionErr) {
      caught = true
      console.log(`  PASS: Assertion triggered as expected: ${assertionErr.message}`)
    }

    if (!caught) {
      console.error('  FAIL: Test suite did NOT fail on 0.5mm coordinate mutation!')
      totalFail++
    } else {
      totalPass++
    }
  } catch (err) {
    console.error('  FAIL in fault injection test:', err.message)
    totalFail++
  }

  // Fault Injection Check 2: Proof that assertions fail when polyline length delta > 0.01mm
  console.log('\n[TEST CASE] Fault Injection Verification: Proving test fails when length delta > 0.01mm')
  try {
    const mutatedPyLen = JSON.parse(JSON.stringify(pyBdtk))
    // Artificially inject a 0.05mm (0.00005m) length difference
    mutatedPyLen.draft.widthProfile[0].toOffsetMeters += 0.00005

    let caughtLen = false
    try {
      assertDraftDifferential('MUTATED_LENGTH', jsBdtk, mutatedPyLen, { maxCoordMm: 0.1, maxLenMm: 0.01 })
    } catch (assertionErr) {
      caughtLen = true
      console.log(`  PASS: Assertion triggered as expected: ${assertionErr.message}`)
    }

    if (!caughtLen) {
      console.error('  FAIL: Test suite did NOT fail on 0.05mm length mutation!')
      totalFail++
    } else {
      totalPass++
    }
  } catch (err) {
    console.error('  FAIL in length fault injection test:', err.message)
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
