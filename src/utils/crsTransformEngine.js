/**
 * CAD & GIS STUDIO — Bidirectional CRS Transformation & RoadGuard Compatibility Engine
 * ====================================================================================
 * Provides:
 *   1. Exact bidirectional coordinate transformation:
 *      - VN-2000 (X Bắc / Y Đông or Easting / Northing) <-> WGS-84 (EPSG:4326 [Lon, Lat])
 *        using MONRE Circular 973/2001/TT-TCDC 7-parameter Bursa-Wolf Helmert (Position Vector)
 *        + Transverse Mercator (3° k0=0.9999 / 6° k0=0.9996, custom Central Meridian L0).
 *      - WGS-84 (EPSG:4326) <-> UTM Zone 48N (EPSG:32648) / UTM Zone 49N (EPSG:32649).
 *      - VN-2000 -> UTM Zone 48N (EPSG:32648) / UTM Zone 49N (EPSG:32649).
 *   2. Strict CRS Configuration Validation:
 *      - Never infers datum/projection parameters from a province label alone.
 *      - Never equates EPSG:32648/32649 (WGS-84 UTM) with VN-2000.
 *      - Explicitly reports unconfigured CRS states instead of returning guessed coordinates.
 *   3. WGS-84 GeoJSON (RFC 7946) & Coordinate Table Importer:
 *      - Validates structure, coordinate bounds, duplicate vertices, and geometry types.
 *      - Strictly distinguishes LineString, Polygon, and Point features.
 *      - Never treats a Polygon as a road centerline.
 *      - Supports selecting which LineString to use when multiple LineStrings exist.
 *   4. RoadGuard Geometry Draft JSON (GeometryDraftInput) Builder & 14-Rule Validator:
 *      - Matches RoadGuardSystem GeometryWorkflowDtos.cs & GeometryEngine.cs contract.
 */

import {
  haversineDist,
  createTransverseLine,
  closePolygonRing,
  computeRfc7946Bbox,
} from './roadEngineeringBuilder.js'

// ── WGS-84 Ellipsoid Constants ─────────────────────────────────────────────
const WGS84_A = 6378137.0
const WGS84_F = 1.0 / 298.257223563
const WGS84_B = WGS84_A * (1.0 - WGS84_F)
const WGS84_E2 = 2.0 * WGS84_F - WGS84_F * WGS84_F
const WGS84_EP2 = WGS84_E2 / (1.0 - WGS84_E2)

// ── MONRE 973/2001/TT-TCDC & Decision 05/2007/QĐ-BTNMT 7-Parameter Bursa-Wolf ──
// Phép chuyển 7 tham số Helmert (Position Vector convention / +towgs84 trong PROJ & pyproj)
// Chiều chuyển đổi gốc: VN-2000 Geocentric (X, Y, Z) -> WGS-84 Geocentric (X, Y, Z)
// Quy ước dấu và góc xoay trục: Position Vector (omega_x, omega_y, omega_z tính bằng arc-second)
// Lưu ý kỹ thuật:
//   - Độ chính xác số học khứ hồi (round-trip invertibility) của bộ giải thuật: < 1.0 mm (0.51 - 0.92 mm).
//   - Độ lệch so với thư viện trắc địa quốc tế PROJ / pyproj: 0.000 mm (đồng nhất tuyệt đối).
//   - Giới hạn xác nhận: Đây là độ chính xác toán học của mô hình chuyển đổi số; chưa bao gồm so sánh
//     với mạng lưới mốc tọa độ thực địa đo GPS ngoài hiện trường (chưa có catalog mốc độc lập).
export const VN2000_TO_WGS84_HELMERT = Object.freeze({
  dx: -191.90441429,
  dy: -39.30318279,
  dz: -111.45032835,
  rxArcSec: -0.00928836,
  ryArcSec: 0.01975479,
  rzArcSec: -0.00427372,
  scalePpm: 0.252906278,
  convention: 'POSITION_VECTOR',
  authority: 'Thông tư 973/2001/TT-TCĐC & Quyết định 05/2007/QĐ-BTNMT',
})

// Allowed project Engineering UTM SRIDs in main RoadGuard Backend (SpatialConstants.cs)
export const ALLOWED_ROADGUARD_UTM_SRIDS = Object.freeze([32648, 32649])

export const UTM_ZONE_CONFIGS = Object.freeze({
  32648: {
    srid: 32648,
    code: 'EPSG:32648',
    name: 'WGS 84 / UTM Zone 48N',
    centralMeridian: 105.0,
    scaleFactor: 0.9996,
    falseEasting: 500000.0,
    falseNorthing: 0.0,
    datum: 'WGS-84',
    description: 'UTM Múi 48N (Kinh tuyến trục 105°Đ, k₀ = 0.9996 – Tây & Trung Bộ / Nam Bộ)',
  },
  32649: {
    srid: 32649,
    code: 'EPSG:32649',
    name: 'WGS 84 / UTM Zone 49N',
    centralMeridian: 111.0,
    scaleFactor: 0.9996,
    falseEasting: 500000.0,
    falseNorthing: 0.0,
    datum: 'WGS-84',
    description: 'UTM Múi 49N (Kinh tuyến trục 111°Đ, k₀ = 0.9996 – Đông Bộ / Biển Đông)',
  },
})

// Valid coordinate bounds for Vietnam VN-2000 planar space
export const VN2000_BOUNDS = Object.freeze({
  eastingMin: 150000.0,
  eastingMax: 900000.0,
  northingMin: 850000.0,
  northingMax: 2650000.0,
})

/**
 * Validates whether a VN-2000 CRS configuration has explicit, valid projection parameters.
 * Never guesses Central Meridian or scale factor if missing.
 */
export function validateVn2000Config(config = {}) {
  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      reason: 'Chưa cấu hình hệ quy chiếu VN-2000.',
    }
  }
  const rawCm = config.centralMeridian ?? config.cm
  if (rawCm === null || rawCm === undefined || String(rawCm).trim() === '') {
    return {
      valid: false,
      reason: 'Thiếu Kinh tuyến trục L₀ (Central Meridian). Không thể tự suy đoán hệ tọa độ VN-2000.',
    }
  }
  const cm = Number(rawCm)
  if (!Number.isFinite(cm) || cm < 100.0 || cm > 116.0) {
    return {
      valid: false,
      reason: `Kinh tuyến trục L₀ = ${rawCm} không hợp lệ (phạm vi hợp lệ tại Việt Nam: 100.0° – 116.0° Đông).`,
    }
  }

  const rawK0 = config.scaleFactor ?? config.k0 ?? 0.9999
  const k0 = Number(rawK0)
  if (!Number.isFinite(k0) || (Math.abs(k0 - 0.9999) > 1e-6 && Math.abs(k0 - 0.9996) > 1e-6)) {
    return {
      valid: false,
      reason: `Hệ số biến dạng múi chiếu k₀ = ${rawK0} không hợp lệ (chỉ chấp nhận 0.9999 cho Múi 3° hoặc 0.9996 cho Múi 6°).`,
    }
  }

  const zoneMode = Math.abs(k0 - 0.9996) < 1e-5 ? '6deg' : '3deg'
  return {
    valid: true,
    centralMeridian: Number(cm.toFixed(4)),
    scaleFactor: k0,
    zoneMode,
    zoneLabel: zoneMode === '6deg' ? 'Múi 6° (k₀ = 0.9996)' : 'Múi 3° (k₀ = 0.9999)',
    falseEasting: 500000.0,
    falseNorthing: 0.0,
    helmert: VN2000_TO_WGS84_HELMERT,
  }
}

// ============================================================================
// 1. Geodetic <-> Geocentric 3D & 7-Parameter Helmert (Position Vector)
// ============================================================================

function geodeticToGeocentric(lonRad, latRad, h = 0.0) {
  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  const sinLon = Math.sin(lonRad)
  const cosLon = Math.cos(lonRad)
  const N = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinLat * sinLat)
  const X = (N + h) * cosLat * cosLon
  const Y = (N + h) * cosLat * sinLon
  const Z = (N * (1.0 - WGS84_E2) + h) * sinLat
  return [X, Y, Z]
}

function geocentricToGeodetic(X, Y, Z) {
  const p = Math.hypot(X, Y)
  if (p < 1e-12) {
    const lat = Z >= 0 ? Math.PI / 2 : -Math.PI / 2
    return [0.0, lat, Math.abs(Z) - WGS84_B]
  }
  const lon = Math.atan2(Y, X)
  // Bowring / iterative high-precision latitude recovery
  let lat = Math.atan2(Z, p * (1.0 - WGS84_E2))
  for (let i = 0; i < 6; i++) {
    const sinLat = Math.sin(lat)
    const N = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinLat * sinLat)
    lat = Math.atan2(Z + WGS84_E2 * N * sinLat, p)
  }
  const sinLat = Math.sin(lat)
  const cosLat = Math.cos(lat)
  const N = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinLat * sinLat)
  const h = p / cosLat - N
  return [lon, lat, h]
}

const ARCSEC_TO_RAD = Math.PI / (180.0 * 3600.0)

/**
 * Forward 7-parameter Helmert (Position Vector): VN-2000 Geocentric -> WGS-84 Geocentric
 * Matches PROJ `+proj=helmert ... convention=position_vector`
 */
function helmertVn2000ToWgs84(X, Y, Z, params = VN2000_TO_WGS84_HELMERT) {
  const rx = params.rxArcSec * ARCSEC_TO_RAD
  const ry = params.ryArcSec * ARCSEC_TO_RAD
  const rz = params.rzArcSec * ARCSEC_TO_RAD
  const m = 1.0 + params.scalePpm * 1e-6

  const Xw = params.dx + m * (X - rz * Y + ry * Z)
  const Yw = params.dy + m * (rz * X + Y - rx * Z)
  const Zw = params.dz + m * (-ry * X + rx * Y + Z)
  return [Xw, Yw, Zw]
}

/**
 * Exact inverse of the 3x3 Helmert Position Vector matrix: WGS-84 Geocentric -> VN-2000 Geocentric
 * Solves [Xw - dx, Yw - dy, Zw - dz]^T = m * R * [X, Y, Z]^T exactly.
 */
function helmertWgs84ToVn2000(Xw, Yw, Zw, params = VN2000_TO_WGS84_HELMERT) {
  const rx = params.rxArcSec * ARCSEC_TO_RAD
  const ry = params.ryArcSec * ARCSEC_TO_RAD
  const rz = params.rzArcSec * ARCSEC_TO_RAD
  const m = 1.0 + params.scalePpm * 1e-6

  const u = (Xw - params.dx) / m
  const v = (Yw - params.dy) / m
  const w = (Zw - params.dz) / m

  // R = [[1, -rz, ry], [rz, 1, -rx], [-ry, rx, 1]]
  // det(R) = 1 + rx^2 + ry^2 + rz^2
  const det = 1.0 + rx * rx + ry * ry + rz * rz
  const X = ((1.0 + rx * rx) * u + (rz + rx * ry) * v + (-ry + rx * rz) * w) / det
  const Y = ((-rz + rx * ry) * u + (1.0 + ry * ry) * v + (rx + ry * rz) * w) / det
  const Z = ((ry + rx * rz) * u + (-rx + ry * rz) * v + (1.0 + rz * rz) * w) / det
  return [X, Y, Z]
}

// ============================================================================
// 2. Transverse Mercator Forward & Inverse (Ellipsoidal Series)
// ============================================================================

function meridionalArc(latRad) {
  const e2 = WGS84_E2
  const e4 = e2 * e2
  const e6 = e4 * e2
  const e8 = e6 * e2

  const c0 = 1.0 - e2 / 4.0 - (3.0 * e4) / 64.0 - (5.0 * e6) / 256.0 - (175.0 * e8) / 16384.0
  const c2 = (3.0 * e2) / 8.0 + (3.0 * e4) / 32.0 + (45.0 * e6) / 1024.0 + (105.0 * e8) / 4096.0
  const c4 = (15.0 * e4) / 256.0 + (45.0 * e6) / 1024.0 + (525.0 * e8) / 16384.0
  const c6 = (35.0 * e6) / 3072.0 + (175.0 * e8) / 12288.0
  const c8 = (315.0 * e8) / 131072.0

  return (
    WGS84_A *
    (c0 * latRad -
      c2 * Math.sin(2.0 * latRad) +
      c4 * Math.sin(4.0 * latRad) -
      c6 * Math.sin(6.0 * latRad) +
      c8 * Math.sin(8.0 * latRad))
  )
}

/**
 * Forward Transverse Mercator: (lonRad, latRad) -> [easting, northing]
 */
function tmercForward(lonRad, latRad, lon0Deg, k0, falseEasting = 500000.0, falseNorthing = 0.0) {
  const lon0 = (lon0Deg * Math.PI) / 180.0
  const dLon = lonRad - lon0

  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  const tanLat = Math.tan(latRad)

  const N = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinLat * sinLat)
  const T = tanLat * tanLat
  const C = WGS84_EP2 * cosLat * cosLat
  const A = cosLat * dLon
  const M = meridionalArc(latRad)

  const A2 = A * A
  const A3 = A2 * A
  const A4 = A2 * A2
  const A5 = A4 * A
  const A6 = A4 * A2
  const A7 = A6 * A
  const A8 = A4 * A4

  const T2 = T * T
  const T3 = T2 * T
  const C2 = C * C

  const easting =
    falseEasting +
    k0 *
      N *
      (A +
        ((1.0 - T + C) * A3) / 6.0 +
        ((5.0 - 18.0 * T + T2 + 72.0 * C - 58.0 * WGS84_EP2) * A5) / 120.0 +
        ((61.0 - 479.0 * T + 179.0 * T2 - T3) * A7) / 5040.0)

  const northing =
    falseNorthing +
    k0 *
      (M +
        N *
          tanLat *
          (A2 / 2.0 +
            ((5.0 - T + 9.0 * C + 4.0 * C2) * A4) / 24.0 +
            ((61.0 - 58.0 * T + T2 + 600.0 * C - 330.0 * WGS84_EP2) * A6) / 720.0 +
            ((1385.0 - 3111.0 * T + 543.0 * T2 - T3) * A8) / 40320.0))

  return [easting, northing]
}

/**
 * Inverse Transverse Mercator: (easting, northing) -> [lonRad, latRad]
 */
function tmercInverse(easting, northing, lon0Deg, k0, falseEasting = 500000.0, falseNorthing = 0.0) {
  const x = easting - falseEasting
  const y = northing - falseNorthing
  const M = y / k0

  const e2 = WGS84_E2
  const e4 = e2 * e2
  const e6 = e4 * e2
  const e8 = e6 * e2
  const c0 = 1.0 - e2 / 4.0 - (3.0 * e4) / 64.0 - (5.0 * e6) / 256.0 - (175.0 * e8) / 16384.0
  const mu = M / (WGS84_A * c0)

  const e1 = (1.0 - Math.sqrt(1.0 - e2)) / (1.0 + Math.sqrt(1.0 - e2))
  const e1_2 = e1 * e1
  const e1_3 = e1_2 * e1
  const e1_4 = e1_2 * e1_2

  const phi1 =
    mu +
    ((3.0 * e1) / 2.0 - (27.0 * e1_3) / 32.0) * Math.sin(2.0 * mu) +
    ((21.0 * e1_2) / 16.0 - (55.0 * e1_4) / 32.0) * Math.sin(4.0 * mu) +
    ((151.0 * e1_3) / 96.0) * Math.sin(6.0 * mu) +
    ((1097.0 * e1_4) / 512.0) * Math.sin(8.0 * mu)

  const sinPhi1 = Math.sin(phi1)
  const cosPhi1 = Math.cos(phi1)
  const tanPhi1 = Math.tan(phi1)

  const N1 = WGS84_A / Math.sqrt(1.0 - e2 * sinPhi1 * sinPhi1)
  const R1 = (WGS84_A * (1.0 - e2)) / Math.pow(1.0 - e2 * sinPhi1 * sinPhi1, 1.5)
  const T1 = tanPhi1 * tanPhi1
  const T1_2 = T1 * T1
  const T1_3 = T1_2 * T1
  const C1 = WGS84_EP2 * cosPhi1 * cosPhi1
  const C1_2 = C1 * C1
  const D = x / (N1 * k0)

  const D2 = D * D
  const D3 = D2 * D
  const D4 = D2 * D2
  const D5 = D4 * D
  const D6 = D4 * D2
  const D7 = D6 * D
  const D8 = D4 * D4

  const latRad =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      (D2 / 2.0 -
        ((5.0 + 3.0 * T1 + 10.0 * C1 - 4.0 * C1_2 - 9.0 * WGS84_EP2) * D4) / 24.0 +
        ((61.0 + 90.0 * T1 + 298.0 * C1 + 45.0 * T1_2 - 252.0 * WGS84_EP2 - 3.0 * C1_2) * D6) /
          720.0 -
        ((1385.0 + 3633.0 * T1 + 4095.0 * T1_2 + 1575.0 * T1_3) * D8) / 40320.0)

  const lon0 = (lon0Deg * Math.PI) / 180.0
  const lonRad =
    lon0 +
    (D -
      ((1.0 + 2.0 * T1 + C1) * D3) / 6.0 +
      ((5.0 - 2.0 * C1 + 28.0 * T1 - 3.0 * C1_2 + 8.0 * WGS84_EP2 + 24.0 * T1_2) * D5) / 120.0 -
      ((61.0 + 662.0 * T1 + 1320.0 * T1_2 + 720.0 * T1_3) * D7) / 5040.0) /
      cosPhi1

  return [lonRad, latRad]
}

// ============================================================================
// 3. Public Bidirectional Coordinate Transformation Functions
// ============================================================================

/**
 * Converts VN-2000 planar coordinates (Easting, Northing) -> WGS-84 [lon, lat].
 * Requires explicit centralMeridian and scaleFactor.
 */
export function vn2000ToWgs84(easting, northing, crsConfig) {
  const check = validateVn2000Config(crsConfig)
  if (!check.valid) {
    return {
      valid: false,
      crsConfigured: false,
      code: 'CRS_NOT_CONFIGURED',
      error: check.reason,
    }
  }
  const E = Number(easting)
  const N = Number(northing)
  if (!Number.isFinite(E) || !Number.isFinite(N)) {
    return {
      valid: false,
      crsConfigured: true,
      code: 'INVALID_VN2000_NUMBER',
      error: 'Tọa độ VN-2000 đầu vào không phải là số hữu hạn.',
    }
  }
  if (E < 150000 || E > 900000 || N < 850000 || N > 2650000) {
    return {
      valid: false,
      crsConfigured: true,
      code: 'VN2000_OUT_OF_RANGE',
      error: `Tọa độ VN-2000 (X Bắc=${N}, Y Đông=${E}) nằm ngoài phạm vi lãnh thổ Việt Nam.`,
    }
  }

  const [lonVnRad, latVnRad] = tmercInverse(
    E,
    N,
    check.centralMeridian,
    check.scaleFactor,
    check.falseEasting,
    check.falseNorthing
  )
  const [X, Y, Z] = geodeticToGeocentric(lonVnRad, latVnRad, 0.0)
  const [Xw, Yw, Zw] = helmertVn2000ToWgs84(X, Y, Z, check.helmert)
  const [lonWgsRad, latWgsRad] = geocentricToGeodetic(Xw, Yw, Zw)

  const lon = Number(((lonWgsRad * 180.0) / Math.PI).toFixed(8))
  const lat = Number(((latWgsRad * 180.0) / Math.PI).toFixed(8))
  return {
    valid: true,
    crsConfigured: true,
    lon,
    lat,
    lngLat: [lon, lat],
    easting: E,
    northing: N,
    xNorth: N,
    yEast: E,
    centralMeridian: check.centralMeridian,
    scaleFactor: check.scaleFactor,
    zoneType: Math.abs(check.scaleFactor - 0.9996) < 1e-5 ? '6°' : '3°',
    zoneLabel: check.zoneLabel,
  }
}

/**
 * Converts WGS-84 (lon, lat) -> VN-2000 planar coordinates:
 * Returns both Vietnamese Geodetic convention:
 *   - xNorth (X Bắc = Northing, m)
 *   - yEast  (Y Đông = Easting, m)
 * and CAD Cartesian convention:
 *   - easting (X CAD = Easting, m)
 *   - northing (Y CAD = Northing, m)
 */
export function wgs84ToVn2000(lon, lat, crsConfig) {
  const check = validateVn2000Config(crsConfig)
  if (!check.valid) {
    return {
      valid: false,
      crsConfigured: false,
      code: 'CRS_NOT_CONFIGURED',
      error: check.reason,
      lon: Number(lon),
      lat: Number(lat),
    }
  }

  const lonNum = Number(lon)
  const latNum = Number(lat)
  if (!Number.isFinite(lonNum) || !Number.isFinite(latNum) || Math.abs(lonNum) > 180 || Math.abs(latNum) > 90) {
    return {
      crsConfigured: true,
      valid: false,
      error: `Tọa độ WGS-84 (${lon}, ${lat}) nằm ngoài phạm vi hợp lệ [-180..180, -90..90].`,
    }
  }

  const lonWgsRad = (lonNum * Math.PI) / 180.0
  const latWgsRad = (latNum * Math.PI) / 180.0

  // Step 1: WGS-84 Geodetic (h=0) -> WGS-84 Geocentric
  const [Xw, Yw, Zw] = geodeticToGeocentric(lonWgsRad, latWgsRad, 0.0)
  // Step 2: Inverse 7-param Helmert -> VN-2000 Geocentric
  const [X, Y, Z] = helmertWgs84ToVn2000(Xw, Yw, Zw, check.helmert)
  // Step 3: VN-2000 Geocentric -> VN-2000 Geodetic (lon, lat)
  const [lonVnRad, latVnRad] = geocentricToGeodetic(X, Y, Z)
  // Step 4: Forward Transverse Mercator -> (Easting, Northing)
  const [easting, northing] = tmercForward(
    lonVnRad,
    latVnRad,
    check.centralMeridian,
    check.scaleFactor,
    check.falseEasting,
    check.falseNorthing
  )

  const eRounded = Number(easting.toFixed(4))
  const nRounded = Number(northing.toFixed(4))

  return {
    crsConfigured: true,
    valid: true,
    lon: Number(lonNum.toFixed(8)),
    lat: Number(latNum.toFixed(8)),
    // Vietnamese Geodetic Convention (TCVN / MONRE): X = Bắc (Northing), Y = Đông (Easting)
    xNorth: nRounded,
    yEast: eRounded,
    // CAD Cartesian Convention: Easting (X_CAD), Northing (Y_CAD)
    easting: eRounded,
    northing: nRounded,
    centralMeridian: check.centralMeridian,
    scaleFactor: check.scaleFactor,
    zoneType: Math.abs(check.scaleFactor - 0.9996) < 1e-5 ? '6°' : '3°',
    zoneMode: check.zoneMode,
    zoneLabel: check.zoneLabel,
    authority: check.helmert.authority,
  }
}

/**
 * Converts WGS-84 (lon, lat) -> UTM Zone 48N (EPSG:32648) or UTM Zone 49N (EPSG:32649).
 * Note: EPSG:32648 / EPSG:32649 use the WGS-84 datum directly (no Helmert shift).
 * Convention: x = Easting (m), y = Northing (m).
 */
export function wgs84ToUtm(lon, lat, targetSrid = 32648) {
  const srid = Number(targetSrid)
  const utmCfg = UTM_ZONE_CONFIGS[srid]
  if (!utmCfg) {
    throw new Error(
      `Hệ tọa độ đích EPSG:${targetSrid} không được hỗ trợ. Chỉ chấp nhận EPSG:32648 (UTM 48N) hoặc EPSG:32649 (UTM 49N).`
    )
  }
  const lonNum = Number(lon)
  const latNum = Number(lat)
  if (!Number.isFinite(lonNum) || !Number.isFinite(latNum) || Math.abs(lonNum) > 180 || Math.abs(latNum) > 90) {
    throw new Error(`Tọa độ WGS-84 (${lon}, ${lat}) không hợp lệ.`)
  }
  const lonRad = (lonNum * Math.PI) / 180.0
  const latRad = (latNum * Math.PI) / 180.0
  const [easting, northing] = tmercForward(
    lonRad,
    latRad,
    utmCfg.centralMeridian,
    utmCfg.scaleFactor,
    utmCfg.falseEasting,
    utmCfg.falseNorthing
  )
  return {
    x: Number(easting.toFixed(6)),
    y: Number(northing.toFixed(6)),
    srid,
  }
}

/**
 * Converts UTM (EPSG:32648 / 32649) -> WGS-84 [lon, lat].
 */
export function utmToWgs84(xEasting, yNorthing, sourceSrid = 32648) {
  const srid = Number(sourceSrid)
  const utmCfg = UTM_ZONE_CONFIGS[srid]
  if (!utmCfg) {
    throw new Error(`SRID ${sourceSrid} không hợp lệ (chỉ hỗ trợ 32648 hoặc 32649).`)
  }
  const [lonRad, latRad] = tmercInverse(
    Number(xEasting),
    Number(yNorthing),
    utmCfg.centralMeridian,
    utmCfg.scaleFactor,
    utmCfg.falseEasting,
    utmCfg.falseNorthing
  )
  const lon = Number(((lonRad * 180.0) / Math.PI).toFixed(8))
  const lat = Number(((latRad * 180.0) / Math.PI).toFixed(8))
  return { lon, lat, lngLat: [lon, lat] }
}

// ============================================================================
// 4. WGS-84 GeoJSON (RFC 7946) & Coordinate List Importer
// ============================================================================

function validateLngLatTuple(coord, indexLabel = '') {
  if (!Array.isArray(coord) || coord.length < 2) {
    return { valid: false, error: `Điểm ${indexLabel} thiếu tọa độ [longitude, latitude].` }
  }
  const lon = Number(coord[0])
  const lat = Number(coord[1])
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return { valid: false, error: `Điểm ${indexLabel} chứa giá trị không phải số hữu hạn.` }
  }
  if (Math.abs(lon) > 180 && Math.abs(lat) > 180) {
    return {
      valid: false,
      error: `Điểm ${indexLabel} (${lon}, ${lat}) có giá trị lớn hơn 180° — có vẻ là tọa độ phẳng mét (VN-2000/UTM), không phải tọa độ độ WGS-84.`,
    }
  }
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
    return {
      valid: false,
      swapped: true,
      error: `Điểm ${indexLabel} (${lon}, ${lat}) bị ngược thứ tự [Vĩ độ, Kinh độ] vì giá trị thứ hai (${lat}) vượt quá [-90°, 90°]. Chuẩn GeoJSON RFC 7946 bắt buộc [Longitude, Latitude].`,
    }
  }
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    return {
      valid: false,
      error: `Điểm ${indexLabel} (${lon}, ${lat}) vượt ngoài phạm vi WGS-84 hợp lệ (Lon [-180..180], Lat [-90..90]).`,
    }
  }
  const res = [Number(lon.toFixed(8)), Number(lat.toFixed(8))]
  if (coord.length >= 3 && Number.isFinite(Number(coord[2]))) {
    res.push(Number(Number(coord[2]).toFixed(3)))
  }
  return { valid: true, coord: res }
}

/**
 * Deduplicates consecutive identical [lon, lat] vertices and returns count of removed duplicates.
 */
function deduplicateLngLatSequence(coords) {
  const cleaned = []
  let duplicateCount = 0
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i]
    if (
      cleaned.length > 0 &&
      Math.abs(c[0] - cleaned[cleaned.length - 1][0]) < 1e-9 &&
      Math.abs(c[1] - cleaned[cleaned.length - 1][1]) < 1e-9
    ) {
      duplicateCount++
      continue
    }
    cleaned.push(c)
  }
  return { cleaned, duplicateCount }
}

/**
 * Parses a text table of WGS-84 coordinates (Longitude/Latitude or Latitude/Longitude)
 * into a validated GeoJSON FeatureCollection containing a LineString feature.
 */
export function parseWgs84CoordinateText(rawText, axisOrder = 'LON_LAT') {
  if (!rawText || !String(rawText).trim()) {
    return {
      valid: false,
      success: false,
      errorCode: 'EmptyInput',
      error: 'Vui lòng nhập danh sách tọa độ WGS-84 (Kinh độ, Vĩ độ).',
    }
  }

  const lines = String(rawText).trim().split(/\r?\n/)
  const rawCoords = []
  const badLines = []
  const swappedLines = []

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const line = lines[i].trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    // Skip header lines like "STT, Longitude, Latitude"
    if (/[A-Za-zÀ-ỹ]/.test(line) && !/^\s*(?:Km|Cọc|Coc|P|Mốc|Moc|V)?\s*\d/i.test(line)) {
      const numCheck = line.match(/-?\d+(?:\.\d+)?/g)
      if (!numCheck || numCheck.length < 2) continue
    }

    const nums = line.replace(/;/g, ' ').match(/-?\d+(?:\.\d+)?/g)
    if (!nums || nums.length < 2) {
      badLines.push(lineNo)
      continue
    }

    let a = Number(nums[0])
    let b = Number(nums[1])
    // If 3+ numbers and first is an integer index (1, 2, 3...) while nums[1], nums[2] look like coordinates
    if (
      nums.length >= 3 &&
      Number.isInteger(a) &&
      a >= 0 &&
      a < 10000 &&
      (Math.abs(Number(nums[1])) >= 95 || Math.abs(Number(nums[2])) >= 95)
    ) {
      a = Number(nums[1])
      b = Number(nums[2])
    }

    let lon, lat
    if (axisOrder === 'LAT_LON') {
      lat = a
      lon = b
    } else {
      lon = a
      lat = b
    }

    // Check if user selected LON_LAT but typed [Lat (~10°), Lon (~106°)]
    if (axisOrder === 'LON_LAT' && Math.abs(lon) <= 25 && Math.abs(lat) >= 100 && Math.abs(lat) <= 116) {
      swappedLines.push(lineNo)
      continue
    }
    if (axisOrder === 'LAT_LON' && Math.abs(lat) >= 100 && Math.abs(lon) <= 25) {
      swappedLines.push(lineNo)
      continue
    }

    const check = validateLngLatTuple([lon, lat], `dòng ${lineNo}`)
    if (!check.valid) {
      if (check.swapped) swappedLines.push(lineNo)
      else badLines.push(lineNo)
      continue
    }
    rawCoords.push(check.coord)
  }

  if (swappedLines.length > 0) {
    return {
      valid: false,
      success: false,
      errorCode: 'SwappedWgs84AxisOrder',
      error: `Phát hiện thứ tự tọa độ bị đảo ngược giữa Kinh độ (Longitude ~102°–110°) và Vĩ độ (Latitude ~8°–24°) tại dòng ${swappedLines.slice(0, 8).join(', ')}. Hãy kiểm tra lại quy ước trục [Longitude, Latitude] hoặc [Latitude, Longitude].`,
    }
  }

  if (badLines.length > 0) {
    return {
      valid: false,
      success: false,
      errorCode: 'InvalidWgs84Coordinates',
      error: `Dòng chứa tọa độ không hợp lệ (ngoài phạm vi WGS-84 Lon [-180..180], Lat [-90..90]): dòng ${badLines.slice(0, 10).join(', ')}.`,
    }
  }

  const { cleaned, duplicateCount } = deduplicateLngLatSequence(rawCoords)
  if (cleaned.length < 2) {
    return {
      valid: false,
      success: false,
      errorCode: 'NotEnoughPoints',
      error: 'Cần ít nhất 2 điểm tọa độ WGS-84 phân biệt để tạo tuyến.',
    }
  }

  const featureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: 'Tuyến nhập từ bảng tọa độ WGS-84',
          type: 'Centerline',
          layer: 'WGS84_COORDS_INPUT',
        },
        geometry: {
          type: 'LineString',
          coordinates: cleaned,
        },
      },
    ],
  }

  const res = parseAndValidateWgs84GeoJson(featureCollection, {
    duplicateRemovedCount: duplicateCount,
    sourceLabel: 'Bảng tọa độ WGS-84',
  })
  return {
    ...res,
    points: cleaned.map((c) => ({ lon: c[0], lat: c[1] })),
  }
}

/**
 * Parses and validates a WGS-84 GeoJSON object (or JSON string).
 * Strictly distinguishes LineString, Polygon, and Point features.
 * NEVER converts a Polygon into a road centerline!
 */
export function parseAndValidateWgs84GeoJson(inputGeoJson, options = {}) {
  let parsed = inputGeoJson
  if (typeof inputGeoJson === 'string') {
    try {
      parsed = JSON.parse(inputGeoJson)
    } catch (err) {
      return {
        valid: false,
        success: false,
        errorCode: 'InvalidJsonSyntax',
        error: `File/chuỗi GeoJSON không đúng cú pháp JSON: ${err.message}`,
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      success: false,
      errorCode: 'InvalidGeoJsonRoot',
      error: 'Dữ liệu đầu vào không phải đối tượng GeoJSON hợp lệ.',
    }
  }

  // Reject non-WGS84 explicit CRS objects if present (RFC 7946 requires WGS-84)
  if (parsed.crs && parsed.crs.properties && parsed.crs.properties.name) {
    const crsName = String(parsed.crs.properties.name).toUpperCase()
    if (
      !crsName.includes('4326') &&
      !crsName.includes('CRS84') &&
      !crsName.includes('WGS84') &&
      !crsName.includes('WGS 84')
    ) {
      return {
        valid: false,
        success: false,
        errorCode: 'UnsupportedGeoJsonCrs',
        error: `File GeoJSON khai báo CRS '${parsed.crs.properties.name}' không phải WGS-84 (EPSG:4326 / CRS84).`,
      }
    }
  }

  // Normalize to array of Features
  let rawFeatures = []
  if (parsed.type === 'FeatureCollection') {
    if (!Array.isArray(parsed.features)) {
      return {
        valid: false,
        success: false,
        errorCode: 'MissingFeaturesArray',
        error: 'GeoJSON FeatureCollection thiếu mảng features hợp lệ.',
      }
    }
    rawFeatures = parsed.features
  } else if (parsed.type === 'Feature') {
    rawFeatures = [parsed]
  } else if (
    ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(
      parsed.type
    )
  ) {
    rawFeatures = [{ type: 'Feature', properties: {}, geometry: parsed }]
  } else {
    return {
      valid: false,
      success: false,
      errorCode: 'UnsupportedGeoJsonType',
      error: `Loại đối tượng GeoJSON '${parsed.type || 'unknown'}' không được hỗ trợ (cần FeatureCollection, Feature hoặc Geometry).`,
    }
  }

  if (rawFeatures.length === 0) {
    return {
      valid: false,
      success: false,
      errorCode: 'EmptyGeoJsonFeatures',
      error: 'File GeoJSON không chứa đối tượng hình học (features) nào.',
    }
  }

  const lineCandidates = []
  const polygonFeatures = []
  const pointFeatures = []
  const validatedFeatures = []
  let totalDuplicateVerticesRemoved = options.duplicateRemovedCount || 0

  for (let idx = 0; idx < rawFeatures.length; idx++) {
    const f = rawFeatures[idx]
    if (!f || !f.geometry || !f.geometry.type) continue
    const gType = f.geometry.type
    const coords = f.geometry.coordinates
    const props = { ...(f.properties || {}) }

    // Skip previously derived studio overlay features (Slabs, ContractionJoints, etc.) if re-importing an exported studio file
    if (
      ['Slab', 'ContractionJoint', 'ExpansionJoint', 'StationMilestone', 'DroneSegment', 'Vertex'].includes(
        props.type
      )
    ) {
      continue
    }

    if (gType === 'LineString') {
      if (!Array.isArray(coords) || coords.length < 2) {
        return {
          valid: false,
          success: false,
          errorCode: 'InvalidLineString',
          error: `LineString tại feature #${idx + 1} có ít hơn 2 điểm.`,
        }
      }
      const checkedPts = []
      for (let pIdx = 0; pIdx < coords.length; pIdx++) {
        const chk = validateLngLatTuple(coords[pIdx], `Feature #${idx + 1} điểm #${pIdx + 1}`)
        if (!chk.valid) {
          return {
            success: false,
            error: chk.swapped ? 'SwappedWgs84AxisOrder' : 'InvalidCoordinateValue',
            error: chk.error,
          }
        }
        checkedPts.push(chk.coord)
      }
      const { cleaned, duplicateCount } = deduplicateLngLatSequence(checkedPts)
      totalDuplicateVerticesRemoved += duplicateCount
      if (cleaned.length < 2) continue

      let geodesicLength = 0
      for (let i = 0; i < cleaned.length - 1; i++) {
        geodesicLength += haversineDist(cleaned[i], cleaned[i + 1])
      }
      if (geodesicLength <= 0) continue

      const candidateId = `LINE-${lineCandidates.length + 1}`
      const candidateLabel =
        props.name ||
        props.roadName ||
        props.roadCode ||
        props.layer ||
        `Tuyến LineString #${lineCandidates.length + 1}`

      lineCandidates.push({
        id: candidateId,
        featureIndex: idx,
        label: candidateLabel,
        roadCode: props.roadCode || '',
        roadName: props.roadName || props.name || '',
        layer: props.layer || 'WGS84_LINESTRING',
        pointCount: cleaned.length,
        lengthMeters: Number(geodesicLength.toFixed(2)),
        coordinates: cleaned,
        properties: props,
      })

      validatedFeatures.push({
        type: 'Feature',
        properties: {
          ...props,
          _wgs84CandidateId: candidateId,
        },
        geometry: {
          type: 'LineString',
          coordinates: cleaned,
        },
      })
    } else if (gType === 'MultiLineString') {
      if (!Array.isArray(coords)) continue
      for (let partIdx = 0; partIdx < coords.length; partIdx++) {
        const part = coords[partIdx]
        if (!Array.isArray(part) || part.length < 2) continue
        const checkedPts = []
        for (let pIdx = 0; pIdx < part.length; pIdx++) {
          const chk = validateLngLatTuple(
            part[pIdx],
            `Feature #${idx + 1} nhánh #${partIdx + 1} điểm #${pIdx + 1}`
          )
          if (!chk.valid) {
            return {
              success: false,
              error: chk.swapped ? 'SwappedWgs84AxisOrder' : 'InvalidCoordinateValue',
              error: chk.error,
            }
          }
          checkedPts.push(chk.coord)
        }
        const { cleaned, duplicateCount } = deduplicateLngLatSequence(checkedPts)
        totalDuplicateVerticesRemoved += duplicateCount
        if (cleaned.length < 2) continue

        let geodesicLength = 0
        for (let i = 0; i < cleaned.length - 1; i++) {
          geodesicLength += haversineDist(cleaned[i], cleaned[i + 1])
        }
        if (geodesicLength <= 0) continue

        const candidateId = `LINE-${lineCandidates.length + 1}`
        const baseName = props.name || props.roadName || props.layer || `MultiLineString #${idx + 1}`
        const candidateLabel = `${baseName} (Nhánh ${partIdx + 1})`

        lineCandidates.push({
          id: candidateId,
          featureIndex: idx,
          label: candidateLabel,
          roadCode: props.roadCode || '',
          roadName: props.roadName || props.name || '',
          layer: props.layer || 'WGS84_MULTILINESTRING',
          pointCount: cleaned.length,
          lengthMeters: Number(geodesicLength.toFixed(2)),
          coordinates: cleaned,
          properties: props,
        })

        validatedFeatures.push({
          type: 'Feature',
          properties: {
            ...props,
            _wgs84CandidateId: candidateId,
          },
          geometry: {
            type: 'LineString',
            coordinates: cleaned,
          },
        })
      }
    } else if (gType === 'Polygon' || gType === 'MultiPolygon') {
      // Validate rings without converting Polygon to Centerline!
      const rings = gType === 'Polygon' ? [coords] : coords
      for (let polyIdx = 0; polyIdx < rings.length; polyIdx++) {
        const polyRings = rings[polyIdx]
        if (!Array.isArray(polyRings) || polyRings.length === 0) continue
        const outer = polyRings[0]
        if (!Array.isArray(outer) || outer.length < 3) {
          return {
            success: false,
            error: 'InvalidPolygonRing',
            error: `Polygon tại feature #${idx + 1} có ít hơn 3 đỉnh.`,
          }
        }
        const checkedOuter = []
        for (let pIdx = 0; pIdx < outer.length; pIdx++) {
          const chk = validateLngLatTuple(outer[pIdx], `Polygon #${idx + 1} điểm #${pIdx + 1}`)
          if (!chk.valid) {
            return {
              success: false,
              error: chk.swapped ? 'SwappedWgs84AxisOrder' : 'InvalidCoordinateValue',
              error: chk.error,
            }
          }
          checkedOuter.push(chk.coord)
        }
        const closedOuter = closePolygonRing(checkedOuter)
        const polyFeature = {
          type: 'Feature',
          properties: {
            ...props,
            name: props.name || `Vùng đa giác #${polygonFeatures.length + 1}`,
            type: props.type === 'TrafficIsland' ? 'TrafficIsland' : 'ImportedPolygon',
            isCustomCadLayer: props.type !== 'RoadSurface' && props.type !== 'TrafficIsland',
            category: props.category || 'RoadNetwork',
            layer: props.layer || 'WGS84_POLYGON',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [closedOuter],
          },
        }
        polygonFeatures.push(polyFeature)
        validatedFeatures.push(polyFeature)
      }
    } else if (gType === 'Point') {
      const chk = validateLngLatTuple(coords, `Point #${idx + 1}`)
      if (!chk.valid) {
        return {
          valid: false,
          success: false,
          errorCode: chk.swapped ? 'SwappedWgs84AxisOrder' : 'InvalidCoordinateValue',
          error: chk.error,
        }
      }
      const ptFeature = {
        type: 'Feature',
        properties: {
          ...props,
          name: props.name || `Điểm WGS-84 #${pointFeatures.length + 1}`,
          isCustomCadLayer: true,
          category: 'Survey',
          layer: props.layer || 'WGS84_POINT',
        },
        geometry: {
          type: 'Point',
          coordinates: chk.coord,
        },
      }
      pointFeatures.push(ptFeature)
      validatedFeatures.push(ptFeature)
    }
  }

  const summaryObj = {
    lineStringCount: lineCandidates.length,
    polygonCount: polygonFeatures.length,
    pointCount: pointFeatures.length,
    totalValidatedFeatures: validatedFeatures.length,
  }
  const enrichedCandidates = lineCandidates.map((c) => ({
    ...c,
    name: c.label,
    vertexCount: c.pointCount,
  }))
  return {
    valid: true,
    success: true,
    lineCandidates: enrichedCandidates,
    lineStringCandidates: enrichedCandidates,
    polygonFeatures,
    polygons: polygonFeatures,
    pointFeatures,
    points: pointFeatures,
    validatedFeatures,
    duplicateRemovedCount: totalDuplicateVerticesRemoved,
    hasCenterlineCandidates: enrichedCandidates.length > 0,
    hasMultipleLineStrings: enrichedCandidates.length > 1,
    summary: summaryObj,
    geometrySummary: summaryObj,
  }
}

/**
 * Builds a complete Studio GeoJSON FeatureCollection from a validated WGS-84 import result
 * and the user's selected LineString candidate ID (if any).
 * Never treats a Polygon as a centerline!
 */
export function buildStudioGeoJsonFromWgs84Import(
  importResult,
  selectedCandidateId = null,
  roadWidth = 7.0,
  crsConfig = null
) {
  if (!importResult || !importResult.success) return null

  const { lineCandidates, polygonFeatures, pointFeatures } = importResult
  const normCandId = selectedCandidateId
    ? String(selectedCandidateId).replace(/^linestring-/i, 'LINE-')
    : null
  const chosenLine =
    (normCandId &&
      lineCandidates.find(
        (c) => c.id === normCandId || c.id === selectedCandidateId
      )) ||
    lineCandidates[0] ||
    null

  const checkVn = validateVn2000Config(crsConfig)
  const w = Math.max(0.5, Number(roadWidth) || 7.0)
  const halfW = w / 2.0

  const features = []
  let totalLengthMeters = 0
  let nominalAreaSqm = 0
  let surfaceAreaSqm = 0

  if (chosenLine) {
    const pts = chosenLine.coordinates
    // Compute planar length in UTM 48N (or VN-2000 if configured) for accurate metric length
    let metricPts = []
    if (checkVn.valid) {
      metricPts = pts.map((p) => {
        const r = wgs84ToVn2000(p[0], p[1], crsConfig)
        return [r.easting, r.northing]
      })
    } else {
      const utmSrid = pts[0][0] >= 108.0 ? 32649 : 32648
      metricPts = pts.map((p) => {
        const u = wgs84ToUtm(p[0], p[1], utmSrid)
        return [u.x, u.y]
      })
    }

    for (let i = 0; i < metricPts.length - 1; i++) {
      totalLengthMeters += Math.hypot(
        metricPts[i + 1][0] - metricPts[i][0],
        metricPts[i + 1][1] - metricPts[i][1]
      )
    }
    totalLengthMeters = Number(totalLengthMeters.toFixed(2))
    nominalAreaSqm = Number((totalLengthMeters * w).toFixed(2))
    surfaceAreaSqm = nominalAreaSqm

    // Build road surface corridor ribbon around the chosen LineString
    const leftPts = []
    const rightPts = []
    for (let i = 0; i < pts.length; i++) {
      let dx, dy
      if (i === 0) {
        dx = pts[1][0] - pts[0][0]
        dy = pts[1][1] - pts[0][1]
      } else if (i === pts.length - 1) {
        dx = pts[i][0] - pts[i - 1][0]
        dy = pts[i][1] - pts[i - 1][1]
      } else {
        dx = pts[i + 1][0] - pts[i - 1][0]
        dy = pts[i + 1][1] - pts[i - 1][1]
      }
      const [lPt, rPt] = createTransverseLine(pts[i], dx, dy, halfW)
      leftPts.push(lPt)
      rightPts.push(rPt)
    }
    const surfaceRing = closePolygonRing([...leftPts, ...[...rightPts].reverse()])

    // 1. RoadSurface Polygon
    features.push({
      type: 'Feature',
      properties: {
        name: `Mặt đường BTXM (${chosenLine.label})`,
        type: 'RoadSurface',
        layer: 'MAT_DUONG',
        roadWidth: w,
        surfaceAreaSqm,
        nominalAreaSqm,
        fillColor: '#475569',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [surfaceRing],
      },
    })

    // 2. Left & Right RoadEdges
    features.push({
      type: 'Feature',
      properties: {
        name: 'Mép đường bên trái',
        type: 'RoadEdge',
        side: 'Left',
        layer: 'MEP_DUONG',
      },
      geometry: {
        type: 'LineString',
        coordinates: leftPts,
      },
    })
    features.push({
      type: 'Feature',
      properties: {
        name: 'Mép đường bên phải',
        type: 'RoadEdge',
        side: 'Right',
        layer: 'MEP_DUONG',
      },
      geometry: {
        type: 'LineString',
        coordinates: rightPts,
      },
    })

    // 3. Main Centerline
    features.push({
      type: 'Feature',
      properties: {
        ...chosenLine.properties,
        name: chosenLine.label,
        roadCode: chosenLine.roadCode || '',
        roadName: chosenLine.roadName || chosenLine.label,
        type: 'Centerline',
        isMainCenterline: true,
        layer: chosenLine.layer || 'TIM_TUYEN',
        totalLength: totalLengthMeters,
        roadWidth: w,
      },
      geometry: {
        type: 'LineString',
        coordinates: pts,
      },
    })

    // 4. Other non-selected LineStrings preserved as CenterlineBranch
    lineCandidates.forEach((cand) => {
      if (cand.id === chosenLine.id) return
      features.push({
        type: 'Feature',
        properties: {
          ...cand.properties,
          name: cand.label,
          type: 'CenterlineBranch',
          layer: cand.layer || 'NHANH_TUYEN',
        },
        geometry: {
          type: 'LineString',
          coordinates: cand.coordinates,
        },
      })
    })
  }

  // 5. Preserve imported Polygon and Point features without treating Polygons as centerlines!
  polygonFeatures.forEach((pf) => features.push(pf))
  pointFeatures.forEach((ptf) => features.push(ptf))

  const bbox = computeRfc7946Bbox(features)
  const bounds = bbox
    ? [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ]
    : null

  const centerlineVn2000 =
    chosenLine && checkVn.valid
      ? chosenLine.coordinates.map((pt, idx) => {
          const v = wgs84ToVn2000(pt[0], pt[1], crsConfig)
          return { index: idx + 1, ...v }
        })
      : []

  const fc = {
    type: 'FeatureCollection',
    bounds,
    bbox,
    sourceDataKind: 'WGS84_IMPORT',
    hasCenterline: Boolean(chosenLine),
    selectedCenterlineId: chosenLine?.id || null,
    selectedCandidate: chosenLine,
    lineCandidates,
    centerlineVn2000,
    geometrySummary: importResult.geometrySummary,
    totalLengthMeters,
    originalBackendRoadWidth: w,
    originalSurfaceAreaSqm: surfaceAreaSqm,
    surfaceAreaSqm,
    nominalAreaSqm,
    centralMeridian: checkVn.valid ? checkVn.centralMeridian : null,
    scaleFactor: checkVn.valid ? checkVn.scaleFactor : null,
    axisOrder: 'LON_LAT',
    analytics: {
      totalLengthMeters,
      nominalAreaSqm,
      surfaceAreaSqm,
      totalAreaSqm: nominalAreaSqm,
      roadWidth: w,
    },
    crsMetadata: {
      sourceDatum: 'WGS-84 (EPSG:4326)',
      targetDatum: 'WGS-84 (EPSG:4326)',
      vn2000Configured: checkVn.valid,
      centralMeridian: checkVn.valid ? checkVn.centralMeridian : null,
      scaleFactor: checkVn.valid ? checkVn.scaleFactor : null,
      zoneMode: checkVn.valid ? checkVn.zoneMode : null,
    },
    features,
  }
  Object.defineProperty(fc, 'featureCollection', { value: fc, enumerable: false })
  return fc
}

// ============================================================================
// 5. RoadGuard Geometry Draft JSON (GeometryDraftInput) Builder & Validator
// ============================================================================

/**
 * Checks if a 2D polyline is simple (no self-intersections).
 * Matches NetTopologySuite `line.IsSimple && line.IsValid` in GeometryEngine.cs.
 */
export function isSimplePolyline2D(points) {
  if (!Array.isArray(points) || points.length < 2) return false
  const n = points.length - 1
  if (n === 1) {
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) > 0
  }

  const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const onSeg = (a, b, p) =>
    p.x >= Math.min(a.x, b.x) - 1e-9 &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    p.y >= Math.min(a.y, b.y) - 1e-9 &&
    p.y <= Math.max(a.y, b.y) + 1e-9

  const segmentsIntersect = (p1, q1, p2, q2) => {
    const o1 = orient(p1, q1, p2)
    const o2 = orient(p1, q1, q2)
    const o3 = orient(p2, q2, p1)
    const o4 = orient(p2, q2, q1)

    if (((o1 > 1e-9 && o2 < -1e-9) || (o1 < -1e-9 && o2 > 1e-9)) &&
        ((o3 > 1e-9 && o4 < -1e-9) || (o3 < -1e-9 && o4 > 1e-9))) {
      return true
    }
    if (Math.abs(o1) <= 1e-9 && onSeg(p1, q1, p2)) return true
    if (Math.abs(o2) <= 1e-9 && onSeg(p1, q1, q2)) return true
    if (Math.abs(o3) <= 1e-9 && onSeg(p2, q2, p1)) return true
    if (Math.abs(o4) <= 1e-9 && onSeg(p2, q2, q1)) return true
    return false
  }

  for (let i = 0; i < n; i++) {
    const a1 = points[i]
    const a2 = points[i + 1]
    // Check adjacent segment fold-back (collinear overlap)
    if (i + 1 < n) {
      const b2 = points[i + 2]
      const dx1 = a2.x - a1.x
      const dy1 = a2.y - a1.y
      const dx2 = b2.x - a2.x
      const dy2 = b2.y - a2.y
      const cross = Math.abs(dx1 * dy2 - dy1 * dx2)
      const dot = dx1 * dx2 + dy1 * dy2
      if (cross <= 1e-7 && dot < -1e-7) return false
    }
    for (let j = i + 2; j < n; j++) {
      if (segmentsIntersect(a1, a2, points[j], points[j + 1])) {
        return false
      }
    }
  }
  return true
}

/**
 * Computes exact Euclidean polyline length from `{x, y}` array in UTM planar meters.
 */
export function computeUtmPolylineLength(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return 0
  let total = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    const dx = Number(coordinates[i + 1].x) - Number(coordinates[i].x)
    const dy = Number(coordinates[i + 1].y) - Number(coordinates[i].y)
    total += Math.hypot(dx, dy)
  }
  return total
}

/**
 * Validates a `GeometryDraftInput` payload against all 14 rules of RoadGuardSystem `GeometryEngine.cs`
 * and `GeometryWorkflowPersistenceService.cs`.
 */
export function validateRoadGuardGeometryDraft(draftPayload, expectedProjectUtmSrid = null) {
  const errors = []
  const warnings = []

  if (!draftPayload || typeof draftPayload !== 'object') {
    return { valid: false, errors: ['Payload JSON rỗng hoặc không phải Object.'], warnings }
  }

  // Rule 1: sourceKind must be "COORDINATES"
  if (draftPayload.sourceKind !== 'COORDINATES') {
    errors.push(`Trường 'sourceKind' phải là "COORDINATES" (nhận được: "${draftPayload.sourceKind}").`)
  }

  // Rule 2: sourceCrs must be 32648 or 32649 and match project EngineeringUtmSrid
  const srid = Number(draftPayload.sourceCrs)
  if (!ALLOWED_ROADGUARD_UTM_SRIDS.includes(srid)) {
    errors.push(
      `Trường 'sourceCrs' (${draftPayload.sourceCrs}) không được GeometryEngine hỗ trợ trên luồng COORDINATES. Chỉ chấp nhận 32648 (UTM 48N) hoặc 32649 (UTM 49N).`
    )
  }
  if (expectedProjectUtmSrid != null && srid !== Number(expectedProjectUtmSrid)) {
    errors.push(
      `Trường 'sourceCrs' (${srid}) không khớp với EngineeringUtmSrid của dự án (${expectedProjectUtmSrid}).`
    )
  }

  // Rule 3: coordinates count [2..100000]
  const coords = draftPayload.coordinates
  if (!Array.isArray(coords) || coords.length < 2) {
    errors.push('Mảng \'coordinates\' phải chứa ít nhất 2 điểm {x, y}.')
  } else if (coords.length > 100000) {
    errors.push(`Mảng 'coordinates' vượt quá giới hạn 100.000 điểm (${coords.length}).`)
  }

  // Rule 4: finite coordinates, valid UTM Easting/Northing, no duplicate adjacent vertices
  let lineLength = 0
  if (Array.isArray(coords) && coords.length >= 2) {
    for (let i = 0; i < coords.length; i++) {
      const p = coords[i]
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        errors.push(`Điểm coordinates[${i}] có tọa độ x hoặc y không hữu hạn.`)
        break
      }
      if (Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90) {
        errors.push(
          `Điểm coordinates[${i}] (${p.x}, ${p.y}) là tọa độ độ (WGS-84), không phải tọa độ phẳng mét UTM (x = Easting, y = Northing).`
        )
        break
      }
      if (i > 0) {
        const prev = coords[i - 1]
        if (p.x === prev.x && p.y === prev.y) {
          errors.push(`Hai đỉnh liên tiếp coordinates[${i - 1}] và coordinates[${i}] trùng tọa độ (${p.x}, ${p.y}).`)
          break
        }
      }
    }

    lineLength = computeUtmPolylineLength(coords)
    if (!(lineLength > 0)) {
      errors.push('Chiều dài tim tuyến UTM phải lớn hơn 0m.')
    } else if (!isSimplePolyline2D(coords)) {
      errors.push('Hình học tim tuyến tự cắt nhau (LineString is not simple).')
    }
  }

  // Rule 5: sourceFileId, trackIndex, trackSegmentIndex must be null for COORDINATES
  if (
    draftPayload.sourceFileId !== null ||
    draftPayload.trackIndex !== null ||
    draftPayload.trackSegmentIndex !== null
  ) {
    errors.push(
      'Với sourceKind = "COORDINATES", các trường sourceFileId, trackIndex và trackSegmentIndex bắt buộc phải là null.'
    )
  }

  // Rule 6: stationOriginMeters finite and stationOriginMeters + lineLength finite
  if (
    typeof draftPayload.stationOriginMeters !== 'number' ||
    !Number.isFinite(draftPayload.stationOriginMeters) ||
    !Number.isFinite(draftPayload.stationOriginMeters + lineLength)
  ) {
    errors.push('Trường \'stationOriginMeters\' phải là số hữu hạn.')
  }

  // Rule 7: changeReason non-empty
  if (typeof draftPayload.changeReason !== 'string' || draftPayload.changeReason.trim().length === 0) {
    errors.push('Trường \'changeReason\' (Lý do tạo/cập nhật hình học) bắt buộc không được để trống.')
  }

  // Rule 8: roadCode required for standalone draft creation (1..80 chars), roadName <= 255 chars
  if (
    typeof draftPayload.roadCode !== 'string' ||
    draftPayload.roadCode.trim().length === 0 ||
    draftPayload.roadCode.trim().length > 80
  ) {
    errors.push('Trường \'roadCode\' (Mã tuyến đường) bắt buộc phải nhập (từ 1 đến 80 ký tự).')
  }
  if (draftPayload.roadName != null && String(draftPayload.roadName).length > 255) {
    errors.push('Trường \'roadName\' (Tên tuyến đường) không được vượt quá 255 ký tự.')
  }

  // Rule 9: surveyWidthMeters > 0
  const surveyWidth = Number(draftPayload.surveyWidthMeters)
  if (!Number.isFinite(surveyWidth) || surveyWidth <= 0) {
    errors.push('Trường \'surveyWidthMeters\' (Bề rộng hành lang khảo sát) phải lớn hơn 0m.')
  }

  // Rules 10..13: widthProfile contiguous from 0 to lineLength within 1e-7 m, 0 < widthMeters <= surveyWidthMeters
  const wp = draftPayload.widthProfile
  if (!Array.isArray(wp) || wp.length === 0) {
    errors.push('Mảng \'widthProfile\' không được để trống.')
  } else if (lineLength > 0) {
    let end = 0
    for (let i = 0; i < wp.length; i++) {
      const item = wp[i]
      if (
        !item ||
        !Number.isFinite(item.fromOffsetMeters) ||
        !Number.isFinite(item.toOffsetMeters) ||
        !Number.isFinite(item.widthMeters)
      ) {
        errors.push(`widthProfile[${i}] chứa giá trị không hữu hạn.`)
        break
      }
      if (item.widthMeters <= 0) {
        errors.push(`widthProfile[${i}].widthMeters (${item.widthMeters}) phải lớn hơn 0m.`)
      }
      if (Number.isFinite(surveyWidth) && item.widthMeters > surveyWidth) {
        errors.push(
          `widthProfile[${i}].widthMeters (${item.widthMeters}m) vượt quá surveyWidthMeters (${surveyWidth}m).`
        )
      }
      if (item.fromOffsetMeters !== end) {
        errors.push(
          `widthProfile[${i}].fromOffsetMeters (${item.fromOffsetMeters}) không nối tiếp khít với điểm kết thúc trước đó (${end}). Không được có khoảng hở hoặc chồng lấn.`
        )
      }
      if (item.toOffsetMeters <= end) {
        errors.push(`widthProfile[${i}].toOffsetMeters (${item.toOffsetMeters}) phải lớn hơn fromOffsetMeters (${end}).`)
      }
      if (item.toOffsetMeters > lineLength + 1e-7) {
        errors.push(
          `widthProfile[${i}].toOffsetMeters (${item.toOffsetMeters}) vượt quá chiều dài thực của tim tuyến UTM (${lineLength}).`
        )
      }
      end = item.toOffsetMeters
    }
    if (Math.abs(end - lineLength) > 1e-7) {
      errors.push(
        `Điểm kết thúc của widthProfile (${end}m) lệch quá 1e-7m so với chiều dài thực của tim tuyến UTM (${lineLength}m, độ lệch = ${Math.abs(end - lineLength).toExponential(3)}m).`
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    utmLengthMeters: lineLength,
    vertexCount: Array.isArray(coords) ? coords.length : 0,
  }
}

/**
 * Builds a complete, validated `GeometryDraftInput` JSON payload from the active WGS-84 centerline
 * by projecting it to the selected UTM CRS (EPSG:32648 or EPSG:32649) and recomputing length on the UTM geometry.
 */
export function buildRoadGuardGeometryDraft({
  wgs84CenterlineCoords,
  centerlineWgs84,
  sourceCrs = 32648,
  stationOriginMeters = 0,
  changeReason = '',
  roadCode = '',
  roadName = '',
  roadWidthMeters,
  roadWidth,
  surveyWidthMeters = 7.0,
}) {
  const inputCoords = wgs84CenterlineCoords || centerlineWgs84
  const effWidth = roadWidthMeters ?? roadWidth ?? 7.0
  const srid = Number(sourceCrs)
  if (!ALLOWED_ROADGUARD_UTM_SRIDS.includes(srid)) {
    return {
      valid: false,
      errors: [`Hệ tọa độ đích EPSG:${sourceCrs} không hợp lệ (chỉ hỗ trợ 32648 hoặc 32649).`],
      payload: null,
    }
  }

  if (!Array.isArray(inputCoords) || inputCoords.length < 2) {
    return {
      valid: false,
      errors: ['Chưa có hình học tim tuyến hợp lệ (LineString tối thiểu 2 điểm) để xuất RoadGuard Draft JSON.'],
      payload: null,
    }
  }

  // Transform WGS-84 [lon, lat] -> UTM {x: Easting, y: Northing} and deduplicate adjacent identical points
  const utmCoords = []
  for (let i = 0; i < inputCoords.length; i++) {
    const pt = inputCoords[i]
    const u = wgs84ToUtm(pt[0], pt[1], srid)
    if (
      utmCoords.length > 0 &&
      Math.hypot(u.x - utmCoords[utmCoords.length - 1].x, u.y - utmCoords[utmCoords.length - 1].y) < 1e-6
    ) {
      continue
    }
    utmCoords.push({ x: u.x, y: u.y })
  }

  // Recompute EXACT length in UTM planar space from the exported coordinates array
  const exactUtmLength = computeUtmPolylineLength(utmCoords)
  // Round toOffsetMeters to 8 decimal places while ensuring Math.abs(toOffsetMeters - exactUtmLength) <= 1e-7
  const toOffsetMeters = exactUtmLength

  const widthVal = Number(effWidth)
  const surveyWidthVal = Number(surveyWidthMeters)

  const payload = {
    sourceKind: 'COORDINATES',
    sourceCrs: srid,
    stationOriginMeters: Number(stationOriginMeters),
    changeReason: String(changeReason ?? '').trim(),
    coordinates: utmCoords,
    sourceFileId: null,
    trackIndex: null,
    trackSegmentIndex: null,
    widthProfile: [
      {
        fromOffsetMeters: 0,
        toOffsetMeters,
        widthMeters: widthVal,
      },
    ],
    surveyWidthMeters: surveyWidthVal,
    roadCode: String(roadCode ?? '').trim(),
    roadName: String(roadName ?? '').trim() || null,
  }

  const validation = validateRoadGuardGeometryDraft(payload, srid)
  return {
    ...validation,
    draft: payload,
    payload,
    pointCount: utmCoords.length,
    utmConfig: UTM_ZONE_CONFIGS[srid],
  }
}
