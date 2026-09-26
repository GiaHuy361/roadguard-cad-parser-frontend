import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FileCode2, Sliders, Layers, Loader2, X,
  FileSpreadsheet, Compass, Upload,
  CheckCircle2, Sparkles, Download,
  Eye, EyeOff, Ruler, FlipHorizontal2, Route,
  BarChart3, ChevronLeft, ChevronRight, Settings2
} from 'lucide-react'
import { downloadExcelReport } from '../utils/excelExporter'

/* ─── Central Meridian Presets (VN-2000 3-Degree Zones) ───────── */
const CM_PRESETS = [
  { value: '105.75', label: 'TP.HCM / Long An / Tiền Giang (105°45\')' },
  { value: '105.75', label: 'Bình Dương / Bình Phước (105°45\')' },
  { value: '107.75', label: 'Đồng Nai / Bà Rịa - Vũng Tàu (107°45\')' },
  { value: '105.50', label: 'Tây Ninh (105°30\')' },
  { value: '105.00', label: 'Cần Thơ / Hậu Giang (105°00\')' },
  { value: '106.00', label: 'Bến Tre (106°00\')' },
  { value: '107.75', label: 'Đà Nẵng / Quảng Nam (107°45\')' },
  { value: '105.00', label: 'Hà Nội / Hải Phòng (105°00\')' },
  { value: '105.00', label: 'Múi 6° Toàn quốc (105°00\')' },
]

export default function Sidebar({
  onDataLoaded,
  onAnalyticsLoaded,
  geoJsonData,
  analyticsData,
  onCadFileChange,
  showVertices,
  setShowVertices,
  showCenterline,
  setShowCenterline,
  showRoadSurface,
  setShowRoadSurface,
  showEdges,
  setShowEdges,
  showStations,
  setShowStations,
  roadParams,
  setRoadParams,
  cadFile,
  collapsed,
  setCollapsed,
}) {
  const [file, setFile] = useState(cadFile || null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (cadFile && cadFile !== file) {
      setFile(cadFile)
    }
  }, [cadFile, file])

  const segmentLength = roadParams?.segmentLength ?? '100'
  const roadWidth     = roadParams?.roadWidth ?? '3.5'
  const slabLength    = roadParams?.slabLength ?? '4.0'
  const [selectedCm, setSelectedCm] = useState('105.75')

  const updateParam = (key, val) => {
    if (setRoadParams) {
      setRoadParams((prev) => ({ ...prev, [key]: val }))
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (onCadFileChange) onCadFileChange(null)
  }

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragging(true) }, [])
  const handleDragLeave = useCallback(() => setDragging(false), [])
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    const dropped = e.dataTransfer.files[0]
    const name = dropped?.name.toLowerCase()
    if (name && (name.endsWith('.dxf') || name.endsWith('.dwg'))) {
      setFile(dropped)
      if (onCadFileChange) onCadFileChange(dropped)
    } else {
      toast.error('Chỉ hỗ trợ file CAD (.dxf, .dwg).')
    }
  }, [onCadFileChange])

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected) {
      setFile(selected)
      if (onCadFileChange) onCadFileChange(selected)
    }
  }

  function convertRoadResponseToGeoJson(data) {
    if (!data) return null
    const toLngLat = (p) => {
      if (!Array.isArray(p) || p.length < 2) return p
      const [a, b] = p
      if (Math.abs(a) < Math.abs(b)) {
        return [Number(b), Number(a)]
      }
      return [Number(a), Number(b)]
    }

    const features = []

    if (data.roadSurfacePolygon && data.roadSurfacePolygon.length >= 3) {
      const ring = data.roadSurfacePolygon.map(toLngLat)
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push(ring[0])
      }
      features.push({
        type: 'Feature',
        id: 'road-surface-corridor',
        properties: {
          type: 'RoadSurface',
          layer: 'MAT_DUONG_BETONG',
          name: `Dải Mặt Đường Bê Tông (${data.roadWidth || 7.0}m)`,
          roadWidth: data.roadWidth || 7.0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      })
    }

    if (data.centerline && data.centerline.length >= 2) {
      features.push({
        type: 'Feature',
        id: 'road-centerline-main',
        properties: {
          type: 'Centerline',
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

    if (data.leftEdge && data.leftEdge.length >= 2) {
      features.push({
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

    if (data.rightEdge && data.rightEdge.length >= 2) {
      features.push({
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

    return {
      type: 'FeatureCollection',
      bounds: data.bounds,
      features,
    }
  }

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Vui lòng chọn file CAD (.dxf/.dwg) trước.')
      return
    }
    setLoading(true)
    const tid = toast.loading('Đang bóc tách tim tuyến chính & chuyển đổi tọa độ VN-2000…')
    try {
      const roadFd = new FormData()
      roadFd.append('File', file)
      const calculatedRoadWidth = (parseFloat(roadWidth) >= 5.0 ? parseFloat(roadWidth) : (parseFloat(roadWidth) * 2.0)) || 7.0
      roadFd.append('RoadWidth', calculatedRoadWidth.toString())
      if (selectedCm) {
        roadFd.append('CentralMeridian', selectedCm.toString())
      }

      const parseFd = new FormData()
      parseFd.append('file', file)
      parseFd.append('targetSrid', '4326')
      parseFd.append('tessellationSegments', '72')
      if (selectedCm) {
        parseFd.append('centralMeridian', selectedCm.toString())
      }
      parseFd.append('SegmentLength', (parseFloat(segmentLength) || 100).toString())
      parseFd.append('RoadWidth', (parseFloat(roadWidth) || 3.5).toString())
      parseFd.append('SlabLength', (parseFloat(slabLength) || 4.0).toString())

      const [roadResult, parseResult] = await Promise.allSettled([
        axios.post('http://localhost:5198/api/cad/parse-road', roadFd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
        axios.post('http://localhost:5198/api/cad/parse-dxf', parseFd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      ])

      let loadedSomething = false

      if (roadResult.status === 'fulfilled' && roadResult.value?.data?.success) {
        const roadData = roadResult.value.data
        const geojson = convertRoadResponseToGeoJson(roadData)
        if (geojson && onDataLoaded) {
          onDataLoaded(geojson)
          loadedSomething = true
        }
      }

      if (parseResult.status === 'fulfilled' && parseResult.value?.data) {
        const pData = parseResult.value.data
        const analytics = pData?.analytics ?? null
        const featureCollection = pData?.featureCollection ?? pData

        if (analytics && onAnalyticsLoaded) {
          onAnalyticsLoaded(analytics)
        }

        if (!loadedSomething && featureCollection && onDataLoaded) {
          onDataLoaded(featureCollection)
          loadedSomething = true
        }
      }

      if (loadedSomething) {
        toast.success('Bóc tách và dựng tuyến đường thành công!', { id: tid })
      } else {
        const err = roadResult.status === 'rejected' ? roadResult.reason : parseResult.reason
        const msg = err?.response?.data?.detail || err?.response?.data?.message || err?.message || 'Không thể xử lý bản vẽ CAD'
        toast.error(`Lỗi: ${msg}`, { id: tid })
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || err?.message || 'Lỗi kết nối máy chủ'
      toast.error(`Lỗi: ${msg}`, { id: tid })
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadExcel = async () => {
    if (!geoJsonData && !analyticsData) {
      toast.error('Chưa có dữ liệu CAD để xuất báo cáo.')
      return
    }
    await downloadExcelReport({
      geoJsonData,
      analyticsData,
      roadParams: {
        segmentLength: parseFloat(segmentLength) || 100,
        roadWidth: parseFloat(roadWidth) || 3.5,
        slabLength: parseFloat(slabLength) || 4.0,
      },
    })
  }

  const handleDownloadGeoJSON = () => {
    if (!geoJsonData) {
      toast.error('Chưa có dữ liệu GeoJSON.')
      return
    }
    const blob = new Blob([JSON.stringify(geoJsonData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'roadguard-export.geojson'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã tải tệp GeoJSON!')
  }

  const formatBytes = (b) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`

  if (collapsed) {
    return null
  }

  return (
    <aside className="w-[360px] h-full flex flex-col bg-[#111625] border-r border-[#1e263d] select-none text-slate-300 shadow-2xl shrink-0 z-20">
      
      {/* ── Sidebar Title & Collapse Button ── */}
      <div className="px-4 py-3 border-b border-[#1e263d] flex items-center justify-between bg-[#0e121f]">
        <div className="flex items-center gap-2">
          <Settings2 size={15} className="text-blue-400" />
          <h2 className="text-xs font-bold text-white tracking-wider uppercase">
            Bảng Điều Khiển Tuyến
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Thu gọn sidebar"
        >
          <ChevronLeft size={14} />
          <span>Thu gọn</span>
        </button>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-xs scrollbar-thin scrollbar-thumb-slate-800">
        
        {/* ── Card 1: CAD Source & Coordinate System ── */}
        <div className="bg-[#161c2e] border border-[#232d47] rounded-xl p-3.5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Upload size={13} className="text-blue-400" />
              Nguồn Bản Vẽ & Tọa Độ
            </span>
            {file && (
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 font-semibold">
                <CheckCircle2 size={12} /> Sẵn sàng
              </span>
            )}
          </div>

          {/* Dropzone */}
          <div
            role="button"
            tabIndex={0}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            className={`rounded-xl border border-dashed p-3.5 transition-all cursor-pointer ${
              dragging
                ? 'border-blue-400 bg-blue-500/10'
                : file
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-[#2a3654] bg-[#0e121f] hover:border-blue-400/50 hover:bg-[#131929]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".dxf,.dwg"
              onChange={handleFileChange}
              className="hidden"
            />

            {file ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
                    <FileCode2 size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate text-xs">{file.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{formatBytes(file.size)} • AutoCAD DXF</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveFile()
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Gỡ file"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="text-center py-2">
                <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Upload size={15} />
                </div>
                <p className="font-semibold text-slate-200 text-xs">Kéo thả file CAD vào đây</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Định dạng hỗ trợ: .dxf, .dwg</p>
              </div>
            )}
          </div>

          {/* Central Meridian */}
          <div className="pt-0.5">
            <div className="flex items-center justify-between mb-1.5 text-[11px]">
              <label htmlFor="cm-select" className="font-medium text-slate-300 flex items-center gap-1.5">
                <Compass size={12} className="text-blue-400" />
                Kinh tuyến trục (VN-2000)
              </label>
              <span className="font-mono text-[10px] font-bold text-blue-300 bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 rounded">
                {selectedCm}°
              </span>
            </div>
            <select
              id="cm-select"
              value={selectedCm}
              onChange={(e) => setSelectedCm(e.target.value)}
              className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
            >
              {CM_PRESETS.map((item, idx) => (
                <option key={idx} value={item.value} className="bg-[#161c2e] text-slate-200">
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Card 2: Road Engineering Specs (TCVN) ── */}
        <div className="bg-[#161c2e] border border-[#232d47] rounded-xl p-3.5 space-y-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <Sliders size={13} className="text-blue-400" />
            <span>Thông Số Tuyến (TCVN)</span>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
                <FlipHorizontal2 size={12} className="text-blue-400/80" />
                Bề rộng mặt đường (B)
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={roadWidth}
                  onChange={(e) => updateParam('roadWidth', e.target.value)}
                  className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-blue-500 pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 font-bold">m</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
                  <Route size={12} className="text-blue-400/80" />
                  Phân đoạn (L)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={segmentLength}
                    onChange={(e) => updateParam('segmentLength', e.target.value)}
                    className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-blue-500 pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 font-bold">m</span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
                  <Ruler size={12} className="text-blue-400/80" />
                  Tấm BTXM
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slabLength}
                    onChange={(e) => updateParam('slabLength', e.target.value)}
                    className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-blue-500 pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 font-bold">m</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Card 3: Layer Management & Legend ── */}
        <div className="bg-[#161c2e] border border-[#232d47] rounded-xl p-3.5 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Layers size={13} className="text-blue-400" />
              Lớp Bản Đồ & Chú Giải
            </span>
          </div>

          <div className="space-y-1.5">
            {/* Road Surface */}
            <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-2.5 rounded-sm bg-zinc-600 border border-amber-400/90 shadow-sm" />
                <span className="text-xs font-medium text-slate-200">Mặt đường (RoadSurface)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRoadSurface(!showRoadSurface)}
                className={`p-1 rounded-md transition-colors ${showRoadSurface ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {showRoadSurface ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>

            {/* Centerline */}
            <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-0.5 border-t-2 border-dashed border-amber-400" />
                <span className="text-xs font-medium text-slate-200">Tim tuyến (Centerline)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCenterline(!showCenterline)}
                className={`p-1 rounded-md transition-colors ${showCenterline ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {showCenterline ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>

            {/* Edges */}
            <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-0.5 bg-amber-500 rounded" />
                <span className="text-xs font-medium text-slate-200">Mép đường biên (Edges)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEdges(!showEdges)}
                className={`p-1 rounded-md transition-colors ${showEdges ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {showEdges ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>

            {/* Stations */}
            <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white ring-2 ring-cyan-400" />
                <span className="text-xs font-medium text-slate-200">Cọc lý trình (Stations)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowStations(!showStations)}
                className={`p-1 rounded-md transition-colors ${showStations ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {showStations ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>

            {/* Vertices */}
            <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-xs font-medium text-slate-200">Điểm mốc trắc địa (Vertices)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowVertices(!showVertices)}
                className={`p-1 rounded-md transition-colors ${showVertices ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {showVertices ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Card 4: Engineering Analysis KPIs (When Ready) ── */}
        {analyticsData && (
          <div className="bg-[#161c2e] border border-emerald-500/25 rounded-xl p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <BarChart3 size={13} />
                Chỉ Số Công Trình Tuyến
              </span>
              <span className="text-[10px] text-slate-400 font-mono">TCVN 10380</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Chiều dài tuyến</p>
                <p className="font-mono font-bold text-white text-sm mt-0.5">
                  {Number(analyticsData.totalLengthMeters || 0).toFixed(1)} m
                </p>
              </div>

              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Diện tích mặt</p>
                <p className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                  {Number(analyticsData.totalAreaSqm || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} m²
                </p>
              </div>

              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Số tấm BTXM</p>
                <p className="font-mono font-bold text-cyan-300 text-sm mt-0.5">
                  {analyticsData.estimatedConcreteSlabs || 0} tấm
                </p>
              </div>

              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Phân đoạn</p>
                <p className="font-mono font-bold text-amber-300 text-sm mt-0.5">
                  {analyticsData.roadSegments || 0} đoạn
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Export Buttons ── */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={handleDownloadExcel}
            disabled={!geoJsonData && !analyticsData}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
              geoJsonData || analyticsData
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 shadow-sm cursor-pointer'
                : 'bg-[#161c2e] border-[#232d47] text-slate-600 cursor-not-allowed'
            }`}
          >
            <FileSpreadsheet size={13} />
            Báo cáo Excel
          </button>
          <button
            type="button"
            onClick={handleDownloadGeoJSON}
            disabled={!geoJsonData}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
              geoJsonData
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20 shadow-sm cursor-pointer'
                : 'bg-[#161c2e] border-[#232d47] text-slate-600 cursor-not-allowed'
            }`}
          >
            <Download size={13} />
            Tải GeoJSON
          </button>
        </div>
      </div>

      {/* ── Drawer Footer: Primary Action Button ── */}
      <div className="p-4 border-t border-[#1e263d] bg-[#0e121f]">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !file}
          className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold tracking-wide transition-all shadow-lg ${
            loading || !file
              ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 active:scale-[0.98] cursor-pointer'
          }`}
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin text-white" />
              Đang bóc tách & chuyển tọa độ…
            </>
          ) : (
            <>
              <Sparkles size={14} className="text-cyan-200" />
              Phân Tích & Dựng Tuyến
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
