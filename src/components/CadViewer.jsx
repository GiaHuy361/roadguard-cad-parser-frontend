import { useState, useEffect, useRef, useCallback } from 'react'
import { DxfViewer } from 'dxf-viewer'
import * as THREE from 'three'
import toast from 'react-hot-toast'
import {
  ZoomIn, ZoomOut, Maximize2, RotateCcw, Layers, Eye, EyeOff,
  Compass, FileCode, Upload, Loader2, AlertCircle, Route, Ruler,
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
    const primaryRoadPts = []
    const secondaryRoadPts = []
    const primaryRoadLayers = ['ENTPLINETUYEN', 'MEPNHUA', 'BO_VIA', 'TIM_TUYEN']
    const secondaryRoadLayers = ['TIM', 'DUONG', 'VIA', 'LE', 'RANH', 'ROAD']

    for (let i = 0; i < dxf.entities.length; i++) {
      const e = dxf.entities[i]
      const layerUpper = (e.layer || '').toUpperCase()
      const isPrimaryRoad = primaryRoadLayers.some((l) => layerUpper.includes(l))
      const isSecondaryRoad = secondaryRoadLayers.some((l) => layerUpper.includes(l))
      const addPt = (p) => {
        if (p && !isNaN(p.x) && !isNaN(p.y)) {
          pts.push({ x: p.x, y: p.y })
          if (isPrimaryRoad) primaryRoadPts.push({ x: p.x, y: p.y })
          if (isPrimaryRoad || isSecondaryRoad) secondaryRoadPts.push({ x: p.x, y: p.y })
        }
      }
      if (e.vertices) {
        for (let vt of e.vertices) addPt(vt)
      }
      if (e.start) addPt(e.start)
      if (e.end) addPt(e.end)
      if (e.position) addPt(e.position)
      if (e.center) addPt(e.center)
    }

    const roadPts = primaryRoadPts.length >= 10 ? primaryRoadPts : secondaryRoadPts
    const targetPts = roadPts.length >= 10 ? roadPts : pts
    if (targetPts.length === 0) return null

    const xs = targetPts.map((p) => p.x).sort((a, b) => a - b)
    const ys = targetPts.map((p) => p.y).sort((a, b) => a - b)
    const n = targetPts.length

    const q15_x = xs[Math.floor(n * 0.15)]
    const q85_x = xs[Math.min(n - 1, Math.floor(n * 0.85))]
    const q15_y = ys[Math.floor(n * 0.15)]
    const q85_y = ys[Math.min(n - 1, Math.floor(n * 0.85))]

    const iqrX = Math.max(q85_x - q15_x, 50)
    const iqrY = Math.max(q85_y - q15_y, 50)

    const lowX = q15_x - 1.25 * iqrX
    const highX = q85_x + 1.25 * iqrX
    const lowY = q15_y - 1.25 * iqrY
    const highY = q85_y + 1.25 * iqrY

    const corePts = targetPts.filter(
      (p) => p.x >= lowX && p.x <= highX && p.y >= lowY && p.y <= highY
    )
    const finalPts = corePts.length >= 4 ? corePts : targetPts

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of finalPts) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }

    if (maxX <= minX || maxY <= minY) return null

    return {
      minX,
      maxX,
      minY,
      maxY,
      isRoad: roadPts.length >= 10,
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

    const ro = new ResizeObserver(() => {
      if (viewerRef.current?.HasRenderer() && el.clientWidth > 0 && el.clientHeight > 0) {
        viewerRef.current.SetSize(el.clientWidth, el.clientHeight)
        viewerRef.current.Render()
      }
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
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
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 22px', borderRadius: 10, fontSize: '13px', fontWeight: 700,
                  background: '#F06421', color: '#fff',
                  border: '1px solid #FF7635', cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(240,100,33,0.35)',
                }}
              >
                <Upload size={15} /> Chọn bản vẽ CAD (.DXF)
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
          style={{ background: 'rgba(11,18,32,0.82)', backdropFilter: 'blur(6px)' }}>
          <div className="rounded-2xl p-8 text-center"
            style={{ background: '#111D2E', border: '1px solid #27384E', minWidth: 280 }}>
            <Loader2 size={28} className="animate-spin mx-auto mb-4" style={{ color: '#22B7C9' }} />
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#E8EEF6', marginBottom: 8 }}>
              {loadProgress?.phase ?? 'Đang xử lý bản vẽ CAD…'}
            </p>
            {loadProgress?.pct != null && (
              <>
                <div className="w-full rounded-full overflow-hidden mb-2"
                  style={{ height: 6, background: '#0B1220' }}>
                  <div
                    style={{
                      width: `${loadProgress.pct}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #F06421, #22B7C9)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <p style={{ fontSize: '11px', color: '#A9B9CE', fontFamily: 'monospace' }}>
                  {loadProgress.pct}%
                </p>
              </>
            )}
            <p style={{ fontSize: '11.5px', color: '#7E92AA', marginTop: 8 }}>{fileName}</p>
          </div>
        </div>
      )}

      {/* ── Top toolbar (only shown when drawing is loaded) ──────── */}
      {(hasDrawing || loading) && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
          {/* File info badge */}
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl"
            style={{
              background: 'rgba(17,29,46,0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid #27384E',
              boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}>
            <span className="w-2 h-2 rounded-full"
              style={{ background: loading ? '#F59E0B' : '#39B58A',
                       boxShadow: `0 0 8px ${loading ? '#F59E0B' : '#39B58A'}` }} />
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#E8EEF6' }}>
              {fileName || 'CAD Workspace'}
            </span>
            {entityCount != null && !loading && (
              <span style={{ fontSize: '11px', color: '#39B58A', fontFamily: 'monospace',
                background: 'rgba(57,181,138,0.12)', border: '1px solid rgba(57,181,138,0.3)',
                padding: '1px 8px', borderRadius: 8, fontWeight: 700 }}>
                {entityCount.toLocaleString()} đối tượng
              </span>
            )}
            {layers.length > 0 && !loading && (
              <span style={{ fontSize: '11px', color: '#22B7C9', fontFamily: 'monospace',
                background: 'rgba(34,183,201,0.12)', border: '1px solid rgba(34,183,201,0.3)',
                padding: '1px 8px', borderRadius: 8, fontWeight: 700 }}>
                {layers.length} layers
              </span>
            )}
          </div>

          {/* Zoom/View controls */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl"
            style={{ background: 'rgba(17,29,46,0.95)', backdropFilter: 'blur(12px)',
                     border: '1px solid #27384E' }}>
            <button
              type="button"
              title="Khớp Tuyến Đường (Loại bỏ khung tên / điểm ngoại lai xa tuyến)"
              onClick={() => fitToScreen(null, false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-[12px] font-bold"
              style={{
                background: '#F06421',
                border: '1px solid #FF7635',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              <Route size={14} />
              <span>Khớp Tuyến Đường</span>
            </button>
            <button
              type="button"
              title="Toàn Bộ Bản Vẽ (Hiển thị toàn bộ phạm vi Extents của file DXF)"
              onClick={() => fitToScreen(null, true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-[12px] font-semibold"
              style={{
                background: '#17263C',
                border: '1px solid #27384E',
                color: '#E8EEF6',
                cursor: 'pointer',
              }}
            >
              <Maximize2 size={14} />
              <span>Toàn Bộ Bản Vẽ</span>
            </button>
            <div style={{ width: 1, height: 16, background: '#27384E', margin: '0 2px' }} />
            <ToolBtn title="Phóng to (Zoom In)"            onClick={handleZoomIn}                   Icon={ZoomIn} />
            <ToolBtn title="Thu nhỏ (Zoom Out)"            onClick={handleZoomOut}                  Icon={ZoomOut} />
            <ToolBtn title="Đặt lại góc nhìn (Reset View)" onClick={() => fitToScreen(null, false)} Icon={RotateCcw} />
            <div style={{ width: 1, height: 16, background: '#27384E', margin: '0 2px' }} />
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-[12px] font-semibold"
              style={{
                background: isMeasuring ? 'rgba(245,158,11,0.2)' : 'transparent',
                border: isMeasuring ? '1px solid #F59E0B' : 'none',
                color: isMeasuring ? '#F59E0B' : '#A9B9CE',
                cursor: 'pointer',
              }}
            >
              <Ruler size={14} />
              <span>{isMeasuring ? 'Đang đo (Chọn 2 điểm)…' : 'Thước đo'}</span>
            </button>
            <div style={{ width: 1, height: 16, background: '#27384E', margin: '0 2px' }} />
            {/* Open another file */}
            <ToolBtn
              title="Mở bản vẽ CAD (.dxf) khác"
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
              title="Ẩn/Hiện các Layer trong khung nhìn CAD 2D"
              onClick={() => setShowLayerPanel(p => !p)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-[12px] font-semibold"
              style={{
                background: showLayerPanel ? 'rgba(34,183,201,0.18)' : 'transparent',
                border: showLayerPanel ? '1px solid #22B7C9' : 'none',
                cursor: 'pointer',
                color: showLayerPanel ? '#22B7C9' : '#A9B9CE',
              }}
            >
              <Layers size={14} />
              <span>Layers CAD</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Layer Manager ────────────────────────────────────────── */}
      {showLayerPanel && layers.length > 0 && (
        <div className="absolute top-16 right-3 z-20 w-72 rounded-xl overflow-hidden"
          style={{
            background: '#111D2E',
            border: '1px solid #27384E',
            boxShadow: '0 16px 50px rgba(0,0,0,0.75)',
          }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid #27384E' }}>
            <div className="flex items-center gap-2">
              <Layers size={14} style={{ color: '#22B7C9' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#E8EEF6',
                letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Layers Bản Vẽ ({layers.length})
              </span>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={handleShowAllLayers}
                style={{ fontSize: '11px', color: '#22B7C9', padding: '2px 8px',
                  borderRadius: 6, background: '#17263C',
                  border: '1px solid #27384E', cursor: 'pointer' }}>
                Hiện hết
              </button>
              <button type="button" onClick={handleHideAllLayers}
                style={{ fontSize: '11px', color: '#A9B9CE', padding: '2px 8px',
                  borderRadius: 6, background: '#17263C',
                  border: '1px solid #27384E', cursor: 'pointer' }}>
                Ẩn hết
              </button>
            </div>
          </div>

          {/* Layer list */}
          <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: '55vh' }}>
            {layers.map(lyr => (
              <div
                key={lyr.name}
                onClick={() => handleToggleLayer(lyr.name)}
                className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: lyr.visible ? '#17263C' : 'transparent',
                  border: '1px solid',
                  borderColor: lyr.visible ? '#27384E' : 'transparent',
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="shrink-0 w-3 h-3 rounded-full"
                    style={{
                      background: lyr.color === '#000000' || lyr.color === '#000'
                        ? '#7E92AA'
                        : lyr.color,
                      border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  />
                  <span style={{
                    fontSize: '12px',
                    fontWeight: lyr.visible ? 600 : 400,
                    color: lyr.visible ? '#E8EEF6' : '#7E92AA',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontFamily: 'monospace',
                  }}>
                    {lyr.name || '(default)'}
                  </span>
                </div>
                <span style={{ color: lyr.visible ? '#22B7C9' : '#7E92AA', flexShrink: 0 }}>
                  {lyr.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dynamic Floating Coordinate HUD near Cursor ─────────── */}
      {cursorCoords && hasDrawing && (
        <div
          className="pointer-events-none absolute z-30 px-2.5 py-1 rounded-md bg-[#111D2E]/95 border border-[#22B7C9]/50 text-[11px] font-mono tabular-nums text-[#E8EEF6] backdrop-blur shadow-2xl flex items-center gap-2"
          style={{
            left: `min(${cursorCoords.px + 14}px, calc(100% - 190px))`,
            top: Math.max(cursorCoords.py - 28, 12),
          }}
        >
          <span style={{ color: '#F06421', fontWeight: 700 }}>E/X:</span> {cursorCoords.x.toFixed(2)}
          <span style={{ color: '#27384E' }}>|</span>
          <span style={{ color: '#39B58A', fontWeight: 700 }}>N/Y:</span> {cursorCoords.y.toFixed(2)}
        </div>
      )}

      {/* ── Bottom status bar with Live AutoCAD XYZ coordinates ──── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-1.5 flex-wrap gap-2"
        style={{
          background: 'rgba(11,18,32,0.95)',
          borderTop: '1px solid #27384E',
          backdropFilter: 'blur(10px)',
          fontFamily: 'monospace',
          fontSize: '11.5px',
          color: '#A9B9CE',
        }}>
        
        {/* Left: Dynamic Live Coordinates readout */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-3 py-1 rounded-lg bg-[#111D2E] border border-[#27384E] font-mono tabular-nums">
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#22B7C9' }}>
              Tọa độ con trỏ CAD:
            </span>
            {cursorCoords ? (
              <>
                <div className="flex items-center gap-1">
                  <span style={{ color: '#F06421', fontWeight: 700 }}>X(CAD)</span>
                  <span style={{ color: '#E8EEF6', fontWeight: 700, minWidth: 95, display: 'inline-block' }}>
                    {cursorCoords.x.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </span>
                </div>
                <span style={{ color: '#27384E' }}>|</span>
                <div className="flex items-center gap-1">
                  <span style={{ color: '#39B58A', fontWeight: 700 }}>Y(CAD)</span>
                  <span style={{ color: '#E8EEF6', fontWeight: 700, minWidth: 105, display: 'inline-block' }}>
                    {cursorCoords.y.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </span>
                </div>
                <span style={{ color: '#27384E' }}>|</span>
                <div className="flex items-center gap-1">
                  <span style={{ color: '#F59E0B', fontWeight: 700 }}>Z</span>
                  <span style={{ color: '#E8EEF6', fontWeight: 700 }}>
                    {cursorCoords.z.toFixed(3)}
                  </span>
                </div>
              </>
            ) : (
              <span style={{ color: '#7E92AA', fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                Di chuột trên bản vẽ để xem tọa độ thực
              </span>
            )}
          </div>

          {measureResult && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#17263C] border border-[#22B7C9] text-xs font-mono tabular-nums text-[#E8EEF6]">
              <Ruler size={13} className="text-[#22B7C9]" />
              <span>Khoảng cách: <strong className="text-[#22B7C9] font-bold">{measureResult.dist.toFixed(3)} m</strong> (ΔX: {measureResult.dx.toFixed(2)}m, ΔY: {measureResult.dy.toFixed(2)}m)</span>
              <button type="button" onClick={() => setMeasureResult(null)} className="ml-1 text-[#A9B9CE] hover:text-white cursor-pointer">×</button>
            </div>
          )}
        </div>

        {/* Right: Technical system info */}
        <div className="flex items-center gap-4">
          {hasDrawing && (
            <span style={{ color: '#39B58A', fontWeight: 600 }}>✓ Tọa độ phẳng gốc bản vẽ CAD (Đơn vị: Mét)</span>
          )}
          <span style={{ color: '#7E92AA', fontWeight: 600 }}>WebGL CAD Engine</span>
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
