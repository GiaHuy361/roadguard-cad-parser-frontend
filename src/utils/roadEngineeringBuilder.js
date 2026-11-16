/**
 * RoadGuard CAD & GIS Studio — Single Source of Truth (SSOT) Engineering Builder
 * ==============================================================================
 * Centralizes:
 *   1. VN-2000 reference presets & CRS metadata formatting
 *   2. RFC 7946 GeoJSON normalization ([lon, lat] 8-decimal precision, closed polygon rings, root bbox)
 *   3. Linear referencing along main centerline:
 *      - Station points (Km0+000, Km0+100, ..., End Station)
 *      - Transverse Expansion / Contraction Joints
 *      - Concrete Slabs (supporting full roadWidth, laneCount / transverse slab strips, slabLength)
 *      - Segment bounds & Drone/Construction segments (SEG-01..N)
 *   4. Unified Engineering Analytics (distinguishing Nominal Area L×B vs Planar Polygon Area)
 *
 * Used identically by Sidebar, CadMap, CrossSectionProfile, GeoJSON Inspector, and Excel Exporter.
 */

import {
  ALL_VN2000_LOOKUP_OPTIONS,
  VN2000_CATALOG_METADATA,
  VN2000_PROVINCE_CRS_CATALOG,
  VN2000_ADMINISTRATIVE_OPTIONS,
  VN2000_CADASTRAL_OPTIONS,
  VN2000_ZONE6_OPTIONS,
  VN2000_LEGACY_PRESET_REDIRECTS,
  DEFAULT_VN2000_PRESET_ID,
  VN2000_SURVEY_PRIORITY_GUIDANCE,
  resolveVn2000Preset,
  getVn2000OptionsByTable,
  filterVn2000LookupOptions,
  normalizeVn2000SearchText,
  formatMeridianDegreeMinute,
  formatMeridianApiDecimal,
  formatMeridianViDecimal,
} from '../data/vn2000ProvinceCrsCatalog.js'

export const VN2000_REFERENCE_PRESETS = ALL_VN2000_LOOKUP_OPTIONS

export {
  VN2000_CATALOG_METADATA,
  VN2000_PROVINCE_CRS_CATALOG,
  VN2000_ADMINISTRATIVE_OPTIONS,
  VN2000_CADASTRAL_OPTIONS,
  VN2000_ZONE6_OPTIONS,
  VN2000_LEGACY_PRESET_REDIRECTS,
  DEFAULT_VN2000_PRESET_ID,
  VN2000_SURVEY_PRIORITY_GUIDANCE,
  resolveVn2000Preset,
  getVn2000OptionsByTable,
  filterVn2000LookupOptions,
  normalizeVn2000SearchText,
  formatMeridianDegreeMinute,
  formatMeridianApiDecimal,
  formatMeridianViDecimal,
}

/**
 * Ensures a coordinate tuple is [lng, lat] (or [lng, lat, z]) rounded to 8 decimal places.
 */
export function toLngLat(p) {
  if (!Array.isArray(p) || p.length < 2) return p
  const a = Number(p[0])
  const b = Number(p[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return p
  const lngLat = Math.abs(a) < Math.abs(b)
    ? [Number(b.toFixed(8)), Number(a.toFixed(8))]
    : [Number(a.toFixed(8)), Number(b.toFixed(8))]
  if (
    p.length >= 3 &&
    p[2] !== null &&
    p[2] !== undefined &&
    p[2] !== '' &&
    Number.isFinite(Number(p[2]))
  ) {
    lngLat.push(Number(Number(p[2]).toFixed(3)))
  }
  return lngLat
}

/**
 * Ensures a linear ring is closed per RFC 7946 Section 3.1.6.
 */
export function closePolygonRing(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return coords || []
  const ring = coords.map(toLngLat)
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first])
  }
  return ring
}

/**
 * Geodesic Haversine distance in meters between two [lng, lat] points.
 */
export function haversineDist(p1, p2) {
  const R = 6371000.0
  const dLat = ((p2[1] - p1[1]) * Math.PI) / 180.0
  const dLng = ((p2[0] - p1[0]) * Math.PI) / 180.0
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1[1] * Math.PI) / 180.0) *
      Math.cos((p2[1] * Math.PI) / 180.0) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Computes cumulative distances along a polyline.
 * If planarTotalLength > 0 is provided from the VN-2000 metric plane, cumulative distances
 * are scaled proportionally so chainages match the planar engineering length exactly.
 */
export function getPolylineCumulativeDistances(pts, planarTotalLength = null) {
  if (!Array.isArray(pts) || pts.length === 0) return { dists: [0], total: 0, rawGeodesicTotal: 0 }
  const rawDists = [0]
  let rawTotal = 0
  for (let i = 0; i < pts.length - 1; i++) {
    rawTotal += haversineDist(pts[i], pts[i + 1])
    rawDists.push(rawTotal)
  }
  const targetTotal =
    planarTotalLength != null && Number(planarTotalLength) > 0 && rawTotal > 0
      ? Number(planarTotalLength)
      : rawTotal
  const scale = rawTotal > 0 ? targetTotal / rawTotal : 1.0
  const dists = rawDists.map((d) => d * scale)
  return { dists, total: targetTotal, rawGeodesicTotal: rawTotal }
}

export function hasExplicitVertexZ(pt) {
  return (
    Array.isArray(pt) &&
    pt.length >= 3 &&
    pt[2] !== null &&
    pt[2] !== undefined &&
    pt[2] !== '' &&
    Number.isFinite(Number(pt[2]))
  )
}

/**
 * Interpolates [lng, lat, z?] and tangent vector (dx, dy) at targetDist along a polyline.
 * Only includes the 3rd element (z) when the segment/vertex has authentic Z elevation (including 0.0).
 */
export function getInterpolatedPoint(pts, dists, targetDist) {
  if (!pts || pts.length === 0) return { pt: [0, 0], dx: 1, dy: 0 }
  if (pts.length === 1) return { pt: pts[0], dx: 1, dy: 0 }
  if (targetDist <= 0) {
    return {
      pt: pts[0],
      dx: pts[1][0] - pts[0][0],
      dy: pts[1][1] - pts[0][1],
    }
  }
  const total = dists[dists.length - 1]
  if (targetDist >= total) {
    const n = pts.length
    return {
      pt: pts[n - 1],
      dx: pts[n - 1][0] - pts[n - 2][0],
      dy: pts[n - 1][1] - pts[n - 2][1],
    }
  }

  for (let i = 0; i < dists.length - 1; i++) {
    if (targetDist >= dists[i] && targetDist <= dists[i + 1]) {
      const segLen = dists[i + 1] - dists[i]
      const frac = segLen > 0 ? (targetDist - dists[i]) / segLen : 0
      const lng = Number((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * frac).toFixed(8))
      const lat = Number((pts[i][1] + (pts[i + 1][1] - pts[i][1]) * frac).toFixed(8))
      const pt = [lng, lat]
      const z0Ok = hasExplicitVertexZ(pts[i])
      const z1Ok = hasExplicitVertexZ(pts[i + 1])
      if (z0Ok && z1Ok) {
        const z0 = Number(pts[i][2])
        const z1 = Number(pts[i + 1][2])
        pt.push(Number((z0 + (z1 - z0) * frac).toFixed(3)))
      } else if (frac < 1e-6 && z0Ok) {
        pt.push(Number(Number(pts[i][2]).toFixed(3)))
      } else if (Math.abs(frac - 1) < 1e-6 && z1Ok) {
        pt.push(Number(Number(pts[i + 1][2]).toFixed(3)))
      }
      const dx = pts[i + 1][0] - pts[i][0]
      const dy = pts[i + 1][1] - pts[i][1]
      return { pt, dx, dy }
    }
  }
  return { pt: pts[0], dx: 1, dy: 0 }
}

/**
 * Formats a metric chainage distance as KmX+YYY.YY (or Km0+000).
 */
export function formatChainage(distMeters, includeDecimals = false) {
  const d = Math.max(0, Number(distMeters) || 0)
  const km = Math.floor(d / 1000)
  const rem = d - km * 1000
  if (includeDecimals && Math.abs(rem - Math.round(rem)) >= 0.05) {
    const intPart = String(Math.floor(rem)).padStart(3, '0')
    const decPart = (rem % 1).toFixed(2).substring(1)
    return `Km${km}+${intPart}${decPart}`
  }
  const roundedRem = Math.round(rem)
  if (roundedRem === 1000) {
    return `Km${km + 1}+000`
  }
  return `Km${km}+${String(roundedRem).padStart(3, '0')}`
}

/**
 * Creates a transverse line segment across the road at centerPt with given halfWidthMeters.
 */
export function createTransverseLine(centerPt, dx, dy, halfWidthMeters) {
  const latRad = (centerPt[1] * Math.PI) / 180.0
  const metersPerDegLat = 111320.0
  const metersPerDegLng = 111320.0 * Math.cos(latRad)

  const tX = dx * metersPerDegLng
  const tY = dy * metersPerDegLat
  const tLen = Math.hypot(tX, tY) || 1.0

  const nX = -tY / tLen
  const nY = tX / tLen

  const leftLng = Number((centerPt[0] + (nX * halfWidthMeters) / metersPerDegLng).toFixed(8))
  const leftLat = Number((centerPt[1] + (nY * halfWidthMeters) / metersPerDegLat).toFixed(8))

  const rightLng = Number((centerPt[0] - (nX * halfWidthMeters) / metersPerDegLng).toFixed(8))
  const rightLat = Number((centerPt[1] - (nY * halfWidthMeters) / metersPerDegLat).toFixed(8))

  return [
    [leftLng, leftLat],
    [rightLng, rightLat],
  ]
}

/**
 * Computes RFC 7946 bbox: [minLon, minLat, maxLon, maxLat] across all features.
 */
export function computeRfc7946Bbox(features) {
  if (!Array.isArray(features) || features.length === 0) return null
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity

  const walk = (coords) => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const p = toLngLat(coords)
      minLon = Math.min(minLon, p[0])
      maxLon = Math.max(maxLon, p[0])
      minLat = Math.min(minLat, p[1])
      maxLat = Math.max(maxLat, p[1])
      return
    }
    coords.forEach(walk)
  }

  features.forEach((f) => {
    if (f?.geometry?.coordinates) walk(f.geometry.coordinates)
  })

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null
  return [
    Number(minLon.toFixed(8)),
    Number(minLat.toFixed(8)),
    Number(maxLon.toFixed(8)),
    Number(maxLat.toFixed(8)),
  ]
}

const DERIVED_FEATURE_TYPES = new Set([
  'StationMilestone',
  'StationPoint',
  'ExpansionJoint',
  'ContractionJoint',
  'Slab',
  'Vertex',
  'DroneSegment',
  'DroneCompletedSegment',
])

export const SECTION_3_FIELD_SPECS = [
  {
    key: 'roadWidth',
    label: 'Bề rộng mặt (B)',
    shortLabel: 'Bề rộng B',
    unit: 'm',
    step: '0.5',
    min: 1.0,
    max: 60.0,
    allowZero: false,
    description: 'Bề rộng mặt đường xe chạy theo hồ sơ thiết kế',
  },
  {
    key: 'laneCount',
    label: 'Số dải tấm ngang',
    shortLabel: 'Số dải tấm',
    unit: 'dải',
    step: '1',
    min: 1,
    max: 8,
    allowZero: false,
    description: 'Số dải phân chia tấm bê tông theo phương ngang mặt cắt',
  },
  {
    key: 'segmentLength',
    label: 'Bước cọc / Đoạn',
    shortLabel: 'Bước cọc',
    unit: 'm',
    step: '10',
    min: 10,
    max: 1000,
    allowZero: false,
    description: 'Cự ly cọc lý trình và chia đoạn quản lý thi công/khảo sát',
  },
  {
    key: 'slabLength',
    label: 'Chiều dài tấm BTXM',
    shortLabel: 'Chiều dài tấm',
    unit: 'm',
    step: '0.5',
    min: 1.0,
    max: 20.0,
    allowZero: false,
    description: 'Chiều dài một tấm bê tông xi măng tiêu chuẩn giữa hai khe co',
  },
]

export const PAVEMENT_DESIGN_FIELD_SPECS = [
  {
    key: 'slabThicknessCentimeters',
    label: 'Chiều dày tấm BTXM (cm)',
    shortLabel: 'Chiều dày tấm BTXM',
    unit: 'cm',
    allowZero: false,
    min: 10,
    max: 50,
    ruleText: 'Từ 10 đến 50 cm',
    description: 'Theo hồ sơ thiết kế của tuyến (slabThicknessCentimeters, từ 10 đến 50 cm)',
  },
  {
    key: 'contractionJointSpacingMeters',
    label: 'Cự ly khe co (m)',
    shortLabel: 'Cự ly khe co',
    unit: 'm',
    allowZero: false,
    min: 1.5,
    max: 20.0,
    ruleText: 'Từ 1.5 đến 20 m',
    description: 'Theo hồ sơ thiết kế của tuyến (contractionJointSpacingMeters, từ 1.5 đến 20 m)',
  },
  {
    key: 'expansionJointSpacingMeters',
    label: 'Cự ly khe giãn (m)',
    shortLabel: 'Cự ly khe giãn',
    unit: 'm',
    allowZero: false,
    min: 10.0,
    max: 500.0,
    ruleText: 'Từ 10 đến 500 m',
    description: 'Theo hồ sơ thiết kế của tuyến (expansionJointSpacingMeters, từ 10 đến 500 m)',
  },
  {
    key: 'expansionJointGapMillimeters',
    label: 'Độ hở khe giãn (mm)',
    shortLabel: 'Độ hở khe giãn',
    unit: 'mm',
    allowZero: true,
    min: 0,
    max: 100,
    ruleText: 'Từ 0 đến 100 mm',
    description: 'Theo hồ sơ thiết kế của tuyến (expansionJointGapMillimeters, từ 0 đến 100 mm)',
  },
]

const STRICT_DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/

/**
 * Decodes AutoCAD DXF text escapes (\U+XXXX, \P, \f...;, dimension <> placeholder).
 */
export function decodeCadText(rawText, dimMeasurement = null) {
  if (!rawText && (dimMeasurement === null || !Number.isFinite(dimMeasurement))) return ''
  let s = String(rawText || '')
  // Decode \U+XXXX hex sequences
  s = s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
  // Convert MTEXT line breaks \P to newline
  s = s.replace(/\\[Pp]/g, '\n')
  // Convert non-breaking space \~
  s = s.replace(/\\~/g, ' ')
  // Stacked fractions \S...;
  s = s.replace(/\\S([^;]*);/g, '$1')
  // Strip MTEXT formatting directives (\fArial|...;, \C1;, \H1.2x;, \W0.8;, \A1;, \pxi...;)
  s = s.replace(/\\(?:f|F|C|c|H|h|W|w|A|a|Q|q|T|t|px)[a-zA-Z0-9_.,|+\-]*;/g, '')
  s = s.replace(/\\[LlOoKk]/g, '')
  s = s.replace(/[{}]/g, '')
  if (
    s.includes('<>') &&
    dimMeasurement !== null &&
    Number.isFinite(dimMeasurement) &&
    dimMeasurement > 0
  ) {
    const cleanMeas = Number(Number(dimMeasurement).toFixed(4)).toString()
    s = s.replace(/<>/g, cleanMeas)
  }
  return s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * Normalizes Vietnamese text to lowercase ASCII (stripped diacritics, đ -> d) for robust CAD matching.
 */
export function normalizeViAscii(str) {
  if (!str) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Converts a numeric BTXM value from rawUnit ('mm' | 'cm' | 'm') to targetUnit ('mm' | 'cm' | 'm')
 * without floating-point representation drift.
 */
export function convertBtxmUnit(numericValue, rawUnit, targetUnit) {
  const num = Number(numericValue)
  if (!Number.isFinite(num)) return null
  const uFrom = String(rawUnit || '').toLowerCase().trim()
  const uTo = String(targetUnit || '').toLowerCase().trim()

  const factorsToMm = {
    mm: 1,
    cm: 10,
    m: 1000,
    mét: 1000,
    met: 1000,
  }
  if (!(uFrom in factorsToMm) || !(uTo in factorsToMm)) return null
  const inMm = num * factorsToMm[uFrom]
  const converted = inMm / factorsToMm[uTo]
  const clean = Number(converted.toPrecision(12))
  return Object.is(clean, -0) ? 0 : clean
}

const BTXM_CLAUSE_EXCLUSION_SLAB =
  /\b(?:ranh\s*be\s*tong|ranh\s*btxm|tuong\s*chan|ke\s*chan|cong\s*tron|cong\s*hop|via\s*he|bo\s*via|cpdd|cap\s*phoi|khuon\s*duong|be\s*tong\s*nhua|btn)\b/i

const BTXM_FIELD_MATCHERS = {
  slabThicknessCentimeters: {
    key: 'slabThicknessCentimeters',
    targetUnit: 'cm',
    allowZero: false,
    min: 10,
    max: 50,
    matchesClause(asciiClause) {
      if (BTXM_CLAUSE_EXCLUSION_SLAB.test(asciiClause)) return false
      return (
        /(?:chieu\s*day|be\s*day)\s*(?:tam\s*|mat\s*duong\s*|ket\s*cau\s*|lop\s*)?(?:be\s*tong\s*xi\s*mang|btxm|tam\s*btxm)\b/.test(
          asciiClause
        ) ||
        /(?:tam|mat\s*duong|lop|ket\s*cau)\s*(?:be\s*tong\s*xi\s*mang|btxm)\b[^;\n]{0,55}?(?:chieu\s*day|be\s*day|\bday\b|\bh\s*=)/.test(
          asciiClause
        ) ||
        /\bh[_\s-]*btxm\b/.test(asciiClause) ||
        /\bslabthicknesscentimeters\b/.test(asciiClause)
      )
    },
  },
  contractionJointSpacingMeters: {
    key: 'contractionJointSpacingMeters',
    targetUnit: 'm',
    allowZero: false,
    min: 1.5,
    max: 20.0,
    matchesClause(asciiClause) {
      if (/\b(?:do\s*ho|be\s*rong|chieu\s*rong|khe\s*ho|chieu\s*sau|cat\s*sau)\s*khe\s*co\b/.test(asciiClause)) {
        return false
      }
      return (
        /(?:cu\s*ly|khoang\s*cach|buoc|cu\s*ly\s*bo\s*tri)\s*(?:giua\s*cac\s*)?khe\s*co\b/.test(
          asciiClause
        ) ||
        /\bkhe\s*co\b[^;\n]{0,40}?(?:cu\s*ly|khoang\s*cach|buoc|cach\s*khoang|\bl[_\s-]*kc\s*=)/.test(
          asciiClause
        ) ||
        /\bkhe\s*co\s*(?:ngang|doc)?\s*[:=]/.test(asciiClause) ||
        /\bcontractionjointspacingmeters\b/.test(asciiClause)
      )
    },
  },
  expansionJointSpacingMeters: {
    key: 'expansionJointSpacingMeters',
    targetUnit: 'm',
    allowZero: false,
    min: 10.0,
    max: 500.0,
    matchesClause(asciiClause) {
      if (/\b(?:do\s*ho|be\s*rong|chieu\s*rong|khe\s*ho|do\s*rong|chieu\s*sau)\s*khe\s*gian\b/.test(asciiClause)) {
        return false
      }
      return (
        /(?:cu\s*ly|khoang\s*cach|buoc|cu\s*ly\s*bo\s*tri)\s*(?:giua\s*cac\s*)?khe\s*gian\b/.test(
          asciiClause
        ) ||
        /\bkhe\s*gian\b[^;\n]{0,40}?(?:cu\s*ly|khoang\s*cach|buoc|cach\s*khoang|\bl[_\s-]*kg\s*=)/.test(
          asciiClause
        ) ||
        /\bexpansionjointspacingmeters\b/.test(asciiClause)
      )
    },
  },
  expansionJointGapMillimeters: {
    key: 'expansionJointGapMillimeters',
    targetUnit: 'mm',
    allowZero: true,
    min: 0,
    max: 100,
    matchesClause(asciiClause) {
      return (
        /(?:do\s*ho|be\s*rong|chieu\s*rong|khe\s*ho|do\s*rong)\s*(?:cua\s*)?khe\s*gian\b/.test(
          asciiClause
        ) ||
        /\bkhe\s*gian\b[^;\n]{0,40}?(?:do\s*ho|be\s*rong|chieu\s*rong|khe\s*ho|do\s*rong|\bb[_\s-]*kg\s*=|\bd[_\s-]*kg\s*=)/.test(
          asciiClause
        ) ||
        /\bexpansionjointgapmillimeters\b/.test(asciiClause)
      )
    },
  },
}

/**
 * Strips non-dimensional tokens (concrete grade M250/M300, stone size đá 1x2, standard codes TCVN)
 * from a matched clause before extracting numbers and units.
 */
function stripNonDimensionTokens(clauseText) {
  return String(clauseText || '')
    .replace(/\b(?:mác|mac|m)\s*\d{3}\b/gi, ' ')
    .replace(/\b(?:đá|da)\s*\d+\s*[xX×]\s*\d+\b/gi, ' ')
    .replace(/\b(?:tcvn|tcxdvn|22tcn)\s*[\d:.\-]+/gi, ' ')
    .replace(/\bc\d{1,2}\/\d{1,2}\b/gi, ' ')
    .replace(/\bkm\s*\d+\s*\+\s*\d+(?:[.,]\d+)?/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:m2|m²|m3|m³|cm2|cm²|mm2|mm²)/gi, ' ')
}

/**
 * Extracts numeric candidates (with or without unit) from a matched BTXM clause.
 */
function parseClauseDimensionCandidates(rawClause, matcher) {
  const cleaned = stripNonDimensionTokens(rawClause)
  const candidatesWithUnit = []

  // 1. Check multi-value shorthand with shared trailing unit: e.g. "22 / 25 cm" or "22 - 25 cm" or "4.5 hoặc 5.0 m"
  const multiSharedUnitRegex =
    /(?:^|[^\w.])([+-]?\d+(?:[.,]\d+)?)\s*(?:\/|÷|-|hoặc|hoac)\s*([+-]?\d+(?:[.,]\d+)?)\s*(mm|cm|m|mét|met)(?![23²³\w])/gi
  let mShared
  while ((mShared = multiSharedUnitRegex.exec(cleaned)) !== null) {
    const raw1 = mShared[1].replace(',', '.')
    const raw2 = mShared[2].replace(',', '.')
    const unit = mShared[3].toLowerCase()
    const n1 = Number(raw1)
    const n2 = Number(raw2)
    if (Number.isFinite(n1)) {
      candidatesWithUnit.push({ rawNumberText: mShared[1], numericValue: n1, rawUnit: unit })
    }
    if (Number.isFinite(n2)) {
      candidatesWithUnit.push({ rawNumberText: mShared[2], numericValue: n2, rawUnit: unit })
    }
  }

  // 2. Check explicit number + unit pairs: e.g. "22 cm", "240mm", "4,5 m"
  const withUnitRegex = /(?:^|[^\w.])([+-]?\d+(?:[.,]\d+)?)\s*(mm|cm|m|mét|met)(?![23²³\w])/gi
  let mUnit
  while ((mUnit = withUnitRegex.exec(cleaned)) !== null) {
    const rawNumStr = mUnit[1]
    const unit = mUnit[2].toLowerCase()
    const num = Number(rawNumStr.replace(',', '.'))
    if (!Number.isFinite(num)) continue
    const alreadyAdded = candidatesWithUnit.some(
      (c) => Math.abs(c.numericValue - num) < 1e-9 && c.rawUnit === unit
    )
    if (!alreadyAdded) {
      candidatesWithUnit.push({
        rawNumberText: rawNumStr,
        numericValue: num,
        rawUnit: unit,
      })
    }
  }

  if (candidatesWithUnit.length > 0) {
    const validConverted = []
    for (const item of candidatesWithUnit) {
      const normalizedValue = convertBtxmUnit(item.numericValue, item.rawUnit, matcher.targetUnit)
      if (normalizedValue === null) continue
      const passesRule = matcher.allowZero ? normalizedValue >= 0 : normalizedValue > 0
      if (!passesRule) continue
      if (matcher.min !== undefined && normalizedValue < matcher.min) continue
      if (matcher.max !== undefined && normalizedValue > matcher.max) continue
      validConverted.push({
        ...item,
        normalizedValue,
        normalizedUnit: matcher.targetUnit,
        unitConverted: item.rawUnit.toLowerCase() !== matcher.targetUnit.toLowerCase(),
      })
    }
    if (validConverted.length > 0) {
      return { kind: 'WITH_UNIT', items: validConverted }
    }
    // Explicit unit was present but converted value failed engineering limits -> do not treat as unitless
    return { kind: 'NONE', items: [] }
  }

  // 3. Check unitless numeric value after keyword/delimiter: e.g. "Chiều dày tấm BTXM: 22"
  const bareNumRegex = /(?:[:=]|dày|day|co|giãn|gian|hở|ho|rộng|rong)\s*([+-]?\d+(?:[.,]\d+)?)(?!\s*[a-zA-Z23²³])/i
  const mBare = bareNumRegex.exec(cleaned)
  if (mBare) {
    const rawNumStr = mBare[1]
    const num = Number(rawNumStr.replace(',', '.'))
    const passesRule = matcher.allowZero ? num >= 0 : num > 0
    const withinLimits =
      (matcher.min === undefined || num >= matcher.min) &&
      (matcher.max === undefined || num <= matcher.max)
    if (Number.isFinite(num) && passesRule && withinLimits) {
      return {
        kind: 'MISSING_UNIT',
        items: [{ rawNumberText: rawNumStr, numericValue: num, rawUnit: null }],
      }
    }
  }

  return { kind: 'NONE', items: [] }
}

/**
 * Scans an ASCII DXF file content for authentic BTXM design parameter annotations and dimensions.
 * Returns per-field status ('EXTRACTED' | 'MISSING_UNIT' | 'MULTIPLE_VALUES' | 'AMBIGUOUS_DIMLFAC' | 'NOT_FOUND'),
 * normalized values (cm, m, m, mm), and full CAD evidence (quote, layer, coordinates, unit conversion, DIMLFAC/override).
 */
export function extractBtxmDesignParamsFromDxfText(dxfText, fileName = '') {
  const tStart = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const rawContent = typeof dxfText === 'string' ? dxfText : ''

  const fieldFindings = {}
  for (const spec of PAVEMENT_DESIGN_FIELD_SPECS) {
    fieldFindings[spec.key] = {
      withUnitHits: [],
      missingUnitHits: [],
      dimlfacAmbiguousHits: [],
    }
  }

  const contextMentions = []
  let scannedTextEntityCount = 0

  if (rawContent.length > 0) {
    // Extract global $DIMLFAC from HEADER if present
    let headerDimlfac = 1.0
    const dimlfacHeaderMatch = /\$\s*DIMLFAC\s*\r?\n\s*40\s*\r?\n\s*([+-]?\d+(?:\.\d+)?)/i.exec(
      rawContent
    )
    if (dimlfacHeaderMatch) {
      const parsedHeaderLfac = parseFloat(dimlfacHeaderMatch[1])
      if (Number.isFinite(parsedHeaderLfac) && parsedHeaderLfac > 0) {
        headerDimlfac = parsedHeaderLfac
      }
    }

    // Prefer scanning the ENTITIES section so anonymous *D... blocks in BLOCKS do not duplicate or conflict
    let scanTarget = rawContent
    const entitiesSecMatch =
      /(?:^|\n)\s*0\r?\n\s*SECTION\s*\r?\n\s*2\r?\n\s*ENTITIES\s*\r?\n/i.exec(rawContent)
    if (entitiesSecMatch) {
      const entStart = entitiesSecMatch.index + entitiesSecMatch[0].length
      const endSecRegex = /\r?\n\s*0\r?\n\s*ENDSEC\s*(?:\r?\n|$)/gi
      endSecRegex.lastIndex = entStart
      const endSecMatch = endSecRegex.exec(rawContent)
      scanTarget = rawContent.slice(entStart, endSecMatch ? endSecMatch.index : rawContent.length)
    }

    const entityHeaderRegex =
      /(?:^|\n)\s*0\r?\n\s*(TEXT|MTEXT|DIMENSION|ATTRIB|ATTDEF|MLEADER)\s*\r?\n/g
    const nextEntityZeroRegex = /\r?\n\s*0\r?\n/g

    let headerMatch
    while ((headerMatch = entityHeaderRegex.exec(scanTarget)) !== null) {
      const entityType = headerMatch[1].trim()
      const bodyStart = headerMatch.index + headerMatch[0].length
      nextEntityZeroRegex.lastIndex = bodyStart
      const nextZero = nextEntityZeroRegex.exec(scanTarget)
      const bodyEnd = nextZero ? nextZero.index : scanTarget.length

      const blockSlice = scanTarget.slice(bodyStart, bodyEnd)
      const lines = blockSlice.split(/\r?\n/)

      let layer = '0'
      let layout = 'Model'
      const text3Parts = []
      const text1Parts = []
      let dimMeasurement = null
      let entityDimlfac = null
      let x10 = null
      let y20 = null
      let x11 = null
      let y21 = null

      for (let i = 0; i + 1 < lines.length; i += 2) {
        const code = parseInt(lines[i].trim(), 10)
        if (Number.isNaN(code)) continue
        const val = lines[i + 1]
        if (code === 8) {
          layer = val.trim() || '0'
        } else if (code === 410) {
          layout = val.trim() || 'Model'
        } else if (code === 3) {
          text3Parts.push(val)
        } else if (code === 1 || code === 304) {
          text1Parts.push(val)
        } else if (code === 42) {
          const parsedMeas = parseFloat(val.trim())
          if (Number.isFinite(parsedMeas)) dimMeasurement = parsedMeas
        } else if (code === 144) {
          const parsedLfac = parseFloat(val.trim())
          if (Number.isFinite(parsedLfac) && parsedLfac > 0) entityDimlfac = parsedLfac
        } else if (code === 1070 && parseInt(val.trim(), 10) === 144 && i + 3 < lines.length) {
          const nextCode = parseInt(lines[i + 2].trim(), 10)
          if (nextCode === 1040) {
            const parsedLfac = parseFloat(lines[i + 3].trim())
            if (Number.isFinite(parsedLfac) && parsedLfac > 0) entityDimlfac = parsedLfac
          }
        } else if (code === 10 && x10 === null) {
          const px = parseFloat(val.trim())
          if (Number.isFinite(px)) x10 = px
        } else if (code === 20 && y20 === null) {
          const py = parseFloat(val.trim())
          if (Number.isFinite(py)) y20 = py
        } else if (code === 11 && x11 === null) {
          const px = parseFloat(val.trim())
          if (Number.isFinite(px)) x11 = px
        } else if (code === 21 && y21 === null) {
          const py = parseFloat(val.trim())
          if (Number.isFinite(py)) y21 = py
        }
      }

      const rawCombined = [...text3Parts, ...text1Parts].join('')
      const hasDimPlaceholder = entityType === 'DIMENSION' && rawCombined.includes('<>')
      const effectiveDimlfac = entityDimlfac !== null ? entityDimlfac : headerDimlfac
      const hasNonUnitDimlfac =
        entityType === 'DIMENSION' && Math.abs(effectiveDimlfac - 1.0) > 1e-6
      const decodedText = decodeCadText(rawCombined, dimMeasurement)
      const decodedTemplateWithoutMeas = hasDimPlaceholder ? decodeCadText(rawCombined, null) : decodedText
      if (!decodedText) continue

      scannedTextEntityCount++
      const posX =
        x10 !== null && (x10 !== 0 || x11 === null) ? Number(x10.toFixed(2)) : x11 !== null ? Number(x11.toFixed(2)) : null
      const posY =
        y20 !== null && (y20 !== 0 || y21 === null) ? Number(y20.toFixed(2)) : y21 !== null ? Number(y21.toFixed(2)) : null
      const positionText =
        posX !== null && posY !== null ? `(${posX}, ${posY})` : 'Không rõ tọa độ'

      const asciiFull = normalizeViAscii(decodedText)
      const isBtxmRelated =
        /\b(?:btxm|be\s*tong\s*xi\s*mang|khe\s*co|khe\s*gian|slabthicknesscentimeters|contractionjointspacingmeters|expansionjointspacingmeters|expansionjointgapmillimeters)\b/.test(
          asciiFull
        )

      if (!isBtxmRelated) continue

      // Split into clauses by newline or semicolon
      const rawClauses = decodedText
        .split(/[\n;]+/)
        .map((c) => c.trim())
        .filter(Boolean)

      let matchedAnyFieldInEntity = false

      for (const clause of rawClauses) {
        const asciiClause = normalizeViAscii(clause)
        for (const spec of PAVEMENT_DESIGN_FIELD_SPECS) {
          const matcher = BTXM_FIELD_MATCHERS[spec.key]
          if (!matcher || !matcher.matchesClause(asciiClause)) continue

          const parsedCandidates = parseClauseDimensionCandidates(clause, matcher)
          if (parsedCandidates.kind === 'WITH_UNIT') {
            matchedAnyFieldInEntity = true
            // If this is a DIMENSION using <> placeholder AND DIMLFAC != 1.0, it is ambiguous whether group 42
            // is pre-scaled or unscaled across CAD exporters -> record as AMBIGUOUS_DIMLFAC and leave empty!
            if (hasDimPlaceholder && hasNonUnitDimlfac && dimMeasurement !== null) {
              const firstItem = parsedCandidates.items[0]
              const unscaledNorm = firstItem.normalizedValue
              const scaledNorm = convertBtxmUnit(
                firstItem.numericValue * effectiveDimlfac,
                firstItem.rawUnit,
                matcher.targetUnit
              )
              fieldFindings[spec.key].dimlfacAmbiguousHits.push({
                rawQuote: decodedTemplateWithoutMeas,
                resolvedPreview: clause,
                dimRawMeasurement: Number(dimMeasurement.toFixed(4)),
                dimlfac: effectiveDimlfac,
                rawUnit: firstItem.rawUnit,
                unscaledNormalizedValue: unscaledNorm,
                scaledNormalizedValue: scaledNorm,
                normalizedUnit: matcher.targetUnit,
                layer,
                layout,
                entityType,
                position: posX !== null && posY !== null ? [posX, posY] : null,
                positionText,
              })
            } else {
              for (const item of parsedCandidates.items) {
                const isDimensionOverride =
                  entityType === 'DIMENSION' &&
                  !hasDimPlaceholder &&
                  dimMeasurement !== null &&
                  Math.abs(dimMeasurement - item.numericValue) > 1e-6
                fieldFindings[spec.key].withUnitHits.push({
                  rawQuote: clause,
                  fullEntityText: decodedText,
                  rawNumberText: item.rawNumberText,
                  rawValue: item.numericValue,
                  rawUnit: item.rawUnit,
                  normalizedValue: item.normalizedValue,
                  normalizedUnit: item.normalizedUnit,
                  unitConverted: item.unitConverted,
                  isDimensionOverride,
                  dimRawMeasurement:
                    entityType === 'DIMENSION' && dimMeasurement !== null
                      ? Number(dimMeasurement.toFixed(4))
                      : null,
                  dimlfac:
                    entityType === 'DIMENSION' && hasNonUnitDimlfac ? effectiveDimlfac : null,
                  layer,
                  layout,
                  entityType,
                  position: posX !== null && posY !== null ? [posX, posY] : null,
                  positionText,
                })
              }
            }
          } else if (parsedCandidates.kind === 'MISSING_UNIT') {
            matchedAnyFieldInEntity = true
            for (const item of parsedCandidates.items) {
              fieldFindings[spec.key].missingUnitHits.push({
                rawQuote: clause,
                fullEntityText: decodedText,
                rawNumberText: item.rawNumberText,
                rawValue: item.numericValue,
                rawUnit: null,
                layer,
                layout,
                entityType,
                position: posX !== null && posY !== null ? [posX, posY] : null,
                positionText,
              })
            }
          }
        }
      }

      if (!matchedAnyFieldInEntity && contextMentions.length < 15) {
        contextMentions.push({
          rawQuote: decodedText.replace(/\n/g, ' | '),
          layer,
          layout,
          entityType,
          position: posX !== null && posY !== null ? [posX, posY] : null,
          positionText,
        })
      }
    }
  }

  const fields = {}
  const autoFilledInputs = {}
  let extractedCount = 0
  let ambiguousCount = 0
  let missingCount = 0

  for (const spec of PAVEMENT_DESIGN_FIELD_SPECS) {
    const { withUnitHits, missingUnitHits, dimlfacAmbiguousHits } = fieldFindings[spec.key]
    // Group withUnitHits by distinct normalizedValue
    const distinctMap = new Map()
    for (const hit of withUnitHits) {
      const valKey = String(hit.normalizedValue)
      if (!distinctMap.has(valKey)) {
        distinctMap.set(valKey, {
          normalizedValue: hit.normalizedValue,
          normalizedUnit: spec.unit,
          hits: [],
        })
      }
      distinctMap.get(valKey).hits.push(hit)
    }

    if (dimlfacAmbiguousHits.length > 0 && distinctMap.size === 0) {
      const first = dimlfacAmbiguousHits[0]
      fields[spec.key] = {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        status: 'AMBIGUOUS_DIMLFAC',
        statusLabel: 'Hệ số DIMLFAC chưa rõ quy đổi',
        autoFillValue: '',
        normalizedValue: null,
        rawQuote: first.rawQuote,
        dimRawMeasurement: first.dimRawMeasurement,
        dimlfac: first.dimlfac,
        unscaledNormalizedValue: first.unscaledNormalizedValue,
        scaledNormalizedValue: first.scaledNormalizedValue,
        layer: first.layer,
        position: first.position,
        positionText: first.positionText,
        allHits: dimlfacAmbiguousHits,
        summaryText: `DIMENSION "${first.rawQuote}" (Layer ${first.layer} @ ${first.positionText}) có group 42 = ${first.dimRawMeasurement}, DIMLFAC = ${first.dimlfac} (${first.unscaledNormalizedValue} ${spec.unit} hoặc ${first.scaledNormalizedValue} ${spec.unit}). Để trống để kỹ sư xác nhận.`,
      }
      autoFilledInputs[spec.key] = ''
      ambiguousCount++
    } else if (distinctMap.size === 1) {
      const group = Array.from(distinctMap.values())[0]
      const primaryHit = group.hits[0]
      const valueStr = String(group.normalizedValue)
      const baseConversionNote = primaryHit.unitConverted
        ? `${primaryHit.rawNumberText} ${primaryHit.rawUnit} → ${group.normalizedValue} ${spec.unit}`
        : `${group.normalizedValue} ${spec.unit}`
      const overrideSuffix = primaryHit.isDimensionOverride
        ? ` • Override hiển thị trên DIMENSION (group 42 = ${primaryHit.dimRawMeasurement}${
            primaryHit.dimlfac ? `, DIMLFAC = ${primaryHit.dimlfac}` : ''
          })`
        : ''
      const conversionNote = `${baseConversionNote}${overrideSuffix}`

      fields[spec.key] = {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        status: 'EXTRACTED',
        statusLabel: 'Đọc được từ DXF',
        autoFillValue: valueStr,
        normalizedValue: group.normalizedValue,
        rawQuote: primaryHit.rawQuote,
        rawValueText: `${primaryHit.rawNumberText} ${primaryHit.rawUnit}`,
        rawUnit: primaryHit.rawUnit,
        unitConverted: primaryHit.unitConverted,
        isDimensionOverride: Boolean(primaryHit.isDimensionOverride),
        dimRawMeasurement: primaryHit.dimRawMeasurement ?? null,
        dimlfac: primaryHit.dimlfac ?? null,
        conversionNote,
        layer: primaryHit.layer,
        layout: primaryHit.layout,
        entityType: primaryHit.entityType,
        position: primaryHit.position,
        positionText: primaryHit.positionText,
        matchCount: group.hits.length,
        allHits: group.hits,
        summaryText: `Trích từ "${primaryHit.rawQuote}" (${conversionNote}) • Layer ${primaryHit.layer} @ ${primaryHit.positionText}`,
      }
      autoFilledInputs[spec.key] = valueStr
      extractedCount++
    } else if (distinctMap.size > 1) {
      const candidates = Array.from(distinctMap.values()).map((g) => {
        const first = g.hits[0]
        return {
          normalizedValue: g.normalizedValue,
          unit: spec.unit,
          rawQuote: first.rawQuote,
          rawValueText: `${first.rawNumberText} ${first.rawUnit}`,
          layer: first.layer,
          positionText: first.positionText,
          count: g.hits.length,
        }
      })
      const candidateListText = candidates
        .map((c) => `${c.normalizedValue} ${c.unit} (Layer ${c.layer} @ ${c.positionText}: "${c.rawQuote}")`)
        .join(' ; ')

      fields[spec.key] = {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        status: 'MULTIPLE_VALUES',
        statusLabel: 'Có nhiều giá trị trong DXF',
        autoFillValue: '',
        normalizedValue: null,
        candidates,
        allHits: withUnitHits,
        summaryText: `Phát hiện ${candidates.length} giá trị khác nhau chưa rõ phạm vi áp dụng: ${candidateListText}. Để trống để kỹ sư xác nhận.`,
      }
      autoFilledInputs[spec.key] = ''
      ambiguousCount++
    } else if (missingUnitHits.length > 0) {
      const first = missingUnitHits[0]
      fields[spec.key] = {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        status: 'MISSING_UNIT',
        statusLabel: 'Thiếu đơn vị trong DXF',
        autoFillValue: '',
        normalizedValue: null,
        rawQuote: first.rawQuote,
        rawValueText: first.rawNumberText,
        layer: first.layer,
        position: first.position,
        positionText: first.positionText,
        allHits: missingUnitHits,
        summaryText: `Ghi chú "${first.rawQuote}" (Layer ${first.layer} @ ${first.positionText}) thiếu đơn vị đo. Để trống để kỹ sư xử lý.`,
      }
      autoFilledInputs[spec.key] = ''
      ambiguousCount++
    } else {
      fields[spec.key] = {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        status: 'NOT_FOUND',
        statusLabel: 'Chưa có dữ liệu',
        autoFillValue: '',
        normalizedValue: null,
        allHits: [],
        summaryText: 'Không tìm thấy ghi chú hoặc kích thước thông số này trong bản vẽ DXF.',
      }
      autoFilledInputs[spec.key] = ''
      missingCount++
    }
  }

  const elapsedMs = Math.max(
    1,
    Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart)
  )

  return {
    fileName: fileName || 'ban_ve.dxf',
    isDxf: true,
    scannedTextEntityCount,
    elapsedMs,
    extractedCount,
    ambiguousCount,
    missingCount,
    fields,
    autoFilledInputs,
    contextMentions,
  }
}

/**
 * Scans DXF text for Section 3 road geometry parameters (B, laneCount, segmentLength, slabLength).
 * Supports unit validation, explicit slab-strip verification for laneCount, and multiple values detection.
 */
export function extractRoadGeometryParamsFromDxfText(dxfText, fileName = '') {
  const tStart = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const rawContent = typeof dxfText === 'string' ? dxfText : ''

  const fieldFindings = {
    roadWidth: { withUnitHits: [], missingUnitHits: [] },
    laneCount: { withUnitHits: [], missingUnitHits: [] },
    segmentLength: { withUnitHits: [], missingUnitHits: [] },
    slabLength: { withUnitHits: [], missingUnitHits: [] },
  }

  if (rawContent.length > 0) {
    const ROAD_GEOM_EXCLUSIONS = /\b(?:suoi|ranh|muong|cong|via\s*he|bo\s*via|ta\s*luy|le\s*duong|ho\s*ga|day\s*cong)\b/i

    const lines = rawContent.split(/\r?\n/)
    let currentLayer = '0'

    for (let i = 0; i < lines.length - 1; i++) {
      const code = lines[i].trim()
      const val = lines[i + 1].trim()

      if (code === '8') {
        currentLayer = val
      }

      if (code === '1' || code === '3' || code === '1000') {
        const decoded = decodeCadText(val)
        if (!decoded || ROAD_GEOM_EXCLUSIONS.test(decoded)) continue

        // 1. Road Width (B): Scan ALL candidates in note, check units, convert first then check limits
        const isRoadWidthContext =
          /(?:bề\s*rộng\s*(?:mặt\s*(?:đường|tuyến)?|tuyến|xe\s*chạy)|be\s*rong\s*(?:mat\s*(?:duong|tuyen)?|tuyen|xe\s*chay)|chiều\s*rộng\s*mặt\s*(?:đường)?|chieu\s*rong\s*mat\s*(?:duong)?|mặt\s*đường\s*B|mat\s*duong\s*B|\bB\s*(?:mặt\s*đường|mat\s*duong|mặt))\b/i.test(
            decoded
          )

        if (isRoadWidthContext) {
          const specRw = SECTION_3_FIELD_SPECS.find((s) => s.key === 'roadWidth')

          // Check pair/shorthand in same note: e.g. "B = 7.0m hoặc 8.5m" or "Bề rộng 7.0 / 8.5 m"
          const pairRegex =
            /([0-9]+(?:[.,][0-9]+)?)\s*(m|mét|met|cm|mm)?(?![23²³\w])\s*(?:\/|÷|-|hoặc|hoac|và|va|,)\s*(?:B\s*[=:]\s*)?([0-9]+(?:[.,][0-9]+)?)\s*(m|mét|met|cm|mm)(?![23²³\w])/gi
          let mPair
          while ((mPair = pairRegex.exec(decoded)) !== null) {
            const u2 = mPair[3]?.toLowerCase()
            const u1 = mPair[2]?.toLowerCase() || u2
            const items = [
              { raw: mPair[1], unit: u1 },
              { raw: mPair[3], unit: u2 },
            ]
            for (const it of items) {
              const rawNum = it.raw.replace(',', '.')
              let num = parseFloat(rawNum)
              if (!Number.isFinite(num)) continue
              let unitConverted = false
              if (it.unit === 'cm') {
                num /= 100
                unitConverted = true
              } else if (it.unit === 'mm') {
                num /= 1000
                unitConverted = true
              }
              if (num >= specRw.min && num <= specRw.max) {
                const already = fieldFindings.roadWidth.withUnitHits.some(
                  (h) => Math.abs(h.normalizedValue - num) < 1e-4
                )
                if (!already) {
                  fieldFindings.roadWidth.withUnitHits.push({
                    rawQuote: mPair[0],
                    rawNumberText: it.raw,
                    rawUnit: it.unit,
                    normalizedValue: num,
                    unitConverted,
                    layer: currentLayer,
                    positionText: `Layer ${currentLayer}`,
                  })
                }
              }
            }
          }

          // Check all individual assignments in note: e.g. "B = 7.0m", "B = 8.5m"
          const rwSingleRegex =
            /(?:(?:bề\s*rộng\s*(?:mặt\s*(?:đường|tuyến)?|tuyến|xe\s*chạy)|be\s*rong\s*(?:mat\s*(?:duong|tuyen)?|tuyen|xe\s*chay)|chiều\s*rộng\s*mặt\s*(?:đường)?|chieu\s*rong\s*mat\s*(?:duong)?|mặt\s*đường\s*B|mat\s*duong\s*B|\bB\s*(?:mặt\s*đường|mat\s*duong|mặt))\s*[=:]\s*|\bB\s*[=:]\s*)([0-9]+(?:[.,][0-9]+)?)\s*(m|mét|met|cm|mm)?(?![23²³\w])/gi
          let mRw
          while ((mRw = rwSingleRegex.exec(decoded)) !== null) {
            const restAfter = decoded.slice(mRw.index + mRw[0].length)
            if (/^\s*(?:m2|m²|m3|m³|cm2|cm²|mm2|mm²|dải|dai|làn|lan|tấm|tam|kg|tấn|tan)(?!\w)/i.test(restAfter)) {
              continue
            }
            const rawNum = mRw[1].replace(',', '.')
            let num = parseFloat(rawNum)
            if (!Number.isFinite(num)) continue
            const rawUnit = mRw[2] ? mRw[2].toLowerCase() : null
            if (rawUnit) {
              let unitConverted = false
              if (rawUnit === 'cm') {
                num /= 100
                unitConverted = true
              } else if (rawUnit === 'mm') {
                num /= 1000
                unitConverted = true
              }
              if (num >= specRw.min && num <= specRw.max) {
                const already = fieldFindings.roadWidth.withUnitHits.some(
                  (h) => Math.abs(h.normalizedValue - num) < 1e-4
                )
                if (!already) {
                  fieldFindings.roadWidth.withUnitHits.push({
                    rawQuote: mRw[0],
                    rawNumberText: mRw[1],
                    rawUnit,
                    normalizedValue: num,
                    unitConverted,
                    layer: currentLayer,
                    positionText: `Layer ${currentLayer}`,
                  })
                }
              }
            } else {
              if (num >= specRw.min && num <= specRw.max) {
                fieldFindings.roadWidth.missingUnitHits.push({
                  rawQuote: mRw[0],
                  rawNumberText: mRw[1],
                  layer: currentLayer,
                  positionText: `Layer ${currentLayer}`,
                })
              }
            }
          }
        }

        // 2. Lane Count: concrete slab strips evidence
        const laneRegex =
          /(?:số\s*dải\s*(?:tấm|bê\s*tông|mặt\s*đường|btxm)|so\s*dai\s*(?:tam|be\s*tong|mat\s*duong|btxm)|chia\s*thành\s*([1-8])\s*dải\s*(?:tấm|bê\s*tông|btxm)?|([1-8])\s*dải\s*(?:tấm|bê\s*tông|btxm)|dải\s*tấm\s*BTXM)\s*(?:[=:]\s*([1-8]))?\s*(?:dải|dai|làn|lan)?/gi
        let mLane
        while ((mLane = laneRegex.exec(decoded)) !== null) {
          const numVal = parseInt(mLane[3] || mLane[2] || mLane[1], 10)
          if (Number.isFinite(numVal) && numVal >= 1 && numVal <= 8) {
            const already = fieldFindings.laneCount.withUnitHits.some(
              (h) => h.normalizedValue === numVal
            )
            if (!already) {
              fieldFindings.laneCount.withUnitHits.push({
                rawQuote: mLane[0],
                rawNumberText: String(numVal),
                rawUnit: 'dải',
                normalizedValue: numVal,
                unitConverted: false,
                layer: currentLayer,
                positionText: `Layer ${currentLayer}`,
              })
            }
          }
        }

        // 3. Segment Length (cọc / đoạn)
        const specSeg = SECTION_3_FIELD_SPECS.find((s) => s.key === 'segmentLength')
        const segRegex =
          /(?:bước\s*cọc|buoc\s*coc|cự\s*ly\s*cọc|cu\s*ly\s*coc|khoảng\s*cách\s*cọc|khoang\s*cach\s*coc|chiều\s*dài\s*phân\s*đoạn|chieu\s*dai\s*phan\s*đoan)\s*[=:]\s*([0-9]+(?:[.,][0-9]+)?)\s*(m|mét|met|cm|mm)?(?![23²³\w])/gi
        let mSeg
        while ((mSeg = segRegex.exec(decoded)) !== null) {
          const restAfter = decoded.slice(mSeg.index + mSeg[0].length)
          if (/^\s*(?:m2|m²|m3|m³|cm2|cm²|mm2|mm²)\b/i.test(restAfter)) continue
          const rawNum = mSeg[1].replace(',', '.')
          let num = parseFloat(rawNum)
          if (!Number.isFinite(num)) continue
          const rawUnit = mSeg[2] ? mSeg[2].toLowerCase() : null
          if (rawUnit) {
            let unitConverted = false
            if (rawUnit === 'cm') {
              num /= 100
              unitConverted = true
            } else if (rawUnit === 'mm') {
              num /= 1000
              unitConverted = true
            }
            if (num >= specSeg.min && num <= specSeg.max) {
              fieldFindings.segmentLength.withUnitHits.push({
                rawQuote: mSeg[0],
                rawNumberText: mSeg[1],
                rawUnit,
                normalizedValue: num,
                unitConverted,
                layer: currentLayer,
                positionText: `Layer ${currentLayer}`,
              })
            }
          } else {
            if (num >= specSeg.min && num <= specSeg.max) {
              fieldFindings.segmentLength.missingUnitHits.push({
                rawQuote: mSeg[0],
                rawNumberText: mSeg[1],
                layer: currentLayer,
                positionText: `Layer ${currentLayer}`,
              })
            }
          }
        }

        // 4. Slab Length (chiều dài tấm)
        const specSlab = SECTION_3_FIELD_SPECS.find((s) => s.key === 'slabLength')
        const slabRegex =
          /(?:chiều\s*dài\s*tấm|chieu\s*dai\s*tam|dài\s*tấm|dai\s*tam|tấm\s*dài|tam\s*dai)\s*[=:]\s*([0-9]+(?:[.,][0-9]+)?)\s*(m|mét|met|cm|mm)?(?![23²³\w])/gi
        let mSlab
        while ((mSlab = slabRegex.exec(decoded)) !== null) {
          const restAfter = decoded.slice(mSlab.index + mSlab[0].length)
          if (/^\s*(?:m2|m²|m3|m³|cm2|cm²|mm2|mm²)\b/i.test(restAfter)) continue
          const rawNum = mSlab[1].replace(',', '.')
          let num = parseFloat(rawNum)
          if (!Number.isFinite(num)) continue
          const rawUnit = mSlab[2] ? mSlab[2].toLowerCase() : null
          if (rawUnit) {
            let unitConverted = false
            if (rawUnit === 'cm') {
              num /= 100
              unitConverted = true
            } else if (rawUnit === 'mm') {
              num /= 1000
              unitConverted = true
            }
            if (num >= specSlab.min && num <= specSlab.max) {
              fieldFindings.slabLength.withUnitHits.push({
                rawQuote: mSlab[0],
                rawNumberText: mSlab[1],
                rawUnit,
                normalizedValue: num,
                unitConverted,
                layer: currentLayer,
                positionText: `Layer ${currentLayer}`,
              })
            }
          } else {
            if (num >= specSlab.min && num <= specSlab.max) {
              fieldFindings.slabLength.missingUnitHits.push({
                rawQuote: mSlab[0],
                rawNumberText: mSlab[1],
                layer: currentLayer,
                positionText: `Layer ${currentLayer}`,
              })
            }
          }
        }
      }
    }
  }

  const fields = {}
  const autoFilledInputs = {
    roadWidth: '',
    laneCount: '',
    segmentLength: '',
    slabLength: '',
  }
  let extractedCount = 0
  let ambiguousCount = 0
  let missingCount = 0

  for (const spec of SECTION_3_FIELD_SPECS) {
    const { withUnitHits, missingUnitHits } = fieldFindings[spec.key]

    // Group withUnitHits by distinct normalizedValue
    const distinctMap = new Map()
    for (const hit of withUnitHits) {
      const valKey = String(hit.normalizedValue)
      if (!distinctMap.has(valKey)) {
        distinctMap.set(valKey, {
          normalizedValue: hit.normalizedValue,
          hits: [],
        })
      }
      distinctMap.get(valKey).hits.push(hit)
    }

    if (distinctMap.size === 1) {
      const group = Array.from(distinctMap.values())[0]
      const primaryHit = group.hits[0]
      const valStr = String(group.normalizedValue)
      fields[spec.key] = {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        status: 'EXTRACTED',
        statusLabel: 'Đọc được từ DXF',
        autoFillValue: valStr,
        normalizedValue: group.normalizedValue,
        rawQuote: primaryHit.rawQuote,
        rawValueText: `${primaryHit.rawNumberText} ${primaryHit.rawUnit || spec.unit}`,
        rawUnit: primaryHit.rawUnit || spec.unit,
        unitConverted: primaryHit.unitConverted,
        layer: primaryHit.layer,
        positionText: primaryHit.positionText,
        matchCount: group.hits.length,
        allHits: group.hits,
        summaryText: `Trích từ "${primaryHit.rawQuote}" trong bản vẽ • Layer ${primaryHit.layer}`,
      }
      autoFilledInputs[spec.key] = valStr
      extractedCount++
    } else if (distinctMap.size > 1) {
      const candidates = Array.from(distinctMap.values()).map((g) => {
        const first = g.hits[0]
        return {
          normalizedValue: g.normalizedValue,
          unit: spec.unit,
          rawQuote: first.rawQuote,
          rawValueText: `${first.rawNumberText} ${first.rawUnit || spec.unit}`,
          layer: first.layer,
          positionText: first.positionText,
          count: g.hits.length,
        }
      })
      const candidateListText = candidates
        .map((c) => `${c.normalizedValue} ${c.unit} (Layer ${c.layer}: "${c.rawQuote}")`)
        .join(' ; ')

      fields[spec.key] = {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        status: 'MULTIPLE_VALUES',
        statusLabel: 'Có nhiều giá trị trong DXF',
        autoFillValue: '',
        normalizedValue: null,
        candidates,
        allHits: withUnitHits,
        summaryText: `Phát hiện ${candidates.length} giá trị khác nhau: ${candidateListText}. Để trống để kỹ sư chọn.`,
      }
      autoFilledInputs[spec.key] = ''
      ambiguousCount++
    } else if (missingUnitHits.length > 0) {
      const first = missingUnitHits[0]
      fields[spec.key] = {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        status: 'MISSING_UNIT',
        statusLabel: 'Thiếu đơn vị trong DXF',
        autoFillValue: '',
        normalizedValue: null,
        rawQuote: first.rawQuote,
        rawValueText: first.rawNumberText,
        layer: first.layer,
        positionText: first.positionText,
        allHits: missingUnitHits,
        summaryText: `Tìm thấy "${first.rawQuote}" nhưng thiếu đơn vị tính (${spec.unit}). Để trống để kỹ sư xác nhận.`,
      }
      autoFilledInputs[spec.key] = ''
      ambiguousCount++
    } else {
      fields[spec.key] = {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        status: 'NOT_FOUND',
        statusLabel: 'Chưa có dữ liệu',
        autoFillValue: '',
        normalizedValue: null,
        allHits: [],
        summaryText: 'Không tìm thấy ghi chú hoặc kích thước thông số này trong bản vẽ DXF.',
      }
      missingCount++
    }
  }

  const elapsedMs = Math.max(
    1,
    Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart)
  )

  return {
    fileName: fileName || 'ban_ve.dxf',
    isDxf: true,
    elapsedMs,
    extractedCount,
    ambiguousCount,
    missingCount,
    fields,
    autoFilledInputs,
  }
}

/**
 * Combined extractor that scans both Section 3 (Road Geometry) and Section 4 (BTXM Design).
 */
export function extractAllDxfProjectParams(dxfText, fileName = '') {
  const btxm = extractBtxmDesignParamsFromDxfText(dxfText, fileName)
  const geometry = extractRoadGeometryParamsFromDxfText(dxfText, fileName)
  return {
    fileName: fileName || 'ban_ve.dxf',
    isDxf: true,
    btxm,
    geometry,
    extractedCount: btxm.extractedCount + geometry.extractedCount,
    missingCount: btxm.missingCount + geometry.missingCount,
    autoFilledInputs: {
      ...geometry.autoFilledInputs,
      ...btxm.autoFilledInputs,
    },
    fields: {
      ...geometry.fields,
      ...btxm.fields,
    },
  }
}


/**
 * Parses and validates a single optional BTXM pavement design parameter from the design dossier.
 * Preserves exact decimal numbers without fixed-decimal rounding.
 */
export function parseOptionalPavementDesignField(rawVal, spec) {
  if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
    return {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      isProvided: false,
      valid: true,
      value: null,
      rawText: '',
      displayValue: 'Chưa có dữ liệu',
      error: null,
    }
  }

  const trimmed = String(rawVal).trim()
  if (typeof rawVal === 'number') {
    if (!Number.isFinite(rawVal)) {
      return {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        isProvided: true,
        valid: false,
        value: null,
        rawText: trimmed,
        displayValue: 'Sai định dạng',
        error: `${spec.label} sai định dạng số thập phân hợp lệ.`,
      }
    }
  } else if (!STRICT_DECIMAL_PATTERN.test(trimmed)) {
    return {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      isProvided: true,
      valid: false,
      value: null,
      rawText: trimmed,
      displayValue: 'Sai định dạng',
      error: `${spec.label} sai định dạng số thập phân (chỉ nhập số hợp lệ, dùng dấu chấm '.' cho phần lẻ).`,
    }
  }

  const num = typeof rawVal === 'number' ? rawVal : Number(trimmed)
  if (!Number.isFinite(num)) {
    return {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      isProvided: true,
      valid: false,
      value: null,
      rawText: trimmed,
      displayValue: 'Sai định dạng',
      error: `${spec.label} không phải là số hữu hạn hợp lệ.`,
    }
  }

  if (spec.allowZero) {
    if (num < 0) {
      return {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        isProvided: true,
        valid: false,
        value: null,
        rawText: trimmed,
        displayValue: 'Giá trị không hợp lệ',
        error: `${spec.label} phải từ 0 trở lên (không chấp nhận giá trị âm).`,
      }
    }
  } else if (num <= 0) {
    return {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      isProvided: true,
      valid: false,
      value: null,
      rawText: trimmed,
      displayValue: 'Giá trị không hợp lệ',
      error: `${spec.label} phải lớn hơn 0.`,
    }
  }

  const cleanNum = Object.is(num, -0) ? 0 : num
  return {
    key: spec.key,
    label: spec.label,
    unit: spec.unit,
    isProvided: true,
    valid: true,
    value: cleanNum,
    rawText: trimmed,
    displayValue: `${cleanNum} ${spec.unit}`,
    error: null,
  }
}

/**
 * Validates and normalizes the 4 optional BTXM design parameters (slabThicknessCentimeters,
 * contractionJointSpacingMeters, expansionJointSpacingMeters, expansionJointGapMillimeters).
 * Kept strictly independent from map grid / slab division / station step configuration.
 */
export function validatePavementDesignParams(roadParams = {}) {
  const fallbackSource = roadParams?.rawPavementDesignInputs ?? {}
  const dxfExtraction =
    roadParams?.dxfBtxmExtraction ?? roadParams?.pavementDesign?.dxfExtraction ?? null
  const fields = {}
  const values = {}
  const fieldErrors = {}
  const rawInputs = {}
  const errors = []

  for (const spec of PAVEMENT_DESIGN_FIELD_SPECS) {
    const directVal = roadParams ? roadParams[spec.key] : undefined
    const rawVal =
      directVal !== undefined && directVal !== null
        ? directVal
        : fallbackSource[spec.key] !== undefined
        ? fallbackSource[spec.key]
        : directVal
    rawInputs[spec.key] = rawVal === undefined || rawVal === null ? '' : String(rawVal)
    const parsed = parseOptionalPavementDesignField(rawVal, spec)
    const dxfEvidence = dxfExtraction?.fields?.[spec.key] || null

    let provenance = 'EMPTY_NO_DXF'
    let provenanceLabel = 'Chưa có dữ liệu'

    if (dxfEvidence) {
      if (dxfEvidence.status === 'EXTRACTED') {
        if (parsed.isProvided && parsed.valid && parsed.value === dxfEvidence.normalizedValue) {
          provenance = 'AUTO_FILLED_FROM_DXF'
          provenanceLabel = 'Tự điền từ DXF'
        } else if (parsed.isProvided) {
          provenance = 'MANUAL_OVERRIDE_AFTER_DXF'
          provenanceLabel = 'Kỹ sư đã chỉnh sửa'
        } else {
          provenance = 'CLEARED_AFTER_DXF'
          provenanceLabel = 'Đã xóa giá trị tự điền'
        }
      } else if (parsed.isProvided) {
        provenance = 'MANUAL_SUPPLEMENT'
        provenanceLabel = 'Kỹ sư nhập bổ sung'
      } else if (dxfEvidence.status === 'MULTIPLE_VALUES') {
        provenance = 'EMPTY_MULTIPLE_VALUES'
        provenanceLabel = 'Có nhiều giá trị trong DXF (để trống)'
      } else if (dxfEvidence.status === 'AMBIGUOUS_DIMLFAC') {
        provenance = 'EMPTY_AMBIGUOUS_DIMLFAC'
        provenanceLabel = 'Hệ số DIMLFAC chưa rõ quy đổi (để trống)'
      } else if (dxfEvidence.status === 'MISSING_UNIT') {
        provenance = 'EMPTY_MISSING_UNIT'
        provenanceLabel = 'Thiếu đơn vị trong DXF (để trống)'
      } else {
        provenance = 'EMPTY_NOT_IN_DXF'
        provenanceLabel = 'Chưa có dữ liệu'
      }
    } else if (parsed.isProvided) {
      provenance = 'MANUAL_ENTRY'
      provenanceLabel = 'Nhập thủ công'
    }

    fields[spec.key] = {
      ...parsed,
      dxfEvidence,
      provenance,
      provenanceLabel,
      evidenceSummary: dxfEvidence?.summaryText || null,
    }
    values[spec.key] = parsed.value
    fieldErrors[spec.key] = parsed.error
    if (!parsed.valid && parsed.error) {
      errors.push(parsed.error)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    fieldErrors,
    fields,
    values,
    rawInputs,
    dxfExtraction,
  }
}

function parseOptionalPositiveNumber(val) {
  if (val === undefined || val === null || String(val).trim() === '') return null
  const num = Number(String(val).trim())
  return Number.isFinite(num) && num > 0 ? num : null
}

function parseOptionalPositiveInt(val) {
  if (val === undefined || val === null || String(val).trim() === '') return null
  const num = parseInt(String(val).trim(), 10)
  return Number.isFinite(num) && num > 0 ? num : null
}

/**
 * Normalizes road engineering parameters without any hidden multipliers or unverified default values.
 * Only populates parameters that have been extracted with CAD evidence or confirmed by the engineer.
 */
export function normalizeRoadParams(roadParams = {}) {
  const roadWidth = parseOptionalPositiveNumber(roadParams.roadWidth)
  const slabLength = parseOptionalPositiveNumber(roadParams.slabLength)
  const segmentLength = parseOptionalPositiveNumber(roadParams.segmentLength)
  const laneCount = parseOptionalPositiveInt(roadParams.laneCount)
  const pavementDesign = validatePavementDesignParams(roadParams)

  const effectiveSlabLength =
    slabLength ?? pavementDesign.values.contractionJointSpacingMeters ?? null
  const slabWidth =
    roadWidth !== null && laneCount !== null && laneCount > 0
      ? Number((roadWidth / laneCount).toFixed(3))
      : null

  return {
    roadWidth,
    slabLength,
    effectiveSlabLength,
    segmentLength,
    laneCount,
    slabWidth,
    slabThicknessCentimeters: pavementDesign.values.slabThicknessCentimeters,
    contractionJointSpacingMeters: pavementDesign.values.contractionJointSpacingMeters,
    expansionJointSpacingMeters: pavementDesign.values.expansionJointSpacingMeters,
    expansionJointGapMillimeters: pavementDesign.values.expansionJointGapMillimeters,
    rawPavementDesignInputs: pavementDesign.rawInputs,
    dxfBtxmExtraction: pavementDesign.dxfExtraction,
    pavementDesign,
  }
}

/**
 * Converts a Backend parse-road or parse-coords response into a base GeoJSON FeatureCollection,
 * then enriches it with all derived engineering features (Stations, Joints, Slabs, Vertices, Bbox, Analytics).
 */
export function convertRoadResponseToGeoJson(data, roadParams = {}) {
  if (!data) return null
  const params = normalizeRoadParams({
    ...roadParams,
    roadWidth: roadParams.roadWidth ?? data.roadWidth ?? null,
  })

  if (data.isGeoreferenced === false || data.crsState === 'LOCAL_CAD_NON_GEOREFERENCED') {
    return {
      type: 'FeatureCollection',
      features: [],
      bbox: null,
      properties: {
        isGeoreferenced: false,
        crsState: 'LOCAL_CAD_NON_GEOREFERENCED',
        notice: data.notice || 'Bản vẽ sử dụng hệ tọa độ cục bộ (Local CAD) chưa gán tọa độ quốc gia VN-2000.',
        totalLengthMeters: data.totalLengthMeters || 0,
        roadWidth: params.roadWidth,
        surfaceAreaSqm: data.surfaceAreaSqm ?? null,
        nominalAreaSqm: data.nominalAreaSqm ?? null,
        centerlineCad: data.centerlineCad || [],
      },
      analytics: {
        totalLengthMeters: data.totalLengthMeters || 0,
        surfaceAreaSqm: data.surfaceAreaSqm ?? null,
        nominalAreaSqm: data.nominalAreaSqm ?? null,
        isGeoreferenced: false,
        crsState: 'LOCAL_CAD_NON_GEOREFERENCED',
        notice: data.notice,
      },
    }
  }

  const coreFeatures = []

  // 1. Road Surface Polygon(s)
  let hasMainSurface = false
  if (Array.isArray(data.roadSurfacePolygon) && data.roadSurfacePolygon.length >= 3) {
    const isNested =
      Array.isArray(data.roadSurfacePolygon[0]) && Array.isArray(data.roadSurfacePolygon[0][0])
    const rawRing = isNested ? data.roadSurfacePolygon[0] : data.roadSurfacePolygon
    const ring = closePolygonRing(rawRing)
    if (ring.length >= 4) {
      coreFeatures.push({
        type: 'Feature',
        id: 'road-surface-corridor',
        properties: {
          type: 'RoadSurface',
          layer: 'MAT_DUONG_BETONG',
          name:
            params.roadWidth != null
              ? `Dải Mặt Đường Bê Tông (${params.roadWidth}m)`
              : 'Dải Mặt Đường Bê Tông',
          roadWidth: params.roadWidth,
          surfaceAreaSqm: data.surfaceAreaSqm ?? null,
          nominalAreaSqm: data.nominalAreaSqm ?? null,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      })
      hasMainSurface = true
    }
  }

  // 1.2 Traffic Islands
  const islandFeatures = []
  if (Array.isArray(data.trafficIslands) && data.trafficIslands.length > 0) {
    data.trafficIslands.forEach((island, iIdx) => {
      if (Array.isArray(island) && island.length >= 3) {
        const ring = closePolygonRing(island)
        if (ring.length >= 4) {
          islandFeatures.push({
            type: 'Feature',
            id: `traffic-island-${iIdx}`,
            properties: {
              type: 'TrafficIsland',
              layer: 'DAO_GIAO_THONG',
              name: `Đảo Giao Thông ${iIdx + 1}`,
              isIsland: true,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          })
        }
      }
    })
  }

  // 1.3 Additional surface polygons
  if (Array.isArray(data.roadSurfacePolygons) && data.roadSurfacePolygons.length > 0) {
    data.roadSurfacePolygons.forEach((poly, pIdx) => {
      if (pIdx === 0 && hasMainSurface) return
      if (pIdx > 0 && islandFeatures.length > 0) return
      if (Array.isArray(poly) && poly.length >= 3) {
        const ring = closePolygonRing(poly)
        if (ring.length >= 4) {
          const isIsland = pIdx > 0 || hasMainSurface
          const feat = {
            type: 'Feature',
            id: isIsland ? `traffic-island-p-${pIdx}` : `road-surface-polygon-${pIdx}`,
            properties: {
              type: isIsland ? 'TrafficIsland' : 'RoadSurface',
              layer: isIsland ? 'DAO_GIAO_THONG' : 'MAT_DUONG_BETONG',
              name: isIsland ? `Đảo Giao Thông Phân Đoạn ${pIdx}` : `Mặt Đường Phân Đoạn ${pIdx + 1}`,
              roadWidth: params.roadWidth,
              isIsland,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          }
          if (isIsland) {
            islandFeatures.push(feat)
          } else {
            coreFeatures.push(feat)
            hasMainSurface = true
          }
        }
      }
    })
  }
  coreFeatures.push(...islandFeatures)

  // 2. Main Road Centerline
  if (Array.isArray(data.centerline) && data.centerline.length >= 2) {
    coreFeatures.push({
      type: 'Feature',
      id: 'road-centerline-main',
      properties: {
        type: 'Centerline',
        layerType: 'Centerline',
        layer: 'TIM_TUYEN_CHINH',
        name: data.roadName || 'Tim Tuyến Chính',
        totalLength: data.totalLengthMeters,
      },
      geometry: {
        type: 'LineString',
        coordinates: data.centerline.map(toLngLat),
      },
    })
  }

  // 2.2 Centerline Branches
  if (Array.isArray(data.centerlineBranches) && data.centerlineBranches.length > 0) {
    data.centerlineBranches.forEach((branch, bIdx) => {
      if (Array.isArray(branch) && branch.length >= 2) {
        coreFeatures.push({
          type: 'Feature',
          id: `road-centerline-branch-${bIdx}`,
          properties: {
            type: 'Centerline',
            layerType: 'Centerline',
            layer: 'TIM_TUYEN_NHANH',
            name: `Nhánh Tim Nút Giao ${bIdx + 1}`,
            isBranch: true,
          },
          geometry: {
            type: 'LineString',
            coordinates: branch.map(toLngLat),
          },
        })
      }
    })
  }

  // 3. Left & Right Road Edges
  if (Array.isArray(data.leftEdge) && data.leftEdge.length >= 2) {
    coreFeatures.push({
      type: 'Feature',
      id: 'road-edge-left',
      properties: {
        type: 'RoadEdge',
        layer: 'MEP_TRAI',
        name: 'Mép Đường Trái',
      },
      geometry: {
        type: 'LineString',
        coordinates: data.leftEdge.map(toLngLat),
      },
    })
  }

  if (Array.isArray(data.rightEdge) && data.rightEdge.length >= 2) {
    coreFeatures.push({
      type: 'Feature',
      id: 'road-edge-right',
      properties: {
        type: 'RoadEdge',
        layer: 'MEP_PHAI',
        name: 'Mép Đường Phải',
      },
      geometry: {
        type: 'LineString',
        coordinates: data.rightEdge.map(toLngLat),
      },
    })
  }

  const baseCollection = {
    type: 'FeatureCollection',
    bounds: data.bounds,
    bbox: data.bbox || null,
    totalLengthMeters: data.totalLengthMeters,
    hasAuthentic3DElevation: Boolean(data.hasAuthentic3DElevation),
    originalBackendRoadWidth: parseOptionalPositiveNumber(data.roadWidth),
    originalSurfaceAreaSqm: data.surfaceAreaSqm ?? null,
    surfaceAreaSqm: data.surfaceAreaSqm ?? null,
    nominalAreaSqm: data.nominalAreaSqm ?? null,
    centralMeridian: data.centralMeridian ?? null,
    scaleFactor: data.scaleFactor ?? 0.9999,
    axisOrder: data.axisOrder ?? 'AUTO',
    crsMetadata: data.crsMetadata ?? null,
    layerStats: data.layerStats || [],
    features: coreFeatures,
  }

  return enrichGeoJsonWithEngineeringFeatures(baseCollection, params).geoJson
}

/**
 * Enriches any GeoJSON FeatureCollection with synchronized StationMilestone/StationPoint,
 * ExpansionJoint/ContractionJoint, Slab, Vertex, DroneSegment features, RFC 7946 bbox,
 * segmentBoundsMap, and unified engineering analytics.
 * Strictly generates derived features ONLY when their governing parameters are present.
 */
export function enrichGeoJsonWithEngineeringFeatures(
  geoJsonInput,
  roadParams = {},
  customCadFeatures = [],
  completedSegments = []
) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const params = normalizeRoadParams(roadParams)

  const rawFeatures = Array.isArray(geoJsonInput?.features) ? geoJsonInput.features : []
  const coreFeatures = rawFeatures.filter((f) => {
    const t = f?.properties?.type || f?.properties?.layerType
    if (DERIVED_FEATURE_TYPES.has(t)) return false
    if (typeof f?.id === 'string') {
      if (
        f.id.startsWith('station-milestone-') ||
        f.id.startsWith('joint-cut-') ||
        f.id.startsWith('slab-item-') ||
        f.id.startsWith('drone-segment-') ||
        f.id.startsWith('drone-completed-') ||
        f.id.includes('-vertex-')
      ) {
        return false
      }
    }
    return true
  })

  const allSource = [...coreFeatures, ...(Array.isArray(customCadFeatures) ? customCadFeatures : [])]
  if (allSource.length === 0) {
    return {
      geoJson: null,
      enrichedGeoJson: null,
      segmentBoundsMap: {},
      analytics: null,
      metrics: null,
      droneSegments: [],
    }
  }

  const processedFeatures = []
  let mainCenterlineCoords = null
  const branchCenterlines = []

  const fixCoordsRecursive = (c, isPolygonRing = false) => {
    if (!Array.isArray(c)) return c
    if (typeof c[0] === 'number') return toLngLat(c)
    if (isPolygonRing && Array.isArray(c[0]) && typeof c[0][0] === 'number') {
      return closePolygonRing(c)
    }
    return c.map((child) => fixCoordsRecursive(child, isPolygonRing))
  }

  allSource.forEach((f) => {
    const geom = f?.geometry
    if (!geom || !geom.coordinates) {
      processedFeatures.push(f)
      return
    }

    const isPoly = geom.type === 'Polygon' || geom.type === 'MultiPolygon'
    const cleanedGeom = {
      ...geom,
      coordinates: fixCoordsRecursive(geom.coordinates, isPoly),
    }

    const updatedProps = { ...(f.properties || {}) }
    if (updatedProps.type === 'RoadSurface') {
      if (params.roadWidth !== null) {
        updatedProps.roadWidth = params.roadWidth
        updatedProps.name = `Dải Mặt Đường Bê Tông (${params.roadWidth}m)`
      }
    }

    processedFeatures.push({
      ...f,
      properties: updatedProps,
      geometry: cleanedGeom,
    })

    const isMainCenterline =
      (f.id === 'road-centerline-main' ||
        updatedProps.layer === 'TIM_TUYEN_CHINH' ||
        (!updatedProps.isBranch &&
          (updatedProps.type === 'Centerline' || updatedProps.layerType === 'Centerline'))) &&
      cleanedGeom.type === 'LineString' &&
      Array.isArray(cleanedGeom.coordinates) &&
      cleanedGeom.coordinates.length >= 2

    if (isMainCenterline && !mainCenterlineCoords) {
      mainCenterlineCoords = cleanedGeom.coordinates
    }

    const isBranch =
      (f.id?.startsWith('road-centerline-branch') || updatedProps.isBranch) &&
      cleanedGeom.type === 'LineString' &&
      Array.isArray(cleanedGeom.coordinates)

    if (isBranch) {
      branchCenterlines.push(cleanedGeom.coordinates)
    }

    const isCenterline =
      updatedProps.type === 'Centerline' ||
      updatedProps.layerType === 'Centerline' ||
      updatedProps.layer === 'TIM_TUYEN_CHINH' ||
      (typeof updatedProps.layer === 'string' && updatedProps.layer.toLowerCase().includes('tim'))

    if (isCenterline && cleanedGeom.type === 'LineString' && Array.isArray(cleanedGeom.coordinates)) {
      cleanedGeom.coordinates.forEach((pt, idx) => {
        processedFeatures.push({
          type: 'Feature',
          id: `${f.id || 'centerline'}-vertex-${idx}`,
          properties: {
            type: 'Vertex',
            index: idx,
            lng: pt[0],
            lat: pt[1],
            elevation: hasExplicitVertexZ(pt) ? Number(Number(pt[2]).toFixed(3)) : null,
            name: `${updatedProps.name || 'Tim tuyến'} - P${idx + 1}`,
          },
          geometry: {
            type: 'Point',
            coordinates: pt,
          },
        })
      })
    }
  })

  const segmentBoundsMap = {}
  const droneSegments = []
  let effectiveTotalLength = Number(geoJsonInput?.totalLengthMeters) || 0

  const {
    roadWidth: roadW,
    effectiveSlabLength: slabL,
    segmentLength: segL,
    laneCount,
    slabWidth,
    expansionJointSpacingMeters: expJointSpacing,
  } = params

  const hasValidRoadWidth = roadW !== null && roadW > 0
  const hasValidSlabLength = slabL !== null && slabL > 0
  const hasValidSegmentLength = segL !== null && segL > 0
  const hasValidLaneCount = laneCount !== null && laneCount > 0
  const hasValidExpJointSpacing = expJointSpacing !== null && expJointSpacing > 0
  const halfW = hasValidRoadWidth ? roadW / 2.0 : 0

  if (mainCenterlineCoords && mainCenterlineCoords.length >= 2) {
    const { dists, total } = getPolylineCumulativeDistances(
      mainCenterlineCoords,
      effectiveTotalLength > 0 ? effectiveTotalLength : null
    )
    effectiveTotalLength = Number(total.toFixed(2))

    // 1. Station Points along centerline ONLY when segmentLength > 0 is confirmed/entered
    if (hasValidSegmentLength) {
      const stationDistances = []
      for (let d = 0; d <= total + 1e-3; d += segL) {
        stationDistances.push(Math.min(d, total))
      }
      if (stationDistances.length === 0 || total - stationDistances[stationDistances.length - 1] > 0.5) {
        stationDistances.push(total)
      }

      stationDistances.forEach((curD, stIdx) => {
        const { pt } = getInterpolatedPoint(mainCenterlineCoords, dists, curD)
        const isStart = stIdx === 0
        const isEnd = stIdx === stationDistances.length - 1 && stIdx > 0 && Math.abs(curD - total) < 0.05
        const kmStr = formatChainage(curD, isEnd && Math.abs(curD - Math.round(curD)) >= 0.05)
        const segIdx = Math.min(
          Math.ceil(total / segL) || 1,
          Math.floor(Math.max(0, curD - 1e-6) / segL) + 1
        )
        const zVal = hasExplicitVertexZ(pt) ? Number(Number(pt[2]).toFixed(3)) : null

        processedFeatures.push({
          type: 'Feature',
          id: `station-milestone-${stIdx}-${Math.round(curD * 100)}`,
          properties: {
            type: 'StationMilestone',
            layerType: 'StationPoint',
            stationIndex: stIdx + 1,
            name: isStart ? `${kmStr} (Đầu tuyến)` : isEnd ? `${kmStr} (Cuối tuyến)` : kmStr,
            stationName: kmStr,
            chainage: kmStr,
            distMeters: Number(curD.toFixed(2)),
            distance: Number(curD.toFixed(2)),
            elevation: zVal,
            segment: `SEG-${String(segIdx).padStart(2, '0')}`,
            isStart,
            isEnd,
          },
          geometry: {
            type: 'Point',
            coordinates: pt,
          },
        })
      })
    }

    // 2. Transverse Expansion Joints ONLY when expansionJointSpacingMeters > 0 AND roadWidth > 0
    const expansionDistances = []
    if (hasValidExpJointSpacing && hasValidRoadWidth) {
      let expIdx = 1
      for (let d = expJointSpacing; d <= total + 1e-3; d += expJointSpacing) {
        if (d > total) break
        expansionDistances.push(d)
        const { pt, dx, dy } = getInterpolatedPoint(mainCenterlineCoords, dists, d)
        const transverse = createTransverseLine(pt, dx, dy, halfW)
        processedFeatures.push({
          type: 'Feature',
          id: `joint-cut-exp-${expIdx++}`,
          properties: {
            type: 'ExpansionJoint',
            layerType: 'ExpansionJoint',
            name: `Khe co giãn (${Number(d.toFixed(2))}m)`,
            chainage: formatChainage(d),
            distMeters: Number(d.toFixed(2)),
            roadWidth: roadW,
            isExpansion: true,
          },
          geometry: {
            type: 'LineString',
            coordinates: transverse,
          },
        })
      }
    }

    // 2.2 Transverse Contraction Joints & Concrete Slabs ONLY when governing parameters are provided
    let slabRowIndex = 1
    if (hasValidSlabLength) {
      for (let d = slabL; d <= total + 1e-3; d += slabL) {
        if (d > total) break
        const isAtExpansionJoint = expansionDistances.some((ed) => Math.abs(ed - d) < 0.05)

        if (hasValidRoadWidth && !isAtExpansionJoint) {
          const { pt, dx, dy } = getInterpolatedPoint(mainCenterlineCoords, dists, d)
          const transverse = createTransverseLine(pt, dx, dy, halfW)
          processedFeatures.push({
            type: 'Feature',
            id: `joint-cut-${slabRowIndex}`,
            properties: {
              type: 'ContractionJoint',
              layerType: 'ContractionJoint',
              name: `Khe co/uốn (${Number(d.toFixed(2))}m)`,
              chainage: formatChainage(d),
              distMeters: Number(d.toFixed(2)),
              roadWidth: roadW,
              isExpansion: false,
            },
            geometry: {
              type: 'LineString',
              coordinates: transverse,
            },
          })
        }

        if (hasValidRoadWidth && hasValidLaneCount && slabWidth !== null) {
          const startDist = d - slabL
          const centerDist = d - slabL / 2.0
          const centerPt = getInterpolatedPoint(mainCenterlineCoords, dists, centerDist).pt
          const slabCode = `S-${String(slabRowIndex).padStart(3, '0')}`
          const segIdx = hasValidSegmentLength ? Math.floor(centerDist / segL) + 1 : null

          processedFeatures.push({
            type: 'Feature',
            id: `slab-item-${slabRowIndex}`,
            properties: {
              type: 'Slab',
              layerType: 'ConcreteSlab',
              name: slabCode,
              code: slabCode,
              slabIndex: slabRowIndex,
              startChainage: formatChainage(startDist),
              endChainage: formatChainage(d),
              chainage: formatChainage(centerDist),
              startMeters: Number(startDist.toFixed(2)),
              endMeters: Number(d.toFixed(2)),
              centerMeters: Number(centerDist.toFixed(2)),
              segment: segIdx !== null ? `SEG-${String(segIdx).padStart(2, '0')}` : null,
              slabLength: slabL,
              slabWidth,
              roadWidth: roadW,
              laneCount,
              slabsInRow: laneCount,
              rowAreaSqm: Number((slabL * roadW).toFixed(2)),
              singleSlabAreaSqm: Number((slabL * slabWidth).toFixed(2)),
              dimensions: `${slabL}m × ${slabWidth}m (${laneCount} dải, B=${roadW}m)`,
            },
            geometry: {
              type: 'Point',
              coordinates: centerPt,
            },
          })
        }
        slabRowIndex++
      }
    }

    // 3. Drone / Construction Segments & Bounds ONLY when segmentLength > 0 is confirmed/entered
    if (hasValidSegmentLength) {
      const segCount = Math.ceil(total / segL)
      for (let s = 1; s <= segCount; s++) {
        const segId = `SEG-${String(s).padStart(2, '0')}`
        const startD = (s - 1) * segL
        const endD = Math.min(s * segL, total)
        const ptsInSeg = []
        const step = Math.max(1.0, Math.min(5.0, (endD - startD) / 5.0))
        for (let d = startD; d <= endD; d += step) {
          ptsInSeg.push(getInterpolatedPoint(mainCenterlineCoords, dists, d).pt)
        }
        ptsInSeg.push(getInterpolatedPoint(mainCenterlineCoords, dists, endD).pt)

        if (ptsInSeg.length >= 2) {
          let minX = Infinity
          let maxX = -Infinity
          let minY = Infinity
          let maxY = -Infinity
          ptsInSeg.forEach((p) => {
            minX = Math.min(minX, p[0])
            maxX = Math.max(maxX, p[0])
            minY = Math.min(minY, p[1])
            maxY = Math.max(maxY, p[1])
          })
          if (maxX - minX < 0.0003) { minX -= 0.0002; maxX += 0.0002 }
          if (maxY - minY < 0.0003) { minY -= 0.0002; maxY += 0.0002 }
          segmentBoundsMap[segId] = [
            [minX, minY],
            [maxX, maxY],
          ]

          processedFeatures.push({
            type: 'Feature',
            id: `drone-segment-${segId}`,
            properties: {
              type: 'DroneSegment',
              segmentId: segId,
              name: `Phân đoạn ${segId}`,
              chainage: `${formatChainage(startD)} - ${formatChainage(endD)}`,
              startDist: Number(startD.toFixed(2)),
              endDist: Number(endD.toFixed(2)),
              lengthMeters: Number((endD - startD).toFixed(2)),
            },
            geometry: {
              type: 'LineString',
              coordinates: ptsInSeg,
            },
          })

          if (Array.isArray(completedSegments) && completedSegments.includes(segId)) {
            processedFeatures.push({
              type: 'Feature',
              id: `drone-completed-${segId}`,
              properties: {
                type: 'DroneCompletedSegment',
                name: `Phân đoạn ${segId} (Đã hoàn thành)`,
                segmentId: segId,
              },
              geometry: {
                type: 'LineString',
                coordinates: ptsInSeg,
              },
            })
          }
        }

        droneSegments.push({
          id: segId,
          index: s,
          name: `Phân đoạn ${s}`,
          range: `${formatChainage(startD)} - ${formatChainage(endD)}`,
          startM: Number(startD.toFixed(2)),
          endM: Number(endD.toFixed(2)),
          startDist: Number(startD.toFixed(2)),
          endDist: Number(endD.toFixed(2)),
          length: Number((endD - startD).toFixed(2)),
        })
      }

      // 4. Branch Intersection Segments & Slabs (if present)
      if (branchCenterlines.length > 0) {
        const branchSegId = `SEG-${String(segCount + 1).padStart(2, '0')}`
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity
        let bLen = 0

        branchCenterlines.forEach((bCoords, bIdx) => {
          if (!bCoords || bCoords.length < 2) return
          const { dists: bDists, total: bTotal } = getPolylineCumulativeDistances(bCoords)
          bLen += bTotal

          bCoords.forEach((p) => {
            minX = Math.min(minX, p[0])
            maxX = Math.max(maxX, p[0])
            minY = Math.min(minY, p[1])
            maxY = Math.max(maxY, p[1])
          })

          if (hasValidSlabLength && hasValidRoadWidth) {
            for (let d = slabL; d < bTotal; d += slabL) {
              const { pt, dx, dy } = getInterpolatedPoint(bCoords, bDists, d)
              const transverse = createTransverseLine(pt, dx, dy, halfW)
              const isExpansion =
                hasValidExpJointSpacing && Math.abs(d % expJointSpacing) < 0.05

              processedFeatures.push({
                type: 'Feature',
                id: `joint-cut-branch-${bIdx}-${Math.round(d)}`,
                properties: {
                  type: isExpansion ? 'ExpansionJoint' : 'ContractionJoint',
                  name: isExpansion
                    ? `Khe co giãn nhánh (${Math.round(d)}m)`
                    : `Khe co/uốn nhánh (${Math.round(d)}m)`,
                  chainage: `Nhánh ${bIdx + 1} (${Math.round(d)}m)`,
                  isExpansion,
                },
                geometry: {
                  type: 'LineString',
                  coordinates: transverse,
                },
              })

              if (hasValidLaneCount && slabWidth !== null) {
                const centerDist = d - slabL / 2.0
                const centerPt = getInterpolatedPoint(bCoords, bDists, centerDist).pt
                const slabCode = `S-${String(slabRowIndex).padStart(3, '0')}`
                processedFeatures.push({
                  type: 'Feature',
                  id: `slab-item-${slabRowIndex}`,
                  properties: {
                    type: 'Slab',
                    layerType: 'ConcreteSlab',
                    name: slabCode,
                    code: slabCode,
                    slabIndex: slabRowIndex,
                    startChainage: `Nhánh ${bIdx + 1} (${Math.round(d - slabL)}m)`,
                    endChainage: `Nhánh ${bIdx + 1} (${Math.round(d)}m)`,
                    chainage: `Nhánh ${bIdx + 1} (${Math.round(centerDist)}m)`,
                    centerMeters: Number(centerDist.toFixed(2)),
                    segment: branchSegId,
                    slabLength: slabL,
                    slabWidth,
                    roadWidth: roadW,
                    laneCount,
                    slabsInRow: laneCount,
                    rowAreaSqm: Number((slabL * roadW).toFixed(2)),
                    singleSlabAreaSqm: Number((slabL * slabWidth).toFixed(2)),
                    dimensions: `${slabL}m × ${slabWidth}m (${laneCount} dải, B=${roadW}m)`,
                    isBranch: true,
                  },
                  geometry: {
                    type: 'Point',
                    coordinates: centerPt,
                  },
                })
                slabRowIndex++
              }
            }
          }

          if (Array.isArray(completedSegments) && completedSegments.includes(branchSegId)) {
            processedFeatures.push({
              type: 'Feature',
              id: `drone-completed-branch-${bIdx}`,
              properties: {
                type: 'DroneCompletedSegment',
                name: `Phân đoạn ${branchSegId} (Nhánh ${bIdx + 1})`,
                segmentId: branchSegId,
              },
              geometry: {
                type: 'LineString',
                coordinates: bCoords,
              },
            })
          }

          processedFeatures.push({
            type: 'Feature',
            id: `drone-segment-${branchSegId}-${bIdx}`,
            properties: {
              type: 'DroneSegment',
              segmentId: branchSegId,
              name: `Phân đoạn ${branchSegId} - Nhánh ${bIdx + 1}`,
              chainage: `Nhánh phụ ${bIdx + 1}`,
            },
            geometry: {
              type: 'LineString',
              coordinates: bCoords,
            },
          })
        })

        const finalBLen = Number(bLen.toFixed(2))
        if (finalBLen >= 15.0 && Number.isFinite(minX)) {
          if (maxX - minX < 0.0003) { minX -= 0.0002; maxX += 0.0002 }
          if (maxY - minY < 0.0003) { minY -= 0.0002; maxY += 0.0002 }
          segmentBoundsMap[branchSegId] = [
            [minX, minY],
            [maxX, maxY],
          ]
          droneSegments.push({
            id: branchSegId,
            index: segCount + 1,
            name: `Phân đoạn ${segCount + 1} (Nhánh giao lộ)`,
            range: `Nhánh giao lộ (${Math.round(finalBLen)}m)`,
            startM: Number(total.toFixed(2)),
            endM: Number((total + finalBLen).toFixed(2)),
            startDist: Number(total.toFixed(2)),
            endDist: Number((total + finalBLen).toFixed(2)),
            length: finalBLen,
            isBranch: true,
          })
        }
      }
    }
  }

  const bbox = computeRfc7946Bbox(coreFeatures.length > 0 ? coreFeatures : processedFeatures)
  const bounds = bbox
    ? [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ]
    : geoJsonInput?.bounds || null

  const allSlabFeatures = processedFeatures.filter(
    (f) => f.properties?.type === 'Slab' || f.properties?.layerType === 'ConcreteSlab'
  )
  const longitudinalSlabs =
    hasValidSlabLength && effectiveTotalLength > 0
      ? allSlabFeatures.length || Math.floor(effectiveTotalLength / slabL)
      : null
  const totalConcreteSlabs =
    longitudinalSlabs !== null && hasValidLaneCount && hasValidRoadWidth
      ? longitudinalSlabs * laneCount
      : null

  const nominalAreaSqm =
    effectiveTotalLength > 0 && hasValidRoadWidth
      ? Number((effectiveTotalLength * roadW).toFixed(2))
      : null

  const baseRoadWidth =
    parseOptionalPositiveNumber(geoJsonInput?.originalBackendRoadWidth) ??
    parseOptionalPositiveNumber(geoJsonInput?.roadWidth) ??
    null
  const rawSurfaceArea = parseOptionalPositiveNumber(
    geoJsonInput?.originalSurfaceAreaSqm ?? geoJsonInput?.surfaceAreaSqm
  )
  const hasPolygonFeature = coreFeatures.some(
    (f) =>
      (f?.geometry?.type === 'Polygon' || f?.geometry?.type === 'MultiPolygon') &&
      !f?.properties?.isIsland
  )
  const isSurfaceAreaProvisional = Boolean(
    hasValidRoadWidth &&
      baseRoadWidth !== null &&
      Math.abs(roadW - baseRoadWidth) > 1e-3 &&
      effectiveTotalLength > 0
  )
  // Geometric polygon area is ONLY reported when an actual Polygon exists and matches the current road width
  const surfaceAreaSqm =
    hasPolygonFeature && rawSurfaceArea !== null && !isSurfaceAreaProvisional
      ? Number(rawSurfaceArea.toFixed(2))
      : null

  const hasAuthentic3DElevation = Boolean(
    geoJsonInput?.hasAuthentic3DElevation === true ||
      (Array.isArray(mainCenterlineCoords) &&
        mainCenterlineCoords.some((pt) => hasExplicitVertexZ(pt)))
  )

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const elapsedMs = Math.max(1, Math.round(t1 - t0))

  const roadSegmentsCount = hasValidSegmentLength
    ? droneSegments.filter((s) => !s.isBranch).length ||
      (effectiveTotalLength > 0 ? Math.ceil(effectiveTotalLength / segL) : 0)
    : null
  const stationPointCount = hasValidSegmentLength
    ? processedFeatures.filter((f) => f.properties?.layerType === 'StationPoint').length
    : null

  const analytics = {
    totalLengthMeters: effectiveTotalLength,
    roadWidth: roadW,
    analyzedRoadWidth: baseRoadWidth,
    isSurfaceAreaProvisional,
    hasAuthentic3DElevation,
    laneCount,
    slabLength: slabL,
    slabWidth,
    segmentLength: segL,
    nominalAreaSqm,
    surfaceAreaSqm,
    totalAreaSqm: surfaceAreaSqm ?? nominalAreaSqm,
    longitudinalSlabs,
    totalSlabPieces: totalConcreteSlabs,
    estimatedConcreteSlabs: totalConcreteSlabs,
    roadSegments: roadSegmentsCount,
    totalSegmentsWithBranches: hasValidSegmentLength ? droneSegments.length : null,
    stationCount: stationPointCount,
    processingTimeMs: geoJsonInput?.analytics?.processingTimeMs || elapsedMs,
    centralMeridian: geoJsonInput?.centralMeridian ?? null,
    scaleFactor: geoJsonInput?.scaleFactor ?? 0.9999,
    axisOrder: geoJsonInput?.axisOrder ?? 'AUTO',
    crsMetadata: geoJsonInput?.crsMetadata ?? null,
    slabThicknessCentimeters: params.slabThicknessCentimeters,
    contractionJointSpacingMeters: params.contractionJointSpacingMeters,
    expansionJointSpacingMeters: params.expansionJointSpacingMeters,
    expansionJointGapMillimeters: params.expansionJointGapMillimeters,
    pavementDesign: params.pavementDesign,
  }

  const enrichedGeoJson = {
    ...(geoJsonInput || {}),
    type: 'FeatureCollection',
    bbox,
    bounds,
    roadWidth: roadW,
    analyzedRoadWidth: baseRoadWidth,
    isSurfaceAreaProvisional,
    hasAuthentic3DElevation,
    totalLengthMeters: effectiveTotalLength,
    nominalAreaSqm,
    surfaceAreaSqm,
    analytics,
    engineeringMetrics: analytics,
    features: processedFeatures,
  }

  return {
    geoJson: enrichedGeoJson,
    enrichedGeoJson,
    segmentBoundsMap,
    analytics,
    metrics: analytics,
    droneSegments,
  }
}

const NON_FALLBACK_ROAD_ERROR_CODES = new Set([
  'InvalidScaleFactor',
  'InvalidCentralMeridian',
  'UnconfiguredCrs',
  'AmbiguousAxisOrder',
  'InvalidSrid',
  'InvalidCoordinates',
  'InvalidVn2000',
  'InvalidWgs84',
  'InvalidFile',
  'MissingFile',
  'UnsupportedFileType',
  'ServerBusy',
  'ProcessingTimeout',
  'SubprocessTerminated',
  'ParseTimeout',
  'InternalServerError',
])

const ALLOWED_PARSE_DXF_FALLBACK_CODES = new Set([
  'NoCenterlineLayer',
  'EmptyCenterline',
  'NoLinearEntities',
  'ParseRoadFailed',
])

const NON_FALLBACK_DETAIL_PATTERN =
  /crs|pyproj|projection|geodetic|scale\s*factor|hệ số co giãn|hệ số múi chiếu|kinh tuyến trục|trục tọa độ|axis\s*order|quá tải|server\s*busy|timeout/i

/**
 * Builds unified Studio analytics directly from a successful `/api/cad/parse-road`
 * response and its enriched GeoJSON bundle, without requiring a duplicate `/api/cad/parse-dxf` call.
 */
export function buildAnalyticsFromRoadResponse(
  roadData,
  roadParams = {},
  geojson = null,
  elapsedMs = null
) {
  const params = normalizeRoadParams({
    ...roadParams,
    roadWidth: roadParams?.roadWidth ?? roadData?.roadWidth ?? null,
  })
  const baseAnalytics = geojson?.analytics ? { ...geojson.analytics } : {}
  const len = Number(roadData?.totalLengthMeters ?? baseAnalytics.totalLengthMeters ?? 0)
  const nominalAreaSqm =
    len > 0 && params.roadWidth !== null && params.roadWidth > 0
      ? Number((len * params.roadWidth).toFixed(2))
      : null
  const surfaceAreaSqm =
    baseAnalytics.surfaceAreaSqm !== undefined
      ? baseAnalytics.surfaceAreaSqm
      : parseOptionalPositiveNumber(roadData?.surfaceAreaSqm)
  const slabL = params.effectiveSlabLength
  const longitudinalSlabs =
    slabL !== null && slabL > 0 && len > 0 ? Math.floor(len / slabL) : null
  const estimatedConcreteSlabs =
    longitudinalSlabs !== null &&
    params.laneCount !== null &&
    params.laneCount > 0 &&
    params.roadWidth !== null &&
    params.roadWidth > 0
      ? longitudinalSlabs * params.laneCount
      : null
  const roadSegments =
    len > 0 && params.segmentLength !== null && params.segmentLength > 0
      ? Math.ceil(len / params.segmentLength)
      : null

  return {
    ...baseAnalytics,
    totalLengthMeters: len,
    roadWidth: params.roadWidth,
    nominalAreaSqm,
    surfaceAreaSqm,
    totalAreaSqm: surfaceAreaSqm ?? nominalAreaSqm,
    roadSegments,
    longitudinalSlabs,
    totalSlabPieces: estimatedConcreteSlabs,
    estimatedConcreteSlabs,
    slabThicknessCentimeters: params.slabThicknessCentimeters,
    contractionJointSpacingMeters: params.contractionJointSpacingMeters,
    expansionJointSpacingMeters: params.expansionJointSpacingMeters,
    expansionJointGapMillimeters: params.expansionJointGapMillimeters,
    pavementDesign: params.pavementDesign,
    processingTimeMs:
      roadData?.processingTimeMs ??
      elapsedMs ??
      baseAnalytics.processingTimeMs ??
      1,
  }
}

/**
 * Determines whether a failed `/api/cad/parse-road` call is eligible for sequential
 * fallback to `/api/cad/parse-dxf`. Cancelled requests, stale responses, CRS/axis errors,
 * file validation errors, timeouts, and server-overload responses MUST NOT trigger a second heavy parse.
 */
export function shouldFallbackToParseDxf({
  roadData = null,
  roadError = null,
  isCanceled = false,
  isStale = false,
} = {}) {
  if (isCanceled || isStale) return false
  if (
    roadError?.name === 'CanceledError' ||
    roadError?.code === 'ERR_CANCELED' ||
    roadError?.__CANCEL__ === true
  ) {
    return false
  }
  if (roadData?.success === true) return false

  const status = roadError?.response?.status ?? null
  const errBody = roadError?.response?.data ?? null

  if (roadError && !roadError.response) {
    return false
  }
  if (
    status !== null &&
    [400, 401, 403, 408, 413, 415, 429, 499, 500, 502, 503, 504].includes(status)
  ) {
    return false
  }
  if (roadData?.requiresAxisConfirmation || errBody?.requiresAxisConfirmation) {
    return false
  }

  const errCode = String(errBody?.error || roadData?.error || '').trim()
  if (NON_FALLBACK_ROAD_ERROR_CODES.has(errCode)) {
    return false
  }

  const detail = String(
    errBody?.detail || errBody?.message || roadData?.detail || roadError?.message || ''
  )
  if (NON_FALLBACK_DETAIL_PATTERN.test(detail)) {
    return false
  }

  return ALLOWED_PARSE_DXF_FALLBACK_CODES.has(errCode)
}
