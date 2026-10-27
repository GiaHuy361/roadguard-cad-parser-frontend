import { useState, useMemo, useEffect, useCallback } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import Sidebar from './components/Sidebar'
import RightInspectorPanel from './components/RightInspectorPanel'
import CadMap from './components/CadMap'
import CadViewer from './components/CadViewer'
import CrossSectionProfile from './components/CrossSectionProfile'
import RoadGuardDraftExportModal from './components/RoadGuardDraftExportModal'
import { downloadExcelReport } from './utils/excelExporter'
import { linkHandler } from './navigation'
import {
  enrichGeoJsonWithEngineeringFeatures,
  normalizeRoadParams,
} from './utils/roadEngineeringBuilder'
import {
  Map,
  ScanLine,
  Database,
  Compass,
  Satellite,
  FileSpreadsheet,
  PanelLeftOpen,
  PanelLeftClose,
  PanelRightOpen,
  PanelRightClose,
  CheckCircle2,
  Copy,
  Check,
  Download,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ChevronLeft,
} from 'lucide-react'

/* ─── Primary Studio Workspace Tabs ───────────────────────────── */
const TABS = [
  { id: 'map', icon: Map, label: 'Bản đồ GIS' },
  { id: 'cad', icon: Compass, label: 'Bản vẽ CAD 2D' },
  { id: 'profile', icon: ScanLine, label: 'Mặt cắt & Hồ sơ' },
  { id: 'json', icon: Database, label: 'GeoJSON (RFC 7946)' },
]

export default function App() {
  const [geoJsonData, setGeoJsonData] = useState(null)
  const [analyticsData, setAnalyticsData] = useState(null)
  const [roadOverlay, setRoadOverlay] = useState(null)
  const [rawDxfFile, setRawDxfFile] = useState(null)
  const [cadStats, setCadStats] = useState(null)
  const [mapStyle, setMapStyle] = useState('satellite')
  const [showGeometry, setShowGeometry] = useState(true)
  const [showVertices, setShowVertices] = useState(false)
  const [showCenterline, setShowCenterline] = useState(true)
  const [showRoadSurface, setShowRoadSurface] = useState(true)
  const [showEdges, setShowEdges] = useState(true)
  const [showStations, setShowStations] = useState(true)
  const [showSlabs, setShowSlabs] = useState(true)
  const [showSlabLabels, setShowSlabLabels] = useState(false)
  const [completedSegments, setCompletedSegments] = useState([])
  const [focusedSegment, setFocusedSegment] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1280 : false
  )
  const [customCadFeatures, setCustomCadFeatures] = useState([])
  const [inspectorBridge, setInspectorBridge] = useState({
    cadLayerStats: [],
    cadLayerVisibility: {},
    loadingLayers: {},
    selectedCadLayer: '',
    centralMeridian: '105.75',
    scaleFactor: '0.9999',
    axisOrder: 'AUTO',
    sourceDataKind: 'cad',
    crsConfigured: true,
    isLoading: false,
    onToggleCadLayer: null,
    onToggleAllCadLayers: null,
    onSelectCadLayerForParse: null,
    onRecomputeWidth: null,
  })

  const [roadParams, setRoadParams] = useState({
    segmentLength: '100',
    roadWidth: '7.0',
    slabLength: '4.0',
    laneCount: '2',
  })

  // Responsive auto-collapse of Right Inspector at <= 1360px so Center Viewport stays dominant
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= 1360) {
        setInspectorCollapsed(true)
      } else if (window.innerWidth >= 1400) {
        setInspectorCollapsed(false)
      }
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const [isCrsStale, setIsCrsStale] = useState(false)
  const [crsLifecycleState, setCrsLifecycleState] = useState('VALID_APPLIED')
  const [appliedCrsConfig, setAppliedCrsConfig] = useState(null)

  const handleCadFileChange = useCallback((file) => {
    setRawDxfFile(file)
    setGeoJsonData(null)
    setAnalyticsData(null)
    setRoadOverlay(null)
    setCadStats(null)
    setCompletedSegments([])
    setFocusedSegment(null)
    setCustomCadFeatures([])
    setAppliedCrsConfig(null)
    setIsCrsStale(false)
  }, [])

  const [activeTab, setActiveTab] = useState('map')
  const [copied, setCopied] = useState(false)
  const [showFullJson, setShowFullJson] = useState(false)
  const [coordDisplayMode, setCoordDisplayMode] = useState('DUAL')
  const [showRoadGuardDraftModal, setShowRoadGuardDraftModal] = useState(false)

  const isLive = !!(geoJsonData || analyticsData)

  // Single Source of Truth: synchronized GeoJSON and engineering metrics across Map, Profile, GeoJSON tab, and Excel
  const { enrichedGeoJson, metrics: ssotMetrics } = useMemo(() => {
    if (!geoJsonData) return { enrichedGeoJson: null, metrics: null }
    return enrichGeoJsonWithEngineeringFeatures(
      geoJsonData,
      roadParams,
      customCadFeatures,
      completedSegments
    )
  }, [geoJsonData, roadParams, customCadFeatures, completedSegments])

  const exportGeoJson = enrichedGeoJson || geoJsonData
  const normalizedParams = useMemo(
    () => normalizeRoadParams(roadParams),
    [roadParams]
  )
  const isSurfaceAreaProvisional = Boolean(ssotMetrics?.isSurfaceAreaProvisional)
  const analyzedRoadWidth = Number(
    ssotMetrics?.analyzedRoadWidth || normalizedParams.roadWidth
  )

  const isWgs84Source =
    inspectorBridge.sourceDataKind === 'wgs84' ||
    exportGeoJson?.sourceDataKind === 'WGS84_IMPORT'

  const getExportBlockedReason = (targetFormat = 'all') => {
    if (crsLifecycleState === 'ANALYZING') {
      return 'Hệ thống đang phân tích bản vẽ CAD. Vui lòng chờ quá trình hoàn tất trước khi xuất dữ liệu.'
    }
    if (isSurfaceAreaProvisional) {
      return `Bề rộng mặt đường đã đổi từ ${analyzedRoadWidth}m sang ${normalizedParams.roadWidth}m. Vui lòng bấm Cập Nhật & Dựng Lại Mặt Đường trước khi xuất dữ liệu chính thức.`
    }
    // If source is already WGS-84, pure GeoJSON export does not require VN-2000 CRS
    if (isWgs84Source && targetFormat === 'geojson') {
      return null
    }
    if (crsLifecycleState === 'UNCONFIGURED') {
      return 'Hệ quy chiếu VN-2000 chưa được cấu hình. Vui lòng chọn L₀ và phân tích trước khi xuất dữ liệu.'
    }
    if (crsLifecycleState === 'INVALID_CONFIG') {
      return 'Tham số CRS không hợp lệ (L₀ phải từ 100° đến 112°). Vui lòng cấu hình lại trước khi xuất dữ liệu.'
    }
    if (isCrsStale) {
      return 'Cấu hình CRS đã thay đổi (STALE). Vui lòng bấm Phân Tích Lại trước khi xuất dữ liệu.'
    }
    return null
  }

  const isGeoJsonExportBlocked = Boolean(getExportBlockedReason('geojson'))
  const isExcelExportBlocked = Boolean(getExportBlockedReason('excel'))
  const isDraftExportBlocked = Boolean(getExportBlockedReason('draft'))
  const isExportBlocked = isExcelExportBlocked

  const layerVisibility = useMemo(
    () => ({
      surface: showRoadSurface,
      slabs: showSlabs,
      slabLabels: showSlabLabels,
      centerline: showCenterline,
      edges: showEdges,
      stations: showStations,
      vertices: showVertices,
    }),
    [
      showRoadSurface,
      showSlabs,
      showSlabLabels,
      showCenterline,
      showEdges,
      showStations,
      showVertices,
    ]
  )

  const handleToggleGisLayer = useCallback((layerKey) => {
    switch (layerKey) {
      case 'surface':
        setShowRoadSurface((v) => !v)
        break
      case 'slabs':
        setShowSlabs((v) => !v)
        break
      case 'slabLabels':
        setShowSlabLabels((v) => !v)
        break
      case 'centerline':
        setShowCenterline((v) => !v)
        break
      case 'edges':
        setShowEdges((v) => !v)
        break
      case 'stations':
        setShowStations((v) => !v)
        break
      case 'vertices':
        setShowVertices((v) => !v)
        break
      default:
        break
    }
  }, [])

  const handleToggleSegment = useCallback((segId) => {
    setCompletedSegments((prev) => {
      const current = Array.isArray(prev) ? prev : []
      return current.includes(segId)
        ? current.filter((id) => id !== segId)
        : [...current, segId]
    })
  }, [])

  const handleFocusSegmentById = useCallback((segId) => {
    setActiveTab('map')
    setFocusedSegment({ id: segId, timestamp: Date.now() })
  }, [])

  const handleCopyGeoJson = () => {
    if (!exportGeoJson) return
    const blockedReason = getExportBlockedReason('geojson')
    if (blockedReason) {
      toast.error(blockedReason, { duration: 5000 })
      return
    }
    const text = JSON.stringify(exportGeoJson, null, 2)
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        toast.success('Đã sao chép toàn bộ GeoJSON (RFC 7946) vào Clipboard!')
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        toast.error(
          'Không thể sao chép tự động, vui lòng bôi đen và bấm Ctrl+C'
        )
      })
  }

  const handleDownloadGeoJsonFile = () => {
    if (!exportGeoJson) return
    const blockedReason = getExportBlockedReason('geojson')
    if (blockedReason) {
      toast.error(blockedReason, { duration: 5000 })
      return
    }
    const blob = new Blob([JSON.stringify(exportGeoJson, null, 2)], {
      type: 'application/geo+json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'CAD_GIS_Studio_Corridor_RFC7946.geojson'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã tải tệp GeoJSON chuẩn RFC 7946!')
  }

  const handleQuickExcel = async () => {
    if (!exportGeoJson && !analyticsData) return
    const blockedReason = getExportBlockedReason('excel')
    if (blockedReason) {
      toast.error(blockedReason, { duration: 5000 })
      return
    }
    await downloadExcelReport({
      geoJsonData: exportGeoJson,
      analyticsData: ssotMetrics || analyticsData,
      roadParams: normalizedParams,
    })
  }

  const vertexCount = useMemo(() => {
    if (!geoJsonData?.features) return 0
    return geoJsonData.features.reduce((acc, f) => {
      const coords = f.geometry?.coordinates
      if (!coords) return acc
      if (typeof coords[0] === 'number') return acc + 1
      if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number')
        return acc + coords.length
      if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
        return acc + coords.reduce((sum, ring) => sum + ring.length, 0)
      }
      return acc
    }, 0)
  }, [geoJsonData])

  const formattedJsonPreview = useMemo(() => {
    if (!exportGeoJson) return ''
    const full = JSON.stringify(exportGeoJson, null, 2)
    if (showFullJson || full.length <= 45000) return full
    return (
      full.slice(0, 45000) +
      `\n\n/* ... Đã rút gọn hiển thị để tối ưu hiệu năng (${(full.length / 1024).toFixed(1)} KB tổng cộng). Bấm "Hiển thị toàn bộ" hoặc "Tải Tệp" để xem đầy đủ 100% ... */`
    )
  }, [exportGeoJson, showFullJson])

  const totalLengthVal = Number(
    ssotMetrics?.totalLengthMeters ?? analyticsData?.totalLengthMeters ?? 0
  )
  const nominalAreaVal = Number(
    ssotMetrics?.nominalAreaSqm ??
      analyticsData?.totalAreaSqm ??
      totalLengthVal * normalizedParams.roadWidth
  )
  const surfaceAreaVal = Number(
    ssotMetrics?.surfaceAreaSqm ?? nominalAreaVal
  )

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#0B1220] text-[#E8EEF6] font-sans antialiased select-none">
      {/* ── 1. Top Studio Header (52px, Original Logo + CAD & GIS STUDIO first on left + 4 View Tabs + Essential Tools) ── */}
      <header className="h-[52px] shrink-0 bg-[#111D2E] border-b border-[#27384E] px-3.5 flex items-center justify-between gap-2 lg:gap-3 z-30">
        {/* Left: 100% Original Hoàng Hải Logo + CAD & GIS STUDIO + Về Cửa Ngõ */}
        <div className="flex items-center gap-2.5 shrink-0">
          <a
            href="/"
            onClick={linkHandler('/')}
            className="flex items-center gap-2.5 shrink-0 rounded focus-visible:outline-2 focus-visible:outline-[#F06421]"
            title="CAD & GIS STUDIO — Về trang giới thiệu"
          >
            <div className="w-8 h-8 rounded bg-white p-0.5 flex items-center justify-center border border-[#27384E] shrink-0 overflow-hidden">
              <img
                src="/brand/hoang-hai-logo-original.png"
                alt="Logo Công ty TNHH Xây dựng Bê tông Hoàng Hải"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-[14px] font-bold text-[#E8EEF6] tracking-wider whitespace-nowrap">
              CAD &amp; GIS STUDIO
            </span>
          </a>

          <a
            href="/"
            onClick={linkHandler('/')}
            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded text-[11.5px] font-semibold text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#17263C] transition-colors border border-transparent hover:border-[#27384E]"
            title="Quay lại Landing Page cửa ngõ phần mềm"
          >
            <ChevronLeft size={13} className="text-[#22B7C9]" />
            <span>Về Cửa Ngõ</span>
          </a>
        </div>

        {/* Center: 4 Primary Workspace View Tabs */}
        <nav
          aria-label="Chế độ hiển thị không gian làm việc"
          className="flex items-center p-1 bg-[#0B1220] border border-[#27384E] rounded-lg shrink-0"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            const Icon = tab.icon
            const tabTooltips = {
              map: 'Chế độ xem Bản đồ GIS (2D/3D trên nền ảnh vệ tinh & bản đồ số)',
              cad: 'Chế độ xem Bản vẽ kỹ thuật CAD 2D (.DXF)',
              profile: 'Chế độ xem Mặt cắt ngang & Hồ sơ kỹ thuật tuyến (TCVN 4054:2005)',
              json: 'Chế độ xem & kiểm tra dữ liệu không gian GeoJSON (Chuẩn RFC 7946)',
            }
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                title={tabTooltips[tab.id] || tab.label}
                aria-label={tabTooltips[tab.id] || tab.label}
                className={`flex items-center gap-1.5 px-2.5 lg:px-3 xl:px-3.5 py-1.5 rounded-md text-[12px] lg:text-[12.5px] xl:text-[13px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#17263C] text-[#E8EEF6] border-b-2 border-b-[#F06421]'
                    : 'text-[#A9B9CE] hover:text-[#E8EEF6] hover:bg-[#17263C]/40'
                }`}
              >
                <Icon
                  size={15}
                  className={active ? 'text-[#F06421]' : 'text-[#8FA3BA]'}
                />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Right: Basemap Selector + Quick Export + Right Inspector Toggle */}
        <div className="flex items-center gap-1.5 xl:gap-2 shrink-0">
          {/* Basemap Switcher */}
          <div className="hidden sm:flex items-center p-0.5 bg-[#0B1220] border border-[#27384E] rounded-md text-[12.5px] font-medium">
            <button
              type="button"
              onClick={() => setMapStyle('satellite')}
              title="Chuyển sang nền ảnh vệ tinh (Esri World Imagery)"
              aria-label="Chuyển sang nền ảnh vệ tinh (Esri World Imagery)"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer ${
                mapStyle === 'satellite'
                  ? 'bg-[#17263C] text-[#E8EEF6] font-semibold'
                  : 'text-[#A9B9CE] hover:text-[#E8EEF6]'
              }`}
            >
              <Satellite size={14} className={mapStyle === 'satellite' ? 'text-[#22B7C9]' : ''} />
              <span className="hidden xl:inline">Vệ tinh</span>
            </button>
            <button
              type="button"
              onClick={() => setMapStyle('osm')}
              title="Chuyển sang nền bản đồ số đường phố (OpenStreetMap)"
              aria-label="Chuyển sang nền bản đồ số đường phố (OpenStreetMap)"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer ${
                mapStyle === 'osm'
                  ? 'bg-[#17263C] text-[#E8EEF6] font-semibold'
                  : 'text-[#A9B9CE] hover:text-[#E8EEF6]'
              }`}
            >
              <Map size={14} className={mapStyle === 'osm' ? 'text-[#22B7C9]' : ''} />
              <span className="hidden xl:inline">Bản đồ số</span>
            </button>
          </div>

          {/* Stale CRS Indicator Pill in Header */}
          {isCrsStale && (
            <div
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#FCA5A5] text-[11.5px] font-semibold"
              title="Cấu hình CRS đã thay đổi so với dữ liệu đang xem. Vui lòng bấm Phân tích lại."
            >
              <AlertTriangle size={13} className="text-[#EF4444] shrink-0" />
              <span>CRS chưa áp dụng</span>
            </div>
          )}

          {/* Quick Export Excel */}
          {isLive && (
            <button
              type="button"
              onClick={handleQuickExcel}
              disabled={isExcelExportBlocked}
              title={getExportBlockedReason('excel') || 'Xuất báo cáo khối lượng kỹ thuật ra file Excel (.XLSX - 3 Sheets)'}
              aria-label={getExportBlockedReason('excel') || 'Xuất báo cáo khối lượng kỹ thuật ra file Excel (.XLSX - 3 Sheets)'}
              className={`hidden md:flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors border whitespace-nowrap ${
                isExcelExportBlocked
                  ? isCrsStale
                    ? 'bg-[#EF4444]/15 border-[#EF4444]/50 text-[#FCA5A5] cursor-not-allowed opacity-75'
                    : 'bg-[#F59E0B]/15 border-[#F59E0B]/50 text-[#F59E0B] cursor-not-allowed opacity-75'
                  : 'bg-[#39B58A] hover:bg-[#39B58A]/90 border-[#39B58A] text-[#0B1220] font-bold cursor-pointer'
              }`}
            >
              <FileSpreadsheet size={14} />
              <span className="hidden lg:inline">
                {isCrsStale ? 'CRS đổi' : isSurfaceAreaProvisional ? 'Cần dựng lại B' : 'Xuất Excel'}
              </span>
            </button>
          )}

          {/* Right Inspector Toggle */}
          <button
            type="button"
            onClick={() => setInspectorCollapsed((v) => !v)}
            title={
              inspectorCollapsed
                ? 'Mở bảng Thông số & Lớp bản đồ (Bên phải)'
                : 'Thu gọn bảng Thông số & Lớp bản đồ (Bên phải)'
            }
            aria-label={
              inspectorCollapsed
                ? 'Mở bảng Thông số & Lớp bản đồ (Bên phải)'
                : 'Thu gọn bảng Thông số & Lớp bản đồ (Bên phải)'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[12.5px] font-medium transition-colors cursor-pointer ${
              !inspectorCollapsed
                ? 'bg-[#17263C] border-[#27384E] text-[#E8EEF6]'
                : 'bg-[#0B1220] border-[#27384E] text-[#A9B9CE] hover:text-[#E8EEF6]'
            }`}
          >
            {inspectorCollapsed ? (
              <PanelRightOpen size={15} className="text-[#22B7C9]" />
            ) : (
              <PanelRightClose size={15} className="text-[#22B7C9]" />
            )}
            <span className="hidden xl:inline">Thông số</span>
            {isSurfaceAreaProvisional && (
              <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
            )}
          </button>
        </div>
      </header>

      {/* ── 2. Studio 3-Column Workstation Body ── */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Column 1: Left Input & Configuration Panel */}
        <Sidebar
          cadFile={rawDxfFile}
          onDataLoaded={setGeoJsonData}
          onAnalyticsLoaded={setAnalyticsData}
          onOverlayLoaded={setRoadOverlay}
          onCadFileChange={handleCadFileChange}
          geoJsonData={geoJsonData}
          analyticsData={analyticsData}
          completedSegments={completedSegments}
          setCompletedSegments={setCompletedSegments}
          roadParams={roadParams}
          setRoadParams={setRoadParams}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          onCustomFeaturesChange={setCustomCadFeatures}
          onInspectorBridgeChange={setInspectorBridge}
          onSwitchTab={setActiveTab}
          onCrsStaleChange={setIsCrsStale}
          onCrsLifecycleChange={setCrsLifecycleState}
          onAppliedCrsConfigChange={setAppliedCrsConfig}
        />

        {/* Column 2: Center Primary Viewport */}
        <main className="flex-1 flex flex-col relative overflow-hidden bg-[#0B1220] min-w-0">
          <div className="flex-1 relative overflow-hidden">
            {/* Left Workspace Edge Expand Button (when Left Sidebar is closed) */}
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className={`absolute left-0 ${
                  activeTab === 'map' ? 'top-3' : 'top-16'
                } z-20 flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-r-md bg-[#111D2E] hover:bg-[#17263C] border border-l-0 border-[#27384E] text-[12.5px] font-semibold text-[#E8EEF6] shadow-md transition-colors cursor-pointer`}
                title="Mở bảng Cấu hình dữ liệu & tuyến (Bên trái)"
                aria-label="Mở bảng Cấu hình dữ liệu & tuyến (Bên trái)"
              >
                <PanelLeftOpen size={15} className="text-[#F06421]" />
                <span>Mở Cấu Hình</span>
              </button>
            )}

            {/* Right Workspace Edge Expand Button (when Right Sidebar is closed) */}
            {inspectorCollapsed && (
              <button
                type="button"
                onClick={() => setInspectorCollapsed(false)}
                className="absolute bottom-8 right-0 z-20 flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-l-md bg-[#111D2E] hover:bg-[#17263C] border border-r-0 border-[#27384E] text-[12.5px] font-semibold text-[#E8EEF6] shadow-md transition-colors cursor-pointer"
                title="Mở bảng Thông số & Lớp bản đồ (Bên phải)"
                aria-label="Mở bảng Thông số & Lớp bản đồ (Bên phải)"
              >
                <PanelRightOpen size={15} className="text-[#22B7C9]" />
                <span>Mở Thông Số &amp; Lớp</span>
              </button>
            )}

            {/* Tab 1: GIS Map View */}
            <div
              className="w-full h-full"
              style={{ display: activeTab === 'map' ? 'block' : 'none' }}
            >
              <CadMap
                geoJsonData={geoJsonData}
                customCadFeatures={customCadFeatures}
                roadOverlay={roadOverlay}
                mapStyle={mapStyle}
                showGeometry={showGeometry}
                showVertices={showVertices}
                showCenterline={showCenterline}
                showRoadSurface={showRoadSurface}
                showEdges={showEdges}
                showStations={showStations}
                showSlabs={showSlabs}
                showSlabLabels={showSlabLabels}
                completedSegments={completedSegments}
                focusedSegment={focusedSegment}
                roadParams={roadParams}
                crsConfig={{
                  centralMeridian: inspectorBridge.centralMeridian,
                  scaleFactor: inspectorBridge.scaleFactor,
                  axisOrder: inspectorBridge.axisOrder,
                  crsConfigured: inspectorBridge.crsConfigured,
                }}
                coordDisplayMode={coordDisplayMode}
                onCoordDisplayModeChange={setCoordDisplayMode}
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
                  geoJsonData={exportGeoJson}
                  roadParams={roadParams}
                />
              </div>
            )}

            {/* Tab 4: GeoJSON Inspector (RFC 7946) */}
            {activeTab === 'json' && (
              <div className="w-full h-full flex flex-col bg-[#0B1220] overflow-hidden select-text">
                {/* GeoJSON Inspector Header & RFC 7946 Telemetry */}
                <div className="shrink-0 bg-[#111D2E] border-b border-[#27384E] px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 select-none">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-8 h-8 rounded-lg bg-[#17263C] border border-[#27384E] flex items-center justify-center text-[#22B7C9]">
                      <Database size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-bold text-[#E8EEF6] uppercase tracking-wide">
                          Cấu Trúc Không Gian GeoJSON (Chuẩn RFC 7946)
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#39B58A]/15 text-[#39B58A] border border-[#39B58A]/30">
                          <ShieldCheck className="w-3 h-3" /> WGS-84 [Lon, Lat]
                        </span>
                      </div>
                      {exportGeoJson && (
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[11.5px] text-[#A9B9CE] font-mono tabular-nums mt-0.5">
                          <span>Features: <strong className="text-[#E8EEF6]">{exportGeoJson.features?.length || 0}</strong></span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            Bbox:
                            <span className="px-1.5 py-0.2 rounded bg-[#0B1220] border border-[#27384E] text-[#22B7C9] text-[10.5px]">
                              {Array.isArray(exportGeoJson.bbox)
                                ? `[${exportGeoJson.bbox.map((v) => Number(v).toFixed(5)).join(', ')}]`
                                : 'N/A'}
                            </span>
                          </span>
                          <span>•</span>
                          <span>{(JSON.stringify(exportGeoJson).length / 1024).toFixed(1)} KB</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {exportGeoJson && (
                    <div className="flex items-center gap-2">
                      {isSurfaceAreaProvisional && inspectorBridge.onRecomputeWidth && (
                        <button
                          type="button"
                          onClick={inspectorBridge.onRecomputeWidth}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#F59E0B] text-[#0B1220] cursor-pointer"
                        >
                          <RefreshCw size={13} />
                          <span>Dựng lại theo B = {normalizedParams.roadWidth}m</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleCopyGeoJson}
                        disabled={isGeoJsonExportBlocked}
                        title={getExportBlockedReason('geojson') || 'Sao Chép Toàn Bộ GeoJSON (RFC 7946)'}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold transition-all border ${
                          isGeoJsonExportBlocked
                            ? 'bg-[#17263C]/50 text-[#7E92AA] border-[#27384E] cursor-not-allowed'
                            : 'bg-[#22B7C9] hover:bg-[#35CBE0] text-[#0B1220] border-[#22B7C9] font-bold cursor-pointer'
                        }`}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copied ? 'Đã Sao Chép!' : 'Sao Chép GeoJSON'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadGeoJsonFile}
                        disabled={isGeoJsonExportBlocked}
                        title={getExportBlockedReason('geojson') || 'Tải Tệp GeoJSON (RFC 7946)'}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold transition-all border ${
                          isGeoJsonExportBlocked
                            ? 'bg-[#17263C]/50 text-[#7E92AA] border-[#27384E] cursor-not-allowed'
                            : 'bg-[#17263C] hover:bg-[#1E314D] border-[#27384E] text-[#E8EEF6] cursor-pointer'
                        }`}
                      >
                        <Download size={14} className="text-[#22B7C9]" />
                        <span>Tải Tệp .geojson</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowRoadGuardDraftModal(true)}
                        disabled={isDraftExportBlocked}
                        title={getExportBlockedReason('draft') || 'Xuất RoadGuard Draft (.json)'}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-bold transition-all border ${
                          isDraftExportBlocked
                            ? 'bg-[#17263C]/50 text-[#7E92AA] border-[#27384E] cursor-not-allowed'
                            : 'bg-[#F06421] hover:bg-[#FF7635] border-[#F06421] text-white cursor-pointer'
                        }`}
                      >
                        <Compass size={14} />
                        <span>Xuất RoadGuard Draft (.json)</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* GeoJSON Content Area */}
                <div className="flex-1 p-6 overflow-auto font-mono text-[12.5px] select-text">
                  {exportGeoJson ? (
                    <div className="max-w-5xl mx-auto space-y-3">
                      {isSurfaceAreaProvisional && (
                        <div className="p-3.5 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/50 flex items-center justify-between gap-3 font-sans">
                          <div className="flex items-center gap-2.5 text-[12.5px] text-[#E8EEF6]">
                            <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                            <span>
                              Bề rộng mặt đường đã thay đổi ({analyzedRoadWidth}m →{' '}
                              {normalizedParams.roadWidth}m). Hãy phân tích lại để cập nhật đa giác RoadSurface chính thức trước khi xuất file.
                            </span>
                          </div>
                        </div>
                      )}
                      <pre className="p-5 rounded-xl bg-[#111D2E] border border-[#27384E] shadow-xl overflow-x-auto whitespace-pre font-mono text-[12px] text-[#E8EEF6] select-text cursor-text leading-relaxed">
                        {formattedJsonPreview}
                      </pre>
                      {!showFullJson &&
                        JSON.stringify(exportGeoJson, null, 2).length > 45000 && (
                          <div className="text-center pt-2 font-sans">
                            <button
                              type="button"
                              onClick={() => setShowFullJson(true)}
                              className="px-4 py-2 rounded-lg bg-[#17263C] hover:bg-[#1E314D] border border-[#27384E] text-[12.5px] font-semibold text-[#22B7C9] cursor-pointer"
                            >
                              Hiển thị toàn bộ JSON đầy đủ
                            </button>
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[#A9B9CE] gap-3 select-none font-sans">
                      <div className="w-14 h-14 rounded-2xl bg-[#111D2E] border border-[#27384E] flex items-center justify-center text-[#22B7C9]">
                        <Database size={28} />
                      </div>
                      <p className="text-[15px] font-bold text-[#E8EEF6]">
                        Chưa có dữ liệu GeoJSON (RFC 7946)
                      </p>
                      <p className="text-[13px] text-[#A9B9CE]">
                        Nạp bản vẽ CAD hoặc tọa độ VN-2000 và bấm Phân Tích & Dựng Tuyến để kiểm tra cấu trúc không gian.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Column 3: Right Inspector & Export Panel */}
        {!inspectorCollapsed && (
          <RightInspectorPanel
            geoJsonData={geoJsonData}
            analyticsData={analyticsData}
            roadParams={roadParams}
            layerVisibility={layerVisibility}
            onToggleLayer={handleToggleGisLayer}
            completedSegments={completedSegments}
            onToggleSegment={handleToggleSegment}
            onSelectAllSegments={(ids) => setCompletedSegments(ids)}
            onClearAllSegments={() => setCompletedSegments([])}
            onFocusSegment={handleFocusSegmentById}
            cadLayerStats={inspectorBridge.cadLayerStats}
            cadLayerVisibility={inspectorBridge.cadLayerVisibility}
            loadingLayers={inspectorBridge.loadingLayers}
            onToggleCadLayer={inspectorBridge.onToggleCadLayer}
            onToggleAllCadLayers={inspectorBridge.onToggleAllCadLayers}
            selectedCadLayer={inspectorBridge.selectedCadLayer}
            onSelectCadLayerForParse={inspectorBridge.onSelectCadLayerForParse}
            centralMeridian={inspectorBridge.centralMeridian}
            scaleFactor={inspectorBridge.scaleFactor}
            axisOrder={inspectorBridge.axisOrder}
            sourceDataKind={inspectorBridge.sourceDataKind}
            crsConfigured={inspectorBridge.crsConfigured}
            coordDisplayMode={coordDisplayMode}
            onCoordDisplayModeChange={setCoordDisplayMode}
            onOpenRoadGuardDraftModal={() => setShowRoadGuardDraftModal(true)}
            onRecomputeWidth={inspectorBridge.onRecomputeWidth}
            isLoading={inspectorBridge.isLoading}
            onCollapse={() => setInspectorCollapsed(true)}
          />
        )}
      </div>

      {/* ── 3. Bottom Engineering Telemetry Status Strip (30px, 12.5px legible font) ── */}
      <footer className="h-[30px] shrink-0 bg-[#0B1220] border-t border-[#27384E] px-4 flex items-center justify-between text-[12.5px] font-mono text-[#A9B9CE] select-none z-30">
        <div className="flex items-center gap-3.5 min-w-0 overflow-hidden">
          <span className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                inspectorBridge.sourceDataKind === 'wgs84' ? 'bg-[#22B7C9]' : 'bg-[#39B58A]'
              }`}
            />
            {inspectorBridge.sourceDataKind === 'wgs84' ? (
              <span>
                Nguồn đầu vào: <strong className="text-[#38BDF8]">WGS-84 (EPSG:4326)</strong>
                <span className="text-[#8FA3BA] ml-1.5">
                  • Hiển thị kỹ thuật:{' '}
                  {inspectorBridge.crsConfigured && inspectorBridge.centralMeridian
                    ? `VN-2000 (L₀=${inspectorBridge.centralMeridian}°, k₀=${inspectorBridge.scaleFactor})`
                    : 'VN-2000 (Chưa cấu hình L₀)'}
                </span>
              </span>
            ) : (
              <span>
                Nguồn đầu vào:{' '}
                <strong className="text-[#E8EEF6]">
                  {inspectorBridge.sourceDataKind === 'coords'
                    ? 'Tọa độ VN-2000'
                    : 'Bản vẽ CAD (.DXF)'}
                  {inspectorBridge.crsConfigured && inspectorBridge.centralMeridian
                    ? ` (L₀=${inspectorBridge.centralMeridian}°, k₀=${inspectorBridge.scaleFactor})`
                    : ''}
                </strong>
                <span className="text-[#8FA3BA] ml-1.5">
                  → Hiển thị GIS: <strong className="text-[#22B7C9]">WGS-84 (EPSG:4326)</strong>
                </span>
              </span>
            )}
          </span>
          <span className="hidden xl:inline text-[#27384E]">|</span>
          <span className="hidden xl:inline shrink-0">
            Tiêu chuẩn: <span className="text-[#E8EEF6]">TCVN 4054:2005 &amp; RFC 7946</span>
          </span>
          {vertexCount > 0 && (
            <>
              <span className="hidden 2xl:inline text-[#27384E]">|</span>
              <span className="hidden 2xl:inline tabular-nums shrink-0">
                Đỉnh hình học: <strong className="text-[#22B7C9]">{vertexCount}</strong>
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3.5 shrink-0">
          {isLive && (
            <>
              <span className="tabular-nums">
                L = <strong className="text-[#E8EEF6]">{totalLengthVal.toFixed(2)}m</strong>
              </span>
              <span className="text-[#27384E]">|</span>
              <span className="tabular-nums">
                B = <strong className="text-[#F06421]">{normalizedParams.roadWidth.toFixed(2)}m</strong>
              </span>
              <span className="hidden sm:inline text-[#27384E]">|</span>
              <span className="hidden sm:inline tabular-nums">
                S(L×B) ={' '}
                <strong className="text-[#E8EEF6]">
                  {nominalAreaVal.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}m²
                </strong>
              </span>
              <span className="hidden md:inline text-[#27384E]">|</span>
              <span className="hidden md:inline tabular-nums">
                S(Đa giác) ={' '}
                <strong
                  className={
                    isSurfaceAreaProvisional ? 'text-[#F59E0B]' : 'text-[#39B58A]'
                  }
                >
                  {surfaceAreaVal.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}m²
                  {isSurfaceAreaProvisional ? ' (Tạm tính)' : ''}
                </strong>
              </span>
            </>
          )}
        </div>
      </footer>

      {/* ── RoadGuard Geometry Draft Export Modal ── */}
      <RoadGuardDraftExportModal
        isOpen={showRoadGuardDraftModal}
        onClose={() => setShowRoadGuardDraftModal(false)}
        geoJsonData={exportGeoJson}
        roadParams={normalizedParams}
        isSurfaceAreaProvisional={isSurfaceAreaProvisional}
        analyzedRoadWidth={analyzedRoadWidth}
        isCrsStale={isCrsStale}
        crsLifecycleState={crsLifecycleState}
      />

      {/* ── Toast Notifications ── */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#111D2E',
            color: '#E8EEF6',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            border: '1px solid #27384E',
            borderRadius: '10px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.75)',
          },
        }}
      />
    </div>
  )
}
