import { gasTesterApi } from './gasTester.api';
import { permitApproverApi } from './permitApprover.api';
import { auditLogApi } from './auditLog.api';
import odataClient from '../odataClient';
import { buildODataQuery, ODATA_ENTITIES, ODATA_ACTIONS } from '../odataEndpoints';
import { toSapPermitType } from '../../ptw/siteProcedure';
import type { ApprovalRecord, AuditLogRecord, PermitDeepInsertResponse, PermitInfoRecord } from '../../types/ptw.types';

export interface PermitListResult extends Array<PermitInfoRecord> {
  totalCount: number;
}

export interface PlantPermitSummary {
  total: number;
  active: number;
  intended: number;
  approved: number;
  draft: number;
  rejected: number;
  closed: number;
  accepted?: number;
  pendingClearance?: number;
  hotOrConf: number;
  categoryCounts: Record<string, number>;
  statusCounts: Record<string, number>;
}

const literal = (value: string) => value.replace(/'/g, "''");
export const sitePermitApi = {
  async list(
    plant: string,
    search: string,
    skip = 0,
    signal?: AbortSignal,
    type?: string,
    status?: string,
    top = 25,
    expand?: string[]
  ): Promise<PermitListResult> {
    const filters: string[] = [];
    if (plant.trim()) filters.push(`Werks eq '${literal(plant.trim())}'`);
    if (search.trim()) filters.push(`(contains(Permit_No,'${literal(search.trim())}') or contains(JobDesc,'${literal(search.trim())}'))`);
    if (type && type !== 'ALL') {
      if (type === 'CRITICAL' || type === 'HOT_CONF') {
        filters.push(`(PermitType eq 'HOT' or PermitType eq 'CONF' or PermitType eq 'CSE')`);
      } else {
        const sapType = toSapPermitType(type);
        if (sapType && sapType !== type) {
          filters.push(`(PermitType eq '${literal(type.trim())}' or PermitType eq '${literal(sapType)}')`);
        } else {
          filters.push(`PermitType eq '${literal(type.trim())}'`);
        }
      }
    }
    if (status && status !== 'ALL') {
      if (status === 'ISSU' || status === 'ACTV') {
        filters.push(`(Status eq 'ISSU' or Status eq 'ACTV')`);
      } else if (status === 'CRTD' || status === 'DRAF') {
        filters.push(`(Status eq 'CRTD' or Status eq 'DRAF')`);
      } else if (status === 'APPROVED' || status === 'APPR_ALL') {
        filters.push(`(Status eq 'APPR' or Status eq 'ACCP' or Status eq 'ISSU' or Status eq 'ACTV')`);
      } else if (status === 'ACCEPTED') {
        filters.push(`(Status eq 'ACCP' or Status eq 'ISSU' or Status eq 'ACTV')`);
      } else if (status === 'PENDING_CLEARANCE') {
        filters.push(`(Status eq 'ACCP' or Status eq 'ISSU' or Status eq 'ISSD' or Status eq 'APPR')`);
      } else if (status === 'CLEARANCE_COMPLETED') {
        filters.push(`(Status eq 'ACTV' or Status eq 'CLSD')`);
      } else if (status === 'CLOS' || status === 'CANC') {
        filters.push(`(Status eq 'CLOS' or Status eq 'CANC')`);
      } else if (status === 'REJT' || status === 'REJC') {
        filters.push(`(Status eq 'REJT' or Status eq 'REJC')`);
      } else {
        filters.push(`Status eq '${literal(status.trim())}'`);
      }
    }
    const expandClause = expand !== undefined ? expand : ['_WorkType'];
    const query = buildODataQuery({
      $filter: filters.join(' and ') || undefined,
      $top: top,
      $skip: skip,
      $count: true,
      $expand: expandClause.length > 0 ? expandClause : undefined,
      $orderby: 'Erdat desc,Erzet desc,Permit_No desc'
    });

    try {
      const response = await odataClient.get<{ value: PermitInfoRecord[]; '@odata.count'?: number }>(
        `${ODATA_ENTITIES.PERMIT_INFO}${query}`,
        { signal }
      );
      if (!Array.isArray(response.data?.value)) throw new Error('SAP did not return a permit list.');

      const countVal = response.data['@odata.count'];
      const totalCount = typeof countVal === 'number'
        ? countVal
        : (response.data.value.length < top ? skip + response.data.value.length : Math.max(skip + response.data.value.length, 25));

      const list = response.data.value as PermitListResult;
      list.totalCount = totalCount;
      return list;
    } catch (err) {
      if (expandClause.length > 0) {
        const fallbackQuery = buildODataQuery({
          $filter: filters.join(' and ') || undefined,
          $top: top,
          $skip: skip,
          $count: true,
          $orderby: 'Erdat desc,Erzet desc,Permit_No desc'
        });
        const fallbackResp = await odataClient.get<{ value: PermitInfoRecord[]; '@odata.count'?: number }>(
          `${ODATA_ENTITIES.PERMIT_INFO}${fallbackQuery}`,
          { signal }
        );
        if (Array.isArray(fallbackResp.data?.value)) {
          const list = fallbackResp.data.value as PermitListResult;
          list.totalCount = typeof fallbackResp.data['@odata.count'] === 'number'
            ? fallbackResp.data['@odata.count']
            : list.length;
          return list;
        }
      }
      throw err;
    }
  },

  async getPlantSummary(plant: string, signal?: AbortSignal): Promise<PlantPermitSummary> {
    const filters: string[] = [];
    if (plant.trim()) filters.push(`Werks eq '${literal(plant.trim())}'`);
    const query = buildODataQuery({
      $filter: filters.join(' and ') || undefined,
      $select: ['Permit_No', 'PermitType', 'Status'],
      $top: 2000
    });
    const response = await odataClient.get<{ value: Array<{ Permit_No: string; PermitType: string; Status: string }> }>(
      `${ODATA_ENTITIES.PERMIT_INFO}${query}`,
      { signal }
    );
    const records = Array.isArray(response.data?.value) ? response.data.value : [];

    const categoryCounts: Record<string, number> = {
      ALL: records.length,
      HOT: records.filter(p => p.PermitType === 'HOT').length,
      COLD: records.filter(p => p.PermitType === 'COLD').length,
      CONF: records.filter(p => p.PermitType === 'CONF' || p.PermitType === 'CSE').length,
      HGHT: records.filter(p => p.PermitType === 'HGHT' || p.PermitType === 'W@H').length,
      ELEC: records.filter(p => p.PermitType === 'ELEC').length,
    };

    const statusCounts: Record<string, number> = {
      ALL: records.length,
      ISSU: records.filter(p => p.Status === 'ISSU' || p.Status === 'ACTV').length,
      INTD: records.filter(p => p.Status === 'INTD').length,
      APPR: records.filter(p => p.Status === 'APPR').length,
      ACCP: records.filter(p => p.Status === 'ACCP').length,
      CRTD: records.filter(p => p.Status === 'CRTD' || p.Status === 'DRAF').length,
      REJT: records.filter(p => p.Status === 'REJT' || p.Status === 'REJC').length,
      CLOS: records.filter(p => p.Status === 'CLOS' || p.Status === 'CANC').length,
    };

    return {
      total: records.length,
      active: statusCounts.ISSU,
      intended: statusCounts.INTD,
      approved: statusCounts.APPR,
      accepted: statusCounts.ACCP,
      pendingClearance: records.filter(p => p.Status === 'ACCP' || p.Status === 'ISSU' || p.Status === 'ISSD' || p.Status === 'APPR').length,
      draft: statusCounts.CRTD,
      rejected: statusCounts.REJT,
      closed: statusCounts.CLOS,
      hotOrConf: records.filter(p => p.PermitType === 'HOT' || p.PermitType === 'CONF' || p.PermitType === 'CSE').length,
      categoryCounts,
      statusCounts
    };
  },
  async read(number: string, signal?: AbortSignal): Promise<PermitDeepInsertResponse> {
    const query = buildODataQuery({ $expand: ['_Worker', '_PPE', '_Safety', '_HazardControl', '_Isolation($expand=_Item)', '_Approval', '_ShiftRenewal', '_Attachment', '_WorkType', '_CHK', '_Equipment', '_NATW'] });
    const key = encodeURIComponent(literal(number)).replace(/'/g, '%27');
    const response = await odataClient.get<PermitDeepInsertResponse>(`${ODATA_ENTITIES.PERMIT_INFO}('${key}')${query}`, { signal });
    if (!response.data?.Permit_No) throw new Error('SAP did not return the requested permit.');
    const canonicalNo = response.data.Permit_No || number;
    const gases = await gasTesterApi.list(number, signal);
    const approvals = await permitApproverApi.getApprovals(number, signal);
    const auditLogs = await auditLogApi.getAuditLogs(canonicalNo, signal).catch(() => []);
    const mergedApprovals = (approvals && approvals.length > 0)
      ? approvals
      : (response.data._Approval || []);
    return {
      ...response.data,
      _GasTest: gases,
      _Approval: mergedApprovals,
      _AuditLog: auditLogs,
      '@odata.etag': response.data['@odata.etag'] || response.headers?.etag
    };
  },
  async updateIsolationLink(permitNo: string, isolationNo: string, etag?: string): Promise<PermitInfoRecord | null> {
    if (!permitNo?.trim()) return null;
    const cleanNo = permitNo.trim().replace(/^'|'$/g, '');
    // SAP Alpha conversion: pad purely numeric permit numbers to 10 digits
    const normalizedNo = /^\d+$/.test(cleanNo) && cleanNo.length < 10
      ? cleanNo.padStart(10, '0')
      : cleanNo;

    if (normalizedNo.length > 10) {
      console.warn('[sitePermitApi] Permit number exceeds 10 characters:', normalizedNo);
      return null;
    }

    const key = encodeURIComponent(literal(normalizedNo)).replace(/'/g, '%27');
    try {
      const response = await odataClient.patch<PermitInfoRecord>(
        `${ODATA_ENTITIES.PERMIT_INFO}('${key}')`,
        {
          IsolationNo: isolationNo.trim(),
          LotoCertNo: isolationNo.trim()
        },
        etag?.trim() ? etag.trim() : '*'
      );
      return response.data;
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.message || 'SAP Gateway Error';
      console.error(`[sitePermitApi] Could not patch IsolationNo on PermitInfo('${normalizedNo}'):`, errMsg, err);
      throw new Error(`SAP Permit ${normalizedNo} rejected Isolation link (${isolationNo}): ${errMsg}`);
    }
  },
  async getApprovals(permitNo: string, signal?: AbortSignal): Promise<ApprovalRecord[]> {
    return permitApproverApi.getApprovals(permitNo, signal);
  },
  async getAuditLogs(permitNo: string, signal?: AbortSignal): Promise<AuditLogRecord[]> {
    return auditLogApi.getAuditLogs(permitNo, signal);
  },
  async submitApproval(record: ApprovalRecord): Promise<ApprovalRecord> {
    return permitApproverApi.submitApproval(record);
  },
  async executeAcceptPermitAction(params: { permitNo: string; comments?: string }): Promise<any> {
    return permitApproverApi.executeAcceptPermitAction(params);
  },
  async executeRejectAcceptorAction(params: { permitNo: string; reason: string }): Promise<any> {
    return permitApproverApi.executeRejectAcceptorAction(params);
  },
  /**
   * Updates (PATCH) mutable header fields on an existing permit in SAP
   */
  async updatePermit(permitNo: string, updates: Partial<PermitInfoRecord>, etag?: string): Promise<PermitInfoRecord> {
    if (!permitNo?.trim()) throw new Error('Valid permit number is required');
    const cleanNo = permitNo.trim().replace(/^'|'$/g, '');
    const key = encodeURIComponent(literal(cleanNo)).replace(/'/g, '%27');
    const url = `${ODATA_ENTITIES.PERMIT_INFO}('${key}')`;
    const response = await odataClient.patch<PermitInfoRecord>(url, updates, etag?.trim() ? etag.trim() : '*', {
      headers: { Prefer: 'return=representation' }
    });
    return { ...response.data, '@odata.etag': response.data?.['@odata.etag'] || response.headers?.etag };
  },

  /**
   * Revises permit fields according to rejection remarks and executes the .Resubmit bound action
   */
  async reviseAndResubmit(
    permitNo: string,
    updates: Partial<PermitInfoRecord>,
    comments?: string,
    etag?: string
  ): Promise<PermitDeepInsertResponse> {
    let currentEtag = etag;
    if (updates && Object.keys(updates).length > 0) {
      const updated = await this.updatePermit(permitNo, updates, etag);
      currentEtag = updated['@odata.etag'];
      // A 204 PATCH may omit the new version; read only the header before the action.
      if (!currentEtag || currentEtag === '*') {
        const cleanNo = permitNo.trim().replace(/^'|'$/g, '');
        const key = encodeURIComponent(literal(cleanNo)).replace(/'/g, '%27');
        const latest = await odataClient.get<PermitInfoRecord>(`${ODATA_ENTITIES.PERMIT_INFO}('${key}')`);
        currentEtag = latest.data?.['@odata.etag'] || latest.headers?.etag;
      }
      if (!currentEtag || currentEtag === '*') {
        throw new Error('Changes were saved, but SAP did not provide the new permit version. Refresh the permit before resubmitting.');
      }
    }
    try {
      return await this.resubmit(permitNo, comments, currentEtag);
    } catch (error: any) {
      const detail = error?.response?.data?.error?.message || error?.message || 'SAP could not confirm resubmission.';
      if (Object.keys(updates || {}).length > 0) {
        throw new Error(`Header changes were saved, but resubmission was not confirmed. Refresh the permit before retrying. ${detail}`);
      }
      throw error;
    }
  },

  /**
   * Executes the SAP RAP bound action for permit resubmission:
   * POST /PermitInfo('<key>')/com.sap.gateway.srvd_a2x.zptw_services.v0001.Resubmit
   */
  async resubmit(permitNo: string, comments?: string, etag?: string): Promise<PermitDeepInsertResponse> {
    const cleanNo = permitNo.trim().replace(/^'|'$/g, '');
    const key = encodeURIComponent(literal(cleanNo)).replace(/'/g, '%27');
    const url = `${ODATA_ENTITIES.PERMIT_INFO}('${key}')/${ODATA_ACTIONS.RESUBMIT}`;
    const payload = comments?.trim() ? { Comments: comments.trim(), Reason: comments.trim() } : {};
    const headers: Record<string, string> = {
      Prefer: 'return=representation'
    };
    if (etag && etag.trim() && etag !== '*') {
      headers['If-Match'] = etag.trim();
    }
    try {
      const response = await odataClient.post<PermitDeepInsertResponse>(url, payload, { headers });
      return response.data;
    } catch (err: any) {
      // 1. If SAP RAP action was defined parameterless (action Resubmit result [1] $self;),
      // sending { Comments: ... } could return 400 Bad Request. Fallback to empty body {}.
      if (err?.response?.status === 400 && Object.keys(payload).length > 0) {
        const retryResponse = await odataClient.post<PermitDeepInsertResponse>(url, {}, { headers });
        return retryResponse.data;
      }
      // 2. If SAP RAP expects unquoted key in the URL, retry unquoted
      if (err?.response?.status === 404 && url.includes("('")) {
        const unquotedUrl = `${ODATA_ENTITIES.PERMIT_INFO}(${key})/${ODATA_ACTIONS.RESUBMIT}`;
        const retryResponse = await odataClient.post<PermitDeepInsertResponse>(unquotedUrl, payload, { headers });
        return retryResponse.data;
      }
      throw err;
    }
  },
  async executeCompleteAreaOperatorAction(params: { permitNo: string; comments?: string }): Promise<any> {
    return permitApproverApi.executeCompleteAreaOperatorAction(params);
  },
  async executeRejectAreaOperatorAction(params: { permitNo: string; reason: string }): Promise<any> {
    return permitApproverApi.executeRejectAreaOperatorAction(params);
  }
};
