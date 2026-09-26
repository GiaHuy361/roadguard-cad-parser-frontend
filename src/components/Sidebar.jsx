import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  MapPin, Upload, FileCode2, Settings2, ChevronRight,
  Layers, Loader2, X, Globe, Cpu, Info, Zap, Terminal,
  Map, Satellite, Eye, EyeOff, Download, Printer, LayoutGrid,
  Sliders, Route, RulerIcon, FlipHorizontal2, CheckCircle2, FileSpreadsheet, Compass,
} from 'lucide-react'
import { downloadExcelReport } from '../utils/excelExporter'

/* ─── Section header ──────────────────────────────────────────── */
function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={11} style={{ color: '#06b6d4' }} />
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, #1e293b, transparent)' }} />
    </div>
  )
}

/* ─── Glassmorphism card wrapper ─────────────────────────────── */
function GlassCard({ children, style = {}, accent }) {
  return (
    <div
      style={{
        background: accent ? `${accent}06` : 'rgba(15,23,42,0.6)',
        border: `1px solid ${accent ? `${accent}20` : 'rgba(51,65,85,0.7)'}`,
        borderRadius: '12px',
        padding: '14px',
        backdropFilter: 'blur(8px)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/* ─── Engineering param input ────────────────────────────────── */
function ParamInput({ id, label, value, onChange, unit, icon: Icon }) {
  return (
    <div>
      <label
        htmlFor={id}
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '10px', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}
      >
        {Icon && <Icon size={10} style={{ color: '#06b6d4' }} />}
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={onChange}
          placeholder="0"
          style={{
            width: '100%',
            padding: '8px 40px 8px 12px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'Inter, monospace',
            color: '#e2e8f0',
            background: 'rgba(15,23,42,0.5)',
            border: '1px solid rgba(51,65,85,0.7)',
            borderRadius: '6px',
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.target.style.borderColor = '#06b6d4'; e.target.style.boxShadow = '0 0 0 1px #06b6d4' }}
          onBlur={(e) =>  { e.target.style.borderColor = 'rgba(51,65,85,0.7)'; e.target.style.boxShadow = 'none' }}
        />
        <span style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: '10px', fontWeight: 700, color: '#334155', fontFamily: 'monospace', letterSpacing: '0.05em',
          pointerEvents: 'none',
        }}>
          {unit}
        </span>
      </div>
    </div>
  )
}

/* ─── Map style toggle button ────────────────────────────────── */
function MapStyleBtn({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '9px 12px', borderRadius: '8px',
        fontSize: '11px', fontWeight: 700, fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em',
        border: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
        ...(active
          ? { background: 'linear-gradient(135deg, #0e7490, #0284c7)', color: '#fff', boxShadow: '0 0 16px rgba(6,182,212,0.3)' }
          : { background: 'rgba(15,23,42,0.8)', color: '#475569', border: '1px solid #1e293b' }
        ),
      }}
    >
      <Icon size={13} />{label}
    </button>
  )
}

/* ─── Layer toggle row ───────────────────────────────────────── */
function LayerToggle({ id, label, checked, onChange, accent = '#06b6d4', description }) {
  return (
    <label htmlFor={id} style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
      padding: '8px 10px', borderRadius: '8px', transition: 'background 0.15s',
      background: checked ? `${accent}08` : 'transparent',
      border: `1px solid ${checked ? `${accent}25` : 'transparent'}`,
    }}>
      <div style={{ position: 'relative', marginTop: 1, flexShrink: 0 }}>
        <input id={id} type="checkbox" checked={checked} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <div style={{
          width: 16, height: 16, borderRadius: 4,
          background: checked ? accent : 'transparent',
          border: `2px solid ${checked ? accent : '#334155'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
          boxShadow: checked ? `0 0 8px ${accent}50` : 'none',
        }}>
          {checked && (
            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
              <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '12px', fontWeight: 700, color: checked ? '#e2e8f0' : '#64748b', lineHeight: 1 }}>{label}</p>
        {description && <p style={{ fontSize: '10px', color: '#334155', marginTop: 3 }}>{description}</p>}
      </div>
      {checked ? <Eye size={12} style={{ color: accent, flexShrink: 0 }} /> : <EyeOff size={12} style={{ color: '#334155', flexShrink: 0 }} />}
    </label>
  )
}

/* ─── Reusable dark input ─────────────────────────────────────── */
function DarkInput({ id, label, type = 'text', value, onChange, icon: Icon, hint }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#475569' }}>
        {Icon && <Icon size={10} style={{ color: '#06b6d4' }} />}
        {label}
      </label>
      <input
        id={id} type={type} value={value} onChange={onChange}
        style={{ width: '100%', padding: '10px 14px', fontSize: '13px', fontWeight: '600', fontFamily: 'Inter, monospace', color: '#e2e8f0', background: '#020617', border: '1px solid #1e293b', borderRadius: '8px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
        onFocus={(e) => { e.target.style.borderColor = '#06b6d4'; e.target.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.12)' }}
        onBlur={(e) =>  { e.target.style.borderColor = '#1e293b'; e.target.style.boxShadow = 'none' }}
      />
      {hint && (
        <p className="mt-1.5 flex items-center gap-1" style={{ fontSize: '10px', color: '#334155' }}>
          <Info size={9} style={{ color: '#475569', flexShrink: 0 }} />{hint}
        </p>
      )}
    </div>
  )
}

/* ─── Sidebar Component ───────────────────────────────────────── */
export default function Sidebar({
  onDataLoaded, onAnalyticsLoaded, onOverlayLoaded, geoJsonData, analyticsData,
  onCadFileChange,
  mapStyle, setMapStyle,
  showGeometry, setShowGeometry,
  showVertices, setShowVertices,
  showCenterline, setShowCenterline,
  showRoadSurface, setShowRoadSurface,
  showEdges, setShowEdges,
  showStations, setShowStations,
  roadParams, setRoadParams,
  cadFile,
}) {
  /* Upload */
  const [file,     setFile]     = useState(cadFile || null)
  const [loading,  setLoading]  = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (cadFile && cadFile !== file) {
      setFile(cadFile)
    }
  }, [cadFile])

  /* Engineering params */
  const segmentLength = roadParams?.segmentLength ?? '100'
  const roadWidth     = roadParams?.roadWidth ?? '3.5'
  const slabLength    = roadParams?.slabLength ?? '4.0'
  const [selectedCm,  setSelectedCm] = useState('105.75')

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

  const handleDragOver  = useCallback((e) => { e.preventDefault(); setDragging(true) }, [])
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

/* ── Chuyển đổi dữ liệu chuẩn từ POST /api/cad/parse-road thành GeoJSON ── */
function convertRoadResponseToGeoJson(data) {
  if (!data) return null

  // Đảm bảo đúng định dạng [lng, lat] cho chuẩn GeoJSON quốc tế
  const toLngLat = (p) => {
    if (!Array.isArray(p) || p.length < 2) return p
    const [a, b] = p
    // Ở Việt Nam: Vĩ độ (Lat) ~ 8° - 23°, Kinh độ (Lng) ~ 102° - 110°.
    // Nếu số thứ nhất < số thứ hai (ví dụ [10.88, 105.85]) => a là Lat, b là Lng => trả về [Lng, Lat] = [b, a]
    if (Math.abs(a) < Math.abs(b)) {
      return [Number(b), Number(a)]
    }
    return [Number(a), Number(b)]
  }

  const features = []

  // 1. Dải Mặt Đường Bê Tông 2D (Road Surface Polygon - chất liệu xám bê tông #71717a)
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

  // 2. Trục Tim Tuyến Đường Chính Duy Nhất (Single Centerline - Khử toàn bộ nhánh phụ)
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

  // 3. Mép đường trái & phải nếu có
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
    if (!file) { toast.error('Vui lòng chọn file CAD (.dxf/.dwg) trước.'); return }
    setLoading(true)
    const tid = toast.loading('Đang bóc tách tim tuyến chính & dựng dải mặt đường 2D…')
    try {
      // 1. FormData cho API parse-road chuyên biệt (1 trục tim chính + Polygon mặt đường bê tông 2D)
      const roadFd = new FormData()
      roadFd.append('File', file)
      const calculatedRoadWidth = (parseFloat(roadWidth) >= 5.0 ? parseFloat(roadWidth) : (parseFloat(roadWidth) * 2.0)) || 7.0
      roadFd.append('RoadWidth', calculatedRoadWidth.toString())
      if (selectedCm) {
        roadFd.append('CentralMeridian', selectedCm.toString())
      }

      // 2. FormData cho API bóc tách kỹ thuật & tính toán TCVN (/api/cad/parse-dxf)
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

      // 3. FormData cho Render Overlay
      const overlayFd = new FormData()
      overlayFd.append('file', file)
      overlayFd.append('roadWidth', calculatedRoadWidth.toString())
      overlayFd.append('outputSizePx', '2048')

      // Gọi đồng thời: /api/cad/parse-road (Chính) và /api/cad/parse-dxf (Analytics TCVN)
      const [roadResult, parseResult] = await Promise.allSettled([
        axios.post('http://localhost:5198/api/cad/parse-road', roadFd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
        axios.post('http://localhost:5198/api/cad/parse-dxf', parseFd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      ])

      let loadedSomething = false

      // ── Ưu tiên 1: Kết quả từ /api/cad/parse-road (Trục chính liền mạch + Polygon mặt đường) ──
      if (roadResult.status === 'fulfilled' && roadResult.value?.data?.success) {
        const roadData = roadResult.value.data
        const geojson = convertRoadResponseToGeoJson(roadData)
        if (geojson && onDataLoaded) {
          onDataLoaded(geojson)
          loadedSomething = true
        }
      }

      // ── Xử lý kết quả Analytics từ /api/cad/parse-dxf (TCVN) ──
      if (parseResult.status === 'fulfilled' && parseResult.value?.data) {
        const pData = parseResult.value.data
        const analytics = pData?.analytics ?? null
        const featureCollection = pData?.featureCollection ?? pData

        if (analytics && onAnalyticsLoaded) {
          onAnalyticsLoaded(analytics)
        }

        // Fallback nếu parse-road không thành công
        if (!loadedSomething && featureCollection && onDataLoaded) {
          onDataLoaded(featureCollection)
          loadedSomething = true
        }
      }

      if (loadedSomething) {
        toast.success('Đã bóc tách tim tuyến chính & dựng dải mặt đường bê tông 2D!', { id: tid })
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

  const handleApplyParams = () => {
    toast.success('Đã cập nhật tham số tuyến!', {
      icon: '⚙️',
      style: { background: '#1e293b', color: '#fff', border: '1px solid rgba(6,182,212,0.2)' },
    })
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
    if (!geoJsonData) { toast.error('No data loaded yet.'); return }
    const blob = new Blob([JSON.stringify(geoJsonData, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'roadguard-export.geojson'; a.click()
    URL.revokeObjectURL(url)
    toast.success('GeoJSON downloaded!')
  }

  const handlePrint = () => window.print()

  const formatBytes = (b) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`

  const dropBorder = dragging ? '2px dashed #06b6d4' : file ? '2px dashed #34d399' : '2px dashed #1e3a50'
  const dropBg     = dragging ? 'rgba(6,182,212,0.05)' : file ? 'rgba(52,211,153,0.04)' : 'rgba(6,182,212,0.02)'

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ── Brand Header ── */}
      <div className="shrink-0 px-6 py-5"
        style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f1e 60%, #0c1929 100%)', borderBottom: '1px solid rgba(6,182,212,0.12)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', boxShadow: '0 0 16px rgba(6,182,212,0.15)' }}>
            <MapPin size={17} style={{ color: '#06b6d4' }} strokeWidth={2.5} />
          </div>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em', lineHeight: 1 }}>RoadGuard GIS</h1>
            <p style={{ fontSize: '10px', color: '#06b6d4', fontWeight: 600, marginTop: '3px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Engineering Command Center</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.1)' }}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
          </span>
          <span style={{ fontSize: '10px', color: '#475569', fontWeight: 600 }}>SYS ONLINE</span>
          <Terminal size={10} style={{ color: '#334155', marginLeft: 'auto' }} />
          <span style={{ fontSize: '10px', color: '#334155', fontFamily: 'monospace' }}>localhost:5198</span>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5" style={{ background: '#0f172a' }}>

        {/* ── DXF Upload ── */}
        <SectionHeader icon={Upload} label="DXF Source File" />
        <div
          role="button" tabIndex={0} aria-label="Click or drop DXF file here"
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          style={{ border: dropBorder, background: dropBg, borderRadius: '12px', padding: '20px 16px', cursor: 'pointer', transition: 'all 0.2s ease', transform: dragging ? 'scale(1.01)' : 'scale(1)' }}
        >
          <input ref={fileInputRef} type="file" accept=".dxf,.dwg" onChange={handleFileChange} style={{ display: 'none' }} />
          {file ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
                <FileCode2 size={18} style={{ color: '#34d399' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</p>
                <p style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{formatBytes(file.size)} · CAD Drawing</p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, padding: '2px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', fontSize: 9, fontWeight: 700, color: '#34d399', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  <Zap size={8} /> Ready
                </span>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveFile() }}
                style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569' }}
                aria-label="Remove file"><X size={12} />
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)' }}>
                <Upload size={20} style={{ color: '#06b6d4' }} />
              </div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>Drop your CAD file here (.dxf, .dwg)</p>
              <p style={{ fontSize: '11px', color: '#334155', marginTop: 4 }}>or <span style={{ color: '#06b6d4', fontWeight: 600 }}>click to browse</span></p>
              <p style={{ fontSize: '10px', color: '#1e3a50', marginTop: 8, fontFamily: 'monospace', letterSpacing: '0.05em' }}>FORMAT: AutoCAD DXF / DWG (.dxf, .dwg)</p>
            </div>
          )}
        </div>


        {/* ── ⚙️ THAM SỐ TUYẾN & PHÂN ĐOẠN ── */}
        <SectionHeader icon={Sliders} label="⚙️ Tham số Tuyến & Phân đoạn" />
        <GlassCard accent="#06b6d4">
          {/* Sub-label */}
          <p style={{ fontSize: '10px', color: '#334155', marginBottom: 12, lineHeight: 1.5 }}>
            Thông số kỹ thuật dùng cho tính toán phân đoạn, ước lượng vật liệu và báo cáo TCVN.
          </p>
          <div className="space-y-3">
            <ParamInput
              id="segmentLength"
              label="Độ dài phân đoạn"
              value={segmentLength}
              onChange={(e) => updateParam('segmentLength', e.target.value)}
              unit="m"
              icon={Route}
            />
            <ParamInput
              id="roadWidth"
              label="Bề rộng mặt đường"
              value={roadWidth}
              onChange={(e) => updateParam('roadWidth', e.target.value)}
              unit="m"
              icon={FlipHorizontal2}
            />
            <ParamInput
              id="slabLength"
              label="Chiều dài tấm BTXM"
              value={slabLength}
              onChange={(e) => updateParam('slabLength', e.target.value)}
              unit="m"
              icon={RulerIcon}
            />

            {/* Kinh tuyến trục VN-2000 (Tỉnh thành) */}
            <div style={{ paddingTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label htmlFor="centralMeridian" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Compass size={12} style={{ color: '#06b6d4' }} />
                  Kinh tuyến trục (VN-2000)
                </label>
                <span style={{ fontSize: '10px', color: '#06b6d4', fontFamily: 'monospace', fontWeight: 700 }}>
                  {selectedCm}°
                </span>
              </div>
              <select
                id="centralMeridian"
                value={selectedCm}
                onChange={(e) => setSelectedCm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'rgba(15,23,42,0.9)',
                  border: '1px solid rgba(6,182,212,0.25)',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  fontFamily: 'Inter, sans-serif',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="105.75">TP.HCM / Long An / Tiền Giang (105°45')</option>
                <option value="105.50">Tây Ninh (105°30')</option>
                <option value="105.75">Bình Dương / Bình Phước (105°45')</option>
                <option value="107.75">Đồng Nai / BR-Vũng Tàu (107°45')</option>
                <option value="105.00">Cần Thơ / Hậu Giang (105°00')</option>
                <option value="107.75">Đà Nẵng / Quảng Nam (107°45')</option>
                <option value="105.00">Hà Nội / Hải Phòng (105°00')</option>
                <option value="106.00">Bến Tre (106°00')</option>
                <option value="105.00">Múi 6° Quốc gia (105°00')</option>
              </select>
            </div>
          </div>

          {/* Apply button */}
          <button
            type="button"
            id="btn-apply-params"
            onClick={handleApplyParams}
            style={{
              width: '100%', marginTop: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 16px', borderRadius: '8px',
              fontSize: '12px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
              letterSpacing: '0.01em',
              background: '#1e293b', color: '#e2e8f0',
              border: '1px solid rgba(51,65,85,0.9)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.borderColor = '#475569' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.borderColor = 'rgba(51,65,85,0.9)' }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)' }}
            onMouseUp={(e) =>   { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <CheckCircle2 size={13} style={{ color: '#06b6d4' }} />
            Áp dụng tham số
          </button>
        </GlassCard>

        {/* ── CHẾ ĐỘ BẢN ĐỒ ── */}
        <SectionHeader icon={Map} label="Chế độ bản đồ" />
        <GlassCard>
          <p style={{ fontSize: '10px', color: '#475569', marginBottom: 8 }}>Chọn nền bản đồ hiển thị</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <MapStyleBtn active={mapStyle === 'osm'}       icon={LayoutGrid} label="Bản đồ số (OSM)" onClick={() => setMapStyle('osm')} />
            <MapStyleBtn active={mapStyle === 'satellite'} icon={Satellite}  label="Vệ tinh (Satellite)"   onClick={() => setMapStyle('satellite')} />
          </div>
          <p style={{ fontSize: '10px', color: '#334155', marginTop: 8, fontFamily: 'monospace' }}>
            {mapStyle === 'osm' ? '→ OpenStreetMap Standard' : '→ ESRI World Imagery'}
          </p>
        </GlassCard>

        {/* ── LAYER TOGGLES ── */}
        <SectionHeader icon={Layers} label="Bật/Tắt lớp hiển thị" />
        <GlassCard style={{ padding: '8px' }}>
          <LayerToggle
            id="toggle-roadsurface"
            label="Mặt đường 2D (RoadSurface)"
            checked={showRoadSurface}
            onChange={(e) => setShowRoadSurface(e.target.checked)}
            accent="#94a3b8"
            description="Lớp phủ bề mặt đường (Polygon)"
          />
          <div style={{ height: 4 }} />
          <LayerToggle
            id="toggle-centerline"
            label="Tim tuyến (Centerline)"
            checked={showCenterline}
            onChange={(e) => setShowCenterline(e.target.checked)}
            accent="#06b6d4"
            description="Đường tim thiết kế nét đứt"
          />
          <div style={{ height: 4 }} />
          <LayerToggle
            id="toggle-edges"
            label="Mép đường (Road Edges)"
            checked={showEdges}
            onChange={(e) => setShowEdges(e.target.checked)}
            accent="#f59e0b"
            description="Biên giới hạn 2 bên tuyến"
          />
          <div style={{ height: 4 }} />
          <LayerToggle
            id="toggle-stations"
            label="Cọc lý trình (Stations)"
            checked={showStations}
            onChange={(e) => setShowStations(e.target.checked)}
            accent="#22d3ee"
            description="Nhãn cọc lý trình & khoảng cách"
          />
          <div style={{ height: 4 }} />
          <LayerToggle
            id="toggle-vertices"
            label="Các điểm mốc (Vertices)"
            checked={showVertices}
            onChange={(e) => setShowVertices(e.target.checked)}
            accent="#fbbf24"
            description="Hiển thị tọa độ các đỉnh mốc"
          />
        </GlassCard>

        {/* ── XUẤT DỮ LIỆU & BÁO CÁO ── */}
        <SectionHeader icon={Download} label="Xuất dữ liệu & báo cáo" />
        <GlassCard style={{ padding: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Tải Báo Cáo Excel */}
            <button
              type="button"
              id="btn-download-excel"
              onClick={handleDownloadExcel}
              disabled={!geoJsonData && !analyticsData}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: '8px',
                fontSize: '12px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                cursor: (geoJsonData || analyticsData) ? 'pointer' : 'not-allowed',
                border: (geoJsonData || analyticsData) ? '1px solid rgba(16,185,129,0.35)' : '1px solid #1e293b',
                transition: 'all 0.2s',
                ...((geoJsonData || analyticsData)
                  ? { background: 'rgba(16,185,129,0.12)', color: '#34d399', boxShadow: '0 0 12px rgba(16,185,129,0.1)' }
                  : { background: 'rgba(15,23,42,0.5)', color: '#334155' }),
              }}
              onMouseEnter={(e) => { if (geoJsonData || analyticsData) { e.currentTarget.style.background = 'rgba(16,185,129,0.2)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(16,185,129,0.25)' } }}
              onMouseLeave={(e) => { if (geoJsonData || analyticsData) { e.currentTarget.style.background = 'rgba(16,185,129,0.12)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(16,185,129,0.1)' } }}
            >
              <FileSpreadsheet size={14} style={{ color: '#34d399' }} />
              📥 Tải Báo Cáo Excel
              <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#10b981', fontFamily: 'monospace' }}>.xlsx</span>
            </button>

            <button
              type="button" id="btn-download-geojson" onClick={handleDownloadGeoJSON} disabled={!geoJsonData}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: '8px',
                fontSize: '12px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                cursor: geoJsonData ? 'pointer' : 'not-allowed',
                border: 'none', transition: 'all 0.2s',
                ...(geoJsonData ? { background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }
                                : { background: 'rgba(15,23,42,0.5)', color: '#334155', border: '1px solid #1e293b' }),
              }}
              onMouseEnter={(e) => { if (geoJsonData) { e.currentTarget.style.background = 'rgba(52,211,153,0.18)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(52,211,153,0.2)' } }}
              onMouseLeave={(e) => { if (geoJsonData) { e.currentTarget.style.background = 'rgba(52,211,153,0.1)'; e.currentTarget.style.boxShadow = 'none' } }}
            >
              <Download size={14} />
              Tải GeoJSON
              <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#334155', fontFamily: 'monospace' }}>.geojson</span>
            </button>

            <button
              type="button" id="btn-print" onClick={handlePrint}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: '8px',
                fontSize: '12px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                cursor: 'pointer', border: '1px solid rgba(167,139,250,0.2)',
                background: 'rgba(167,139,250,0.08)', color: '#a78bfa',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(167,139,250,0.15)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(167,139,250,0.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <Printer size={14} />
              In báo cáo (Print View)
              <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#334155', fontFamily: 'monospace' }}>Ctrl+P</span>
            </button>
          </div>
        </GlassCard>

      </div>

      {/* ── Action Button ── */}
      <div className="shrink-0 px-5 py-4" style={{ borderTop: '1px solid rgba(30,41,59,0.8)', background: '#0a0f1e' }}>
        <button
          type="button" id="parse-btn" onClick={handleSubmit} disabled={loading || !file}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            padding: '13px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 800,
            fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase',
            border: 'none', cursor: loading || !file ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease',
            ...(loading || !file
              ? { background: '#0f172a', color: '#334155', border: '1px solid #1e293b' }
              : { background: 'linear-gradient(135deg, #0e7490, #0284c7)', color: '#fff', boxShadow: '0 4px 24px -4px rgba(6,182,212,0.4), 0 0 0 1px rgba(6,182,212,0.2)' }
            ),
          }}
          onMouseEnter={(e) => { if (!loading && file) { e.currentTarget.style.background = 'linear-gradient(135deg, #06b6d4, #0ea5e9)'; e.currentTarget.style.boxShadow = '0 8px 32px -4px rgba(6,182,212,0.55)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={(e) => { if (!loading && file) { e.currentTarget.style.background = 'linear-gradient(135deg, #0e7490, #0284c7)'; e.currentTarget.style.boxShadow = '0 4px 24px -4px rgba(6,182,212,0.4)'; e.currentTarget.style.transform = 'translateY(0)' } }}
          onMouseDown={(e) => { if (!loading && file) e.currentTarget.style.transform = 'scale(0.98)' }}
          onMouseUp={(e)   => { if (!loading && file) e.currentTarget.style.transform = 'translateY(-1px)' }}
        >
          {loading
            ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />Parsing…</>
            : <><Zap size={14} />Parse &amp; Visualize<ChevronRight size={14} /></>
          }
        </button>
        <p style={{ textAlign: 'center', fontSize: '10px', color: '#1e3a50', marginTop: '10px', fontFamily: 'monospace' }}>
          POST → <span style={{ color: '#0e7490' }}>localhost:5198</span>/api/cad/render-overlay
        </p>
      </div>
    </div>
  )
}
