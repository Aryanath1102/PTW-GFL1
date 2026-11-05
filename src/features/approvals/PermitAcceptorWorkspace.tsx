import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { SapUser } from '../../core/auth/sapAuthContext';
import type { PermitDeepInsertResponse, PermitInfoRecord } from '../../core/types/ptw.types';
import { sitePermitApi, type PlantPermitSummary } from '../../core/api/modules/sitePermit.api';
import { permitApproverApi } from '../../core/api/modules/permitApprover.api';
import { PERMIT_CATEGORIES } from '../../core/ptw/siteProcedure';
import { toast } from '../../shared/context/ToastContext';
import { getMaxHazardRisk } from '../permits/RiskMatrix5x5Section';
import { getTimeBand } from '../../core/ptw/approvalMatrix';
import { useUserPtwRoles } from '../../shared/hooks/useUserPtwRoles';

interface PermitAcceptorWorkspaceProps {
  user: SapUser | null;
  onBack: () => void;
  initialPermitNo?: string;
}

type FilterStatus = 'PENDING_ACCEPTANCE' | 'ALL' | 'ACCEPTED' | 'REJECTED';
type DossierTab = 'clearance' | 'overview' | 'hazards' | 'gas' | 'approvals';
type MobileView = 'queue' | 'detail';

function getCategoryBadgeClass(code: string): string {
  const clean = (code || '').trim().toUpperCase();
  if (clean === 'HOT') return 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/10';
  if (clean === 'COLD') return 'bg-sky-50 text-sky-700 border-sky-200 ring-sky-500/10';
  if (clean === 'CONF' || clean === 'CSE') return 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/10';
  if (clean === 'HGHT' || clean === 'W@H' || clean === 'HEIGHT') return 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10';
  if (clean === 'ELEC') return 'bg-yellow-50 text-yellow-800 border-yellow-200 ring-yellow-500/10';
  if (clean === 'RAD' || clean === 'RADI') return 'bg-orange-50 text-orange-700 border-orange-200 ring-orange-500/10';
  if (clean === 'EXCV' || clean === 'EXCA' || clean === 'EXC') return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10';
  if (clean === 'LINE' || clean === 'LBRK' || clean === 'LNBK') return 'bg-teal-50 text-teal-700 border-teal-200 ring-teal-500/10';
  if (clean === 'RIGG' || clean === 'RIG') return 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/10';
  if (clean === 'HYPN' || clean === 'HYD_PNEU') return 'bg-cyan-50 text-cyan-700 border-cyan-200 ring-cyan-500/10';
  return 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/10';
}

export function getCategoryInfo(code: string) {
  const clean = (code || '').trim();
  const upper = clean.toUpperCase();
  const found = PERMIT_CATEGORIES.find(
    (c) =>
      c.code.toUpperCase() === upper ||
      c.sapCode.toUpperCase() === upper ||
      (c.code === 'HGHT' && (upper === 'W@H' || upper === 'HEIGHT')) ||
      (c.code === 'CONF' && upper === 'CSE') ||
      (c.code === 'LINE' && (upper === 'LBRK' || upper === 'LNBK')) ||
      (c.code === 'RIGG' && upper === 'RIG') ||
      (c.code === 'HYPN' && upper === 'HYD_PNEU') ||
      (c.code === 'EXCV' && (upper === 'EXCA' || upper === 'EXC')) ||
      (c.code === 'RAD' && upper === 'RADI')
  );
  return {
    code: clean,
    label: found?.label || clean,
    icon: found?.icon || 'description',
    desc: found?.desc || 'Permit Activity',
    badgeClass: getCategoryBadgeClass(clean)
  };
}

const PRESET_ACCEPT_COMMENTS = [
  'I have read the precautions and safety measures mentioned herein and agree to abide by the same. The safeguards have been implemented. Toolbox talk given to persons working/impacted.',
  'Site precautions verified on field. Toolbox talk conducted with contractor crew. Mandatory PPE inspected.',
  'Physical isolation verified at equipment. Atmosphere checked and work safeguards confirmed.',
  'Toolbox safety briefing completed with executing crew. Authorized to proceed under Section K.'
];

const PRESET_REJECT_REASONS = [
  'Toolbox talk could not be conducted / contractor crew not assembled',
  'Discrepancy between permit scope and actual site work conditions',
  'Physical safeguards or mandatory PPE items not available on site',
  'Positive isolation points / LOTO tags not verified at equipment boundary',
  'Gas test results or local ventilation inadequate for safe execution',
  'SIMOPS conflict with adjacent maintenance activity or adverse weather'
];

export const PermitAcceptorWorkspace: React.FC<PermitAcceptorWorkspaceProps> = ({
  user,
  onBack,
  initialPermitNo
}) => {
  const [plant, setPlant] = useState<string>(user?.plant || '1002');
  const [searchQuery, setSearchQuery] = useState<string>(initialPermitNo || '');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('PENDING_ACCEPTANCE');
  const [dossierTab, setDossierTab] = useState<DossierTab>('clearance');
  const [mobileView, setMobileView] = useState<MobileView>(initialPermitNo ? 'detail' : 'queue');

  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [sapConnected, setSapConnected] = useState<boolean>(true);
  const [detailSyncWarning, setDetailSyncWarning] = useState<string | null>(null);

  const [permits, setPermits] = useState<PermitInfoRecord[]>([]);
  const [selectedPermitNo, setSelectedPermitNo] = useState<string>(initialPermitNo || '');
  const [selectedPermit, setSelectedPermit] = useState<PermitDeepInsertResponse | null>(null);

  // Pagination & Plant Summary State
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [plantSummary, setPlantSummary] = useState<PlantPermitSummary | null>(null);

  // Acceptor Action Form State
  const [acceptComments, setAcceptComments] = useState<string>(PRESET_ACCEPT_COMMENTS[0]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [copiedPermit, setCopiedPermit] = useState<string | null>(null);

  // Section K Verification Checkboxes
  const [checkSafetyControls, setCheckSafetyControls] = useState<boolean>(true);
  const [checkTbtCompleted, setCheckTbtCompleted] = useState<boolean>(true);
  const [checkPpeVerified, setCheckPpeVerified] = useState<boolean>(true);
  const [checkCrewRoster, setCheckCrewRoster] = useState<boolean>(true);

  // Rejection Modal State
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectCustomComments, setRejectCustomComments] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll to top on view changes
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [selectedPermitNo, dossierTab, mobileView]);

  // Helper to create basic permit placeholder from summary record
  const createBasicPermitDossier = (record: PermitInfoRecord): PermitDeepInsertResponse => {
    return {
      ...(record as unknown as PermitDeepInsertResponse),
      _Worker: [],
      _PPE: [],
      _Safety: [],
      _HazardControl: [],
      _Isolation: [],
      _Approval: [],
      _ShiftRenewal: [],
      _Attachment: [],
      _AuditLog: [],
      _WorkType: [],
      _CHK: [],
      _Equipment: [],
      _NATW: []
    };
  };

  // Load Plant-wide aggregate counts for KPI cards
  const loadPlantSummary = async (targetPlant: string, signal?: AbortSignal) => {
    if (!targetPlant?.trim()) return;
    try {
      const summary = await sitePermitApi.getPlantSummary(targetPlant, signal);
      if (!signal?.aborted) {
        setPlantSummary(summary);
      }
    } catch (err) {
      console.warn('[PermitAcceptorWorkspace] Could not load plant summary:', err);
    }
  };

  // Load Permit List from SAP with pagination and server-side filtering
  const loadPermits = async (
    targetOffset = offset,
    targetStatus = filterStatus,
    targetPageSize = pageSize,
    targetSearch = searchQuery
  ) => {
    setLoadingList(true);
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let sapStatus = 'ALL';
      if (targetStatus === 'PENDING_ACCEPTANCE') sapStatus = 'APPR';
      else if (targetStatus === 'ACCEPTED') sapStatus = 'ACCEPTED';
      else if (targetStatus === 'REJECTED') sapStatus = 'REJT';

      const data = await sitePermitApi.list(
        plant,
        targetSearch,
        targetOffset,
        controller.signal,
        'ALL',
        sapStatus,
        targetPageSize
      );
      setPermits(data);
      setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : data.length);
      setOffset(targetOffset);
      setSapConnected(true);

      // Auto-select initial or first permit if none selected
      if (!selectedPermitNo && data.length > 0) {
        const preferred = data.find((p) => p.Status === 'APPR') || data[0];
        if (preferred) {
          setSelectedPermitNo(preferred.Permit_No);
          void loadPermitDetail(preferred.Permit_No, data);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setSapConnected(false);
        setPermits([]);
        setSelectedPermitNo('');
        setSelectedPermit(null);
        toast.error('Unable to fetch permit records from SAP. Please verify your VPN / network connection.', {
          title: 'SAP Connection Error'
        });
      }
    } finally {
      setLoadingList(false);
    }
  };

  // Load Specific Permit Deep Detail without blocking UI
  const loadPermitDetail = async (permitNo: string, currentList: PermitInfoRecord[] = permits) => {
    if (!permitNo?.trim()) return;

    // 1. Immediately provide basic dossier so user never sees a blank screen or stuck spinner
    const matched = currentList.find((p) => p.Permit_No === permitNo) || permits.find((p) => p.Permit_No === permitNo);
    if (matched && (!selectedPermit || selectedPermit.Permit_No !== permitNo)) {
      setSelectedPermit(createBasicPermitDossier(matched));
    }

    setLoadingDetail(true);
    setDetailSyncWarning(null);

    try {
      const detail = await sitePermitApi.read(permitNo);
      setSelectedPermit(detail);
      setSapConnected(true);

      // Fetch live approvals directly from SAP to get latest approval chain
      try {
        const liveApprovals = await permitApproverApi.getApprovals(permitNo);
        if (liveApprovals && liveApprovals.length > 0) {
          setSelectedPermit((prev) => (prev ? { ...prev, _Approval: liveApprovals } : prev));
        }
      } catch {
        // Continue with local approvals if live query fails
      }
    } catch (err: unknown) {
      setSapConnected(false);
      setDetailSyncWarning(
        'Permit details could not be loaded from SAP. Refresh before taking action.'
      );
      // Ensure we still have basic permit data if detail query failed completely
      setSelectedPermit(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    void loadPermits(0, filterStatus, pageSize, searchQuery);
    void loadPlantSummary(plant);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [plant]);

  useEffect(() => {
    if (selectedPermitNo) {
      void loadPermitDetail(selectedPermitNo);
    }
  }, [selectedPermitNo]);

  // Copy permit helper
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPermit(text);
    setTimeout(() => setCopiedPermit(null), 2000);
    toast.info(`Permit ${text} copied to clipboard`, { title: 'Copied' });
  };

  // Handle Accept Permit Submission via SAP RAP Bound Action: acceptPermit
  const handleAcceptPermit = async () => {
    if (!selectedPermit || loadingDetail || detailSyncWarning) return;

    if (!checkSafetyControls || !checkTbtCompleted || !checkPpeVerified) {
      toast.warning('Please confirm all Section K safety verification checkboxes before accepting.', {
        title: 'Safeguard Checklist Required'
      });
      return;
    }

    const finalComments = acceptComments.trim();
    if (!finalComments) {
      toast.warning('Please provide acceptance remarks or confirm toolbox briefing.', {
        title: 'Comments Required'
      });
      return;
    }

    setSubmitting(true);
    try {
      // Dedicated SAP RAP Bound Action:
      // POST /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.acceptPermit
      // Payload: { PermitNo: string, Comments: string }
      await permitApproverApi.executeAcceptPermitAction({
        permitNo: selectedPermit.Permit_No,
        comments: finalComments
      });

      toast.success(
        `Permit ${selectedPermit.Permit_No} ACCEPTED (ACCP) via SAP .acceptPermit action! Safeguards and toolbox talk confirmed.`,
        { title: 'Permit Accepted' }
      );

      // Immediate UI update
      setSelectedPermit((prev) => (prev ? { ...prev, Status: 'ACCP' } : prev));
      setPermits((prev) =>
        prev.map((p) => (p.Permit_No === selectedPermit.Permit_No ? { ...p, Status: 'ACCP' } : p))
      );

      // Reload detail and list from SAP backend
      await loadPermitDetail(selectedPermit.Permit_No);
      void loadPermits(offset, filterStatus, pageSize, searchQuery);
      void loadPlantSummary(plant);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit permit acceptance to SAP', {
        title: 'Acceptance Failed'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Reject Permit Submission via SAP RAP Bound Action: rejectAcceptor
  const handleRejectAcceptor = async () => {
    if (!selectedPermit || loadingDetail || detailSyncWarning) return;

    const finalReason = (rejectCustomComments || rejectReason).trim();
    if (!finalReason) {
      toast.warning('Please provide safety reason / justification for rejecting acceptance.', {
        title: 'Rejection Reason Required'
      });
      return;
    }

    setSubmitting(true);
    try {
      // Dedicated SAP RAP Bound Action:
      // POST /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.rejectAcceptor
      // Payload: { PermitNo: string, Reason: string }
      await permitApproverApi.executeRejectAcceptorAction({
        permitNo: selectedPermit.Permit_No,
        reason: finalReason
      });

      toast.success(
        `Permit ${selectedPermit.Permit_No} REJECTED by Acceptor via SAP .rejectAcceptor action`,
        { title: 'Permit Rejected by Acceptor' }
      );

      setShowRejectModal(false);
      setRejectReason('');
      setRejectCustomComments('');

      // Immediate UI state update
      setSelectedPermit((prev) => (prev ? { ...prev, Status: 'REJT' } : prev));
      setPermits((prev) =>
        prev.map((p) => (p.Permit_No === selectedPermit.Permit_No ? { ...p, Status: 'REJT' } : p))
      );

      // Reload detail and list from SAP backend
      await loadPermitDetail(selectedPermit.Permit_No);
      void loadPermits(offset, filterStatus, pageSize, searchQuery);
      void loadPlantSummary(plant);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject permit in SAP', {
        title: 'Acceptor Rejection Failed'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFilterChange = (newStatus: FilterStatus) => {
    setFilterStatus(newStatus);
    setOffset(0);
    void loadPermits(0, newStatus, pageSize, searchQuery);
  };

  // Current page permits (already filtered and paginated server-side by SAP OData)
  const filteredPermits = permits;

  // Counts for KPI Strip (Plant-wide summary from SAP with fallback)
  const pendingCount = useMemo(() => {
    if (plantSummary?.approved !== undefined) return plantSummary.approved;
    return permits.filter((p) => p.Status === 'APPR').length;
  }, [plantSummary, permits]);

  const acceptedCount = useMemo(() => {
    if (plantSummary) {
      return (plantSummary.accepted || 0) + (plantSummary.active || 0);
    }
    return permits.filter((p) => p.Status === 'ACCP' || p.Status === 'ISSU' || p.Status === 'ACTV').length;
  }, [plantSummary, permits]);

  const rejectedCount = useMemo(() => {
    if (plantSummary?.rejected !== undefined) return plantSummary.rejected;
    return permits.filter((p) => p.Status === 'REJT' || p.Status === 'CANC').length;
  }, [plantSummary, permits]);

  const totalPlantCount = useMemo(() => {
    if (plantSummary?.total !== undefined) return plantSummary.total;
    return totalCount > 0 ? totalCount : permits.length;
  }, [plantSummary, totalCount, permits]);

  // Risk info
  const riskInfo = useMemo(() => {
    return getMaxHazardRisk(selectedPermit?._HazardControl);
  }, [selectedPermit]);

  const isPermitRejected = useMemo(() => {
    if (!selectedPermit) return false;
    return (
      selectedPermit.Status === 'REJT' ||
      selectedPermit.Status === 'REJC' ||
      selectedPermit.Status === 'CANC'
    );
  }, [selectedPermit]);

  const isPermitAccepted = useMemo(() => {
    if (!selectedPermit) return false;
    return (
      selectedPermit.Status === 'ACCP' ||
      selectedPermit.Status === 'ISSU' ||
      selectedPermit.Status === 'ACTV' ||
      selectedPermit.Status === 'CLSD'
    );
  }, [selectedPermit]);

  const isReadyForAcceptance = useMemo(() => {
    if (!selectedPermit) return false;
    return selectedPermit.Status === 'APPR';
  }, [selectedPermit]);

  const categoryInfo = useMemo(() => {
    return getCategoryInfo(selectedPermit?.PermitType || '');
  }, [selectedPermit?.PermitType]);

  const permitTimeBand = useMemo(() => {
    return getTimeBand(selectedPermit?.ValidFromT || new Date());
  }, [selectedPermit?.ValidFromT]);

  // User authorization evaluation strictly from SAP /UserRole entity set
  const {
    roles: userRoles,
    displayRoles: userDisplayRoles,
    isLoadingRoles,
    isUserAdmin,
    hasAcceptorRole: hasAcceptorAuthorization,
    refreshRoles
  } = useUserPtwRoles(user);

  // Checklist counts
  const checkedCount = [checkSafetyControls, checkTbtCompleted, checkPpeVerified, checkCrewRoster].filter(Boolean).length;
  const isChecklistComplete = checkedCount === 4;

  // Dynamic Readiness Evaluation
  const acceptorReadiness = useMemo(() => {
    if (!selectedPermit) return null;

    const isApprComplete =
      selectedPermit.Status === 'APPR' ||
      selectedPermit.Status === 'ACCP' ||
      selectedPermit.Status === 'ISSU' ||
      selectedPermit.Status === 'ACTV';
    const isPendingApprover = selectedPermit.Status === 'CRTD' || !selectedPermit.Status;

    // Check gas if required
    const isGasReq =
      selectedPermit.PermitType === 'HOT' ||
      selectedPermit.PermitType === 'CONF' ||
      selectedPermit.PermitType === 'CSE' ||
      Boolean(selectedPermit.GasTestFreqHr && Number(selectedPermit.GasTestFreqHr) > 0);

    const gasTests = selectedPermit._GasTest || [];
    const hasGas = gasTests.length > 0;
    const latestGas = hasGas ? gasTests[gasTests.length - 1] : null;
    const isGasSafe =
      !isGasReq ||
      (hasGas &&
        Number(latestGas?.O2Pct || 0) >= 19.5 &&
        Number(latestGas?.O2Pct || 0) <= 23.5 &&
        Number(latestGas?.LelPct || 0) <= 5.0);

    return {
      isApprComplete,
      isPendingApprover,
      isGasReq,
      hasGas,
      isGasSafe,
      isChecklistComplete,
      canAccept: isReadyForAcceptance && isChecklistComplete && hasAcceptorAuthorization && isGasSafe,
      items: [
        {
          id: 'approvals',
          label: 'Managerial Approvals',
          status: isPermitRejected ? 'FAILED' : isApprComplete ? 'READY' : 'PENDING',
          message: isPermitRejected
            ? 'Permit was REJECTED during approval review.'
            : isApprComplete
            ? 'Permit is fully approved (Status: APPR). Authorized for field acceptance.'
            : 'Managerial approvals are incomplete (Status: CRTD). Approvers must sign off first.'
        },
        {
          id: 'checklist',
          label: 'Section K Site Safeguards',
          status: isChecklistComplete ? 'READY' : 'PENDING',
          message: isChecklistComplete
            ? 'All 4 on-site verification safeguards confirmed.'
            : `${4 - checkedCount} of 4 site verification checkboxes pending confirmation.`
        },
        {
          id: 'gas',
          label: 'Atmospheric Gas Testing',
          status: !isGasReq ? 'NOT_APPLICABLE' : isGasSafe ? 'READY' : !hasGas ? 'PENDING' : 'FAILED',
          message: !isGasReq
            ? 'Atmospheric testing is not mandated for this category.'
            : !hasGas
            ? 'Initial Gas Test (Seq #1) has not been recorded yet.'
            : isGasSafe
            ? 'Atmospheric readings confirmed within safe limits.'
            : 'Atmospheric readings exceed permissible limits.'
        },
        {
          id: 'role',
          label: 'Acceptor Role Authorization',
          status: hasAcceptorAuthorization ? 'READY' : 'UNAUTHORIZED',
          message: hasAcceptorAuthorization
            ? `Authorized as ${isUserAdmin ? 'Administrator' : 'Permit Acceptor'}.`
            : `User (${user?.id || 'Unknown'}) does not have Permit Acceptor (PTW_ACCP) role.`
        }
      ]
    };
  }, [selectedPermit, isReadyForAcceptance, isPermitRejected, isChecklistComplete, checkedCount, hasAcceptorAuthorization, isUserAdmin, user?.id]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* 1. Header Command Strip - Full Fluid Width */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs">
        <div className="w-full max-w-[1780px] 2xl:max-w-[1920px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center justify-center border border-slate-200 shadow-2xs"
              title="Return to Launchpad"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20">
                <span className="material-symbols-outlined text-[24px]">verified_user</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black tracking-tight text-slate-900 leading-tight">
                    Permit Acceptor Workspace
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                    Section K Clearance
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Toolbox Talk, Site Safeguards &amp; Operational Acceptance (SAP .acceptPermit / .rejectAcceptor)
                </p>
              </div>
            </div>
          </div>

          {/* Plant Selector, SAP Connection Status & Reload */}
          <div className="flex items-center gap-2.5 self-end md:self-auto">
            {/* SAP Connection Pill */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                sapConnected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  sapConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="font-mono text-[11px]">
                {sapConnected ? 'SAP Gateway: Connected' : 'SAP: Offline / VPN Req'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono">
              <span className="material-symbols-outlined text-[16px] text-slate-400">factory</span>
              <span className="font-bold text-slate-700">Plant:</span>
              <select
                value={plant}
                onChange={(e) => setPlant(e.target.value)}
                className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
              >
                <option value="1002">1002 - Dahej Site</option>
                <option value="1001">1001 - Head Office</option>
                <option value="1003">1003 - Ranjitnagar</option>
              </select>
            </div>

            <button
              type="button"
              disabled={loadingList}
              onClick={() => void loadPermits()}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition active:scale-95 disabled:opacity-50 flex items-center justify-center"
              title="Refresh SAP Queue"
            >
              <span className={`material-symbols-outlined text-[18px] ${loadingList ? 'animate-spin' : ''}`}>
                refresh
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Operational KPI Strip - Wide Fluid Grid */}
      <section className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="w-full max-w-[1780px] 2xl:max-w-[1920px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div
            onClick={() => handleFilterChange('PENDING_ACCEPTANCE')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              filterStatus === 'PENDING_ACCEPTANCE'
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/25 shadow-xs'
                : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Awaiting Acceptance
              </span>
              <span className="material-symbols-outlined text-[20px] text-amber-600">pending_actions</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-900">{pendingCount}</span>
              <span className="text-[10px] font-mono text-amber-700 font-bold bg-amber-100/80 px-1.5 py-0.5 rounded">
                Status: APPR
              </span>
            </div>
          </div>

          <div
            onClick={() => handleFilterChange('ACCEPTED')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              filterStatus === 'ACCEPTED'
                ? 'bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-400/25 shadow-xs'
                : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Accepted (ACCP) / Active
              </span>
              <span className="material-symbols-outlined text-[20px] text-emerald-600">task_alt</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-900">{acceptedCount}</span>
              <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-100/80 px-1.5 py-0.5 rounded">
                Status: ACCP
              </span>
            </div>
          </div>

          <div
            onClick={() => handleFilterChange('REJECTED')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              filterStatus === 'REJECTED'
                ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-400/25 shadow-xs'
                : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Rejected
              </span>
              <span className="material-symbols-outlined text-[20px] text-rose-600">cancel</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-900">{rejectedCount}</span>
              <span className="text-[10px] font-mono text-rose-700 font-bold bg-rose-100/80 px-1.5 py-0.5 rounded">
                REJT / CANC
              </span>
            </div>
          </div>

          <div
            onClick={() => handleFilterChange('ALL')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              filterStatus === 'ALL'
                ? 'bg-[#006398]/10 border-[#006398] ring-2 ring-[#006398]/20 shadow-xs'
                : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Total Permits
              </span>
              <span className="material-symbols-outlined text-[20px] text-[#006398]">folder_open</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-900">{totalPlantCount}</span>
              <span className="text-[10px] text-slate-500 font-medium">Live Register</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Main Workspace - Responsive Balanced Fluid 12-Column Grid */}
      <main className="w-full max-w-[1780px] 2xl:max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Permit Filter & Queue List */}
        <section
          className={`lg:col-span-4 xl:col-span-3 2xl:col-span-3 space-y-3.5 ${
            mobileView === 'detail' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Search & Filter Bar */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search permit #, scope, supervisor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setOffset(0);
                    void loadPermits(0, filterStatus, pageSize, searchQuery);
                  }
                }}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium placeholder:text-slate-400 focus:bg-white focus:border-teal-600 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setOffset(0);
                    void loadPermits(0, filterStatus, pageSize, '');
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-semibold text-slate-600">
              {(
                [
                  ['PENDING_ACCEPTANCE', `Awaiting (${pendingCount})`],
                  ['ACCEPTED', `Accepted (${acceptedCount})`],
                  ['ALL', `All (${totalPlantCount})`]
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleFilterChange(key)}
                  className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
                    filterStatus === key
                      ? 'bg-teal-700 text-white shadow-2xs font-bold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Permit Queue Card List */}
          <div className="space-y-2.5 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
            {loadingList ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs flex flex-col items-center gap-2">
                <span className="material-symbols-outlined animate-spin text-[24px] text-teal-600">
                  progress_activity
                </span>
                <span>Querying SAP OData V4 permits...</span>
              </div>
            ) : filteredPermits.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs space-y-1">
                <span className="material-symbols-outlined text-[28px] text-slate-400">filter_alt_off</span>
                <p className="font-bold">No permits found</p>
                <p className="text-[11px] text-slate-400">
                  {filterStatus === 'PENDING_ACCEPTANCE'
                    ? 'No permits currently in APPR status awaiting acceptor sign-off.'
                    : 'Try clearing the search query or changing filter.'}
                </p>
              </div>
            ) : (
              filteredPermits.map((item) => {
                const isSelected = selectedPermitNo === item.Permit_No;
                const cat = getCategoryInfo(item.PermitType);
                return (
                  <div
                    key={item.Permit_No}
                    onClick={() => {
                      setSelectedPermitNo(item.Permit_No);
                      setMobileView('detail');
                    }}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-teal-50/70 border-teal-500 ring-2 ring-teal-500/20 shadow-xs'
                        : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-slate-900">
                          {item.Permit_No}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${cat.badgeClass}`}
                        >
                          {cat.code}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                          item.Status === 'APPR'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : item.Status === 'ACCP'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : item.Status === 'ISSU' || item.Status === 'ACTV'
                            ? 'bg-teal-100 text-teal-800 border-teal-300'
                            : item.Status === 'REJT' || item.Status === 'CANC'
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {item.Status === 'APPR' ? 'READY: APPR' : item.Status === 'ACCP' ? 'ACCEPTED: ACCP' : item.Status}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-relaxed">
                      {item.JobDesc || 'Standard maintenance activity'}
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Area: {item.AreaLoc || '—'}</span>
                      <span>Resp: {item.SupvName || item.PersonResp || '—'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="p-3 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap text-slate-600 font-mono">
                <span className="text-[11px]">
                  Showing <span className="font-bold text-slate-900">{totalCount === 0 ? 0 : offset + 1}</span>–
                  <span className="font-bold text-slate-900">{Math.min(offset + permits.length, totalCount)}</span> of{' '}
                  <span className="font-bold text-teal-700">{totalCount}</span>
                </span>

                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-slate-400">Size:</span>
                  <select
                    value={pageSize}
                    disabled={loadingList}
                    onChange={(e) => {
                      const newSize = Number(e.target.value);
                      setPageSize(newSize);
                      void loadPermits(0, filterStatus, newSize, searchQuery);
                    }}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5 text-[11px] font-mono font-bold text-slate-700 focus:outline-none focus:border-teal-600 cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={offset === 0 || loadingList}
                    onClick={() => void loadPermits(0, filterStatus, pageSize, searchQuery)}
                    title="First Page"
                    className="p-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[15px]">first_page</span>
                  </button>

                  <button
                    type="button"
                    disabled={offset === 0 || loadingList}
                    onClick={() => void loadPermits(Math.max(0, offset - pageSize), filterStatus, pageSize, searchQuery)}
                    title="Previous Page"
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white font-medium transition cursor-pointer disabled:cursor-not-allowed flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">chevron_left</span>
                    <span className="text-[11px]">Prev</span>
                  </button>
                </div>

                <span className="text-[11px] font-mono font-semibold text-slate-600">
                  Page {Math.floor(offset / pageSize) + 1} of {Math.max(1, Math.ceil(totalCount / pageSize))}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={offset + pageSize >= totalCount || loadingList || permits.length === 0}
                    onClick={() => void loadPermits(offset + pageSize, filterStatus, pageSize, searchQuery)}
                    title="Next Page"
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white font-medium transition cursor-pointer disabled:cursor-not-allowed flex items-center gap-0.5"
                  >
                    <span className="text-[11px]">Next</span>
                    <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  </button>

                  <button
                    type="button"
                    disabled={offset + pageSize >= totalCount || loadingList || permits.length === 0}
                    onClick={() => {
                      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
                      void loadPermits((totalPages - 1) * pageSize, filterStatus, pageSize, searchQuery);
                    }}
                    title="Last Page"
                    className="p-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[15px]">last_page</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Permit Detail & Acceptor Action Panel */}
        <section
          className={`lg:col-span-8 xl:col-span-9 2xl:col-span-9 space-y-5 ${
            mobileView === 'queue' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Mobile Back to Queue Toggle */}
          <div className="lg:hidden flex items-center justify-between pb-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setMobileView('queue')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Back to Queue</span>
            </button>
            <span className="font-mono text-xs font-bold text-slate-700">{selectedPermitNo}</span>
          </div>

          {!selectedPermit ? (
            <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 space-y-3">
              <span className="material-symbols-outlined text-[54px] text-slate-300">verified_user</span>
              <p className="font-bold text-base text-slate-700">Select a permit from the queue</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Choose a permit on the left to review scope, verify site safeguards, and execute Section K acceptance.
              </p>
            </div>
          ) : (
            <>
              {/* Optional Degraded Sync Warning Banner */}
              {detailSyncWarning && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-600 text-[18px]">cloud_off</span>
                    <span>{detailSyncWarning}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadPermitDetail(selectedPermit.Permit_No)}
                    className="px-3 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold font-mono text-[11px] transition shrink-0"
                  >
                    Retry Live Load
                  </button>
                </div>
              )}

              {/* Dossier Header Card */}
              <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-black text-2xl text-teal-800">
                      {selectedPermit.Permit_No}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedPermit.Permit_No)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
                      title="Copy Permit Number"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {copiedPermit === selectedPermit.Permit_No ? 'check' : 'content_copy'}
                      </span>
                    </button>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${categoryInfo.badgeClass}`}
                    >
                      {categoryInfo.label} ({categoryInfo.code})
                    </span>
                    {loadingDetail && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-mono">
                        <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                        <span>Syncing live SAP details...</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                        selectedPermit.Status === 'APPR'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : selectedPermit.Status === 'ACCP'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : selectedPermit.Status === 'ISSU' || selectedPermit.Status === 'ACTV'
                          ? 'bg-teal-50 text-teal-800 border-teal-300'
                          : selectedPermit.Status === 'REJT' || selectedPermit.Status === 'CANC'
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : 'bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      Status: {selectedPermit.Status}
                    </span>
                  </div>
                </div>

                {/* Job Description Banner */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    Job Description &amp; Technical Scope:
                  </span>
                  <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                    {selectedPermit.JobDesc || 'No job description provided'}
                  </p>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] font-mono text-slate-400 block">Plant / Area:</span>
                    <span className="font-bold text-slate-800">{selectedPermit.Werks} / {selectedPermit.AreaLoc || '—'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] font-mono text-slate-400 block">Supervisor:</span>
                    <span className="font-bold text-slate-800">{selectedPermit.SupvName || selectedPermit.PersonResp || '—'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] font-mono text-slate-400 block">Shift / Band:</span>
                    <span className="font-bold text-slate-800">{selectedPermit.Shift || 'GENERAL'} ({permitTimeBand.shortLabel})</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] font-mono text-slate-400 block">Validity Window:</span>
                    <span className="font-bold text-slate-800 font-mono text-[11px]">
                      {selectedPermit.ValidFromD || '—'} → {selectedPermit.ValidToD || '—'}
                    </span>
                  </div>
                </div>

                {/* Dossier Tabs Navigation */}
                <div className="flex items-center gap-1.5 border-b border-slate-100 pt-2 text-xs font-semibold overflow-x-auto">
                  {(
                    [
                      ['clearance', 'Section K: Clearance', 'verified'],
                      ['overview', 'Scope & Crew', 'group'],
                      ['hazards', 'Hazards & 5×5 Risk', 'warning'],
                      ['gas', 'Atmospheric Gas Test', 'science'],
                      ['approvals', 'Approval Chain', 'history_edu']
                    ] as const
                  ).map(([tabKey, tabLabel, tabIcon]) => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => setDossierTab(tabKey)}
                      className={`px-3.5 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
                        dossierTab === tabKey
                          ? 'border-teal-600 text-teal-800 font-bold'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">{tabIcon}</span>
                      <span>{tabLabel}</span>
                    </button>
                  ))}
                </div>

                {/* Tab 1: Section K Clearance (Primary Workspace for Acceptor) */}
                {dossierTab === 'clearance' && (
                  <div className="space-y-4 pt-1">
                    {/* Status Alert Banner */}
                    <div
                      className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                        isPermitRejected
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : isPermitAccepted
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : isReadyForAcceptance
                          ? 'bg-teal-50 border-teal-200 text-teal-950'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[24px]">
                          {isPermitRejected ? 'cancel' : isPermitAccepted ? 'task_alt' : 'fact_check'}
                        </span>
                        <div>
                          <p className="font-bold text-xs uppercase tracking-wide">
                            {isPermitRejected
                              ? 'Permit Status: Rejected'
                              : isPermitAccepted
                              ? `Permit Status: ${selectedPermit.Status === 'ACCP' ? 'Accepted (ACCP)' : 'Active (ACTV)'}`
                              : isReadyForAcceptance
                              ? 'Permit Status: Approved (APPR) — Ready for Acceptor Sign-off'
                              : `Permit Status: ${selectedPermit.Status} — Awaiting Approver Clearance`}
                          </p>
                          <p className="text-[11px] opacity-80">
                            {isReadyForAcceptance
                              ? 'Perform Toolbox Talk, confirm safeguards below, and execute .acceptPermit to transition permit to ACCP.'
                              : isPermitAccepted
                              ? 'Operational handover complete. Permit is accepted (ACCP) and ready for Area Operator clearance.'
                              : isPermitRejected
                              ? 'Permit was rejected. Work must not proceed.'
                              : 'Permit requires Area Approver clearance (APPR) before Acceptor can take handover.'}
                          </p>
                        </div>
                      </div>

                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/80 border border-current">
                        SAP: {selectedPermit.Status}
                      </span>
                    </div>

                    {/* Section K Undertaking Statement */}
                    <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200 text-teal-950 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-xs text-teal-900">
                        <span className="material-symbols-outlined text-[18px] text-teal-700">gavel</span>
                        <span>Official Section K: Permit Acceptor Undertaking Statement</span>
                      </div>
                      <p className="text-xs leading-relaxed text-teal-900/90 italic font-medium">
                        &ldquo;I have read the precautions and safety measures mentioned herein and I agree to abide by the same. The safeguards have been implemented. Tool box talk given to persons working/impacted (refer the list of work executors).&rdquo;
                      </p>
                    </div>

                    {/* Interactive Operational Safeguard Verification Checklist */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                        Mandatory Site Verification Checklist:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <label
                          className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                            checkSafetyControls
                              ? 'bg-teal-50/50 border-teal-300 text-teal-950 font-medium'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checkSafetyControls}
                            onChange={(e) => setCheckSafetyControls(e.target.checked)}
                            className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                          />
                          <span>1. Physical Safeguards &amp; Isolations verified on field</span>
                        </label>

                        <label
                          className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                            checkTbtCompleted
                              ? 'bg-teal-50/50 border-teal-300 text-teal-950 font-medium'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checkTbtCompleted}
                            onChange={(e) => setCheckTbtCompleted(e.target.checked)}
                            className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                          />
                          <span>2. Toolbox Talk (TBT) conducted with executing crew</span>
                        </label>

                        <label
                          className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                            checkPpeVerified
                              ? 'bg-teal-50/50 border-teal-300 text-teal-950 font-medium'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checkPpeVerified}
                            onChange={(e) => setCheckPpeVerified(e.target.checked)}
                            className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                          />
                          <span>3. Mandatory PPE verified and worn by all workers</span>
                        </label>

                        <label
                          className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                            checkCrewRoster
                              ? 'bg-teal-50/50 border-teal-300 text-teal-950 font-medium'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checkCrewRoster}
                            onChange={(e) => setCheckCrewRoster(e.target.checked)}
                            className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                          />
                          <span>4. Authorized crew roster matched with site personnel</span>
                        </label>
                      </div>
                    </div>

                    {/* Safety & Prerequisite Readiness Panel */}
                    {acceptorReadiness && (
                      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[18px] text-teal-700">fact_check</span>
                            <span>Section K Field Acceptance Readiness</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              acceptorReadiness.canAccept
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}
                          >
                            {acceptorReadiness.canAccept ? 'READY FOR ACCEPTANCE' : 'ACTION / CLEARANCE REQUIRED'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {acceptorReadiness.items.map((item) => {
                            const isReady =
                              item.status === 'READY' ||
                              item.status === 'NOT_APPLICABLE' ||
                              item.status === 'COMPLETED';
                            const isFailed = item.status === 'FAILED';
                            const isUnauth = item.status === 'UNAUTHORIZED';

                            return (
                              <div
                                key={item.id}
                                className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                                  isReady
                                    ? 'bg-emerald-50/40 border-emerald-200/80 text-emerald-950'
                                    : isFailed
                                    ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                                    : isUnauth
                                    ? 'bg-purple-50/60 border-purple-200 text-purple-950'
                                    : 'bg-amber-50/60 border-amber-200 text-amber-950'
                                }`}
                              >
                                <span
                                  className={`material-symbols-outlined text-[17px] mt-0.5 shrink-0 ${
                                    isReady
                                      ? 'text-emerald-600'
                                      : isFailed
                                      ? 'text-rose-600'
                                      : isUnauth
                                      ? 'text-purple-600'
                                      : 'text-amber-600'
                                  }`}
                                >
                                  {isReady ? 'check_circle' : isFailed ? 'cancel' : isUnauth ? 'shield_lock' : 'pending'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-[11px] flex items-center justify-between">
                                    <span>{item.label}</span>
                                    <span className="font-mono text-[9px] uppercase px-1 rounded bg-white/70 border border-current/20">
                                      {item.status}
                                    </span>
                                  </div>
                                  <p className="text-[10px] leading-relaxed opacity-90 mt-0.5">{item.message}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Role Guidance Notice when user lacks acceptor role in SAP /UserRole */}
                    {!hasAcceptorAuthorization && (
                      <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 text-amber-950 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-700 text-[20px]">shield_lock</span>
                            <span className="font-bold text-xs uppercase tracking-wide">
                              Viewing in Read-Only Inspection Mode
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void refreshRoles()}
                            disabled={isLoadingRoles}
                            className="text-[11px] font-bold text-amber-900 bg-amber-200/60 hover:bg-amber-200 px-2 py-0.5 rounded-lg border border-amber-300 flex items-center gap-1 transition cursor-pointer"
                            title="Re-verify authorizations in SAP /UserRole"
                          >
                            <span className={`material-symbols-outlined text-[14px] ${isLoadingRoles ? 'animate-spin' : ''}`}>sync</span>
                            <span>{isLoadingRoles ? 'Checking...' : 'Check /UserRole'}</span>
                          </button>
                        </div>
                        <p className="text-xs text-amber-900 leading-relaxed">
                          Your current SAP account (<strong>{user?.id || 'Unknown'}</strong>) active roles in <code className="font-bold text-amber-950 bg-white/90 px-1 py-0.5 rounded border border-amber-200">SAP /UserRole</code>:{' '}
                          <code className="font-mono bg-white/80 px-1 py-0.5 rounded border border-amber-200 font-bold">
                            {userDisplayRoles.join(', ') || 'No PTW Roles Assigned'}
                          </code>
                          .
                        </p>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          Field Acceptance under Section K requires <strong>PTW_ACCP</strong> / <strong>PTW_ACCEPTOR</strong> or{' '}
                          <strong>PTW_ADMIN</strong> authorization in the SAP <code>/UserRole</code> table. You can inspect all permit documentation and checklists,
                          but field acceptance submission is restricted.
                        </p>
                      </div>
                    )}

                    {/* Approvals Pending Block Alert */}
                    {selectedPermit.Status === 'CRTD' && (
                      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-amber-700 text-[20px]">hourglass_top</span>
                          <span className="font-bold text-xs uppercase tracking-wide">
                            Awaiting Managerial Approvals (Status: CRTD)
                          </span>
                        </div>
                        <p className="text-xs text-amber-900 leading-relaxed">
                          This permit is currently under technical and safety review by authorized Approvers. Under GFL PTW procedures,{' '}
                          <strong>Section K Field Acceptance can only be executed once all required Approvers have authorized the permit (Status: APPR)</strong>.
                        </p>
                        <div className="flex items-center gap-2 pt-0.5 text-[11px] font-mono text-amber-800">
                          <span className="material-symbols-outlined text-[15px]">info</span>
                          <span>Track approval progress in the Approvals tab above.</span>
                        </div>
                      </div>
                    )}

                    {/* Digital Execution Box */}
                    {isPermitRejected ? (
                      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-2">
                        <span className="material-symbols-outlined text-[36px] text-rose-600">cancel</span>
                        <h4 className="font-bold text-rose-950 text-sm">Permit Rejected</h4>
                        <p className="text-xs text-rose-700 max-w-md mx-auto">
                          This permit has been marked as REJECTED in SAP. Field acceptance cannot be granted.
                        </p>
                      </div>
                    ) : isPermitAccepted ? (
                      <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                        <span className="material-symbols-outlined text-[36px] text-emerald-600">task_alt</span>
                        <h4 className="font-bold text-emerald-950 text-sm">
                          Permit Accepted by Acceptor ({selectedPermit.Status})
                        </h4>
                        <p className="text-xs text-emerald-700 max-w-md mx-auto">
                          This permit has been accepted under Section K (Status: {selectedPermit.Status}). It is now available in the Area Operator Workspace for pre-operational site clearance.
                        </p>
                      </div>
                    ) : (
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">
                            Acceptance Remarks (SAP Payload: <code className="font-mono text-teal-700">Comments</code>):
                          </span>
                          <span className="text-[11px] text-slate-400">Click preset chip to autofill</span>
                        </div>

                        {/* Preset Remarks Chips */}
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_ACCEPT_COMMENTS.map((chip, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setAcceptComments(chip)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white hover:bg-slate-200 border border-slate-200 text-slate-700 transition active:scale-95 text-left"
                            >
                              {chip.slice(0, 48)}...
                            </button>
                          ))}
                        </div>

                        <textarea
                          rows={3}
                          value={acceptComments}
                          onChange={(e) => setAcceptComments(e.target.value)}
                          placeholder="State toolbox talk and safety verification details..."
                          className="w-full p-3 rounded-xl border border-slate-200 focus:border-teal-600 focus:outline-none text-xs font-medium bg-white"
                        />

                        {/* Checklist Incomplete Helper Notice */}
                        {!isChecklistComplete && (
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-600 text-[18px]">rule</span>
                            <span>
                              <strong>Action Required:</strong> Check all 4 mandatory site verification items above to enable acceptance ({checkedCount}/4 verified).
                            </span>
                          </div>
                        )}

                        {/* Dual Action Execution Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <button
                            type="button"
                            disabled={
                              submitting ||
                              !isReadyForAcceptance ||
                              !isChecklistComplete ||
                              !hasAcceptorAuthorization ||
                              Boolean(acceptorReadiness && !acceptorReadiness.isGasSafe)
                            }
                            onClick={handleAcceptPermit}
                            className="py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-600/20 transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                            title={
                              !isReadyForAcceptance
                                ? `Permit is in status ${selectedPermit.Status}. Approvals must be complete (APPR) before acceptance.`
                                : !hasAcceptorAuthorization
                                ? `Permit Acceptor role required. Current roles: ${userRoles.join(', ') || 'None'}`
                                : !isChecklistComplete
                                ? `All 4 site verification checkboxes must be checked (${checkedCount}/4 confirmed)`
                                : 'Accept Permit (.acceptPermit)'
                            }
                          >
                            {submitting ? (
                              <>
                                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                <span>Submitting to SAP...</span>
                              </>
                            ) : !isReadyForAcceptance ? (
                              <>
                                <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                                <span>Awaiting Approvals ({selectedPermit.Status})</span>
                              </>
                            ) : !hasAcceptorAuthorization ? (
                              <>
                                <span className="material-symbols-outlined text-[18px]">lock</span>
                                <span>Acceptor Role Required</span>
                              </>
                            ) : !isChecklistComplete ? (
                              <>
                                <span className="material-symbols-outlined text-[18px]">rule</span>
                                <span>Checklist Incomplete ({checkedCount}/4)</span>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[18px]">verified</span>
                                <span>Accept Permit (.acceptPermit)</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={submitting || !hasAcceptorAuthorization}
                            onClick={() => setShowRejectModal(true)}
                            className="py-3 px-4 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                            title={
                              !hasAcceptorAuthorization
                                ? 'Permit Acceptor authorization required to reject permits'
                                : 'Reject Permit (.rejectAcceptor)'
                            }
                          >
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                            <span>Reject Permit (.rejectAcceptor)</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Scope & Crew */}
                {dossierTab === 'overview' && (
                  <div className="space-y-4 pt-1 text-xs">
                    {/* Authorized Crew Roster */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Authorized Crew Roster ({selectedPermit._Worker?.length || 0} Workers):
                      </span>
                      {!selectedPermit._Worker || selectedPermit._Worker.length === 0 ? (
                        <p className="p-6 bg-slate-50 rounded-2xl text-slate-400 text-center border border-slate-200/80">
                          No workers registered in crew roster.
                        </p>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono text-[10px]">
                              <tr>
                                <th className="p-2.5">Worker Name</th>
                                <th className="p-2.5">Emp ID</th>
                                <th className="p-2.5">Category</th>
                                <th className="p-2.5">Agency / Contractor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedPermit._Worker.map((w, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 font-medium">
                                  <td className="p-2.5 font-bold text-slate-900">{w.WorkerName}</td>
                                  <td className="p-2.5 font-mono text-slate-600">{w.EmpId || '—'}</td>
                                  <td className="p-2.5">
                                    <span
                                      className={`px-2 py-0.5 rounded-full font-mono text-[9px] ${
                                        w.WorkerTypeCode === 'EMP'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      {w.WorkerTypeCode === 'EMP' ? 'Company' : 'Contractor'}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-slate-600">{w.ContractorName || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 3: Hazards & 5x5 Risk */}
                {dossierTab === 'hazards' && (
                  <div className="space-y-4 pt-1 text-xs">
                    {riskInfo && (
                      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                            5×5 Risk Assessment Score
                          </span>
                          <span className="text-xl font-black font-mono text-amber-950">
                            Score: {riskInfo.score} · {riskInfo.level}
                          </span>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white text-amber-900 border border-amber-300">
                          Severity {riskInfo.s} × Likelihood {riskInfo.l}
                        </span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Identified Hazards &amp; Safeguards:
                      </span>
                      {!selectedPermit._HazardControl || selectedPermit._HazardControl.length === 0 ? (
                        <p className="p-6 bg-slate-50 rounded-2xl text-slate-400 text-center border border-slate-200/80">
                          No hazard controls specified in dossier.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {selectedPermit._HazardControl.map((h, idx) => (
                            <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                              <span className="font-bold text-slate-800 block">{h.HazardDesc || h.HazardCode}</span>
                              <p className="text-[11px] text-slate-600">{h.ControlDesc || 'Required safety control'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 4: Gas Tests */}
                {dossierTab === 'gas' && (
                  <div className="space-y-4 pt-1 text-xs">
                    {!selectedPermit._GasTest || selectedPermit._GasTest.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 text-slate-400 space-y-1">
                        <span className="material-symbols-outlined text-[32px] text-slate-300">science</span>
                        <p className="font-bold text-slate-600">No atmospheric gas test records</p>
                        <p className="text-[11px]">Gas testing may not be mandatory for this permit category.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {selectedPermit._GasTest.map((g, idx) => (
                          <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="font-bold text-slate-700">Test #{g.TestSeq || idx + 1}</span>
                              <span className="text-slate-500">{g.TestDate} {g.TestTime}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                              <div className="p-2 rounded-xl bg-white border border-slate-200">
                                <span className="text-[9px] text-slate-400 block">O2 (19.5-23.5%)</span>
                                <span className="font-bold text-slate-900">{g.O2Pct}%</span>
                              </div>
                              <div className="p-2 rounded-xl bg-white border border-slate-200">
                                <span className="text-[9px] text-slate-400 block">LEL (&lt;5%)</span>
                                <span className="font-bold text-slate-900">{g.LelPct}%</span>
                              </div>
                              <div className="p-2 rounded-xl bg-white border border-slate-200">
                                <span className="text-[9px] text-slate-400 block">CO (&lt;25ppm)</span>
                                <span className="font-bold text-slate-900">{g.CoVal} ppm</span>
                              </div>
                              <div className="p-2 rounded-xl bg-white border border-slate-200">
                                <span className="text-[9px] text-slate-400 block">H2S (&lt;10ppm)</span>
                                <span className="font-bold text-slate-900">{g.H2sVal} ppm</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 5: Approvals */}
                {dossierTab === 'approvals' && (
                  <div className="space-y-4 pt-1 text-xs">
                    {!selectedPermit._Approval || selectedPermit._Approval.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 text-slate-400 space-y-1">
                        <span className="material-symbols-outlined text-[32px] text-slate-300">history_edu</span>
                        <p className="font-bold text-slate-600">No approval history available</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {selectedPermit._Approval.map((app, idx) => (
                          <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                            <div>
                              <span className="font-bold text-slate-900 block">{app.RoleId || app.Stage}</span>
                              <span className="text-[11px] text-slate-500 font-mono">Signatory: {app.SignedBy || '—'}</span>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white border border-slate-300">
                                {app.Action === 'AP' ? 'APPROVED' : app.Action === 'RJ' ? 'REJECTED' : app.Action || 'SIGNED'}
                              </span>
                              <span className="block text-[10px] text-slate-400 font-mono mt-0.5">{app.ActionDate || '—'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {/* Rejection Modal for Acceptor */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">gavel</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Reject Permit {selectedPermitNo}
                  </h3>
                  <p className="text-xs text-slate-500">
                    SAP RAP Action: <code className="font-mono text-rose-700">.rejectAcceptor</code>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Standard Safety Reasons:
                </label>
                <div className="space-y-1.5">
                  {PRESET_REJECT_REASONS.map((r) => (
                    <label
                      key={r}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        rejectReason === r
                          ? 'bg-rose-50 border-rose-300 text-rose-950 font-bold'
                          : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="acceptorRejectionReason"
                        checked={rejectReason === r}
                        onChange={() => {
                          setRejectReason(r);
                          setRejectCustomComments(r);
                        }}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Detailed Reason (Payload: <code className="font-mono text-rose-700">Reason</code>):
                </label>
                <textarea
                  rows={3}
                  value={rejectCustomComments}
                  onChange={(e) => setRejectCustomComments(e.target.value)}
                  placeholder="Explain why field acceptance cannot be granted..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-rose-600 focus:outline-none text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || !rejectCustomComments.trim()}
                  onClick={handleRejectAcceptor}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      <span>Rejecting in SAP...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">cancel</span>
                      <span>Confirm Acceptor Rejection</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PermitAcceptorWorkspace;
