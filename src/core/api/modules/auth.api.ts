import { getDefaultSapClient } from '../../auth/sapClient';
import odataClient from '../odataClient';
import { ODATA_ENTITIES } from '../odataEndpoints';
import { ODataCollectionResponse } from '../../types/odata.types';
import { SapUserInfoRecord } from '../../auth/sapAuthContext';

export interface SapStartupInfo {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  client?: string;
  language?: string;
}

/**
 * Module API: SAP Authentication, Identity & User Roles
 */
export const authApi = {
  /**
   * Attempts to discover the currently logged-in user from SAP NetWeaver's
   * startup service (/sap/bc/ui2/start_up)
   * using the active browser session cookies.
   */
  async fetchStartupUser(client: string = getDefaultSapClient(), signal?: AbortSignal): Promise<SapStartupInfo | null> {
    const endpoints = [
      `/sap/bc/ui2/start_up`
    ];

    for (const ep of endpoints) {
      if (signal?.aborted) return null;
      try {
        const response = await odataClient.getRoot(ep, {
          signal,
          withCredentials: true,
          params: client ? { 'sap-client': client } : {},
          timeout: 4000,
          headers: {
            'Accept': 'application/json',
            ...(client ? { 'sap-client': client } : {})
          }
        });

        const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
        // Reject HTML login pages returned with 200 OK
        if (contentType.includes('text/html') || response.headers?.['sap-authenticated'] === 'pending') {
          continue;
        }

        const data = response.data;
        if (!data || typeof data !== 'object') continue;

        const rawId =
          data.id ||
          data.userId ||
          data.userName ||
          data.user?.id ||
          data.user?.name ||
          data.d?.id ||
          data.d?.userId;

        if (typeof rawId === 'string' && rawId.trim()) {
          const id = rawId.trim().toUpperCase();
          return {
            id,
            firstName: data.firstName || data.user?.firstName || undefined,
            lastName: data.lastName || data.user?.lastName || undefined,
            fullName:
              data.fullName ||
              data.user?.fullName ||
              [data.firstName, data.lastName].filter(Boolean).join(' ') ||
              undefined,
            email: data.email || data.user?.email || undefined,
            client: [client, data.client, data.sapClient].find(value => typeof value === 'string' && /^\d{3}$/.test(value)),
            language: data.language || data.sapLanguage || undefined
          };
        }
      } catch {
        // Probe next endpoint
      }
    }

    return null;
  },

  /**
   * Fetches user profile, assigned plant, and SAP authorizations from the OData V4 userinfo entity set
   */
  async fetchUserInfo(userId: string, client: string = getDefaultSapClient(), signal?: AbortSignal): Promise<SapUserInfoRecord[]> {
    // Axios merges these with the active client's defaults; embedding a query
    // string in the URL would append a second sap-client parameter.
    const response = await odataClient.get<ODataCollectionResponse<SapUserInfoRecord>>(ODATA_ENTITIES.USER_INFO, {
      signal,
      timeout: 10000,
      params: {
        $filter: `UserId eq '${userId.trim().toUpperCase().replace(/'/g, "''")}'`,
        ...(client ? { 'sap-client': client } : {}),
      },
    });
    return response.data?.value || [];
  },

  /**
   * Fetches assigned user roles directly from the SAP UserRole entity set
   * Service endpoint: /sap/opu/odata4/sap/zptw_mamagement_srv/srvd_a2x/sap/zptw_services/0001/UserRole
   */
  async fetchUserRoles(userId: string, client: string = getDefaultSapClient(), signal?: AbortSignal): Promise<Array<{
    SAP_USER: string;
    PTW_ROLE: string;
    ACTIVE: string;
  }>> {
    const cleanId = userId.trim().toUpperCase();
    const response = await odataClient.get<ODataCollectionResponse<{
      SAP_USER: string; PTW_ROLE: string; ACTIVE: string;
    }>>(ODATA_ENTITIES.USER_ROLE, {
      params: {
        $filter: `SAP_USER eq '${cleanId.replace(/'/g, "''")}'`,
        ...(client ? { 'sap-client': client } : {}),
      },
      signal,
      timeout: 6000,
    });
    if (!Array.isArray(response.data?.value)) throw new Error('SAP returned an invalid UserRole response.');
    return response.data.value.filter(r => r.SAP_USER?.trim().toUpperCase() === cleanId);
  },

  /**
   * Triggers SAP ICF session termination
   */
  async triggerIcfLogoff(): Promise<void> {
    await odataClient.triggerIcfLogoff();
  },

  /**
   * Invalidate local basic auth headers and CSRF tokens
   */
  clearSession(): void {
    odataClient.clearCredentials();
  }
};

export default authApi;

