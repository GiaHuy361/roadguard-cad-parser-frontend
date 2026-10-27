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
import CrsPresetSelect from './CrsPresetSelect'
import CandidateLayerSelect from './CandidateLayerSelect'
import {
  VN2000_REFERENCE_PRESETS,
  convertRoadResponseToGeoJson,
  enrichGeoJsonWithEngineeringFeatures,
  normalizeRoadParams,
} from '../utils/roadEngineeringBuilder'
import {
  parseWgs84CoordinateText,
  parseAndValidateWgs84GeoJson,
  buildStudioGeoJsonFromWgs84Import,
} from '../utils/crsTransformEngine'

const SAMPLE_WGS84_GEOJSON = JSON.stringify(
  {
    type: 'FeatureCollection',
    isSyntheticSample: true,
    warning: 'DỮ LIỆU MINH HỌA – KHÔNG PHẢI TIM TUYẾN THỰC ĐỊA',
    features: [
      {
        type: 'Feature',
        properties: {
          roadCode: 'GEO-GJ-20261025-01',
          roadName: 'Đường mẫu kiểm thử GeoJSON (Minh họa)',
          isSyntheticSample: true,
          warning: 'DỮ LIỆU MINH HỌA – KHÔNG PHẢI TIM TUYẾN THỰC ĐỊA',
          note: 'DỮ LIỆU MINH HỌA – KHÔNG PHẢI TIM TUYẾN THỰC ĐỊA (Tuyến 3 điểm chữ L 204.03m phục vụ kiểm thử tính toán CRS, GeoJSON, dựng hình học và xuất JSON)',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [106.660172, 10.762622],
            [106.6612, 10.762622],
            [106.6612, 10.76345],
          ],
        },
      },
    ],
  },
  null,
  2
)

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
  onSwitchTab,
  onCrsStaleChange,
  onAppliedCrsConfigChange,
  onCrsLifecycleChange,
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
  const activeRequestIdRef = useRef(0)
  const abortControllerRef = useRef(null)
  const [wgs84SubMode, setWgs84SubMode] = useState('geojson') // 'geojson' | 'coords'
  const [wgs84Text, setWgs84Text] = useState('')
  const [wgs84FileName, setWgs84FileName] = useState('')
  const [wgs84AxisOrder, setWgs84AxisOrder] = useState('LON_LAT')
  const [selectedWgs84CandidateId, setSelectedWgs84CandidateId] = useState('')
  const fileInputRef = useRef(null)
  const geoJsonFileInputRef = useRef(null)

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
  const [candidateLayers, setCandidateLayers] = useState([])
  const [appliedCrsConfig, setAppliedCrsConfig] = useState(null)

  const isCrsStale = useMemo(() => {
    if (!appliedCrsConfig) return false
    if (selectedPresetId === 'unconfigured') return true
    const curCm = parseFloat(selectedCm)
    const appCm = parseFloat(appliedCrsConfig.cm)
    const curK0 = parseFloat(scaleFactor)
    const appK0 = parseFloat(appliedCrsConfig.k0)
    const cmChanged = !Number.isFinite(curCm) || !Number.isFinite(appCm) || Math.abs(curCm - appCm) > 1e-4
    const k0Changed = !Number.isFinite(curK0) || !Number.isFinite(appK0) || Math.abs(curK0 - appK0) > 1e-4
    const axisChanged = Boolean(appliedCrsConfig.axisOrder && axisOrder !== appliedCrsConfig.axisOrder)
    return cmChanged || k0Changed || axisChanged
  }, [appliedCrsConfig, selectedPresetId, selectedCm, scaleFactor, axisOrder])

  const crsLifecycleState = useMemo(() => {
    if (loading) return 'ANALYZING'
    if (selectedPresetId === 'unconfigured' || !selectedCm || selectedCm.toString().trim() === '') {
      return 'UNCONFIGURED'
    }
    const cmNum = parseFloat(selectedCm)
    const k0Num = parseFloat(scaleFactor)
    if (!Number.isFinite(cmNum) || cmNum < 100 || cmNum > 112 || !Number.isFinite(k0Num) || k0Num <= 0) {
      return 'INVALID_CONFIG'
    }
    if (isCrsStale) return 'STALE'
    return 'VALID_APPLIED'
  }, [loading, selectedPresetId, selectedCm, scaleFactor, isCrsStale])

  useEffect(() => {
    if (onCrsLifecycleChange) {
      onCrsLifecycleChange(crsLifecycleState)
    }
  }, [crsLifecycleState, onCrsLifecycleChange])

  useEffect(() => {
    if (onCrsStaleChange) {
      onCrsStaleChange(isCrsStale)
    }
  }, [isCrsStale, onCrsStaleChange])

  const abortActiveRequest = useCallback(() => {
    activeRequestIdRef.current++
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  const handleSwitchInputMode = useCallback(
    (mode) => {
      if (mode === inputMode) return
      abortActiveRequest()
      setLoading(false)
      setInputMode(mode)
    },
    [inputMode, abortActiveRequest]
  )

  const handleCrsParamChange = useCallback(() => {
    if (loading) {
      abortActiveRequest()
      setLoading(false)
    }
  }, [loading, abortActiveRequest])

  const handlePresetChange = (presetId) => {
    handleCrsParamChange()
    setSelectedPresetId(presetId)
    if (presetId === 'unconfigured') {
      setSelectedCm('')
      return
    }
    const found = VN2000_REFERENCE_PRESETS.find((p) => p.id === presetId)
    if (found && found.id !== 'custom') {
      const parsedCm = parseFloat(found.cm)
      if (Number.isFinite(parsedCm)) {
        setSelectedCm(parsedCm.toFixed(2))
      }
      const parsedK0 = parseFloat(found.k0 ?? found.scaleFactor ?? 0.9999)
      if (Number.isFinite(parsedK0)) {
        setScaleFactor(parsedK0.toFixed(4))
      }
    }
  }

  const updateParam = (key, val) => {
    if (setRoadParams) {
      setRoadParams((prev) => ({ ...prev, [key]: val }))
    }
  }

  const handleRemoveFile = () => {
    abortActiveRequest()
    setLoading(false)
    setFile(null)
    setVisibleLayers({})
    setLayerGeometries({})
    setLoadingLayers({})
    setActiveCenterlineLayer(null)
    setCandidateLayers([])
    setAppliedCrsConfig(null)
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
        activeRequestIdRef.current++
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }
        setFile(dropped)
        setInputMode('cad')
        setCandidateLayers([])
        setAppliedCrsConfig(null)
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
      activeRequestIdRef.current++
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      setFile(selected)
      setInputMode('cad')
      setCandidateLayers([])
      setAppliedCrsConfig(null)
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
      if (selectedPresetId === 'unconfigured' || !selectedCm || isNaN(parseFloat(selectedCm))) {
        toast.error('Vui lòng chọn hệ quy chiếu VN-2000 hoặc kinh tuyến trục L₀ trước khi phân tích.')
        return
      }
      const cmVal = parseFloat(selectedCm)
      if (cmVal < 100 || cmVal > 112) {
        toast.error('Kinh tuyến trục L₀ không hợp lệ (phải từ 100° đến 112°).')
        return
      }
      const k0Num = parseFloat(scaleFactor)
      if (!Number.isFinite(k0Num) || k0Num <= 0.9 || k0Num > 1.1) {
        toast.error('Hệ số co giãn múi chiếu k₀ không hợp lệ (cần nằm trong khoảng 0.9000 đến 1.1000).')
        return
      }
      const k0Val = k0Num

      const currentReqId = ++activeRequestIdRef.current
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller

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
        roadFd.append('AxisOrder', axisOrder)
        if (targetLayer) {
          roadFd.append('CenterlineLayerName', targetLayer)
        }

        const parseFd = new FormData()
        parseFd.append('file', file)
        parseFd.append('targetSrid', '4326')
        parseFd.append('tessellationSegments', '72')
        parseFd.append('centralMeridian', cmVal.toString())
        parseFd.append('scaleFactor', k0Val.toString())
        parseFd.append('axisOrder', axisOrder)
        parseFd.append('SegmentLength', normParams.segmentLength.toString())
        parseFd.append('RoadWidth', exactRoadWidth.toString())
        parseFd.append('SlabLength', normParams.slabLength.toString())
        if (targetLayer) {
          parseFd.append('centerlineLayerName', targetLayer)
        }

        const [roadResult, parseResult] = await Promise.allSettled([
          axios.post(`${API_BASE}/api/cad/parse-road`, roadFd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            signal: controller.signal,
          }),
          axios.post(`${API_BASE}/api/cad/parse-dxf`, parseFd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            signal: controller.signal,
          }),
        ])

        if (currentReqId !== activeRequestIdRef.current) {
          // Stale response discarded: a newer analysis or file selection occurred
          return
        }

        let loadedSomething = false

        if (roadResult.status === 'fulfilled' && roadResult.value?.data?.success) {
          const roadData = roadResult.value.data
          if (Array.isArray(roadData.layerStats)) {
            setCadLayerStats(roadData.layerStats)
          }
          if (Array.isArray(roadData.candidateLayers) && roadData.candidateLayers.length > 0) {
            setCandidateLayers(roadData.candidateLayers)
          }
          if (roadData.centerlineLayerName && !targetLayer) {
            setActiveCenterlineLayer(roadData.centerlineLayerName)
          }
          if (roadData.isGeoreferenced === false) {
            toast(
              roadData.notice ||
                'Bản vẽ sử dụng hệ tọa độ cục bộ (Local CAD). Đã chuyển sang chế độ CAD 2D để xem hình học.',
              { icon: 'ℹ️', duration: 4000 }
            )
            if (onSwitchTab) onSwitchTab('cad')
          }
          const applied = { cm: cmVal, k0: k0Val, axisOrder, source: 'cad' }
          setAppliedCrsConfig(applied)
          if (onAppliedCrsConfigChange) onAppliedCrsConfigChange(applied)

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
        if (currentReqId !== activeRequestIdRef.current || axios.isCancel?.(err) || err?.name === 'CanceledError') {
          return
        }
        const msg =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          'Lỗi kết nối máy chủ'
        toast.error(`Lỗi: ${msg}`, { id: tid })
      } finally {
        if (currentReqId === activeRequestIdRef.current) {
          setLoading(false)
        }
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
      if (selectedPresetId === 'unconfigured' || !selectedCm || isNaN(parseFloat(selectedCm))) {
        toast.error('Vui lòng chọn hệ quy chiếu VN-2000 hoặc kinh tuyến trục L₀ trước khi phân tích.')
        return
      }
      const cmVal = parseFloat(selectedCm)
      if (cmVal < 100 || cmVal > 112) {
        toast.error('Kinh tuyến trục L₀ không hợp lệ (phải từ 100° đến 112°).')
        return
      }
      const k0Num = parseFloat(scaleFactor)
      if (!Number.isFinite(k0Num) || k0Num <= 0.9 || k0Num > 1.1) {
        toast.error('Hệ số co giãn múi chiếu k₀ không hợp lệ (cần nằm trong khoảng 0.9000 đến 1.1000).')
        return
      }
      const k0Val = k0Num

      const currentReqId = ++activeRequestIdRef.current
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller

      setLoading(true)
      const tid = toast.loading('Đang dựng tuyến từ tọa độ VN-2000…')
      try {
        const res = await axios.post(`${API_BASE}/api/cad/parse-coords`, {
          coordinates: coordsText,
          roadWidth: exactRoadWidth,
          centralMeridian: cmVal,
          scaleFactor: k0Val,
          axisOrder: effectiveAxisOrder,
        }, {
          signal: controller.signal,
        })

        if (currentReqId !== activeRequestIdRef.current) {
          return
        }
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
        if (currentReqId !== activeRequestIdRef.current || axios.isCancel?.(err) || err?.name === 'CanceledError') {
          return
        }
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
        if (currentReqId === activeRequestIdRef.current) {
          setLoading(false)
        }
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

  const wgs84ImportInspection = useMemo(() => {
    if (!wgs84Text.trim()) return null
    if (wgs84SubMode === 'geojson') {
      return parseAndValidateWgs84GeoJson(wgs84Text)
    }
    const parsed = parseWgs84CoordinateText(wgs84Text, wgs84AxisOrder)
    if (!parsed.valid) return parsed
    const syntheticFc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            roadName: 'Tuyến nhập từ bảng tọa độ WGS-84',
          },
          geometry: {
            type: 'LineString',
            coordinates: parsed.points.map((p) => [p.lon, p.lat]),
          },
        },
      ],
    }
    return parseAndValidateWgs84GeoJson(syntheticFc)
  }, [wgs84Text, wgs84SubMode, wgs84AxisOrder])

  const handleGeoJsonFileSelect = (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '')
      setWgs84FileName(selected.name)
      setWgs84SubMode('geojson')
      setWgs84Text(content)
      toast.success(`Đã nạp tệp ${selected.name}`)
    }
    reader.readAsText(selected, 'utf-8')
  }

  const handleSubmitWgs84 = useCallback(
    (overrideCandidateId = null) => {
      if (!wgs84Text.trim()) {
        toast.error('Vui lòng tải tệp GeoJSON hoặc nhập tọa độ WGS-84.')
        return
      }
      if (!wgs84ImportInspection || !wgs84ImportInspection.valid) {
        toast.error(
          wgs84ImportInspection?.error || 'Dữ liệu WGS-84 / GeoJSON không hợp lệ.'
        )
        return
      }
      const normParams = normalizeRoadParams({
        segmentLength,
        roadWidth,
        slabLength,
        laneCount,
      })
      const crsConfigured =
        selectedPresetId !== 'unconfigured' &&
        Boolean(selectedCm) &&
        Number.isFinite(parseFloat(selectedCm))
      const crsConfig = crsConfigured
        ? {
            centralMeridian: parseFloat(selectedCm),
            scaleFactor: parseFloat(scaleFactor),
            axisOrder,
          }
        : null

      const candId =
        typeof overrideCandidateId === 'string' && overrideCandidateId
          ? overrideCandidateId
          : selectedWgs84CandidateId ||
            wgs84ImportInspection.lineStringCandidates?.[0]?.id ||
            null

      const built = buildStudioGeoJsonFromWgs84Import(
        wgs84ImportInspection,
        candId,
        normParams.roadWidth,
        crsConfig
      )
      if (!built) {
        toast.error('Không thể dựng dữ liệu không gian từ đầu vào WGS-84.')
        return
      }

      const enriched = enrichGeoJsonWithEngineeringFeatures(
        built.featureCollection,
        normParams,
        [],
        completedSegments
      )
      setCadLayerStats([])
      setLastAnalyzedSource('wgs84')
      if (onDataLoaded) {
        onDataLoaded(enriched.geoJson || built.featureCollection)
      }
      if (onAnalyticsLoaded) {
        onAnalyticsLoaded(enriched.analytics || built.analytics)
      }
      if (built.hasCenterline) {
        toast.success(
          `Đã dựng tuyến WGS-84 (${built.analytics.totalLengthMeters} m) thành công!`
        )
      } else {
        toast(
          'Đã hiển thị Polygon/Point WGS-84 lên bản đồ (Không có LineString làm tim tuyến).',
          { icon: 'ℹ️' }
        )
      }
    },
    [
      wgs84Text,
      wgs84ImportInspection,
      segmentLength,
      roadWidth,
      slabLength,
      laneCount,
      selectedPresetId,
      selectedCm,
      scaleFactor,
      axisOrder,
      selectedWgs84CandidateId,
      completedSegments,
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
    if (lastAnalyzedSource === 'wgs84' && wgs84Text.trim()) {
      handleSubmitWgs84()
    } else if (lastAnalyzedSource === 'coords' && coordsText.trim()) {
      handleSubmitCoords()
    } else if (file) {
      handleSubmit()
    } else if (coordsText.trim()) {
      handleSubmitCoords()
    } else if (wgs84Text.trim()) {
      handleSubmitWgs84()
    } else {
      toast.error('Chưa có nguồn dữ liệu để phân tích lại.')
    }
  }, [
    lastAnalyzedSource,
    wgs84Text,
    coordsText,
    file,
    handleSubmit,
    handleSubmitCoords,
    handleSubmitWgs84,
  ])

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
        centralMeridian: selectedPresetId === 'unconfigured' ? '' : selectedCm,
        scaleFactor,
        axisOrder,
        crsLifecycleState,
        isCrsStale,
        sourceDataKind: lastAnalyzedSource, // 'cad' | 'coords' | 'wgs84'
        crsConfigured:
          selectedPresetId !== 'unconfigured' &&
          Boolean(selectedCm) &&
          Number.isFinite(parseFloat(selectedCm)),
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
    selectedPresetId,
    selectedCm,
    scaleFactor,
    axisOrder,
    crsLifecycleState,
    isCrsStale,
    lastAnalyzedSource,
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

          {/* Input Mode Segmented Switcher (CAD / VN-2000 / WGS-84 GeoJSON) */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#0B1220] border border-[#27384E]">
            <button
              type="button"
              onClick={() => handleSwitchInputMode('cad')}
              title="Nhập bản vẽ kỹ thuật AutoCAD (.DXF, .DWG)"
              className={`w-full min-w-0 py-2 px-1 rounded-md text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                inputMode === 'cad'
                  ? 'bg-[#17263C] text-[#E8EEF6] shadow-sm border border-[#2E435E]'
                  : 'text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#111D2E]'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5 text-[#F06421] shrink-0" />
              <span className="truncate">CAD (.DXF)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchInputMode('coords')}
              title="Nhập danh sách tọa độ phẳng VN-2000 (X Bắc, Y Đông)"
              className={`w-full min-w-0 py-2 px-1 rounded-md text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                inputMode === 'coords'
                  ? 'bg-[#17263C] text-[#E8EEF6] shadow-sm border border-[#2E435E]'
                  : 'text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#111D2E]'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 text-[#22B7C9] shrink-0" />
              <span className="truncate">VN-2000</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchInputMode('wgs84')}
              title="Nhập GeoJSON RFC 7946 hoặc bảng tọa độ WGS-84 (Longitude, Latitude)"
              className={`w-full min-w-0 py-2 px-1 rounded-md text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                inputMode === 'wgs84'
                  ? 'bg-[#17263C] text-[#E8EEF6] shadow-sm border border-[#2E435E]'
                  : 'text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#111D2E]'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-[#39B58A] shrink-0" />
              <span className="truncate">WGS-84</span>
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

              {/* Candidate Centerline Layer Selector Popover */}
              {candidateLayers.length > 0 && (
                <div className="mt-2.5">
                  <CandidateLayerSelect
                    candidateLayers={candidateLayers}
                    activeCenterlineLayer={activeCenterlineLayer}
                    onSelectLayer={(lyr) => {
                      setActiveCenterlineLayer(lyr)
                      handleSubmit(lyr)
                    }}
                    disabled={loading}
                  />
                </div>
              )}
            </div>
          ) : inputMode === 'coords' ? (
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
          ) : null}

          {inputMode === 'wgs84' && (
            <div className="space-y-2.5">
              {/* Sub-mode switcher: GeoJSON vs Lon/Lat Table */}
              <div className="grid grid-cols-2 gap-1 p-0.5 rounded bg-[#0B1220] border border-[#27384E] text-[11.5px]">
                <button
                  type="button"
                  onClick={() => setWgs84SubMode('geojson')}
                  className={`py-1 px-2 rounded font-semibold cursor-pointer ${
                    wgs84SubMode === 'geojson'
                      ? 'bg-[#17263C] text-[#39B58A]'
                      : 'text-[#8FA3BA] hover:text-[#E8EEF6]'
                  }`}
                >
                  Tệp / Chuỗi GeoJSON
                </button>
                <button
                  type="button"
                  onClick={() => setWgs84SubMode('coords')}
                  className={`py-1 px-2 rounded font-semibold cursor-pointer ${
                    wgs84SubMode === 'coords'
                      ? 'bg-[#17263C] text-[#22B7C9]'
                      : 'text-[#8FA3BA] hover:text-[#E8EEF6]'
                  }`}
                >
                  Bảng Tọa Độ (Lon, Lat)
                </button>
              </div>

              {wgs84SubMode === 'geojson' ? (
                <div className="space-y-2">
                  <input
                    ref={geoJsonFileInputRef}
                    type="file"
                    accept=".geojson,.json"
                    onChange={handleGeoJsonFileSelect}
                    className="hidden"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => geoJsonFileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded bg-[#17263C] hover:bg-[#1E314D] border border-[#27384E] text-[12px] font-semibold text-[#E8EEF6] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#39B58A]" />
                      <span>
                        {wgs84FileName
                          ? `Tệp: ${wgs84FileName}`
                          : 'Chọn tệp .geojson / .json'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWgs84FileName('GEO-GJ-20261025-01.geojson')
                        setWgs84Text(SAMPLE_WGS84_GEOJSON)
                      }}
                      className="text-[12px] text-[#39B58A] hover:underline font-semibold cursor-pointer"
                    >
                      Điền mẫu chuẩn
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={wgs84Text}
                    onChange={(e) => setWgs84Text(e.target.value)}
                    placeholder='Dán nội dung GeoJSON (FeatureCollection / Feature / LineString chuẩn WGS-84 [lon, lat])...'
                    className="w-full p-2.5 rounded-md bg-[#0B1220] border border-[#27384E] focus:border-[#39B58A] focus:outline-none text-[12px] font-mono text-[#E8EEF6] resize-y select-text"
                  />
                  {wgs84ImportInspection?.isSyntheticSample && (
                    <div className="p-2.5 rounded-md bg-[#F59E0B]/15 border border-[#F59E0B]/60 text-[#F59E0B] text-[11.5px] space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#F59E0B]" />
                        <span>DỮ LIỆU MINH HỌA – KHÔNG PHẢI TIM TUYẾN THỰC ĐỊA</span>
                      </div>
                      <p className="text-[11px] text-[#CBD5E1] leading-relaxed">
                        Tuyến mẫu 3 điểm hình chữ L (204.03 m) chỉ phục vụ kiểm thử tính toán CRS, GeoJSON, dựng hình học và xuất JSON. Tọa độ minh họa không bám theo tim đường giao thông thực tế.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={wgs84AxisOrder}
                      onChange={(e) => setWgs84AxisOrder(e.target.value)}
                      className="px-2 py-1 rounded bg-[#0B1220] border border-[#27384E] text-[12px] text-[#E8EEF6]"
                    >
                      <option value="LON_LAT">Thứ tự: Kinh độ (Lon), Vĩ độ (Lat)</option>
                      <option value="LAT_LON">Thứ tự: Vĩ độ (Lat), Kinh độ (Lon)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setWgs84AxisOrder('LON_LAT')
                        setWgs84Text(
                          '106.660172, 10.762622\n106.661200, 10.762622\n106.661200, 10.763450'
                        )
                      }}
                      className="text-[12px] text-[#22B7C9] hover:underline font-semibold cursor-pointer"
                    >
                      Điền mẫu WGS-84
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={wgs84Text}
                    onChange={(e) => setWgs84Text(e.target.value)}
                    placeholder={
                      'Ví dụ (Longitude, Latitude):\n106.660172, 10.762622\n106.661200, 10.762622\n106.661200, 10.763450'
                    }
                    className="w-full p-2.5 rounded-md bg-[#0B1220] border border-[#27384E] focus:border-[#22B7C9] focus:outline-none text-[12.5px] font-mono text-[#E8EEF6] resize-y select-text"
                  />
                </div>
              )}

              {/* Geometry Inspection & Multiple LineString Selector */}
              {wgs84ImportInspection && (
                <div className="p-2.5 rounded-md bg-[#0B1220] border border-[#27384E] space-y-2 text-[12px]">
                  {!wgs84ImportInspection.valid ? (
                    <div className="flex items-start gap-2 text-[#EF4444]">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{wgs84ImportInspection.error}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-[#A9B9CE]">
                        <span>Hình học nhận diện:</span>
                        <span className="font-mono text-[#39B58A] font-semibold">
                          LineString: {wgs84ImportInspection.summary.lineStringCount} | Polygon:{' '}
                          {wgs84ImportInspection.summary.polygonCount} | Point:{' '}
                          {wgs84ImportInspection.summary.pointCount}
                        </span>
                      </div>

                      {wgs84ImportInspection.lineStringCandidates?.length > 1 && (
                        <div className="space-y-1 pt-1 border-t border-[#27384E]">
                          <label className="block text-[11.5px] font-semibold text-[#22B7C9]">
                            Chọn LineString làm tim tuyến chính:
                          </label>
                          <select
                            value={
                              selectedWgs84CandidateId ||
                              wgs84ImportInspection.lineStringCandidates[0]?.id
                            }
                            onChange={(e) => {
                              setSelectedWgs84CandidateId(e.target.value)
                              handleSubmitWgs84(e.target.value)
                            }}
                            className="w-full px-2.5 py-1.5 rounded bg-[#111D2E] border border-[#27384E] text-[12px] text-[#E8EEF6]"
                          >
                            {wgs84ImportInspection.lineStringCandidates.map(
                              (cand) => (
                                <option key={cand.id} value={cand.id}>
                                  {cand.name} ({cand.vertexCount} đỉnh •{' '}
                                  {cand.lengthMeters} m)
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      )}

                      {wgs84ImportInspection.summary.lineStringCount === 0 && (
                        <div className="p-2 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/50 text-[#F59E0B] text-[11.5px] leading-snug">
                          Tệp GeoJSON chỉ chứa Polygon/Point, không có LineString tim tuyến. Hệ thống giữ nguyên Polygon/Point trên bản đồ và không tự động biến Polygon thành tim tuyến.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
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
            {/* CRS Lifecycle Status Banner */}
            {crsLifecycleState === 'UNCONFIGURED' ? (
              <div className="p-2.5 rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/10 flex items-start gap-2 text-[12px] text-[#FDE68A] leading-snug">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[#F59E0B] block">Chưa xác định hệ tọa độ VN-2000 (L₀)</strong>
                  Vui lòng chọn khu vực hoặc nhập kinh tuyến trục L₀ để định vị bản vẽ và kích hoạt xuất dữ liệu.
                </div>
              </div>
            ) : crsLifecycleState === 'INVALID_CONFIG' ? (
              <div className="p-2.5 rounded-lg border border-[#EF4444]/50 bg-[#EF4444]/10 flex items-start gap-2 text-[12px] text-[#FCA5A5] leading-snug">
                <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[#EF4444] block">Tham số CRS không hợp lệ</strong>
                  Kinh tuyến trục L₀ phải từ 100° đến 112°. Hệ số tỉ lệ k₀ phải là số dương hợp lệ.
                </div>
              </div>
            ) : crsLifecycleState === 'STALE' ? (
              <div className="p-2.5 rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/10 flex items-start gap-2 text-[12px] text-[#FDE68A] leading-snug">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[#F59E0B] block">Cấu hình CRS đã thay đổi (STALE)</strong>
                  Kinh tuyến trục L₀ hoặc múi chiếu khác với dữ liệu đang xem. Bấm <strong>Phân tích lại</strong> để cập nhật bản đồ và mở khóa xuất dữ liệu.
                </div>
              </div>
            ) : crsLifecycleState === 'ANALYZING' ? (
              <div className="p-2.5 rounded-lg border border-[#3B82F6]/50 bg-[#3B82F6]/10 flex items-center gap-2 text-[12px] text-[#93C5FD]">
                <Loader2 className="w-4 h-4 animate-spin text-[#3B82F6] shrink-0" />
                <span>Đang phân tích hình học &amp; chiếu tọa độ VN-2000…</span>
              </div>
            ) : (
              <div className="p-2.5 rounded-lg border border-[#39B58A]/40 bg-[#39B58A]/10 flex items-center justify-between text-[12px] text-[#A7F3D0]">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#39B58A]" />
                  <span>VN-2000: L₀ = {selectedCm}°, k₀ = {scaleFactor}</span>
                </span>
                <span className="text-[10.5px] font-mono text-[#39B58A] bg-[#39B58A]/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                  ĐÃ ÁP DỤNG
                </span>
              </div>
            )}
            <CrsPresetSelect
              selectedPresetId={selectedPresetId}
              selectedCm={selectedCm}
              scaleFactor={scaleFactor}
              onSelectPreset={handlePresetChange}
              disabled={loading}
            />
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
                  handleCrsParamChange()
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
                  handleCrsParamChange()
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
                handleCrsParamChange()
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
        {inputMode === 'wgs84' ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSubmitWgs84()}
            className="w-full py-2.5 px-4 rounded-md bg-[#F06421] hover:bg-[#FF7635] disabled:opacity-60 text-white font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Xử Lý WGS-84 / GeoJSON &amp; Dựng Tuyến</span>
          </button>
        ) : inputMode === 'coords' ? (
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
