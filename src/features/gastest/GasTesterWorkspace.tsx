import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SapUser } from '../../core/auth/sapAuthContext';
import type { GasTestRecord, PermitInfoRecord } from '../../core/types/ptw.types';
import { gasTesterApi, AtmosphereAssessment } from '../../core/api/modules/gasTester.api';
import { toast } from '../../shared/context/ToastContext';

interface GasTesterWorkspaceProps {
  user: SapUser | null;
  onBack: () => void;
}

export const GasTesterWorkspace: React.FC<GasTesterWorkspaceProps> = ({ user, onBack }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingPending, setLoadingPending] = useState<boolean>(false);
  const [gasTests, setGasTests] = useState<GasTestRecord[]>([]);
  const [pendingPermits, setPendingPermits] = useState<PermitInfoRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<GasTestRecord | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showGuidelines, setShowGuidelines] = useState<boolean>(false);
  const [showPendingQueue, setShowPendingQueue] = useState<boolean>(true);
  const [pendingSortOrder, setPendingSortOrder] = useState<'LATEST' | 'OLDEST'>('LATEST');
  const [viewMode, setViewMode] = useState<'GROUPED' | 'FLAT'>('GROUPED');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [permitStatusFilter, setPermitStatusFilter] = useState<'ALL' | 'AWAITING' | 'DANGER' | 'WARNING' | 'SAFE'>('ALL');
  const [copiedPermit, setCopiedPermit] = useState<string | null>(null);

  // Pagination State for Main Register
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [pageJumpInput, setPageJumpInput] = useState<string>('1');

  // Pagination State for Pending Initial Clearance Queue
  const [pendingQueuePage, setPendingQueuePage] = useState<number>(1);
  const pendingQueuePageSize = 6;

  const registerSectionRef = useRef<HTMLElement>(null);

  // Guarantee view changes open from the top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [viewMode, showPendingQueue]);

  // Reset pagination to page 1 when search or any filters change
  useEffect(() => {
    setCurrentPage(1);
    setPageJumpInput('1');
  }, [searchQuery, typeFilter, levelFilter, statusFilter, permitStatusFilter, viewMode]);

  // Reset pending queue pagination on search or sort change
  useEffect(() => {
    setPendingQueuePage(1);
  }, [searchQuery, pendingSortOrder]);

  const handleCopyPermit = (permitNo: string) => {
    if (!permitNo) return;
    navigator.clipboard.writeText(permitNo);
    setCopiedPermit(permitNo);
    toast.success(`Copied permit ${permitNo} to clipboard`, { title: 'Copied' });
    setTimeout(() => setCopiedPermit(null), 2000);
  };

  const showNotification = (type: 'success' | 'error' | 'info' | 'warning', text: string) => {
    setNotification({ type: type === 'warning' ? 'error' : type, text });
    if (type === 'error') {
      toast.error(text, { title: 'Gas Test Error' });
    } else if (type === 'warning') {
      toast.warning(text, { title: 'Mandatory Requirement Missing' });
    } else if (type === 'success') {
      toast.success(text, { title: 'Gas Test Submitted' });
    } else {
      toast.info(text);
    }
  };

  // New Gas Test Form State
  const [formPermitNo, setFormPermitNo] = useState<string>('');
  const [formTestSeq, setFormTestSeq] = useState<string>('1');
  const [formTestType, setFormTestType] = useState<string>('INITIAL');
  const [formSampleLevel, setFormSampleLevel] = useState<string>('MID');
  const [formLocation, setFormLocation] = useState<string>('');
  const [formMeterType, setFormMeterType] = useState<string>('GAS_DETECTOR');
  const [formMeterId, setFormMeterId] = useState<string>('MTR-GFL-014');
  const [formCalibDate, setFormCalibDate] = useState<string>('');
  const [formBumpTestOk, setFormBumpTestOk] = useState<boolean>(true);
  // Free text input states for gas values (allows free typing without number spinner arrows)
  const [formO2Str, setFormO2Str] = useState<string>('20.9');
  const [formLelStr, setFormLelStr] = useState<string>('0.0');
  const [formCoStr, setFormCoStr] = useState<string>('0.0');
  const [formH2sStr, setFormH2sStr] = useState<string>('0.0');
  const [formOtherGas, setFormOtherGas] = useState<string>('');
  const [formOtherValStr, setFormOtherValStr] = useState<string>('');
  const [formOtherUnit, setFormOtherUnit] = useState<string>('PPM');
  const [formCert, setFormCert] = useState<string>('AGT-GFL-2026-08');
  const [formSigned, setFormSigned] = useState<boolean>(true);
  const [formRemarks, setFormRemarks] = useState<string>('INITIAL GAS TEST');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isHotWorkMode, setIsHotWorkMode] = useState<boolean>(false);

  // Safe numerical parser for free text gas concentration inputs
  const parseGasNum = (val: string, fallback = 0): number => {
    if (!val || typeof val !== 'string') return fallback;
    const cleaned = val.trim();
    if (!cleaned) return fallback;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? fallback : parsed;
  };

  // Prevent background scrolling and jumping when modal is open
  useEffect(() => {
    if (showCreateModal || selectedRecord) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showCreateModal, selectedRecord]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load live tests from SAP
  const loadGasTests = async (permitFilter?: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    try {
      const data = await gasTesterApi.list(permitFilter, controller.signal);
      if (!controller.signal.aborted) {
        setGasTests(data);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.warn('[GasTesterWorkspace] SAP query failed:', err);
        setGasTests([]);
        showNotification(
          'error',
          err instanceof Error ? err.message : 'Failed to fetch gas test records from SAP Gateway.'
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  // Load pending permits in status INTD requiring gas clearance
  const loadPendingPermits = async () => {
    setLoadingPending(true);
    try {
      const data = await gasTesterApi.listPendingPermits(user?.plant);
      setPendingPermits(data);
    } catch (err) {
      console.warn('[GasTesterWorkspace] Failed to fetch pending INTD permits:', err);
      setPendingPermits([]);
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    loadGasTests();
    loadPendingPermits();
    return () => abortControllerRef.current?.abort();
  }, [user?.plant]);

  // Compute next sequence for a permit
  const handlePermitNoChange = (newPermitNo: string) => {
    setFormPermitNo(newPermitNo);
    const pNo = newPermitNo.trim().toUpperCase();
    const completedExisting = gasTests.filter(t => (t.PermitNo || '').toUpperCase() === pNo && t.TestDate && t.TesterSigned === 'Y');
    if (completedExisting.length > 0) {
      const maxSeq = Math.max(...completedExisting.map(t => parseInt(t.TestSeq, 10) || 0));
      setFormTestSeq(String(maxSeq + 1));
      setFormTestType('PERIODIC');
      if (!formRemarks || formRemarks === 'INITIAL GAS TEST') {
        setFormRemarks('PERIODIC GAS TEST');
      }
    } else {
      setFormTestSeq('1');
      setFormTestType('INITIAL');
      if (!formRemarks || formRemarks === 'PERIODIC GAS TEST') {
        setFormRemarks('INITIAL GAS TEST');
      }
    }

    // Auto-populate location & hot work mode if known from pendingPermits
    const foundPermit = pendingPermits.find(p => (p.Permit_No || '').toUpperCase() === pNo);
    if (foundPermit) {
      if (foundPermit.AreaLoc && (!formLocation || formLocation === 'General Facility Clearance')) {
        setFormLocation(foundPermit.AreaLoc);
      }
      if (foundPermit.PermitType === 'HOT' || foundPermit.PermitType === 'HW') {
        setIsHotWorkMode(true);
      }
    }
  };

  // Open modal with pre-filled permit for retesting
  const handleRetestClick = (record: GasTestRecord) => {
    handlePermitNoChange(record.PermitNo || '');
    setFormLocation(record.TestLocation || '');
    setFormMeterType(record.MeterType || 'GAS_DETECTOR');
    setFormMeterId(record.MeterId || 'MTR-GFL-014');
    setFormCalibDate(record.CalibDate || '');
    setFormBumpTestOk(record.BumpTestOk === 'Y');
    setFormO2Str(record.O2Pct != null ? String(record.O2Pct) : '20.9');
    setFormLelStr(record.LelPct != null ? String(record.LelPct) : '0.0');
    setFormCoStr(record.CoVal != null ? String(record.CoVal) : '0.0');
    setFormH2sStr(record.H2sVal != null ? String(record.H2sVal) : '0.0');
    setFormOtherGas(record.OtherGas || '');
    setFormOtherValStr(record.OtherVal != null ? String(record.OtherVal) : '');
    setFormOtherUnit(record.OtherUnit || 'PPM');
    setFormRemarks(record.Remarks ? `Retest following: ${record.Remarks}` : 'PERIODIC GAS TEST');
    setFormTestType('PERIODIC');
    setShowCreateModal(true);
  };

  // Open modal with pre-filled permit for initial test #1
  const handleStartInitialTest = (permit: PermitInfoRecord | { Permit_No: string; AreaLoc?: string; PermitType?: string }) => {
    handlePermitNoChange(permit.Permit_No);
    if (permit.AreaLoc) {
      setFormLocation(permit.AreaLoc);
    }
    setFormTestSeq('1');
    setFormTestType('INITIAL');
    setFormRemarks('INITIAL GAS TEST');
    setFormO2Str('20.9');
    setFormLelStr('0.0');
    setFormCoStr('0.0');
    setFormH2sStr('0.0');
    setFormOtherGas('');
    setFormOtherValStr('');
    if (permit.PermitType === 'HOT' || permit.PermitType === 'HW') {
      setIsHotWorkMode(true);
    }
    setShowCreateModal(true);
    toast.info(`Preparing Initial Gas Test (Seq #1) for permit ${permit.Permit_No}`);
  };

  // Real-time atmosphere assessment of the active form input
  const liveFormAssessment: AtmosphereAssessment = useMemo(() => {
    return gasTesterApi.evaluateAtmosphere(
      {
        O2Pct: parseGasNum(formO2Str, 20.9),
        LelPct: parseGasNum(formLelStr, 0),
        CoVal: parseGasNum(formCoStr, 0),
        H2sVal: parseGasNum(formH2sStr, 0),
        OtherGas: formOtherGas,
        OtherVal: parseGasNum(formOtherValStr, 0),
        OtherUnit: formOtherUnit
      },
      isHotWorkMode
    );
  }, [formO2Str, formLelStr, formCoStr, formH2sStr, formOtherGas, formOtherValStr, formOtherUnit, isHotWorkMode]);

  // Filtered tests
  const filteredTests = useMemo(() => {
    return gasTests.filter(test => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (test.PermitNo && test.PermitNo.toLowerCase().includes(q)) ||
        (test.TestLocation && test.TestLocation.toLowerCase().includes(q)) ||
        (test.MeterId && test.MeterId.toLowerCase().includes(q)) ||
        (test.TestedBy && test.TestedBy.toLowerCase().includes(q)) ||
        (test.Remarks && test.Remarks.toLowerCase().includes(q));

      // Type Filter
      const normType = (t?: string) => {
        const u = (t || '').toUpperCase();
        if (u === 'INIT' || u === 'INITIAL') return 'INITIAL';
        if (u === 'RETEST' || u === 'PERIODIC') return 'PERIODIC';
        if (u === 'CONT' || u === 'CONTINUOUS') return 'CONTINUOUS';
        return u;
      };
      const matchType = typeFilter === 'ALL' || normType(test.TestType) === typeFilter;

      // Sample Level Filter
      const matchLevel = levelFilter === 'ALL' || test.SampleLevel === levelFilter;

      // Safety Status Filter
      if (statusFilter !== 'ALL') {
        const assessment = gasTesterApi.evaluateAtmosphere(test);
        if (statusFilter === 'SAFE' && assessment.overallStatus !== 'SAFE') return false;
        if (statusFilter === 'WARNING' && assessment.overallStatus !== 'WARNING') return false;
        if (statusFilter === 'DANGER' && assessment.overallStatus !== 'DANGER') return false;
      }

      return matchSearch && matchType && matchLevel;
    });
  }, [gasTests, searchQuery, typeFilter, levelFilter, statusFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let safeCount = 0;
    let warningCount = 0;
    let dangerCount = 0;

    gasTests.forEach(test => {
      const assessment = gasTesterApi.evaluateAtmosphere(test);
      if (assessment.overallStatus === 'SAFE') safeCount++;
      else if (assessment.overallStatus === 'WARNING') warningCount++;
      else dangerCount++;
    });

    return {
      total: gasTests.length,
      safe: safeCount,
      warning: warningCount,
      danger: dangerCount
    };
  }, [gasTests]);

  // Club / group tests and pending INTD permits
  const groupedPermits = useMemo(() => {
    const testMap = new Map<string, GasTestRecord[]>();

    filteredTests.forEach(test => {
      const key = (test.PermitNo || '').trim().toUpperCase();
      if (!testMap.has(key)) {
        testMap.set(key, []);
      }
      testMap.get(key)!.push(test);
    });

    const list: {
      permitKey: string;
      permitNo: string;
      permitInfo?: PermitInfoRecord;
      tests: GasTestRecord[];
      latestTest: GasTestRecord | null;
      totalCount: number;
      latestAssessment: AtmosphereAssessment | null;
      isPendingInitialTest: boolean;
      status: 'AWAITING' | 'SAFE' | 'WARNING' | 'DANGER';
    }[] = [];

    // 1. Process records that already have entries in GasTest
    testMap.forEach((records, permitKey) => {
      const sorted = [...records].sort((a, b) => {
        const seqA = parseInt(a.TestSeq, 10) || 0;
        const seqB = parseInt(b.TestSeq, 10) || 0;
        if (seqA !== seqB) return seqB - seqA;
        const dtA = `${a.TestDate || ''} ${a.TestTime || ''}`;
        const dtB = `${b.TestDate || ''} ${b.TestTime || ''}`;
        return dtB.localeCompare(dtA);
      });

      const completed = sorted.filter(t => Boolean(t.TestDate && t.TesterSigned === 'Y'));
      const matchingInfo = pendingPermits.find(p => (p.Permit_No || '').trim().toUpperCase() === permitKey);

      if (completed.length > 0) {
        const latest = completed[0];
        const assessment = gasTesterApi.evaluateAtmosphere(latest);
        list.push({
          permitKey,
          permitNo: latest?.PermitNo || permitKey,
          permitInfo: matchingInfo,
          tests: completed,
          latestTest: latest,
          totalCount: completed.length,
          latestAssessment: assessment,
          isPendingInitialTest: false,
          status: assessment.overallStatus
        });
      } else {
        const latestStub = sorted[0];
        list.push({
          permitKey,
          permitNo: latestStub?.PermitNo || permitKey,
          permitInfo: matchingInfo,
          tests: [],
          latestTest: latestStub,
          totalCount: 0,
          latestAssessment: null,
          isPendingInitialTest: true,
          status: 'AWAITING'
        });
      }
    });

    // 2. Process pending permits in status INTD that have NO GasTest records yet
    pendingPermits.forEach(p => {
      const pKey = (p.Permit_No || '').trim().toUpperCase();
      if (!pKey) return;
      if (!list.some(item => item.permitKey === pKey)) {
        const q = searchQuery.toLowerCase().trim();
        const matchSearch =
          !q ||
          p.Permit_No.toLowerCase().includes(q) ||
          (p.AreaLoc && p.AreaLoc.toLowerCase().includes(q)) ||
          (p.JobDesc && p.JobDesc.toLowerCase().includes(q)) ||
          (p.ExecDept && p.ExecDept.toLowerCase().includes(q));

        if (matchSearch) {
          list.push({
            permitKey: pKey,
            permitNo: p.Permit_No,
            permitInfo: p,
            tests: [],
            latestTest: null,
            totalCount: 0,
            latestAssessment: null,
            isPendingInitialTest: true,
            status: 'AWAITING'
          });
        }
      }
    });

    return list.sort((a, b) => {
      const dtA = `${a.latestTest?.TestDate || ''} ${a.latestTest?.TestTime || ''}`.trim();
      const dtB = `${b.latestTest?.TestDate || ''} ${b.latestTest?.TestTime || ''}`.trim();
      if (dtA && dtB && dtA !== dtB) return dtB.localeCompare(dtA);
      if (dtA && !dtB) return -1;
      if (!dtA && dtB) return 1;
      return (b.permitNo || b.permitKey).localeCompare(a.permitNo || a.permitKey, undefined, { numeric: true });
    });
  }, [filteredTests, pendingPermits, searchQuery]);

  // Summary counts of permits by clearance status
  const permitCounts = useMemo(() => {
    let awaiting = 0;
    let safe = 0;
    let warning = 0;
    let danger = 0;
    groupedPermits.forEach(g => {
      if (g.status === 'AWAITING') awaiting++;
      else if (g.status === 'SAFE') safe++;
      else if (g.status === 'WARNING') warning++;
      else if (g.status === 'DANGER') danger++;
    });
    const logged = safe + warning + danger;
    return { total: groupedPermits.length, logged, awaiting, safe, warning, danger };
  }, [groupedPermits]);

  // Permit groups filtered by clearance outcome tab
  const displayedGroupedPermits = useMemo(() => {
    if (permitStatusFilter === 'ALL') {
      // In the "All" list, exclude permits awaiting initial gas clearance
      return groupedPermits.filter(g => !g.isPendingInitialTest);
    }
    return groupedPermits.filter(g => g.status === permitStatusFilter);
  }, [groupedPermits, permitStatusFilter]);

  // Quick lookup of permits awaiting initial gas testing with configurable sort order (default: latest permit no. first)
  const pendingPermitsAwaitingTest = useMemo(() => {
    const list = groupedPermits.filter(g => g.isPendingInitialTest && g.permitNo);

    return list.slice().sort((a, b) => {
      // 1. Sort by creation date & time if available on permitInfo
      const dtA = `${a.permitInfo?.Erdat || ''} ${a.permitInfo?.Erzet || ''}`.trim();
      const dtB = `${b.permitInfo?.Erdat || ''} ${b.permitInfo?.Erzet || ''}`.trim();

      let cmp = 0;
      if (dtA && dtB && dtA !== dtB) {
        cmp = dtB.localeCompare(dtA);
      }

      // 2. Natural alphanumeric descending on Permit_No (e.g. PTW0000055 > PTW0000013)
      if (cmp === 0) {
        cmp = (b.permitNo || '').localeCompare(a.permitNo || '', undefined, { numeric: true, sensitivity: 'base' });
      }

      // 3. Fallback to permitKey
      if (cmp === 0) {
        cmp = (b.permitKey || '').localeCompare(a.permitKey || '', undefined, { numeric: true, sensitivity: 'base' });
      }

      return pendingSortOrder === 'LATEST' ? cmp : -cmp;
    });
  }, [groupedPermits, pendingSortOrder]);

  // Pagination computations for Main Register
  const totalItems = viewMode === 'GROUPED' ? displayedGroupedPermits.length : filteredTests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const effectiveCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedGroupedPermits = useMemo(() => {
    const start = (effectiveCurrentPage - 1) * pageSize;
    return displayedGroupedPermits.slice(start, start + pageSize);
  }, [displayedGroupedPermits, effectiveCurrentPage, pageSize]);

  const paginatedFilteredTests = useMemo(() => {
    const start = (effectiveCurrentPage - 1) * pageSize;
    return filteredTests.slice(start, start + pageSize);
  }, [filteredTests, effectiveCurrentPage, pageSize]);

  // Pagination computations for Pending Initial Clearance Queue
  const pendingTotalPages = Math.max(1, Math.ceil(pendingPermitsAwaitingTest.length / pendingQueuePageSize));
  const effectivePendingPage = Math.min(Math.max(1, pendingQueuePage), pendingTotalPages);
  const paginatedPendingPermits = useMemo(() => {
    const start = (effectivePendingPage - 1) * pendingQueuePageSize;
    return pendingPermitsAwaitingTest.slice(start, start + pendingQueuePageSize);
  }, [pendingPermitsAwaitingTest, effectivePendingPage]);

  const handlePageChange = (newPage: number) => {
    const target = Math.min(Math.max(1, newPage), totalPages);
    setCurrentPage(target);
    setPageJumpInput(String(target));
    registerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderPageButtons = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (effectiveCurrentPage > 3) pages.push('dots-1');
      const start = Math.max(2, effectiveCurrentPage - 1);
      const end = Math.min(totalPages - 1, effectiveCurrentPage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (effectiveCurrentPage < totalPages - 2) pages.push('dots-2');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }

    return pages.map(p => {
      if (typeof p === 'string') {
        return (
          <span key={p} className="px-1 text-slate-400 font-mono text-xs select-none">
            …
          </span>
        );
      }
      const pageNum = p;
      const isActive = pageNum === effectiveCurrentPage;
      return (
        <button
          key={pageNum}
          type="button"
          onClick={() => handlePageChange(pageNum)}
          className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
            isActive
              ? 'bg-[#006398] text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
          }`}
        >
          {pageNum}
        </button>
      );
    });
  };

  // Header Record Gas Test button handler
  const handleHeaderRecordClick = () => {
    const firstAwaiting = pendingPermitsAwaitingTest[0];
    if (firstAwaiting) {
      handleStartInitialTest(firstAwaiting.permitInfo || { Permit_No: firstAwaiting.permitNo });
    } else {
      handlePermitNoChange('');
      setFormLocation('');
      setFormO2Str('20.9');
      setFormLelStr('0.0');
      setFormCoStr('0.0');
      setFormH2sStr('0.0');
      setFormOtherGas('');
      setFormOtherValStr('');
      setShowCreateModal(true);
    }
  };

  // Ensure all groups default to expanded
  useEffect(() => {
    setExpandedGroups(prev => {
      const next: Record<string, boolean> = { ...prev };
      groupedPermits.forEach(g => {
        if (next[g.permitKey] === undefined) {
          next[g.permitKey] = true;
        }
      });
      return next;
    });
  }, [groupedPermits]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const expandAllGroups = () => {
    const next: Record<string, boolean> = {};
    groupedPermits.forEach(g => {
      next[g.permitKey] = true;
    });
    setExpandedGroups(next);
  };

  const collapseAllGroups = () => {
    const next: Record<string, boolean> = {};
    groupedPermits.forEach(g => {
      next[g.permitKey] = false;
    });
    setExpandedGroups(next);
  };

  // Form submission handler
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSigned) {
      showNotification('warning', 'Authorized Gas Tester signature confirmation is mandatory.');
      return;
    }
    if (!formBumpTestOk) {
      showNotification('warning', 'Bump test must be verified before submitting gas clearance.');
      return;
    }

    setIsSubmitting(true);
    setNotification(null);

    try {
      const now = new Date();
      const testDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const testTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const newRecord: Partial<GasTestRecord> = {
        PermitNo: formPermitNo.trim().toUpperCase(),
        TestSeq: formTestSeq.trim() || '1',
        TestType: formTestType,
        TestDate: testDate,
        TestTime: testTime,
        TestLocation: formLocation.trim(),
        SampleLevel: formSampleLevel || 'MID',
        TestedBy: user?.id || '',
        Cert: formCert.trim(),
        MeterType: formMeterType.trim() || 'GAS_DETECTOR',
        MeterId: formMeterId.trim(),
        CalibDate: formCalibDate && /^\d{4}-\d{2}-\d{2}$/.test(formCalibDate) ? formCalibDate : null,
        BumpTestOk: formBumpTestOk ? 'Y' : 'N',
        LelPct: parseGasNum(formLelStr, 0),
        O2Pct: parseGasNum(formO2Str, 20.9),
        CoVal: parseGasNum(formCoStr, 0),
        H2sVal: parseGasNum(formH2sStr, 0),
        OtherGas: formOtherGas.trim(),
        OtherVal: parseGasNum(formOtherValStr, 0),
        OtherUnit: formOtherUnit.trim() || 'PPM',
        TesterSigned: formSigned ? 'Y' : 'N',
        Remarks: formRemarks.trim()
      };

      const result = await gasTesterApi.create(newRecord);
      setGasTests(prev => [result, ...prev.filter(t => !(t.PermitNo === result.PermitNo && t.TestSeq === result.TestSeq))]);

      setShowCreateModal(false);
      showNotification(
        'success',
        `Gas test record #${result.TestSeq} for ${result.PermitNo || 'General Facility'} successfully submitted to SAP S/4HANA!`
      );
      void loadPendingPermits();
      void loadGasTests();
    } catch (err) {
      showNotification(
        'error',
        err instanceof Error ? err.message : 'Failed to save Gas Test record.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1536px] px-3 sm:px-6 py-4 space-y-3.5 font-sans">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & COMMAND BAR */}
      {/* ========================================================================= */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-3.5">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <button
              type="button"
              onClick={onBack}
              className="group inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1 text-slate-700 shadow-xs transition hover:border-[#006398] hover:text-[#006398]"
            >
              <span className="material-symbols-outlined text-[15px] group-hover:-translate-x-0.5 transition-transform">
                arrow_back
              </span>
              <span>Launchpad</span>
            </button>
            <span>/</span>
            <span className="text-slate-400">PTW Suite</span>
            <span>/</span>
            <span className="text-[#006398] font-bold">Atmospheric Gas Tester</span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#006398] border border-blue-100 shadow-xs shrink-0">
              <span className="material-symbols-outlined text-[24px]">air</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <span>Gas Tester Workspace</span>
                <span className="text-[11px] font-mono font-medium bg-blue-100/70 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                  SAP V4: GasTest
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 font-mono">
                Atmospheric Oxygen (O₂), Combustible (% LEL), Carbon Monoxide (CO) &amp; Hydrogen Sulfide (H₂S)
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowGuidelines(!showGuidelines)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition shadow-xs ${
              showGuidelines
                ? 'border-blue-400 bg-blue-50 text-[#006398]'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">verified_user</span>
            <span>{showGuidelines ? 'Hide Gas Limits' : 'Gas Safety Limits'}</span>
          </button>

          <button
            type="button"
            disabled={loading || loadingPending}
            onClick={() => {
              void loadGasTests();
              void loadPendingPermits();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:border-[#006398] hover:text-[#006398] disabled:opacity-50 transition"
            title="Reload from SAP Gateway"
          >
            <span className={`material-symbols-outlined text-[16px] ${loading || loadingPending ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleHeaderRecordClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#006398] hover:bg-[#004e78] text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
            <span>Record Gas Test</span>
          </button>
        </div>
      </header>

      {/* Notifications */}
      {notification && (
        <div
          className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border text-xs transition-all duration-300 shadow-xs ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : notification.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">
              {notification.type === 'success' ? 'check_circle' : notification.type === 'error' ? 'error' : 'info'}
            </span>
            <span className="font-medium">{notification.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Comprehensive Gas Safety Thresholds Guide Banner (Collapsible) */}
      {showGuidelines && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#006398] text-[20px]">policy</span>
              <h3 className="font-bold text-xs text-slate-900">
                GFL Dahej PTW Safety Manual · Atmospheric Acceptance Thresholds (HSE/SAF/02 Rev 08)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowGuidelines(false)}
              className="text-slate-400 hover:text-slate-600 text-xs flex items-center gap-1"
            >
              <span>Close</span>
              <span className="material-symbols-outlined text-[16px]">expand_less</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {/* O2 Rule */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5 space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-900">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  Oxygen (O₂)
                </span>
                <span className="font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded text-[11px]">19.5% – 23.5%</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Normal air is <strong>20.9%</strong>. Deficiency below <strong>19.5%</strong> causes asphyxiation. Enrichment above <strong>23.5%</strong> creates flammability.
              </p>
            </div>

            {/* LEL Rule */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5 space-y-1">
              <div className="flex items-center justify-between font-bold text-amber-900">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                  Combustible (% LEL)
                </span>
                <span className="font-mono bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded text-[11px]">0.0% / &lt; 5%</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Hot work demands strictly <strong>0.0% LEL</strong>. Vessel entry allowed under <strong>5% LEL</strong> with forced air. Above 10% is explosive.
              </p>
            </div>

            {/* CO Rule */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-2.5 space-y-1">
              <div className="flex items-center justify-between font-bold text-blue-900">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                  Carbon Monoxide (CO)
                </span>
                <span className="font-mono bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded text-[11px]">&lt; 25 ppm</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Permissible Exposure Limit (PEL) is <strong>&lt; 25 ppm</strong>. Concentrations above 25 ppm cause severe chemical asphyxiation.
              </p>
            </div>

            {/* H2S Rule */}
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-2.5 space-y-1">
              <div className="flex items-center justify-between font-bold text-purple-900">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                  Hydrogen Sulfide (H₂S)
                </span>
                <span className="font-mono bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded text-[11px]">&lt; 5.0 ppm</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Strict ceiling is <strong>&lt; 5 ppm</strong>. At ≥ 10 ppm, entry is strictly forbidden. Odor cannot be relied upon due to olfactory fatigue.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* KPI Metric Summary Cards - Interactive Filters */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {/* 1. Pending Initial Tests Card */}
        <button
          type="button"
          onClick={() => setPermitStatusFilter(permitStatusFilter === 'AWAITING' ? 'ALL' : 'AWAITING')}
          className={`text-left rounded-2xl p-3.5 shadow-xs border transition-all cursor-pointer flex flex-col justify-between ${
            permitStatusFilter === 'AWAITING'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
              : 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 text-xs font-semibold">
            <span>Awaiting Test #1</span>
            <span className="material-symbols-outlined text-[17px] text-amber-600">pending_actions</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-amber-900 leading-none">{permitCounts.awaiting}</span>
            {permitCounts.awaiting > 0 && (
              <span className="text-[10px] font-bold font-mono uppercase px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 animate-pulse">
                Action Req
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-amber-700 truncate">INTD permits awaiting clearance</div>
        </button>

        {/* 2. Total Tests Logged */}
        <button
          type="button"
          onClick={() => setPermitStatusFilter('ALL')}
          className={`text-left rounded-2xl p-3.5 shadow-xs border transition-all cursor-pointer flex flex-col justify-between ${
            permitStatusFilter === 'ALL'
              ? 'bg-slate-50 border-[#006398] ring-2 ring-blue-200'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold">
            <span>Total Logged</span>
            <span className="material-symbols-outlined text-[17px] text-[#006398]">assessment</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 leading-none">{metrics.total}</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase">Tests</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 truncate">Across {permitCounts.logged} permits</div>
        </button>

        {/* 3. Clear / Safe Tests */}
        <button
          type="button"
          onClick={() => setPermitStatusFilter(permitStatusFilter === 'SAFE' ? 'ALL' : 'SAFE')}
          className={`text-left rounded-2xl p-3.5 shadow-xs border transition-all cursor-pointer flex flex-col justify-between ${
            permitStatusFilter === 'SAFE'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
              : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold">
            <span>Atmosphere Safe</span>
            <span className="material-symbols-outlined text-[17px] text-emerald-600">check_circle</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-900 leading-none">{permitCounts.safe}</span>
            <span className="text-[10px] font-mono text-emerald-700 font-bold uppercase">Cleared</span>
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 truncate">Within safety limits</div>
        </button>

        {/* 4. Caution / Alerts */}
        <button
          type="button"
          onClick={() => setPermitStatusFilter(permitStatusFilter === 'WARNING' ? 'ALL' : 'WARNING')}
          className={`text-left rounded-2xl p-3.5 shadow-xs border transition-all cursor-pointer flex flex-col justify-between ${
            permitStatusFilter === 'WARNING'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
              : 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-amber-800 text-xs font-semibold">
            <span>Caution / Alerts</span>
            <span className="material-symbols-outlined text-[17px] text-amber-600">warning</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-amber-900 leading-none">{permitCounts.warning}</span>
            <span className="text-[10px] font-mono text-amber-700 font-bold uppercase">Caution</span>
          </div>
          <div className="mt-1 text-[10px] text-amber-700 truncate">Trace combustible / low O2</div>
        </button>

        {/* 5. Hazardous / Inhibit */}
        <button
          type="button"
          onClick={() => setPermitStatusFilter(permitStatusFilter === 'DANGER' ? 'ALL' : 'DANGER')}
          className={`text-left rounded-2xl p-3.5 shadow-xs border transition-all cursor-pointer flex flex-col justify-between col-span-2 sm:col-span-1 ${
            permitStatusFilter === 'DANGER'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200'
              : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-rose-800 text-xs font-semibold">
            <span>Inhibited / Danger</span>
            <span className="material-symbols-outlined text-[17px] text-rose-600">block</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-rose-900 leading-none">{permitCounts.danger}</span>
            <span className="text-[10px] font-mono text-rose-700 font-bold uppercase">Inhibited</span>
          </div>
          <div className="mt-1 text-[10px] text-rose-700 truncate">Entry forbidden</div>
        </button>
      </section>

      {/* Streamlined Action-Required Queue: Permits Awaiting Initial Clearance (Compact & Collapsible) */}
      {pendingPermitsAwaitingTest.length > 0 && (
        <section className="bg-gradient-to-r from-amber-50 via-white to-amber-50/30 border border-amber-300/80 rounded-2xl p-3.5 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="font-bold text-xs text-amber-950 uppercase tracking-wide">
                Permits Awaiting Initial Gas Clearance (Status: INTD)
              </span>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold font-mono bg-amber-200/90 text-amber-900">
                {pendingPermitsAwaitingTest.length} Action Required
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Compact Pending Queue Pagination Controls */}
              {pendingTotalPages > 1 && (
                <div className="flex items-center gap-1 bg-white/95 border border-amber-300/80 rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-amber-950 shadow-2xs">
                  <span>Page {effectivePendingPage} of {pendingTotalPages}</span>
                  <div className="flex items-center gap-0.5 ml-1 border-l border-amber-200 pl-1">
                    <button
                      type="button"
                      disabled={effectivePendingPage === 1}
                      onClick={() => setPendingQueuePage(p => Math.max(1, p - 1))}
                      className="p-0.5 hover:bg-amber-100 rounded text-amber-900 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Previous pending permits"
                    >
                      <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                    </button>
                    <button
                      type="button"
                      disabled={effectivePendingPage >= pendingTotalPages}
                      onClick={() => setPendingQueuePage(p => Math.min(pendingTotalPages, p + 1))}
                      className="p-0.5 hover:bg-amber-100 rounded text-amber-900 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Next pending permits"
                    >
                      <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Sort Order Toggle Button */}
              <button
                type="button"
                onClick={() => setPendingSortOrder(prev => prev === 'LATEST' ? 'OLDEST' : 'LATEST')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-white/95 hover:bg-white text-amber-900 border border-amber-300/80 shadow-2xs hover:border-amber-400 hover:shadow-xs transition active:scale-95"
                title={`Sort permits: currently showing ${pendingSortOrder === 'LATEST' ? 'Latest Permit No. first' : 'Oldest Permit No. first'}. Click to toggle.`}
              >
                <span className="material-symbols-outlined text-[15px] text-amber-700">
                  {pendingSortOrder === 'LATEST' ? 'arrow_downward' : 'arrow_upward'}
                </span>
                <span className="font-mono text-[11px] font-bold">
                  {pendingSortOrder === 'LATEST' ? 'Latest PTW# First' : 'Oldest PTW# First'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowPendingQueue(!showPendingQueue)}
                className="text-xs font-semibold text-amber-900 hover:text-amber-950 flex items-center gap-1"
              >
                <span>{showPendingQueue ? 'Collapse Queue' : 'Expand Queue'}</span>
                <span className={`material-symbols-outlined text-[16px] transition-transform ${showPendingQueue ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
            </div>
          </div>

          {showPendingQueue && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {paginatedPendingPermits.map(group => {
                const info = group.permitInfo;
                return (
                  <div
                    key={`pending-card-${group.permitKey}`}
                    className="bg-white rounded-xl border border-amber-200/90 p-2.5 shadow-2xs hover:border-amber-400 hover:shadow-xs transition flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-xs text-[#006398] bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                        <span>{group.permitNo}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyPermit(group.permitNo)}
                          className="text-slate-400 hover:text-slate-600 p-0.5"
                          title="Copy Permit Number"
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {copiedPermit === group.permitNo ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      </div>

                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                        {info?.PermitType || 'PERMIT'} · INTD
                      </span>
                    </div>

                    <div className="text-xs text-slate-700">
                      <p className="font-semibold text-slate-800 truncate text-[11px]" title={info?.AreaLoc}>
                        📍 {info?.AreaLoc || 'Location on permit'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5" title={info?.JobDesc}>
                        {info?.JobDesc || 'Job description awaiting gas testing'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[10px]">
                      <span className="text-slate-500 font-mono">
                        Freq: <strong>{info?.GasTestFreqHr || '2'}h</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStartInitialTest(info || { Permit_No: group.permitNo })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[14px]">add_circle</span>
                        <span>Record Test #1</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Unified Search & Filter Tool Strip */}
      <section className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-[16px]">
              search
            </span>
            <input
              type="text"
              placeholder="Instant filter by Permit #, Location, Detector ID, or Tester..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#006398]/30 focus:border-[#006398] transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 text-xs focus:outline-none focus:border-[#006398]"
            >
              <option value="ALL">All Test Types</option>
              <option value="INITIAL">Initial Test (INITIAL)</option>
              <option value="PERIODIC">Periodic Retest (PERIODIC)</option>
              <option value="CONTINUOUS">Continuous (CONTINUOUS)</option>
            </select>

            {/* Level Filter */}
            <select
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 text-xs focus:outline-none focus:border-[#006398]"
            >
              <option value="ALL">All Sampling Levels</option>
              <option value="TOP">TOP (Light Gases)</option>
              <option value="MID">MID (Breathing Zone)</option>
              <option value="BOT">BOT (Heavy Gases)</option>
            </select>

            {/* Safety Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 text-xs focus:outline-none focus:border-[#006398]"
            >
              <option value="ALL">All Safety Outcomes</option>
              <option value="SAFE">Safe / Approved Only</option>
              <option value="WARNING">Caution / Trace Only</option>
              <option value="DANGER">Hazardous / Inhibit Only</option>
            </select>

            {(searchQuery || typeFilter !== 'ALL' || levelFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('ALL');
                  setLevelFilter('ALL');
                  setStatusFilter('ALL');
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded hover:bg-rose-50 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[13px]">filter_alt_off</span>
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-bar: Status Tabs & View Modes */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Quick Permit Status Filter Pills */}
          {viewMode === 'GROUPED' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPermitStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition text-xs ${
                  permitStatusFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Permits ({permitCounts.logged})
              </button>
              <button
                type="button"
                onClick={() => setPermitStatusFilter('AWAITING')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition text-xs flex items-center gap-1 ${
                  permitStatusFilter === 'AWAITING'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span>Awaiting Test ({permitCounts.awaiting})</span>
              </button>
              <button
                type="button"
                onClick={() => setPermitStatusFilter('SAFE')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition text-xs flex items-center gap-1 ${
                  permitStatusFilter === 'SAFE'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                <span>Cleared ({permitCounts.safe})</span>
              </button>
              <button
                type="button"
                onClick={() => setPermitStatusFilter('WARNING')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition text-xs flex items-center gap-1 ${
                  permitStatusFilter === 'WARNING'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                <span>Caution ({permitCounts.warning})</span>
              </button>
              <button
                type="button"
                onClick={() => setPermitStatusFilter('DANGER')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition text-xs flex items-center gap-1 ${
                  permitStatusFilter === 'DANGER'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                <span>Inhibited ({permitCounts.danger})</span>
              </button>
            </div>
          ) : (
            <span className="text-slate-500 text-[11px] font-mono">
              Showing {filteredTests.length} test records
            </span>
          )}

          {/* View Mode & Expand/Collapse Toggles */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('GROUPED')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
                  viewMode === 'GROUPED'
                    ? 'bg-white text-[#006398] shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">folder_copy</span>
                <span>Clubbed ({displayedGroupedPermits.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('FLAT')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
                  viewMode === 'FLAT'
                    ? 'bg-white text-[#006398] shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">list</span>
                <span>Flat Log</span>
              </button>
            </div>

            {viewMode === 'GROUPED' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={expandAllGroups}
                  className="text-[11px] text-slate-600 hover:text-[#006398] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shadow-2xs transition"
                >
                  Expand
                </button>
                <button
                  type="button"
                  onClick={collapseAllGroups}
                  className="text-[11px] text-slate-600 hover:text-[#006398] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shadow-2xs transition"
                >
                  Collapse
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. MAIN REGISTER CONTENT: GROUPED CARDS OR FLAT LOG */}
      {/* ========================================================================= */}
      <section ref={registerSectionRef} className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        {/* Top Pagination & Summary Header Tool Strip */}
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs font-mono text-slate-600">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-900 font-bold">{totalItems === 0 ? 0 : (effectiveCurrentPage - 1) * pageSize + 1}</strong> to{' '}
              <strong className="text-slate-900 font-bold">{Math.min(effectiveCurrentPage * pageSize, totalItems)}</strong> of{' '}
              <strong className="text-slate-900 font-bold">{totalItems.toLocaleString()}</strong>{' '}
              {viewMode === 'GROUPED' ? 'permit groups' : 'test logs'}
              {viewMode === 'GROUPED' && displayedGroupedPermits.length !== (permitStatusFilter === 'ALL' ? permitCounts.logged : groupedPermits.length) && (
                <span className="text-slate-400 ml-1">
                  (filtered from {permitStatusFilter === 'ALL' ? permitCounts.logged : groupedPermits.length} total)
                </span>
              )}
              {viewMode === 'FLAT' && filteredTests.length !== gasTests.length && (
                <span className="text-slate-400 ml-1">
                  (filtered from {gasTests.length} total)
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Rows Per Page Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[11px]">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newSize = Number(e.target.value);
                  setPageSize(newSize);
                  setCurrentPage(1);
                  setPageJumpInput('1');
                }}
                className="px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#006398] font-bold text-slate-800 shadow-2xs"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Quick Page Jump */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                <span className="text-slate-500 text-[11px]">Page:</span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const target = parseInt(pageJumpInput, 10);
                    if (!isNaN(target) && target >= 1 && target <= totalPages) {
                      handlePageChange(target);
                    } else {
                      setPageJumpInput(String(effectiveCurrentPage));
                    }
                  }}
                  className="inline-flex items-center gap-1"
                >
                  <input
                    type="text"
                    value={pageJumpInput}
                    onChange={(e) => setPageJumpInput(e.target.value)}
                    onBlur={() => {
                      const target = parseInt(pageJumpInput, 10);
                      if (!isNaN(target) && target >= 1 && target <= totalPages) {
                        handlePageChange(target);
                      } else {
                        setPageJumpInput(String(effectiveCurrentPage));
                      }
                    }}
                    className="w-12 px-1.5 py-0.5 text-center text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#006398] font-bold text-slate-900 shadow-2xs"
                  />
                  <span className="text-slate-400">/ {totalPages}</span>
                </form>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-14 text-slate-500 gap-2.5">
            <div className="w-7 h-7 border-2 border-[#006398] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-mono font-semibold">Querying SAP S/4HANA OData GasTest records...</span>
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="text-center p-14 space-y-2">
            <span className="material-symbols-outlined text-[38px] text-slate-300">air</span>
            <p className="text-sm font-semibold text-slate-700">No atmospheric test logs match your filter</p>
            <p className="text-xs text-slate-400">Try adjusting your search query or record a new gas test.</p>
          </div>
        ) : viewMode === 'GROUPED' ? (
          /* Streamlined Space-Optimized Permit Cards Accordion */
          <div className="p-3.5 space-y-3 bg-slate-50/60">
            {displayedGroupedPermits.length === 0 ? (
              <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 space-y-2">
                <span className="material-symbols-outlined text-[32px] text-slate-300">filter_alt_off</span>
                <p className="text-xs font-semibold text-slate-700">No permit groups match the "{permitStatusFilter}" status</p>
                <button
                  type="button"
                  onClick={() => setPermitStatusFilter('ALL')}
                  className="text-xs font-semibold text-[#006398] hover:underline"
                >
                  View All Permits ({permitCounts.logged})
                </button>
              </div>
            ) : (
              paginatedGroupedPermits.map((group) => {
                const isExpanded = expandedGroups[group.permitKey] !== false;

                // Specialized Card for pending initial test
                if (group.isPendingInitialTest) {
                  const permitData = group.permitInfo;
                  return (
                    <div
                      key={`permit-card-${group.permitKey}`}
                      className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden ${
                        isExpanded ? 'shadow-xs border-amber-300 ring-1 ring-amber-200/40' : 'border-amber-200 hover:border-amber-300'
                      }`}
                    >
                      {/* Compact Header */}
                      <div
                        onClick={() => toggleGroup(group.permitKey)}
                        className="p-3 bg-gradient-to-r from-amber-50/70 via-white to-amber-50/20 hover:bg-amber-100/30 cursor-pointer select-none transition flex flex-col md:flex-row md:items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroup(group.permitKey);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-lg bg-white border border-amber-300 text-amber-700 shadow-2xs hover:bg-amber-50 transition"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                              chevron_right
                            </span>
                          </button>

                          <div className="flex items-center gap-1 font-mono font-bold text-xs text-amber-900 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300">
                            <span>{group.permitNo}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyPermit(group.permitNo);
                              }}
                              className="text-slate-400 hover:text-slate-700 p-0.5"
                              title="Copy Permit"
                            >
                              <span className="material-symbols-outlined text-[13px]">
                                {copiedPermit === group.permitNo ? 'check' : 'content_copy'}
                              </span>
                            </button>
                          </div>

                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            INTD · Gas Clearance Mandatory
                          </span>

                          {permitData?.PermitType && (
                            <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {permitData.PermitType}
                            </span>
                          )}

                          {(permitData?.AreaLoc || group.latestTest?.TestLocation) && (
                            <span className="text-[11px] text-slate-600 truncate max-w-xs flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-[13px] text-slate-400">location_on</span>
                              <span>{permitData?.AreaLoc || group.latestTest?.TestLocation}</span>
                            </span>
                          )}
                        </div>

                        {/* Right: CTA Button */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartInitialTest(permitData || { Permit_No: group.permitNo, AreaLoc: group.latestTest?.TestLocation });
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition"
                          >
                            <span className="material-symbols-outlined text-[15px]">detector_smoke</span>
                            <span>Record Test #1</span>
                          </button>
                        </div>
                      </div>

                      {/* Expanded View */}
                      {isExpanded && (
                        <div className="p-3 border-t border-amber-200/60 bg-amber-50/20 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-800">{permitData?.JobDesc || 'Job description awaiting gas testing.'}</span>
                            <span className="ml-2 font-mono text-[11px] text-slate-500">
                              Plant: {permitData?.Werks || '—'} · Dept: {permitData?.ExecDept || '—'} · Freq: {permitData?.GasTestFreqHr || '2'}h
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleStartInitialTest(permitData || { Permit_No: group.permitNo, AreaLoc: group.latestTest?.TestLocation })}
                            className="px-3 py-1 bg-[#006398] text-white rounded-lg font-semibold hover:bg-[#004e78] text-xs transition"
                          >
                            Open Test Form (Seq #1)
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                // Normal Completed Permit Group
                const latest = group.latestTest!;
                const latestAssessment = group.latestAssessment!;
                const nextSeq = String((parseInt(latest.TestSeq, 10) || 0) + 1);
                const chronologicalTests = [...group.tests].sort(
                  (a, b) => (parseInt(a.TestSeq, 10) || 0) - (parseInt(b.TestSeq, 10) || 0)
                );

                return (
                  <div
                    key={`permit-card-${group.permitKey}`}
                    className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden ${
                      isExpanded ? 'shadow-xs border-slate-300' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Compact Card Header */}
                    <div
                      onClick={() => toggleGroup(group.permitKey)}
                      className="p-3 bg-gradient-to-r from-slate-50/70 via-white to-slate-50/40 hover:bg-slate-100/40 cursor-pointer select-none transition space-y-2"
                    >
                      {/* Row 1: Permit details + Clearance Status badge + Action buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        {/* Left Info */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroup(group.permitKey);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-lg bg-white border border-slate-300 text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                              chevron_right
                            </span>
                          </button>

                          {group.permitNo ? (
                            <div className="flex items-center gap-1 font-mono font-bold text-xs text-[#006398] bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                              <span>{group.permitNo}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyPermit(group.permitNo);
                                }}
                                className="text-slate-400 hover:text-slate-700 p-0.5"
                                title="Copy Permit Number"
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  {copiedPermit === group.permitNo ? 'check' : 'content_copy'}
                                </span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono">
                              FACILITY CLEARANCE
                            </span>
                          )}

                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100/80 text-[#006398] border border-blue-200">
                            {group.totalCount} {group.totalCount === 1 ? 'Test' : 'Tests'}
                          </span>

                          {latest.TestLocation && (
                            <span className="text-[11px] text-slate-600 truncate max-w-xs flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-[13px] text-slate-400">location_on</span>
                              <span>{latest.TestLocation}</span>
                            </span>
                          )}
                        </div>

                        {/* Right: Status Pill & Retest Button */}
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 font-bold text-[11px] px-2.5 py-1 rounded-lg border uppercase tracking-wider ${
                              latestAssessment.overallStatus === 'SAFE'
                                ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300'
                                : latestAssessment.overallStatus === 'WARNING'
                                ? 'bg-amber-100/80 text-amber-800 border-amber-300'
                                : 'bg-rose-100/80 text-rose-800 border-rose-300 animate-pulse'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {latestAssessment.overallStatus === 'SAFE'
                                ? 'verified'
                                : latestAssessment.overallStatus === 'WARNING'
                                ? 'warning'
                                : 'dangerous'}
                            </span>
                            <span>Seq #{latest.TestSeq} · {latestAssessment.overallStatus === 'SAFE' ? 'Cleared' : latestAssessment.overallStatus === 'WARNING' ? 'Caution' : 'Inhibited'}</span>
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetestClick(latest);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-[#006398] text-white hover:bg-[#004f7a] shadow-xs transition"
                            title={`Log Retest (Seq #${nextSeq})`}
                          >
                            <span className="material-symbols-outlined text-[14px]">add_circle</span>
                            <span>+ Retest (Seq #{nextSeq})</span>
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Compact 4-Gas Readings Meter & Journey Timeline */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        {/* 4 Gases Strip */}
                        <div className="grid grid-cols-4 gap-2 flex-1 max-w-2xl text-[11px]">
                          <div className={`px-2 py-1 rounded-lg border flex items-center justify-between font-mono ${latestAssessment.o2.badgeClass}`}>
                            <span className="text-[10px] text-slate-500 font-sans font-semibold">O₂:</span>
                            <span className="font-bold">{Number(latest.O2Pct).toFixed(1)}%</span>
                          </div>

                          <div className={`px-2 py-1 rounded-lg border flex items-center justify-between font-mono ${latestAssessment.lel.badgeClass}`}>
                            <span className="text-[10px] text-slate-500 font-sans font-semibold">LEL:</span>
                            <span className="font-bold">{Number(latest.LelPct).toFixed(1)}%</span>
                          </div>

                          <div className={`px-2 py-1 rounded-lg border flex items-center justify-between font-mono ${latestAssessment.co.badgeClass}`}>
                            <span className="text-[10px] text-slate-500 font-sans font-semibold">CO:</span>
                            <span className="font-bold">{Number(latest.CoVal).toFixed(0)} ppm</span>
                          </div>

                          <div className={`px-2 py-1 rounded-lg border flex items-center justify-between font-mono ${latestAssessment.h2s.badgeClass}`}>
                            <span className="text-[10px] text-slate-500 font-sans font-semibold">H₂S:</span>
                            <span className="font-bold">{Number(latest.H2sVal).toFixed(1)} ppm</span>
                          </div>
                        </div>

                        {/* Sequence Breadcrumb */}
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 flex-wrap">
                          <span className="text-slate-400">Journey:</span>
                          {chronologicalTests.map((t, stepIdx) => (
                            <React.Fragment key={`step-${t.TestSeq}-${stepIdx}`}>
                              {stepIdx > 0 && <span className="text-slate-300">→</span>}
                              <span className={`px-1.5 py-0.2 rounded border ${
                                t.TestSeq === latest.TestSeq
                                  ? 'bg-[#006398] text-white border-[#006398] font-bold'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                #{t.TestSeq}
                              </span>
                            </React.Fragment>
                          ))}
                          <span className="text-slate-400 ml-1">·</span>
                          <span className="text-slate-600">{latest.TestDate} {latest.TestTime?.slice(0, 5)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Body: Expanded Historical Table */}
                    {isExpanded && (
                      <div className="overflow-x-auto border-t border-slate-200">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50/90 text-slate-600 border-b border-slate-200 font-mono text-[10px] uppercase">
                              <th className="py-2.5 px-3">Seq &amp; Level</th>
                              <th className="py-2.5 px-3">Date &amp; Time (IST)</th>
                              <th className="py-2.5 px-3 text-center">Oxygen (O₂)</th>
                              <th className="py-2.5 px-3 text-center">Combustible (% LEL)</th>
                              <th className="py-2.5 px-3 text-center">CO (ppm)</th>
                              <th className="py-2.5 px-3 text-center">H₂S (ppm)</th>
                              <th className="py-2.5 px-3 text-center">Status</th>
                              <th className="py-2.5 px-3">Detector &amp; Bump</th>
                              <th className="py-2.5 px-3">Tester &amp; Cert</th>
                              <th className="py-2.5 px-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-sans">
                            {group.tests.map((test, idx) => {
                              const assessment = gasTesterApi.evaluateAtmosphere(test);
                              const isLatest = idx === 0;

                              return (
                                <tr
                                  key={`${test.PermitNo}-${test.TestSeq}-${idx}`}
                                  className={`transition-colors ${
                                    isLatest ? 'bg-sky-50/20 hover:bg-sky-50/40' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  {/* Seq & Level */}
                                  <td className="py-2.5 px-3 font-mono">
                                    <div className="flex items-center gap-1">
                                      <span className="font-bold text-slate-800">Seq #{test.TestSeq}</span>
                                      {isLatest && (
                                        <span className="text-[9px] font-bold px-1 rounded bg-blue-100 text-[#006398]">
                                          Latest
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      {test.SampleLevel || 'MID'} · {test.TestType || 'INITIAL'}
                                    </div>
                                  </td>

                                  {/* Date & Time */}
                                  <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                                    <div>{test.TestDate || '—'}</div>
                                    <div className="text-slate-400 text-[10px]">{test.TestTime || '—'}</div>
                                  </td>

                                  {/* O2 */}
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full border text-[11px] ${assessment.o2.badgeClass}`}>
                                      {Number(test.O2Pct).toFixed(1)}%
                                    </span>
                                  </td>

                                  {/* LEL */}
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full border text-[11px] ${assessment.lel.badgeClass}`}>
                                      {Number(test.LelPct).toFixed(1)}%
                                    </span>
                                  </td>

                                  {/* CO */}
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full border text-[11px] ${assessment.co.badgeClass}`}>
                                      {Number(test.CoVal).toFixed(1)}
                                    </span>
                                  </td>

                                  {/* H2S */}
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full border text-[11px] ${assessment.h2s.badgeClass}`}>
                                      {Number(test.H2sVal).toFixed(1)}
                                    </span>
                                  </td>

                                  {/* Status */}
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded border uppercase ${
                                      assessment.overallStatus === 'SAFE'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : assessment.overallStatus === 'WARNING'
                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                        : 'bg-rose-100 text-rose-800 border-rose-300'
                                    }`}>
                                      {assessment.overallStatus === 'SAFE' ? 'Cleared' : assessment.overallStatus === 'WARNING' ? 'Caution' : 'Inhibited'}
                                    </span>
                                  </td>

                                  {/* Detector & Bump */}
                                  <td className="py-2.5 px-3 font-mono text-[11px]">
                                    <div className="font-semibold text-slate-700">{test.MeterId || '—'}</div>
                                    <div className={`text-[10px] ${test.BumpTestOk === 'Y' ? 'text-emerald-600 font-bold' : 'text-rose-600'}`}>
                                      {test.BumpTestOk === 'Y' ? '✓ Bump OK' : '✗ Bump Fail'}
                                    </div>
                                  </td>

                                  {/* Tester & Cert */}
                                  <td className="py-2.5 px-3 text-[11px]">
                                    <div className="font-semibold text-slate-800">{test.TestedBy || '—'}</div>
                                    <div className="text-[10px] font-mono text-slate-400">{test.Cert || 'Cert Pending'}</div>
                                  </td>

                                  {/* Actions */}
                                  <td className="py-2.5 px-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedRecord(test)}
                                      className="p-1 text-slate-500 hover:text-[#006398] hover:bg-blue-50 rounded-lg transition"
                                      title="Inspect Test Certificate"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Flat Raw Log Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200 font-mono text-[10px] uppercase sticky top-0 z-10">
                  <th className="py-2.5 px-3">Permit &amp; Seq</th>
                  <th className="py-2.5 px-3">Type &amp; Level</th>
                  <th className="py-2.5 px-3">Date &amp; Time (IST)</th>
                  <th className="py-2.5 px-3 text-center">Oxygen (O₂)</th>
                  <th className="py-2.5 px-3 text-center">Combustible (% LEL)</th>
                  <th className="py-2.5 px-3 text-center">CO (ppm)</th>
                  <th className="py-2.5 px-3 text-center">H₂S (ppm)</th>
                  <th className="py-2.5 px-3 text-center">Overall Clearance</th>
                  <th className="py-2.5 px-3">Detector &amp; Bump</th>
                  <th className="py-2.5 px-3">Tester &amp; Cert</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {paginatedFilteredTests.map((test, idx) => {
                  const assessment = gasTesterApi.evaluateAtmosphere(test);

                  return (
                    <tr
                      key={`${test.PermitNo}-${test.TestSeq}-${idx}`}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      {/* Permit & Seq */}
                      <td className="py-2.5 px-3 font-mono">
                        <div className="font-bold text-[#006398]">
                          {test.PermitNo || 'FACILITY'}
                        </div>
                        <div className="text-[10px] text-slate-400">Seq #{test.TestSeq}</div>
                      </td>

                      {/* Type & Level */}
                      <td className="py-2.5 px-3 text-[11px]">
                        <span className="font-mono font-bold text-slate-700">{test.TestType || 'INITIAL'}</span>
                        <div className="text-[10px] text-slate-400">{test.SampleLevel || 'MID'}</div>
                      </td>

                      {/* Date & Time */}
                      <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                        <div>{test.TestDate || '—'}</div>
                        <div className="text-slate-400 text-[10px]">{test.TestTime || '—'}</div>
                      </td>

                      {/* O2 */}
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full border text-[11px] ${assessment.o2.badgeClass}`}>
                          {Number(test.O2Pct).toFixed(1)}%
                        </span>
                      </td>

                      {/* LEL */}
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full border text-[11px] ${assessment.lel.badgeClass}`}>
                          {Number(test.LelPct).toFixed(1)}%
                        </span>
                      </td>

                      {/* CO */}
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full border text-[11px] ${assessment.co.badgeClass}`}>
                          {Number(test.CoVal).toFixed(1)}
                        </span>
                      </td>

                      {/* H2S */}
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full border text-[11px] ${assessment.h2s.badgeClass}`}>
                          {Number(test.H2sVal).toFixed(1)}
                        </span>
                      </td>

                      {/* Clearance */}
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded border uppercase ${
                          assessment.overallStatus === 'SAFE'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : assessment.overallStatus === 'WARNING'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}>
                          {assessment.overallStatus === 'SAFE' ? 'Cleared' : assessment.overallStatus === 'WARNING' ? 'Caution' : 'Inhibited'}
                        </span>
                      </td>

                      {/* Detector & Bump */}
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        <div className="font-semibold text-slate-700">{test.MeterId || '—'}</div>
                        <div className={`text-[10px] ${test.BumpTestOk === 'Y' ? 'text-emerald-600 font-bold' : 'text-rose-600'}`}>
                          {test.BumpTestOk === 'Y' ? '✓ Bump OK' : '✗ Bump Fail'}
                        </div>
                      </td>

                      {/* Tester & Cert */}
                      <td className="py-2.5 px-3 text-[11px]">
                        <div className="font-semibold text-slate-800">{test.TestedBy || '—'}</div>
                        <div className="text-[10px] font-mono text-slate-400">{test.Cert || 'Cert Pending'}</div>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(test)}
                          className="p-1 text-slate-500 hover:text-[#006398] hover:bg-blue-50 rounded-lg transition"
                          title="Inspect Certificate"
                        >
                          <span className="material-symbols-outlined text-[16px]">visibility</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom Pagination Bar for Both Grouped and Flat Views */}
        <div className="px-4 py-3 bg-slate-50/90 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
          <div className="text-slate-500 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
            <span>
              Showing {totalItems === 0 ? 0 : (effectiveCurrentPage - 1) * pageSize + 1} - {Math.min(effectiveCurrentPage * pageSize, totalItems)} of {totalItems.toLocaleString()} &middot; Page {effectiveCurrentPage} of {totalPages}
            </span>
          </div>

          {/* Navigation Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 flex-wrap">
              {/* First Page */}
              <button
                type="button"
                onClick={() => handlePageChange(1)}
                disabled={effectiveCurrentPage === 1}
                className="p-1 sm:px-2 sm:py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold shadow-2xs transition"
                title="First Page"
              >
                <span className="material-symbols-outlined text-[16px]">first_page</span>
              </button>

              {/* Previous Page */}
              <button
                type="button"
                onClick={() => handlePageChange(effectiveCurrentPage - 1)}
                disabled={effectiveCurrentPage === 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold flex items-center gap-1 shadow-2xs transition"
                title="Previous Page"
              >
                <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                <span className="hidden sm:inline">Prev</span>
              </button>

              {/* Numbered Page Buttons with Ellipses */}
              {renderPageButtons()}

              {/* Next Page */}
              <button
                type="button"
                onClick={() => handlePageChange(effectiveCurrentPage + 1)}
                disabled={effectiveCurrentPage === totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold flex items-center gap-1 shadow-2xs transition"
                title="Next Page"
              >
                <span className="hidden sm:inline">Next</span>
                <span className="material-symbols-outlined text-[15px]">chevron_right</span>
              </button>

              {/* Last Page */}
              <button
                type="button"
                onClick={() => handlePageChange(totalPages)}
                disabled={effectiveCurrentPage === totalPages}
                className="p-1 sm:px-2 sm:py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold shadow-2xs transition"
                title="Last Page"
              >
                <span className="material-symbols-outlined text-[16px]">last_page</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. RECORD NEW GAS TEST MODAL (STREAMLINED & STRUCTURED) */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* 3. RECORD NEW GAS TEST MODAL (STREAMLINED & STRUCTURED) */}
      {/* ========================================================================= */}
      {showCreateModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCreateModal(false);
            }}
          >
            <div
              className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl max-w-3xl w-full my-auto flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-[#006398]">
                    <span className="material-symbols-outlined text-[18px]">detector_smoke</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Record Atmospheric Gas Test</h3>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Direct SAP OData V4 Deep Entity: <span className="text-[#006398] font-bold">GasTest</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
                  title="Close"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleCreateSubmit} className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
                {/* Hot Work Mode Toggle */}
                <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <span className="material-symbols-outlined text-[16px]">local_fire_department</span>
                    <span className="font-semibold text-xs">Hot Work Mode (Mandatory 0.00% LEL Requirement)</span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-amber-900 text-xs">
                    <input
                      type="checkbox"
                      checked={isHotWorkMode}
                      onChange={e => setIsHotWorkMode(e.target.checked)}
                      className="h-3.5 w-3.5 rounded text-[#006398] focus:ring-[#006398]"
                    />
                    <span>Enforce 0.0% LEL</span>
                  </label>
                </div>

                {/* Row 1: Permit #, Seq, Type */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Permit Number <span className="text-slate-400 font-normal">(or blank)</span>
                    </label>
                    <input
                      type="text"
                      value={formPermitNo}
                      onChange={e => handlePermitNoChange(e.target.value)}
                      placeholder="e.g. PTW0000018"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 font-mono font-bold uppercase focus:ring-1 focus:ring-[#006398]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Test Sequence <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formTestSeq}
                      onChange={e => setFormTestSeq(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 font-mono focus:ring-1 focus:ring-[#006398]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Test Type <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formTestType}
                      onChange={e => setFormTestType(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 font-semibold focus:ring-1 focus:ring-[#006398]"
                    >
                      <option value="INITIAL">Initial Gas Test (INITIAL)</option>
                      <option value="PERIODIC">Periodic Retest (PERIODIC)</option>
                      <option value="CONTINUOUS">Continuous Monitoring (CONTINUOUS)</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Location & Stratified Level */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Sampling Location <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Vessel V-101 Interior / Bottom Sump"
                      value={formLocation}
                      onChange={e => setFormLocation(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 focus:ring-1 focus:ring-[#006398]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Stratified Sampling Level <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'TOP', label: '▲ TOP', sub: 'Light gases' },
                        { id: 'MID', label: '◆ MID', sub: 'Breathing' },
                        { id: 'BOT', label: '▼ BOT', sub: 'Heavy gases' }
                      ].map(lvl => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setFormSampleLevel(lvl.id)}
                          className={`p-1.5 rounded-xl border text-center transition ${
                            formSampleLevel === lvl.id
                              ? 'bg-[#006398] text-white border-[#006398] font-bold shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="text-xs">{lvl.label}</div>
                          <div className="text-[9px] opacity-80">{lvl.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Gas Sensor Measurements (2-Column Dense Grid with Free Text Input) */}
                <div className="border border-slate-200 rounded-2xl p-3.5 bg-slate-50/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#006398]">sensors</span>
                      Gas Concentration Measurements &amp; Safety Limits
                    </h4>
                    <span className="text-[10px] font-mono text-slate-500">Live Indicator Evaluation</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* O2 */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Oxygen (O₂) % v/v</span>
                        <span className="text-[10px] text-slate-400 font-mono">19.5 - 23.5%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="20.9"
                          required
                          value={formO2Str}
                          onChange={e => setFormO2Str(e.target.value)}
                          className="w-24 px-2.5 py-1 rounded-lg border border-slate-200 font-mono font-bold text-sm bg-white focus:ring-1 focus:ring-[#006398]"
                        />
                        <span className={`flex-1 text-center py-1 px-1.5 rounded-lg font-bold text-[10px] border truncate ${liveFormAssessment.o2.badgeClass}`}>
                          {liveFormAssessment.o2.label}
                        </span>
                      </div>
                    </div>

                    {/* LEL */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Combustible (% LEL)</span>
                        <span className="text-[10px] text-slate-400 font-mono">Target: 0.0%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.0"
                          required
                          value={formLelStr}
                          onChange={e => setFormLelStr(e.target.value)}
                          className="w-24 px-2.5 py-1 rounded-lg border border-slate-200 font-mono font-bold text-sm bg-white focus:ring-1 focus:ring-[#006398]"
                        />
                        <span className={`flex-1 text-center py-1 px-1.5 rounded-lg font-bold text-[10px] border truncate ${liveFormAssessment.lel.badgeClass}`}>
                          {liveFormAssessment.lel.label}
                        </span>
                      </div>
                    </div>

                    {/* CO */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Carbon Monoxide (CO) ppm</span>
                        <span className="text-[10px] text-slate-400 font-mono">&lt; 25.0 ppm</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.0"
                          required
                          value={formCoStr}
                          onChange={e => setFormCoStr(e.target.value)}
                          className="w-24 px-2.5 py-1 rounded-lg border border-slate-200 font-mono font-bold text-sm bg-white focus:ring-1 focus:ring-[#006398]"
                        />
                        <span className={`flex-1 text-center py-1 px-1.5 rounded-lg font-bold text-[10px] border truncate ${liveFormAssessment.co.badgeClass}`}>
                          {liveFormAssessment.co.label}
                        </span>
                      </div>
                    </div>

                    {/* H2S */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Hydrogen Sulfide (H₂S) ppm</span>
                        <span className="text-[10px] text-slate-400 font-mono">&lt; 5.0 ppm</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.0"
                          required
                          value={formH2sStr}
                          onChange={e => setFormH2sStr(e.target.value)}
                          className="w-24 px-2.5 py-1 rounded-lg border border-slate-200 font-mono font-bold text-sm bg-white focus:ring-1 focus:ring-[#006398]"
                        />
                        <span className={`flex-1 text-center py-1 px-1.5 rounded-lg font-bold text-[10px] border truncate ${liveFormAssessment.h2s.badgeClass}`}>
                          {liveFormAssessment.h2s.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Optional Additional Toxic / Chemical Gas Target */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-slate-500">science</span>
                        <span>Additional Toxic Gas (Optional)</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">e.g. NH₃, Cl₂, SO₂, Benzene</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Gas Identifier (e.g. NH3)"
                        value={formOtherGas}
                        onChange={e => setFormOtherGas(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-xs focus:ring-1 focus:ring-[#006398]"
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Value (0.00)"
                          value={formOtherValStr}
                          onChange={e => setFormOtherValStr(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-xs focus:ring-1 focus:ring-[#006398]"
                        />
                        <select
                          value={formOtherUnit}
                          onChange={e => setFormOtherUnit(e.target.value)}
                          className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-xs font-semibold"
                        >
                          <option value="PPM">PPM</option>
                          <option value="%">%</option>
                          <option value="MG/M3">MG/M³</option>
                        </select>
                      </div>
                      {formOtherGas ? (
                        <div className="flex items-center text-[11px] font-mono font-semibold px-2.5 text-slate-700 bg-white rounded-lg border border-slate-200">
                          {formOtherGas}: {formOtherValStr || '0'} {formOtherUnit}
                        </div>
                      ) : (
                        <div className="flex items-center text-[11px] text-slate-400 italic px-2">
                          No secondary gas specified
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live Assessment Outcome Banner */}
                  <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${liveFormAssessment.bannerClass}`}>
                    <span className="material-symbols-outlined text-[20px]">
                      {liveFormAssessment.overallStatus === 'SAFE' ? 'verified_user' : 'warning'}
                    </span>
                    <div>
                      <span className="font-bold text-xs uppercase">{liveFormAssessment.summaryTitle}</span>
                      <p className="text-[11px] leading-tight mt-0.5">{liveFormAssessment.summaryMessage}</p>
                    </div>
                  </div>
                </div>

                {/* Detector & Bump Test Row */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 border border-slate-200 rounded-2xl p-3 bg-white">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Detector ID</label>
                    <input
                      type="text"
                      required
                      value={formMeterId}
                      onChange={e => setFormMeterId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Calibration Date</label>
                    <input
                      type="date"
                      value={formCalibDate}
                      onChange={e => setFormCalibDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">AGT Certificate #</label>
                    <input
                      type="text"
                      value={formCert}
                      onChange={e => setFormCert(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 font-mono"
                    />
                  </div>

                  <div className="flex flex-col justify-center">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 pt-3">
                      <input
                        type="checkbox"
                        checked={formBumpTestOk}
                        onChange={e => setFormBumpTestOk(e.target.checked)}
                        className="h-4 w-4 rounded text-[#006398] focus:ring-[#006398]"
                      />
                      <span>Bump Test Passed</span>
                    </label>
                  </div>
                </div>

                {/* Remarks & Sign-off */}
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Atmospheric Remarks (e.g. Ventilation forced air running, safe for entry)"
                    value={formRemarks}
                    onChange={e => setFormRemarks(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
                  />

                  <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900 text-xs">
                      <input
                        type="checkbox"
                        checked={formSigned}
                        onChange={e => setFormSigned(e.target.checked)}
                        className="h-4 w-4 rounded text-[#006398] focus:ring-[#006398]"
                      />
                      <span>Digital Sign-off: I certify readings were physically sampled on site</span>
                    </label>
                    <span className="text-[11px] font-mono text-[#006398] font-bold">AGT Verified</span>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || !formBumpTestOk || !formSigned}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#006398] hover:bg-[#004e78] text-white font-bold text-xs shadow-xs disabled:opacity-50 transition"
                  >
                    {isSubmitting ? (
                      <span>Submitting to SAP...</span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[15px]">send</span>
                        <span>Submit Gas Clearance</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Inspect Certificate Modal */}
      {selectedRecord &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedRecord(null);
            }}
          >
            <div
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-3.5 animate-in fade-in duration-200 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b pb-2.5">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Gas Clearance Certificate #{selectedRecord.TestSeq}
                  </h3>
                  <p className="text-xs font-mono text-[#006398]">Permit: {selectedRecord.PermitNo || 'FACILITY'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Assessment banner */}
              {(() => {
                const asmt = gasTesterApi.evaluateAtmosphere(selectedRecord);
                return (
                  <div className={`p-3 rounded-xl border space-y-0.5 ${asmt.bannerClass}`}>
                    <div className="font-bold text-xs uppercase flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">
                        {asmt.overallStatus === 'SAFE' ? 'verified' : 'warning'}
                      </span>
                      <span>{asmt.summaryTitle}</span>
                    </div>
                    <p className="text-xs leading-relaxed">{asmt.summaryMessage}</p>
                  </div>
                );
              })()}

              {/* Readings Matrix */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Oxygen (O₂)</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{selectedRecord.O2Pct}%</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Combustible (% LEL)</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{selectedRecord.LelPct}%</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Carbon Monoxide (CO)</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{selectedRecord.CoVal} ppm</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Hydrogen Sulfide (H₂S)</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{selectedRecord.H2sVal} ppm</span>
                </div>
              </div>

              {/* Additional details */}
              <dl className="grid grid-cols-2 gap-2 text-xs border-t pt-2.5 font-mono">
                <div>
                  <dt className="text-slate-400 text-[10px]">Sample Location / Level</dt>
                  <dd className="font-medium text-slate-800">
                    {selectedRecord.TestLocation || 'General Area'} ({selectedRecord.SampleLevel || 'MID'})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-[10px]">Detector ID</dt>
                  <dd className="text-slate-800 font-bold">{selectedRecord.MeterId || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-[10px]">Tester / Cert</dt>
                  <dd className="text-slate-800">
                    {selectedRecord.TestedBy} ({selectedRecord.Cert || 'AGT'})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-[10px]">Timestamp</dt>
                  <dd className="text-slate-800">
                    {selectedRecord.TestDate} {selectedRecord.TestTime}
                  </dd>
                </div>
              </dl>

              {selectedRecord.Remarks && (
                <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block text-[10px]">Remarks:</span>
                  <p className="text-slate-600 text-xs">{selectedRecord.Remarks}</p>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs"
                >
                  Close Certificate
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default GasTesterWorkspace;
