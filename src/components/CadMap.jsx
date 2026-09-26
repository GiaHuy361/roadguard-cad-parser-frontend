import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Layers, Box, Eye, EyeOff, Compass, Maximize2, Rotate3d, Navigation } from 'lucide-react'

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
  roadParams,
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const popupRef = useRef(null)
  const markersRef = useRef([])
  const [is3D, setIs3D] = useState(true)
  const [mapLoaded, setMapLoaded] = useState(false)

  /* ── 1. Chuẩn hóa dữ liệu GeoJSON sang [lng, lat] & Trích xuất điểm mốc ── */
  const cleanGeoJson = useMemo(() => {
    if (!geoJsonData?.features) return null

    const processedFeatures = []

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

      // Nếu là Tim đường (Centerline), trích xuất các điểm mốc (Vertices) để hiển thị cọc mốc
      const isCenterline = f.properties?.type === 'Centerline' ||
                           f.properties?.layer === 'TIM_TUYEN_CHINH' ||
                           (f.properties?.layer && f.properties.layer.toLowerCase().includes('tim'))

      if (isCenterline && cleanedGeom.type === 'LineString' && Array.isArray(cleanedGeom.coordinates)) {
        cleanedGeom.coordinates.forEach((pt, idx) => {
          processedFeatures.push({
            type: 'Feature',
            id: `vertex-pt-${idx}`,
            properties: {
              type: 'Vertex',
              index: idx,
              lng: pt[0],
              lat: pt[1],
              name: `Điểm cọc mốc P${idx + 1}`,
            },
            geometry: {
              type: 'Point',
              coordinates: pt,
            },
          })
        })
      }
    })

    // Sắp xếp thứ tự hình học: Polygon dưới cùng, LineString ở giữa, Point trên cùng
    processedFeatures.sort((a, b) => {
      const getPriority = (feature) => {
        const t = feature.geometry?.type
        if (t === 'Polygon' || t === 'MultiPolygon') return 1
        if (t === 'LineString' || t === 'MultiLineString') return 2
        if (t === 'Point') return 3
        return 4
      }
      return getPriority(a) - getPriority(b)
    })

    return {
      type: 'FeatureCollection',
      features: processedFeatures,
    }
  }, [geoJsonData])

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
      'cad-layer-vertices',
      'cad-layer-centerline',
      'cad-layer-centerline-casing',
      'cad-layer-generic-lines',
      'cad-layer-edges',
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
      filter: ['any',
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon'],
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
      filter: ['any',
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon'],
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

    // 4.4 LAYER: Các nét CAD kỹ thuật khác (Generic LineStrings - không phải tim đường hay mép)
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

    // 4.5 LAYER: Viền bóng tương phản cho tim đường (Casing - giúp tim vàng luôn nổi bật 100%)
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

    // 4.7 LAYER: Các điểm cọc mốc tim tuyến (Vertices Points)
    map.addLayer({
      id: 'cad-layer-vertices',
      type: 'circle',
      source: sourceId,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        visibility: showVertices ? 'visible' : 'none',
      },
      paint: {
        'circle-radius': 5.0,
        'circle-color': '#F59E0B',
        'circle-stroke-width': 2.0,
        'circle-stroke-color': '#FFFFFF',
      },
    })

    // 4.8 Interactive Click Popup
    map.on('click', 'cad-layer-surface-fill', handleFeatureClick)
    map.on('click', 'cad-layer-centerline', handleFeatureClick)
    map.on('click', 'cad-layer-vertices', handleFeatureClick)

    // Cursor pointer on hover
    ;['cad-layer-surface-fill', 'cad-layer-centerline', 'cad-layer-vertices'].forEach(layerId => {
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
    })
  }, [showRoadSurface, showEdges, showCenterline, showVertices])

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
            padding: { top: 80, bottom: 80, left: 80, right: 80 },
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
    setVisibility('cad-layer-edges', showEdges)
    setVisibility('cad-layer-generic-lines', showEdges)
    setVisibility('cad-layer-centerline-casing', showCenterline)
    setVisibility('cad-layer-centerline', showCenterline)
    setVisibility('cad-layer-vertices', showVertices)
  }, [showRoadSurface, showEdges, showCenterline, showVertices, mapLoaded])

  /* ── 7. Xử lý Popup khi Click vào đối tượng tuyến đường ───────── */
  const handleFeatureClick = (e) => {
    const feature = e.features?.[0]
    if (!feature) return
    const p = feature.properties || {}
    const name = p.name || 'Tuyến Thiết Kế'
    const type = p.type || 'Hạ tầng giao thông'
    const width = p.roadWidth || roadParams?.roadWidth || 7.0
    const len = p.totalLength ? `${Number(p.totalLength).toFixed(1)} m` : null

    let html = `
      <div style="font-family:Inter,sans-serif;min-width:200px;color:#f1f5f9">
        <div style="font-size:12px;font-weight:800;color:#22d3ee;margin-bottom:6px;border-bottom:1px solid rgba(6,182,212,0.3);padding-bottom:4px">
          ${name}
        </div>
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <tr><td style="color:#94a3b8;padding:2px 0">Phân loại:</td><td style="color:#e2e8f0;font-weight:600">${type}</td></tr>
          ${type === 'Vertex' ? `<tr><td style="color:#94a3b8;padding:2px 0">Tọa độ WGS84:</td><td style="color:#fbbf24;font-family:monospace;font-size:10px">${Number(p.lat).toFixed(6)}, ${Number(p.lng).toFixed(6)}</td></tr>` : ''}
          ${type !== 'Vertex' ? `<tr><td style="color:#94a3b8;padding:2px 0">Bề rộng dải:</td><td style="color:#38bdf8;font-weight:700">${width} m</td></tr>` : ''}
          ${type !== 'Vertex' ? `<tr><td style="color:#94a3b8;padding:2px 0">Vật liệu:</td><td style="color:#34d399;font-weight:600">Bê tông xi măng (#71717a)</td></tr>` : ''}
          ${len ? `<tr><td style="color:#94a3b8;padding:2px 0">Chiều dài:</td><td style="color:#fbbf24;font-weight:700">${len}</td></tr>` : ''}
        </table>
      </div>
    `

    if (popupRef.current) popupRef.current.remove()

    popupRef.current = new maplibregl.Popup({ className: 'maplibre-cad-popup', maxWidth: '320px' })
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

  /* ── 9. Căn giữa toàn tuyến (Fit View) ─────────────────────────── */
  const handleFitRoad = () => {
    const map = mapRef.current
    if (!map || !cleanGeoJson) return
    const bounds = computeGeoJsonBounds(cleanGeoJson)
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 80, right: 80 },
        pitch: is3D ? 52 : 0,
        bearing: is3D ? -24 : 0,
        duration: 900,
        maxZoom: 16,
      })
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: '#0a0f1e' }}>
      {/* ── MapLibre WebGL Canvas Container ─────────────────────── */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* ── 3D View Floating Controls Toolbar ───────────────────── */}
      <div className="absolute top-20 right-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={toggle3DView}
          title={is3D ? 'Chuyển sang góc nhìn phẳng 2D (Top-down)' : 'Chuyển sang góc nhìn nghiêng 3D (WebGL Pitch)'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-2xl cursor-pointer"
          style={{
            background: is3D ? 'linear-gradient(135deg, #0e7490, #0284c7)' : 'rgba(15,23,42,0.9)',
            border: is3D ? '1px solid #22d3ee' : '1px solid rgba(51,65,85,0.8)',
            color: '#fff',
            backdropFilter: 'blur(12px)',
            boxShadow: is3D ? '0 0 20px rgba(6,182,212,0.4)' : '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <Rotate3d size={15} className={is3D ? 'text-cyan-300' : 'text-slate-400'} />
          <span>{is3D ? 'Góc Nhìn 3D (55°)' : 'Góc Nhìn 2D'}</span>
        </button>

        <button
          type="button"
          onClick={handleFitRoad}
          title="Căn giữa toàn bộ tuyến đường trên bản đồ"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-xl cursor-pointer"
          style={{
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid rgba(51,65,85,0.8)',
            color: '#94a3b8',
            backdropFilter: 'blur(12px)',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#22d3ee'; e.currentTarget.style.borderColor = '#0891b2' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(51,65,85,0.8)' }}
        >
          <Maximize2 size={14} />
          <span>Toàn Tuyến</span>
        </button>
      </div>

      {/* ── Hint when no data loaded yet ─────────────────────────── */}
      {!cleanGeoJson && (
        <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 99, background: 'rgba(10,15,30,0.85)', border: '1px solid rgba(6,182,212,0.3)', backdropFilter: 'blur(12px)', fontFamily: 'Inter,sans-serif' }}>
          <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600, whiteSpace: 'nowrap' }}>
            ⚡ Bấm nút "PARSE & VISUALIZE" ở thanh bên để hiển thị dải mặt đường bê tông 2D trên MapLibre GL
          </span>
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