import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'
import toast from 'react-hot-toast'
import {
  FileCode2, Sliders, Layers, Loader2, X,
  FileSpreadsheet, Compass, Upload,
  CheckCircle2, Sparkles, Download,
  Eye, EyeOff, Ruler, FlipHorizontal2, Route,
  BarChart3, ChevronLeft, Settings2,
  CheckSquare, Square, Search, Target, Navigation, AlertTriangle
} from 'lucide-react'
import { downloadExcelReport } from '../utils/excelExporter'
import {
  VN2000_REFERENCE_PRESETS,
  convertRoadResponseToGeoJson,
  enrichGeoJsonWithEngineeringFeatures,
  normalizeRoadParams,
} from '../utils/roadEngineeringBuilder'

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
  onCustomFeaturesChange,
}) {
  const [file, setFile] = useState(cadFile || null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [cadLayerStats, setCadLayerStats] = useState([])
  const [layerSearch, setLayerSearch] = useState('')
  const [visibleLayers, setVisibleLayers] = useState({})
  const [layerGeometries, setLayerGeometries] = useState({})
  const [loadingLayers, setLoadingLayers] = useState({})
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [activeCenterlineLayer, setActiveCenterlineLayer] = useState(null)
  const [coordsOpen, setCoordsOpen] = useState(false)
  const [coordsText, setCoordsText] = useState('')
  const [axisAmbiguityAlert, setAxisAmbiguityAlert] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (cadFile && cadFile !== file) {
      setFile(cadFile)
    }
  }, [cadFile, file])

  const segmentLength = roadParams?.segmentLength ?? '100'
  const roadWidth     = roadParams?.roadWidth ?? '7.0'
  const slabLength    = roadParams?.slabLength ?? '4.0'
  const laneCount     = roadParams?.laneCount ?? '2'

  // VN-2000 Geodetic CRS state (supports reference presets + custom CM + 3°/6° zone + explicit axis order)
  const [selectedPresetId, setSelectedPresetId] = useState('hcm-3deg')
  const [selectedCm, setSelectedCm] = useState('105.75')
  const [scaleFactor, setScaleFactor] = useState('0.9999')
  const [axisOrder, setAxisOrder] = useState('AUTO')

  const handlePresetChange = (presetId) => {
    setSelectedPresetId(presetId)
    const found = VN2000_REFERENCE_PRESETS.find((p) => p.id === presetId)
    if (found) {
      setSelectedCm(found.cm.toFixed(2))
      setScaleFactor(found.scaleFactor.toFixed(4))
    }
  }

  const updateParam = (key, val) => {
    if (setRoadParams) {
      setRoadParams((prev) => ({ ...prev, [key]: val }))
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
    setVisibleLayers({})
    setLayerGeometries({})
    setLoadingLayers({})
    setActiveCenterlineLayer(null)
    if (onCustomFeaturesChange) onCustomFeaturesChange([])
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

  const handleSubmit = async (overrideLayerName = null) => {
    if (!file) {
      toast.error('Vui lòng chọn file CAD (.dxf/.dwg) trước.')
      return
    }
    const targetLayer = typeof overrideLayerName === 'string' ? overrideLayerName : activeCenterlineLayer
    const normParams = normalizeRoadParams({ segmentLength, roadWidth, slabLength, laneCount })
    const exactRoadWidth = normParams.roadWidth
    const cmVal = parseFloat(selectedCm) || 105.75
    const k0Val = parseFloat(scaleFactor) || 0.9999

    setLoading(true)
    const tid = toast.loading(targetLayer ? `Đang dựng lại tuyến theo layer tim [${targetLayer}]…` : 'Đang bóc tách tim tuyến chính & chuyển đổi tọa độ VN-2000…')
    try {
      const roadFd = new FormData()
      roadFd.append('File', file)
      roadFd.append('RoadWidth', exactRoadWidth.toString())
      roadFd.append('CentralMeridian', cmVal.toString())
      roadFd.append('ScaleFactor', k0Val.toString())
      if (targetLayer) {
        roadFd.append('CenterlineLayerName', targetLayer)
      }

      const parseFd = new FormData()
      parseFd.append('file', file)
      parseFd.append('targetSrid', '4326')
      parseFd.append('tessellationSegments', '72')
      parseFd.append('centralMeridian', cmVal.toString())
      parseFd.append('scaleFactor', k0Val.toString())
      parseFd.append('SegmentLength', normParams.segmentLength.toString())
      parseFd.append('RoadWidth', exactRoadWidth.toString())
      parseFd.append('SlabLength', normParams.slabLength.toString())
      if (targetLayer) {
        parseFd.append('centerlineLayerName', targetLayer)
      }

      const [roadResult, parseResult] = await Promise.allSettled([
        axios.post(`${API_BASE}/api/cad/parse-road`, roadFd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
        axios.post(`${API_BASE}/api/cad/parse-dxf`, parseFd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      ])

      let loadedSomething = false

      if (roadResult.status === 'fulfilled' && roadResult.value?.data?.success) {
        const roadData = roadResult.value.data
        if (Array.isArray(roadData.layerStats)) {
          setCadLayerStats(roadData.layerStats)
        }
        const geojson = convertRoadResponseToGeoJson(roadData, normParams)
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
            const rData = roadResult.value.data
            analytics.totalLengthMeters = rData.totalLengthMeters
            analytics.nominalAreaSqm = Number((rData.totalLengthMeters * exactRoadWidth).toFixed(2))
            analytics.surfaceAreaSqm = rData.surfaceAreaSqm ?? analytics.nominalAreaSqm
            analytics.totalAreaSqm = analytics.nominalAreaSqm
            analytics.roadSegments = Math.ceil(rData.totalLengthMeters / normParams.segmentLength)
            analytics.longitudinalSlabs = Math.floor(rData.totalLengthMeters / normParams.slabLength)
            analytics.estimatedConcreteSlabs = analytics.longitudinalSlabs * normParams.laneCount
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

  const handleSubmitCoords = async (overrideAxisOrder = null) => {
    if (!coordsText.trim()) {
      toast.error('Vui lòng nhập danh sách tọa độ VN-2000.')
      return
    }
    const effectiveAxisOrder = typeof overrideAxisOrder === 'string' ? overrideAxisOrder : axisOrder
    if (typeof overrideAxisOrder === 'string') {
      setAxisOrder(overrideAxisOrder)
    }
    setAxisAmbiguityAlert(null)

    const normParams = normalizeRoadParams({ segmentLength, roadWidth, slabLength, laneCount })
    const exactRoadWidth = normParams.roadWidth
    const cmVal = parseFloat(selectedCm) || 105.75
    const k0Val = parseFloat(scaleFactor) || 0.9999

    setLoading(true)
    const tid = toast.loading('Đang dựng tuyến từ tọa độ VN-2000…')
    try {
      const res = await axios.post(`${API_BASE}/api/cad/parse-coords`, {
        coordinates: coordsText,
        roadWidth: exactRoadWidth,
        centralMeridian: cmVal,
        scaleFactor: k0Val,
        axisOrder: effectiveAxisOrder,
      })
      const roadData = res.data
      if (!roadData?.success) {
        throw new Error(roadData?.detail || 'Không thể dựng tuyến từ tọa độ')
      }

      if (file) handleRemoveFile()
      setCadLayerStats([])

      const geojson = convertRoadResponseToGeoJson(roadData, normParams)
      if (geojson && onDataLoaded) onDataLoaded(geojson)

      if (onAnalyticsLoaded) {
        const len = roadData.totalLengthMeters || 0
        const nominalArea = Number((len * exactRoadWidth).toFixed(2))
        onAnalyticsLoaded({
          totalLengthMeters: len,
          nominalAreaSqm: nominalArea,
          surfaceAreaSqm: roadData.surfaceAreaSqm ?? nominalArea,
          totalAreaSqm: nominalArea,
          roadSegments: Math.ceil(len / normParams.segmentLength),
          longitudinalSlabs: Math.floor(len / normParams.slabLength),
          estimatedConcreteSlabs: Math.floor(len / normParams.slabLength) * normParams.laneCount,
        })
      }
      toast.success(`Đã dựng tuyến ${roadData.totalLengthMeters} m từ ${roadData.centerline?.length ?? 0} điểm tọa độ`, { id: tid })
    } catch (err) {
      const errData = err?.response?.data
      if (errData?.error === 'AmbiguousAxisOrder' || errData?.requiresAxisConfirmation) {
        setAxisAmbiguityAlert(errData.detail || 'Tọa độ nằm trong vùng giao thoa X/Y. Vui lòng chọn rõ thứ tự trục.')
        toast.error('Cần xác nhận quy ước trục tọa độ X/Y!', { id: tid })
      } else {
        const msg = errData?.detail || err?.message || 'Lỗi kết nối máy chủ'
        toast.error(`Lỗi: ${msg}`, { id: tid })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleToggleLayer = async (layerName, category) => {
    if (!file) {
      toast.error('Vui lòng chọn file CAD trước.')
      return
    }
    const isCurrentlyVisible = !!visibleLayers[layerName]
    const nextVisible = { ...visibleLayers, [layerName]: !isCurrentlyVisible }
    setVisibleLayers(nextVisible)

    let updatedGeometries = { ...layerGeometries }

    if (!isCurrentlyVisible && !updatedGeometries[layerName]) {
      setLoadingLayers(prev => ({ ...prev, [layerName]: true }))
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('centerlineLayerName', layerName)
        fd.append('targetSrid', '4326')
        fd.append('tessellationSegments', '72')
        if (selectedCm) {
          fd.append('centralMeridian', selectedCm.toString())
        }
        if (scaleFactor) {
          fd.append('scaleFactor', scaleFactor.toString())
        }
        const res = await axios.post(`${API_BASE}/api/cad/parse-dxf`, fd)
        const raw = res.data?.featureCollection?.features || []
        const tagged = raw.map((f, fIdx) => ({
          ...f,
          id: `custom-cad-${layerName}-${fIdx}`,
          properties: {
            ...(f.properties || {}),
            isCustomCadLayer: true,
            layer: layerName,
            category: category || 'Other',
          }
        }))
        updatedGeometries[layerName] = tagged
        setLayerGeometries(updatedGeometries)
        toast.success(`Đã nạp ${tagged.length} đối tượng cho layer ${layerName}`)
      } catch (err) {
        console.error('Error fetching layer geometry:', err)
        toast.error(`Không thể tải hình học cho layer ${layerName}`)
        setVisibleLayers(prev => ({ ...prev, [layerName]: false }))
        return
      } finally {
        setLoadingLayers(prev => ({ ...prev, [layerName]: false }))
      }
    }

    const allActive = []
    Object.keys(nextVisible).forEach(lyr => {
      if (nextVisible[lyr] && updatedGeometries[lyr]) {
        allActive.push(...updatedGeometries[lyr])
      }
    })
    if (onCustomFeaturesChange) {
      onCustomFeaturesChange(allActive)
    }
  }

  const handleHideAllCustomLayers = () => {
    setVisibleLayers({})
    if (onCustomFeaturesChange) {
      onCustomFeaturesChange([])
    }
    toast('Đã ẩn toàn bộ các layer CAD bổ sung.')
  }

  const handleSetCenterlineLayer = (layerName) => {
    setActiveCenterlineLayer(layerName)
    handleSubmit(layerName)
  }

  // ── Single Source of Truth Engineering Computation ──
  const { enrichedGeoJson, droneSegments: ssotDroneSegments, metrics: ssotMetrics } = useMemo(() => {
    if (!geoJsonData) {
      return { enrichedGeoJson: null, droneSegments: [], metrics: null }
    }
    return enrichGeoJsonWithEngineeringFeatures(geoJsonData, roadParams, [], completedSegments)
  }, [geoJsonData, roadParams, completedSegments])

  const handleDownloadExcel = async () => {
    if (!geoJsonData && !analyticsData) {
      toast.error('Chưa có dữ liệu CAD để xuất báo cáo.')
      return
    }
    const normParams = normalizeRoadParams(roadParams)
    await downloadExcelReport({
      geoJsonData: enrichedGeoJson || geoJsonData,
      analyticsData,
      roadParams: normParams,
    })
  }

  const handleDownloadGeoJSON = () => {
    const targetGeoJson = enrichedGeoJson || geoJsonData
    if (!targetGeoJson) {
      toast.error('Chưa có dữ liệu GeoJSON.')
      return
    }
    const blob = new Blob([JSON.stringify(targetGeoJson, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'roadguard-export.geojson'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã tải tệp GeoJSON chuẩn RFC 7946!')
  }

  const droneSegments = ssotDroneSegments

  const displayLength = useMemo(() => {
    const len = Number(ssotMetrics?.totalLengthMeters ?? analyticsData?.totalLengthMeters ?? geoJsonData?.totalLengthMeters ?? 0)
    return Number(len.toFixed(1))
  }, [ssotMetrics, geoJsonData, analyticsData])

  const displayWidth = useMemo(() => {
    return normalizeRoadParams(roadParams).roadWidth
  }, [roadParams])

  const displayArea = useMemo(() => {
    return Number((ssotMetrics?.nominalAreaSqm ?? displayLength * displayWidth).toFixed(1))
  }, [ssotMetrics, displayLength, displayWidth])

  const displaySurfaceArea = useMemo(() => {
    return Number((ssotMetrics?.surfaceAreaSqm ?? displayArea).toFixed(1))
  }, [ssotMetrics, displayArea])

  const displaySlabs = useMemo(() => {
    if (ssotMetrics?.totalSlabPieces != null) return ssotMetrics.totalSlabPieces
    const norm = normalizeRoadParams(roadParams)
    return Math.floor(displayLength / norm.slabLength) * norm.laneCount
  }, [ssotMetrics, displayLength, roadParams])

  const displayLongitudinalSlabs = useMemo(() => {
    if (ssotMetrics?.longitudinalSlabs != null) return ssotMetrics.longitudinalSlabs
    const norm = normalizeRoadParams(roadParams)
    return Math.floor(displayLength / norm.slabLength)
  }, [ssotMetrics, displayLength, roadParams])

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

  const CATEGORIES = [
    { id: 'ALL', label: 'Tất cả' },
    { id: 'Building', label: 'Nhà cửa' },
    { id: 'Drainage', label: 'Thoát nước' },
    { id: 'RoadNetwork', label: 'Tim đường' },
    { id: 'RoadEdge', label: 'Mép đường' },
    { id: 'Sidewalk', label: 'Vỉa hè' },
    { id: 'Other', label: 'Khác' },
  ]

  const activeVisibleCount = useMemo(() => {
    return Object.values(visibleLayers).filter(Boolean).length
  }, [visibleLayers])

  const filteredLayers = useMemo(() => {
    let list = activeLayerStats
    if (selectedCategory !== 'ALL') {
      if (selectedCategory === 'Other') {
        const standardCats = ['Building', 'Drainage', 'RoadNetwork', 'RoadEdge', 'LeftEdge', 'Sidewalk']
        list = list.filter(l => !standardCats.includes(l.category))
      } else if (selectedCategory === 'RoadEdge') {
        list = list.filter(l => l.category === 'RoadEdge' || l.category === 'LeftEdge')
      } else {
        list = list.filter(l => l.category === selectedCategory)
      }
    }
    if (!layerSearch.trim()) return list
    const term = layerSearch.toLowerCase()
    return list.filter(l => 
      l.name.toLowerCase().includes(term) || (l.category && l.category.toLowerCase().includes(term))
    )
  }, [activeLayerStats, layerSearch, selectedCategory])

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

          {/* VN-2000 Geodetic CRS Configuration */}
          <div className="pt-0.5 space-y-2.5">
            <div>
              <div className="flex items-center justify-between mb-1.5 text-[11px]">
                <label htmlFor="cm-preset-select" className="font-medium text-slate-300 flex items-center gap-1.5">
                  <Compass size={12} className="text-blue-400" />
                  Kinh tuyến trục tham chiếu (VN-2000)
                </label>
                <span className="font-mono text-[10px] font-bold text-blue-300 bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 rounded">
                  {selectedCm}° (k₀={scaleFactor})
                </span>
              </div>
              <select
                id="cm-preset-select"
                value={selectedPresetId}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
              >
                {VN2000_REFERENCE_PRESETS.map((item) => (
                  <option key={item.id} value={item.id} className="bg-[#161c2e] text-slate-200">
                    {item.label}
                  </option>
                ))}
                <option value="custom" className="bg-[#161c2e] text-amber-300">
                  Kinh tuyến trục tùy chỉnh (Custom L₀)
                </option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Kinh tuyến trục L₀ (°)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={selectedCm}
                  onChange={(e) => {
                    setSelectedCm(e.target.value)
                    setSelectedPresetId('custom')
                  }}
                  className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Múi chiếu (Scale k₀)
                </label>
                <select
                  value={scaleFactor}
                  onChange={(e) => {
                    setScaleFactor(e.target.value)
                    setSelectedPresetId('custom')
                  }}
                  className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-2 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="0.9999">Múi 3° (0.9999)</option>
                  <option value="0.9996">Múi 6° (0.9996)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Manual VN-2000 coordinates */}
          <div className="pt-2 border-t border-[#232d47] space-y-2">
            <button
              type="button"
              onClick={() => setCoordsOpen((v) => !v)}
              className="w-full flex items-center justify-between text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Navigation size={12} className="text-amber-400" />
                Nhập tọa độ VN-2000 (không cần file CAD)
              </span>
              <span className="text-[10px] text-slate-500">{coordsOpen ? 'Thu gọn' : 'Mở'}</span>
            </button>
            {coordsOpen && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Quy ước thứ tự trục tọa độ đầu vào
                  </label>
                  <select
                    value={axisOrder}
                    onChange={(e) => {
                      setAxisOrder(e.target.value)
                      setAxisAmbiguityAlert(null)
                    }}
                    className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="AUTO">Tự động nhận diện (Kiểm tra độ tin cậy)</option>
                    <option value="VN2000_XY">Trắc địa VN-2000: (X = Bắc, Y = Đông)</option>
                    <option value="CAD_EN">Bản vẽ CAD: (X = Đông, Y = Bắc)</option>
                  </select>
                </div>

                {axisAmbiguityAlert && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/40 text-[11px] text-amber-200 space-y-2">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                      <span className="leading-snug">{axisAmbiguityAlert}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSubmitCoords('VN2000_XY')}
                        className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-[10px] font-bold text-amber-200 cursor-pointer"
                      >
                        Dùng (X=Bắc, Y=Đông)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubmitCoords('CAD_EN')}
                        className="px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 text-[10px] font-bold text-blue-200 cursor-pointer"
                      >
                        Dùng (X=Đông, Y=Bắc)
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  value={coordsText}
                  onChange={(e) => setCoordsText(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  placeholder={'Mỗi dòng 1 điểm (X/Bắc, Y/Đông):\n1199145.22, 614235.15\n1199195.22, 614321.75\n1199245.22, 614408.35'}
                  className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-3 py-2 text-[11px] font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors resize-y"
                />
                <p className="text-[10px] text-slate-500 leading-snug">
                  Hỗ trợ toàn bộ dải tọa độ Việt Nam (bao gồm miền Nam Y &lt; 1.000.000m). Nếu tọa độ nằm trong dải giao thoa [800.000 - 950.000m], hệ thống sẽ yêu cầu xác nhận trục.
                </p>
                <button
                  type="button"
                  onClick={() => handleSubmitCoords()}
                  disabled={loading || !coordsText.trim()}
                  className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all ${
                    loading || !coordsText.trim()
                      ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                      : 'bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 cursor-pointer'
                  }`}
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Route size={12} />}
                  Dựng tuyến từ tọa độ
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Card 2: Road Engineering Specs (TCVN) ── */}
        <div className="bg-[#161c2e] border border-[#232d47] rounded-xl p-3.5 space-y-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <Sliders size={13} className="text-blue-400" />
            <span>Thông Số Tuyến (TCVN)</span>
          </div>

          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
                  <FlipHorizontal2 size={12} className="text-blue-400/80" />
                  Bề rộng mặt (B)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={roadWidth}
                    onChange={(e) => updateParam('roadWidth', e.target.value)}
                    className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-blue-500 pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 font-bold">m</span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
                  <Layers size={12} className="text-blue-400/80" />
                  Số dải tấm ngang
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={laneCount}
                    onChange={(e) => updateParam('laneCount', e.target.value)}
                    className="w-full bg-[#0e121f] border border-[#2a3654] rounded-lg px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-blue-500 pr-9"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 font-bold">làn</span>
                </div>
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
                  Chiều dài tấm BTXM
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
              {completedSegments.length}/{droneSegments.length} đoạn ({droneSegments.length > 0 ? Math.round((completedSegments.length / droneSegments.length) * 100) : 0}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#0e121f] h-2 rounded-full overflow-hidden border border-[#232d47]">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${droneSegments.length > 0 ? Math.round((completedSegments.length / droneSegments.length) * 100) : 0}%` }}
            />
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-400">Chọn trạng thái khảo sát:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={droneSegments.length === 0}
                onClick={handleSelectAllSegments}
                className="px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-40 disabled:pointer-events-none text-blue-300 border border-blue-500/30 font-medium transition-colors"
              >
                Tất cả
              </button>
              <button
                type="button"
                disabled={droneSegments.length === 0}
                onClick={handleDeselectAllSegments}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-400 hover:text-slate-200 border border-slate-700 font-medium transition-colors"
              >
                Bỏ chọn
              </button>
            </div>
          </div>

          {/* Segment List */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {droneSegments.length > 0 ? (
              droneSegments.map((seg) => {
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
              })
            ) : (
              <div className="py-6 px-3 text-center border border-dashed border-[#232d47] rounded-lg bg-[#0e121f]/50">
                <Navigation size={18} className="mx-auto text-slate-600 mb-1.5" />
                <p className="text-[11px] text-slate-400 font-medium">Chưa có phân đoạn</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Tải lên bản vẽ CAD để tự động tạo danh sách phân đoạn tuyến</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Card 5: Bảng Thống Kê & Bật/Tắt Layer Trong Bản Vẽ CAD ── */}
        <div className="bg-[#161c2e] border border-[#232d47] rounded-xl p-3.5 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span className="flex items-center gap-1.5 text-blue-400">
              <Layers size={13} className="text-blue-400" />
              Các Layer Bản Vẽ CAD
            </span>
            <div className="flex items-center gap-1.5">
              {activeVisibleCount > 0 && (
                <button
                  type="button"
                  onClick={handleHideAllCustomLayers}
                  className="text-[9px] text-amber-400 hover:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 px-1.5 py-0.5 rounded border border-amber-500/30 transition-colors font-medium"
                  title="Ẩn tất cả các layer CAD bổ sung đang hiển thị trên bản đồ"
                >
                  Ẩn ({activeVisibleCount})
                </button>
              )}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 font-bold">
                {filteredLayers.length} layers
              </span>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2 py-0.5 rounded-full shrink-0 font-medium transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-[#0e121f] text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-[#232d47]'
                }`}
              >
                {cat.label}
              </button>
            ))}
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
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {filteredLayers.length > 0 ? (
              filteredLayers.map((l, lIdx) => {
                const isVisible = !!visibleLayers[l.name]
                const isLoadingLayer = !!loadingLayers[l.name]
                const isCurrentCenterline = activeCenterlineLayer === l.name
                return (
                  <div
                    key={`${l.name}-${lIdx}`}
                    className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                      isVisible
                        ? 'bg-cyan-950/20 border-cyan-500/40 text-cyan-200'
                        : 'bg-[#0e121f] border-[#232d47] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isVisible ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'
                      }`} />
                      <span className="font-mono font-medium text-xs text-white truncate max-w-[125px]" title={l.name}>
                        {l.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {l.category && (
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${getCategoryColor(l.category)}`}>
                          {l.category}
                        </span>
                      )}
                      <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                        {l.count}
                      </span>

                      {/* Toggle Visibility Eye Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleLayer(l.name, l.category)}
                        className={`p-1 rounded transition-colors ${
                          isVisible
                            ? 'text-cyan-400 bg-cyan-500/20 border border-cyan-500/40 shadow-sm'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                        }`}
                        title={isVisible ? 'Ẩn layer này trên bản đồ' : 'Hiển thị đối tượng của layer này lên bản đồ vệ tinh'}
                      >
                        {isLoadingLayer ? (
                          <Loader2 size={13} className="animate-spin text-cyan-400" />
                        ) : isVisible ? (
                          <Eye size={13} />
                        ) : (
                          <EyeOff size={13} />
                        )}
                      </button>

                      {/* Set as Centerline button (for Road layers) */}
                      {['RoadNetwork', 'RoadEdge', 'LeftEdge'].includes(l.category) && (
                        <button
                          type="button"
                          onClick={() => handleSetCenterlineLayer(l.name)}
                          className={`p-1 rounded transition-colors ${
                            isCurrentCenterline
                              ? 'text-amber-400 bg-amber-500/20 border border-amber-500/40'
                              : 'text-slate-500 hover:text-amber-300 hover:bg-slate-800'
                          }`}
                          title={`Chọn ${l.name} làm tim tuyến chính để dựng lại mặt đường`}
                        >
                          <Target size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-4 text-slate-500 text-[11px]">
                {activeLayerStats.length === 0 ? 'Nạp file CAD để xem thống kê layer' : 'Không tìm thấy layer phù hợp'}
              </div>
            )}
          </div>
        </div>

        {/* ── Card 6: Engineering Analysis KPIs (When Ready) ── */}
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
                <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                  B = {displayWidth.toFixed(1)} m
                </p>
              </div>

              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Diện tích (L×B)</p>
                <p className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                  {displayArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²
                </p>
                <p className="text-[9px] text-slate-500 font-mono mt-0.5" title="Diện tích đa giác mặt phẳng thực tế">
                  Đa giác: {displaySurfaceArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²
                </p>
              </div>

              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Số tấm BTXM</p>
                <p className="font-mono font-bold text-cyan-300 text-sm mt-0.5">
                  {displaySlabs} tấm
                </p>
                <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                  {displayLongitudinalSlabs} dải × {normalizeRoadParams(roadParams).laneCount} làn
                </p>
              </div>

              <div className="bg-[#0e121f] p-2.5 rounded-lg border border-[#232d47]">
                <p className="text-[10px] text-slate-400 font-medium">Phân đoạn</p>
                <p className="font-mono font-bold text-amber-300 text-sm mt-0.5">
                  {displaySegments} đoạn
                </p>
                <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                  L = {normalizeRoadParams(roadParams).segmentLength} m/đoạn
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
