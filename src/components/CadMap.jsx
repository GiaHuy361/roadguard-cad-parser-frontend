import { useEffect, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })


// --- Layer-type-aware style function ---
function getFeatureStyle(feature) {
  const layerType = feature?.properties?.layerType
  if (layerType === 'RoadSurface') {
    const mat = feature?.properties?.material?.toLowerCase()
    const isAsphalt = mat === 'asphalt' || feature?.properties?.layerName === 'ROAD_SURFACE_2D'
    return {
      color: isAsphalt ? '#475569' : '#64748b',       // Curb / shoulder edge border
      weight: 1.5,
      fillColor: isAsphalt ? '#334155' : '#94a3b8',   // Realistic asphalt (#334155) / concrete (#94a3b8)
      fillOpacity: 0.85,                              // Continuous filled solid road material
      lineCap: 'round',
      lineJoin: 'round',
    }
  }
  if (layerType === 'Centerline') {
    return {
      color: '#FBBF24',       // Yellow color for center lane
      weight: 3,
      dashArray: '10, 10',    // Dashed line style
      fillOpacity: 1,
      lineCap: 'round',
    }
  }
  if (layerType === 'Edge' || layerType === 'Edges') {
    return {
      color: '#FFFFFF',
      weight: 1.5,
      opacity: 0.9,
      dashArray: '4, 4',
      fillOpacity: 0,
    }
  }
  return {
    color: '#06b6d4',
    weight: 2.5,
    opacity: 0.9,
    fillColor: '#06b6d4',
    fillOpacity: 0.1,
  }
}

function getHoverStyle(feature) {
  const layerType = feature?.properties?.layerType
  if (layerType === 'RoadSurface') {
    return {
      fillColor: '#CBD5E1',
      fillOpacity: 0.9,
      color: '#334155',
      weight: 2,
    }
  }
  if (layerType === 'Centerline') {
    return {
      color: '#FDE047',
      weight: 4,
    }
  }
  if (layerType === 'Edge' || layerType === 'Edges') {
    return {
      color: '#FFFFFF',
      weight: 2.5,
    }
  }
  return {
    color: '#67e8f9',
    weight: 3.5,
    opacity: 1,
    fillOpacity: 0.2,
  }
}

// --- Check if a feature should be visible based on layer toggles ---
function isFeatureVisible(feature, showCenterline, showRoadSurface, showEdges, showStations) {
  const lt = feature?.properties?.layerType
  if (lt === 'RoadSurface') return showRoadSurface
  if (lt === 'Centerline')  return showCenterline
  if (lt === 'Edge' || lt === 'Edges') return showEdges
  if (lt === 'StationPoint') return showStations
  return true // unknown layerType always shown
}

// --- Point to Layer for StationPoint and other points ---
function pointToLayer(feature, latlng) {
  const layerType = feature?.properties?.layerType
  if (layerType === 'StationPoint') {
    const stationName = feature.properties?.stationName ?? 'Km'
    const distance = feature.properties?.distance != null ? feature.properties.distance : 0

    const html = `
      <div class="station-marker" style="position: relative; display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
        <div class="text-[10px] text-cyan-300 bg-slate-900/80 px-1.5 py-0.5 rounded border border-cyan-800/50 whitespace-nowrap" style="transform: translate(-50%, -100%); position: absolute; top: -5px; left: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.6); backdrop-filter: blur(4px);">
          ${stationName} (${distance}m)
        </div>
        <div style="width: 6px; height: 6px; border-radius: 50%; background: #22d3ee; border: 1.5px solid #0f172a; box-shadow: 0 0 6px #06b6d4; transform: translate(-50%, -50%); position: absolute; top: 0; left: 0;"></div>
      </div>
    `

    return L.marker(latlng, {
      icon: L.divIcon({
        className: 'station-div-icon',
        html: html,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    })
  }

  return L.circleMarker(latlng, { radius: 3, color: '#06b6d4' })
}

function extractVertices(geoJsonData) {
  const pts = []
  const walk = (geom) => {
    if (!geom || !geom.coordinates) return
    if (geom.type === 'Point') { pts.push(geom.coordinates); return }
    if (geom.type === 'LineString' || geom.type === 'MultiPoint') { geom.coordinates.forEach(p => pts.push(p)); return }
    if (geom.type === 'Polygon' || geom.type === 'MultiLineString') { geom.coordinates.forEach(r => r.forEach(p => pts.push(p))); return }
    if (geom.type === 'MultiPolygon') { geom.coordinates.forEach(poly => poly.forEach(r => r.forEach(p => pts.push(p)))) }
  }
  ;(geoJsonData?.features ?? []).forEach(f => walk(f.geometry))
  return pts
}

function buildPopup(props) {
  const entries = Object.entries(props ?? {}).filter(([, v]) => v != null && v !== '')
  if (!entries.length) return null
  const rows = entries.map(([k, v]) => '<tr><td style="color:#64748b;font-size:11px;padding:3px 10px 3px 0;font-weight:600">' + k + '</td><td style="font-size:11px;color:#e2e8f0">' + v + '</td></tr>').join('')
  return '<div style="font-family:Inter,sans-serif;min-width:180px"><p style="font-size:11px;font-weight:700;color:#06b6d4;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid rgba(6,182,212,0.2);letter-spacing:0.05em;text-transform:uppercase">Feature Properties</p><table>' + rows + '</table></div>'
}


function MapUpdater({ geoJsonData }) {
  const map = useMap()
  useEffect(() => {
    if (!geoJsonData) return
    try {
      const bounds = L.geoJSON(geoJsonData).getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { animate: true, duration: 0.9, easeLinearity: 0.2, padding: [80, 40] })
    } catch (e) { console.warn(e) }
  }, [geoJsonData, map])
  return null
}

function MapHint() {
  return (
    <div style={{ position:'absolute', bottom:40, left:'50%', transform:'translateX(-50%)', zIndex:10, pointerEvents:'none', display:'flex', alignItems:'center', gap:8, padding:'7px 16px', borderRadius:99, background:'rgba(10,15,30,0.72)', border:'1px solid rgba(30,41,59,0.9)', backdropFilter:'blur(8px)', fontFamily:'Inter,sans-serif' }}>
      <span style={{ fontSize:'11px', color:'#334155', fontWeight:500, whiteSpace:'nowrap' }}>Upload a .dxf file from the sidebar to visualise geometry</span>
    </div>
  )
}

export default function CadMap({
  geoJsonData,
  mapStyle = 'dark',
  showGeometry = true,
  showVertices = false,
  showCenterline = true,
  showRoadSurface = true,
  showEdges = true,
  showStations = true,
}) {
  const geoJsonRef = useRef(null)
  const vertices = useMemo(() => (!showVertices || !geoJsonData) ? [] : extractVertices(geoJsonData), [geoJsonData, showVertices])

  // Key that changes when layer toggles change, forcing GeoJSON re-render
  const layerKey = useMemo(() => {
    const count = geoJsonData?.features?.length || 0
    const sample = geoJsonData?.features?.[0]?.geometry?.coordinates?.length || 0
    return `geojson-${count}-${sample}-${showCenterline}-${showRoadSurface}-${showEdges}-${showStations}`
  }, [geoJsonData, showCenterline, showRoadSurface, showEdges, showStations])

  return (
    <div className="relative w-full h-full" style={{ background: '#0a0f1e' }}>
      <MapContainer center={[10.8, 106.7]} zoom={13} className="w-full h-full" style={{ background: '#0a0f1e' }} zoomControl attributionControl>
        {mapStyle === 'satellite' ? (
          <TileLayer
            key="satellite-layer"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
            maxZoom={19}
          />
        ) : (
          <TileLayer
            key="osm-layer"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
        )}

        {geoJsonData && showGeometry && (
          <GeoJSON
            ref={geoJsonRef}
            key={layerKey}
            data={geoJsonData}
            filter={(feature) => isFeatureVisible(feature, showCenterline, showRoadSurface, showEdges, showStations)}
            style={(feature) => getFeatureStyle(feature)}
            pointToLayer={(feature, latlng) => pointToLayer(feature, latlng)}
            onEachFeature={(feature, layer) => {
              layer.on({
                mouseover: e => {
                  e.target.setStyle?.(getHoverStyle(feature))
                  e.target.bringToFront?.()
                },
                mouseout: e => {
                  e.target.setStyle?.(getFeatureStyle(feature))
                },
              })
              const popup = buildPopup(feature.properties)
              if (popup) layer.bindPopup(popup, { maxWidth: 300, className: 'rg-popup' })
            }}
          />
        )}

        {geoJsonData && showVertices && vertices.map((pos, i) => (
          <CircleMarker key={'v-' + i} center={[pos[1], pos[0]]} radius={3}
            pathOptions={{ color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 1, opacity: 0.85 }} />
        ))}

        <MapUpdater geoJsonData={geoJsonData} />
      </MapContainer>

      {!geoJsonData && <MapHint />}

      <style>{`
        .station-div-icon {
          background: transparent !important;
          border: none !important;
        }
        .rg-popup .leaflet-popup-content-wrapper{background:rgba(15,23,42,0.97)!important;border:1px solid rgba(6,182,212,0.2)!important;border-radius:12px!important;box-shadow:0 16px 48px -8px rgba(0,0,0,0.8)!important;backdrop-filter:blur(16px)}
        .rg-popup .leaflet-popup-tip{background:rgba(15,23,42,0.97)!important}
        .rg-popup .leaflet-popup-close-button{color:#64748b!important;font-size:18px!important;top:8px!important;right:10px!important}
        .rg-popup .leaflet-popup-close-button:hover{color:#06b6d4!important}
        .leaflet-control-zoom a{background:rgba(15,23,42,0.9)!important;color:#94a3b8!important;border-color:rgba(51,65,85,0.8)!important}
        .leaflet-control-zoom a:hover{background:rgba(30,41,59,1)!important;color:#06b6d4!important}
        .leaflet-control-attribution{background:rgba(15,23,42,0.8)!important;color:#475569!important;font-size:10px!important;backdrop-filter:blur(8px)}
        .leaflet-control-attribution a{color:#64748b!important}
      `}</style>
    </div>
  )
}