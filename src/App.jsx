import { useState, useMemo } from 'react'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/Sidebar'
import CadMap from './components/CadMap'
import CadViewer from './components/CadViewer'
import CrossSectionProfile from './components/CrossSectionProfile'
import {
  Activity, Layers, Globe, Hash, Ruler, Package, GitBranch, Zap,
  Map, ScanLine, Database, ChevronRight, Compass,
} from 'lucide-react'

/* ─── Count total coordinate vertices recursively ─────────────── */
function countVertices(geometry) {
  if (!geometry) return 0
  const { type, coordinates } = geometry
  if (!coordinates) return 0
  switch (type) {
    case 'Point':            return 1
    case 'MultiPoint':
    case 'LineString':       return coordinates.length
    case 'MultiLineString':
    case 'Polygon':          return coordinates.reduce((s, r) => s + r.length, 0)
    case 'MultiPolygon':     return coordinates.reduce((s, poly) => s + poly.reduce((ss, r) => ss + r.length, 0), 0)
    default:                 return 0
  }
}

/* ─── Divider ─────────────────────────────────────────────────── */
function VDivider() {
  return <div style={{ width: '1px', background: 'rgba(51,65,85,0.6)', alignSelf: 'stretch', margin: '6px 0' }} />
}

/* ─── Stat Card ───────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, accent = '#06b6d4', pulse = false, highlight = false }) {
  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2.5"
      style={highlight ? { background: `${accent}10`, borderLeft: `2px solid ${accent}` } : {}}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
        <Icon size={13} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', lineHeight: 1, marginBottom: 3 }}>
          {label}
        </p>
        <p style={{
          fontSize: '13px', fontWeight: 800, lineHeight: 1,
          color: pulse || highlight ? accent : '#e2e8f0',
          whiteSpace: 'nowrap',
          textShadow: (pulse || highlight) ? `0 0 12px ${accent}60` : 'none',
        }}>
          {value}
        </p>
      </div>
    </div>
  )
}

/* ─── Stats Bar ────────────────────────────────────────────────── */
function StatsBar({ geoJsonData, analyticsData, cadStats, rawDxfFile }) {
  const geoStats = useMemo(() => {
    if (!geoJsonData) return null
    const features = geoJsonData.features ?? []
    const totalVertices = features.reduce((acc, f) => acc + countVertices(f.geometry), 0)
    const types = [...new Set(features.map(f => f.geometry?.type).filter(Boolean))]
    return { featureCount: features.length, totalVertices, typeLabel: types.length ? types.join(' · ') : '—' }
  }, [geoJsonData])

  const hasCadInfo = !!(cadStats || rawDxfFile)
  const cadFileName = cadStats?.fileName || rawDxfFile?.name
  const cadFileSize = cadStats?.fileSize || (rawDxfFile?.size ? (rawDxfFile.size / (1024 * 1024)).toFixed(2) + ' MB' : null)

  return (
    <div
      className="absolute top-4 left-4 right-4 z-[1000] rounded-xl overflow-hidden"
      style={{
        background: 'rgba(10,15,30,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(6,182,212,0.15)',
        boxShadow: '0 4px 32px -4px rgba(0,0,0,0.7), 0 0 0 1px rgba(6,182,212,0.06), inset 0 1px 0 rgba(255,255,255,0.03)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {!geoStats ? (
        !hasCadInfo ? (
          <div className="flex items-center gap-3 px-5 py-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" style={{ boxShadow: '0 0 8px rgba(6,182,212,0.8)' }} />
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Chờ nạp dữ liệu CAD… (Kéo thả file .dxf vào bản đồ)</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#1e3a50', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
              ROADGUARD GIS v2.0
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', flexShrink: 0 }}>
              <span className="relative flex" style={{ height: 8, width: 8 }}>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400" style={{ opacity: 0.7 }} />
                <span className="relative inline-flex rounded-full bg-cyan-400" style={{ height: 8, width: 8, boxShadow: '0 0 8px rgba(6,182,212,0.9)' }} />
              </span>
              <span style={{ fontSize: '9px', fontWeight: 800, color: '#22d3ee', letterSpacing: '0.15em', textTransform: 'uppercase' }}>CAD Ready</span>
            </div>
            <VDivider />
            <StatCard icon={Compass} label="Tệp Bản Vẽ CAD" value={cadFileName || 'CAD File'} accent="#22d3ee" pulse />
            {cadFileSize && (
              <>
                <VDivider />
                <StatCard icon={Database} label="Dung Lượng" value={cadFileSize} accent="#94a3b8" />
              </>
            )}
            {cadStats?.entityCount != null && (
              <>
                <VDivider />
                <StatCard icon={Hash} label="Tổng Đối Tượng" value={`${cadStats.entityCount.toLocaleString()} ent`} accent="#34d399" highlight />
              </>
            )}
            {cadStats?.layerCount != null && (
              <>
                <VDivider />
                <StatCard icon={Layers} label="Tổng Số Layer" value={`${cadStats.layerCount} layers`} accent="#818cf8" />
              </>
            )}
            <VDivider />
            <StatCard icon={Globe} label="Engine Hiển Thị" value="WebGL 100% AutoCAD" accent="#fb923c" />
          </div>
        )
      ) : (
        <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', flexShrink: 0 }}>
            <span className="relative flex" style={{ height: 8, width: 8 }}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400" style={{ opacity: 0.7 }} />
              <span className="relative inline-flex rounded-full bg-emerald-400" style={{ height: 8, width: 8, boxShadow: '0 0 8px rgba(52,211,153,0.9)' }} />
            </span>
            <span style={{ fontSize: '9px', fontWeight: 800, color: '#34d399', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Live GIS</span>
          </div>
          <VDivider />
          {cadFileName && (
            <>
              <StatCard icon={Compass} label="Tệp CAD" value={cadFileName} accent="#38bdf8" />
              <VDivider />
            </>
          )}
          <StatCard icon={Layers}   label="Tổng cấu kiện" value={geoStats.featureCount.toLocaleString()} accent="#06b6d4" pulse />
          <VDivider />
          <StatCard icon={Hash}     label="Tổng điểm"     value={geoStats.totalVertices.toLocaleString()} accent="#818cf8" />
          <VDivider />
          <StatCard icon={Activity} label="Geometry"      value={geoStats.typeLabel} accent="#34d399" />
          <VDivider />
          <StatCard icon={Globe}    label="Hệ tọa độ"     value="WGS84 / EPSG:4326" accent="#fb923c" />

          {analyticsData && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', flexShrink: 0 }}>
                <div style={{ width: 1, alignSelf: 'stretch', margin: '6px 0', background: 'linear-gradient(to bottom, transparent, rgba(6,182,212,0.4), transparent)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', flexShrink: 0, gap: 5 }}>
                <Zap size={9} style={{ color: '#06b6d4' }} />
                <span style={{ fontSize: '8px', fontWeight: 800, color: '#0e7490', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Analytics</span>
              </div>
              <VDivider />
              {/* totalAreaSqm — hero stat, biggest + brightest */}
              {analyticsData.totalAreaSqm != null && (
                <>
                  <div className="flex items-center gap-2.5 px-3.5 py-2" style={{ background: 'rgba(6,182,212,0.08)', borderLeft: '2px solid #06b6d4' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(6,182,212,0.20)', border: '1px solid rgba(6,182,212,0.4)' }}>
                      <Activity size={13} style={{ color: '#06b6d4' }} />
                    </div>
                    <div className="min-w-0">
                      <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0e7490', lineHeight: 1, marginBottom: 3 }}>
                        Tong dien tich
                      </p>
                      <p style={{ fontSize: '15px', fontWeight: 900, lineHeight: 1, color: '#06b6d4', whiteSpace: 'nowrap', textShadow: '0 0 16px rgba(6,182,212,0.7)' }}>
                        {Number(analyticsData.totalAreaSqm).toLocaleString(undefined, { maximumFractionDigits: 2 })} m&sup2;
                      </p>
                    </div>
                  </div>
                  <VDivider />
                </>
              )}
              {analyticsData.totalLengthMeters != null && (<><StatCard icon={Ruler}     label="Chieu dai tuyen" value={`${Number(analyticsData.totalLengthMeters).toFixed(2)} m`} accent="#06b6d4" highlight pulse /><VDivider /></>)}
              {analyticsData.estimatedConcreteSlabs != null && (<><StatCard icon={Package}   label="So tam BTXM"    value={`${analyticsData.estimatedConcreteSlabs} tam`} accent="#a78bfa" highlight /><VDivider /></>)}
              {analyticsData.roadSegments != null && (<><StatCard icon={GitBranch} label="So phan doan"   value={`${analyticsData.roadSegments} doan`} accent="#34d399" highlight /><VDivider /></>)}
              {analyticsData.processingTimeMs != null && (<StatCard icon={Zap} label="Toc do xu ly" value={`${analyticsData.processingTimeMs} ms`} accent="#fbbf24" highlight />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Tab definitions ──────────────────────────────────────────── */
const TABS = [
  { id: 'map',       icon: Map,      label: 'Bản đồ GIS Thực tế',         sub: 'Interactive Plan View' },
  { id: 'cad',       icon: Compass,  label: 'Bản Vẽ CAD (AutoCAD View)',   sub: 'Full 2D CAD Viewport' },
  { id: 'profile',   icon: ScanLine, label: 'Mặt Cắt Ngang',               sub: 'Cross-Section Profile' },
  { id: 'json',      icon: Database, label: 'Cấu Trúc Dữ Liệu GeoJSON',    sub: 'Raw Data Inspector' },
]

/* ─── Tab Bar ─────────────────────────────────────────────────── */
function TabBar({ activeTab, setActiveTab }) {
  return (
    <div
      className="absolute top-16 left-0 right-0 z-[999]"
      style={{
        background: 'rgba(10,15,30,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(30,41,59,0.9)',
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        fontFamily: 'Inter, sans-serif',
        paddingLeft: '16px',
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '10px 16px',
              background: active ? 'rgba(6,182,212,0.04)' : 'transparent',
              border: 'none',
              borderBottom: active ? '2px solid #06b6d4' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              fontFamily: 'Inter, sans-serif',
              marginBottom: '-1px',
            }}
            onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderBottomColor = '#334155'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)' } }}
            onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent' } }}
          >
            <tab.icon
              size={13}
              style={{ color: active ? '#06b6d4' : '#475569', flexShrink: 0, transition: 'color 0.18s' }}
            />
            <span style={{
              fontSize: '12px',
              fontWeight: active ? 600 : 400,
              color: active ? '#e2e8f0' : '#475569',
              whiteSpace: 'nowrap',
              transition: 'color 0.18s',
              letterSpacing: active ? '-0.01em' : '0',
            }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}


/* ─── JSON Inspector ────────────────────────────────────────────── */
function JsonInspector({ geoJsonData }) {
  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: '#020617', fontFamily: 'monospace' }}
    >
      {/* Header bar */}
      <div style={{
        padding: '10px 20px',
        background: 'rgba(15,23,42,0.95)',
        borderBottom: '1px solid rgba(6,182,212,0.12)',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
      }}>
        <Database size={14} style={{ color: '#06b6d4' }} />
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          GeoJSON Raw Inspector
        </span>
        {geoJsonData && (
          <span style={{
            marginLeft: 'auto', fontSize: '10px', color: '#34d399', fontFamily: 'monospace',
            background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)',
            padding: '2px 8px', borderRadius: 20,
          }}>
            {(JSON.stringify(geoJsonData).length / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      {/* JSON content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {geoJsonData ? (
          <pre style={{
            margin: 0,
            fontSize: '11.5px',
            lineHeight: 1.7,
            color: '#94a3b8',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {/* Syntax-coloured output by manual span injection */}
            {JSON.stringify(geoJsonData, null, 2)
              .split('\n')
              .map((line, i) => {
                const keyMatch  = line.match(/^(\s*)("[\w\s]+")(\s*:\s*)(.*)$/)
                const strMatch  = line.match(/^(\s*)(".*")(\,?)$/)
                const numMatch  = line.match(/^(\s*)([-\d.]+)(\,?)$/)
                const boolMatch = line.match(/^(\s*)(true|false|null)(\,?)$/)

                if (keyMatch) {
                  return (
                    <span key={i}>
                      {keyMatch[1]}
                      <span style={{ color: '#7dd3fc' }}>{keyMatch[2]}</span>
                      <span style={{ color: '#475569' }}>{keyMatch[3]}</span>
                      <span style={{ color: '#a78bfa' }}>{keyMatch[4]}</span>
                      {'\n'}
                    </span>
                  )
                }
                if (strMatch) return <span key={i}>{strMatch[1]}<span style={{ color: '#86efac' }}>{strMatch[2]}</span><span style={{ color: '#475569' }}>{strMatch[3]}</span>{'\n'}</span>
                if (numMatch) return <span key={i}>{numMatch[1]}<span style={{ color: '#fb923c' }}>{numMatch[2]}</span><span style={{ color: '#475569' }}>{numMatch[3]}</span>{'\n'}</span>
                if (boolMatch) return <span key={i}>{boolMatch[1]}<span style={{ color: '#f87171' }}>{boolMatch[2]}</span><span style={{ color: '#475569' }}>{boolMatch[3]}</span>{'\n'}</span>
                return <span key={i}>{line}{'\n'}</span>
              })
            }
          </pre>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#334155' }}>
            <Database size={32} />
            <p style={{ fontSize: '13px', fontWeight: 600 }}>No GeoJSON data loaded yet</p>
            <p style={{ fontSize: '11px' }}>Upload a .dxf file to inspect the raw output</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Root App ─────────────────────────────────────────────────── */
export default function App() {
  const [geoJsonData,      setGeoJsonData]      = useState(null)
  const [analyticsData,    setAnalyticsData]    = useState(null)
  const [roadOverlay,      setRoadOverlay]      = useState(null) // { image_base64, bounds }
  const [rawDxfFile,       setRawDxfFile]       = useState(null)
  const [cadStats,         setCadStats]         = useState(null)
  const [mapStyle,         setMapStyle]         = useState('satellite')
  const [showGeometry,     setShowGeometry]     = useState(true)
  const [showVertices,     setShowVertices]     = useState(false)
  const [showCenterline,   setShowCenterline]   = useState(true)
  const [showRoadSurface,  setShowRoadSurface]  = useState(true)
  const [showEdges,        setShowEdges]        = useState(true)
  const [showStations,     setShowStations]     = useState(true)
  const [roadParams,       setRoadParams]       = useState({
    segmentLength: '100',
    roadWidth: '3.5',
    slabLength: '4.0',
  })
  const [activeTab,        setActiveTab]        = useState('map')

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#0a0f1e' }}>

      {/* ── Left Sidebar ── */}
      <aside
        className="relative z-20 flex flex-col shrink-0"
        style={{ width: '380px', background: '#0f172a', borderRight: '1px solid rgba(51,65,85,0.8)', boxShadow: '4px 0 32px -4px rgba(0,0,0,0.5)' }}
      >
        <Sidebar
          cadFile={rawDxfFile}
          onDataLoaded={setGeoJsonData}
          onAnalyticsLoaded={setAnalyticsData}
          onOverlayLoaded={setRoadOverlay}
          onCadFileChange={setRawDxfFile}
          geoJsonData={geoJsonData}
          analyticsData={analyticsData}
          mapStyle={mapStyle}
          setMapStyle={setMapStyle}
          showGeometry={showGeometry}
          setShowGeometry={setShowGeometry}
          showVertices={showVertices}
          setShowVertices={setShowVertices}
          showCenterline={showCenterline}
          setShowCenterline={setShowCenterline}
          showRoadSurface={showRoadSurface}
          setShowRoadSurface={setShowRoadSurface}
          showEdges={showEdges}
          setShowEdges={setShowEdges}
          showStations={showStations}
          setShowStations={setShowStations}
          roadParams={roadParams}
          setRoadParams={setRoadParams}
        />
      </aside>

      {/* ── Main Workspace ── */}
      <main className="flex-1 relative overflow-hidden">
        {/* Floating Stats Bar */}
        <StatsBar
          geoJsonData={geoJsonData}
          analyticsData={analyticsData}
          cadStats={cadStats}
          rawDxfFile={rawDxfFile}
        />

        {/* Tab Bar */}
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Tab Content — CadMap fills inset-0, other tabs sit below the bars */}
        {/* Tab Content — CadMap & CadViewer stay persistent in DOM to avoid WebGL context loss */}
        <div className="absolute inset-0" style={{ display: activeTab === 'map' ? 'block' : 'none' }}>
          <CadMap
            geoJsonData={geoJsonData}
            roadOverlay={roadOverlay}
            mapStyle={mapStyle}
            showGeometry={showGeometry}
            showVertices={showVertices}
            showCenterline={showCenterline}
            showRoadSurface={showRoadSurface}
            showEdges={showEdges}
            showStations={showStations}
            roadParams={roadParams}
          />
        </div>

        <div className="absolute inset-0" style={{ top: '108px', display: activeTab === 'cad' ? 'block' : 'none' }}>
          <CadViewer
            rawDxfFile={rawDxfFile}
            onFileLoaded={setRawDxfFile}
            onStatsLoaded={setCadStats}
            isVisible={activeTab === 'cad'}
          />
        </div>
        {activeTab !== 'map' && activeTab !== 'cad' && (
          <div className="absolute inset-0" style={{ top: '108px' }}>
            {activeTab === 'profile' && (
              <CrossSectionProfile
                geoJsonData={geoJsonData}
                roadParams={roadParams}
              />
            )}
            {activeTab === 'json' && <JsonInspector geoJsonData={geoJsonData} />}
          </div>
        )}
      </main>

      {/* ── Toast Notifications ── */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { background: '#1e293b', color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: '500', borderRadius: '10px', border: '1px solid #334155', padding: '12px 16px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.7)' },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1e293b' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
          loading: { iconTheme: { primary: '#06b6d4', secondary: '#1e293b' } },
        }}
      />
    </div>
  )
}
