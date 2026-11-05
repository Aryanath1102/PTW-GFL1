import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { SapUser } from '../../core/auth/sapAuthContext';
import type { PermitDeepInsertResponse, PermitInfoRecord } from '../../core/types/ptw.types';
import { sitePermitApi, type PlantPermitSummary } from '../../core/api/modules/sitePermit.api';
import { permitApproverApi, getNextApprovalStep, getActiveCycleApprovals, NextApprovalStepInfo } from '../../core/api/modules/permitApprover.api';
import { PERMIT_CATEGORIES } from '../../core/ptw/siteProcedure';
import { toast } from '../../shared/context/ToastContext';
import { getMaxHazardRisk, extractHazardRisk } from '../permits/RiskMatrix5x5Section';
import { useUserPtwRoles } from '../../shared/hooks/useUserPtwRoles';

interface PermitApproverWorkspaceProps {
  user: SapUser | null;
  onBack: () => void;
  initialPermitNo?: string;
}

type FilterStatus = 'PENDING_APPROVAL' | 'ALL' | 'APPROVED' | 'REJECTED';
type DossierTab = 'overview' | 'gas' | 'hazards' | 'isolation';
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
  if (clean === 'OTHER') return 'bg-slate-100 text-slate-700 border-slate-300 ring-slate-500/10';
  return 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/10';
}

export function getCategoryInfo(code: string) {
  const clean = (code || '').trim();
  const upper = clean.toUpperCase();
  const found = PERMIT_CATEGORIES.find(c =>
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

export interface ActiveWorkTypeItem {
  seqNo: string;
  code: string;
  label: string;
  icon: string;
  desc: string;
  badgeClass: string;
  isPrimary: boolean;
}


import {
  APPROVAL_MATRIX_RULES,
  getRequiredApproversForPermit,
  getTimeBand,
  type MatrixRow
} from '../../core/ptw/approvalMatrix';

const PRESET_APPROVAL_COMMENTS = [
  'All site safety precautions verified. Approved.',
  'Atmospheric gas readings within safe limits. Approved.',
  'Isolation points verified & LOTO locks confirmed.',
  'Toolbox talk completed with contractor crew. Approved.',
  'Fire watch & standby person stationed at location.'
];

const PRESET_REJECTION_REASONS = [
  'Incomplete physical isolation / LOTO missing tags',
  'Gas test readings exceeded safe atmospheric thresholds',
  'SIMOPS conflict with adjacent maintenance activity',
  'Inadequate personal protective equipment (PPE) on site',
  'Contractor supervisor not present for handover',
  'Permit validity expired or work scope mismatch'
];

export const PermitApproverWorkspace: React.FC<PermitApproverWorkspaceProps> = ({
  user,
  onBack,
  initialPermitNo
}) => {
  const [plant, setPlant] = useState<string>(user?.plant || '1002');
  const [searchQuery, setSearchQuery] = useState<string>(initialPermitNo || '');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('PENDING_APPROVAL');
  const [mobileView, setMobileView] = useState<MobileView>(initialPermitNo ? 'detail' : 'queue');
  const [dossierTab, setDossierTab] = useState<DossierTab>('overview');

  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [permits, setPermits] = useState<PermitInfoRecord[]>([]);
  const [selectedPermitNo, setSelectedPermitNo] = useState<string>(initialPermitNo || '');
  const [selectedPermit, setSelectedPermit] = useState<PermitDeepInsertResponse | null>(null);

  // Pagination & Plant Summary State
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [plantSummary, setPlantSummary] = useState<PlantPermitSummary | null>(null);

  // Guarantee view changes (selecting permit, changing dossier tabs, switching mobile views) open at the top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [selectedPermitNo, dossierTab, mobileView]);

  // Approval Action Form State
  const [approvalComments, setApprovalComments] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [copiedPermit, setCopiedPermit] = useState<string | null>(null);

  // Rejection Modal State
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectCustomComments, setRejectCustomComments] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const [showMatrixModal, setShowMatrixModal] = useState<boolean>(false);

  // Determine time band from permit's planned schedule or current time
  const permitTimeBand = useMemo(() => {
    return getTimeBand(selectedPermit?.ValidFromT || new Date());
  }, [selectedPermit?.ValidFromT]);

  // Unified list of active work types for the selected permit (combining primary PermitType, child _WorkType, and _Safety fallbacks)
  const activeWorkTypes = useMemo<ActiveWorkTypeItem[]>(() => {
    if (!selectedPermit) return [];

    const primaryRaw = (selectedPermit.PermitType || '').trim();
    const primaryInfo = getCategoryInfo(primaryRaw);
    const seenCodes = new Set<string>();

    const items: ActiveWorkTypeItem[] = [];

    // 1. Add primary permit category first
    if (primaryRaw) {
      seenCodes.add(primaryRaw.toUpperCase());
      const cat = PERMIT_CATEGORIES.find(c => c.code === primaryRaw.toUpperCase() || c.sapCode === primaryRaw.toUpperCase());
      if (cat) {
        seenCodes.add(cat.code.toUpperCase());
        seenCodes.add(cat.sapCode.toUpperCase());
      }
      items.push({
        seqNo: '1',
        code: primaryRaw,
        label: primaryInfo.label,
        icon: primaryInfo.icon,
        desc: primaryInfo.desc,
        badgeClass: primaryInfo.badgeClass,
        isPrimary: true
      });
    }

    // 2. Add child entities from SAP _WorkType navigation table
    const rawWorkTypes = Array.isArray(selectedPermit._WorkType)
      ? selectedPermit._WorkType
      : ((selectedPermit as unknown as { _WorkType?: { results?: typeof selectedPermit._WorkType } })?._WorkType?.results || []);

    if (Array.isArray(rawWorkTypes)) {
      rawWorkTypes.forEach(wt => {
        const wtCode = (wt.WorkType || '').trim();
        if (!wtCode) return;
        const upper = wtCode.toUpperCase();
        const cat = PERMIT_CATEGORIES.find(c => c.code === upper || c.sapCode === upper);
        const canonCode = cat ? cat.code.toUpperCase() : upper;
        const canonSap = cat ? cat.sapCode.toUpperCase() : upper;

        if (seenCodes.has(canonCode) || seenCodes.has(canonSap) || seenCodes.has(upper)) {
          return;
        }

        seenCodes.add(upper);
        if (cat) {
          seenCodes.add(cat.code.toUpperCase());
          seenCodes.add(cat.sapCode.toUpperCase());
        }

        const info = getCategoryInfo(wtCode);
        items.push({
          seqNo: wt.SeqNo || String(items.length + 1),
          code: wtCode,
          label: info.label,
          icon: info.icon,
          desc: info.desc,
          badgeClass: info.badgeClass,
          isPrimary: false
        });
      });
    }

    // 3. Fallback: check _Safety TYPE entries if no additional types were found in _WorkType
    if (items.length <= 1 && Array.isArray(selectedPermit._Safety)) {
      selectedPermit._Safety
        .filter(s => s.ItemCode === 'TYPE' && (s.Remarks || s.ValueText))
        .forEach((s) => {
          const typeCode = (s.Remarks || s.ValueText || '').trim();
          if (!typeCode) return;
          const upper = typeCode.toUpperCase();
          const cat = PERMIT_CATEGORIES.find(c => c.code === upper || c.sapCode === upper);
          const canonCode = cat ? cat.code.toUpperCase() : upper;
          const canonSap = cat ? cat.sapCode.toUpperCase() : upper;

          if (seenCodes.has(canonCode) || seenCodes.has(canonSap) || seenCodes.has(upper)) {
            return;
          }

          seenCodes.add(upper);
          if (cat) {
            seenCodes.add(cat.code.toUpperCase());
            seenCodes.add(cat.sapCode.toUpperCase());
          }

          const info = getCategoryInfo(typeCode);
          items.push({
            seqNo: String(items.length + 1),
            code: typeCode,
            label: info.label,
            icon: info.icon,
            desc: info.desc,
            badgeClass: info.badgeClass,
            isPrimary: false
          });
        });
    }

    return items;
  }, [selectedPermit]);

  // Evaluate required approvers based on the Official GFL Approval Matrix
  // Accounting for multiple active work types (strictest governing policy)
  const approvalPolicy = useMemo(() => {
    if (!selectedPermit) return null;
    if (activeWorkTypes.length <= 1) {
      const base = getRequiredApproversForPermit(selectedPermit.PermitType, permitTimeBand.id);
      return { ...base, governingTypeCode: selectedPermit.PermitType };
    }

    // Evaluate all active types and find strictest
    const evaluated = activeWorkTypes.map(wt => ({
      policy: getRequiredApproversForPermit(wt.code, permitTimeBand.id),
      workType: wt
    }));

    const roleWeight = (role: string) => {
      if (role === 'PTW_APPR3') return 3;
      if (role === 'PTW_APPR2') return 2;
      if (role === 'PTW_APPR1') return 1;
      return 0;
    };

    evaluated.sort((a, b) => {
      if (b.policy.requiredRoles.length !== a.policy.requiredRoles.length) {
        return b.policy.requiredRoles.length - a.policy.requiredRoles.length;
      }
      const maxB = Math.max(0, ...b.policy.requiredRoles.map(roleWeight));
      const maxA = Math.max(0, ...a.policy.requiredRoles.map(roleWeight));
      return maxB - maxA;
    });

    const strictest = evaluated[0];
    const isAdditionalGoverning = strictest.workType.code !== selectedPermit.PermitType && strictest.policy.isApprovalRequired;

    return {
      ...strictest.policy,
      governingTypeCode: strictest.workType.code,
      policyLabel: isAdditionalGoverning
        ? `${strictest.policy.policyLabel} (Governing: ${strictest.workType.label})`
        : strictest.policy.policyLabel
    };
  }, [selectedPermit, activeWorkTypes, permitTimeBand]);

  const timeBandInfo = permitTimeBand;

  // Close matrix modal on Escape key press
  useEffect(() => {
    if (!showMatrixModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMatrixModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMatrixModal]);

  // Load Plant-wide aggregate counts for KPI cards
  const loadPlantSummary = async (targetPlant: string, signal?: AbortSignal) => {
    if (!targetPlant?.trim()) return;
    try {
      const summary = await sitePermitApi.getPlantSummary(targetPlant, signal);
      if (!signal?.aborted) {
        setPlantSummary(summary);
      }
    } catch (err) {
      console.warn('[PermitApproverWorkspace] Could not load plant summary:', err);
    }
  };

  // Load Permit List from SAP with pagination and server-side status filtering
  const loadPermits = async (
    targetOffset = offset,
    targetStatus = filterStatus,
    targetPageSize = pageSize,
    targetSearch = searchQuery
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    setLoadingList(true);

    // Map filterStatus to SAP OData filter parameter
    let sapStatus = 'ALL';
    if (targetStatus === 'PENDING_APPROVAL') sapStatus = 'CRTD';
    else if (targetStatus === 'APPROVED') sapStatus = 'APPROVED';
    else if (targetStatus === 'REJECTED') sapStatus = 'REJT';

    try {
      const list = await sitePermitApi.list(
        plant,
        targetSearch,
        targetOffset,
        abortControllerRef.current.signal,
        'ALL',
        sapStatus,
        targetPageSize
      );
      setPermits(list);
      setTotalCount(typeof list.totalCount === 'number' ? list.totalCount : list.length);
      setOffset(targetOffset);

      // Auto-select first permit if none selected or not in list
      if (list.length > 0) {
        const stillSelected = list.some(p => p.Permit_No === selectedPermitNo);
        if (!stillSelected) {
          const firstNo = list[0].Permit_No;
          setSelectedPermitNo(firstNo);
          void loadPermitDetail(firstNo);
        }
      } else {
        setSelectedPermit(null);
      }
    } catch (err) {
      if ((err as Error).name !== 'CanceledError' && (err as Error).name !== 'AbortError') {
        toast.error(err instanceof Error ? err.message : 'Failed to load permits from SAP', {
          title: 'SAP Connection Error'
        });
      }
    } finally {
      setLoadingList(false);
    }
  };

  // Load single permit deep details
  const loadPermitDetail = async (permitNo: string) => {
    if (!permitNo?.trim()) return;
    setLoadingDetail(true);
    try {
      const detail = await sitePermitApi.read(permitNo.trim());
      setSelectedPermit(detail);
      setSelectedPermitNo(detail.Permit_No);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not fetch permit dossier', {
        title: 'Permit Load Error'
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    void loadPermits(0, filterStatus, pageSize, searchQuery);
    void loadPlantSummary(plant);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [plant]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    void loadPermits(0, filterStatus, pageSize, searchQuery);
  };

  const handleCopyPermit = (pNo: string) => {
    if (!pNo) return;
    navigator.clipboard.writeText(pNo);
    setCopiedPermit(pNo);
    toast.success(`Copied permit ${pNo} to clipboard`, { title: 'Copied' });
    setTimeout(() => setCopiedPermit(null), 2000);
  };

  // Compute next approval step dynamically for the selected permit
  const nextStepInfo: NextApprovalStepInfo = useMemo(() => {
    if (!selectedPermit) {
      return {
        stage: 'APPR',
        seqNo: '1',
        roleId: 'PTW_APPR1',
        action: 'AP',
        roleTitle: 'Approver I (PTW_APPR1)',
        pendingRoleName: 'Approver I (Area In-Charge)',
        isFullyApproved: false,
        stepIndex: 1
      };
    }
    const governingType = approvalPolicy?.governingTypeCode || selectedPermit.PermitType;
    return getNextApprovalStep(
      selectedPermit._Approval,
      selectedPermit.Status,
      governingType,
      permitTimeBand.id
    );
  }, [selectedPermit, approvalPolicy, permitTimeBand]);

  // Active cycle approvals (ignoring historical rejection records from prior cycles)
  const activeApprovals = useMemo(() => {
    if (!selectedPermit) return [];
    return getActiveCycleApprovals(selectedPermit._Approval, selectedPermit.Status);
  }, [selectedPermit]);

  // Isolation Requirement Status: 'X' (or 'Y') = Required, ' ' (blank/empty) = Not Required
  const isIsolationRequired = useMemo(() => {
    if (!selectedPermit) return false;
    const isoReq = String(selectedPermit.IsolationRequired || '').trim().toUpperCase();
    const lotoReq = String(selectedPermit.LotoRequired || '').trim().toUpperCase();
    return isoReq === 'X' || isoReq === 'Y' || lotoReq === 'X' || lotoReq === 'Y';
  }, [selectedPermit]);

  // Check if current permit is in rejected state (either Status is REJT/CANC or approval record has Action RJ)
  const isPermitRejected = useMemo(() => {
    if (!selectedPermit) return false;
    const st = (selectedPermit.Status || '').trim().toUpperCase();
    if (st === 'REJT' || st === 'REJC' || st === 'REJECTED' || st === 'CANC') return true;
    if (st) return false; // If status is CRTD, APPR, etc., permit has been initiated or resubmitted
    const approvals = selectedPermit._Approval || [];
    if (approvals.length === 0) return false;
    const sorted = [...approvals].sort((a, b) => parseInt(a.SeqNo || '0', 10) - parseInt(b.SeqNo || '0', 10));
    const last = sorted[sorted.length - 1];
    return last ? (last.Action === 'RJ' || last.Action === 'REJECTED' || last.Action === 'REJT') : false;
  }, [selectedPermit]);

  const rejectionDetails = useMemo(() => {
    if (!selectedPermit || !isPermitRejected) return null;
    const rjRecord = [...(selectedPermit._Approval || [])]
      .reverse()
      .find(a => a.Action === 'RJ' || a.Action === 'REJECTED' || a.Action === 'REJT');
    if (rjRecord) {
      return {
        signedBy: rjRecord.SignedBy || user?.id || 'Safety Reviewer',
        reason: rjRecord.Comments || 'Safety precautions or prerequisites not met.',
        date: rjRecord.ActionDate || 'Live Recorded',
        time: rjRecord.ActionTime || ''
      };
    }
    return {
      signedBy: selectedPermit.Ernam || 'Safety Reviewer',
      reason: 'Permit rejected during authorization review.',
      date: selectedPermit.Erdat || 'Live Recorded',
      time: ''
    };
  }, [selectedPermit, isPermitRejected, user?.id]);

  // User authorization evaluation strictly from SAP /UserRole entity set
  const {
    roles: userRoles,
    displayRoles: userDisplayRoles,
    isLoadingRoles,
    isUserAdmin,
    approverTiers: userApproverTiers,
    hasApproverRole: hasApproverAuthorization,
    refreshRoles
  } = useUserPtwRoles(user);

  // Dynamic Readiness & Prerequisite Evaluation
  const approvalReadiness = useMemo(() => {
    if (!selectedPermit) return null;

    // 1. Gas test check
    const isGasRequired =
      activeWorkTypes.some(wt => wt.code === 'HOT' || wt.code === 'CONF' || wt.code === 'CSE') ||
      Boolean(selectedPermit.GasTestFreqHr && Number(selectedPermit.GasTestFreqHr) > 0) ||
      selectedPermit.GasTestRequired === 'X';

    const gasTests = selectedPermit._GasTest || [];
    const hasGasRecord = gasTests.length > 0;
    const latestGas = hasGasRecord ? gasTests[gasTests.length - 1] : null;
    const isGasSafe = !isGasRequired || (
      hasGasRecord &&
      Number(latestGas?.O2Pct || 0) >= 19.5 &&
      Number(latestGas?.O2Pct || 0) <= 23.5 &&
      Number(latestGas?.LelPct || 0) <= 5.0
    );

    // 2. Isolation check
    const isIsoReq = isIsolationRequired;
    const hasIsoRecord = (selectedPermit._Isolation || []).length > 0 || Boolean(selectedPermit.IsolationNo);
    const isIsoReady = !isIsoReq || hasIsoRecord;

    // 3. Status check
    const isStatusReady = (selectedPermit.Status === 'CRTD' || !selectedPermit.Status) && !isPermitRejected;

    // 4. Step sequence check
    const isStepReady = !nextStepInfo.isFullyApproved && !isPermitRejected;

    // 5. User role match for next step
    const canUserSignCurrentStep =
      isUserAdmin ||
      userApproverTiers.includes(nextStepInfo.roleId) ||
      (nextStepInfo.roleId === 'PTW_APPR1' && userRoles.includes('PTW_APPROVER')) ||
      (nextStepInfo.roleId === 'PTW_APPR2' && userRoles.includes('PTW_APPROVER'));

    const allPrerequisitesMet =
      isStatusReady &&
      isGasSafe &&
      isIsoReady &&
      isStepReady;

    return {
      isGasRequired,
      hasGasRecord,
      isGasSafe,
      isIsoReq,
      hasIsoRecord,
      isIsoReady,
      isStatusReady,
      isStepReady,
      canUserSignCurrentStep,
      allPrerequisitesMet,
      items: [
        {
          id: 'status',
          label: 'Permit Lifecycle Status',
          status: isPermitRejected ? 'FAILED' : (selectedPermit.Status === 'CRTD' || !selectedPermit.Status) ? 'READY' : selectedPermit.Status === 'APPR' ? 'COMPLETED' : 'WARNING',
          message: isPermitRejected
            ? 'Permit is REJECTED. Approval cannot be granted until requester revises it.'
            : (selectedPermit.Status === 'CRTD' || !selectedPermit.Status)
            ? 'Permit is in CRTD (Initiated) status and ready for multi-tier review.'
            : `Current permit status is ${selectedPermit.Status}.`
        },
        {
          id: 'gas',
          label: 'Atmospheric Gas Testing',
          status: !isGasRequired ? 'NOT_APPLICABLE' : isGasSafe ? 'READY' : !hasGasRecord ? 'PENDING' : 'FAILED',
          message: !isGasRequired
            ? 'Atmospheric gas testing is not mandated for this work category.'
            : !hasGasRecord
            ? 'Initial Gas Test (Seq #1) has not been recorded in SAP yet.'
            : isGasSafe
            ? `Gas readings cleared safe (O2: ${latestGas?.O2Pct || 20.9}%, LEL: ${latestGas?.LelPct || 0}%).`
            : 'Latest gas readings indicate hazardous atmosphere. Re-test required.'
        },
        {
          id: 'isolation',
          label: 'Energy Isolation & LOTO',
          status: !isIsoReq ? 'NOT_APPLICABLE' : isIsoReady ? 'READY' : 'PENDING',
          message: !isIsoReq
            ? 'Energy isolation is not required for this activity.'
            : isIsoReady
            ? `Isolation confirmed (${(selectedPermit._Isolation || []).length} attached cert / ${selectedPermit.IsolationNo || 'Active'}).`
            : "Isolation is flagged as required (IsolationRequired = 'X'), but certificate is pending."
        },
        {
          id: 'role',
          label: 'Approver Role Authorization',
          status: !hasApproverAuthorization ? 'UNAUTHORIZED' : canUserSignCurrentStep ? 'READY' : 'MISMATCH',
          message: !hasApproverAuthorization
            ? `Signed in as ${user?.id || 'Unknown'} without Permit Approver authorization.`
            : canUserSignCurrentStep
            ? `Authorized as ${isUserAdmin ? 'Administrator (All Tiers)' : nextStepInfo.roleId}.`
            : `Next step requires ${nextStepInfo.roleId}. Current user role: ${userApproverTiers.join(', ')}.`
        }
      ]
    };
  }, [selectedPermit, activeWorkTypes, isIsolationRequired, isPermitRejected, nextStepInfo, isUserAdmin, userApproverTiers, hasApproverAuthorization, user?.id]);

  // Handle Digital Approval Submission via SAP RAP Bound Action
  const handleSubmitApproval = async (actionToSubmit: 'AP' | 'RJ', customReason?: string) => {
    if (!selectedPermit) return;

    const finalComments = (customReason !== undefined ? customReason : approvalComments).trim();

    if (actionToSubmit === 'RJ' && !finalComments) {
      toast.warning('Please provide rejection comments / safety justification.', {
        title: 'Rejection Reason Required'
      });
      return;
    }

    setSubmitting(true);
    try {
      const governingType = approvalPolicy?.governingTypeCode || selectedPermit.PermitType;
      const step = getNextApprovalStep(
        selectedPermit._Approval,
        selectedPermit.Status,
        governingType,
        permitTimeBand.id
      );
      const signedBy = (user?.id || '').trim();
      if (!signedBy) throw new Error('Your SAP session must be verified before signing.');

      if (actionToSubmit === 'AP') {
        // Dedicated SAP RAP Bound Action:
        // /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.approve
        await permitApproverApi.executeApproveAction({
          permitNo: selectedPermit.Permit_No,
          comments: finalComments
        });
      } else {
        // Dedicated SAP RAP Bound Action for Reject:
        // /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.reject
        // Payload: { PermitNo: string, Reason: string }
        await permitApproverApi.executeRejectAction({
          permitNo: selectedPermit.Permit_No,
          reason: finalComments
        });
      }

      const actionTitle = actionToSubmit === 'AP' ? 'APPROVED' : 'REJECTED';
      toast.success(
        `Permit ${selectedPermit.Permit_No} ${actionTitle} via SAP ${actionToSubmit === 'AP' ? 'Approve' : 'Reject'} Action`,
        { title: `Permit ${actionTitle}` }
      );

      // Immediate UI state update for seamless UX responsiveness
      if (actionToSubmit === 'RJ') {
        setSelectedPermit(prev => prev ? {
          ...prev,
          Status: 'REJT',
          _Approval: [
            ...(prev._Approval || []).filter(a => a.PermitNo === prev.Permit_No),
            {
              PermitNo: prev.Permit_No,
              Stage: step.stage,
              SeqNo: step.seqNo,
              RoleId: step.roleId,
              Action: 'RJ',
              SignedBy: signedBy,
              ActionDate: new Date().toISOString().slice(0, 10),
              ActionTime: new Date().toTimeString().slice(0, 8),
              Comments: finalComments
            }
          ]
        } : prev);

        setPermits(prev => prev.map(p =>
          p.Permit_No === selectedPermit.Permit_No ? { ...p, Status: 'REJT' } : p
        ));
      }

      setApprovalComments('');
      setShowRejectModal(false);
      setRejectReason('');
      setRejectCustomComments('');

      // Reload detail, list and plant summary from SAP backend
      await loadPermitDetail(selectedPermit.Permit_No);
      void loadPermits(offset, filterStatus, pageSize, searchQuery);
      void loadPlantSummary(plant);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit approval to SAP', {
        title: `${actionToSubmit === 'AP' ? 'Approval' : 'Rejection'} Submission Failed`
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
    if (plantSummary?.draft !== undefined) return plantSummary.draft;
    return permits.filter(p => p.Status === 'CRTD').length;
  }, [plantSummary, permits]);

  const approvedCount = useMemo(() => {
    if (plantSummary) {
      return (plantSummary.approved || 0) + (plantSummary.active || 0) + (plantSummary.accepted || 0);
    }
    return permits.filter(p => p.Status === 'ISSU' || p.Status === 'ACTV' || p.Status === 'APPR' || p.Status === 'ACCP').length;
  }, [plantSummary, permits]);

  const rejectedCount = useMemo(() => {
    if (plantSummary?.rejected !== undefined) return plantSummary.rejected;
    return permits.filter(p => p.Status === 'REJT' || p.Status === 'CANC').length;
  }, [plantSummary, permits]);

  const totalPlantCount = useMemo(() => {
    if (plantSummary?.total !== undefined) return plantSummary.total;
    return totalCount > 0 ? totalCount : permits.length;
  }, [plantSummary, totalCount, permits]);

  // Dynamic 5×5 Matrix Assessment from live filled-up Hazard Controls (_HazardControl)
  const riskInfo = useMemo(() => {
    return getMaxHazardRisk(selectedPermit?._HazardControl);
  }, [selectedPermit]);

  const riskScore = useMemo(() => {
    return riskInfo ? riskInfo.score : 0;
  }, [riskInfo]);

  const riskBadge = useMemo(() => {
    if (!riskInfo || riskScore === 0) {
      return { label: 'STANDARD', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
    }
    if (riskInfo.band === 'RED') {
      return { label: `CRITICAL (${riskScore})`, bg: 'bg-rose-500', text: 'text-white', border: 'border-rose-600' };
    }
    if (riskInfo.band === 'YELLOW') {
      return { label: `HIGH RISK (${riskScore})`, bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' };
    }
    if (riskInfo.band === 'CYAN') {
      return { label: `MODERATE (${riskScore})`, bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' };
    }
    return { label: `LOW RISK (${riskScore})`, bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' };
  }, [riskInfo, riskScore]);

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col font-sans selection:bg-[#006398]/15 selection:text-[#006398]">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & NAVIGATION BAR                                            */}
      {/* ========================================================================= */}
      <header className="sticky top-16 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="w-full px-3 sm:px-6 lg:px-8 2xl:px-10 h-16 flex items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition active:scale-95 flex items-center justify-center shrink-0"
              title="Return to Launchpad"
            >
              <span className="material-symbols-outlined text-[19px] sm:text-[20px]">arrow_back</span>
            </button>
            <div className="h-6 w-px bg-slate-200 shrink-0" />
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-[#004e78] to-[#006398] text-white flex items-center justify-center shadow-xs shrink-0">
                <span className="material-symbols-outlined text-[19px] sm:text-[22px]">draw</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight truncate">
                    Permit Approver Cockpit
                  </h1>
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-blue-50 text-[#006398] border border-blue-200 shrink-0">
                    Live RAP Action
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium truncate hidden lg:block">
                  Multi-Tier Authorization Chain & Digital Signatures · SAP Live /Approval Flow
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Live Time Band Widget */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold shrink-0 ${timeBandInfo.badgeClass}`}>
              <span className="material-symbols-outlined text-[16px]">{timeBandInfo.icon}</span>
              <span className="hidden md:inline">{timeBandInfo.label}</span>
              <span className="inline md:hidden">{timeBandInfo.shortLabel}</span>
            </div>

            {/* Plant Selector */}
            <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100/90 px-2 sm:px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs shadow-2xs shrink-0">
              <span className="material-symbols-outlined text-[16px] text-slate-500 shrink-0">factory</span>
              <span className="font-bold text-slate-600 hidden sm:inline">Plant:</span>
              <select
                value={plant}
                onChange={(e) => setPlant(e.target.value)}
                className="bg-transparent font-mono font-bold text-slate-900 focus:outline-none cursor-pointer text-xs"
              >
                <option value="1002">1002 - Dahej</option>
                <option value="1003">1003 - Jolva</option>
                <option value="2001">2001 - Corporate</option>
              </select>
            </div>

            {/* Reload button */}
            <button
              type="button"
              disabled={loadingList}
              onClick={() => {
                void loadPermits();
                if (selectedPermitNo) void loadPermitDetail(selectedPermitNo);
              }}
              className="p-1.5 sm:p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50 active:scale-95 flex items-center justify-center shrink-0"
              title="Refresh Worklist from SAP"
            >
              <span className={`material-symbols-outlined text-[19px] ${loadingList ? 'animate-spin text-[#006398]' : ''}`}>
                refresh
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. KPI METRICS RIBBON                                                     */}
      {/* ========================================================================= */}
      <section className="bg-white border-b border-slate-200/80 py-2.5">
        <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-10 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div
            onClick={() => handleFilterChange('PENDING_APPROVAL')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              filterStatus === 'PENDING_APPROVAL'
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20 shadow-xs'
                : 'bg-slate-50/60 border-slate-200/80 hover:bg-amber-50/40'
            }`}
          >
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
                Awaiting Review (CRTD)
              </span>
              <span className="text-xl sm:text-2xl font-extrabold text-amber-950 font-mono">
                {pendingCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">pending_actions</span>
            </div>
          </div>

          <div
            onClick={() => handleFilterChange('APPROVED')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              filterStatus === 'APPROVED'
                ? 'bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs'
                : 'bg-slate-50/60 border-slate-200/80 hover:bg-emerald-50/40'
            }`}
          >
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                Fully Authorized
              </span>
              <span className="text-xl sm:text-2xl font-extrabold text-emerald-950 font-mono">
                {approvedCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">verified</span>
            </div>
          </div>

          <div
            onClick={() => handleFilterChange('REJECTED')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              filterStatus === 'REJECTED'
                ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-400/20 shadow-xs'
                : 'bg-slate-50/60 border-slate-200/80 hover:bg-rose-50/40'
            }`}
          >
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
                Rejected / Cancelled
              </span>
              <span className="text-xl sm:text-2xl font-extrabold text-rose-950 font-mono">
                {rejectedCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-100/80 text-rose-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">cancel</span>
            </div>
          </div>

          <div
            onClick={() => handleFilterChange('ALL')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              filterStatus === 'ALL'
                ? 'bg-blue-50/90 border-blue-300 ring-2 ring-blue-400/20 shadow-xs'
                : 'bg-slate-50/60 border-slate-200/80 hover:bg-blue-50/40'
            }`}
          >
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-blue-800 uppercase tracking-wider block">
                Total Plant {plant}
              </span>
              <span className="text-xl sm:text-2xl font-extrabold text-blue-950 font-mono">
                {totalPlantCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-100/80 text-blue-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">assignment</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* MOBILE VIEW TOGGLE TABS (< lg screens)                                    */}
      {/* ========================================================================= */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-around gap-2 text-xs font-bold sticky top-32 z-20 shadow-2xs">
        <button
          type="button"
          onClick={() => setMobileView('queue')}
          className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
            mobileView === 'queue'
              ? 'bg-[#006398] text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
          <span>Permits Queue ({filteredPermits.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileView('detail')}
          className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
            mobileView === 'detail'
              ? 'bg-[#006398] text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">visibility</span>
          <span>Dossier & Sign-off</span>
          {selectedPermit && (
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN WORKSPACE: 2-COLUMN MASTER-DETAIL LAYOUT                           */}
      {/* ========================================================================= */}
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 2xl:px-10 py-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ===================================================================== */}
        {/* LEFT COLUMN: PERMITS APPROVAL QUEUE (4 Columns)                       */}
        {/* ===================================================================== */}
        <section
          className={`lg:col-span-4 xl:col-span-4 2xl:col-span-3 flex flex-col gap-3 ${
            mobileView === 'detail' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Filter Bar & Search */}
          <div className="p-3.5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <form onSubmit={handleSearchSubmit} className="relative">
              <span className="material-symbols-outlined text-slate-400 absolute left-3 top-2.5 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search permit #, scope, requester..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006398]/30 font-medium transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                </button>
              )}
            </form>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
              <button
                type="button"
                onClick={() => handleFilterChange('PENDING_APPROVAL')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  filterStatus === 'PENDING_APPROVAL'
                    ? 'bg-[#006398] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>Awaiting Review</span>
                <span className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] ${
                  filterStatus === 'PENDING_APPROVAL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {pendingCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleFilterChange('APPROVED')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  filterStatus === 'APPROVED'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>Approved</span>
                <span className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] ${
                  filterStatus === 'APPROVED' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {approvedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleFilterChange('ALL')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  filterStatus === 'ALL'
                    ? 'bg-[#006398] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>All Permits</span>
                <span className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] ${
                  filterStatus === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {totalPlantCount}
                </span>
              </button>
            </div>
          </div>

          {/* Permit List Items */}
          <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-270px)] pr-1 scrollbar-thin">
            {loadingList ? (
              <div className="p-10 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs">
                <span className="material-symbols-outlined text-[32px] text-[#006398] animate-spin">
                  progress_activity
                </span>
                <p className="mt-2 text-xs font-bold text-slate-600">Loading live SAP approvals queue...</p>
              </div>
            ) : filteredPermits.length === 0 ? (
              <div className="p-10 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs">
                <span className="material-symbols-outlined text-[38px] text-slate-300">inbox</span>
                <p className="mt-2 text-xs font-bold text-slate-700">No permits found in queue</p>
                <p className="text-[11px] text-slate-400 mt-1">Try selecting another filter or searching a different term.</p>
              </div>
            ) : (
              filteredPermits.map((item) => {
                const isSelected = item.Permit_No === selectedPermitNo;
                const catDef = PERMIT_CATEGORIES.find(c => c.code === item.PermitType || c.sapCode === item.PermitType);
                const catLabel = catDef?.label || item.PermitType;
                const badgeColorClass = getCategoryBadgeClass(item.PermitType);
                const isApprovedState = item.Status === 'APPR' || item.Status === 'ACCP' || item.Status === 'ISSU' || item.Status === 'ACTV';

                return (
                  <div
                    key={item.Permit_No}
                    onClick={() => {
                      setSelectedPermitNo(item.Permit_No);
                      void loadPermitDetail(item.Permit_No);
                      setMobileView('detail'); // auto-switch on mobile
                    }}
                    className={`p-4 rounded-3xl border transition-all cursor-pointer text-left relative ${
                      isSelected
                        ? 'bg-white border-[#006398] shadow-md ring-2 ring-[#006398]/15 border-l-[6px] border-l-[#006398]'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold text-slate-900">
                        <span>{item.Permit_No}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPermit(item.Permit_No);
                          }}
                          className="text-slate-400 hover:text-slate-600 p-0.5"
                          title="Copy Permit Number"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {copiedPermit === item.Permit_No ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ring-1 ${badgeColorClass}`}>
                          {catLabel}
                        </span>
                        {/* Multi-category badge if selected permit has multiple work types */}
                        {isSelected && activeWorkTypes.length > 1 && (
                          <span
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                            title={`${activeWorkTypes.length} work categories: ${activeWorkTypes.map(w => w.label).join(', ')}`}
                          >
                            +{activeWorkTypes.length - 1}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-slate-700 font-semibold line-clamp-2 leading-relaxed">
                      {item.JobDesc || 'No job scope description entered.'}
                    </p>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-slate-400">person</span>
                        <span className="truncate max-w-[120px]">{item.Ernam || item.SupvName || 'Issuer'}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">schedule</span>
                        {item.Erdat || 'Live'}
                      </span>
                    </div>

                    {/* Quick Status / Step Tag */}
                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
                          isApprovedState
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.Status === 'REJT'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}>
                          <span className="material-symbols-outlined text-[12px]">
                            {isApprovedState ? 'check_circle' : item.Status === 'REJT' ? 'cancel' : 'pending'}
                          </span>
                          {isApprovedState ? 'APPROVED' : `STATUS: ${item.Status}`}
                        </span>

                        {(String(item.IsolationRequired || '').trim().toUpperCase() === 'X' ||
                          String(item.IsolationRequired || '').trim().toUpperCase() === 'Y') && (
                          <span className="px-2 py-0.5 rounded-md font-mono text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1" title="Isolation Required ('X')">
                            <span className="material-symbols-outlined text-[11px]">lock</span>
                            <span>LOTO REQ</span>
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] font-bold text-[#006398] flex items-center gap-0.5 group">
                        Review Dossier
                        <span className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-0.5">
                          arrow_forward
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap text-slate-600 font-mono">
                <span className="text-[11px]">
                  Showing <span className="font-bold text-slate-900">{totalCount === 0 ? 0 : offset + 1}</span>–
                  <span className="font-bold text-slate-900">{Math.min(offset + permits.length, totalCount)}</span> of{' '}
                  <span className="font-bold text-[#006398]">{totalCount}</span>
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
                    className="bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5 text-[11px] font-mono font-bold text-slate-700 focus:outline-none focus:border-[#006398] cursor-pointer"
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

        {/* ===================================================================== */}
        {/* RIGHT COLUMN: PERMIT DOSSIER & DIGITAL AUTHORIZATION (8 Columns)       */}
        {/* ===================================================================== */}
        <section
          className={`lg:col-span-8 xl:col-span-8 2xl:col-span-9 flex flex-col gap-4 ${
            mobileView === 'queue' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Mobile Back Button (< lg screens) */}
          <div className="lg:hidden flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setMobileView('queue')}
              className="flex items-center gap-1.5 text-xs font-bold text-[#006398]"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Back to Permits Queue</span>
            </button>
            <span className="font-mono text-xs font-bold text-slate-700">{selectedPermitNo}</span>
          </div>

          {loadingDetail ? (
            <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-xs">
              <span className="material-symbols-outlined text-[36px] text-[#006398] animate-spin">
                progress_activity
              </span>
              <p className="mt-3 text-sm font-bold text-slate-700">Loading permit {selectedPermitNo} dossier & live approvals...</p>
            </div>
          ) : !selectedPermit ? (
            <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-xs">
              <span className="material-symbols-outlined text-[48px] text-slate-300">touch_app</span>
              <h3 className="mt-2 text-base font-bold text-slate-800">Select a Permit to Review</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Select a permit from the queue to inspect safety checklists, gas test readings, isolation status, and execute digital authorization.
              </p>
            </div>
          ) : (
            <>
              {/* Dossier Header Card */}
              <div className="p-5 sm:p-6 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono tracking-tight">
                        {selectedPermit.Permit_No}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase ${
                        selectedPermit.Status === 'ISSU' || selectedPermit.Status === 'ACTV' || selectedPermit.Status === 'APPR' || selectedPermit.Status === 'ACCP'
                          ? 'bg-emerald-100 text-emerald-800'
                          : isPermitRejected
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {isPermitRejected ? (selectedPermit.Status === 'REJT' ? 'REJT (REJECTED)' : selectedPermit.Status) : selectedPermit.Status}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${riskBadge.bg} ${riskBadge.text} ${riskBadge.border}`}>
                        {riskBadge.label} (Score: {riskScore})
                      </span>

                      {/* Active Work Categories Badges (Primary + Additional _WorkType) */}
                      {activeWorkTypes.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {activeWorkTypes.map((wt) => (
                            <span
                              key={`${wt.code}-${wt.seqNo}`}
                              className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border shadow-2xs flex items-center gap-1.5 transition-all ${wt.badgeClass}`}
                              title={`${wt.isPrimary ? 'Primary Permit Category' : 'Additional Combined Work Category'} (${wt.code}): ${wt.desc}`}
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                {wt.icon}
                              </span>
                              <span>
                                {wt.isPrimary ? wt.label : `+${wt.label}`}
                              </span>
                              {wt.isPrimary && activeWorkTypes.length > 1 && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-extrabold uppercase bg-slate-900/10 text-slate-700">
                                  Primary
                                </span>
                              )}
                            </span>
                          ))}

                          {activeWorkTypes.length > 1 && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1 shadow-2xs"
                              title={`${activeWorkTypes.length} active work categories configured via SAP _WorkType`}
                            >
                              <span className="material-symbols-outlined text-[12px]">layers</span>
                              <span>{activeWorkTypes.length} Types</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-slate-600 font-medium">
                      Plant: <span className="font-bold text-slate-900">{selectedPermit.Werks || plant}</span> · Area: <span className="font-bold text-slate-900">{selectedPermit.AreaLoc || 'General Plant Area'}</span> · Equipment: <span className="font-mono font-bold text-slate-900">{selectedPermit.Equnr || 'Site Activity'}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-blue-50 text-[#006398] border border-blue-200 flex items-center gap-1.5 shadow-2xs">
                      <span className="material-symbols-outlined text-[16px]">edit_note</span>
                      {selectedPermit._Approval?.length || 0} Signatures Logged
                    </span>
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border shadow-2xs ${
                      isIsolationRequired
                        ? 'bg-purple-50 text-purple-800 border-purple-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      <span className="material-symbols-outlined text-[15px]">
                        {isIsolationRequired ? 'lock' : 'lock_open'}
                      </span>
                      <span>Isolation: {isIsolationRequired ? "REQUIRED ('X')" : "NOT REQUIRED (' ')"}</span>
                    </span>
                  </div>
                </div>

                {/* Matrix Policy Directive Notice */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="material-symbols-outlined text-[18px] text-[#006398]">rule</span>
                    <span className="font-semibold text-slate-700">
                      Matrix Directive: <span className="text-slate-900 font-bold">{approvalPolicy?.policyLabel || 'Standard Dual Authorization'}</span>
                    </span>
                    {activeWorkTypes.length > 1 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Combined Scope ({activeWorkTypes.length} Types)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${permitTimeBand.badgeClass}`}>
                      <span className="material-symbols-outlined text-[14px]">{permitTimeBand.icon}</span>
                      {permitTimeBand.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMatrixModal(true)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#006398]/10 text-[#006398] hover:bg-[#006398]/20 flex items-center gap-1 transition-all"
                    >
                      <span className="material-symbols-outlined text-[14px]">table_chart</span>
                      <span>Policy Matrix</span>
                    </button>
                  </div>
                </div>

                {/* Dossier Tabs: Overview / Gas Test / Hazards / Isolation */}
                <div className="border-b border-slate-200 flex items-center gap-2 overflow-x-auto text-xs font-bold scrollbar-none pt-1">
                  <button
                    type="button"
                    onClick={() => setDossierTab('overview')}
                    className={`pb-2 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                      dossierTab === 'overview'
                        ? 'border-[#006398] text-[#006398]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">description</span>
                    <span>Scope & Details</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDossierTab('gas')}
                    className={`pb-2 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                      dossierTab === 'gas'
                        ? 'border-[#006398] text-[#006398]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">gas_meter</span>
                    <span>Gas Testing ({selectedPermit._GasTest?.length || 0})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDossierTab('hazards')}
                    className={`pb-2 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                      dossierTab === 'hazards'
                        ? 'border-[#006398] text-[#006398]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">security</span>
                    <span>5×5 Risk & Controls</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDossierTab('isolation')}
                    className={`pb-2 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                      dossierTab === 'isolation'
                        ? 'border-[#006398] text-[#006398]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isIsolationRequired ? 'lock' : 'lock_open'}
                    </span>
                    <span>Isolation & LOTO ({selectedPermit._Isolation?.length || 0})</span>
                    <span className={`px-1.5 py-0.2 rounded-md font-mono text-[9px] font-bold ${
                      isIsolationRequired
                        ? (selectedPermit._Isolation && selectedPermit._Isolation.length > 0)
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {isIsolationRequired ? 'REQ' : 'NOT REQ'}
                    </span>
                  </button>
                </div>

                {/* TAB 1: OVERVIEW & SCOPE */}
                {dossierTab === 'overview' && (
                  <div className="space-y-3 pt-1">
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Detailed Job Scope
                      </span>
                      <p className="font-semibold text-slate-800 leading-relaxed text-xs sm:text-sm">
                        {selectedPermit.JobDesc}
                      </p>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2.5 border-t border-slate-200 font-mono text-[11px] text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[9px] font-sans font-bold">VALID FROM</span>
                          <span className="font-bold text-slate-800">{selectedPermit.ValidFromD || selectedPermit.Erdat} {selectedPermit.ValidFromT || selectedPermit.Erzet || ''}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] font-sans font-bold">VALID TO</span>
                          <span className="font-bold text-slate-800">{selectedPermit.ValidToD || selectedPermit.Erdat} {selectedPermit.ValidToT || ''}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] font-sans font-bold">PERMIT ISSUER</span>
                          <span className="font-bold text-slate-800 truncate block">{selectedPermit.PermitIssuer || selectedPermit.Ernam || 'Issuer'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] font-sans font-bold">SAFETY OFFICER</span>
                          <span className="font-bold text-slate-800 truncate block">{selectedPermit.SafetyOfficer || 'Assigned'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Active Work Categories (_WorkType) Breakdown */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[15px] text-[#006398]">category</span>
                          <span>Applicable Work Categories ({activeWorkTypes.length}) · SAP _WorkType</span>
                        </span>
                        {activeWorkTypes.length > 1 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Multi-Category Combined Work ({activeWorkTypes.length} Types)
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {activeWorkTypes.map((wt) => (
                          <div
                            key={`${wt.code}-${wt.seqNo}`}
                            className={`p-3 rounded-xl border flex items-start gap-2.5 transition-all ${wt.badgeClass}`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-white/80 border border-current/20 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[18px]">{wt.icon}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold truncate text-xs">
                                  {wt.label}
                                </span>
                                <span className="font-mono text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase bg-white/60 border border-current/20">
                                  {wt.isPrimary ? 'Primary' : `+Type #${wt.seqNo}`}
                                </span>
                              </div>
                              <p className="text-[11px] opacity-80 mt-0.5 line-clamp-1">
                                {wt.desc}
                              </p>
                              <span className="font-mono text-[9px] opacity-70 block mt-1">
                                Code: {wt.code}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: GAS TESTING READINGS */}
                {dossierTab === 'gas' && (
                  <div className="space-y-3 pt-1">
                    {selectedPermit._GasTest && selectedPermit._GasTest.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {selectedPermit._GasTest.map((gt, idx) => (
                          <React.Fragment key={`${gt.PermitNo}-${gt.TestSeq || idx}`}>
                            <div className="p-3 rounded-2xl border border-blue-200 bg-blue-50/50">
                              <span className="text-[10px] font-bold text-blue-700 block">OXYGEN (O2)</span>
                              <span className="text-lg font-extrabold font-mono text-blue-950 block mt-0.5">
                                {gt.O2Pct || 0}%
                              </span>
                              <span className="text-[10px] font-medium text-blue-600">Safe: 19.5 - 23.5%</span>
                            </div>

                            <div className="p-3 rounded-2xl border border-amber-200 bg-amber-50/50">
                              <span className="text-[10px] font-bold text-amber-700 block">FLAMMABLE (LEL)</span>
                              <span className="text-lg font-extrabold font-mono text-amber-950 block mt-0.5">
                                {gt.LelPct || 0}%
                              </span>
                              <span className="text-[10px] font-medium text-amber-600">Safe: &lt; 5%</span>
                            </div>

                            <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50">
                              <span className="text-[10px] font-bold text-slate-600 block">CARBON MONOXIDE (CO)</span>
                              <span className="text-lg font-extrabold font-mono text-slate-900 block mt-0.5">
                                {gt.CoVal || 0} ppm
                              </span>
                              <span className="text-[10px] font-medium text-slate-500">Limit: &lt; 25 ppm</span>
                            </div>

                            <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50">
                              <span className="text-[10px] font-bold text-slate-600 block">HYDROGEN SULFIDE (H2S)</span>
                              <span className="text-lg font-extrabold font-mono text-slate-900 block mt-0.5">
                                {gt.H2sVal || 0} ppm
                              </span>
                              <span className="text-[10px] font-medium text-slate-500">Limit: &lt; 10 ppm</span>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 text-xs">
                        <span className="material-symbols-outlined text-[32px] text-slate-400">gas_meter</span>
                        <p className="font-bold text-slate-700 mt-1">No Gas Testing Recorded</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Continuous gas testing not mandated for this category or pending field measurement.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: 5×5 RISK & CONTROLS */}
                {dossierTab === 'hazards' && (
                  <div className="space-y-3 pt-1 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className={`p-3.5 rounded-2xl border transition-all ${
                        riskInfo?.band === 'RED'
                          ? 'bg-rose-50/80 border-rose-300 ring-1 ring-rose-400/20'
                          : riskInfo?.band === 'YELLOW'
                          ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/20'
                          : riskInfo?.band === 'CYAN'
                          ? 'bg-cyan-50/80 border-cyan-300 ring-1 ring-cyan-400/20'
                          : riskInfo?.band === 'GREEN'
                          ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-400/20'
                          : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            5×5 Risk Assessment Score
                          </span>
                          {riskInfo && riskInfo.s > 0 && riskInfo.l > 0 && (
                            <span className="font-mono text-[9px] font-extrabold px-1.5 py-0.2 rounded border bg-white/75 shadow-2xs text-slate-800">
                              S:{riskInfo.s} × L:{riskInfo.l}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-2xl font-black font-mono text-slate-900">{riskScore}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${riskBadge.bg} ${riskBadge.text} ${riskBadge.border}`}>
                            {riskBadge.label}
                          </span>
                          {riskInfo && riskInfo.s > 0 && riskInfo.l > 0 && (
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-white border border-slate-300 text-slate-800">
                              (S:{riskInfo.s} × L:{riskInfo.l})
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-2">
                          Live rating evaluated from Hazard Controls &amp; Interactive 5×5 Risk Assessment Matrix.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Mandatory Safety Controls
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {selectedPermit._PPE && selectedPermit._PPE.length > 0 ? (
                            selectedPermit._PPE.map((p) => (
                              <span key={p.PpeCode} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                                {p.PpeDesc || p.PpeCode}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-500 font-medium">Standard PPE mandatory: Helmet, Safety Boots, Safety Eyewear.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Evaluated Hazard Mitigations List */}
                    {selectedPermit._HazardControl && selectedPermit._HazardControl.length > 0 && (
                      <div className="space-y-2 mt-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Hazard Controls &amp; Mitigations ({selectedPermit._HazardControl.length})
                        </span>
                        {selectedPermit._HazardControl.map((h, i) => {
                          const hRisk = extractHazardRisk(h);
                          const isMax = riskInfo && hRisk.score === riskInfo.score && hRisk.score > 0;
                          return (
                            <div
                              key={i}
                              className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                                isMax
                                  ? 'bg-white border-slate-300 shadow-2xs ring-1 ring-slate-400/20'
                                  : 'bg-white/80 border-slate-200'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{h.HazardDesc}</span>
                                  {isMax && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-900 text-white">
                                      MAX INITIAL
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-600 mt-0.5 leading-relaxed">
                                  <strong className="text-slate-700">Control:</strong> {h.ControlDesc}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {hRisk.s > 0 && hRisk.l > 0 && (
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-slate-800">
                                    S:{hRisk.s} × L:{hRisk.l}
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  hRisk.band === 'RED'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : hRisk.band === 'YELLOW'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : hRisk.band === 'CYAN'
                                    ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}>
                                  SCORE {hRisk.score}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: ISOLATION & LOTO */}
                {dossierTab === 'isolation' && (
                  <div className="space-y-3 pt-1 text-xs">
                    {/* SAP Isolation Required Status Banner */}
                    <div className={`p-4 rounded-2xl border flex items-start justify-between gap-3 ${
                      isIsolationRequired
                        ? 'bg-purple-50/70 border-purple-200 text-purple-900'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isIsolationRequired
                            ? 'bg-purple-100 text-purple-800 border border-purple-300'
                            : 'bg-slate-200/80 text-slate-600 border border-slate-300'
                        }`}>
                          <span className="material-symbols-outlined text-[20px]">
                            {isIsolationRequired ? 'lock' : 'lock_open'}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs">
                              {isIsolationRequired
                                ? 'Physical Isolation & LOTO Required'
                                : 'Isolation & LOTO Not Required'}
                            </span>
                            <span className={`px-2 py-0.2 rounded font-mono text-[10px] font-bold ${
                              isIsolationRequired
                                ? 'bg-purple-200/80 text-purple-900 border border-purple-300'
                                : 'bg-slate-200 text-slate-700 border border-slate-300'
                            }`}>
                              IsolationRequired: {isIsolationRequired ? "'X' (YES)" : "' ' (NO)"}
                            </span>
                          </div>
                          <p className="text-[11px] mt-1 leading-relaxed opacity-90">
                            {isIsolationRequired
                              ? "This permit requires electrical or mechanical energy isolation and physical lockout/tagout (LOTO) verification prior to issuing authorization."
                              : "No hazardous energy isolation is needed for this activity. Physical lockout / tagout is not required."}
                          </p>
                        </div>
                      </div>

                      {/* Header details if present */}
                      {(selectedPermit.IsolationNo || selectedPermit.LotoCertNo) && (
                        <div className="text-right shrink-0 font-mono text-[11px] hidden sm:block">
                          <span className="text-[10px] font-sans font-bold text-slate-500 block uppercase">Linked Cert</span>
                          <span className="font-bold text-slate-900">
                            {selectedPermit.IsolationNo || selectedPermit.LotoCertNo}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Isolation Certificates List or Specific Empty State */}
                    {selectedPermit._Isolation && selectedPermit._Isolation.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <span>Attached Isolation Certificates ({selectedPermit._Isolation.length})</span>
                          <span>Status</span>
                        </div>
                        {selectedPermit._Isolation.map((iso) => (
                          <div key={iso.IsolationNo} className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs hover:border-slate-300 transition">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[18px]">verified</span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900 text-xs">{iso.IsolationNo}</span>
                                  <span className="px-2 py-0.2 rounded-md font-mono text-[9px] font-bold bg-purple-100 text-purple-800 uppercase">
                                    {iso.Status || 'ISOL'}
                                  </span>
                                  {iso._Item && iso._Item.length > 0 && (
                                    <span className="px-1.5 py-0.2 rounded font-mono text-[9px] bg-slate-100 text-slate-600">
                                      {iso._Item.length} Points
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500 block mt-0.5">
                                  Isolated by: <strong className="text-slate-700">{iso.VerifiedBy || iso.RequestedBy || 'Site Engineer'}</strong>
                                </span>
                              </div>
                            </div>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>
                              <span>LOTO ACTIVE</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : isIsolationRequired ? (
                      /* Isolation IS Required ('X'), but no cert attached yet */
                      <div className="p-6 text-center rounded-2xl bg-amber-50/60 border border-amber-200 text-amber-900">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-2">
                          <span className="material-symbols-outlined text-[28px]">lock_clock</span>
                        </div>
                        <p className="font-bold text-slate-900 text-sm">Isolation Required ('X') — Certificate Pending</p>
                        <p className="text-xs text-amber-800 max-w-md mx-auto mt-1 leading-relaxed">
                          This permit is flagged with <strong>IsolationRequired = 'X'</strong>, but no physical isolation certificate record has been registered in <code>_Isolation</code> yet.
                        </p>
                        {selectedPermit.IsolationNo ? (
                          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-amber-300 font-mono text-xs font-bold text-slate-800">
                            <span>SAP Header Linked Certificate:</span>
                            <span className="text-purple-700">{selectedPermit.IsolationNo}</span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-amber-700 mt-2 font-medium">
                            Please ensure isolation points and locks are verified before approving this permit.
                          </p>
                        )}
                      </div>
                    ) : (
                      /* Isolation NOT Required (' ') */
                      <div className="p-6 text-center rounded-2xl bg-slate-50 border border-slate-200 text-slate-500">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
                          <span className="material-symbols-outlined text-[28px]">lock_open</span>
                        </div>
                        <p className="font-bold text-slate-700 text-sm">No Isolation Required for this Task</p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                          Isolation status is blank (<code>IsolationRequired: ' '</code>). Physical lockout / tagout certificate is not required for this task.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Multi-Tier Live SAP Approval Flow Pipeline */}
              <div className="p-5 sm:p-6 bg-white rounded-3xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-3.5">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-[#006398]">timeline</span>
                      Multi-Tier Authorization Chain (Live SAP /Approval)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Sequential digital sign-off verified directly from SAP database records.
                    </p>
                  </div>
                </div>

                {(() => {
                  const activeApprovals = getActiveCycleApprovals(selectedPermit._Approval, selectedPermit.Status);
                  const isFullyApproved = selectedPermit.Status === 'APPR' || selectedPermit.Status === 'ACCP' || selectedPermit.Status === 'ISSU' || selectedPermit.Status === 'ACTV';
                  const hasAppr1 = activeApprovals.some(a => (a.RoleId === 'PTW_APPR1' || (a.Stage === 'APPR' && a.SeqNo === '1')) && (a.Action === 'AP' || a.Action === 'APPROVED')) ||
                    activeApprovals.filter(a => a.Action === 'AP' || a.Action === 'APPROVED').some(a => a.RoleId === 'PTW_APPR1');
                  const hasAppr2 = activeApprovals.some(a => (a.RoleId === 'PTW_APPR2' || (a.Stage === 'APPR' && a.SeqNo === '2')) && (a.Action === 'AP' || a.Action === 'APPROVED'));
                  const hasAppr3 = activeApprovals.some(a => (a.RoleId === 'PTW_APPR3' || (a.Stage === 'APPR' && a.SeqNo === '3')) && (a.Action === 'AP' || a.Action === 'APPROVED'));

                  const reqRoles = approvalPolicy?.requiredRoles || ['PTW_APPR1', 'PTW_APPR2'];
                  const isColdWork = !approvalPolicy?.isApprovalRequired;

                  const shouldShowAppr1 = reqRoles.includes('PTW_APPR1') || hasAppr1;
                  const shouldShowAppr2 = reqRoles.includes('PTW_APPR2') || hasAppr2;
                  const shouldShowAppr3 = reqRoles.includes('PTW_APPR3') || hasAppr3;

                  const steps = [
                    { step: 1, stage: '01', roleId: 'ISSUER', title: 'Issuer Creation', role: 'Permit Issuer (Form Creator)', defaultName: selectedPermit.PermitIssuer || selectedPermit.Ernam || 'Issuer' },
                    ...(shouldShowAppr1 ? [{ step: 1, stage: 'APPR', roleId: 'PTW_APPR1', title: 'PTW Approver I', role: 'Approver I (Area In-Charge)', defaultName: 'Pending Approver I' }] : []),
                    ...(shouldShowAppr2 ? [{ step: 2, stage: 'APPR', roleId: 'PTW_APPR2', title: reqRoles.length === 1 && reqRoles[0] === 'PTW_APPR2' ? 'Night Shift Authorization' : 'PTW Approver II', role: 'Approver II (Safety / Shift Head)', defaultName: 'Pending Approver II' }] : []),
                    ...(shouldShowAppr3 ? [{ step: 3, stage: 'APPR', roleId: 'PTW_APPR3', title: reqRoles.length === 1 && reqRoles[0] === 'PTW_APPR3' ? 'Night Confined Space Clearance' : 'PTW Approver III', role: 'Approver III (HSE Head / Shift Manager)', defaultName: 'Pending Approver III' }] : []),
                    {
                      step: 4,
                      stage: 'STATUS',
                      roleId: isPermitRejected ? 'REJT' : 'APPR',
                      title: isPermitRejected ? 'Authorization Denied' : isFullyApproved ? 'Authorization Complete' : 'Authorization Status',
                      role: 'Work Permit Status',
                      defaultName: isPermitRejected ? 'REJECTED' : isFullyApproved ? 'APPROVED' : (isColdWork ? 'Fast-Tracked (Cold Work)' : 'Pending Approval')
                    }
                  ];

                  const gridCols = steps.length === 2 ? 'sm:grid-cols-2' : steps.length === 3 ? 'sm:grid-cols-3' : steps.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-5';

                  return (
                    <div className={`grid grid-cols-1 ${gridCols} gap-2.5`}>
                      {steps.map((s) => {
                        const match = activeApprovals.find(a =>
                          (s.roleId && a.RoleId === s.roleId) ||
                          (s.stage && a.Stage === s.stage && a.SeqNo === String(s.step))
                        ) || (isPermitRejected ? selectedPermit._Approval?.find(a =>
                          (s.roleId && a.RoleId === s.roleId) || a.Action === 'RJ'
                        ) : undefined);
                        const isIssuerStep = s.roleId === 'ISSUER';
                        const isStatusStep = s.roleId === 'APPR' || s.roleId === 'REJT';
                        const isApproved = isIssuerStep ? true : isStatusStep ? (isFullyApproved && !isPermitRejected) : (match?.Action === 'AP' || match?.Action === 'APPROVED');
                        const isVerified = !isIssuerStep && (match?.Action === 'VR' || match?.Action === 'VERIFIED');
                        const isRejected = isStatusStep ? isPermitRejected : (match?.Action === 'RJ' || match?.Action === 'REJECTED' || match?.Action === 'REJT');
                        const isSigned = isIssuerStep ? true : (!!match && !!match.SignedBy?.trim());

                        return (
                          <div
                            key={`${s.stage}-${s.roleId}-${s.step}`}
                            className={`p-3 rounded-2xl border transition-all ${
                              isApproved
                                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                                : isVerified
                                ? 'bg-sky-50/80 border-sky-200 text-sky-950'
                                : isRejected
                                ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                                : isSigned
                                ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                                : 'bg-slate-50/80 border-slate-200 text-slate-500'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono font-bold uppercase truncate">
                                {s.roleId}
                              </span>
                              <span className={`material-symbols-outlined text-[16px] ${
                                isApproved ? 'text-emerald-600' : isVerified ? 'text-sky-600' : isRejected ? 'text-rose-600' : isSigned ? 'text-amber-600' : 'text-slate-300'
                              }`}>
                                {isApproved ? 'verified' : isVerified ? 'fact_check' : isRejected ? 'cancel' : isSigned ? 'edit_note' : 'radio_button_unchecked'}
                              </span>
                            </div>
                            <h4 className="font-bold text-xs text-slate-900">{s.title}</h4>
                            <p className="mt-1 font-mono text-[11px] truncate text-slate-600 font-semibold">
                              {match && match.SignedBy?.trim() ? match.SignedBy : s.defaultName || 'Awaiting'}
                            </p>
                            {match && (
                              <div className="mt-1 flex items-center justify-between">
                                <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold ${
                                  isApproved ? 'bg-emerald-100 text-emerald-800' : isVerified ? 'bg-sky-100 text-sky-800' : isRejected ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {match.Action === 'AP' ? 'APPROVED' : match.Action === 'VR' ? 'VERIFIED' : match.Action === 'RJ' ? 'REJECTED' : match.Action}
                                </span>
                                {match.ActionDate && (
                                  <span className="font-mono text-[9px] text-slate-500">
                                    {match.ActionDate}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Digital Signing Action Desk (Auto-Determined Step & Unique Auto-Built SeqNo) */}
              <div className="p-5 sm:p-6 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#006398]/10 text-[#006398] flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">draw</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        Digital Approver Authorization Panel
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        1-Click digital authorization with automatic sequence and role resolution.
                      </p>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 border ${
                    isPermitRejected
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${isPermitRejected ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`} />
                    {isPermitRejected ? 'SAP: REJECTED' : 'Live SAP Sync'}
                  </span>
                </div>

                {isPermitRejected ? (
                  <div className="p-6 rounded-3xl bg-gradient-to-br from-rose-50 via-rose-50/70 to-red-50 border border-rose-200 text-center space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-[28px]">cancel</span>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-base text-rose-950">
                        Permit Authorization Denied (REJECTED)
                      </h4>
                      <p className="text-xs text-rose-700 max-w-md mx-auto leading-relaxed mt-1">
                        This work permit was rejected during authorization and cannot be approved or issued for site execution.
                      </p>
                    </div>

                    {rejectionDetails && (
                      <div className="mt-3 p-4 rounded-2xl bg-white/90 border border-rose-200 text-left max-w-lg mx-auto shadow-2xs space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-mono text-rose-900 border-b border-rose-100 pb-2">
                          <span className="font-bold flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px] text-rose-600">gavel</span>
                            <span>Rejected By: {rejectionDetails.signedBy}</span>
                          </span>
                          <span className="text-slate-500 font-medium">
                            {rejectionDetails.date} {rejectionDetails.time}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Rejection Safety Justification:
                          </span>
                          <p className="font-semibold text-xs text-rose-950 bg-rose-50/70 p-2.5 rounded-xl border border-rose-200/60 leading-relaxed">
                            {rejectionDetails.reason}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 text-[11px] text-slate-500 font-medium">
                      Status is permanently recorded in SAP as <span className="font-mono font-bold text-rose-700">REJT</span>. To continue with this activity, a new permit request must be submitted.
                    </div>
                  </div>
                ) : nextStepInfo.isFullyApproved || selectedPermit.Status === 'APPR' || selectedPermit.Status === 'ACCP' || selectedPermit.Status === 'ISSU' || selectedPermit.Status === 'ACTV' ? (
                  <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-[28px]">verified</span>
                    </div>
                    <h4 className="font-extrabold text-base text-emerald-950">
                      {!approvalPolicy?.isApprovalRequired ? 'Approver Sign Not Required (Cold Work)' : 'All Required Approvals Completed!'}
                    </h4>
                    <p className="text-xs text-emerald-700 max-w-md mx-auto leading-relaxed">
                      {!approvalPolicy?.isApprovalRequired
                        ? 'Cold Work does not require Approver signatures under official policy ZPTW_APPR_MAT. Fast-tracked for site issuance and execution.'
                        : activeApprovals.some(a => a.RoleId === 'PTW_APPR3' || (a.Stage === 'APPR' && a.SeqNo === '3'))
                        ? 'All required approvals (including Approver III - HSE Head) have signed this permit in SAP. The permit status is APPROVED.'
                        : activeApprovals.some(a => a.RoleId === 'PTW_APPR2')
                        ? 'Required approvers have signed this permit in SAP according to the shift matrix. The permit status is APPROVED.'
                        : 'All required approvals have been completed in SAP. The permit status is APPROVED and fully authorized for site execution.'}
                    </p>

                    {/* Quick Acceptor Handover Action */}
                    {selectedPermit.Status === 'APPR' && (
                      <div className="mt-4 pt-4 border-t border-emerald-200/60 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={async () => {
                            setSubmitting(true);
                            try {
                              await permitApproverApi.executeAcceptPermitAction({
                                permitNo: selectedPermit.Permit_No,
                                comments: 'I have read the precautions and safety measures mentioned herein and I agree to abide by the same. The safeguards have been implemented. Tool box talk given to persons working/impacted.'
                              });
                              toast.success(
                                `Permit ${selectedPermit.Permit_No} accepted by Acceptor via SAP .acceptPermit action!`,
                                { title: 'Permit Accepted' }
                              );
                              await loadPermitDetail(selectedPermit.Permit_No);
                              void loadPermits();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Failed to accept permit', {
                                title: 'Acceptance Error'
                              });
                            } finally {
                              setSubmitting(false);
                            }
                          }}
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">task_alt</span>
                          <span>Execute Permit Acceptor (.acceptPermit)</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Safety & Prerequisite Readiness Panel */}
                    {approvalReadiness && (
                      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[18px] text-[#006398]">fact_check</span>
                            <span>Approval Prerequisites &amp; Safety Readiness</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                            approvalReadiness.allPrerequisitesMet && hasApproverAuthorization && approvalReadiness.canUserSignCurrentStep
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}>
                            {approvalReadiness.allPrerequisitesMet && hasApproverAuthorization && approvalReadiness.canUserSignCurrentStep
                              ? 'READY FOR APPROVAL'
                              : 'ACTION / CLEARANCE REQUIRED'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {approvalReadiness.items.map(item => {
                            const isReady = item.status === 'READY' || item.status === 'NOT_APPLICABLE' || item.status === 'COMPLETED';
                            const isFailed = item.status === 'FAILED';
                            const isUnauth = item.status === 'UNAUTHORIZED' || item.status === 'MISMATCH';

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
                                <span className={`material-symbols-outlined text-[17px] mt-0.5 shrink-0 ${
                                  isReady
                                    ? 'text-emerald-600'
                                    : isFailed
                                    ? 'text-rose-600'
                                    : isUnauth
                                    ? 'text-purple-600'
                                    : 'text-amber-600'
                                }`}>
                                  {isReady ? 'check_circle' : isFailed ? 'cancel' : isUnauth ? 'shield_lock' : 'pending'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-[11px] flex items-center justify-between">
                                    <span>{item.label}</span>
                                    <span className="font-mono text-[9px] uppercase px-1 rounded bg-white/70 border border-current/20">
                                      {item.status}
                                    </span>
                                  </div>
                                  <p className="text-[10px] leading-relaxed opacity-90 mt-0.5">
                                    {item.message}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Role Guidance Notice when user lacks approver role in SAP /UserRole */}
                    {!hasApproverAuthorization && (
                      <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 text-amber-950 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-700 text-[20px]">shield_lock</span>
                            <span className="font-bold text-xs uppercase tracking-wide">
                              Viewing in Read-Only Audit Mode
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
                          Your current SAP account (<strong>{user?.id || 'Unknown'}</strong>) active roles in <code className="font-bold text-amber-950 bg-white/90 px-1 py-0.5 rounded border border-amber-200">SAP /UserRole</code>: <code className="font-mono bg-white/80 px-1 py-0.5 rounded border border-amber-200 font-bold">{userDisplayRoles.join(', ') || 'No PTW Roles Assigned'}</code>.
                        </p>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          Permit Approver actions require role <strong>PTW_APPR1</strong>, <strong>PTW_APPR2</strong>, <strong>PTW_APPR3</strong>, or <strong>PTW_ADMIN</strong> in the SAP <code>/UserRole</code> table. You can review safety documentation and audit trails, but digital sign-offs are restricted.
                        </p>
                      </div>
                    )}

                    {/* Auto-Assigned Pipeline Step Display (No Dropdown Needed) */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#006398] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">verified</span>
                          System Auto-Determined Next Step:
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg font-mono text-[11px] font-bold bg-[#006398] text-white shadow-xs">
                          SeqNo: #{nextStepInfo.seqNo} (Auto-Build)
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between">
                        <div>
                          <div className="text-base font-extrabold text-slate-900">
                            {nextStepInfo.roleTitle}
                          </div>
                          <div className="text-xs text-slate-600 font-mono mt-0.5">
                            Stage: <span className="font-bold text-slate-900">{nextStepInfo.stage}</span> · Role ID: <span className="font-bold text-slate-900">{nextStepInfo.roleId}</span> · Target: <span className="font-bold">{nextStepInfo.pendingRoleName}</span>
                          </div>
                        </div>

                        <span className="material-symbols-outlined text-blue-600 text-[32px]">
                          shield_person
                        </span>
                      </div>

                      <p className="mt-2 text-[11px] text-blue-800 leading-relaxed">
                        ✓ No dropdown needed: Sequence #{nextStepInfo.seqNo} is auto-built to prevent duplicate keys in SAP. The role is assigned based on the multi-tier workflow.
                      </p>
                    </div>

                    {/* Fast Approval: Preset Remarks Chips */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                        Quick Approval Remarks (1-Tap Selection):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_APPROVAL_COMMENTS.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => setApprovalComments(chip)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition active:scale-95 text-left"
                          >
                            + {chip}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Signed By & Comments */}
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Signed By (Approver SAP User ID):
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={user?.id || ''}
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono font-bold text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Approval Comments / Verification Remarks:
                        </label>
                        <textarea
                          value={approvalComments}
                          onChange={(e) => setApprovalComments(e.target.value)}
                          placeholder="e.g. Work precautions, isolation points, and gas test safe limits verified. Approved for work execution."
                          rows={2}
                          className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-[#006398] focus:ring-1 focus:ring-[#006398] text-xs font-medium"
                        />
                      </div>
                    </div>

                    {/* Action Execution Buttons: 1-Click Approve or Reject */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        disabled={
                          submitting ||
                          !hasApproverAuthorization ||
                          (!isUserAdmin && !approvalReadiness?.canUserSignCurrentStep)
                        }
                        onClick={() => void handleSubmitApproval('AP')}
                        className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                        title={
                          !hasApproverAuthorization
                            ? `Approver authorization required. Current roles: ${userRoles.join(', ') || 'None'}`
                            : !approvalReadiness?.canUserSignCurrentStep
                            ? `Current step requires ${nextStepInfo.roleId}. Authorized: ${userApproverTiers.join(', ')}`
                            : `Approve Permit as ${nextStepInfo.roleId}`
                        }
                      >
                        {submitting ? (
                          <>
                            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                            <span>Signing in SAP...</span>
                          </>
                        ) : !hasApproverAuthorization ? (
                          <>
                            <span className="material-symbols-outlined text-[18px]">lock</span>
                            <span>Approver Role Required</span>
                          </>
                        ) : !approvalReadiness?.canUserSignCurrentStep ? (
                          <>
                            <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                            <span>Awaiting {nextStepInfo.roleId} Signoff</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[18px]">verified</span>
                            <span>Approve Permit ({nextStepInfo.roleId})</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={submitting || !hasApproverAuthorization}
                        onClick={() => setShowRejectModal(true)}
                        className="py-3 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                        title={!hasApproverAuthorization ? 'Approver authorization required to reject permits' : 'Reject with safety justification'}
                      >
                        <span className="material-symbols-outlined text-[18px]">cancel</span>
                        <span>Reject with Safety Reason</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {/* ========================================================================= */}
      {/* 4. REJECTION MODAL WITH SAFETY AUDIT REASON                                */}
      {/* ========================================================================= */}
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
                    Please provide an explicit safety justification to reject this permit in SAP.
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
                  Standard Safety Reasons (1-Tap Selection):
                </label>
                <div className="space-y-1.5">
                  {PRESET_REJECTION_REASONS.map((r) => (
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
                        name="rejectionReason"
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
                  Detailed Justification / Mandatory Remarks:
                </label>
                <textarea
                  value={rejectCustomComments}
                  onChange={(e) => setRejectCustomComments(e.target.value)}
                  placeholder="Explain why this permit cannot be authorized and what site actions are required before re-submission."
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-xs font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || (!rejectReason && !rejectCustomComments.trim())}
                onClick={() => void handleSubmitApproval('RJ', rejectCustomComments || rejectReason)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? 'Rejecting in SAP...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Time-Band Approval Matrix Reference Modal */}
      {showMatrixModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-5 overflow-hidden animate-in fade-in duration-150"
          onClick={() => setShowMatrixModal(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[86vh] rounded-2xl sm:rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header (Fixed at top) */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:px-6 sm:py-4 bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="p-2 sm:p-2.5 rounded-2xl bg-[#006398]/10 text-[#006398]">
                  <span className="material-symbols-outlined text-[22px] sm:text-[24px]">table_chart</span>
                </span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                    GFL Time-Band Approval Policy Matrix
                  </h3>
                  <p className="text-[11px] sm:text-xs font-mono text-slate-500">
                    Configuration Table: ZPTW_APPR_MAT · Real-Time Shift Authorization Rules
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMatrixModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                title="Close modal (Esc)"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Body (Scrollable with internal scrollbar) */}
            <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-3.5">
              {/* Shift Banner */}
              <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/80 flex items-center justify-between gap-2.5 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600 text-[18px]">schedule</span>
                  <span className="text-xs text-slate-700">
                    Current Execution Schedule: <strong className="text-slate-900">{permitTimeBand.label}</strong>
                  </span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${permitTimeBand.badgeClass}`}>
                  Active Shift Column Highlighted Below
                </span>
              </div>

              {/* Matrix Table matching user's exact specification */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-10 shadow-2xs">
                    <tr className="text-slate-700 font-extrabold border-b border-slate-200">
                      <th className="py-2.5 px-3 w-1/4">Permit Category / Work</th>
                      <th className={`py-2.5 px-3 w-1/4 ${permitTimeBand.id === 'DAY' ? 'bg-amber-100/80 text-amber-950 font-black' : ''}`}>
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">wb_sunny</span>
                          <span>9:00 Hrs to 17:30 Hrs</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-normal block mt-0.5">Day Shift</span>
                      </th>
                      <th className={`py-2.5 px-3 w-1/4 ${permitTimeBand.id === 'EVENING' ? 'bg-indigo-100/80 text-indigo-950 font-black' : ''}`}>
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">flare</span>
                          <span>17:30 Hrs to 23:00 Hrs</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-normal block mt-0.5">Evening Shift</span>
                      </th>
                      <th className={`py-2.5 px-3 w-1/4 ${permitTimeBand.id === 'NIGHT' ? 'bg-purple-100/80 text-purple-950 font-black' : ''}`}>
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">bedtime</span>
                          <span>23:00 Hrs to 09:00 Hrs</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-normal block mt-0.5">Night Shift</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium bg-white">
                    {APPROVAL_MATRIX_RULES.map((rule: MatrixRow) => {
                      const matchedItem = activeWorkTypes.find(wt => {
                        const code = wt.code.toUpperCase();
                        return rule.typeCodes.includes(code) || code.startsWith(rule.typeCodes[0]);
                      });
                      const isSelected = Boolean(matchedItem);
                      const isGoverning = approvalPolicy?.workTypeLabel === rule.workType;
                      return (
                        <tr
                          key={rule.workType}
                          className={`transition-colors ${
                            isGoverning
                              ? 'bg-blue-100/60 font-bold'
                              : isSelected
                              ? 'bg-blue-50/70 font-semibold'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            {isSelected && (
                              <span className={`w-2 h-2 rounded-full shrink-0 ${isGoverning ? 'bg-[#006398] animate-pulse' : 'bg-slate-400'}`} />
                            )}
                            <span>{rule.workType}</span>
                            {matchedItem && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold uppercase bg-white/70 border border-slate-200 text-slate-600">
                                {matchedItem.isPrimary ? 'Primary' : 'Additional'}
                                {isGoverning && ' · Governing'}
                              </span>
                            )}
                          </td>
                          <td className={`py-2.5 px-3 ${permitTimeBand.id === 'DAY' ? 'bg-amber-50/60 font-semibold text-amber-950' : 'text-slate-700'}`}>
                            <span className={`px-2 py-0.5 rounded text-[11px] ${
                              rule.day.roles.length === 0 ? 'bg-slate-100 text-slate-500 italic' : 'bg-blue-50 text-[#006398] font-bold'
                            }`}>
                              {rule.day.label}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 ${permitTimeBand.id === 'EVENING' ? 'bg-indigo-50/60 font-semibold text-indigo-950' : 'text-slate-700'}`}>
                            <span className={`px-2 py-0.5 rounded text-[11px] ${
                              rule.evening.roles.length === 0 ? 'bg-slate-100 text-slate-500 italic' : 'bg-blue-50 text-[#006398] font-bold'
                            }`}>
                              {rule.evening.label}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 ${permitTimeBand.id === 'NIGHT' ? 'bg-purple-50/60 font-semibold text-purple-950' : 'text-slate-700'}`}>
                            <span className={`px-2 py-0.5 rounded text-[11px] ${
                              rule.night.roles.length === 0
                                ? 'bg-slate-100 text-slate-500 italic'
                                : rule.night.roles.includes('PTW_APPR3')
                                ? 'bg-purple-100 text-purple-900 font-extrabold border border-purple-200'
                                : 'bg-indigo-50 text-indigo-800 font-bold'
                            }`}>
                              {rule.night.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footnote Guide */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 text-xs space-y-1">
                <p className="font-bold text-slate-800">Operational Policy Notes:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600">
                  <li><strong>Cold Work:</strong> Approver signature not required in any shift. Fast-tracked directly to Issuer/Execution.</li>
                  <li><strong>Night Confined Space (23:00 - 09:00):</strong> Mandatory Approver III authorization (PTW_APPR3 - HSE Head / Plant Manager).</li>
                  <li><strong>Night Single-Tier Authorizations:</strong> Hot Work, Line Breaking, Radiography, Rigging, and Height automatically route directly to Approver II (Shift Superintendent).</li>
                </ul>
              </div>
            </div>

            {/* Modal Footer (Fixed at bottom) */}
            <div className="px-5 py-3 sm:px-6 sm:py-3.5 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Shift policy is dynamically verified against live SAP authorization roles.
              </span>
              <button
                type="button"
                onClick={() => setShowMatrixModal(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white shadow-xs transition ml-auto"
              >
                Close Matrix Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PermitApproverWorkspace;
