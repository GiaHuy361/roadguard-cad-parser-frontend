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
  getPolylineCumulativeDistances,
  formatChainage,
  hasExplicitVertexZ,
} from '../utils/roadEngineeringBuilder'

function CustomCrossSectionTooltip({ active, payload }) {
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
          {data.pointName || (data.x < 0 ? 'Bên trái tim' : data.x > 0 ? 'Bên phải tim' : 'Tim tuyến')}
        </p>
        <p style={{ fontSize: '12px', color: '#A9B9CE', margin: '2px 0' }}>
          Khoảng cách ngang:{' '}
          <span style={{ color: '#22B7C9', fontFamily: 'monospace', fontWeight: 700 }}>
            {data.x > 0 ? `+${data.x}m` : `${data.x}m`}
          </span>
        </p>
        <p style={{ fontSize: '12px', color: '#A9B9CE', margin: '2px 0' }}>
          Cao độ Z:{' '}
          <span style={{ color: '#39B58A', fontFamily: 'monospace', fontWeight: 700 }}>
            {data.elevation != null && Number.isFinite(Number(data.elevation))
              ? `${Number(data.elevation).toFixed(3)} m`
              : 'Chưa có dữ liệu'}
          </span>
        </p>
      </div>
    )
  }
  return null
}

export default function CrossSectionProfile({ geoJsonData, roadParams }) {
  const normalizedParams = useMemo(() => normalizeRoadParams(roadParams), [roadParams])

  const { profilePoints, hasAnyLongitudinalZ, crossSectionsByStation } = useMemo(() => {
    if (!geoJsonData?.features) {
      return { profilePoints: [], hasAnyLongitudinalZ: false, crossSectionsByStation: {} }
    }
    const { enrichedGeoJson } = enrichGeoJsonWithEngineeringFeatures(
      geoJsonData,
      normalizedParams
    )
    const features = enrichedGeoJson?.features || geoJsonData.features
    const csMap = geoJsonData?.crossSections || enrichedGeoJson?.crossSections || {}

    const stFeatures = features.filter(
      (f) => f.properties?.layerType === 'StationPoint' || f.properties?.type === 'StationMilestone'
    )

    let points = []
    if (stFeatures.length > 0) {
      points = stFeatures.map((f, idx) => {
        const coords = f.geometry?.coordinates || []
        const hasCoordZ = hasExplicitVertexZ(coords)
        const propElev = f.properties?.elevation
        const hasPropZ =
          propElev !== null &&
          propElev !== undefined &&
          propElev !== '' &&
          Number.isFinite(Number(propElev))
        const elevation = hasCoordZ
          ? Number(Number(coords[2]).toFixed(3))
          : hasPropZ
          ? Number(Number(propElev).toFixed(3))
          : null

        const distance =
          f.properties?.distance != null
            ? Number(f.properties.distance)
            : f.properties?.distMeters != null
            ? Number(f.properties.distMeters)
            : 0

        const name =
          f.properties?.stationName ||
          f.properties?.chainage ||
          f.properties?.name ||
          formatChainage(distance)

        return {
          id: idx,
          name,
          distance: Number(distance.toFixed(2)),
          elevation,
          lng: coords[0],
          lat: coords[1],
          crossSectionPoints: Array.isArray(f.properties?.crossSectionPoints)
            ? f.properties.crossSectionPoints
            : Array.isArray(csMap[name])
            ? csMap[name]
            : null,
        }
      })
    } else {
      // Fall back to centerline vertices when station step (segmentLength) is not configured
      const clFeature = features.find(
        (f) =>
          (f.id === 'road-centerline-main' ||
            f.properties?.layer === 'TIM_TUYEN_CHINH' ||
            (!f.properties?.isBranch &&
              (f.properties?.type === 'Centerline' || f.properties?.layerType === 'Centerline'))) &&
          f.geometry?.type === 'LineString' &&
          Array.isArray(f.geometry?.coordinates) &&
          f.geometry.coordinates.length >= 2
      )
      if (clFeature) {
        const coords = clFeature.geometry.coordinates
        const totalPlanar = Number(enrichedGeoJson?.totalLengthMeters || geoJsonData?.totalLengthMeters || 0)
        const { dists } = getPolylineCumulativeDistances(
          coords,
          totalPlanar > 0 ? totalPlanar : null
        )
        points = coords.map((pt, idx) => {
          const dist = Number((dists[idx] || 0).toFixed(2))
          const name = formatChainage(dist, idx === coords.length - 1)
          const elevation = hasExplicitVertexZ(pt) ? Number(Number(pt[2]).toFixed(3)) : null
          return {
            id: idx,
            name,
            distance: dist,
            elevation,
            lng: pt[0],
            lat: pt[1],
            crossSectionPoints: Array.isArray(csMap[name]) ? csMap[name] : null,
          }
        })
      }
    }

    const anyZ = points.some((p) => p.elevation !== null && Number.isFinite(p.elevation))
    return {
      profilePoints: points,
      hasAnyLongitudinalZ: anyZ,
      crossSectionsByStation: csMap,
    }
  }, [geoJsonData, normalizedParams])

  const [selectedStationIndex, setSelectedStationIndex] = useState(0)
  const activePoint = profilePoints[selectedStationIndex] || profilePoints[0] || null

  const authenticCrossSectionData = useMemo(() => {
    if (!activePoint) return []
    const rawPts =
      activePoint.crossSectionPoints ||
      crossSectionsByStation?.[activePoint.name] ||
      null
    if (!Array.isArray(rawPts) || rawPts.length < 2) return []
    return rawPts
      .filter(
        (p) =>
          p &&
          p.x !== null &&
          p.x !== undefined &&
          Number.isFinite(Number(p.x)) &&
          p.elevation !== null &&
          p.elevation !== undefined &&
          Number.isFinite(Number(p.elevation))
      )
      .map((p) => ({
        x: Number(Number(p.x).toFixed(2)),
        elevation: Number(Number(p.elevation).toFixed(3)),
        pointName: p.pointName || null,
      }))
  }, [activePoint, crossSectionsByStation])

  if (!geoJsonData || profilePoints.length === 0 || !activePoint) {
    return (
      <div
        data-testid="profile-empty-state"
        className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#0B1220] p-6 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-[#111D2E] border border-[#27384E] flex items-center justify-center text-[#22B7C9]">
          <ScanLine size={28} />
        </div>
        <p className="text-[15px] font-bold text-[#E8EEF6]">
          Chưa có dữ liệu
        </p>
        <p className="text-[13px] text-[#A9B9CE] max-w-md">
          Vui lòng nạp bản vẽ CAD (`.dxf`) hoặc tọa độ VN-2000 ở bảng bên trái và bấm{' '}
          <strong className="text-[#F06421]">Phân Tích &amp; Dựng Tuyến</strong>.
        </p>
      </div>
    )
  }

  const activeHasZ = activePoint.elevation !== null && Number.isFinite(activePoint.elevation)
  const roadWidth = normalizedParams.roadWidth
  const slabThickness = normalizedParams.slabThicknessCentimeters
  const effSlabLength = normalizedParams.effectiveSlabLength
  const expJointSpacing = normalizedParams.expansionJointSpacingMeters

  return (
    <div
      data-testid="cross-section-profile-view"
      className="w-full h-full flex flex-col overflow-y-auto bg-[#0B1220] p-6 text-[#E8EEF6]"
    >
      {/* ── Header & Point/Station Selector ────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-[#27384E]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#111D2E] border border-[#27384E] flex items-center justify-center text-[#22B7C9] shrink-0">
            <ScanLine size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-[16px] font-bold text-[#E8EEF6]">
                Mặt Cắt &amp; Hồ Sơ Kỹ Thuật Tuyến
              </h2>
              {hasAnyLongitudinalZ ? (
                <span
                  data-testid="profile-elevation-badge"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#39B58A]/15 text-[#39B58A] border border-[#39B58A]/40"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Có cao độ tim tuyến (Z) có căn cứ
                </span>
              ) : (
                <span
                  data-testid="profile-elevation-badge"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#17263C] text-[#A9B9CE] border border-[#27384E]"
                >
                  <Info className="w-3.5 h-3.5" /> Bản vẽ 2D — Cao độ Z: Chưa có dữ liệu
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-[#A9B9CE] mt-0.5">
              Chỉ hiển thị cao độ trắc dọc và mặt cắt ngang khi có dữ liệu thực tế từ bản vẽ hoặc tọa độ đầu vào (không dùng cao độ tham chiếu 0 m hay mặt cắt mẫu).
            </p>
          </div>
        </div>

        {/* Station / Vertex Select Dropdown */}
        <div className="flex items-center gap-2.5">
          <span className="text-[12.5px] font-semibold text-[#A9B9CE]">
            Điểm lý trình:
          </span>
          <div className="relative">
            <select
              value={selectedStationIndex}
              onChange={(e) => setSelectedStationIndex(Number(e.target.value))}
              className="appearance-none bg-[#111D2E] border border-[#27384E] hover:border-[#22B7C9] text-[#E8EEF6] text-[13px] font-mono font-bold rounded-lg py-2 pl-3.5 pr-9 focus:outline-none focus:border-[#22B7C9] cursor-pointer tabular-nums"
            >
              {profilePoints.map((s, idx) => (
                <option key={s.id ?? idx} value={idx} className="bg-[#111D2E] text-[#E8EEF6]">
                  {s.name} (L = {s.distance}m) — Z:{' '}
                  {s.elevation !== null && Number.isFinite(s.elevation)
                    ? `${Number(s.elevation).toFixed(3)}m`
                    : 'Chưa có dữ liệu'}
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

      {/* ── Verified Engineering Stat Cards (No hardcoded template values) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <div
          data-testid="profile-stat-elevation"
          className="p-3.5 rounded-xl bg-[#111D2E] border border-[#27384E]"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#A9B9CE]">
              Cao độ tim tuyến (Z)
            </span>
            <Compass size={14} className="text-[#22B7C9]" />
          </div>
          {activeHasZ ? (
            <>
              <p className="text-[18px] font-bold font-mono tabular-nums text-[#22B7C9]">
                {Number(activePoint.elevation).toFixed(3)}{' '}
                <span className="text-[12px] font-normal">m</span>
              </p>
              <p className="text-[11px] text-[#7E92AA] mt-0.5">
                Tại {activePoint.name} (L = {activePoint.distance}m)
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-[#8FA3BA] italic mt-1">
                Chưa có dữ liệu
              </p>
              <p className="text-[11px] text-[#7E92AA] mt-0.5">
                Điểm lý trình hiện tại không có Z
              </p>
            </>
          )}
        </div>

        <div
          data-testid="profile-stat-road-width"
          className="p-3.5 rounded-xl bg-[#111D2E] border border-[#27384E]"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#A9B9CE]">
              Bề rộng mặt đường (B)
            </span>
            <Ruler size={14} className="text-[#F06421]" />
          </div>
          {roadWidth != null ? (
            <>
              <p className="text-[18px] font-bold font-mono tabular-nums text-[#E8EEF6]">
                {roadWidth.toFixed(2)}{' '}
                <span className="text-[12px] font-normal text-[#F06421]">m</span>
              </p>
              <p className="text-[11px] text-[#7E92AA] mt-0.5 tabular-nums">
                {normalizedParams.laneCount != null && normalizedParams.slabWidth != null
                  ? `${normalizedParams.laneCount} dải × ${normalizedParams.slabWidth.toFixed(2)}m`
                  : 'Số dải tấm: Chưa có dữ liệu'}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-[#8FA3BA] italic mt-1">
                Chưa có dữ liệu
              </p>
              <p className="text-[11px] text-[#7E92AA] mt-0.5">
                Chưa khai báo bề rộng mặt đường
              </p>
            </>
          )}
        </div>

        <div
          data-testid="profile-stat-slab-thickness"
          className="p-3.5 rounded-xl bg-[#111D2E] border border-[#27384E]"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#A9B9CE]">
              Chiều dày tấm BTXM
            </span>
            <Layers size={14} className="text-[#F59E0B]" />
          </div>
          {slabThickness != null ? (
            <>
              <p className="text-[18px] font-bold font-mono tabular-nums text-[#E8EEF6]">
                {slabThickness}{' '}
                <span className="text-[12px] font-normal text-[#F59E0B]">cm</span>
              </p>
              <p className="text-[11px] text-[#7E92AA] mt-0.5">
                {normalizedParams.pavementDesign?.fields?.slabThicknessCentimeters?.provenanceLabel ||
                  'Theo hồ sơ thiết kế'}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-[#8FA3BA] italic mt-1">
                Chưa có dữ liệu
              </p>
              <p className="text-[11px] text-[#7E92AA] mt-0.5">
                Chưa có thông số chiều dày BTXM
              </p>
            </>
          )}
        </div>

        <div
          data-testid="profile-stat-joint-spacing"
          className="p-3.5 rounded-xl bg-[#111D2E] border border-[#27384E]"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#A9B9CE]">
              Cự ly khe co / Khe giãn
            </span>
            <ArrowRightLeft size={14} className="text-[#39B58A]" />
          </div>
          {effSlabLength != null || expJointSpacing != null ? (
            <>
              <p className="text-[15px] font-bold font-mono tabular-nums text-[#E8EEF6]">
                Khe co: {effSlabLength != null ? `${effSlabLength} m` : 'Chưa có dữ liệu'}
              </p>
              <p className="text-[11px] text-[#7E92AA] mt-0.5 font-mono tabular-nums">
                Khe giãn: {expJointSpacing != null ? `${expJointSpacing} m` : 'Chưa có dữ liệu'}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-[#8FA3BA] italic mt-1">
                Chưa có dữ liệu
              </p>
              <p className="text-[11px] text-[#7E92AA] mt-0.5">
                Chưa có cự ly khe co / khe giãn
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Longitudinal Profile Section (Trắc dọc cao độ tim tuyến) ── */}
      <div
        data-testid="longitudinal-profile-card"
        className="rounded-xl p-5 mb-5 bg-[#111D2E] border border-[#27384E]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Compass size={15} className="text-[#F06421]" />
            <h3 className="text-[14px] font-bold text-[#E8EEF6]">
              Trắc dọc Tim Tuyến ({profilePoints.length} điểm lý trình)
            </h3>
          </div>
          <span className="text-[12px] text-[#A9B9CE]">
            {hasAnyLongitudinalZ
              ? 'Hiển thị tại các đoạn có dữ liệu cao độ Z có căn cứ'
              : 'Chưa có dữ liệu'}
          </span>
        </div>

        {hasAnyLongitudinalZ ? (
          <div data-testid="longitudinal-profile-chart" style={{ height: '220px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={profilePoints}
                onClick={(e) => {
                  if (e && e.activeTooltipIndex != null) {
                    setSelectedStationIndex(e.activeTooltipIndex)
                  }
                }}
                margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27384E" />
                <XAxis dataKey="name" stroke="#A9B9CE" fontSize={11} />
                <YAxis
                  stroke="#A9B9CE"
                  tickFormatter={(v) => `${Number(v).toFixed(2)}m`}
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
                          <p style={{ color: '#F06421', fontWeight: 700 }}>{d.name}</p>
                          <p style={{ color: '#E8EEF6' }}>Lý trình: {d.distance}m</p>
                          <p style={{ color: '#22B7C9' }}>
                            Cao độ Z:{' '}
                            {d.elevation !== null && Number.isFinite(d.elevation)
                              ? `${Number(d.elevation).toFixed(3)} m`
                              : 'Chưa có dữ liệu'}
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
                  connectNulls={false}
                  stroke="#F06421"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#F06421', stroke: '#0B1220' }}
                  activeDot={{ r: 6, fill: '#22B7C9', stroke: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            data-testid="longitudinal-profile-empty"
            className="py-10 px-4 rounded-lg bg-[#0B1220]/70 border border-[#27384E] text-center space-y-1"
          >
            <div className="text-[14px] font-bold text-[#E8EEF6]">
              Chưa có dữ liệu
            </div>
            <div className="text-[12px] text-[#8FA3BA]">
              Tim tuyến hiện tại chỉ có tọa độ phẳng 2D (X, Y), chưa có cao độ Z có căn cứ để dựng trắc dọc.
            </div>
          </div>
        )}
      </div>

      {/* ── Cross-Section Section (Chỉ dựng khi có dữ liệu mặt cắt ngang tương ứng) ── */}
      <div
        data-testid="cross-section-card"
        className="rounded-xl p-5 bg-[#111D2E] border border-[#27384E]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={15} className="text-[#22B7C9]" />
            <h3 className="text-[14px] font-bold text-[#E8EEF6]">
              Mặt cắt ngang tại {activePoint.name} (Lý trình: {activePoint.distance}m)
            </h3>
          </div>
          <span className="text-[12px] text-[#A9B9CE]">
            {authenticCrossSectionData.length >= 2
              ? `${authenticCrossSectionData.length} điểm mặt cắt ngang thực tế`
              : 'Chưa có dữ liệu'}
          </span>
        </div>

        {authenticCrossSectionData.length >= 2 ? (
          <div data-testid="cross-section-chart" style={{ height: '270px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={authenticCrossSectionData}
                margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27384E" />
                <XAxis
                  dataKey="x"
                  stroke="#A9B9CE"
                  tickFormatter={(v) => `${v}m`}
                  fontSize={11.5}
                />
                <YAxis
                  stroke="#A9B9CE"
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => `${Number(v).toFixed(2)}m`}
                  fontSize={11.5}
                />
                <Tooltip content={<CustomCrossSectionTooltip />} />
                <ReferenceLine x={0} stroke="#F06421" strokeDasharray="4 4" strokeWidth={1.5} />
                <Area
                  type="monotone"
                  dataKey="elevation"
                  stroke="#22B7C9"
                  strokeWidth={2.5}
                  fill="#22B7C9"
                  fillOpacity={0.2}
                  name="Cao độ mặt cắt ngang"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            data-testid="cross-section-empty"
            className="py-10 px-4 rounded-lg bg-[#0B1220]/70 border border-[#27384E] text-center space-y-1"
          >
            <div className="text-[14px] font-bold text-[#E8EEF6]">
              Chưa có dữ liệu
            </div>
            <div className="text-[12px] text-[#8FA3BA]">
              Chưa có dữ liệu điểm mặt cắt ngang tương ứng tại {activePoint.name}. Hệ thống không tự dựng mặt cắt ngang giả định.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
