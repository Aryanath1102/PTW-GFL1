import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { SapUser } from '../../core/auth/sapAuthContext';
import type { PermitDeepInsertResponse, PermitInfoRecord } from '../../core/types/ptw.types';
import { sitePermitApi, type PlantPermitSummary } from '../../core/api/modules/sitePermit.api';
import { permitApproverApi, getNextApprovalStep, getActiveCycleApprovals } from '../../core/api/modules/permitApprover.api';
import { getRequiredApproversForPermit, getTimeBand } from '../../core/ptw/approvalMatrix';
import { PERMIT_CATEGORIES, PROCEDURE } from '../../core/ptw/siteProcedure';
import { PrerequisitePanel } from './PrerequisitePanel';
import { SectionCard } from '../../shared/components/SectionCard';
import { toast } from '../../shared/context/ToastContext';
import { PermitAnnexPrintView } from './PermitAnnexPrintView';
import { PermitPrintModal } from './PermitPrintModal';
import {
  JHA_TEMPLATES,
  detectBestJhaTemplate,
  getJhaTemplateById,
  detectAllPermitJhaTemplates,
  GENERAL_SAFETY_GUIDELINES,
} from '../../core/ptw/jhaTemplates';
import {
  getRiskMatrixCell,
  extractHazardRisk,
  getMaxHazardRisk,
  deduceMatrixCoordinates
} from './RiskMatrix5x5Section';
import { PermitJhaPrintView } from './PermitJhaPrintView';
import { validatePhoneNumber } from '../../core/utils/phoneValidation';
import { useUserPtwRoles } from '../../shared/hooks/useUserPtwRoles';
import { getPermitClearanceLevels } from '../../core/ptw/permitClearanceLevels';

interface PermitDisplayWorkspaceProps {
  user: SapUser | null;
  onBack: () => void;
  initialPermitNo?: string;
  onRevisePermit?: (permit: PermitDeepInsertResponse) => void;
}

type TabType =
  | 'overview'
  | 'procedure'
  | 'crew_hazards'
  | 'ppe'
  | 'isolation'
  | 'gastest'
  | 'approvals'
  | 'renewals_audit';

export const PermitDisplayWorkspace: React.FC<PermitDisplayWorkspaceProps> = ({
  user,
  onBack,
  initialPermitNo,
  onRevisePermit
}) => {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<'list' | 'detail'>(initialPermitNo ? 'detail' : 'list');
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Search & Filtering State (Server-side)
  const [plant, setPlant] = useState<string>(user?.plant || '1002');
  const [search, setSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'GAS_TEST' | 'APPROVER' | 'ACCEPTER' | 'AREA_OPERATOR'>('ALL');
  const [quickLookupNo, setQuickLookupNo] = useState<string>(initialPermitNo || '');

  // Local Findability State (Instant Client-side Filter & Inspect)
  const [tableQuery, setTableQuery] = useState<string>('');
  const [expandedPermitNo, setExpandedPermitNo] = useState<string | null>(null);
  const [previewHistoryError, setPreviewHistoryError] = useState('');
  const [loadingPreviewHistory, setLoadingPreviewHistory] = useState(false);
  useEffect(() => {
    if (!expandedPermitNo) return;
    const controller = new AbortController();
    setPreviewHistoryError('');
    setLoadingPreviewHistory(true);
    void permitApproverApi.getApprovals(expandedPermitNo, controller.signal).then(records => {
      if (!controller.signal.aborted) setPermits(current => current.map(p =>
        p.Permit_No === expandedPermitNo ? { ...p, _Approval: records } : p
      ));
    }).catch(() => {
      if (!controller.signal.aborted) setPreviewHistoryError('Approval history could not be loaded. Open the permit and refresh to verify the rejecting stage and remarks.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingPreviewHistory(false);
    });
    return () => controller.abort();
  }, [expandedPermitNo, plant]);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [jsaFilter, setJsaFilter] = useState<'ALL' | 'YES' | 'NO' | 'NA'>('ALL');
  const [jsaSearch, setJsaSearch] = useState<string>('');
  const [dossierSearch, setDossierSearch] = useState<string>('');
  const [ppeFilter, setPpeFilter] = useState<'ALL' | 'REQ'>('ALL');

  // Data State
  const [permits, setPermits] = useState<PermitInfoRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(25);
  const [plantSummary, setPlantSummary] = useState<PlantPermitSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);
  const lastBaselinePlantRef = useRef<string>(plant);
  const [selectedPermit, setSelectedPermit] = useState<PermitDeepInsertResponse | null>(null);

  // A refresh keeps the reader's place; only navigating to another permit resets it.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [viewMode, selectedPermit?.Permit_No]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setClockNow(Date.now());
    const timer = window.setInterval(tick, 30000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);
  const [offset, setOffset] = useState<number>(0);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [updatingPrereq, setUpdatingPrereq] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printWithJha, setPrintWithJha] = useState<boolean>(false);
  const [selectedJhaTemplateId, setSelectedJhaTemplateId] = useState<string>('HOT_GROUND');

  // Approval Action Dialog State (SAP Entity: /Approval)
  const [showApprovalModal, setShowApprovalModal] = useState<boolean>(false);
  const [approvalRoleId, setApprovalRoleId] = useState<'PTW_APPR1' | 'PTW_APPR2' | 'PTW_APPR3' | 'VER' | 'ISS'>('PTW_APPR1');
  const [approvalAction, setApprovalAction] = useState<'AP' | 'VR' | 'RJ' | 'CAO' | 'RAO'>('AP');
  const [approvalStage, setApprovalStage] = useState<string>('APPR');
  const [approvalSeqNo, setApprovalSeqNo] = useState<string>('1');
  const [approvalComments, setApprovalComments] = useState<string>('');
  const [submittingApproval, setSubmittingApproval] = useState<boolean>(false);

  // Acceptor Action Dialog State (SAP Bound Actions: .acceptPermit & .rejectAcceptor)
  const [showAcceptorModal, setShowAcceptorModal] = useState<boolean>(false);
  const [acceptorActionType, setAcceptorActionType] = useState<'accept' | 'reject'>('accept');
  const [acceptorComments, setAcceptorComments] = useState<string>('');
  const [submittingAcceptor, setSubmittingAcceptor] = useState<boolean>(false);

  // User Authorization Evaluation strictly from SAP /UserRole entity set
  const {
    roles: userRoles,
    displayRoles: userDisplayRoles,
    isLoadingRoles,
    isUserAdmin,
    hasApproverRole,
    hasAcceptorRole,
    hasAreaOperatorRole,
    refreshRoles
  } = useUserPtwRoles(user);

  const handleOpenAcceptorModal = (action: 'accept' | 'reject') => {
    if (!selectedPermit) return;
    setAcceptorActionType(action);
    if (action === 'accept') {
      setAcceptorComments(
        'I have read the precautions and safety measures mentioned herein and I agree to abide by the same. The safeguards have been implemented. Tool box talk given to persons working/impacted.'
      );
    } else {
      setAcceptorComments('');
    }
    setShowAcceptorModal(true);
  };

  const handleSubmitAcceptor = async () => {
    if (!selectedPermit) return;

    if (!hasAcceptorRole) {
      toast.error('You do not have the required Acceptor (PTW_ACCP) role to execute field acceptance.', {
        title: 'Authorization Required'
      });
      return;
    }

    const finalVal = acceptorComments.trim();
    if (!finalVal) {
      toast.warning(
        acceptorActionType === 'accept'
          ? 'Please provide acceptance comments.'
          : 'Please provide reason for rejecting permit acceptance.',
        { title: acceptorActionType === 'accept' ? 'Comments Required' : 'Reason Required' }
      );
      return;
    }
    setSubmittingAcceptor(true);
    try {
      if (acceptorActionType === 'accept') {
        // Dedicated SAP RAP Bound Action: acceptPermit
        // Payload: { PermitNo: string, Comments: string }
        await permitApproverApi.executeAcceptPermitAction({
          permitNo: selectedPermit.Permit_No,
          comments: finalVal
        });
        toast.success(
          `Permit ${selectedPermit.Permit_No} accepted by Acceptor via SAP .acceptPermit action`,
          { title: 'Permit Accepted' }
        );
      } else {
        // Dedicated SAP RAP Bound Action: rejectAcceptor
        // Payload: { PermitNo: string, Reason: string }
        await permitApproverApi.executeRejectAcceptorAction({
          permitNo: selectedPermit.Permit_No,
          reason: finalVal
        });
        toast.success(
          `Permit ${selectedPermit.Permit_No} rejected by Acceptor via SAP .rejectAcceptor action`,
          { title: 'Permit Rejected' }
        );
      }
      setShowAcceptorModal(false);
      setAcceptorComments('');
      await loadPermitDetail(selectedPermit.Permit_No);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit acceptor action to SAP', {
        title: `${acceptorActionType === 'accept' ? 'Acceptance' : 'Rejection'} Failed`
      });
    } finally {
      setSubmittingAcceptor(false);
    }
  };

  // Resubmit & Revise Rejected Permit Dialog State (SAP Bound Action: PermitInfo('...')/...Resubmit)
  const [showResubmitModal, setShowResubmitModal] = useState<boolean>(false);
  const [resubmitMode, setResubmitMode] = useState<'quick_edit' | 'direct'>('quick_edit');
  const [editJobDesc, setEditJobDesc] = useState<string>('');
  const [editSupvName, setEditSupvName] = useState<string>('');
  const [editSupvPhone, setEditSupvPhone] = useState<string>('');
  const [editShift, setEditShift] = useState<string>('GENERAL');
  const [editAreaLoc, setEditAreaLoc] = useState<string>('');
  const [editValidToT, setEditValidToT] = useState<string>('');
  const [editValidToD, setEditValidToD] = useState<string>('');
  const [resubmitComments, setResubmitComments] = useState<string>('');
  const [submittingResubmit, setSubmittingResubmit] = useState<boolean>(false);

  const handleOpenResubmitModal = () => {
    if (!selectedPermit) return;
    setEditJobDesc(selectedPermit.JobDesc || '');
    setEditSupvName(selectedPermit.SupvName || '');
    setEditSupvPhone(selectedPermit.SupvPhone || '');
    setEditShift(selectedPermit.Shift || 'GENERAL');
    setEditAreaLoc(selectedPermit.AreaLoc || '');
    setEditValidToT(selectedPermit.ValidToT ? selectedPermit.ValidToT.slice(0, 5) : '');
    setEditValidToD(selectedPermit.ValidToD || '');
    setResubmitComments('');
    setResubmitMode('quick_edit');
    setShowResubmitModal(true);
  };

  const handleOpenApprovalModal = async () => {
    if (selectedPermit) {
      if (selectedPermit.Status === 'APPR' || selectedPermit.Status === 'ACCP' || selectedPermit.Status === 'ISSU' || selectedPermit.Status === 'ACTV') {
        toast.info(`Permit ${selectedPermit.Permit_No} is already fully approved (${selectedPermit.Status}). No further approvals are required.`, {
          title: 'Permit Already Approved'
        });
        return;
      }
      let approvals = selectedPermit._Approval || [];
      try {
        const live = await permitApproverApi.getApprovals(selectedPermit.Permit_No);
        if (live && live.length > 0) {
          approvals = live;
          setSelectedPermit(prev => (prev ? { ...prev, _Approval: live } : prev));
        }
      } catch {
        // proceed with local approvals
      }
      const permitTimeBand = getTimeBand(selectedPermit.ValidFromT || new Date());
      const step = getNextApprovalStep(approvals, selectedPermit.Status, selectedPermit.PermitType, permitTimeBand.id);
      if (step.isFullyApproved) {
        toast.info(`All required approvals for permit ${selectedPermit.Permit_No} are complete.`, {
          title: 'Approvals Complete'
        });
        return;
      }
      setApprovalRoleId(step.roleId);
      setApprovalStage(step.stage);
      setApprovalSeqNo(step.seqNo);
      setApprovalAction(step.action);
    }
    setShowApprovalModal(true);
  };

  const handleSubmitApproval = async () => {
    if (!selectedPermit) return;

    if ((approvalAction === 'CAO' || approvalAction === 'RAO') && !hasAreaOperatorRole) {
      toast.error('You do not have the required Area Operator (PTW_AREA_OPP) role for this action.', {
        title: 'Authorization Required'
      });
      return;
    }
    if ((approvalAction === 'AP' || approvalAction === 'VR' || approvalAction === 'RJ') && !hasApproverRole) {
      toast.error('You do not have the required Approver (PTW_APPR1/2/3) role to submit digital approvals.', {
        title: 'Authorization Required'
      });
      return;
    }

    setSubmittingApproval(true);
    try {
      // Re-calculate unique incremented SeqNo and role to avoid duplicate key collision in SAP
      const permitTimeBand = getTimeBand(selectedPermit.ValidFromT || new Date());
      const step = getNextApprovalStep(selectedPermit._Approval, selectedPermit.Status, selectedPermit.PermitType, permitTimeBand.id);
      const effectiveSeqNo = step.seqNo;
      const effectiveRoleId = step.roleId;
      const effectiveStage = step.stage;

      const signedBy = (user?.id || '').trim();
      if (!signedBy) throw new Error('Your SAP session must be verified before signing.');
      if (approvalAction === 'AP') {
        // Dedicated SAP RAP Approve Action:
        // /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.approve
        await permitApproverApi.executeApproveAction({
          permitNo: selectedPermit.Permit_No,
          comments: approvalComments.trim()
        });
      } else if (approvalAction === 'RJ') {
        // Dedicated SAP RAP Reject Action:
        // /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.reject
        await permitApproverApi.executeRejectAction({
          permitNo: selectedPermit.Permit_No,
          reason: approvalComments.trim() || 'Rejected during review'
        });
      } else if (approvalAction === 'CAO') {
        // Dedicated SAP RAP Complete Area Operator Action:
        // /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.completeAreaOperator
        await permitApproverApi.executeCompleteAreaOperatorAction({
          permitNo: selectedPermit.Permit_No,
          comments: approvalComments.trim()
        });
      } else if (approvalAction === 'RAO') {
        // Dedicated SAP RAP Reject Area Operator Action:
        // /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.rejectAreaOperator
        await permitApproverApi.executeRejectAreaOperatorAction({
          permitNo: selectedPermit.Permit_No,
          reason: approvalComments.trim() || 'Area Operator rejected'
        });
      } else {
        await permitApproverApi.submitApproval({
          PermitNo: selectedPermit.Permit_No,
          Stage: effectiveStage,
          SeqNo: effectiveSeqNo,
          RoleId: effectiveRoleId,
          Action: approvalAction,
          SignedBy: signedBy,
          ActionDate: null,
          ActionTime: '',
          Comments: approvalComments.trim()
        });
      }
      const actionName = approvalAction === 'AP' ? 'APPROVED' : approvalAction === 'VR' ? 'VERIFIED' : 'REJECTED';
      toast.success(
        `Action "${actionName}" for permit ${selectedPermit.Permit_No} executed via SAP action`,
        { title: 'Digital Approval Submitted' }
      );
      setShowApprovalModal(false);
      setApprovalComments('');
      await loadPermitDetail(selectedPermit.Permit_No);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit approval to SAP', {
        title: 'Approval Submission Failed'
      });
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleResubmitPermit = async () => {
    if (!selectedPermit || submittingResubmit) return;

    if (resubmitMode === 'quick_edit') {
      if (editSupvPhone.trim()) {
        const phoneCheck = validatePhoneNumber(editSupvPhone, true);
        if (!phoneCheck.isValid) {
          toast.warning(`Supervisor Phone: ${phoneCheck.error}`, { title: 'Invalid Phone Number' });
          return;
        }
      }
    }

    setSubmittingResubmit(true);
    try {
      const updates: Partial<PermitInfoRecord> = {};
      if (resubmitMode === 'quick_edit') {
        if (editJobDesc !== selectedPermit.JobDesc) updates.JobDesc = editJobDesc;
        if (editSupvName !== selectedPermit.SupvName) updates.SupvName = editSupvName;
        if (editSupvPhone !== selectedPermit.SupvPhone) updates.SupvPhone = editSupvPhone;
        if (editShift !== selectedPermit.Shift) updates.Shift = editShift;
        if (editAreaLoc !== selectedPermit.AreaLoc) updates.AreaLoc = editAreaLoc;
        if (editValidToT && `${editValidToT}:00` !== selectedPermit.ValidToT) {
          updates.ValidToT = editValidToT.length === 5 ? `${editValidToT}:00` : editValidToT;
        }
        if (editValidToD && editValidToD !== selectedPermit.ValidToD) updates.ValidToD = editValidToD;
      }

      await sitePermitApi.reviseAndResubmit(
        selectedPermit.Permit_No,
        updates,
        resubmitComments,
        selectedPermit['@odata.etag']
      );

      toast.success(
        `Permit ${selectedPermit.Permit_No} has been revised and resubmitted for authorization via SAP .Resubmit action!`,
        { title: 'Permit Revised & Resubmitted' }
      );
      setShowResubmitModal(false);
      setResubmitComments('');
      await loadPermitDetail(selectedPermit.Permit_No);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to resubmit permit to SAP Gateway.', {
        title: 'Resubmission Failed'
      });
    } finally {
      setSubmittingResubmit(false);
    }
  };

  useEffect(() => {
    if (selectedPermit) {
      const detected = detectBestJhaTemplate(selectedPermit);
      setSelectedJhaTemplateId(detected.id);
    }
  }, [selectedPermit]);

  const currentJhaTemplate = useMemo(() => {
    return getJhaTemplateById(selectedJhaTemplateId);
  }, [selectedJhaTemplateId]);

  const detectedJhaTemplate = useMemo(() => {
    return detectBestJhaTemplate(selectedPermit);
  }, [selectedPermit]);

  const applicableJhas = useMemo(() => {
    return detectAllPermitJhaTemplates(selectedPermit);
  }, [selectedPermit]);

  const filteredJhaRows = useMemo(() => {
    if (!dossierSearch.trim()) return currentJhaTemplate.rows;
    const q = dossierSearch.toLowerCase();
    return currentJhaTemplate.rows.filter(row =>
      row.activity.toLowerCase().includes(q) ||
      row.hazard.toLowerCase().includes(q) ||
      row.consequence.toLowerCase().includes(q) ||
      row.mitigationMeasures.some(m => m.toLowerCase().includes(q))
    );
  }, [currentJhaTemplate, dossierSearch]);

  // Dynamic Max Residual Risk from live filled-up Hazard Controls (_HazardControl)
  const dynamicHazardRisk = useMemo(() => {
    return getMaxHazardRisk(selectedPermit?._HazardControl);
  }, [selectedPermit?._HazardControl]);

  // Fallback to JHA standard template row only if no _HazardControl records exist
  const maxInitialRiskRow = useMemo(() => {
    if (dynamicHazardRisk) return null;
    if (!currentJhaTemplate?.rows || currentJhaTemplate.rows.length === 0) return null;
    return currentJhaTemplate.rows.reduce((max, r) =>
      (r.initialRisk?.score || 0) > (max.initialRisk?.score || 0) ? r : max
    , currentJhaTemplate.rows[0]);
  }, [dynamicHazardRisk, currentJhaTemplate]);

  const maxInitialScore = useMemo(() => {
    if (dynamicHazardRisk) return dynamicHazardRisk.score;
    return maxInitialRiskRow?.initialRisk?.score || 0;
  }, [dynamicHazardRisk, maxInitialRiskRow]);

  const { maxInitialS, maxInitialL } = useMemo(() => {
    if (dynamicHazardRisk && dynamicHazardRisk.s > 0 && dynamicHazardRisk.l > 0) {
      return { maxInitialS: dynamicHazardRisk.s, maxInitialL: dynamicHazardRisk.l };
    }
    if (!maxInitialRiskRow) return { maxInitialS: 0, maxInitialL: 0 };
    const sStr = (maxInitialRiskRow.initialRisk?.severity || '').toLowerCase();
    const lStr = (maxInitialRiskRow.initialRisk?.likelihood || '').toLowerCase();

    let s = 0;
    if (sStr.includes('catastrophic') || sStr === '5') s = 5;
    else if (sStr.includes('major') || sStr.includes('serious') || sStr === '4') s = 4;
    else if (sStr.includes('moderate') || sStr === '3') s = 3;
    else if (sStr.includes('minor') || sStr === '2') s = 2;
    else if (sStr.includes('insignificant') || sStr === '1') s = 1;

    let l = 0;
    if (lStr.includes('very likely') || lStr.includes('frequent') || lStr === '5') l = 5;
    else if (lStr.includes('likely') || lStr.includes('probable') || lStr === '4') l = 4;
    else if (lStr.includes('possible') || lStr === '3') l = 3;
    else if (lStr.includes('unlikely') || lStr.includes('remote') || lStr === '2') l = 2;
    else if (lStr.includes('very unlikely') || lStr.includes('rare') || lStr === '1') l = 1;

    // Fallback exact matrix decomposition if S or L text was non-standard
    if ((s === 0 || l === 0 || s * l !== maxInitialScore) && maxInitialScore > 0) {
      const deduced = deduceMatrixCoordinates(maxInitialScore);
      s = deduced.s;
      l = deduced.l;
    }

    return { maxInitialS: s, maxInitialL: l };
  }, [dynamicHazardRisk, maxInitialRiskRow, maxInitialScore]);

  const maxInitialLevel = useMemo(() => {
    if (dynamicHazardRisk) return dynamicHazardRisk.level;
    return maxInitialRiskRow?.initialRisk?.level || 'Moderate Risk';
  }, [dynamicHazardRisk, maxInitialRiskRow]);

  const maxInitialRiskStyle = useMemo(() => {
    // 5x5 Matrix Cell mapping
    const cellDef = (maxInitialS > 0 && maxInitialL > 0)
      ? getRiskMatrixCell(maxInitialS, maxInitialL)
      : null;

    const band = cellDef?.band || (maxInitialScore >= 15 ? 'RED' : maxInitialScore >= 9 ? 'YELLOW' : maxInitialScore >= 4 ? 'CYAN' : 'GREEN');

    if (band === 'RED' || maxInitialScore >= 15) {
      return {
        band: 'RED',
        bandLabel: 'Critical Risk',
        cardClass: 'bg-gradient-to-br from-rose-50 via-red-50 to-rose-100/80 border-rose-300 ring-2 ring-rose-400/25 shadow-xs',
        titleClass: 'text-rose-800',
        scoreClass: 'text-rose-950',
        calcClass: 'text-rose-800 bg-rose-100/90 border-rose-300',
        badgeClass: 'bg-rose-600 text-white border-rose-700 shadow-2xs font-extrabold',
        subtextClass: 'text-rose-700 font-medium',
        matrixTag: '5×5 Matrix: RED (Critical Risk)',
        hexColor: '#FF0000'
      };
    }

    if (band === 'YELLOW' || maxInitialScore >= 9) {
      return {
        band: 'YELLOW',
        bandLabel: 'High Risk',
        cardClass: 'bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100/80 border-amber-300 ring-2 ring-amber-400/25 shadow-xs',
        titleClass: 'text-amber-800',
        scoreClass: 'text-amber-950',
        calcClass: 'text-amber-800 bg-amber-100/90 border-amber-300',
        badgeClass: 'bg-amber-500 text-slate-900 border-amber-600 shadow-2xs font-extrabold',
        subtextClass: 'text-amber-700 font-medium',
        matrixTag: '5×5 Matrix: YELLOW (High Risk)',
        hexColor: '#FFD966'
      };
    }

    if (band === 'CYAN' || maxInitialScore >= 4) {
      return {
        band: 'CYAN',
        bandLabel: 'Moderate Risk',
        cardClass: 'bg-gradient-to-br from-cyan-50 via-sky-50 to-cyan-100/80 border-cyan-300 ring-2 ring-cyan-400/25 shadow-xs',
        titleClass: 'text-cyan-900',
        scoreClass: 'text-cyan-950',
        calcClass: 'text-cyan-800 bg-cyan-100/90 border-cyan-300',
        badgeClass: 'bg-cyan-500 text-slate-900 border-cyan-600 shadow-2xs font-extrabold',
        subtextClass: 'text-cyan-800 font-medium',
        matrixTag: '5×5 Matrix: CYAN (Moderate Risk)',
        hexColor: '#66FFFF'
      };
    }

    return {
      band: 'GREEN',
      bandLabel: 'Low Risk',
      cardClass: 'bg-gradient-to-br from-emerald-50 via-lime-50 to-emerald-100/80 border-emerald-300 ring-2 ring-emerald-400/25 shadow-xs',
      titleClass: 'text-emerald-800',
      scoreClass: 'text-emerald-950',
      calcClass: 'text-emerald-800 bg-emerald-100/90 border-emerald-300',
      badgeClass: 'bg-emerald-600 text-white border-emerald-700 shadow-2xs font-extrabold',
      subtextClass: 'text-emerald-700 font-medium',
      matrixTag: '5×5 Matrix: GREEN (Low Risk)',
      hexColor: '#CCFF99'
    };
  }, [maxInitialScore, maxInitialS, maxInitialL]);

  const maxResidualScore = useMemo(() => {
    if (!currentJhaTemplate?.rows || currentJhaTemplate.rows.length === 0) return 0;
    return Math.max(...currentJhaTemplate.rows.map(r => r.residualRisk?.score || 0));
  }, [currentJhaTemplate]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Copy to clipboard helper
  const handleCopy = (text: string, label: string) => {
    if (!text || text === '—') return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedText(text);
      toast.success(`${label} (${text}) copied to clipboard`, { title: 'Copied' });
      setTimeout(() => setCopiedText(null), 2200);
    }).catch(() => {
      toast.info(`Selected: ${text}`);
    });
  };

  // Load Plant-wide aggregates for KPI strip and filter pills
  const loadPlantSummary = async (targetPlant: string, signal?: AbortSignal) => {
    if (!targetPlant.trim()) return;
    setLoadingSummary(true);
    try {
      const summary = await sitePermitApi.getPlantSummary(targetPlant, signal);
      if (!signal?.aborted) {
        setPlantSummary(summary);
        lastBaselinePlantRef.current = targetPlant;
      }
    } catch (err) {
      console.warn('[PermitDisplayWorkspace] Could not load plant summary:', err);
    } finally {
      if (!signal?.aborted) setLoadingSummary(false);
    }
  };

  // Load Permit List from SAP OData V4 with count and pagination
  const loadPermitList = async (
    skip = 0,
    overrideCategory?: string,
    overrideStatus?: string,
    overridePageSize?: number
  ) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setLoadingDetail(false);
    setError('');
    const effCategory = overrideCategory !== undefined ? overrideCategory : categoryFilter;
    const effStatus = overrideStatus !== undefined ? overrideStatus : statusFilter;
    const effPageSize = overridePageSize !== undefined ? overridePageSize : pageSize;

    try {
      const data = await sitePermitApi.list(
        plant,
        search,
        skip,
        controller.signal,
        effCategory,
        effStatus,
        effPageSize
      );
      if (!controller.signal.aborted) {
        setPermits(data);
        setTotalCount(data.totalCount);
        setOffset(skip);
        setHasSearched(true);
        setLastUpdated(Date.now());
        setRefreshFailed(false);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : 'Failed to retrieve permits from SAP Gateway.';
        setError(msg);
        setRefreshFailed(true);
        toast.error(msg, { title: 'SAP Gateway Error' });
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  // Load Single Permit Deep Details (All 10 Collections expanded)
  const loadPermitDetail = async (permitNo: string) => {
    if (!permitNo.trim()) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingDetail(true);
    setLoading(false);
    setError('');
    try {
      const data = await sitePermitApi.read(permitNo.trim(), controller.signal);
      if (!controller.signal.aborted) {
        setSelectedPermit(data);
        setViewMode('detail');
        if (selectedPermit?.Permit_No !== data.Permit_No || viewMode !== 'detail') {
          setActiveTab('overview');
          setDossierSearch('');
        }
        setLastUpdated(Date.now());
        setRefreshFailed(false);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : `Unable to load details for permit ${permitNo}.`;
        setError(msg);
        setRefreshFailed(true);
        toast.error(msg, { title: 'Permit Details Error' });
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingDetail(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    if (initialPermitNo) {
      void loadPermitDetail(initialPermitNo);
    } else {
      void loadPermitList(0);
      void loadPlantSummary(plant);
    }
    return () => abortControllerRef.current?.abort();
  }, []);

  // Quick lookup handler
  const handleQuickLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickLookupNo.trim()) {
      void loadPermitDetail(quickLookupNo.trim());
    } else {
      toast.warning('Please enter a permit number to search.', { title: 'Mandatory Field Missing' });
    }
  };

  // Print PTW handler: opens official A4 preview modal
  const handlePrint = () => {
    if (!selectedPermit) {
      toast.warning('Please select a permit to print.', { title: 'Print' });
      return;
    }
    setPrintWithJha(false);
    setShowPrintModal(true);
  };

  // KPI Calculations based on true plant-wide baseline with fallback
  const kpiStats = useMemo(() => {
    if (plantSummary) {
      return {
        total: plantSummary.total,
        active: plantSummary.active,
        intended: plantSummary.intended,
        approved: plantSummary.approved,
        draft: plantSummary.draft,
        rejected: plantSummary.rejected || 0,
        closed: plantSummary.closed,
        hotOrConf: plantSummary.hotOrConf,
      };
    }
    const total = totalCount > 0 ? totalCount : permits.length;
    const active = permits.filter(p => p.Status === 'ISSU' || p.Status === 'ACTV').length;
    const intended = permits.filter(p => p.Status === 'INTD').length;
    const approved = permits.filter(p => p.Status === 'APPR').length;
    const draft = permits.filter(p => p.Status === 'CRTD' || p.Status === 'DRAF').length;
    const rejected = permits.filter(p => p.Status === 'REJT' || p.Status === 'REJC').length;
    const closed = permits.filter(p => p.Status === 'CLOS' || p.Status === 'CANC').length;
    const hotOrConf = permits.filter(p => p.PermitType === 'HOT' || p.PermitType === 'CONF' || p.PermitType === 'CSE').length;
    return { total, active, intended, approved, draft, rejected, closed, hotOrConf };
  }, [plantSummary, totalCount, permits]);

  // Category counts based on plant-wide baseline
  const categoryCounts = useMemo(() => {
    if (plantSummary?.categoryCounts) {
      return plantSummary.categoryCounts;
    }
    return {
      ALL: totalCount > 0 ? totalCount : permits.length,
      HOT: permits.filter(p => p.PermitType === 'HOT').length,
      COLD: permits.filter(p => p.PermitType === 'COLD').length,
      CONF: permits.filter(p => p.PermitType === 'CONF' || p.PermitType === 'CSE').length,
      HGHT: permits.filter(p => p.PermitType === 'HGHT' || p.PermitType === 'W@H').length,
      ELEC: permits.filter(p => p.PermitType === 'ELEC').length,
    };
  }, [plantSummary, totalCount, permits]);

  // Status counts based on plant-wide baseline
  const statusCounts = useMemo(() => {
    if (plantSummary?.statusCounts) {
      return plantSummary.statusCounts;
    }
    return {
      ALL: totalCount > 0 ? totalCount : permits.length,
      ISSU: permits.filter(p => p.Status === 'ISSU' || p.Status === 'ACTV').length,
      INTD: permits.filter(p => p.Status === 'INTD').length,
      APPR: permits.filter(p => p.Status === 'APPR').length,
      CRTD: permits.filter(p => p.Status === 'CRTD' || p.Status === 'DRAF').length,
      REJT: permits.filter(p => p.Status === 'REJT' || p.Status === 'REJC').length,
      CLOS: permits.filter(p => p.Status === 'CLOS' || p.Status === 'CANC').length,
    };
  }, [plantSummary, totalCount, permits]);

  // Client-filtered permits for instant search-as-you-type and level filtering
  const displayedPermits = useMemo(() => {
    let list = permits;
    if (levelFilter !== 'ALL') {
      list = list.filter(p => {
        const cl = getPermitClearanceLevels(p);
        if (levelFilter === 'GAS_TEST') return cl.overallCurrentLevel === 'GAS_TEST' || cl.gas.status === 'REQUIRED_PENDING';
        if (levelFilter === 'APPROVER') return cl.overallCurrentLevel === 'APPROVER' || cl.approver.status === 'IN_PROGRESS';
        if (levelFilter === 'ACCEPTER') return cl.overallCurrentLevel === 'ACCEPTER' || cl.accepter.status === 'PENDING';
        if (levelFilter === 'AREA_OPERATOR') return cl.overallCurrentLevel === 'AREA_OPERATOR' || cl.areaOperator.status === 'PENDING';
        return true;
      });
    }
    if (!tableQuery.trim()) return list;
    const q = tableQuery.toLowerCase().trim();
    return list.filter(p =>
      (p.Permit_No && p.Permit_No.toLowerCase().includes(q)) ||
      (p.Aufnr && p.Aufnr.toLowerCase().includes(q)) ||
      (p.Qmnum && p.Qmnum.toLowerCase().includes(q)) ||
      (p.Equnr && p.Equnr.toLowerCase().includes(q)) ||
      (p.Tplnr && p.Tplnr.toLowerCase().includes(q)) ||
      (p.JobDesc && p.JobDesc.toLowerCase().includes(q)) ||
      (p.AreaLoc && p.AreaLoc.toLowerCase().includes(q)) ||
      (p.Werks && p.Werks.toLowerCase().includes(q)) ||
      (p.SupvName && p.SupvName.toLowerCase().includes(q)) ||
      (p.PermitType && p.PermitType.toLowerCase().includes(q)) ||
      (p.Status && p.Status.toLowerCase().includes(q))
    );
  }, [permits, levelFilter, tableQuery]);

  // Helper: Status Badges with enhanced color depth
  const renderStatusBadge = (status: string, compact = false) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'ISSU':
      case 'ACTV':
        return (
          <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold font-mono bg-emerald-100/90 text-emerald-800 border border-emerald-300 shadow-xs`}>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>ISSUED & ACTIVE</span>
          </span>
        );
      case 'APPR':
        return (
          <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold font-mono bg-amber-100/90 text-amber-800 border border-amber-300 shadow-xs`}>
            <span className="material-symbols-outlined text-[14px] shrink-0 text-amber-700">verified</span>
            <span>APPROVED</span>
          </span>
        );
      case 'INTD':
        return (
          <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold font-mono bg-indigo-100/90 text-indigo-800 border border-indigo-300 shadow-xs`}>
            <span className="material-symbols-outlined text-[14px] shrink-0 text-indigo-700">pending_actions</span>
            <span>INITIATED (PREREQ)</span>
          </span>
        );
      case 'CRTD':
      case 'DRAF':
      case 'DRAFT':
      case 'CREATED':
        return (
          <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold font-mono bg-sky-100/90 text-sky-800 border border-sky-300 shadow-xs`}>
            <span className="material-symbols-outlined text-[14px] shrink-0 text-sky-700">edit_document</span>
            <span>CREATED</span>
          </span>
        );
      case 'REJT':
      case 'REJC':
      case 'REJECTED':
        return (
          <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold font-mono bg-rose-100/90 text-rose-800 border border-rose-300 shadow-xs`}>
            <span className="material-symbols-outlined text-[14px] shrink-0 text-rose-700">cancel</span>
            <span>REJECTED</span>
          </span>
        );
      case 'CLOS':
        return (
          <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold font-mono bg-blue-100 text-blue-800 border border-blue-300 shadow-xs`}>
            <span className="material-symbols-outlined text-[14px] shrink-0 text-blue-700">task_alt</span>
            <span>CLOSED / RESTORED</span>
          </span>
        );
      case 'SUSP':
        return (
          <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold font-mono bg-orange-100 text-orange-800 border border-orange-300 shadow-xs`}>
            <span className="material-symbols-outlined text-[14px] shrink-0 text-orange-700">pause_circle</span>
            <span>SUSPENDED</span>
          </span>
        );
      case 'CANC':
        return (
          <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold font-mono bg-slate-100 text-slate-700 border border-slate-300 shadow-xs`}>
            <span className="material-symbols-outlined text-[14px] shrink-0 text-slate-600">block</span>
            <span>CANCELLED</span>
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold font-mono bg-slate-100 text-slate-700 border border-slate-300 shadow-xs`}>
            <span>{status || 'UNKNOWN'}</span>
          </span>
        );
    }
  };

  // Helper: Category Info
  const getCategoryInfo = (code: string) => {
    const found = PERMIT_CATEGORIES.find(c => c.code === code || c.sapCode === code);
    return {
      label: found?.label || code,
      icon: found?.icon || 'description',
      desc: found?.desc || 'Permit Activity',
      code
    };
  };

  // Helper: Calculate Validity Status & Time remaining
  const calculateValidity = (validFromD: string | null, validFromT: string, validToD: string | null, validToT: string) => {
    if (!validFromD || !validToD) return { status: 'UNKNOWN', text: 'No dates set', percent: 0, color: 'text-slate-500', badgeBg: 'bg-slate-100 text-slate-600' };
    const now = clockNow;
    const start = new Date(`${validFromD}T${validFromT || '00:00:00'}+05:30`).getTime();
    const end = new Date(`${validToD}T${validToT || '23:59:59'}+05:30`).getTime();

    if (isNaN(start) || isNaN(end)) return { status: 'INVALID', text: 'Invalid time format', percent: 0, color: 'text-slate-500', badgeBg: 'bg-slate-100 text-slate-600' };

    if (now < start) {
      const hrsUntil = Math.max(0, Math.round((start - now) / 3600000));
      return { status: 'UPCOMING', text: `Starts in ~${hrsUntil}h`, percent: 0, color: 'text-sky-600', badgeBg: 'bg-sky-50 text-sky-700 border-sky-200' };
    }
    if (now > end) {
      return { status: 'EXPIRED', text: 'Validity Ended', percent: 100, color: 'text-rose-600', badgeBg: 'bg-rose-50 text-rose-700 border-rose-200' };
    }
    const total = end - start;
    const elapsed = now - start;
    const percent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    const remainingHrs = Math.max(0, ((end - now) / 3600000)).toFixed(1);
    const isCritical = percent > 85;
    return {
      status: 'ACTIVE',
      text: `${remainingHrs}h left (${percent}%)`,
      percent,
      color: isCritical ? 'text-amber-600' : 'text-emerald-600',
      badgeBg: isCritical ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
    };
  };

  // Interactive KPI card click handler
  const handleKpiFilter = (mode: 'ALL' | 'ACTIVE' | 'PENDING' | 'APPROVED' | 'CRITICAL' | 'CLOSED' | 'DRAFT' | 'CREATED' | 'REJECTED') => {
    switch (mode) {
      case 'ALL':
        setStatusFilter('ALL');
        setCategoryFilter('ALL');
        void loadPermitList(0, 'ALL', 'ALL');
        break;
      case 'ACTIVE':
        setStatusFilter('ISSU');
        setCategoryFilter('ALL');
        void loadPermitList(0, 'ALL', 'ISSU');
        break;
      case 'PENDING':
        setStatusFilter('INTD');
        setCategoryFilter('ALL');
        void loadPermitList(0, 'ALL', 'INTD');
        break;
      case 'APPROVED':
        setStatusFilter('APPR');
        setCategoryFilter('ALL');
        void loadPermitList(0, 'ALL', 'APPR');
        break;
      case 'DRAFT':
      case 'CREATED':
        setStatusFilter('CRTD');
        setCategoryFilter('ALL');
        void loadPermitList(0, 'ALL', 'CRTD');
        break;
      case 'REJECTED':
        setStatusFilter('REJT');
        setCategoryFilter('ALL');
        void loadPermitList(0, 'ALL', 'REJT');
        break;
      case 'CRITICAL':
        setStatusFilter('ALL');
        setCategoryFilter('CRITICAL');
        void loadPermitList(0, 'CRITICAL', 'ALL');
        break;
      case 'CLOSED':
        setStatusFilter('CLOS');
        setCategoryFilter('ALL');
        void loadPermitList(0, 'ALL', 'CLOS');
        break;
    }
  };

  return (
    <div className="mx-auto max-w-[1536px] px-3 sm:px-6 py-4 sm:py-5 font-sans">
      {/* ========================================================================= */}
      {/* 1. TOP APPLICATION COMMAND BAR & BREADCRUMBS */}
      {/* ========================================================================= */}
      <header className="no-print mb-4 pb-3 border-b border-slate-200/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Breadcrumb & Screen Title */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={viewMode === 'detail' && !initialPermitNo ? () => setViewMode('list') : onBack}
              className="group inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:border-[#006398] hover:bg-sky-50/50 hover:text-[#006398]"
            >
              <span className="material-symbols-outlined text-[16px] transition-transform group-hover:-translate-x-0.5">
                arrow_back
              </span>
              <span>{viewMode === 'detail' && !initialPermitNo ? 'Back to Permit Register' : 'Return to Launchpad'}</span>
            </button>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>/</span>
              <span className="text-slate-600 font-medium">PTW Suite</span>
              <span>/</span>
              {viewMode === 'detail' && selectedPermit ? (
                <span className="font-bold text-[#006398] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px]">file_open</span>
                  <span>Permit {selectedPermit.Permit_No}</span>
                </span>
              ) : (
                <span className="font-semibold text-slate-800">Permit register</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span role="status">{loading || loadingDetail ? 'Refreshing…' : refreshFailed ? 'Refresh failed · displayed data may be outdated' : lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST` : 'Not yet loaded'} · Plant {plant}</span>
            </div>
          </div>

          {/* Open another permit from the detail view */}
          {viewMode === 'detail' && <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <form onSubmit={handleQuickLookup} className="flex items-center gap-1.5 relative">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2 text-[16px] text-slate-400">
                  search
                </span>
                <input
                  type="text"
                  value={quickLookupNo}
                  onChange={e => setQuickLookupNo(e.target.value.toUpperCase())}
                  aria-label="Open a permit by number"
                  placeholder="Permit number"
                  className="w-48 sm:w-60 pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#006398] focus:ring-1 focus:ring-[#006398]/30 shadow-xs"
                />
              </div>
              <button
                type="submit"
                disabled={loadingDetail || !quickLookupNo.trim()}
                title="Open Permit Dossier"
                className="px-3 py-1.5 bg-[#006398] hover:bg-[#004e78] text-white rounded-xl text-xs font-semibold transition-all shadow-xs disabled:opacity-50 flex items-center gap-1 shrink-0"
              >
                {loadingDetail ? (
                  <span className="material-symbols-outlined animate-spin text-[15px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[15px]">visibility</span>
                )}
                <span className="hidden sm:inline">Open</span>
              </button>
            </form>


          </div>}
        </div>
      </header>

      {/* Global Error Banner */}
      {error && (
        <div role="alert" className="no-print mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3 shadow-xs">
          <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0">error</span>
          <div className="flex-1">
            <h4 className="font-bold uppercase tracking-wider text-[11px] mb-0.5">SAP Gateway Notice</h4>
            <p className="leading-relaxed">{error}</p>
          </div>
          <button type="button" onClick={() => setError('')} className="text-rose-500 hover:text-rose-700">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MODE: PERMIT DIRECTORY / LIST VIEW */}
      {/* ========================================================================= */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {/* Interactive KPI Quick-Filter Strip */}
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 transition-opacity duration-200 ${loadingSummary ? 'opacity-75 animate-pulse' : 'opacity-100'}`}>
            {/* Total */}
            <button
              type="button"
              onClick={() => handleKpiFilter('ALL')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                statusFilter === 'ALL' && categoryFilter === 'ALL'
                  ? 'bg-gradient-to-br from-white to-slate-100/90 border-[#006398] ring-2 ring-[#006398]/30 shadow-md'
                  : 'bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-600">Total Register</span>
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                  <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-display text-slate-900 tracking-tight leading-none">{kpiStats.total}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-600">All Records</span>
              </div>
            </button>

            {/* Active In-Field */}
            <button
              type="button"
              onClick={() => handleKpiFilter('ACTIVE')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                statusFilter === 'ISSU' || statusFilter === 'ACTV'
                  ? 'bg-gradient-to-br from-emerald-50/80 to-emerald-100/60 border-emerald-500 ring-2 ring-emerald-500/30 shadow-md'
                  : 'bg-white border-slate-200/90 hover:border-emerald-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-emerald-800">Active In-Field</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <span className="material-symbols-outlined text-[16px] animate-pulse">radio_button_checked</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-display text-emerald-950 tracking-tight leading-none">{kpiStats.active}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800">Executing</span>
              </div>
            </button>

            {/* Initiated / Prereq */}
            <button
              type="button"
              onClick={() => handleKpiFilter('PENDING')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                statusFilter === 'INTD'
                  ? 'bg-gradient-to-br from-indigo-50/80 to-indigo-100/60 border-indigo-500 ring-2 ring-indigo-500/30 shadow-md'
                  : 'bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-indigo-800">Initiated / Prereq</span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                  <span className="material-symbols-outlined text-[16px]">hourglass_top</span>
                </div>
              </div>
              <div className="flex items-end justify-between gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold font-display text-indigo-950 tracking-tight leading-none">{kpiStats.intended}</span>
                <div className="flex flex-col items-end gap-1">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-100 text-indigo-800">Verification</span>
                  {kpiStats.draft > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleKpiFilter('CREATED');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          handleKpiFilter('CREATED');
                        }
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                        statusFilter === 'CRTD'
                          ? 'bg-slate-800 text-white shadow-xs ring-1 ring-slate-400'
                          : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300'
                      }`}
                      title="Click to view Created permits"
                    >
                      {kpiStats.draft} Created
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* Approved */}
            <button
              type="button"
              onClick={() => handleKpiFilter('APPROVED')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                statusFilter === 'APPR'
                  ? 'bg-gradient-to-br from-amber-50/80 to-amber-100/60 border-amber-500 ring-2 ring-amber-500/30 shadow-md'
                  : 'bg-white border-slate-200/90 hover:border-amber-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-amber-800">Approved</span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-display text-amber-950 tracking-tight leading-none">{kpiStats.approved}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-100 text-amber-800">Ready</span>
              </div>
            </button>

            {/* Critical: Hot / Confined */}
            <button
              type="button"
              onClick={() => handleKpiFilter('CRITICAL')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                categoryFilter === 'CRITICAL' || categoryFilter === 'HOT' || categoryFilter === 'CONF'
                  ? 'bg-gradient-to-br from-rose-50/80 to-rose-100/60 border-rose-500 ring-2 ring-rose-500/30 shadow-md'
                  : 'bg-white border-slate-200/90 hover:border-rose-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-rose-800">Hot / Confined</span>
                <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
                  <span className="material-symbols-outlined text-[16px]">local_fire_department</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-display text-rose-950 tracking-tight leading-none">{kpiStats.hotOrConf}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-100 text-rose-800">High Risk</span>
              </div>
            </button>

            {/* Closed / Restored */}
            <button
              type="button"
              onClick={() => handleKpiFilter('CLOSED')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                statusFilter === 'CLOS'
                  ? 'bg-gradient-to-br from-sky-50/80 to-sky-100/60 border-sky-500 ring-2 ring-sky-500/30 shadow-md'
                  : 'bg-white border-slate-200/90 hover:border-sky-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-sky-800">Closed / Restored</span>
                <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-[#006398]">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-display text-[#004f7a] tracking-tight leading-none">{kpiStats.closed}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-sky-100 text-[#006398]">Completed</span>
              </div>
            </button>
          </div>

          {/* Unified Filter & Search Strip */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
            <form onSubmit={e => { e.preventDefault(); void loadPermitList(0); if (plant !== lastBaselinePlantRef.current || !plantSummary) void loadPlantSummary(plant); }} className="flex flex-wrap items-end gap-3">
              <label className="min-w-48 flex-1 text-sm font-semibold text-slate-700">
                Search permits
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Permit number, job, equipment or location" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-sky-600" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Plant
                <input value={plant} maxLength={4} onChange={e => setPlant(e.target.value.toUpperCase())} className="mt-1 block w-20 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-600" />
              </label>
              <button type="submit" disabled={loading} className="min-h-11 rounded-lg bg-[#006398] px-5 text-sm font-semibold text-white hover:bg-[#004e78] disabled:opacity-50">{loading ? 'Searching…' : 'Search'}</button>
            </form>
            <details className="text-sm text-slate-600">
              <summary className="cursor-pointer">Filter the current page{tableQuery ? ' · Filter applied' : ''}</summary>
              <label className="mt-2 block">
                Find within the loaded results only
                <input value={tableQuery} onChange={e => setTableQuery(e.target.value)} type="search" placeholder="Permit, job, location or contractor" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-600" />
              </label>
            </details>

            {/* Bottom Row: Category & Status Filter Pills */}
            <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-mono text-slate-400 mr-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">category</span>
                  <span>Type:</span>
                </span>
                {[
                  { id: 'ALL', label: 'All Types', count: categoryCounts.ALL },
                  { id: 'HOT', label: 'Hot 🔥', count: categoryCounts.HOT },
                  { id: 'COLD', label: 'Cold ❄️', count: categoryCounts.COLD },
                  { id: 'CONF', label: 'Confined 🚪', count: categoryCounts.CONF },
                  { id: 'HGHT', label: 'Height 🪜', count: categoryCounts.HGHT },
                  { id: 'ELEC', label: 'Electrical ⚡', count: categoryCounts.ELEC }
                ].map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(cat.id);
                      void loadPermitList(0, cat.id, statusFilter);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all inline-flex items-center gap-1.5 ${
                      categoryFilter === cat.id
                        ? 'bg-[#006398] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span className={`px-1 py-0.2 rounded text-[10px] ${
                      categoryFilter === cat.id ? 'bg-white/20 text-white font-bold' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {cat.count}
                    </span>
                  </button>
                ))}

                <div className="h-4 w-[1px] bg-slate-200 mx-1.5 hidden sm:block" />

                <span className="text-[11px] font-mono text-slate-400 mr-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">flag</span>
                  <span>Status:</span>
                </span>
                {[
                  { id: 'ALL', label: 'All', count: statusCounts.ALL },
                  { id: 'ISSU', label: 'Issued (Active)', count: statusCounts.ISSU },
                  { id: 'INTD', label: 'Initiated', count: statusCounts.INTD },
                  { id: 'APPR', label: 'Approved', count: statusCounts.APPR },
                  { id: 'CRTD', label: 'Created', count: statusCounts.CRTD },
                  { id: 'REJT', label: 'Rejected', count: statusCounts.REJT },
                  { id: 'CLOS', label: 'Closed', count: statusCounts.CLOS }
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(st.id);
                      void loadPermitList(0, categoryFilter, st.id);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all inline-flex items-center gap-1.5 ${
                      statusFilter === st.id
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span className={`px-1 py-0.2 rounded text-[10px] ${
                      statusFilter === st.id ? 'bg-white/20 text-white font-bold' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {st.count}
                    </span>
                  </button>
                ))}

                <div className="h-4 w-[1px] bg-slate-200 mx-1.5 hidden sm:block" />

                <span className="text-[11px] font-mono text-slate-400 mr-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">alt_route</span>
                  <span>Clearance Stage:</span>
                </span>
                {[
                  { id: 'ALL', label: 'All Levels' },
                  { id: 'GAS_TEST', label: '1. Gas Req', icon: 'air' },
                  { id: 'APPROVER', label: '2. Approver Pend', icon: 'draw' },
                  { id: 'ACCEPTER', label: '3. Acceptor Pend', icon: 'hourglass_top' },
                  { id: 'AREA_OPERATOR', label: '4. Area Op Pend', icon: 'engineering' }
                ].map(lvl => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setLevelFilter(lvl.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all inline-flex items-center gap-1 cursor-pointer ${
                      levelFilter === lvl.id
                        ? 'bg-[#006398] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {lvl.icon && <span className="material-symbols-outlined text-[13px]">{lvl.icon}</span>}
                    <span>{lvl.label}</span>
                  </button>
                ))}
              </div>

              {/* Active Filter Clear & Result Counts */}
              <div className="flex items-center gap-2 ml-auto">
                {(categoryFilter !== 'ALL' || statusFilter !== 'ALL' || levelFilter !== 'ALL' || tableQuery || search) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('ALL');
                      setStatusFilter('ALL');
                      setLevelFilter('ALL');
                      setTableQuery('');
                      setSearch('');
                      void loadPermitList(0, 'ALL', 'ALL');
                      void loadPlantSummary(plant);
                    }}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 px-2 py-0.5 rounded hover:bg-rose-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
                    <span>Reset All Filters</span>
                  </button>
                )}

                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#006398]/10 text-[#006398] border border-[#006398]/20">
                  {tableQuery
                    ? `${displayedPermits.length} of ${permits.length} in view · ${totalCount} in SAP`
                    : `${totalCount === 0 ? 0 : offset + 1}–${Math.min(offset + permits.length, totalCount)} of ${totalCount} Records`}
                </span>
              </div>
            </div>
          </div>

          {/* Master Registry Table Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined animate-spin text-[32px] text-[#006398]">
                  progress_activity
                </span>
                <span className="font-semibold text-slate-700">Connecting to SAP OData V4 Service...</span>
                <span className="text-slate-400 font-mono text-[11px]">Executing site permit register query</span>
              </div>
            ) : displayedPermits.length === 0 ? (
              <div className="p-16 text-center text-slate-400 text-xs">
                <span className="material-symbols-outlined text-[40px] text-slate-300 block mb-2">
                  search_off
                </span>
                <p className="font-bold text-slate-700 text-sm">No Matching Permits Found</p>
                <p className="mt-1 text-slate-500 max-w-md mx-auto">
                  {hasSearched
                    ? offset > 0
                      ? 'No records found on this page. You can jump back to Page 1 or reset filters.'
                      : 'No SAP permit records match your query or filter criteria. Try clearing filters or searching across another plant.'
                    : 'Search to load active permits from SAP.'}
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                  {offset > 0 && (
                    <button
                      type="button"
                      onClick={() => void loadPermitList(0)}
                      className="px-3.5 py-1.5 bg-[#006398] hover:bg-[#004e78] text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[14px]">first_page</span>
                      <span>Return to Page 1</span>
                    </button>
                  )}
                  {(categoryFilter !== 'ALL' || statusFilter !== 'ALL' || tableQuery || search) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter('ALL');
                        setStatusFilter('ALL');
                        setTableQuery('');
                        setSearch('');
                        void loadPermitList(0, 'ALL', 'ALL');
                        void loadPlantSummary(plant);
                      }}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">refresh</span>
                      <span>Reset All Filters</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-mono text-[11px] sticky top-0 z-10">
                      <th className="py-3 px-3.5 w-12 text-center">#</th>
                      <th className="py-3 px-3.5 w-40">Permit Number</th>
                      <th className="py-3 px-3.5 w-32">Type</th>
                      <th className="py-3 px-3.5 w-36">Status</th>
                      <th className="py-3 px-3.5 w-60">Next clearance</th>
                      <th className="py-3 px-3.5">Work scope</th>
                      <th className="py-3 px-3.5 w-44">Location</th>
                      <th className="py-3 px-3.5 w-48">Validity Window (IST)</th>
                      <th className="py-3 px-3.5 w-32 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {displayedPermits.map(item => {
                      const catInfo = getCategoryInfo(item.PermitType);
                      const validity = calculateValidity(item.ValidFromD, item.ValidFromT, item.ValidToD, item.ValidToT);
                      const isExpanded = expandedPermitNo === item.Permit_No;

                      return (
                        <React.Fragment key={item.Permit_No}>
                          <tr className={`hover:bg-sky-50/40 transition-colors group ${isExpanded ? 'bg-sky-50/30' : ''}`}>
                            {/* Expand preview toggle */}
                            <td className="py-3 px-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => setExpandedPermitNo(isExpanded ? null : item.Permit_No)}
                                className="w-6 h-6 rounded-md hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 inline-flex items-center justify-center transition-all"
                                title={isExpanded ? 'Collapse preview' : 'Quick preview'}
                              >
                                <span className={`material-symbols-outlined text-[16px] transition-transform ${isExpanded ? 'rotate-90 text-[#006398]' : ''}`}>
                                  chevron_right
                                </span>
                              </button>
                            </td>

                            {/* Permit No & Copy Button */}
                            <td className="py-3 px-3.5">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void loadPermitDetail(item.Permit_No)}
                                  className="font-mono font-bold text-xs text-[#006398] hover:text-[#004e78] hover:underline"
                                >
                                  {item.Permit_No}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(item.Permit_No, 'Permit #')}
                                  className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-slate-400 hover:text-slate-600 transition-opacity p-0.5 rounded"
                                  title="Copy permit number"
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    {copiedText === item.Permit_No ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                              </div>
                              <span className="block font-mono text-[10px] text-slate-400 mt-0.5">
                                Rev: {item.FormRev || '0'} · ID: {item.Revision || '—'}
                              </span>
                            </td>

                            {/* Category with Icon */}
                            <td className="py-3 px-3.5">
                              <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[17px] text-slate-500 shrink-0">
                                  {catInfo.icon}
                                </span>
                                <div>
                                  <span className="font-semibold text-slate-800 block text-[11px] leading-tight">{catInfo.label}</span>
                                  <span className="font-mono text-[10px] text-slate-400">{catInfo.code}</span>
                                </div>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {renderStatusBadge(item.Status, true)}
                            </td>

                            {/* Workflow & Clearance Levels (Gas Test · Approver · Accepter · Area Operator) */}
                            <td className="py-2.5 px-3.5">
                              {(() => {
                                const cl = getPermitClearanceLevels(item);
                                return (
                                  <div className="space-y-1.5 min-w-[140px]">
                                    {/* Overall active stage badge */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs ${cl.overallLevelBadgeClass}`}>
                                        <span className="material-symbols-outlined text-[12px]">
                                          {cl.overallCurrentLevel === 'GAS_TEST'
                                            ? 'air'
                                            : cl.overallCurrentLevel === 'APPROVER'
                                            ? 'draw'
                                            : cl.overallCurrentLevel === 'ACCEPTER'
                                            ? 'hourglass_top'
                                            : cl.overallCurrentLevel === 'AREA_OPERATOR'
                                            ? 'engineering'
                                            : cl.overallCurrentLevel === 'ACTIVE_EXECUTION'
                                            ? 'verified'
                                            : cl.overallCurrentLevel === 'REJECTED'
                                            ? 'cancel'
                                            : 'flag'}
                                        </span>
                                        <span>{cl.overallLevelLabel}</span>
                                      </span>
                                    </div>


                                  </div>
                                );
                              })()}
                            </td>

                            {/* Job Description & Reference Badges */}
                            <td className="py-3 px-3.5 max-w-sm">
                              <p className="font-semibold text-slate-900 line-clamp-2 text-sm" title={item.JobDesc}>
                                {item.JobDesc || 'No job description provided'}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono text-slate-500 flex-wrap">
                                {item.Aufnr && (
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80 font-bold text-slate-700 flex items-center gap-1">
                                    <span>MO:</span>
                                    <span>{item.Aufnr}</span>
                                  </span>
                                )}
                                {item.Qmnum && (
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80 text-slate-600">
                                    Notif: {item.Qmnum}
                                  </span>
                                )}
                                {item.Equnr && (
                                  <span className="bg-slate-50 px-1.5 py-0.5 rounded text-slate-500 border border-slate-200/60">
                                    Eq: {item.Equnr}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Location & Area */}
                            <td className="py-3 px-3.5">
                              <div className="text-xs">
                                <span className="font-mono font-bold text-slate-800">{item.Werks || '—'}</span>
                                <span className="text-slate-300 mx-1">·</span>
                                <span className="text-slate-700 font-medium">{item.AreaLoc || 'Area unspecified'}</span>
                              </div>
                              {item.Arbpl && (
                                <span className="block text-[10px] font-mono text-slate-400 mt-0.5">WC: {item.Arbpl}</span>
                              )}
                            </td>

                            {/* Validity Window */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="text-[11px] font-mono text-slate-700 flex items-center gap-1">
                                <span>{item.ValidFromD} {item.ValidFromT?.slice(0, 5)}</span>
                                <span className="text-slate-300">→</span>
                                <span>{item.ValidToD} {item.ValidToT?.slice(0, 5)}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="w-16 bg-slate-200 h-1 rounded-full overflow-hidden shrink-0">
                                  <div
                                    className={`h-full rounded-full ${validity.percent > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${validity.percent}%` }}
                                  />
                                </div>
                                <span className={`text-[10px] font-mono font-bold ${validity.color}`}>
                                  {validity.text}
                                </span>
                              </div>
                            </td>

                            {/* Action Button */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => void loadPermitDetail(item.Permit_No)}
                                className="px-3 py-1.5 bg-[#006398] hover:bg-[#004e78] text-white rounded-lg text-xs font-semibold shadow-xs transition-all inline-flex items-center gap-1 ml-auto"
                              >
                                <span>Open Dossier</span>
                                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                              </button>
                            </td>
                          </tr>

                          {/* Inline Expanded Preview Drawer */}
                          {isExpanded && (
                            <tr className="bg-sky-50/20 border-b border-sky-100">
                              <td colSpan={9} className="p-4 pl-12">
                                {loadingPreviewHistory && <p role="status" className="mb-2 text-sm text-slate-600">Loading approval history…</p>}
                                {previewHistoryError && <p role="alert" className="mb-2 text-sm text-amber-800">{previewHistoryError}</p>}
                                {(() => {
                                  const cl = getPermitClearanceLevels(item);
                                  return (
                                    <div className="space-y-3">
                                      {/* 4-Level Safety & Authorization Clearance Stepper Banner */}
                                      <div className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/90 shadow-2xs">
                                        <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                                          <div className="flex items-center gap-2">
                                            <span className="p-1 rounded-md bg-[#006398]/10 text-[#006398]">
                                              <span className="material-symbols-outlined text-[16px]">alt_route</span>
                                            </span>
                                            <div>
                                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                                                4-Level Workflow Clearance Status
                                              </h4>
                                              <p className="text-[11px] text-slate-500 font-sans">
                                                Next Action: <strong className="text-slate-800">{cl.nextActionText}</strong>
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-mono text-slate-500">
                                              Progress: <strong className="text-slate-800">{cl.completedCount}/{cl.totalApplicableLevels} Cleared</strong>
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${cl.overallLevelBadgeClass}`}>
                                              {cl.overallLevelLabel}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                                          {cl.levels.map(lvl => (
                                            <div
                                              key={lvl.id}
                                              className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
                                                lvl.isComplete && !lvl.isNotApplicable
                                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                                  : lvl.isPendingCurrent
                                                  ? 'bg-amber-50/80 border-amber-300 text-amber-950 ring-1 ring-amber-400/20'
                                                  : lvl.isRejected
                                                  ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                                                  : lvl.isNotApplicable
                                                  ? 'bg-slate-50 border-slate-200/80 text-slate-500'
                                                  : 'bg-white border-slate-200 text-slate-600'
                                              }`}
                                            >
                                              <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">
                                                  Step {lvl.stepNumber}: {lvl.shortLabel}
                                                </span>
                                                <span className={`material-symbols-outlined text-[15px] ${
                                                  lvl.isComplete && !lvl.isNotApplicable ? 'text-emerald-600' : lvl.isPendingCurrent ? 'text-amber-600' : 'text-slate-400'
                                                }`}>
                                                  {lvl.icon}
                                                </span>
                                              </div>
                                              <div className="font-bold text-xs truncate">
                                                {lvl.badgeLabel}
                                              </div>
                                              <p className={`text-sm leading-relaxed mt-1 whitespace-pre-wrap break-words ${lvl.isRejected ? 'text-rose-800' : 'text-slate-600'}`}>
                                                {lvl.detailText}
                                              </p>
                                              <div className="text-[9px] font-mono text-slate-400 mt-1 pt-1 border-t border-slate-200/60">
                                                Role: {lvl.responsibleRole}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="bg-white rounded-xl border border-sky-200/80 p-3.5 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                                  <div>
                                    <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                                      Supervision & Agency
                                    </span>
                                    <p className="font-semibold text-slate-800">{item.SupvName || 'Supervisor not assigned'}</p>
                                    <p className="text-[11px] font-mono text-slate-500">{item.SupvPhone || 'No phone'}</p>
                                    <p className="text-[11px] text-slate-600 mt-0.5">
                                      {item.ExecAgency === 'CONT' ? 'Contractor' : 'Company (EMP)'} · Dept: {item.ExecDept || '—'}
                                    </p>
                                  </div>

                                  <div>
                                    <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                                      Asset & Functional Loc
                                    </span>
                                    <p className="font-mono text-slate-800 font-semibold">{item.Tplnr || 'Func loc not recorded'}</p>
                                    <p className="font-mono text-[11px] text-slate-500">Equip: {item.Equnr || '—'}</p>
                                    <p className="text-[11px] text-slate-600 mt-0.5">Shift: {item.Shift || 'GENERAL'}</p>
                                  </div>

                                  <div>
                                    <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                                      Gateways & Prerequisites
                                    </span>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                        (item.GasTestRequired === 'Y' || item.GasTestRequired === 'X')
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        Gas Test: {(item.GasTestRequired === 'Y' || item.GasTestRequired === 'X') ? 'REQ' : 'NO'}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                        (item.IsolationRequired === 'Y' || item.IsolationRequired === 'X')
                                          ? 'bg-purple-100 text-purple-800'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        LOTO: {(item.IsolationRequired === 'Y' || item.IsolationRequired === 'X') ? 'REQ' : 'NO'}
                                      </span>
                                    </div>
                                    <p className="text-[10px] font-mono text-slate-400 mt-1.5">
                                      Created by: {item.Ernam || 'SAP'} on {item.Erdat}
                                    </p>
                                  </div>

                                  <div className="flex flex-col justify-between items-start sm:items-end">
                                    <span className="text-[10px] font-mono text-slate-400">
                                      Full Dossier Deep View
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void loadPermitDetail(item.Permit_No)}
                                      className="px-3.5 py-1.5 bg-[#006398] hover:bg-[#004e78] text-white rounded-lg font-semibold text-xs transition-all shadow-xs flex items-center gap-1.5"
                                    >
                                      <span className="material-symbols-outlined text-[15px]">description</span>
                                      <span>View permit details</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {hasSearched && (
              <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                {/* Left: Range text & Page Size Selector */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-slate-600 font-mono">
                    Showing <span className="font-bold text-slate-900">{totalCount === 0 ? 0 : offset + 1}</span>–<span className="font-bold text-slate-900">{Math.min(offset + permits.length, totalCount)}</span> of <span className="font-bold text-[#006398]">{totalCount}</span> permits
                    {totalCount > 0 && (
                      <span className="text-slate-400 ml-1.5 font-normal">
                        (Page {Math.floor(offset / pageSize) + 1} of {Math.max(1, Math.ceil(totalCount / pageSize))})
                      </span>
                    )}
                  </span>

                  <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                    <span className="text-[11px] font-mono text-slate-400">Per page:</span>
                    <select
                      value={pageSize}
                      disabled={loading}
                      onChange={e => {
                        const newSize = Number(e.target.value);
                        setPageSize(newSize);
                        void loadPermitList(0, categoryFilter, statusFilter, newSize);
                      }}
                      className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-mono font-bold text-slate-700 focus:outline-none focus:border-[#006398] cursor-pointer shadow-2xs"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                {/* Right: Direct Page Navigation Controls */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* First Page */}
                  <button
                    type="button"
                    disabled={offset === 0 || loading}
                    onClick={() => void loadPermitList(0)}
                    title="First Page"
                    className="p-1 sm:px-2 sm:py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white shadow-2xs flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[16px]">first_page</span>
                  </button>

                  {/* Previous Page */}
                  <button
                    type="button"
                    disabled={offset === 0 || loading}
                    onClick={() => void loadPermitList(Math.max(0, offset - pageSize))}
                    title="Previous Page"
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white shadow-2xs flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                    <span className="hidden sm:inline">Prev</span>
                  </button>

                  {/* Page Numbers */}
                  {(() => {
                    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
                    const currentPage = Math.floor(offset / pageSize) + 1;
                    const pages: (number | string)[] = [];

                    if (totalPages <= 6) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      if (currentPage > 3) pages.push('dots-1');
                      const start = Math.max(2, currentPage - 1);
                      const end = Math.min(totalPages - 1, currentPage + 1);
                      for (let i = start; i <= end; i++) {
                        if (!pages.includes(i)) pages.push(i);
                      }
                      if (currentPage < totalPages - 2) pages.push('dots-2');
                      if (!pages.includes(totalPages)) pages.push(totalPages);
                    }

                    return pages.map(p => {
                      if (typeof p === 'string') {
                        return (
                          <span key={p} className="px-1 text-slate-400 font-mono text-xs">
                            …
                          </span>
                        );
                      }
                      const pageNum = p;
                      const isActive = pageNum === currentPage;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          disabled={loading}
                          onClick={() => void loadPermitList((pageNum - 1) * pageSize)}
                          className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[#006398] text-white shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    });
                  })()}

                  {/* Next Page */}
                  <button
                    type="button"
                    disabled={offset + pageSize >= totalCount || loading || permits.length === 0}
                    onClick={() => void loadPermitList(offset + pageSize)}
                    title="Next Page"
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white shadow-2xs flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                  </button>

                  {/* Last Page */}
                  <button
                    type="button"
                    disabled={offset + pageSize >= totalCount || loading || permits.length === 0}
                    onClick={() => {
                      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
                      void loadPermitList((totalPages - 1) * pageSize);
                    }}
                    title="Last Page"
                    className="p-1 sm:px-2 sm:py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white shadow-2xs flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[16px]">last_page</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODE: DETAILED PERMIT DISPLAY / DOSSIER VIEW */}
      {/* ========================================================================= */}
      {viewMode === 'detail' && selectedPermit && (
        <div>
          <div className="no-print space-y-4">
            {/* Executive Dossier Header Card - Streamlined & Compact */}
          <div className="bg-gradient-to-br from-white via-[#fafcff] to-sky-50/25 rounded-2xl border border-slate-200/90 shadow-[0_2px_4px_rgba(15,23,42,0.03),0_8px_20px_-4px_rgba(0,99,152,0.07)] p-4 sm:p-5 relative overflow-hidden">
            {/* Top Row: Permit Title, Badges, and Action Buttons */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200/70">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#006398] to-[#004266] text-white flex items-center justify-center shadow-md shrink-0">
                  <span className="material-symbols-outlined text-[24px]">
                    {getCategoryInfo(selectedPermit.PermitType).icon}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-bold font-mono text-slate-900 flex items-center gap-1.5">
                      <span>PTW #{selectedPermit.Permit_No}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedPermit.Permit_No, 'Permit #')}
                        className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                        title="Copy Permit Number"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {copiedText === selectedPermit.Permit_No ? 'check' : 'content_copy'}
                        </span>
                      </button>
                    </h2>

                    {renderStatusBadge(selectedPermit.Status)}

                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#006398]/10 text-[#006398] border border-[#006398]/20 shadow-xs flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">{getCategoryInfo(selectedPermit.PermitType).icon}</span>
                      <span>{getCategoryInfo(selectedPermit.PermitType).label}</span>
                    </span>

                    {/* Additional Sub-categories */}
                    {selectedPermit._WorkType && selectedPermit._WorkType.length > 0 && (
                      selectedPermit._WorkType
                        .filter(wt => {
                          if (!wt.WorkType) return false;
                          const wtCat = PERMIT_CATEGORIES.find(c => c.code === wt.WorkType || c.sapCode === wt.WorkType);
                          const primaryCat = PERMIT_CATEGORIES.find(c => c.code === selectedPermit.PermitType || c.sapCode === selectedPermit.PermitType);
                          if (wtCat && primaryCat) {
                            return wtCat.sapCode !== primaryCat.sapCode;
                          }
                          return wt.WorkType !== selectedPermit.PermitType;
                        })
                        .map(wt => (
                          <span
                            key={wt.SeqNo || wt.WorkType}
                            className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-sky-50 text-[#006398] border border-sky-200 shadow-xs flex items-center gap-1"
                            title={`Additional Work Category: ${getCategoryInfo(wt.WorkType).label} (${wt.WorkType})`}
                          >
                            <span className="material-symbols-outlined text-[12px]">{getCategoryInfo(wt.WorkType).icon}</span>
                            <span>+{getCategoryInfo(wt.WorkType).label}</span>
                          </span>
                        ))
                    )}
                  </div>

                  <p className="mt-1 text-sm font-medium text-slate-700 max-w-4xl leading-relaxed">
                    {selectedPermit.JobDesc}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="no-print flex flex-wrap items-center gap-2 self-start lg:self-center">
                {(selectedPermit.Status === 'REJT' || selectedPermit.Status === 'REJC') && (
                  <div className="flex items-center gap-1.5">
                    {onRevisePermit && (
                      <button
                        type="button"
                        onClick={() => onRevisePermit(selectedPermit)}
                        className="px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
                        title="Open full 8-step permit editor to revise rejected fields, crew muster, or PPE"
                      >
                        <span className="material-symbols-outlined text-[16px] text-amber-700">edit_note</span>
                        <span>Revise in Editor</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleOpenResubmitModal}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                      title="Quickly edit header values and resubmit to approval workflow via SAP bound action"
                    >
                      <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                      <span>Quick Edit & Resubmit</span>
                    </button>
                  </div>
                )}

                {updatingPrereq && (
                  <span className="text-[11px] font-mono text-amber-700 bg-amber-50 px-2 py-1 rounded-xl border border-amber-200 flex items-center gap-1 animate-pulse shadow-xs">
                    <span className="material-symbols-outlined text-[13px]">sync</span>
                    <span>Syncing...</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[15px]">print</span>
                  <span>Print permit</span>
                </button>

                <button
                  type="button"
                  disabled={loadingDetail || updatingPrereq}
                  onClick={() => void loadPermitDetail(selectedPermit.Permit_No)}
                  className="px-3.5 py-1.5 border border-slate-300 hover:border-[#006398] hover:text-[#006398] bg-white text-slate-700 rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span className={`material-symbols-outlined text-[15px] ${loadingDetail ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                  <span>Refresh</span>
                </button>


              </div>
            </div>

            {/* At-a-Glance 4-Card Operational Summary Grid */}
            <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Location & Execution Agency */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Location & Execution
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-slate-400">factory</span>
                </div>
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-800">
                    <span>Plant {selectedPermit.Werks}</span>
                    <span className="text-slate-300 mx-1">·</span>
                    <span className="text-[#006398]">{selectedPermit.AreaLoc || 'Area N/A'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Dept: <strong className="text-slate-700">{selectedPermit.ExecDept || '—'}</strong> · WC: <strong className="text-slate-700">{selectedPermit.Arbpl || '—'}</strong>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Agency: <span className="font-semibold text-slate-700">{selectedPermit.ExecAgency === 'CONT' ? 'Contractor' : 'Company (EMP)'}</span>
                  </div>
                </div>
              </div>

              {/* 2. SAP Orders & Technical Linkage */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    SAP Order Linkage
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-slate-400">link</span>
                </div>
                <div className="text-xs space-y-0.5 font-mono">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <span>MO: {selectedPermit.Aufnr || 'No Order Linked'}</span>
                    {selectedPermit.Aufnr && (
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedPermit.Aufnr, 'MO #')}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {copiedText === selectedPermit.Aufnr ? 'check' : 'content_copy'}
                        </span>
                      </button>
                    )}
                    {selectedPermit.Auart && (
                      <span className="px-1 py-0.2 bg-indigo-50 text-indigo-700 rounded text-[10px] border border-indigo-200">
                        {selectedPermit.Auart}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Eq: <strong className="text-slate-700">{selectedPermit.Equnr || '—'}</strong>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate" title={selectedPermit.Tplnr || '—'}>
                    FL: <span className="text-slate-700">{selectedPermit.Tplnr || '—'}</span>
                  </div>
                </div>
              </div>

              {/* 3. Validity Window (IST) */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs uppercase tracking-wide text-slate-600 font-semibold">
                    Validity (IST)
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-slate-400">schedule</span>
                </div>
                {(() => {
                  const val = calculateValidity(selectedPermit.ValidFromD, selectedPermit.ValidFromT, selectedPermit.ValidToD, selectedPermit.ValidToT);
                  return (
                    <div className="text-xs space-y-1">
                      <div className="font-mono text-[11px] text-slate-700 font-semibold">
                        <span>{selectedPermit.ValidFromD} {selectedPermit.ValidFromT?.slice(0, 5)}</span>
                        <span className="text-slate-300 mx-1">→</span>
                        <span>{selectedPermit.ValidToD} {selectedPermit.ValidToT?.slice(0, 5)}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            val.percent > 85 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${val.percent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className={`font-bold ${val.color}`}>{val.text}</span>
                        <span className="text-slate-400">{selectedPermit.Shift || 'GENERAL'}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 4. Safety Prerequisite Gateways */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Safety Gateways
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-slate-400">shield</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border shadow-xs ${
                    (selectedPermit.GasTestRequired === 'Y' || selectedPermit.GasTestRequired === 'X')
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>
                    Gas: {(selectedPermit.GasTestRequired === 'Y' || selectedPermit.GasTestRequired === 'X') ? `REQ (${selectedPermit.GasTestFreqHr || 2}h)` : 'NO'}
                  </span>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border shadow-xs ${
                    (selectedPermit.IsolationRequired === 'Y' || selectedPermit.IsolationRequired === 'X')
                      ? 'bg-purple-50 text-purple-800 border-purple-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>
                    LOTO: {(selectedPermit.IsolationRequired === 'Y' || selectedPermit.IsolationRequired === 'X') ? 'POSITIVE' : 'NO'}
                  </span>

                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-50 text-slate-700 border border-slate-200">
                    Crew: {selectedPermit.PersonsQty || selectedPermit._Worker?.length || 0} Pax
                  </span>
                </div>
              </div>
            </div>

            {/* 4-Level Safety & Authorization Clearance Pipeline Banner in Detailed Dossier */}
            {(() => {
              const dossierClearance = getPermitClearanceLevels(selectedPermit);
              return (
                <div className="mt-3.5 p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-[#006398]/10 text-[#006398]">
                        <span className="material-symbols-outlined text-[20px]">alt_route</span>
                      </span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                            Safety clearances
                          </h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${dossierClearance.overallLevelBadgeClass}`}>
                            {dossierClearance.overallLevelLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Next required action: <strong className="text-slate-800 font-semibold">{dossierClearance.nextActionText}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-slate-500">
                        Clearance Progress: <strong className="text-slate-900">{dossierClearance.completedCount} of {dossierClearance.totalApplicableLevels}</strong>
                      </span>
                      <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                        <div
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.round((dossierClearance.completedCount / dossierClearance.totalApplicableLevels) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[#006398]">View clearance details</summary>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {dossierClearance.levels.map(lvl => {
                      const targetTab =
                        lvl.id === 'gas'
                          ? 'gastest'
                          : lvl.id === 'approver' || lvl.id === 'accepter' || lvl.id === 'area_operator'
                          ? 'approvals'
                          : 'overview';

                      return (
                        <div
                          key={lvl.id}
                          role="button"
                          tabIndex={0}
                          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveTab(targetTab as TabType); } }}
                          onClick={() => setActiveTab(targetTab as any)}
                          className={`p-3 rounded-xl border flex flex-col justify-between transition-all cursor-pointer hover:shadow-xs ${
                            lvl.isComplete && !lvl.isNotApplicable
                              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950 hover:bg-emerald-50'
                              : lvl.isPendingCurrent
                              ? 'bg-amber-50/80 border-amber-300 text-amber-950 ring-2 ring-amber-400/20 shadow-xs'
                              : lvl.isRejected
                              ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                              : lvl.isNotApplicable
                              ? 'bg-slate-50 border-slate-200 text-slate-500'
                              : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-mono uppercase tracking-wider font-bold opacity-75">
                                Level {lvl.stepNumber}: {lvl.shortLabel}
                              </span>
                              <span className={`material-symbols-outlined text-[18px] ${
                                lvl.isComplete && !lvl.isNotApplicable
                                  ? 'text-emerald-600'
                                  : lvl.isPendingCurrent
                                  ? 'text-amber-600 animate-pulse'
                                  : lvl.isRejected
                                  ? 'text-rose-600'
                                  : 'text-slate-400'
                              }`}>
                                {lvl.icon}
                              </span>
                            </div>

                            <div className="font-bold text-xs">
                              {lvl.badgeLabel}
                            </div>

                            <p className={`text-sm leading-relaxed mt-1 whitespace-pre-wrap break-words ${lvl.isRejected ? 'text-rose-800' : 'text-slate-600'}`}>
                              {lvl.detailText}
                            </p>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-current/10 flex items-center justify-between text-[10px] font-mono opacity-80">
                            <span>Role: <strong>{lvl.responsibleRole}</strong></span>
                            <span className="flex items-center gap-0.5 text-[#006398] font-bold">
                              <span>Inspect</span>
                              <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div></details>
                </div>
              );
            })()}

            {/* Embedded Prerequisite Actions Panel for eligible roles */}
            {(isUserAdmin || userRoles.some(r => ['ZPTW_GAS_TESTER', 'PTW_GAS_TESTER', 'ZPTW_SAFETY_OFFICER', 'PTW_SAFETY_OFFICER', 'PTW_SAFE', 'ZPTW_ADMIN', 'PTW_ADMIN'].includes(r))) && (
              <div className="mt-3 pt-3 border-t border-slate-200/60">
                <PrerequisitePanel
                  key={`${selectedPermit.Permit_No}:${selectedPermit['@odata.etag'] || ''}`}
                  permit={selectedPermit}
                  module="permit-details"
                  user={user}
                  onBusyChange={setUpdatingPrereq}
                  onUpdated={updated => {
                    setSelectedPermit(current =>
                      current?.Permit_No === updated.Permit_No ? updated : current
                    );
                  }}
                />
              </div>
            )}
          </div>

          {/* Sticky Dossier Navigation Bar with Quick Section Jump */}
          <div className="no-print sticky top-16 z-30 bg-white/95 backdrop-blur-md p-2 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            {/* Tabs List */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
              {[
                { id: 'overview', label: 'Overview', icon: 'factory', badge: null },
                {
                  id: 'procedure',
                  label: 'Checklists',
                  icon: 'fact_check',
                  badge: (selectedPermit._Safety?.length || 0) + (selectedPermit._CHK?.length || 0),
                  hasWarning: selectedPermit._Safety?.some(s => s.Response === 'NO')
                },
                {
                  id: 'crew_hazards',
                  label: 'Crew & hazards',
                  icon: 'group',
                  badge: `${selectedPermit._Worker?.length || 0} / ${selectedPermit._HazardControl?.length || 0}`
                },
                {
                  id: 'ppe',
                  label: 'PPE',
                  icon: 'health_and_safety',
                  badge: selectedPermit._PPE?.length
                },
                {
                  id: 'isolation',
                  label: 'Isolation',
                  icon: 'lock',
                  badge: selectedPermit._Isolation?.reduce((acc, c) => acc + (c._Item?.length || 0), 0) || (selectedPermit.IsolationRequired === 'Y' || selectedPermit.IsolationRequired === 'X' ? 'REQ' : null)
                },
                {
                  id: 'gastest',
                  label: 'Gas tests',
                  icon: 'science',
                  badge: selectedPermit._GasTest?.length || ((selectedPermit.GasTestRequired === 'Y' || selectedPermit.GasTestRequired === 'X') ? 'REQ' : null)
                },
                {
                  id: 'approvals',
                  label: 'Approvals',
                  icon: 'draw',
                  badge: selectedPermit._Approval?.length
                },
                {
                  id: 'renewals_audit',
                  label: 'History',
                  icon: 'history',
                  badge: selectedPermit._AuditLog?.length
                },
              ].map(tab => (
                <button
                  key={tab.id}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                  type="button"
                  onClick={() => { setActiveTab(tab.id as TabType); document.getElementById('permit-section-content')?.scrollIntoView({ block: 'start' }); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-[#006398] text-white shadow-xs'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.badge !== null && tab.badge !== undefined && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      activeTab === tab.id
                        ? 'bg-white/25 text-white'
                        : tab.hasWarning
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-slate-200/80 text-slate-700'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* JHA activity filter */}
            {activeTab === 'crew_hazards' && <div className="relative shrink-0">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-[15px] text-slate-400">
                search
              </span>
              <input
                type="text"
                value={dossierSearch}
                onChange={e => setDossierSearch(e.target.value)}
                aria-label="Filter JHA activities"
                placeholder="Filter JHA activities…"
                className="w-full sm:w-44 pl-7 pr-7 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#006398]"
              />
              {dossierSearch && (
                <button
                  type="button"
                  onClick={() => setDossierSearch('')}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>}
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: OVERVIEW & PLANT CONTEXT */}
          {/* ========================================================================= */}
          <div id="permit-section-content" className="scroll-mt-44" />
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Plant & Equipment Context */}
              <SectionCard
                theme="blue"
                sectionTag="SECTION 1.1"
                title="Plant, Equipment & Location Context"
                subtitle="Functional location hierarchy and master equipment tags."
                icon="factory"
              >
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Plant (Werks)</dt>
                    <dd className="font-bold text-slate-800 mt-0.5">{selectedPermit.Werks || '—'}</dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Work Area (AreaLoc)</dt>
                    <dd className="font-bold text-slate-800 mt-0.5">{selectedPermit.AreaLoc || '—'}</dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400 font-mono text-[10px]">Equipment No (Equnr)</dt>
                      {selectedPermit.Equnr && (
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedPermit.Equnr, 'Equipment No')}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {copiedText === selectedPermit.Equnr ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      )}
                    </div>
                    <dd className="font-mono font-bold text-slate-800 mt-0.5">{selectedPermit.Equnr || 'Not linked'}</dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400 font-mono text-[10px]">Functional location</dt>
                      {selectedPermit.Tplnr && (
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedPermit.Tplnr, 'Functional Location')}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {copiedText === selectedPermit.Tplnr ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      )}
                    </div>
                    <dd className="font-mono font-bold text-slate-800 mt-0.5 truncate" title={selectedPermit.Tplnr}>
                      {selectedPermit.Tplnr || '—'}
                    </dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Work Center (Arbpl)</dt>
                    <dd className="font-mono text-slate-800 mt-0.5">{selectedPermit.Arbpl || '—'}</dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Assembly Tag</dt>
                    <dd className="font-mono text-slate-800 mt-0.5">{selectedPermit.Assembly || '—'}</dd>
                  </div>
                </dl>
              </SectionCard>

              {/* Supervision, Department & Comments */}
              <SectionCard
                theme="slate"
                sectionTag="SECTION 1.2"
                title="Execution, Agency & Responsibility"
                subtitle="Field supervision, operating shift, and requester remarks."
                icon="badge"
              >
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Execution Agency</dt>
                    <dd className="font-bold text-slate-800 mt-0.5">
                      {selectedPermit.ExecAgency === 'CONT' ? 'Contractor Firm' : 'Company Employees (EMP)'}
                    </dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Execution Department</dt>
                    <dd className="font-bold text-slate-800 mt-0.5">{selectedPermit.ExecDept || '—'}</dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Supervisor Name</dt>
                    <dd className="font-semibold text-slate-800 mt-0.5">{selectedPermit.SupvName || '—'}</dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Supervisor Phone</dt>
                    <dd className="font-mono text-slate-800 mt-0.5">
                      {selectedPermit.SupvPhone ? (
                        <a href={`tel:${selectedPermit.SupvPhone}`} className="text-[#006398] hover:underline flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">call</span>
                          <span>{selectedPermit.SupvPhone}</span>
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Safety Officer</dt>
                    <dd className="font-semibold text-slate-800 mt-0.5">{selectedPermit.SafetyOfficer || '—'}</dd>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <dt className="text-slate-400 font-mono text-[10px]">Work Shift</dt>
                    <dd className="font-mono font-bold text-slate-800 mt-0.5">{selectedPermit.Shift || 'GENERAL'}</dd>
                  </div>
                </dl>

                {/* Special Safety Roles & Plan References */}
                {(selectedPermit.FireWatchName || selectedPermit.StandByName || selectedPermit.RiggingPlanRescuePlan || selectedPermit.ChemicalContent) && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-2">
                      Special Safety Roles & Plan References
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {selectedPermit.FireWatchName && (
                        <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/80">
                          <dt className="text-amber-800 font-mono text-[10px] font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">local_fire_department</span>
                            <span>Fire Watch</span>
                          </dt>
                          <dd className="font-semibold text-slate-900 mt-0.5">
                            {selectedPermit.FireWatchName}
                            {selectedPermit.FireWatchContact && selectedPermit.FireWatchContact !== '0' && (
                              <span className="font-mono text-slate-600 font-normal"> · Ph: {selectedPermit.FireWatchContact}</span>
                            )}
                          </dd>
                        </div>
                      )}
                      {selectedPermit.StandByName && (
                        <div className="bg-sky-50/60 p-2.5 rounded-xl border border-sky-200/80">
                          <dt className="text-sky-800 font-mono text-[10px] font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">person_check</span>
                            <span>Standby Person</span>
                          </dt>
                          <dd className="font-semibold text-slate-900 mt-0.5">
                            {selectedPermit.StandByName}
                            {selectedPermit.StandByContact && selectedPermit.StandByContact !== '0' && (
                              <span className="font-mono text-slate-600 font-normal"> · Ph: {selectedPermit.StandByContact}</span>
                            )}
                          </dd>
                        </div>
                      )}
                      {selectedPermit.RiggingPlanRescuePlan && (
                        <div className="bg-purple-50/60 p-2.5 rounded-xl border border-purple-200/80">
                          <dt className="text-purple-800 font-mono text-[10px] font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">assignment</span>
                            <span>Rigging / Rescue Plan</span>
                          </dt>
                          <dd className="font-mono font-bold text-slate-900 mt-0.5">
                            {selectedPermit.RiggingPlanRescuePlan}
                          </dd>
                        </div>
                      )}
                      {selectedPermit.ChemicalContent && (
                        <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-200/80">
                          <dt className="text-emerald-800 font-mono text-[10px] font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">science</span>
                            <span>Chemical / Line Content</span>
                          </dt>
                          <dd className="font-semibold text-slate-900 mt-0.5">
                            {selectedPermit.ChemicalContent}
                          </dd>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Requester Comments */}
                <div className="pt-2">
                  <dt className="text-slate-400 font-mono text-[10px]">Requester Scope & Remarks</dt>
                  <dd className="mt-1 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 leading-relaxed font-sans">
                    {selectedPermit.CreatorComment || 'No additional remarks provided during creation.'}
                  </dd>
                </div>
              </SectionCard>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: PROCEDURE & JSA SAFETY PREPARATIONS (C-F) */}
          {/* ========================================================================= */}
          {activeTab === 'procedure' && (
            <div className="space-y-4">
              <SectionCard
                theme="emerald"
                sectionTag="SECTION C–F"
                title="Safety Preparations, JSA & Statutory Checks"
                subtitle={`Standard Operating Procedure ${PROCEDURE.id}`}
                icon="fact_check"
                badge={
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {selectedPermit._Safety?.length || 0} Check Items
                  </span>
                }
              >
                {!selectedPermit._Safety || selectedPermit._Safety.length === 0 ? (
                  <p className="p-8 text-center text-xs text-slate-400">No safety check records recorded in this permit.</p>
                ) : (
                  <div>
                    {/* In-Table Response Filter Chips & Sub-Search */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono text-slate-400 mr-1">Filter Checks:</span>
                        {[
                          { id: 'ALL', label: `All (${selectedPermit._Safety.length})` },
                          { id: 'YES', label: `YES (${selectedPermit._Safety.filter(s => s.Response === 'YES').length})` },
                          { id: 'NO', label: `NO / Pending (${selectedPermit._Safety.filter(s => s.Response === 'NO').length})` },
                          { id: 'NA', label: `N/A (${selectedPermit._Safety.filter(s => s.Response === 'NA').length})` },
                        ].map(f => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setJsaFilter(f.id as any)}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all ${
                              jsaFilter === f.id
                                ? f.id === 'NO'
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'bg-[#006398] text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          value={jsaSearch}
                          onChange={e => setJsaSearch(e.target.value)}
                          placeholder="Search requirement..."
                          className="w-44 pl-2.5 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-mono text-[11px]">
                            <th className="p-2.5 w-12 text-center">#</th>
                            <th className="p-2.5 w-24">Item Code</th>
                            <th className="p-2.5">Safety Requirement / Description</th>
                            <th className="p-2.5 w-32">Response</th>
                            <th className="p-2.5">Details / Reference / Remarks</th>
                            <th className="p-2.5 w-32">Verified By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {selectedPermit._Safety
                            .filter(row => {
                              if (jsaFilter !== 'ALL' && row.Response !== jsaFilter) return false;
                              if (jsaSearch.trim()) {
                                const q = jsaSearch.toLowerCase();
                                return (
                                  (row.ValueText && row.ValueText.toLowerCase().includes(q)) ||
                                  (row.ItemCode && row.ItemCode.toLowerCase().includes(q)) ||
                                  (row.Remarks && row.Remarks.toLowerCase().includes(q))
                                );
                              }
                              return true;
                            })
                            .map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                                <td className="p-2.5 font-mono text-slate-400 text-center">{row.ItemNo || idx + 1}</td>
                                <td className="p-2.5 font-mono font-bold text-slate-700">{row.ItemCode}</td>
                                <td className="p-2.5 font-semibold text-slate-900">{row.ValueText || row.ItemCode}</td>
                                <td className="p-2.5 whitespace-nowrap">
                                  {row.Response === 'YES' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      <span className="material-symbols-outlined text-[12px]">check</span>
                                      YES (Complete)
                                    </span>
                                  ) : row.Response === 'NO' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                      <span className="material-symbols-outlined text-[12px]">close</span>
                                      NO (Pending)
                                    </span>
                                  ) : row.Response === 'NA' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                      N/A
                                    </span>
                                  ) : (
                                    <span className="font-mono text-slate-400">{row.Response || '—'}</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-slate-700">
                                  {row.Remarks || row.ReferenceNo || '—'}
                                </td>
                                <td className="p-2.5 font-mono text-slate-500 text-[11px]">
                                  {row.VerifiedBy || '—'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* Compliance Questionnaires (_CHK) */}
              {selectedPermit._CHK && selectedPermit._CHK.length > 0 && (
                <SectionCard
                  theme="blue"
                  sectionTag="CHECKLISTS"
                  title="Compliance Questionnaire Responses (_CHK)"
                  subtitle="Category specific statutory checklists recorded in SAP child table _CHK."
                  icon="checklist"
                  badge={
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-sky-50 text-sky-800 border border-sky-200">
                      {selectedPermit._CHK.length} Answers
                    </span>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono text-[11px]">
                          <th className="p-2.5 w-12 text-center">#</th>
                          <th className="p-2.5 w-28">Category</th>
                          <th className="p-2.5 w-36">Questionnaire ID</th>
                          <th className="p-2.5 w-32">Response</th>
                          <th className="p-2.5">Remarks / Verification Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {selectedPermit._CHK.map((chk, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="p-2.5 font-mono text-slate-400 text-center">{idx + 1}</td>
                            <td className="p-2.5 font-mono font-bold text-slate-700">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {chk.PermitType}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono font-bold text-[#006398]">{chk.QuestionnaireId}</td>
                            <td className="p-2.5 whitespace-nowrap">
                              {chk.Answer === 'YES' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <span className="material-symbols-outlined text-[12px]">check</span>
                                  YES (Compliant)
                                </span>
                              ) : chk.Answer === 'NO' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                  <span className="material-symbols-outlined text-[12px]">close</span>
                                  NO (Non-Compliant)
                                </span>
                              ) : chk.Answer === 'NA' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  N/A
                                </span>
                              ) : (
                                <span className="font-mono text-slate-500 font-bold">{chk.Answer || '—'}</span>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-700">
                              {chk.Remarks || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: CREW & HAZARD CONTROLS (E & WORKERS) + JHA MATRIX (HSE/SAF/F/05) */}
          {/* ========================================================================= */}
          {activeTab === 'crew_hazards' && (
            <div className="space-y-4">
              {/* Crew Register & Hazard Controls Overview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Crew Register */}
                <SectionCard
                  theme="indigo"
                  sectionTag="CREW"
                  title="Authorized Crew Register (_Worker)"
                  subtitle="Personnel roster authorized for work execution under this permit."
                  icon="engineering"
                  badge={
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {selectedPermit._Worker?.length || 0} Crew Members
                    </span>
                  }
                >
                  {!selectedPermit._Worker || selectedPermit._Worker.length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-400">No crew members registered.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono text-[10px]">
                            <th className="p-2.5">Name</th>
                            <th className="p-2.5">Emp ID</th>
                            <th className="p-2.5">Type</th>
                            <th className="p-2.5">Contractor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedPermit._Worker.map((w, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="p-2.5 font-semibold text-slate-900">{w.WorkerName}</td>
                              <td className="p-2.5 font-mono text-slate-600">{w.EmpId || '—'}</td>
                              <td className="p-2.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                  w.WorkerTypeCode === 'EMP' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {w.WorkerTypeCode === 'EMP' ? 'Company' : 'Contractor'}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-500">{w.ContractorName || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                {/* Hazard & Control Matrix */}
                <SectionCard
                  theme="amber"
                  sectionTag="HAZARDS"
                  title="Hazard Controls & Interactive 5×5 Risk Assessment Matrix (_HazardControl)"
                  subtitle="Identified task hazards with live 5×5 Risk Assessment Matrix ratings and verified mitigations."
                  icon="warning"
                  badge={
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      {selectedPermit._HazardControl?.length || 0} Controls
                    </span>
                  }
                >
                  {!selectedPermit._HazardControl || selectedPermit._HazardControl.length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-400">No hazards identified.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedPermit._HazardControl.map((h, i) => {
                        const hRisk = extractHazardRisk(h);
                        const isMax = dynamicHazardRisk && hRisk.score === dynamicHazardRisk.score && hRisk.score > 0;
                        return (
                          <div
                            key={i}
                            className={`p-3 rounded-xl border text-xs transition-all ${
                              isMax
                                ? hRisk.band === 'RED'
                                  ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-400/25 shadow-xs'
                                  : hRisk.band === 'YELLOW'
                                  ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/25 shadow-xs'
                                  : hRisk.band === 'CYAN'
                                  ? 'bg-cyan-50/80 border-cyan-300 ring-2 ring-cyan-400/25 shadow-xs'
                                  : 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400/25 shadow-xs'
                                : 'bg-slate-50 border-slate-200/80'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{h.HazardDesc}</span>
                                {h.HazardCode && (
                                  <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-semibold bg-slate-200/70 text-slate-700">
                                    {h.HazardCode}
                                  </span>
                                )}
                                {isMax && (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-wider bg-slate-900 text-white shadow-2xs">
                                    MAX RISK
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {hRisk.s > 0 && hRisk.l > 0 && (
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-white/90 border border-slate-300 text-slate-800 shadow-2xs">
                                    (S:{hRisk.s} × L:{hRisk.l})
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  hRisk.band === 'RED'
                                    ? 'bg-rose-600 text-white border border-rose-700 shadow-2xs'
                                    : hRisk.band === 'YELLOW'
                                    ? 'bg-amber-400 text-slate-900 border border-amber-500 shadow-2xs'
                                    : hRisk.band === 'CYAN'
                                    ? 'bg-cyan-400 text-slate-900 border border-cyan-500 shadow-2xs'
                                    : 'bg-emerald-500 text-white border border-emerald-600 shadow-2xs'
                                }`}>
                                  SCORE {hRisk.score} · {hRisk.level.toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <p className="text-slate-600 font-sans leading-relaxed">
                              <strong className="text-slate-700">Mitigation Control:</strong> {h.ControlDesc}
                            </p>
                            {h.Remarks && (
                              <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                                {h.Remarks}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>
              </div>

              {/* Job Hazard Analysis (JHA Matrix / HSE/SAF/F/05) */}
              <div className="space-y-4 pt-1">
                {/* 1. Header & Configuration Toolbar */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[22px]">security</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-100 text-teal-800 border border-teal-300">
                          FORMAT: HSE/SAF/F/05
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          STD: GFL/COR/EHSS
                        </span>
                        {selectedJhaTemplateId === detectedJhaTemplate.id ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                            Auto-Matched for {selectedPermit.PermitType}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedJhaTemplateId(detectedJhaTemplate.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100"
                            title="Click to reset to auto-detected template"
                          >
                            <span className="material-symbols-outlined text-[12px]">restart_alt</span>
                            Custom Selection (Reset to Recommended)
                          </button>
                        )}
                      </div>
                      <h3 className="mt-1 text-sm font-bold text-slate-900">
                        {currentJhaTemplate.title}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        {currentJhaTemplate.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Right controls: Template Selector Dropdown & Direct Print */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex flex-col">
                      <label htmlFor="jha-template-picker" className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                        Select JHA Standard
                      </label>
                      <select
                        id="jha-template-picker"
                        value={selectedJhaTemplateId}
                        onChange={e => setSelectedJhaTemplateId(e.target.value)}
                        className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 focus:bg-white focus:outline-none focus:border-teal-600 shadow-xs cursor-pointer"
                      >
                        {JHA_TEMPLATES.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setPrintWithJha(true);
                        setShowPrintModal(true);
                      }}
                      className="self-end px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title={applicableJhas.length > 1 ? `Open print preview with all ${applicableJhas.length} applicable JHA sheets (Primary + Additional _WorkType)` : 'Print official JHA sheet'}
                    >
                      <span className="material-symbols-outlined text-[16px]">print</span>
                      <span>
                        {applicableJhas.length > 1
                          ? `Print All Applicable JHAs (${applicableJhas.length})`
                          : 'Print JHA Sheet'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Multi-JHA Quick Selector for Additional WorkTypes attached via _WorkType / additionalTypes */}
                {applicableJhas.length > 1 && (
                  <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined text-[17px] text-amber-500">layers</span>
                        <span>Applicable JHAs ({applicableJhas.length}):</span>
                      </span>
                      {applicableJhas.map((item) => {
                        const isActive = selectedJhaTemplateId === item.template.id;
                        return (
                          <button
                            key={item.template.id}
                            type="button"
                            onClick={() => setSelectedJhaTemplateId(item.template.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                              isActive
                                ? 'bg-teal-700 text-white border-teal-800 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                            title={`${item.sourceLabel} — Click to inspect safety matrix & controls`}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {isActive ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                            <span>{item.categoryLabel}</span>
                            {item.isPrimary ? (
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                                  isActive
                                    ? 'bg-black/30 text-teal-100'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                Primary
                              </span>
                            ) : (
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold border ${
                                  isActive
                                    ? 'bg-amber-400/30 text-amber-100 border-amber-300/40'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                _WorkType ({item.workTypeCode})
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1 shrink-0">
                      <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
                      <span>All attached worktype JHAs available for print</span>
                    </div>
                  </div>
                )}

                {/* 2. Key Statistical Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs">
                    <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">Standard Reference</div>
                    <div className="mt-0.5 text-xs font-mono font-bold text-slate-800">HSE/SAF/F/05</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">GFL Corporate Standard</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs">
                    <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">Activities Analyzed</div>
                    <div className="mt-0.5 text-sm font-bold text-teal-700 font-mono">
                      {currentJhaTemplate.rows.length} Job Steps
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Sequential hazard evaluation</div>
                  </div>
                  {/* Max Residual Risk Card Styled by 5×5 Risk Matrix */}
                  <div className={`p-3 rounded-xl border transition-all ${maxInitialRiskStyle.cardClass}`}>
                    <div className="flex items-center justify-between">
                      <div className={`text-[10px] font-mono uppercase font-bold ${maxInitialRiskStyle.titleClass}`}>
                        Max Residual Risk
                      </div>
                      {maxInitialS > 0 && maxInitialL > 0 && (
                        <span className="font-mono text-[9px] font-extrabold px-1.5 py-0.2 rounded border bg-white/75 shadow-2xs text-slate-800">
                          S:{maxInitialS} × L:{maxInitialL}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                      <span className={`text-xl font-black font-mono tracking-tight ${maxInitialRiskStyle.scoreClass}`}>
                        {maxInitialScore}
                      </span>
                      <span className={`text-[10px] font-sans font-extrabold px-2 py-0.5 rounded-md border ${maxInitialRiskStyle.badgeClass}`}>
                        {maxInitialLevel}
                      </span>
                      {maxInitialS > 0 && maxInitialL > 0 && (
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${maxInitialRiskStyle.calcClass}`}>
                          (S:{maxInitialS} × L:{maxInitialL})
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${maxInitialRiskStyle.subtextClass}`}>
                      {dynamicHazardRisk
                        ? `Live 5×5 Matrix from Hazard Controls · ${maxInitialRiskStyle.matrixTag}`
                        : `Prior to control barriers · ${maxInitialRiskStyle.matrixTag}`}
                    </div>
                  </div>

                  {/* Controlled Residual Risk Card */}
                  <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/60 p-3 rounded-xl border border-emerald-300 ring-1 ring-emerald-400/20 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-mono uppercase text-emerald-800 font-bold">Controlled Residual</div>
                      <span className="font-mono text-[9px] font-extrabold px-1.5 py-0.2 rounded border bg-white/75 shadow-2xs text-emerald-800">
                        ALARP
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-xl font-black text-emerald-950 font-mono tracking-tight">
                        {maxResidualScore}
                      </span>
                      <span className="text-[10px] font-sans font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 shadow-2xs">
                        ALARP (Controlled)
                      </span>
                    </div>
                    <div className="text-[10px] text-emerald-700 font-medium mt-0.5">Post-barrier verification · Tolerable</div>
                  </div>
                </div>

                {/* 3. Main Hazard & Risk Matrix Table */}
                <SectionCard
                  theme="slate"
                  sectionTag="SECTION 3"
                  title="Job Hazard Analysis & Safe Work Procedure Matrix"
                  subtitle="Detailed breakdown of activities, identified hazards, consequences, initial risk ratings, mitigation controls, and residual risk."
                  icon="view_list"
                  badge={
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-50 text-teal-800 border border-teal-200">
                      {filteredJhaRows.length} of {currentJhaTemplate.rows.length} Activities
                    </span>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-mono text-[11px]">
                          <th className="p-3 w-10 text-center">#</th>
                          <th className="p-3 w-48">Sequence of Basic Job Steps</th>
                          <th className="p-3 w-48">Potential Hazards</th>
                          <th className="p-3 w-48">Consequences / Harm</th>
                          <th className="p-3 w-28 text-center">Initial Risk</th>
                          <th className="p-3 min-w-[280px]">Recommended Mitigation Measures / Controls</th>
                          <th className="p-3 w-28 text-center">Residual Risk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {filteredJhaRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-mono font-bold text-slate-500 text-center align-top">
                              {idx + 1}
                            </td>
                            <td className="p-3 font-semibold text-slate-900 align-top">
                              {row.activity}
                            </td>
                            <td className="p-3 text-slate-700 align-top leading-relaxed">
                              {row.hazard}
                            </td>
                            <td className="p-3 text-slate-600 align-top leading-relaxed">
                              {row.consequence}
                            </td>
                            <td className="p-3 align-top text-center">
                              <div className={`p-1.5 rounded-lg border text-xs leading-tight font-sans inline-block ${
                                row.initialRisk.level === 'High'
                                  ? 'border-rose-400 bg-rose-50 text-rose-900'
                                  : row.initialRisk.level === 'Medium'
                                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                                    : row.initialRisk.level === 'Low'
                                      ? 'border-sky-400 bg-sky-50 text-sky-900'
                                      : 'border-emerald-400 bg-emerald-50 text-emerald-900'
                              }`}>
                                <div className="font-bold font-mono">
                                  {row.initialRisk.score} {row.initialRisk.level}
                                </div>
                                <div className="text-[10px] opacity-85 mt-0.5">
                                  L:{row.initialRisk.likelihood} × S:{row.initialRisk.severity}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              <ul className="space-y-1 text-slate-800">
                                {row.mitigationMeasures.map((ctrl, cIdx) => (
                                  <li key={cIdx} className="flex items-start gap-1.5 leading-relaxed">
                                    <span className="material-symbols-outlined text-[13px] text-teal-600 shrink-0 mt-0.5">
                                      check_circle
                                    </span>
                                    <span>{ctrl}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                            <td className="p-3 align-top text-center">
                              <div className={`p-1.5 rounded-lg border text-xs leading-tight font-sans inline-block ${
                                row.residualRisk.level === 'High'
                                  ? 'border-rose-400 bg-rose-50 text-rose-900'
                                  : row.residualRisk.level === 'Medium'
                                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                                    : row.residualRisk.level === 'Low'
                                      ? 'border-sky-400 bg-sky-50 text-sky-900'
                                      : 'border-emerald-400 bg-emerald-50 text-emerald-900'
                              }`}>
                                <div className="font-bold font-mono">
                                  {row.residualRisk.score} {row.residualRisk.level}
                                </div>
                                <div className="text-[10px] opacity-85 mt-0.5">
                                  L:{row.residualRisk.likelihood} × S:{row.residualRisk.severity}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                {/* 4. Additional Work-Specific Hazards & Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SectionCard
                    theme="amber"
                    sectionTag="SECTION 4.1"
                    title="Specific Hazards for this Work Area (_HazardControl)"
                    subtitle="Critical environmental and situational hazards identified during on-site assessment."
                    icon="warning"
                  >
                    {selectedPermit._HazardControl && selectedPermit._HazardControl.length > 0 ? (
                      <ul className="p-3 space-y-2">
                        {selectedPermit._HazardControl.map((hz, idx) => {
                          const hzRisk = extractHazardRisk(hz);
                          return (
                            <li key={idx} className="flex items-start gap-2 text-xs text-slate-800 bg-amber-50/50 p-2.5 rounded-lg border border-amber-100">
                              <span className="material-symbols-outlined text-[16px] text-amber-600 shrink-0 mt-0.5">
                                report_problem
                              </span>
                              <div className="flex-1">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div>
                                    <span className="font-bold text-amber-900">{hz.HazardCode || `Hazard #${idx + 1}`}: </span>
                                    <span className="leading-relaxed">{hz.HazardDesc || hz.Remarks || 'Specific hazard noted'}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {hzRisk.s > 0 && hzRisk.l > 0 && (
                                      <span className="font-mono text-[9px] font-bold px-1.5 py-0.2 rounded bg-white border border-amber-200 text-amber-900 shadow-2xs">
                                        S:{hzRisk.s} × L:{hzRisk.l}
                                      </span>
                                    )}
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                      Score {hzRisk.score || hz.RiskLevel}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-500">
                        <span className="material-symbols-outlined text-[20px] text-slate-400 block mb-1">checklist</span>
                        <span>No custom hazard codes registered for this permit. Standard template controls apply.</span>
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard
                    theme="emerald"
                    sectionTag="SECTION 4.2"
                    title="Additional Site Controls Required"
                    subtitle="Engineering barriers and administrative safeguards mandated by the safety department."
                    icon="verified"
                  >
                    {selectedPermit._HazardControl && selectedPermit._HazardControl.length > 0 ? (
                      <ul className="p-3 space-y-2">
                        {selectedPermit._HazardControl.map((ctrl, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-slate-800 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                            <span className="material-symbols-outlined text-[16px] text-emerald-600 shrink-0 mt-0.5">
                              check_circle
                            </span>
                            <div>
                              <span className="font-bold text-emerald-900">{ctrl.ControlCode || `Control #${idx + 1}`}: </span>
                              <span className="leading-relaxed">{ctrl.ControlDesc || ctrl.Remarks || 'Mandatory on-site precaution'}</span>
                              {ctrl.ControlStatus && (
                                <span className="ml-2 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                                  {ctrl.ControlStatus}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-500">
                        <span className="material-symbols-outlined text-[20px] text-slate-400 block mb-1">verified_user</span>
                        <span>Standard mitigation measures from HSE/SAF/F/05 enforced by default.</span>
                      </div>
                    )}
                  </SectionCard>
                </div>

                {/* 5. 10 General Safety Guidelines (GFL Corporate Policy) */}
                <SectionCard
                  theme="indigo"
                  sectionTag="SECTION 5"
                  title="10 Mandatory General Safety Guidelines"
                  subtitle="Gujarat Fluorochemicals Limited corporate standard operating protocols for all operational permits."
                  icon="rule"
                  badge={
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Mandatory Compliance
                    </span>
                  }
                >
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {GENERAL_SAFETY_GUIDELINES.map((guide, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-slate-700 font-medium leading-relaxed">{guide}</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* 6. Multi-Party Signature & Endorsement Verification */}
                <SectionCard
                  theme="slate"
                  sectionTag="SECTION 6"
                  title="JHA Acceptance & Sign-off Endorsements"
                  subtitle="Signatures must be obtained prior to commencement of work at site."
                  icon="draw"
                >
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
                      <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">1. Performing Agency</div>
                      <div className="mt-1 text-xs font-bold text-slate-800">
                        {selectedPermit.SupvName || 'Contractor / Agency Supervisor'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">Agency: {selectedPermit.ExecAgency || 'CONT'}</div>
                      <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Acknowledged & Explained in TBT</span>
                        <span className="material-symbols-outlined text-[14px] text-emerald-600">done</span>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
                      <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">2. Area In-Charge / Issuer</div>
                      <div className="mt-1 text-xs font-bold text-slate-800">
                        {selectedPermit.PermitIssuer || selectedPermit.IssuedBy || selectedPermit._Approval?.find(a => a.RoleId === 'ISS' || a.RoleId === 'APP')?.SignedBy || 'Area In-charge'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">Plant: {selectedPermit.Werks} ({selectedPermit.AreaLoc})</div>
                      <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Precautions Inspected & Verified</span>
                        <span className="material-symbols-outlined text-[14px] text-emerald-600">verified</span>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
                      <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">3. EHSS / Safety Officer</div>
                      <div className="mt-1 text-xs font-bold text-slate-800">
                        {selectedPermit.ApprovedBy || selectedPermit.VerifiedBy || selectedPermit._Approval?.find(a => a.RoleId === 'VER' || a.RoleId === 'SAF')?.SignedBy || 'Safety Department'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">HSE / SAF / F / 05 Compliant</div>
                      <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Corporate Standard Endorsed</span>
                        <span className="material-symbols-outlined text-[14px] text-emerald-600">verified_user</span>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: PPE MATRIX (G) */}
          {/* ========================================================================= */}
          {activeTab === 'ppe' && (
            <SectionCard
              theme="emerald"
              sectionTag="SECTION G"
              title="Personal Protective Equipment (PPE) Checklist"
              subtitle="Required protective equipment and respiratory protection."
              icon="health_and_safety"
              badge={
                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {selectedPermit._PPE?.length || 0} PPE Items
                </span>
              }
            >
              {!selectedPermit._PPE || selectedPermit._PPE.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-400">No PPE records registered.</p>
              ) : (
                <div className="space-y-3">
                  {/* Quick Toggle: All vs Required Only */}
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                    <button
                      type="button"
                      onClick={() => setPpeFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
                        ppeFilter === 'ALL' ? 'bg-[#006398] text-white shadow-xs' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      All PPE Items ({selectedPermit._PPE.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPpeFilter('REQ')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
                        ppeFilter === 'REQ' ? 'bg-[#006398] text-white shadow-xs' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Required Only ({selectedPermit._PPE.filter(p => p.IsRequired === 'Y' || p.IsRequired === 'X').length})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {selectedPermit._PPE
                      .filter(ppe => ppeFilter === 'ALL' || ppe.IsRequired === 'Y' || ppe.IsRequired === 'X')
                      .map((ppe, i) => {
                        const isReq = ppe.IsRequired === 'Y' || ppe.IsRequired === 'X';
                        return (
                          <div key={i} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-2.5 shadow-xs">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isReq ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-500'
                            }`}>
                              <span className="material-symbols-outlined text-[17px]">
                                {isReq ? 'verified_user' : 'shield'}
                              </span>
                            </div>
                            <div className="flex-1 text-xs">
                              <h4 className="font-bold text-slate-800 leading-tight">{ppe.PpeDesc}</h4>
                              <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono text-slate-500 flex-wrap">
                                <span className={`px-1.5 py-0.2 rounded font-bold ${isReq ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                                  {isReq ? 'Required' : 'Optional'}
                                </span>
                                <span>·</span>
                                <span>Avail: {ppe.IsAvailable || 'Y'}</span>
                                <span>·</span>
                                <span>Issued: {ppe.IsIssued || 'Y'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: POSITIVE ISOLATION & LOTO (H) */}
          {/* ========================================================================= */}
          {activeTab === 'isolation' && (
            <SectionCard
              theme="rose"
              sectionTag="SECTION H"
              title="Lockout / Tagout (LOTO) & Positive Isolation Evidence"
              subtitle={`Isolation Certificate: ${selectedPermit.IsolationNo || 'None Linked'} · Status: ${selectedPermit.IsolationStatus || 'INTD'}`}
              icon="lock"
              badge={
                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200">
                  {selectedPermit._Isolation?.reduce((count, certificate) => count + (certificate._Item?.length || 0), 0) || 0} Lock Points
                </span>
              }
            >
              {/* Summary Strip */}
              <div className="mb-3.5 p-3 rounded-xl bg-purple-50/60 border border-purple-200/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div>
                  <span className="text-purple-700 font-bold">Certificate: </span>
                  <span className="font-bold text-purple-950">{selectedPermit.IsolationNo || 'Direct PTW LOTO'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>Req: <strong className="text-purple-900">{(selectedPermit.IsolationRequired === 'Y' || selectedPermit.IsolationRequired === 'X') ? 'YES' : 'NO'}</strong></span>
                  <span>·</span>
                  <span>Status: <strong className="text-purple-900">{selectedPermit.IsolationStatus || 'CRTD'}</strong></span>
                </div>
              </div>

              {!selectedPermit._Isolation || selectedPermit._Isolation.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-400">
                  {(selectedPermit.IsolationRequired === 'Y' || selectedPermit.IsolationRequired === 'X')
                    ? 'Positive isolation required, but no isolation points recorded yet.'
                    : 'Isolation not required for this permit.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono text-[10px]">
                        <th className="p-2.5">Item #</th>
                        <th className="p-2.5">Isolation Point / Tag</th>
                        <th className="p-2.5">Type / Method</th>
                        <th className="p-2.5">Lock / Tag #</th>
                        <th className="p-2.5">Isolated?</th>
                        <th className="p-2.5">Zero-Energy Confirmed?</th>
                        <th className="p-2.5">Normalized / Restored?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {selectedPermit._Isolation.flatMap(certificate => certificate._Item || []).map((iso, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono text-slate-400">{iso.ItemNo || i + 1}</td>
                          <td className="p-2.5 font-semibold text-slate-900">{iso.IsolationPoint}</td>
                          <td className="p-2.5 font-mono text-slate-600">{iso.IsolType}</td>
                          <td className="p-2.5 font-mono font-bold text-slate-800">{iso.LockTagNo || '—'}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              iso.IsIsolated === 'Y' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {iso.IsIsolated === 'Y' ? 'ISOLATED' : 'PENDING'}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              iso.ZeroEnergyConf === 'Y' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {iso.ZeroEnergyConf === 'Y' ? 'CONFIRMED' : 'NO'}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              iso.IsNormalized === 'Y' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {iso.IsNormalized === 'Y' ? 'RESTORED' : 'ACTIVE'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* ========================================================================= */}
          {/* TAB 6: GAS TEST RECORDS (I) */}
          {/* ========================================================================= */}
          {activeTab === 'gastest' && (
            <SectionCard
              theme="amber"
              sectionTag="SECTION I"
              title="Gas test records"
              subtitle={`Retest Interval: ${selectedPermit.GasTestFreqHr || 2} Hours · Gas Test Required: ${(selectedPermit.GasTestRequired === 'Y' || selectedPermit.GasTestRequired === 'X') ? 'YES (X)' : 'NO'}`}
              icon="science"
              badge={
                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  {selectedPermit._GasTest?.length || 0} Test Records
                </span>
              }
            >
              {!selectedPermit._GasTest || selectedPermit._GasTest.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-400">No atmospheric gas tests recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {/* Latest Gas Readings Strip with Visual Threshold Meters */}
                  {(() => {
                    const latest = selectedPermit._GasTest[selectedPermit._GasTest.length - 1];
                    const o2Ok = latest.O2Pct >= 19.5 && latest.O2Pct <= 23.5;
                    const lelOk = latest.LelPct < 1.0;
                    const coOk = latest.CoVal < 25.0;
                    const h2sOk = latest.H2sVal < 10.0;
                    return (
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[11px] font-mono font-bold text-slate-600 uppercase">
                            Latest Atmospheric Reading (Seq #{latest.TestSeq} · Level {latest.SampleLevel || 'MID'})
                          </span>
                          <span className="font-mono text-slate-400 text-[11px]">
                            {latest.TestDate} at {latest.TestTime} (Tester: {latest.TestedBy || '—'})
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                          <div className={`p-3 rounded-xl border ${o2Ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                            <span className="text-[10px] font-mono block text-slate-500">O2 (Oxygen)</span>
                            <span className="text-xl font-bold font-mono">{latest.O2Pct}%</span>
                            <span className="block text-[10px] font-mono mt-0.5">{o2Ok ? 'NORMAL (19.5–23.5%)' : 'HAZARDOUS'}</span>
                          </div>

                          <div className={`p-3 rounded-xl border ${lelOk ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                            <span className="text-[10px] font-mono block text-slate-500">% LEL (Flammable)</span>
                            <span className="text-xl font-bold font-mono">{latest.LelPct}%</span>
                            <span className="block text-[10px] font-mono mt-0.5">{lelOk ? 'SAFE (< 1%)' : 'EXPLOSIVE RISK'}</span>
                          </div>

                          <div className={`p-3 rounded-xl border ${coOk ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                            <span className="text-[10px] font-mono block text-slate-500">CO (Carbon Monoxide)</span>
                            <span className="text-xl font-bold font-mono">{latest.CoVal} ppm</span>
                            <span className="block text-[10px] font-mono mt-0.5">{coOk ? 'SAFE (< 25 ppm)' : 'TOXIC DANGER'}</span>
                          </div>

                          <div className={`p-3 rounded-xl border ${h2sOk ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                            <span className="text-[10px] font-mono block text-slate-500">H2S (Hydrogen Sulfide)</span>
                            <span className="text-xl font-bold font-mono">{latest.H2sVal} ppm</span>
                            <span className="block text-[10px] font-mono mt-0.5">{h2sOk ? 'SAFE (< 10 ppm)' : 'DEADLY POISON'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Gas Log Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono text-[10px]">
                          <th className="p-2.5">Seq #</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5">Date & Time</th>
                          <th className="p-2.5">Sample Level</th>
                          <th className="p-2.5">O2 %</th>
                          <th className="p-2.5">LEL %</th>
                          <th className="p-2.5">CO</th>
                          <th className="p-2.5">H2S</th>
                          <th className="p-2.5">Meter ID</th>
                          <th className="p-2.5">Tester</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {selectedPermit._GasTest.map((g, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-slate-800">{g.TestSeq}</td>
                            <td className="p-2.5 font-mono text-[11px]">{g.TestType || 'INIT'}</td>
                            <td className="p-2.5 font-mono text-[11px] whitespace-nowrap">{g.TestDate} {g.TestTime}</td>
                            <td className="p-2.5 font-mono font-semibold">{g.SampleLevel || 'MID'}</td>
                            <td className="p-2.5 font-mono font-bold text-slate-800">{g.O2Pct}%</td>
                            <td className="p-2.5 font-mono font-bold text-slate-800">{g.LelPct}%</td>
                            <td className="p-2.5 font-mono font-bold text-slate-800">{g.CoVal} ppm</td>
                            <td className="p-2.5 font-mono font-bold text-slate-800">{g.H2sVal} ppm</td>
                            <td className="p-2.5 font-mono text-slate-500">{g.MeterId || '—'}</td>
                            <td className="p-2.5 font-semibold text-slate-700">{g.TestedBy || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* ========================================================================= */}
          {/* TAB 7: SIGNATURES & MULTI-TIER APPROVALS (J-M) */}
          {/* ========================================================================= */}
          {activeTab === 'approvals' && (
            <SectionCard
              theme="blue"
              sectionTag="SECTION J–M"
              title="Approvals and clearances"
              subtitle="Required approvals, clearances and recorded signatures."
              icon="draw"
              badge={
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-50 text-[#006398] border border-blue-200">
                    {selectedPermit._Approval?.length || 0} Signatures
                  </span>
                  {selectedPermit.Status === 'APPR' || selectedPermit.Status === 'ISSU' || selectedPermit.Status === 'ACTV' ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold shadow-2xs">
                        <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
                        <span>Approvals Completed</span>
                      </span>

                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenApprovalModal}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold shadow-xs transition active:scale-[0.98] ${
                        hasApproverRole
                          ? 'bg-[#006398] text-white hover:bg-[#004e78]'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                      }`}
                      title={
                        hasApproverRole
                          ? 'Sign Clearance / Approve'
                          : `Approver authorization required in SAP /UserRole. Current roles: ${userDisplayRoles.join(', ') || 'None'}. Click to view in audit mode.`
                      }
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {hasApproverRole ? 'draw' : 'shield_lock'}
                      </span>
                      <span>{hasApproverRole ? 'Sign Clearance / Approve' : 'Approver Review (Audit)'}</span>
                    </button>
                  )}
                </div>
              }
            >
              {/* Visual Approval Stepper Pipeline */}
              <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    Multi-Tier Authorization Pipeline (Live SAP /Approval Flow)
                  </span>
                  {(selectedPermit.Status === 'APPR' || selectedPermit.Status === 'ISSU' || selectedPermit.Status === 'ACTV') && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-emerald-600">verified</span>
                      <span>All Required Approvals Complete</span>
                    </span>
                  )}
                </div>

                {/* Prominent Rejected Status Alert Banner with Resubmit CTA */}
                {(selectedPermit.Status === 'REJT' || selectedPermit.Status === 'REJC') && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-[20px]">gavel</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-rose-950 uppercase tracking-wide">
                          Permit Authorization Denied (REJT)
                        </h4>
                        <p className="text-xs text-rose-900 mt-0.5 leading-relaxed">
                          {selectedPermit._Approval?.find(a => a.Action === 'RJ' || a.Action === 'REJECTED' || a.Action === 'REJT')?.Comments ||
                            'This permit was rejected by an approver. Use the Resubmit action to re-enter the approval pipeline.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {onRevisePermit && (
                        <button
                          type="button"
                          onClick={() => onRevisePermit(selectedPermit)}
                          className="px-3 py-2 bg-white hover:bg-rose-100 text-rose-900 border border-rose-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                          title="Open full 8-step permit editor to revise crew, hazards, or PPE"
                        >
                          <span className="material-symbols-outlined text-[16px] text-rose-700">edit_note</span>
                          <span>Revise in Editor</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleOpenResubmitModal}
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                        <span>Quick Edit & Resubmit</span>
                      </button>
                    </div>
                  </div>
                )}

                {(() => {
                  const approvals = selectedPermit._Approval || [];
                  const isFullyApproved = selectedPermit.Status === 'APPR' || selectedPermit.Status === 'ISSU' || selectedPermit.Status === 'ACTV' || selectedPermit.Status === 'CLSD';

                  const activeApprovals = getActiveCycleApprovals(approvals, selectedPermit.Status);

                  const isPermitInRejectedStatus = selectedPermit.Status === 'REJT' || selectedPermit.Status === 'REJC' || selectedPermit.Status === 'CANC';

                  // Check existing approval records in active cycle (only fall back to historical records if permit is currently rejected)
                  const appr1Record = activeApprovals.find(a => a.RoleId === 'PTW_APPR1') || (isPermitInRejectedStatus ? approvals.find(a => a.RoleId === 'PTW_APPR1') : undefined);
                  const appr2Record = activeApprovals.find(a => a.RoleId === 'PTW_APPR2') || (isPermitInRejectedStatus ? approvals.find(a => a.RoleId === 'PTW_APPR2') : undefined);
                  const appr3Record = activeApprovals.find(a => a.RoleId === 'PTW_APPR3') || (isPermitInRejectedStatus ? approvals.find(a => a.RoleId === 'PTW_APPR3') : undefined);
                  const verRecord = activeApprovals.find(a => a.RoleId === 'VER' || a.Stage === '01') || (isPermitInRejectedStatus ? approvals.find(a => a.RoleId === 'VER' || a.Stage === '01') : undefined);
                  const otherRecords = approvals.filter(a =>
                    a.RoleId !== 'PTW_APPR1' &&
                    a.RoleId !== 'PTW_APPR2' &&
                    a.RoleId !== 'PTW_APPR3' &&
                    a.RoleId !== 'VER'
                  );

                  interface PipelineCard {
                    id: string;
                    role: string;
                    title: string;
                    signerName: string;
                    actionLabel: string;
                    actionDate?: string;
                    actionTime?: string;
                    isApproved: boolean;
                    isVerified: boolean;
                    isRejected: boolean;
                    isSigned: boolean;
                  }

                  const cards: PipelineCard[] = [];

                  // 1. Site Verifier: ONLY show if a VER record exists in _Approval or selectedPermit.VerifiedBy is present
                  if (verRecord || (selectedPermit.VerifiedBy && selectedPermit.VerifiedBy.trim())) {
                    const isVr = verRecord?.Action === 'VR' || verRecord?.Action === 'VERIFIED';
                    const isAp = verRecord?.Action === 'AP' || verRecord?.Action === 'APPROVED';
                    const isRj = verRecord?.Action === 'RJ' || verRecord?.Action === 'REJECTED';
                    cards.push({
                      id: 'VER',
                      role: 'Site Verifier (VER)',
                      title: 'Site Verification',
                      signerName: verRecord?.SignedBy?.trim() || selectedPermit.VerifiedBy || 'Pending Verification',
                      actionLabel: isAp ? 'APPROVED' : isVr ? 'VERIFIED' : isRj ? 'REJECTED' : 'PENDING',
                      actionDate: verRecord?.ActionDate || undefined,
                      actionTime: verRecord?.ActionTime || undefined,
                      isApproved: isAp,
                      isVerified: isVr,
                      isRejected: isRj,
                      isSigned: !!verRecord?.SignedBy?.trim() || Boolean(selectedPermit.VerifiedBy?.trim())
                    });
                  }

                  const permitTimeBand = getTimeBand(selectedPermit.ValidFromT || new Date());
                  const policy = getRequiredApproversForPermit(selectedPermit.PermitType, permitTimeBand.id);
                  const reqRoles = policy.requiredRoles;

                  // 2. Approver I (PTW_APPR1):
                  const shouldShowAppr1 = reqRoles.includes('PTW_APPR1') || !!appr1Record;
                  if (shouldShowAppr1) {
                    const isAppr1Done = !!appr1Record && (appr1Record.Action === 'AP' || appr1Record.Action === 'APPROVED');
                    const isAppr1Rj = appr1Record?.Action === 'RJ' || appr1Record?.Action === 'REJECTED';
                    cards.push({
                      id: 'PTW_APPR1',
                      role: 'Approver I (PTW_APPR1)',
                      title: 'PTW Approver I',
                      signerName: appr1Record?.SignedBy?.trim() || selectedPermit.ApprovedBy || 'Pending Approver I',
                      actionLabel: isAppr1Done ? 'APPROVED' : isAppr1Rj ? 'REJECTED' : 'PENDING',
                      actionDate: appr1Record?.ActionDate || undefined,
                      actionTime: appr1Record?.ActionTime || undefined,
                      isApproved: isAppr1Done,
                      isVerified: false,
                      isRejected: isAppr1Rj,
                      isSigned: !!appr1Record?.SignedBy?.trim()
                    });
                  }

                  // 3. Approver II (PTW_APPR2):
                  const shouldShowAppr2 = reqRoles.includes('PTW_APPR2') || !!appr2Record;
                  if (shouldShowAppr2) {
                    const isAppr2Done = !!appr2Record && (appr2Record.Action === 'AP' || appr2Record.Action === 'APPROVED');
                    const isAppr2Rj = appr2Record?.Action === 'RJ' || appr2Record?.Action === 'REJECTED';
                    cards.push({
                      id: 'PTW_APPR2',
                      role: 'Approver II (PTW_APPR2)',
                      title: reqRoles.length === 1 && reqRoles[0] === 'PTW_APPR2' ? 'Night Shift Authorization' : 'PTW Approver II',
                      signerName: appr2Record?.SignedBy?.trim() || 'Pending Approver II',
                      actionLabel: isAppr2Done ? 'APPROVED' : isAppr2Rj ? 'REJECTED' : 'PENDING',
                      actionDate: appr2Record?.ActionDate || undefined,
                      actionTime: appr2Record?.ActionTime || undefined,
                      isApproved: isAppr2Done,
                      isVerified: false,
                      isRejected: isAppr2Rj,
                      isSigned: !!appr2Record?.SignedBy?.trim()
                    });
                  }

                  // 4. Approver III (PTW_APPR3):
                  const shouldShowAppr3 = reqRoles.includes('PTW_APPR3') || !!appr3Record;
                  if (shouldShowAppr3) {
                    const isAppr3Done = !!appr3Record && (appr3Record.Action === 'AP' || appr3Record.Action === 'APPROVED');
                    const isAppr3Rj = appr3Record?.Action === 'RJ' || appr3Record?.Action === 'REJECTED';
                    cards.push({
                      id: 'PTW_APPR3',
                      role: 'Approver III (PTW_APPR3)',
                      title: reqRoles.length === 1 && reqRoles[0] === 'PTW_APPR3' ? 'Night Confined Space Clearance' : 'PTW Approver III',
                      signerName: appr3Record?.SignedBy?.trim() || 'Pending Approver III',
                      actionLabel: isAppr3Done ? 'APPROVED' : isAppr3Rj ? 'REJECTED' : 'PENDING',
                      actionDate: appr3Record?.ActionDate || undefined,
                      actionTime: appr3Record?.ActionTime || undefined,
                      isApproved: isAppr3Done,
                      isVerified: false,
                      isRejected: isAppr3Rj,
                      isSigned: !!appr3Record?.SignedBy?.trim()
                    });
                  }

                  // 5. Any other approvals logged in _Approval
                  otherRecords.forEach((other, idx) => {
                    const isDone = other.Action === 'AP' || other.Action === 'APPROVED';
                    const isRj = other.Action === 'RJ' || other.Action === 'REJECTED';
                    cards.push({
                      id: `EXTRA_${other.RoleId || idx}`,
                      role: other.RoleId || 'Approver',
                      title: `${other.RoleId || 'Approver'} Sign-off`,
                      signerName: other.SignedBy?.trim() || 'Signed',
                      actionLabel: isDone ? 'APPROVED' : isRj ? 'REJECTED' : (other.Action || 'SIGNED'),
                      actionDate: other.ActionDate || undefined,
                      actionTime: other.ActionTime || undefined,
                      isApproved: isDone,
                      isVerified: other.Action === 'VR',
                      isRejected: isRj,
                      isSigned: !!other.SignedBy?.trim()
                    });
                  });

                  // 6. Final Authorization Status Card
                  cards.push({
                    id: 'FINAL_STATUS',
                    role: 'Work Permit Status',
                    title: isFullyApproved ? 'Authorization Complete' : 'Authorization Status',
                    signerName: isFullyApproved ? `Fully Authorized (${selectedPermit.Status})` : 'Awaiting Approval (CRTD)',
                    actionLabel: isFullyApproved ? 'APPROVED' : selectedPermit.Status === 'REJT' || selectedPermit.Status === 'CANC' ? 'REJECTED' : 'PENDING',
                    isApproved: isFullyApproved,
                    isVerified: false,
                    isRejected: selectedPermit.Status === 'REJT' || selectedPermit.Status === 'CANC',
                    isSigned: isFullyApproved
                  });

                  const colClass = cards.length === 2 ? 'sm:grid-cols-2' : cards.length === 3 ? 'sm:grid-cols-3' : cards.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-5';

                  return (
                    <div className={`grid grid-cols-1 ${colClass} gap-3`}>
                      {cards.map(c => (
                        <div
                          key={c.id}
                          className={`p-3 rounded-xl border transition-all ${
                            c.isApproved
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 shadow-xs'
                              : c.isVerified
                              ? 'bg-sky-50/70 border-sky-200 text-sky-900 shadow-xs'
                              : c.isRejected
                              ? 'bg-rose-50/70 border-rose-200 text-rose-900 shadow-xs'
                              : c.isSigned
                              ? 'bg-amber-50/70 border-amber-200 text-amber-900 shadow-xs'
                              : 'bg-white border-slate-200/80 text-slate-500'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono font-bold uppercase truncate">
                              {c.role}
                            </span>
                            <span className={`material-symbols-outlined text-[16px] ${
                              c.isApproved ? 'text-emerald-600' : c.isVerified ? 'text-sky-600' : c.isRejected ? 'text-rose-600' : c.isSigned ? 'text-amber-600' : 'text-slate-300'
                            }`}>
                              {c.isApproved ? 'verified' : c.isVerified ? 'fact_check' : c.isRejected ? 'cancel' : c.isSigned ? 'edit_note' : 'radio_button_unchecked'}
                            </span>
                          </div>
                          <h4 className="font-bold text-xs text-slate-900">{c.title}</h4>
                          <p className="mt-1 font-mono text-[11px] truncate text-slate-600 font-semibold">
                            {c.signerName}
                          </p>
                          <div className="mt-1 flex items-center justify-between">
                            <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold ${
                              c.isApproved ? 'bg-emerald-100 text-emerald-800' : c.isVerified ? 'bg-sky-100 text-sky-800' : c.isRejected ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {c.actionLabel}
                            </span>
                            {c.actionDate && (
                              <span className="font-mono text-[10px] text-slate-500">
                                {c.actionDate} {c.actionTime || ''}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {!selectedPermit._Approval || selectedPermit._Approval.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <span className="material-symbols-outlined text-[28px] text-slate-300 block mb-1">draw</span>
                  <p className="font-semibold text-slate-600">No authorization signatures logged yet in SAP /Approval.</p>
                  <p className="mt-0.5 text-slate-400">Click &ldquo;Sign Clearance / Approve&rdquo; above to record an authorization.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono text-[10px]">
                        <th className="p-2.5">Cycle #</th>
                        <th className="p-2.5">Stage</th>
                        <th className="p-2.5">Seq #</th>
                        <th className="p-2.5">Role ID</th>
                        <th className="p-2.5">Action</th>
                        <th className="p-2.5">Signed By (SAP User)</th>
                        <th className="p-2.5">Timestamp</th>
                        <th className="p-2.5">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {selectedPermit._Approval.map((app, i) => {
                        const isApproved = app.Action === 'AP' || app.Action === 'APPROVED';
                        const isVerified = app.Action === 'VR' || app.Action === 'VERIFIED';
                        const isRejected = app.Action === 'RJ' || app.Action === 'REJECTED';
                        const actionLabel = isApproved ? 'APPROVED' : isVerified ? 'VERIFIED' : isRejected ? 'REJECTED' : (app.Action || 'PENDING');
                        const badgeColor = isApproved
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : isVerified
                          ? 'bg-sky-100 text-sky-800 border-sky-300'
                          : isRejected
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-slate-100 text-slate-700 border-slate-300';

                        const roleLabel =
                          app.RoleId === 'PTW_APPR1'
                            ? 'PTW_APPR1 (Approver I)'
                            : app.RoleId === 'PTW_APPR2'
                            ? 'PTW_APPR2 (Approver II)'
                            : app.RoleId === 'PTW_APPR3'
                            ? 'PTW_APPR3 (Approver III)'
                            : app.RoleId === 'VER'
                            ? 'VER (Site Verification)'
                            : app.RoleId === 'ISS'
                            ? 'ISS (Permit Issuer)'
                            : app.RoleId;

                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-slate-600">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-700 border border-slate-200">
                                Cycle {app.CycleNo || 1}
                              </span>
                            </td>
                            <td className="p-2.5 font-bold text-slate-800 font-mono">{app.Stage || 'Stage ' + (i + 1)}</td>
                            <td className="p-2.5 font-mono text-slate-500 font-bold">{app.SeqNo}</td>
                            <td className="p-2.5 font-mono font-semibold text-slate-700">{roleLabel}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeColor}`}>
                                {actionLabel}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono font-bold text-slate-900">
                              {app.SignedBy?.trim() ? app.SignedBy : <span className="text-slate-400 font-normal italic">Awaiting Signature</span>}
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                              {app.ActionDate ? `${app.ActionDate} ${app.ActionTime || ''}` : <span className="text-slate-400 italic">Pending</span>}
                            </td>
                            <td className="p-2.5 text-slate-600 max-w-xs">{app.Comments || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SECTION K: PERMIT ACCEPTOR CLEARANCE CARD */}
              <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-teal-50/80 via-emerald-50/50 to-white border border-teal-200/90 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-teal-100 text-teal-800 rounded-lg">
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                    </span>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wide">
                        Section K: Permit Acceptor Agreement &amp; Clearance
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Responsible Person: <strong className="text-slate-800 font-mono">{selectedPermit.PersonResp || selectedPermit.SupvName || 'Acceptor'}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedPermit.Status === 'APPR' ? (
                      <>
                        <button
                          type="button"
                          disabled={!hasAcceptorRole}
                          onClick={() => handleOpenAcceptorModal('accept')}
                          className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                          title={
                            hasAcceptorRole
                              ? 'Accept Permit as Permit Acceptor (.acceptPermit)'
                              : `Permit Acceptor role (PTW_ACCP) required in SAP /UserRole. Current roles: ${userDisplayRoles.join(', ') || 'None'}`
                          }
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            {hasAcceptorRole ? 'task_alt' : 'lock'}
                          </span>
                          <span>{hasAcceptorRole ? 'Accept Permit' : 'Acceptor Role Required'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={!hasAcceptorRole}
                          onClick={() => handleOpenAcceptorModal('reject')}
                          className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                          title={
                            hasAcceptorRole
                              ? 'Reject Permit as Permit Acceptor (.rejectAcceptor)'
                              : 'Permit Acceptor role required to reject'
                          }
                        >
                          <span className="material-symbols-outlined text-[15px]">cancel</span>
                          <span>Reject (Acceptor)</span>
                        </button>
                      </>
                    ) : selectedPermit.Status === 'ISSU' || selectedPermit.Status === 'ACTV' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                        <span className="material-symbols-outlined text-[14px]">check</span>
                        <span>Accepted &amp; Field Authorized</span>
                      </span>
                    ) : selectedPermit.Status === 'REJT' || selectedPermit.Status === 'CANC' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 text-[11px] font-bold">
                        <span className="material-symbols-outlined text-[14px]">close</span>
                        <span>Permit Denied / Rejected</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold shadow-2xs">
                        <span className="material-symbols-outlined text-[16px] text-amber-700">hourglass_top</span>
                        <span>Awaiting Approvals ({selectedPermit.Status || 'CRTD'})</span>
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-600 font-sans leading-relaxed bg-white/70 p-2.5 rounded-xl border border-teal-100">
                  &ldquo;I have read the precautions and safety measures mentioned herein and I agree to abide by the same. The safeguards have been implemented. Tool box talk given to persons working/impacted (refer the list of work executors).&rdquo;
                </p>
              </div>

              {/* Log Approval / Sign Clearance Modal */}
              {showApprovalModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
                  <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-blue-50 text-[#006398]">
                          <span className="material-symbols-outlined text-[20px]">draw</span>
                        </span>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">Sign Clearance / Approval</h3>
                          <p className="text-[11px] font-mono text-slate-500">Permit {selectedPermit.Permit_No}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowApprovalModal(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>

                    {/* Role Guidance Notice when user lacks approver role in SAP /UserRole */}
                    {!hasApproverRole && (
                      <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl text-amber-950 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-amber-800">
                            <span className="material-symbols-outlined text-[16px]">shield_lock</span>
                            <span>Viewing in Read-Only Audit Mode</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void refreshRoles()}
                            disabled={isLoadingRoles}
                            className="text-[10px] font-bold text-amber-900 bg-amber-200/60 hover:bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1"
                            title="Refresh from SAP /UserRole"
                          >
                            <span className={`material-symbols-outlined text-[12px] ${isLoadingRoles ? 'animate-spin' : ''}`}>sync</span>
                            <span>{isLoadingRoles ? '...' : '/UserRole'}</span>
                          </button>
                        </div>
                        <p className="text-[11px] text-amber-900 leading-relaxed">
                          Your current SAP account (<strong>{user?.id || 'Unknown'}</strong>) active roles in <code className="font-bold text-amber-950 bg-white/90 px-1 py-0.5 rounded border border-amber-200">SAP /UserRole</code>: <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-200 font-bold">{userDisplayRoles.join(', ') || 'No PTW Roles Assigned'}</code>.
                          Signing approvals requires <strong>PTW_APPR1</strong>, <strong>PTW_APPR2</strong>, <strong>PTW_APPR3</strong>, or <strong>PTW_ADMIN</strong> in the SAP <code>/UserRole</code> table.
                        </p>
                      </div>
                    )}

                    {/* Auto-Determined Multi-Tier Role & Sequence Card (No Dropdown Required) */}
                    <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#006398] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">verified</span>
                          Auto-Assigned Approval Tier
                        </span>
                        <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-[#006398] text-white">
                          SeqNo: #{approvalSeqNo} (Auto-Build)
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm text-slate-900">
                            {approvalRoleId === 'PTW_APPR1'
                              ? 'PTW Approver I'
                              : approvalRoleId === 'PTW_APPR2'
                              ? 'PTW Approver II'
                              : approvalRoleId === 'PTW_APPR3'
                              ? 'PTW Approver III'
                              : approvalRoleId === 'VER'
                              ? 'Site Verification (VER)'
                              : 'Permit Issuer (ISS)'}
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                            Stage: <span className="font-bold">{approvalStage}</span> · Role ID: <span className="font-bold">{approvalRoleId}</span>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-blue-600 text-[26px]">draw</span>
                      </div>
                      <p className="mt-2 text-[10px] text-blue-700/90 leading-tight">
                        The system has automatically calculated sequence number #{approvalSeqNo} and assigned the required workflow role based on live SAP records.
                      </p>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">Authorization Action:</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setApprovalAction(approvalRoleId === 'VER' ? 'VR' : 'AP')}
                            className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${
                              approvalAction === 'AP' || approvalAction === 'VR'
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {approvalRoleId === 'VER' ? 'fact_check' : 'check_circle'}
                            </span>
                            <span>{approvalRoleId === 'VER' ? 'Verify (VR)' : 'Approve (AP)'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setApprovalAction('RJ')}
                            className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${
                              approvalAction === 'RJ'
                                ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                            <span>Reject (RJ)</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Signed By (SAP User ID):</label>
                        <input
                          type="text"
                          value={user?.id || ''}
                          readOnly
                          id="approval-signed-by"
                          className="w-full p-2 rounded-xl border border-slate-200 font-mono font-bold"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Comments / Verification Notes:</label>
                        <textarea
                          value={approvalComments}
                          onChange={(e) => setApprovalComments(e.target.value)}
                          placeholder="e.g. Work precautions, isolation points and gas tests reviewed and verified."
                          rows={2}
                          className="w-full p-2 rounded-xl border border-slate-200"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowApprovalModal(false)}
                        className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={submittingApproval || !hasApproverRole}
                        onClick={() => {
                          void handleSubmitApproval();
                        }}
                        className="px-4 py-2 rounded-xl bg-[#006398] text-white font-bold text-xs hover:bg-[#004e78] transition disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer disabled:cursor-not-allowed"
                        title={!hasApproverRole ? 'Approver authorization required' : 'Submit to SAP /Approval'}
                      >
                        {submittingApproval ? (
                          <>
                            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                            <span>Submitting to SAP...</span>
                          </>
                        ) : !hasApproverRole ? (
                          <>
                            <span className="material-symbols-outlined text-[16px]">lock</span>
                            <span>Approver Role Required</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            <span>Submit to SAP /Approval</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Permit Acceptor (Section K) Modal: acceptPermit / rejectAcceptor */}
              {showAcceptorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
                  <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className={`p-2 rounded-xl ${acceptorActionType === 'accept' ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'}`}>
                          <span className="material-symbols-outlined text-[20px]">
                            {acceptorActionType === 'accept' ? 'verified' : 'cancel'}
                          </span>
                        </span>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">
                            {acceptorActionType === 'accept' ? 'Accept Permit (Permit Acceptor)' : 'Reject Permit (Acceptor)'}
                          </h3>
                          <p className="text-[11px] font-mono text-slate-500">
                            {acceptorActionType === 'accept' ? 'Accept' : 'Reject'} permit {selectedPermit.Permit_No}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAcceptorModal(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      {/* Role Guidance Notice when user lacks acceptor role */}
                      {!hasAcceptorRole && (
                        <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl text-amber-950 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-bold text-amber-800">
                              <span className="material-symbols-outlined text-[16px]">shield_lock</span>
                              <span>Viewing in Read-Only Audit Mode</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => void refreshRoles()}
                              disabled={isLoadingRoles}
                              className="text-[10px] font-bold text-amber-900 bg-amber-200/60 hover:bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1"
                              title="Refresh from SAP /UserRole"
                            >
                              <span className={`material-symbols-outlined text-[12px] ${isLoadingRoles ? 'animate-spin' : ''}`}>sync</span>
                              <span>{isLoadingRoles ? '...' : '/UserRole'}</span>
                            </button>
                          </div>
                          <p className="text-[11px] text-amber-900 leading-relaxed">
                            Your current SAP account (<strong>{user?.id || 'Unknown'}</strong>) active roles in <code className="font-bold text-amber-950 bg-white/90 px-1 py-0.5 rounded border border-amber-200">SAP /UserRole</code>: <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-200 font-bold">{userDisplayRoles.join(', ') || 'No PTW Roles Assigned'}</code>.
                            Section K Field Acceptance requires <strong>PTW_ACCP</strong> / <strong>PTW_ACCEPTOR</strong> or <strong>PTW_ADMIN</strong> in the SAP <code>/UserRole</code> table.
                          </p>
                        </div>
                      )}

                      {acceptorActionType === 'accept' ? (
                        <>
                          <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl text-teal-950 text-[11px] leading-relaxed">
                            <strong>Section K Undertaking:</strong> Confirming all field safeguards are in place and toolbox talk has been given to the authorized crew before work start.
                          </div>
                          <div>
                            <label className="font-bold text-slate-700 block mb-1">
                              Acceptance Comments (Payload: <code className="font-mono text-teal-700">Comments</code>):
                            </label>
                            <textarea
                              value={acceptorComments}
                              onChange={(e) => setAcceptorComments(e.target.value)}
                              rows={3}
                              placeholder="Toolbox talk and safety verification details..."
                              className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-teal-600 focus:outline-none"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-rose-950 text-[11px] leading-relaxed">
                            <strong>Rejection Safety Justification:</strong> State the exact hazard, missing precaution, or toolbox talk issue preventing work acceptance.
                          </div>
                          <div>
                            <label className="font-bold text-slate-700 block mb-1">
                              Rejection Reason (Payload: <code className="font-mono text-rose-700">Reason</code>):
                            </label>
                            <textarea
                              value={acceptorComments}
                              onChange={(e) => setAcceptorComments(e.target.value)}
                              rows={3}
                              placeholder="Reason for rejecting permit acceptance on site..."
                              className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-rose-600 focus:outline-none"
                            />
                          </div>
                        </>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setShowAcceptorModal(false)}
                          className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={submittingAcceptor || !hasAcceptorRole || !acceptorComments.trim()}
                          onClick={handleSubmitAcceptor}
                          className={`px-4 py-2 rounded-xl text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer disabled:cursor-not-allowed ${
                            acceptorActionType === 'accept' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-rose-600 hover:bg-rose-700'
                          }`}
                          title={!hasAcceptorRole ? 'Acceptor role required' : ''}
                        >
                          {submittingAcceptor ? (
                            <>
                              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                              <span>Submitting to SAP...</span>
                            </>
                          ) : !hasAcceptorRole ? (
                            <>
                              <span className="material-symbols-outlined text-[16px]">lock</span>
                              <span>Acceptor Role Required</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[16px]">
                                {acceptorActionType === 'accept' ? 'verified' : 'cancel'}
                              </span>
                              <span>{acceptorActionType === 'accept' ? 'Confirm Acceptance' : 'Confirm Rejection'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* ========================================================================= */}
              {/* Resubmit & Revise Rejected Permit Modal (SAP Bound Action: PermitInfo('...')/...Resubmit) */}
              {showResubmitModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
                  <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 my-8 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="material-symbols-outlined text-[22px]">restart_alt</span>
                        </span>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">Revise & Resubmit Permit for Approval</h3>
                          <p className="text-[11px] font-mono text-slate-500">
                            Permit {selectedPermit.Permit_No}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowResubmitModal(false)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>

                    {/* Approver Rejection History Pill */}
                    {(() => {
                      const rej = selectedPermit._Approval?.find(a => a.Action === 'RJ' || a.Action === 'REJECTED' || a.Action === 'REJT');
                      if (!rej) return null;
                      return (
                        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-rose-800">
                            <span className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[15px]">report</span>
                              <span>REJECTION REASON (BY {rej.SignedBy || 'APPROVER'})</span>
                            </span>
                            <span>{rej.ActionDate || ''} {rej.ActionTime || ''}</span>
                          </div>
                          {rej.Comments && (
                            <p className="text-xs bg-white/80 p-2.5 rounded-lg border border-rose-200 text-rose-900 leading-relaxed font-sans font-medium">
                              &ldquo;{rej.Comments}&rdquo;
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Mode Selector Tabs */}
                    <div className="flex items-center border border-slate-200 rounded-xl p-1 bg-slate-50 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setResubmitMode('quick_edit')}
                        className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                          resubmitMode === 'quick_edit'
                            ? 'bg-white text-slate-900 shadow-xs font-bold border border-slate-200/80'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">edit_note</span>
                        <span>Edit Values According to Reason</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setResubmitMode('direct')}
                        className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                          resubmitMode === 'direct'
                            ? 'bg-white text-slate-900 shadow-xs font-bold border border-slate-200/80'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">comment</span>
                        <span>Remarks Only (No Field Changes)</span>
                      </button>
                    </div>

                    {/* Quick Edit Values Form */}
                    {resubmitMode === 'quick_edit' && (
                      <div className="space-y-3.5 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Supervisor Name */}
                          <div className="space-y-1">
                            <label className="font-bold text-slate-700 block">Supervisor Name:</label>
                            <input
                              type="text"
                              value={editSupvName}
                              onChange={(e) => setEditSupvName(e.target.value)}
                              placeholder="Supervisor full name"
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#006398]"
                            />
                          </div>

                          {/* Supervisor Phone with Live Validation */}
                          <div className="space-y-1">
                            <label className="font-bold text-slate-700 flex items-center justify-between">
                              <span>Supervisor Phone (Mobile):</span>
                              {editSupvPhone.trim() && (
                                <span className={`text-[10px] font-mono ${
                                  validatePhoneNumber(editSupvPhone, true).isValid ? 'text-emerald-600 font-bold' : 'text-rose-600'
                                }`}>
                                  {validatePhoneNumber(editSupvPhone, true).isValid ? 'Valid 10-digit' : 'Invalid'}
                                </span>
                              )}
                            </label>
                            <input
                              type="tel"
                              value={editSupvPhone}
                              onChange={(e) => setEditSupvPhone(e.target.value)}
                              placeholder="10-digit mobile number"
                              className={`w-full p-2 bg-white border rounded-lg text-xs text-slate-900 focus:outline-none ${
                                editSupvPhone.trim() && !validatePhoneNumber(editSupvPhone, true).isValid
                                  ? 'border-rose-400 focus:border-rose-500'
                                  : 'border-slate-200 focus:border-[#006398]'
                              }`}
                            />
                          </div>

                          {/* Shift */}
                          <div className="space-y-1">
                            <label className="font-bold text-slate-700 block">Shift:</label>
                            <select
                              value={editShift}
                              onChange={(e) => setEditShift(e.target.value)}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#006398]"
                            >
                              <option value="GENERAL">GENERAL</option>
                              <option value="FIRST">FIRST</option>
                              <option value="SECOND">SECOND</option>
                              <option value="NIGHT">NIGHT</option>
                            </select>
                          </div>

                          {/* Valid To Time & Date */}
                          <div className="space-y-1">
                            <label className="font-bold text-slate-700 block">Validity End Time (HH:mm):</label>
                            <div className="flex gap-2">
                              <input
                                type="date"
                                value={editValidToD}
                                onChange={(e) => setEditValidToD(e.target.value)}
                                className="w-1/2 p-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#006398]"
                              />
                              <input
                                type="time"
                                value={editValidToT}
                                onChange={(e) => setEditValidToT(e.target.value)}
                                className="w-1/2 p-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#006398]"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Location / Area */}
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Work Area Location:</label>
                          <input
                            type="text"
                            value={editAreaLoc}
                            onChange={(e) => setEditAreaLoc(e.target.value)}
                            placeholder="Physical plant area / floor"
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#006398]"
                          />
                        </div>

                        {/* Job Description */}
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Job Description & Scope:</label>
                          <textarea
                            rows={2}
                            value={editJobDesc}
                            onChange={(e) => setEditJobDesc(e.target.value)}
                            placeholder="Detailed scope of maintenance work"
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#006398]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Resubmission Justification */}
                    <div className="space-y-1.5 text-xs">
                      <label className="font-bold text-slate-700 block">
                        Corrective Action Statement / Resubmission Remarks <span className="text-slate-400 font-normal">(Optional)</span>:
                      </label>
                      <textarea
                        rows={2}
                        value={resubmitComments}
                        onChange={(e) => setResubmitComments(e.target.value)}
                        placeholder="Explain the changes made in response to the approver's rejection notes..."
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#006398]"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      {/* Deep Revisions Hook */}
                      {onRevisePermit ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShowResubmitModal(false);
                            onRevisePermit(selectedPermit);
                          }}
                          className="text-xs text-[#006398] hover:text-[#004f7a] font-bold flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-sky-50 transition"
                          title="Need to modify crew members, add PPE items, or change hazard controls?"
                        >
                          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                          <span>Need to edit Crew / PPE / Hazards? Open Full Editor</span>
                        </button>
                      ) : <span />}

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          type="button"
                          disabled={submittingResubmit}
                          onClick={() => setShowResubmitModal(false)}
                          className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={submittingResubmit}
                          onClick={handleResubmitPermit}
                          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm active:scale-95"
                        >
                          {submittingResubmit ? (
                            <>
                              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                              <span>Resubmitting to SAP...</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                              <span>Save & Resubmit</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

          {/* TAB 8: SHIFT RENEWALS & AUDIT LOG (N) */}
          {/* ========================================================================= */}
          {activeTab === 'renewals_audit' && (
            <div className="space-y-4">
              {/* Shift Renewals */}
              <SectionCard
                theme="indigo"
                sectionTag="SECTION N.1"
                title="Shift renewals"
                subtitle="Formal shift handover and validity extension records."
                icon="update"
                badge={
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {selectedPermit._ShiftRenewal?.length || 0} Records
                  </span>
                }
              >
                {!selectedPermit._ShiftRenewal || selectedPermit._ShiftRenewal.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-400">No shift renewals recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono text-[10px]">
                          <th className="p-2.5">Prev Shift</th>
                          <th className="p-2.5">New Shift</th>
                          <th className="p-2.5">Extended End (IST)</th>
                          <th className="p-2.5">Requested By</th>
                          <th className="p-2.5">Approved By</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedPermit._ShiftRenewal.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono">{r.PreviousShift}</td>
                            <td className="p-2.5 font-mono font-bold text-slate-800">{r.NewShift}</td>
                            <td className="p-2.5 font-mono text-slate-700">{r.NewValidToD} {r.NewValidToT}</td>
                            <td className="p-2.5 font-mono">{r.RequestedBy}</td>
                            <td className="p-2.5 font-mono">{r.ApprovedBy}</td>
                            <td className="p-2.5 font-bold text-emerald-700">{r.Status}</td>
                            <td className="p-2.5 text-slate-600">{r.Reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              {/* Full Audit Trail */}
              <SectionCard
                theme="slate"
                sectionTag="SECTION N.2"
                title="Permit history"
                subtitle="Recorded permit changes, in chronological order."
                icon="history"
                badge={
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {selectedPermit._AuditLog?.length || 0} Events
                  </span>
                }
              >
                {!selectedPermit._AuditLog || selectedPermit._AuditLog.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-400">No audit log records found for this permit.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono text-[10px]">
                          <th className="p-2.5">Action</th>
                          <th className="p-2.5">Transition</th>
                          <th className="p-2.5">Actor (SAP User)</th>
                          <th className="p-2.5">Event Timestamp</th>
                          <th className="p-2.5">Reason / Comments</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedPermit._AuditLog.map((log, i) => (
                          <tr key={log.AuditId || i} className="hover:bg-slate-50 font-mono">
                            <td className="p-2.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                {log.Action}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-600">
                              {log.OldStatus || log.NewStatus ? (
                                <>
                                  <span className="text-slate-500">{log.OldStatus || 'INIT'}</span>
                                  <span className="mx-1 text-slate-400">→</span>
                                  <span className="font-bold text-slate-900">{log.NewStatus || '—'}</span>
                                </>
                              ) : (
                                <span className="text-slate-400 font-sans italic text-[11px]">Initial Record</span>
                              )}
                            </td>
                            <td className="p-2.5 text-indigo-700 font-bold">{log.Actor}</td>
                            <td className="p-2.5 text-slate-500 whitespace-nowrap" title={log.EventAt || undefined}>
                              {(() => {
                                if (!log.EventAt) return '—';
                                try {
                                  const d = new Date(log.EventAt);
                                  if (isNaN(d.getTime())) return log.EventAt;
                                  return d.toLocaleString('en-IN', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: true
                                  });
                                } catch {
                                  return log.EventAt;
                                }
                              })()}
                            </td>
                            <td className="p-2.5 font-sans text-slate-600">{log.Comments || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          </div>

          {/* ========================================================================= */}
          {/* 4. PRINTABLE OFFICIAL PTW CERTIFICATE & PREVIEW MODAL */}
          {/* ========================================================================= */}
          <PermitPrintModal
            isOpen={showPrintModal}
            onClose={() => setShowPrintModal(false)}
            permit={selectedPermit}
            defaultIncludeJha={printWithJha}
            defaultJhaTemplateId={selectedJhaTemplateId}
          />

          {!showPrintModal && (
            <div className="print-only">
              <PermitAnnexPrintView permit={selectedPermit} includeReverseSide={false} />
              {printWithJha && (
                <>
                  {applicableJhas.map((item, idx) => (
                    <div
                      key={`${item.template.id}-${idx}`}
                      className="break-before-page"
                      style={{ pageBreakBefore: 'always', breakBefore: 'page' }}
                    >
                      <PermitJhaPrintView
                        permit={selectedPermit}
                        template={item.template}
                        workTypeBadge={item.sourceLabel}
                        sourceLabel={item.sourceLabel}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
