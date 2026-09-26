import * as XLSX from 'xlsx'
import axios from 'axios'
import toast from 'react-hot-toast'

/**
 * Generates and downloads the 2-sheet Excel report
 * Sheet 1: "Tong Hop Khoi Luong"
 * Sheet 2: "Chi Tiet Coc Ly Trinh"
 */
export async function downloadExcelReport({ geoJsonData, analyticsData, roadParams }) {
  const tid = toast.loading('Đang chuẩn bị báo cáo Excel…')

  // 1. First attempt to call the Backend API endpoint if available
  try {
    const res = await axios.get('http://localhost:5198/api/cad/export-excel', {
      responseType: 'blob',
      timeout: 2500,
    })
    if (res.status === 200 && res.data && res.data.size > 0) {
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', 'RoadGuard_BaoCaoKhoiLuong.xlsx')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
      toast.success('Đã tải báo cáo Excel từ máy chủ!', { id: tid })
      return
    }
  } catch (err) {
    // If backend endpoint is not yet wired or returns 404, fallback cleanly to client-side ClosedXML-compatible spreadsheet
    console.info('Backend export-excel not responding, generating client-side .xlsx report...', err?.message)
  }

  // 2. Client-side Generation using SheetJS (XLSX)
  try {
    const wb = XLSX.utils.book_new()

    // ── Sheet 1: "Tong Hop Khoi Luong" ──────────────────────────────
    const summaryRows = [
      ['BÁO CÁO TỔNG HỢP KHỐI LƯỢNG THIẾT KẾ ĐƯỜNG BÊ TÔNG XI MĂNG'],
      ['Hệ thống:', 'RoadGuard CAD/GIS Engineering Command Center'],
      ['Thời điểm xuất báo cáo:', new Date().toLocaleString('vi-VN')],
      ['Quy chuẩn áp dụng:', 'TCVN 4054:2005 / TCVN 10380:2014 (Mặt đường BTXM)'],
      ['Hệ quy chiếu tọa độ:', 'WGS84 / EPSG:4326'],
      [],
      ['STT', 'Hạng mục thông số kỹ thuật', 'Giá trị', 'Đơn vị tính', 'Ghi chú'],
      [
        1,
        'Tổng chiều dài tuyến',
        analyticsData?.totalLengthMeters != null
          ? Number(analyticsData.totalLengthMeters).toFixed(2)
          : '0.00',
        'm',
        'Tính từ tim tuyến CAD',
      ],
      [
        2,
        'Tổng diện tích mặt đường',
        analyticsData?.totalAreaSqm != null
          ? Number(analyticsData.totalAreaSqm).toFixed(2)
          : '0.00',
        'm²',
        'Diện tích đa giác RoadSurface 2D',
      ],
      [
        3,
        'Bề rộng mặt đường thiết kế',
        roadParams?.roadWidth || '3.5',
        'm',
        'Khoảng cách 2 mép đường',
      ],
      [
        4,
        'Chiều dài tấm BTXM tiêu chuẩn',
        roadParams?.slabLength || '4.0',
        'm',
        'Khoảng cách khe co dãn ngang',
      ],
      [
        5,
        'Ước tính số tấm BTXM (TCVN)',
        analyticsData?.estimatedConcreteSlabs || 0,
        'tấm',
        'Số tấm BTXM trên toàn tuyến',
      ],
      [
        6,
        'Số lượng phân đoạn thi công',
        analyticsData?.roadSegments || 0,
        'đoạn',
        `Mỗi đoạn ${roadParams?.segmentLength || 100}m`,
      ],
      [
        7,
        'Thời gian xử lý không gian (Z-Axis / GIS)',
        analyticsData?.processingTimeMs || 0,
        'ms',
        'Hiệu năng backend NTS',
      ],
    ]

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [
      { wch: 6 },
      { wch: 40 },
      { wch: 18 },
      { wch: 14 },
      { wch: 35 },
    ]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Tong Hop Khoi Luong')

    // ── Sheet 2: "Chi Tiet Coc Ly Trinh" ────────────────────────────
    const features = geoJsonData?.features || []
    
    // Find StationPoint features or fallback to Point features / LineString coords
    let stationFeatures = features.filter(
      (f) => f.properties?.layerType === 'StationPoint'
    )

    if (stationFeatures.length === 0) {
      stationFeatures = features.filter((f) => f.geometry?.type === 'Point')
    }

    const stationRows = [
      [
        'STT',
        'Tên cọc lý trình',
        'Lý trình dồn (m)',
        'Cao độ Z (m)',
        'Kinh độ (Longitude)',
        'Vĩ độ (Latitude)',
        'Phân đoạn',
        'Ghi chú kỹ thuật',
      ],
    ]

    if (stationFeatures.length > 0) {
      stationFeatures.forEach((sf, idx) => {
        const coords = sf.geometry?.coordinates || [0, 0, 0]
        const lng = coords[0] != null ? Number(coords[0]).toFixed(7) : ''
        const lat = coords[1] != null ? Number(coords[1]).toFixed(7) : ''
        const z =
          coords[2] != null
            ? Number(coords[2]).toFixed(3)
            : sf.properties?.elevation != null
            ? Number(sf.properties.elevation).toFixed(3)
            : sf.properties?.z != null
            ? Number(sf.properties.z).toFixed(3)
            : '0.000'

        const name =
          sf.properties?.stationName || sf.properties?.name || `Km0+${String(idx * 100).padStart(3, '0')}`
        const dist =
          sf.properties?.distance != null
            ? sf.properties.distance
            : idx * Number(roadParams?.segmentLength || 100)
        const segment = Math.floor(dist / Number(roadParams?.segmentLength || 100)) + 1

        stationRows.push([
          idx + 1,
          name,
          dist,
          z,
          lng,
          lat,
          `Đoạn ${segment}`,
          'Cọc tim tuyến thiết kế GPS',
        ])
      })
    } else {
      // Fallback: If line exists, extract stations from line coordinates
      const lineFeature = features.find((f) => f.geometry?.type === 'LineString')
      if (lineFeature && Array.isArray(lineFeature.geometry?.coordinates)) {
        lineFeature.geometry.coordinates.forEach((pt, idx) => {
          const lng = pt[0] != null ? Number(pt[0]).toFixed(7) : ''
          const lat = pt[1] != null ? Number(pt[1]).toFixed(7) : ''
          const z = pt[2] != null ? Number(pt[2]).toFixed(3) : '0.000'
          const dist = idx * 20 // approx
          stationRows.push([
            idx + 1,
            `Cọc ${idx + 1}`,
            dist,
            z,
            lng,
            lat,
            `Đoạn ${Math.floor(dist / 100) + 1}`,
            'Điểm tim đường CAD',
          ])
        })
      } else {
        stationRows.push([1, 'Km0+000', 0, '0.000', '', '', 'Đoạn 1', 'Chưa có dữ liệu cọc'])
      }
    }

    const wsStations = XLSX.utils.aoa_to_sheet(stationRows)
    wsStations['!cols'] = [
      { wch: 6 },
      { wch: 20 },
      { wch: 18 },
      { wch: 15 },
      { wch: 22 },
      { wch: 22 },
      { wch: 14 },
      { wch: 28 },
    ]
    XLSX.utils.book_append_sheet(wb, wsStations, 'Chi Tiet Coc Ly Trinh')

    // Write file
    XLSX.writeFile(wb, 'RoadGuard_BaoCaoKhoiLuong.xlsx')
    toast.success('Đã tải báo cáo Excel thành công!', { id: tid })
  } catch (err) {
    console.error('Error generating Excel file:', err)
    toast.error('Lỗi khi xuất file Excel: ' + err.message, { id: tid })
  }
}
