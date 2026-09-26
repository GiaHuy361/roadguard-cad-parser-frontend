import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import {
  ScanLine,
  Layers,
  TrendingDown,
  Ruler,
  Compass,
  ArrowRightLeft,
  ChevronDown,
} from 'lucide-react'

/* Custom Tooltip for Cross-Section Crown */
function CustomCrossSectionTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          borderRadius: '8px',
          padding: '10px 14px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: 4 }}>
          {data.pointName || (data.x < 0 ? 'Phần đường trái' : data.x > 0 ? 'Phần đường phải' : 'Tim đường')}
        </p>
        <p style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', margin: '2px 0' }}>
          Khoảng cách từ tim: <span style={{ color: '#38bdf8' }}>{data.x > 0 ? `+${data.x}m` : `${data.x}m`}</span>
        </p>
        <p style={{ fontSize: '12px', fontWeight: 700, color: '#22d3ee', margin: '2px 0' }}>
          Cao độ Z: <span>{Number(data.elevation).toFixed(3)} m</span>
        </p>
        {data.slope && (
          <p style={{ fontSize: '10px', color: '#f59e0b', margin: '2px 0' }}>
            Độ dốc ngang i: {data.slope}
          </p>
        )}
      </div>
    )
  }
  return null
}

export default function CrossSectionProfile({ geoJsonData, roadParams }) {
  // Extract all station points from geoJsonData
  const stations = useMemo(() => {
    if (!geoJsonData?.features) return []
    const features = geoJsonData.features

    let st = features.filter((f) => f.properties?.layerType === 'StationPoint')
    if (st.length === 0) {
      st = features.filter((f) => f.geometry?.type === 'Point')
    }

    if (st.length > 0) {
      return st.map((f, idx) => {
        const coords = f.geometry?.coordinates || [0, 0, 0]
        const z =
          coords[2] != null
            ? Number(coords[2])
            : f.properties?.elevation != null
            ? Number(f.properties.elevation)
            : f.properties?.z != null
            ? Number(f.properties.z)
            : 10.0 + idx * 0.15 // Realistic default elevation if 2D

        const distance =
          f.properties?.distance != null
            ? Number(f.properties.distance)
            : idx * Number(roadParams?.segmentLength || 100)

        const name =
          f.properties?.stationName ||
          f.properties?.name ||
          `Km0+${String(Math.round(distance)).padStart(3, '0')}`

        return {
          id: idx,
          name,
          distance,
          elevation: z,
          lng: coords[0],
          lat: coords[1],
        }
      })
    }

    // Fallback: If line features exist, sample 5 points
    const line = features.find((f) => f.geometry?.type === 'LineString')
    if (line?.geometry?.coordinates?.length) {
      const coords = line.geometry.coordinates
      const step = Math.max(1, Math.floor(coords.length / 6))
      const pts = []
      for (let i = 0; i < coords.length; i += step) {
        const c = coords[i]
        pts.push({
          id: pts.length,
          name: `Km0+${String(pts.length * 100).padStart(3, '0')}`,
          distance: pts.length * 100,
          elevation: c[2] != null ? Number(c[2]) : 12.5 + pts.length * 0.2,
          lng: c[0],
          lat: c[1],
        })
      }
      return pts
    }

    return []
  }, [geoJsonData, roadParams])

  const [selectedStationIndex, setSelectedStationIndex] = useState(0)

  if (!geoJsonData || stations.length === 0) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3"
        style={{ background: '#0a0f1e', fontFamily: 'Inter, sans-serif' }}
      >
        <ScanLine size={44} style={{ color: '#1e293b' }} strokeWidth={1.2} />
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
          Chưa có dữ liệu trắc ngang cọc lý trình
        </p>
        <p style={{ fontSize: '11px', color: '#334155' }}>
          Vui lòng nạp file CAD (.dxf) từ thanh bên để hiển thị biểu đồ trắc ngang mui luyện
        </p>
      </div>
    )
  }

  const activeStation = stations[selectedStationIndex] || stations[0]

  // Engineering calculations based on road width & standard 2% cross-slope (TCVN)
  const roadWidth = Number(roadParams?.roadWidth) || 3.5
  const halfWidth = roadWidth / 2
  const shoulderWidth = 0.75
  const crossSlope = 0.02 // 2.0%
  const shoulderSlope = 0.04 // 4.0%
  const slabThickness = 0.22 // 22cm BTXM

  const centerZ = activeStation.elevation
  const leftEdgeZ = centerZ - halfWidth * crossSlope
  const rightEdgeZ = centerZ - halfWidth * crossSlope
  const leftShoulderZ = leftEdgeZ - shoulderWidth * shoulderSlope
  const rightShoulderZ = rightEdgeZ - shoulderWidth * shoulderSlope

  // Cross section data points for Recharts AreaChart
  const crossSectionData = useMemo(() => {
    const totalHalf = halfWidth + shoulderWidth
    return [
      {
        x: -Number(totalHalf.toFixed(2)),
        elevation: Number(leftShoulderZ.toFixed(3)),
        subbase: Number((leftShoulderZ - slabThickness).toFixed(3)),
        pointName: 'Mép lề đường trái',
        slope: '-4.0% (Lề)',
      },
      {
        x: -Number(halfWidth.toFixed(2)),
        elevation: Number(leftEdgeZ.toFixed(3)),
        subbase: Number((leftEdgeZ - slabThickness).toFixed(3)),
        pointName: 'Mép mặt đường trái',
        slope: '-2.0%',
      },
      {
        x: -Number((halfWidth / 2).toFixed(2)),
        elevation: Number((centerZ - (halfWidth / 2) * crossSlope).toFixed(3)),
        subbase: Number((centerZ - (halfWidth / 2) * crossSlope - slabThickness).toFixed(3)),
        pointName: 'Làn xe trái',
        slope: '-2.0%',
      },
      {
        x: 0,
        elevation: Number(centerZ.toFixed(3)),
        subbase: Number((centerZ - slabThickness).toFixed(3)),
        pointName: 'Tim đường (Đỉnh mui luyện)',
        slope: '0.0% (Đỉnh)',
      },
      {
        x: Number((halfWidth / 2).toFixed(2)),
        elevation: Number((centerZ - (halfWidth / 2) * crossSlope).toFixed(3)),
        subbase: Number((centerZ - (halfWidth / 2) * crossSlope - slabThickness).toFixed(3)),
        pointName: 'Làn xe phải',
        slope: '-2.0%',
      },
      {
        x: Number(halfWidth.toFixed(2)),
        elevation: Number(rightEdgeZ.toFixed(3)),
        subbase: Number((rightEdgeZ - slabThickness).toFixed(3)),
        pointName: 'Mép mặt đường phải',
        slope: '-2.0%',
      },
      {
        x: Number(totalHalf.toFixed(2)),
        elevation: Number(rightShoulderZ.toFixed(3)),
        subbase: Number((rightShoulderZ - slabThickness).toFixed(3)),
        pointName: 'Mép lề đường phải',
        slope: '-4.0% (Lề)',
      },
    ]
  }, [centerZ, halfWidth, shoulderWidth, crossSlope, shoulderSlope, slabThickness, leftEdgeZ, rightEdgeZ, leftShoulderZ, rightShoulderZ])

  // Longitudinal Profile data across all stations
  const longitudinalData = useMemo(() => {
    return stations.map((s, i) => ({
      index: i,
      stationName: s.name,
      distance: s.distance,
      elevation: Number(s.elevation.toFixed(3)),
    }))
  }, [stations])

  const yDomainMin = Math.floor((leftShoulderZ - slabThickness - 0.2) * 10) / 10
  const yDomainMax = Math.ceil((centerZ + 0.2) * 10) / 10

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-y-auto"
      style={{
        background: '#0a0f1e',
        fontFamily: 'Inter, sans-serif',
        padding: '24px 28px',
        color: '#e2e8f0',
      }}
    >
      {/* ── Header & Station Selector ────────────────────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4"
        style={{ borderBottom: '1px solid rgba(30, 41, 59, 0.9)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              boxShadow: '0 0 16px rgba(6, 182, 212, 0.15)',
            }}
          >
            <ScanLine size={20} style={{ color: '#06b6d4' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2 }}>
              Mặt Cắt Ngang Tuyến (Cross-Section Crown Profile)
            </h2>
            <p style={{ fontSize: '11px', color: '#64748b', marginTop: 3 }}>
              Trắc ngang mui luyện thoát nước 2 mái theo TCVN 4054 &amp; TCVN 10380
            </p>
          </div>
        </div>

        {/* Station Select Dropdown */}
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
            Vị trí cọc lý trình:
          </span>
          <div className="relative">
            <select
              value={selectedStationIndex}
              onChange={(e) => setSelectedStationIndex(Number(e.target.value))}
              style={{
                appearance: 'none',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                color: '#38bdf8',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '8px',
                padding: '8px 32px 8px 14px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {stations.map((s, idx) => (
                <option key={s.id ?? idx} value={idx} style={{ background: '#0f172a', color: '#e2e8f0' }}>
                  {s.name} ({s.distance}m) &mdash; Z: {Number(s.elevation).toFixed(2)}m
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{
                color: '#38bdf8',
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Engineering Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div
          className="p-3 rounded-xl"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Compass size={12} style={{ color: '#06b6d4' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Cao độ tim (Z)
            </span>
          </div>
          <p style={{ fontSize: '16px', fontWeight: 900, color: '#22d3ee' }}>
            {Number(centerZ).toFixed(3)} <span style={{ fontSize: '11px', fontWeight: 600 }}>m</span>
          </p>
        </div>

        <div
          className="p-3 rounded-xl"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(51, 65, 85, 0.7)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Ruler size={12} style={{ color: '#818cf8' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Bề rộng mặt đường (W)
            </span>
          </div>
          <p style={{ fontSize: '16px', fontWeight: 900, color: '#a5b4fc' }}>
            {roadWidth.toFixed(1)} <span style={{ fontSize: '11px', fontWeight: 600 }}>m</span>
          </p>
        </div>

        <div
          className="p-3 rounded-xl"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(51, 65, 85, 0.7)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={12} style={{ color: '#34d399' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Độ dốc thoát nước (i)
            </span>
          </div>
          <p style={{ fontSize: '16px', fontWeight: 900, color: '#6ee7b7' }}>
            2.0% <span style={{ fontSize: '11px', fontWeight: 600 }}>(Mui luyện)</span>
          </p>
        </div>

        <div
          className="p-3 rounded-xl"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(51, 65, 85, 0.7)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Layers size={12} style={{ color: '#fb923c' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Chiều dày tấm BTXM
            </span>
          </div>
          <p style={{ fontSize: '16px', fontWeight: 900, color: '#fdba74' }}>
            22.0 <span style={{ fontSize: '11px', fontWeight: 600 }}>cm</span>
          </p>
        </div>
      </div>

      {/* ── Main Chart: Road Crown Cross-Section ─────────────────── */}
      <div
        className="rounded-2xl p-5 mb-6"
        style={{
          background: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(51, 65, 85, 0.8)',
          boxShadow: '0 8px 32px -4px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={14} style={{ color: '#06b6d4' }} />
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
              Đồ thị Trắc ngang Mui luyện tại {activeStation.name} (Lý trình: {activeStation.distance}m)
            </h3>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-sm bg-cyan-400 inline-block" /> Mặt đường BTXM
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-sm bg-slate-600 inline-block" /> Đáy kết cấu (22cm)
            </span>
          </div>
        </div>

        <div style={{ height: '300px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={crossSectionData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="pavementGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="subbaseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#334155" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#0f172a" stopOpacity={0.1} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.4)" />

              <XAxis
                dataKey="x"
                stroke="#64748b"
                tickFormatter={(v) => `${v}m`}
                fontSize={11}
                label={{ value: 'Khoảng cách từ tim tuyến (m)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }}
              />

              <YAxis
                stroke="#64748b"
                domain={[yDomainMin, yDomainMax]}
                tickFormatter={(v) => `${Number(v).toFixed(2)}m`}
                fontSize={11}
                label={{ value: 'Cao độ Z (m)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
              />

              <Tooltip content={<CustomCrossSectionTooltip />} />

              {/* Centerline vertical marker */}
              <ReferenceLine
                x={0}
                stroke="#22d3ee"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: 'CL (Tim đường)', position: 'top', fill: '#22d3ee', fontSize: 10, fontWeight: 700 }}
              />

              {/* Edge Left marker */}
              <ReferenceLine
                x={-Number(halfWidth.toFixed(2))}
                stroke="#94a3b8"
                strokeDasharray="2 2"
                strokeWidth={1}
                label={{ value: 'Mép trái', position: 'top', fill: '#94a3b8', fontSize: 9 }}
              />

              {/* Edge Right marker */}
              <ReferenceLine
                x={Number(halfWidth.toFixed(2))}
                stroke="#94a3b8"
                strokeDasharray="2 2"
                strokeWidth={1}
                label={{ value: 'Mép phải', position: 'top', fill: '#94a3b8', fontSize: 9 }}
              />

              {/* Surface Crown */}
              <Area
                type="monotone"
                dataKey="elevation"
                stroke="#06b6d4"
                strokeWidth={2.5}
                fill="url(#pavementGrad)"
                name="Cao độ mặt đường"
              />

              {/* Subbase */}
              <Area
                type="monotone"
                dataKey="subbase"
                stroke="#475569"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                fill="url(#subbaseGrad)"
                name="Đáy móng BTXM"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Longitudinal Profile Preview (Trắc dọc cao độ toàn tuyến) ── */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(51, 65, 85, 0.8)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Compass size={14} style={{ color: '#818cf8' }} />
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
              Trắc dọc Cao độ Tim Tuyến (Longitudinal Profile - {stations.length} cọc)
            </h3>
          </div>
          <span style={{ fontSize: '10px', color: '#64748b' }}>
            Click vào điểm trên biểu đồ để chuyển cọc lý trình
          </span>
        </div>

        <div style={{ height: '180px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={longitudinalData}
              onClick={(e) => {
                if (e && e.activeTooltipIndex != null) {
                  setSelectedStationIndex(e.activeTooltipIndex)
                }
              }}
              margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" />
              <XAxis dataKey="stationName" stroke="#64748b" fontSize={10} />
              <YAxis
                stroke="#64748b"
                tickFormatter={(v) => `${Number(v).toFixed(1)}m`}
                fontSize={10}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload
                    return (
                      <div
                        style={{
                          background: 'rgba(15, 23, 42, 0.95)',
                          border: '1px solid rgba(129, 140, 248, 0.4)',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '11px',
                        }}
                      >
                        <p style={{ color: '#818cf8', fontWeight: 700 }}>{d.stationName}</p>
                        <p style={{ color: '#e2e8f0' }}>Lý trình: {d.distance}m</p>
                        <p style={{ color: '#38bdf8' }}>Cao độ Z: {d.elevation}m</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Line
                type="monotone"
                dataKey="elevation"
                stroke="#818cf8"
                strokeWidth={2}
                dot={{ r: 3, fill: '#818cf8', stroke: '#0f172a' }}
                activeDot={{ r: 6, fill: '#06b6d4', stroke: '#fff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
