import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import DxfParser from 'dxf-parser'
import toast from 'react-hot-toast'
import {
  ZoomIn, ZoomOut, Maximize2, RotateCcw, Layers, Eye, EyeOff,
  Crosshair, Grid, Download, FileCode, Info, MousePointer,
  ChevronRight, Compass, Move, FileText, CheckCircle2
} from 'lucide-react'

/* ─── Standard AutoCAD ACI Color Palette (1-255) ──────────────── */
const ACI_COLORS = {
  1: '#ff0000', // Red
  2: '#ffff00', // Yellow
  3: '#00ff00', // Green
  4: '#00ffff', // Cyan
  5: '#0000ff', // Blue
  6: '#ff00ff', // Magenta
  7: '#ffffff', // White
  8: '#808080', // Dark Gray
  9: '#c0c0c0', // Light Gray
  10: '#ff0000', 11: '#ff7f7f', 12: '#cc0000', 13: '#cc6666',
  20: '#ff3f00', 30: '#ff7f00', 40: '#ffbf00', 50: '#ffff00',
  60: '#bfff00', 70: '#7fff00', 80: '#3fff00', 90: '#00ff00',
  100: '#00ff3f', 110: '#00ff7f', 120: '#00ffbf', 130: '#00ffff',
  140: '#00bfff', 150: '#007fff', 160: '#003fff', 170: '#0000ff',
  180: '#3f00ff', 190: '#7f00ff', 200: '#bf00ff', 210: '#ff00ff',
  220: '#ff00bf', 230: '#ff007f', 240: '#ff003f', 250: '#333333',
  251: '#555555', 252: '#777777', 253: '#999999', 254: '#bbbbbb', 255: '#ffffff'
}

function resolveEntityColor(entity, layerTable, fallback = '#38bdf8') {
  if (entity.color != null && entity.color !== 0 && entity.color !== 256) {
    if (entity.color in ACI_COLORS) return ACI_COLORS[entity.color]
    if (typeof entity.color === 'number') {
      const hex = entity.color.toString(16).padStart(6, '0')
      return `#${hex}`
    }
  }
  const layer = entity.layer ? layerTable?.[entity.layer] : null
  if (layer?.color != null) {
    const c = Math.abs(layer.color)
    if (c in ACI_COLORS) return ACI_COLORS[c]
  }
  return fallback
}

/* ─── Bulge interpolation for Polylines ────────────────────────── */
function interpolateBulge(p1, p2, bulge, segments = 12) {
  if (!bulge || Math.abs(bulge) < 1e-6) return [p1, p2]
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-9) return [p1]

  const sagitta = (bulge * chord) / 2
  const radius = ((chord / 2) ** 2 + sagitta ** 2) / (2 * Math.abs(sagitta))
  const theta = 4 * Math.atan(bulge)
  const mx = (p1.x + p2.x) / 2
  const my = (p1.y + p2.y) / 2
  const d = Math.sqrt(Math.max(0, radius ** 2 - (chord / 2) ** 2))

  const sign = bulge > 0 ? 1 : -1
  const nx = (-dy / chord) * sign
  const ny = (dx / chord) * sign

  let cx, cy
  if (Math.abs(theta) <= Math.PI) {
    cx = mx - nx * d
    cy = my - ny * d
  } else {
    cx = mx + nx * d
    cy = my + ny * d
  }

  const startAngle = Math.atan2(p1.y - cy, p1.x - cx)
  let angleDiff = theta

  const points = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const a = startAngle + angleDiff * t
    points.push({
      x: cx + radius * Math.cos(a),
      y: cy + radius * Math.sin(a),
    })
  }
  return points
}

export default function CadViewer({ rawDxfFile, onFileLoaded }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  /* CAD State */
  const [dxfData, setDxfData] = useState(null)
  const [layerTable, setLayerTable] = useState({})
  const [activeLayers, setActiveLayers] = useState({})
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [dxfTextContent, setDxfTextContent] = useState(null)

  /* View & Camera Transform */
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, zoom: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, viewX: 0, viewY: 0 })

  /* UI Overlays */
  const [cursorCoord, setCursorCoord] = useState({ x: 0, y: 0 })
  const [showGrid, setShowGrid] = useState(true)
  const [showCrosshair, setShowCrosshair] = useState(true)
  const [showLayersDrawer, setShowLayersDrawer] = useState(false)
  const [bounds, setBounds] = useState(null)

  /* ─── Parse DXF String ────────────────────────────────────────── */
  const parseDxfText = useCallback((text, name = 'drawing.dxf') => {
    setLoading(true)
    const tid = toast.loading(`Đang đọc bản vẽ CAD (${name})…`)
    try {
      const parser = new DxfParser()
      const parsed = parser.parseSync(text)
      setDxfData(parsed)
      setFileName(name)
      setDxfTextContent(text)

      // Build layer table
      const lTable = {}
      const aLayers = {}
      if (parsed.tables?.layer?.layers) {
        Object.entries(parsed.tables.layer.layers).forEach(([k, v]) => {
          lTable[k] = v
          aLayers[k] = true
        })
      }

      // Count entities per layer
      const layerCounts = {}
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      const updateBBox = (x, y) => {
        if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }

      if (parsed.entities) {
        parsed.entities.forEach((ent) => {
          const lName = ent.layer || '0'
          layerCounts[lName] = (layerCounts[lName] || 0) + 1
          aLayers[lName] = true

          if (ent.type === 'LINE' && ent.vertices) {
            updateBBox(ent.vertices[0]?.x, ent.vertices[0]?.y)
            updateBBox(ent.vertices[1]?.x, ent.vertices[1]?.y)
          } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices) {
            ent.vertices.forEach(v => updateBBox(v.x, v.y))
          } else if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
            updateBBox(ent.center.x - ent.radius, ent.center.y - ent.radius)
            updateBBox(ent.center.x + ent.radius, ent.center.y + ent.radius)
          } else if (ent.type === 'ARC' && ent.center && ent.radius) {
            updateBBox(ent.center.x - ent.radius, ent.center.y - ent.radius)
            updateBBox(ent.center.x + ent.radius, ent.center.y + ent.radius)
          } else if (ent.position) {
            updateBBox(ent.position.x, ent.position.y)
          }
        })
      }

      setLayerTable(lTable)
      setActiveLayers(aLayers)

      if (minX !== Infinity && maxX !== -Infinity) {
        const b = {
          minX, minY, maxX, maxY,
          width: maxX - minX,
          height: maxY - minY,
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
        }
        setBounds(b)

        // Fit to viewport
        const canvas = canvasRef.current
        if (canvas) {
          const w = canvas.clientWidth || 800
          const h = canvas.clientHeight || 600
          const pad = 60
          const zX = (w - pad * 2) / (b.width || 1)
          const zY = (h - pad * 2) / (b.height || 1)
          const initialZoom = Math.min(zX, zY)
          setViewTransform({
            x: b.centerX,
            y: b.centerY,
            zoom: isFinite(initialZoom) && initialZoom > 0 ? initialZoom : 1,
          })
        }
      }

      toast.success(`Đã nạp ${parsed.entities?.length || 0} đối tượng CAD!`, { id: tid })
    } catch (err) {
      console.error('CAD Parser Error:', err)
      toast.error(`Lỗi phân tích file CAD: ${err.message || 'Cú pháp không hợp lệ'}`, { id: tid })
    } finally {
      setLoading(false)
    }
  }, [])

  /* ─── Load DXF File from File Object ─────────────────────────── */
  const loadFile = useCallback((file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      parseDxfText(text, file.name)
    }
    reader.onerror = () => toast.error('Không thể đọc file từ thiết bị!')
    reader.readAsText(file)
  }, [parseDxfText])

  /* Initial trigger when rawDxfFile changes */
  useEffect(() => {
    if (rawDxfFile) {
      loadFile(rawDxfFile)
    }
  }, [rawDxfFile, loadFile])

  /* ─── Zoom Extents (Fit All) ─────────────────────────────────── */
  const handleZoomExtents = useCallback(() => {
    if (!bounds || !canvasRef.current) return
    const canvas = canvasRef.current
    const w = canvas.clientWidth || 800
    const h = canvas.clientHeight || 600
    const pad = 60
    const zX = (w - pad * 2) / (bounds.width || 1)
    const zY = (h - pad * 2) / (bounds.height || 1)
    const fitZoom = Math.min(zX, zY)
    setViewTransform({
      x: bounds.centerX,
      y: bounds.centerY,
      zoom: isFinite(fitZoom) && fitZoom > 0 ? fitZoom : 1,
    })
  }, [bounds])

  /* ─── Zoom Controls ──────────────────────────────────────────── */
  const handleZoomIn = () => setViewTransform(v => ({ ...v, zoom: v.zoom * 1.3 }))
  const handleZoomOut = () => setViewTransform(v => ({ ...v, zoom: v.zoom / 1.3 }))
  const handleResetView = () => {
    if (bounds) handleZoomExtents()
    else setViewTransform({ x: 0, y: 0, zoom: 1 })
  }

  /* ─── Drag & Drop CAD onto Viewer ────────────────────────────── */
  const handleDrop = (e) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped && (dropped.name.toLowerCase().endsWith('.dxf') || dropped.name.toLowerCase().endsWith('.dwg'))) {
      loadFile(dropped)
      if (onFileLoaded) onFileLoaded(dropped)
    } else {
      toast.error('Vui lòng thả file bản vẽ AutoCAD (.dxf / .dwg)!')
    }
  }

  /* ─── Canvas Resize Listener ─────────────────────────────────── */
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (canvas && containerRef.current) {
        const dpr = window.devicePixelRatio || 1
        canvas.width = containerRef.current.clientWidth * dpr
        canvas.height = containerRef.current.clientHeight * dpr
      }
    }
    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  /* ─── Main Rendering Loop (HTML5 Canvas 2D) ───────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    ctx.save()
    ctx.scale(dpr, dpr)

    // 1. Clear background (AutoCAD Dark Charcoal)
    ctx.fillStyle = '#161922'
    ctx.fillRect(0, 0, w, h)

    const { x: vX, y: vY, zoom } = viewTransform

    // Helper functions for coordinate mapping
    const toScreenX = (wx) => (wx - vX) * zoom + w / 2
    const toScreenY = (wy) => h / 2 - (wy - vY) * zoom
    const toWorldX = (sx) => vX + (sx - w / 2) / zoom
    const toWorldY = (sy) => vY + (h / 2 - sy) / zoom

    // 2. Draw Adaptive CAD Grid
    if (showGrid && zoom > 0) {
      const targetScreenStep = 60
      const rawWorldStep = targetScreenStep / zoom
      const exponent = Math.floor(Math.log10(rawWorldStep))
      const base = 10 ** exponent
      let gridStep = base
      if (rawWorldStep / base >= 5) gridStep = base * 5
      else if (rawWorldStep / base >= 2) gridStep = base * 2

      const minWx = toWorldX(0)
      const maxWx = toWorldX(w)
      const minWy = toWorldY(h)
      const maxWy = toWorldY(0)

      const firstX = Math.floor(minWx / gridStep) * gridStep
      const lastX = Math.ceil(maxWx / gridStep) * gridStep
      const firstY = Math.floor(minWy / gridStep) * gridStep
      const lastY = Math.ceil(maxWy / gridStep) * gridStep

      ctx.lineWidth = 1
      for (let gx = firstX; gx <= lastX; gx += gridStep) {
        const sx = Math.round(toScreenX(gx)) + 0.5
        const isMajor = Math.round(gx / (gridStep * 5)) * (gridStep * 5) === Math.round(gx)
        ctx.strokeStyle = isMajor ? 'rgba(71,85,105,0.35)' : 'rgba(51,65,85,0.18)'
        ctx.beginPath()
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx, h)
        ctx.stroke()
      }

      for (let gy = firstY; gy <= lastY; gy += gridStep) {
        const sy = Math.round(toScreenY(gy)) + 0.5
        const isMajor = Math.round(gy / (gridStep * 5)) * (gridStep * 5) === Math.round(gy)
        ctx.strokeStyle = isMajor ? 'rgba(71,85,105,0.35)' : 'rgba(51,65,85,0.18)'
        ctx.beginPath()
        ctx.moveTo(0, sy)
        ctx.lineTo(w, sy)
        ctx.stroke()
      }

      // Draw (0,0) Origin Axes
      const originSx = toScreenX(0)
      const originSy = toScreenY(0)
      if (originSx >= 0 && originSx <= w) {
        ctx.strokeStyle = 'rgba(34,197,94,0.6)' // Green Y-axis
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(originSx, 0)
        ctx.lineTo(originSx, h)
        ctx.stroke()
      }
      if (originSy >= 0 && originSy <= h) {
        ctx.strokeStyle = 'rgba(239,68,68,0.6)' // Red X-axis
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, originSy)
        ctx.lineTo(w, originSy)
        ctx.stroke()
      }
    }

    // 3. Draw DXF Entities
    if (dxfData?.entities) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (const ent of dxfData.entities) {
        const lyr = ent.layer || '0'
        if (activeLayers[lyr] === false) continue

        const color = resolveEntityColor(ent, layerTable)
        ctx.strokeStyle = color
        ctx.fillStyle = color
        ctx.lineWidth = Math.max(1, (ent.lineWeight || 1) * 0.8)

        // ── LINE ──
        if (ent.type === 'LINE' && ent.vertices && ent.vertices.length >= 2) {
          const p1 = ent.vertices[0]
          const p2 = ent.vertices[1]
          ctx.beginPath()
          ctx.moveTo(toScreenX(p1.x), toScreenY(p1.y))
          ctx.lineTo(toScreenX(p2.x), toScreenY(p2.y))
          ctx.stroke()
        }

        // ── LWPOLYLINE / POLYLINE ──
        else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices && ent.vertices.length > 0) {
          const verts = ent.vertices
          ctx.beginPath()

          let hasBulge = verts.some(v => v.bulge && Math.abs(v.bulge) > 1e-6)
          if (!hasBulge) {
            ctx.moveTo(toScreenX(verts[0].x), toScreenY(verts[0].y))
            for (let i = 1; i < verts.length; i++) {
              ctx.lineTo(toScreenX(verts[i].x), toScreenY(verts[i].y))
            }
          } else {
            // Render curved polyline segments
            let started = false
            for (let i = 0; i < verts.length - 1; i++) {
              const segPoints = interpolateBulge(verts[i], verts[i + 1], verts[i].bulge || 0)
              segPoints.forEach((p, pIdx) => {
                if (!started) {
                  ctx.moveTo(toScreenX(p.x), toScreenY(p.y))
                  started = true
                } else if (pIdx > 0) {
                  ctx.lineTo(toScreenX(p.x), toScreenY(p.y))
                }
              })
            }
          }

          if (ent.shape || ent.is3dPolygonMeshClosed) {
            ctx.closePath()
          }
          ctx.stroke()
        }

        // ── CIRCLE ──
        else if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
          const sx = toScreenX(ent.center.x)
          const sy = toScreenY(ent.center.y)
          const sr = ent.radius * zoom
          ctx.beginPath()
          ctx.arc(sx, sy, sr, 0, Math.PI * 2)
          ctx.stroke()
        }

        // ── ARC ──
        else if (ent.type === 'ARC' && ent.center && ent.radius) {
          const sx = toScreenX(ent.center.x)
          const sy = toScreenY(ent.center.y)
          const sr = ent.radius * zoom
          // Angles in DXF are CCW from positive X-axis in world coords
          // In screen coords, Y is inverted so angles go clockwise
          const sAngle = -ent.endAngle
          const eAngle = -ent.startAngle
          ctx.beginPath()
          ctx.arc(sx, sy, sr, sAngle, eAngle, false)
          ctx.stroke()
        }

        // ── TEXT / MTEXT ──
        else if ((ent.type === 'TEXT' || ent.type === 'MTEXT') && (ent.text || ent.string || ent.textHeight)) {
          const str = ent.text || ent.string || ''
          const pos = ent.startPoint || ent.position || { x: 0, y: 0 }
          const sx = toScreenX(pos.x)
          const sy = toScreenY(pos.y)
          const fontSize = Math.max(10, (ent.textHeight || 2.5) * zoom)
          ctx.font = `${Math.round(fontSize)}px 'Courier New', monospace, sans-serif`
          ctx.save()
          ctx.translate(sx, sy)
          if (ent.rotation) {
            ctx.rotate((-ent.rotation * Math.PI) / 180)
          }
          ctx.fillText(str, 0, 0)
          ctx.restore()
        }

        // ── POINT ──
        else if (ent.type === 'POINT' && (ent.position || ent.center)) {
          const pos = ent.position || ent.center
          const sx = toScreenX(pos.x)
          const sy = toScreenY(pos.y)
          ctx.beginPath()
          ctx.arc(sx, sy, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    ctx.restore()
  }, [dxfData, viewTransform, showGrid, activeLayers, layerTable])

  /* ─── Pan & Mouse Wheel Handlers ─────────────────────────────── */
  const handleMouseDown = (e) => {
    if (e.button === 0 || e.button === 1) { // Left or Middle click
      setIsPanning(true)
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        viewX: viewTransform.x,
        viewY: viewTransform.y,
      }
    }
  }

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    // Update real-time world coordinates under cursor
    const wx = viewTransform.x + (sx - rect.width / 2) / viewTransform.zoom
    const wy = viewTransform.y + (rect.height / 2 - sy) / viewTransform.zoom
    setCursorCoord({ x: wx, y: wy })

    // Pan viewport if dragging
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setViewTransform(v => ({
        ...v,
        x: panStartRef.current.viewX - dx / v.zoom,
        y: panStartRef.current.viewY + dy / v.zoom,
      }))
    }
  }

  const handleMouseUp = () => setIsPanning(false)

  const handleWheel = (e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    const zoomFactor = e.deltaY < 0 ? 1.18 : 1 / 1.18
    const mouseWx = viewTransform.x + (sx - rect.width / 2) / viewTransform.zoom
    const mouseWy = viewTransform.y + (rect.height / 2 - sy) / viewTransform.zoom

    const newZoom = Math.max(1e-7, Math.min(1e8, viewTransform.zoom * zoomFactor))
    const newVx = mouseWx - (sx - rect.width / 2) / newZoom
    const newVy = mouseWy + (sy - rect.height / 2) / newZoom

    setViewTransform({ x: newVx, y: newVy, zoom: newZoom })
  }

  /* ─── Layer Toggle ───────────────────────────────────────────── */
  const toggleLayer = (lName) => {
    setActiveLayers(prev => ({ ...prev, [lName]: !prev[lName] }))
  }

  const toggleAllLayers = (state) => {
    setActiveLayers(prev => {
      const next = {}
      Object.keys(prev).forEach(k => { next[k] = state })
      return next
    })
  }

  /* Sample road loader */
  const handleLoadSample = async () => {
    try {
      setLoading(true)
      const res = await fetch('/sample_road.dxf')
      if (!res.ok) throw new Error('Không thể tải file mẫu')
      const text = await res.text()
      parseDxfText(text, 'sample_road.dxf')
    } catch (err) {
      toast.error('Không tìm thấy file sample_road.dxf trên hệ thống!')
    } finally {
      setLoading(false)
    }
  }

  const layersList = useMemo(() => Object.keys(activeLayers).sort(), [activeLayers])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: '#161922', cursor: isPanning ? 'grabbing' : (showCrosshair ? 'crosshair' : 'default') }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* ── Main Canvas ── */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* ── Empty State / Dropzone prompt ── */}
      {!dxfData && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
          <div className="pointer-events-auto p-8 rounded-2xl max-w-md w-full"
            style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(6,182,212,0.25)', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)' }}>
              <Compass size={28} style={{ color: '#06b6d4' }} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>AutoCAD Web Viewer</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6, marginBottom: 20 }}>
              Kéo thả file bản vẽ <code style={{ color: '#22d3ee', background: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>.dxf</code> vào đây để xem toàn bộ cấu kiện, tim tuyến, đường viền và lớp CAD trên viewport 2D chuyên nghiệp.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleLoadSample}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 18px', borderRadius: 8, fontSize: '12px', fontWeight: 700,
                  background: 'linear-gradient(135deg, #0e7490, #0284c7)', color: '#fff',
                  border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(6,182,212,0.3)',
                }}
              >
                <FileCode size={14} /> Mở bản vẽ mẫu (Sample DXF)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Left CAD Header HUD ── */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div
          className="flex items-center gap-3 px-3.5 py-2 rounded-xl"
          style={{
            background: 'rgba(15,23,42,0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(51,65,85,0.8)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.04em' }}>
              {fileName || 'CAD WORKSPACE'}
            </span>
          </div>
          {dxfData && (
            <span style={{
              fontSize: '10px', color: '#34d399', background: 'rgba(52,211,153,0.1)',
              border: '1px solid rgba(52,211,153,0.25)', padding: '2px 7px', borderRadius: 12, fontWeight: 700
            }}>
              {dxfData.entities?.length || 0} Đối tượng
            </span>
          )}
        </div>

        {/* View Controls Toolbar */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{
            background: 'rgba(15,23,42,0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(51,65,85,0.8)',
          }}
        >
          <button
            type="button" title="Zoom In (+)" onClick={handleZoomIn}
            className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button" title="Zoom Out (-)" onClick={handleZoomOut}
            className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button" title="Fit to Screen (Zoom Extents)" onClick={handleZoomExtents}
            className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition"
          >
            <Maximize2 size={15} />
          </button>
          <button
            type="button" title="Reset Camera" onClick={handleResetView}
            className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition"
          >
            <RotateCcw size={15} />
          </button>
          <div style={{ width: 1, height: 16, background: '#334155', margin: '0 2px' }} />
          <button
            type="button" title="Toggle Grid" onClick={() => setShowGrid(g => !g)}
            className={`p-1.5 rounded-lg transition ${showGrid ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Grid size={15} />
          </button>
          <button
            type="button" title="Toggle Crosshair" onClick={() => setShowCrosshair(c => !c)}
            className={`p-1.5 rounded-lg transition ${showCrosshair ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Crosshair size={15} />
          </button>
          <button
            type="button" title="Quản lý Layers" onClick={() => setShowLayersDrawer(d => !d)}
            className={`p-1.5 rounded-lg transition ${showLayersDrawer ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Layers size={15} />
          </button>
        </div>
      </div>

      {/* ── Layer Manager Drawer (Top Right) ── */}
      {showLayersDrawer && (
        <div
          className="absolute top-4 right-4 z-20 w-72 rounded-xl overflow-hidden"
          style={{
            background: 'rgba(15,23,42,0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(6,182,212,0.2)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Layers size={14} style={{ color: '#06b6d4' }} />
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Lớp Bản Vẽ ({layersList.length})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button" onClick={() => toggleAllLayers(true)}
                style={{ fontSize: '10px', color: '#06b6d4', padding: '2px 6px', borderRadius: 4, background: 'rgba(6,182,212,0.1)' }}
              >
                Hiện hết
              </button>
              <button
                type="button" onClick={() => toggleAllLayers(false)}
                style={{ fontSize: '10px', color: '#64748b', padding: '2px 6px', borderRadius: 4, background: 'rgba(51,65,85,0.2)' }}
              >
                Ẩn hết
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2 space-y-1">
            {layersList.map((lyr) => {
              const active = activeLayers[lyr] !== false
              const color = resolveEntityColor({ layer: lyr }, layerTable)
              return (
                <div
                  key={lyr}
                  onClick={() => toggleLayer(lyr)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition"
                  style={{
                    background: active ? 'rgba(30,41,59,0.5)' : 'transparent',
                    border: '1px solid',
                    borderColor: active ? 'rgba(51,65,85,0.6)' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: color, border: '1px solid rgba(255,255,255,0.2)' }}
                    />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: active ? '#f1f5f9' : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lyr}
                    </span>
                  </div>
                  <button type="button" className="text-slate-400 hover:text-cyan-400 p-0.5">
                    {active ? <Eye size={13} style={{ color: '#06b6d4' }} /> : <EyeOff size={13} style={{ color: '#475569' }} />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Bottom AutoCAD Coordinate Status Bar ── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2"
        style={{
          background: 'rgba(10,15,30,0.92)',
          borderTop: '1px solid rgba(30,41,59,0.9)',
          backdropFilter: 'blur(10px)',
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#64748b',
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>X:</span>
            <span style={{ color: '#e2e8f0' }}>{cursorCoord.x.toFixed(4)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: '#4ade80', fontWeight: 700 }}>Y:</span>
            <span style={{ color: '#e2e8f0' }}>{cursorCoord.y.toFixed(4)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>Z:</span>
            <span style={{ color: '#94a3b8' }}>0.0000</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {bounds && (
            <span style={{ color: '#475569', fontSize: '10px' }}>
              DIM: {bounds.width.toFixed(2)} × {bounds.height.toFixed(2)}
            </span>
          )}
          <span style={{ color: '#06b6d4', fontWeight: 700 }}>
            Tỉ lệ: {(viewTransform.zoom * 100).toFixed(0)}%
          </span>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{ color: '#475569' }}>
            AutoCAD Web Engine 2D
          </span>
        </div>
      </div>
    </div>
  )
}
