import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useFloatingPortal
 * ==============================================================================
 * Hook for rendering accessible Popovers via React Portal into document.body.
 * Solves overflow clipping by ancestor scroll containers (overflow-y-auto).
 * Features:
 *   1. Viewport-aware collision detection (auto-flips upwards when near screen bottom).
 *   2. Responsive boundary clamping (never overflows screen width on mobile/tablet).
 *   3. Dynamic tracking on ancestor scroll (capture: true) and window resize.
 *   4. Unified click-outside detection across trigger and portal.
 *   5. Infinite-loop & render-churn proof: ref-stabilized callbacks + shallow equality coords update.
 */
export function useFloatingPortal({ isOpen, onClose }) {
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)
  const onCloseRef = useRef(onClose)

  // Keep latest onClose callback in ref without invalidating effects or triggering re-renders
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 320,
    maxHeight: 320,
    placement: 'bottom',
  })

  // Completely stable position calculator across renders
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const gap = 6
    const margin = 8

    // If trigger element has completely scrolled out of viewport, auto-close
    if (rect.bottom < -20 || rect.top > viewportHeight + 20) {
      if (onCloseRef.current) onCloseRef.current()
      return
    }

    const spaceBelow = viewportHeight - rect.bottom - gap - margin
    const spaceAbove = rect.top - gap - margin
    const desiredHeight = 320

    let placement = 'bottom'
    let top = rect.bottom + gap
    let maxHeight = Math.min(desiredHeight, Math.max(160, spaceBelow))

    // Flip to top if space below is too cramped (<240px) and space above is larger
    if (spaceBelow < 240 && spaceAbove > spaceBelow) {
      placement = 'top'
      maxHeight = Math.min(desiredHeight, Math.max(160, spaceAbove))
      top = Math.max(margin, rect.top - gap - maxHeight)
    }

    // Width: match trigger width, minimum 300px, max viewport - 16px
    const minWidth = Math.min(viewportWidth - margin * 2, Math.max(rect.width, 300))
    const width = Math.min(viewportWidth - margin * 2, Math.max(minWidth, rect.width))

    // Horizontal positioning: align with trigger left, clamp within viewport
    let left = rect.left
    if (left + width > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - margin - width)
    }
    if (left < margin) {
      left = margin
    }

    const nextCoords = {
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(width),
      maxHeight: Math.round(maxHeight),
      placement,
    }

    // Bail out if coords have not changed to prevent render loops or excessive churn
    setCoords((prev) => {
      if (
        prev.top === nextCoords.top &&
        prev.left === nextCoords.left &&
        prev.width === nextCoords.width &&
        prev.maxHeight === nextCoords.maxHeight &&
        prev.placement === nextCoords.placement
      ) {
        return prev
      }
      return nextCoords
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return

    updatePosition()

    const handleScrollOrResize = () => {
      updatePosition()
    }

    window.addEventListener('resize', handleScrollOrResize)
    // capture: true intercepts scroll events from Sidebar's overflow-y-auto container
    window.addEventListener('scroll', handleScrollOrResize, true)

    function handleClickOutside(event) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target)
      ) {
        if (onCloseRef.current) onCloseRef.current()
      }
    }

    document.addEventListener('pointerdown', handleClickOutside)

    return () => {
      window.removeEventListener('resize', handleScrollOrResize)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [isOpen, updatePosition])

  return { triggerRef, popoverRef, coords, updatePosition }
}
