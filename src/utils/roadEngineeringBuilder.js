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

export const VN2000_REFERENCE_PRESETS = [
  { id: 'hcm-3deg', cm: '105.75', k0: 0.9999, zone: '3deg', label: '105°45\' (105.75°) – TP.HCM, Bình Dương, Long An, Tiền Giang (Múi 3°)' },
  { id: 'dni-3deg', cm: '107.75', k0: 0.9999, zone: '3deg', label: '107°45\' (107.75°) – Đồng Nai, BR-VT, Đà Nẵng, Quảng Nam (Múi 3°)' },
  { id: 'hni-3deg', cm: '105.00', k0: 0.9999, zone: '3deg', label: '105°00\' (105.00°) – Hà Nội, Cần Thơ, Hậu Giang (Múi 3°)' },
  { id: 'hp-3deg',  cm: '105.75', k0: 0.9999, zone: '3deg', label: '105°45\' (105.75°) – Hải Phòng, Hưng Yên, Thái Bình (Múi 3°)' },
  { id: 'tni-3deg', cm: '105.50', k0: 0.9999, zone: '3deg', label: '105°30\' (105.50°) – Tây Ninh, Vĩnh Long, Trà Vinh (Múi 3°)' },
  { id: 'btr-3deg', cm: '106.00', k0: 0.9999, zone: '3deg', label: '106°00\' (106.00°) – Bến Tre, Bắc Ninh, Bắc Giang (Múi 3°)' },
  { id: 'cmu-3deg', cm: '104.50', k0: 0.9999, zone: '3deg', label: '104°30\' (104.50°) – Cà Mau, Kiên Giang, An Giang (Múi 3°)' },
  { id: 'kh-3deg',  cm: '108.25', k0: 0.9999, zone: '3deg', label: '108°15\' (108.25°) – Khánh Hòa, Lâm Đồng, Bình Thuận (Múi 3°)' },
  { id: 'gl-3deg',  cm: '108.50', k0: 0.9999, zone: '3deg', label: '108°30\' (108.50°) – Gia Lai, Đắk Lắk, Phú Yên (Múi 3°)' },
  { id: 'hue-3deg', cm: '107.00', k0: 0.9999, zone: '3deg', label: '107°00\' (107.00°) – Thừa Thiên Huế, Quảng Trị (Múi 3°)' },
  { id: 'na-3deg',  cm: '104.75', k0: 0.9999, zone: '3deg', label: '104°45\' (104.75°) – Nghệ An, Đồng Tháp, Vĩnh Phúc (Múi 3°)' },
  { id: 'qn-3deg',  cm: '107.75', k0: 0.9999, zone: '3deg', label: '107°45\' (107.75°) – Quảng Ninh (Hồ sơ kỹ thuật Múi 3°)' },
  { id: 'vn-6deg-48', cm: '105.00', k0: 0.9996, zone: '6deg', label: '105°00\' (105.00°) – Múi 6° (Zone 48N, k0 = 0.9996)' },
  { id: 'vn-6deg-49', cm: '111.00', k0: 0.9996, zone: '6deg', label: '111°00\' (111.00°) – Múi 6° (Zone 49N, k0 = 0.9996)' },
  { id: 'custom',   cm: '',       k0: 0.9999, zone: 'custom', label: 'Tùy chỉnh Kinh tuyến trục & Hệ số múi chiếu (Hồ sơ thiết kế riêng)' },
]

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
  if (p.length >= 3 && Number.isFinite(Number(p[2]))) {
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

/**
 * Interpolates [lng, lat, z] and tangent vector (dx, dy) at targetDist along a polyline.
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
      if (pts[i].length >= 3 && pts[i + 1].length >= 3) {
        pt.push(Number((pts[i][2] + (pts[i + 1][2] - pts[i][2]) * frac).toFixed(3)))
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

/**
 * Normalizes road engineering parameters without any hidden multipliers.
 */
export function normalizeRoadParams(roadParams = {}) {
  const roadWidth = Math.max(0.5, parseFloat(roadParams.roadWidth) || 7.0)
  const slabLength = Math.max(1.0, parseFloat(roadParams.slabLength) || 4.0)
  const segmentLength = Math.max(10.0, parseFloat(roadParams.segmentLength) || 100.0)
  const laneCount = Math.max(1, parseInt(roadParams.laneCount, 10) || 2)
  const slabWidth = Number((roadWidth / laneCount).toFixed(3))
  return {
    roadWidth,
    slabLength,
    segmentLength,
    laneCount,
    slabWidth,
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
    roadWidth: roadParams.roadWidth ?? data.roadWidth ?? 7.0,
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
        surfaceAreaSqm: data.surfaceAreaSqm ?? data.nominalAreaSqm ?? 0,
        nominalAreaSqm: data.nominalAreaSqm ?? 0,
        centerlineCad: data.centerlineCad || [],
      },
      analytics: {
        totalLengthMeters: data.totalLengthMeters || 0,
        surfaceAreaSqm: data.surfaceAreaSqm ?? data.nominalAreaSqm ?? 0,
        nominalAreaSqm: data.nominalAreaSqm ?? 0,
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
          name: `Dải Mặt Đường Bê Tông (${params.roadWidth}m)`,
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
    originalBackendRoadWidth: Number(data.roadWidth) || 7.0,
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
      updatedProps.roadWidth = params.roadWidth
      updatedProps.name = `Dải Mặt Đường Bê Tông (${params.roadWidth}m)`
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

  if (mainCenterlineCoords && mainCenterlineCoords.length >= 2) {
    const { dists, total } = getPolylineCumulativeDistances(
      mainCenterlineCoords,
      effectiveTotalLength > 0 ? effectiveTotalLength : null
    )
    effectiveTotalLength = Number(total.toFixed(2))

    const { roadWidth: roadW, slabLength: slabL, segmentLength: segL, laneCount, slabWidth } = params
    const halfW = roadW / 2.0

    // 1. Station Points along centerline (at each segmentLength step + final end station)
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
      const zVal = pt.length >= 3 && Number.isFinite(pt[2]) ? Number(pt[2]) : 0.0

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

    // 2. Transverse Joints & Concrete Slabs on Main Corridor
    let slabRowIndex = 1
    for (let d = slabL; d <= total + 1e-3; d += slabL) {
      if (d > total) break
      const { pt, dx, dy } = getInterpolatedPoint(mainCenterlineCoords, dists, d)
      const transverse = createTransverseLine(pt, dx, dy, halfW)
      const isExpansion = Math.round(d) % Math.round(segL) < slabL || d >= total - slabL

      processedFeatures.push({
        type: 'Feature',
        id: `joint-cut-${slabRowIndex}`,
        properties: {
          type: isExpansion ? 'ExpansionJoint' : 'ContractionJoint',
          layerType: isExpansion ? 'ExpansionJoint' : 'ContractionJoint',
          name: isExpansion
            ? `Khe co giãn (${Number(d.toFixed(2))}m)`
            : `Khe co/uốn (${Number(d.toFixed(2))}m)`,
          chainage: formatChainage(d),
          distMeters: Number(d.toFixed(2)),
          roadWidth: roadW,
          isExpansion,
        },
        geometry: {
          type: 'LineString',
          coordinates: transverse,
        },
      })

      const startDist = d - slabL
      const centerDist = d - slabL / 2.0
      const centerPt = getInterpolatedPoint(mainCenterlineCoords, dists, centerDist).pt
      const slabCode = `S-${String(slabRowIndex).padStart(3, '0')}`
      const segIdx = Math.floor(centerDist / segL) + 1

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
          segment: `SEG-${String(segIdx).padStart(2, '0')}`,
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
      slabRowIndex++
    }

    // 3. Drone / Construction Segments & Bounds
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

        for (let d = slabL; d < bTotal; d += slabL) {
          const { pt, dx, dy } = getInterpolatedPoint(bCoords, bDists, d)
          const transverse = createTransverseLine(pt, dx, dy, halfW)
          const isExpansion = Math.round(d) % 60 < slabL || d >= bTotal - slabL

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

  const bbox = computeRfc7946Bbox(coreFeatures.length > 0 ? coreFeatures : processedFeatures)
  const bounds = bbox
    ? [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ]
    : geoJsonInput?.bounds || null

  const mainSlabCount = Math.floor(effectiveTotalLength / params.slabLength) * params.laneCount
  const allSlabFeatures = processedFeatures.filter(
    (f) => f.properties?.type === 'Slab' || f.properties?.layerType === 'ConcreteSlab'
  )
  const longitudinalSlabs = allSlabFeatures.length || Math.floor(effectiveTotalLength / params.slabLength)
  const totalConcreteSlabs = longitudinalSlabs * params.laneCount || mainSlabCount

  const nominalAreaSqm = Number((effectiveTotalLength * params.roadWidth).toFixed(2))
  const baseRoadWidth = Number(geoJsonInput?.originalBackendRoadWidth || geoJsonInput?.roadWidth) || params.roadWidth
  const rawSurfaceArea = Number(geoJsonInput?.originalSurfaceAreaSqm ?? geoJsonInput?.surfaceAreaSqm)
  const isSurfaceAreaProvisional = Boolean(
    geoJsonInput?.originalBackendRoadWidth &&
      Math.abs(params.roadWidth - Number(geoJsonInput.originalBackendRoadWidth)) > 1e-3
  )
  const surfaceAreaSqm =
    rawSurfaceArea > 0 && baseRoadWidth > 0
      ? Number(((rawSurfaceArea * params.roadWidth) / baseRoadWidth).toFixed(2))
      : nominalAreaSqm

  const hasAuthentic3DElevation = Boolean(
    Array.isArray(mainCenterlineCoords) &&
      mainCenterlineCoords.some((pt) => Array.isArray(pt) && pt.length >= 3 && Number.isFinite(pt[2]) && Math.abs(pt[2]) > 1e-4)
  )

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const elapsedMs = Math.max(1, Math.round(t1 - t0))

  const analytics = {
    totalLengthMeters: effectiveTotalLength,
    roadWidth: params.roadWidth,
    analyzedRoadWidth: baseRoadWidth,
    isSurfaceAreaProvisional,
    hasAuthentic3DElevation,
    laneCount: params.laneCount,
    slabLength: params.slabLength,
    slabWidth: params.slabWidth,
    segmentLength: params.segmentLength,
    nominalAreaSqm,
    surfaceAreaSqm,
    totalAreaSqm: nominalAreaSqm,
    longitudinalSlabs,
    totalSlabPieces: totalConcreteSlabs,
    estimatedConcreteSlabs: totalConcreteSlabs,
    roadSegments: droneSegments.filter((s) => !s.isBranch).length || Math.ceil(effectiveTotalLength / params.segmentLength),
    totalSegmentsWithBranches: droneSegments.length,
    stationCount: processedFeatures.filter((f) => f.properties?.layerType === 'StationPoint').length,
    processingTimeMs: geoJsonInput?.analytics?.processingTimeMs || elapsedMs,
    centralMeridian: geoJsonInput?.centralMeridian ?? null,
    scaleFactor: geoJsonInput?.scaleFactor ?? 0.9999,
    axisOrder: geoJsonInput?.axisOrder ?? 'AUTO',
    crsMetadata: geoJsonInput?.crsMetadata ?? null,
  }

  const enrichedGeoJson = {
    ...(geoJsonInput || {}),
    type: 'FeatureCollection',
    bbox,
    bounds,
    roadWidth: params.roadWidth,
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
