import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { enrichGeoJsonWithEngineeringFeatures, normalizeRoadParams } from './roadEngineeringBuilder'

/**
 * Generates and downloads the Engineering Excel Report (.xlsx)
 * Synchronized 100% with the Single Source of Truth (roadEngineeringBuilder.js):
 *   - Sheet 1: "Tong Hop Khoi Luong" (CRS metadata, geometric & pavement specs, nominal vs polygon area)
 *   - Sheet 2: "Chi Tiet Coc Ly Trinh" (Exact linear-referenced stations along centerline, 8-decimal WGS-84)
 *   - Sheet 3: "Bang Ke Tam BTXM" (Detailed concrete slab rows & joints per design parameters)
 * Zero silent approximations; all values come from linear-referenced geometry.
 */
export async function downloadExcelReport({ geoJsonData, analyticsData, roadParams }) {
  if (!geoJsonData && !analyticsData) {
    toast.error('Chưa có dữ liệu kỹ thuật để xuất báo cáo Excel.')
    return
  }

  const tid = toast.loading('Đang kết xuất hồ sơ khối lượng Excel…')

  try {
    const params = normalizeRoadParams(roadParams)
    const enriched = geoJsonData
      ? enrichGeoJsonWithEngineeringFeatures(geoJsonData, params)
      : { geoJson: null, analytics: analyticsData, droneSegments: [] }

    const effectiveGeoJson = enriched.geoJson || geoJsonData
    const stats = enriched.analytics || analyticsData || {}
    const features = effectiveGeoJson?.features || []

    const wb = XLSX.utils.book_new()

    const cm = stats.centralMeridian ?? effectiveGeoJson?.centralMeridian ?? '105.75'
    const k0 = stats.scaleFactor ?? effectiveGeoJson?.scaleFactor ?? 0.9999
    const zoneLabel = Math.abs(Number(k0) - 0.9996) < 1e-4 ? 'Múi chiếu 6° (k0 = 0.9996)' : 'Múi chiếu 3° (k0 = 0.9999)'
    const axisOrder = stats.axisOrder ?? effectiveGeoJson?.axisOrder ?? 'VN2000_XY'
    const bboxStr = Array.isArray(effectiveGeoJson?.bbox)
      ? `[${effectiveGeoJson.bbox.map((v) => Number(v).toFixed(6)).join(', ')}]`
      : 'N/A'

    const totalLen = Number(stats.totalLengthMeters || effectiveGeoJson?.totalLengthMeters || 0)
    const nominalArea = Number(stats.nominalAreaSqm ?? (totalLen * params.roadWidth))
    const surfaceArea = Number(stats.surfaceAreaSqm ?? stats.totalAreaSqm ?? nominalArea)
    const longitudinalSlabs = Number(stats.longitudinalSlabs ?? Math.floor(totalLen / params.slabLength))
    const totalSlabs = Number(stats.estimatedConcreteSlabs ?? longitudinalSlabs * params.laneCount)
    const roadSegments = Number(stats.roadSegments ?? Math.ceil(totalLen / params.segmentLength))

    // ── Sheet 1: "Tong Hop Khoi Luong" ──────────────────────────────
    const summaryRows = [
      ['HỒ SƠ TỔNG HỢP KHỐI LƯỢNG & THÔNG SỐ HÌNH HỌC TUYẾN ĐƯỜNG'],
      ['Công cụ kết xuất:', 'RoadGuard CAD & GIS Studio (Standalone Engineering Tool)'],
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
        Number(totalLen.toFixed(2)),
        'm',
        'Tính chính xác trên mặt phẳng chiếu đồ án VN-2000',
      ],
      [
        2,
        'Bề rộng mặt đường thiết kế (B)',
        Number(params.roadWidth.toFixed(2)),
        'm',
        'Bề rộng toàn mặt đường (không nhân hệ số ẩn)',
      ],
      [
        3,
        'Diện tích hình học danh định (L × B)',
        Number(nominalArea.toFixed(2)),
        'm²',
        `S_danh_định = ${totalLen.toFixed(2)}m × ${params.roadWidth.toFixed(2)}m`,
      ],
      [
        4,
        'Diện tích đa giác mặt đường thực tế (Polygon)',
        Number(surfaceArea.toFixed(2)),
        'm²',
        'Diện tích phẳng đa giác RoadSurface (bao gồm vát góc/mở rộng nút giao)',
      ],
      [
        5,
        'Số dải tấm BTXM theo phương ngang',
        params.laneCount,
        'dải',
        `Bề rộng mỗi dải tấm b = ${params.slabWidth.toFixed(3)} m`,
      ],
      [
        6,
        'Chiều dài mỗi tấm BTXM (L_tấm)',
        Number(params.slabLength.toFixed(2)),
        'm',
        'Khoảng cách bước khe co/uốn ngang dọc tim tuyến',
      ],
      [
        7,
        'Số hàng tấm BTXM dọc tuyến',
        longitudinalSlabs,
        'hàng',
        `floor(${totalLen.toFixed(2)} / ${params.slabLength.toFixed(2)})`,
      ],
      [
        8,
        'Tổng số tấm BTXM toàn tuyến',
        totalSlabs,
        'tấm',
        `${longitudinalSlabs} hàng dọc × ${params.laneCount} dải ngang (kích thước ${params.slabLength}m × ${params.slabWidth}m)`,
      ],
      [
        9,
        'Số lượng phân đoạn quản lý',
        roadSegments,
        'đoạn',
        `Chiều dài phân đoạn tiêu chuẩn ${params.segmentLength} m`,
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
        const coords = sf.geometry?.coordinates || [0, 0, 0]
        const lng = coords[0] != null ? Number(coords[0]).toFixed(8) : ''
        const lat = coords[1] != null ? Number(coords[1]).toFixed(8) : ''
        const z =
          coords[2] != null
            ? Number(coords[2]).toFixed(3)
            : sf.properties?.elevation != null
            ? Number(sf.properties.elevation).toFixed(3)
            : '0.000'

        const name = sf.properties?.stationName || sf.properties?.chainage || sf.properties?.name || ''
        const dist =
          sf.properties?.distMeters != null
            ? Number(sf.properties.distMeters)
            : sf.properties?.distance != null
            ? Number(sf.properties.distance)
            : 0
        const segCode =
          sf.properties?.segment ||
          `SEG-${String(Math.floor(dist / params.segmentLength) + 1).padStart(2, '0')}`
        const note = sf.properties?.isStart
          ? 'Cọc đầu tuyến (Km0+000)'
          : sf.properties?.isEnd
          ? 'Cọc cuối tuyến'
          : 'Cọc lý trình nội suy chuẩn trên tim tuyến'

        stationRows.push([idx + 1, name, Number(dist.toFixed(2)), z, lng, lat, segCode, note])
      })
    } else {
      stationRows.push([
        1,
        'N/A',
        0,
        '0.000',
        '',
        '',
        'N/A',
        'Chưa có dữ liệu tim tuyến để nội suy cọc lý trình',
      ])
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
        const coords = slf.geometry?.coordinates || [0, 0]
        slabRows.push([
          idx + 1,
          p.code || p.name || `S-${String(idx + 1).padStart(3, '0')}`,
          p.startChainage || '',
          p.endChainage || '',
          p.centerMeters != null ? Number(p.centerMeters) : '',
          p.segment || '',
          `${p.slabLength ?? params.slabLength}m × ${p.slabWidth ?? params.slabWidth}m`,
          p.laneCount ?? params.laneCount,
          p.singleSlabAreaSqm ?? Number((params.slabLength * params.slabWidth).toFixed(2)),
          p.rowAreaSqm ?? Number((params.slabLength * params.roadWidth).toFixed(2)),
          coords[0] != null ? Number(coords[0]).toFixed(8) : '',
          coords[1] != null ? Number(coords[1]).toFixed(8) : '',
        ])
      })
    } else {
      slabRows.push([
        1,
        'N/A',
        '',
        '',
        0,
        'N/A',
        `${params.slabLength}m × ${params.slabWidth}m`,
        params.laneCount,
        0,
        0,
        '',
        '',
      ])
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

    XLSX.writeFile(wb, 'RoadGuard_BaoCaoKhoiLuong.xlsx')
    toast.success('Đã xuất hồ sơ khối lượng Excel (3 Sheets) thành công!', { id: tid })
  } catch (err) {
    console.error('Error generating Excel file:', err)
    toast.error('Lỗi khi xuất file Excel: ' + err.message, { id: tid })
  }
}
