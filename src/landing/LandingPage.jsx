import { useEffect, useRef, useState } from 'react'
import { ArrowRight, X, ZoomIn, Layers, MapPin, Compass, FileCheck, CheckCircle2 } from 'lucide-react'
import { linkHandler } from '../navigation'

/* ─────────────────────────────────────────────────────────────
 * Nội dung — CAD & GIS STUDIO Landing Page V2 (Technical Editorial)
 * ───────────────────────────────────────────────────────────── */

const NAV = [
  { id: 'tinh-nang', label: 'Năng lực cốt lõi' },
  { id: 'quy-trinh', label: 'Quy trình kỹ thuật' },
  { id: 'giao-dien', label: '4 Chế độ hiển thị' },
  { id: 'luu-y', label: 'Lưu ý trắc địa' },
]

const PILLARS = [
  {
    idx: '01',
    title: 'Bóc tách & Xử lý CAD Chuyên sâu',
    desc: 'Đọc và phân tích trực tiếp tệp AutoCAD DXF độc lập. Tự động nhận diện cấu trúc layer, lọc rác kỹ thuật và đề xuất layer tim tuyến tối ưu.',
    bullets: [
      'Bóc tách tim tuyến chính, các nhánh rẽ và đảo giao thông',
      'Tính toán chiều dài thực tế (m) và diện tích mặt đường (m²)',
      'Hỗ trợ xem bản vẽ CAD 2D tương tác bật/tắt từng layer'
    ]
  },
  {
    idx: '02',
    title: 'Chuyển đổi Hệ quy chiếu (CRS) Chuẩn xác',
    desc: 'Hệ thống chuyển đổi tọa độ trắc địa hai chiều VN-2000 ↔ WGS-84 theo Thông tư 973/2001/TT-TCĐC với bộ 7 tham số biến đổi Helmert Bursa-Wolf.',
    bullets: [
      'Hỗ trợ toàn diện Múi 3° (k₀=0.9999) và Múi 6° (k₀=0.9996)',
      'Tra cứu sẵn kinh tuyến trục L₀ của 63 tỉnh thành Việt Nam',
      'Tự động phát hiện và hỗ trợ hoán đổi thứ tự trục X Bắc / Y Đông'
    ]
  },
  {
    idx: '03',
    title: 'Mô hình hóa Hình học Tuyến & Bản đồ GIS',
    desc: 'Trực quan hóa tuyến đường trên nền ảnh vệ tinh độ phân giải cao và bản đồ số đường phố qua nền tảng MapLibre GL JS mã nguồn mở.',
    bullets: [
      'Sinh cọc lý trình tự động (Km, H1-H9) theo bước cọc tùy chỉnh',
      'Chia tấm bê tông xi măng (BTXM) và định vị khe co giãn',
      'Phân đoạn tuyến phục vụ công tác bay chụp drone và khảo sát'
    ]
  },
  {
    idx: '04',
    title: 'Xuất Hồ sơ & Dữ liệu Kỹ thuật Độc lập',
    desc: 'Xuất dữ liệu không gian và số liệu kỹ thuật ra các định dạng chuẩn quốc tế, độc lập hoàn toàn với cơ sở dữ liệu hay hạ tầng bên ngoài.',
    bullets: [
      'GeoJSON chuẩn RFC 7946 khép kín vòng tọa độ và chuẩn hóa [lon, lat]',
      'Báo cáo khối lượng kỹ thuật Excel (.xlsx) 3 bảng tính chi tiết',
      'RoadGuard Geometry Draft JSON đáp ứng 14/14 quy tắc hợp đồng kỹ thuật'
    ]
  }
]

const STEPS = [
  {
    n: '01',
    title: 'Nhập dữ liệu đầu vào',
    text: 'Tải lên bản vẽ AutoCAD (.DXF), dán bảng tọa độ trắc địa VN-2000 hoặc nhập tệp GeoJSON WGS-84 chuẩn RFC 7946.'
  },
  {
    n: '02',
    title: 'Cấu hình CRS & Phân tích',
    text: 'Thiết lập kinh tuyến trục L₀, múi chiếu k₀, kiểm tra thứ tự trục X/Y và bóc tách tim tuyến cùng dải mặt đường.'
  },
  {
    n: '03',
    title: 'Kiểm tra & Xuất hồ sơ',
    text: 'Rà soát đồng bộ trên 4 chế độ hiển thị (GIS, CAD 2D, Mặt cắt, GeoJSON) và xuất báo cáo Excel hoặc JSON kỹ thuật.'
  },
]

const VIEWS = [
  {
    id: 'cad',
    tab: 'CAD 2D',
    badge: 'Bản vẽ gốc',
    src: '/landing/workspace-cad-2d.jpg',
    title: 'Bản vẽ kỹ thuật CAD 2D (.DXF)',
    text: 'Trực quan hóa trực tiếp các thực thể bản vẽ DXF gốc, kiểm tra cấu trúc từng lớp (layer), đường bao mép đường và tim tuyến song song với bản đồ GIS.',
    alt: 'Ảnh chụp chế độ Bản vẽ CAD 2D trong CAD & GIS STUDIO hiển thị bản vẽ DXF theo từng lớp kỹ thuật',
  },
  {
    id: 'gis',
    tab: 'GIS Map',
    badge: 'Ảnh vệ tinh',
    src: '/landing/workspace-gis-map.jpg',
    title: 'Bản đồ GIS & Không gian Địa lý',
    text: 'Tuyến đường và dải mặt đường bê tông được chuyển đổi sang WGS-84, hiển thị chuẩn xác trên ảnh vệ tinh MapLibre cùng hệ thống cọc lý trình Km và trắc địa hai hệ.',
    alt: 'Ảnh chụp chế độ Bản đồ GIS trong CAD & GIS STUDIO: tuyến đường trên ảnh vệ tinh, thanh bên trái nhập dữ liệu và bảng chỉ số bên phải',
  },
  {
    id: 'profile',
    tab: 'Mặt cắt & Hồ sơ',
    badge: 'TCVN 4054',
    src: '/landing/workspace-profile.jpg',
    title: 'Mặt cắt ngang và Hồ sơ kỹ thuật',
    text: 'Mô phỏng mặt cắt ngang kết cấu dải mặt đường bê tông theo thông số thiết kế, hỗ trợ kỹ sư theo dõi chiều rộng bề mặt B và các thông số hình học tuyến.',
    alt: 'Ảnh chụp chế độ Mặt cắt và Hồ sơ trong CAD & GIS STUDIO',
  },
  {
    id: 'json',
    tab: 'GeoJSON Inspector',
    badge: 'RFC 7946',
    src: '/landing/workspace-geojson.jpg',
    title: 'GeoJSON Inspector & Chuẩn hóa dữ liệu',
    text: 'Kiểm tra cú pháp dữ liệu không gian GeoJSON RFC 7946, vòng đa giác khép kín, bảng thuộc tính từng đối tượng và xuất RoadGuard Geometry Draft JSON.',
    alt: 'Ảnh chụp chế độ GeoJSON Inspector trong CAD & GIS STUDIO',
  },
]

const NOTES = [
  {
    title: 'Nguồn tọa độ và thứ tự trục',
    text: 'Studio hiển thị đúng hệ tọa độ của dữ liệu đầu vào (DXF/VN-2000 hoặc WGS-84). Ở chế độ AUTO, khi X/Y không đủ rõ ràng, người dùng được yêu cầu xác nhận thứ tự trục.',
  },
  {
    title: 'Phạm vi độ chính xác trắc địa',
    text: 'Phép chuyển đổi đã được đối chiếu số học với thư viện PROJ/pyproj (sai lệch khứ hồi dưới 1 mm). Chưa có điểm khống chế thực địa độc lập, nên chưa xác nhận độ chính xác tuyệt đối ngoài hiện trường.',
  },
  {
    title: 'Định dạng và dữ liệu cao độ',
    text: 'Hỗ trợ định dạng DXF chuẩn công nghiệp. Mặt cắt ngang sử dụng cấu hình tham chiếu khi bản vẽ không gắn cao độ thực Z; cần đối chiếu với hồ sơ trắc dọc trắc ngang.',
  },
  {
    title: 'Tệp JSON kỹ thuật độc lập',
    text: 'Tệp RoadGuard Draft JSON được kiểm tra theo 14 quy tắc hợp đồng GeometryEngine. Công cụ hoàn toàn độc lập, không kết nối trực tiếp vào database hay API của hệ thống chính.',
  },
]

/* ───────────────────────────── Thành phần dùng chung ───────────────────────────── */

function Brand({ size = 'md' }) {
  const box = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
  return (
    <span className="inline-flex items-center gap-3">
      <span className={`${box} shrink-0 rounded bg-white p-0.5 border border-[#27384E] overflow-hidden`}>
        <img
          src="/brand/hoang-hai-logo-original.png"
          alt="Logo Công ty TNHH Xây dựng Bê tông Hoàng Hải"
          width="1024"
          height="1024"
          className="w-full h-full object-contain"
        />
      </span>
      <span className="text-[15px] font-bold tracking-wider text-[#E8EEF6] whitespace-nowrap">
        CAD &amp; GIS STUDIO
      </span>
    </span>
  )
}

function OpenStudio({ children = 'Mở Studio', className = '', size = 'md' }) {
  const pad = size === 'lg' ? 'px-6 py-3.5 text-[15px]' : 'px-4 py-2 text-[13.5px]'
  return (
    <a
      href="/studio"
      onClick={linkHandler('/studio')}
      className={`inline-flex items-center justify-center gap-2 rounded-md bg-[#F06421] hover:bg-[#FF7635] text-white font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F06421] ${pad} ${className}`}
    >
      {children}
      {size === 'lg' && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
    </a>
  )
}

function Shot({ src, alt, title = '', eager = false, onZoom, className = '' }) {
  return (
    <div className="relative group rounded-lg border border-[#27384E] bg-[#111D2E] overflow-hidden shadow-2xl">
      <img
        src={src}
        alt={alt}
        width="1920"
        height="1080"
        loading={eager ? undefined : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        className={`block h-auto w-full min-w-[760px] sm:min-w-0 transition-transform duration-300 ${onZoom ? 'cursor-pointer hover:scale-[1.01]' : ''} ${className}`}
        onClick={onZoom ? () => onZoom({ src, alt, title }) : undefined}
      />
      {onZoom && (
        <button
          type="button"
          onClick={() => onZoom({ src, alt, title })}
          aria-label={`Phóng to ảnh ${title || alt}`}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0B1220]/90 hover:bg-[#111D2E] border border-[#27384E] text-[12px] font-medium text-[#E8EEF6] transition-opacity sm:opacity-80 sm:group-hover:opacity-100 cursor-pointer shadow-lg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#F06421]"
        >
          <ZoomIn className="w-3.5 h-3.5 text-[#F06421]" aria-hidden="true" />
          <span>Phóng to</span>
        </button>
      )}
    </div>
  )
}

function scrollToSection(e, id) {
  const el = document.getElementById(id)
  if (!el) return
  e.preventDefault()
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  history.replaceState({}, '', `/#${id}`)
}

/* ───────────────────────────── Trang Landing ───────────────────────────── */

export default function LandingPage() {
  const [viewId, setViewId] = useState('cad')
  const [lightbox, setLightbox] = useState(null)
  const tabRefs = useRef({})
  const view = VIEWS.find((v) => v.id === viewId) || VIEWS[0]

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lightbox])

  const onTabKey = (e, idx) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
    const next = (idx + delta + VIEWS.length) % VIEWS.length
    setViewId(VIEWS[next].id)
    tabRefs.current[VIEWS[next].id]?.focus()
  }

  return (
    <div className="landing h-full overflow-y-auto overflow-x-hidden bg-[#0B1220] text-[#E8EEF6] font-sans antialiased scroll-smooth">
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded focus:bg-[#F06421] focus:text-white"
      >
        Bỏ qua điều hướng
      </a>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#0B1220]/95 backdrop-blur-md border-b border-[#27384E]">
        <div className="mx-auto max-w-[1240px] h-16 px-5 sm:px-8 flex items-center justify-between gap-4">
          <a
            href="/"
            onClick={linkHandler('/')}
            aria-label="CAD & GIS STUDIO — Trang giới thiệu"
            className="rounded focus-visible:outline-2 focus-visible:outline-[#F06421]"
          >
            <Brand />
          </a>
          <nav aria-label="Điều hướng trang giới thiệu" className="hidden md:flex items-center gap-7">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => scrollToSection(e, item.id)}
                className="text-[13.5px] font-medium text-[#A9B9CE] hover:text-white transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <OpenStudio>Mở Studio</OpenStudio>
        </div>
      </header>

      <main id="noi-dung">
        {/* ── Hero ── */}
        <section aria-labelledby="hero-title" className="border-b border-[#27384E] relative">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 pt-14 sm:pt-20 pb-12 sm:pb-16">
            <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-end">
              <div className="lg:col-span-7">
                <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[#F06421]">
                  CAD &amp; GIS STUDIO
                </p>
                <h1
                  id="hero-title"
                  className="mt-4 text-[clamp(2.1rem,4.6vw,3.6rem)] leading-[1.08] font-bold tracking-tight text-white text-balance"
                >
                  Từ bản vẽ CAD đến dữ liệu không gian sẵn sàng sử dụng.
                </h1>
              </div>
              <div className="lg:col-span-5">
                <p className="text-[16px] leading-relaxed text-[#A9B9CE] max-w-[520px]">
                  Công cụ kỹ thuật độc lập hỗ trợ kỹ sư và quản lý bóc tách bản vẽ CAD (.DXF), chuyển đổi chuẩn xác hệ tọa độ VN-2000 sang WGS-84, trực quan hóa trên ảnh vệ tinh và xuất hồ sơ không gian chuẩn hóa.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
                  <OpenStudio size="lg">Mở CAD &amp; GIS STUDIO</OpenStudio>
                  <a
                    href="#tinh-nang"
                    onClick={(e) => scrollToSection(e, 'tinh-nang')}
                    className="text-[14px] font-semibold text-[#E8EEF6] border-b border-[#3B5270] hover:border-[#F06421] pb-0.5 transition-colors"
                  >
                    Khám phá năng lực
                  </a>
                </div>
              </div>
            </div>

            {/* Hero GIS Map Image */}
            <figure className="mt-12 sm:mt-14">
              <Shot
                src="/landing/workspace-gis-map.jpg"
                alt="Ảnh chụp thực tế chế độ GIS Map trong CAD & GIS STUDIO trên nền ảnh vệ tinh"
                title="Bản đồ GIS & Không gian Địa lý"
                eager
                onZoom={setLightbox}
              />
              <figcaption className="mt-3 flex flex-wrap items-center justify-between text-[12.5px] text-[#7E92AA]">
                <span>Ảnh chụp thực tế không gian làm việc: Bóc tách bình đồ tuyến, chuyển đổi tọa độ VN-2000 sang WGS-84 trên nền ảnh vệ tinh Esri World Imagery.</span>
                <span className="font-mono text-[#22B7C9] hidden sm:inline">Chế độ xem: GIS Map (Vệ tinh)</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ── 4 Năng lực cốt lõi (4 Pillars) ── */}
        <section id="tinh-nang" aria-labelledby="features-title" className="bg-[#F4F6FA] text-[#0B1220] scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-16 sm:py-20">
            <div className="grid lg:grid-cols-12 gap-6 items-end">
              <div className="lg:col-span-5">
                <span className="text-[12px] font-bold uppercase tracking-wider text-[#F06421]">
                  Năng lực cốt lõi
                </span>
                <h2 id="features-title" className="mt-2 text-[28px] sm:text-[34px] leading-tight font-bold tracking-tight text-[#0B1220]">
                  Bốn trụ cột công nghệ trong một giải pháp
                </h2>
              </div>
              <p className="lg:col-span-7 text-[15.5px] leading-relaxed text-[#46586F]">
                Được thiết kế chuyên biệt cho kỹ sư cầu đường và chuyên viên GIS, giải quyết triệt để bài toán xử lý dữ liệu trắc địa kỹ thuật phức tạp từ CAD sang hệ thống không gian số.
              </p>
            </div>

            <div className="mt-12 grid md:grid-cols-2 gap-8">
              {PILLARS.map((p) => (
                <div
                  key={p.idx}
                  className="p-7 rounded-xl bg-white border border-[#D5DFEB] shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[14px] font-bold text-[#F06421] bg-[#F06421]/10 px-2.5 py-0.5 rounded">
                        PILLAR {p.idx}
                      </span>
                      <span className="text-[11.5px] font-mono text-[#7E92AA]">CAD &amp; GIS STUDIO</span>
                    </div>
                    <h3 className="mt-4 text-[19px] font-bold text-[#0B1220]">
                      {p.title}
                    </h3>
                    <p className="mt-2.5 text-[14.5px] leading-relaxed text-[#46586F]">
                      {p.desc}
                    </p>
                  </div>

                  <ul className="mt-6 pt-5 border-t border-[#E8EEF6] space-y-2">
                    {p.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-[#2C3B4D]">
                        <CheckCircle2 className="w-4 h-4 text-[#39B58A] shrink-0 mt-0.5" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Quy trình 3 bước ── */}
        <section id="quy-trinh" aria-labelledby="flow-title" className="border-b border-[#27384E] scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-16 sm:py-20">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#22B7C9]">
              Dòng công việc chuẩn hóa
            </span>
            <h2 id="flow-title" className="mt-2 text-[28px] sm:text-[34px] leading-tight font-bold tracking-tight text-white">
              Quy trình làm việc kỹ thuật 3 bước
            </h2>
            <ol className="mt-12 grid md:grid-cols-3 gap-8">
              {STEPS.map((s) => (
                <li
                  key={s.n}
                  className="p-6 rounded-xl border border-[#27384E] bg-[#111D2E]/60 flex flex-col justify-between relative"
                >
                  <div>
                    <span className="font-mono text-[18px] font-bold text-[#F06421] block">
                      {s.n}
                    </span>
                    <h3 className="mt-3 text-[18px] font-bold text-white">
                      {s.title}
                    </h3>
                    <p className="mt-2.5 text-[14px] leading-relaxed text-[#A9B9CE]">
                      {s.text}
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-[#27384E]/60 text-[12px] font-mono text-[#7E92AA]">
                    Trạng thái: Tự động hóa 100%
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Giao diện thực tế (Split-Layout Gallery, CAD 2D Default) ── */}
        <section id="giao-dien" aria-labelledby="views-title" className="border-b border-[#27384E] scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-16 sm:py-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <span className="text-[12px] font-bold uppercase tracking-wider text-[#F06421]">
                  Trải nghiệm không gian làm việc
                </span>
                <h2 id="views-title" className="mt-2 text-[28px] sm:text-[34px] leading-tight font-bold tracking-tight text-white">
                  Bốn chế độ hiển thị chuyên sâu
                </h2>
              </div>
              <p className="text-[14.5px] text-[#A9B9CE] max-w-[480px]">
                Chuyển đổi tức thì giữa bản vẽ CAD gốc, bản đồ GIS vệ tinh, mặt cắt ngang kết cấu và cấu trúc GeoJSON trong cùng một màn hình.
              </p>
            </div>

            {/* Split-Layout: Left Modes List, Right Large Preview */}
            <div className="mt-10 grid lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: 4 Mode Selectors */}
              <div
                role="tablist"
                aria-label="Danh sách chế độ xem Studio"
                className="lg:col-span-4 flex flex-col gap-3"
              >
                {VIEWS.map((v, idx) => {
                  const active = v.id === viewId
                  return (
                    <button
                      key={v.id}
                      ref={(el) => (tabRefs.current[v.id] = el)}
                      role="tab"
                      type="button"
                      id={`tab-${v.id}`}
                      aria-selected={active}
                      aria-controls={`panel-${v.id}`}
                      tabIndex={active ? 0 : -1}
                      onClick={() => setViewId(v.id)}
                      onKeyDown={(e) => onTabKey(e, idx)}
                      className={`text-left p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F06421] ${
                        active
                          ? 'bg-[#17263C] border-[#F06421] shadow-lg text-white'
                          : 'bg-[#111D2E]/60 border-[#27384E] hover:border-[#3E5677] text-[#A9B9CE] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[15px] font-bold tracking-wide">
                          {v.tab}
                        </span>
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                            active
                              ? 'bg-[#F06421]/20 text-[#F06421] font-bold'
                              : 'bg-[#0B1220] text-[#7E92AA]'
                          }`}
                        >
                          {v.badge}
                        </span>
                      </div>
                      <p className="mt-2 text-[12.5px] leading-snug line-clamp-2">
                        {v.text}
                      </p>
                    </button>
                  )
                })}
              </div>

              {/* Right Column: Active Preview */}
              <div
                role="tabpanel"
                id={`panel-${view.id}`}
                aria-labelledby={`tab-${view.id}`}
                className="lg:col-span-8"
              >
                <Shot
                  key={view.id}
                  src={view.src}
                  alt={view.alt}
                  title={view.title}
                  onZoom={setLightbox}
                  className="landing-fade"
                />
                <div className="mt-4 p-4 rounded-lg bg-[#111D2E] border border-[#27384E]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] font-bold text-white">{view.title}</h3>
                    <span className="text-[12px] font-mono text-[#22B7C9]">Chế độ: {view.tab}</span>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-[#A9B9CE]">{view.text}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Lưu ý trắc địa & kỹ thuật (nền sáng) ── */}
        <section id="luu-y" aria-labelledby="notes-title" className="bg-[#F4F6FA] text-[#0B1220] scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-16 sm:py-20">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#F06421]">
              Trắc địa &amp; Kỷ luật kỹ thuật
            </span>
            <h2 id="notes-title" className="mt-2 text-[28px] sm:text-[34px] leading-tight font-bold tracking-tight text-[#0B1220]">
              Lưu ý kỹ thuật quan trọng
            </h2>
            <dl className="mt-10 grid md:grid-cols-2 gap-x-12 border-t border-[#C9D3E0]">
              {NOTES.map((n) => (
                <div key={n.title} className="py-6 border-b border-[#C9D3E0]">
                  <dt className="text-[16.5px] font-bold text-[#0B1220]">{n.title}</dt>
                  <dd className="mt-2 text-[14.5px] leading-relaxed text-[#46586F]">{n.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

      </main>

      {/* ── Footer Tối Giản Kỹ Thuật (Minimalist Single-band Technical Footer) ── */}
      <footer className="border-t border-[#27384E] bg-[#080D17] py-8">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-center gap-3">
            <Brand size="sm" />
          </div>

          <p className="text-[12px] sm:text-[12.5px] font-mono text-[#8FA3BA] text-center md:text-left leading-relaxed">
            Bản vẽ CAD (.DXF) · Hệ quy chiếu VN-2000 · WGS-84 RFC 7946 · Báo cáo khối lượng kỹ thuật
          </p>

          <div className="flex items-center justify-center md:justify-end gap-3 text-[12px] font-mono text-[#7E92AA] shrink-0">
            <span>Phiên bản v2.5</span>
            <span>•</span>
            <a
              href="/studio"
              onClick={linkHandler('/studio')}
              className="text-[#F06421] hover:text-[#FF7635] font-semibold transition-colors"
            >
              Mở Studio →
            </a>
          </div>
        </div>
      </footer>

      {/* ── Modal phóng to ảnh (Lightbox) ── */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title || lightbox.alt || 'Ảnh phóng to'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-[96vw] max-h-[94vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Đóng ảnh phóng to"
              className="absolute -top-11 right-0 sm:right-0 p-1.5 rounded-full bg-[#111D2E] hover:bg-[#17263C] text-white border border-[#27384E] cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="rounded-lg border border-[#27384E] bg-[#111D2E] overflow-auto max-h-[85vh]">
              <img
                src={lightbox.src}
                alt={lightbox.alt}
                width="1920"
                height="1080"
                className="block max-w-full max-h-[82vh] object-contain"
              />
            </div>
            {lightbox.title && (
              <p className="mt-3 text-[13px] text-center text-[#E8EEF6] font-medium max-w-[700px]">
                {lightbox.title}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
