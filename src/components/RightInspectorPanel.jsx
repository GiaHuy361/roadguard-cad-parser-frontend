import { useState, useMemo } from 'react'
import {
  BarChart3,
  Layers,
  Navigation,
  FileSpreadsheet,
  Download,
  Eye,
  EyeOff,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  RefreshCw,
  Compass,
  Ruler,
  Grid,
  MapPin,
  ChevronRight,
  ShieldCheck,
  Lock,
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { downloadExcelReport } from '../utils/excelExporter'
import {
  enrichGeoJsonWithEngineeringFeatures,
  normalizeRoadParams,
} from '../utils/roadEngineeringBuilder'
import {
  wgs84ToVn2000,
  vn2000ToWgs84,
} from '../utils/crsTransformEngine'

const LAYER_CATEGORIES = {
  ALL: { label: 'Tất cả' },
  CENTER: { label: 'Tim tuyến', keywords: ['tim', 'center', 'truc', 'tuyen'] },
  EDGE: { label: 'Mép đường', keywords: ['mep', 'nhua', 'betong', 'lề', 'le', 'via', 'curb', 'road', 'duong'] },
  DRAIN: { label: 'Thoát nước', keywords: ['cong', 'ranh', 'thoat', 'nuoc', 'drain', 'culvert', 'ho ga'] },
  BUILD: { label: 'Công trình', keywords: ['nha', 'tuong', 'cong trinh', 'building', 'house', 'khu'] },
  OTHER: { label: 'Khác', keywords: [] },
}

function categorizeLayer(layerName) {
  const lower = (layerName || '').toLowerCase()
  for (const [key, cat] of Object.entries(LAYER_CATEGORIES)) {
    if (key === 'ALL' || key === 'OTHER') continue
    if (cat.keywords.some((k) => lower.includes(k))) return key
  }
  return 'OTHER'
}

export default function RightInspectorPanel({
  geoJsonData,
  analyticsData,
  roadParams,
  layerVisibility = {
    surface: true,
    slabs: true,
    slabLabels: false,
    centerline: true,
    edges: true,
    stations: true,
    vertices: false,
  },
  onToggleLayer,
  completedSegments = [],
  onToggleSegment,
  onSelectAllSegments,
  onClearAllSegments,
  onFocusSegment,
  cadLayerStats = [],
  cadLayerVisibility = {},
  loadingLayers = {},
  onToggleCadLayer,
  onToggleAllCadLayers,
  selectedCadLayer = '',
  onSelectCadLayerForParse,
  centralMeridian = '',
  scaleFactor = '0.9999',
  axisOrder = 'AUTO',
  sourceDataKind = 'cad',
  crsConfigured = true,
  crsLifecycleState = 'VALID_APPLIED',
  isCrsStale = false,
  coordDisplayMode = 'DUAL',
  onCoordDisplayModeChange = null,
  onOpenRoadGuardDraftModal = null,
  onRecomputeWidth,
  isLoading = false,
  onCollapse,
}) {
  const [convDirection, setConvDirection] = useState('WGS84_TO_VN2000')
  const [convLon, setConvLon] = useState('106.68755894')
  const [convLat, setConvLat] = useState('10.77249051')
  const [convXNorth, setConvXNorth] = useState('1191450.25')
  const [convYEast, setConvYEast] = useState('602340.125')
  const [scheduleType, setScheduleType] = useState('stations') // 'stations' | 'vertices'
  const [activeSubTab, setActiveSubTab] = useState('metrics')
  const [layerSearch, setLayerSearch] = useState('')
  const [layerCategory, setLayerCategory] = useState('ALL')

  const normalizedParams = useMemo(() => normalizeRoadParams(roadParams), [roadParams])



  const enrichedBundle = useMemo(() => {
    if (!geoJsonData) return null
    return enrichGeoJsonWithEngineeringFeatures(geoJsonData, normalizedParams, [], completedSegments)
  }, [geoJsonData, normalizedParams, completedSegments])

  const effectiveGeoJson = enrichedBundle?.geoJson || geoJsonData
  const stats = enrichedBundle?.analytics || analyticsData || effectiveGeoJson?.analytics || {}
  const dynamicSegments = enrichedBundle?.droneSegments || []

  const hasGeometry = Boolean(
    effectiveGeoJson?.features?.length > 0 || Number(stats.totalLengthMeters) > 0
  )

  const isWgs84Source =
    sourceDataKind === 'wgs84' || effectiveGeoJson?.sourceDataKind === 'WGS84_IMPORT'
  const isCoordsSource =
    sourceDataKind === 'coords' || effectiveGeoJson?.sourceDataKind === 'VN2000_COORDS'
  const isSurfaceAreaProvisional = Boolean(stats.isSurfaceAreaProvisional)
  const analyzedRoadWidth = Number(stats.analyzedRoadWidth || normalizedParams.roadWidth)

  const getExportBlockedReason = (targetFormat = 'all') => {
    if (isSurfaceAreaProvisional) {
      return `Bề rộng mặt đường đã đổi từ ${analyzedRoadWidth}m sang ${normalizedParams.roadWidth}m. Hãy bấm Cập Nhật & Dựng Lại Mặt Đường trước khi xuất dữ liệu chính thức.`
    }
    // If source data is native WGS-84, GeoJSON export does not require VN-2000 CRS
    if (isWgs84Source && targetFormat === 'geojson') {
      return null
    }
    if (crsLifecycleState === 'UNCONFIGURED') {
      return 'Hệ quy chiếu VN-2000 chưa được cấu hình. Vui lòng chọn L₀ trước khi xuất dữ liệu.'
    }
    if (crsLifecycleState === 'INVALID_CONFIG') {
      return 'Tham số CRS không hợp lệ (L₀ phải từ 100° đến 112°).'
    }
    if (isCrsStale) {
      return 'Cấu hình CRS đã thay đổi (STALE). Hãy bấm Phân Tích Lại trước khi xuất.'
    }
    return null
  }

  const isGeoJsonExportBlocked = Boolean(getExportBlockedReason('geojson'))
  const isExcelExportBlocked = Boolean(getExportBlockedReason('excel'))
  const isExportBlocked = isExcelExportBlocked

  const isSyntheticSample = useMemo(() => {
    if (!effectiveGeoJson) return false
    if (effectiveGeoJson.isSyntheticSample || effectiveGeoJson.properties?.isSyntheticSample) return true
    if (effectiveGeoJson.features) {
      return effectiveGeoJson.features.some(
        (f) =>
          f.properties?.isSyntheticSample ||
          f.properties?.roadCode === 'GEO-GJ-20261025-01' ||
          String(f.properties?.warning || '').includes('MINH HỌA')
      )
    }
    return false
  }, [effectiveGeoJson])

  const activeLayerStats = useMemo(() => {
    const rawList =
      (Array.isArray(cadLayerStats) && cadLayerStats.length > 0 && cadLayerStats) ||
      (Array.isArray(effectiveGeoJson?.layerStats) && effectiveGeoJson.layerStats.length > 0 && effectiveGeoJson.layerStats) ||
      (Array.isArray(analyticsData?.layerBreakdown) && analyticsData.layerBreakdown) ||
      null

    if (rawList) {
      return rawList
        .map((item) => {
          const name = item.name || item.layer || 'UNKNOWN'
          const count = Number(item.count ?? item.entityCount ?? 0)
          return {
            name,
            count,
            category: categorizeLayer(name),
          }
        })
        .sort((a, b) => b.count - a.count)
    }

    const rawObj =
      effectiveGeoJson?.layerStats ||
      analyticsData?.layerStats ||
      geoJsonData?.layerStats ||
      null

    if (rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj)) {
      return Object.entries(rawObj)
        .map(([name, count]) => ({
          name,
          count: Number(count) || 0,
          category: categorizeLayer(name),
        }))
        .sort((a, b) => b.count - a.count)
    }

    return []
  }, [cadLayerStats, effectiveGeoJson, analyticsData, geoJsonData])

  const filteredCadLayers = useMemo(() => {
    return activeLayerStats.filter((item) => {
      const matchSearch =
        !layerSearch.trim() ||
        item.name.toLowerCase().includes(layerSearch.trim().toLowerCase())
      const matchCat = layerCategory === 'ALL' || item.category === layerCategory
      return matchSearch && matchCat
    })
  }, [activeLayerStats, layerSearch, layerCategory])

  const handleExportGeoJson = () => {
    if (!effectiveGeoJson) {
      toast.error('Chưa có dữ liệu GeoJSON để tải xuống.')
      return
    }
    const blockedReason = getExportBlockedReason('geojson')
    if (blockedReason) {
      toast.error(blockedReason, { duration: 5000 })
      return
    }
    try {
      const exportPayload = {
        type: 'FeatureCollection',
        bbox: effectiveGeoJson.bbox || null,
        crsMetadata: effectiveGeoJson.crsMetadata || {
          sourceCrs: 'VN-2000',
          targetCrs: 'EPSG:4326 (WGS-84)',
          centralMeridian: Number.isFinite(Number(centralMeridian)) && Number(centralMeridian) > 0 ? Number(centralMeridian) : null,
          scaleFactor: Number(scaleFactor) || 0.9999,
          axisOrder,
        },
        engineeringMetrics: stats,
        features: effectiveGeoJson.features || [],
      }
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/geo+json;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'CAD_GIS_Studio_Corridor_RFC7946.geojson'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Đã xuất file GeoJSON chuẩn RFC 7946 thành công!')
    } catch (err) {
      toast.error('Lỗi khi xuất GeoJSON: ' + err.message)
    }
  }

  const handleExportExcel = () => {
    const blockedReason = getExportBlockedReason('excel')
    if (blockedReason) {
      toast.error(blockedReason, { duration: 5000 })
      return
    }
    downloadExcelReport({
      geoJsonData: effectiveGeoJson,
      analyticsData: stats,
      roadParams: normalizedParams,
    })
  }

  const isVn2000Ready =
    crsConfigured !== false &&
    Boolean(centralMeridian) &&
    Number.isFinite(Number(centralMeridian)) &&
    Number(centralMeridian) >= 100 &&
    Number(centralMeridian) <= 112

  const liveConversionResult = useMemo(() => {
    if (!isVn2000Ready) {
      return {
        valid: false,
        error:
          'Chưa cấu hình hệ quy chiếu VN-2000 (cần kinh tuyến trục L₀ & múi chiếu).',
      }
    }
    const cfg = {
      centralMeridian: Number(centralMeridian),
      scaleFactor: Number(scaleFactor) || 0.9999,
    }
    if (convDirection === 'WGS84_TO_VN2000') {
      return wgs84ToVn2000(Number(convLon), Number(convLat), cfg)
    }
    return vn2000ToWgs84(Number(convYEast), Number(convXNorth), cfg)
  }, [
    isVn2000Ready,
    centralMeridian,
    scaleFactor,
    convDirection,
    convLon,
    convLat,
    convXNorth,
    convYEast,
  ])

  const coordinateScheduleRows = useMemo(() => {
    if (!effectiveGeoJson?.features) return []
    const cfg = isVn2000Ready
      ? {
          centralMeridian: Number(centralMeridian),
          scaleFactor: Number(scaleFactor) || 0.9999,
        }
      : null

    if (scheduleType === 'stations') {
      const stations = effectiveGeoJson.features.filter(
        (f) =>
          f.geometry?.type === 'Point' &&
          f.properties?.type === 'StationMilestone'
      )
      return stations.map((st, idx) => {
        const [lon, lat] = st.geometry.coordinates
        const vn = cfg ? wgs84ToVn2000(lon, lat, cfg) : { valid: false }
        return {
          code: st.properties?.name || `Km0+${idx * 100}`,
          distMeters: st.properties?.distMeters ?? idx * 100,
          lon: Number(lon),
          lat: Number(lat),
          vn2000: vn.valid ? vn : null,
        }
      })
    }

    const cl =
      effectiveGeoJson.features.find(
        (f) =>
          f.geometry?.type === 'LineString' &&
          (f.properties?.type === 'Centerline' ||
            f.properties?.layer === 'TIM_TUYEN_CHINH')
      ) ||
      effectiveGeoJson.features.find((f) => f.geometry?.type === 'LineString')
    const coords = cl?.geometry?.coordinates || []
    return coords.slice(0, 200).map((c, idx) => {
      const lon = Number(c[0])
      const lat = Number(c[1])
      const vn = cfg ? wgs84ToVn2000(lon, lat, cfg) : { valid: false }
      return {
        code: `V-${String(idx + 1).padStart(3, '0')}`,
        distMeters: null,
        lon,
        lat,
        vn2000: vn.valid ? vn : null,
      }
    })
  }, [
    effectiveGeoJson,
    scheduleType,
    isVn2000Ready,
    centralMeridian,
    scaleFactor,
  ])

  const totalLen = Number(stats.totalLengthMeters || 0)
  const nominalArea = Number(stats.nominalAreaSqm || totalLen * normalizedParams.roadWidth)
  const surfaceArea = Number(stats.surfaceAreaSqm || nominalArea)
  const totalSlabs = Number(stats.estimatedConcreteSlabs || 0)
  const longitudinalSlabs = Number(stats.longitudinalSlabs || 0)
  const stationCount = Number(stats.stationCount || 0)
  const roadSegCount = Number(stats.roadSegments || dynamicSegments.length || 0)
  const completedCount = completedSegments.length
  const progressPct =
    dynamicSegments.length > 0
      ? Math.round((completedCount / dynamicSegments.length) * 100)
      : 0

  return (
    <aside className="w-[340px] max-w-full h-full bg-[#111D2E] border-l border-[#27384E] flex flex-col select-none text-[#E8EEF6] shrink-0">
      {/* ── Panel Header ── */}
      <div className="h-[42px] px-4 border-b border-[#27384E] bg-[#0B1220]/50 flex items-center justify-between shrink-0">
        <h2 className="text-[12.5px] font-bold tracking-wider uppercase text-[#E8EEF6]">
          Thông Số &amp; Lớp Bản Đồ
        </h2>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Thu gọn bảng thông số"
            className="p-1.5 rounded text-[#A9B9CE] hover:text-[#E8EEF6] hover:bg-[#17263C] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Sub-navigation Tabs (Equal 4-column responsive grid) ── */}
      <div className="bg-[#0B1220]/80 border-b border-[#27384E] p-1 grid grid-cols-4 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveSubTab('metrics')}
          title="Khối lượng & số liệu thiết kế kỹ thuật mặt đường"
          className={`min-w-0 flex items-center justify-center gap-1 py-2 px-0.5 sm:px-1 rounded-md text-[11.5px] font-semibold transition-all cursor-pointer ${
            activeSubTab === 'metrics'
              ? 'bg-[#17263C] text-[#E8EEF6] shadow-sm border border-[#2E435E]'
              : 'text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#111D2E]'
          }`}
        >
          <span className="truncate">Khối lượng</span>
          {isSurfaceAreaProvisional && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] shrink-0" title="Cần phân tích lại mặt đường" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('layers')}
          title="Quản lý và hiển thị các lớp CAD/GIS"
          className={`min-w-0 flex items-center justify-center gap-1 py-2 px-0.5 sm:px-1 rounded-md text-[11.5px] font-semibold transition-all cursor-pointer ${
            activeSubTab === 'layers'
              ? 'bg-[#17263C] text-[#E8EEF6] shadow-sm border border-[#2E435E]'
              : 'text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#111D2E]'
          }`}
        >
          <span className="truncate">Lớp CAD</span>
          {activeLayerStats.length > 0 && (
            <span className="text-[9.5px] font-mono px-1 py-0 rounded-full bg-[#22B7C9]/15 text-[#22B7C9] tabular-nums font-bold shrink-0">
              {activeLayerStats.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('segments')}
          title="Phân đoạn khảo sát và theo dõi thi công"
          className={`min-w-0 flex items-center justify-center gap-1 py-2 px-0.5 sm:px-1 rounded-md text-[11.5px] font-semibold transition-all cursor-pointer ${
            activeSubTab === 'segments'
              ? 'bg-[#17263C] text-[#E8EEF6] shadow-sm border border-[#2E435E]'
              : 'text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#111D2E]'
          }`}
        >
          <span className="truncate">Phân đoạn</span>
          {dynamicSegments.length > 0 && (
            <span className="text-[9.5px] font-mono px-1 py-0 rounded-full bg-[#39B58A]/15 text-[#39B58A] tabular-nums font-bold shrink-0">
              {dynamicSegments.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('coords')}
          title="Tra cứu & chuyển đổi tọa độ VN-2000 / WGS-84"
          className={`min-w-0 flex items-center justify-center gap-1 py-2 px-0.5 sm:px-1 rounded-md text-[11.5px] font-semibold transition-all cursor-pointer ${
            activeSubTab === 'coords'
              ? 'bg-[#17263C] text-[#E8EEF6] shadow-sm border border-[#2E435E]'
              : 'text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#111D2E]'
          }`}
        >
          <span className="truncate">Tọa độ</span>
        </button>
      </div>

      {/* ── Scrollable Tab Body ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ════════════ TAB 1: METRICS & EXPORT ════════════ */}
        {activeSubTab === 'metrics' && (
          <>
            {!hasGeometry ? (
              <div className="p-5 rounded-md bg-[#0B1220]/60 border border-[#27384E] text-center space-y-2 my-3">
                <Ruler className="w-5 h-5 text-[#8FA3BA] mx-auto" />
                <h3 className="text-[13.5px] font-semibold text-[#E8EEF6]">
                  Chưa có số liệu hình học tuyến
                </h3>
                <p className="text-[12.5px] text-[#A9B9CE] leading-relaxed">
                  Nạp bản vẽ AutoCAD (<code className="font-mono">.dxf</code>) hoặc nhập tọa độ VN-2000 ở bảng cấu hình bên trái và bấm{' '}
                  <span className="text-[#F06421] font-semibold">Phân Tích &amp; Dựng Tuyến</span>.
                </p>
              </div>
            ) : (
              <>
                {/* Provisional Polygon Area Warning Banner */}
                {isSurfaceAreaProvisional && (
                  <div className="p-3 rounded-md bg-[#F59E0B]/10 border border-[#F59E0B]/60 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-[12.5px] font-bold text-[#F59E0B]">
                          Bề rộng mặt đường đã thay đổi ({analyzedRoadWidth}m → {normalizedParams.roadWidth}m)
                        </h4>
                        <p className="text-[12.5px] text-[#E8EEF6]/90 leading-relaxed">
                          Diện tích đa giác mặt đường hiện đang là <strong>tạm tính theo tỷ lệ</strong>. Không xuất hồ sơ chính thức khi chưa dựng lại đa giác từ Backend.
                        </p>
                      </div>
                    </div>
                    {onRecomputeWidth && (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={onRecomputeWidth}
                        className="w-full py-2 px-3 rounded-md bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-[#0B1220] font-bold text-[12.5px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        <span>Phân Tích Lại Theo B = {normalizedParams.roadWidth}m</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Synthetic Benchmark Sample Banner */}
                {isSyntheticSample && (
                  <div className="p-3 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/60 text-[#F59E0B] space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[12.5px]">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#F59E0B]" />
                      <span>DỮ LIỆU MINH HỌA – KHÔNG PHẢI TIM TUYẾN THỰC ĐỊA</span>
                    </div>
                    <div className="text-[11.5px] text-[#CBD5E1] leading-relaxed">
                      Tuyến mẫu 3 điểm hình chữ L (204.03 m) chỉ phục vụ kiểm thử tính toán CRS, GeoJSON, dựng hình học và xuất JSON. Tọa độ minh họa không bám theo tim đường giao thông thực tế.
                    </div>
                  </div>
                )}

                {/* Primary KPI Cards */}
                <div className="space-y-2.5">
                  <div className="text-[12px] font-bold uppercase tracking-wider text-[#A9B9CE]">
                    Chỉ số hình học &amp; Kết cấu
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-md bg-[#17263C] border border-[#27384E]">
                      <div className="text-[12.5px] text-[#C0CEDF] font-medium">
                        Chiều dài tim (L)
                      </div>
                      <div className="mt-1 text-[17px] font-bold font-mono tabular-nums text-[#E8EEF6]">
                        {totalLen.toLocaleString('vi-VN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span className="text-[12.5px] font-normal text-[#22B7C9]">m</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-[#8FA3BA]">
                        {isWgs84Source ? 'Trắc địa WGS-84 / UTM' : 'Hệ phẳng VN-2000'}
                      </div>
                    </div>

                    <div className="p-3 rounded-md bg-[#17263C] border border-[#27384E]">
                      <div className="text-[12.5px] text-[#C0CEDF] font-medium">
                        Bề rộng mặt (B)
                      </div>
                      <div className="mt-1 text-[17px] font-bold font-mono tabular-nums text-[#E8EEF6]">
                        {normalizedParams.roadWidth.toFixed(2)}{' '}
                        <span className="text-[12.5px] font-normal text-[#F06421]">m</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-[#8FA3BA] tabular-nums">
                        {normalizedParams.laneCount} dải × {normalizedParams.slabWidth.toFixed(2)}m
                      </div>
                    </div>
                  </div>

                  {/* Area Comparison Card: Nominal LxB vs Planar Polygon */}
                  <div className="p-3 rounded-md bg-[#17263C] border border-[#27384E] space-y-2.5">
                    <div className="flex items-center justify-between border-b border-[#27384E] pb-2">
                      <div>
                        <div className="text-[12.5px] text-[#C0CEDF] font-medium">
                          Diện tích danh định (L × B)
                        </div>
                        <div className="text-[12px] text-[#8FA3BA] tabular-nums">
                          {totalLen.toFixed(2)}m × {normalizedParams.roadWidth.toFixed(2)}m
                        </div>
                      </div>
                      <div className="text-[15px] font-bold font-mono tabular-nums text-[#E8EEF6]">
                        {nominalArea.toLocaleString('vi-VN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span className="text-[12px] font-normal text-[#A9B9CE]">m²</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-0.5">
                      <div>
                        <div className="text-[12.5px] text-[#E8EEF6] font-semibold">
                          Diện tích đa giác phẳng
                        </div>
                        <div className="text-[12px] mt-0.5">
                          {isSurfaceAreaProvisional ? (
                            <span className="text-[#F59E0B] font-medium">
                              Tạm tính (Chưa dựng lại B)
                            </span>
                          ) : (
                            <span className="text-[#39B58A] font-medium">
                              Chính thức (Polygon CAD)
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={`text-[15px] font-bold font-mono tabular-nums ${
                          isSurfaceAreaProvisional ? 'text-[#F59E0B]' : 'text-[#39B58A]'
                        }`}
                      >
                        {surfaceArea.toLocaleString('vi-VN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span className="text-[12px] font-normal">m²</span>
                      </div>
                    </div>
                  </div>

                  {/* Concrete Slabs & Stations Card */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-md bg-[#17263C] border border-[#27384E]">
                      <div className="text-[12.5px] text-[#C0CEDF] font-medium">
                        Tổng tấm BTXM
                      </div>
                      <div className="mt-1 text-[16px] font-bold font-mono tabular-nums text-[#E8EEF6]">
                        {totalSlabs.toLocaleString('vi-VN')}{' '}
                        <span className="text-[12px] font-normal text-[#A9B9CE]">tấm</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-[#8FA3BA] tabular-nums">
                        {longitudinalSlabs} hàng × {normalizedParams.laneCount} dải ({normalizedParams.slabLength}m)
                      </div>
                    </div>

                    <div className="p-3 rounded-md bg-[#17263C] border border-[#27384E]">
                      <div className="text-[12.5px] text-[#C0CEDF] font-medium">
                        Cọc &amp; Phân đoạn
                      </div>
                      <div className="mt-1 text-[16px] font-bold font-mono tabular-nums text-[#E8EEF6]">
                        {stationCount} <span className="text-[12px] font-normal text-[#A9B9CE]">cọc</span>{' '}
                        / {roadSegCount} <span className="text-[12px] font-normal text-[#A9B9CE]">đoạn</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-[#8FA3BA] tabular-nums">
                        Bước cọc L = {normalizedParams.segmentLength}m
                      </div>
                    </div>
                  </div>
                </div>

                {/* CRS & Spatial Telemetry Summary (Phản ánh đúng theo nguồn dữ liệu thực tế) */}
                <div className="p-3 rounded-md bg-[#0B1220] border border-[#27384E] space-y-2 text-[12.5px]">
                  <div className="font-bold text-[#A9B9CE] uppercase tracking-wider text-[11.5px]">
                    Hệ quy chiếu &amp; Nguồn dữ liệu
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#27384E]/60">
                    <span className="text-[#8FA3BA]">Nguồn dữ liệu đầu vào:</span>
                    <span className="font-mono font-semibold text-[#E8EEF6]">
                      {isWgs84Source
                        ? 'WGS-84 (EPSG:4326)'
                        : isCoordsSource
                        ? 'Tọa độ VN-2000'
                        : 'Bản vẽ CAD (.DXF)'}
                    </span>
                  </div>
                  {isWgs84Source ? (
                    <>
                      <div className="flex justify-between py-1 border-b border-[#27384E]/60">
                        <span className="text-[#8FA3BA]">Hiển thị kỹ thuật VN-2000:</span>
                        <span className="font-mono text-[#39B58A] tabular-nums text-right">
                          {isVn2000Ready
                            ? `VN-2000 (L₀ = ${centralMeridian}°, ${
                                Math.abs(Number(scaleFactor) - 0.9996) < 1e-4 ? 'Múi 6°' : 'Múi 3°'
                              })`
                            : 'Chưa cấu hình VN-2000 (Chỉ dùng WGS-84)'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#27384E]/60">
                        <span className="text-[#8FA3BA]">Hệ tọa độ hiển thị GIS:</span>
                        <span className="font-mono text-[#22B7C9]">WGS-84 (EPSG:4326 - MapLibre)</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between py-1 border-b border-[#27384E]/60">
                        <span className="text-[#8FA3BA]">Hệ tọa độ nguồn VN-2000:</span>
                        <span className="font-mono font-semibold text-[#E8EEF6] tabular-nums text-right">
                          VN-2000 (L₀ = {stats.centralMeridian || centralMeridian}°, {
                            Math.abs(Number(stats.scaleFactor || scaleFactor) - 0.9996) < 1e-4
                              ? 'Múi 6°'
                              : 'Múi 3°'
                          })
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#27384E]/60">
                        <span className="text-[#8FA3BA]">Hệ tọa độ chuyển đổi hiển thị:</span>
                        <span className="font-mono text-[#22B7C9]">WGS-84 (EPSG:4326 - MapLibre)</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[#8FA3BA]">Dữ liệu cao độ Z:</span>
                    <span className="text-[#E8EEF6] font-medium">
                      {stats.hasAuthentic3DElevation
                        ? 'Cao độ 3D từ CAD'
                        : 'Bản vẽ 2D (Z giả định TCVN)'}
                    </span>
                  </div>
                </div>

                {/* Official Engineering Export Actions */}
                <div className="pt-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold uppercase tracking-wider text-[#A9B9CE]">
                      Xuất hồ sơ kỹ thuật
                    </span>
                    {isSurfaceAreaProvisional && (
                      <span className="inline-flex items-center gap-1 text-[12px] text-[#F59E0B] font-semibold">
                        <Lock className="w-3.5 h-3.5" /> Đang khóa chờ dựng lại B
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={isExcelExportBlocked}
                    title={getExportBlockedReason('excel') || 'Xuất Báo Cáo Khối Lượng (.XLSX - 3 Sheets)'}
                    className={`w-full py-2.5 px-4 rounded-md font-semibold text-[13px] flex items-center justify-center gap-2 transition-colors border ${
                      isExcelExportBlocked
                        ? 'bg-[#17263C]/50 text-[#7E92AA] border-[#27384E] cursor-not-allowed opacity-75'
                        : 'bg-[#39B58A] hover:bg-[#39B58A]/90 text-[#0B1220] border-[#39B58A] cursor-pointer font-bold'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 shrink-0" />
                    <span>Xuất Báo Cáo Khối Lượng (.XLSX)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportGeoJson}
                    disabled={isGeoJsonExportBlocked}
                    title={getExportBlockedReason('geojson') || 'Tải Dữ Liệu GeoJSON Chuẩn RFC 7946'}
                    className={`w-full py-2.5 px-4 rounded-md font-semibold text-[13px] flex items-center justify-center gap-2 transition-colors border ${
                      isGeoJsonExportBlocked
                        ? 'bg-[#17263C]/50 text-[#7E92AA] border-[#27384E] cursor-not-allowed opacity-75'
                        : 'bg-[#17263C] hover:bg-[#1E314D] text-[#E8EEF6] border-[#27384E] hover:border-[#22B7C9]/60 cursor-pointer'
                    }`}
                  >
                    <Download className="w-4 h-4 text-[#22B7C9] shrink-0" />
                    <span>Tải Dữ Liệu GeoJSON (RFC 7946)</span>
                  </button>

                  {onOpenRoadGuardDraftModal && (
                    <button
                      type="button"
                      onClick={onOpenRoadGuardDraftModal}
                      disabled={isSurfaceAreaProvisional}
                      className={`w-full py-2.5 px-4 rounded-md font-semibold text-[13px] flex items-center justify-center gap-2 transition-colors border ${
                        isSurfaceAreaProvisional
                          ? 'bg-[#17263C]/50 text-[#7E92AA] border-[#27384E] cursor-not-allowed opacity-75'
                          : 'bg-[#F06421]/15 hover:bg-[#F06421]/25 text-[#E8EEF6] border-[#F06421]/70 cursor-pointer'
                      }`}
                    >
                      <Compass className="w-4 h-4 text-[#F06421] shrink-0" />
                      <span>Xuất RoadGuard Draft (.JSON)</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ════════════ TAB 2: GIS & CAD LAYERS ════════════ */}
        {activeSubTab === 'layers' && (
          <div className="space-y-4">
            {/* GIS Map Layer Toggles */}
            <div className="space-y-2">
              <div className="text-[12px] font-bold uppercase tracking-wider text-[#A9B9CE]">
                Lớp Chuyên Đề Bản Đồ GIS
              </div>
              <div className="space-y-1.5">
                {[
                  {
                    key: 'surface',
                    label: 'Dải mặt đường (RoadSurface)',
                    desc: `Đa giác mặt đường B = ${normalizedParams.roadWidth}m`,
                    color: '#38BDF8',
                  },
                  {
                    key: 'slabs',
                    label: 'Tấm BTXM & Khe co giãn',
                    desc: `Chia tấm L = ${normalizedParams.slabLength}m × ${normalizedParams.laneCount} dải`,
                    color: '#F59E0B',
                  },
                  {
                    key: 'slabLabels',
                    label: 'Nhãn mã tấm BTXM (S-001...)',
                    desc: 'Hiển thị ở mức phóng đại lớn (Zoom ≥ 18)',
                    color: '#22B7C9',
                  },
                  {
                    key: 'centerline',
                    label: 'Tim tuyến chính & Nhánh',
                    desc: 'Trục hình học chuẩn hóa từ CAD/VN-2000',
                    color: '#FACC15',
                  },
                  {
                    key: 'edges',
                    label: 'Mép biên mặt đường (Road Edges)',
                    desc: 'Đường biên trái/phải của hành lang tuyến',
                    color: '#FB923C',
                  },
                  {
                    key: 'stations',
                    label: 'Cọc lý trình (Km0+000...)',
                    desc: `Bước cọc tiêu chuẩn ${normalizedParams.segmentLength}m`,
                    color: '#39B58A',
                  },
                  {
                    key: 'vertices',
                    label: 'Đỉnh hình học (Vertices)',
                    desc: 'Các điểm ngoặt trên tim tuyến',
                    color: '#A855F7',
                  },
                ].map((item) => {
                  const isVisible = Boolean(layerVisibility[item.key])
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onToggleLayer && onToggleLayer(item.key)}
                      className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                        isVisible
                          ? 'bg-[#17263C] border-[#27384E] text-[#E8EEF6]'
                          : 'bg-[#0B1220]/50 border-[#27384E]/50 text-[#7E92AA] opacity-75'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-semibold truncate">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-[#7E92AA] truncate">
                            {item.desc}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`p-1 rounded ${
                          isVisible ? 'text-[#22B7C9] bg-[#0B1220]' : 'text-[#7E92AA]'
                        }`}
                      >
                        {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* CAD Layer Manager */}
            <div className="pt-2 border-t border-[#27384E] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wider text-[#A9B9CE]">
                  Các Layer Bản Vẽ CAD ({activeLayerStats.length})
                </span>
                {activeLayerStats.length > 0 && onToggleAllCadLayers && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        onToggleAllCadLayers(
                           true,
                          activeLayerStats.map((l) => l.name)
                        )
                      }
                      className="px-2 py-0.5 rounded bg-[#17263C] hover:bg-[#1E314D] text-[#22B7C9] border border-[#27384E] cursor-pointer"
                    >
                      Hiện hết
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onToggleAllCadLayers(
                          false,
                          activeLayerStats.map((l) => l.name)
                        )
                      }
                      className="px-2 py-0.5 rounded bg-[#17263C] hover:bg-[#1E314D] text-[#A9B9CE] border border-[#27384E] cursor-pointer"
                    >
                      Ẩn hết
                    </button>
                  </div>
                )}
              </div>

              {activeLayerStats.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#17263C]/40 border border-[#27384E] text-center text-[12px] text-[#7E92AA]">
                  Nạp bản vẽ `.dxf` để xem thống kê và chọn layer tim tuyến từ CAD.
                </div>
              ) : (
                <>
                  {/* Search input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#7E92AA] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={layerSearch}
                      onChange={(e) => setLayerSearch(e.target.value)}
                      placeholder="Tìm tên layer (VD: TIM, MEPNHUA...)"
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#0B1220] border border-[#27384E] text-[12.5px] text-[#E8EEF6] placeholder-[#7E92AA] focus:outline-none focus:border-[#22B7C9]"
                    />
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(LAYER_CATEGORIES).map(([key, cat]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setLayerCategory(key)}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                          layerCategory === key
                            ? 'bg-[#22B7C9] text-[#0B1220] font-bold'
                            : 'bg-[#17263C] text-[#A9B9CE] hover:text-[#E8EEF6]'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Layer List */}
                  <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                    {filteredCadLayers.map((layer) => {
                      const isVis = Boolean(cadLayerVisibility[layer.name])
                      const isLoadingLayer = Boolean(loadingLayers[layer.name])
                      const isSelectedCenterline = selectedCadLayer === layer.name
                      return (
                        <div
                          key={layer.name}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                            isSelectedCenterline
                              ? 'bg-[#F06421]/15 border-[#F06421]'
                              : isVis
                              ? 'bg-[#17263C] border-[#22B7C9]/50'
                              : 'bg-[#17263C]/70 border-[#27384E]'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12.5px] font-mono font-semibold text-[#E8EEF6] truncate">
                                {layer.name}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-[#0B1220] text-[10.5px] font-mono text-[#22B7C9] tabular-nums">
                                {layer.count}
                              </span>
                            </div>
                            {onSelectCadLayerForParse && (
                              <button
                                type="button"
                                onClick={() =>
                                  onSelectCadLayerForParse(
                                    isSelectedCenterline ? '' : layer.name
                                  )
                                }
                                className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer ${
                                  isSelectedCenterline
                                    ? 'text-[#F06421] font-semibold'
                                    : 'text-[#A9B9CE] hover:text-[#22B7C9]'
                                }`}
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>
                                  {isSelectedCenterline
                                    ? 'Đang chọn làm Tim tuyến'
                                    : 'Chọn làm Tim tuyến'}
                                </span>
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={isLoadingLayer}
                            onClick={() => onToggleCadLayer && onToggleCadLayer(layer.name, layer.category)}
                            className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                              isVis
                                ? 'bg-[#22B7C9]/20 border-[#22B7C9] text-[#22B7C9]'
                                : 'bg-[#0B1220] border-[#27384E] text-[#7E92AA] hover:text-[#E8EEF6]'
                            }`}
                            title={isVis ? 'Ẩn layer phụ trên GIS' : 'Nạp và hiện layer phụ trên GIS'}
                          >
                            {isLoadingLayer ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-[#22B7C9]" />
                            ) : isVis ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ════════════ TAB 3: SEGMENTS ════════════ */}
        {activeSubTab === 'segments' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wider text-[#A9B9CE]">
                  Phân Đoạn Khảo Sát & Thi Công
                </div>
                <div className="text-[11.5px] text-[#7E92AA] tabular-nums">
                  Hoàn thành {completedCount} / {dynamicSegments.length} phân đoạn ({progressPct}%)
                </div>
              </div>
              {dynamicSegments.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectAllSegments &&
                      onSelectAllSegments(dynamicSegments.map((s) => s.id))
                    }
                    className="px-2 py-1 rounded bg-[#17263C] hover:bg-[#1E314D] text-[#39B58A] border border-[#27384E] cursor-pointer font-medium"
                  >
                    Chọn hết
                  </button>
                  <button
                    type="button"
                    onClick={() => onClearAllSegments && onClearAllSegments()}
                    className="px-2 py-1 rounded bg-[#17263C] hover:bg-[#1E314D] text-[#A9B9CE] border border-[#27384E] cursor-pointer font-medium"
                  >
                    Bỏ chọn
                  </button>
                </div>
              )}
            </div>

            {dynamicSegments.length > 0 && (
              <div className="w-full h-2 rounded-full bg-[#0B1220] border border-[#27384E] overflow-hidden">
                <div
                  className="h-full bg-[#39B58A] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}

            {dynamicSegments.length === 0 ? (
              <div className="p-5 rounded-xl bg-[#17263C]/50 border border-[#27384E] text-center text-[12.5px] text-[#A9B9CE]">
                Chưa có danh sách phân đoạn. Hãy phân tích bản vẽ CAD hoặc tọa độ để chia phân đoạn tự động.
              </div>
            ) : (
              <div className="space-y-2">
                {dynamicSegments.map((seg) => {
                  const isDone = completedSegments.includes(seg.id)
                  return (
                    <div
                      key={seg.id}
                      className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-2.5 ${
                        isDone
                          ? 'bg-[#39B58A]/10 border-[#39B58A]/40'
                          : 'bg-[#17263C] border-[#27384E]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleSegment && onToggleSegment(seg.id)}
                        className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        {isDone ? (
                          <CheckSquare className="w-4 h-4 text-[#39B58A] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-[#7E92AA] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold font-mono text-[#E8EEF6]">
                              {seg.id}
                            </span>
                            <span className="text-[11.5px] font-mono text-[#22B7C9] tabular-nums">
                              ({seg.length}m)
                            </span>
                          </div>
                          <div className="text-[11.5px] text-[#A9B9CE] font-mono tabular-nums truncate">
                            {seg.range}
                          </div>
                        </div>
                      </button>

                      {onFocusSegment && (
                        <button
                          type="button"
                          onClick={() => onFocusSegment(seg.id)}
                          className="px-2.5 py-1.5 rounded-md bg-[#0B1220] hover:bg-[#1E314D] text-[#22B7C9] border border-[#27384E] text-[11.5px] font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                          title={`Định vị ${seg.id} trên bản đồ GIS`}
                        >
                          <Navigation className="w-3 h-3" />
                          <span>Định vị</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════ TAB 4: BIDIRECTIONAL CRS & COORDINATE SCHEDULE ════════════ */}
        {activeSubTab === 'coords' && (
          <div className="space-y-4 select-text">
            {/* Coordinate Display Mode Selector */}
            <div className="p-3 rounded-md bg-[#0B1220] border border-[#27384E] space-y-2">
              <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#A9B9CE]">
                Chế Độ Hiển Thị Hệ Tọa Độ
              </div>
              <div className="text-[12px] text-[#8FA3BA] leading-snug">
                {isWgs84Source ? (
                  <span>
                    Nguồn đầu vào: <strong className="text-[#38BDF8]">WGS-84 (EPSG:4326)</strong>. VN-2000 là hệ tọa độ chuyển đổi để phục vụ kiểm tra kỹ thuật.
                  </span>
                ) : (
                  <span>
                    Nguồn đầu vào: <strong className="text-[#E8EEF6]">VN-2000 (L₀={centralMeridian}°)</strong>. MapLibre hiển thị trên hệ tọa độ chuyển đổi WGS-84.
                  </span>
                )}
              </div>
              <select
                value={coordDisplayMode}
                onChange={(e) =>
                  onCoordDisplayModeChange &&
                  onCoordDisplayModeChange(e.target.value)
                }
                className="w-full px-2.5 py-1.5 rounded bg-[#111D2E] border border-[#27384E] text-[12.5px] text-[#E8EEF6] cursor-pointer"
              >
                <option value="DUAL">Song song WGS-84 &amp; VN-2000</option>
                <option value="VN2000">Chỉ hiển thị VN-2000 (X Bắc, Y Đông)</option>
                <option value="WGS84">Chỉ hiển thị WGS-84 (Longitude, Latitude)</option>
              </select>

              {isVn2000Ready ? (
                <div className="text-[11.5px] font-mono text-[#39B58A]">
                  ✓ Đang cấu hình VN-2000: L₀ = {centralMeridian}°, Múi{' '}
                  {Math.abs(Number(scaleFactor) - 0.9996) < 1e-4 ? '6° (0.9996)' : '3° (0.9999)'}
                </div>
              ) : (
                <div className="p-2 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/50 text-[11.5px] text-[#F59E0B]">
                  ⚠️ Chưa cấu hình hệ quy chiếu VN-2000 (cần kinh tuyến trục L₀ &amp; múi chiếu ở cột trái). Không thể quy đổi sang VN-2000.
                </div>
              )}
            </div>

            {/* Interactive Bidirectional Point Converter */}
            <div className="p-3 rounded-md bg-[#17263C] border border-[#27384E] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-bold uppercase tracking-wider text-[#22B7C9]">
                  Chuyển Đổi Hai Chiều WGS-84 ↔ VN-2000
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1 p-0.5 rounded bg-[#0B1220] border border-[#27384E] text-[11.5px]">
                <button
                  type="button"
                  onClick={() => setConvDirection('WGS84_TO_VN2000')}
                  className={`py-1 px-1.5 rounded font-semibold cursor-pointer ${
                    convDirection === 'WGS84_TO_VN2000'
                      ? 'bg-[#17263C] text-[#22B7C9]'
                      : 'text-[#8FA3BA] hover:text-[#E8EEF6]'
                  }`}
                >
                  WGS-84 → VN-2000
                </button>
                <button
                  type="button"
                  onClick={() => setConvDirection('VN2000_TO_WGS84')}
                  className={`py-1 px-1.5 rounded font-semibold cursor-pointer ${
                    convDirection === 'VN2000_TO_WGS84'
                      ? 'bg-[#17263C] text-[#39B58A]'
                      : 'text-[#8FA3BA] hover:text-[#E8EEF6]'
                  }`}
                >
                  VN-2000 → WGS-84
                </button>
              </div>

              {convDirection === 'WGS84_TO_VN2000' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#A9B9CE] mb-0.5">
                      Longitude (Kinh độ °)
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={convLon}
                      onChange={(e) => setConvLon(e.target.value)}
                      className="w-full px-2 py-1.5 rounded bg-[#0B1220] border border-[#27384E] text-[12px] font-mono text-[#E8EEF6]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#A9B9CE] mb-0.5">
                      Latitude (Vĩ độ °)
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={convLat}
                      onChange={(e) => setConvLat(e.target.value)}
                      className="w-full px-2 py-1.5 rounded bg-[#0B1220] border border-[#27384E] text-[12px] font-mono text-[#E8EEF6]"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#A9B9CE] mb-0.5">
                      X Bắc (Northing - m)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={convXNorth}
                      onChange={(e) => setConvXNorth(e.target.value)}
                      className="w-full px-2 py-1.5 rounded bg-[#0B1220] border border-[#27384E] text-[12px] font-mono text-[#E8EEF6]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#A9B9CE] mb-0.5">
                      Y Đông (Easting - m)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={convYEast}
                      onChange={(e) => setConvYEast(e.target.value)}
                      className="w-full px-2 py-1.5 rounded bg-[#0B1220] border border-[#27384E] text-[12px] font-mono text-[#E8EEF6]"
                    />
                  </div>
                </div>
              )}

              <div className="p-2.5 rounded bg-[#0B1220] border border-[#27384E] text-[12px] font-mono space-y-1">
                {!liveConversionResult.valid ? (
                  <div className="text-[#F59E0B] font-sans text-[11.5px]">
                    {liveConversionResult.error}
                  </div>
                ) : convDirection === 'WGS84_TO_VN2000' ? (
                  <>
                    <div className="text-[11px] text-[#8FA3BA]">
                      Kết quả VN-2000 (L₀={liveConversionResult.centralMeridian}°, Múi{' '}
                      {liveConversionResult.zoneType}):
                    </div>
                    <div>
                      X Bắc:{' '}
                      <strong className="text-[#F59E0B]">
                        {liveConversionResult.xNorth.toLocaleString('en-US', {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        })}{' '}
                        m
                      </strong>
                    </div>
                    <div>
                      Y Đông:{' '}
                      <strong className="text-[#39B58A]">
                        {liveConversionResult.yEast.toLocaleString('en-US', {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        })}{' '}
                        m
                      </strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[11px] text-[#8FA3BA]">
                      Kết quả WGS-84 (EPSG:4326):
                    </div>
                    <div>
                      Lon:{' '}
                      <strong className="text-[#22B7C9]">
                        {liveConversionResult.lon.toFixed(8)}°
                      </strong>
                    </div>
                    <div>
                      Lat:{' '}
                      <strong className="text-[#22B7C9]">
                        {liveConversionResult.lat.toFixed(8)}°
                      </strong>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Station & Vertex Coordinate Schedule Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-bold uppercase tracking-wider text-[#A9B9CE]">
                  Bảng Tọa Độ Cọc &amp; Đỉnh Tuyến
                </span>
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setScheduleType('stations')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      scheduleType === 'stations'
                        ? 'bg-[#22B7C9] text-[#0B1220] font-bold'
                        : 'bg-[#17263C] text-[#A9B9CE]'
                    }`}
                  >
                    Cọc Km
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleType('vertices')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      scheduleType === 'vertices'
                        ? 'bg-[#22B7C9] text-[#0B1220] font-bold'
                        : 'bg-[#17263C] text-[#A9B9CE]'
                    }`}
                  >
                    Đỉnh V
                  </button>
                </div>
              </div>

              {coordinateScheduleRows.length === 0 ? (
                <div className="p-4 rounded bg-[#0B1220] border border-[#27384E] text-center text-[12px] text-[#8FA3BA]">
                  Chưa có dữ liệu tuyến để lập bảng tọa độ.
                </div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto rounded border border-[#27384E] bg-[#0B1220] divide-y divide-[#27384E]/70">
                  {coordinateScheduleRows.map((row) => (
                    <div
                      key={row.code}
                      className="p-2 text-[11.5px] font-mono space-y-1 hover:bg-[#17263C]/40"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-[#E8EEF6]">{row.code}</strong>
                        {row.distMeters !== null && (
                          <span className="text-[#8FA3BA]">{row.distMeters} m</span>
                        )}
                      </div>
                      {(coordDisplayMode === 'DUAL' ||
                        coordDisplayMode === 'WGS84') && (
                        <div className="text-[#C0CEDF]">
                          WGS-84:{' '}
                          <span className="text-[#22B7C9]">
                            {row.lon.toFixed(7)}, {row.lat.toFixed(7)}
                          </span>
                        </div>
                      )}
                      {(coordDisplayMode === 'DUAL' ||
                        coordDisplayMode === 'VN2000') && (
                        <div>
                          {row.vn2000 ? (
                            <span className="text-[#C0CEDF]">
                              VN-2000: X={' '}
                              <strong className="text-[#F59E0B]">
                                {row.vn2000.xNorth.toFixed(2)}
                              </strong>{' '}
                              | Y={' '}
                              <strong className="text-[#39B58A]">
                                {row.vn2000.yEast.toFixed(2)}
                              </strong>
                            </span>
                          ) : (
                            <span className="text-[#F59E0B]">
                              Chưa cấu hình VN-2000
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
