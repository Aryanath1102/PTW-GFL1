import odataClient from '../odataClient';
import { ODATA_ENTITIES, buildODataQuery } from '../odataEndpoints';
import { PermitAuditEntry } from '../../types/ptw.types';
import { ODataCollectionResponse } from '../../types/odata.types';
import { SapUserRoleRecord, SapUserRoleResponse, PFCGUserRecord } from '../../types/admin.types';

export interface PlantMasterRecord {
  PlantId: string;
  PlantName: string;
  Complex: string;
  Areas: string[];
}

export interface HazardCatalogItem {
  Category: string;
  Description: string;
  DefaultSeverity: number;
  DefaultLikelihood: number;
  RecommendedControl: string;
}

export interface PpeCatalogItem {
  PpeCode: string;
  Label: string;
  Category: 'HEAD' | 'EYE' | 'BODY' | 'HANDS' | 'FEET' | 'RESPIRATORY';
  MandatoryDefault: boolean;
}

export interface UserRoleFilterParams {
  user?: string;
  role?: string;
  activeOnly?: boolean;
}

export interface UserRoleStats {
  totalRoles: number;
  activeAdmins: number;
  activeApprovers: number;
  activeIssuers: number;
  inactiveRoles: number;
  uniqueUsers: number;
}

/**
 * Module API: PTW Admin (User Roles, Master Data, Catalogues & Global Audits)
 */
export const adminApi = {
  /**
   * Retrieves enterprise users directly from SAP /PFCGUsers entity set for F4 Value Help.
   * No offline mock fallback is maintained as per live SAP requirement.
   */
  async getPFCGUsers(signal?: AbortSignal): Promise<PFCGUserRecord[]> {
    const response = await odataClient.get<ODataCollectionResponse<PFCGUserRecord>>(
      ODATA_ENTITIES.PFCG_USERS,
      {
        signal,
        timeout: 15000,
      }
    );
    return response.data?.value || [];
  },

  /**
   * Retrieves all SAP User Roles from /UserRole entity set with optional filtering
   */
  async getUserRoles(params?: UserRoleFilterParams): Promise<SapUserRoleRecord[]> {
    const filters: string[] = [];
    if (params?.user) {
      filters.push(`SAP_USER eq '${params.user.trim().toUpperCase().replace(/'/g, "''")}'`);
    }
    if (params?.role) {
      const cleanRole = params.role.trim().toUpperCase().replace(/'/g, "''");
      filters.push(`(PTW_ROLE eq '${cleanRole}' or PTW_ROLE eq 'Z${cleanRole}')`);
    }
    if (params?.activeOnly) {
      filters.push(`ACTIVE eq 'X'`);
    }

    const queryParams: Record<string, string> = {};
    if (filters.length > 0) {
      queryParams['$filter'] = filters.join(' and ');
    }

    const response = await odataClient.get<ODataCollectionResponse<SapUserRoleResponse>>(
      ODATA_ENTITIES.USER_ROLE, { params: queryParams, timeout: 8000 }
    );
    if (!Array.isArray(response.data?.value)) throw new Error('SAP returned an invalid role response.');
    return response.data.value.map(r => ({ ...r, ACTIVE: r.ACTIVE === 'X' })).filter(r => {
      if (params?.user && r.SAP_USER?.trim().toUpperCase() !== params.user.trim().toUpperCase()) return false;
      if (params?.role && ![params.role.toUpperCase(), 'Z' + params.role.toUpperCase()].includes(r.PTW_ROLE)) return false;
      return !params?.activeOnly || r.ACTIVE;
    });
  },

  /**
   * Assigns a PTW Role to an SAP User via POST /UserRole.
   * Sends ACTIVE: "X" for Active and an empty string for Inactive.
   */
  async createUserRole(payload: {
    SAP_USER: string;
    PTW_ROLE: string;
    ACTIVE?: boolean | string;
  }): Promise<SapUserRoleRecord> {
    const cleanUser = payload.SAP_USER.trim().toUpperCase();
    const cleanRole = payload.PTW_ROLE.trim().toUpperCase();
    const isActiveBool = payload.ACTIVE === true || payload.ACTIVE === 'X';

    const response = await odataClient.post<SapUserRoleResponse>(ODATA_ENTITIES.USER_ROLE, {
      SAP_USER: cleanUser, PTW_ROLE: cleanRole, ACTIVE: isActiveBool ? 'X' : ''
    });
    return response.data ? { ...response.data, ACTIVE: response.data.ACTIVE === 'X' }
      : { SAP_USER: cleanUser, PTW_ROLE: cleanRole, ACTIVE: isActiveBool };
  },

  /**
   * Updates user role activation status via PATCH /UserRole(SAP_USER='...',PTW_ROLE='...').
   * Sends ACTIVE: "X" for Active and an empty string for Inactive.
   */
  async updateUserRoleStatus(
    sapUser: string,
    ptwRole: string,
    active: boolean | string
  ): Promise<SapUserRoleRecord> {
    const cleanUser = sapUser.trim().toUpperCase();
    const cleanRole = ptwRole.trim().toUpperCase();
    const isActiveBool = active === true || active === 'X';
    const entityKey = `UserRole(SAP_USER='${cleanUser.replace(/'/g, "''")}',PTW_ROLE='${cleanRole.replace(/'/g, "''")}')`;
    const response = await odataClient.patch<SapUserRoleResponse>(entityKey, { ACTIVE: isActiveBool ? 'X' : '' });
    return response.data ? { ...response.data, ACTIVE: response.data.ACTIVE === 'X' }
      : { SAP_USER: cleanUser, PTW_ROLE: cleanRole, ACTIVE: isActiveBool };
  },

  /**
   * Deletes a user role mapping via DELETE /UserRole(SAP_USER='...',PTW_ROLE='...')
   */
  async deleteUserRole(sapUser: string, ptwRole: string): Promise<boolean> {
    const cleanUser = sapUser.trim().toUpperCase();
    const cleanRole = ptwRole.trim().toUpperCase();
    const entityKey = `UserRole(SAP_USER='${cleanUser.replace(/'/g, "''")}',PTW_ROLE='${cleanRole.replace(/'/g, "''")}')`;
    await odataClient.delete(entityKey);
    return true;
  },

  /**
   * Updates an existing user role assignment.
   * If key properties (SAP_USER or PTW_ROLE) change, creates the new record and removes the obsolete key record in SAP.
   */
  async updateUserRole(
    oldRecord: { SAP_USER: string; PTW_ROLE: string },
    newRecord: { SAP_USER: string; PTW_ROLE: string; ACTIVE: boolean }
  ): Promise<SapUserRoleRecord> {
    const oldUser = oldRecord.SAP_USER.trim().toUpperCase();
    const oldRole = oldRecord.PTW_ROLE.trim().toUpperCase();
    const newUser = newRecord.SAP_USER.trim().toUpperCase();
    const newRole = newRecord.PTW_ROLE.trim().toUpperCase();

    // If key has not changed, perform PATCH on ACTIVE status
    if (oldUser === newUser && oldRole === newRole) {
      return this.updateUserRoleStatus(newUser, newRole, newRecord.ACTIVE);
    }

    // Key has changed: Create new record and delete obsolete key record in SAP
    const created = await this.createUserRole({
      SAP_USER: newUser,
      PTW_ROLE: newRole,
      ACTIVE: newRecord.ACTIVE
    });

    await this.deleteUserRole(oldUser, oldRole);
    return created;
  },

  /**
   * Computes aggregated user role stats
   */
  computeRoleStats(roles: SapUserRoleRecord[]): UserRoleStats {
    const activeRoles = roles.filter((r) => r.ACTIVE);
    const uniqueUsers = new Set(roles.map((r) => r.SAP_USER));

    return {
      totalRoles: roles.length,
      activeAdmins: activeRoles.filter(
        (r) => r.PTW_ROLE === 'PTW_ADMIN' || r.PTW_ROLE === 'ZPTW_ADMIN'
      ).length,
      activeApprovers: activeRoles.filter(
        (r) =>
          r.PTW_ROLE.startsWith('PTW_APPR') ||
          r.PTW_ROLE.startsWith('ZPTW_APPR') ||
          r.PTW_ROLE === 'PTW_APPROVER' ||
          r.PTW_ROLE === 'ZPTW_APPROVER'
      ).length,
      activeIssuers: activeRoles.filter(
        (r) =>
          r.PTW_ROLE === 'PTW_ISSU' ||
          r.PTW_ROLE === 'ZPTW_ISSU' ||
          r.PTW_ROLE === 'PTW_ISSUER' ||
          r.PTW_ROLE === 'ZPTW_ISSUER'
      ).length,
      inactiveRoles: roles.filter((r) => !r.ACTIVE).length,
      uniqueUsers: uniqueUsers.size
    };
  },

  /**
   * Live probe tool to test /UserRole endpoint and return latency, status, ETag and payload
   */
  async probeUserRoleService(): Promise<{
    status: number;
    latencyMs: number;
    etag?: string;
    count: number;
    rawPayload: any;
  }> {
    const startTime = performance.now();
    try {
      const response = await odataClient.get(ODATA_ENTITIES.USER_ROLE, {
        params: { $top: '5' },
        timeout: 8000
      });
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        status: response.status,
        latencyMs,
        etag: response.headers?.['etag'] || response.headers?.['odata-version'],
        count: Array.isArray(response.data?.value) ? response.data.value.length : 0,
        rawPayload: response.data
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        status: err.response?.status || 500,
        latencyMs,
        count: 0,
        rawPayload: err.response?.data || { error: err.message }
      };
    }
  },

  /**
   * Retrieves plant locations and chemical processing units (e.g. Dahej Complex Fluo-1)
   */
  async getPlantMasterData(): Promise<PlantMasterRecord[]> {
    try {
      const response = await odataClient.get<ODataCollectionResponse<PlantMasterRecord>>(
        ODATA_ENTITIES.PLANTS
      );
      if (response.data?.value && response.data.value.length > 0) {
        return response.data.value;
      }
    } catch {
      // Fallback master records for GFL chemical plant complexes
    }

    if (!import.meta.env.DEV) return [];
    return [
      {
        PlantId: '1000',
        PlantName: 'Dahej Chemical Complex (Fluo-1)',
        Complex: 'GFL Dahej',
        Areas: ['AREA-01-HCFC', 'AREA-02-TFE', 'AREA-03-PTFE', 'AREA-04-CAUSTIC', 'AREA-05-STORAGE']
      },
      {
        PlantId: '1100',
        PlantName: 'Ranjitnagar Fluorochemicals Unit',
        Complex: 'GFL Ranjitnagar',
        Areas: ['SEC-A-DISTILLATION', 'SEC-B-REACTION', 'SEC-C-RECOVERY']
      }
    ];
  },

  /**
   * Retrieves standardized hazard catalog items based on chemical risk engineering standards
   */
  async getHazardCatalog(): Promise<HazardCatalogItem[]> {
    return [
      {
        Category: 'CHEMICAL',
        Description: 'Exposure to Hydrofluoric Acid (HF) / Anhydrous Chlorine Gas',
        DefaultSeverity: 5,
        DefaultLikelihood: 3,
        RecommendedControl: 'Full chemical splash suit, SCBA respirator, HF neutralizer on standby'
      },
      {
        Category: 'THERMAL',
        Description: 'Steam line burn / Hot work ignition of flammable vapors',
        DefaultSeverity: 4,
        DefaultLikelihood: 3,
        RecommendedControl: 'Atmospheric LEL continuous sniffer, fire blanket, pressurized fire hose'
      },
      {
        Category: 'ELECTRICAL',
        Description: 'High voltage flashover (>440V switchgear)',
        DefaultSeverity: 5,
        DefaultLikelihood: 2,
        RecommendedControl: 'Zero-energy lock box verification, earth ground stick applied'
      },
      {
        Category: 'MECHANICAL',
        Description: 'High-pressure line rupture during flange unbolting',
        DefaultSeverity: 4,
        DefaultLikelihood: 3,
        RecommendedControl: 'Double block and bleed isolation, pressure release verification'
      },
      {
        Category: 'HEIGHT',
        Description: 'Fall from reactor dome scaffold (>2 meters)',
        DefaultSeverity: 4,
        DefaultLikelihood: 2,
        RecommendedControl: 'Full body safety harness with double lanyard attached to static line'
      }
    ];
  },

  /**
   * Retrieves standard PPE requirements matrix
   */
  async getPpeCatalog(): Promise<PpeCatalogItem[]> {
    return [
      { PpeCode: 'HARD_HAT', Label: 'Industrial Safety Helmet', Category: 'HEAD', MandatoryDefault: true },
      { PpeCode: 'SAFETY_GLASSES', Label: 'Impact Safety Goggles', Category: 'EYE', MandatoryDefault: true },
      { PpeCode: 'EAR_DEFENDER', Label: 'Ear Muff / Plugs (>85 dBA)', Category: 'HEAD', MandatoryDefault: false },
      { PpeCode: 'STEEL_TOE_BOOTS', Label: 'Chemical-Resistant Steel Toe Boots', Category: 'FEET', MandatoryDefault: true },
      { PpeCode: 'GLOVES', Label: 'Heavy-Duty Nitrile / Butyl Gloves', Category: 'HANDS', MandatoryDefault: true },
      { PpeCode: 'RESPIRATOR', Label: 'Full-Face Cartridge / SCBA Respirator', Category: 'RESPIRATORY', MandatoryDefault: false },
      { PpeCode: 'SAFETY_HARNESS', Label: 'Full-Body Fall Arrest Harness', Category: 'BODY', MandatoryDefault: false },
      { PpeCode: 'ARC_FLASH_SUIT', Label: 'Arc Flash Shield & Suit (Cal/cm²)', Category: 'BODY', MandatoryDefault: false }
    ];
  },

  /**
   * Global audit trails across all plant permits for EHS regulatory compliance (OSHA PSM / ISO 45001)
   */
  async getGlobalAuditLogs(top: number = 50, skip: number = 0): Promise<PermitAuditEntry[]> {
    try {
      const query = buildODataQuery({
        $orderby: 'Timestamp desc',
        $top: top,
        $skip: skip
      });
      const endpoint = `${ODATA_ENTITIES.AUDIT_ENTRIES}${query}`;
      const response = await odataClient.get<ODataCollectionResponse<PermitAuditEntry>>(endpoint);
      if (response.data?.value && response.data.value.length > 0) {
        return response.data.value;
      }
    } catch {
      // Fallback audit log entries
    }

    return [];
  }
};

export default adminApi;
