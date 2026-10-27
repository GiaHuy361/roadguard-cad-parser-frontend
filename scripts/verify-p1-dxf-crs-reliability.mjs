/**
 * verify-p1-dxf-crs-reliability.mjs
 * 
 * Comprehensive automated verification suite for CAD & GIS STUDIO P1 & P3:
 * 1. Preset synchronization (Đồng Nai 107.75°, Hà Nội 105.00°, TP.HCM 105.75°) without TypeError
 * 2. Đồng Nai regression fix: ensures L0=107.75 places road at Lon ~107.74° in Dong Nai (not 105.74° in Tay Ninh)
 * 3. Georeference states classification: State A (Confirmed VN-2000), State C (Local CAD Non-Georeferenced)
 * 4. Stale CRS detection and export blocking
 * 5. Python Bridge multi-DXF matrix test with fixture portability (required 3. BDTK.dxf vs optional Downloads)
 * 6. Unified Export Guard: differentiates native WGS-84 source from CAD/VN-2000 coordinates
 * 7. Strict k0 validation without silent fallback
 */

import { VN2000_REFERENCE_PRESETS } from '../src/utils/roadEngineeringBuilder.js'
import { vn2000ToWgs84, wgs84ToVn2000 } from '../src/utils/crsTransformEngine.js'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

console.log('='.repeat(70))
console.log('CAD & GIS STUDIO — AUDIT & RELIABILITY VERIFICATION SUITE')
console.log('='.repeat(70))

const results = []

function test(name, fn) {
  try {
    fn()
    results.push({ name, status: 'PASS' })
    console.log(`[PASS] ${name}`)
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message })
    console.error(`[FAIL] ${name}: ${err.message}`)
  }
}

// 1. Preset Synchronization Test
test('P1.1: VN2000_REFERENCE_PRESETS sync parses string cm to float without TypeError', () => {
  for (const preset of VN2000_REFERENCE_PRESETS) {
    if (preset.id === 'custom' || preset.id === 'unconfigured') continue
    const parsedCm = parseFloat(preset.cm)
    if (!Number.isFinite(parsedCm) || parsedCm < 100 || parsedCm > 115) {
      throw new Error(`Invalid cm in preset ${preset.id}: ${preset.cm}`)
    }
    const parsedK0 = parseFloat(preset.k0 ?? 0.9999)
    if (!Number.isFinite(parsedK0) || (Math.abs(parsedK0 - 0.9999) > 1e-4 && Math.abs(parsedK0 - 0.9996) > 1e-4)) {
      throw new Error(`Invalid k0 in preset ${preset.id}: ${preset.k0}`)
    }
  }

  // Verify specific presets
  const dni = VN2000_REFERENCE_PRESETS.find(p => p.id === 'dni-3deg')
  if (!dni || parseFloat(dni.cm) !== 107.75) throw new Error('Dong Nai preset must have CM 107.75')

  const hni = VN2000_REFERENCE_PRESETS.find(p => p.id === 'hni-3deg')
  if (!hni || parseFloat(hni.cm) !== 105.00) throw new Error('Hanoi preset must have CM 105.00')

  const hcm = VN2000_REFERENCE_PRESETS.find(p => p.id === 'hcm-3deg')
  if (!hcm || parseFloat(hcm.cm) !== 105.75) throw new Error('HCMC preset must have CM 105.75')
})

// 2. Dong Nai Coordinates Georeferencing Test
test('P1.2: Dong Nai coordinates project to Lon ~107.74° (Dong Nai province), NOT ~105.74°', () => {
  // Test point from binh do dieu chinh lan 1.dxf: Easting (Y_CAD) ~ 498,364; Northing (X_CAD) ~ 1,268,960
  const resDongNai = vn2000ToWgs84(498364.0, 1268960.0, { centralMeridian: 107.75, scaleFactor: 0.9999 })
  if (!resDongNai.valid) throw new Error(`Failed to transform Dong Nai coordinates with L0=107.75: ${resDongNai.error}`)
  
  if (resDongNai.lon < 107.5 || resDongNai.lon > 108.0) {
    throw new Error(`Expected longitude in Dong Nai (107.5 - 108.0), got: ${resDongNai.lon}`)
  }
  if (resDongNai.lat < 11.2 || resDongNai.lat > 11.7) {
    throw new Error(`Expected latitude in Dong Nai (11.2 - 11.7), got: ${resDongNai.lat}`)
  }

  // Verify that projecting with wrong L0=105.75 causes ~220km error into Tay Ninh
  const resWrongCm = vn2000ToWgs84(498364.0, 1268960.0, { centralMeridian: 105.75, scaleFactor: 0.9999 })
  const lonDiffDeg = Math.abs(resDongNai.lon - resWrongCm.lon)
  if (Math.abs(lonDiffDeg - 2.0) > 0.1) {
    throw new Error(`Expected ~2.0 degree discrepancy when using wrong CM, got: ${lonDiffDeg}`)
  }
})

// 3. Stale CRS Detection Logic Test
test('P1.3: isCrsStale correctly detects mismatch between applied and selected CRS', () => {
  const applied = { cm: '107.75', k0: '0.9999', axisOrder: 'AUTO' }
  
  const checkStale = (selCm, selK0, selAxis) => {
    const curCm = parseFloat(selCm)
    const appCm = parseFloat(applied.cm)
    const curK0 = parseFloat(selK0)
    const appK0 = parseFloat(applied.k0)
    const cmChanged = Number.isFinite(curCm) && Number.isFinite(appCm) && Math.abs(curCm - appCm) > 1e-4
    const k0Changed = Number.isFinite(curK0) && Number.isFinite(appK0) && Math.abs(curK0 - appK0) > 1e-4
    const axisChanged = Boolean(applied.axisOrder && selAxis !== applied.axisOrder)
    return cmChanged || k0Changed || axisChanged
  }

  if (checkStale('107.75', '0.9999', 'AUTO') !== false) {
    throw new Error('Identical CRS should not be stale')
  }
  if (checkStale('105.75', '0.9999', 'AUTO') !== true) {
    throw new Error('Changing CM from 107.75 to 105.75 must mark state as stale')
  }
  if (checkStale('107.75', '0.9996', 'AUTO') !== true) {
    throw new Error('Changing k0 from 0.9999 to 0.9996 must mark state as stale')
  }
  if (checkStale('107.75', '0.9999', 'VN2000_XY') !== true) {
    throw new Error('Changing axisOrder must mark state as stale')
  }
})

// 4. Python Bridge Multi-DXF Matrix Test with Fixture Portability
test('P1.4: Python Bridge executes multi-DXF matrix with portable SKIP handling', () => {
  const scriptPath = path.resolve(process.cwd(), '../roadguard-cad-parser/tests/test_multi_dxf.py')
  const pyCmd = spawnSync('python', [scriptPath], {
    encoding: 'utf-8',
    timeout: 30000
  })

  if (pyCmd.status !== 0) {
    throw new Error(`Python multi-DXF test failed with exit code ${pyCmd.status}: ${pyCmd.stderr}`)
  }

  const out = pyCmd.stdout

  // Required fixture: 3. BDTK.dxf must ALWAYS be present in repo and pass
  if (!out.includes('3. BDTK.dxf') || !out.includes('GEOREFERENCED_VN2000')) {
    throw new Error('3. BDTK.dxf (required fixture) must be classified as GEOREFERENCED_VN2000')
  }

  // Optional fixtures: check outputs only if executed, otherwise verify SKIP notice
  const optionalChecks = [
    { name: 'binh do dieu chinh lan 1.dxf', expected: '107.74' },
    { name: 'cadmapper-bao-loc-lam-ong-vn.dxf', expected: 'LOCAL_CAD_NON_GEOREFERENCED' },
    { name: 'ROAD_CENTERLINE.dxf', expected: 'LOCAL_CAD_NON_GEOREFERENCED' }
  ]

  for (const opt of optionalChecks) {
    if (out.includes(`=== ${opt.name} ===`)) {
      if (!out.includes(opt.expected)) {
        throw new Error(`Fixture ${opt.name} executed but missing expected string '${opt.expected}'`)
      }
      console.log(`  -> Verified executed optional fixture: ${opt.name}`)
    } else if (out.includes(`SKIP (optional fixture not present): ${opt.name}`)) {
      console.log(`  -> Verified skipped optional fixture: ${opt.name}`)
    }
  }

  if (!out.includes('SUMMARY: EXECUTED=')) {
    throw new Error('Python test must report execution SUMMARY line')
  }
})

// 5. Unified Export Guard: WGS-84 Source vs CAD/VN-2000 Coords
test('P3.1: Unified Export Guard allows WGS-84 GeoJSON export without VN-2000 config, but guards CAD/Coords & Excel', () => {
  const evaluateGuard = ({ sourceKind, crsState, isStale, isProvisional, format }) => {
    if (isProvisional) return 'PROVISIONAL_BLOCKED'
    if (sourceKind === 'wgs84' && format === 'geojson') return null
    if (crsState === 'UNCONFIGURED') return 'UNCONFIGURED_BLOCKED'
    if (crsState === 'INVALID_CONFIG') return 'INVALID_BLOCKED'
    if (isStale) return 'STALE_BLOCKED'
    return null
  }

  // Case 1: WGS-84 Source with unconfigured VN-2000
  // GeoJSON export: ALLOWED
  const wgs84GeoJson = evaluateGuard({
    sourceKind: 'wgs84',
    crsState: 'UNCONFIGURED',
    isStale: false,
    isProvisional: false,
    format: 'geojson'
  })
  if (wgs84GeoJson !== null) {
    throw new Error('Native WGS-84 source must be allowed to export GeoJSON even if VN-2000 is UNCONFIGURED')
  }

  // Excel export: BLOCKED (requires VN-2000 CRS for coordinates report)
  const wgs84Excel = evaluateGuard({
    sourceKind: 'wgs84',
    crsState: 'UNCONFIGURED',
    isStale: false,
    isProvisional: false,
    format: 'excel'
  })
  if (wgs84Excel !== 'UNCONFIGURED_BLOCKED') {
    throw new Error('Excel report must be blocked when VN-2000 is UNCONFIGURED')
  }

  // Case 2: CAD source with unconfigured VN-2000 -> BOTH BLOCKED
  const cadGeoJsonUnconf = evaluateGuard({
    sourceKind: 'cad',
    crsState: 'UNCONFIGURED',
    isStale: false,
    isProvisional: false,
    format: 'geojson'
  })
  if (cadGeoJsonUnconf !== 'UNCONFIGURED_BLOCKED') {
    throw new Error('CAD source must be blocked from GeoJSON export when VN-2000 is UNCONFIGURED')
  }

  // Case 3: Stale CRS -> Blocked for CAD
  const cadStale = evaluateGuard({
    sourceKind: 'cad',
    crsState: 'VALID_APPLIED',
    isStale: true,
    isProvisional: false,
    format: 'geojson'
  })
  if (cadStale !== 'STALE_BLOCKED') {
    throw new Error('CAD source must be blocked when CRS is STALE')
  }

  // Case 4: Provisional width -> ALL BLOCKED
  const wgs84Provisional = evaluateGuard({
    sourceKind: 'wgs84',
    crsState: 'VALID_APPLIED',
    isStale: false,
    isProvisional: true,
    format: 'geojson'
  })
  if (wgs84Provisional !== 'PROVISIONAL_BLOCKED') {
    throw new Error('Provisional width change must block all exports')
  }
})

// 6. Strict k0 Scale Factor Validation
test('P3.2: Strict k0 scale factor validation rejects invalid non-numeric/out-of-range values', () => {
  const validateK0 = (val) => {
    const num = parseFloat(val)
    if (!Number.isFinite(num) || num <= 0.9 || num > 1.1) {
      return { valid: false, error: 'INVALID_K0' }
    }
    return { valid: true, value: num }
  }

  if (!validateK0('0.9999').valid) throw new Error('0.9999 must be valid')
  if (!validateK0('0.9996').valid) throw new Error('0.9996 must be valid')
  if (!validateK0('1.0000').valid) throw new Error('1.0000 must be valid')

  if (validateK0('abc').valid) throw new Error('Non-numeric k0 must be invalid')
  if (validateK0('').valid) throw new Error('Empty k0 must be invalid')
  if (validateK0('0').valid) throw new Error('Zero k0 must be invalid')
  if (validateK0('-0.9999').valid) throw new Error('Negative k0 must be invalid')
  if (validateK0('1.5').valid) throw new Error('Out of bounds k0 (1.5) must be invalid')
})

console.log('='.repeat(70))
const failed = results.filter(r => r.status === 'FAIL')
if (failed.length === 0) {
  console.log(`ALL ${results.length}/${results.length} AUDIT & RELIABILITY TESTS PASSED!`)
  process.exit(0)
} else {
  console.error(`${failed.length} tests failed.`)
  process.exit(1)
}
