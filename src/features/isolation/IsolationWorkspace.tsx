import { CertificateActions } from './CertificateActions';
import { WorkflowUnconfirmedError } from '../../core/api/modules/backendWorkflow.api';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { ModuleId, SapUser } from '../../core/auth/sapAuthContext';
import type { SapIsolationHeader, SapIsolationItem } from '../../core/types/isolation.types';
import { isolationApi } from '../../core/api/modules/isolation.api';
import { sitePermitApi } from '../../core/api/modules/sitePermit.api';
import { configApi } from '../../core/api/modules/config.api';
import type { SapConfigRecord } from '../../core/types/config.types';
import { SectionCard } from '../../shared/components/SectionCard';
import { toast } from '../../shared/context/ToastContext';

interface IsolationWorkspaceProps {
  module: ModuleId;
  user: SapUser | null;
  onBack: () => void;
  returnToCaller?: boolean;
  onCreated?: (certificate: SapIsolationHeader) => void;
}

type ViewMode = 'list' | 'detail' | 'create';

export const IsolationWorkspace: React.FC<IsolationWorkspaceProps> = ({ module, user, onBack, returnToCaller, onCreated }) => {
  const [viewMode, setViewMode] = useState<ViewMode>(
    module === 'create-isolation' ? 'create' : 'list'
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [isolations, setIsolations] = useState<SapIsolationHeader[]>([]);
  const [selectedIso, setSelectedIso] = useState<SapIsolationHeader | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Sorting & Pagination State for Certificates List
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [pageJumpInput, setPageJumpInput] = useState<string>('1');
  const [sortField, setSortField] = useState<'IsolationNo' | 'PermitNo' | 'Status' | 'RequestedDate' | 'PointsCount'>('RequestedDate');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');

  // Pagination for points within selected certificate detail
  const [pointsPage, setPointsPage] = useState<number>(1);
  const [pointsPageSize, setPointsPageSize] = useState<number>(10);

  // Guarantee view changes (list, create, detail) open from the top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [viewMode, selectedIso]);

  const showNotification = (type: 'success' | 'error' | 'info' | 'warning', text: string) => {
    setNotification({ type: type === 'warning' ? 'error' : type, text });
    if (type === 'error') {
      toast.error(text, { title: 'Isolation Error' });
    } else if (type === 'warning') {
      toast.warning(text, { title: 'Mandatory Field Missing' });
    } else if (type === 'success') {
      toast.success(text, { title: 'Isolation Updated' });
    } else {
      toast.info(text);
    }
  };

  // Dropdown Configs from SAP OData
  const [isolationTypes, setIsolationTypes] = useState<SapConfigRecord[]>([]);
  const [isolatedStates, setIsolatedStates] = useState<SapConfigRecord[]>([]);
  const [isolMethods, setIsolMethods] = useState<SapConfigRecord[]>([]);
  const [deisolatedStates, setDeisolatedStates] = useState<SapConfigRecord[]>([]);

  // New Isolation Creation Form State
  const [createPermitNo, setCreatePermitNo] = useState<string>('');
  const [createDescription, setCreateDescription] = useState<string>('');
  const [createRemarks, setCreateRemarks] = useState<string>('');
  const [createPoints, setCreatePoints] = useState<Array<Omit<SapIsolationItem, 'IsolationNo' | 'ItemNo'>>>([
    {
      ReferenceType: 'EQUI',
      ReferenceId: '',
      IsolationPoint: '',
      IsolType: 'MECH',
      IsolMethod: 'VALVE',
      IsolatedState: 'CLOSED',
      DeIsolatedState: '',
      LockTagNo: '',
      IsIsolated: '',
      IsolatedBy: '',
      IsolatedAt: null,
      ZeroEnergyConf: '',
      ZeroEnergyBy: '',
      ZeroEnergyAt: null,
      IsNormalized: '',
      NormalizedBy: '',
      NormalizedAt: null,
      Remarks: ''
    }
  ]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [availablePermits, setAvailablePermits] = useState<string[]>([]);
  // Edit Certificate Modal State
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editingIso, setEditingIso] = useState<SapIsolationHeader | null>(null);
  const [editPermitNo, setEditPermitNo] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editRemarks, setEditRemarks] = useState<string>('');
  const [saveUncertain, setSaveUncertain] = useState(false);
  const submissionLock = useRef(false);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Check for pre-populated context from Permit Create flow
  useEffect(() => {
    if (module === 'create-isolation' || viewMode === 'create') {
      try {
        const raw = sessionStorage.getItem('ptw_initial_isolation_context');
        if (raw) {
          const parsed = JSON.parse(raw);
          sessionStorage.removeItem('ptw_initial_isolation_context');
          if (parsed.description) setCreateDescription(parsed.description);
          if (parsed.remarks) setCreateRemarks(parsed.remarks);
          if (parsed.referenceId) {
            setCreatePoints([
              {
                ReferenceType: parsed.referenceType || 'EQUI',
                ReferenceId: parsed.referenceId,
                IsolationPoint: parsed.pointTag || 'POINT-01',
                IsolType: 'ELEC',
                IsolMethod: 'CB_RIRO',
                IsolatedState: 'LOCKED',
                DeIsolatedState: '',
                LockTagNo: 'LT-01',
                IsIsolated: '',
                IsolatedBy: '',
                IsolatedAt: null,
                ZeroEnergyConf: '',
                ZeroEnergyBy: '',
                ZeroEnergyAt: null,
                IsNormalized: '',
                NormalizedBy: '',
                NormalizedAt: null,
                Remarks: ''
              }
            ]);
          }
        }
      } catch {}
    }
  }, [module, viewMode]);

  const handleOpenEdit = async (iso: SapIsolationHeader) => {
    try {
      const current = await isolationApi.read(iso.IsolationNo);
      if (!current) throw new Error('SAP did not return this certificate.');
      setEditingIso(current);
      setEditPermitNo(current.PermitNo || '');
      setEditDescription(current.description || '');
      setEditRemarks(current.Remarks || '');
      setShowEditModal(true);
    } catch (reason) {
      showNotification('error', reason instanceof Error ? reason.message : 'Unable to load the current certificate.');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIso || submissionLock.current || saveUncertain) return;
    submissionLock.current = true;

    setIsSavingEdit(true);
    setNotification(null);

    try {
      const trimmedPermit = editPermitNo.trim().toUpperCase();
      const normalizedPermit = /^\d+$/.test(trimmedPermit) && trimmedPermit.length < 10
        ? trimmedPermit.padStart(10, '0')
        : trimmedPermit;

      const updated = await isolationApi.update(editingIso.IsolationNo, {
        PermitNo: normalizedPermit,
        description: editDescription.trim(),
        Remarks: editRemarks.trim()
      }, editingIso['@odata.etag']);

      // Also sync link to PermitInfo in SAP if permit specified or unassigned
      if (normalizedPermit) {
        await sitePermitApi.updateIsolationLink(normalizedPermit, editingIso.IsolationNo);
      } else if (editingIso.PermitNo) {
        await sitePermitApi.updateIsolationLink(editingIso.PermitNo, '');
      }

      const effectivePermitNo = updated.PermitNo !== undefined && updated.PermitNo !== '' 
        ? updated.PermitNo 
        : normalizedPermit;

      const finalUpdated: SapIsolationHeader = {
        ...updated,
        PermitNo: effectivePermitNo
      };

      // Update in state
      setIsolations((prev) =>
        prev.map((i) => (i.IsolationNo === finalUpdated.IsolationNo ? { ...i, ...finalUpdated, _Item: finalUpdated._Item || i._Item } : i))
      );
      if (selectedIso && selectedIso.IsolationNo === finalUpdated.IsolationNo) {
        setSelectedIso((prev) => (prev ? { ...prev, ...finalUpdated, _Item: finalUpdated._Item || prev._Item } : null));
      }

      showNotification(
        'success',
        `Isolation Certificate ${finalUpdated.IsolationNo} successfully updated. Linked Permit: ${
          effectivePermitNo ? effectivePermitNo : 'Unassigned'
        }.`
      );
      setShowEditModal(false);
    } catch (err) {
      if (err instanceof WorkflowUnconfirmedError) setSaveUncertain(true);
      showNotification(
        'error',
        err instanceof Error ? err.message : 'Failed to update isolation certificate.'
      );
    } finally {
      submissionLock.current = false; setIsSavingEdit(false);
    }
  };

  const loadIsolations = async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    try {
      const data = await isolationApi.list(undefined, controller.signal);
      if (!controller.signal.aborted) {
        setIsolations(data);
      }
    } catch (err) {
      if (err instanceof WorkflowUnconfirmedError) setSaveUncertain(true);
      if (!controller.signal.aborted) {
        showNotification(
          'error',
          err instanceof Error ? err.message : 'Failed to fetch isolation records from SAP.'
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadIsolations();
    configApi.fetchIsolationTypeConfig().then(setIsolationTypes);
    configApi.fetchIsolatedStateConfig().then(setIsolatedStates);
    configApi.fetchIsolMethodConfig().then(setIsolMethods);
    configApi.fetchDeisolatedStateConfig().then(setDeisolatedStates);
    sitePermitApi.list('', '', 0, undefined, 'ALL', undefined, 100).then((res) => {
      setAvailablePermits(res.map((p) => p.Permit_No).filter(Boolean));
    }).catch(() => {
      try {
        if (import.meta.env.DEV && typeof window !== 'undefined' && window.localStorage) {
          const stored = JSON.parse(window.localStorage.getItem('ptw_recent_created_permits') || '[]');
          setAvailablePermits(stored.map((p: any) => p?.Permit_No).filter(Boolean));
        }
      } catch {}
    });
    return () => abortControllerRef.current?.abort();
  }, []);

  // Helper label resolvers
  const getIsolTypeLabel = (code: string) => {
    const found = isolationTypes.find((t) => t.Config_Code === code);
    return found ? `${found.Config_Desc} (${found.Config_Code})` : code;
  };

  const getIsolMethodLabel = (code: string) => {
    const found = isolMethods.find((m) => m.Config_Code === code);
    return found ? `${found.Config_Desc} (${found.Config_Code})` : code;
  };

  const getIsolatedStateLabel = (code: string) => {
    const found = isolatedStates.find((s) => s.Config_Code === code);
    return found ? found.Config_Desc : code;
  };

  const getDeisolatedStateLabel = (code: string) => {
    const found = deisolatedStates.find((s) => s.Config_Code === code);
    return found ? found.Config_Desc : code;
  };

  // Filtered List
  const filteredIsolations = useMemo(() => {
    return isolations.filter((iso) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        iso.IsolationNo.toLowerCase().includes(q) ||
        iso.PermitNo.toLowerCase().includes(q) ||
        iso.RequestedBy.toLowerCase().includes(q) ||
        (iso.description && iso.description.toLowerCase().includes(q)) ||
        (iso.Remarks && iso.Remarks.toLowerCase().includes(q)) ||
        iso._Item?.some(
          (item) =>
            item.IsolationPoint.toLowerCase().includes(q) ||
            item.ReferenceId.toLowerCase().includes(q) ||
            item.LockTagNo.toLowerCase().includes(q)
        );

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'CRTD' && iso.Status === 'CRTD') ||
        (statusFilter === 'ISOL' && iso.Status === 'ISOL') ||
        (statusFilter === 'NORM' && iso.Status === 'NORM');

      return matchesSearch && matchesStatus;
    });
  }, [isolations, searchQuery, statusFilter]);

  // Sorted Isolations
  const sortedIsolations = useMemo(() => {
    const list = [...filteredIsolations];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'IsolationNo') {
        cmp = a.IsolationNo.localeCompare(b.IsolationNo);
      } else if (sortField === 'PermitNo') {
        cmp = (a.PermitNo || '').localeCompare(b.PermitNo || '');
      } else if (sortField === 'Status') {
        cmp = (a.Status || '').localeCompare(b.Status || '');
      } else if (sortField === 'RequestedDate') {
        const dateA = `${a.RequestedDate || ''} ${a.RequestedTime || ''}`;
        const dateB = `${b.RequestedDate || ''} ${b.RequestedTime || ''}`;
        cmp = dateA.localeCompare(dateB);
      } else if (sortField === 'PointsCount') {
        cmp = (a._Item?.length || 0) - (b._Item?.length || 0);
      }
      return sortDirection === 'ASC' ? cmp : -cmp;
    });
    return list;
  }, [filteredIsolations, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedIsolations.length / pageSize));

  // Reset page when search or status filter or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
    setPageJumpInput('1');
  }, [searchQuery, statusFilter, pageSize]);

  // Sync jump input when page changes
  useEffect(() => {
    setPageJumpInput(String(currentPage));
  }, [currentPage]);

  // Reset points page when selected certificate changes
  useEffect(() => {
    setPointsPage(1);
  }, [selectedIso?.IsolationNo]);

  const paginatedIsolations = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedIsolations.slice(startIndex, startIndex + pageSize);
  }, [sortedIsolations, currentPage, pageSize]);

  const paginatedPoints = useMemo(() => {
    if (!selectedIso?._Item) return [];
    const startIndex = (pointsPage - 1) * pointsPageSize;
    return selectedIso._Item.slice(startIndex, startIndex + pointsPageSize);
  }, [selectedIso?._Item, pointsPage, pointsPageSize]);

  const totalPointsPages = Math.max(1, Math.ceil((selectedIso?._Item?.length || 0) / pointsPageSize));

  const handleSort = (field: 'IsolationNo' | 'PermitNo' | 'Status' | 'RequestedDate' | 'PointsCount') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortField(field);
      setSortDirection('ASC');
    }
  };

  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(pageJumpInput, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) {
      setCurrentPage(target);
    } else {
      setPageJumpInput(String(currentPage));
    }
  };

  // Statistics
  const stats = useMemo(() => {
    const total = isolations.length;
    const crtd = isolations.filter((i) => i.Status === 'CRTD').length;
    const isol = isolations.filter((i) => i.Status === 'ISOL').length;
    const norm = isolations.filter((i) => i.Status === 'NORM').length;
    const totalPoints = isolations.reduce((acc, curr) => acc + (curr._Item?.length || 0), 0);
    return { total, crtd, isol, norm, totalPoints };
  }, [isolations]);

  // Add Point Handler
  const handleAddPointRow = () => {
    setCreatePoints((prev) => [
      ...prev,
      {
        ReferenceType: 'EQUI',
        ReferenceId: '',
        IsolationPoint: '',
        IsolType: 'MECH',
        IsolMethod: 'VALVE',
        IsolatedState: 'CLOSED',
        DeIsolatedState: '',
        LockTagNo: '',
        IsIsolated: '',
        IsolatedBy: '',
        IsolatedAt: null,
        ZeroEnergyConf: '',
        ZeroEnergyBy: '',
        ZeroEnergyAt: null,
        IsNormalized: '',
        NormalizedBy: '',
        NormalizedAt: null,
        Remarks: ''
      }
    ]);
  };

  const handleRemovePointRow = (index: number) => {
    if (createPoints.length <= 1) return;
    setCreatePoints((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePointChange = (
    index: number,
    field: keyof Omit<SapIsolationItem, 'IsolationNo' | 'ItemNo'>,
    value: string
  ) => {
    setCreatePoints((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionLock.current || saveUncertain) return;
    if (!createPoints.length) {
      showNotification('warning', 'Please add at least one isolation point.');
      return;
    }
    if (createPoints.some((p) => !p.IsolationPoint.trim() || !p.ReferenceId.trim())) {
      showNotification('warning', 'Please specify the Reference ID and physical isolation point name for all points.');
      return;
    }

    submissionLock.current = true;
    setIsSubmitting(true);
    setNotification(null);

    try {
      const trimmedPermit = createPermitNo.trim().toUpperCase();
      const normalizedPermit = /^\d+$/.test(trimmedPermit) && trimmedPermit.length < 10
        ? trimmedPermit.padStart(10, '0')
        : trimmedPermit;

      const payload: Partial<SapIsolationHeader> = {
        PermitNo: normalizedPermit,
        description: createDescription.trim(),
        Remarks: createRemarks.trim(),
        _Item: createPoints.map((p) => ({
          ReferenceType: p.ReferenceType || 'EQUI',
          ReferenceId: p.ReferenceId.trim(),
          IsolationPoint: p.IsolationPoint.trim().toUpperCase(),
          IsolType: p.IsolType,
          IsolMethod: p.IsolMethod,
          IsolatedState: p.IsolatedState,
          DeIsolatedState: p.DeIsolatedState ? p.DeIsolatedState.trim() : '',
          LockTagNo: p.LockTagNo.trim().toUpperCase(),
          Remarks: p.Remarks ? p.Remarks.trim() : ''
        }))
      };

      const result = await isolationApi.create(payload);

      onCreated?.(result);

      // If created with a target permit number, sync the link on PermitInfo in SAP
      if (normalizedPermit && result.IsolationNo) {
        try {
          await sitePermitApi.updateIsolationLink(normalizedPermit, result.IsolationNo);
        } catch (linkErr) {
          console.warn('[IsolationWorkspace] Could not link permit to new isolation certificate:', linkErr);
        }
      }

      showNotification(
        'success',
        `Isolation Certificate ${result.IsolationNo} successfully created and registered in SAP database.`
      );

      if (returnToCaller) {
        toast.success(
          `Isolation Certificate ${result.IsolationNo} created! Returning to your permit...`,
          { title: 'Isolation Registered', duration: 4500 }
        );
        onBack();
        return;
      }
      await loadIsolations();
      setSelectedIso(result);
      setViewMode('detail');
      // Reset form
      setCreatePermitNo('');
      setCreateDescription('');
      setCreateRemarks('');
      setCreatePoints([
        {
          ReferenceType: 'EQUI',
          ReferenceId: '',
          IsolationPoint: '',
          IsolType: 'MECH',
          IsolMethod: 'VALVE',
          IsolatedState: 'CLOSED',
          DeIsolatedState: '',
          LockTagNo: '',
          IsIsolated: '',
          IsolatedBy: '',
          IsolatedAt: null,
          ZeroEnergyConf: '',
          ZeroEnergyBy: '',
          ZeroEnergyAt: null,
          IsNormalized: '',
          NormalizedBy: '',
          NormalizedAt: null,
          Remarks: ''
        }
      ]);
    } catch (err) {
      if (err instanceof WorkflowUnconfirmedError) setSaveUncertain(true);
      showNotification(
        'error',
        err instanceof Error ? err.message : 'Error submitting isolation certificate.'
      );
    } finally {
      submissionLock.current = false; setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-7">
      {/* Top Banner / Breadcrumb & Global Toolbar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="group inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-1.5 text-xs font-mono font-bold text-slate-700 shadow-2xs transition-all duration-200 hover:border-[#006398] hover:bg-slate-50 hover:text-[#006398] active:scale-[0.98] cursor-pointer"
              title={returnToCaller ? 'Return to Permit' : 'Return to Launchpad'}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors duration-200 group-hover:bg-[#006398]/10 group-hover:text-[#006398]">
                <span className="material-symbols-outlined text-[15px] transition-transform duration-200 group-hover:-translate-x-0.5">
                  arrow_back
                </span>
              </span>
              <span>{returnToCaller ? 'Return to Permit' : 'Return to Launchpad'}</span>
            </button>
            <span className="text-slate-300 font-light">/</span>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <span>PTW Suite</span>
              <span>/</span>
              <span className="font-semibold text-slate-700">Isolation & LOTO Registry</span>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
              <span>Zero-Energy (LOTO)</span>
            </span>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20 shrink-0">
              <span className="material-symbols-outlined text-[24px]">lock_reset</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-extrabold tracking-tight text-slate-900">
                Positive Isolation & LOTO Registry
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Zero-Energy Breaker, Valve Lock & Blind Flange Registry (SAP OData V4)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {viewMode !== 'list' && (
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
              Certificates List
            </button>
          )}

          {viewMode !== 'create' && (
            <button
              type="button"
              onClick={() => {
                setSelectedIso(null);
                setViewMode('create');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#006398] px-4 py-2 text-xs font-bold text-white hover:bg-[#004f7a] shadow-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              New Isolation Certificate
            </button>
          )}

          <button
            type="button"
            onClick={loadIsolations}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-50"
            title="Refresh from SAP"
          >
            <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            Refresh
          </button>
        </div>
      </header>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`flex items-start justify-between rounded-xl border p-4 text-xs font-medium ${
            notification.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : notification.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-900'
              : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">
              {notification.type === 'success'
                ? 'check_circle'
                : notification.type === 'error'
                ? 'error'
                : 'info'}
            </span>
            <span>{notification.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-500 hover:text-slate-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Overview Metrics Strip with Interactive Filtering & Layered Depth */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`text-left rounded-2xl border p-4 shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.06),inset_0_1px_0_0_rgba(255,255,255,1)] hover:-translate-y-0.5 transition-all cursor-pointer ${
            statusFilter === 'ALL'
              ? 'border-[#006398] bg-sky-50/60 ring-2 ring-[#006398]/20 shadow-sm'
              : 'border-slate-200/90 bg-gradient-to-br from-white via-slate-50/70 to-slate-100/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
              Certificates
            </span>
            <span className="material-symbols-outlined text-[18px] text-slate-400">verified</span>
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-800">{stats.total}</p>
          <span className="text-[10px] text-slate-500 font-mono">All Records</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('CRTD')}
          className={`text-left rounded-2xl border p-4 shadow-[0_1px_3px_0_rgba(15,23,42,0.03),0_6px_18px_-4px_rgba(217,119,6,0.12),inset_0_1px_0_0_rgba(255,255,255,1)] hover:-translate-y-0.5 transition-all cursor-pointer ${
            statusFilter === 'CRTD'
              ? 'border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/20 shadow-sm'
              : 'border-amber-200/90 bg-gradient-to-br from-white via-[#fffef7] to-amber-50/70'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700">
              Draft (CRTD)
            </span>
            <span className="material-symbols-outlined text-[18px] text-amber-600">edit_document</span>
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-900">{stats.crtd}</p>
          <span className="text-[10px] text-amber-700 font-mono">Pending Lockout</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('ISOL')}
          className={`text-left rounded-2xl border p-4 shadow-[0_1px_3px_0_rgba(15,23,42,0.03),0_6px_18px_-4px_rgba(0,99,152,0.12),inset_0_1px_0_0_rgba(255,255,255,1)] hover:-translate-y-0.5 transition-all cursor-pointer ${
            statusFilter === 'ISOL'
              ? 'border-[#006398] bg-sky-50 ring-2 ring-[#006398]/20 shadow-sm'
              : 'border-sky-200/90 bg-gradient-to-br from-white via-[#f5f9fe] to-sky-50/70'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-700">
              Isolated (ISOL)
            </span>
            <span className="material-symbols-outlined text-[18px] text-[#006398]">lock</span>
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-blue-900">{stats.isol}</p>
          <span className="text-[10px] text-blue-700 font-mono">Active Lockouts</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('NORM')}
          className={`text-left rounded-2xl border p-4 shadow-[0_1px_3px_0_rgba(15,23,42,0.03),0_6px_18px_-4px_rgba(5,150,105,0.12),inset_0_1px_0_0_rgba(255,255,255,1)] hover:-translate-y-0.5 transition-all cursor-pointer ${
            statusFilter === 'NORM'
              ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-sm'
              : 'border-emerald-200/90 bg-gradient-to-br from-white via-[#f4fbf7] to-emerald-50/70'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700">
              Normalized (NORM)
            </span>
            <span className="material-symbols-outlined text-[18px] text-emerald-600">lock_open</span>
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-900">{stats.norm}</p>
          <span className="text-[10px] text-emerald-700 font-mono">Restored Energy</span>
        </button>

        <div className="rounded-2xl border border-orange-200/90 bg-gradient-to-br from-white via-[#fffdf8] to-orange-50/70 p-4 shadow-[0_1px_3px_0_rgba(15,23,42,0.03),0_6px_18px_-4px_rgba(234,88,12,0.12),inset_0_1px_0_0_rgba(255,255,255,1)] hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-orange-700">
              Points Locked
            </span>
            <span className="material-symbols-outlined text-[18px] text-orange-600">key</span>
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-orange-900">{stats.totalPoints}</p>
          <span className="text-[10px] text-orange-700 font-mono">Total Physical Points</span>
        </div>
      </div>

      {/* MODE 1: LIST / BROWSE CERTIFICATES */}
      {viewMode === 'list' && (
        <SectionCard
          theme="amber"
          sectionTag="LOTO REGISTRY"
          title="Isolation Certificate Registry"
          subtitle="Positive zero-energy lockouts, breaker tags, and physical isolation certificates."
          icon="lock"
          badge={
            <span className="px-2.5 py-0.5 rounded-full font-mono text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
              {sortedIsolations.length} Certificates
            </span>
          }
        >
          <div className="space-y-4">
            {/* Search & Filter Toolbar with Proper Spacing */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 shadow-2xs">
              <div className="flex flex-1 items-center gap-2.5 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs focus-within:ring-2 focus-within:ring-[#006398]/20 focus-within:border-[#006398] transition-all">
                <span className="material-symbols-outlined text-slate-400 text-[19px]">search</span>
                <input
                  type="text"
                  placeholder="Search certificate #, linked permit #, requested by, point name, lock/tag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs outline-none bg-transparent placeholder-slate-400 font-sans text-slate-800"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                  </button>
                )}
                <span className="text-[10px] font-mono font-bold text-slate-400 border-l border-slate-200 pl-2 shrink-0">
                  {sortedIsolations.length} found
                </span>
              </div>

              <div className="flex items-center gap-3 flex-wrap justify-between lg:justify-end">
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-xs text-slate-500 font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-slate-400">filter_alt</span>
                    <span>Status:</span>
                  </span>
                  <div className="inline-flex rounded-xl bg-slate-200/60 p-1 gap-1">
                    {[
                      { id: 'ALL', label: 'All', count: stats.total },
                      { id: 'CRTD', label: 'CRTD', count: stats.crtd },
                      { id: 'ISOL', label: 'ISOL', count: stats.isol },
                      { id: 'NORM', label: 'NORM', count: stats.norm }
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setStatusFilter(st.id)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          statusFilter === st.id
                            ? 'bg-[#006398] text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                        }`}
                      >
                        <span>{st.label}</span>
                        <span className={`text-[10px] px-1 py-0.2 rounded-full font-bold ${
                          statusFilter === st.id ? 'bg-white/20 text-white' : 'bg-slate-300/60 text-slate-600'
                        }`}>
                          {st.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Page Size Dropdown */}
                <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
                  <span>Show:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg text-slate-700 shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#006398] cursor-pointer"
                  >
                    <option value={10}>10 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Certificates Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50/90 font-mono text-[11px] uppercase tracking-wider text-slate-600 select-none">
                  <tr>
                    <th
                      onClick={() => handleSort('IsolationNo')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors"
                      title="Sort by Certificate No"
                    >
                      <div className="flex items-center gap-1">
                        <span>Isolation Certificate</span>
                        {sortField === 'IsolationNo' ? (
                          <span className="material-symbols-outlined text-[14px] text-[#006398]">
                            {sortDirection === 'ASC' ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                        ) : (
                          <span className="material-symbols-outlined text-[14px] text-slate-300">unfold_more</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('PermitNo')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors"
                      title="Sort by Linked Permit"
                    >
                      <div className="flex items-center gap-1">
                        <span>Linked Permit</span>
                        {sortField === 'PermitNo' ? (
                          <span className="material-symbols-outlined text-[14px] text-[#006398]">
                            {sortDirection === 'ASC' ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                        ) : (
                          <span className="material-symbols-outlined text-[14px] text-slate-300">unfold_more</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('Status')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors"
                      title="Sort by Status"
                    >
                      <div className="flex items-center gap-1">
                        <span>Status</span>
                        {sortField === 'Status' ? (
                          <span className="material-symbols-outlined text-[14px] text-[#006398]">
                            {sortDirection === 'ASC' ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                        ) : (
                          <span className="material-symbols-outlined text-[14px] text-slate-300">unfold_more</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('RequestedDate')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors"
                      title="Sort by Requested Date"
                    >
                      <div className="flex items-center gap-1">
                        <span>Requested By & Date</span>
                        {sortField === 'RequestedDate' ? (
                          <span className="material-symbols-outlined text-[14px] text-[#006398]">
                            {sortDirection === 'ASC' ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                        ) : (
                          <span className="material-symbols-outlined text-[14px] text-slate-300">unfold_more</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('PointsCount')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors"
                      title="Sort by Points Count"
                    >
                      <div className="flex items-center gap-1">
                        <span>Points Registered</span>
                        {sortField === 'PointsCount' ? (
                          <span className="material-symbols-outlined text-[14px] text-[#006398]">
                            {sortDirection === 'ASC' ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                        ) : (
                          <span className="material-symbols-outlined text-[14px] text-slate-300">unfold_more</span>
                        )}
                      </div>
                    </th>
                    <th className="p-3.5">Description / Remarks</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {paginatedIsolations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2.5">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                            <span className="material-symbols-outlined text-[28px]">folder_off</span>
                          </div>
                          <span className="font-semibold text-slate-700">No isolation certificates found</span>
                          <span className="text-xs text-slate-400 max-w-sm">
                            {searchQuery || statusFilter !== 'ALL'
                              ? 'Try adjusting your search keywords or resetting the status filter.'
                              : 'No isolation certificates exist yet in the SAP S/4HANA registry.'}
                          </span>
                          {(searchQuery || statusFilter !== 'ALL') && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery('');
                                setStatusFilter('ALL');
                              }}
                              className="mt-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-mono font-bold text-slate-700 transition-colors"
                            >
                              Reset Filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedIsolations.map((iso) => (
                      <tr key={iso.IsolationNo} className="hover:bg-sky-50/50 transition-colors group">
                        <td className="p-3.5 font-mono font-bold text-[#006398]">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIso(iso);
                              setViewMode('detail');
                            }}
                            className="hover:underline flex items-center gap-2 group-hover:text-[#004e78]"
                          >
                            <span className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[16px]">lock</span>
                            </span>
                            <span>{iso.IsolationNo}</span>
                          </button>
                        </td>
                        <td className="p-3.5 font-mono">
                          {iso.PermitNo ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-[#006398] font-bold border border-sky-200 shadow-2xs">
                                <span className="material-symbols-outlined text-[13px]">description</span>
                                <span>{iso.PermitNo}</span>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEdit(iso);
                                }}
                                className="text-slate-400 hover:text-[#006398] p-1 rounded-md hover:bg-sky-50 transition"
                                title="Edit Permit Linkage"
                              >
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(iso);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 text-[11px] font-mono font-bold transition shadow-2xs cursor-pointer"
                              title="Add or link a Permit No to this certificate"
                            >
                              <span className="material-symbols-outlined text-[14px]">add_link</span>
                              <span>+ Link Permit</span>
                            </button>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-extrabold tracking-wider uppercase border shadow-2xs ${
                              iso.Status === 'CRTD'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : iso.Status === 'ISOL'
                                ? 'bg-sky-50 text-[#006398] border-sky-300 ring-2 ring-sky-500/20'
                                : iso.Status === 'NORM'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              iso.Status === 'ISOL' ? 'bg-[#006398] animate-pulse' : iso.Status === 'NORM' ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}></span>
                            <span>{iso.Status}</span>
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-800">{iso.RequestedBy || 'SYSTEM'}</div>
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                            {iso.RequestedDate} {iso.RequestedTime}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 border border-slate-200/80 px-2.5 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                            <span className="material-symbols-outlined text-[13px] text-orange-600">key</span>
                            <span>{iso._Item?.length || 0} point(s)</span>
                          </span>
                        </td>
                        <td className="p-3.5 max-w-[220px] text-slate-600" title={iso.description || iso.Remarks || ''}>
                          {iso.description && (
                            <div className="font-semibold text-slate-800 truncate">{iso.description}</div>
                          )}
                          <div className={`truncate ${iso.description ? 'text-[11px] text-slate-500' : ''}`}>
                            {iso.Remarks || (!iso.description ? '—' : '')}
                          </div>
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(iso)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-700 hover:bg-slate-100 hover:text-[#006398] transition shadow-2xs cursor-pointer"
                              title="Edit Certificate / Link Permit"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                              <span>Edit / Link</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIso(iso);
                                setViewMode('detail');
                              }}
                              className="inline-flex items-center gap-1 rounded-xl bg-[#006398] hover:bg-[#004e78] text-white px-3 py-1.5 text-xs font-mono font-bold shadow-2xs transition-colors cursor-pointer"
                            >
                              <span>View Details</span>
                              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Bottom Pagination Bar */}
            <div className="px-5 py-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
              <div className="text-slate-500 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Connected to SAP Gateway:</span>
                </span>
                <code className="text-slate-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  /Isolation
                </code>
                <span>&middot;</span>
                <span>
                  Showing{' '}
                  <strong className="text-slate-800">
                    {sortedIsolations.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-slate-800">
                    {Math.min(currentPage * pageSize, sortedIsolations.length)}
                  </strong>{' '}
                  of{' '}
                  <strong className="text-slate-800">{sortedIsolations.length}</strong> certificates
                  {isolations.length !== sortedIsolations.length && (
                    <span className="text-slate-400"> (filtered from {isolations.length} total)</span>
                  )}
                </span>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold transition shadow-2xs cursor-pointer"
                    title="First Page"
                  >
                    <span className="material-symbols-outlined text-[16px]">first_page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 transition shadow-2xs cursor-pointer"
                    title="Previous Page"
                  >
                    <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                    <span className="hidden sm:inline">Prev</span>
                  </button>

                  <form onSubmit={handlePageJump} className="flex items-center gap-1">
                    <span className="text-slate-500">Page</span>
                    <input
                      type="text"
                      value={pageJumpInput}
                      onChange={(e) => setPageJumpInput(e.target.value)}
                      onBlur={() => setPageJumpInput(String(currentPage))}
                      className="w-10 text-center py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#006398]"
                      title="Type page number and press Enter"
                    />
                    <span className="text-slate-500">of {totalPages}</span>
                  </form>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 transition shadow-2xs cursor-pointer"
                    title="Next Page"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold transition shadow-2xs cursor-pointer"
                    title="Last Page"
                  >
                    <span className="material-symbols-outlined text-[16px]">last_page</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* MODE 2: CERTIFICATE DETAIL / POINTS DOSSIER */}
      {viewMode === 'detail' && selectedIso && (
        <div className="space-y-6">
          {/* Certificate Header Dossier */}
          <SectionCard
            theme="rose"
            sectionTag="CERTIFICATE"
            title={`Isolation Certificate ${selectedIso.IsolationNo}`}
            subtitle="SAP S/4HANA Isolation Certificate Master Record"
            icon="lock_open_right"
            badge={
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-bold tracking-wider uppercase ${
                    selectedIso.Status === 'CRTD'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : selectedIso.Status === 'ISOL'
                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                      : selectedIso.Status === 'NORM'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {selectedIso.Status}
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(selectedIso)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#006398] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#004f7a] shadow-xs transition active:scale-[0.98]"
                  title="Update certificate details or link Permit No"
                >
                  <span className="material-symbols-outlined text-[16px]">link</span>
                  <span>Link Permit / Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
                >
                  ← Back to List
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Header Meta Attributes Grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 font-mono text-xs">
                <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 relative group">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase font-sans font-bold">
                      Linked Permit
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(selectedIso)}
                      className="text-[11px] font-semibold text-[#006398] hover:underline flex items-center gap-0.5"
                      title="Link or change Permit No"
                    >
                      <span className="material-symbols-outlined text-[13px]">edit</span>
                      {selectedIso.PermitNo ? 'Change' : 'Link permit'}
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {selectedIso.PermitNo ? (
                      <span className="bg-sky-100/70 text-[#006398] px-2 py-0.5 rounded font-mono font-bold border border-sky-200">
                        {selectedIso.PermitNo}
                      </span>
                    ) : (
                      <span className="text-amber-700 italic font-sans font-normal text-xs flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">link_off</span>
                        None (Unassigned)
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] text-slate-500 uppercase font-sans font-bold">
                    Requested By
                  </span>
                  <p className="mt-1 font-bold text-slate-800">{selectedIso.RequestedBy}</p>
                  <span className="text-[10px] text-slate-400">
                    {selectedIso.RequestedDate} {selectedIso.RequestedTime}
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] text-slate-500 uppercase font-sans font-bold">
                    Verified / Approved
                  </span>
                  <p className="mt-1 font-bold text-slate-800">
                    {selectedIso.VerifiedBy || 'Pending Verification'}
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {selectedIso.ApprovedBy ? `Approved by ${selectedIso.ApprovedBy}` : 'Unapproved'}
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] text-slate-500 uppercase font-sans font-bold">
                    De-Isolation / Normalized
                  </span>
                  <p className="mt-1 font-bold text-slate-800">
                    {selectedIso.NormalizedBy || 'Active In Field'}
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {selectedIso.NormalizedDate ? selectedIso.NormalizedDate : 'Not normalized'}
                  </span>
                </div>
              </div>

              {selectedIso.description && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-950">
                  <span className="font-bold text-[#006398]">Description: </span>
                  {selectedIso.description}
                </div>
              )}

              {selectedIso.Remarks && (
                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3 text-xs text-sky-900">
                  <span className="font-bold">Remarks: </span>
                  {selectedIso.Remarks}
                </div>
              )}
            </div>
          </SectionCard>

          {/* Child Items (_Item) Table */}
          <SectionCard
            theme="amber"
            sectionTag="POINTS LEDGER"
            title="Physical Isolation Points Registry (_Item)"
            subtitle="Engineered zero-energy boundary, lock tags, zero-energy confirmations, and de-isolation."
            icon="checklist"
            badge={
              <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 font-mono text-[11px] font-bold">
                {selectedIso._Item?.length || 0} Lock Points
              </span>
            }
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-slate-50 font-mono text-[11px] uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Reference (EQUI / FLOC)</th>
                    <th className="p-3">Physical Point</th>
                    <th className="p-3">Discipline & Method</th>
                    <th className="p-3">Isolated State</th>
                    <th className="p-3">De-Isolated State</th>
                    <th className="p-3">Lock / Tag #</th>
                    <th className="p-3 text-center">Physical Isolation</th>
                    <th className="p-3 text-center">Zero Energy</th>
                    <th className="p-3 text-center">Normalized</th>
                    <th className="p-3">Point Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!selectedIso._Item || selectedIso._Item.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400 italic font-mono">
                        No isolation points recorded for this certificate.
                      </td>
                    </tr>
                  ) : (
                    paginatedPoints.map((item, idx) => {
                      const itemIndex = (pointsPage - 1) * pointsPageSize + idx + 1;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 font-mono font-bold text-slate-500">
                            {item.ItemNo || itemIndex}
                          </td>
                          <td className="p-3 font-mono">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                              {item.ReferenceType}
                            </span>{' '}
                            <span className="font-semibold text-slate-800">{item.ReferenceId}</span>
                          </td>
                          <td className="p-3 font-semibold text-slate-900 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-orange-500">
                              lock
                            </span>
                            {item.IsolationPoint}
                          </td>
                          <td className="p-3 font-mono text-[11px]">
                            <span className="font-bold text-slate-800">{getIsolTypeLabel(item.IsolType)}</span>
                            <span className="block text-slate-500 font-normal">{getIsolMethodLabel(item.IsolMethod)}</span>
                          </td>
                          <td className="p-3 font-mono font-bold text-amber-700">
                            {getIsolatedStateLabel(item.IsolatedState) || '—'}
                          </td>
                          <td className="p-3 font-mono text-slate-600">
                            {getDeisolatedStateLabel(item.DeIsolatedState || '') || '—'}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-800">
                            {item.LockTagNo ? (
                              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
                                🏷️ {item.LockTagNo}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-3 text-center font-mono">
                            {item.IsIsolated === 'Y' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                YES
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-400">
                                <span className="material-symbols-outlined text-[16px]">pending</span>
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono">
                            {item.ZeroEnergyConf === 'Y' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                <span className="material-symbols-outlined text-[16px]">verified</span>
                                CONFIRMED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-400">
                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono">
                            {item.IsNormalized === 'Y' ? (
                              <span className="inline-flex items-center gap-1 text-blue-700 font-bold">
                                <span className="material-symbols-outlined text-[16px]">restore</span>
                                RESTORED
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Active</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 max-w-[150px] truncate" title={item.Remarks}>
                            {item.Remarks || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Points Table Pagination Bar (if > 5) */}
            {selectedIso._Item && selectedIso._Item.length > 5 && (
              <div className="px-4 py-2.5 bg-slate-50/90 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-500 mt-2">
                <div className="flex items-center gap-3">
                  <span>
                    Showing {(pointsPage - 1) * pointsPageSize + 1} to{' '}
                    {Math.min(pointsPage * pointsPageSize, selectedIso._Item.length)} of{' '}
                    {selectedIso._Item.length} physical lock points
                  </span>
                  <div className="flex items-center gap-1.5 font-sans">
                    <span className="text-slate-400">Rows:</span>
                    <select
                      value={pointsPageSize}
                      onChange={(e) => {
                        setPointsPageSize(Number(e.target.value));
                        setPointsPage(1);
                      }}
                      className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-sans text-xs text-slate-700 outline-none focus:border-[#006398] cursor-pointer"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPointsPage((p) => Math.max(1, p - 1))}
                    disabled={pointsPage === 1}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 disabled:opacity-40 font-bold hover:bg-slate-100 shadow-2xs cursor-pointer"
                  >
                    Prev
                  </button>
                  <span className="font-bold text-slate-800 px-1">
                    {pointsPage} / {totalPointsPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPointsPage((p) => Math.min(totalPointsPages, p + 1))}
                    disabled={pointsPage === totalPointsPages}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 disabled:opacity-40 font-bold hover:bg-slate-100 shadow-2xs cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* MODE 3: CREATE ISOLATION CERTIFICATE */}
      {viewMode === 'create' && (
        <form onSubmit={handleCreateSubmit} className="space-y-6">
          <SectionCard
            theme="rose"
            sectionTag="PREPARATION"
            title="Register New Isolation Certificate (POST Isolation)"
            subtitle="Define engineered zero-energy boundary, physical breaker/valve lock points and danger tags."
            icon="lock_clock"
            badge={
              <button
                type="button"
                onClick={returnToCaller ? onBack : () => setViewMode('list')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                <span>{returnToCaller ? 'Return to Permit' : 'Back to List'}</span>
              </button>
            }
          >
            <div className="space-y-6">

            {/* Header Level Form */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                Linked Permit Number (Optional)
                <input
                  type="text"
                  list="available-permits-list"
                  placeholder="e.g. 0000000014"
                  value={createPermitNo}
                  onChange={(e) => setCreatePermitNo(e.target.value.toUpperCase())}
                  maxLength={10}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 font-mono text-xs outline-none focus:border-[#006398]"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Requested By
                <input
                  type="text"
                  disabled
                  value={user?.id || ''}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-500 cursor-not-allowed"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                <span className="flex items-center justify-between">
                  <span>Description of the Isolation</span>
                  <span className="font-mono text-[10px] text-slate-400 font-normal">description</span>
                </span>
                <input
                  type="text"
                  placeholder="e.g. Primary pump electrical & mechanical isolation"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  maxLength={255}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-[#006398]"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                <span className="flex items-center justify-between">
                  <span>Isolation Scope / Remarks</span>
                  <span className="font-mono text-[10px] text-slate-400 font-normal">Remarks</span>
                </span>
                <input
                  type="text"
                  placeholder="e.g. Pump P-101 motor overhaul isolation"
                  value={createRemarks}
                  onChange={(e) => setCreateRemarks(e.target.value)}
                  maxLength={255}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-[#006398]"
                />
              </label>
            </div>

            {/* Points Builder */}
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Isolation Points Registry (_Item)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    At least one engineered isolation point is required.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddPointRow}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#006398] bg-sky-50/50 px-3 py-1.5 text-xs font-bold text-[#006398] hover:bg-sky-50"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Add Point
                </button>
              </div>

              <div className="space-y-3">
                {createPoints.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center bg-slate-50">
                    <span className="material-symbols-outlined text-[28px] text-slate-400 mb-1">
                      format_list_bulleted
                    </span>
                    <p className="text-xs font-semibold text-slate-700">No isolation points added</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      You can save this certificate as Header-Only (_Item: []), or click "Add Point" to configure isolation points.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddPointRow}
                      className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[#006398] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#004f7a]"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span>
                      Add First Point
                    </button>
                  </div>
                ) : (
                  createPoints.map((point, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition-all hover:border-slate-300"
                    >
                      <div className="flex items-center justify-between mb-3 border-b border-slate-200/80 pb-2">
                        <span className="font-mono text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-orange-600">
                            pin_drop
                          </span>
                          Isolation Point #{idx + 1}
                        </span>
                        {createPoints.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePointRow(idx)}
                            className="text-xs text-rose-600 hover:underline flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                            Remove
                          </button>
                        )}
                      </div>

                    <div className="grid gap-3 sm:grid-cols-4 text-xs">
                      <label>
                        <span className="text-[11px] font-medium text-slate-600">Ref Type *</span>
                        <select
                          value={point.ReferenceType}
                          onChange={(e) => handlePointChange(idx, 'ReferenceType', e.target.value)}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 font-mono"
                        >
                          <option value="EQUI">EQUI — Equipment</option>
                          <option value="FLOC">FLOC — Functional Location</option>
                        </select>
                      </label>

                      <label>
                        <span className="text-[11px] font-medium text-slate-600">Reference ID *</span>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 10000001"
                          value={point.ReferenceId}
                          onChange={(e) => handlePointChange(idx, 'ReferenceId', e.target.value)}
                          maxLength={30}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 font-mono"
                        />
                      </label>

                      <label className="sm:col-span-2">
                        <span className="text-[11px] font-medium text-slate-600">Physical Point Name *</span>
                        <input
                          type="text"
                          required
                          placeholder="e.g. P-101 SUCTION VALVE / MAIN BREAKER MCC-01"
                          value={point.IsolationPoint}
                          onChange={(e) =>
                            handlePointChange(idx, 'IsolationPoint', e.target.value.toUpperCase())
                          }
                          maxLength={60}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 font-mono font-bold"
                        />
                      </label>

                      <label>
                        <span className="text-[11px] font-medium text-slate-600">Discipline / Type *</span>
                        <select
                          value={point.IsolType}
                          onChange={(e) => handlePointChange(idx, 'IsolType', e.target.value)}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs"
                        >
                          {(isolationTypes.length > 0 ? isolationTypes : [
                            { Config_Code: 'ELEC', Config_Desc: 'ELECTRICAL' },
                            { Config_Code: 'INHOVR', Config_Desc: 'INHIBITS AND OVERRIDES' },
                            { Config_Code: 'MECH', Config_Desc: 'PROCESS/MECHANICAL' }
                          ]).map((t) => (
                            <option key={t.Config_Code} value={t.Config_Code}>
                              {t.Config_Desc} ({t.Config_Code})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span className="text-[11px] font-medium text-slate-600">Isolation Method *</span>
                        <select
                          value={point.IsolMethod}
                          onChange={(e) => handlePointChange(idx, 'IsolMethod', e.target.value)}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs"
                        >
                          {(isolMethods.length > 0 ? isolMethods : [
                            { Config_Code: 'VALVE', Config_Desc: 'VALVE' },
                            { Config_Code: 'VALVE_CC', Config_Desc: 'VALVE (C/C)' },
                            { Config_Code: 'VALVE_CO', Config_Desc: 'VALVE (C/O)' },
                            { Config_Code: 'CB_RIRO', Config_Desc: 'CIRCUIT BREAKER (RI/RO)' },
                            { Config_Code: 'BREAKER', Config_Desc: 'CIRCUIT BREAKER' },
                            { Config_Code: 'BLIND', Config_Desc: 'BLIND / SPADE' },
                            { Config_Code: 'FUSE', Config_Desc: 'FUSE' },
                            { Config_Code: 'SPADE_INS', Config_Desc: 'SPADE INSERTED' },
                            { Config_Code: 'LOCKBOX_LR', Config_Desc: 'LOCKBOX/HASP (L/R)' }
                          ]).map((m) => (
                            <option key={m.Config_Code} value={m.Config_Code}>
                              {m.Config_Desc} ({m.Config_Code})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span className="text-[11px] font-medium text-slate-600">Isolated State *</span>
                        <select
                          value={point.IsolatedState}
                          onChange={(e) => handlePointChange(idx, 'IsolatedState', e.target.value)}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs"
                        >
                          {(isolatedStates.length > 0 ? isolatedStates : [
                            { Config_Code: 'CLOSED', Config_Desc: 'CLOSED' },
                            { Config_Code: 'OPEN', Config_Desc: 'OPEN' },
                            { Config_Code: 'LOCKED', Config_Desc: 'LOCKED' },
                            { Config_Code: 'RACKED_OUT', Config_Desc: 'RACKED OUT' },
                            { Config_Code: 'APPLIED', Config_Desc: 'APPLIED' }
                          ]).map((s) => (
                            <option key={s.Config_Code} value={s.Config_Code}>
                              {s.Config_Desc} ({s.Config_Code})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span className="text-[11px] font-medium text-slate-600">De-Isolated State</span>
                        <select
                          value={point.DeIsolatedState || ''}
                          onChange={(e) => handlePointChange(idx, 'DeIsolatedState', e.target.value)}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs"
                        >
                          <option value="">-- None / Initial (Empty) --</option>
                          {(deisolatedStates.length > 0 ? deisolatedStates : [
                            { Config_Code: 'NORMAL', Config_Desc: 'NORMAL' },
                            { Config_Code: 'RESTORED', Config_Desc: 'RESTORED' },
                            { Config_Code: 'OPEN', Config_Desc: 'OPEN' },
                            { Config_Code: 'CLOSED', Config_Desc: 'CLOSED' },
                            { Config_Code: 'CONNECTED', Config_Desc: 'CONNECTED' },
                            { Config_Code: 'UNLOCKED', Config_Desc: 'UNLOCKED' }
                          ]).map((d) => (
                            <option key={d.Config_Code} value={d.Config_Code}>
                              {d.Config_Desc} ({d.Config_Code})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span className="text-[11px] font-medium text-slate-600">Lock / Tag # *</span>
                        <input
                          type="text"
                          required
                          placeholder="e.g. LT-0001"
                          value={point.LockTagNo}
                          onChange={(e) =>
                            handlePointChange(idx, 'LockTagNo', e.target.value.toUpperCase())
                          }
                          maxLength={30}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 font-mono font-bold"
                        />
                      </label>

                      <label className="sm:col-span-4">
                        <span className="text-[11px] font-medium text-slate-600">Point Remarks</span>
                        <input
                          type="text"
                          placeholder="e.g. Double block and bleed confirmed with field operator"
                          value={point.Remarks}
                          onChange={(e) => handlePointChange(idx, 'Remarks', e.target.value)}
                          maxLength={255}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-xs"
                        />
                      </label>
                    </div>
                  </div>
                ))
              )}
              </div>
            </div>

            {/* Submission Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || saveUncertain}
                className="inline-flex items-center gap-2 rounded-lg bg-[#006398] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#004f7a] shadow-sm disabled:opacity-50 transition-colors"
              >
                {isSubmitting && (
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                )}
                <span>Save Isolation Certificate to SAP</span>
              </button>
            </div>
          </div>
          </SectionCard>
        </form>
      )}

      {selectedIso && viewMode === 'detail' && <CertificateActions key={selectedIso.IsolationNo} certificate={selectedIso} user={user} onUpdated={updated => { setSelectedIso(updated); setIsolations(rows => rows.map(row => row.IsolationNo === updated.IsolationNo ? updated : row)); }} />}
      {saveUncertain && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">SAP save outcome is unconfirmed. Check existing certificates and audit in SAP before another save.</p>}
      {/* MODE / MODAL: EDIT CERTIFICATE & LINK PERMIT */}
      {showEditModal && editingIso && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200/90 bg-gradient-to-r from-slate-50 via-sky-50/20 to-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#006398] text-white flex items-center justify-center shadow-xs shrink-0">
                  <span className="material-symbols-outlined text-[20px]">edit_document</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-bold text-base text-slate-900 tracking-tight">
                      Edit Isolation Certificate
                    </h3>
                    <span className="font-mono text-xs font-bold text-[#006398] bg-sky-50 px-2.5 py-0.5 rounded-md border border-sky-200">
                      {editingIso.IsolationNo}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span className={`w-2 h-2 rounded-full ${
                        editingIso.Status === 'APPR'
                          ? 'bg-emerald-500'
                          : editingIso.Status === 'CRTD'
                          ? 'bg-amber-500'
                          : 'bg-[#006398]'
                      }`} />
                      <span>{editingIso.Status === 'CRTD' ? 'CRTD · Created' :
                             editingIso.Status === 'APPR' ? 'APPR · Approved' :
                             editingIso.Status || 'CRTD'}</span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="truncate">Permit Link & Scope</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                aria-label="Close modal"
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all shadow-2xs shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0 m-0">
              <div className="p-6 space-y-4 bg-white overflow-y-auto flex-1">
                {/* Linked Work Permit Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="iso-permit-no" className="font-bold text-xs text-slate-800 font-sans flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#006398]">link</span>
                      <span>Linked Work Permit Number</span>
                      <span className="text-[10px] font-mono text-slate-400 font-normal">(PermitNo)</span>
                    </label>
                    {editPermitNo && (
                      <button
                        type="button"
                        onClick={() => setEditPermitNo('')}
                        className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-0.5 transition"
                      >
                        <span className="material-symbols-outlined text-[13px]">link_off</span>
                        Unlink Permit
                      </button>
                    )}
                  </div>
                  <div className="flex rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs focus-within:ring-3 focus-within:ring-[#006398]/15 focus-within:border-[#006398] transition">
                    <div className="flex items-center px-3 bg-slate-50 border-r border-slate-200 text-slate-500 font-mono text-xs select-none">
                      <span className="text-slate-400 font-bold">PTW#</span>
                    </div>
                    <input
                      id="iso-permit-no"
                      type="text"
                      list="available-permits-list"
                      maxLength={10}
                      placeholder="e.g. 0000000014"
                      value={editPermitNo}
                      onChange={(e) => setEditPermitNo(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2 text-xs sm:text-sm font-mono tracking-wider outline-none uppercase font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                    />
                    <datalist id="available-permits-list">
                      {availablePermits.map((no) => (
                        <option key={no} value={no} />
                      ))}
                    </datalist>
                    {editPermitNo && (
                      <button
                        type="button"
                        onClick={() => setEditPermitNo('')}
                        className="px-3 text-slate-400 hover:text-rose-600 transition flex items-center"
                        title="Clear permit"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-sans">
                    Select or enter the 10-character SAP Work Permit number, or clear to save without a linked permit.
                  </p>
                </div>

                {/* Description Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="iso-description" className="font-bold text-xs text-slate-800 font-sans flex items-center gap-1.5">
                      <span>Isolation Description</span>
                      <span className="text-[10px] font-mono text-slate-400 font-normal">(description)</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[11px] font-mono font-semibold ${
                        editDescription.length > 240 ? 'text-rose-600' : 'text-slate-500'
                      }`}>
                        {editDescription.length}
                      </span>
                      <span className="text-[11px] text-slate-300">/</span>
                      <span className="text-[11px] font-mono text-slate-400">255</span>
                    </div>
                  </div>
                  <input
                    id="iso-description"
                    type="text"
                    maxLength={255}
                    placeholder="Enter short description of the isolation..."
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-xs sm:text-sm focus:ring-3 focus:ring-[#006398]/15 focus:border-[#006398] focus:outline-none transition-all font-sans"
                  />
                </div>

                {/* Remarks Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="iso-remarks" className="font-bold text-xs text-slate-800 font-sans flex items-center gap-1.5">
                      <span>Certificate Remarks / Scope</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[11px] font-mono font-semibold ${
                        editRemarks.length > 240 ? 'text-rose-600' : 'text-slate-500'
                      }`}>
                        {editRemarks.length}
                      </span>
                      <span className="text-[11px] text-slate-300">/</span>
                      <span className="text-[11px] font-mono text-slate-400">255</span>
                    </div>
                  </div>
                  <textarea
                    id="iso-remarks"
                    rows={3}
                    maxLength={255}
                    placeholder="Enter isolation notes, equipment details, or permit reference..."
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-xs sm:text-sm focus:ring-3 focus:ring-[#006398]/15 focus:border-[#006398] focus:outline-none transition-all resize-none font-sans leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400 font-sans">
                    Provide equipment tagging, boundary details, and isolation methods for SAP auditing.
                  </p>
                </div>
              </div>

              {/* Dedicated Solid Footer */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-sans">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-slate-600">OData V4 Online</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs hover:shadow-xs transition active:scale-[0.98]"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingEdit || saveUncertain}
                    className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-[#006398] hover:bg-[#004f7a] text-white text-xs font-bold shadow-xs hover:shadow-sm disabled:opacity-50 transition active:scale-[0.98]"
                  >
                    {isSavingEdit ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Saving to SAP...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">save</span>
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IsolationWorkspace;
