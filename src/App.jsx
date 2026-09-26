import { useState, useMemo } from 'react'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/Sidebar'
import CadMap from './components/CadMap'
import CadViewer from './components/CadViewer'
import CrossSectionProfile from './components/CrossSectionProfile'
import { downloadExcelReport } from './utils/excelExporter'
import {
  Map, ScanLine, Database, Compass,
  Satellite, FileSpreadsheet, Route,
  PanelLeftOpen, CheckCircle2
} from 'lucide-react'

/* ─── Tab definitions ──────────────────────────────────────────── */
const TABS = [
  { id: 'map',     icon: Map,      label: 'Bản đồ GIS' },
  { id: 'cad',     icon: Compass,  label: 'Bản vẽ CAD 2D' },
  { id: 'profile', icon: ScanLine, label: 'Mặt cắt ngang' },
  { id: 'json',    icon: Database, label: 'Dữ liệu GeoJSON' },
]

export default function App() {
  const [geoJsonData,     setGeoJsonData]     = useState(null)
  const [analyticsData,   setAnalyticsData]   = useState(null)
  const [roadOverlay,     setRoadOverlay]     = useState(null)
  const [rawDxfFile,      setRawDxfFile]      = useState(null)
  const [cadStats,        setCadStats]        = useState(null)
  const [mapStyle,        setMapStyle]        = useState('satellite')
  const [showGeometry,    setShowGeometry]    = useState(true)
  const [showVertices,    setShowVertices]    = useState(false)
  const [showCenterline,  setShowCenterline]  = useState(true)
  const [showRoadSurface, setShowRoadSurface] = useState(true)
  const [showEdges,       setShowEdges]       = useState(true)
  const [showStations,    setShowStations]    = useState(true)
  const [sidebarCollapsed,setSidebarCollapsed]= useState(false)
  const [roadParams,      setRoadParams]      = useState({
    segmentLength: '100',
    roadWidth: '3.5',
    slabLength: '4.0',
  })
  const [activeTab,       setActiveTab]       = useState('map')

  const isLive = !!(geoJsonData || analyticsData)

  const handleQuickExcel = async () => {
    if (!geoJsonData && !analyticsData) return
    await downloadExcelReport({
      geoJsonData,
      analyticsData,
      roadParams: {
        segmentLength: parseFloat(roadParams.segmentLength) || 100,
        roadWidth: parseFloat(roadParams.roadWidth) || 3.5,
        slabLength: parseFloat(roadParams.slabLength) || 4.0,
      },
    })
  }

  const vertexCount = useMemo(() => {
    if (!geoJsonData?.features) return 0
    return geoJsonData.features.reduce((acc, f) => {
      const coords = f.geometry?.coordinates
      if (!coords) return acc
      if (typeof coords[0] === 'number') return acc + 1
      if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') return acc + coords.length
      if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
        return acc + coords.reduce((sum, ring) => sum + ring.length, 0)
      }
      return acc
    }, 0)
  }, [geoJsonData])

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#0a0f1d] text-slate-200 font-sans antialiased select-none">
      
      {/* ── 1. Top Studio Header (Full-width, zero awkward gap) ── */}
      <header className="h-[52px] shrink-0 bg-[#0e121f] border-b border-[#1e263d] px-4 flex items-center justify-between z-30 shadow-md">
        
        {/* Left: Brand & Active Project Chip */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/25">
              <Route size={16} strokeWidth={2.5} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-black text-white tracking-tight">RoadGuard</span>
              <span className="text-xs font-bold text-blue-400 font-mono tracking-wider">GIS STUDIO</span>
            </div>
          </div>

          <div className="h-4 w-px bg-[#232d47] mx-1.5 hidden sm:block" />

          {/* Active File Chip */}
          {rawDxfFile ? (
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#161c2e] border border-[#232d47] text-xs font-mono text-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="max-w-[160px] truncate font-semibold">{rawDxfFile.name}</span>
            </div>
          ) : (
            <span className="hidden sm:inline text-xs text-slate-500 font-medium">
              Chưa nạp bản vẽ
            </span>
          )}
        </div>

        {/* Center: Primary View Tabs */}
        <nav className="flex items-center p-1 bg-[#161c2e] border border-[#232d47] rounded-xl shadow-inner">
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <Icon size={14} className={active ? 'text-white' : 'text-slate-400'} />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Right: Basemap Selector & Quick Excel Export */}
        <div className="flex items-center gap-2.5">
          {/* Basemap Switcher */}
          <div className="flex items-center p-0.5 bg-[#161c2e] border border-[#232d47] rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setMapStyle('satellite')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                mapStyle === 'satellite'
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Satellite size={13} />
              <span className="hidden sm:inline">Vệ tinh</span>
            </button>
            <button
              type="button"
              onClick={() => setMapStyle('osm')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                mapStyle === 'osm'
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Map size={13} />
              <span className="hidden sm:inline">Bản đồ số</span>
            </button>
          </div>

          {/* Quick Export Excel */}
          {isLive && (
            <button
              type="button"
              onClick={handleQuickExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
              title="Xuất báo cáo khối lượng Excel"
            >
              <FileSpreadsheet size={14} />
              <span className="hidden lg:inline">Xuất Excel</span>
            </button>
          )}
        </div>
      </header>

      {/* ── 2. Studio Workstation Workspace ── */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Docked Sidebar */}
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
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />

        {/* Main View Area */}
        <main className="flex-1 flex flex-col relative overflow-hidden bg-[#0a0f1d]">
          
          {/* Main View Container */}
          <div className="flex-1 relative overflow-hidden">
            
            {/* Expand Sidebar Floating Button (When collapsed) */}
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0e121f]/90 hover:bg-[#161c2e] border border-[#232d47] backdrop-blur-xl text-xs font-semibold text-slate-200 shadow-xl transition-all cursor-pointer group"
                title="Mở thanh công cụ"
              >
                <PanelLeftOpen size={16} className="text-blue-400 group-hover:scale-110 transition-transform" />
                <span>Mở Bảng Điều Khiển</span>
                {isLive && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            )}

            {/* Tab 1: GIS Map View */}
            <div
              className="w-full h-full"
              style={{ display: activeTab === 'map' ? 'block' : 'none' }}
            >
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

            {/* Tab 2: 2D CAD Canvas Viewport */}
            <div
              className="w-full h-full"
              style={{ display: activeTab === 'cad' ? 'block' : 'none' }}
            >
              <CadViewer
                rawDxfFile={rawDxfFile}
                onFileLoaded={setRawDxfFile}
                onStatsLoaded={setCadStats}
                isVisible={activeTab === 'cad'}
              />
            </div>

            {/* Tab 3: Cross Section Profile */}
            {activeTab === 'profile' && (
              <div className="w-full h-full">
                <CrossSectionProfile
                  geoJsonData={geoJsonData}
                  roadParams={roadParams}
                />
              </div>
            )}

            {/* Tab 4: GeoJSON Inspector */}
            {activeTab === 'json' && (
              <div className="w-full h-full p-6 bg-[#0a0f1d] overflow-auto font-mono text-xs text-slate-300">
                {geoJsonData ? (
                  <pre className="max-w-5xl mx-auto p-4 rounded-xl bg-[#111625] border border-[#1e263d] shadow-2xl whitespace-pre-wrap break-words">
                    {JSON.stringify(geoJsonData, null, 2)}
                  </pre>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                    <Database size={36} />
                    <p className="text-sm font-medium">Chưa có dữ liệu GeoJSON</p>
                    <p className="text-xs">Tải file CAD và bấm phân tích để xem cấu trúc không gian</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 3. Engineering Telemetry Status Bar ── */}
          <footer className="h-7 shrink-0 bg-[#0e121f] border-t border-[#1e263d] px-4 flex items-center justify-between text-[11px] font-mono text-slate-400 select-none">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Hệ tọa độ: <strong className="text-slate-200">WGS84 / EPSG:4326</strong>
              </span>
              <span>
                Quy chuẩn: <span className="text-slate-300">TCVN 4054:2005</span>
              </span>
              {vertexCount > 0 && (
                <span>
                  Đỉnh mốc: <span className="text-slate-300">{vertexCount}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              {analyticsData && (
                <>
                  <span>
                    Chiều dài: <strong className="text-slate-200">{Number(analyticsData.totalLengthMeters || 0).toFixed(1)}m</strong>
                  </span>
                  <span>
                    Diện tích: <strong className="text-emerald-400">{Number(analyticsData.totalAreaSqm || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}m²</strong>
                  </span>
                  <span>
                    Xử lý: <span className="text-slate-300">{analyticsData.processingTimeMs || 3015}ms</span>
                  </span>
                </>
              )}
              <span className="text-slate-500">RoadGuard Engine v2.4</span>
            </div>
          </footer>
        </main>
      </div>

      {/* ── Toast Notifications ── */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          style: {
            background: 'rgba(14, 18, 31, 0.95)',
            color: '#f8fafc',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(16px)',
          },
        }}
      />
    </div>
  )
}
