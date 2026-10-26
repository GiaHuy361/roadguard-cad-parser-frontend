import { lazy, Suspense, useEffect, useState } from 'react'
import { useRoute } from './navigation'
import LandingPage from './landing/LandingPage'

// Studio được nạp khi cần để Landing Page tải nhanh.
const StudioApp = lazy(() => import('./App.jsx'))

const TITLES = {
  landing: 'CAD & GIS STUDIO — Từ bản vẽ kỹ thuật đến dữ liệu không gian',
  studio: 'CAD & GIS STUDIO — Không gian làm việc',
}

function StudioFallback() {
  return (
    <div
      role="status"
      className="w-full h-full flex items-center justify-center bg-[#0B1220] text-[#A9B9CE] text-[13px]"
    >
      Đang tải không gian làm việc…
    </div>
  )
}

export default function AppRouter() {
  const route = useRoute()
  // Sau lần mở đầu tiên, giữ Studio ở trạng thái mounted (chỉ ẩn) để không mất dữ liệu phiên.
  const [studioMounted, setStudioMounted] = useState(route === 'studio')

  useEffect(() => {
    document.title = TITLES[route] || TITLES.landing
    if (route === 'studio') {
      setStudioMounted(true)
      // MapLibre / DXF viewer cần đo lại kích thước khi container hiện trở lại.
      const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 60)
      return () => clearTimeout(t)
    }
  }, [route])

  return (
    <>
      <div hidden={route !== 'landing'} className="w-full h-full">
        <LandingPage />
      </div>
      {studioMounted && (
        <div hidden={route !== 'studio'} className="w-full h-full">
          <Suspense fallback={<StudioFallback />}>
            <StudioApp />
          </Suspense>
        </div>
      )}
    </>
  )
}
