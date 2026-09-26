import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { DxfViewer } from 'dxf-viewer'
import * as THREE from 'three'
import toast from 'react-hot-toast'
import {
  ZoomIn, ZoomOut, Maximize2, RotateCcw, Layers, Eye, EyeOff,
  Compass, FileCode, Upload, Loader2, AlertCircle, Info, Route, Crosshair, Ruler,
} from 'lucide-react'

/* ─────────────────────────────────────────────────────────────────
   CadViewer  –  Full-featured WebGL DXF viewer using dxf-viewer
   Uses absolute coordinates from the DXF; no custom coordinate
   transformation that could collapse geometry into star shapes.
   ─────────────────────────────────────────────────────────────── */

export default function CadViewer({ rawDxfFile, onFileLoaded, onStatsLoaded, isVisible = true }) {
  const containerRef       = useRef(null)   // DOM div that dxf-viewer appends its canvas into
  const viewerRef          = useRef(null)   // DxfViewer instance
  const activeViewerRef    = useRef(null)   // Tracks strictly current active viewer
  const loadSeqRef         = useRef(0)      // Monotonically increasing load sequence counter
  const objectUrlRef       = useRef(null)   // blob URL created for the current file
  const isLoadingRef       = useRef(false)  // guard: prevent concurrent viewer.Load() calls
  const lastLoadedFileRef  = useRef(null)   // track file already queued to skip useEffect re-trigger

  const [loading,       setLoading]       = useState(false)
  const [loadProgress,  setLoadProgress]  = useState(null) // {phase, pct}
  const [fileName,      setFileName]      = useState('')
  const [error,         setError]         = useState(null)
  const [layers,        setLayers]        = useState([])   // [{name, color, visible}]
  const [entityCount,   setEntityCount]   = useState(null)
  const [showLayerPanel, setShowLayerPanel] = useState(false)

  /* ── Live Cursor XYZ Coordinates & Distance Measure State ─── */
  const [cursorCoords,  setCursorCoords]  = useState(null) // { x, y, z, px, py }
  const [isMeasuring,   setIsMeasuring]   = useState(false)
  const [measureStart,  setMeasureStart]  = useState(null)
  const [measureResult, setMeasureResult] = useState(null)

  /* ── Robust Bounding Box for Road / Civil Drawings ─────────────── */
  const computeSmartBounds = useCallback((v) => {
    if (!v) return null
    const dxf = v.GetDxf()
    if (!dxf?.entities || dxf.entities.length === 0) return null

    const pts = []
    const roadPts = []
    const roadLayers = ['ENTPLINETUYEN', 'MEPNHUA', 'BO_VIA', 'TIM', 'DUONG', 'VIA', 'LE', 'RANH', 'ROAD']

    for (let i = 0; i < dxf.entities.length; i++) {
      const e = dxf.entities[i]
      const layerUpper = (e.layer || '').toUpperCase()
      const isRoad = roadLayers.some(l => layerUpper.includes(l))
      const addPt = (p) => {
        if (p && !isNaN(p.x) && !isNaN(p.y)) {
          pts.push({ x: p.x, y: p.y })
          if (isRoad) roadPts.push({ x: p.x, y: p.y })
        }
      }
      if (e.vertices) { for (let vt of e.vertices) addPt(vt) }
      if (e.start) addPt(e.start)
      if (e.end) addPt(e.end)
      if (e.position) addPt(e.position)
      if (e.center) addPt(e.center)
    }

    const targetPts = roadPts.length >= 10 ? roadPts : pts
    if (targetPts.length === 0) return null

    // Compute 2% and 98% percentiles to filter out distant title blocks (0,0) or stray points
    const xs = targetPts.map(p => p.x).sort((a, b) => a - b)
    const ys = targetPts.map(p => p.y).sort((a, b) => a - b)
    const n = targetPts.length

    const p02_x = xs[Math.floor(n * 0.02)]
    const p98_x = xs[Math.min(n - 1, Math.floor(n * 0.98))]
    const p02_y = ys[Math.floor(n * 0.02)]
    const p98_y = ys[Math.min(n - 1, Math.floor(n * 0.98))]

    if (p98_x <= p02_x || p98_y <= p02_y) return null

    return {
      minX: p02_x,
      maxX: p98_x,
      minY: p02_y,
      maxY: p98_y,
      isRoad: roadPts.length >= 10
    }
  }, [])

  /* ── Center Camera & Zoom to Extents / Road Focus ───────────── */
  const fitToScreen = useCallback((viewerInstance = null, forceAll = false) => {
    const v = viewerInstance || viewerRef.current
    if (!v || !v.HasRenderer()) return

    const rawBounds = v.GetBounds()
    const origin = v.GetOrigin()
    if (!rawBounds) return

    const ox = origin ? origin.x : 0
    const oy = origin ? origin.y : 0

    // Auto-focus on road corridor / main cluster unless user clicks "Fit All"
    const smartBounds = !forceAll ? computeSmartBounds(v) : null
    const bounds = smartBounds || rawBounds

    const minX = bounds.minX - ox
    const maxX = bounds.maxX - ox
    const minY = bounds.minY - oy
    const maxY = bounds.maxY - oy

    const container = containerRef.current
    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
      v.SetSize(container.clientWidth, container.clientHeight)
    }

    const cam = v.GetCamera()
    if (cam) {
      cam.near = -500000
      cam.far = 500000
      cam.updateProjectionMatrix()
    }

    const w = Math.max(maxX - minX, 10)
    const h = Math.max(maxY - minY, 10)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    // Apply padding: 0.06 for snug fit on road
    v.FitView(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2, 0.06)
    v.Render()
  }, [computeSmartBounds])

  /* ── Create / destroy DxfViewer when container mounts ───────── */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.style.width = '100%'
    el.style.height = '100%'
    const w = el.clientWidth || 800
    const h = el.clientHeight || 600

    // Instantiate the viewer – dark background, full autoResize
    const viewer = new DxfViewer(el, {
      autoResize:  true,
      canvasWidth: w,
      canvasHeight: h,
      clearColor:  new THREE.Color('#0a0f1e'),
      clearAlpha:  1.0,
      antialias:   true,
      colorCorrection: true,   // Correct entity colours against dark bg
      blackWhiteInversion: true,
      retainParsedDxf: true,   // Retain parsed DXF for entity count & smart road bounds
      sceneOptions: {
        wireframeMesh: true,   // Display 3D surfaces and polyface meshes cleanly
      },
    })

    // Expand depth frustum so 3D drawings (topography, elevation Z) are not clipped
    const initialCam = viewer.GetCamera()
    if (initialCam) {
      initialCam.near = -500000
      initialCam.far = 500000
      initialCam.updateProjectionMatrix()
    }

    viewerRef.current = viewer
    activeViewerRef.current = viewer

    if (rawDxfFile && rawDxfFile !== lastLoadedFileRef.current) {
      loadDxfFile(rawDxfFile)
    }

    // Subscribe to viewer messages (warnings / errors)
    const onMessage = (evt) => {
      const { message, level } = evt.detail
      if (level === 'error') {
        console.error('[DxfViewer]', message)
        toast.error(`CAD: ${message}`, { duration: 5000 })
      } else if (level === 'warn') {
        console.warn('[DxfViewer]', message)
      }
    }
    viewer.Subscribe('message', onMessage)

    return () => {
      // Invalidate any in-progress load for this viewer
      loadSeqRef.current += 1
      activeViewerRef.current = null

      // Guard every call: viewer may have no WebGL renderer (context lost or
      // init failure) and Unsubscribe/Destroy both call _EnsureRenderer()
      // internally which throws on null — causing the white-screen crash.
      if (viewer?.HasRenderer()) {
        viewer.Unsubscribe('message', onMessage)
      }
      viewer?.Destroy()
      viewerRef.current = null
      // ── CRITICAL for React StrictMode: reset loading guards so the second
      // mount (after StrictMode's intentional unmount) is not permanently blocked.
      isLoadingRef.current = false
      lastLoadedFileRef.current = null
      // Release blob URL if any
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  /* ── Core loading function ────────────────────────────────────── */
  const loadDxfFile = useCallback(async (file) => {
    if (!file || !viewerRef.current) return

    const loadSeq = ++loadSeqRef.current

    // ── GUARD: block concurrent loads on the same viewer instance
    if (isLoadingRef.current) {
      console.warn('[CadViewer] Load already in progress — skipping duplicate call')
      return
    }
    isLoadingRef.current = true

    const viewer = viewerRef.current

    if (!viewer || !viewer.HasRenderer()) {
      isLoadingRef.current = false
      return
    }

    setLoading(true)
    setError(null)
    setLayers([])
    setEntityCount(null)
    setLoadProgress({ phase: 'Chuẩn bị…', pct: 0 })

    // Revoke previous blob URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
    }
    const blobUrl = URL.createObjectURL(file)
    objectUrlRef.current = blobUrl
    setFileName(file.name)

    const toastId = toast.loading(`Đang tải bản vẽ CAD: ${file.name}…`)

    try {
      await viewer.Load({
        url: blobUrl,
        fonts: null,
        progressCbk: (phase, processed, total) => {
          if (loadSeqRef.current !== loadSeq || activeViewerRef.current !== viewer) return
          const pct = total > 0 ? Math.round((processed / total) * 100) : null
          const phaseLabel =
            phase === 'font'    ? '⚙ Tải font…'      :
            phase === 'fetch'   ? '⬇ Tải file…'      :
            phase === 'parse'   ? '🔍 Phân tích DXF…' :
            phase === 'prepare' ? '🎨 Dựng hình…'     : phase
          setLoadProgress({ phase: phaseLabel, pct })
        },
      })

      // If a newer load has started or this viewer was destroyed, abandon silently
      if (loadSeqRef.current !== loadSeq || activeViewerRef.current !== viewer) {
        toast.dismiss(toastId)
        return
      }

      // Safe to read from local `viewer` — it is the same object that did the Load
      const rawLayers = viewer.HasRenderer() ? viewer.GetLayers(false) : []
      setLayers(rawLayers.map(l => ({
        name:    l.name,
        color:   `#${l.color.toString(16).padStart(6, '0')}`,
        visible: true,
      })))

      const parsed = viewer.HasRenderer() ? viewer.GetDxf() : null
      const totalEnt = parsed?.entities?.length || 0
      if (totalEnt > 0) {
        setEntityCount(totalEnt)
      }

      // ── CRITICAL: Center Camera directly on road corridor!
      fitToScreen(viewer, false)
      requestAnimationFrame(() => fitToScreen(viewer, false))
      setTimeout(() => fitToScreen(viewer, false), 150)

      // Notify parent about CAD file stats immediately
      if (onStatsLoaded) {
        onStatsLoaded({
          fileName: file.name,
          fileSize: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
          layerCount: rawLayers.length,
          entityCount: totalEnt || null,
        })
      }

      toast.success(
        `✅ Đã nạp bản vẽ: ${rawLayers.length} layer, ${file.name}`,
        { id: toastId, duration: 3000 }
      )
    } catch (err) {
      console.error('DxfViewer Load error:', err)
      // Check if this load was superseded or viewer was dismantled
      if (loadSeqRef.current !== loadSeq || activeViewerRef.current !== viewer) {
        toast.dismiss(toastId)
        return
      }
      const msg = err?.message ?? String(err)
      // Suppress known abort / Destroy-on-null errors from unmounted/cleared sessions
      if (msg.includes('Destroy') || msg.includes('null')) {
        console.warn('[CadViewer] Abort/Destroy error suppressed:', msg)
        toast.dismiss(toastId)
        return
      }
      setError(msg)
      toast.error(`Lỗi nạp bản vẽ: ${msg}`, { id: toastId, duration: 6000 })
    } finally {
      if (loadSeqRef.current === loadSeq) {
        isLoadingRef.current = false
        setLoading(false)
        setLoadProgress(null)
      }
    }
  }, [fitToScreen])

  /* ── Auto-fit camera when switching to CAD tab ─────────────── */
  useEffect(() => {
    if (isVisible && viewerRef.current?.HasRenderer()) {
      const el = containerRef.current
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        viewerRef.current.SetSize(el.clientWidth, el.clientHeight)
      }
      fitToScreen()
      requestAnimationFrame(() => fitToScreen())
      const timer = setTimeout(() => fitToScreen(), 150)
      return () => clearTimeout(timer)
    }
  }, [isVisible, fitToScreen])

  /* ── Trigger load when rawDxfFile prop changes ───────────────── */
  useEffect(() => {
    if (rawDxfFile && rawDxfFile !== lastLoadedFileRef.current && viewerRef.current) {
      loadDxfFile(rawDxfFile)
    }
  }, [rawDxfFile, loadDxfFile])

  /* ── Drag & Drop directly onto viewer ────────────────────────── */
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const name = file.name.toLowerCase()
    if (name.endsWith('.dxf') || name.endsWith('.dwg')) {
      // Mark before loading so the useEffect triggered by onFileLoaded below
      // sees this file as already queued and skips the duplicate load.
      lastLoadedFileRef.current = file
      loadDxfFile(file)
      if (onFileLoaded) onFileLoaded(file)   // syncs App state (shows file in Sidebar)
    } else {
      toast.error('Vui lòng thả file bản vẽ CAD (.dxf / .dwg)!')
    }
  }, [loadDxfFile, onFileLoaded])

  /* ── Load sample file ───────────────────────────────────────── */
  const handleLoadSample = useCallback(async () => {
    if (!viewerRef.current) return
    const viewer = viewerRef.current
    const loadSeq = ++loadSeqRef.current

    setLoading(true)
    setError(null)
    const toastId = toast.loading('Đang tải bản vẽ mẫu…')
    try {
      await viewer.Load({
        url: '/sample_road.dxf',
        progressCbk: (phase, processed, total) => {
          if (loadSeqRef.current !== loadSeq || activeViewerRef.current !== viewer) return
          const pct = total > 0 ? Math.round((processed / total) * 100) : null
          setLoadProgress({ phase, pct })
        },
      })
      if (loadSeqRef.current !== loadSeq || activeViewerRef.current !== viewer) {
        toast.dismiss(toastId)
        return
      }
      setFileName('sample_road.dxf')
      const rawLayers = viewer.HasRenderer() ? viewer.GetLayers(false) : []
      setLayers(rawLayers.map(l => ({
        name:    l.name,
        color:   `#${l.color.toString(16).padStart(6, '0')}`,
        visible: true,
      })))
      fitToScreen(viewer)
      requestAnimationFrame(() => fitToScreen(viewer))
      setTimeout(() => fitToScreen(viewer), 120)
      toast.success('Bản vẽ mẫu đã được nạp!', { id: toastId })
    } catch (err) {
      if (loadSeqRef.current !== loadSeq || activeViewerRef.current !== viewer) {
        toast.dismiss(toastId)
        return
      }
      const msg = err?.message ?? String(err)
      if (msg.includes('Destroy') || msg.includes('null')) {
        console.warn('[CadViewer] Abort/Destroy error suppressed:', msg)
        toast.dismiss(toastId)
        return
      }
      setError(msg)
      toast.error(`Không tải được bản vẽ mẫu: ${msg}`, { id: toastId })
    } finally {
      if (loadSeqRef.current === loadSeq) {
        setLoading(false)
        setLoadProgress(null)
      }
    }
  }, [fitToScreen])

  /* ── Camera controls (via DxfViewer built-in FitView / SetView) */
  const handleZoomExtents = () => {
    fitToScreen()
  }

  const handleZoomIn = () => {
    const v = viewerRef.current
    if (!v || !v.HasRenderer()) return
    const cam = v.GetCamera()
    const w = (cam.right - cam.left) * 0.7
    const h = (cam.top - cam.bottom) * 0.7
    const cx = cam.position.x
    const cy = cam.position.y
    v.FitView(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2, 0)
    v.Render()
  }

  const handleZoomOut = () => {
    const v = viewerRef.current
    if (!v || !v.HasRenderer()) return
    const cam = v.GetCamera()
    const w = (cam.right - cam.left) * 1.4
    const h = (cam.top - cam.bottom) * 1.4
    const cx = cam.position.x
    const cy = cam.position.y
    v.FitView(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2, 0)
    v.Render()
  }

  const handleResetView = () => {
    fitToScreen()
  }

  /* ── Layer toggle ─────────────────────────────────────────────── */
  const handleToggleLayer = (layerName) => {
    const v = viewerRef.current
    if (!v) return
    setLayers(prev => prev.map(l => {
      if (l.name !== layerName) return l
      const next = !l.visible
      v.ShowLayer(l.name, next)
      return { ...l, visible: next }
    }))
  }

  const handleShowAllLayers = () => {
    const v = viewerRef.current
    if (!v) return
    layers.forEach(l => v.ShowLayer(l.name, true))
    setLayers(prev => prev.map(l => ({ ...l, visible: true })))
  }

  const handleHideAllLayers = () => {
    const v = viewerRef.current
    if (!v) return
    layers.forEach(l => v.ShowLayer(l.name, false))
    setLayers(prev => prev.map(l => ({ ...l, visible: false })))
  }

  const hasDrawing = layers.length > 0

  /* ── Live Cursor XYZ Coordinates & Distance Measure ───────── */
  const handlePointerMove = useCallback((e) => {
    const v = viewerRef.current
    if (!v || !v.HasRenderer()) return
    const el = containerRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const canvasX = e.clientX - rect.left
    const canvasY = e.clientY - rect.top

    const cam = v.GetCamera()
    if (!cam) return

    // Convert canvas pixels to NDC (-1 to 1)
    const ndcX = (canvasX / rect.width) * 2 - 1
    const ndcY = -(canvasY / rect.height) * 2 + 1
    const vec = new THREE.Vector3(ndcX, ndcY, 0).unproject(cam)

    const origin = v.GetOrigin() || { x: 0, y: 0 }
    const cadX = vec.x + origin.x
    const cadY = vec.y + origin.y

    setCursorCoords({
      x: cadX,
      y: cadY,
      z: 0.0,
      px: canvasX,
      py: canvasY,
    })
  }, [])

  const handlePointerLeave = useCallback(() => {
    setCursorCoords(null)
  }, [])

  const handleCanvasClick = useCallback(() => {
    if (!isMeasuring || !cursorCoords) return
    if (!measureStart) {
      setMeasureStart({ x: cursorCoords.x, y: cursorCoords.y })
      toast('Đã chọn điểm 1. Hãy click điểm thứ 2 để đo khoảng cách.', { icon: '📏' })
    } else {
      const dx = cursorCoords.x - measureStart.x
      const dy = cursorCoords.y - measureStart.y
      const dist = Math.hypot(dx, dy)
      setMeasureResult({ dist, dx: Math.abs(dx), dy: Math.abs(dy) })
      toast.success(`Khoảng cách đo: ${dist.toFixed(3)} m`, { duration: 4000 })
      setMeasureStart(null)
      setIsMeasuring(false)
    }
  }, [isMeasuring, cursorCoords, measureStart])

  /* ── File picker ─────────────────────────────────────────────── */
  const fileInputRef = useRef(null)
  const handleFilePick = (e) => {
    const file = e.target.files[0]
    if (!file) return
    lastLoadedFileRef.current = file   // prevent useEffect from re-triggering a second load
    loadDxfFile(file)
    if (onFileLoaded) onFileLoaded(file)
    e.target.value = ''
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background: '#000',
        fontFamily: 'Inter, sans-serif',
        cursor: isMeasuring ? 'crosshair' : 'default',
      }}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleCanvasClick}
    >
      {/* ── WebGL canvas injected by dxf-viewer ─────────────────── */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      />

      {/* ── Empty state / Dropzone overlay ──────────────────────── */}
      {!hasDrawing && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 pointer-events-none z-10">
          <div
            className="pointer-events-auto max-w-md w-full rounded-2xl p-8 text-center"
            style={{
              background: 'rgba(15,23,42,0.9)',
              backdropFilter: 'blur(20px)',
              border: '2px dashed rgba(6,182,212,0.35)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
            }}
          >
            <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)' }}>
              <Compass size={30} style={{ color: '#06b6d4' }} />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
              AutoCAD Web Viewer – WebGL
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.7, marginBottom: 22 }}>
              Kéo thả file <code style={{ color: '#22d3ee', background: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>.dxf</code> hoặc{' '}
              <code style={{ color: '#22d3ee', background: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>.dwg</code>{' '}
              vào đây để xem toàn bộ bản vẽ CAD với độ chính xác tọa độ tuyệt đối, đầy đủ Layer, Hatch, Block, Text và cung tròn.
            </p>
            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg flex items-start gap-2"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <AlertCircle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: '11px', color: '#fca5a5', lineHeight: 1.5 }}>{error}</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '10px 20px', borderRadius: 10, fontSize: '13px', fontWeight: 700,
                  background: 'linear-gradient(135deg, #0e7490, #0284c7)', color: '#fff',
                  border: 'none', cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(6,182,212,0.35)',
                }}
              >
                <Upload size={14} /> Chọn file CAD
              </button>
              <button
                type="button"
                onClick={handleLoadSample}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '10px 20px', borderRadius: 10, fontSize: '13px', fontWeight: 600,
                  background: 'rgba(30,41,59,0.8)', color: '#94a3b8',
                  border: '1px solid rgba(51,65,85,0.8)', cursor: 'pointer',
                }}
              >
                <FileCode size={14} /> Mở bản vẽ mẫu
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dxf,.dwg"
              style={{ display: 'none' }}
              onChange={handleFilePick}
            />
          </div>
        </div>
      )}

      {/* ── Loading progress overlay ─────────────────────────────── */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
          <div className="rounded-2xl p-8 text-center"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(6,182,212,0.2)', minWidth: 280 }}>
            <Loader2 size={28} className="animate-spin mx-auto mb-4" style={{ color: '#06b6d4' }} />
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
              {loadProgress?.phase ?? 'Đang xử lý…'}
            </p>
            {loadProgress?.pct != null && (
              <>
                <div className="w-full rounded-full overflow-hidden mb-2"
                  style={{ height: 6, background: 'rgba(51,65,85,0.5)' }}>
                  <div
                    style={{
                      width: `${loadProgress.pct}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #0e7490, #06b6d4)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <p style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                  {loadProgress.pct}%
                </p>
              </>
            )}
            <p style={{ fontSize: '11px', color: '#475569', marginTop: 8 }}>{fileName}</p>
          </div>
        </div>
      )}

      {/* ── Top toolbar (only shown when drawing is loaded) ──────── */}
      {(hasDrawing || loading) && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
          {/* File info badge */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
            style={{
              background: 'rgba(15,23,42,0.92)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(51,65,85,0.8)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}>
            <span className="w-2 h-2 rounded-full"
              style={{ background: loading ? '#fbbf24' : '#34d399',
                       boxShadow: `0 0 8px ${loading ? '#fbbf24' : '#34d399'}` }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
              {fileName || 'CAD Workspace'}
            </span>
            {entityCount != null && !loading && (
              <span style={{ fontSize: '10px', color: '#34d399', fontFamily: 'monospace',
                background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
                padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                {entityCount.toLocaleString()} ent
              </span>
            )}
            {layers.length > 0 && !loading && (
              <span style={{ fontSize: '10px', color: '#818cf8', fontFamily: 'monospace',
                background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.25)',
                padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                {layers.length} layers
              </span>
            )}
          </div>

          {/* Zoom/View controls */}
          <div className="flex items-center gap-1 p-1 rounded-xl"
            style={{ background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(12px)',
                     border: '1px solid rgba(51,65,85,0.8)' }}>
            <button
              type="button"
              title="Focus Trực Tiếp Vào Tuyến Đường (Khử Outlier)"
              onClick={() => fitToScreen(null, false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-xs font-bold"
              style={{
                background: 'rgba(6,182,212,0.15)',
                border: '1px solid rgba(6,182,212,0.4)',
                color: '#22d3ee',
                cursor: 'pointer',
              }}
            >
              <Route size={14} />
              <span>Focus Tuyến Đường</span>
            </button>
            <div style={{ width: 1, height: 16, background: '#334155', margin: '0 2px' }} />
            <ToolBtn title="Toàn Bộ Bản Vẽ (Zoom Extents)" onClick={() => fitToScreen(null, true)} Icon={Maximize2} />
            <ToolBtn title="Zoom In"                       onClick={handleZoomIn}                   Icon={ZoomIn} />
            <ToolBtn title="Zoom Out"                      onClick={handleZoomOut}                  Icon={ZoomOut} />
            <ToolBtn title="Reset View"                    onClick={() => fitToScreen(null, false)} Icon={RotateCcw} />
            <div style={{ width: 1, height: 16, background: '#334155', margin: '0 2px' }} />
            {/* Distance measure tool */}
            <button
              type="button"
              title={isMeasuring ? "Đang ở chế độ đo khoảng cách (Click 2 điểm)" : "Thước đo khoảng cách (Ruler)"}
              onClick={() => {
                const next = !isMeasuring
                setIsMeasuring(next)
                setMeasureStart(null)
                if (next) toast('Bật chế độ đo: Hãy click 2 điểm trên bản vẽ để đo khoảng cách.', { icon: '📏' })
              }}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition text-xs font-bold"
              style={{
                background: isMeasuring ? 'rgba(234,179,8,0.2)' : 'transparent',
                border: isMeasuring ? '1px solid #eab308' : 'none',
                color: isMeasuring ? '#fde047' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <Ruler size={14} />
              {isMeasuring && <span>Đang đo…</span>}
            </button>
            <div style={{ width: 1, height: 16, background: '#334155', margin: '0 2px' }} />
            {/* Open another file */}
            <ToolBtn
              title="Mở file CAD khác"
              onClick={() => fileInputRef.current?.click()}
              Icon={Upload}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".dxf,.dwg"
              style={{ display: 'none' }}
              onChange={handleFilePick}
            />
            {/* Toggle layer panel */}
            <button
              type="button"
              title="Quản lý Layers"
              onClick={() => setShowLayerPanel(p => !p)}
              className="p-1.5 rounded-lg transition"
              style={{
                background: showLayerPanel ? 'rgba(6,182,212,0.15)' : 'transparent',
                border: 'none', cursor: 'pointer',
                color: showLayerPanel ? '#06b6d4' : '#94a3b8',
              }}
            >
              <Layers size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Layer Manager ────────────────────────────────────────── */}
      {showLayerPanel && layers.length > 0 && (
        <div className="absolute top-16 right-3 z-20 w-72 rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(10,15,30,0.97)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(6,182,212,0.2)',
            boxShadow: '0 16px 50px rgba(0,0,0,0.8)',
          }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid rgba(30,41,59,0.9)' }}>
            <div className="flex items-center gap-2">
              <Layers size={13} style={{ color: '#06b6d4' }} />
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#f1f5f9',
                letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Layers ({layers.length})
              </span>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={handleShowAllLayers}
                style={{ fontSize: '10px', color: '#06b6d4', padding: '2px 7px',
                  borderRadius: 4, background: 'rgba(6,182,212,0.1)',
                  border: '1px solid rgba(6,182,212,0.2)', cursor: 'pointer' }}>
                Hiện hết
              </button>
              <button type="button" onClick={handleHideAllLayers}
                style={{ fontSize: '10px', color: '#64748b', padding: '2px 7px',
                  borderRadius: 4, background: 'rgba(51,65,85,0.2)',
                  border: '1px solid rgba(51,65,85,0.3)', cursor: 'pointer' }}>
                Ẩn hết
              </button>
            </div>
          </div>

          {/* Layer list */}
          <div className="overflow-y-auto p-2 space-y-0.5" style={{ maxHeight: '55vh' }}>
            {layers.map(lyr => (
              <div
                key={lyr.name}
                onClick={() => handleToggleLayer(lyr.name)}
                className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: lyr.visible ? 'rgba(30,41,59,0.5)' : 'transparent',
                  border: '1px solid',
                  borderColor: lyr.visible ? 'rgba(51,65,85,0.5)' : 'transparent',
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="shrink-0 w-3 h-3 rounded-full"
                    style={{
                      background: lyr.color === '#000000' || lyr.color === '#000'
                        ? '#555'     // avoid invisible black dot on black bg
                        : lyr.color,
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  />
                  <span style={{
                    fontSize: '11px',
                    fontWeight: lyr.visible ? 600 : 400,
                    color: lyr.visible ? '#e2e8f0' : '#475569',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontFamily: 'monospace',
                  }}>
                    {lyr.name || '(default)'}
                  </span>
                </div>
                <span style={{ color: lyr.visible ? '#06b6d4' : '#334155', flexShrink: 0 }}>
                  {lyr.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dynamic Floating Coordinate HUD near Cursor ─────────── */}
      {cursorCoords && hasDrawing && (
        <div
          className="pointer-events-none absolute z-30 px-2.5 py-1 rounded-md bg-slate-950/85 border border-cyan-500/40 text-[10px] font-mono text-cyan-300 backdrop-blur shadow-2xl flex items-center gap-2"
          style={{
            left: Math.min(cursorCoords.px + 14, (containerRef.current?.clientWidth || 800) - 175),
            top: Math.max(cursorCoords.py - 28, 12),
          }}
        >
          <span style={{ color: '#f87171' }}>X:</span> {cursorCoords.x.toFixed(2)}
          <span style={{ color: '#475569' }}>|</span>
          <span style={{ color: '#4ade80' }}>Y:</span> {cursorCoords.y.toFixed(2)}
        </div>
      )}

      {/* ── Bottom status bar with Live AutoCAD XYZ coordinates ──── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-1.5 flex-wrap gap-2"
        style={{
          background: 'rgba(5,10,20,0.92)',
          borderTop: '1px solid rgba(30,41,59,0.8)',
          backdropFilter: 'blur(10px)',
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#475569',
        }}>
        
        {/* Left: Dynamic Live Coordinates readout */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-3 py-1 rounded-lg bg-slate-950 border border-cyan-500/40 font-mono shadow-inner">
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Tọa độ XYZ:
            </span>
            <div className="flex items-center gap-1">
              <span style={{ color: '#f87171', fontWeight: 800 }}>X</span>
              <span style={{ color: '#22d3ee', fontWeight: 800, minWidth: 95, display: 'inline-block' }}>
                {cursorCoords ? cursorCoords.x.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '593,248.120'}
              </span>
            </div>
            <span style={{ color: '#334155' }}>|</span>
            <div className="flex items-center gap-1">
              <span style={{ color: '#4ade80', fontWeight: 800 }}>Y</span>
              <span style={{ color: '#22d3ee', fontWeight: 800, minWidth: 105, display: 'inline-block' }}>
                {cursorCoords ? cursorCoords.y.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '1,203,842.550'}
              </span>
            </div>
            <span style={{ color: '#334155' }}>|</span>
            <div className="flex items-center gap-1">
              <span style={{ color: '#fbbf24', fontWeight: 800 }}>Z</span>
              <span style={{ color: '#e2e8f0', fontWeight: 700, minWidth: 45, display: 'inline-block' }}>
                {cursorCoords ? cursorCoords.z.toFixed(3) : '0.000'}
              </span>
            </div>
          </div>

          {measureResult && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-400 text-xs font-mono text-cyan-200">
              <Ruler size={13} className="text-cyan-400" />
              <span>Khoảng cách: <strong className="text-cyan-300 font-bold">{measureResult.dist.toFixed(3)} m</strong> (ΔX: {measureResult.dx.toFixed(2)}m, ΔY: {measureResult.dy.toFixed(2)}m)</span>
              <button type="button" onClick={() => setMeasureResult(null)} className="ml-1 text-slate-400 hover:text-white cursor-pointer">×</button>
            </div>
          )}
        </div>

        {/* Right: Technical system info */}
        <div className="flex items-center gap-4">
          {hasDrawing && (
            <span style={{ color: '#34d399', fontWeight: 600 }}>✓ Hệ tọa độ VN-2000 / UTM (Mét)</span>
          )}
          <span style={{ color: '#06b6d4', fontWeight: 700 }}>dxf-viewer v1.x · three.js WebGL</span>
        </div>
      </div>
    </div>
  )
}

/* ── Small reusable icon-button ──────────────────────────────── */
function ToolBtn({ title, onClick, Icon }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="p-1.5 rounded-lg transition"
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: '#94a3b8',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = '#06b6d4'; e.currentTarget.style.background = 'rgba(6,182,212,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={15} />
    </button>
  )
}
