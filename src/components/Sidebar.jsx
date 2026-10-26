import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'
import toast from 'react-hot-toast'
import {
  FileCode2,
  Sliders,
  Loader2,
  X,
  Compass,
  Upload,
  CheckCircle2,
  Sparkles,
  ChevronLeft,
  PanelLeftClose,
  Settings2,
  Navigation,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
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
  completedSegments = [],
  roadParams,
  setRoadParams,
  cadFile,
  collapsed,
  setCollapsed,
  onCustomFeaturesChange,
  onInspectorBridgeChange,
}) {
  const [inputMode, setInputMode] = useState('cad') // 'cad' | 'coords'
  const [lastAnalyzedSource, setLastAnalyzedSource] = useState('cad') // 'cad' | 'coords'
  const [file, setFile] = useState(cadFile || null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [cadLayerStats, setCadLayerStats] = useState([])
  const [visibleLayers, setVisibleLayers] = useState({})
  const [layerGeometries, setLayerGeometries] = useState({})
  const [loadingLayers, setLoadingLayers] = useState({})
  const [activeCenterlineLayer, setActiveCenterlineLayer] = useState(null)
  const [coordsText, setCoordsText] = useState('')
  const [axisAmbiguityAlert, setAxisAmbiguityAlert] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (cadFile && cadFile !== file) {
      setFile(cadFile)
    }
  }, [cadFile, file])

  const segmentLength = roadParams?.segmentLength ?? '100'
  const roadWidth = roadParams?.roadWidth ?? '7.0'
  const slabLength = roadParams?.slabLength ?? '4.0'
  const laneCount = roadParams?.laneCount ?? '2'

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
    setCadLayerStats([])
    if (onCustomFeaturesChange) onCustomFeaturesChange([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (onCadFileChange) onCadFileChange(null)
  }

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])
  const handleDragLeave = useCallback(() => setDragging(false), [])
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragging(false)
      const dropped = e.dataTransfer.files[0]
      const name = dropped?.name.toLowerCase()
      if (name && (name.endsWith('.dxf') || name.endsWith('.dwg'))) {
        setFile(dropped)
        setInputMode('cad')
        if (onCadFileChange) onCadFileChange(dropped)
      } else {
        toast.error('Chỉ hỗ trợ file CAD (.dxf, .dwg).')
      }
    },
    [onCadFileChange]
  )

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected) {
      setFile(selected)
      setInputMode('cad')
      if (onCadFileChange) onCadFileChange(selected)
    }
  }

  const handleSubmit = useCallback(
    async (overrideLayerName = null) => {
      if (!file) {
        toast.error('Vui lòng chọn file CAD (.dxf/.dwg) trước.')
        return
      }
      const targetLayer =
        typeof overrideLayerName === 'string'
          ? overrideLayerName
          : activeCenterlineLayer
      const normParams = normalizeRoadParams({
        segmentLength,
        roadWidth,
        slabLength,
        laneCount,
      })
      const exactRoadWidth = normParams.roadWidth
      const cmVal = parseFloat(selectedCm) || 105.75
      const k0Val = parseFloat(scaleFactor) || 0.9999

      setLoading(true)
      const tid = toast.loading(
        targetLayer
          ? `Đang dựng lại tuyến theo layer tim [${targetLayer}]…`
          : 'Đang bóc tách tim tuyến chính & chuyển đổi tọa độ VN-2000…'
      )
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
            setLastAnalyzedSource('cad')
            loadedSomething = true
          }
        }

        if (parseResult.status === 'fulfilled' && parseResult.value?.data) {
          const pData = parseResult.value.data
          const analytics = pData?.analytics ?? null
          const featureCollection = pData?.featureCollection ?? pData

          if (analytics && onAnalyticsLoaded) {
            if (
              roadResult.status === 'fulfilled' &&
              roadResult.value?.data?.totalLengthMeters
            ) {
              const rData = roadResult.value.data
              analytics.totalLengthMeters = rData.totalLengthMeters
              analytics.nominalAreaSqm = Number(
                (rData.totalLengthMeters * exactRoadWidth).toFixed(2)
              )
              analytics.surfaceAreaSqm =
                rData.surfaceAreaSqm ?? analytics.nominalAreaSqm
              analytics.totalAreaSqm = analytics.nominalAreaSqm
              analytics.roadSegments = Math.ceil(
                rData.totalLengthMeters / normParams.segmentLength
              )
              analytics.longitudinalSlabs = Math.floor(
                rData.totalLengthMeters / normParams.slabLength
              )
              analytics.estimatedConcreteSlabs =
                analytics.longitudinalSlabs * normParams.laneCount
            }
            onAnalyticsLoaded(analytics)
          }

          if (!loadedSomething && featureCollection && onDataLoaded) {
            onDataLoaded(featureCollection)
            setLastAnalyzedSource('cad')
            loadedSomething = true
          }
        }

        if (loadedSomething) {
          toast.success('Bóc tách và dựng tuyến đường thành công!', { id: tid })
        } else {
          const err =
            roadResult.status === 'rejected'
              ? roadResult.reason
              : parseResult.reason
          const msg =
            err?.response?.data?.detail ||
            err?.response?.data?.message ||
            err?.message ||
            'Không thể xử lý bản vẽ CAD'
          toast.error(`Lỗi: ${msg}`, { id: tid })
        }
      } catch (err) {
        const msg =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          'Lỗi kết nối máy chủ'
        toast.error(`Lỗi: ${msg}`, { id: tid })
      } finally {
        setLoading(false)
      }
    },
    [
      file,
      activeCenterlineLayer,
      segmentLength,
      roadWidth,
      slabLength,
      laneCount,
      selectedCm,
      scaleFactor,
      onDataLoaded,
      onAnalyticsLoaded,
    ]
  )

  const handleSubmitCoords = useCallback(
    async (overrideAxisOrder = null) => {
      if (!coordsText.trim()) {
        toast.error('Vui lòng nhập danh sách tọa độ VN-2000.')
        return
      }
      const effectiveAxisOrder =
        typeof overrideAxisOrder === 'string' ? overrideAxisOrder : axisOrder
      if (typeof overrideAxisOrder === 'string') {
        setAxisOrder(overrideAxisOrder)
      }
      setAxisAmbiguityAlert(null)

      const normParams = normalizeRoadParams({
        segmentLength,
        roadWidth,
        slabLength,
        laneCount,
      })
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

        setCadLayerStats([])
        setLastAnalyzedSource('coords')

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
            estimatedConcreteSlabs:
              Math.floor(len / normParams.slabLength) * normParams.laneCount,
          })
        }
        toast.success(
          `Đã dựng tuyến ${roadData.totalLengthMeters} m từ ${roadData.centerline?.length ?? 0} điểm tọa độ`,
          { id: tid }
        )
      } catch (err) {
        const errData = err?.response?.data
        if (
          errData?.error === 'AmbiguousAxisOrder' ||
          errData?.requiresAxisConfirmation
        ) {
          setAxisAmbiguityAlert(
            errData.detail ||
              'Tọa độ nằm trong vùng giao thoa X/Y. Vui lòng chọn rõ thứ tự trục.'
          )
          toast.error('Cần xác nhận quy ước trục tọa độ X/Y!', { id: tid })
        } else {
          const msg = errData?.detail || err?.message || 'Lỗi kết nối máy chủ'
          toast.error(`Lỗi: ${msg}`, { id: tid })
        }
      } finally {
        setLoading(false)
      }
    },
    [
      coordsText,
      axisOrder,
      segmentLength,
      roadWidth,
      slabLength,
      laneCount,
      selectedCm,
      scaleFactor,
      onDataLoaded,
      onAnalyticsLoaded,
    ]
  )

  const handleToggleLayer = useCallback(
    async (layerName, category) => {
      if (!file) {
        toast.error('Vui lòng chọn file CAD trước.')
        return
      }
      const isCurrentlyVisible = !!visibleLayers[layerName]
      const nextVisible = {
        ...visibleLayers,
        [layerName]: !isCurrentlyVisible,
      }
      setVisibleLayers(nextVisible)

      let updatedGeometries = { ...layerGeometries }

      if (!isCurrentlyVisible && !updatedGeometries[layerName]) {
        setLoadingLayers((prev) => ({ ...prev, [layerName]: true }))
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
            },
          }))
          updatedGeometries[layerName] = tagged
          setLayerGeometries(updatedGeometries)
          toast.success(
            `Đã nạp ${tagged.length} đối tượng cho layer ${layerName}`
          )
        } catch (err) {
          console.error('Error fetching layer geometry:', err)
          toast.error(`Không thể tải hình học cho layer ${layerName}`)
          setVisibleLayers((prev) => ({ ...prev, [layerName]: false }))
          return
        } finally {
          setLoadingLayers((prev) => ({ ...prev, [layerName]: false }))
        }
      }

      const allActive = []
      Object.keys(nextVisible).forEach((lyr) => {
        if (nextVisible[lyr] && updatedGeometries[lyr]) {
          allActive.push(...updatedGeometries[lyr])
        }
      })
      if (onCustomFeaturesChange) {
        onCustomFeaturesChange(allActive)
      }
    },
    [
      file,
      visibleLayers,
      layerGeometries,
      selectedCm,
      scaleFactor,
      onCustomFeaturesChange,
    ]
  )

  const handleToggleAllCadLayers = useCallback(
    (visible) => {
      if (!visible) {
        setVisibleLayers({})
        if (onCustomFeaturesChange) {
          onCustomFeaturesChange([])
        }
        toast('Đã ẩn toàn bộ các layer CAD bổ sung.')
      } else {
        toast('Hãy bấm biểu tượng con mắt trên từng layer cần nạp lên bản đồ GIS.')
      }
    },
    [onCustomFeaturesChange]
  )

  const handleSetCenterlineLayer = useCallback(
    (layerName) => {
      const next = layerName || null
      setActiveCenterlineLayer(next)
      if (file) {
        handleSubmit(next)
      }
    },
    [file, handleSubmit]
  )

  const handleRecomputeCurrentSource = useCallback(() => {
    if (lastAnalyzedSource === 'coords' && coordsText.trim()) {
      handleSubmitCoords()
    } else if (file) {
      handleSubmit()
    } else if (coordsText.trim()) {
      handleSubmitCoords()
    } else {
      toast.error('Chưa có nguồn dữ liệu để phân tích lại.')
    }
  }, [lastAnalyzedSource, coordsText, file, handleSubmit, handleSubmitCoords])

  // ── Single Source of Truth Engineering Computation ──
  const { metrics: ssotMetrics } = useMemo(() => {
    if (!geoJsonData) {
      return { enrichedGeoJson: null, droneSegments: [], metrics: null }
    }
    return enrichGeoJsonWithEngineeringFeatures(
      geoJsonData,
      roadParams,
      [],
      completedSegments
    )
  }, [geoJsonData, roadParams, completedSegments])

  const normalizedParams = useMemo(
    () => normalizeRoadParams(roadParams),
    [roadParams]
  )
  const isSurfaceAreaProvisional = Boolean(ssotMetrics?.isSurfaceAreaProvisional)
  const analyzedRoadWidth = Number(
    ssotMetrics?.analyzedRoadWidth || normalizedParams.roadWidth
  )

  // Sync bridge state up to App.jsx so RightInspectorPanel has full access
  useEffect(() => {
    if (onInspectorBridgeChange) {
      onInspectorBridgeChange({
        cadLayerStats,
        cadLayerVisibility: visibleLayers,
        loadingLayers,
        selectedCadLayer: activeCenterlineLayer || '',
        centralMeridian: selectedCm,
        scaleFactor,
        axisOrder,
        isLoading: loading,
        onToggleCadLayer: handleToggleLayer,
        onToggleAllCadLayers: handleToggleAllCadLayers,
        onSelectCadLayerForParse: handleSetCenterlineLayer,
        onRecomputeWidth: handleRecomputeCurrentSource,
      })
    }
  }, [
    onInspectorBridgeChange,
    cadLayerStats,
    visibleLayers,
    loadingLayers,
    activeCenterlineLayer,
    selectedCm,
    scaleFactor,
    axisOrder,
    loading,
    handleToggleLayer,
    handleToggleAllCadLayers,
    handleSetCenterlineLayer,
    handleRecomputeCurrentSource,
  ])

  const parsedCoordCount = useMemo(() => {
    if (!coordsText.trim()) return 0
    return coordsText
      .trim()
      .split(/\r?\n/)
      .filter((line) => {
        const clean = line.trim()
        return clean && !clean.startsWith('#') && !clean.startsWith('//')
      }).length
  }, [coordsText])

  if (collapsed) return null

  return (
    <aside className="w-[340px] max-w-full h-full bg-[#111D2E] border-r border-[#27384E] flex flex-col select-none text-[#E8EEF6] shrink-0 z-20">
      {/* ── Panel Header ── */}
      <div className="h-[42px] px-4 border-b border-[#27384E] bg-[#0B1220]/50 flex items-center justify-between shrink-0">
        <h2 className="text-[12.5px] font-bold tracking-wider uppercase text-[#E8EEF6]">
          Cấu Hình Dữ Liệu &amp; Tuyến
        </h2>
        {setCollapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Thu gọn bảng Cấu hình dữ liệu & tuyến (Bên trái)"
            aria-label="Thu gọn bảng Cấu hình dữ liệu & tuyến (Bên trái)"
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#27384E] bg-[#111D2E] text-[#A9B9CE] hover:text-[#E8EEF6] hover:bg-[#17263C] text-[11.5px] font-medium transition-colors cursor-pointer"
          >
            <PanelLeftClose className="w-3.5 h-3.5 text-[#F06421]" />
            <span>Thu gọn</span>
          </button>
        )}
      </div>

      {/* ── Scrollable Configuration Body ── */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#27384E]">
        {/* ── SECTION 1: DATA INPUT SOURCE ── */}
        <section className="px-4 py-4 space-y-3">
          <div className="text-[12px] font-bold text-[#A9B9CE] uppercase tracking-wider">
            1. Nguồn dữ liệu đầu vào
          </div>

          {/* Input Mode Segmented Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[#0B1220] border border-[#27384E]">
            <button
              type="button"
              onClick={() => setInputMode('cad')}
              className={`py-1.5 px-2 rounded text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                inputMode === 'cad'
                  ? 'bg-[#17263C] text-[#E8EEF6]'
                  : 'text-[#A9B9CE] hover:text-[#E8EEF6]'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5 text-[#F06421] shrink-0" />
              <span>Bản vẽ CAD (.DXF)</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode('coords')}
              className={`py-1.5 px-2 rounded text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                inputMode === 'coords'
                  ? 'bg-[#17263C] text-[#E8EEF6]'
                  : 'text-[#A9B9CE] hover:text-[#E8EEF6]'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 text-[#22B7C9] shrink-0" />
              <span>Tọa độ VN-2000</span>
            </button>
          </div>

          {/* Mode A: CAD File Dropzone */}
          {inputMode === 'cad' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".dxf,.dwg"
                onChange={handleFileChange}
                className="hidden"
              />
              {!file ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-4 rounded-md border border-dashed text-center cursor-pointer transition-colors ${
                    dragging
                      ? 'border-[#F06421] bg-[#F06421]/10'
                      : 'border-[#27384E] hover:border-[#22B7C9] bg-[#0B1220]/70 hover:bg-[#0B1220]'
                  }`}
                >
                  <Upload className="w-5 h-5 text-[#F06421] mx-auto mb-1.5" />
                  <div className="text-[13px] font-semibold text-[#E8EEF6]">
                    Chọn hoặc kéo thả tệp <span className="text-[#F06421]">.DXF</span>
                  </div>
                  <div className="mt-1 text-[12px] text-[#8FA3BA]">
                    Hỗ trợ LWPOLYLINE, POLYLINE, LINE, ARC, SPLINE
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2.5 rounded-md bg-[#0B1220] border border-[#27384E] flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileCode2 className="w-4 h-4 text-[#39B58A] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold font-mono text-[#E8EEF6] truncate">
                        {file.name}
                      </div>
                      <div className="text-[12px] text-[#8FA3BA] font-mono tabular-nums">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB • AutoCAD DXF
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    title="Gỡ bản vẽ"
                    className="p-1.5 rounded text-[#8FA3BA] hover:text-[#EF4444] hover:bg-[#17263C] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {activeCenterlineLayer && (
                <div className="mt-2 px-3 py-2 rounded-md bg-[#17263C] border border-[#27384E] flex items-center justify-between text-[12.5px]">
                  <span className="text-[#E8EEF6]">
                    Layer tim:{' '}
                    <strong className="font-mono text-[#F06421]">
                      {activeCenterlineLayer}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSetCenterlineLayer(null)}
                    className="text-[12px] text-[#A9B9CE] hover:text-[#E8EEF6] underline cursor-pointer"
                  >
                    Tự động
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Mode B: Manual VN-2000 Coordinates Input */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[12.5px] text-[#A9B9CE]">
                <span>Danh sách tọa độ (mỗi điểm 1 dòng):</span>
                <span className="font-mono text-[#22B7C9] tabular-nums font-semibold">
                  {parsedCoordCount} điểm
                </span>
              </div>
              <textarea
                rows={4}
                value={coordsText}
                onChange={(e) => setCoordsText(e.target.value)}
                placeholder={
                  'Ví dụ (X Bắc, Y Đông):\n1203568.50, 597842.10\n1203615.20, 597890.40\n1203680.00, 597955.80'
                }
                className="w-full p-2.5 rounded-md bg-[#0B1220] border border-[#27384E] focus:border-[#22B7C9] focus:outline-none text-[13px] font-mono tabular-nums text-[#E8EEF6] placeholder-[#7E92AA]/70 resize-y leading-relaxed select-text"
              />
              <div className="flex items-center justify-between gap-2 text-[12px] text-[#8FA3BA]">
                <span>Phân tách bằng dấu phẩy, tab hoặc khoảng trắng.</span>
                <button
                  type="button"
                  onClick={() =>
                    setCoordsText(
                      '1203568.50, 597842.10\n1203615.20, 597890.40\n1203680.00, 597955.80\n1203745.60, 598012.30'
                    )
                  }
                  className="text-[#22B7C9] hover:underline font-medium shrink-0 cursor-pointer"
                >
                  Điền mẫu thử
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── SECTION 2: VN-2000 GEODETIC CRS CONFIGURATION ── */}
        <section className="px-4 py-4 space-y-3">
          <div className="text-[12px] font-bold text-[#A9B9CE] uppercase tracking-wider">
            2. Hệ quy chiếu VN-2000
          </div>

          <div className="space-y-1.5">
            <label className="block text-[12.5px] font-medium text-[#C0CEDF]">
              Tra cứu nhanh theo khu vực (Tham khảo):
            </label>
            <select
              value={selectedPresetId}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#0B1220] border border-[#27384E] text-[12.5px] text-[#E8EEF6] focus:outline-none focus:border-[#22B7C9] cursor-pointer"
            >
              {VN2000_REFERENCE_PRESETS.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#111D2E] text-[#E8EEF6]">
                  {p.label}
                </option>
              ))}
              <option value="custom" className="bg-[#111D2E] text-[#F06421]">
                -- Tùy chỉnh kinh tuyến trục L₀ &amp; múi chiếu --
              </option>
            </select>
            <p className="text-[12px] text-[#8FA3BA] leading-snug">
              Hỗ trợ hồ sơ kỹ thuật lịch sử hoặc nhập trực tiếp L₀, k₀ bên dưới.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12.5px] font-medium text-[#C0CEDF] mb-1">
                Kinh tuyến trục L₀ (°)
              </label>
              <input
                type="number"
                step="0.05"
                min="100"
                max="112"
                value={selectedCm}
                onChange={(e) => {
                  setSelectedCm(e.target.value)
                  setSelectedPresetId('custom')
                }}
                className="w-full px-3 py-2 rounded-md bg-[#0B1220] border border-[#27384E] text-[13px] font-mono font-bold tabular-nums text-[#E8EEF6] focus:outline-none focus:border-[#22B7C9]"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[#C0CEDF] mb-1">
                Múi chiếu (Scale k₀)
              </label>
              <select
                value={scaleFactor}
                onChange={(e) => {
                  setScaleFactor(e.target.value)
                  setSelectedPresetId('custom')
                }}
                className="w-full px-2.5 py-2 rounded-md bg-[#0B1220] border border-[#27384E] text-[12.5px] font-medium text-[#E8EEF6] focus:outline-none focus:border-[#22B7C9] cursor-pointer"
              >
                <option value="0.9999">Múi 3° (0.9999)</option>
                <option value="0.9996">Múi 6° (0.9996)</option>
              </select>
            </div>
          </div>

          {/* Axis Order Selector */}
          <div>
            <label className="block text-[12.5px] font-medium text-[#C0CEDF] mb-1">
              Quy ước thứ tự trục tọa độ:
            </label>
            <select
              value={axisOrder}
              onChange={(e) => {
                setAxisOrder(e.target.value)
                setAxisAmbiguityAlert(null)
              }}
              className="w-full px-3 py-2 rounded-md bg-[#0B1220] border border-[#27384E] text-[12.5px] text-[#E8EEF6] focus:outline-none focus:border-[#22B7C9] cursor-pointer"
            >
              <option value="AUTO">
                Tự động (AUTO – Kiểm tra độ tin cậy)
              </option>
              <option value="VN2000_XY">
                Chuẩn Trắc địa VN: X = Bắc, Y = Đông
              </option>
              <option value="CAD_EN">
                Chuẩn Bản vẽ CAD: E = Đông, N = Bắc
              </option>
            </select>
          </div>

          {/* Axis Ambiguity Confirmation Box */}
          {axisAmbiguityAlert && (
            <div className="p-3 rounded-md bg-[#F59E0B]/15 border border-[#F59E0B]/60 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <div className="text-[12.5px] text-[#E8EEF6] leading-snug">
                  <strong className="text-[#F59E0B] block mb-0.5">
                    Cần xác nhận quy ước trục X/Y:
                  </strong>
                  {axisAmbiguityAlert}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSubmitCoords('VN2000_XY')}
                  className="py-1.5 px-2 rounded bg-[#22B7C9] text-[#0B1220] font-bold text-[12px] cursor-pointer"
                >
                  Dùng X=Bắc, Y=Đông
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitCoords('CAD_EN')}
                  className="py-1.5 px-2 rounded bg-[#17263C] text-[#E8EEF6] border border-[#27384E] font-semibold text-[12px] cursor-pointer"
                >
                  Dùng E=Đông, N=Bắc
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── SECTION 3: ROAD GEOMETRY & CONCRETE PAVEMENT PARAMETERS ── */}
        <section className="px-4 py-4 space-y-3">
          <div className="text-[12px] font-bold text-[#A9B9CE] uppercase tracking-wider">
            3. Thông số hình học &amp; Tấm BTXM
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Road Width B */}
            <div className="space-y-1">
              <label className="block text-[12.5px] font-medium text-[#C0CEDF]">
                Bề rộng mặt (B)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="1.0"
                  max="60.0"
                  value={roadWidth}
                  onChange={(e) => updateParam('roadWidth', e.target.value)}
                  className="w-full pl-3 pr-8 py-2 rounded-md bg-[#0B1220] border border-[#27384E] focus:border-[#F06421] focus:outline-none text-[13.5px] font-mono font-bold tabular-nums text-[#E8EEF6]"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-mono text-[#8FA3BA]">
                  m
                </span>
              </div>
            </div>

            {/* Horizontal Slab Lanes */}
            <div className="space-y-1">
              <label className="block text-[12.5px] font-medium text-[#C0CEDF]">
                Số dải tấm ngang
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="8"
                  value={laneCount}
                  onChange={(e) => updateParam('laneCount', e.target.value)}
                  className="w-full pl-3 pr-10 py-2 rounded-md bg-[#0B1220] border border-[#27384E] focus:border-[#F06421] focus:outline-none text-[13.5px] font-mono font-bold tabular-nums text-[#E8EEF6]"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-mono text-[#8FA3BA]">
                  dải
                </span>
              </div>
            </div>

            {/* Segment Length */}
            <div className="space-y-1">
              <label className="block text-[12.5px] font-medium text-[#C0CEDF]">
                Bước cọc / Đoạn
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="10"
                  min="10"
                  max="1000"
                  value={segmentLength}
                  onChange={(e) => updateParam('segmentLength', e.target.value)}
                  className="w-full pl-3 pr-8 py-2 rounded-md bg-[#0B1220] border border-[#27384E] focus:border-[#22B7C9] focus:outline-none text-[13.5px] font-mono font-bold tabular-nums text-[#E8EEF6]"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-mono text-[#8FA3BA]">
                  m
                </span>
              </div>
            </div>

            {/* Slab Length */}
            <div className="space-y-1">
              <label className="block text-[12.5px] font-medium text-[#C0CEDF]">
                Chiều dài tấm BTXM
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="1.0"
                  max="20.0"
                  value={slabLength}
                  onChange={(e) => updateParam('slabLength', e.target.value)}
                  className="w-full pl-3 pr-8 py-2 rounded-md bg-[#0B1220] border border-[#27384E] focus:border-[#22B7C9] focus:outline-none text-[13.5px] font-mono font-bold tabular-nums text-[#E8EEF6]"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-mono text-[#8FA3BA]">
                  m
                </span>
              </div>
            </div>
          </div>

          {/* Computed Slab Dimension Preview Strip */}
          <div className="px-3 py-2 rounded-md bg-[#0B1220] border border-[#27384E] flex items-center justify-between text-[12.5px]">
            <span className="text-[#A9B9CE]">Kích thước 1 tấm BTXM:</span>
            <span className="font-mono font-semibold text-[#22B7C9] tabular-nums">
              {normalizedParams.slabLength.toFixed(1)}m ×{' '}
              {normalizedParams.slabWidth.toFixed(2)}m (
              {(
                normalizedParams.slabLength * normalizedParams.slabWidth
              ).toFixed(2)}{' '}
              m²)
            </span>
          </div>

          {/* Provisional Polygon Width Alert */}
          {isSurfaceAreaProvisional && (
            <div className="p-3 rounded-md bg-[#F59E0B]/15 border border-[#F59E0B]/60 space-y-1.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <div className="text-[12.5px] text-[#E8EEF6] leading-relaxed">
                  <strong className="text-[#F59E0B] block">
                    Đã đổi bề rộng B ({analyzedRoadWidth}m → {normalizedParams.roadWidth}m)
                  </strong>
                  Cọc lý trình và lưới tấm BTXM đã tự động cập nhật. Hãy bấm nút bên dưới để dựng lại đa giác mặt đường chính xác trước khi xuất hồ sơ.
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Sticky Primary Action Footer ── */}
      <div className="p-3.5 border-t border-[#27384E] bg-[#0B1220]">
        {inputMode === 'coords' ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSubmitCoords()}
            className="w-full py-2.5 px-4 rounded-md bg-[#F06421] hover:bg-[#FF7635] disabled:opacity-60 text-white font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý tọa độ VN-2000…</span>
              </>
            ) : isSurfaceAreaProvisional && lastAnalyzedSource === 'coords' ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>
                  Cập Nhật Mặt Đường (B = {normalizedParams.roadWidth}m)
                </span>
              </>
            ) : (
              <span>Xử Lý Tọa Độ &amp; Dựng Tuyến</span>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSubmit()}
            className="w-full py-2.5 px-4 rounded-md bg-[#F06421] hover:bg-[#FF7635] disabled:opacity-60 text-white font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang bóc tách CAD &amp; dựng tuyến…</span>
              </>
            ) : isSurfaceAreaProvisional ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>
                  Cập Nhật &amp; Dựng Lại Mặt Đường (B = {normalizedParams.roadWidth}m)
                </span>
              </>
            ) : (
              <span>Phân Tích &amp; Dựng Tuyến Kỹ Thuật</span>
            )}
          </button>
        )}
      </div>
    </aside>
  )
}
