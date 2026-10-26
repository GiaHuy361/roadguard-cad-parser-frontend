import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  vn2000ToWgs84,
  wgs84ToVn2000,
  wgs84ToUtm,
  utmToWgs84,
  parseWgs84CoordinateText,
  parseAndValidateWgs84GeoJson,
  buildStudioGeoJsonFromWgs84Import,
  buildRoadGuardGeometryDraft,
  validateRoadGuardGeometryDraft,
} from '../src/utils/crsTransformEngine.js'

const results = []
function record(id, name, passed, details) {
  results.push({ id, name, status: passed ? 'PASS' : 'FAIL', passed, details })
  if (!passed) {
    throw new Error(`[${id}] FAILED: ${name} -> ${JSON.stringify(details)}`)
  }
}

// 1. Test 1 & 2: Bidirectional VN-2000 <-> WGS-84 across 5 control points (3° and 6° zones) vs pyproj
const CONTROL_POINTS = [
  {
    region: 'TP.HCM (3°, L0=105.75)',
    cm: 105.75,
    k0: 0.9999,
    easting: 602340.125,
    northing: 1191450.25,
    refLon: 106.68755894,
    refLat: 10.77249051,
  },
  {
    region: 'Hà Nội (3°, L0=105.00)',
    cm: 105.0,
    k0: 0.9999,
    easting: 584500.0,
    northing: 2325600.0,
    refLon: 105.81479224,
    refLat: 21.02195952,
  },
  {
    region: 'Đà Nẵng (3°, L0=107.75)',
    cm: 107.75,
    k0: 0.9999,
    easting: 545120.0,
    northing: 1775890.0,
    refLon: 108.17352243,
    refLat: 16.05661561,
  },
  {
    region: 'Cà Mau (3°, L0=104.50, X_Bắc < 1,000,000)',
    cm: 104.5,
    k0: 0.9999,
    easting: 515430.0,
    northing: 955210.0,
    refLon: 104.64197905,
    refLat: 8.63779991,
  },
  {
    region: 'Toàn quốc (6°, L0=105.00, k0=0.9996)',
    cm: 105.0,
    k0: 0.9996,
    easting: 842500.0,
    northing: 1776300.0,
    refLon: 108.20226195,
    refLat: 16.04163752,
  },
]

let maxFwdDegErr = 0
let maxInvMmErr = 0
const controlReport = []

for (const cp of CONTROL_POINTS) {
  const fwd = vn2000ToWgs84(cp.easting, cp.northing, {
    centralMeridian: cp.cm,
    scaleFactor: cp.k0,
  })
  assert.equal(fwd.valid, true)
  const dLon = Math.abs(fwd.lon - cp.refLon)
  const dLat = Math.abs(fwd.lat - cp.refLat)
  maxFwdDegErr = Math.max(maxFwdDegErr, dLon, dLat)

  const inv = wgs84ToVn2000(fwd.lon, fwd.lat, {
    centralMeridian: cp.cm,
    scaleFactor: cp.k0,
  })
  assert.equal(inv.valid, true)
  const errMm = Math.hypot(inv.easting - cp.easting, inv.northing - cp.northing) * 1000
  maxInvMmErr = Math.max(maxInvMmErr, errMm)

  controlReport.push({
    region: cp.region,
    inputVN2000: { xNorth: cp.northing, yEast: cp.easting },
    outputWGS84: { lon: fwd.lon, lat: fwd.lat },
    roundtripVN2000: { xNorth: inv.xNorth, yEast: inv.yEast },
    roundtripErrorMm: Number(errMm.toFixed(4)),
  })
}

record(
  'STGA-01',
  'Kiểm tra độ chính xác khứ hồi số học VN-2000 <-> WGS-84 (Múi 3° k0=0.9999 & Múi 6° k0=0.9996) trên 5 điểm kiểm thử đối chiếu pyproj',
  maxFwdDegErr <= 1e-7 && maxInvMmErr <= 1.0,
  {
    maxFwdDegErr,
    maxInvMmErr,
    precisionType: 'ROUND_TRIP_NUMERICAL_INVERTIBILITY',
    accuracyScopeNotice:
      'Kiểm chứng tính bảo toàn toán học khứ hồi (<1mm) và tính tương đương 100% với thư viện PROJ/pyproj; chưa so sánh với mạng lưới mốc tọa độ thực địa đo GPS ngoài hiện trường (chưa có catalog mốc thực tế)',
    controlReport,
  }
)

// 2. Cross-validate with Python pyproj CLI `transform-crs`
const pyBridgePath = path.resolve(
  '../roadguard-cad-parser/Services/PythonBridge/cad_bridge.py'
)
if (fs.existsSync(pyBridgePath)) {
  const tmpPayload = path.join(os.tmpdir(), `stga_crs_${Date.now()}.json`)
  fs.writeFileSync(
    tmpPayload,
    JSON.stringify({
      direction: 'WGS84_TO_VN2000',
      centralMeridian: 105.75,
      scaleFactor: 0.9999,
      points: [{ lon: 106.660172, lat: 10.762622 }],
    }),
    'utf-8'
  )
  const pyOut = JSON.parse(
    execFileSync('python', [pyBridgePath, 'transform-crs', tmpPayload], {
      encoding: 'utf-8',
    })
  )
  fs.unlinkSync(tmpPayload)
  const jsOut = wgs84ToVn2000(106.660172, 10.762622, {
    centralMeridian: 105.75,
    scaleFactor: 0.9999,
  })
  const diffMm =
    Math.hypot(
      pyOut.points[0].xNorth - jsOut.xNorth,
      pyOut.points[0].yEast - jsOut.yEast
    ) * 1000
  record(
    'STGA-02',
    'Đối chiếu trực tiếp kết quả WGS-84 -> VN-2000 giữa Frontend JS Engine và Backend Python pyproj',
    pyOut.success === true && diffMm < 1.0,
    {
      pyprojResult: pyOut.points[0],
      jsEngineResult: { xNorth: jsOut.xNorth, yEast: jsOut.yEast },
      discrepancyMm: Number(diffMm.toFixed(4)),
    }
  )
}

// 3. Unconfigured CRS handling (never guess parameters or return wrong numbers)
const uncfgRes = wgs84ToVn2000(106.660172, 10.762622, {
  centralMeridian: null,
  scaleFactor: 0.9999,
})
record(
  'STGA-03',
  'Khi chưa cấu hình hệ quy chiếu VN-2000: Từ chối quy đổi rõ ràng, không suy đoán tham số sai',
  uncfgRes.valid === false && uncfgRes.code === 'CRS_NOT_CONFIGURED',
  uncfgRes
)

// 4. Import GeoJSON WGS-84 (Reference Sample 1: GEO-GJ-20261025-01)
const REF_SAMPLE_1_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        roadCode: 'GEO-GJ-20261025-01',
        roadName: 'Đường mẫu kiểm thử GeoJSON',
        note: 'Tuyến mẫu dạng chữ L dùng để kiểm thử import GeoJSON',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [106.660172, 10.762622],
          [106.6612, 10.762622],
          [106.6612, 10.76345],
        ],
      },
    },
  ],
}

const imp1 = parseAndValidateWgs84GeoJson(REF_SAMPLE_1_GEOJSON)
const built1 = buildStudioGeoJsonFromWgs84Import(imp1, null, 7.0, {
  centralMeridian: 105.75,
  scaleFactor: 0.9999,
})
const clFeature1 = built1.featureCollection.features.find(
  (f) => f.properties?.type === 'Centerline'
)
const mapLibreCoordsAreWgs84 = clFeature1.geometry.coordinates.every(
  (c) => Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90
)

record(
  'STGA-04',
  'Import mẫu tham chiếu 1 (GEO-GJ-20261025-01) & Giữ nguyên MapLibre GeoJSON ở WGS-84 [lon, lat]',
  imp1.valid === true &&
    imp1.summary.lineStringCount === 1 &&
    built1.hasCenterline === true &&
    mapLibreCoordsAreWgs84 === true,
  {
    summary: imp1.summary,
    totalLengthMeters: built1.analytics.totalLengthMeters,
    mapLibreCoordsAreWgs84,
    firstVertexVn2000: built1.centerlineVn2000[0],
  }
)

// 5. Polygon-only GeoJSON is NOT automatically turned into a road centerline
const polygonOnlyGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Khu đất mẫu' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [106.6601, 10.7626],
            [106.6612, 10.7626],
            [106.6612, 10.7634],
            [106.6601, 10.7634],
            [106.6601, 10.7626],
          ],
        ],
      },
    },
  ],
}
const impPoly = parseAndValidateWgs84GeoJson(polygonOnlyGeoJson)
const builtPoly = buildStudioGeoJsonFromWgs84Import(impPoly, null, 7.0, null)
record(
  'STGA-05',
  'Phân biệt LineString/Polygon/Point: Không tự động biến Polygon thành tim tuyến đường',
  impPoly.valid === true &&
    impPoly.summary.polygonCount === 1 &&
    impPoly.summary.lineStringCount === 0 &&
    builtPoly.hasCenterline === false,
  {
    summary: impPoly.summary,
    hasCenterline: builtPoly.hasCenterline,
  }
)

// 6. Multiple LineString selection support
const multiLineGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { roadCode: 'LINE-A', roadName: 'Tuyến nhánh A' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [106.660172, 10.762622],
          [106.6612, 10.762622],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { roadCode: 'LINE-B', roadName: 'Tuyến chính B' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [106.660172, 10.762622],
          [106.6612, 10.762622],
          [106.6612, 10.76345],
        ],
      },
    },
  ],
}
const impMulti = parseAndValidateWgs84GeoJson(multiLineGeoJson)
const builtLineB = buildStudioGeoJsonFromWgs84Import(
  impMulti,
  'linestring-2',
  7.0,
  { centralMeridian: 105.75, scaleFactor: 0.9999 }
)
record(
  'STGA-06',
  'Khi có nhiều LineString: Cho phép chọn LineString cụ thể làm tim tuyến chính',
  impMulti.lineStringCandidates.length === 2 &&
    builtLineB.selectedCandidate.roadCode === 'LINE-B',
  {
    candidates: impMulti.lineStringCandidates.map((c) => ({
      id: c.id,
      name: c.name,
      lengthMeters: c.lengthMeters,
    })),
    selectedRoadCode: builtLineB.selectedCandidate.roadCode,
  }
)

// 7. Export RoadGuard GeometryDraftInput JSON & Compare against Reference Sample 2 (GEO-RG-20261025-01)
const REF_SAMPLE_2_DRAFT = {
  sourceKind: 'COORDINATES',
  sourceCrs: 32648,
  stationOriginMeters: 0,
  changeReason: 'Tạo hình học tuyến ban đầu từ dữ liệu mẫu',
  coordinates: [
    { x: 681538.49, y: 1190261.22 },
    { x: 681650.94, y: 1190261.96 },
    { x: 681650.34, y: 1190353.56 },
  ],
  sourceFileId: null,
  trackIndex: null,
  trackSegmentIndex: null,
  widthProfile: [
    {
      fromOffsetMeters: 0,
      toOffsetMeters: 204.05441628862898,
      widthMeters: 7,
    },
  ],
  surveyWidthMeters: 12,
  roadCode: 'GEO-RG-20261025-01',
  roadName: 'Đường mẫu chuẩn bị cho RoadGuard',
}

const studioGeneratedDraft = buildRoadGuardGeometryDraft({
  centerlineWgs84: REF_SAMPLE_1_GEOJSON.features[0].geometry.coordinates,
  sourceCrs: 32648,
  stationOriginMeters: 0,
  changeReason: 'Tạo hình học tuyến ban đầu từ dữ liệu mẫu',
  roadWidth: 7,
  surveyWidthMeters: 12,
  roadCode: 'GEO-RG-20261025-01',
  roadName: 'Đường mẫu chuẩn bị cho RoadGuard',
})

// Also verify Sample 2 structure with exact recomputed length from its 3 UTM coordinates
const sample2ExactLength =
  Math.hypot(681650.94 - 681538.49, 1190261.96 - 1190261.22) +
  Math.hypot(681650.34 - 681650.94, 1190353.56 - 1190261.96)
const refSample2Normalized = {
  ...REF_SAMPLE_2_DRAFT,
  widthProfile: [
    {
      fromOffsetMeters: 0,
      toOffsetMeters: sample2ExactLength,
      widthMeters: 7,
    },
  ],
}
const refSample2Validation = validateRoadGuardGeometryDraft(
  refSample2Normalized,
  32648
)

// Verify exact key parity with Sample 2 structure
const expectedKeys = Object.keys(REF_SAMPLE_2_DRAFT).sort()
const actualKeys = Object.keys(studioGeneratedDraft.draft).sort()
assert.deepEqual(actualKeys, expectedKeys)

// Compare Studio's UTM 48N (EPSG:32648) coordinates against pyproj reference
const PYPROJ_UTM48N_REF = [
  { x: 681530.924711, y: 1190223.864471 },
  { x: 681643.360506, y: 1190224.473211 },
  { x: 681642.864472, y: 1190316.060196 },
]
const utmDiffsMm = studioGeneratedDraft.draft.coordinates.map(
  (pt, i) =>
    Math.hypot(pt.x - PYPROJ_UTM48N_REF[i].x, pt.y - PYPROJ_UTM48N_REF[i].y) *
    1000
)

record(
  'STGA-07',
  'Đối chiếu JSON xuất từ Studio với cấu trúc Mẫu tham chiếu 2 (GEO-RG-20261025-01), pyproj EPSG:32648 và 14 quy tắc GeometryEngine',
  refSample2Validation.valid === true &&
    studioGeneratedDraft.valid === true &&
    Math.max(...utmDiffsMm) < 0.01,
  {
    schemaKeysMatchSample2: true,
    refSample2NormalizedValid: refSample2Validation.valid,
    studioGeneratedValid: studioGeneratedDraft.valid,
    maxDiscrepancyVsPyprojUtm48NMm: Number(Math.max(...utmDiffsMm).toFixed(5)),
    studioToOffsetMeters:
      studioGeneratedDraft.draft.widthProfile[0].toOffsetMeters,
    studioCoordinates: studioGeneratedDraft.draft.coordinates,
  }
)

// 8. Negative Contract Validation Tests (Reject invalid sourceCrs, self-intersecting LineString, missing roadCode, mismatched widthProfile)
const badCrsCheck = validateRoadGuardGeometryDraft(
  { ...REF_SAMPLE_2_DRAFT, sourceCrs: 4326 },
  32648
)
const badWidthCheck = validateRoadGuardGeometryDraft(
  {
    ...REF_SAMPLE_2_DRAFT,
    widthProfile: [{ fromOffsetMeters: 0, toOffsetMeters: 199.0, widthMeters: 7 }],
  },
  32648
)
const selfIntersectingDraft = validateRoadGuardGeometryDraft(
  {
    ...REF_SAMPLE_2_DRAFT,
    coordinates: [
      { x: 681500, y: 1190200 },
      { x: 681600, y: 1190300 },
      { x: 681600, y: 1190200 },
      { x: 681500, y: 1190300 },
    ],
  },
  32648
)
record(
  'STGA-08',
  'Kiểm tra từ chối dữ liệu lỗi theo đúng GeometryEngine (Sai SRID, sai toOffsetMeters, LineString tự cắt)',
  badCrsCheck.valid === false &&
    badWidthCheck.valid === false &&
    selfIntersectingDraft.valid === false,
  {
    badCrsErrors: badCrsCheck.errors,
    badWidthErrors: badWidthCheck.errors,
    selfIntersectingErrors: selfIntersectingDraft.errors,
  }
)

console.log(
  JSON.stringify(
    {
      suite: 'STAGE_A_CRS_AND_ROADGUARD_CONTRACT_SUITE',
      allPassed: results.every((r) => r.passed),
      passedCount: `${results.filter((r) => r.passed).length}/${results.length}`,
      contractVerificationStatus:
        'CONTRACT VALIDATED – END-TO-END IMPORT NOT VERIFIED',
      results,
    },
    null,
    2
  )
)
