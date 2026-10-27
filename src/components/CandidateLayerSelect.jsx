import React, { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X, Layers, Sparkles, HelpCircle } from 'lucide-react'
import { useFloatingPortal } from './useFloatingPortal'

/**
 * CandidateLayerSelect
 * ==============================================================================
 * Accessible, collision-aware Popover for candidate DXF centerline layer selection.
 * Rendered via React Portal into document.body to prevent clipping by ancestor
 * scroll containers (overflow-y-auto).
 * Displays:
 *   - Layer Name (monospace)
 *   - Entity count & total CAD length
 *   - ⭐ [Đề xuất] badge on high-confidence layers
 *   - Explanatory footnote clarifying total entity length vs chained centerline length
 */
export default function CandidateLayerSelect({
  candidateLayers = [],
  activeCenterlineLayer = null,
  onSelectLayer,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const searchInputRef = useRef(null)

  const { triggerRef, popoverRef, coords } = useFloatingPortal({
    isOpen,
    onClose: () => setIsOpen(false),
  })

  // Determine currently selected candidate object
  const currentSelection = useMemo(() => {
    if (activeCenterlineLayer) {
      return candidateLayers.find((c) => c.name === activeCenterlineLayer) || {
        name: activeCenterlineLayer,
        entityCount: '?',
        totalLengthMeters: '?',
        isRecommended: false,
      }
    }
    const rec = candidateLayers.find((c) => c.isRecommended)
    return rec || candidateLayers[0] || null
  }, [candidateLayers, activeCenterlineLayer])

  // Filter layers by search term
  const filteredLayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return candidateLayers
    return candidateLayers.filter((c) => c.name.toLowerCase().includes(q))
  }, [candidateLayers, searchQuery])

  // Focus search when opened
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(-1)
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearchQuery('')
    }
  }, [isOpen])

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    const total = filteredLayers.length

    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1 >= total ? 0 : prev + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev - 1 < 0 ? total - 1 : prev - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < filteredLayers.length) {
        onSelectLayer(filteredLayers[highlightedIndex].name)
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }
  }

  if (!candidateLayers || candidateLayers.length === 0) {
    return null
  }

  return (
    <div className="relative w-full text-left" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between text-[12px] mb-1.5">
        <span className="font-semibold text-[#E8EEF6] flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#22B7C9]" />
          <span>Layer tim tuyến đề xuất:</span>
        </span>
        <span className="text-[11px] font-mono text-[#22B7C9] bg-[#22B7C9]/15 px-1.5 py-0.5 rounded font-bold">
          {candidateLayers.length} lớp phát hiện
        </span>
      </div>

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Chọn layer tim tuyến DXF"
        className={`w-full p-2.5 rounded-lg bg-[#0B1220] border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
          isOpen
            ? 'border-[#22B7C9] ring-1 ring-[#22B7C9]/30 bg-[#0E1726]'
            : 'border-[#27384E] hover:border-[#3E5677] hover:bg-[#111D2E]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-mono font-bold text-[#E8EEF6] truncate">
              {currentSelection?.name || 'Chưa chọn layer'}
            </span>
            {currentSelection?.isRecommended && (
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#F06421]/20 text-[#F06421] border border-[#F06421]/30 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                <span>Đề xuất</span>
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-[#8FA3BA] truncate mt-0.5 tabular-nums">
            {currentSelection?.totalLengthMeters}m CAD • {currentSelection?.entityCount} đối tượng
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <ChevronDown
            className={`w-4 h-4 text-[#8FA3BA] transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[#22B7C9]' : ''
            }`}
          />
        </div>
      </button>

      {/* Floating Popover Panel via React Portal */}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 9999,
            }}
            className="rounded-xl bg-[#0E1726] border border-[#27384E] shadow-2xl shadow-black/90 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Top Search Input */}
            <div className="p-2 border-b border-[#27384E] bg-[#111D2E]/90 shrink-0">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-[#8FA3BA] absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm theo tên layer DXF..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-md bg-[#0B1220] border border-[#27384E] text-[12px] text-[#E8EEF6] placeholder-[#7E92AA] focus:outline-none focus:border-[#22B7C9]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 p-0.5 text-[#8FA3BA] hover:text-[#E8EEF6] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Technical Explanatory Note */}
            <div className="px-3 py-1.5 bg-[#0B1220]/70 border-b border-[#1E2E42] text-[10.5px] text-[#8FA3BA] flex items-center gap-1.5 shrink-0">
              <HelpCircle className="w-3 h-3 text-[#22B7C9] shrink-0" />
              <span className="truncate">
                Entity: số nét CAD trong layer. Chiều dài: tổng các nét CAD rời.
              </span>
            </div>

            {/* Candidate Layer List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#17263C] overscroll-contain">
              {filteredLayers.map((c, idx) => {
                const isSelected =
                  (activeCenterlineLayer && activeCenterlineLayer === c.name) ||
                  (!activeCenterlineLayer && c.isRecommended)
                const isHighlighted = highlightedIndex === idx

                return (
                  <div
                    key={c.name}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelectLayer(c.name)
                      setIsOpen(false)
                      triggerRef.current?.focus()
                    }}
                    className={`p-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#17263C] border-l-2 border-l-[#22B7C9]'
                        : isHighlighted
                        ? 'bg-[#142033]'
                        : 'hover:bg-[#111D2E]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-mono font-bold text-[#E8EEF6] truncate">
                          {c.name}
                        </span>
                        {c.isRecommended && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#F06421]/20 text-[#F06421] border border-[#F06421]/30 shrink-0">
                            ⭐ Đề xuất
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-[#8FA3BA] mt-0.5 flex items-center gap-2 tabular-nums">
                        <span>{c.totalLengthMeters}m</span>
                        <span>•</span>
                        <span>{c.entityCount} đối tượng</span>
                        {c.score > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-[#39B58A]">Điểm: {c.score}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-[#22B7C9] shrink-0" />
                    )}
                  </div>
                )
              })}

              {filteredLayers.length === 0 && (
                <div className="p-4 text-center text-[12px] text-[#8FA3BA]">
                  Không tìm thấy layer phù hợp.
                </div>
              )}
            </div>

            {/* Footer Reset to Auto */}
            <div className="p-2 border-t border-[#27384E] bg-[#111D2E] flex items-center justify-between text-[11.5px] shrink-0">
              <span className="text-[#8FA3BA]">Chọn tự động theo điểm tin cậy:</span>
              <button
                type="button"
                onClick={() => {
                  onSelectLayer(null)
                  setIsOpen(false)
                  triggerRef.current?.focus()
                }}
                className="px-2 py-1 rounded bg-[#17263C] hover:bg-[#1E314D] text-[#22B7C9] font-semibold border border-[#27384E] cursor-pointer"
              >
                Tự động chọn đề xuất
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
