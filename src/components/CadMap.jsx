import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Layers, Box, Eye, EyeOff, Compass, Maximize2, Rotate3d, Navigation, LocateFixed, Radio, CheckCircle2, Sliders } from 'lucide-react'
import toast from 'react-hot-toast'

/* ── Base Map Style Definitions for MapLibre GL ────────────────── */
const MAP_STYLES = {
  satellite: {
    version: 8,
    sources: {
      'satellite-tiles': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: '© Esri, Maxar, Earthstar Geographics',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite-tiles',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
  osm: {
    version: 8,
    sources: {
      'osm-tiles': {
        type: 'raster',
        tiles: [
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'osm-layer',
        type: 'raster',
        source: 'osm-tiles',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
  dark: {
    version: 8,
    sources: {
      'esri-dark': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: '© Esri, HERE, DeLorme, MapmyIndia',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'dark-layer',
        type: 'raster',
        source: 'esri-dark',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
}

/* ── Ensure [lng, lat] coordinate format for GeoJSON ─────────────── */
function toLngLat(p) {
  if (!Array.isArray(p) || p.length < 2) return p
  const [a, b] = p
  if (Math.abs(a) < Math.abs(b)) {
    return [Number(b), Number(a)]
  }
  return [Number(a), Number(b)]
}

/* ── Geodesic distance in meters between two [lng, lat] points ─────── */
function haversineDist(p1, p2) {
  const R = 6371000
  const dLat = (p2[1] - p1[1]) * Math.PI / 180
  const dLng = (p2[0] - p1[0]) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(p1[1] * Math.PI / 180) * Math.cos(p2[1] * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ── Compute cumulative distances along a polyline ───────────────── */
function getPolylineCumulativeDistances(pts) {
  const dists = [0]
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    total += haversineDist(pts[i], pts[i + 1])
    dists.push(total)
  }
  return { dists, total }
}

/* ── Interpolate point and tangent vector along polyline ─────────── */
function getInterpolatedPoint(pts, dists, targetDist) {
  if (targetDist <= 0) return { pt: pts[0], dx: pts[1][0] - pts[0][0], dy: pts[1][1] - pts[0][1] }
  const total = dists[dists.length - 1]
  if (targetDist >= total) {
    const n = pts.length
    return { pt: pts[n - 1], dx: pts[n - 1][0] - pts[n - 2][0], dy: pts[n - 1][1] - pts[n - 2][1] }
  }

  for (let i = 0; i < dists.length - 1; i++) {
    if (targetDist >= dists[i] && targetDist <= dists[i + 1]) {
      const segLen = dists[i + 1] - dists[i]
      const frac = segLen > 0 ? (targetDist - dists[i]) / segLen : 0
      const lng = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * frac
      const lat = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * frac
      const dx = pts[i + 1][0] - pts[i][0]
      const dy = pts[i + 1][1] - pts[i][1]
      return { pt: [lng, lat], dx, dy }
    }
  }
  return { pt: pts[0], dx: 1, dy: 0 }
}

/* ── Compute transverse perpendicular line (Joint cut) across road ─ */
function createTransverseLine(centerPt, dx, dy, halfWidthMeters) {
  const latRad = centerPt[1] * Math.PI / 180
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos(latRad)

  const tX = dx * metersPerDegLng
  const tY = dy * metersPerDegLat
  const tLen = Math.hypot(tX, tY) || 1

  const nX = -tY / tLen
  const nY = tX / tLen

  const leftLng = centerPt[0] + (nX * halfWidthMeters) / metersPerDegLng
  const leftLat = centerPt[1] + (nY * halfWidthMeters) / metersPerDegLat

  const rightLng = centerPt[0] - (nX * halfWidthMeters) / metersPerDegLng
  const rightLat = centerPt[1] - (nY * halfWidthMeters) / metersPerDegLat

  return [[leftLng, leftLat], [rightLng, rightLat]]
}

/* ── Normalize Bounding Box to [[minLng, minLat], [maxLng, maxLat]] ─ */
function computeGeoJsonBounds(geoJson) {
  if (!geoJson?.features || geoJson.features.length === 0) return null
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity

  const walk = (coords) => {
    if (!coords || !Array.isArray(coords)) return
    if (typeof coords[0] === 'number') {
      const p = toLngLat(coords)
      minLng = Math.min(minLng, p[0])
      maxLng = Math.max(maxLng, p[0])
      minLat = Math.min(minLat, p[1])
      maxLat = Math.max(maxLat, p[1])
      return
    }
    coords.forEach(walk)
  }

  geoJson.features.forEach(f => {
    if (f.geometry?.coordinates) walk(f.geometry.coordinates)
  })

  if (minLng === Infinity || maxLng === -Infinity) return null
  return [[minLng, minLat], [maxLng, maxLat]]
}

/* ── Component CadMap (MapLibre GL JS Engine) ───────────────────── */
export default function CadMap({
  geoJsonData,
  roadOverlay,
  mapStyle = 'satellite',
  showGeometry = true,
  showVertices = false,
  showCenterline = true,
  showRoadSurface = true,
  showEdges = true,
  showStations = true,
  showSlabs = true,
  showSlabLabels = true,
  completedSegments = [],
  focusedSegment = null,
  roadParams,
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const popupRef = useRef(null)
  const [is3D, setIs3D] = useState(true)
  const [mapLoaded, setMapLoaded] = useState(false)

  /* ── 1. Chuẩn hóa dữ liệu GeoJSON sang [lng, lat] & Nội suy Tấm BTXM / Cọc ── */
  const { cleanGeoJson, segmentBoundsMap } = useMemo(() => {
    if (!geoJsonData?.features) return { cleanGeoJson: null, segmentBoundsMap: {} }

    const processedFeatures = []
    let mainCenterlineCoords = null

    geoJsonData.features.forEach(f => {
      const geom = f.geometry
      if (!geom) {
        processedFeatures.push(f)
        return
      }

      const fixCoords = (c) => {
        if (!Array.isArray(c)) return c
        if (typeof c[0] === 'number') return toLngLat(c)
        return c.map(fixCoords)
      }

      const cleanedGeom = {
        ...geom,
        coordinates: fixCoords(geom.coordinates),
      }

      processedFeatures.push({
        ...f,
        geometry: cleanedGeom,
      })

      // Lưu lại tim đường chính để nội suy cọc lý trình và chia tấm BTXM
      const isMainCenterline = (f.id === 'road-centerline-main' || f.properties?.layer === 'TIM_TUYEN_CHINH') &&
                               cleanedGeom.type === 'LineString' &&
                               Array.isArray(cleanedGeom.coordinates)
      if (isMainCenterline && !mainCenterlineCoords) {
        mainCenterlineCoords = cleanedGeom.coordinates
      }

      // Nếu là Tim đường (Centerline), trích xuất các điểm mốc (Vertices)
      const isCenterline = f.properties?.type === 'Centerline' ||
                           f.properties?.layer === 'TIM_TUYEN_CHINH' ||
                           (f.properties?.layer && f.properties.layer.toLowerCase().includes('tim'))

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
              name: `${f.properties?.name || 'Tim tuyến'} - P${idx + 1}`,
            },
            geometry: {
              type: 'Point',
              coordinates: pt,
            },
          })
        })
      }
    })

    const boundsMap = {}

    // Nội suy Cọc lý trình (Km0+000, Km0+100...) và Tấm BTXM nếu có tim tuyến chính
    if (mainCenterlineCoords && mainCenterlineCoords.length >= 2) {
      const { dists, total } = getPolylineCumulativeDistances(mainCenterlineCoords)
      const slabL = Number(roadParams?.slabLength) || 4.0
      const roadW = Number(roadParams?.roadWidth) || 7.0
      const halfW = roadW / 2.0

      // 1.1 Cọc lý trình (Stations) mỗi 100m
      for (let d = 0; d <= total + 1e-3; d += 100) {
        const curD = Math.min(d, total)
        const { pt } = getInterpolatedPoint(mainCenterlineCoords, dists, curD)
        const kmStr = 'Km0+' + String(Math.round(curD)).padStart(3, '0')
        processedFeatures.push({
          type: 'Feature',
          id: `station-milestone-${Math.round(curD)}`,
          properties: {
            type: 'StationMilestone',
            name: kmStr,
            chainage: kmStr,
            distMeters: Math.round(curD),
          },
          geometry: {
            type: 'Point',
            coordinates: pt,
          },
        })
      }

      // 1.2 Khe co giãn & Khe uốn & Tấm bê tông BTXM (TCVN 10380:2014)
      let slabCount = 1
      for (let d = slabL; d < total; d += slabL) {
        const { pt, dx, dy } = getInterpolatedPoint(mainCenterlineCoords, dists, d)
        const transverse = createTransverseLine(pt, dx, dy, halfW)
        const isExpansion = (Math.round(d) % 100 < slabL) || (d >= total - slabL)

        // Đường cắt khe ngang
        processedFeatures.push({
          type: 'Feature',
          id: `joint-cut-${Math.round(d)}`,
          properties: {
            type: isExpansion ? 'ExpansionJoint' : 'ContractionJoint',
            name: isExpansion ? `Khe co giãn (${Math.round(d)}m)` : `Khe uốn/co (${Math.round(d)}m)`,
            chainage: `Km0+${String(Math.round(d)).padStart(3, '0')}`,
            isExpansion,
          },
          geometry: {
            type: 'LineString',
            coordinates: transverse,
          },
        })

        // Điểm tâm tấm BTXM để gắn nhãn S-001, S-002...
        const centerDist = d - slabL / 2
        const centerPt = getInterpolatedPoint(mainCenterlineCoords, dists, centerDist).pt
        const slabCode = `S-${String(slabCount).padStart(3, '0')}`
        const segIdx = Math.floor(centerDist / 100) + 1
        processedFeatures.push({
          type: 'Feature',
          id: `slab-item-${slabCount}`,
          properties: {
            type: 'Slab',
            name: slabCode,
            code: slabCode,
            chainage: `Km0+${String(Math.round(centerDist)).padStart(3, '0')}`,
            segment: `SEG-${String(segIdx).padStart(2, '0')}`,
            dimensions: `${slabL}m x ${roadW}m`,
            slabIndex: slabCount,
          },
          geometry: {
            type: 'Point',
            coordinates: centerPt,
          },
        })
        slabCount++
      }

      // 1.3 Phân đoạn Drone & Bounding box từng đoạn (100m/đoạn)
      const segCount = Math.ceil(total / 100)
      for (let s = 1; s <= segCount; s++) {
        const segId = `SEG-${String(s).padStart(2, '0')}`
        const startD = (s - 1) * 100
        const endD = Math.min(s * 100, total)
        const ptsInSeg = []
        for (let d = startD; d <= endD; d += 5) {
          ptsInSeg.push(getInterpolatedPoint(mainCenterlineCoords, dists, d).pt)
        }
        if (ptsInSeg.length >= 2) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
          ptsInSeg.forEach(p => {
            minX = Math.min(minX, p[0])
            maxX = Math.max(maxX, p[0])
            minY = Math.min(minY, p[1])
            maxY = Math.max(maxY, p[1])
          })
          boundsMap[segId] = [[minX, minY], [maxX, maxY]]

          // Nếu phân đoạn này đã bay xong thì vẽ dải neon xanh lá
          if (completedSegments && completedSegments.includes(segId)) {
            processedFeatures.push({
              type: 'Feature',
              id: `drone-completed-${segId}`,
              properties: {
                type: 'DroneCompletedSegment',
                name: `Phân đoạn ${segId} (Đã bay xong)`,
                segmentId: segId,
              },
              geometry: {
                type: 'LineString',
                coordinates: ptsInSeg,
              },
            })
          }
        }
      }
    }

    // Sắp xếp thứ tự hình học z-index
    processedFeatures.sort((a, b) => {
      const getPriority = (feature) => {
        const t = feature.geometry?.type
        const p = feature.properties || {}
        if (p.type === 'DroneCompletedSegment') return 1.4
        if (p.type === 'TrafficIsland' || p.layer === 'DAO_GIAO_THONG' || p.isIsland) return 1.5
        if (t === 'Polygon' || t === 'MultiPolygon') return 1
        if (p.type === 'ContractionJoint') return 2.1
        if (p.type === 'ExpansionJoint') return 2.2
        if (t === 'LineString' || t === 'MultiLineString') return 2
        if (p.type === 'Slab') return 3.2
        if (p.type === 'StationMilestone') return 3.5
        if (t === 'Point') return 3
        return 4
      }
      return getPriority(a) - getPriority(b)
    })

    return {
      cleanGeoJson: {
        type: 'FeatureCollection',
        features: processedFeatures,
      },
      segmentBoundsMap: boundsMap,
    }
  }, [geoJsonData, roadParams, completedSegments])

  /* ── 2. Khởi tạo MapLibre GL Map Instance ─────────────────────── */
  useEffect(() => {
    if (!mapContainerRef.current) return

    const initialStyle = MAP_STYLES[mapStyle] || MAP_STYLES.satellite

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: [105.8528, 10.8879],
      zoom: 14.5,
      pitch: 52,        // Góc nghiêng 3D kỹ thuật mặc định 52 độ
      bearing: -24,     // Xoay hướng nhìn dọc theo hành lang tuyến
      antialias: true,
      maxPitch: 85,
    })

    // Bổ sung các công cụ điều hướng 3D, la bàn, thước tỉ lệ
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      mapRef.current = map
      setMapLoaded(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      setMapLoaded(false)
    }
  }, [])

  /* ── 3. Chuyển đổi Style Bản đồ (Vệ tinh / OSM / Dark) ────────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const targetStyle = MAP_STYLES[mapStyle] || MAP_STYLES.satellite
    map.setStyle(targetStyle, { diff: false })

    // Khi style nạp lại, cấu hình lại nguồn dữ liệu CAD
    map.once('style.load', () => {
      setupCadLayers(map, cleanGeoJson)
    })
  }, [mapStyle])

  /* ── 4. Hàm cấu hình các Layers AutoCAD / GIS lên MapLibre ─────── */
  const setupCadLayers = useCallback((map, data) => {
    if (!map || !map.isStyleLoaded()) return

    const sourceId = 'cad-road-source'
    const existingSource = map.getSource(sourceId)

    if (existingSource) {
      if (data) existingSource.setData(data)
    } else if (data) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: data,
      })
    }

    if (!data) return

    // Xóa các layers cũ nếu có để đảm bảo cập nhật đúng thứ tự z-index và bộ lọc chính xác
    const layerIds = [
      'cad-layer-station-labels',
      'cad-layer-station-markers',
      'cad-layer-slab-labels',
      'cad-layer-expansion-joints',
      'cad-layer-contraction-joints',
      'cad-layer-vertices',
      'cad-layer-centerline',
      'cad-layer-centerline-casing',
      'cad-layer-drone-completed',
      'cad-layer-generic-lines',
      'cad-layer-edges',
      'cad-layer-islands-border',
      'cad-layer-islands-fill',
      'cad-layer-surface-border',
      'cad-layer-surface-fill',
    ]
    layerIds.forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id)
    })

    // 4.1 LAYER: Dải mặt đường Bê Tông 2D (Chất liệu xám #71717a, đục 85%)
    map.addLayer({
      id: 'cad-layer-surface-fill',
      type: 'fill',
      source: sourceId,
      filter: ['all',
        ['any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
        ],
        ['!=', ['get', 'type'], 'TrafficIsland'],
        ['!=', ['get', 'layer'], 'DAO_GIAO_THONG'],
        ['!=', ['get', 'isIsland'], true],
      ],
      layout: {
        visibility: showRoadSurface ? 'visible' : 'none',
      },
      paint: {
        'fill-color': '#71717a',      // Màu xám bê tông kỹ thuật
        'fill-opacity': 0.85,         // Độ đục 85% chuẩn yêu cầu
      },
    })

    // 4.2 LAYER: Mép viền ngoài dải mặt đường (Vạch trắng liền #FFFFFF)
    map.addLayer({
      id: 'cad-layer-surface-border',
      type: 'line',
      source: sourceId,
      filter: ['all',
        ['any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
        ],
        ['!=', ['get', 'type'], 'TrafficIsland'],
        ['!=', ['get', 'layer'], 'DAO_GIAO_THONG'],
        ['!=', ['get', 'isIsland'], true],
      ],
      layout: {
        visibility: showRoadSurface ? 'visible' : 'none',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#FFFFFF',      // Vạch biên trắng tinh
        'line-width': 2.0,            // Bề dày chuẩn 2px
        'line-opacity': 0.95,
      },
    })

    // 4.2B LAYER: Đảo Giao Thông & Bó Vỉa Hè (Traffic Islands - Tô khối đục & viền nét nổi bật)
    map.addLayer({
      id: 'cad-layer-islands-fill',
      type: 'fill',
      source: sourceId,
      filter: ['any',
        ['==', ['get', 'type'], 'TrafficIsland'],
        ['==', ['get', 'layer'], 'DAO_GIAO_THONG'],
        ['==', ['get', 'isIsland'], true],
      ],
      layout: {
        visibility: showRoadSurface ? 'visible' : 'none',
      },
      paint: {
        'fill-color': '#3f3f46',      // Màu xám đậm vỉa hè / đảo dẫn hướng
        'fill-opacity': 0.95,
      },
    })

    map.addLayer({
      id: 'cad-layer-islands-border',
      type: 'line',
      source: sourceId,
      filter: ['any',
        ['==', ['get', 'type'], 'TrafficIsland'],
        ['==', ['get', 'layer'], 'DAO_GIAO_THONG'],
        ['==', ['get', 'isIsland'], true],
      ],
      layout: {
        visibility: showRoadSurface ? 'visible' : 'none',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#f59e0b',      // Vàng viền bó vỉa hè sắc nét
        'line-width': 2.5,
        'line-opacity': 1.0,
      },
    })

    // 4.2C LAYER: Phân đoạn Drone đã bay hoàn thành (Neon Emerald #10b981)
    map.addLayer({
      id: 'cad-layer-drone-completed',
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'type'], 'DroneCompletedSegment'],
      layout: {
        visibility: 'visible',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#10b981',      // Xanh lá cây neon nổi bật phân đoạn đã bay
        'line-width': 7.0,
        'line-opacity': 0.85,
      },
    })

    // 4.3 LAYER: Mép đường trái / phải riêng lẻ (Road Edges - Vạch trắng liền)
    map.addLayer({
      id: 'cad-layer-edges',
      type: 'line',
      source: sourceId,
      filter: ['all',
        ['any',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'MultiLineString'],
        ],
        ['any',
          ['==', ['get', 'type'], 'RoadEdge'],
          ['==', ['get', 'layer'], 'MEP_TRAI'],
          ['==', ['get', 'layer'], 'MEP_PHAI'],
        ],
      ],
      layout: {
        visibility: showEdges ? 'visible' : 'none',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#FFFFFF',      // Mép đường là vạch trắng liền
        'line-width': 2.0,
        'line-opacity': 0.95,
      },
    })

    // 4.4 LAYER: Các nét CAD kỹ thuật khác (Generic LineStrings)
    map.addLayer({
      id: 'cad-layer-generic-lines',
      type: 'line',
      source: sourceId,
      filter: ['all',
        ['any',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'MultiLineString'],
        ],
        ['!=', ['get', 'type'], 'Centerline'],
        ['!=', ['get', 'type'], 'centerline'],
        ['!=', ['get', 'layer'], 'TIM_TUYEN_CHINH'],
        ['!=', ['get', 'type'], 'RoadEdge'],
        ['!=', ['get', 'layer'], 'MEP_TRAI'],
        ['!=', ['get', 'type'], 'ContractionJoint'],
        ['!=', ['get', 'type'], 'ExpansionJoint'],
        ['!=', ['get', 'type'], 'DroneCompletedSegment'],
        ['!', ['in', 'tim', ['downcase', ['coalesce', ['get', 'layer'], '']]]],
      ],
      layout: {
        visibility: showEdges ? 'visible' : 'none',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#38BDF8',
        'line-width': 1.5,
        'line-opacity': 0.65,
      },
    })

    // 4.5 LAYER: Viền bóng tương phản cho tim đường (Casing)
    const centerlineFilter = ['all',
      ['any',
        ['==', ['geometry-type'], 'LineString'],
        ['==', ['geometry-type'], 'MultiLineString'],
      ],
      ['any',
        ['==', ['get', 'type'], 'Centerline'],
        ['==', ['get', 'type'], 'centerline'],
        ['==', ['get', 'layer'], 'TIM_TUYEN_CHINH'],
        ['in', 'tim', ['downcase', ['coalesce', ['get', 'layer'], '']]],
        ['in', 'centerline', ['downcase', ['coalesce', ['get', 'layer'], '']]],
      ],
      ['!=', ['get', 'type'], 'RoadEdge'],
      ['!=', ['get', 'layer'], 'MEP_TRAI'],
      ['!=', ['get', 'layer'], 'MEP_PHAI'],
      ['!=', ['get', 'type'], 'ContractionJoint'],
      ['!=', ['get', 'type'], 'ExpansionJoint'],
      ['!=', ['get', 'type'], 'DroneCompletedSegment'],
    ]

    map.addLayer({
      id: 'cad-layer-centerline-casing',
      type: 'line',
      source: sourceId,
      filter: centerlineFilter,
      layout: {
        visibility: showCenterline ? 'visible' : 'none',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#0f172a',      // Đổ bóng đen thẫm dưới tim đường
        'line-width': 6.0,
        'line-opacity': 0.6,
      },
    })

    // 4.6 LAYER: Tim đường chính Vàng Highway (#FFD700) nét đứt
    map.addLayer({
      id: 'cad-layer-centerline',
      type: 'line',
      source: sourceId,
      filter: centerlineFilter,
      layout: {
        visibility: showCenterline ? 'visible' : 'none',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#FFD700',       // Vàng Highway rực rỡ sắc nét
        'line-width': 4.0,             // Bề dày 4.0px chuẩn tâm đường
        'line-dasharray': [4, 3],       // Nét đứt highway [4px vạch, 3px hở]
        'line-opacity': 1.0,
      },
    })

    // 4.7A LAYER: Khe uốn / Khe co (Contraction Joints - TCVN 10380:2014)
    map.addLayer({
      id: 'cad-layer-contraction-joints',
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'type'], 'ContractionJoint'],
      layout: {
        visibility: showSlabs ? 'visible' : 'none',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#67e8f9',       // Vạch cắt khe co giãn cyan sáng
        'line-width': 1.8,
        'line-opacity': 0.85,
      },
    })

    // 4.7B LAYER: Khe co giãn nhiệt (Expansion Joints - mỗi 100m)
    map.addLayer({
      id: 'cad-layer-expansion-joints',
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'type'], 'ExpansionJoint'],
      layout: {
        visibility: showSlabs ? 'visible' : 'none',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#f97316',       // Cam đỏ báo hiệu khe co giãn
        'line-width': 3.5,
        'line-opacity': 0.95,
      },
    })

    // 4.7C LAYER: Nhãn mã tấm BTXM (S-001, S-002... minzoom 18.0)
    map.addLayer({
      id: 'cad-layer-slab-labels',
      type: 'symbol',
      source: sourceId,
      filter: ['==', ['get', 'type'], 'Slab'],
      minzoom: 18.0,
      layout: {
        visibility: showSlabs && showSlabLabels ? 'visible' : 'none',
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-padding': 12,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': '#67e8f9',
        'text-halo-color': '#0f172a',
        'text-halo-width': 2.0,
      },
    })

    // 4.7D LAYER: Cọc mốc lý trình tròn (Stations / Milestones Km0+000, Km0+100...)
    map.addLayer({
      id: 'cad-layer-station-markers',
      type: 'circle',
      source: sourceId,
      filter: ['==', ['get', 'type'], 'StationMilestone'],
      layout: {
        visibility: showStations ? 'visible' : 'none',
      },
      paint: {
        'circle-radius': 5.5,
        'circle-color': '#06b6d4',     // Cyan nổi bật
        'circle-stroke-width': 2.0,
        'circle-stroke-color': '#ffffff',
      },
    })

    // 4.7E LAYER: Nhãn chữ Cọc lý trình (Km0+000, Km0+100...)
    map.addLayer({
      id: 'cad-layer-station-labels',
      type: 'symbol',
      source: sourceId,
      filter: ['==', ['get', 'type'], 'StationMilestone'],
      layout: {
        visibility: showStations ? 'visible' : 'none',
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, -1.8],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#38bdf8',
        'text-halo-color': '#0a0f1d',
        'text-halo-width': 2.0,
      },
    })

    // 4.7F LAYER: Các điểm cọc mốc tim tuyến (Vertices Points)
    map.addLayer({
      id: 'cad-layer-vertices',
      type: 'circle',
      source: sourceId,
      filter: ['all',
        ['==', ['geometry-type'], 'Point'],
        ['!=', ['get', 'type'], 'StationMilestone'],
        ['!=', ['get', 'type'], 'Slab'],
      ],
      layout: {
        visibility: showVertices ? 'visible' : 'none',
      },
      paint: {
        'circle-radius': 4.5,
        'circle-color': '#F59E0B',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#FFFFFF',
      },
    })

    // 4.8 Interactive Click Popup
    const interactiveLayers = [
      'cad-layer-surface-fill',
      'cad-layer-islands-fill',
      'cad-layer-centerline',
      'cad-layer-contraction-joints',
      'cad-layer-expansion-joints',
      'cad-layer-slab-labels',
      'cad-layer-station-markers',
      'cad-layer-drone-completed',
      'cad-layer-vertices',
    ]

    interactiveLayers.forEach(layerId => {
      map.on('click', layerId, handleFeatureClick)
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
    })
  }, [showRoadSurface, showEdges, showCenterline, showVertices, showStations, showSlabs, showSlabLabels])

  /* ── 5. Cập nhật dữ liệu CAD & Tự động FitBounds Camera ────────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const applyData = () => {
      if (!map.isStyleLoaded()) {
        map.once('style.load', applyData)
        return
      }

      setupCadLayers(map, cleanGeoJson)

      if (cleanGeoJson) {
        const bounds = computeGeoJsonBounds(cleanGeoJson)
        if (bounds) {
          map.fitBounds(bounds, {
            padding: { top: 90, bottom: 90, left: 90, right: 90 },
            pitch: is3D ? 52 : 0,
            bearing: is3D ? -24 : 0,
            duration: 1200,
            maxZoom: 16,
          })
        }
      }
    }

    applyData()
  }, [cleanGeoJson, mapLoaded, setupCadLayers])

  /* ── 5.2 Lắng nghe sự kiện lia camera đến phân đoạn Drone (Focus Segment) ─ */
  useEffect(() => {
    if (!focusedSegment || !mapRef.current || !mapLoaded) return
    const map = mapRef.current
    let bounds = segmentBoundsMap[focusedSegment.id]
    if (!bounds && cleanGeoJson?.features) {
      const segFeatures = cleanGeoJson.features.filter(
        f => f.properties?.segment === focusedSegment.id || f.properties?.id === focusedSegment.id
      )
      if (segFeatures.length > 0) {
        bounds = computeGeoJsonBounds({ type: 'FeatureCollection', features: segFeatures })
      }
    }
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 120, bottom: 120, left: 120, right: 120 },
        pitch: is3D ? 58 : 0,
        bearing: is3D ? -24 : 0,
        duration: 900,
        maxZoom: 18,
      })
      const rangeText = focusedSegment.range || `${focusedSegment.startM ?? 0}m - ${focusedSegment.endM ?? 100}m`
      toast.success(`Đang lia camera đến phân đoạn ${focusedSegment.id} (${rangeText})`, {
        id: 'drone-focus-segment-toast',
      })
    } else {
      toast(`Phân đoạn ${focusedSegment.id} chưa có dữ liệu tọa độ`, {
        id: 'drone-focus-segment-toast',
        icon: '⚠️',
      })
    }
  }, [focusedSegment?.timestamp, segmentBoundsMap, mapLoaded, is3D, cleanGeoJson])

  /* ── 6. Cập nhật trạng thái hiển thị của các Layers (Toggles) ──── */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.isStyleLoaded()) return

    const setVisibility = (layerId, visible) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
      }
    }

    setVisibility('cad-layer-surface-fill', showRoadSurface)
    setVisibility('cad-layer-surface-border', showRoadSurface)
    setVisibility('cad-layer-islands-fill', showRoadSurface)
    setVisibility('cad-layer-islands-border', showRoadSurface)
    setVisibility('cad-layer-edges', showEdges)
    setVisibility('cad-layer-generic-lines', showEdges)
    setVisibility('cad-layer-centerline-casing', showCenterline)
    setVisibility('cad-layer-centerline', showCenterline)
    setVisibility('cad-layer-vertices', showVertices)
    setVisibility('cad-layer-station-markers', showStations)
    setVisibility('cad-layer-station-labels', showStations)
    setVisibility('cad-layer-contraction-joints', showSlabs)
    setVisibility('cad-layer-expansion-joints', showSlabs)
    setVisibility('cad-layer-slab-labels', showSlabs && showSlabLabels)
    setVisibility('cad-layer-drone-completed', true)
  }, [showRoadSurface, showEdges, showCenterline, showVertices, showStations, showSlabs, showSlabLabels, mapLoaded])

  /* ── 7. Xử lý Popup khi Click vào đối tượng tuyến đường ───────── */
  const handleFeatureClick = (e) => {
    const feature = e.features?.[0]
    if (!feature) return
    const p = feature.properties || {}
    const name = p.name || 'Tuyến Thiết Kế'
    const type = p.type || 'Hạ tầng giao thông'
    const width = p.roadWidth || roadParams?.roadWidth || 7.0
    const len = p.totalLength ? `${Number(p.totalLength).toFixed(1)} m` : null
    const isIsland = p.type === 'TrafficIsland' || p.layer === 'DAO_GIAO_THONG' || p.isIsland
    const isSlab = p.type === 'Slab'
    const isJoint = p.type === 'ExpansionJoint' || p.type === 'ContractionJoint'
    const isStation = p.type === 'StationMilestone'

    let html = ''

    if (isSlab) {
      html = `
        <div style="font-family:Inter,sans-serif;min-width:220px;color:#f1f5f9">
          <div style="font-size:13px;font-weight:800;color:#38bdf8;margin-bottom:6px;border-bottom:1px solid rgba(56,189,248,0.3);padding-bottom:4px;display:flex;align-items:center;justify-content:space-between">
            <span>TẤM BÊ TÔNG ${p.code}</span>
            <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4)">TCVN</span>
          </div>
          <table style="width:100%;font-size:11px;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 0">Lý trình:</td><td style="color:#fbbf24;font-weight:700">${p.chainage}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Phân đoạn Drone:</td><td style="color:#38bdf8;font-weight:700">${p.segment}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Kích thước tấm:</td><td style="color:#e2e8f0;font-weight:600">${p.dimensions}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Quy chuẩn:</td><td style="color:#94a3b8">TCVN 10380:2014</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Khuyết tật mặt:</td><td style="color:#10b981;font-weight:700">✓ Đạt chuẩn (Không nứt)</td></tr>
          </table>
        </div>
      `
    } else if (isJoint) {
      const isExp = p.type === 'ExpansionJoint'
      html = `
        <div style="font-family:Inter,sans-serif;min-width:210px;color:#f1f5f9">
          <div style="font-size:12px;font-weight:800;color:${isExp ? '#f97316' : '#67e8f9'};margin-bottom:6px;border-bottom:1px solid rgba(249,115,22,0.3);padding-bottom:4px">
            ${isExp ? 'KHE CO GIÃN NHIỆT (EXPANSION)' : 'KHE CO / KHE UỐN (CONTRACTION)'}
          </div>
          <table style="width:100%;font-size:11px;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 0">Lý trình:</td><td style="color:#fbbf24;font-weight:700">${p.chainage}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Kết cấu:</td><td style="color:#e2e8f0;font-weight:600">${isExp ? 'Chèn xốp bitum 20mm + thanh truyền lực' : 'Cắt ron 5mm + keo trám silicon'}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Khoảng cách:</td><td style="color:#34d399;font-weight:600">${isExp ? 'Định kỳ 100m' : 'Mỗi tấm 4.0m'}</td></tr>
          </table>
        </div>
      `
    } else if (isStation) {
      html = `
        <div style="font-family:Inter,sans-serif;min-width:200px;color:#f1f5f9">
          <div style="font-size:12px;font-weight:800;color:#06b6d4;margin-bottom:6px;border-bottom:1px solid rgba(6,182,212,0.3);padding-bottom:4px">
            CỌC LÝ TRÌNH CÔNG TRÌNH
          </div>
          <table style="width:100%;font-size:11px;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 0">Ký hiệu mốc:</td><td style="color:#38bdf8;font-weight:800;font-size:13px">${p.name}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Khoảng cách từ gốc:</td><td style="color:#fbbf24;font-weight:700">${p.distMeters} m</td></tr>
          </table>
        </div>
      `
    } else {
      html = `
        <div style="font-family:Inter,sans-serif;min-width:200px;color:#f1f5f9">
          <div style="font-size:12px;font-weight:800;color:${isIsland ? '#f59e0b' : '#22d3ee'};margin-bottom:6px;border-bottom:1px solid rgba(${isIsland ? '245,158,11' : '6,182,212'},0.3);padding-bottom:4px">
            ${name}
          </div>
          <table style="width:100%;font-size:11px;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 0">Phân loại:</td><td style="color:#e2e8f0;font-weight:600">${type}</td></tr>
            ${type === 'Vertex' ? `<tr><td style="color:#94a3b8;padding:2px 0">Tọa độ WGS84:</td><td style="color:#fbbf24;font-family:monospace;font-size:10px">${Number(p.lat).toFixed(6)}, ${Number(p.lng).toFixed(6)}</td></tr>` : ''}
            ${type !== 'Vertex' && !isIsland ? `<tr><td style="color:#94a3b8;padding:2px 0">Bề rộng dải:</td><td style="color:#38bdf8;font-weight:700">${width} m</td></tr>` : ''}
            ${isIsland ? `<tr><td style="color:#94a3b8;padding:2px 0">Kết cấu:</td><td style="color:#fbbf24;font-weight:600">Đảo tam giác / Bó vỉa hè</td></tr>` : ''}
            ${type !== 'Vertex' && !isIsland ? `<tr><td style="color:#94a3b8;padding:2px 0">Vật liệu:</td><td style="color:#34d399;font-weight:600">Bê tông xi măng (#71717a)</td></tr>` : ''}
            ${len ? `<tr><td style="color:#94a3b8;padding:2px 0">Chiều dài:</td><td style="color:#fbbf24;font-weight:700">${len}</td></tr>` : ''}
          </table>
        </div>
      `
    }

    if (popupRef.current) popupRef.current.remove()

    popupRef.current = new maplibregl.Popup({ className: 'maplibre-cad-popup', maxWidth: '340px' })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(mapRef.current)
  }

  /* ── 8. Chuyển đổi góc nhìn 2D / 3D Tilt ───────────────────────── */
  const toggle3DView = () => {
    const map = mapRef.current
    if (!map) return
    const nextIs3D = !is3D
    setIs3D(nextIs3D)

    map.easeTo({
      pitch: nextIs3D ? 55 : 0,
      bearing: nextIs3D ? -25 : 0,
      duration: 1000,
    })
  }

  /* ── 9. Định vị camera về toàn bộ tuyến đường (Focus Road Extent) ─ */
  const handleFitRoad = () => {
    const map = mapRef.current
    if (!map || !cleanGeoJson) {
      toast.error('Chưa có dữ liệu tuyến đường để định vị.')
      return
    }
    const bounds = computeGeoJsonBounds(cleanGeoJson)
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 90, bottom: 90, left: 90, right: 90 },
        pitch: is3D ? 52 : 0,
        bearing: is3D ? -24 : 0,
        duration: 1100,
        maxZoom: 16.5,
      })
      toast.success('Đã định vị camera về toàn bộ tuyến đường!')
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: '#0a0f1e' }}>
      {/* ── MapLibre WebGL Canvas Container ─────────────────────── */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* ── 3D View & Focus Controls Toolbar (Floating Top Right) ── */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {/* Nút Định vị về toàn tuyến (Focus Road Extent) */}
        <button
          type="button"
          onClick={handleFitRoad}
          title="Định vị camera về trung tâm toàn bộ tuyến đường CAD (Focus Road Extent)"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/40 backdrop-blur-md shadow-lg shadow-blue-600/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-95 group"
        >
          <LocateFixed size={15} className="text-cyan-200 group-hover:scale-110 transition-transform animate-pulse" />
          <span>Định vị tuyến</span>
        </button>

        {/* Chuyển đổi góc nhìn 3D / 2D */}
        <button
          type="button"
          onClick={toggle3DView}
          title={is3D ? 'Chuyển sang góc nhìn phẳng 2D (Top-down)' : 'Chuyển sang góc nhìn nghiêng 3D (WebGL Pitch)'}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer select-none border backdrop-blur-md shadow-lg ${
            is3D
              ? 'bg-[#161c2e]/90 border-blue-500/50 text-blue-300 hover:bg-[#1e263d]'
              : 'bg-[#11141c]/90 border-[#232938] text-slate-300 hover:bg-[#1a202c]'
          }`}
        >
          <Rotate3d size={14} className={is3D ? 'text-blue-400' : 'text-slate-400'} />
          <span>{is3D ? 'Góc nhìn 3D' : 'Góc nhìn 2D'}</span>
        </button>
      </div>

      {/* ── Hint when no data loaded yet ─────────────────────────── */}
      {!cleanGeoJson && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-full bg-[#11141c]/90 border border-[#232938] backdrop-blur-md text-xs font-medium text-slate-400 shadow-xl">
          <span>⚡ Bấm "Phân Tích & Dựng Tuyến" để hiển thị dải mặt đường trên bản đồ</span>
        </div>
      )}

      {/* ── MapLibre Popup Dark Glassmorphism Styling ─────────────── */}
      <style>{`
        .maplibre-cad-popup .maplibregl-popup-content {
          background: rgba(10,15,30,0.96) !important;
          border: 1px solid rgba(6,182,212,0.35) !important;
          border-radius: 14px !important;
          box-shadow: 0 20px 50px rgba(0,0,0,0.85) !important;
          backdrop-filter: blur(20px) !important;
          padding: 14px 16px !important;
        }
        .maplibre-cad-popup .maplibregl-popup-tip {
          border-top-color: rgba(10,15,30,0.96) !important;
        }
        .maplibre-cad-popup .maplibregl-popup-close-button {
          color: #94a3b8 !important;
          font-size: 18px !important;
          top: 8px !important;
          right: 10px !important;
        }
        .maplibre-cad-popup .maplibregl-popup-close-button:hover {
          color: #22d3ee !important;
        }
        .maplibregl-ctrl-group {
          background: rgba(15,23,42,0.9) !important;
          border: 1px solid rgba(51,65,85,0.8) !important;
          border-radius: 12px !important;
          backdrop-filter: blur(12px) !important;
          box-shadow: 0 10px 30px rgba(0,0,0,0.6) !important;
        }
        .maplibregl-ctrl-group button {
          border-color: rgba(51,65,85,0.6) !important;
        }
        .maplibregl-ctrl-group button:hover {
          background: rgba(6,182,212,0.15) !important;
        }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon {
          filter: invert(1) hue-rotate(180deg);
        }
        .maplibregl-ctrl-scale {
          background: rgba(10,15,30,0.85) !important;
          color: #94a3b8 !important;
          border-color: rgba(6,182,212,0.4) !important;
          font-family: monospace !important;
          font-size: 10px !important;
          backdrop-filter: blur(8px) !important;
        }
      `}</style>
    </div>
  )
}