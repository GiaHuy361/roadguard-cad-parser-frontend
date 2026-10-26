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
  centralMeridian = '105.75',
  scaleFactor = '0.9999',
  axisOrder = 'AUTO',
  onRecomputeWidth,
  isLoading = false,
  onCollapse,
}) {
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

  const isSurfaceAreaProvisional = Boolean(stats.isSurfaceAreaProvisional)
  const analyzedRoadWidth = Number(stats.analyzedRoadWidth || normalizedParams.roadWidth)

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
    if (isSurfaceAreaProvisional) {
      toast.error(
        `Bề rộng mặt đường đã đổi từ ${analyzedRoadWidth}m sang ${normalizedParams.roadWidth}m. Vui lòng bấm "Cập Nhật & Dựng Lại Mặt Đường" trước khi xuất dữ liệu chính thức.`,
        { duration: 5000 }
      )
      return
    }
    try {
      const exportPayload = {
        type: 'FeatureCollection',
        bbox: effectiveGeoJson.bbox || null,
        crsMetadata: effectiveGeoJson.crsMetadata || {
          sourceCrs: 'VN-2000',
          targetCrs: 'EPSG:4326 (WGS-84)',
          centralMeridian: Number(centralMeridian) || 105.75,
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
    downloadExcelReport({
      geoJsonData: effectiveGeoJson,
      analyticsData: stats,
      roadParams: normalizedParams,
    })
  }

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

      {/* ── Sub-navigation Tabs ── */}
      <div className="bg-[#0B1220]/40 border-b border-[#27384E] grid grid-cols-3 shrink-0">
        <button
          type="button"
          onClick={() => setActiveSubTab('metrics')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-[12.5px] font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'metrics'
              ? 'bg-[#17263C]/70 text-[#E8EEF6] border-b-[#22B7C9]'
              : 'text-[#A9B9CE] hover:text-[#E8EEF6] border-b-transparent'
          }`}
        >
          <span>Khối lượng</span>
          {isSurfaceAreaProvisional && (
            <span className="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0" title="Cần phân tích lại mặt đường" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('layers')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-[12.5px] font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'layers'
              ? 'bg-[#17263C]/70 text-[#E8EEF6] border-b-[#22B7C9]'
              : 'text-[#A9B9CE] hover:text-[#E8EEF6] border-b-transparent'
          }`}
        >
          <span>Lớp CAD/GIS</span>
          {activeLayerStats.length > 0 && (
            <span className="text-[11px] font-mono text-[#22B7C9] tabular-nums">
              ({activeLayerStats.length})
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('segments')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-[12.5px] font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'segments'
              ? 'bg-[#17263C]/70 text-[#E8EEF6] border-b-[#22B7C9]'
              : 'text-[#A9B9CE] hover:text-[#E8EEF6] border-b-transparent'
          }`}
        >
          <span>Phân đoạn</span>
          {dynamicSegments.length > 0 && (
            <span className="text-[11px] font-mono text-[#39B58A] tabular-nums">
              ({dynamicSegments.length})
            </span>
          )}
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
                        Hệ phẳng VN-2000
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

                {/* CRS & Spatial Telemetry Summary */}
                <div className="p-3 rounded-md bg-[#0B1220] border border-[#27384E] space-y-2 text-[12.5px]">
                  <div className="font-bold text-[#A9B9CE] uppercase tracking-wider text-[11.5px]">
                    Hệ quy chiếu &amp; Không gian
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#27384E]/60">
                    <span className="text-[#8FA3BA]">Hệ tọa độ gốc:</span>
                    <span className="font-mono font-semibold text-[#E8EEF6] tabular-nums">
                      VN-2000 (L₀ = {stats.centralMeridian || centralMeridian}°)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#27384E]/60">
                    <span className="text-[#8FA3BA]">Múi chiếu &amp; Hệ số k₀:</span>
                    <span className="font-mono text-[#E8EEF6] tabular-nums">
                      {Math.abs(Number(stats.scaleFactor || scaleFactor) - 0.9996) < 1e-4
                        ? 'Múi 6° (k₀ = 0.9996)'
                        : 'Múi 3° (k₀ = 0.9999)'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#27384E]/60">
                    <span className="text-[#8FA3BA]">Hệ tọa độ xuất:</span>
                    <span className="font-mono text-[#22B7C9]">WGS-84 (EPSG:4326)</span>
                  </div>
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
                    disabled={isSurfaceAreaProvisional}
                    className={`w-full py-2.5 px-4 rounded-md font-semibold text-[13px] flex items-center justify-center gap-2 transition-colors border ${
                      isSurfaceAreaProvisional
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
                    disabled={isSurfaceAreaProvisional}
                    className={`w-full py-2.5 px-4 rounded-md font-semibold text-[13px] flex items-center justify-center gap-2 transition-colors border ${
                      isSurfaceAreaProvisional
                        ? 'bg-[#17263C]/50 text-[#7E92AA] border-[#27384E] cursor-not-allowed opacity-75'
                        : 'bg-[#17263C] hover:bg-[#1E314D] text-[#E8EEF6] border-[#27384E] hover:border-[#22B7C9]/60 cursor-pointer'
                    }`}
                  >
                    <Download className="w-4 h-4 text-[#22B7C9] shrink-0" />
                    <span>Tải Dữ Liệu GeoJSON (RFC 7946)</span>
                  </button>
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
      </div>
    </aside>
  )
}
