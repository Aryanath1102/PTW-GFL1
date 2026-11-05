import odataClient from '../odataClient';
import { ODATA_ENTITIES, ODATA_ACTIONS, buildODataQuery } from '../odataEndpoints';
import { ApprovalRecord, PermitApproval, PermitHeader } from '../../types/ptw.types';
import { ODataCollectionResponse } from '../../types/odata.types';
import { getRequiredApproversForPermit, TimeBandId } from '../../ptw/approvalMatrix';

function getNowDateAndTime(): { date: string; time: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}:${seconds}`
  };
}

export interface NextApprovalStepInfo {
  stage: string;
  seqNo: string;
  roleId: 'VER' | 'PTW_APPR1' | 'PTW_APPR2' | 'PTW_APPR3' | 'ISS';
  action: 'VR' | 'AP' | 'RJ';
  roleTitle: string;
  pendingRoleName: string;
  isFullyApproved: boolean;
  isRejected?: boolean;
  stepIndex: number;
}

/**
 * Calculates the next unique sequence number (SeqNo) for a permit approval record.
 * Finds the maximum existing SeqNo and adds 1 (e.g. 1 -> 2 -> 3), preventing SAP duplicate key collisions.
 */
export function calculateNextSeqNo(existingApprovals: ApprovalRecord[] = []): string {
  const maxSeq = existingApprovals.reduce((max, a) => {
    const n = parseInt(String(a.SeqNo || '0'), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return String(maxSeq + 1);
}

/**
 * Returns the active approvals for the current cycle of a permit.
 * If the permit was resubmitted (status is NOT REJT/REJC/CANC), any rejection record with a lower
 * SeqNo or CycleNo is treated as historical. Only approvals after the last rejection are active.
 */
export function getActiveCycleApprovals(
  approvals: ApprovalRecord[] = [],
  permitStatus?: string
): ApprovalRecord[] {
  if (!approvals || approvals.length === 0) return [];
  const isCurrentlyRejected = permitStatus === 'REJT' || permitStatus === 'REJC' || permitStatus === 'REJECTED' || permitStatus === 'CANC';
  if (isCurrentlyRejected) return approvals;

  // Sort approvals chronologically by CycleNo (if available) and SeqNo
  const sorted = [...approvals].sort((a, b) => {
    const cycleA = a.CycleNo || 1;
    const cycleB = b.CycleNo || 1;
    if (cycleA !== cycleB) return cycleA - cycleB;
    const seqA = parseInt(String(a.SeqNo || '0'), 10);
    const seqB = parseInt(String(b.SeqNo || '0'), 10);
    return seqA - seqB;
  });

  // Find the index of the latest rejection
  let lastRjIndex = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const act = (sorted[i].Action || '').trim().toUpperCase();
    if (act === 'RJ' || act === 'REJECTED' || act === 'REJT') {
      lastRjIndex = i;
      break;
    }
  }

  // If no rejection found, all approvals belong to the active cycle
  if (lastRjIndex === -1) return sorted;

  // Rejection was superseded by resubmission; only approvals after it are active in the current cycle
  return sorted.slice(lastRjIndex + 1);
}

/**
 * Determines the next required step in the multi-tier approval chain based on the Official GFL Time-Band Matrix.
 * Automatically computes unique SeqNo and chooses the appropriate RoleId and Stage without needing manual dropdown selection.
 * Fully supports Time-Band rules:
 * - Cold Work: Approver Sign Not Required
 * - Hot Work: Day/Evening (Appr I & II), Night (Direct Appr II)
 * - Confined Space: Day/Evening (Appr I & II), Night (Direct Appr III)
 * - Excavation: Day/Evening (Below 1.8 Appr I & II), Night (Below 1.8 Appr II)
 * - Work at Height: Day/Evening (Appr I), Night (Appr II)
 * - Line Breaking: Day/Evening (Appr I & II), Night (Appr II)
 * - Radiography: Day (Appr I), Evening (Appr I & II), Night (Appr II)
 * - Rigging: Day (Appr I), Evening (Appr I & II), Night (Appr II)
 */
export function getNextApprovalStep(
  existingApprovals: ApprovalRecord[] = [],
  permitStatus?: string,
  permitType?: string,
  timeBandOrTime?: TimeBandId | string | Date | null
): NextApprovalStepInfo {
  const nextSeqNo = calculateNextSeqNo(existingApprovals);
  const activeApprovals = getActiveCycleApprovals(existingApprovals, permitStatus);

  const hasAppr1 = activeApprovals.some(
    (a) =>
      (a.RoleId === 'PTW_APPR1' || (a.Stage === 'APPR' && a.SeqNo === '1')) &&
      (a.Action === 'AP' || a.Action === 'APPROVED') &&
      Boolean(a.SignedBy?.trim())
  ) || activeApprovals.filter(a => a.Action === 'AP' || a.Action === 'APPROVED').some(a => a.RoleId === 'PTW_APPR1');

  const hasAppr2 = activeApprovals.some(
    (a) =>
      (a.RoleId === 'PTW_APPR2' || (a.Stage === 'APPR' && a.SeqNo === '2')) &&
      (a.Action === 'AP' || a.Action === 'APPROVED') &&
      Boolean(a.SignedBy?.trim())
  );

  const hasAppr3 = activeApprovals.some(
    (a) =>
      (a.RoleId === 'PTW_APPR3' || (a.Stage === 'APPR' && a.SeqNo === '3')) &&
      (a.Action === 'AP' || a.Action === 'APPROVED') &&
      Boolean(a.SignedBy?.trim())
  );

  const isStatusApproved = permitStatus === 'APPR' || permitStatus === 'ACCP' || permitStatus === 'ISSU' || permitStatus === 'ACTV' || permitStatus === 'CLSD';

  const isExplicitRejected = permitStatus === 'REJT' || permitStatus === 'REJC' || permitStatus === 'REJECTED' || permitStatus === 'CANC';
  // A permit is rejected if explicitly in a rejected status, OR if no status is specified and the last recorded approval is a rejection
  const hasRejection = isExplicitRejected || (
    permitStatus === undefined && existingApprovals.length > 0 &&
    (existingApprovals[existingApprovals.length - 1].Action === 'RJ' ||
     existingApprovals[existingApprovals.length - 1].Action === 'REJECTED' ||
     existingApprovals[existingApprovals.length - 1].Action === 'REJT')
  );

  if (hasRejection) {
    return {
      stage: 'APPR',
      seqNo: nextSeqNo,
      roleId: 'PTW_APPR1',
      action: 'RJ',
      roleTitle: 'Permit Authorization Denied',
      pendingRoleName: 'Permit Rejected by Approver',
      isFullyApproved: false,
      isRejected: true,
      stepIndex: 0
    };
  }

  // 1. If permit status is already approved/issued/active in SAP
  if (isStatusApproved) {
    return {
      stage: 'APPR',
      seqNo: nextSeqNo,
      roleId: hasAppr3 ? 'PTW_APPR3' : hasAppr2 ? 'PTW_APPR2' : 'PTW_APPR1',
      action: 'AP',
      roleTitle: 'All Required Approvals Completed',
      pendingRoleName: 'Permit Fully Authorized',
      isFullyApproved: true,
      stepIndex: hasAppr3 ? 4 : hasAppr2 ? 3 : 2
    };
  }

  // 2. If permitType is provided, evaluate according to the Official GFL Time-Band Matrix
  if (permitType?.trim()) {
    const policy = getRequiredApproversForPermit(permitType, timeBandOrTime);

    // If policy states Approver sign not required (e.g. Cold Work)
    if (!policy.isApprovalRequired) {
      return {
        stage: 'APPR',
        seqNo: nextSeqNo,
        roleId: 'PTW_APPR1',
        action: 'AP',
        roleTitle: 'Approver Sign Not Required (Cold Work)',
        pendingRoleName: 'Fast-Tracked to Issuer / Execution',
        isFullyApproved: true,
        stepIndex: 1
      };
    }

    const requiredRoles = policy.requiredRoles;
    const isRoleSigned = (r: 'PTW_APPR1' | 'PTW_APPR2' | 'PTW_APPR3') => {
      if (r === 'PTW_APPR1') return hasAppr1;
      if (r === 'PTW_APPR2') return hasAppr2;
      if (r === 'PTW_APPR3') return hasAppr3;
      return false;
    };

    const nextRole = requiredRoles.find(r => !isRoleSigned(r));

    // If all required roles in this time band are already signed:
    if (!nextRole && requiredRoles.length > 0) {
      return {
        stage: 'APPR',
        seqNo: nextSeqNo,
        roleId: requiredRoles[requiredRoles.length - 1] || 'PTW_APPR1',
        action: 'AP',
        roleTitle: 'All Required Approvals Completed',
        pendingRoleName: 'Permit Fully Authorized',
        isFullyApproved: true,
        stepIndex: requiredRoles.length + 1
      };
    }

    // Return the specific next required role
    if (nextRole === 'PTW_APPR3') {
      return {
        stage: 'APPR',
        seqNo: nextSeqNo,
        roleId: 'PTW_APPR3',
        action: 'AP',
        roleTitle: 'PTW Approver III',
        pendingRoleName: 'Approver III (HSE Head / Shift Manager)',
        isFullyApproved: false,
        stepIndex: requiredRoles.indexOf('PTW_APPR3') + 1
      };
    }

    if (nextRole === 'PTW_APPR2') {
      return {
        stage: 'APPR',
        seqNo: nextSeqNo,
        roleId: 'PTW_APPR2',
        action: 'AP',
        roleTitle: 'PTW Approver II',
        pendingRoleName: 'Approver II (Safety / Shift Head)',
        isFullyApproved: false,
        stepIndex: requiredRoles.indexOf('PTW_APPR2') + 1
      };
    }

    return {
      stage: 'APPR',
      seqNo: nextSeqNo,
      roleId: 'PTW_APPR1',
      action: 'AP',
      roleTitle: 'PTW Approver I',
      pendingRoleName: 'Approver I (Area In-Charge)',
      isFullyApproved: false,
      stepIndex: 1
    };
  }

  // 3. Fallback for generic calls where permitType is not specified
  if (hasAppr3) {
    return {
      stage: 'APPR',
      seqNo: nextSeqNo,
      roleId: 'PTW_APPR3',
      action: 'AP',
      roleTitle: 'All Required Approvals Completed',
      pendingRoleName: 'Permit Fully Authorized',
      isFullyApproved: true,
      stepIndex: 4
    };
  }

  if (hasAppr1 && hasAppr2 && !hasAppr3) {
    if (permitStatus === undefined && !existingApprovals.some(a => a.RoleId === 'PTW_APPR3')) {
      return {
        stage: 'APPR',
        seqNo: nextSeqNo,
        roleId: 'PTW_APPR2',
        action: 'AP',
        roleTitle: 'All Required Approvals Completed',
        pendingRoleName: 'Permit Fully Authorized',
        isFullyApproved: true,
        stepIndex: 3
      };
    }

    return {
      stage: 'APPR',
      seqNo: nextSeqNo,
      roleId: 'PTW_APPR3',
      action: 'AP',
      roleTitle: 'PTW Approver III',
      pendingRoleName: 'Approver III (HSE Head / Shift Manager)',
      isFullyApproved: false,
      stepIndex: 3
    };
  }

  if (hasAppr1 && !hasAppr2) {
    return {
      stage: 'APPR',
      seqNo: nextSeqNo,
      roleId: 'PTW_APPR2',
      action: 'AP',
      roleTitle: 'PTW Approver II',
      pendingRoleName: 'Approver II (Safety / Shift Head)',
      isFullyApproved: false,
      stepIndex: 2
    };
  }

  const hasPendingVerRecord = existingApprovals.some(
    (a) => (a.RoleId === 'VER' || a.Stage === '01') && !a.SignedBy?.trim()
  );

  if (hasPendingVerRecord) {
    return {
      stage: '01',
      seqNo: nextSeqNo,
      roleId: 'VER',
      action: 'VR',
      roleTitle: 'Site Verification (VER)',
      pendingRoleName: 'Site Verifier',
      isFullyApproved: false,
      stepIndex: 1
    };
  }

  return {
    stage: 'APPR',
    seqNo: nextSeqNo,
    roleId: 'PTW_APPR1',
    action: 'AP',
    roleTitle: 'PTW Approver I',
    pendingRoleName: 'Approver I (Area In-Charge)',
    isFullyApproved: false,
    stepIndex: 1
  };
}

/**
 * Module API: Permit Approver (SAP Live Entity: Approval / _Approval)
 * Service Endpoint: /sap/opu/odata4/sap/zptw_mamagement_srv/srvd_a2x/sap/zptw_services/0001/Approval
 */
export const permitApproverApi = {
  /**
   * Fetches approvals from /Approval entity set, optionally filtered by PermitNo (supports raw, unpadded, and padded variants)
   */
  async getApprovals(permitNo?: string, signal?: AbortSignal): Promise<ApprovalRecord[]> {
    const params: string[] = ['$orderby=SeqNo asc'];
    if (permitNo?.trim()) {
      const raw = permitNo.trim();
      const numOnly = raw.replace(/^PTW/i, '');
      const padded7 = numOnly.padStart(7, '0');
      const padded10 = numOnly.padStart(10, '0');
      const ptwFormatted = `PTW${padded7}`;
      const candidates = Array.from(new Set([raw, numOnly, padded7, padded10, ptwFormatted].filter(Boolean)));
      const filterStr = candidates.map(c => `PermitNo eq '${c.replace(/'/g, "''")}'`).join(' or ');
      params.push(`$filter=(${filterStr})`);
    }
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    const endpoint = `${ODATA_ENTITIES.APPROVAL}${query}`;
    try {
      const response = await odataClient.get<ODataCollectionResponse<ApprovalRecord>>(endpoint, { signal });
      return response.data?.value || [];
    } catch (error: any) {
      if (signal?.aborted || error?.response?.status !== 400) throw error;
      // Gateway fallback if complex OR filter is rejected by ABAP service
      if (permitNo?.trim()) {
        try {
          const fbEndpoint = `${ODATA_ENTITIES.APPROVAL}?$filter=PermitNo eq '${permitNo.trim().replace(/'/g, "''")}'&$orderby=SeqNo asc`;
          const fbResponse = await odataClient.get<ODataCollectionResponse<ApprovalRecord>>(fbEndpoint, { signal });
          return fbResponse.data?.value || [];
        } catch (fallbackError) {
          throw fallbackError;
        }
      }
      throw error;
    }
  },

  /**
   * Retrieves the approval workflow chain for a specific permit
   */
  async getApprovalChain(permitNo: string, signal?: AbortSignal): Promise<ApprovalRecord[]> {
    return this.getApprovals(permitNo, signal);
  },

  /**
   * Executes the SAP RAP bound action for permit approval:
   * POST /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.approve
   * Payload: { PermitNo: string, Comments: string }
   */
  async executeApproveAction(params: { permitNo: string; comments?: string }): Promise<any> {
    const payload = {
      PermitNo: params.permitNo,
      Comments: params.comments || ''
    };
    const response = await odataClient.post(ODATA_ACTIONS.APPROVE, payload);
    return response.data;
  },

  /**
   * Executes the SAP RAP bound action for permit rejection:
   * POST /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.reject
   * Payload: { PermitNo: string, Reason: string }
   */
  async executeRejectAction(params: { permitNo: string; reason: string }): Promise<any> {
    const payload = {
      PermitNo: params.permitNo,
      Reason: params.reason || ''
    };
    const response = await odataClient.post(ODATA_ACTIONS.REJECT, payload);
    return response.data;
  },

  /**
   * Executes the SAP RAP bound action for permit acceptor accept:
   * POST /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.acceptPermit
   * Payload: { PermitNo: string, Comments: string }
   */
  async executeAcceptPermitAction(params: { permitNo: string; comments?: string }): Promise<any> {
    const payload = {
      PermitNo: params.permitNo,
      Comments: params.comments || ''
    };
    const response = await odataClient.post(ODATA_ACTIONS.ACCEPT_PERMIT, payload);
    return response.data;
  },

  /**
   * Executes the SAP RAP bound action for permit acceptor reject:
   * POST /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.rejectAcceptor
   * Payload: { PermitNo: string, Reason: string }
   */
  async executeRejectAcceptorAction(params: { permitNo: string; reason: string }): Promise<any> {
    const payload = {
      PermitNo: params.permitNo,
      Reason: params.reason || ''
    };
    const response = await odataClient.post(ODATA_ACTIONS.REJECT_ACCEPTOR, payload);
    return response.data;
  },

  /**
   * Convenience method to accept permit as acceptor
   */
  async acceptPermit(params: { permitNo: string; comments?: string }): Promise<any> {
    return this.executeAcceptPermitAction(params);
  },

  /**
   * Convenience method to reject permit as acceptor
   */
  async rejectAcceptor(params: { permitNo: string; reason: string }): Promise<any> {
    return this.executeRejectAcceptorAction(params);
  },

  /**
   * Executes the SAP RAP bound action for Area Operator complete / accept:
   * POST /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.completeAreaOperator
   * Payload: { PermitNo: string, Comments: string }
   */
  async executeCompleteAreaOperatorAction(params: { permitNo: string; comments?: string }): Promise<any> {
    const payload = {
      PermitNo: params.permitNo,
      Comments: params.comments || ''
    };
    const response = await odataClient.post(ODATA_ACTIONS.COMPLETE_AREA_OPERATOR, payload);
    return response.data;
  },

  /**
   * Executes the SAP RAP bound action for Area Operator reject:
   * POST /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.rejectAreaOperator
   * Payload: { PermitNo: string, Reason: string }
   */
  async executeRejectAreaOperatorAction(params: { permitNo: string; reason: string }): Promise<any> {
    const payload = {
      PermitNo: params.permitNo,
      Reason: params.reason || ''
    };
    const response = await odataClient.post(ODATA_ACTIONS.REJECT_AREA_OPERATOR, payload);
    return response.data;
  },

  /**
   * Convenience method to complete / accept permit as Area Operator
   */
  async completeAreaOperator(params: { permitNo: string; comments?: string }): Promise<any> {
    return this.executeCompleteAreaOperatorAction(params);
  },

  /**
   * Convenience method to reject permit as Area Operator
   */
  async rejectAreaOperator(params: { permitNo: string; reason: string }): Promise<any> {
    return this.executeRejectAreaOperatorAction(params);
  },

  /**
   * Submits (Creates / Logs) an approval record into SAP.
   * If action is APPROVE ('AP'), routes to the SAP RAP approve action:
   * /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.approve
   * If action is REJECT ('RJ'), routes to the SAP RAP reject action:
   * /Approval/com.sap.gateway.srvd_a2x.zptw_services.v0001.reject
   * If action is ACCEPT ('AC'/'ACCEPT'), routes to acceptPermit action.
   * If action is REJECT_ACCEPTOR ('RJA'), routes to rejectAcceptor action.
   * Otherwise logs to /Approval entity set with verified unique SeqNo.
   */
  async submitApproval(record: ApprovalRecord): Promise<ApprovalRecord> {
    // If the action is APPROVE ('AP'), execute the designated SAP RAP approve action
    if (record.Action === 'AP') {
      const actionResult = await this.executeApproveAction({
        permitNo: record.PermitNo,
        comments: record.Comments || ''
      });
      return (actionResult as ApprovalRecord) || record;
    }

    // If the action is REJECT ('RJ'), execute the designated SAP RAP reject action
    if (record.Action === 'RJ') {
      const actionResult = await this.executeRejectAction({
        permitNo: record.PermitNo,
        reason: record.Comments || ''
      });
      return (actionResult as ApprovalRecord) || record;
    }

    // If the action is ACCEPT ('AC' / 'ACCP' / 'ACCEPT'), execute designated SAP RAP acceptPermit action
    if (record.Action === 'AC' || record.Action === 'ACCP' || record.Action === 'ACCEPT') {
      const actionResult = await this.executeAcceptPermitAction({
        permitNo: record.PermitNo,
        comments: record.Comments || ''
      });
      return (actionResult as ApprovalRecord) || record;
    }

    // If the action is REJECT_ACCEPTOR ('RJA' / 'REJECT_ACCEPTOR'), execute designated SAP RAP rejectAcceptor action
    if (record.Action === 'RJA' || record.Action === 'REJECT_ACCEPTOR') {
      const actionResult = await this.executeRejectAcceptorAction({
        permitNo: record.PermitNo,
        reason: record.Comments || ''
      });
      return (actionResult as ApprovalRecord) || record;
    }

    // If the action is COMPLETE_AREA_OPERATOR ('CAO' / 'COMPLETE_AREA_OPERATOR'), execute designated SAP RAP completeAreaOperator action
    if (record.Action === 'CAO' || record.Action === 'COMPLETE_AREA_OPERATOR') {
      const actionResult = await this.executeCompleteAreaOperatorAction({
        permitNo: record.PermitNo,
        comments: record.Comments || ''
      });
      return (actionResult as ApprovalRecord) || record;
    }

    // If the action is REJECT_AREA_OPERATOR ('RAO' / 'REJECT_AREA_OPERATOR'), execute designated SAP RAP rejectAreaOperator action
    if (record.Action === 'RAO' || record.Action === 'REJECT_AREA_OPERATOR') {
      const actionResult = await this.executeRejectAreaOperatorAction({
        permitNo: record.PermitNo,
        reason: record.Comments || ''
      });
      return (actionResult as ApprovalRecord) || record;
    }

    const { date, time } = getNowDateAndTime();

    // 1. Fetch live existing approvals directly from SAP to know ALL existing keys
    let liveApprovals: ApprovalRecord[] = [];
    try {
      liveApprovals = await this.getApprovals(record.PermitNo);
    } catch {
      // Continue with provided record if network query fails
    }

    // 2. Determine target PermitNo format matching live records if available
    let finalPermitNo = record.PermitNo;
    if (liveApprovals.length > 0 && liveApprovals[0].PermitNo) {
      finalPermitNo = liveApprovals[0].PermitNo;
    }

    // 3. Find highest SeqNo across live SAP records
    const maxSeq = liveApprovals.reduce((max, a) => {
      const n = parseInt(String(a.SeqNo || '0'), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);

    // 4. Guaranteed unique SeqNo (auto-build: maxSeq + 1 if collision or invalid)
    let finalSeqNo = record.SeqNo || '1';
    const isSeqCollision = liveApprovals.some(a => String(a.SeqNo) === String(finalSeqNo));
    if (isSeqCollision || parseInt(finalSeqNo, 10) <= maxSeq) {
      finalSeqNo = String(maxSeq + 1);
    }

    // 5. Automatic role resolution: if role is already approved in live SAP for active cycle, advance to next role
    let finalRoleId = record.RoleId || 'PTW_APPR1';
    let finalStage = record.Stage || 'APPR';
    const activeLiveApprovals = getActiveCycleApprovals(liveApprovals, 'CRTD');
    const roleAlreadySigned = activeLiveApprovals.some(
      a => a.RoleId === finalRoleId && (a.Action === 'AP' || a.Action === 'VR') && Boolean(a.SignedBy?.trim())
    );
    if (roleAlreadySigned) {
      const nextStep = getNextApprovalStep(liveApprovals, 'CRTD');
      finalRoleId = nextStep.roleId;
      finalStage = nextStep.stage;
      finalSeqNo = String(maxSeq + 1);
    }

    const maxCycle = liveApprovals.reduce((max, a) => Math.max(max, a.CycleNo || 1), 1);
    const payload: ApprovalRecord = {
      PermitNo: finalPermitNo,
      ...(record.CycleNo !== undefined || maxCycle > 1 ? { CycleNo: record.CycleNo || maxCycle } : {}),
      Stage: finalStage,
      SeqNo: finalSeqNo,
      RoleId: finalRoleId,
      Action: record.Action || 'AP',
      SignedBy: record.SignedBy || '',
      ActionDate: record.ActionDate !== undefined && record.ActionDate !== null ? record.ActionDate : date,
      ActionTime: record.ActionTime || time,
      Comments: record.Comments || ''
    };

    const response = await odataClient.post<ApprovalRecord>(ODATA_ENTITIES.APPROVAL, payload);
    return response.data;
  },

  /**
   * Auto-determines the next step (SeqNo, RoleId, Stage) and submits the approval/rejection.
   */
  async submitAutoApproval(params: {
    permitNo: string;
    existingApprovals?: ApprovalRecord[];
    action: 'AP' | 'RJ' | 'VR';
    signedBy: string;
    comments?: string;
    permitStatus?: string;
  }): Promise<{ record: ApprovalRecord; step: NextApprovalStepInfo }> {
    const step = getNextApprovalStep(params.existingApprovals, params.permitStatus);
    const result = await this.submitApproval({
      PermitNo: params.permitNo,
      Stage: step.stage,
      SeqNo: step.seqNo,
      RoleId: step.roleId,
      Action: params.action,
      SignedBy: params.signedBy,
      ActionDate: null,
      ActionTime: '',
      Comments: params.comments || ''
    });
    return { record: result, step };
  },

  /**
   * Logs an APPROVE action ('AP') for a permit tier
   */
  async approvePermit(params: {
    permitNo: string;
    stage?: string;
    seqNo?: string;
    roleId?: string;
    signedBy: string;
    comments?: string;
  }): Promise<ApprovalRecord> {
    const { date, time } = getNowDateAndTime();
    return this.submitApproval({
      PermitNo: params.permitNo,
      Stage: params.stage || 'APPR',
      SeqNo: params.seqNo || '1',
      RoleId: params.roleId || 'PTW_APPR1',
      Action: 'AP',
      SignedBy: params.signedBy,
      ActionDate: date,
      ActionTime: time,
      Comments: params.comments || ''
    });
  },

  /**
   * Logs a VERIFY action ('VR') for a permit (e.g. Stage 01 / Role VER)
   */
  async verifyPermit(params: {
    permitNo: string;
    stage?: string;
    seqNo?: string;
    roleId?: string;
    signedBy: string;
    comments?: string;
  }): Promise<ApprovalRecord> {
    const { date, time } = getNowDateAndTime();
    return this.submitApproval({
      PermitNo: params.permitNo,
      Stage: params.stage || '01',
      SeqNo: params.seqNo || '1',
      RoleId: params.roleId || 'VER',
      Action: 'VR',
      SignedBy: params.signedBy,
      ActionDate: date,
      ActionTime: time,
      Comments: params.comments || ''
    });
  },

  /**
   * Executes a REJECT action ('RJ') for a permit via SAP RAP reject bound action
   */
  async rejectPermit(params: {
    permitNo: string;
    stage?: string;
    seqNo?: string;
    roleId?: string;
    signedBy: string;
    comments: string;
  }): Promise<ApprovalRecord> {
    const result = await this.executeRejectAction({
      permitNo: params.permitNo,
      reason: params.comments || 'Rejected during review'
    });
    return (result as ApprovalRecord) || {
      PermitNo: params.permitNo,
      Stage: params.stage || 'APPR',
      SeqNo: params.seqNo || '1',
      RoleId: params.roleId || 'PTW_APPR1',
      Action: 'RJ',
      SignedBy: params.signedBy,
      ActionDate: null,
      ActionTime: '',
      Comments: params.comments || 'Rejected during review'
    };
  },

  /**
   * Fetches permits awaiting review/approval for a specific plant or role
   */
  async getPendingApprovals(plant?: string): Promise<PermitHeader[]> {
    const filters: string[] = ["(Status eq 'SUBM' or Status eq 'HSE_A' or Status eq 'AREA_A' or Status eq 'INTD')"];
    if (plant) {
      filters.push(`Plant eq '${plant}'`);
    }

    const query = buildODataQuery({
      $filter: filters.join(' and '),
      $expand: ['_Approval', '_HazardControl'],
      $orderby: 'CreatedAt asc',
    });

    const endpoint = `${ODATA_ENTITIES.PERMIT_INFO}${query}`;
    const response = await odataClient.get<ODataCollectionResponse<PermitHeader>>(endpoint);
    return response.data?.value || [];
  },

  /**
   * Backward-compatibility alias for legacy approveStep callers
   */
  async approveStep(
    approvalStepId: string,
    approverUserId: string,
    _signatureToken?: string,
    comments?: string,
    _etag?: string
  ): Promise<PermitApproval> {
    return this.approvePermit({
      permitNo: approvalStepId,
      signedBy: approverUserId,
      comments
    }) as unknown as PermitApproval;
  },

  /**
   * Backward-compatibility alias for legacy rejectStep callers
   */
  async rejectStep(
    approvalStepId: string,
    approverUserId: string,
    comments: string,
    _etag?: string
  ): Promise<PermitApproval> {
    return this.rejectPermit({
      permitNo: approvalStepId,
      signedBy: approverUserId,
      comments
    }) as unknown as PermitApproval;
  }
};

export default permitApproverApi;
