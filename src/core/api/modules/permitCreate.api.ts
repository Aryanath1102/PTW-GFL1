import { preparePermitCreate, type PreparePermitCreateOptions } from './permitCreate.validation';
import odataClient from '../odataClient';
import { ODATA_ENTITIES } from '../odataEndpoints';
import {
  PermitDeepInsertPayload,
  PermitDeepInsertResponse,
  PermitHeader,
  PermitHazard,
  PermitPPE
} from '../../types/ptw.types';

export class PermitCreateUnconfirmedError extends Error {}

export const permitCreateApi = {
  async createPermitDeepInsert(
    payload: PermitDeepInsertPayload,
    options?: PreparePermitCreateOptions
  ): Promise<PermitDeepInsertResponse> {
    const body = preparePermitCreate(payload, options);
    let response;
    try {
      response = await odataClient.post<PermitDeepInsertResponse>(ODATA_ENTITIES.PERMIT_INFO, body, {
        headers: { Prefer: 'return=representation' },
      });
    } catch (error: any) {
      if (!error.response && !error.beforeSend || error.response?.status >= 500) {
        const detail = error?.message ? `: ${error.message}` : '';
        throw new PermitCreateUnconfirmedError(`The SAP save result could not be confirmed${detail}. Check SAP for an existing permit before starting another request.`);
      }
      throw error;
    }
    if (!response.data || typeof response.data.Permit_No !== 'string' || !response.data.Permit_No.trim()) {
      throw new PermitCreateUnconfirmedError('SAP accepted the request but did not return a permit number. Check SAP before starting another request.');
    }
    const errors = response.data.SAP__Messages?.filter(message => (message.numericSeverity || 0) >= 4);
    if (errors?.length) throw new Error(errors.map(message => message.message).join(' | '));
    if (response.data.Status !== body.Status) throw new PermitCreateUnconfirmedError(`SAP returned permit ${response.data.Permit_No} with status ${response.data.Status || 'missing'}, expected ${body.Status}. Check this permit in SAP before any further action.`);
    return response.data;
  },

  /**
   * Legacy backward-compatibility helpers
   */
  async createDraft(payload: any): Promise<PermitHeader> {
    const res = await odataClient.post(ODATA_ENTITIES.PERMITS, payload);
    return res.data;
  },

  async addHazards(permitId: string, hazards: Omit<PermitHazard, 'HazardId'>[]): Promise<PermitHazard[]> {
    const promises = hazards.map((h) => odataClient.post(ODATA_ENTITIES.HAZARD_CONTROL, { ...h, PermitId: permitId }));
    const results = await Promise.all(promises);
    return results.map((r) => r.data);
  },

  async addPpeItems(permitId: string, ppeItems: Omit<PermitPPE, 'PpeId'>[]): Promise<PermitPPE[]> {
    const promises = ppeItems.map((p) => odataClient.post(ODATA_ENTITIES.PPE, { ...p, PermitId: permitId }));
    const results = await Promise.all(promises);
    return results.map((r) => r.data);
  }
};

export default permitCreateApi;
