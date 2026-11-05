import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { ModuleDefinition, SapUser } from '../../core/auth/sapAuthContext';
import { sitePermitApi } from '../../core/api/modules/sitePermit.api';
import { isolationApi } from '../../core/api/modules/isolation.api';
import { toast } from '../../shared/context/ToastContext';

import {
  todayISO,
  dateToISO,
  getPresetStart,
  formatDate,
  exportToCSV,
  convertSapToReportRecords,
  getPermitTypeMeta,
  getIsolationTypeMeta,
  type Category,
  type Preset,
  type ReportRecord,
} from './reports/reportConstants';

import { PermitTypeCode } from './reports/PermitTypeCode';
import { IsolationType } from './reports/IsolationType';
import { ReportAnalytics } from './reports/ReportAnalytics';

export interface ReportModuleProps {
  module: ModuleDefinition;
  user: SapUser | null;
  onBack?: () => void;
  onOpenPermit?: (permitNo: string) => void;
}

const PLANTS = [
  { id: '1002', name: '1002 - Dahej Central Complex', location: 'Dahej, Gujarat' },
  { id: '1001', name: '1001 - Fluoropolymer Unit', location: 'Dahej Plant 1' },
  { id: '1003', name: '1003 - Chlor-Alkali Block', location: 'Dahej Plant 3' },
  { id: '1004', name: '1004 - Central Utilities & Power', location: 'Dahej Utilities' },
];

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-200/80 text-2xl font-mono text-slate-500 shadow-inner">
        ∅
      </div>
      <h3 className="text-base font-bold text-slate-800">{message}</h3>
      <p className="mt-2 max-w-md text-xs sm:text-sm text-slate-500">
        Try modifying the date range or clearing the active search and category filters.
      </p>
    </div>
  );
}

function getTypeMeta(category: Category, type: string) {
  return category === 'permit' ? getPermitTypeMeta(type) : getIsolationTypeMeta(type);
}

export const ReportModule: React.FC<ReportModuleProps> = ({
  user,
  onBack,
  onOpenPermit,
}) => {
  const today = todayISO();

  // Selected Plant & Live Sync
  const [selectedPlant, setSelectedPlant] = useState<string>(user?.plant || '1002');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Master records (strictly live data from SAP)
  const [records, setRecords] = useState<ReportRecord[]>([]);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overall' | Category | 'analytics'>('overall');

  // Overall Tab Records View: 'live' (last 3 months) vs 'archived' (> 3 months)
  const [recordView, setRecordView] = useState<'live' | 'archived'>('live');

  // Overall Tab Search & Filters
  const [overallSearchQuery, setOverallSearchQuery] = useState('');
  const [overallCategoryFilter, setOverallCategoryFilter] = useState<'ALL' | 'permit' | 'isolation'>('ALL');
  const [overallDeptFilter, setOverallDeptFilter] = useState('ALL');
  const [overallSortField, setOverallSortField] = useState<'date' | 'category' | 'permitNo' | 'type' | 'department'>('date');
  const [overallSortDirection, setOverallSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Date Synchronization Mode: When enabled, changing Date or Preset in either Permit or Isolation syncs both!
  const [isDateSyncEnabled, setIsDateSyncEnabled] = useState(true);

  // Filter States for Permit and Isolation Matrix Tables
  const [permitStart, setPermitStart] = useState('');
  const [permitEnd, setPermitEnd] = useState(today);
  const [isolationStart, setIsolationStart] = useState('');
  const [isolationEnd, setIsolationEnd] = useState(today);

  const [permitPresets, setPermitPresets] = useState<Preset[]>([]);
  const [isolationPresets, setIsolationPresets] = useState<Preset[]>([]);

  const [permitPresetOpen, setPermitPresetOpen] = useState(false);
  const [isolationPresetOpen, setIsolationPresetOpen] = useState(false);

  const [permitSearchOpen, setPermitSearchOpen] = useState(false);
  const [isolationSearchOpen, setIsolationSearchOpen] = useState(false);
  const [permitSearch, setPermitSearch] = useState('');
  const [isolationSearch, setIsolationSearch] = useState('');

  // Drill-down Modal State
  const [drillDownModal, setDrillDownModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    records: ReportRecord[];
  } | null>(null);

  // Single Record Detail Modal
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<ReportRecord | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. Fetch Live SAP Records on Mount / Plant Change
  const loadData = async (plantId = selectedPlant) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsRefreshing(true);

    try {
      const [permitRes, isolationRes] = await Promise.all([
        sitePermitApi.list(plantId, '', 0, controller.signal, 'ALL', 'ALL', 500, ['_WorkType']).catch((err) => {
          console.warn('[ReportModule] sitePermitApi.list failed:', err);
          return [];
        }),
        isolationApi.list(undefined, controller.signal).catch((err) => {
          console.warn('[ReportModule] isolationApi.list failed:', err);
          return [];
        }),
      ]);

      // Enrich with locally created permits cache for instant discovery of _WorkType and additional categories
      let enrichedPermits: any[] = [...(permitRes || [])];
      try {
        if (import.meta.env.DEV && typeof window !== 'undefined' && window.localStorage) {
          const localPermits: any[] = JSON.parse(window.localStorage.getItem('ptw_recent_created_permits') || '[]');
          if (Array.isArray(localPermits) && localPermits.length > 0) {
            localPermits.forEach((lp) => {
              const existingIdx = enrichedPermits.findIndex((p) => p.Permit_No === lp.Permit_No);
              if (existingIdx !== -1) {
                // If existing permit from SAP has no _WorkType, enrich it from local cache!
                const existing = enrichedPermits[existingIdx];
                const hasExistingWorkType = Array.isArray(existing._WorkType) && existing._WorkType.length > 0;
                if (!hasExistingWorkType && (lp._WorkType?.length || lp.additionalTypes?.length)) {
                  enrichedPermits[existingIdx] = {
                    ...existing,
                    _WorkType: lp._WorkType || existing._WorkType,
                    additionalTypes: lp.additionalTypes || existing.additionalTypes
                  };
                }
              } else if (lp.Permit_No && (!plantId || lp.Werks === plantId)) {
                // Newly created permit not yet indexed in SAP list
                enrichedPermits.unshift(lp);
              }
            });
          }
        }
      } catch (cacheErr) {
        console.warn('[ReportModule] Could not load local permit cache:', cacheErr);
      }

      const unified = convertSapToReportRecords(enrichedPermits, isolationRes || []);
      setRecords(unified);
      if (enrichedPermits.length > 0 || (isolationRes && isolationRes.length > 0)) {
        toast.info(`Synced ${enrichedPermits.length} live permits & ${isolationRes?.length || 0} isolations from SAP Gateway for Plant ${plantId}`);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.warn('[ReportModule] Failed to fetch live SAP records:', err);
        setRecords([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsRefreshing(false);
        setLastRefreshedAt(new Date());
      }
    }
  };

  useEffect(() => {
    loadData(selectedPlant);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [selectedPlant]);

  // Synchronized Date & Preset Handlers
  function handlePermitStartDateChange(val: string) {
    setPermitStart(val);
    if (isDateSyncEnabled) {
      setIsolationStart(val);
    }
  }

  function handlePermitEndDateChange(val: string) {
    setPermitEnd(val);
    if (isDateSyncEnabled) {
      setIsolationEnd(val);
    }
  }

  function handleIsolationStartDateChange(val: string) {
    setIsolationStart(val);
    if (isDateSyncEnabled) {
      setPermitStart(val);
    }
  }

  function handleIsolationEndDateChange(val: string) {
    setIsolationEnd(val);
    if (isDateSyncEnabled) {
      setPermitEnd(val);
    }
  }

  function togglePreset(category: Category, preset: Preset) {
    const current = category === 'permit' ? permitPresets : isolationPresets;
    const isAdding = !current.includes(preset);
    const updated = isAdding
      ? [...current, preset]
      : current.filter((item) => item !== preset);

    if (category === 'permit') {
      setPermitPresets(updated);
      if (isDateSyncEnabled) {
        setIsolationPresets(updated);
      }
    } else {
      setIsolationPresets(updated);
      if (isDateSyncEnabled) {
        setPermitPresets(updated);
      }
    }
  }

  function handleClearPresets(category: Category) {
    if (category === 'permit') {
      setPermitPresets([]);
      if (isDateSyncEnabled) {
        setIsolationPresets([]);
      }
    } else {
      setIsolationPresets([]);
      if (isDateSyncEnabled) {
        setPermitPresets([]);
      }
    }
  }

  // Filter records based on category, dates and presets
  function filterRecords(
    category: Category,
    start: string,
    end: string,
    presets: Preset[]
  ) {
    const categoryRecords = records
      .filter((r) => r.category === category)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    const effectiveEnd = end || today;

    if (!start && presets.length === 0) {
      return categoryRecords.filter((r) => !end || r.date <= effectiveEnd);
    }

    const presetStarts = presets.map((p) => getPresetStart(p, effectiveEnd));

    return categoryRecords.filter((r) => {
      const withinCustomDates =
        (!start || r.date >= start) && (!end || r.date <= end);

      const withinPreset =
        presets.length === 0 ||
        presetStarts.some(
          (presetStart) => r.date >= presetStart && r.date <= effectiveEnd
        );

      return withinCustomDates && withinPreset;
    });
  }

  const permitRecords = useMemo(
    () => filterRecords('permit', permitStart, permitEnd, permitPresets),
    [records, permitStart, permitEnd, permitPresets, today]
  );

  const isolationRecords = useMemo(
    () => filterRecords('isolation', isolationStart, isolationEnd, isolationPresets),
    [records, isolationStart, isolationEnd, isolationPresets, today]
  );

  const allRecords = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    [records]
  );

  const threeMonthsAgo = useMemo(() => {
    const date = new Date(`${today}T12:00:00`);
    date.setMonth(date.getMonth() - 3);
    return dateToISO(date);
  }, [today]);

  const liveRecords = useMemo(
    () =>
      allRecords
        .filter((record) => record.date >= threeMonthsAgo)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    [allRecords, threeMonthsAgo]
  );

  const archivedRecords = useMemo(
    () =>
      allRecords
        .filter((record) => record.date < threeMonthsAgo)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    [allRecords, threeMonthsAgo]
  );

  const baseRecordsForView = recordView === 'live' ? liveRecords : archivedRecords;

  // Filtered & Sorted Overall Display Records
  const displayRecords = useMemo(() => {
    let filtered = baseRecordsForView;

    // 1. Search Query
    if (overallSearchQuery.trim()) {
      const q = overallSearchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.permitNo.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          (r.location && r.location.toLowerCase().includes(q))
      );
    }

    // 2. Category Filter
    if (overallCategoryFilter !== 'ALL') {
      filtered = filtered.filter((r) => r.category === overallCategoryFilter);
    }

    // 3. Department Filter
    if (overallDeptFilter !== 'ALL') {
      filtered = filtered.filter((r) => r.department === overallDeptFilter);
    }

    // 4. Sorting
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (overallSortField) {
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
        case 'permitNo':
          comparison = a.permitNo.localeCompare(b.permitNo);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'department':
          comparison = a.department.localeCompare(b.department);
          break;
      }
      return overallSortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [
    baseRecordsForView,
    overallSearchQuery,
    overallCategoryFilter,
    overallDeptFilter,
    overallSortField,
    overallSortDirection,
  ]);

  // Pagination Slicing
  const paginatedRecords = useMemo(() => {
    if (pageSize >= displayRecords.length) return displayRecords;
    const startIndex = (currentPage - 1) * pageSize;
    return displayRecords.slice(startIndex, startIndex + pageSize);
  }, [displayRecords, currentPage, pageSize]);

  const totalPages = Math.ceil(displayRecords.length / pageSize) || 1;

  const departments = useMemo(
    () => [...new Set(allRecords.map((r) => r.department))].sort(),
    [allRecords]
  );

  // Departments with active permits or isolations in current window
  const activeDepartments = useMemo(() => {
    const activeSet = new Set<string>();
    permitRecords.forEach((r) => activeSet.add(r.department));
    isolationRecords.forEach((r) => activeSet.add(r.department));
    return [...activeSet].sort();
  }, [permitRecords, isolationRecords]);

  function resetFilters() {
    setPermitStart('');
    setPermitEnd(today);
    setIsolationStart('');
    setIsolationEnd(today);

    setPermitPresets([]);
    setIsolationPresets([]);

    setPermitSearch('');
    setIsolationSearch('');

    setPermitSearchOpen(false);
    setIsolationSearchOpen(false);
    setPermitPresetOpen(false);
    setIsolationPresetOpen(false);

    setOverallSearchQuery('');
    setOverallCategoryFilter('ALL');
    setOverallDeptFilter('ALL');
    setCurrentPage(1);

    toast.info('All report filters have been reset to default range.');
  }

  // Export Overall Records to CSV
  function handleExportOverallCSV() {
    const headers = ['Date', 'Category', 'Permit/Isolation No', 'Type', 'Department', 'Status', 'Location'];
    const rows = displayRecords.map((r) => [
      `"${r.date}"`,
      `"${r.category.toUpperCase()}"`,
      `"${r.permitNo}"`,
      `"${r.type}"`,
      `"${r.department}"`,
      `"${r.status || 'ACTIVE'}"`,
      `"${r.location || 'Dahej Complex'}"`,
    ]);
    exportToCSV(`GFL-overall-${recordView}-filtered-records.csv`, headers, rows);
  }

  // Drill Down Handler from Matrix Tables
  function handleCellDrillDown(department: string, type: string, cellRecords: ReportRecord[]) {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(department);
    const deptTitle = department === 'ALL'
      ? 'All Departments'
      : isDate
      ? `Created on ${formatDate(department)}`
      : department;
    const typeTitle = type === 'ALL' ? 'All Types' : type;
    setDrillDownModal({
      isOpen: true,
      title: `${deptTitle} • ${typeTitle}`,
      subtitle: `${cellRecords.length} record(s) matching selected criteria`,
      records: cellRecords,
    });
  }

  const totalFilteredActivity = permitRecords.length + isolationRecords.length;

  const summaryCards = [
    {
      label: 'Permit records',
      value: permitRecords.length,
      caption: 'Matching active permit filters',
      icon: 'P',
      color: 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/25',
      cardStyle: 'border-t-4 border-t-blue-600 bg-gradient-to-br from-white via-white to-blue-50/70',
      badge: `${((permitRecords.length / Math.max(allRecords.length, 1)) * 100).toFixed(0)}%`,
      badgeStyle: 'bg-blue-100/90 text-blue-800 border border-blue-200',
      valueStyle: 'text-blue-900',
    },
    {
      label: 'Isolation records',
      value: isolationRecords.length,
      caption: 'Matching active isolation filters',
      icon: 'I',
      color: 'bg-gradient-to-br from-purple-600 to-violet-700 text-white shadow-md shadow-purple-500/25',
      cardStyle: 'border-t-4 border-t-purple-600 bg-gradient-to-br from-white via-white to-purple-50/70',
      badge: `${((isolationRecords.length / Math.max(allRecords.length, 1)) * 100).toFixed(0)}%`,
      badgeStyle: 'bg-purple-100/90 text-purple-800 border border-purple-200',
      valueStyle: 'text-purple-900',
    },
    {
      label: 'Active Departments',
      value: activeDepartments.length,
      caption: `Out of ${departments.length} total departments`,
      icon: 'D',
      color: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/25',
      cardStyle: 'border-t-4 border-t-amber-500 bg-gradient-to-br from-white via-white to-amber-50/70',
      badge: `${activeDepartments.length} Units`,
      badgeStyle: 'bg-amber-100/90 text-amber-800 border border-amber-200',
      valueStyle: 'text-amber-950',
    },
    {
      label: 'Total activity',
      value: totalFilteredActivity,
      caption: `Permits + isolations (Plant total: ${allRecords.length})`,
      icon: 'Σ',
      color: 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-500/25',
      cardStyle: 'border-t-4 border-t-emerald-600 bg-gradient-to-br from-white via-white to-emerald-50/70',
      badge: 'Filtered Sum',
      badgeStyle: 'bg-emerald-100/90 text-emerald-800 border border-emerald-200',
      valueStyle: 'text-emerald-950',
    },
  ];

  const tabs = [
    ['overall', 'Overall report', 'dashboard'],
    ['permit', 'Permit type', 'description'],
    ['isolation', 'Isolation type', 'lock'],
    ['analytics', 'Charts & Analytics', 'query_stats'],
  ] as const;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50/20 to-indigo-50/30 px-3 py-4 sm:px-6 lg:px-8 text-slate-800">
      <style>{`
        @media print {
          body { background: white !important; font-size: 10pt !important; }
          nav, button, select, input, .no-print { display: none !important; }
          main { background: white !important; padding: 0 !important; }
          header { border: 1px solid #cbd5e1 !important; box-shadow: none !important; border-top: 4px solid #006398 !important; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td { border: 1px solid #cbd5e1 !important; color: #0f172a !important; }
          .shadow-sm, .shadow-md, .shadow-2xs, .shadow-xs, .shadow-xl, .shadow-2xl { box-shadow: none !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[1750px] space-y-5">
        {/* Top Header Card */}
        <header className="rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xs p-5 sm:p-6 shadow-md shadow-slate-200/50 border-t-4 border-t-[#006398]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Title & Plant Context */}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer mr-1"
                    title="Return to Launchpad"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    <span>Launchpad</span>
                  </button>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[#006398] px-2.5 py-1 text-xs font-mono font-bold text-white shadow-2xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
                  SAP EAM PTW
                </span>
                <span className="text-xs font-mono text-slate-500 font-semibold">
                  Last Synced: {lastRefreshedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-slate-900">
                Work Permit &amp; Isolation Report
              </h1>

              <p className="max-w-3xl text-xs sm:text-sm leading-relaxed text-slate-500">
                Comprehensive operational tracking for permits-to-work, hazardous energy isolations, and cross-departmental maintenance activities across Gujarat Fluorochemicals Limited.
              </p>
            </div>

            {/* Plant Selector & Action Controls */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Linked Date Ranges Sync Toggle */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !isDateSyncEnabled;
                  setIsDateSyncEnabled(nextState);
                  if (nextState) {
                    setIsolationStart(permitStart);
                    setIsolationEnd(permitEnd);
                    setIsolationPresets(permitPresets);
                    toast.info('Permit and Isolation date ranges are now synchronized.');
                  } else {
                    toast.info('Date ranges unlinked for independent Permit/Isolation filtering.');
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition cursor-pointer shadow-2xs ${
                  isDateSyncEnabled
                    ? 'border-blue-400 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="When enabled, changing date filters or presets updates both Permit & Isolation matrices in sync"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isDateSyncEnabled ? 'link' : 'link_off'}
                </span>
                <span>{isDateSyncEnabled ? 'Sync Dates: ON' : 'Sync Dates: OFF'}</span>
              </button>

              {/* Plant Switcher */}
              <div className="relative">
                <select
                  value={selectedPlant}
                  onChange={(e) => setSelectedPlant(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:bg-white shadow-2xs transition-colors cursor-pointer"
                  aria-label="Select Operating Plant"
                >
                  {PLANTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => loadData(selectedPlant)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                title="Refresh records from SAP Gateway"
              >
                <span className={`material-symbols-outlined text-[16px] text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`}>
                  sync
                </span>
                <span>{isRefreshing ? 'Syncing...' : 'Sync SAP'}</span>
              </button>

              {/* Print / PDF Button */}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 transition-colors shadow-2xs cursor-pointer"
                title="Print or Save Report as PDF (Shift Handover / Toolbox Talk)"
              >
                <span className="material-symbols-outlined text-[16px] text-slate-600">print</span>
                <span>Print / PDF</span>
              </button>

              {/* Reset Filters Button */}
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 cursor-pointer active:scale-98"
                onClick={resetFilters}
              >
                <span className="text-base leading-none text-amber-400">↺</span>
                <span>Reset filters</span>
              </button>
            </div>
          </div>
        </header>

        {/* 4 Summary KPI Cards */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md ${card.cardStyle}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-slate-600 uppercase tracking-wider">
                  {card.label}
                </span>
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ${card.color}`}
                >
                  {card.icon}
                </span>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <div className={`text-3xl sm:text-4xl font-display font-black tracking-tight ${card.valueStyle}`}>
                  {card.value}
                </div>
                <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${card.badgeStyle}`}>
                  {card.badge}
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-500 font-medium">{card.caption}</p>
            </div>
          ))}
        </section>

        {/* Navigation Tabs Bar */}
        <nav
          className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200/90 bg-white/90 backdrop-blur-xs p-2 shadow-sm"
          aria-label="Report views"
        >
          {tabs.map(([key, label, iconName]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition cursor-pointer ${
                activeTab === key
                  ? 'bg-gradient-to-r from-[#006398] to-[#0284c7] text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{iconName}</span>
              <span>{label}</span>
              {key === 'permit' && (
                <span className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] font-bold ${activeTab === key ? 'bg-white/20 text-white' : 'bg-blue-100 text-[#006398]'}`}>
                  {permitRecords.length}
                </span>
              )}
              {key === 'isolation' && (
                <span className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] font-bold ${activeTab === key ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-800'}`}>
                  {isolationRecords.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* TAB 1: OVERALL REPORT */}
        {activeTab === 'overall' && (
          <section className="space-y-6">
            {/* Overall Activity Master Table Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm space-y-4">
              {/* Header & Controls Strip */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006398] text-[22px]">list_alt</span>
                    Overall Activity
                  </h2>
                  <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                    {recordView === 'live'
                      ? 'Live permit and isolation records from the last 3 months, ordered by date.'
                      : 'Archived permit and isolation records older than 3 months, ordered by date.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Export CSV Button */}
                  {displayRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExportOverallCSV}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition shadow-2xs cursor-pointer"
                      title="Download displayed records as CSV"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      <span>Export CSV</span>
                    </button>
                  )}

                  {/* Live vs Archived Record Switcher */}
                  <div className="flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        setRecordView('live');
                        setCurrentPage(1);
                      }}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                        recordView === 'live'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                    >
                      Live Records ({liveRecords.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRecordView('archived');
                        setCurrentPage(1);
                      }}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                        recordView === 'archived'
                          ? 'bg-slate-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                    >
                      Archived Records ({archivedRecords.length})
                    </button>
                  </div>

                  <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-xs font-mono font-bold text-blue-700 border border-blue-200">
                    {displayRecords.length} records
                  </span>
                </div>
              </div>

              {/* Real-Time Filter Toolbar for Overall Table */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-100 py-3 bg-slate-50/50 px-3 rounded-xl">
                {/* Search Box */}
                <div className="relative min-w-[240px] flex-1 max-w-md">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 material-symbols-outlined text-[16px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={overallSearchQuery}
                    onChange={(e) => {
                      setOverallSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search permit no, department, type, location..."
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 py-1.5 text-xs font-mono text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-2xs"
                  />
                  {overallSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setOverallSearchQuery('');
                        setCurrentPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono font-medium text-slate-500 hidden sm:inline">Category:</span>
                  {(['ALL', 'permit', 'isolation'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setOverallCategoryFilter(cat);
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                        overallCategoryFilter === cat
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {cat === 'ALL' ? 'All' : cat === 'permit' ? 'Permits' : 'Isolations'}
                    </button>
                  ))}
                </div>

                {/* Department Dropdown Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono font-medium text-slate-500 hidden sm:inline">Dept:</span>
                  <select
                    value={overallDeptFilter}
                    onChange={(e) => {
                      setOverallDeptFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs outline-none focus:border-blue-500"
                  >
                    <option value="ALL">All Departments ({departments.length})</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table Container with Generous Screen Space */}
              {displayRecords.length === 0 ? (
                <EmptyState message="No work/isolation done matching the active search or filters" />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
                  {/* Generous max-height to properly use screen space */}
                  <div className="max-h-[460px] overflow-auto">
                    <table className="w-full min-w-[840px] border-collapse text-left text-xs">
                      <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-xs text-[11px] font-mono uppercase tracking-wider text-slate-600 shadow-xs border-b border-slate-200">
                        <tr>
                          <th
                            className="px-5 py-3.5 font-bold cursor-pointer hover:text-blue-700 select-none"
                            onClick={() => {
                              if (overallSortField === 'date') {
                                setOverallSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                              } else {
                                setOverallSortField('date');
                                setOverallSortDirection('desc');
                              }
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <span>Date</span>
                              {overallSortField === 'date' && (
                                <span>{overallSortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="px-5 py-3.5 font-bold cursor-pointer hover:text-blue-700 select-none"
                            onClick={() => {
                              if (overallSortField === 'category') {
                                setOverallSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                              } else {
                                setOverallSortField('category');
                                setOverallSortDirection('asc');
                              }
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <span>Category</span>
                              {overallSortField === 'category' && (
                                <span>{overallSortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="px-5 py-3.5 font-bold cursor-pointer hover:text-blue-700 select-none"
                            onClick={() => {
                              if (overallSortField === 'permitNo') {
                                setOverallSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                              } else {
                                setOverallSortField('permitNo');
                                setOverallSortDirection('asc');
                              }
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <span>Permit / Isolation No.</span>
                              {overallSortField === 'permitNo' && (
                                <span>{overallSortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="px-5 py-3.5 font-bold cursor-pointer hover:text-blue-700 select-none"
                            onClick={() => {
                              if (overallSortField === 'type') {
                                setOverallSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                              } else {
                                setOverallSortField('type');
                                setOverallSortDirection('asc');
                              }
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <span>Type</span>
                              {overallSortField === 'type' && (
                                <span>{overallSortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="px-5 py-3.5 font-bold cursor-pointer hover:text-blue-700 select-none"
                            onClick={() => {
                              if (overallSortField === 'department') {
                                setOverallSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                              } else {
                                setOverallSortField('department');
                                setOverallSortDirection('asc');
                              }
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <span>Department</span>
                              {overallSortField === 'department' && (
                                <span>{overallSortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th className="px-5 py-3.5 font-bold text-right">Action</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 bg-white">
                        {paginatedRecords.map((r) => (
                          <tr
                            key={`${r.category}-${r.id}`}
                            className="transition-colors hover:bg-blue-50/40"
                          >
                            <td className="whitespace-nowrap px-5 py-3 font-mono text-slate-600">
                              {formatDate(r.date)}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-mono font-bold ${
                                  r.category === 'permit'
                                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                    : 'bg-violet-100 text-violet-700 border border-violet-200'
                                }`}
                              >
                                {r.category === 'permit' ? 'Permit' : 'Isolation'}
                              </span>
                            </td>
                            <td className="px-5 py-3 font-mono font-bold text-slate-800">
                              <button
                                type="button"
                                onClick={() => setSelectedRecordForDetail(r)}
                                className="hover:text-blue-700 transition-colors cursor-pointer text-left font-mono"
                                title="Click to view full record metadata"
                              >
                                {r.permitNo}
                              </button>
                            </td>
                            <td className="px-5 py-3">
                              {(() => {
                                const meta = getTypeMeta(r.category, r.type);
                                return (
                                  <div className="flex flex-col gap-1 items-start">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono font-bold shadow-2xs ${meta.badgeBg} ${meta.badgeText} border ${meta.borderClass}`}
                                      >
                                        <span className="material-symbols-outlined text-[13px]">{meta.icon}</span>
                                        <span>{meta.label}</span>
                                      </span>
                                      {r.category === 'permit' && (
                                        <span
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold bg-[#006398]/10 text-[#006398] border border-[#006398]/30"
                                          title="Primary Authorization Category from SAP OData"
                                        >
                                          <span className="h-1.5 w-1.5 rounded-full bg-[#006398]" />
                                          Primary
                                        </span>
                                      )}
                                    </div>

                                    {/* Additional Work Types (_WorkType Child Table) */}
                                    {r.additionalTypes && r.additionalTypes.length > 0 && (
                                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                        <span
                                          className="text-[9px] font-mono font-bold text-purple-700 uppercase tracking-wider"
                                          title="Additional Applicable Work Categories configured in Section A (stored in SAP child table _WorkType)"
                                        >
                                          +{r.additionalTypes.length} _WorkType:
                                        </span>
                                        {r.additionalTypes.map((addT) => {
                                          const addMeta = getPermitTypeMeta(addT);
                                          return (
                                            <span
                                              key={addT}
                                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[9px] font-bold shadow-2xs ${addMeta.badgeBg} ${addMeta.badgeText} border ${addMeta.borderClass}`}
                                              title={`Additional Category: ${addMeta.label} (_WorkType)`}
                                            >
                                              <span className="material-symbols-outlined text-[11px]">{addMeta.icon}</span>
                                              <span>{addT}</span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-5 py-3 text-slate-700 font-medium">
                              {r.department}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  if (onOpenPermit && r.category === 'permit') {
                                    onOpenPermit(r.permitNo);
                                  } else {
                                    setSelectedRecordForDetail(r);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[15px]">visibility</span>
                                <span>Inspect</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>

                      <tfoot className="border-t border-slate-200 bg-slate-50 font-display">
                        <tr className="sticky bottom-0 z-20 bg-slate-50 shadow-xs">
                          <td
                            colSpan={3}
                            className="px-5 py-3.5 font-bold text-slate-700 bg-slate-50 border-t border-slate-200"
                          >
                            Total Activity ({recordView === 'live' ? 'Live <3M' : 'Archived >3M'})
                          </td>
                          <td
                            colSpan={3}
                            className="px-5 py-3.5 font-mono font-extrabold text-slate-900 bg-slate-50 border-t border-slate-200 text-right pr-8"
                          >
                            {displayRecords.length} records matching
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Pagination Controls */}
              {displayRecords.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs font-mono text-slate-500 pt-1">
                  <div>
                    Showing <strong>{Math.min((currentPage - 1) * pageSize + 1, displayRecords.length)}</strong> to{' '}
                    <strong>{Math.min(currentPage * pageSize, displayRecords.length)}</strong> of{' '}
                    <strong>{displayRecords.length}</strong> filtered records
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span>Rows:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={1000}>All</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                        className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        Previous
                      </button>
                      <span className="px-2">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                        className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Stacked Matrix Reports in Overall View */}
            <div className="space-y-6">
              <PermitTypeCode
                records={permitRecords}
                startDate={permitStart}
                endDate={permitEnd}
                onStartDate={handlePermitStartDateChange}
                onEndDate={handlePermitEndDateChange}
                searchOpen={permitSearchOpen}
                onToggleSearch={() => setPermitSearchOpen((v) => !v)}
                search={permitSearch}
                onSearch={setPermitSearch}
                selectedPresets={permitPresets}
                onTogglePreset={(p) => togglePreset('permit', p)}
                presetOpen={permitPresetOpen}
                onTogglePresetMenu={() => {
                  setPermitPresetOpen((v) => !v);
                  setIsolationPresetOpen(false);
                }}
                onClearPresets={() => handleClearPresets('permit')}
                isInitialView={!permitStart && permitPresets.length === 0}
                onCellDrillDown={handleCellDrillDown}
              />

              <IsolationType
                records={isolationRecords}
                startDate={isolationStart}
                endDate={isolationEnd}
                onStartDate={handleIsolationStartDateChange}
                onEndDate={handleIsolationEndDateChange}
                searchOpen={isolationSearchOpen}
                onToggleSearch={() => setIsolationSearchOpen((v) => !v)}
                search={isolationSearch}
                onSearch={setIsolationSearch}
                selectedPresets={isolationPresets}
                onTogglePreset={(p) => togglePreset('isolation', p)}
                presetOpen={isolationPresetOpen}
                onTogglePresetMenu={() => {
                  setIsolationPresetOpen((v) => !v);
                  setPermitPresetOpen(false);
                }}
                onClearPresets={() => handleClearPresets('isolation')}
                isInitialView={!isolationStart && isolationPresets.length === 0}
                onCellDrillDown={handleCellDrillDown}
              />
            </div>
          </section>
        )}

        {/* TAB 2: PERMIT TYPE ONLY */}
        {activeTab === 'permit' && (
          <PermitTypeCode
            records={permitRecords}
            startDate={permitStart}
            endDate={permitEnd}
            onStartDate={handlePermitStartDateChange}
            onEndDate={handlePermitEndDateChange}
            searchOpen={permitSearchOpen}
            onToggleSearch={() => setPermitSearchOpen((v) => !v)}
            search={permitSearch}
            onSearch={setPermitSearch}
            selectedPresets={permitPresets}
            onTogglePreset={(p) => togglePreset('permit', p)}
            presetOpen={permitPresetOpen}
            onTogglePresetMenu={() => {
              setPermitPresetOpen((v) => !v);
              setIsolationPresetOpen(false);
            }}
            onClearPresets={() => handleClearPresets('permit')}
            isInitialView={!permitStart && permitPresets.length === 0}
            onCellDrillDown={handleCellDrillDown}
          />
        )}

        {/* TAB 3: ISOLATION TYPE ONLY */}
        {activeTab === 'isolation' && (
          <IsolationType
            records={isolationRecords}
            startDate={isolationStart}
            endDate={isolationEnd}
            onStartDate={handleIsolationStartDateChange}
            onEndDate={handleIsolationEndDateChange}
            searchOpen={isolationSearchOpen}
            onToggleSearch={() => setIsolationSearchOpen((v) => !v)}
            search={isolationSearch}
            onSearch={setIsolationSearch}
            selectedPresets={isolationPresets}
            onTogglePreset={(p) => togglePreset('isolation', p)}
            presetOpen={isolationPresetOpen}
            onTogglePresetMenu={() => {
              setIsolationPresetOpen((v) => !v);
              setPermitPresetOpen(false);
            }}
            onClearPresets={() => handleClearPresets('isolation')}
            isInitialView={!isolationStart && isolationPresets.length === 0}
            onCellDrillDown={handleCellDrillDown}
          />
        )}

        {/* TAB 4: CHARTS & ANALYTICS */}
        {activeTab === 'analytics' && (
          <ReportAnalytics records={allRecords} />
        )}

        {/* Footer */}
        <footer className="flex flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white p-4 text-xs text-slate-500 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">GFL Dahej Central PTW Analytics</span>
            <span>•</span>
            <span>Plant {selectedPlant}</span>
          </div>
          <span className="text-slate-400">
            Departments and type columns are generated dynamically from matching SAP records.
          </span>
        </footer>

        {/* Modal 1: Matrix Cell Drill-Down Modal */}
        {drillDownModal && drillDownModal.isOpen && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
            onClick={() => setDrillDownModal(null)}
          >
            <div
              className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-display font-bold text-slate-900">
                    {drillDownModal.title}
                  </h3>
                  <p className="text-xs font-mono text-slate-500">
                    {drillDownModal.subtitle}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const headers = ['Date', 'Category', 'Permit/Isolation No', 'Type', 'Department', 'Location', 'Status'];
                      const rows = drillDownModal.records.map((r) => [
                        `"${r.date}"`,
                        `"${r.category}"`,
                        `"${r.permitNo}"`,
                        `"${r.type}"`,
                        `"${r.department}"`,
                        `"${r.location || 'Dahej Complex'}"`,
                        `"${r.status || 'ACTIVE'}"`,
                      ]);
                      exportToCSV(`GFL-drilldown-${drillDownModal.title.replace(/\s+/g, '_')}.csv`, headers, rows);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">download</span>
                    <span>Export CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDrillDownModal(null)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>

              {/* Drill-down list */}
              <div className="flex-1 overflow-auto rounded-xl border border-slate-200 shadow-2xs">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] font-mono uppercase tracking-wider text-slate-600 shadow-xs border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-bold">Date</th>
                      <th className="px-4 py-2.5 font-bold">Category</th>
                      <th className="px-4 py-2.5 font-bold">Number</th>
                      <th className="px-4 py-2.5 font-bold">Type</th>
                      <th className="px-4 py-2.5 font-bold">Department</th>
                      <th className="px-4 py-2.5 font-bold">Location</th>
                      <th className="px-4 py-2.5 font-bold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {drillDownModal.records.map((r) => (
                      <tr key={`${r.category}-${r.id}`} className="hover:bg-blue-50/40">
                        <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                          {formatDate(r.date)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                              r.category === 'permit'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {r.category.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-800">
                          {r.permitNo}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">
                          {(() => {
                            const meta = getTypeMeta(r.category, r.type);
                            return (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold shadow-2xs ${meta.badgeBg} ${meta.badgeText} border ${meta.borderClass}`}
                                >
                                  <span className="material-symbols-outlined text-[12px]">{meta.icon}</span>
                                  <span>{r.type}</span>
                                </span>
                                {r.isAdditional ? (
                                  <span
                                    className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200"
                                    title={`Additional category (_WorkType) on primary ${r.actualType || 'Permit'}`}
                                  >
                                    _WorkType Additional
                                  </span>
                                ) : (
                                  r.category === 'permit' && (
                                    <span
                                      className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-[#006398]/10 text-[#006398] border border-[#006398]/30"
                                      title="Primary Permit Category (SAP Config OData)"
                                    >
                                      Primary / Actual
                                    </span>
                                  )
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {r.department}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {r.location || 'Dahej Complex'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setDrillDownModal(null);
                              if (onOpenPermit && r.category === 'permit') {
                                onOpenPermit(r.permitNo);
                              } else {
                                setSelectedRecordForDetail(r);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[15px]">visibility</span>
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDrillDownModal(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal 2: Quick Record Inspector */}
        {selectedRecordForDetail && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
            onClick={() => setSelectedRecordForDetail(null)}
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                      selectedRecordForDetail.category === 'permit'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-violet-100 text-violet-700'
                    }`}
                  >
                    {selectedRecordForDetail.category === 'permit' ? 'P' : 'I'}
                  </span>
                  <div>
                    <h3 className="font-display font-bold text-slate-900">
                      {selectedRecordForDetail.permitNo}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-500">
                      {selectedRecordForDetail.category.toUpperCase()} • {selectedRecordForDetail.type}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRecordForDetail(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 font-mono text-[10px] block">Date</span>
                  <span className="font-mono font-bold text-slate-800">{formatDate(selectedRecordForDetail.date)}</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 font-mono text-[10px] block">Department</span>
                  <span className="font-semibold text-slate-800">{selectedRecordForDetail.department}</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 font-mono text-[10px] block">Status</span>
                  <span className="font-mono font-bold text-emerald-700">{selectedRecordForDetail.status || 'ACTIVE'}</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 font-mono text-[10px] block">Location</span>
                  <span className="font-semibold text-slate-800">{selectedRecordForDetail.location || 'Dahej Complex'}</span>
                </div>
              </div>

              {/* Active Work Categories Details (Primary & SAP _WorkType) */}
              {selectedRecordForDetail.category === 'permit' && (
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Permit Category / Type (SAP Config OData)
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      Primary: {selectedRecordForDetail.actualType || selectedRecordForDetail.type}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-500 block mb-1.5">
                      Additional Applicable Work Categories (SAP child table _WorkType)
                    </span>
                    {selectedRecordForDetail.additionalTypes && selectedRecordForDetail.additionalTypes.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-purple-100 text-purple-800">
                          {selectedRecordForDetail.additionalTypes.length + 1} Active Categories · _WorkType Active
                        </span>
                        {selectedRecordForDetail.additionalTypes.map((addType) => (
                          <span
                            key={addType}
                            className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-white text-purple-900 border border-purple-200 shadow-2xs"
                          >
                            + {addType}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">
                        No additional work categories configured (Single-category permit).
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                {onOpenPermit && selectedRecordForDetail.category === 'permit' && (
                  <button
                    type="button"
                    onClick={() => {
                      const pNo = selectedRecordForDetail.permitNo;
                      setSelectedRecordForDetail(null);
                      onOpenPermit(pNo);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition cursor-pointer"
                  >
                    <span>Open in Permit Approver</span>
                    <span className="material-symbols-outlined text-[16px]">launch</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedRecordForDetail(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default ReportModule;
