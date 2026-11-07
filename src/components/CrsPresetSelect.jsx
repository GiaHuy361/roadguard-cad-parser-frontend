import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X, Compass, AlertCircle } from 'lucide-react'
import {
  VN2000_CATALOG_METADATA,
  VN2000_ZONE6_OPTIONS,
  resolveVn2000Preset,
  getVn2000OptionsByTable,
  filterVn2000LookupOptions,
} from '../utils/roadEngineeringBuilder'
import { useFloatingPortal } from './useFloatingPortal'

/**
 * CrsPresetSelect
 * ==============================================================================
 * Standardized 34-province/city VN-2000 lookup dropdown for CAD & GIS Studio.
 * Supports switching between:
 *   - Hành chính (Thông tư 24/2025/TT-BNNMT · 34 tỉnh, thành)
 *   - Địa chính  (Phụ lục 01 sửa đổi bởi Thông tư 23/2025/TT-BNNMT · 34 tỉnh, thành)
 *
 * Lookup safety guarantees:
 *   - Opening dropdown, typing search queries, or switching tables ONLY changes the
 *     lookup list and never mutates the active or applied CRS configuration.
 *   - Provinces with multiple cadastral central meridians render each meridian as an
 *     explicit individual option so the engineer selects one concrete L₀ value.
 *   - Resilient search matches accented/unaccented names (including Đ/đ -> d), extra
 *     spaces, comma or dot decimals (107,75 / 107.75), and degree–minute (107°45′).
 */
export default function CrsPresetSelect({
  selectedPresetId,
  selectedCm,
  scaleFactor,
  onSelectPreset,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [lookupTable, setLookupTable] = useState('administrative') // 'administrative' | 'cadastral'
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const searchInputRef = useRef(null)
  const listRef = useRef(null)

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const { triggerRef, popoverRef, coords } = useFloatingPortal({
    isOpen,
    onClose: handleClose,
  })

  // Resolve canonical or legacy preset ID without altering default CRS
  const activePreset = useMemo(() => {
    return resolveVn2000Preset(selectedPresetId)
  }, [selectedPresetId])

  // Sync initial visible table tab with activePreset when opening (does NOT mutate CRS)
  useEffect(() => {
    if (isOpen) {
      if (activePreset?.tableType === 'cadastral') {
        setLookupTable('cadastral')
      } else if (activePreset?.tableType === 'administrative') {
        setLookupTable('administrative')
      }
      setHighlightedIndex(-1)
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    } else {
      setSearchQuery('')
    }
  }, [isOpen, activePreset])

  const tableOptions = useMemo(() => {
    return getVn2000OptionsByTable(lookupTable)
  }, [lookupTable])

  const filteredProvinceOptions = useMemo(() => {
    return filterVn2000LookupOptions(tableOptions, searchQuery)
  }, [tableOptions, searchQuery])

  const filteredZone6Options = useMemo(() => {
    return filterVn2000LookupOptions(VN2000_ZONE6_OPTIONS, searchQuery)
  }, [searchQuery])

  const visiblePresets = useMemo(() => {
    return [...filteredProvinceOptions, ...filteredZone6Options]
  }, [filteredProvinceOptions, filteredZone6Options])

  // Keep highlighted item in view within the popover list
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector('[data-highlighted="true"]')
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  // Keyboard activation on closed trigger button
  const handleTriggerKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setIsOpen(true)
    }
  }

  // Keyboard navigation inside popover listbox (strictly 1-step across [role="option"] items)
  const handlePopoverKeyDown = (e) => {
    const totalItems = visiblePresets.length + 2 // + custom + unconfigured

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setIsOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex((prev) => (prev + 1 >= totalItems ? 0 : prev + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex((prev) => (prev - 1 < 0 ? totalItems - 1 : prev - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (highlightedIndex >= 0 && highlightedIndex < visiblePresets.length) {
        onSelectPreset(visiblePresets[highlightedIndex].id)
        setIsOpen(false)
        triggerRef.current?.focus()
      } else if (highlightedIndex === visiblePresets.length) {
        onSelectPreset('custom')
        setIsOpen(false)
        triggerRef.current?.focus()
      } else if (highlightedIndex === visiblePresets.length + 1) {
        onSelectPreset('unconfigured')
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }
  }

  const handleSwitchLookupTable = (nextTable) => {
    setLookupTable(nextTable)
    setHighlightedIndex(-1)
    searchInputRef.current?.focus()
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
      return {
        primary: activePreset.primaryTitle,
        secondary: `${activePreset.tableShortLabel} · ${activePreset.documentNumber} · Múi ${
          activePreset.zone === '6deg' ? '6°' : '3°'
        } (k₀=${activePreset.k0 ?? 0.9999})`,
        badge: activePreset.tableShortLabel,
        badgeClass:
          activePreset.tableType === 'cadastral'
            ? 'bg-[#39B58A]/15 text-[#39B58A]'
            : 'bg-[#22B7C9]/15 text-[#22B7C9]',
      }
    }
    return {
      primary: `VN-2000 · L₀ = ${selectedCm || '--'}°`,
      secondary: `k₀ = ${scaleFactor || '--'}`,
      badge: selectedCm ? `L₀ = ${selectedCm}°` : 'VN-2000',
      badgeClass: 'bg-[#22B7C9]/15 text-[#22B7C9]',
    }
  }, [selectedPresetId, activePreset, selectedCm, scaleFactor])

  const activeTableMeta = VN2000_CATALOG_METADATA.tables[lookupTable]

  return (
    <div className="relative w-full text-left">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Chọn hệ quy chiếu VN-2000 kinh tuyến trục và múi chiếu"
        title={triggerDisplay.primary}
        className={`w-full p-2.5 rounded-lg bg-[#0B1220] border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
          isOpen
            ? 'border-[#22B7C9] ring-1 ring-[#22B7C9]/30 bg-[#0E1726]'
            : 'border-[#27384E] hover:border-[#3E5677] hover:bg-[#111D2E]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-[#E8EEF6] leading-snug break-words">
              {triggerDisplay.primary}
            </span>
          </div>
          <div className="text-[10.5px] font-mono text-[#8FA3BA] truncate mt-0.5">
            {triggerDisplay.secondary}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${triggerDisplay.badgeClass}`}
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

      {/* Floating Popover Panel via React Portal */}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={handlePopoverKeyDown}
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
            {/* Header: Table Switcher (Hành chính / Địa chính) + Search Input */}
            <div className="p-2 border-b border-[#27384E] bg-[#111D2E]/95 shrink-0 space-y-1.5">
              <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0B1220] border border-[#27384E]">
                <button
                  type="button"
                  data-table-tab="administrative"
                  aria-pressed={lookupTable === 'administrative'}
                  onClick={() => handleSwitchLookupTable('administrative')}
                  className={`py-1 px-2 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                    lookupTable === 'administrative'
                      ? 'bg-[#17263C] text-[#22B7C9] border border-[#22B7C9]/40'
                      : 'text-[#8FA3BA] hover:text-[#E8EEF6]'
                  }`}
                >
                  <span>Hành chính</span>
                  <span className="text-[10px] font-mono opacity-80">(34)</span>
                </button>
                <button
                  type="button"
                  data-table-tab="cadastral"
                  aria-pressed={lookupTable === 'cadastral'}
                  onClick={() => handleSwitchLookupTable('cadastral')}
                  className={`py-1 px-2 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                    lookupTable === 'cadastral'
                      ? 'bg-[#17263C] text-[#39B58A] border border-[#39B58A]/40'
                      : 'text-[#8FA3BA] hover:text-[#E8EEF6]'
                  }`}
                >
                  <span>Địa chính</span>
                  <span className="text-[10px] font-mono opacity-80">(34)</span>
                </button>
              </div>

              <div className="flex items-center justify-between px-0.5 text-[10px] text-[#8FA3BA]">
                <span className="truncate font-medium">
                  Nguồn: {activeTableMeta.documentNumber} (HL {activeTableMeta.effectiveDate})
                </span>
                <span className="font-mono shrink-0 text-[#A9B9CE]">
                  v{VN2000_CATALOG_METADATA.catalogVersion}
                </span>
              </div>

              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-[#8FA3BA] absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setHighlightedIndex(-1)
                  }}
                  placeholder="Tìm tỉnh/thành hoặc kinh tuyến (VD: Lâm Đồng, lam dong, 107,75, 107°45′)..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-md bg-[#0B1220] border border-[#27384E] text-[12px] text-[#E8EEF6] placeholder-[#7E92AA] focus:outline-none focus:border-[#22B7C9]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setHighlightedIndex(-1)
                      searchInputRef.current?.focus()
                    }}
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
              {visiblePresets.map((preset, idx) => {
                const isSelected = activePreset?.id === preset.id
                const isHighlighted = highlightedIndex === idx
                const isMultiMeridian = preset.meridianCountInTable > 1
                const badgeTone =
                  preset.tableType === 'cadastral'
                    ? 'bg-[#39B58A]/15 text-[#39B58A] border-[#39B58A]/30'
                    : preset.tableType === 'zone6'
                    ? 'bg-[#A855F7]/15 text-[#C084FC] border-[#A855F7]/30'
                    : 'bg-[#22B7C9]/15 text-[#22B7C9] border-[#22B7C9]/30'

                return (
                  <div
                    key={preset.id}
                    role="option"
                    aria-selected={isSelected}
                    data-preset-id={preset.id}
                    data-highlighted={isHighlighted ? 'true' : undefined}
                    title={`${preset.primaryTitle} — ${preset.tableLabel} (${preset.documentNumber})`}
                    onClick={() => {
                      onSelectPreset(preset.id)
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
                      <div className="text-[12px] font-bold text-[#E8EEF6] leading-snug break-words">
                        {preset.primaryTitle}
                      </div>
                      <div className="text-[10.5px] font-mono text-[#8FA3BA] mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.2 rounded border text-[10px] font-sans font-semibold ${badgeTone}`}
                        >
                          {preset.tableShortLabel}
                        </span>
                        {isMultiMeridian && (
                          <span className="px-1.5 py-0.2 rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FBBF24] text-[10px] font-sans font-semibold">
                            Mức {preset.meridianIndexInTable}/{preset.meridianCountInTable} · Chọn rõ L₀
                          </span>
                        )}
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

              {visiblePresets.length === 0 && (
                <div className="p-3.5 text-center space-y-1 text-[11.5px] text-[#8FA3BA]">
                  <div className="font-semibold text-[#C0CEDF]">
                    Không tìm thấy trong danh mục 34 tỉnh, thành ({activeTableMeta.shortLabel}).
                  </div>
                  <div className="text-[11px] leading-relaxed">
                    Với bản vẽ DXF lập theo tỉnh/thành cũ trước sáp nhập, không tự gán theo tỉnh mới — hãy nhập trực tiếp L₀ theo hồ sơ khảo sát.
                  </div>
                </div>
              )}

              {/* Special Option: Custom L0 */}
              <div
                role="option"
                aria-selected={selectedPresetId === 'custom'}
                data-preset-id="custom"
                data-highlighted={highlightedIndex === visiblePresets.length ? 'true' : undefined}
                onClick={() => {
                  onSelectPreset('custom')
                  setIsOpen(false)
                  triggerRef.current?.focus()
                }}
                className={`p-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-colors bg-[#111D2E]/40 ${
                  selectedPresetId === 'custom'
                    ? 'bg-[#17263C] border-l-2 border-l-[#F06421]'
                    : highlightedIndex === visiblePresets.length
                    ? 'bg-[#142033]'
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
                data-preset-id="unconfigured"
                data-highlighted={highlightedIndex === visiblePresets.length + 1 ? 'true' : undefined}
                onClick={() => {
                  onSelectPreset('unconfigured')
                  setIsOpen(false)
                  triggerRef.current?.focus()
                }}
                className={`p-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-colors bg-[#111D2E]/20 ${
                  selectedPresetId === 'unconfigured'
                    ? 'bg-[#17263C] border-l-2 border-l-[#F59E0B]'
                    : highlightedIndex === visiblePresets.length + 1
                    ? 'bg-[#142033]'
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
          </div>,
          document.body
        )}
    </div>
  )
}
