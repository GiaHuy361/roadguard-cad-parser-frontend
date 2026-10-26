import { useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { linkHandler } from '../navigation'

/* ─────────────────────────────────────────────────────────────
 * Nội dung — chỉ liệt kê chức năng đã triển khai trong Studio.
 * ───────────────────────────────────────────────────────────── */

const NAV = [
  { id: 'tinh-nang', label: 'Tính năng' },
  { id: 'quy-trinh', label: 'Quy trình' },
  { id: 'giao-dien', label: 'Giao diện' },
  { id: 'luu-y', label: 'Lưu ý kỹ thuật' },
]

const FEATURES = [
  {
    title: 'Xử lý bản vẽ AutoCAD DXF',
    text: 'Đọc layer, thống kê thực thể và chọn layer tim tuyến. Hỗ trợ định dạng DXF.',
  },
  {
    title: 'Chuyển đổi VN-2000 ↔ WGS-84',
    text: 'Múi chiếu 3°/6°, kinh tuyến trục tùy chỉnh, quy ước X Bắc / Y Đông và phép chuyển datum 7 tham số.',
  },
  {
    title: 'Bản đồ GIS bằng MapLibre',
    text: 'Hiển thị tuyến trên ảnh vệ tinh hoặc bản đồ nền, tra cứu và so sánh tọa độ hai hệ ngay trên bản đồ.',
  },
  {
    title: 'Xem bản vẽ CAD 2D',
    text: 'Xem lại bản vẽ DXF gốc song song với kết quả dựng tuyến trong cùng không gian làm việc.',
  },
  {
    title: 'Mặt cắt ngang và hồ sơ kỹ thuật',
    text: 'Mặt cắt theo bề rộng mặt đường; có cảnh báo khi dữ liệu cao độ chỉ là cấu hình tham chiếu.',
  },
  {
    title: 'Tim tuyến, cọc lý trình, mặt đường',
    text: 'Chia cọc theo bước tùy chọn, phân đoạn, tấm BTXM và diện tích mặt đường, đồng bộ giữa các chế độ xem.',
  },
  {
    title: 'GeoJSON theo RFC 7946',
    text: 'Nhập và xuất GeoJSON với thứ tự [kinh độ, vĩ độ], bbox và vòng đa giác khép kín.',
  },
  {
    title: 'Xuất Excel và JSON kỹ thuật',
    text: 'Báo cáo Excel nhiều trang tính và tệp RoadGuard Draft JSON, có kiểm tra cấu trúc trước khi tải về.',
  },
]

const STEPS = [
  { n: '01', title: 'Nhập dữ liệu', text: 'DXF, tọa độ VN-2000 hoặc GeoJSON WGS-84.' },
  { n: '02', title: 'Xử lý và kiểm tra', text: 'Chuyển đổi CRS, dựng tuyến, xem CAD và GIS.' },
  { n: '03', title: 'Xuất hồ sơ', text: 'GeoJSON, Excel hoặc JSON kỹ thuật.' },
]

const VIEWS = [
  {
    id: 'gis',
    tab: 'GIS Map',
    src: '/landing/workspace-gis-map.jpg',
    title: 'Bản đồ GIS',
    text: 'Tuyến và mặt đường dựng trên ảnh vệ tinh, cọc lý trình, thanh tra cứu tọa độ và bảng chỉ số bên phải.',
    alt: 'Ảnh chụp chế độ Bản đồ GIS trong CAD & GIS STUDIO: tuyến đường trên ảnh vệ tinh, thanh bên trái nhập dữ liệu và bảng chỉ số bên phải',
  },
  {
    id: 'cad',
    tab: 'CAD 2D',
    src: '/landing/workspace-cad-2d.jpg',
    title: 'Bản vẽ CAD 2D',
    text: 'Bản vẽ DXF hiển thị theo lớp, có thể bật tắt từng layer từ bảng bên phải.',
    alt: 'Ảnh chụp chế độ Bản vẽ CAD 2D trong CAD & GIS STUDIO hiển thị bản vẽ DXF',
  },
  {
    id: 'profile',
    tab: 'Mặt cắt & Hồ sơ',
    src: '/landing/workspace-profile.jpg',
    title: 'Mặt cắt và hồ sơ kỹ thuật',
    text: 'Mặt cắt ngang theo thông số mặt đường, kèm lưu ý về nguồn dữ liệu cao độ.',
    alt: 'Ảnh chụp chế độ Mặt cắt và Hồ sơ trong CAD & GIS STUDIO',
  },
  {
    id: 'json',
    tab: 'GeoJSON Inspector',
    src: '/landing/workspace-geojson.jpg',
    title: 'GeoJSON Inspector',
    text: 'Xem và kiểm tra dữ liệu GeoJSON RFC 7946 trước khi tải về hoặc xuất JSON kỹ thuật.',
    alt: 'Ảnh chụp chế độ GeoJSON Inspector trong CAD & GIS STUDIO',
  },
]

const NOTES = [
  {
    title: 'Nguồn tọa độ và thứ tự trục',
    text: 'Studio hiển thị đúng hệ tọa độ của dữ liệu đầu vào (DXF/VN-2000 hoặc WGS-84). Ở chế độ AUTO, khi X/Y không đủ rõ ràng, người dùng được yêu cầu xác nhận thứ tự trục.',
  },
  {
    title: 'Phạm vi độ chính xác',
    text: 'Phép chuyển đổi đã được đối chiếu số học với thư viện PROJ/pyproj (sai lệch khứ hồi dưới 1 mm). Chưa có điểm khống chế thực địa độc lập, nên chưa xác nhận độ chính xác tuyệt đối ngoài hiện trường.',
  },
  {
    title: 'Định dạng và dữ liệu cao độ',
    text: 'Chỉ hỗ trợ DXF, không hỗ trợ DWG. Mặt cắt dùng cấu hình tham chiếu khi bản vẽ không có cao độ thực; cần đối chiếu với hồ sơ khảo sát.',
  },
  {
    title: 'Tệp JSON kỹ thuật',
    text: 'Tệp RoadGuard Draft JSON đã được kiểm tra theo hợp đồng dữ liệu đầu vào. Việc nhập trực tiếp vào hệ thống chính chưa được kiểm chứng đầu-cuối. Kết quả cần được kỹ sư rà soát trước khi dùng cho hồ sơ chính thức.',
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

function Shot({ src, alt, eager = false, className = '' }) {
  return (
    <div className="rounded-lg border border-[#27384E] bg-[#111D2E] overflow-x-auto overflow-y-hidden">
      <img
        src={src}
        alt={alt}
        width="1920"
        height="1080"
        loading={eager ? undefined : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        className={`block h-auto w-full min-w-[760px] sm:min-w-0 ${className}`}
      />
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
  const [viewId, setViewId] = useState('gis')
  const tabRefs = useRef({})
  const view = VIEWS.find((v) => v.id === viewId) || VIEWS[0]

  const onTabKey = (e, idx) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length
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
      <header className="sticky top-0 z-40 bg-[#0B1220]/95 border-b border-[#27384E]">
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
                className="text-[13.5px] text-[#A9B9CE] hover:text-white transition-colors"
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
        <section aria-labelledby="hero-title" className="border-b border-[#27384E]">
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
                  Từ bản vẽ kỹ thuật đến dữ liệu không gian chính xác.
                </h1>
              </div>
              <div className="lg:col-span-5">
                <p className="text-[16px] leading-relaxed text-[#A9B9CE] max-w-[520px]">
                  Công cụ hỗ trợ xử lý bản vẽ CAD, chuyển đổi hệ tọa độ VN-2000 và WGS-84, trực quan hóa dữ liệu GIS và chuẩn bị hồ sơ kỹ thuật trong một không gian làm việc thống nhất.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
                  <OpenStudio size="lg">Mở CAD &amp; GIS STUDIO</OpenStudio>
                  <a
                    href="#tinh-nang"
                    onClick={(e) => scrollToSection(e, 'tinh-nang')}
                    className="text-[14px] font-medium text-[#E8EEF6] border-b border-[#3B5270] hover:border-[#F06421] pb-0.5 transition-colors"
                  >
                    Khám phá tính năng
                  </a>
                </div>
              </div>
            </div>

            <figure className="mt-12 sm:mt-14">
              <Shot src="/landing/workspace-gis-map.jpg" alt={VIEWS[0].alt} eager />
              <figcaption className="mt-3 text-[12.5px] text-[#7E92AA]">
                Ảnh chụp thực tế không gian làm việc: thanh nhập dữ liệu, bản đồ GIS và bảng chỉ số kỹ thuật.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ── Tính năng (nền sáng) ── */}
        <section id="tinh-nang" aria-labelledby="features-title" className="bg-[#F4F6FA] text-[#0B1220] scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-16 sm:py-20">
            <div className="grid lg:grid-cols-12 gap-6">
              <h2 id="features-title" className="lg:col-span-4 text-[28px] sm:text-[32px] leading-tight font-bold tracking-tight">
                Chức năng chính
              </h2>
              <p className="lg:col-span-6 lg:col-start-6 text-[15.5px] leading-relaxed text-[#46586F]">
                Tám nhóm chức năng trong một không gian làm việc thống nhất.
              </p>
            </div>

            <ul className="mt-10 grid md:grid-cols-2 gap-x-12 border-t border-[#C9D3E0]">
              {FEATURES.map((f, i) => (
                <li key={f.title} className="py-6 border-b border-[#C9D3E0] flex gap-5">
                  <span className="font-mono text-[12.5px] text-[#F06421] pt-1 w-6 shrink-0" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="text-[16.5px] font-semibold text-[#0B1220]">{f.title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#46586F]">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Quy trình ── */}
        <section id="quy-trinh" aria-labelledby="flow-title" className="border-b border-[#27384E] scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-16 sm:py-20">
            <h2 id="flow-title" className="text-[28px] sm:text-[32px] leading-tight font-bold tracking-tight text-white">
              Quy trình làm việc
            </h2>
            <ol className="mt-10 grid md:grid-cols-3 gap-x-10 gap-y-8">
              {STEPS.map((s) => (
                <li key={s.n} className="border-t border-[#27384E] pt-5">
                  <span className="font-mono text-[13px] text-[#F06421]">{s.n}</span>
                  <h3 className="mt-2 text-[19px] font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-[#A9B9CE]">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Giao diện thực tế ── */}
        <section id="giao-dien" aria-labelledby="views-title" className="border-b border-[#27384E] scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-16 sm:py-20">
            <h2 id="views-title" className="text-[28px] sm:text-[32px] leading-tight font-bold tracking-tight text-white">
              Bốn chế độ xem trong cùng một không gian
            </h2>

            <div
              role="tablist"
              aria-label="Chế độ xem của Studio"
              className="mt-8 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[#27384E]"
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
                    className={`px-4 py-3 text-[14px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F06421] ${
                      active
                        ? 'text-white border-[#F06421]'
                        : 'text-[#A9B9CE] border-transparent hover:text-white'
                    }`}
                  >
                    {v.tab}
                  </button>
                )
              })}
            </div>

            <div
              role="tabpanel"
              id={`panel-${view.id}`}
              aria-labelledby={`tab-${view.id}`}
              className="mt-6"
            >
              <Shot key={view.id} src={view.src} alt={view.alt} className="landing-fade" />
              <div className="mt-4 max-w-[760px]">
                <h3 className="text-[16px] font-semibold text-white">{view.title}</h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#A9B9CE]">{view.text}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Lưu ý kỹ thuật (nền sáng) ── */}
        <section id="luu-y" aria-labelledby="notes-title" className="bg-[#F4F6FA] text-[#0B1220] scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-16 sm:py-20">
            <h2 id="notes-title" className="text-[28px] sm:text-[32px] leading-tight font-bold tracking-tight">
              Lưu ý kỹ thuật
            </h2>
            <dl className="mt-10 grid md:grid-cols-2 gap-x-12 border-t border-[#C9D3E0]">
              {NOTES.map((n) => (
                <div key={n.title} className="py-6 border-b border-[#C9D3E0]">
                  <dt className="text-[16px] font-semibold">{n.title}</dt>
                  <dd className="mt-2 text-[14.5px] leading-relaxed text-[#46586F]">{n.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Lời kêu gọi cuối trang ── */}
        <section aria-labelledby="cta-title" className="border-b border-[#27384E]">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-14 sm:py-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <h2 id="cta-title" className="text-[24px] sm:text-[28px] font-bold tracking-tight text-white">
              Sẵn sàng làm việc với dữ liệu CAD &amp; GIS
            </h2>
            <OpenStudio size="lg">Mở CAD &amp; GIS STUDIO</OpenStudio>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-[#0B1220]">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <Brand size="sm" />
          <nav aria-label="Liên kết chân trang" className="flex flex-wrap gap-x-6 gap-y-2">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => scrollToSection(e, item.id)}
                className="text-[13px] text-[#A9B9CE] hover:text-white transition-colors"
              >
                {item.label}
              </a>
            ))}
            <a href="/studio" onClick={linkHandler('/studio')} className="text-[13px] text-[#F06421] hover:text-[#FF7635] transition-colors">
              Mở Studio
            </a>
          </nav>
        </div>
        <p className="mx-auto max-w-[1240px] px-5 sm:px-8 pb-8 text-[12px] text-[#7E92AA]">
          DXF · VN-2000 · WGS-84 · GeoJSON RFC 7946
        </p>
      </footer>
    </div>
  )
}
