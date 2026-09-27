import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FileCode2, Sliders, Layers, Loader2, X,
  FileSpreadsheet, Compass, Upload,
  CheckCircle2, Sparkles, Download,
  Eye, EyeOff, Ruler, FlipHorizontal2, Route,
  BarChart3, ChevronLeft, Settings2,
  CheckSquare, Square, Search, Target, Navigation
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
  showSlabs,
  setShowSlabs,
  showSlabLabels,
  setShowSlabLabels,
  completedSegments = [],
  setCompletedSegments,
  onFocusSegment,
  roadParams,
  setRoadParams,
  cadFile,
  collapsed,
  setCollapsed,
}) {
  const [file, setFile] = useState(cadFile || null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [cadLayerStats, setCadLayerStats] = useState([])
  const [layerSearch, setLayerSearch] = useState('')
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

    // 1. Dải Mặt Đường Bê Tông 2D (Single Polygon hoặc Multi Polygon)
    let hasMainSurface = false
    if (data.roadSurfacePolygon && data.roadSurfacePolygon.length >= 3) {
      const isNested = Array.isArray(data.roadSurfacePolygon[0]) && Array.isArray(data.roadSurfacePolygon[0][0])
      const rawRing = isNested ? data.roadSurfacePolygon[0] : data.roadSurfacePolygon
      const ring = rawRing.map(toLngLat)
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
      hasMainSurface = true
    }

    // 1.2 Đảo giao thông (Traffic Islands từ Backend)
    const islandFeatures = []
    if (Array.isArray(data.trafficIslands) && data.trafficIslands.length > 0) {
      data.trafficIslands.forEach((island, iIdx) => {
        if (Array.isArray(island) && island.length >= 3) {
          const ring = island.map(toLngLat)
          if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
            ring.push(ring[0])
          }
          islandFeatures.push({
            type: 'Feature',
            id: `traffic-island-${iIdx}`,
            properties: {
              type: 'TrafficIsland',
              layer: 'DAO_GIAO_THONG',
              name: `Đảo Giao Thông ${iIdx + 1}`,
              isIsland: true,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          })
        }
      })
    }

    // 1.3 Hỗ trợ thêm nếu backend trả về danh sách nhiều polygon (roadSurfacePolygons)
    if (Array.isArray(data.roadSurfacePolygons) && data.roadSurfacePolygons.length > 0) {
      data.roadSurfacePolygons.forEach((poly, pIdx) => {
        if (pIdx === 0 && hasMainSurface) return
        if (pIdx > 0 && islandFeatures.length > 0) return

        if (Array.isArray(poly) && poly.length >= 3) {
          const ring = poly.map(toLngLat)
          if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
            ring.push(ring[0])
          }
          const isIsland = pIdx > 0 || hasMainSurface
          const feat = {
            type: 'Feature',
            id: isIsland ? `traffic-island-p-${pIdx}` : `road-surface-polygon-${pIdx}`,
            properties: {
              type: isIsland ? 'TrafficIsland' : 'RoadSurface',
              layer: isIsland ? 'DAO_GIAO_THONG' : 'MAT_DUONG_BETONG',
              name: isIsland ? `Đảo Giao Thông Phân Đoạn ${pIdx}` : `Mặt Đường Phân Đoạn ${pIdx + 1}`,
              roadWidth: data.roadWidth || 7.0,
              isIsland,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          }
          if (isIsland) {
            islandFeatures.push(feat)
          } else {
            features.push(feat)
            hasMainSurface = true
          }
        }
      })
    }

    // Đẩy tất cả đảo giao thông vào features
    features.push(...islandFeatures)

    // 2. Trục Tim Tuyến Đường Chính
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

    // 2.2 Các Nhánh Tim Tuyến Phụ & Ngã 3 Tam Giác (Centerline Branches)
    if (Array.isArray(data.centerlineBranches) && data.centerlineBranches.length > 0) {
      data.centerlineBranches.forEach((branch, bIdx) => {
        if (Array.isArray(branch) && branch.length >= 2) {
          features.push({
            type: 'Feature',
            id: `road-centerline-branch-${bIdx}`,
            properties: {
              type: 'Centerline',
              layer: 'TIM_TUYEN_NHANH',
              name: `Nhánh Tim Nút Giao ${bIdx + 1}`,
              isBranch: true,
            },
            geometry: {
              type: 'LineString',
              coordinates: branch.map(toLngLat),
            },
          })
        }
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
      totalLengthMeters: data.totalLengthMeters,
      layerStats: data.layerStats,
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
        if (Array.isArray(roadData.layerStats)) {
          setCadLayerStats(roadData.layerStats)
        }
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
          if (roadResult.status === 'fulfilled' && roadResult.value?.data?.totalLengthMeters) {
            analytics.totalLengthMeters = roadResult.value.data.totalLengthMeters
            const rawW = parseFloat(roadWidth) || 3.5
            const w = rawW >= 5.0 ? rawW : rawW * 2.0
            analytics.totalAreaSqm = Number((analytics.totalLengthMeters * w).toFixed(1))
            analytics.roadSegments = Math.ceil(analytics.totalLengthMeters / (parseFloat(segmentLength) || 100))
            analytics.estimatedConcreteSlabs = Math.floor(analytics.totalLengthMeters / (parseFloat(slabLength) || 4.0))
          }
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

  // ── Drone Segments Calculation ──
  const droneSegments = useMemo(() => {
    let totLen = 746.57
    if (geoJsonData?.totalLengthMeters && Number(geoJsonData.totalLengthMeters) > 0) {
      totLen = Number(geoJsonData.totalLengthMeters)
    } else if (geoJsonData?.features) {
      const cl = geoJsonData.features.find(f => f.id === 'road-centerline-main' || f.properties?.type === 'Centerline')
      if (cl?.properties?.totalLength) {
        totLen = Number(cl.properties.totalLength)
      }
    } else if (analyticsData?.totalLengthMeters && Number(analyticsData.totalLengthMeters) > 0) {
      totLen = Number(analyticsData.totalLengthMeters)
    }

    const segL = parseFloat(segmentLength) || 100
    const count = Math.max(1, Math.ceil(totLen / segL))
    const list = []
    for (let i = 1; i <= count; i++) {
      const segId = `SEG-${String(i).padStart(2, '0')}`
      const startM = Math.round((i - 1) * segL)
      const endM = Math.round(Math.min(i * segL, totLen))
      const startKm = `Km0+${String(startM).padStart(3, '0')}`
      const endKm = `Km0+${String(endM).padStart(3, '0')}`
      list.push({
        id: segId,
        index: i,
        name: `Phân đoạn ${i}`,
        range: `${startKm} - ${endKm}`,
        startM,
        endM,
        startDist: startM,
        endDist: endM,
        length: Math.round(endM - startM),
      })
    }

    // Kiểm tra và bổ sung phân đoạn cho các nhánh nút giao (Đặng Thúc Vịnh / Quang Trung)
    const branchFeatures = geoJsonData?.features?.filter(
      f => f.id?.startsWith('road-centerline-branch') || f.properties?.isBranch
    )
    if (branchFeatures && branchFeatures.length > 0) {
      let bLen = 0
      branchFeatures.forEach(bf => {
        const coords = bf.geometry?.coordinates
        if (coords && coords.length >= 2) {
          for (let k = 0; k < coords.length - 1; k++) {
            const dx = (coords[k+1][0] - coords[k][0]) * 111320 * Math.cos(coords[k][1] * Math.PI / 180)
            const dy = (coords[k+1][1] - coords[k][1]) * 111320
            bLen += Math.hypot(dx, dy)
          }
        }
      })
      const finalBLen = Math.round(bLen) || 119
      const segId = `SEG-${String(list.length + 1).padStart(2, '0')}`
      list.push({
        id: segId,
        index: list.length + 1,
        name: 'Nhánh Nút Giao Đặng Thúc Vịnh',
        range: `Nút Giao Đặng Thúc Vịnh (${finalBLen}m)`,
        startM: Math.round(totLen),
        endM: Math.round(totLen + finalBLen),
        startDist: Math.round(totLen),
        endDist: Math.round(totLen + finalBLen),
        length: finalBLen,
        isBranch: true,
      })
    }

    return list
  }, [geoJsonData, analyticsData, segmentLength])

  const displayLength = useMemo(() => {
    let base = Number(geoJsonData?.totalLengthMeters || analyticsData?.totalLengthMeters || 746.57)
    const branchFeatures = geoJsonData?.features?.filter(
      f => f.id?.startsWith('road-centerline-branch') || f.properties?.isBranch
    )
    if (branchFeatures && branchFeatures.length > 0) {
      let bLen = 0
      branchFeatures.forEach(bf => {
        const coords = bf.geometry?.coordinates
        if (coords && coords.length >= 2) {
          for (let k = 0; k < coords.length - 1; k++) {
            const dx = (coords[k+1][0] - coords[k][0]) * 111320 * Math.cos(coords[k][1] * Math.PI / 180)
            const dy = (coords[k+1][1] - coords[k][1]) * 111320
            bLen += Math.hypot(dx, dy)
          }
        }
      })
      base += Math.round(bLen) || 119
    }
    return Number(base.toFixed(1))
  }, [geoJsonData, analyticsData])

  const displayWidth = useMemo(() => {
    const rawW = parseFloat(roadWidth) || 3.5
    return rawW >= 5.0 ? rawW : rawW * 2.0
  }, [roadWidth])

  const displayArea = useMemo(() => {
    return Number((displayLength * displayWidth).toFixed(1))
  }, [displayLength, displayWidth])

  const displaySlabs = useMemo(() => {
    return Math.floor(displayLength / (parseFloat(slabLength) || 4.0))
  }, [displayLength, slabLength])

  const displaySegments = useMemo(() => {
    return droneSegments.length
  }, [droneSegments])

  const toggleSegment = (segId) => {
    if (!setCompletedSegments) return
    setCompletedSegments(prev => {
      const current = Array.isArray(prev) ? prev : []
      if (current.includes(segId)) {
        return current.filter(id => id !== segId)
      } else {
        return [...current, segId]
      }
    })
  }

  const handleSelectAllSegments = () => {
    if (!setCompletedSegments) return
    setCompletedSegments(droneSegments.map(s => s.id))
    toast.success('Đã đánh dấu hoàn thành tất cả phân đoạn!')
  }

  const handleDeselectAllSegments = () => {
    if (!setCompletedSegments) return
    setCompletedSegments([])
    toast('Đã hoàn tác trạng thái phân đoạn.')
  }

  // ── CAD Layer Stats & Filtering ──
  const activeLayerStats = useMemo(() => {
    if (cadLayerStats && cadLayerStats.length > 0) return cadLayerStats
    if (geoJsonData?.layerStats && geoJsonData.layerStats.length > 0) return geoJsonData.layerStats
    if (analyticsData?.layerBreakdown && Array.isArray(analyticsData.layerBreakdown)) {
      return analyticsData.layerBreakdown.map(l => ({
        name: l.layer || l.name,
        count: l.entityCount || l.count || 0,
        category: l.category || 'Other'
      }))
    }
    if (geoJsonData?.features) {
      const counts = {}
      geoJsonData.features.forEach(f => {
        const lyr = f.properties?.layer || f.layer || 'CHUA_PHAN_LOAI'
        counts[lyr] = (counts[lyr] || 0) + 1
      })
      return Object.entries(counts).map(([name, count]) => {
        let category = 'Other'
        const u = name.toUpperCase()
        if (u.includes('TIM') || u.includes('CENTER')) category = 'RoadNetwork'
        else if (u.includes('MEP')) category = 'RoadEdge'
        else if (u.includes('MAT') || u.includes('SURFACE')) category = 'RoadSurface'
        else if (u.includes('DAO') || u.includes('ISLAND')) category = 'Island'
        return { name, count, category }
      }).sort((a, b) => b.count - a.count)
    }
    return []
  }, [cadLayerStats, geoJsonData, analyticsData])

  const filteredLayers = useMemo(() => {
    if (!layerSearch.trim()) return activeLayerStats
    const term = layerSearch.toLowerCase()
    return activeLayerStats.filter(l => 
      l.name.toLowerCase().includes(term) || (l.category && l.category.toLowerCase().includes(term))
    )
  }, [activeLayerStats, layerSearch])

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'RoadNetwork': return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      case 'RoadSurface': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'RoadEdge':
      case 'LeftEdge': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'Survey':
      case 'Building': return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      case 'Drainage': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      case 'CrossSection': return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      case 'Sidewalk': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      default: return 'bg-slate-700/40 text-slate-300 border-slate-600/30'
    }
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

            {/* Slabs & Joints */}
            <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-2.5 rounded-sm border border-cyan-400 bg-cyan-950/40 relative flex items-center justify-center">
                  <div className="w-full h-[1px] bg-cyan-300" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-200">Tấm BTXM & Khe co giãn</span>
                  <span className="text-[10px] text-cyan-400 font-mono">TCVN 10380 (L={slabLength}m)</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSlabs?.(!showSlabs)}
                className={`p-1 rounded-md transition-colors ${showSlabs ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
                title="Bật/tắt dải tấm bê tông và khe cắt ngang"
              >
                {showSlabs ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>

            {/* Slab Labels */}
            <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="px-1 py-0.2 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono font-bold text-cyan-300">
                  S-001
                </div>
                <span className="text-xs font-medium text-slate-200">Nhãn mã tấm BTXM</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSlabLabels?.(!showSlabLabels)}
                className={`p-1 rounded-md transition-colors ${showSlabLabels ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
                title="Bật/tắt nhãn tên tấm bê tông (S-001, S-002...)"
              >
                {showSlabLabels ? <Eye size={15} /> : <EyeOff size={15} />}
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

        {/* ── Card 4: Quản lý Phân Đoạn Bay Drone (SEG-01 -> SEG-09) ── */}
        <div className="bg-[#161c2e] border border-[#232d47] rounded-xl p-3.5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span className="flex items-center gap-1.5 text-blue-400">
              <Navigation size={13} className="text-cyan-400" />
              Tiến Độ Bay Drone Theo Phân Đoạn
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
              {completedSegments.length}/{droneSegments.length} đoạn ({Math.round((completedSegments.length / (droneSegments.length || 1)) * 100)}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#0e121f] h-2 rounded-full overflow-hidden border border-[#232d47]">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${Math.round((completedSegments.length / (droneSegments.length || 1)) * 100)}%` }}
            />
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-400">Chọn trạng thái khảo sát:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectAllSegments}
                className="px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium transition-colors"
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={handleDeselectAllSegments}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 font-medium transition-colors"
              >
                Bỏ chọn
              </button>
            </div>
          </div>

          {/* Segment List */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {droneSegments.map((seg) => {
              const isCompleted = completedSegments.includes(seg.id)
              return (
                <div
                  key={seg.id}
                  className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                    isCompleted
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                      : 'bg-[#0e121f] border-[#232d47] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleSegment(seg.id)}
                      className={`transition-colors ${isCompleted ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
                      title={isCompleted ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu đã bay xong'}
                    >
                      {isCompleted ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-white">{seg.id}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {isCompleted ? 'ĐÃ BAY' : 'CHỜ BAY'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 truncate">
                        {seg.range} ({seg.length}m)
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onFocusSegment?.(seg)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#161c2e] hover:bg-blue-600 text-slate-300 hover:text-white border border-[#232d47] text-[10px] font-medium transition-all shadow-sm shrink-0"
                    title="Định vị phân đoạn này trên bản đồ"
                  >
                    <Target size={11} className="text-cyan-400 group-hover:text-white" />
                    <span>Lia tới</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Card 5: Bảng Thống Kê Layer Trong Bản Vẽ CAD ── */}
        <div className="bg-[#161c2e] border border-[#232d47] rounded-xl p-3.5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span className="flex items-center gap-1.5 text-blue-400">
              <Layers size={13} className="text-blue-400" />
              Các Layer Trong Bản Vẽ CAD
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 font-bold">
              {filteredLayers.length} layers
            </span>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={layerSearch}
              onChange={(e) => setLayerSearch(e.target.value)}
              placeholder="Tìm layer (vd: MEPNHUA, NHA_CUA...)"
              className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg pl-7 pr-7 py-1.5 font-mono text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {layerSearch && (
              <button
                type="button"
                onClick={() => setLayerSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Layer List */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {filteredLayers.length > 0 ? (
              filteredLayers.map((l, lIdx) => (
                <div
                  key={`${l.name}-${lIdx}`}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#0e121f] border border-[#232d47] hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span className="font-mono font-medium text-xs text-white truncate max-w-[140px]" title={l.name}>
                      {l.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {l.category && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${getCategoryColor(l.category)}`}>
                        {l.category}
                      </span>
                    )}
                    <span className="text-[10px] font-mono font-semibold text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                      {l.count} đ.tượng
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-slate-500 text-[11px]">
                {activeLayerStats.length === 0 ? 'Nạp file CAD để xem thống kê layer' : 'Không tìm thấy layer phù hợp'}
              </div>
            )}
          </div>
        </div>

        {/* ── Card 4: Engineering Analysis KPIs (When Ready) ── */}
        {(analyticsData || geoJsonData) && (
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
                  {displayLength.toFixed(1)} m
                </p>
              </div>

              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Diện tích mặt</p>
                <p className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                  {displayArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²
                </p>
              </div>

              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Số tấm BTXM</p>
                <p className="font-mono font-bold text-cyan-300 text-sm mt-0.5">
                  {displaySlabs} tấm
                </p>
              </div>

              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Phân đoạn</p>
                <p className="font-mono font-bold text-amber-300 text-sm mt-0.5">
                  {displaySegments} đoạn
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
