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
  Building2,
  FolderGit2,
} from 'lucide-react'
import CrsPresetSelect from './CrsPresetSelect'
import CandidateLayerSelect from './CandidateLayerSelect'
import ProjectProfileModal from './ProjectProfileModal'
import {
  loadProjectProfiles,
  saveProjectProfiles,
  getActiveProjectId,
  saveActiveProjectId,
  resolveParameterFieldState,
  computeEffectiveParams,
  SECTION_3_SPECS,
  SECTION_4_SPECS,
} from '../utils/projectProfiles'
import {
  DEFAULT_VN2000_PRESET_ID,
  VN2000_SURVEY_PRIORITY_GUIDANCE,
  PAVEMENT_DESIGN_FIELD_SPECS,
  SECTION_3_FIELD_SPECS,
  resolveVn2000Preset,
  convertRoadResponseToGeoJson,
  enrichGeoJsonWithEngineeringFeatures,
  normalizeRoadParams,
  buildAnalyticsFromRoadResponse,
  shouldFallbackToParseDxf,
  extractBtxmDesignParamsFromDxfText,
  extractRoadGeometryParamsFromDxfText,
} from '../utils/roadEngineeringBuilder'
import {
  parseWgs84CoordinateText,
  parseAndValidateWgs84GeoJson,
  buildStudioGeoJsonFromWgs84Import,
} from '../utils/crsTransformEngine'

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
  const btxmScanSeqRef = useRef(0)
  const dirtyFieldsForCurrentScanRef = useRef(new Set())
  const [scanningDxf, setScanningDxf] = useState(false)
  const scanningDxfRef = useRef(false)
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

  const segmentLength = roadParams?.segmentLength ?? ''
  const roadWidth = roadParams?.roadWidth ?? ''
  const slabLength = roadParams?.slabLength ?? ''
  const laneCount = roadParams?.laneCount ?? ''
  const slabThicknessCentimeters = roadParams?.slabThicknessCentimeters ?? ''
  const contractionJointSpacingMeters = roadParams?.contractionJointSpacingMeters ?? ''
  const expansionJointSpacingMeters = roadParams?.expansionJointSpacingMeters ?? ''
  const expansionJointGapMillimeters = roadParams?.expansionJointGapMillimeters ?? ''
  const dxfBtxmExtraction = roadParams?.dxfBtxmExtraction ?? null

  // VN-2000 Geodetic CRS state (supports reference presets + custom CM + 3°/6° zone + explicit axis order)
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_VN2000_PRESET_ID)
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
    if (presetId === 'unconfigured') {
      setSelectedPresetId('unconfigured')
      setSelectedCm('')
      return
    }
    if (presetId === 'custom') {
      setSelectedPresetId('custom')
      return
    }
    const found = resolveVn2000Preset(presetId)
    if (found) {
      setSelectedPresetId(found.id)
      const parsedCm = parseFloat(found.cm)
      if (Number.isFinite(parsedCm)) {
        setSelectedCm(parsedCm.toFixed(2))
      }
      const parsedK0 = parseFloat(found.k0 ?? found.scaleFactor ?? 0.9999)
      if (Number.isFinite(parsedK0)) {
        setScaleFactor(parsedK0.toFixed(4))
      }
    } else {
      setSelectedPresetId(presetId)
    }
  }

  const dxfGeometryExtraction = roadParams?.dxfGeometryExtraction ?? null

  // Project Parameter Profiles state
  const [projectProfiles, setProjectProfiles] = useState(() => loadProjectProfiles())
  const [activeProjectId, setActiveProjectId] = useState(() => getActiveProjectId())
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false)

  const activeProject = useMemo(() => {
    if (!activeProjectId) return null
    return projectProfiles.find((p) => p.id === activeProjectId) || null
  }, [projectProfiles, activeProjectId])

  const projectProfilesRef = useRef(projectProfiles)
  projectProfilesRef.current = projectProfiles
  const activeProjectIdRef = useRef(activeProjectId)
  activeProjectIdRef.current = activeProjectId

  const updateParam = (key, val) => {
    dirtyFieldsForCurrentScanRef.current.add(key)
    if (setRoadParams) {
      setRoadParams((prev) => ({ ...prev, [key]: val }))
    }
  }

  const reapplyParamsForProject = (project) => {
    const dirtySet = new Set(dirtyFieldsForCurrentScanRef.current || [])
    setRoadParams((prev) => ({
      ...prev,
      ...computeEffectiveParams({
        prev,
        dirtySet,
        btxmExtraction: prev.dxfBtxmExtraction,
        geomExtraction: prev.dxfGeometryExtraction,
        project,
      }),
    }))
  }

  const handleSelectProject = (newProjectId) => {
    setActiveProjectId(newProjectId)
    saveActiveProjectId(newProjectId)
    const newProj = newProjectId
      ? projectProfiles.find((p) => p.id === newProjectId) || null
      : null
    reapplyParamsForProject(newProj)
    if (newProj) {
      toast.success(`Đã áp dụng bộ thông số dự án: ${newProj.name}`)
    }
  }

  const handleSaveProfiles = (updatedProfiles) => {
    setProjectProfiles(updatedProfiles)
    saveProjectProfiles(updatedProfiles)
    // Saving/confirming/un-confirming the selected profile re-applies the same rule immediately.
    const selected = activeProjectIdRef.current
      ? updatedProfiles.find((p) => p.id === activeProjectIdRef.current) || null
      : null
    reapplyParamsForProject(selected)
    toast.success('Đã lưu bộ thông số dự án.')
  }

  const scanCadFileForBtxmParams = useCallback(
    async (selectedFile) => {
      const scanId = ++btxmScanSeqRef.current
      dirtyFieldsForCurrentScanRef.current = new Set()
      if (!setRoadParams) return

      // Same rule for every path: resolve the selected project at completion time.
      const applyRule = (btxmExtraction, geomExtraction) => {
        const proj = activeProjectIdRef.current
          ? projectProfilesRef.current.find((p) => p.id === activeProjectIdRef.current) || null
          : null
        const dirtySet = new Set(dirtyFieldsForCurrentScanRef.current)
        setRoadParams((prev) => ({
          ...prev,
          ...computeEffectiveParams({ prev, dirtySet, btxmExtraction, geomExtraction, project: proj }),
          dxfBtxmExtraction: btxmExtraction,
          dxfGeometryExtraction: geomExtraction,
        }))
      }

      // Immediately clear previous file's manual edits and DXF extractions before scanning the new file.
      applyRule(null, null)

      if (!selectedFile) {
        scanningDxfRef.current = false
        setScanningDxf(false)
        return
      }

      const lowerName = String(selectedFile.name || '').toLowerCase()
      if (!lowerName.endsWith('.dxf')) {
        scanningDxfRef.current = false
        setScanningDxf(false)
        return
      }

      scanningDxfRef.current = true
      setScanningDxf(true)
      try {
        const dxfText = await selectedFile.text()
        if (
          typeof window !== 'undefined' &&
          Number(window.__RG_TEST_SCAN_DELAY_MS) > 0
        ) {
          await new Promise((r) =>
            setTimeout(r, Number(window.__RG_TEST_SCAN_DELAY_MS))
          )
        }
        if (btxmScanSeqRef.current !== scanId) return

        const btxmExtraction = extractBtxmDesignParamsFromDxfText(
          dxfText,
          selectedFile.name
        )
        const geomExtraction = extractRoadGeometryParamsFromDxfText(
          dxfText,
          selectedFile.name
        )
        if (btxmScanSeqRef.current !== scanId) return
        applyRule(btxmExtraction, geomExtraction)
      } catch {
        if (btxmScanSeqRef.current !== scanId) return
        applyRule(null, null)
      } finally {
        if (btxmScanSeqRef.current === scanId) {
          scanningDxfRef.current = false
          setScanningDxf(false)
        }
      }
    },
    [setRoadParams, setSelectedCm]
  )

  const handleRemoveFile = () => {
    abortActiveRequest()
    btxmScanSeqRef.current++
    scanningDxfRef.current = false
    setScanningDxf(false)
    dirtyFieldsForCurrentScanRef.current = new Set()
    setLoading(false)
    setFile(null)
    setVisibleLayers({})
    setLayerGeometries({})
    setLoadingLayers({})
    setActiveCenterlineLayer(null)
    setCandidateLayers([])
    setAppliedCrsConfig(null)
    if (onAppliedCrsConfigChange) onAppliedCrsConfigChange(null)
    setCadLayerStats([])
    if (onCustomFeaturesChange) onCustomFeaturesChange([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (onCadFileChange) onCadFileChange(null)
    if (setRoadParams) {
      const proj = activeProjectIdRef.current
        ? projectProfilesRef.current.find((p) => p.id === activeProjectIdRef.current) || null
        : null
      setRoadParams((prev) => ({
        ...prev,
        ...computeEffectiveParams({
          prev,
          dirtySet: new Set(),
          btxmExtraction: null,
          geomExtraction: null,
          project: proj,
        }),
        dxfBtxmExtraction: null,
        dxfGeometryExtraction: null,
      }))
    }
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
        abortActiveRequest()
        setLoading(false)
        setFile(dropped)
        setInputMode('cad')
        setCandidateLayers([])
        setAppliedCrsConfig(null)
        if (onAppliedCrsConfigChange) onAppliedCrsConfigChange(null)
        if (onCadFileChange) onCadFileChange(dropped)
        scanCadFileForBtxmParams(dropped)
      } else {
        toast.error('Chỉ hỗ trợ file CAD (.dxf, .dwg).')
      }
    },
    [onCadFileChange, abortActiveRequest, onAppliedCrsConfigChange, scanCadFileForBtxmParams]
  )

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected) {
      abortActiveRequest()
      setLoading(false)
      setFile(selected)
      setInputMode('cad')
      setCandidateLayers([])
      setAppliedCrsConfig(null)
      if (onAppliedCrsConfigChange) onAppliedCrsConfigChange(null)
      if (onCadFileChange) onCadFileChange(selected)
      scanCadFileForBtxmParams(selected)
    }
  }

  const handleSubmit = useCallback(
    async (overrideLayerName = null) => {
      if (!file) {
        toast.error('Vui lòng chọn file CAD (.dxf/.dwg) trước.')
        return
      }
      if (scanningDxfRef.current) {
        toast.error('Đang quét thông số DXF mới, vui lòng đợi hoàn tất rồi bấm Dựng tuyến.')
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
        slabThicknessCentimeters,
        contractionJointSpacingMeters,
        expansionJointSpacingMeters,
        expansionJointGapMillimeters,
        dxfBtxmExtraction,
      })
      if (normParams.pavementDesign && !normParams.pavementDesign.valid) {
        toast.error(normParams.pavementDesign.errors[0])
        return
      }
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
        roadFd.append('RoadWidth', exactRoadWidth != null ? exactRoadWidth.toString() : '0')
        roadFd.append('CentralMeridian', cmVal.toString())
        roadFd.append('ScaleFactor', k0Val.toString())
        roadFd.append('AxisOrder', axisOrder)
        if (targetLayer) {
          roadFd.append('CenterlineLayerName', targetLayer)
        }

        const tStart =
          typeof performance !== 'undefined' ? performance.now() : Date.now()
        let roadRes = null
        let roadErr = null
        try {
          roadRes = await axios.post(`${API_BASE}/api/cad/parse-road`, roadFd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            signal: controller.signal,
          })
        } catch (err) {
          roadErr = err
        }

        const isStaleAfterRoad = currentReqId !== activeRequestIdRef.current
        const isCanceledAfterRoad =
          controller.signal.aborted ||
          axios.isCancel?.(roadErr) ||
          roadErr?.name === 'CanceledError' ||
          roadErr?.code === 'ERR_CANCELED'

        if (isStaleAfterRoad || isCanceledAfterRoad) {
          if (isStaleAfterRoad) {
            toast.dismiss(tid)
          }
          return
        }

        let loadedSomething = false
        const roadData = roadRes?.data ?? null

        if (roadData?.success) {
          const elapsedRoadMs = Math.max(
            1,
            Math.round(
              (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
                tStart
            )
          )
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
          const crsChangedSinceLastApply =
            appliedCrsConfig &&
            (Math.abs(Number(appliedCrsConfig.cm) - cmVal) > 1e-4 ||
              Math.abs(Number(appliedCrsConfig.k0) - k0Val) > 1e-4 ||
              appliedCrsConfig.axisOrder !== axisOrder)
          if (crsChangedSinceLastApply) {
            setLayerGeometries({})
            setVisibleLayers({})
            if (onCustomFeaturesChange) onCustomFeaturesChange([])
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
          if (onAnalyticsLoaded) {
            onAnalyticsLoaded(
              buildAnalyticsFromRoadResponse(
                roadData,
                normParams,
                geojson,
                elapsedRoadMs
              )
            )
          }
        } else {
          const errBody = roadErr?.response?.data ?? roadData ?? null
          if (
            errBody?.error === 'AmbiguousAxisOrder' ||
            errBody?.requiresAxisConfirmation
          ) {
            setAxisAmbiguityAlert(
              errBody.detail ||
                'Tọa độ nằm trong vùng giao thoa X/Y. Vui lòng chọn rõ thứ tự trục.'
            )
            toast.error('Cần xác nhận quy ước trục tọa độ X/Y!', { id: tid })
            return
          }

          let parseFallbackErr = null
          if (
            shouldFallbackToParseDxf({
              roadData,
              roadError: roadErr,
              isCanceled: controller.signal.aborted,
              isStale: currentReqId !== activeRequestIdRef.current,
            })
          ) {
            const parseFd = new FormData()
            parseFd.append('file', file)
            parseFd.append('targetSrid', '4326')
            parseFd.append('tessellationSegments', '72')
            parseFd.append('centralMeridian', cmVal.toString())
            parseFd.append('scaleFactor', k0Val.toString())
            parseFd.append('axisOrder', axisOrder)
            if (normParams.segmentLength != null) {
              parseFd.append('SegmentLength', normParams.segmentLength.toString())
            }
            if (exactRoadWidth != null) {
              parseFd.append('RoadWidth', exactRoadWidth.toString())
            }
            if (normParams.effectiveSlabLength != null) {
              parseFd.append('SlabLength', normParams.effectiveSlabLength.toString())
            }
            if (targetLayer) {
              parseFd.append('centerlineLayerName', targetLayer)
            }

            try {
              const parseRes = await axios.post(
                `${API_BASE}/api/cad/parse-dxf`,
                parseFd,
                {
                  headers: { 'Content-Type': 'multipart/form-data' },
                  signal: controller.signal,
                }
              )
              if (
                currentReqId !== activeRequestIdRef.current ||
                controller.signal.aborted
              ) {
                if (currentReqId !== activeRequestIdRef.current) {
                  toast.dismiss(tid)
                }
                return
              }

              const pData = parseRes?.data
              const analytics = pData?.analytics ?? null
              const featureCollection = pData?.featureCollection ?? pData
              if (analytics && onAnalyticsLoaded) {
                onAnalyticsLoaded({
                  ...analytics,
                  slabThicknessCentimeters: normParams.slabThicknessCentimeters,
                  contractionJointSpacingMeters: normParams.contractionJointSpacingMeters,
                  expansionJointSpacingMeters: normParams.expansionJointSpacingMeters,
                  expansionJointGapMillimeters: normParams.expansionJointGapMillimeters,
                  pavementDesign: normParams.pavementDesign,
                })
              }
              if (featureCollection && onDataLoaded) {
                onDataLoaded(featureCollection)
                setLastAnalyzedSource('cad')
                loadedSomething = true
              }
            } catch (pErr) {
              if (
                currentReqId !== activeRequestIdRef.current ||
                controller.signal.aborted ||
                axios.isCancel?.(pErr) ||
                pErr?.name === 'CanceledError'
              ) {
                if (currentReqId !== activeRequestIdRef.current) {
                  toast.dismiss(tid)
                }
                return
              }
              parseFallbackErr = pErr
            }
          }

          if (!loadedSomething) {
            const primaryErr = parseFallbackErr || roadErr
            const msg =
              primaryErr?.response?.data?.detail ||
              primaryErr?.response?.data?.message ||
              primaryErr?.message ||
              roadData?.detail ||
              'Không thể xử lý bản vẽ CAD'
            toast.error(`Lỗi: ${msg}`, { id: tid })
            return
          }
        }

        if (loadedSomething) {
          toast.success('Bóc tách và dựng tuyến đường thành công!', { id: tid })
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
      slabThicknessCentimeters,
      contractionJointSpacingMeters,
      expansionJointSpacingMeters,
      expansionJointGapMillimeters,
      dxfBtxmExtraction,
      selectedPresetId,
      selectedCm,
      scaleFactor,
      axisOrder,
      appliedCrsConfig,
      onDataLoaded,
      onAnalyticsLoaded,
      onAppliedCrsConfigChange,
      onCustomFeaturesChange,
      onSwitchTab,
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
        slabThicknessCentimeters,
        contractionJointSpacingMeters,
        expansionJointSpacingMeters,
        expansionJointGapMillimeters,
        dxfBtxmExtraction,
      })
      if (normParams.pavementDesign && !normParams.pavementDesign.valid) {
        toast.error(normParams.pavementDesign.errors[0])
        return
      }
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
          roadWidth: exactRoadWidth != null ? exactRoadWidth : 0,
          centralMeridian: cmVal,
          scaleFactor: k0Val,
          axisOrder: effectiveAxisOrder,
        }, {
          signal: controller.signal,
        })

        if (currentReqId !== activeRequestIdRef.current) {
          toast.dismiss(tid)
          return
        }
        const roadData = res.data
        if (!roadData?.success) {
          throw new Error(roadData?.detail || 'Không thể dựng tuyến từ tọa độ')
        }

        setCadLayerStats([])
        setLastAnalyzedSource('coords')
        const applied = { cm: cmVal, k0: k0Val, axisOrder: effectiveAxisOrder, source: 'coords' }
        setAppliedCrsConfig(applied)
        if (onAppliedCrsConfigChange) onAppliedCrsConfigChange(applied)

        const geojson = convertRoadResponseToGeoJson(roadData, normParams)
        if (geojson && onDataLoaded) onDataLoaded(geojson)

        if (onAnalyticsLoaded) {
          onAnalyticsLoaded(
            buildAnalyticsFromRoadResponse(roadData, normParams, geojson)
          )
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
      slabThicknessCentimeters,
      contractionJointSpacingMeters,
      expansionJointSpacingMeters,
      expansionJointGapMillimeters,
      dxfBtxmExtraction,
      selectedPresetId,
      selectedCm,
      scaleFactor,
      onDataLoaded,
      onAnalyticsLoaded,
      onAppliedCrsConfigChange,
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
        slabThicknessCentimeters,
        contractionJointSpacingMeters,
        expansionJointSpacingMeters,
        expansionJointGapMillimeters,
        dxfBtxmExtraction,
      })
      if (normParams.pavementDesign && !normParams.pavementDesign.valid) {
        toast.error(normParams.pavementDesign.errors[0])
        return
      }
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
      slabThicknessCentimeters,
      contractionJointSpacingMeters,
      expansionJointSpacingMeters,
      expansionJointGapMillimeters,
      dxfBtxmExtraction,
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
          const effCm = appliedCrsConfig?.cm ?? selectedCm
          const effK0 = appliedCrsConfig?.k0 ?? scaleFactor
          const effAxis = appliedCrsConfig?.axisOrder ?? axisOrder
          if (effCm !== undefined && effCm !== '') {
            fd.append('centralMeridian', effCm.toString())
          }
          if (effK0 !== undefined && effK0 !== '') {
            fd.append('scaleFactor', effK0.toString())
          }
          if (effAxis) {
            fd.append('axisOrder', effAxis)
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
      appliedCrsConfig,
      selectedCm,
      scaleFactor,
      axisOrder,
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
  const analyzedRoadWidth = ssotMetrics?.analyzedRoadWidth ?? null

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

  const sec3FieldStates = useMemo(() => {
    const states = {}
    const geomInputs = dxfGeometryExtraction?.autoFilledInputs || {}
    const geomFields = dxfGeometryExtraction?.fields || {}
    const dirtySet = dirtyFieldsForCurrentScanRef.current || new Set()

    for (const spec of SECTION_3_SPECS) {
      states[spec.key] = resolveParameterFieldState({
        key: spec.key,
        userOverrideVal: roadParams?.[spec.key],
        isUserDirty: dirtySet.has(spec.key),
        dxfExtractedVal: geomInputs[spec.key],
        dxfEvidence: geomFields[spec.key],
        projectVal: activeProject?.params?.[spec.key],
        projectName: activeProject?.name || '',
        projectCode: activeProject?.code || '',
        isTemplate: Boolean(activeProject?.isTemplate),
        isConfirmed: Boolean(activeProject?.confirmedBy && activeProject?.confirmedAt),
      })
    }
    return states
  }, [dxfGeometryExtraction, roadParams, activeProject])

  const missingSec3Fields = useMemo(() => {
    return SECTION_3_SPECS.filter((spec) => {
      const val = roadParams?.[spec.key]
      return val === undefined || val === null || String(val).trim() === ''
    })
  }, [roadParams])

  const sec4FieldStates = useMemo(() => {
    const states = {}
    const btxmInputs = dxfBtxmExtraction?.autoFilledInputs || {}
    const btxmFields = dxfBtxmExtraction?.fields || {}
    const dirtySet = dirtyFieldsForCurrentScanRef.current || new Set()

    for (const spec of SECTION_4_SPECS) {
      states[spec.key] = resolveParameterFieldState({
        key: spec.key,
        userOverrideVal: roadParams?.[spec.key],
        isUserDirty: dirtySet.has(spec.key),
        dxfExtractedVal: btxmInputs[spec.key],
        dxfEvidence: btxmFields[spec.key],
        projectVal: activeProject?.params?.[spec.key],
        projectName: activeProject?.name || '',
        projectCode: activeProject?.code || '',
        isTemplate: Boolean(activeProject?.isTemplate),
        isConfirmed: Boolean(activeProject?.confirmedBy && activeProject?.confirmedAt),
      })
    }
    return states
  }, [dxfBtxmExtraction, roadParams, activeProject])

  const missingSec4Fields = useMemo(() => {
    return SECTION_4_SPECS.filter((spec) => {
      const val = roadParams?.[spec.key]
      return val === undefined || val === null || String(val).trim() === ''
    })
  }, [roadParams])

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
        {/* ── SECTION 0: PROJECT PARAMETER PROFILE (BỘ THÔNG SỐ DỰ ÁN) ── */}
        <section
          data-testid="project-profile-section"
          className="px-4 py-3 bg-[#0B1220]/80 border-b border-[#27384E] space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#E8EEF6] uppercase tracking-wider">
              <Building2 className="w-4 h-4 text-[#F06421]" />
              <span>Bộ thông số dự án</span>
            </div>
            <button
              type="button"
              data-testid="open-project-modal-btn"
              onClick={() => setIsProjectModalOpen(true)}
              className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#17263C] hover:bg-[#20324D] border border-[#27384E] text-[#22B7C9] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Settings2 className="w-3 h-3" />
              <span>Quản lý</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="relative">
              <select
                data-testid="project-profile-select"
                value={activeProjectId}
                onChange={(e) => handleSelectProject(e.target.value)}
                className="w-full pl-2.5 pr-8 py-1.5 rounded-md bg-[#111D2E] border border-[#27384E] text-[12px] font-medium text-[#E8EEF6] focus:border-[#22B7C9] focus:outline-none cursor-pointer"
              >
                <option value="">-- Chưa chọn hồ sơ dự án --</option>
                {projectProfiles.filter((p) => !p.isTemplate).length > 0 && (
                  <optgroup label="📁 Hồ sơ dự án dùng thật">
                    {projectProfiles
                      .filter((p) => !p.isTemplate)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.code}] {p.name}
                        </option>
                      ))}
                  </optgroup>
                )}
                <optgroup label="📋 Hồ sơ mẫu & kiểm thử">
                  {projectProfiles
                    .filter((p) => p.isTemplate)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] {p.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Quick Param Summary Strip */}
            {!activeProject ? (
              <div className="px-2.5 py-1.5 rounded bg-[#0B1220] border border-[#1E2E42] flex items-center justify-between text-[11px] text-[#8FA3BA]">
                <span>Chưa chọn hồ sơ dự án</span>
                <span className="italic text-[10px]">Chỉ tự điền khi chọn/tạo hồ sơ</span>
              </div>
            ) : (
              <>
                <div className="px-2.5 py-1.5 rounded bg-[#0B1220] border border-[#1E2E42] flex items-center justify-between text-[11px]">
                  <span className="text-[#8FA3BA]">
                    {activeProject.isTemplate ? 'Hồ sơ mẫu chuẩn:' : 'Hồ sơ kỹ thuật:'}
                  </span>
                  <span className="font-mono text-[#22B7C9] font-medium">
                    B={activeProject.params?.roadWidth || '-'}m • Cọc={activeProject.params?.segmentLength || '-'}m • Dày={activeProject.params?.slabThicknessCentimeters || '-'}cm
                  </span>
                </div>
                {!activeProject.isTemplate && !(activeProject.confirmedBy && activeProject.confirmedAt) && (
                  <div className="px-2 py-1 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[10.5px] text-[#FBBF24] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#F59E0B]" />
                    <span>Hồ sơ chưa xác nhận (cần xác nhận trong Quản lý để cấp số tự điền)</span>
                  </div>
                )}
                {/* Explicit Button to adopt project CRS if different from current engineer's selection */}
                {activeProject.crs?.centralMeridian &&
                  Math.abs(Number(activeProject.crs.centralMeridian) - Number(selectedCm)) > 1e-4 && (
                    <button
                      type="button"
                      data-testid="apply-project-crs-btn"
                      onClick={() => {
                        setSelectedCm(String(activeProject.crs.centralMeridian))
                        toast.success(
                          `Đã áp dụng kinh tuyến trục L₀ = ${activeProject.crs.centralMeridian}° từ hồ sơ dự án`
                        )
                      }}
                      className="w-full px-2 py-1 rounded bg-[#22B7C9]/15 hover:bg-[#22B7C9]/25 text-[#22B7C9] text-[11px] font-semibold border border-[#22B7C9]/40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span>Áp dụng L₀ = {activeProject.crs.centralMeridian}° từ hồ sơ dự án</span>
                    </button>
                  )}
              </>
            )}
          </div>
        </section>

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
                <span>Phân tách bằng dấu phẩy, tab hoặc khoảng trắng (hỗ trợ X Y hoặc X Y Z).</span>
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
                  </div>
                  <textarea
                    rows={4}
                    value={wgs84Text}
                    onChange={(e) => setWgs84Text(e.target.value)}
                    placeholder='Dán nội dung GeoJSON (FeatureCollection / Feature / LineString chuẩn WGS-84 [lon, lat])...'
                    className="w-full p-2.5 rounded-md bg-[#0B1220] border border-[#27384E] focus:border-[#39B58A] focus:outline-none text-[12px] font-mono text-[#E8EEF6] resize-y select-text"
                  />
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
              <div
                data-crs-status="STALE"
                className="p-2.5 rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/10 flex items-start gap-2 text-[12px] text-[#FDE68A] leading-snug"
              >
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="text-[#F59E0B] block">CRS chưa áp dụng (STALE)</strong>
                  <div>
                    Đang áp dụng trên bản đồ:{' '}
                    <span className="font-mono font-semibold">
                      L₀ = {Number(appliedCrsConfig?.cm).toFixed(2)}°, k₀ = {Number(appliedCrsConfig?.k0).toFixed(4)}
                    </span>
                    .
                  </div>
                  <div>
                    Đã chọn{' '}
                    <span className="font-mono font-semibold">
                      L₀ = {selectedCm}°, k₀ = {scaleFactor}
                    </span>{' '}
                    — bấm <strong>Phân tích lại</strong> để dựng lại tuyến theo CRS mới.
                  </div>
                </div>
              </div>
            ) : crsLifecycleState === 'ANALYZING' ? (
              <div
                data-crs-status="ANALYZING"
                className="p-2.5 rounded-lg border border-[#3B82F6]/50 bg-[#3B82F6]/10 flex items-center gap-2 text-[12px] text-[#93C5FD]"
              >
                <Loader2 className="w-4 h-4 animate-spin text-[#3B82F6] shrink-0" />
                <span>
                  {isCrsStale
                    ? `CRS chưa áp dụng — Đang dựng lại tuyến theo L₀ = ${selectedCm}°, k₀ = ${scaleFactor}…`
                    : 'Đang phân tích hình học & chiếu tọa độ VN-2000…'}
                </span>
              </div>
            ) : (
              <div
                data-crs-status="VALID_APPLIED"
                className="p-2.5 rounded-lg border border-[#39B58A]/40 bg-[#39B58A]/10 flex items-center justify-between text-[12px] text-[#A7F3D0]"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#39B58A]" />
                  <span>VN-2000: L₀ = {selectedCm}°, k₀ = {scaleFactor}</span>
                </span>
                <span className="text-[10.5px] font-mono text-[#39B58A] bg-[#39B58A]/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider whitespace-nowrap shrink-0">
                  {appliedCrsConfig ? 'ĐÃ ÁP DỤNG' : 'MẶC ĐỊNH'}
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
            <p className="text-[11.5px] text-[#A9B9CE] leading-snug bg-[#0B1220]/70 border border-[#27384E]/80 rounded-md px-2.5 py-1.5">
              {VN2000_SURVEY_PRIORITY_GUIDANCE}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12.5px] font-medium text-[#C0CEDF] mb-1">
                Kinh tuyến trục L₀ (°)
              </label>
              <input
                id="input-central-meridian"
                data-testid="central-meridian-input"
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
        <section
          data-testid="road-geometry-section"
          className="px-4 py-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-bold text-[#A9B9CE] uppercase tracking-wider">
              3. Thông số hình học &amp; Tấm BTXM
            </div>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-[#17263C] border border-[#27384E] text-[#22B7C9]">
              Hình học tuyến
            </span>
          </div>

          {/* Missing Fields Indicator / Complete Banner for Section 3 */}
          {missingSec3Fields.length > 0 ? (
            <div
              data-testid="missing-geometry-alert"
              className="p-2.5 rounded-md bg-[#EF4444]/10 border border-[#EF4444]/40 text-[11.5px] text-[#FCA5A5] flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0" />
              <div className="leading-snug">
                Chưa có dữ liệu ở cả 2 nguồn, cần bổ sung:{' '}
                <strong>{missingSec3Fields.map((s) => s.label).join(', ')}</strong>
              </div>
            </div>
          ) : (
            <div
              data-testid="complete-geometry-banner"
              className="p-2 rounded-md bg-[#22C55E]/10 border border-[#22C55E]/30 text-[11px] text-[#4ADE80] flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
              <span>Đã đủ thông số hình học (Sẵn sàng dựng tuyến)</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {SECTION_3_SPECS.map((spec) => {
              const fState = sec3FieldStates[spec.key] || {}
              return (
                <div key={spec.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <label
                      htmlFor={`input-${spec.key}`}
                      className="block text-[12px] font-medium text-[#C0CEDF] leading-snug truncate"
                      title={spec.label}
                    >
                      {spec.label}
                    </label>
                    <span
                      data-testid={`source-badge-${spec.key}`}
                      className={`text-[9.5px] font-semibold px-1 py-0.5 rounded border shrink-0 ${fState.sourceBadgeClass || 'bg-[#17263C] text-[#8FA3BA] border-[#27384E]'}`}
                      title={fState.sourceLabel}
                    >
                      {fState.sourceLabel || 'Chưa có dữ liệu'}
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      id={`input-${spec.key}`}
                      data-testid={`geometry-input-${spec.key}`}
                      type="number"
                      step={spec.step || 'any'}
                      min={spec.min}
                      max={spec.max}
                      value={roadParams?.[spec.key] ?? ''}
                      placeholder="Chưa có dữ liệu"
                      onChange={(e) => updateParam(spec.key, e.target.value)}
                      className={`w-full pl-3 pr-8 py-2 rounded-md bg-[#0B1220] border focus:outline-none text-[13px] font-mono font-bold tabular-nums text-[#E8EEF6] placeholder-[#7E92AA]/60 ${
                        fState.isMissing
                          ? 'border-[#27384E] focus:border-[#22B7C9]'
                          : fState.hasConflict
                          ? 'border-[#F59E0B]/60 focus:border-[#F59E0B]'
                          : fState.source === 'FROM_DXF'
                          ? 'border-[#22C55E]/60 focus:border-[#22B7C9]'
                          : fState.source === 'FROM_PROJECT'
                          ? 'border-[#22B7C9]/60 focus:border-[#22B7C9]'
                          : 'border-[#27384E] focus:border-[#F06421]'
                      }`}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-mono text-[#8FA3BA]">
                      {spec.unit}
                    </span>
                  </div>

                  {/* Conflict Box if DXF and Project differ or DXF has multiple values */}
                  {(fState.hasConflict || fState.hasMultipleDxf) && (
                    <div
                      data-testid={`conflict-alert-${spec.key}`}
                      className="p-1.5 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/40 space-y-1.5 text-[10.5px]"
                    >
                      <div className="flex items-center gap-1 text-[#FBBF24] font-medium leading-tight">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>
                          {fState.hasMultipleDxf
                            ? `DXF có ${fState.dxfCandidates?.length || 2} giá trị mâu thuẫn: ${fState.dxfCandidates?.map((c) => `${c.normalizedValue} ${spec.unit}`).join(', ')}`
                            : `DXF (${fState.dxfValue} ${spec.unit}) ≠ Dự án (${fState.projectValue} ${spec.unit})`}
                        </span>
                      </div>
                      <div className="flex items-center flex-wrap gap-1">
                        {fState.hasMultipleDxf &&
                          fState.dxfCandidates?.map((cand) => (
                            <button
                              key={cand.normalizedValue}
                              type="button"
                              data-testid={`use-dxf-cand-btn-${spec.key}-${cand.normalizedValue}`}
                              onClick={() => updateParam(spec.key, String(cand.normalizedValue))}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer border ${
                                String(roadParams?.[spec.key]) === String(cand.normalizedValue)
                                  ? 'bg-[#22C55E]/20 text-[#4ADE80] border-[#22C55E]/50'
                                  : 'bg-[#17263C] text-[#C0CEDF] border-[#27384E] hover:bg-[#20324D]'
                              }`}
                            >
                              Dùng DXF: {cand.normalizedValue}
                            </button>
                          ))}
                        {!fState.hasMultipleDxf && fState.dxfValue && (
                          <button
                            type="button"
                            data-testid={`use-dxf-btn-${spec.key}`}
                            onClick={() => updateParam(spec.key, fState.dxfValue)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer border ${
                              String(roadParams?.[spec.key]) === String(fState.dxfValue)
                                ? 'bg-[#22C55E]/20 text-[#4ADE80] border-[#22C55E]/50'
                                : 'bg-[#17263C] text-[#C0CEDF] border-[#27384E] hover:bg-[#20324D]'
                            }`}
                          >
                            Dùng DXF: {fState.dxfValue}
                          </button>
                        )}
                        {fState.projectValue && (
                          <button
                            type="button"
                            data-testid={`use-proj-btn-${spec.key}`}
                            onClick={() => updateParam(spec.key, fState.projectValue)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer border ${
                              String(roadParams?.[spec.key]) === String(fState.projectValue)
                                ? 'bg-[#22B7C9]/20 text-[#22B7C9] border-[#22B7C9]/50'
                                : 'bg-[#17263C] text-[#C0CEDF] border-[#27384E] hover:bg-[#20324D]'
                            }`}
                          >
                            Dùng Dự án: {fState.projectValue}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Computed Slab Dimension Preview Strip */}
          <div className="px-3 py-2 rounded-md bg-[#0B1220] border border-[#27384E] flex items-center justify-between text-[12.5px]">
            <span className="text-[#A9B9CE]">Kích thước 1 tấm BTXM:</span>
            {normalizedParams.effectiveSlabLength != null &&
            normalizedParams.slabWidth != null ? (
              <span className="font-mono font-semibold text-[#22B7C9] tabular-nums">
                {normalizedParams.effectiveSlabLength.toFixed(1)}m ×{' '}
                {normalizedParams.slabWidth.toFixed(2)}m (
                {(
                  normalizedParams.effectiveSlabLength *
                  normalizedParams.slabWidth
                ).toFixed(2)}{' '}
                m²)
              </span>
            ) : (
              <span className="text-[#8FA3BA] italic text-[12px]">
                Chưa có dữ liệu
              </span>
            )}
          </div>

          {/* Provisional Polygon Width Alert */}
          {isSurfaceAreaProvisional && (
            <div className="p-3 rounded-md bg-[#F59E0B]/15 border border-[#F59E0B]/60 space-y-1.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <div className="text-[12.5px] text-[#E8EEF6] leading-relaxed">
                  <strong className="text-[#F59E0B] block">
                    Đã đổi bề rộng B ({analyzedRoadWidth != null ? `${analyzedRoadWidth}m` : 'Chưa dựng'} → {normalizedParams.roadWidth}m)
                  </strong>
                  Hãy bấm nút bên dưới để dựng lại đa giác mặt đường chính xác trước khi xuất hồ sơ.
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── SECTION 4: BTXM DESIGN DOSSIER PARAMETERS (INDEPENDENT FROM MAP GRID) ── */}
        <section
          data-testid="btxm-design-params-section"
          className="px-4 py-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-bold text-[#A9B9CE] uppercase tracking-wider">
              4. Thông số thiết kế BTXM
            </div>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-[#17263C] border border-[#27384E] text-[#22B7C9]">
              Hồ sơ thiết kế • Tùy chọn
            </span>
          </div>

          <p className="text-[11.5px] text-[#8FA3BA] leading-snug">
            Tự động dò tìm &amp; điền sẵn từ bản vẽ DXF khi có căn cứ rõ ràng. Kỹ sư có thể xác nhận, chỉnh sửa hoặc nhập bổ sung (tách biệt với cấu hình chia tấm trên bản đồ).
          </p>

          {/* Missing Fields Indicator / Complete Banner for Section 4 */}
          {missingSec4Fields.length > 0 ? (
            <div
              data-testid="missing-btxm-alert"
              className="p-2.5 rounded-md bg-[#EF4444]/10 border border-[#EF4444]/40 text-[11.5px] text-[#FCA5A5] flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0" />
              <div className="leading-snug">
                Chưa có dữ liệu ở cả 2 nguồn, cần bổ sung:{' '}
                <strong>{missingSec4Fields.map((s) => s.label).join(', ')}</strong>
              </div>
            </div>
          ) : (
            <div
              data-testid="complete-btxm-banner"
              className="p-2 rounded-md bg-[#22C55E]/10 border border-[#22C55E]/30 text-[11px] text-[#4ADE80] flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
              <span>Đã đủ 4 thông số BTXM (DXF &amp; Dự án)</span>
            </div>
          )}

          {dxfBtxmExtraction?.isDxf && (
            <div
              data-testid="btxm-dxf-scan-banner"
              data-dxf-file={dxfBtxmExtraction.fileName}
              data-extracted-count={dxfBtxmExtraction.extractedCount}
              className="p-2.5 rounded-md bg-[#0B1220] border border-[#27384E] space-y-1 text-[11.5px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#E8EEF6] truncate" title={dxfBtxmExtraction.fileName}>
                  Bóc tách DXF: {dxfBtxmExtraction.fileName}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-mono font-semibold shrink-0 ${
                    dxfBtxmExtraction.extractedCount > 0
                      ? 'bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/40'
                      : 'bg-[#17263C] text-[#A9B9CE] border border-[#27384E]'
                  }`}
                >
                  {dxfBtxmExtraction.extractedCount}/4 tự điền
                </span>
              </div>
              <div className="text-[11px] text-[#8FA3BA] leading-snug">
                {dxfBtxmExtraction.extractedCount > 0 && (
                  <span className="text-[#4ADE80] font-medium">
                    Đọc được {dxfBtxmExtraction.extractedCount} trường.{' '}
                  </span>
                )}
                {dxfBtxmExtraction.ambiguousCount > 0 && (
                  <span className="text-[#FBBF24] font-medium">
                    {dxfBtxmExtraction.ambiguousCount} trường để trống do có nhiều giá trị, hệ số DIMLFAC hoặc thiếu đơn vị.{' '}
                  </span>
                )}
                {dxfBtxmExtraction.missingCount > 0 && (
                  <span>
                    {dxfBtxmExtraction.missingCount} trường chưa có dữ liệu trong DXF.
                  </span>
                )}
              </div>
              {dxfBtxmExtraction.extractedCount === 0 &&
                Array.isArray(dxfBtxmExtraction.contextMentions) &&
                dxfBtxmExtraction.contextMentions.length > 0 && (
                  <div className="text-[10.5px] text-[#7E92AA] font-mono pt-0.5 border-t border-[#1E2E42]">
                    Ghi chú liên quan trong bản vẽ: &ldquo;{dxfBtxmExtraction.contextMentions[0].rawQuote}&rdquo; (Layer {dxfBtxmExtraction.contextMentions[0].layer} @ {dxfBtxmExtraction.contextMentions[0].positionText}) — không kèm số liệu 4 trường BTXM.
                  </div>
                )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2.5">
            {PAVEMENT_DESIGN_FIELD_SPECS.map((spec) => {
              const rawVal = roadParams?.[spec.key] ?? ''
              const fieldState = normalizedParams.pavementDesign?.fields?.[spec.key]
              const fState = sec4FieldStates[spec.key] || {}
              const dxfEvidence = fState?.dxfEvidence || fieldState?.dxfEvidence || null
              const isInvalid = Boolean(fieldState && !fieldState.valid)
              const isAutoFilled = fState?.source === 'FROM_DXF'
              const isFromProject = fState?.source === 'FROM_PROJECT'
              const isAmbiguousEmpty =
                fieldState?.provenance === 'EMPTY_MULTIPLE_VALUES' ||
                fieldState?.provenance === 'EMPTY_AMBIGUOUS_DIMLFAC' ||
                fieldState?.provenance === 'EMPTY_MISSING_UNIT'

              return (
                <div
                  key={spec.key}
                  data-testid={`btxm-field-card-${spec.key}`}
                  className="p-2.5 rounded-md bg-[#0B1220]/70 border border-[#27384E] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`input-${spec.key}`}
                      className="block text-[12px] font-medium text-[#C0CEDF] leading-snug"
                    >
                      {spec.label}
                    </label>
                    <span
                      data-testid={`btxm-status-badge-${spec.key}`}
                      data-status={dxfEvidence?.status || (isFromProject ? 'FROM_PROJECT' : 'NO_DXF')}
                      data-provenance={fState?.source || fieldState?.provenance || 'EMPTY_NO_DXF'}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                        fState?.sourceBadgeClass ||
                        (isAutoFilled
                          ? 'bg-[#22C55E]/15 text-[#4ADE80] border-[#22C55E]/40'
                          : isFromProject
                          ? 'bg-[#22B7C9]/15 text-[#22B7C9] border-[#22B7C9]/40'
                          : isAmbiguousEmpty
                          ? 'bg-[#F59E0B]/15 text-[#FBBF24] border-[#F59E0B]/40'
                          : fieldState?.isProvided
                          ? 'bg-[#22B7C9]/15 text-[#22B7C9] border-[#22B7C9]/40'
                          : 'bg-[#17263C] text-[#8FA3BA] border-[#27384E]')
                      }`}
                    >
                      {fState?.sourceLabel ||
                        (dxfEvidence
                          ? fieldState?.provenanceLabel || dxfEvidence.statusLabel
                          : fieldState?.isProvided
                          ? 'Nhập thủ công'
                          : 'Chưa có dữ liệu')}
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      id={`input-${spec.key}`}
                      name={spec.key}
                      data-field={spec.key}
                      type="text"
                      inputMode="decimal"
                      value={rawVal}
                      placeholder={spec.allowZero ? 'Chưa có dữ liệu (≥ 0)' : 'Chưa có dữ liệu (> 0)'}
                      onChange={(e) => updateParam(spec.key, e.target.value)}
                      className={`w-full pl-2.5 pr-9 py-1.5 rounded-md bg-[#0B1220] border text-[13px] font-mono font-bold tabular-nums text-[#E8EEF6] placeholder-[#7E92AA]/60 focus:outline-none ${
                        isInvalid
                          ? 'border-[#EF4444] focus:border-[#EF4444] text-[#FCA5A5]'
                          : fState?.hasConflict
                          ? 'border-[#F59E0B]/60 focus:border-[#F59E0B]'
                          : isAutoFilled
                          ? 'border-[#22C55E]/60 focus:border-[#22B7C9]'
                          : isFromProject
                          ? 'border-[#22B7C9]/60 focus:border-[#22B7C9]'
                          : isAmbiguousEmpty
                          ? 'border-[#F59E0B]/60 focus:border-[#22B7C9]'
                          : 'border-[#27384E] focus:border-[#22B7C9]'
                      }`}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] font-mono text-[#8FA3BA]">
                      {spec.unit}
                    </span>
                  </div>

                  {/* Conflict Box if DXF and Project differ or DXF has multiple values */}
                  {(fState?.hasConflict || fState?.hasMultipleDxf) && (
                    <div
                      data-testid={`conflict-alert-${spec.key}`}
                      className="p-1.5 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/40 space-y-1.5 text-[10.5px]"
                    >
                      <div className="flex items-center gap-1 text-[#FBBF24] font-medium leading-tight">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>
                          {fState.hasMultipleDxf
                            ? `DXF có ${fState.dxfCandidates?.length || 2} giá trị mâu thuẫn: ${fState.dxfCandidates?.map((c) => `${c.normalizedValue} ${spec.unit}`).join(', ')}`
                            : `DXF (${fState.dxfValue} ${spec.unit}) ≠ Dự án (${fState.projectValue} ${spec.unit})`}
                        </span>
                      </div>
                      <div className="flex items-center flex-wrap gap-1">
                        {fState.hasMultipleDxf &&
                          fState.dxfCandidates?.map((cand) => (
                            <button
                              key={cand.normalizedValue}
                              type="button"
                              data-testid={`use-dxf-cand-btn-${spec.key}-${cand.normalizedValue}`}
                              onClick={() => updateParam(spec.key, String(cand.normalizedValue))}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer border ${
                                String(rawVal) === String(cand.normalizedValue)
                                  ? 'bg-[#22C55E]/20 text-[#4ADE80] border-[#22C55E]/50'
                                  : 'bg-[#17263C] text-[#C0CEDF] border-[#27384E] hover:bg-[#20324D]'
                              }`}
                            >
                              Dùng DXF: {cand.normalizedValue}
                            </button>
                          ))}
                        {!fState.hasMultipleDxf && fState.dxfValue && (
                          <button
                            type="button"
                            data-testid={`use-dxf-btn-${spec.key}`}
                            onClick={() => updateParam(spec.key, fState.dxfValue)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer border ${
                              String(rawVal) === String(fState.dxfValue)
                                ? 'bg-[#22C55E]/20 text-[#4ADE80] border-[#22C55E]/50'
                                : 'bg-[#17263C] text-[#C0CEDF] border-[#27384E] hover:bg-[#20324D]'
                            }`}
                          >
                            Dùng DXF: {fState.dxfValue}
                          </button>
                        )}
                        {fState.projectValue && (
                          <button
                            type="button"
                            data-testid={`use-proj-btn-${spec.key}`}
                            onClick={() => updateParam(spec.key, fState.projectValue)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer border ${
                              String(rawVal) === String(fState.projectValue)
                                ? 'bg-[#22B7C9]/20 text-[#22B7C9] border-[#22B7C9]/50'
                                : 'bg-[#17263C] text-[#C0CEDF] border-[#27384E] hover:bg-[#20324D]'
                            }`}
                          >
                            Dùng Dự án: {fState.projectValue}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {dxfEvidence ? (
                    <div
                      data-testid={`btxm-evidence-${spec.key}`}
                      className="text-[11px] leading-snug text-[#8FA3BA] space-y-1"
                    >
                      {dxfEvidence.status === 'EXTRACTED' && (
                        <div className="text-[#A9B9CE]">
                          <span className="text-[#4ADE80] font-semibold">Căn cứ DXF: </span>
                          <span className="font-mono text-[#E8EEF6]">&ldquo;{dxfEvidence.rawQuote}&rdquo;</span>{' '}
                          <span className="font-mono text-[#22B7C9]">({dxfEvidence.conversionNote})</span>{' '}
                          <span className="font-mono text-[#8FA3BA]">
                            • Layer {dxfEvidence.layer} @ {dxfEvidence.positionText}
                          </span>
                        </div>
                      )}
                      {dxfEvidence.status === 'MULTIPLE_VALUES' && (
                        <div className="text-[#FBBF24]">
                          <span className="font-semibold">Căn cứ DXF (Nhiều giá trị): </span>
                          <span>{dxfEvidence.summaryText}</span>
                        </div>
                      )}
                      {dxfEvidence.status === 'AMBIGUOUS_DIMLFAC' && (
                        <div className="text-[#FBBF24]">
                          <span className="font-semibold">Căn cứ DXF (DIMLFAC chưa rõ quy đổi): </span>
                          <span>{dxfEvidence.summaryText}</span>
                        </div>
                      )}
                      {dxfEvidence.status === 'MISSING_UNIT' && (
                        <div className="text-[#FBBF24]">
                          <span className="font-semibold">Căn cứ DXF (Thiếu đơn vị): </span>
                          <span>{dxfEvidence.summaryText}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      data-testid={`btxm-evidence-${spec.key}`}
                      className="text-[10.5px] font-mono text-[#7E92AA] truncate"
                      title={spec.key}
                    >
                      {spec.ruleText}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {normalizedParams.pavementDesign && !normalizedParams.pavementDesign.valid && (
            <div
              data-testid="btxm-design-validation-error"
              className="p-2.5 rounded-md bg-[#EF4444]/15 border border-[#EF4444]/60 text-[12px] text-[#FCA5A5] space-y-1"
            >
              {normalizedParams.pavementDesign.errors.map((errMsg, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#EF4444] shrink-0 mt-0.5" />
                  <span>{errMsg}</span>
                </div>
              ))}
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
            data-testid="analyze-route-btn"
            disabled={loading || scanningDxf}
            onClick={() => handleSubmit()}
            className="w-full py-2.5 px-4 rounded-md bg-[#F06421] hover:bg-[#FF7635] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang bóc tách CAD &amp; dựng tuyến…</span>
              </>
            ) : scanningDxf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang quét thông số DXF…</span>
              </>
            ) : isCrsStale && file ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Phân Tích Lại &amp; Áp Dụng CRS Mới (L₀ = {selectedCm}°)</span>
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

      {/* ── Project Profiles Management Modal ── */}
      <ProjectProfileModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        profiles={projectProfiles}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onSaveProfiles={handleSaveProfiles}
      />
    </aside>
  )
}
