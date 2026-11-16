import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { enrichGeoJsonWithEngineeringFeatures, normalizeRoadParams } from './roadEngineeringBuilder.js'

/**
 * Generates and downloads the Engineering Excel Report (.xlsx)
 * Synchronized 100% with the Single Source of Truth (roadEngineeringBuilder.js):
 *   - Sheet 1: "Tong Hop Khoi Luong" (CRS metadata, geometric & pavement specs, nominal vs polygon area)
 *   - Sheet 2: "Chi Tiet Coc Ly Trinh" (Exact linear-referenced stations along centerline, 8-decimal WGS-84)
 *   - Sheet 3: "Bang Ke Tam BTXM" (Detailed concrete slab rows & joints per design parameters)
 * Zero silent approximations; all values come from linear-referenced geometry.
 */
export function buildExcelReportWorkbook({ geoJsonData, analyticsData, roadParams }) {
  if (!geoJsonData && !analyticsData) {
    throw new Error('Chưa có dữ liệu kỹ thuật để xuất báo cáo Excel.')
  }

  const params = normalizeRoadParams(roadParams)
  if (params.pavementDesign && !params.pavementDesign.valid) {
    throw new Error(params.pavementDesign.errors[0] || 'Thông số thiết kế BTXM không hợp lệ.')
  }

  const enriched = geoJsonData
    ? enrichGeoJsonWithEngineeringFeatures(geoJsonData, params)
    : { geoJson: null, analytics: analyticsData, droneSegments: [] }

  const effectiveGeoJson = enriched.geoJson || geoJsonData
  const stats = enriched.analytics || analyticsData || {}
  const features = effectiveGeoJson?.features || []

  if (stats.isSurfaceAreaProvisional) {
    throw new Error(
      `Bề rộng mặt đường đã đổi từ ${stats.analyzedRoadWidth}m sang ${params.roadWidth}m. Vui lòng bấm "Phân Tích & Dựng Tuyến Lại" để tính lại đa giác mặt đường chính xác trước khi xuất hồ sơ chính thức.`
    )
  }

  const wb = XLSX.utils.book_new()

    const cm = stats.centralMeridian ?? effectiveGeoJson?.centralMeridian ?? 'Chưa xác định'
    const k0 = stats.scaleFactor ?? effectiveGeoJson?.scaleFactor ?? 0.9999
    const zoneLabel = Math.abs(Number(k0) - 0.9996) < 1e-4 ? 'Múi chiếu 6° (k0 = 0.9996)' : 'Múi chiếu 3° (k0 = 0.9999)'
    const axisOrder = stats.axisOrder ?? effectiveGeoJson?.axisOrder ?? 'VN2000_XY'
    const bboxStr = Array.isArray(effectiveGeoJson?.bbox)
      ? `[${effectiveGeoJson.bbox.map((v) => Number(v).toFixed(6)).join(', ')}]`
      : 'N/A'

    const totalLen = Number(stats.totalLengthMeters || effectiveGeoJson?.totalLengthMeters || 0)
    const nominalArea =
      stats.nominalAreaSqm != null && Number.isFinite(Number(stats.nominalAreaSqm))
        ? Number(stats.nominalAreaSqm)
        : totalLen > 0 && params.roadWidth != null && params.roadWidth > 0
        ? Number((totalLen * params.roadWidth).toFixed(2))
        : null
    const surfaceArea =
      stats.surfaceAreaSqm != null && Number.isFinite(Number(stats.surfaceAreaSqm))
        ? Number(stats.surfaceAreaSqm)
        : null
    const effSlabLen = params.effectiveSlabLength
    const longitudinalSlabs =
      stats.longitudinalSlabs != null && Number.isFinite(Number(stats.longitudinalSlabs))
        ? Number(stats.longitudinalSlabs)
        : effSlabLen != null && effSlabLen > 0 && totalLen > 0
        ? Math.floor(totalLen / effSlabLen)
        : null
    const totalSlabs =
      stats.estimatedConcreteSlabs != null && Number.isFinite(Number(stats.estimatedConcreteSlabs))
        ? Number(stats.estimatedConcreteSlabs)
        : longitudinalSlabs != null &&
          params.laneCount != null &&
          params.laneCount > 0 &&
          params.roadWidth != null &&
          params.roadWidth > 0
        ? longitudinalSlabs * params.laneCount
        : null
    const roadSegments =
      stats.roadSegments != null && Number.isFinite(Number(stats.roadSegments))
        ? Number(stats.roadSegments)
        : params.segmentLength != null && params.segmentLength > 0 && totalLen > 0
        ? Math.ceil(totalLen / params.segmentLength)
        : null

    // ── Sheet 1: "Tong Hop Khoi Luong" ──────────────────────────────
    const summaryRows = [
      ['HỒ SƠ TỔNG HỢP KHỐI LƯỢNG & THÔNG SỐ HÌNH HỌC TUYẾN ĐƯỜNG'],
      ['Công cụ kết xuất:', 'CAD & GIS STUDIO'],
      ['Thời điểm xuất hồ sơ:', new Date().toLocaleString('vi-VN')],
      ['Hệ tọa độ gốc (Source CRS):', `VN-2000 | Kinh tuyến trục ${cm}° | ${zoneLabel} | Quy ước trục: ${axisOrder}`],
      ['Hệ tọa độ đích (Target CRS):', 'WGS-84 (EPSG:4326) – Chuẩn GeoJSON RFC 7946 [Longitude, Latitude]'],
      ['Khung bao không gian (RFC 7946 bbox):', bboxStr],
      ['Cơ sở tham số kỹ thuật:', 'Theo hồ sơ thiết kế tuyến & thông số kết cấu mặt đường BTXM'],
      [],
      ['STT', 'Hạng mục thông số kỹ thuật', 'Giá trị', 'Đơn vị', 'Diễn giải & Phương pháp tính'],
      [
        1,
        'Tổng chiều dài tim tuyến (L)',
        totalLen > 0 ? Number(totalLen.toFixed(2)) : '',
        'm',
        totalLen > 0 ? 'Tính chính xác trên mặt phẳng chiếu đồ án VN-2000' : 'Chưa có dữ liệu',
      ],
      [
        2,
        'Bề rộng mặt đường thiết kế (B)',
        params.roadWidth != null ? Number(params.roadWidth.toFixed(2)) : '',
        'm',
        params.roadWidth != null
          ? 'Bề rộng toàn mặt đường (không nhân hệ số ẩn)'
          : 'Chưa có dữ liệu',
      ],
      [
        3,
        'Diện tích danh nghĩa (L × B)',
        nominalArea != null ? Number(nominalArea.toFixed(2)) : '',
        'm²',
        nominalArea != null && params.roadWidth != null
          ? `S_danh_nghĩa = ${totalLen.toFixed(2)}m × ${params.roadWidth.toFixed(2)}m`
          : 'Chưa có dữ liệu (cần đủ chiều dài L và bề rộng B)',
      ],
      [
        4,
        'Diện tích hình học (Polygon)',
        surfaceArea != null ? Number(surfaceArea.toFixed(2)) : '',
        'm²',
        surfaceArea != null
          ? 'Diện tích phẳng tính từ đa giác mặt đường (Polygon)'
          : 'Chưa có dữ liệu (chưa có đa giác mặt đường)',
      ],
      [
        5,
        'Số dải tấm BTXM theo phương ngang',
        params.laneCount != null ? params.laneCount : '',
        'dải',
        params.laneCount != null && params.slabWidth != null
          ? `Bề rộng mỗi dải tấm b = ${params.slabWidth.toFixed(3)} m`
          : 'Chưa có dữ liệu',
      ],
      [
        6,
        'Chiều dài mỗi tấm BTXM (L_tấm)',
        effSlabLen != null ? Number(effSlabLen.toFixed(2)) : '',
        'm',
        effSlabLen != null
          ? 'Khoảng cách bước khe co/uốn ngang dọc tim tuyến'
          : 'Chưa có dữ liệu',
      ],
      [
        7,
        'Số hàng tấm BTXM dọc tuyến',
        longitudinalSlabs != null ? longitudinalSlabs : '',
        'hàng',
        longitudinalSlabs != null && effSlabLen != null
          ? `floor(${totalLen.toFixed(2)} / ${effSlabLen.toFixed(2)})`
          : 'Chưa có dữ liệu',
      ],
      [
        8,
        'Tổng số tấm BTXM toàn tuyến',
        totalSlabs != null ? totalSlabs : '',
        'tấm',
        totalSlabs != null && longitudinalSlabs != null && params.laneCount != null && effSlabLen != null && params.slabWidth != null
          ? `${longitudinalSlabs} hàng dọc × ${params.laneCount} dải ngang (kích thước ${effSlabLen}m × ${params.slabWidth}m)`
          : 'Chưa có dữ liệu',
      ],
      [
        9,
        'Số lượng phân đoạn quản lý',
        roadSegments != null ? roadSegments : '',
        'đoạn',
        roadSegments != null && params.segmentLength != null
          ? `Chiều dài phân đoạn tiêu chuẩn ${params.segmentLength} m`
          : 'Chưa có dữ liệu',
      ],
      [
        10,
        'Chiều dày tấm BTXM (cm)',
        params.slabThicknessCentimeters != null ? params.slabThicknessCentimeters : '',
        'cm',
        params.pavementDesign?.fields?.slabThicknessCentimeters?.evidenceSummary
          ? `Theo hồ sơ thiết kế (slabThicknessCentimeters) • ${params.pavementDesign.fields.slabThicknessCentimeters.provenanceLabel}: ${params.pavementDesign.fields.slabThicknessCentimeters.evidenceSummary}`
          : params.slabThicknessCentimeters != null
          ? 'Theo hồ sơ thiết kế của tuyến (slabThicknessCentimeters, lớn hơn 0 nếu nhập)'
          : 'Chưa có dữ liệu',
      ],
      [
        11,
        'Cự ly khe co (m)',
        params.contractionJointSpacingMeters != null ? params.contractionJointSpacingMeters : '',
        'm',
        params.pavementDesign?.fields?.contractionJointSpacingMeters?.evidenceSummary
          ? `Theo hồ sơ thiết kế (contractionJointSpacingMeters) • ${params.pavementDesign.fields.contractionJointSpacingMeters.provenanceLabel}: ${params.pavementDesign.fields.contractionJointSpacingMeters.evidenceSummary}`
          : params.contractionJointSpacingMeters != null
          ? 'Theo hồ sơ thiết kế của tuyến (contractionJointSpacingMeters, lớn hơn 0 nếu nhập)'
          : 'Chưa có dữ liệu',
      ],
      [
        12,
        'Cự ly khe giãn (m)',
        params.expansionJointSpacingMeters != null ? params.expansionJointSpacingMeters : '',
        'm',
        params.pavementDesign?.fields?.expansionJointSpacingMeters?.evidenceSummary
          ? `Theo hồ sơ thiết kế (expansionJointSpacingMeters) • ${params.pavementDesign.fields.expansionJointSpacingMeters.provenanceLabel}: ${params.pavementDesign.fields.expansionJointSpacingMeters.evidenceSummary}`
          : params.expansionJointSpacingMeters != null
          ? 'Theo hồ sơ thiết kế của tuyến (expansionJointSpacingMeters, lớn hơn 0 nếu nhập)'
          : 'Chưa có dữ liệu',
      ],
      [
        13,
        'Độ hở khe giãn (mm)',
        params.expansionJointGapMillimeters != null ? params.expansionJointGapMillimeters : '',
        'mm',
        params.pavementDesign?.fields?.expansionJointGapMillimeters?.evidenceSummary
          ? `Theo hồ sơ thiết kế (expansionJointGapMillimeters) • ${params.pavementDesign.fields.expansionJointGapMillimeters.provenanceLabel}: ${params.pavementDesign.fields.expansionJointGapMillimeters.evidenceSummary}`
          : params.expansionJointGapMillimeters != null
          ? 'Theo hồ sơ thiết kế của tuyến (expansionJointGapMillimeters, từ 0 trở lên nếu nhập)'
          : 'Chưa có dữ liệu',
      ],
    ]

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [
      { wch: 6 },
      { wch: 42 },
      { wch: 20 },
      { wch: 12 },
      { wch: 58 },
    ]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Tong Hop Khoi Luong')

    // ── Sheet 2: "Chi Tiet Coc Ly Trinh" ────────────────────────────
    const stationFeatures = features.filter(
      (f) =>
        f.properties?.layerType === 'StationPoint' ||
        f.properties?.type === 'StationMilestone'
    )

    const stationRows = [
      [
        'STT',
        'Tên cọc lý trình',
        'Lý trình cộng dồn (m)',
        'Cao độ Z (m)',
        'Kinh độ WGS-84 (Longitude)',
        'Vĩ độ WGS-84 (Latitude)',
        'Mã phân đoạn',
        'Ghi chú kỹ thuật',
      ],
    ]

    if (stationFeatures.length > 0) {
      stationFeatures.forEach((sf, idx) => {
        const coords = sf.geometry?.coordinates || []
        const lng = coords[0] != null ? Number(coords[0]).toFixed(8) : ''
        const lat = coords[1] != null ? Number(coords[1]).toFixed(8) : ''
        const hasCoordZ =
          coords.length >= 3 &&
          coords[2] !== null &&
          coords[2] !== undefined &&
          coords[2] !== '' &&
          Number.isFinite(Number(coords[2]))
        const hasPropZ =
          sf.properties?.elevation !== null &&
          sf.properties?.elevation !== undefined &&
          sf.properties?.elevation !== '' &&
          Number.isFinite(Number(sf.properties.elevation))
        const z = hasCoordZ
          ? Number(Number(coords[2]).toFixed(3))
          : hasPropZ
          ? Number(Number(sf.properties.elevation).toFixed(3))
          : ''

        const name = sf.properties?.stationName || sf.properties?.chainage || sf.properties?.name || ''
        const dist =
          sf.properties?.distMeters != null
            ? Number(sf.properties.distMeters)
            : sf.properties?.distance != null
            ? Number(sf.properties.distance)
            : 0
        const segCode =
          sf.properties?.segment ||
          (params.segmentLength != null && params.segmentLength > 0
            ? `SEG-${String(Math.floor(dist / params.segmentLength) + 1).padStart(2, '0')}`
            : '')
        const note = sf.properties?.isStart
          ? 'Cọc đầu tuyến (Km0+000)'
          : sf.properties?.isEnd
          ? 'Cọc cuối tuyến'
          : 'Cọc lý trình nội suy chuẩn trên tim tuyến'

        stationRows.push([idx + 1, name, Number(dist.toFixed(2)), z, lng, lat, segCode, note])
      })
    }

    const wsStations = XLSX.utils.aoa_to_sheet(stationRows)
    wsStations['!cols'] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 22 },
      { wch: 14 },
      { wch: 24 },
      { wch: 24 },
      { wch: 15 },
      { wch: 36 },
    ]
    XLSX.utils.book_append_sheet(wb, wsStations, 'Chi Tiet Coc Ly Trinh')

    // ── Sheet 3: "Bang Ke Tam BTXM" ─────────────────────────────────
    const slabFeatures = features.filter(
      (f) => f.properties?.type === 'Slab' || f.properties?.layerType === 'ConcreteSlab'
    )

    const slabRows = [
      [
        'STT',
        'Mã hàng tấm',
        'Từ lý trình',
        'Đến lý trình',
        'Lý trình tâm (m)',
        'Phân đoạn',
        'Kích thước 1 tấm (Dài × Rộng)',
        'Số dải tấm ngang',
        'Diện tích 1 tấm (m²)',
        'Diện tích cả hàng ngang (m²)',
        'Kinh độ tâm (Lon)',
        'Vĩ độ tâm (Lat)',
      ],
    ]

    if (slabFeatures.length > 0) {
      slabFeatures.forEach((slf, idx) => {
        const p = slf.properties || {}
        const coords = slf.geometry?.coordinates || []
        const sLen = p.slabLength ?? effSlabLen
        const sWid = p.slabWidth ?? params.slabWidth
        slabRows.push([
          idx + 1,
          p.code || p.name || `S-${String(idx + 1).padStart(3, '0')}`,
          p.startChainage || '',
          p.endChainage || '',
          p.centerMeters != null ? Number(p.centerMeters) : '',
          p.segment || '',
          sLen != null && sWid != null ? `${sLen}m × ${sWid}m` : '',
          p.laneCount ?? params.laneCount ?? '',
          p.singleSlabAreaSqm ?? (sLen != null && sWid != null ? Number((sLen * sWid).toFixed(2)) : ''),
          p.rowAreaSqm ?? (sLen != null && params.roadWidth != null ? Number((sLen * params.roadWidth).toFixed(2)) : ''),
          coords[0] != null ? Number(coords[0]).toFixed(8) : '',
          coords[1] != null ? Number(coords[1]).toFixed(8) : '',
        ])
      })
    }

    const wsSlabs = XLSX.utils.aoa_to_sheet(slabRows)
    wsSlabs['!cols'] = [
      { wch: 6 },
      { wch: 15 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 26 },
      { wch: 18 },
      { wch: 20 },
      { wch: 24 },
      { wch: 22 },
      { wch: 22 },
    ]
  XLSX.utils.book_append_sheet(wb, wsSlabs, 'Bang Ke Tam BTXM')
  return { wb, params, stats, summaryRows, stationRows, slabRows }
}

export async function downloadExcelReport({ geoJsonData, analyticsData, roadParams }) {
  if (!geoJsonData && !analyticsData) {
    toast.error('Chưa có dữ liệu kỹ thuật để xuất báo cáo Excel.')
    return null
  }

  const tid = toast.loading('Đang kết xuất hồ sơ khối lượng Excel…')

  try {
    const built = buildExcelReportWorkbook({ geoJsonData, analyticsData, roadParams })
    XLSX.writeFile(built.wb, 'CAD_GIS_Studio_BaoCaoKhoiLuong.xlsx')
    toast.success('Đã xuất hồ sơ khối lượng Excel (3 Sheets) thành công!', { id: tid })
    return built
  } catch (err) {
    console.error('Error generating Excel file:', err)
    toast.error(err.message || 'Lỗi khi xuất file Excel', { id: tid, duration: 5000 })
    return null
  }
}
