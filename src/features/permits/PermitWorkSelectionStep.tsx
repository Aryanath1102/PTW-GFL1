import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  WorkCategory,
  WorkReference,
  WorkSelection,
  WorkSource,
  ORDER_TYPES,
  permitWorkLookupApi,
  referenceId,
  referenceKey,
  validateWorkSearch
} from '../../core/api/modules/permitWorkLookup.api';
import { SectionCard } from '../../shared/components/SectionCard';
import { toast } from '../../shared/context/ToastContext';

const SOURCES: { id: WorkSource; title: string; share: string; description: string; icon: string }[] = [
  {
    id: 'notification',
    title: 'Maintenance Notification',
    share: '85% of work',
    description: 'M2 · Corrective maintenance notifications created by plant operations',
    icon: 'notification_important'
  },
  {
    id: 'order',
    title: 'Maintenance Order',
    share: '13% of work',
    description: 'PM01 / PM03 / PM05 / PM06 / PM07 / PM08 scheduled maintenance orders',
    icon: 'build'
  },
  {
    id: 'shutdown',
    title: 'Planned Shutdown',
    share: '2% of work',
    description: 'PM03 · Major overhaul and planned shutdown maintenance orders',
    icon: 'event_busy'
  }
];

interface Props {
  selection: WorkSelection | null;
  client?: string;
  isBlankPermit?: boolean;
  onStartBlankPermit?: () => void;
  onInvalidate: () => void;
  onContinue: (selection: WorkSelection) => void;
}

function formatDateIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultSearchDateRange(): { fromDate: string; toDate: string } {
  const now = new Date();
  const pastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    fromDate: formatDateIso(pastWeek),
    toDate: formatDateIso(now)
  };
}

type SortOption = 'plant-asc' | 'plant-desc' | 'date-desc' | 'date-asc' | 'priority' | 'reference';

export const PermitWorkSelectionStep: React.FC<Props> = ({
  selection,
  client,
  isBlankPermit = false,
  onStartBlankPermit,
  onInvalidate,
  onContinue
}) => {
  const [source, setSource] = useState<WorkSource>(() => selection?.source || 'notification');
  const [referenceIdFilter, setReferenceIdFilter] = useState(() => selection?.referenceId || '');
  const [allDates, setAllDates] = useState(() => (selection ? Boolean(selection.allDates) : false));
  const [fromDate, setFromDate] = useState(() => selection?.fromDate || defaultSearchDateRange().fromDate);
  const [toDate, setToDate] = useState(() => selection?.toDate || defaultSearchDateRange().toDate);
  const [orderType, setOrderType] = useState(selection?.orderType || '');
  const [rows, setRows] = useState<WorkReference[]>(selection ? [selection.reference] : []);
  const [chosen, setChosen] = useState<WorkReference | null>(selection?.reference || null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(Boolean(selection));
  const [error, setError] = useState<string | null>(null);

  // Client-side plant and type/category sorting & filtering
  const [selectedPlant, setSelectedPlant] = useState<string>('all');
  const [selectedTypeCategory, setSelectedTypeCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('plant-asc');

  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const invalidate = () => {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setChosen(null);
    setRows([]);
    setSearched(false);
    setError(null);
    onInvalidate();
  };

  const executeSearch = async (
    targetSource: WorkSource,
    refId: string,
    fDate: string,
    tDate: string,
    useAllDates: boolean,
    ordType: string
  ) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setSearched(true);

    const defaultCategory: WorkCategory =
      targetSource === 'notification' ? 'Corrective' : targetSource === 'shutdown' ? 'Shutdown' : 'Preventive';

    const criteria = {
      category: defaultCategory,
      source: targetSource,
      fromDate: useAllDates ? '' : fDate,
      toDate: useAllDates ? '' : tDate,
      orderType: ordType,
      referenceId: refId.trim(),
      allDates: useAllDates,
    };

    const validation = validateWorkSearch(criteria);
    if (validation) {
      setLoading(false);
      setError(validation);
      toast.warning(validation, { title: 'Search Validation' });
      return;
    }

    try {
      const results = await permitWorkLookupApi.search(criteria, controller.signal, client);
      if (controller.signal.aborted) return;
      setRows(results);
      if (results.length === 0) {
        toast.info('No matching work references found from SAP.');
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        const msg = reason instanceof Error ? reason.message : 'Could not load work references from SAP.';
        setError(msg);
        toast.error(msg, { title: 'SAP Lookup Failed' });
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const applyDatePreset = (days: number) => {
    const now = new Date();
    const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const newFrom = formatDateIso(past);
    const newTo = formatDateIso(now);
    setFromDate(newFrom);
    setToDate(newTo);
    setAllDates(false);
    if (searched) {
      invalidate();
      void executeSearch(source, referenceIdFilter, newFrom, newTo, false, orderType);
    }
  };

  const isPresetMatch = (days: number) => {
    const now = new Date();
    const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return fromDate === formatDateIso(past) && toDate === formatDateIso(now);
  };

  const fromDateIndicator = useMemo(() => {
    if (allDates) return null;
    if (isPresetMatch(0)) return 'Today';
    if (isPresetMatch(1)) return '1 Day Ago';
    if (isPresetMatch(2)) return '2 Days Ago';
    if (isPresetMatch(7)) return '1 Week Ago';
    if (isPresetMatch(14)) return '2 Weeks Ago';
    if (isPresetMatch(30)) return '30 Days Ago';
    return 'Start Date';
  }, [allDates, fromDate, toDate]);

  const toDateIndicator = useMemo(() => {
    if (allDates) return null;
    const nowIso = formatDateIso(new Date());
    if (toDate === nowIso) return 'Today';
    return 'End Date';
  }, [allDates, toDate]);

  // Automatically load notifications from SAP on initial mount within 1-week date range
  useEffect(() => {
    if (!selection && rows.length === 0 && !searched && !loading) {
      void executeSearch('notification', '', fromDate, toDate, false, '');
    }
  }, []);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    invalidate();
    void executeSearch(source, referenceIdFilter, fromDate, toDate, allDates, orderType);
  };

  const handleTriggerBlankPermit = () => {
    if (!onStartBlankPermit) return;
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setChosen(null);
    onStartBlankPermit();
  };

  // Extract distinct plants from API payload
  const distinctPlants = useMemo(() => {
    const plants = new Set<string>();
    rows.forEach((r) => {
      if (r.Plant) plants.add(r.Plant.trim());
    });
    return Array.from(plants).sort();
  }, [rows]);

  // Extract distinct Type & Category pairs from API payload
  const distinctTypeCategories = useMemo(() => {
    const map = new Map<string, { orderNotifType: string; workCategory: string; count: number }>();
    rows.forEach((r) => {
      const type = r.OrderNotifType || 'Unknown Type';
      const cat = r.WorkCategory || 'General';
      const key = `${type}__${cat}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, { orderNotifType: type, workCategory: cat, count: 1 });
      }
    });
    return Array.from(map.entries()).map(([key, data]) => ({ key, ...data }));
  }, [rows]);

  // Filter and sort rows plant-wise & criteria-wise after receiving API payload
  const processedRows = useMemo(() => {
    let list = [...rows];

    // Filter by plant
    if (selectedPlant !== 'all') {
      list = list.filter((r) => r.Plant === selectedPlant);
    }

    // Filter by type & category
    if (selectedTypeCategory !== 'all') {
      list = list.filter((r) => `${r.OrderNotifType || 'Unknown Type'}__${r.WorkCategory || 'General'}` === selectedTypeCategory);
    }

    // Sort rows (plant-wise specific sorting)
    list.sort((a, b) => {
      if (sortBy === 'plant-asc') {
        const cmp = (a.Plant || '').localeCompare(b.Plant || '');
        if (cmp !== 0) return cmp;
        return (b.WorkDate || '').localeCompare(a.WorkDate || '');
      }
      if (sortBy === 'plant-desc') {
        const cmp = (b.Plant || '').localeCompare(a.Plant || '');
        if (cmp !== 0) return cmp;
        return (b.WorkDate || '').localeCompare(a.WorkDate || '');
      }
      if (sortBy === 'date-desc') {
        return (b.WorkDate || '').localeCompare(a.WorkDate || '');
      }
      if (sortBy === 'date-asc') {
        return (a.WorkDate || '').localeCompare(b.WorkDate || '');
      }
      if (sortBy === 'priority') {
        return (a.Priority || '9').localeCompare(b.Priority || '9');
      }
      if (sortBy === 'reference') {
        return (a.ReferenceId || '').localeCompare(b.ReferenceId || '');
      }
      return 0;
    });

    return list;
  }, [rows, selectedPlant, selectedTypeCategory, sortBy]);

  // Group processed rows by Type & Category for UI display
  const groupedRows = useMemo(() => {
    const groups: {
      key: string;
      orderNotifType: string;
      workCategory: string;
      items: WorkReference[];
    }[] = [];

    const groupMap = new Map<string, WorkReference[]>();
    processedRows.forEach((r) => {
      const type = r.OrderNotifType || 'Unknown Type';
      const cat = r.WorkCategory || 'General';
      const key = `${type}__${cat}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(r);
    });

    groupMap.forEach((items, key) => {
      const [type, cat] = key.split('__');
      groups.push({
        key,
        orderNotifType: type,
        workCategory: cat,
        items,
      });
    });

    return groups;
  }, [processedRows]);

  return (
    <section className="space-y-4" aria-labelledby="work-selection-title">
      {/* Step Header Context Banner */}
      <div className="ptw-card p-3 sm:p-4 bg-gradient-to-r from-blue-50/90 via-sky-50/50 to-white border-blue-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#006398] text-white flex items-center justify-center shrink-0 shadow-2xs">
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">search_insights</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-[#006398]/10 text-[#006398] border border-[#006398]/20">
                  STEP 1
                </span>
                <h2 id="work-selection-title" className="font-display font-bold text-sm sm:text-base text-slate-900 tracking-tight">
                  Work Selection & SAP Reference Linkage
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-600 font-sans leading-relaxed max-w-3xl">
                Select whether work originates from an active notification or maintenance order, then choose the SAP reference to link into your permit.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {chosen && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-bold shrink-0">
                <span className="material-symbols-outlined text-[15px] text-emerald-600">check_circle</span>
                <span>Linked: {referenceId(source, chosen)}</span>
              </div>
            )}
            {isBlankPermit && !chosen && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono font-bold shrink-0">
                <span className="material-symbols-outlined text-[15px] text-amber-600">description</span>
                <span>Blank Permit Active</span>
              </div>
            )}
            {onStartBlankPermit && (
              <button
                type="button"
                id="btn-start-blank-permit"
                onClick={handleTriggerBlankPermit}
                className="px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 hover:border-amber-400 text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Create a standalone blank permit without an SAP Notification, Maintenance Order, or Shutdown reference"
              >
                <span className="material-symbols-outlined text-[16px] text-amber-700">note_add</span>
                <span>Create Blank Permit</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 1. Reference Document Source Selection Card */}
      <SectionCard
        theme="indigo"
        sectionTag="STEP 1.1"
        title="Reference Document Source"
        subtitle="Select whether work originates from a corrective notification, maintenance order, or planned shutdown."
        icon="source"
        badge={
          <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase">
            {source} ✓
          </span>
        }
      >
        <fieldset>
          <legend className="sr-only">Reference source</legend>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {SOURCES.map((item) => {
              const isSelected = source === item.id;

              return (
                <label
                  key={item.id}
                  className={`p-3 sm:p-3.5 rounded-xl border transition-all select-none flex flex-col justify-between cursor-pointer hover:border-slate-300 hover:-translate-y-0.5 ${
                    isSelected
                      ? 'border-[#006398] bg-gradient-to-br from-sky-50 via-white to-sky-100/60 ring-2 ring-[#006398]/20 shadow-[0_4px_12px_rgba(0,99,152,0.12),inset_0_1px_0_rgba(255,255,255,1)] -translate-y-0.5'
                      : 'border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_3px_rgba(15,23,42,0.03)] hover:shadow-card'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#006398]">
                        <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.2 font-mono text-[9px] font-bold text-slate-600">
                        {item.share}
                      </span>
                    </div>
                    <div className="font-display font-bold text-xs sm:text-sm text-slate-900 flex items-center justify-between">
                      <span>{item.title}</span>
                      <input
                        type="radio"
                        name="work-source"
                        value={item.id}
                        checked={isSelected}
                        onChange={() => {
                          invalidate();
                          setSource(item.id);
                          setOrderType(item.id === 'shutdown' ? 'PM03' : '');
                          setSelectedPlant('all');
                          setSelectedTypeCategory('all');
                          void executeSearch(item.id, referenceIdFilter, fromDate, toDate, allDates, item.id === 'shutdown' ? 'PM03' : '');
                        }}
                        className="accent-[#006398] cursor-pointer"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 leading-normal font-sans">
                      {item.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>
      </SectionCard>

      {/* 2. Search Date Range & Reference Filters */}
      <SectionCard
        theme="emerald"
        sectionTag="STEP 1.2"
        title="Search Filters & Date Range"
        subtitle="Filter by specific Order / Notification number or refine by date range."
        icon="tune"
      >
        <form onSubmit={handleSearchSubmit} className="space-y-3.5">
          {/* Quick Date Presets & All Dates Toggle Bar */}
          <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-slate-500 flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-[#006398]">calendar_month</span>
                <span>Date Range Presets:</span>
              </span>
              <div className="inline-flex items-center gap-1.5 font-mono flex-wrap">
                <button
                  type="button"
                  onClick={() => applyDatePreset(0)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !allDates && isPresetMatch(0)
                      ? 'bg-[#006398] text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Filter work active today"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset(1)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !allDates && isPresetMatch(1)
                      ? 'bg-[#006398] text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Filter work from past 1 day (yesterday & today)"
                >
                  1 Day
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset(2)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !allDates && isPresetMatch(2)
                      ? 'bg-[#006398] text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Filter work from past 2 days"
                >
                  2 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset(7)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !allDates && isPresetMatch(7)
                      ? 'bg-[#006398] text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Filter work from past 1 week (default window)"
                >
                  1 Week (Current)
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset(14)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !allDates && isPresetMatch(14)
                      ? 'bg-[#006398] text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Filter work from past 2 weeks"
                >
                  2 Weeks
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset(30)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !allDates && isPresetMatch(30)
                      ? 'bg-[#006398] text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Filter work from past 30 days"
                >
                  30 Days
                </button>
              </div>
            </div>

            <label
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all select-none ${
                allDates
                  ? 'bg-blue-50 border-blue-200 text-[#006398] shadow-2xs'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <input
                type="checkbox"
                checked={allDates}
                onChange={(e) => setAllDates(e.target.checked)}
                className="accent-[#006398] rounded cursor-pointer w-3.5 h-3.5"
              />
              <span>All active dates</span>
            </label>
          </div>

          <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="ptw-label flex items-center justify-between">
                <span>Reference ID (Optional)</span>
                <span className="text-[10px] text-slate-400 font-mono">MO / Notif #</span>
              </label>
              <input
                type="text"
                value={referenceIdFilter}
                onChange={(e) => setReferenceIdFilter(e.target.value)}
                placeholder={source === 'notification' ? 'e.g. 10000002' : 'e.g. 100000002'}
                className="ptw-input font-mono"
              />
            </div>

            <div>
              <label className="ptw-label flex items-center justify-between">
                <span>From date {!allDates && <span className="text-red-500">*</span>}</span>
                {fromDateIndicator && (
                  <span className="text-[10px] font-mono text-[#006398] font-bold">{fromDateIndicator}</span>
                )}
              </label>
              <input
                aria-label="From date"
                type="date"
                disabled={allDates}
                required={!allDates}
                value={fromDate}
                max={toDate || undefined}
                onChange={(event) => setFromDate(event.target.value)}
                className={`ptw-input font-mono ${allDates ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
              />
            </div>

            <div>
              <label className="ptw-label flex items-center justify-between">
                <span>To date {!allDates && <span className="text-red-500">*</span>}</span>
                {toDateIndicator && (
                  <span className="text-[10px] font-mono text-[#006398] font-bold">{toDateIndicator}</span>
                )}
              </label>
              <input
                aria-label="To date"
                type="date"
                disabled={allDates}
                required={!allDates}
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => setToDate(event.target.value)}
                className={`ptw-input font-mono ${allDates ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
              />
            </div>

            {source === 'order' ? (
              <div>
                <label className="ptw-label">Order type (AUART)</label>
                <select
                  value={orderType}
                  onChange={(event) => setOrderType(event.target.value)}
                  className="ptw-select font-mono"
                >
                  <option value="">All order types (PM01, PM03...)</option>
                  {ORDER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[42px] px-4 rounded-xl bg-[#006398] hover:bg-[#004f7a] text-white text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
                    {loading ? 'progress_activity' : 'search'}
                  </span>
                  <span>{loading ? 'Querying SAP...' : 'Find Work References'}</span>
                </button>
              </div>
            )}

            {source === 'order' && (
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto min-w-[200px] h-[42px] px-5 rounded-xl bg-[#006398] hover:bg-[#004f7a] text-white text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
                    {loading ? 'progress_activity' : 'search'}
                  </span>
                  <span>{loading ? 'Querying SAP...' : 'Find Work References'}</span>
                </button>
              </div>
            )}
          </div>
        </form>
      </SectionCard>

      {/* Error Banner */}
      {error && (
        <div role="alert" className="p-4 rounded-xl border border-rose-200 bg-rose-50/70 text-xs sm:text-sm text-rose-800 flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-rose-600 shrink-0">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* 3. Results List with Plant Sorting & Grouping */}
      <div aria-live="polite" aria-busy={loading}>
        {loading && (
          <div className="ptw-card p-8 text-center text-slate-500">
            <span className="material-symbols-outlined text-[32px] text-[#006398] animate-spin mb-2">
              progress_activity
            </span>
            <p className="text-xs font-semibold text-slate-700">Retrieving matching work references from SAP...</p>
          </div>
        )}

        {searched && !rows.length && !loading && (
          <div className="ptw-card p-8 text-center text-slate-500">
            <span className="material-symbols-outlined text-[36px] text-slate-400 mb-2">inventory_2</span>
            <p className="text-sm font-bold text-slate-700">No matching work found</p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              No SAP {source === 'notification' ? 'notifications' : 'orders'} match your criteria. Try widening your search filters or check "All active dates".
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <SectionCard
            theme="amber"
            sectionTag="STEP 1.3"
            title={`Matching Work References (${rows.length})`}
            subtitle="Grouped by Type and Category. Click on any row to select and bind it to this permit."
            icon="checklist"
            badge={
              <span className="px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                {processedRows.length} of {rows.length} Shown
              </span>
            }
          >
            {/* Toolbar: Plant Sorting & Filtering + Type/Category Chips */}
            <div className="space-y-3 mb-4 pb-3 border-b border-slate-200/80">
              {/* Plant Wise Specific Sorting & Filter Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/90 p-3 rounded-xl border border-slate-200/70">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-[#006398]">factory</span>
                    <span>Plant Filter:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedPlant('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      selectedPlant === 'all'
                        ? 'bg-[#006398] text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    All Plants ({rows.length})
                  </button>
                  {distinctPlants.map((plant) => {
                    const count = rows.filter((r) => r.Plant === plant).length;
                    const isSelected = selectedPlant === plant;
                    return (
                      <button
                        key={plant}
                        type="button"
                        onClick={() => setSelectedPlant(plant)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#006398] text-white shadow-2xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:border-[#006398]/50'
                        }`}
                      >
                        Plant {plant} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label htmlFor="select-plant-sort" className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px] text-slate-500">sort</span>
                    <span>Sort:</span>
                  </label>
                  <select
                    id="select-plant-sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="ptw-select text-xs py-1.5 font-sans"
                  >
                    <option value="plant-asc">Plant (Ascending: 1001 → 1003)</option>
                    <option value="plant-desc">Plant (Descending: 1003 → 1001)</option>
                    <option value="date-desc">Date (Newest First)</option>
                    <option value="date-asc">Date (Oldest First)</option>
                    <option value="priority">Priority (Highest First)</option>
                    <option value="reference">Reference ID</option>
                  </select>
                </div>
              </div>

              {/* Group Type Wise & Category Wise Filter Pills */}
              {distinctTypeCategories.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mr-1">
                    <span className="material-symbols-outlined text-[14px]">category</span>
                    <span>Type & Category:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedTypeCategory('all')}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                      selectedTypeCategory === 'all'
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Types & Categories
                  </button>
                  {distinctTypeCategories.map((tc) => {
                    const isSelected = selectedTypeCategory === tc.key;
                    return (
                      <button
                        key={tc.key}
                        type="button"
                        onClick={() => setSelectedTypeCategory(tc.key)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-700 text-white shadow-2xs'
                            : 'bg-indigo-50 text-indigo-800 border border-indigo-200/80 hover:bg-indigo-100'
                        }`}
                      >
                        <span className="font-mono font-bold">{tc.orderNotifType}</span>
                        <span>·</span>
                        <span>{tc.workCategory}</span>
                        <span className="font-mono text-[10px] opacity-80">({tc.count})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Grouped Work References List */}
            <fieldset className="space-y-4">
              <legend className="sr-only">Select a work reference</legend>
              {groupedRows.map((group) => (
                <div key={group.key} className="space-y-2">
                  {/* Group Header: Type Wise & Category Wise */}
                  <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-slate-100 via-sky-50/50 to-slate-50 border border-slate-200/90 shadow-2xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-[#006398] text-white shadow-2xs">
                        Type: {group.orderNotifType}
                      </span>
                      <span className="font-display font-bold text-xs sm:text-sm text-slate-800">
                        Category: {group.workCategory}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-600 font-bold bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                      {group.items.length} {group.items.length === 1 ? 'Reference' : 'References'}
                    </span>
                  </div>

                  {/* References within this Type & Category Group */}
                  <div className="space-y-2.5 pl-0 sm:pl-2">
                    {group.items.map((row) => {
                      const isChosen = chosen === row;
                      return (
                        <label
                          key={referenceKey(row)}
                          className={`flex cursor-pointer items-start gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all ${
                            isChosen
                              ? 'border-[#006398] bg-sky-50/80 ring-2 ring-[#006398]/30 shadow-xs'
                              : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                          }`}
                        >
                          <input
                            type="radio"
                            name="work-reference"
                            checked={isChosen}
                            onChange={() => {
                              setChosen(row);
                              onInvalidate();
                            }}
                            className="mt-1 accent-[#006398] cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {referenceId(source, row)}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-slate-900">
                                {row.JobDescription || 'Maintenance Work Reference'}
                              </span>
                              {isChosen && (
                                <span className="px-2 py-0.2 rounded-full font-mono text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  SELECTED
                                </span>
                              )}
                            </div>

                            {/* Source, Type, Category, Date Line */}
                            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 flex-wrap font-sans">
                              <span>
                                Source: <strong className="text-slate-700">{row.ReferenceSource}</strong>
                              </span>
                              <span>·</span>
                              <span>
                                Type: <strong className="text-slate-700 font-mono">{row.OrderNotifType}</strong>
                              </span>
                              <span>·</span>
                              <span>
                                Category: <strong className="text-slate-700">{row.WorkCategory}</strong>
                              </span>
                              <span>·</span>
                              <span>
                                Date: <strong className="text-slate-700 font-mono">{row.WorkDate || 'No date'}</strong>
                              </span>
                            </div>

                            {/* Plant, Equipment, Functional Location Line */}
                            <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-slate-500 flex-wrap">
                              <span className="bg-sky-50 text-[#006398] px-1.5 py-0.2 rounded border border-sky-200 font-bold">
                                Plant: {row.Plant || '—'}
                              </span>
                              <span>·</span>
                              <span>Equipment: <strong className="text-slate-700">{row.EquipmentTag || '—'}</strong></span>
                              <span>·</span>
                              <span>Location: <strong className="text-slate-700">{row.FunctionalLocation || '—'}</strong></span>
                            </div>

                            {/* Live SAP Badges: Work Area, Work Center, Priority */}
                            {(row.AreaLoc || row.LocationDesc || row.WorkCenter || row.WorkCenterDesc || row.Priority) && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                                {(row.AreaLoc || row.LocationDesc) && (
                                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200/90 px-2 py-0.5 rounded-md text-[11px]">
                                    <span className="material-symbols-outlined text-[13px] text-amber-700">pin_drop</span>
                                    <span>Area: <strong className="font-mono">{row.AreaLoc || '—'}</strong></span>
                                    {row.LocationDesc && <span className="text-amber-800/80">({row.LocationDesc})</span>}
                                  </span>
                                )}
                                {(row.WorkCenter || row.WorkCenterDesc) && (
                                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-900 border border-blue-200/90 px-2 py-0.5 rounded-md text-[11px]">
                                    <span className="material-symbols-outlined text-[13px] text-blue-700">settings</span>
                                    <span>Work Center: <strong className="font-mono">{row.WorkCenter || '—'}</strong></span>
                                    {row.WorkCenterDesc && <span className="text-blue-800/80">({row.WorkCenterDesc})</span>}
                                  </span>
                                )}
                                {row.Priority && (
                                  <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded-md text-[11px] font-mono">
                                    <span>Priority: <strong>{row.Priority}</strong></span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </fieldset>
          </SectionCard>
        )}
      </div>

      {/* Action Footer */}
      <div className="ptw-card p-4 bg-slate-50/80 border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-slate-500 font-sans text-center sm:text-left">
          Select an SAP reference above to auto-populate Plant, Work Area, Equipment, and Scope — or create a blank permit without a PM reference.
        </p>
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2">
          {onStartBlankPermit && (
            <button
              type="button"
              onClick={handleTriggerBlankPermit}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 hover:border-amber-400 text-xs sm:text-sm font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-amber-700">note_add</span>
              <span>Continue Without Reference</span>
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (!chosen) {
                toast.warning('Please search and select a work order or notification reference before continuing.', { title: 'Selection Required' });
                return;
              }
              const cat = (chosen.WorkCategory as WorkCategory) || (source === 'notification' ? 'Corrective' : 'Preventive');
              onContinue({
                category: cat,
                source,
                fromDate: allDates ? '' : fromDate,
                toDate: allDates ? '' : toDate,
                orderType: chosen.OrderNotifType || orderType,
                referenceId: chosen.ReferenceId,
                allDates,
                reference: chosen
              });
            }}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#006398] hover:bg-[#004f7a] text-white text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer ${
              !chosen ? 'opacity-80 hover:opacity-100' : ''
            }`}
          >
            <span>Continue to Permit Details</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default PermitWorkSelectionStep;
