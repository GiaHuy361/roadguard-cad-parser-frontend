import { useState, useMemo, useEffect } from 'react'
import {
  X,
  Download,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  FileJson,
  CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  buildRoadGuardGeometryDraft,
  validateRoadGuardGeometryDraft,
} from '../utils/crsTransformEngine'

export default function RoadGuardDraftExportModal({
  isOpen,
  onClose,
  geoJsonData,
  roadParams,
  isSurfaceAreaProvisional = false,
  analyzedRoadWidth = 7.0,
}) {
  const activeCenterlineFeature = useMemo(() => {
    if (!geoJsonData?.features) return null
    return (
      geoJsonData.features.find(
        (f) =>
          f.geometry?.type === 'LineString' &&
          (f.properties?.type === 'Centerline' ||
            f.properties?.layer === 'TIM_TUYEN_CHINH')
      ) ||
      geoJsonData.features.find((f) => f.geometry?.type === 'LineString') ||
      null
    )
  }, [geoJsonData])

  const allLineStringFeatures = useMemo(() => {
    if (!geoJsonData?.features) return []
    return geoJsonData.features.filter(
      (f) =>
        f.geometry?.type === 'LineString' &&
        f.properties?.type !== 'RoadEdge' &&
        f.properties?.type !== 'ContractionJoint' &&
        f.properties?.type !== 'ExpansionJoint' &&
        f.properties?.type !== 'DroneSegment' &&
        f.properties?.type !== 'DroneCompletedSegment'
    )
  }, [geoJsonData])

  const [selectedFeatureIdx, setSelectedFeatureIdx] = useState(0)
  const [sourceCrs, setSourceCrs] = useState(32648)
  const [roadCode, setRoadCode] = useState('')
  const [roadName, setRoadName] = useState('')
  const [changeReason, setChangeReason] = useState(
    'Nhập bình đồ tuyến chuẩn hóa từ CAD & GIS STUDIO'
  )
  const [stationOriginMeters, setStationOriginMeters] = useState('0')
  const [surveyWidthMeters, setSurveyWidthMeters] = useState('12')
  const [copied, setCopied] = useState(false)

  const chosenFeature =
    allLineStringFeatures[selectedFeatureIdx] || activeCenterlineFeature

  useEffect(() => {
    if (!isOpen) return
    const props = chosenFeature?.properties || geoJsonData?.crsMetadata || {}
    const initialCode =
      chosenFeature?.properties?.roadCode ||
      geoJsonData?.roadCode ||
      ''
    const initialName =
      chosenFeature?.properties?.roadName ||
      chosenFeature?.properties?.name ||
      geoJsonData?.roadName ||
      ''
    setRoadCode(initialCode)
    setRoadName(initialName)
    const w = Number(roadParams?.roadWidth || analyzedRoadWidth || 7.0)
    setSurveyWidthMeters(String(Math.max(w, 12)))
    if (props.recommendedUtmSrid === 32649) {
      setSourceCrs(32649)
    } else {
      setSourceCrs(32648)
    }
  }, [isOpen, chosenFeature, geoJsonData, roadParams?.roadWidth, analyzedRoadWidth])

  const centerlineWgs84 = useMemo(() => {
    const coords = chosenFeature?.geometry?.coordinates || []
    return coords
      .filter((c) => Array.isArray(c) && c.length >= 2)
      .map((c) => [Number(c[0]), Number(c[1])])
  }, [chosenFeature])

  const effectiveWidth = Number(roadParams?.roadWidth || analyzedRoadWidth || 7.0)

  const draftBuildResult = useMemo(() => {
    if (!centerlineWgs84 || centerlineWgs84.length < 2) {
      return {
        valid: false,
        errors: ['Chưa có hình học LineString hợp lệ (cần tối thiểu 2 điểm).'],
        draft: null,
        utmLengthMeters: 0,
      }
    }
    return buildRoadGuardGeometryDraft({
      centerlineWgs84,
      sourceCrs: Number(sourceCrs),
      stationOriginMeters: Number(stationOriginMeters),
      changeReason,
      roadWidth: effectiveWidth,
      surveyWidthMeters: Number(surveyWidthMeters),
      roadCode,
      roadName,
    })
  }, [
    centerlineWgs84,
    sourceCrs,
    stationOriginMeters,
    changeReason,
    effectiveWidth,
    surveyWidthMeters,
    roadCode,
    roadName,
  ])

  const contractCheck = useMemo(() => {
    if (!draftBuildResult.draft) {
      return { valid: false, errors: draftBuildResult.errors || [] }
    }
    return validateRoadGuardGeometryDraft(
      draftBuildResult.draft,
      Number(sourceCrs)
    )
  }, [draftBuildResult, sourceCrs])

  const isSyntheticSample = useMemo(() => {
    return Boolean(
      chosenFeature?.properties?.isSyntheticSample ||
      chosenFeature?.properties?.roadCode === 'GEO-GJ-20261025-01' ||
      String(chosenFeature?.properties?.warning || '').includes('MINH HỌA') ||
      geoJsonData?.isSyntheticSample ||
      geoJsonData?.properties?.isSyntheticSample
    )
  }, [chosenFeature, geoJsonData])

  if (!isOpen) return null

  const handleCopyDraft = () => {
    if (isSurfaceAreaProvisional) {
      toast.error(
        'Vui lòng phân tích lại bề rộng mặt đường trước khi xuất RoadGuard Draft chính thức.'
      )
      return
    }
    if (!contractCheck.valid || !draftBuildResult.draft) {
      toast.error(
        contractCheck.errors?.[0] ||
          'Dữ liệu chưa đạt hợp đồng đầu vào RoadGuard.'
      )
      return
    }
    const text = JSON.stringify(draftBuildResult.draft, null, 2)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      toast.success('Đã sao chép JSON RoadGuard GeometryDraftInput!')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDownloadDraft = () => {
    if (isSurfaceAreaProvisional) {
      toast.error(
        'Vui lòng phân tích lại bề rộng mặt đường trước khi xuất RoadGuard Draft chính thức.'
      )
      return
    }
    if (!contractCheck.valid || !draftBuildResult.draft) {
      toast.error(
        contractCheck.errors?.[0] ||
          'Dữ liệu chưa đạt hợp đồng đầu vào RoadGuard.'
      )
      return
    }
    const blob = new Blob([JSON.stringify(draftBuildResult.draft, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeCode = (roadCode || 'ROAD_DRAFT')
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, '_')
    a.download = `${safeCode}_RoadGuard_GeometryDraft.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Đã tải tệp JSON tương thích RoadGuard GeometryDraftInput!')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-3xl max-h-[90vh] bg-[#111D2E] border border-[#27384E] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#E8EEF6]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0B1220] border-b border-[#27384E] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileJson className="w-5 h-5 text-[#F06421]" />
            <div>
              <h3 className="text-[14px] font-bold tracking-wide uppercase text-[#E8EEF6]">
                Xuất JSON Tương Thích RoadGuard (GeometryDraftInput)
              </h3>
              <p className="text-[11.5px] text-[#8FA3BA]">
                Chuẩn hóa theo hợp đồng đầu vào nhánh{' '}
                <code className="font-mono text-[#22B7C9]">
                  sourceKind = &quot;COORDINATES&quot;
                </code>{' '}
                (UTM EPSG:32648 / EPSG:32649)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#17263C] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 select-text">
          {/* Synthetic Test Benchmark Notice */}
          {isSyntheticSample && (
            <div className="p-3 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/60 text-[#F59E0B] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[12.5px]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#F59E0B]" />
                <span>DỮ LIỆU MINH HỌA – KHÔNG PHẢI TIM TUYẾN THỰC ĐỊA</span>
              </div>
              <div className="text-[11.5px] text-[#CBD5E1] leading-relaxed">
                Tuyến mẫu 3 điểm hình chữ L (204.03 m) chỉ phục vụ kiểm thử tính toán CRS, GeoJSON, dựng hình học và xuất JSON. Tọa độ minh họa không bám theo tim đường giao thông thực tế.
              </div>
            </div>
          )}
          {allLineStringFeatures.length > 1 && (
            <div className="p-3 rounded-md bg-[#17263C] border border-[#27384E] space-y-1.5">
              <label className="block text-[12px] font-bold text-[#22B7C9] uppercase">
                Chọn LineString làm tim tuyến xuất RoadGuard Draft (
                {allLineStringFeatures.length} tuyến):
              </label>
              <select
                value={selectedFeatureIdx}
                onChange={(e) => setSelectedFeatureIdx(Number(e.target.value))}
                className="w-full px-3 py-2 rounded bg-[#0B1220] border border-[#27384E] text-[12.5px] text-[#E8EEF6]"
              >
                {allLineStringFeatures.map((f, idx) => (
                  <option key={idx} value={idx}>
                    #{idx + 1} –{' '}
                    {f.properties?.name ||
                      f.properties?.roadName ||
                      f.properties?.layer ||
                      'LineString'}{' '}
                    ({f.geometry?.coordinates?.length || 0} đỉnh)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[12.5px] font-semibold text-[#C0CEDF]">
                  Mã tuyến đường (<code className="font-mono">roadCode</code>){' '}
                  <span className="text-[#EF4444]">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setRoadCode('GEO-RG-20261025-01')
                    if (!roadName)
                      setRoadName('Đường mẫu chuẩn bị cho RoadGuard')
                    setChangeReason('Tạo hình học tuyến ban đầu từ dữ liệu mẫu')
                  }}
                  className="text-[11.5px] text-[#22B7C9] hover:underline cursor-pointer"
                >
                  Điền mã mẫu chuẩn
                </button>
              </div>
              <input
                type="text"
                maxLength={80}
                value={roadCode}
                onChange={(e) => setRoadCode(e.target.value)}
                placeholder="Nhập mã tuyến thực tế (tối đa 80 ký tự)..."
                className="w-full px-3 py-2 rounded bg-[#0B1220] border border-[#27384E] focus:border-[#22B7C9] focus:outline-none text-[13px] font-mono text-[#E8EEF6]"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-semibold text-[#C0CEDF] mb-1">
                Tên tuyến đường (<code className="font-mono">roadName</code>)
              </label>
              <input
                type="text"
                maxLength={255}
                value={roadName}
                onChange={(e) => setRoadName(e.target.value)}
                placeholder="Tên tuyến đường (tùy chọn, <= 255 ký tự)"
                className="w-full px-3 py-2 rounded bg-[#0B1220] border border-[#27384E] focus:border-[#22B7C9] focus:outline-none text-[13px] text-[#E8EEF6]"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-semibold text-[#C0CEDF] mb-1">
                Hệ tọa độ phẳng dự án (<code className="font-mono">sourceCrs</code>)
              </label>
              <select
                value={sourceCrs}
                onChange={(e) => setSourceCrs(Number(e.target.value))}
                className="w-full px-3 py-2 rounded bg-[#0B1220] border border-[#27384E] focus:border-[#22B7C9] focus:outline-none text-[12.5px] font-mono text-[#E8EEF6] cursor-pointer"
              >
                <option value={32648}>
                  32648 — EPSG:32648 (WGS 84 / UTM zone 48N)
                </option>
                <option value={32649}>
                  32649 — EPSG:32649 (WGS 84 / UTM zone 49N)
                </option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[12.5px] font-semibold text-[#C0CEDF] mb-1">
                  Lý trình gốc (m)
                </label>
                <input
                  type="number"
                  step="1"
                  value={stationOriginMeters}
                  onChange={(e) => setStationOriginMeters(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0B1220] border border-[#27384E] text-[13px] font-mono text-[#E8EEF6]"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-[#C0CEDF] mb-1">
                  Bề rộng khảo sát (m)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={effectiveWidth}
                  value={surveyWidthMeters}
                  onChange={(e) => setSurveyWidthMeters(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0B1220] border border-[#27384E] text-[13px] font-mono text-[#E8EEF6]"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[12.5px] font-semibold text-[#C0CEDF] mb-1">
                Lý do tạo / cập nhật bản nháp (
                <code className="font-mono">changeReason</code>){' '}
                <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="text"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Nhập lý do khởi tạo hình học tuyến..."
                className="w-full px-3 py-2 rounded bg-[#0B1220] border border-[#27384E] focus:border-[#22B7C9] focus:outline-none text-[13px] text-[#E8EEF6]"
              />
            </div>
          </div>

          {/* Telemetry & Contract Status */}
          <div className="p-3.5 rounded-md bg-[#0B1220] border border-[#27384E] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#27384E] pb-2">
              <div className="flex items-center gap-2">
                {contractCheck.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-[#39B58A]" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                )}
                <span className="text-[12.5px] font-bold">
                  Kiểm tra hợp đồng GeometryEngine (14 quy tắc):
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[11.5px] font-mono font-bold ${
                  contractCheck.valid
                    ? 'bg-[#39B58A]/15 text-[#39B58A] border border-[#39B58A]/40'
                    : 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/40'
                }`}
              >
                {contractCheck.valid
                  ? 'PASS 14/14 RULES'
                  : `CHƯA ĐẠT (${contractCheck.errors.length} lỗi)`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[12px] font-mono">
              <div className="p-2 rounded bg-[#111D2E] border border-[#27384E]">
                <span className="text-[#8FA3BA] block text-[11px]">
                  Số đỉnh UTM hợp lệ:
                </span>
                <strong className="text-[#E8EEF6]">
                  {draftBuildResult.pointCount || 0} điểm
                </strong>
              </div>
              <div className="p-2 rounded bg-[#111D2E] border border-[#27384E]">
                <span className="text-[#8FA3BA] block text-[11px]">
                  Chiều dài UTM (toOffsetMeters):
                </span>
                <strong className="text-[#22B7C9]">
                  {Number(draftBuildResult.utmLengthMeters || 0).toFixed(6)} m
                </strong>
              </div>
              <div className="p-2 rounded bg-[#111D2E] border border-[#27384E]">
                <span className="text-[#8FA3BA] block text-[11px]">
                  widthMeters / surveyWidth:
                </span>
                <strong className="text-[#39B58A]">
                  {effectiveWidth}m / {surveyWidthMeters}m
                </strong>
              </div>
            </div>

            {!contractCheck.valid && contractCheck.errors.length > 0 && (
              <ul className="text-[12px] text-[#F59E0B] space-y-1 list-disc list-inside pt-1">
                {contractCheck.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>

          {/* JSON Preview */}
          {draftBuildResult.draft && (
            <div className="space-y-1.5">
              <div className="text-[12px] font-bold text-[#A9B9CE] uppercase">
                Xem trước Payload JSON (GeometryDraftInput):
              </div>
              <pre className="p-3.5 rounded-md bg-[#0B1220] border border-[#27384E] text-[12px] font-mono text-[#E8EEF6] max-h-[220px] overflow-auto whitespace-pre-wrap">
                {JSON.stringify(draftBuildResult.draft, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0B1220] border-t border-[#27384E] flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-[#8FA3BA]">
            Tệp JSON độc lập dùng để nhập thủ công vào hệ thống RoadGuard chính.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyDraft}
              disabled={!contractCheck.valid || isSurfaceAreaProvisional}
              className="px-3.5 py-2 rounded-md bg-[#17263C] hover:bg-[#1E314D] disabled:opacity-50 border border-[#27384E] text-[12.5px] font-semibold text-[#E8EEF6] flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-[#39B58A]" /> : <Copy className="w-4 h-4 text-[#22B7C9]" />}
              <span>{copied ? 'Đã sao chép' : 'Sao chép JSON'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadDraft}
              disabled={!contractCheck.valid || isSurfaceAreaProvisional}
              className="px-4 py-2 rounded-md bg-[#F06421] hover:bg-[#FF7635] disabled:opacity-50 text-white text-[12.5px] font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải RoadGuard Draft (.json)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
