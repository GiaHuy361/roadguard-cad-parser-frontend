import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Check, ChevronDown, Search, X, Compass, AlertCircle } from 'lucide-react'
import { VN2000_REFERENCE_PRESETS } from '../utils/roadEngineeringBuilder'

/**
 * CrsPresetSelect
 * ==============================================================================
 * Accessible, collision-aware searchable Popover replacement for native <select>
 * Displays two-line item format:
 *   - Primary: 107°45′ — Đồng Nai, BR-VT, Đà Nẵng, Quảng Nam
 *   - Secondary: Múi 3° · L₀ = 107.75° · k₀ = 0.9999
 * Supports keyboard navigation (Esc, Arrow keys, Enter) and search filtering.
 */
export default function CrsPresetSelect({
  selectedPresetId,
  selectedCm,
  scaleFactor,
  onSelectPreset,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef(null)
  const searchInputRef = useRef(null)
  const listRef = useRef(null)

  // Find active preset object
  const activePreset = useMemo(() => {
    return VN2000_REFERENCE_PRESETS.find((p) => p.id === selectedPresetId)
  }, [selectedPresetId])

  // Filtered preset list based on search query
  const filteredPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return VN2000_REFERENCE_PRESETS

    // Remove Vietnamese accents for loose matching
    const removeDiacritics = (str) =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const normQ = removeDiacritics(q)

    return VN2000_REFERENCE_PRESETS.filter((p) => {
      const normLabel = removeDiacritics(p.label || '')
      const cmStr = String(p.cm || '')
      return (
        normLabel.includes(normQ) ||
        p.id.toLowerCase().includes(q) ||
        cmStr.includes(q)
      )
    })
  }, [searchQuery])

  // Focus search input when popover opens
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

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
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

    const totalItems = filteredPresets.length + 2 // + custom + unconfigured

    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1 >= totalItems ? 0 : prev + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev - 1 < 0 ? totalItems - 1 : prev - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < filteredPresets.length) {
        onSelectPreset(filteredPresets[highlightedIndex].id)
        setIsOpen(false)
      } else if (highlightedIndex === filteredPresets.length) {
        onSelectPreset('custom')
        setIsOpen(false)
      } else if (highlightedIndex === filteredPresets.length + 1) {
        onSelectPreset('unconfigured')
        setIsOpen(false)
      }
    }
  }

  // Format label for display on the trigger button
  const triggerDisplay = useMemo(() => {
    if (selectedPresetId === 'unconfigured') {
      return {
        primary: 'Chưa cấu hình VN-2000',
        secondary: 'Chỉ hiển thị WGS-84 RFC 7946',
        badge: 'Chưa cấu hình',
        badgeClass: 'bg-[#F59E0B]/20 text-[#F59E0B]',
      }
    }
    if (selectedPresetId === 'custom') {
      return {
        primary: 'Tùy chỉnh L₀ & múi chiếu riêng',
        secondary: `L₀ = ${selectedCm || '--'}° · k₀ = ${scaleFactor || '--'}`,
        badge: 'Tùy chỉnh',
        badgeClass: 'bg-[#F06421]/20 text-[#F06421]',
      }
    }
    if (activePreset) {
      // Extract province and angle from label
      // E.g.: "107°45' (107.75°) – Đồng Nai, BR-VT, Đà Nẵng, Quảng Nam (Múi 3°)"
      const parts = activePreset.label.split('–')
      const angle = parts[0]?.trim() || `${activePreset.cm}°`
      const provinces = parts[1]?.replace(/\(Múi.*?\)/, '').trim() || ''
      return {
        primary: `${angle} — ${provinces}`,
        secondary: `Múi ${activePreset.zone === '6deg' ? '6°' : '3°'} · L₀ = ${activePreset.cm}° · k₀ = ${activePreset.k0 ?? 0.9999}`,
        badge: `L₀ = ${activePreset.cm}°`,
        badgeClass: 'bg-[#22B7C9]/15 text-[#22B7C9]',
      }
    }
    return {
      primary: `L₀ = ${selectedCm}° (Preset: ${selectedPresetId})`,
      secondary: `k₀ = ${scaleFactor}`,
      badge: 'VN-2000',
      badgeClass: 'bg-[#22B7C9]/15 text-[#22B7C9]',
    }
  }, [selectedPresetId, activePreset, selectedCm, scaleFactor])

  return (
    <div
      ref={containerRef}
      className="relative w-full text-left"
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"
        className={`w-full p-2.5 rounded-lg bg-[#0B1220] border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
          isOpen
            ? 'border-[#22B7C9] ring-1 ring-[#22B7C9]/30 bg-[#0E1726]'
            : 'border-[#27384E] hover:border-[#3E5677] hover:bg-[#111D2E]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-[#E8EEF6] truncate">
              {triggerDisplay.primary}
            </span>
          </div>
          <div className="text-[11px] font-mono text-[#8FA3BA] truncate mt-0.5">
            {triggerDisplay.secondary}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded tabular-nums ${triggerDisplay.badgeClass}`}
          >
            {triggerDisplay.badge}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[#8FA3BA] transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[#22B7C9]' : ''
            }`}
          />
        </div>
      </button>

      {/* Floating Popover Panel */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className="absolute z-50 left-0 right-0 top-full mt-1.5 rounded-xl bg-[#0E1726] border border-[#27384E] shadow-2xl shadow-black/70 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
          style={{ maxHeight: '20rem' }}
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
                placeholder="Tìm tỉnh thành hoặc kinh tuyến trục L₀..."
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

          {/* Preset Options List */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto divide-y divide-[#17263C] overscroll-contain"
          >
            {filteredPresets.map((preset, idx) => {
              const isSelected = selectedPresetId === preset.id
              const isHighlighted = highlightedIndex === idx
              const parts = preset.label.split('–')
              const angle = parts[0]?.trim() || `${preset.cm}°`
              const provinces = parts[1]?.replace(/\(Múi.*?\)/, '').trim() || ''

              return (
                <div
                  key={preset.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectPreset(preset.id)
                    setIsOpen(false)
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
                    <div className="text-[12px] font-bold text-[#E8EEF6] truncate">
                      {angle} — {provinces}
                    </div>
                    <div className="text-[10.5px] font-mono text-[#8FA3BA] mt-0.5 flex items-center gap-1.5">
                      <span>Múi {preset.zone === '6deg' ? '6°' : '3°'}</span>
                      <span>•</span>
                      <span>L₀ = {preset.cm}°</span>
                      <span>•</span>
                      <span>k₀ = {preset.k0 ?? 0.9999}</span>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-[#22B7C9] shrink-0" />
                  )}
                </div>
              )
            })}

            {filteredPresets.length === 0 && (
              <div className="p-4 text-center text-[12px] text-[#8FA3BA]">
                Không tìm thấy tỉnh thành hoặc kinh tuyến trục phù hợp.
              </div>
            )}

            {/* Special Option: Custom L0 */}
            <div
              role="option"
              aria-selected={selectedPresetId === 'custom'}
              onClick={() => {
                onSelectPreset('custom')
                setIsOpen(false)
              }}
              className={`p-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-colors bg-[#111D2E]/40 ${
                selectedPresetId === 'custom'
                  ? 'bg-[#17263C] border-l-2 border-l-[#F06421]'
                  : 'hover:bg-[#142033]'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-[#F06421] truncate flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 shrink-0" />
                  <span>Tùy chỉnh L₀ &amp; múi chiếu (Hồ sơ thiết kế riêng)</span>
                </div>
                <div className="text-[10.5px] text-[#8FA3BA] mt-0.5">
                  Nhập kinh tuyến trục L₀ và chọn múi 3°/6° trực tiếp bằng tay
                </div>
              </div>
              {selectedPresetId === 'custom' && (
                <Check className="w-4 h-4 text-[#F06421] shrink-0" />
              )}
            </div>

            {/* Special Option: Unconfigured VN-2000 */}
            <div
              role="option"
              aria-selected={selectedPresetId === 'unconfigured'}
              onClick={() => {
                onSelectPreset('unconfigured')
                setIsOpen(false)
              }}
              className={`p-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-colors bg-[#111D2E]/20 ${
                selectedPresetId === 'unconfigured'
                  ? 'bg-[#17263C] border-l-2 border-l-[#F59E0B]'
                  : 'hover:bg-[#142033]'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-[#F59E0B] truncate flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Chưa cấu hình VN-2000 (Chỉ dùng WGS-84)</span>
                </div>
                <div className="text-[10.5px] text-[#8FA3BA] mt-0.5">
                  Khóa chuyển đổi và xuất file VN-2000 cho đến khi L₀ được áp dụng
                </div>
              </div>
              {selectedPresetId === 'unconfigured' && (
                <Check className="w-4 h-4 text-[#F59E0B] shrink-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
