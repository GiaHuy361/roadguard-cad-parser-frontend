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
  Info,
  CheckCircle2,
} from 'lucide-react'

import {
  enrichGeoJsonWithEngineeringFeatures,
  normalizeRoadParams,
} from '../utils/roadEngineeringBuilder'

/* Custom Tooltip for Cross-Section Crown */
function CustomCrossSectionTooltip({ active, payload, is3DElevation }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div
        style={{
          background: '#111D2E',
          border: '1px solid #27384E',
          borderRadius: '10px',
          padding: '10px 14px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <p style={{ fontSize: '12px', fontWeight: 700, color: '#E8EEF6', marginBottom: 4 }}>
          {data.pointName || (data.x < 0 ? 'Phần đường trái' : data.x > 0 ? 'Phần đường phải' : 'Tim đường')}
        </p>
        <p style={{ fontSize: '12px', color: '#A9B9CE', margin: '2px 0' }}>
          Khoảng cách từ tim:{' '}
          <span style={{ color: '#22B7C9', fontFamily: 'monospace', fontWeight: 700 }}>
            {data.x > 0 ? `+${data.x}m` : `${data.x}m`}
          </span>
        </p>
        <p style={{ fontSize: '12px', color: '#A9B9CE', margin: '2px 0' }}>
          {is3DElevation ? 'Cao độ thực tế Z:' : 'Cao độ tham chiếu ΔZ:'}{' '}
          <span style={{ color: '#39B58A', fontFamily: 'monospace', fontWeight: 700 }}>
            {Number(data.elevation).toFixed(3)} m
          </span>
        </p>
        {data.slope && (
          <p style={{ fontSize: '11px', color: '#F59E0B', marginTop: 4, fontWeight: 600 }}>
            Độ dốc ngang thiết kế i: {data.slope}
          </p>
        )}
      </div>
    )
  }
  return null
}

export default function CrossSectionProfile({ geoJsonData, roadParams }) {
  const normalizedParams = useMemo(() => normalizeRoadParams(roadParams), [roadParams])

  // Extract all station points from Single Source of Truth enriched GeoJSON
  const { stations, hasAuthentic3DElevation } = useMemo(() => {
    if (!geoJsonData?.features) return { stations: [], hasAuthentic3DElevation: false }
    const { enrichedGeoJson, analytics } = enrichGeoJsonWithEngineeringFeatures(
      geoJsonData,
      normalizedParams
    )
    const features = enrichedGeoJson?.features || geoJsonData.features
    const is3D = Boolean(
      enrichedGeoJson?.hasAuthentic3DElevation || analytics?.hasAuthentic3DElevation
    )

    const st = features.filter(
      (f) => f.properties?.layerType === 'StationPoint' || f.properties?.type === 'StationMilestone'
    )

    if (st.length > 0) {
      const mapped = st.map((f, idx) => {
        const coords = f.geometry?.coordinates || [0, 0, 0]
        const rawZ =
          coords[2] != null
            ? Number(coords[2])
            : f.properties?.elevation != null
            ? Number(f.properties.elevation)
            : f.properties?.z != null
            ? Number(f.properties.z)
            : 0.0

        const distance =
          f.properties?.distance != null
            ? Number(f.properties.distance)
            : f.properties?.distMeters != null
            ? Number(f.properties.distMeters)
            : idx * normalizedParams.segmentLength

        const name =
          f.properties?.stationName ||
          f.properties?.chainage ||
          f.properties?.name ||
          `Km0+${String(Math.round(distance)).padStart(3, '0')}`

        return {
          id: idx,
          name,
          distance,
          elevation: Number.isFinite(rawZ) ? rawZ : 0.0,
          lng: coords[0],
          lat: coords[1],
        }
      })
      return { stations: mapped, hasAuthentic3DElevation: is3D }
    }

    return { stations: [], hasAuthentic3DElevation: false }
  }, [geoJsonData, normalizedParams])

  const [selectedStationIndex, setSelectedStationIndex] = useState(0)

  const activeStation = stations[selectedStationIndex] || stations[0] || null

  // Engineering calculations based on road width & standard 2% cross-slope (TCVN 4054:2005)
  const roadWidth = normalizedParams.roadWidth
  const halfWidth = roadWidth / 2
  const shoulderWidth = 0.75
  const crossSlope = 0.02 // 2.0%
  const shoulderSlope = 0.04 // 4.0%
  const slabThickness = 0.22 // 22cm BTXM

  const centerZ = activeStation?.elevation ?? 0
  const leftEdgeZ = centerZ - halfWidth * crossSlope
  const rightEdgeZ = centerZ - halfWidth * crossSlope
  const leftShoulderZ = leftEdgeZ - shoulderWidth * shoulderSlope
  const rightShoulderZ = rightEdgeZ - shoulderWidth * shoulderSlope

  // Cross section data points for Recharts AreaChart
  const crossSectionData = useMemo(() => {
    if (!activeStation) return []
    const totalHalf = halfWidth + shoulderWidth
    return [
      {
        x: -Number(totalHalf.toFixed(2)),
        elevation: Number(leftShoulderZ.toFixed(3)),
        subbase: Number((leftShoulderZ - slabThickness).toFixed(3)),
        pointName: 'Mép lề gia cố trái',
        slope: '-4.0% (Lề mẫu TCVN)',
      },
      {
        x: -Number(halfWidth.toFixed(2)),
        elevation: Number(leftEdgeZ.toFixed(3)),
        subbase: Number((leftEdgeZ - slabThickness).toFixed(3)),
        pointName: 'Mép mặt đường BTXM trái',
        slope: '-2.0%',
      },
      {
        x: -Number((halfWidth / 2).toFixed(2)),
        elevation: Number((centerZ - (halfWidth / 2) * crossSlope).toFixed(3)),
        subbase: Number((centerZ - (halfWidth / 2) * crossSlope - slabThickness).toFixed(3)),
        pointName: 'Dải tấm BTXM bên trái',
        slope: '-2.0%',
      },
      {
        x: 0,
        elevation: Number(centerZ.toFixed(3)),
        subbase: Number((centerZ - slabThickness).toFixed(3)),
        pointName: 'Tim tuyến (Đỉnh mui luyện)',
        slope: '0.0% (Tim đường)',
      },
      {
        x: Number((halfWidth / 2).toFixed(2)),
        elevation: Number((centerZ - (halfWidth / 2) * crossSlope).toFixed(3)),
        subbase: Number((centerZ - (halfWidth / 2) * crossSlope - slabThickness).toFixed(3)),
        pointName: 'Dải tấm BTXM bên phải',
        slope: '-2.0%',
      },
      {
        x: Number(halfWidth.toFixed(2)),
        elevation: Number(rightEdgeZ.toFixed(3)),
        subbase: Number((rightEdgeZ - slabThickness).toFixed(3)),
        pointName: 'Mép mặt đường BTXM phải',
        slope: '-2.0%',
      },
      {
        x: Number(totalHalf.toFixed(2)),
        elevation: Number(rightShoulderZ.toFixed(3)),
        subbase: Number((rightShoulderZ - slabThickness).toFixed(3)),
        pointName: 'Mép lề gia cố phải',
        slope: '-4.0% (Lề mẫu TCVN)',
      },
    ]
  }, [
    activeStation,
    centerZ,
    halfWidth,
    shoulderWidth,
    crossSlope,
    slabThickness,
    leftEdgeZ,
    rightEdgeZ,
    leftShoulderZ,
    rightShoulderZ,
  ])

  // Longitudinal Profile data across all stations
  const longitudinalData = useMemo(() => {
    return stations.map((s, i) => ({
      index: i,
      stationName: s.name,
      distance: s.distance,
      elevation: Number(s.elevation.toFixed(3)),
    }))
  }, [stations])

  if (!geoJsonData || stations.length === 0 || !activeStation) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#0B1220] p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#111D2E] border border-[#27384E] flex items-center justify-center text-[#22B7C9]">
          <ScanLine size={28} />
        </div>
        <p className="text-[15px] font-bold text-[#E8EEF6]">
          Chưa có dữ liệu trắc ngang cọc lý trình
        </p>
        <p className="text-[13px] text-[#A9B9CE] max-w-md">
          Vui lòng nạp bản vẽ CAD (`.dxf`) hoặc tọa độ VN-2000 ở bảng bên trái và bấm{' '}
          <strong className="text-[#F06421]">Phân Tích & Dựng Tuyến</strong> để tạo biểu đồ mặt cắt ngang.
        </p>
      </div>
    )
  }

  const yDomainMin = Number((leftShoulderZ - slabThickness - 0.15).toFixed(2))
  const yDomainMax = Number((centerZ + 0.15).toFixed(2))

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto bg-[#0B1220] p-6 text-[#E8EEF6]">
      {/* ── Header & Station Selector ────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-[#27384E]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#111D2E] border border-[#27384E] flex items-center justify-center text-[#22B7C9] shrink-0">
            <ScanLine size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-[16px] font-bold text-[#E8EEF6]">
                Mặt Cắt Ngang & Hồ Sơ Kỹ Thuật Tuyến
              </h2>
              {hasAuthentic3DElevation ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#39B58A]/15 text-[#39B58A] border border-[#39B58A]/40">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Cao độ 3D từ bản vẽ CAD
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/40">
                  <Info className="w-3.5 h-3.5" /> Chế độ Bản vẽ 2D (Cao độ & độ dốc cấu hình mẫu TCVN)
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-[#A9B9CE] mt-0.5">
              Mô phỏng kết cấu mặt đường BTXM B = {roadWidth.toFixed(2)}m ({normalizedParams.laneCount} dải ×{' '}
              {normalizedParams.slabWidth.toFixed(2)}m) theo TCVN 4054:2005
            </p>
          </div>
        </div>

        {/* Station Select Dropdown */}
        <div className="flex items-center gap-2.5">
          <span className="text-[12.5px] font-semibold text-[#A9B9CE]">
            Chọn cọc lý trình:
          </span>
          <div className="relative">
            <select
              value={selectedStationIndex}
              onChange={(e) => setSelectedStationIndex(Number(e.target.value))}
              className="appearance-none bg-[#111D2E] border border-[#27384E] hover:border-[#22B7C9] text-[#E8EEF6] text-[13px] font-mono font-bold rounded-lg py-2 pl-3.5 pr-9 focus:outline-none focus:border-[#22B7C9] cursor-pointer tabular-nums"
            >
              {stations.map((s, idx) => (
                <option key={s.id ?? idx} value={idx} className="bg-[#111D2E] text-[#E8EEF6]">
                  {s.name} (L = {s.distance}m) — Z: {Number(s.elevation).toFixed(3)}m
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="text-[#22B7C9] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* ── Explicit 2D vs 3D Elevation Provenance Notice ────────── */}
      {!hasAuthentic3DElevation && (
        <div className="mb-5 p-3.5 rounded-xl bg-[#111D2E] border border-[#F59E0B]/40 flex items-start gap-3">
          <Info className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
          <div className="text-[12.5px] text-[#E8EEF6] leading-relaxed">
            <strong className="text-[#F59E0B]">Lưu ý nguồn dữ liệu cao độ (Bản vẽ 2D):</strong>{' '}
            Dữ liệu đầu vào hiện chỉ chứa tọa độ mặt bằng 2D (chưa có cao độ khảo sát thực địa Z ≠ 0). Mặt cắt ngang bên dưới sử dụng{' '}
            <strong>mốc cao độ tim tham chiếu Z₀ = 0.000 m</strong> kết hợp cấu hình thiết kế mẫu TCVN 4054:2005 (i_mặt = 2.0%, i_lề = 4.0%, chiều dày tấm BTXM 22.0 cm).
          </div>
        </div>
      )}

      {/* ── Engineering Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <div className="p-3.5 rounded-xl bg-[#111D2E] border border-[#27384E]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#A9B9CE]">
              {hasAuthentic3DElevation ? 'Cao độ tim tuyến (Z)' : 'Cao độ tim tham chiếu'}
            </span>
            <Compass size={14} className="text-[#22B7C9]" />
          </div>
          <p className="text-[18px] font-bold font-mono tabular-nums text-[#22B7C9]">
            {Number(centerZ).toFixed(3)} <span className="text-[12px] font-normal">m</span>
          </p>
          <p className="text-[11px] text-[#7E92AA] mt-0.5">
            {hasAuthentic3DElevation ? 'Từ tọa độ Z thực tế' : 'Mốc 0.000m (Bản vẽ 2D)'}
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-[#111D2E] border border-[#27384E]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#A9B9CE]">
              Bề rộng mặt đường (B)
            </span>
            <Ruler size={14} className="text-[#F06421]" />
          </div>
          <p className="text-[18px] font-bold font-mono tabular-nums text-[#E8EEF6]">
            {roadWidth.toFixed(2)} <span className="text-[12px] font-normal text-[#F06421]">m</span>
          </p>
          <p className="text-[11px] text-[#7E92AA] mt-0.5 tabular-nums">
            {normalizedParams.laneCount} dải tấm × {normalizedParams.slabWidth.toFixed(2)}m
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-[#111D2E] border border-[#27384E]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#A9B9CE]">
              Độ dốc ngang mui luyện (i)
            </span>
            <TrendingDown size={14} className="text-[#39B58A]" />
          </div>
          <p className="text-[18px] font-bold font-mono tabular-nums text-[#39B58A]">
            2.0% <span className="text-[12px] font-normal text-[#A9B9CE]">/ Lề 4.0%</span>
          </p>
          <p className="text-[11px] text-[#7E92AA] mt-0.5">
            Cấu hình tiêu chuẩn TCVN 4054
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-[#111D2E] border border-[#27384E]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#A9B9CE]">
              Kết cấu tấm BTXM
            </span>
            <Layers size={14} className="text-[#F59E0B]" />
          </div>
          <p className="text-[18px] font-bold font-mono tabular-nums text-[#E8EEF6]">
            22.0 <span className="text-[12px] font-normal text-[#F59E0B]">cm</span>
          </p>
          <p className="text-[11px] text-[#7E92AA] mt-0.5 tabular-nums">
            Chiều dài tấm L = {normalizedParams.slabLength.toFixed(1)}m
          </p>
        </div>
      </div>

      {/* ── Main Chart: Road Crown Cross-Section ─────────────────── */}
      <div className="rounded-xl p-5 mb-5 bg-[#111D2E] border border-[#27384E]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={15} className="text-[#22B7C9]" />
            <h3 className="text-[14px] font-bold text-[#E8EEF6]">
              Trắc ngang Mui luyện tại cọc {activeStation.name} (Lý trình: {activeStation.distance}m)
            </h3>
          </div>
          <div className="flex items-center gap-4 text-[12px] text-[#A9B9CE]">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-2 rounded-sm bg-[#22B7C9] inline-block" /> Mặt đường BTXM (B = {roadWidth}m)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-2 rounded-sm bg-[#7E92AA] inline-block" /> Đáy tấm BTXM (22cm)
            </span>
          </div>
        </div>

        <div style={{ height: '290px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={crossSectionData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="pavementGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22B7C9" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#22B7C9" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="subbaseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#27384E" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#0B1220" stopOpacity={0.15} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#27384E" />

              <XAxis
                dataKey="x"
                stroke="#A9B9CE"
                tickFormatter={(v) => `${v}m`}
                fontSize={11.5}
                label={{
                  value: 'Khoảng cách ngang tính từ tim tuyến (m)',
                  position: 'insideBottom',
                  offset: -10,
                  fill: '#A9B9CE',
                  fontSize: 12,
                }}
              />

              <YAxis
                stroke="#A9B9CE"
                domain={[yDomainMin, yDomainMax]}
                tickFormatter={(v) => `${Number(v).toFixed(2)}m`}
                fontSize={11.5}
                label={{
                  value: hasAuthentic3DElevation ? 'Cao độ Z (m)' : 'Cao độ tham chiếu ΔZ (m)',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#A9B9CE',
                  fontSize: 12,
                }}
              />

              <Tooltip content={<CustomCrossSectionTooltip is3DElevation={hasAuthentic3DElevation} />} />

              {/* Centerline vertical marker */}
              <ReferenceLine
                x={0}
                stroke="#F06421"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'Tim tuyến (CL)',
                  position: 'top',
                  fill: '#F06421',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />

              {/* Edge Left marker */}
              <ReferenceLine
                x={-Number(halfWidth.toFixed(2))}
                stroke="#22B7C9"
                strokeDasharray="2 2"
                strokeWidth={1}
                label={{
                  value: `Mép trái (-${halfWidth.toFixed(2)}m)`,
                  position: 'top',
                  fill: '#22B7C9',
                  fontSize: 10.5,
                }}
              />

              {/* Edge Right marker */}
              <ReferenceLine
                x={Number(halfWidth.toFixed(2))}
                stroke="#22B7C9"
                strokeDasharray="2 2"
                strokeWidth={1}
                label={{
                  value: `Mép phải (+${halfWidth.toFixed(2)}m)`,
                  position: 'top',
                  fill: '#22B7C9',
                  fontSize: 10.5,
                }}
              />

              {/* Surface Crown */}
              <Area
                type="monotone"
                dataKey="elevation"
                stroke="#22B7C9"
                strokeWidth={2.5}
                fill="url(#pavementGrad)"
                name="Cao độ mặt đường"
              />

              {/* Subbase */}
              <Area
                type="monotone"
                dataKey="subbase"
                stroke="#7E92AA"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                fill="url(#subbaseGrad)"
                name="Đáy tấm BTXM"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Longitudinal Profile Preview (Trắc dọc cao độ toàn tuyến) ── */}
      <div className="rounded-xl p-5 bg-[#111D2E] border border-[#27384E]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Compass size={15} className="text-[#F06421]" />
            <h3 className="text-[14px] font-bold text-[#E8EEF6]">
              Trắc dọc Tim Tuyến ({stations.length} cọc lý trình — Bước cọc {normalizedParams.segmentLength}m)
            </h3>
          </div>
          <span className="text-[12px] text-[#A9B9CE]">
            Nhấp vào điểm cọc trên biểu đồ để xem mặt cắt ngang tại cọc đó
          </span>
        </div>

        <div style={{ height: '185px', width: '100%' }}>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#27384E" />
              <XAxis dataKey="stationName" stroke="#A9B9CE" fontSize={11} />
              <YAxis
                stroke="#A9B9CE"
                tickFormatter={(v) => `${Number(v).toFixed(1)}m`}
                fontSize={11}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload
                    return (
                      <div
                        style={{
                          background: '#111D2E',
                          border: '1px solid #27384E',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          fontSize: '12px',
                        }}
                      >
                        <p style={{ color: '#F06421', fontWeight: 700 }}>{d.stationName}</p>
                        <p style={{ color: '#E8EEF6' }}>Lý trình: {d.distance}m</p>
                        <p style={{ color: '#22B7C9' }}>
                          {hasAuthentic3DElevation ? 'Cao độ Z:' : 'Cao độ tham chiếu:'} {d.elevation}m
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Line
                type="monotone"
                dataKey="elevation"
                stroke="#F06421"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#F06421', stroke: '#0B1220' }}
                activeDot={{ r: 6, fill: '#22B7C9', stroke: '#fff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
