import React, { useMemo, useState } from 'react';
import type { LearningMaterial } from '../types/hocLieu';
import { HocLieuCard } from './HocLieuCard';
import { MaterialExportModal } from './MaterialExportModal';
import { MaterialExportToolbar } from './MaterialExportToolbar';

interface HocLieuListProps {
  materials: LearningMaterial[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  onViewMaterial: (material: LearningMaterial) => void;
  onDownloadMaterial: (material: LearningMaterial) => void;
  canToggleShareLink?: (material: LearningMaterial) => boolean;
  onToggleShareLink?: (material: LearningMaterial) => void;
  togglingShareId?: string | null;
  renderActions?: (material: LearningMaterial) => React.ReactNode;
  enableQrExport?: boolean;
}

export function HocLieuList({
  materials,
  loading,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onViewMaterial,
  onDownloadMaterial,
  canToggleShareLink,
  onToggleShareLink,
  togglingShareId,
  renderActions,
  enableQrExport = true,
}: HocLieuListProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportTargets, setExportTargets] = useState<LearningMaterial[]>([]);

  const visibleIdSet = useMemo(() => new Set(materials.map((m) => m.id)), [materials]);
  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => visibleIdSet.has(id)),
    [selectedIds, visibleIdSet]
  );

  const selectedMaterials = useMemo(() => {
    const picked = new Set(activeSelectedIds);
    return materials.filter((m) => picked.has(m.id));
  }, [materials, activeSelectedIds]);

  const allSelected =
    materials.length > 0 && activeSelectedIds.length === materials.length;

  function handleToggleSelect(material: LearningMaterial) {
    setSelectedIds((prev) =>
      prev.includes(material.id)
        ? prev.filter((id) => id !== material.id)
        : [...prev, material.id]
    );
  }

  function handleToggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(materials.map((m) => m.id));
    }
  }

  function handleBulkExport() {
    const listToExport =
      selectedMaterials.length > 0 ? selectedMaterials : materials;
    if (listToExport.length > 0) {
      setExportTargets(listToExport);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div
            key={n}
            className="h-64 rounded-2xl border border-slate-200 bg-white p-5 animate-pulse space-y-4"
          >
            <div className="h-3 w-1/2 bg-slate-200 rounded" />
            <div className="h-5 w-4/5 bg-slate-200 rounded" />
            <div className="h-10 w-full bg-slate-100 rounded" />
            <div className="h-10 w-full bg-slate-100 rounded mt-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
        <p className="text-lg font-bold text-slate-900">{emptyTitle}</p>
        <p className="text-[15px] text-slate-600 max-w-md mx-auto">{emptyDescription}</p>
        {emptyAction && <div className="pt-2 flex flex-wrap justify-center gap-3">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {enableQrExport && (
        <MaterialExportToolbar
          totalVisible={materials.length}
          selectedCount={activeSelectedIds.length}
          allSelected={allSelected}
          onToggleSelectAll={handleToggleSelectAll}
          onClearSelection={() => setSelectedIds([])}
          onExportSelected={handleBulkExport}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {materials.map((m) => (
          <HocLieuCard
            key={m.id}
            material={m}
            onView={onViewMaterial}
            onDownload={onDownloadMaterial}
            onExportQr={enableQrExport ? (item) => setExportTargets([item]) : undefined}
            canToggleShareLink={canToggleShareLink ? canToggleShareLink(m) : false}
            onToggleShareLink={onToggleShareLink}
            togglingShare={togglingShareId === m.id}
            selected={enableQrExport && activeSelectedIds.includes(m.id)}
            onToggleSelect={enableQrExport ? handleToggleSelect : undefined}
            actions={renderActions ? renderActions(m) : undefined}
          />
        ))}
      </div>

      <MaterialExportModal
        materials={exportTargets}
        onClose={() => setExportTargets([])}
        onExportDownload={(items) => items.forEach((item) => onDownloadMaterial(item))}
      />
    </div>
  );
}

