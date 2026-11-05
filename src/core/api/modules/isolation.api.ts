import { prepareIsolationCreate } from './isolation.validation';
import { entityKey, WorkflowUnconfirmedError } from './backendWorkflow.api';
import { odataClient } from '../odataClient';
import type { SapIsolationHeader, SapIsolationResponse } from '../../types/isolation.types';

export const FALLBACK_ISOLATION_DATA: SapIsolationHeader[] = [];

const getStoredPermitLinks = (): Record<string, string> => {
  try {
    if (import.meta.env.DEV && typeof window !== 'undefined' && window.localStorage) {
      return JSON.parse(window.localStorage.getItem('ptw_isolation_permit_links') || '{}');
    }
  } catch {}
  return {};
};

const setStoredPermitLink = (isoNo: string, permitNo: string) => {
  try {
    if (import.meta.env.DEV && typeof window !== 'undefined' && window.localStorage) {
      const map = JSON.parse(window.localStorage.getItem('ptw_isolation_permit_links') || '{}');
      if (permitNo?.trim()) {
        map[isoNo] = permitNo.trim();
      } else {
        delete map[isoNo];
      }
      window.localStorage.setItem('ptw_isolation_permit_links', JSON.stringify(map));
    }
  } catch {}
};

class IsolationApiService {
  public async list(permitNo?: string, signal?: AbortSignal): Promise<SapIsolationHeader[]> {
    const query = permitNo?.trim() ? `&$filter=${encodeURIComponent("PermitNo eq '" + permitNo.trim().replace(/'/g, "''") + "'")}` : '';
    const response = await odataClient.get<SapIsolationResponse>(`Isolation?$expand=_Item${query}`, { signal });
    if (!Array.isArray(response.data?.value)) throw new Error('SAP did not return isolation certificates.');
    const localLinks = getStoredPermitLinks();
    return response.data.value.map((iso) => ({
      ...iso,
      PermitNo: iso.PermitNo?.trim() || localLinks[iso.IsolationNo] || ''
    }));
  }
  public async read(isolationNo: string, signal?: AbortSignal): Promise<SapIsolationHeader | null> {
    const response = await odataClient.get<SapIsolationHeader>(`Isolation('${entityKey(isolationNo)}')?$expand=_Item`, { signal });
    if (!response.data?.IsolationNo) throw new Error('SAP did not return this isolation certificate.');
    const localLinks = getStoredPermitLinks();
    return {
      ...response.data,
      PermitNo: response.data.PermitNo?.trim() || localLinks[response.data.IsolationNo] || '',
      '@odata.etag': response.data['@odata.etag'] || response.headers?.etag
    };
  }
  public async create(payload: Partial<SapIsolationHeader>): Promise<SapIsolationHeader> {
    const body = prepareIsolationCreate(payload);
    let response;
    try { response = await odataClient.post<SapIsolationHeader>('Isolation', body, { headers: { Prefer: 'return=representation' } }); }
    catch (reason: any) {
      if ((!reason.response && !reason.beforeSend) || reason.response?.status >= 500) throw new WorkflowUnconfirmedError('Isolation save outcome is unconfirmed. Check SAP before creating another certificate.');
      throw reason;
    }
    if (!response.data?.IsolationNo || response.data.SAP__Messages?.some(message => (message.numericSeverity || 0) >= 4)) throw new WorkflowUnconfirmedError('SAP did not return a confirmed isolation certificate. Check SAP before retrying.');
    if (payload.PermitNo?.trim()) {
      setStoredPermitLink(response.data.IsolationNo, payload.PermitNo.trim());
    }
    return { ...response.data, '@odata.etag': response.data['@odata.etag'] || response.headers?.etag };
  }
  public async update(isolationNo: string, payload: Partial<SapIsolationHeader>, etag?: string): Promise<SapIsolationHeader> {
    if (Object.keys(payload).some(key => key !== 'Remarks' && key !== 'description' && key !== 'PermitNo')) {
      throw new Error('Only PermitNo, remarks, and description can be edited. Certificate number is immutable; use workflow actions for certificate status.');
    }
    if (payload.PermitNo !== undefined && payload.PermitNo.trim().length > 10) {
      throw new Error('Permit number must be at most 10 characters.');
    }
    if ((payload.Remarks || '').length > 255) throw new Error('Remarks must be at most 255 characters.');
    if ((payload.description || '').length > 255) throw new Error('Description must be at most 255 characters.');
    const patchBody: Record<string, string> = {};
    if (payload.PermitNo !== undefined) patchBody.PermitNo = payload.PermitNo.trim();
    if (payload.Remarks !== undefined) patchBody.Remarks = payload.Remarks || '';
    if (payload.description !== undefined) patchBody.description = payload.description || '';
    try {
      const effectiveEtag = etag?.trim() ? etag.trim() : '*';
      const response = await odataClient.patch<SapIsolationHeader>(
        `Isolation('${entityKey(isolationNo)}')`,
        patchBody,
        effectiveEtag,
        { headers: { Prefer: 'return=representation' } }
      );
      if (!response.data?.IsolationNo || response.data.SAP__Messages?.some(message => (message.numericSeverity || 0) >= 4)) {
        throw new WorkflowUnconfirmedError('SAP did not confirm the isolation update. Check SAP before retrying.');
      }
      if (payload.PermitNo !== undefined) {
        setStoredPermitLink(isolationNo, payload.PermitNo.trim());
      }
      // In OData V4 PATCH representations, SAP may omit unchanged properties or delta fields
      const resolvedPermitNo = (response.data.PermitNo !== undefined && response.data.PermitNo !== '')
        ? response.data.PermitNo
        : (payload.PermitNo !== undefined ? payload.PermitNo.trim() : (response.data.PermitNo || ''));

      return {
        ...response.data,
        PermitNo: resolvedPermitNo,
        description: payload.description !== undefined ? payload.description : (response.data.description ?? ''),
        Remarks: payload.Remarks !== undefined ? payload.Remarks : (response.data.Remarks ?? ''),
        '@odata.etag': response.data['@odata.etag'] || response.headers?.etag || effectiveEtag
      };
    } catch (reason: any) {
      if ((!reason.response && !reason.beforeSend) || reason.response?.status >= 500) {
        throw new WorkflowUnconfirmedError('Isolation update outcome is unconfirmed. Check SAP before retrying.');
      }
      throw reason;
    }
  }
}
export const isolationApi = new IsolationApiService();
export default isolationApi;
