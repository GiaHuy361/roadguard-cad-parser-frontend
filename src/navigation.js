import { useEffect, useState } from 'react'

/**
 * Bộ định tuyến tối giản dựa trên History API (không thêm dependency).
 *   /        -> Landing Page
 *   /studio  -> Workspace CAD & GIS STUDIO
 * Tương thích ngược với liên kết cũ dạng /#studio.
 */
const NAV_EVENT = 'cgs:navigate'

export function resolveRoute(pathname = window.location.pathname, hash = window.location.hash) {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/studio' || clean.startsWith('/studio/')) return 'studio'
  if (clean === '/' && hash === '#studio') return 'studio'
  return 'landing'
}

export function navigate(to, { replace = false } = {}) {
  if (typeof window === 'undefined') return
  const current = window.location.pathname + window.location.search + window.location.hash
  if (current !== to) {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', to)
  }
  window.dispatchEvent(new Event(NAV_EVENT))
}

/** onClick helper cho thẻ <a>: giữ hành vi mặc định khi dùng Ctrl/Cmd/Shift hoặc chuột giữa. */
export function linkHandler(to) {
  return (e) => {
    console.log('[linkHandler] invoked for', to, 'button:', e.button, 'defaultPrevented:', e.defaultPrevented)
    if (
      e.defaultPrevented ||
      (typeof e.button === 'number' && e.button !== 0) ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      console.log('[linkHandler] returned early!')
      return
    }
    e.preventDefault()
    console.log('[linkHandler] called preventDefault & navigating to', to)
    navigate(to)
  }
}

export function useRoute() {
  const [route, setRoute] = useState(() => resolveRoute())

  useEffect(() => {
    const sync = () => setRoute(resolveRoute())
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    window.addEventListener(NAV_EVENT, sync)
    // Chuẩn hóa liên kết cũ /#studio -> /studio
    if (window.location.pathname === '/' && window.location.hash === '#studio') {
      navigate('/studio', { replace: true })
    }
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
      window.removeEventListener(NAV_EVENT, sync)
    }
  }, [])

  return route
}
