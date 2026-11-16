import React, { useState } from 'react'
import {
  X,
  Building2,
  CheckCircle2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Copy,
  Info,
} from 'lucide-react'
import {
  DEFAULT_PROJECT_PROFILES,
  SECTION_3_SPECS,
  SECTION_4_SPECS,
} from '../utils/projectProfiles'

export default function ProjectProfileModal({
  isOpen,
  onClose,
  profiles,
  activeProjectId,
  onSelectProject,
  onSaveProfiles,
}) {
  const [selectedEditId, setSelectedEditId] = useState(activeProjectId)
  const [editingProfile, setEditingProfile] = useState(() => {
    const found = profiles.find((p) => p.id === activeProjectId) || profiles[0]
    return found ? JSON.parse(JSON.stringify(found)) : null
  })
  const [hasChanges, setHasChanges] = useState(false)

  if (!isOpen) return null

  const handleSelectToEdit = (id) => {
    const found = profiles.find((p) => p.id === id)
    if (found) {
      setSelectedEditId(id)
      setEditingProfile(JSON.parse(JSON.stringify(found)))
      setHasChanges(false)
    }
  }

  const handleParamChange = (field, val) => {
    if (!editingProfile) return
    setEditingProfile((prev) => ({
      ...prev,
      params: {
        ...prev.params,
        [field]: val,
      },
    }))
    setHasChanges(true)
  }

  const handleMetaChange = (field, val) => {
    if (!editingProfile) return
    setEditingProfile((prev) => ({
      ...prev,
      [field]: val,
    }))
    setHasChanges(true)
  }

  const handleCrsChange = (field, val) => {
    if (!editingProfile) return
    setEditingProfile((prev) => ({
      ...prev,
      crs: {
        ...prev.crs,
        [field]: val,
      },
    }))
    setHasChanges(true)
  }

  const handleSaveCurrent = () => {
    if (!editingProfile) return
    const updated = profiles.map((p) =>
      p.id === editingProfile.id ? editingProfile : p
    )
    onSaveProfiles(updated)
    setHasChanges(false)
  }

  const handleCreateNew = () => {
    const newId = `project-${Date.now()}`
    const newProfile = {
      id: newId,
      name: 'Dự án Mới (Chưa đặt tên)',
      code: `DA-${new Date().getFullYear()}`,
      description: 'Hồ sơ thiết kế kỹ thuật mới được khởi tạo',
      crs: {
        province: 'Lâm Đồng',
        centralMeridian: '107.75',
        scaleFactor: '0.9999',
        axisOrder: 'AUTO',
      },
      params: {
        roadWidth: '7.0',
        laneCount: '2',
        segmentLength: '100',
        slabLength: '4.0',
        slabThicknessCentimeters: '22',
        contractionJointSpacingMeters: '4.0',
        expansionJointSpacingMeters: '100.0',
        expansionJointGapMillimeters: '20',
        surveyWidthMeters: '14.0',
      },
      confirmedAt: new Date().toISOString().slice(0, 10),
      confirmedBy: 'Kỹ sư dự án',
    }
    const updated = [...profiles, newProfile]
    onSaveProfiles(updated)
    setSelectedEditId(newId)
    setEditingProfile(newProfile)
    onSelectProject(newId)
    setHasChanges(false)
  }

  const handleDuplicate = () => {
    if (!editingProfile) return
    const newId = `project-copy-${Date.now()}`
    const duplicated = {
      ...editingProfile,
      id: newId,
      name: `${editingProfile.name} (Bản sao)`,
      code: `${editingProfile.code}-COPY`,
    }
    const updated = [...profiles, duplicated]
    onSaveProfiles(updated)
    setSelectedEditId(newId)
    setEditingProfile(duplicated)
    setHasChanges(false)
  }

  const handleDelete = (id) => {
    if (profiles.length <= 1) return
    const updated = profiles.filter((p) => p.id !== id)
    onSaveProfiles(updated)
    const nextActive = updated[0].id
    setSelectedEditId(nextActive)
    setEditingProfile(JSON.parse(JSON.stringify(updated[0])))
    if (activeProjectId === id) {
      onSelectProject(nextActive)
    }
    setHasChanges(false)
  }

  const handleResetDefaults = () => {
    if (confirm('Khôi phục danh sách bộ thông số dự án về mặc định của hệ thống?')) {
      onSaveProfiles(DEFAULT_PROJECT_PROFILES)
      const def = DEFAULT_PROJECT_PROFILES[0]
      setSelectedEditId(def.id)
      setEditingProfile(JSON.parse(JSON.stringify(def)))
      onSelectProject(def.id)
      setHasChanges(false)
    }
  }

  return (
    <div
      data-testid="project-profile-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#111D2E] border border-[#27384E] rounded-xl shadow-2xl flex flex-col overflow-hidden text-[#E8EEF6]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#27384E] bg-[#0B1220] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-[#F06421]" />
            <div>
              <h2 className="text-[15px] font-bold text-[#E8EEF6]">
                Quản Lý Bộ Thông Số Dự Án (Project Profiles)
              </h2>
              <p className="text-[11.5px] text-[#8FA3BA]">
                Khai báo thông số kỹ thuật chuẩn của dự án để tự điền và kiểm chứng bản vẽ DXF
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#17263C] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content: Split Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Project List */}
          <div className="w-72 border-r border-[#27384E] bg-[#0B1220]/40 flex flex-col shrink-0">
            <div className="p-3 border-b border-[#27384E] flex items-center justify-between">
              <span className="text-[11.5px] font-bold uppercase tracking-wider text-[#8FA3BA]">
                Danh sách dự án ({profiles.length})
              </span>
              <button
                type="button"
                onClick={handleCreateNew}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#F06421] hover:bg-[#FF7635] text-white text-[11px] font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {profiles.map((p) => {
                const isActive = p.id === activeProjectId
                const isSelected = p.id === selectedEditId
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectToEdit(p.id)}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#17263C] border-[#22B7C9] text-[#E8EEF6]'
                        : 'bg-[#0B1220]/60 border-[#27384E] hover:bg-[#17263C]/50 text-[#C0CEDF]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] font-mono font-bold text-[#22B7C9] bg-[#22B7C9]/10 px-1.5 py-0.5 rounded border border-[#22B7C9]/30">
                        {p.code || 'DA'}
                      </span>
                      {isActive && (
                        <span className="flex items-center gap-1 text-[10.5px] font-semibold text-[#4ADE80] bg-[#22C55E]/15 px-1.5 py-0.5 rounded border border-[#22C55E]/40">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Đang chọn</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[12.5px] font-semibold truncate" title={p.name}>
                      {p.name}
                    </div>
                    <div className="text-[11px] text-[#8FA3BA] truncate mt-0.5">
                      B={p.params?.roadWidth || '-'}m • Cọc={p.params?.segmentLength || '-'}m • Dày={p.params?.slabThicknessCentimeters || '-'}cm
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-2 border-t border-[#27384E] bg-[#0B1220]/80">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] text-[#8FA3BA] hover:text-[#E8EEF6] hover:bg-[#17263C] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục mặc định</span>
              </button>
            </div>
          </div>

          {/* Right Column: Project Details & Parameters Editor */}
          {editingProfile ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Top Banner: Activation status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0B1220] border border-[#27384E]">
                <div>
                  <div className="text-[13px] font-bold text-[#E8EEF6] flex items-center gap-2">
                    <span>{editingProfile.name}</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#17263C] text-[#22B7C9] border border-[#27384E]">
                      {editingProfile.code}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[#8FA3BA] mt-0.5">
                    Xác nhận bởi: <strong className="text-[#C0CEDF]">{editingProfile.confirmedBy || 'Chưa rõ'}</strong> • {editingProfile.confirmedAt || 'Mới nhất'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {editingProfile.id !== activeProjectId ? (
                    <button
                      type="button"
                      onClick={() => onSelectProject(editingProfile.id)}
                      className="px-3 py-1.5 rounded-md bg-[#22B7C9] hover:bg-[#20A6B7] text-[#0B1220] font-bold text-[12px] cursor-pointer"
                    >
                      Đặt làm dự án đang chọn
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-[12px] font-semibold text-[#4ADE80] bg-[#22C55E]/15 px-2.5 py-1 rounded border border-[#22C55E]/40">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Đang chọn cho Studio</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    title="Nhân bản bộ thông số này"
                    className="p-1.5 rounded border border-[#27384E] bg-[#17263C] text-[#A9B9CE] hover:text-[#E8EEF6] cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {profiles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(editingProfile.id)}
                      title="Xóa dự án này"
                      className="p-1.5 rounded border border-[#EF4444]/40 bg-[#EF4444]/10 text-[#FCA5A5] hover:bg-[#EF4444]/20 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* General Project Metadata */}
              <div className="space-y-3">
                <div className="text-[12px] font-bold text-[#A9B9CE] uppercase tracking-wider">
                  Thông tin hồ sơ dự án
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[12px] font-medium text-[#C0CEDF]">Tên dự án</label>
                    <input
                      type="text"
                      value={editingProfile.name || ''}
                      onChange={(e) => handleMetaChange('name', e.target.value)}
                      className="w-full px-3 py-1.5 rounded bg-[#0B1220] border border-[#27384E] text-[12.5px] text-[#E8EEF6] focus:border-[#22B7C9] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-medium text-[#C0CEDF]">Mã dự án (Code)</label>
                    <input
                      type="text"
                      value={editingProfile.code || ''}
                      onChange={(e) => handleMetaChange('code', e.target.value)}
                      className="w-full px-3 py-1.5 rounded bg-[#0B1220] border border-[#27384E] text-[12.5px] font-mono text-[#E8EEF6] focus:border-[#22B7C9] focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[12px] font-medium text-[#C0CEDF]">Mô tả phạm vi / Ghi chú</label>
                    <input
                      type="text"
                      value={editingProfile.description || ''}
                      onChange={(e) => handleMetaChange('description', e.target.value)}
                      className="w-full px-3 py-1.5 rounded bg-[#0B1220] border border-[#27384E] text-[12.5px] text-[#E8EEF6] focus:border-[#22B7C9] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3 Parameters */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-bold text-[#A9B9CE] uppercase tracking-wider">
                    Mục 3: Thông số hình học &amp; Tấm BTXM
                  </div>
                  <span className="text-[11px] text-[#22B7C9] font-medium">
                    Tự điền khi nạp DXF (nếu DXF thiếu)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {SECTION_3_SPECS.map((spec) => (
                    <div key={spec.key} className="space-y-1">
                      <label className="text-[12px] font-medium text-[#C0CEDF] flex items-center justify-between">
                        <span>{spec.label}</span>
                        <span className="text-[#8FA3BA] font-mono text-[11px]">[{spec.unit}]</span>
                      </label>
                      <input
                        type="number"
                        step={spec.step || 'any'}
                        min={spec.min}
                        max={spec.max}
                        value={editingProfile.params?.[spec.key] ?? ''}
                        placeholder="Để trống nếu chưa xác nhận"
                        onChange={(e) => handleParamChange(spec.key, e.target.value)}
                        className="w-full px-3 py-1.5 rounded bg-[#0B1220] border border-[#27384E] font-mono font-bold text-[13px] text-[#E8EEF6] focus:border-[#F06421] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 4 Parameters */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-bold text-[#A9B9CE] uppercase tracking-wider">
                    Mục 4: Thông số thiết kế BTXM (Dossier)
                  </div>
                  <span className="text-[11px] text-[#22B7C9] font-medium">
                    Tự điền khi nạp DXF (nếu DXF thiếu)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {SECTION_4_SPECS.map((spec) => (
                    <div key={spec.key} className="space-y-1">
                      <label className="text-[12px] font-medium text-[#C0CEDF] flex items-center justify-between">
                        <span>{spec.label}</span>
                        <span className="text-[#8FA3BA] font-mono text-[11px]">[{spec.unit}]</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={editingProfile.params?.[spec.key] ?? ''}
                        placeholder="Để trống nếu chưa xác nhận"
                        onChange={(e) => handleParamChange(spec.key, e.target.value)}
                        className="w-full px-3 py-1.5 rounded bg-[#0B1220] border border-[#27384E] font-mono font-bold text-[13px] text-[#E8EEF6] focus:border-[#22B7C9] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Corridor Survey Width & CRS */}
              <div className="space-y-3">
                <div className="text-[12px] font-bold text-[#A9B9CE] uppercase tracking-wider">
                  Khảo sát &amp; Hệ quy chiếu VN-2000
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[12px] font-medium text-[#C0CEDF]">
                      Bề rộng khảo sát mặc định (m)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={editingProfile.params?.surveyWidthMeters ?? ''}
                      placeholder="VD: 14.0"
                      onChange={(e) => handleParamChange('surveyWidthMeters', e.target.value)}
                      className="w-full px-3 py-1.5 rounded bg-[#0B1220] border border-[#27384E] font-mono font-bold text-[13px] text-[#E8EEF6] focus:border-[#22B7C9] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-medium text-[#C0CEDF]">
                      Kinh tuyến trục L₀ (Độ)
                    </label>
                    <input
                      type="text"
                      value={editingProfile.crs?.centralMeridian ?? '107.75'}
                      placeholder="VD: 107.75"
                      onChange={(e) => handleCrsChange('centralMeridian', e.target.value)}
                      className="w-full px-3 py-1.5 rounded bg-[#0B1220] border border-[#27384E] font-mono text-[13px] text-[#E8EEF6] focus:border-[#22B7C9] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Information Note */}
              <div className="p-3 rounded-lg bg-[#22B7C9]/10 border border-[#22B7C9]/30 flex items-start gap-2.5 text-[12px] text-[#A9B9CE]">
                <Info className="w-4 h-4 text-[#22B7C9] shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="text-[#E8EEF6] block">Quy tắc ưu tiên tự động điền:</strong>
                  Khi nạp file DXF, hệ thống ưu tiên số đọc được có căn cứ rõ từ bản vẽ. Nếu DXF thiếu, các ô sẽ nhận giá trị của bộ thông số dự án này. Kỹ sư có thể chỉnh sửa cho từng bản vẽ cụ thể mà không làm thay đổi hồ sơ dự án gốc.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#8FA3BA]">
              Chọn hoặc tạo dự án để chỉnh sửa thông số
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#27384E] bg-[#0B1220] flex items-center justify-between shrink-0">
          <div className="text-[11.5px] text-[#8FA3BA]">
            {hasChanges ? (
              <span className="text-[#FBBF24]">Có thay đổi chưa lưu</span>
            ) : (
              <span>Dữ liệu đã được lưu trữ</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-md border border-[#27384E] bg-[#17263C] text-[#E8EEF6] text-[12.5px] font-semibold hover:bg-[#20324D] cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSaveCurrent}
              disabled={!hasChanges}
              className="px-4 py-1.5 rounded-md bg-[#F06421] hover:bg-[#FF7635] disabled:opacity-50 text-white text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
