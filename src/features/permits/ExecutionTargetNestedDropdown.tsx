import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SapConfigRecord } from '../../core/types/config.types';
import {
  formatExecutionTarget,
  normalizeWorkCenterTarget,
  isWorkCenterExecutionTarget,
} from './PermitCreateModule';

interface ExecutionTargetNestedDropdownProps {
  id?: string;
  execDept: string;
  execPlant: string;
  workCenterDesc?: string;
  workCenterCode?: string;
  onChange: (dept: string, plant: string) => void;
  deptOptions: SapConfigRecord[];
  plantOptions: SapConfigRecord[];
  disabled?: boolean;
}

export const ExecutionTargetNestedDropdown: React.FC<ExecutionTargetNestedDropdownProps> = ({
  id = 'field-exec-dept-container',
  execDept,
  execPlant,
  workCenterDesc,
  workCenterCode,
  onChange,
  deptOptions,
  plantOptions,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDept, setActiveDept] = useState<SapConfigRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync active department with selected execDept when opened
  useEffect(() => {
    if (isOpen) {
      if (execDept) {
        const match = deptOptions.find(
          (d) => d.Config_Desc === execDept || d.Config_Code === execDept
        );
        if (match) {
          setActiveDept(match);
          return;
        }
      }
      if (deptOptions.length > 0 && !activeDept) {
        setActiveDept(deptOptions[0]);
      }
    }
  }, [isOpen, execDept, deptOptions]);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Search filtered lists
  const filteredDepartments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return deptOptions;
    return deptOptions.filter(
      (d) =>
        d.Config_Desc.toLowerCase().includes(q) ||
        d.Config_Code.toLowerCase().includes(q)
    );
  }, [deptOptions, searchQuery]);

  const filteredPlants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return plantOptions;
    return plantOptions.filter(
      (p) =>
        p.Config_Desc.toLowerCase().includes(q) ||
        p.Config_Code.toLowerCase().includes(q)
    );
  }, [plantOptions, searchQuery]);

  const wcTarget = normalizeWorkCenterTarget(workCenterDesc);
  const isUsingWorkCenter = isWorkCenterExecutionTarget(execDept, execPlant, workCenterDesc);

  const handleSelect = (dept: SapConfigRecord, plant?: SapConfigRecord) => {
    const deptValue = dept.Config_Desc || dept.Config_Code;
    const plantValue = plant ? plant.Config_Desc || plant.Config_Code : '';
    onChange(deptValue, plantValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleSelectWorkCenter = () => {
    if (!wcTarget) return;
    onChange(wcTarget, '');
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '');
  };

  const matchedDeptCode = useMemo(() => {
    return (
      deptOptions.find(
        (d) => d.Config_Desc === execDept || d.Config_Code === execDept
      )?.Config_Code || execDept
    );
  }, [execDept, deptOptions]);

  const formattedDisplay = useMemo(() => {
    if (!execDept) return '';
    return formatExecutionTarget(execPlant, execDept, matchedDeptCode);
  }, [execPlant, execDept, matchedDeptCode]);

  // Effective department highlighted on right
  const currentDept = activeDept || deptOptions[0] || null;

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button Field matching standard ptw-select height & styling */}
      <div
        id={id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`w-full min-h-[42px] h-[42px] px-3.5 flex items-center justify-between gap-2.5 bg-white border rounded-xl text-xs font-sans cursor-pointer select-none transition-all duration-150 ${
          isOpen
            ? 'border-[#006398] ring-2 ring-[#006398]/20 shadow-xs'
            : 'border-slate-300 hover:border-slate-400 hover:shadow-2xs'
        } ${disabled ? 'bg-slate-100 cursor-not-allowed opacity-75' : ''}`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden flex-1">
          <span className="material-symbols-outlined text-[20px] text-[#006398] shrink-0">
            account_tree
          </span>

          {formattedDisplay ? (
            <div className="flex items-center gap-2 truncate">
              {execPlant ? (
                <>
                  <span className="font-bold text-slate-900 truncate tracking-tight">
                    {execPlant}
                  </span>
                  <span className="text-slate-300 font-bold shrink-0">—</span>
                  <span className="font-semibold text-[#006398] bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/70 text-[11px] truncate shrink-0">
                    {execDept}
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-2 truncate">
                  <span className="font-bold text-slate-800 truncate">
                    {execDept}
                  </span>
                  {isUsingWorkCenter && (
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/80 shrink-0">
                      {workCenterCode ? `WC: ${workCenterCode}` : 'Work Center'}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <span className="text-slate-400 font-normal">
              Select Department & Sub Working Plant...
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {formattedDisplay && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear selection"
              className="p-1 hover:bg-slate-100 text-slate-400 hover:text-rose-500 rounded-md transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] block">close</span>
            </button>
          )}
          <span
            className={`material-symbols-outlined text-[20px] text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[#006398]' : ''
            }`}
          >
            expand_more
          </span>
        </div>
      </div>

      {/* Floating Cascading Menu */}
      {isOpen && (
        <div
          className="absolute z-[9999] left-0 top-[calc(100%+6px)] w-full min-w-[320px] sm:min-w-[620px] max-w-[95vw] sm:max-w-[700px] bg-white rounded-2xl border border-slate-200 shadow-[0_20px_50px_rgba(15,23,42,0.18),0_6px_16px_rgba(15,23,42,0.08)] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Slim, elegant header with inline search */}
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200/90 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <span className="material-symbols-outlined text-[18px] text-[#006398]">
                domain_verification
              </span>
              <span className="text-xs font-bold text-slate-800">
                Execution Target Selection
              </span>
            </div>

            {/* Quick Filter Box */}
            <div className="relative flex-1 max-w-[280px]">
              <span className="material-symbols-outlined text-[16px] text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter dept or plant..."
                className="w-full pl-8 pr-7 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#006398] focus:ring-2 focus:ring-[#006398]/15 shadow-2xs placeholder:text-slate-400"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Option: Work Center Description */}
          {wcTarget && (
            <div className="px-3.5 py-2 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[16px] text-indigo-600 shrink-0">
                  precision_manufacturing
                </span>
                <div className="truncate text-[11px]">
                  <span className="font-semibold text-slate-600 mr-1.5">
                    Work Center{workCenterCode ? ` (${workCenterCode})` : ''}:
                  </span>
                  <span className="font-bold text-indigo-950 font-mono">
                    {wcTarget}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSelectWorkCenter}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                  isUsingWorkCenter
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {isUsingWorkCenter ? 'check_circle' : 'bolt'}
                </span>
                <span>{isUsingWorkCenter ? 'Selected' : 'Use Work Center'}</span>
              </button>
            </div>
          )}

          {/* 2-Column Cascading Body */}
          <div className="flex flex-col sm:flex-row h-[340px] divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-white">
            {/* Column 1: Executing Departments (Fixed width 240px) */}
            <div className="w-full sm:w-[240px] shrink-0 overflow-y-auto p-2 space-y-0.5 bg-slate-50/50">
              <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                1. Departments ({filteredDepartments.length})
              </div>

              {filteredDepartments.map((dept) => {
                const isCurrentActive = currentDept?.Config_Code === dept.Config_Code;
                const isSelectedDept =
                  execDept === dept.Config_Desc || execDept === dept.Config_Code;

                return (
                  <div
                    key={dept.Config_Code}
                    onMouseEnter={() => setActiveDept(dept)}
                    onClick={() => setActiveDept(dept)}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-all duration-150 ${
                      isCurrentActive
                        ? 'bg-white text-[#006398] font-bold shadow-xs border border-blue-200/80 border-l-[3px] border-l-[#006398]'
                        : isSelectedDept
                        ? 'bg-slate-100/90 text-slate-900 font-semibold'
                        : 'text-slate-700 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`material-symbols-outlined text-[17px] shrink-0 ${
                          isCurrentActive
                            ? 'text-[#006398]'
                            : isSelectedDept
                            ? 'text-slate-700'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        apartment
                      </span>
                      <span className="truncate">{dept.Config_Desc}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {isSelectedDept && (
                        <span className="material-symbols-outlined text-[14px] text-emerald-600">
                          check
                        </span>
                      )}
                      <span
                        className={`material-symbols-outlined text-[16px] transition-transform ${
                          isCurrentActive
                            ? 'text-[#006398] translate-x-0.5'
                            : 'text-slate-300 group-hover:text-slate-500'
                        }`}
                      >
                        chevron_right
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredDepartments.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400">
                  No departments found
                </div>
              )}
            </div>

            {/* Column 2: Sub Working Plants for Active Department */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {currentDept ? (
                <>
                  {/* Department Subheader */}
                  <div className="px-3.5 py-2 bg-gradient-to-r from-sky-50/70 via-slate-50 to-white border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-[11px] font-medium text-slate-500">
                        Plants for:
                      </span>
                      <span className="text-xs font-bold text-[#006398] bg-white px-2 py-0.5 rounded-md border border-sky-200/80 shadow-2xs truncate">
                        {currentDept.Config_Desc}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {filteredPlants.length} Plants available
                    </span>
                  </div>

                  {/* Direct Assignment Option */}
                  <div className="p-2 border-b border-slate-100 bg-slate-50/30 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSelect(currentDept)}
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-[#006398] hover:bg-white border border-dashed border-slate-300 hover:border-[#006398] transition-all duration-150"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-slate-400">
                          check_circle
                        </span>
                        <span>Assign to {currentDept.Config_Desc} directly</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        (No specific plant)
                      </span>
                    </button>
                  </div>

                  {/* Scrollable Plant List */}
                  <div className="overflow-y-auto p-2 space-y-1 flex-1">
                    {filteredPlants.map((plant) => {
                      const isSelected =
                        execPlant === plant.Config_Desc &&
                        (execDept === currentDept.Config_Desc || execDept === currentDept.Config_Code);

                      return (
                        <button
                          key={plant.Config_Code}
                          type="button"
                          onClick={() => handleSelect(currentDept, plant)}
                          className={`w-full group flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-all duration-150 ${
                            isSelected
                              ? 'bg-sky-50 text-[#006398] font-bold border border-sky-200 shadow-2xs'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <span
                              className={`material-symbols-outlined text-[17px] shrink-0 ${
                                isSelected
                                  ? 'text-[#006398]'
                                  : 'text-slate-400 group-hover:text-slate-600'
                              }`}
                            >
                              factory
                            </span>
                            <span className="truncate">{plant.Config_Desc}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100/70 group-hover:bg-slate-200/60 px-1.5 py-0.5 rounded border border-slate-200/50">
                              {plant.Config_Code}
                            </span>
                            {isSelected && (
                              <span className="material-symbols-outlined text-[16px] text-[#006398]">
                                check_circle
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}

                    {filteredPlants.length === 0 && (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No matching plants found for "{searchQuery}"
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-slate-400">
                  Hover or click a department on the left to view plants.
                </div>
              )}
            </div>
          </div>

          {/* Slim Status / Action Footer */}
          <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 text-xs flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
              <span>Target:</span>
              <span className="font-mono font-bold text-[#006398] truncate">
                {formattedDisplay || 'None selected'}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                {formattedDisplay.length}/40 chars
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
