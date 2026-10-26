import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Layers, Box, Eye, EyeOff, Compass, Maximize2, Rotate3d, Navigation, LocateFixed, Radio, CheckCircle2, Sliders } from 'lucide-react'
import toast from 'react-hot-toast'

// Production only: the default worker URL breaks after bundling (see scripts/copy-maplibre-worker.mjs).
// In dev (`vite`) MapLibre resolves its worker correctly on its own.
if (import.meta.env.PROD) {
  maplibregl.setWorkerUrl(
    new URL(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`, window.location.origin).href
  )
}

/* ── Base Map Style Definitions for MapLibre GL ────────────────── */
// map.isStyleLoaded() also returns false while raster tiles are still downloading, which made
// the CAD layers silently skip drawing on slower connections (e.g. the deployed site).
// Layers can be added as soon as the style JSON itself is available.
const isStyleReady = (map) => {
  try { return !!(map && map.getStyle()) } catch { return false }
}

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

import {
  toLngLat,
  enrichGeoJsonWithEngineeringFeatures,
} from '../utils/roadEngineeringBuilder'

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
  customCadFeatures = [],
  roadParams,
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const popupRef = useRef(null)
  const lastFocusedTimestampRef = useRef(null)
  const lastFittedGeoJsonRef = useRef(null)
  const [is3D, setIs3D] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)

  /* ── 1. Chuẩn hóa dữ liệu GeoJSON sang [lng, lat] & Nội suy Tấm BTXM / Cọc (Single Source of Truth) ── */
  const { cleanGeoJson, segmentBoundsMap } = useMemo(() => {
    const hasCore = Array.isArray(geoJsonData?.features) && geoJsonData.features.length > 0
    const hasCustom = Array.isArray(customCadFeatures) && customCadFeatures.length > 0
    if (!hasCore && !hasCustom) return { cleanGeoJson: null, segmentBoundsMap: {} }

    const { enrichedGeoJson, segmentBoundsMap: boundsMap } = enrichGeoJsonWithEngineeringFeatures(
      geoJsonData || { type: 'FeatureCollection', features: [] },
      roadParams,
      customCadFeatures,
      completedSegments
    )
    return {
      cleanGeoJson: enrichedGeoJson,
      segmentBoundsMap: boundsMap || {},
    }
  }, [geoJsonData, customCadFeatures, roadParams, completedSegments])

  /* ── 2. Khởi tạo MapLibre GL Map Instance ─────────────────────── */
  useEffect(() => {
    if (!mapContainerRef.current) return

    const initialStyle = MAP_STYLES[mapStyle] || MAP_STYLES.satellite

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: [105.8528, 10.8879],
      zoom: 15,
      pitch: 0,         // Mặc định góc nhìn phẳng 2D trực diện để tuyến đường nổi bật rõ nhất
      bearing: 0,
      antialias: true,
      maxPitch: 85,
    })

    // Bổ sung các công cụ điều hướng 3D, la bàn, thước tỉ lệ
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      mapRef.current = map
      setMapLoaded(true)
      map.resize()
    })

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      const w = entry?.contentRect?.width || mapContainerRef.current?.clientWidth || 0
      const h = entry?.contentRect?.height || mapContainerRef.current?.clientHeight || 0
      if (mapRef.current && w > 0 && h > 0) {
        mapRef.current.resize()
      }
    })
    ro.observe(mapContainerRef.current)

    return () => {
      ro.disconnect()
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
    if (!isStyleReady(map)) return

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
      'cad-layer-custom-points',
      'cad-layer-drone-focused',
      'cad-layer-drone-focused-casing',
      'cad-layer-slab-labels',
      'cad-layer-expansion-joints',
      'cad-layer-contraction-joints',
      'cad-layer-vertices',
      'cad-layer-centerline',
      'cad-layer-centerline-casing',
      'cad-layer-drone-completed',
      'cad-layer-custom-lines',
      'cad-layer-custom-fills',
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
        'line-width': 2.5,            // Bề dày chuẩn 2.5px nổi bật trên ảnh vệ tinh
        'line-opacity': 0.98,
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

    // 4.3B LAYER: Custom CAD Layers - Fills (Đa giác phân lô, nhà dân, hồ chứa...)
    map.addLayer({
      id: 'cad-layer-custom-fills',
      type: 'fill',
      source: sourceId,
      filter: ['all',
        ['any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
        ],
        ['==', ['get', 'isCustomCadLayer'], true],
      ],
      paint: {
        'fill-color': [
          'match',
          ['coalesce', ['get', 'category'], 'Other'],
          'Building', '#c084fc',
          'Drainage', '#06b6d4',
          'Sidewalk', '#10b981',
          '#94a3b8'
        ],
        'fill-opacity': 0.22,
      },
    })

    // 4.3C LAYER: Custom CAD Layers - Lines (Nét vẽ hạ tầng chuyên ngành kỹ thuật)
    map.addLayer({
      id: 'cad-layer-custom-lines',
      type: 'line',
      source: sourceId,
      filter: ['all',
        ['any',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'MultiLineString'],
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
        ],
        ['==', ['get', 'isCustomCadLayer'], true],
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': [
          'match',
          ['coalesce', ['get', 'category'], 'Other'],
          'Building', '#c084fc',      // Tím hồng cho kiến trúc / nhà dân
          'Drainage', '#06b6d4',      // Cyan cho thoát nước & cống
          'RoadNetwork', '#f59e0b',   // Vàng hổ phách cho tim đường
          'RoadEdge', '#e2e8f0',      // Trắng bạc cho mép đường
          'LeftEdge', '#e2e8f0',
          'Sidewalk', '#10b981',      // Xanh mint cho vỉa hè
          'Survey', '#f43f5e',        // Hồng đỏ cho mốc trắc địa
          '#94a3b8'                   // Xám cho các nét CAD khác
        ],
        'line-width': [
          'match',
          ['coalesce', ['get', 'category'], 'Other'],
          'Building', 2.0,
          'Drainage', 2.2,
          'RoadNetwork', 2.5,
          1.8
        ],
        'line-opacity': 0.9,
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
        ['!=', ['get', 'type'], 'DroneSegment'],
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
      ['!=', ['get', 'type'], 'DroneSegment'],
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

    // 4.7C LAYER: Phân đoạn Drone đang được chọn / lia tới (Active Focused Segment - Nổi bật trên mặt đường)
    map.addLayer({
      id: 'cad-layer-drone-focused-casing',
      type: 'line',
      source: sourceId,
      filter: ['all', ['==', ['get', 'type'], 'DroneSegment'], ['==', ['get', 'segmentId'], focusedSegment?.id || '']],
      layout: {
        visibility: 'visible',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#0284c7',      // Xanh dương đậm viền ngoài nổi bật
        'line-width': 14.0,
        'line-opacity': 0.75,
      },
    })

    map.addLayer({
      id: 'cad-layer-drone-focused',
      type: 'line',
      source: sourceId,
      filter: ['all', ['==', ['get', 'type'], 'DroneSegment'], ['==', ['get', 'segmentId'], focusedSegment?.id || '']],
      layout: {
        visibility: 'visible',
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#00f0ff',      // Neon Cyan rực sáng báo hiệu đang chọn phân đoạn này
        'line-width': 7.0,
        'line-opacity': 1.0,
      },
    })

    // 4.7D LAYER: Nhãn mã tấm BTXM (S-001, S-002... minzoom 18.0)
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
        'circle-radius': 6.0,
        'circle-color': '#06b6d4',     // Cyan nổi bật
        'circle-stroke-width': 2.2,
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
        'text-size': 12,
        'text-offset': [0, -1.7],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#7dd3fc',
        'text-halo-color': '#0b1220',
        'text-halo-width': 2.4,
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

    // 4.7G LAYER: Custom CAD Layers - Points (Cọc mốc, cây xanh, chiếu sáng...)
    map.addLayer({
      id: 'cad-layer-custom-points',
      type: 'circle',
      source: sourceId,
      filter: ['all',
        ['==', ['geometry-type'], 'Point'],
        ['==', ['get', 'isCustomCadLayer'], true],
      ],
      paint: {
        'circle-radius': 4.5,
        'circle-color': [
          'match',
          ['coalesce', ['get', 'category'], 'Other'],
          'Building', '#c084fc',
          'Drainage', '#06b6d4',
          'RoadNetwork', '#f59e0b',
          'Survey', '#f43f5e',
          '#38bdf8'
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
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
      'cad-layer-custom-lines',
      'cad-layer-custom-fills',
      'cad-layer-custom-points',
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
      if (!isStyleReady(map)) {
        map.once('style.load', applyData)
        return
      }

      setupCadLayers(map, cleanGeoJson)

      // Chỉ fitBounds khi nạp dữ liệu CAD mới lần đầu hoặc đổi file, không fitBounds khi đổi checkbox
      if (cleanGeoJson && geoJsonData && geoJsonData !== lastFittedGeoJsonRef.current) {
        const w = mapContainerRef.current?.clientWidth || 0
        const h = mapContainerRef.current?.clientHeight || 0
        if (w > 0 && h > 0) {
          lastFittedGeoJsonRef.current = geoJsonData
          map.resize()
          const bounds = computeGeoJsonBounds(cleanGeoJson)
          if (bounds) {
            map.fitBounds(bounds, {
              padding: { top: 80, bottom: 80, left: 80, right: 80 },
              pitch: is3D ? 50 : 0,
              bearing: is3D ? -20 : 0,
              duration: 600,
              maxZoom: 16.5,
            })
          }
        }
      }
    }

    applyData()
  }, [cleanGeoJson, mapLoaded, setupCadLayers, geoJsonData])

  /* ── 5.2 Lắng nghe sự kiện lia camera đến phân đoạn Drone (Focus Segment) ─ */
  useEffect(() => {
    if (!focusedSegment || !mapRef.current || !mapLoaded) return
    // CHỈ kích hoạt khi người dùng chủ động bấm nút "Lia tới" mới (timestamp thay đổi)
    if (!focusedSegment.timestamp || focusedSegment.timestamp === lastFocusedTimestampRef.current) return
    lastFocusedTimestampRef.current = focusedSegment.timestamp

    const map = mapRef.current
    let bounds = segmentBoundsMap[focusedSegment.id]
    if (!bounds && cleanGeoJson?.features) {
      const segFeatures = cleanGeoJson.features.filter(
        f => f.properties?.segment === focusedSegment.id || f.properties?.id === focusedSegment.id || f.properties?.segmentId === focusedSegment.id
      )
      if (segFeatures.length > 0) {
        bounds = computeGeoJsonBounds({ type: 'FeatureCollection', features: segFeatures })
      }
    }

    // Cập nhật lớp highlight dải phân đoạn trên bản đồ
    const segFilter = ['all', ['==', ['get', 'type'], 'DroneSegment'], ['==', ['get', 'segmentId'], focusedSegment.id]]
    if (map.getLayer('cad-layer-drone-focused')) {
      map.setFilter('cad-layer-drone-focused', segFilter)
    }
    if (map.getLayer('cad-layer-drone-focused-casing')) {
      map.setFilter('cad-layer-drone-focused-casing', segFilter)
    }

    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 100, bottom: 100, left: 100, right: 100 },
        pitch: is3D ? 55 : 0,
        bearing: is3D ? -24 : 0,
        duration: 850,
        maxZoom: 18,
      })
      const rangeText = focusedSegment.range || `${focusedSegment.startM ?? 0}m - ${focusedSegment.endM ?? 100}m`
      toast.success(`Đang lia camera đến phân đoạn ${focusedSegment.id} (${rangeText})`, {
        id: 'drone-focus-segment-toast',
      })

      // Mở Popup thông tin trực tiếp trên bản đồ tại tâm phân đoạn
      if (popupRef.current) popupRef.current.remove()
      const midLng = (bounds[0][0] + bounds[1][0]) / 2
      const midLat = (bounds[0][1] + bounds[1][1]) / 2
      const isDone = completedSegments && completedSegments.includes(focusedSegment.id)
      popupRef.current = new maplibregl.Popup({
        className: 'maplibre-cad-popup',
        closeButton: true,
        closeOnClick: false,
        offset: [0, -18],
      })
        .setLngLat([midLng, midLat])
        .setHTML(`
          <div style="font-family: Inter, sans-serif; color: #f8fafc; min-width: 175px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 5px;">
              <span style="font-weight: 800; font-size: 13px; color: #38bdf8;">${focusedSegment.id}</span>
              <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">Phân đoạn</span>
            </div>
            <div style="font-size: 12px; color: #cbd5e1; display: flex; flex-direction: column; gap: 3px;">
              <div>Lý trình: <strong style="color: #ffffff;">${rangeText}</strong></div>
              <div>Chiều dài: <strong style="color: #38bdf8;">${focusedSegment.length || 100}m</strong></div>
              <div>Trạng thái: <strong style="color: ${isDone ? '#34d399' : '#fbbf24'};">${isDone ? '✓ Đã hoàn thành' : 'Chưa hoàn thành'}</strong></div>
            </div>
          </div>
        `)
        .addTo(map)
    } else {
      toast(`Phân đoạn ${focusedSegment.id} chưa có dữ liệu tọa độ`, {
        id: 'drone-focus-segment-toast',
        icon: '⚠️',
      })
    }
  }, [focusedSegment?.timestamp, segmentBoundsMap, mapLoaded, is3D])

  /* ── 6. Cập nhật trạng thái hiển thị của các Layers (Toggles) ──── */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !isStyleReady(map)) return

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
          <div style="font-size:13px;font-weight:700;color:#38bdf8;margin-bottom:6px;border-bottom:1px solid #27384e;padding-bottom:4px;display:flex;align-items:center;justify-content:space-between">
            <span>TẤM BÊ TÔNG ${p.code}</span>
            <span style="font-size:11px;color:#39b58a;font-weight:600">TCVN</span>
          </div>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 0">Lý trình:</td><td style="color:#fbbf24;font-weight:700">${p.chainage}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Phân đoạn:</td><td style="color:#38bdf8;font-weight:700">${p.segment}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Kích thước tấm:</td><td style="color:#e2e8f0;font-weight:600">${p.dimensions}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Quy chuẩn:</td><td style="color:#cbd5e1">TCVN 10380:2014</td></tr>
          </table>
        </div>
      `
    } else if (isJoint) {
      const isExp = p.type === 'ExpansionJoint'
      html = `
        <div style="font-family:Inter,sans-serif;min-width:210px;color:#f1f5f9">
          <div style="font-size:12.5px;font-weight:700;color:${isExp ? '#f97316' : '#67e8f9'};margin-bottom:6px;border-bottom:1px solid #27384e;padding-bottom:4px">
            ${isExp ? 'KHE CO GIÃN NHIỆT (EXPANSION)' : 'KHE CO / KHE UỐN (CONTRACTION)'}
          </div>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 0">Lý trình:</td><td style="color:#fbbf24;font-weight:700">${p.chainage}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Kết cấu:</td><td style="color:#e2e8f0;font-weight:600">${isExp ? 'Chèn xốp bitum 20mm + thanh truyền lực' : 'Cắt ron 5mm + keo trám silicon'}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Khoảng cách:</td><td style="color:#34d399;font-weight:600">${isExp ? 'Định kỳ 100m' : 'Mỗi tấm 4.0m'}</td></tr>
          </table>
        </div>
      `
    } else if (isStation) {
      html = `
        <div style="font-family:Inter,sans-serif;min-width:200px;color:#f1f5f9">
          <div style="font-size:12.5px;font-weight:700;color:#06b6d4;margin-bottom:6px;border-bottom:1px solid #27384e;padding-bottom:4px">
            CỌC LÝ TRÌNH CÔNG TRÌNH
          </div>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 0">Ký hiệu mốc:</td><td style="color:#38bdf8;font-weight:700;font-size:13px">${p.name}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Khoảng cách từ gốc:</td><td style="color:#fbbf24;font-weight:700">${p.distMeters} m</td></tr>
          </table>
        </div>
      `
    } else if (p.isCustomCadLayer || (p.layer && !p.type)) {
      const cat = p.category || 'CAD Layer'
      const catColor = cat === 'Building' ? '#c084fc' : cat === 'Drainage' ? '#06b6d4' : cat === 'RoadNetwork' ? '#f59e0b' : '#38bdf8'
      html = `
        <div style="font-family:Inter,sans-serif;min-width:220px;color:#f1f5f9">
          <div style="font-size:12.5px;font-weight:700;color:${catColor};margin-bottom:6px;border-bottom:1px solid #27384e;padding-bottom:4px;display:flex;align-items:center;justify-content:space-between">
            <span>LAYER: ${p.layer}</span>
            <span style="font-size:11px;color:#cbd5e1;font-weight:600">${cat}</span>
          </div>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 0">Đối tượng:</td><td style="color:#f8fafc;font-weight:600">${p.name || p.layer}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 0">Hình học:</td><td style="color:#38bdf8;font-weight:600">${feature.geometry?.type}</td></tr>
            ${p.cadEntity ? `<tr><td style="color:#94a3b8;padding:2px 0">Thực thể CAD:</td><td style="color:#e2e8f0;font-family:monospace;font-size:11.5px">${p.cadEntity}</td></tr>` : ''}
            ${p.elevation ? `<tr><td style="color:#94a3b8;padding:2px 0">Cao độ (Z):</td><td style="color:#fbbf24;font-weight:600">${p.elevation} m</td></tr>` : ''}
            <tr><td style="color:#94a3b8;padding:2px 0">Tọa độ GPS:</td><td style="color:#fbbf24;font-family:monospace;font-size:11.5px">${e.lngLat.lng.toFixed(6)}, ${e.lngLat.lat.toFixed(6)}</td></tr>
          </table>
        </div>
      `
    } else {
      html = `
        <div style="font-family:Inter,sans-serif;min-width:200px;color:#f1f5f9">
          <div style="font-size:12.5px;font-weight:700;color:${isIsland ? '#f59e0b' : '#22d3ee'};margin-bottom:6px;border-bottom:1px solid #27384e;padding-bottom:4px">
            ${name}
          </div>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 0">Phân loại:</td><td style="color:#e2e8f0;font-weight:600">${type}</td></tr>
            ${type === 'Vertex' ? `<tr><td style="color:#94a3b8;padding:2px 0">Tọa độ WGS84:</td><td style="color:#fbbf24;font-family:monospace;font-size:11.5px">${Number(p.lat).toFixed(6)}, ${Number(p.lng).toFixed(6)}</td></tr>` : ''}
            ${type !== 'Vertex' && !isIsland ? `<tr><td style="color:#94a3b8;padding:2px 0">Bề rộng dải:</td><td style="color:#38bdf8;font-weight:700">${width} m</td></tr>` : ''}
            ${isIsland ? `<tr><td style="color:#94a3b8;padding:2px 0">Kết cấu:</td><td style="color:#fbbf24;font-weight:600">Đảo tam giác / Bó vỉa hè</td></tr>` : ''}
            ${type !== 'Vertex' && !isIsland ? `<tr><td style="color:#94a3b8;padding:2px 0">Vật liệu:</td><td style="color:#34d399;font-weight:600">Bê tông xi măng</td></tr>` : ''}
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
      pitch: nextIs3D ? 52 : 0,
      bearing: nextIs3D ? -20 : 0,
      duration: 850,
    })
  }

  /* ── 9. Định vị camera về toàn bộ tuyến đường (Focus Road Extent) ─ */
  const handleFitRoad = () => {
    const map = mapRef.current
    if (!map || !cleanGeoJson) {
      toast.error('Chưa có dữ liệu tuyến đường để định vị.')
      return
    }
    map.resize()
    const bounds = computeGeoJsonBounds(cleanGeoJson)
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 80, right: 80 },
        pitch: is3D ? 50 : 0,
        bearing: is3D ? -20 : 0,
        duration: 600,
        maxZoom: 16.5,
      })
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0B1220]">
      {/* ── MapLibre WebGL Canvas Container ─────────────────────── */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* ── 3D View & Focus Controls Toolbar (Clear of MapLibre NavControl) ── */}
      <div className="absolute top-3 right-14 z-10 flex items-center gap-2">
        {/* Nút Định vị về toàn tuyến (Focus Road Extent) */}
        <button
          type="button"
          onClick={handleFitRoad}
          title="Định vị camera về trung tâm toàn bộ tuyến đường"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors cursor-pointer select-none bg-[#F06421] hover:bg-[#FF7635] text-white border border-[#F06421] shadow-md"
        >
          <LocateFixed size={15} className="text-white" />
          <span>Định vị tuyến</span>
        </button>

        {/* Chuyển đổi góc nhìn 3D / 2D */}
        <button
          type="button"
          onClick={toggle3DView}
          title={is3D ? 'Chuyển sang góc nhìn phẳng 2D (Top-down)' : 'Chuyển sang góc nhìn nghiêng 3D (WebGL Pitch)'}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors cursor-pointer select-none border shadow-md ${
            is3D
              ? 'bg-[#17263C] border-[#22B7C9] text-[#E8EEF6]'
              : 'bg-[#111D2E] border-[#27384E] text-[#E8EEF6] hover:bg-[#17263C]'
          }`}
        >
          <Rotate3d size={15} className={is3D ? 'text-[#22B7C9]' : 'text-[#A9B9CE]'} />
          <span>{is3D ? 'Chế độ 3D' : 'Chế độ 2D'}</span>
        </button>
      </div>

      {/* ── Hint when no data loaded yet ─────────────────────────── */}
      {!cleanGeoJson && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-2.5 px-4 py-2 rounded-md bg-[#111D2E] border border-[#27384E] text-[13px] font-medium text-[#A9B9CE] shadow-lg">
          <span className="w-2 h-2 rounded-full bg-[#F06421]" />
          <span>Nạp bản vẽ CAD hoặc tọa độ VN-2000 và bấm <strong className="text-[#E8EEF6]">Phân Tích &amp; Dựng Tuyến</strong> để hiển thị hành lang tuyến</span>
        </div>
      )}

      {/* ── MapLibre Popup Commercial CAD/GIS Styling ─────────────── */}
      <style>{`
        .maplibre-cad-popup .maplibregl-popup-content {
          background: #111D2E !important;
          border: 1px solid #27384E !important;
          border-radius: 8px !important;
          box-shadow: 0 12px 32px rgba(0,0,0,0.75) !important;
          padding: 12px 14px !important;
        }
        .maplibre-cad-popup .maplibregl-popup-tip {
          border-top-color: #111D2E !important;
        }
        .maplibre-cad-popup .maplibregl-popup-close-button {
          color: #94a3b8 !important;
          font-size: 16px !important;
          top: 6px !important;
          right: 8px !important;
        }
        .maplibre-cad-popup .maplibregl-popup-close-button:hover {
          color: #e8eef6 !important;
        }
        .maplibregl-ctrl-group {
          background: #111D2E !important;
          border: 1px solid #27384E !important;
          border-radius: 6px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
        }
        .maplibregl-ctrl-group button {
          border-color: #27384E !important;
        }
        .maplibregl-ctrl-group button:hover {
          background: #17263C !important;
        }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon {
          filter: invert(1) hue-rotate(180deg);
        }
        .maplibregl-ctrl-scale {
          background: #111D2E !important;
          color: #e8eef6 !important;
          border-color: #27384E !important;
          font-family: monospace !important;
          font-size: 11px !important;
          padding: 1px 6px !important;
        }
      `}</style>
    </div>
  )
}