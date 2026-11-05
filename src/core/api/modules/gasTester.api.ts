function requireTester(value?: string): string {
  if (!value?.trim()) throw new Error('A verified SAP tester is required before saving a gas test.');
  return value.trim();
}
import odataClient from '../odataClient';
import { ODATA_ENTITIES } from '../odataEndpoints';
import { GasTestRecord, PermitGasTest, PermitInfoRecord } from '../../types/ptw.types';
import { ODataCollectionResponse } from '../../types/odata.types';

export interface GasSafetyThresholds {
  minOxygen: number;       // 19.5%
  maxOxygen: number;       // 23.5%
  maxFlammableLel: number; // Approved % LEL (e.g. 0% for hot work, 5% or 10% for entry)
  maxH2sPpm: number;       // Approved ppm (e.g. 5 or 10 ppm)
  maxCoPpm: number;        // Approved ppm (e.g. 25 ppm)
}

// The source has conflicting gas limits (pp. 11, 14, 24). No implicit clearance policy.
export const DEFAULT_GAS_THRESHOLDS: GasSafetyThresholds | undefined = undefined;

export type GasEvaluationStatus = 'OPTIMAL' | 'SAFE' | 'WARNING' | 'DANGER';

export interface GasParamEvaluation {
  status: GasEvaluationStatus;
  badgeClass: string;
  dotClass: string;
  label: string;
  message: string;
  unit: string;
  currentValue: number;
}

export interface AtmosphereAssessment {
  overallStatus: 'SAFE' | 'WARNING' | 'DANGER';
  canClearWork: boolean;
  summaryTitle: string;
  summaryMessage: string;
  bannerClass: string;
  o2: GasParamEvaluation;
  lel: GasParamEvaluation;
  co: GasParamEvaluation;
  h2s: GasParamEvaluation;
  other?: GasParamEvaluation;
}

export const FALLBACK_GAS_TESTS: GasTestRecord[] = [];
export const FALLBACK_PENDING_PERMITS: PermitInfoRecord[] = [];

class GasTesterApiService {

  /**
   * Evaluates Oxygen (O2 % v/v) with precision safety limits and color indication
   */
  public evaluateO2(o2: number): GasParamEvaluation {
    const val = Number(o2);
    if (!Number.isFinite(val) || val <= 0) {
      return {
        status: 'DANGER',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-300 ring-rose-200',
        dotClass: 'bg-rose-600',
        label: 'Sensor Unread / Error',
        message: 'Invalid or zero oxygen reading. Instrument malfunction suspected.',
        unit: '% v/v',
        currentValue: val
      };
    }

    if (val < 19.5) {
      return {
        status: 'DANGER',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-300 ring-rose-200 animate-pulse',
        dotClass: 'bg-rose-600',
        label: 'Asphyxiation Hazard (< 19.5%)',
        message: `DANGER: Oxygen deficiency (${val.toFixed(2)}% v/v). Hypoxia hazard. Entry prohibited without supplied-air SCBA.`,
        unit: '% v/v',
        currentValue: val
      };
    }

    if (val > 23.5) {
      return {
        status: 'DANGER',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 ring-amber-200 animate-pulse',
        dotClass: 'bg-amber-600',
        label: 'Oxygen Enriched (> 23.5%)',
        message: `DANGER: Oxygen enrichment (${val.toFixed(2)}% v/v). Extreme fire risk. Ignition sources & hot work strictly prohibited.`,
        unit: '% v/v',
        currentValue: val
      };
    }

    if (val >= 20.8 && val <= 21.0) {
      return {
        status: 'OPTIMAL',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-emerald-200',
        dotClass: 'bg-emerald-500',
        label: 'Optimal / Ambient Air (20.9%)',
        message: `Optimal fresh air oxygen concentration (${val.toFixed(2)}% v/v). Ideal breathing atmosphere.`,
        unit: '% v/v',
        currentValue: val
      };
    }

    return {
      status: 'SAFE',
      badgeClass: 'bg-teal-50 text-teal-700 border-teal-300 ring-teal-200',
      dotClass: 'bg-teal-500',
      label: 'Safe Working Range (19.5 - 23.5%)',
      message: `Acceptable working oxygen concentration (${val.toFixed(2)}% v/v). Permissible for entry.`,
      unit: '% v/v',
      currentValue: val
    };
  }

  /**
   * Evaluates Combustible / Flammable Gas (% LEL) with precision safety limits and color indication
   */
  public evaluateLel(lel: number, isHotWork = false): GasParamEvaluation {
    const val = Number(lel);
    if (!Number.isFinite(val) || val < 0) {
      return {
        status: 'DANGER',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-300',
        dotClass: 'bg-rose-600',
        label: 'Sensor Unread / Error',
        message: 'Invalid LEL reading.',
        unit: '% LEL',
        currentValue: val
      };
    }

    if (val === 0) {
      return {
        status: 'OPTIMAL',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-emerald-200',
        dotClass: 'bg-emerald-500',
        label: 'Nil Flammable (0% LEL)',
        message: 'Zero combustible gas detected. Meets strict zero-LEL requirement for Hot Work and Vessel Entry.',
        unit: '% LEL',
        currentValue: val
      };
    }

    if (val < 5.0) {
      return {
        status: isHotWork ? 'DANGER' : 'WARNING',
        badgeClass: isHotWork ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-amber-50 text-amber-700 border-amber-300',
        dotClass: isHotWork ? 'bg-rose-600' : 'bg-amber-500',
        label: isHotWork ? 'Hot Work Prohibited (> 0% LEL)' : 'Trace Combustible (< 5% LEL)',
        message: isHotWork
          ? `VIOLATION: Hot work requires strictly 0.0% LEL. Current reading ${val.toFixed(2)}% LEL prohibits hot work.`
          : `CAUTION: Trace flammable vapors detected (${val.toFixed(2)}% LEL). Forced air ventilation must continue.`,
        unit: '% LEL',
        currentValue: val
      };
    }

    if (val < 10.0) {
      return {
        status: 'WARNING',
        badgeClass: 'bg-orange-50 text-orange-700 border-orange-300 ring-orange-200',
        dotClass: 'bg-orange-500',
        label: 'Elevated LEL (5% - 9.9%)',
        message: `WARNING: Elevated flammable gas (${val.toFixed(2)}% LEL). Evacuate confined space, purge with nitrogen/air.`,
        unit: '% LEL',
        currentValue: val
      };
    }

    return {
      status: 'DANGER',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-300 ring-rose-200 animate-pulse',
      dotClass: 'bg-rose-600',
      label: 'Explosive Hazard (≥ 10% LEL)',
      message: `CRITICAL DANGER: Flammable gas reached explosive threshold (${val.toFixed(2)}% LEL). Evacuate immediately!`,
      unit: '% LEL',
      currentValue: val
    };
  }

  /**
   * Evaluates Carbon Monoxide (CO ppm) with precision safety limits and color indication
   */
  public evaluateCo(co: number): GasParamEvaluation {
    const val = Number(co);
    if (!Number.isFinite(val) || val < 0) {
      return {
        status: 'DANGER',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-300',
        dotClass: 'bg-rose-600',
        label: 'Sensor Error',
        message: 'Invalid CO reading.',
        unit: 'ppm',
        currentValue: val
      };
    }

    if (val < 10.0) {
      return {
        status: 'OPTIMAL',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-emerald-200',
        dotClass: 'bg-emerald-500',
        label: 'Safe Level (< 10 ppm)',
        message: `Safe atmospheric carbon monoxide concentration (${val.toFixed(2)} ppm). Well below 25 ppm OSHA limit.`,
        unit: 'ppm',
        currentValue: val
      };
    }

    if (val < 25.0) {
      return {
        status: 'WARNING',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-300 ring-amber-200',
        dotClass: 'bg-amber-500',
        label: 'Elevated CO (10 - 24 ppm)',
        message: `CAUTION: Elevated CO (${val.toFixed(2)} ppm). Approaching 25 ppm ceiling. Verify exhaust ventilation.`,
        unit: 'ppm',
        currentValue: val
      };
    }

    return {
      status: 'DANGER',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-300 ring-rose-200 animate-pulse',
      dotClass: 'bg-rose-600',
      label: 'Toxic CO Hazard (≥ 25 ppm)',
      message: `DANGER: Carbon Monoxide exceeds permissible exposure limit (${val.toFixed(2)} ppm ≥ 25 ppm). Toxicity risk.`,
      unit: 'ppm',
      currentValue: val
    };
  }

  /**
   * Evaluates Hydrogen Sulfide (H2S ppm) with precision safety limits and color indication
   */
  public evaluateH2s(h2s: number): GasParamEvaluation {
    const val = Number(h2s);
    if (!Number.isFinite(val) || val < 0) {
      return {
        status: 'DANGER',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-300',
        dotClass: 'bg-rose-600',
        label: 'Sensor Error',
        message: 'Invalid H2S reading.',
        unit: 'ppm',
        currentValue: val
      };
    }

    if (val === 0) {
      return {
        status: 'OPTIMAL',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-emerald-200',
        dotClass: 'bg-emerald-500',
        label: 'Nil H2S (0 ppm)',
        message: 'Zero Hydrogen Sulfide detected. Safe from sour gas hazards.',
        unit: 'ppm',
        currentValue: val
      };
    }

    if (val < 5.0) {
      return {
        status: 'WARNING',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-300 ring-amber-200',
        dotClass: 'bg-amber-500',
        label: 'Trace H2S (< 5 ppm)',
        message: `CAUTION: Low H2S concentration (${val.toFixed(2)} ppm). Rotten egg odor present. Continuous monitoring required.`,
        unit: 'ppm',
        currentValue: val
      };
    }

    return {
      status: 'DANGER',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-300 ring-rose-200 animate-pulse',
      dotClass: 'bg-rose-600',
      label: 'Lethal H2S Hazard (≥ 5 ppm)',
      message: `CRITICAL DANGER: H2S exceeds safety ceiling (${val.toFixed(2)} ppm ≥ 5 ppm). Highly toxic neurotoxin. Evacuate immediately!`,
      unit: 'ppm',
      currentValue: val
    };
  }

  /**
   * Comprehensive atmosphere evaluation combining O2, LEL, CO, H2S and optional toxic gas
   */
  public evaluateAtmosphere(
    record: Pick<GasTestRecord, 'O2Pct' | 'LelPct' | 'CoVal' | 'H2sVal' | 'OtherGas' | 'OtherVal' | 'OtherUnit'>,
    isHotWork = false
  ): AtmosphereAssessment {
    const o2 = this.evaluateO2(record.O2Pct);
    const lel = this.evaluateLel(record.LelPct, isHotWork);
    const co = this.evaluateCo(record.CoVal);
    const h2s = this.evaluateH2s(record.H2sVal);

    let other: GasParamEvaluation | undefined = undefined;
    if (record.OtherGas && record.OtherGas.trim()) {
      const otherVal = Number(record.OtherVal || 0);
      const isDangerous = otherVal > 5.0;
      other = {
        status: isDangerous ? 'DANGER' : otherVal > 0 ? 'WARNING' : 'OPTIMAL',
        badgeClass: isDangerous
          ? 'bg-rose-50 text-rose-700 border-rose-300'
          : otherVal > 0
          ? 'bg-amber-50 text-amber-700 border-amber-300'
          : 'bg-emerald-50 text-emerald-700 border-emerald-300',
        dotClass: isDangerous ? 'bg-rose-600' : otherVal > 0 ? 'bg-amber-500' : 'bg-emerald-500',
        label: `${record.OtherGas} (${otherVal} ${record.OtherUnit || 'ppm'})`,
        message: otherVal > 0
          ? `${record.OtherGas} concentration: ${otherVal} ${record.OtherUnit || 'ppm'}`
          : `No ${record.OtherGas} detected.`,
        unit: record.OtherUnit || 'ppm',
        currentValue: otherVal
      };
    }

    const statuses = [o2.status, lel.status, co.status, h2s.status, other?.status].filter(Boolean);

    if (statuses.includes('DANGER')) {
      return {
        overallStatus: 'DANGER',
        canClearWork: false,
        summaryTitle: 'ATMOSPHERE HAZARDOUS - ENTRY PROHIBITED',
        summaryMessage: 'One or more gas concentration levels have breached critical safety thresholds. Hot work and confined-space entry are strictly prohibited. Immediate forced ventilation or nitrogen purging required.',
        bannerClass: 'bg-rose-50 border-rose-200 text-rose-900',
        o2,
        lel,
        co,
        h2s,
        other
      };
    }

    if (statuses.includes('WARNING')) {
      return {
        overallStatus: 'WARNING',
        canClearWork: false,
        summaryTitle: 'CAUTION - ELEVATED READINGS DETECTED',
        summaryMessage: 'Atmospheric conditions show elevated readings above baseline. Personnel must not enter until forced air ventilation reduces concentrations to optimal zero levels.',
        bannerClass: 'bg-amber-50 border-amber-200 text-amber-900',
        o2,
        lel,
        co,
        h2s,
        other
      };
    }

    return {
      overallStatus: 'SAFE',
      canClearWork: true,
      summaryTitle: 'ATMOSPHERE CLEAR - APPROVED FOR WORK',
      summaryMessage: 'All atmospheric parameters (Oxygen, Flammable % LEL, CO, and H2S) are within safe, verified limits. Atmosphere cleared for authorized work.',
      bannerClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      o2,
      lel,
      co,
      h2s,
      other
    };
  }

  /**
   * Retrieves all atmospheric test logs across permits or filtered by PermitNo
   * Endpoint: GasTest
   */
  public async list(permitNo?: string, signal?: AbortSignal): Promise<GasTestRecord[]> {
    const params: Record<string, string> = {};
    if (permitNo?.trim()) {
      params.$filter = `PermitNo eq '${permitNo.trim().replace(/'/g, "''")}'`;
    }
    const response = await odataClient.get<ODataCollectionResponse<GasTestRecord>>(ODATA_ENTITIES.GAS_TEST, { signal, params });
    if (!Array.isArray(response.data?.value)) {
      throw new Error('SAP did not return gas test records.');
    }
    return [...response.data.value].sort((a, b) => {
      const dtA = `${a.TestDate || ''} ${a.TestTime || ''}`;
      const dtB = `${b.TestDate || ''} ${b.TestTime || ''}`;
      if (dtA && dtB && dtA !== dtB) return dtB.localeCompare(dtA);
      const seqA = parseInt(a.TestSeq, 10) || 0;
      const seqB = parseInt(b.TestSeq, 10) || 0;
      return seqB - seqA;
    });
  }

  public async read(permitNo: string, testSeq: string, signal?: AbortSignal): Promise<GasTestRecord | null> {
    const key = (value: string) => encodeURIComponent(value.replace(/'/g, "''")).replace(/'/g, '%27');
    try {
      const response = await odataClient.get<GasTestRecord>(`GasTest(PermitNo='${key(permitNo)}',TestSeq='${key(testSeq)}')`, { signal });
      if (response.data && response.data.TestSeq !== undefined) return response.data;
    } catch (e) {
      console.warn('[GasTesterApi] Read failed, finding in fallback:', e);
    }
    return null;
  }

  public async create(record: Partial<GasTestRecord>): Promise<GasTestRecord> {
    const rawType = (record.TestType || '').trim().toUpperCase();
    let testType = 'INITIAL';
    if (rawType === 'PERIODIC' || rawType === 'RETEST') {
      testType = 'PERIODIC';
    } else if (rawType === 'CONTINUOUS' || rawType === 'CONT') {
      testType = 'CONTINUOUS';
    } else if (rawType === 'INITIAL' || rawType === 'INIT') {
      testType = 'INITIAL';
    } else if (rawType) {
      testType = rawType;
    }

    const now = new Date();
    const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const formatTime = (t?: string): string => {
      if (!t) return defaultTime;
      const parts = t.trim().split(':');
      if (parts.length === 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
      if (parts.length >= 3) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
      return defaultTime;
    };

    const payload: Omit<GasTestRecord, 'SAP__Messages'> = {
      PermitNo: record.PermitNo ? record.PermitNo.trim().toUpperCase() : '',
      TestSeq: String(record.TestSeq || '1').trim(),
      TestType: testType,
      TestDate: record.TestDate || defaultDate,
      TestTime: formatTime(record.TestTime),
      TestLocation: record.TestLocation?.trim() || '',
      SampleLevel: record.SampleLevel?.trim() || 'MID',
      TestedBy: requireTester(record.TestedBy),
      Cert: record.Cert?.trim() || '',
      MeterType: record.MeterType?.trim() || 'GAS_DETECTOR',
      MeterId: record.MeterId?.trim() || '',
      CalibDate: record.CalibDate && /^\d{4}-\d{2}-\d{2}$/.test(record.CalibDate.trim()) ? record.CalibDate.trim() : null,
      BumpTestOk: record.BumpTestOk === 'N' ? 'N' : (record.BumpTestOk || 'Y'),
      LelPct: Number(record.LelPct || 0),
      O2Pct: Number(record.O2Pct !== undefined ? record.O2Pct : 20.9),
      CoVal: Number(record.CoVal || 0),
      H2sVal: Number(record.H2sVal || 0),
      OtherGas: record.OtherGas?.trim() || '',
      OtherVal: Number(record.OtherVal || 0),
      OtherUnit: record.OtherUnit?.trim() || '',
      TesterSigned: record.TesterSigned === 'N' ? 'N' : (record.TesterSigned || 'Y'),
      Remarks: record.Remarks?.trim() || ''
    };

    const response = await odataClient.post<GasTestRecord>(ODATA_ENTITIES.GAS_TEST, payload, {
      headers: { Prefer: 'return=representation' }
    });

    if (response.data && response.data.TestSeq !== undefined) {
      return response.data;
    }
    return { ...payload, SAP__Messages: [] };
  }

  /**
   * Compatibility method for legacy modules
   */
  public async getTestsForPermit(permitId: string): Promise<PermitGasTest[]> {
    const records = await this.list(permitId);
    return records.map(r => ({
      TestId: `${r.PermitNo}-${r.TestSeq}`,
      PermitId: r.PermitNo,
      TestTimestamp: `${r.TestDate || ''} ${r.TestTime || ''}`.trim(),
      OxygenPct: r.O2Pct,
      FlammableLelPct: r.LelPct,
      H2sPpm: r.H2sVal,
      CoPpm: r.CoVal,
      TestedByUserId: r.TestedBy,
      TesterNotes: r.Remarks,
      Passed: r.O2Pct >= 19.5 && r.O2Pct <= 23.5 && r.LelPct === 0 && r.CoVal < 25 && r.H2sVal < 5
    }));
  }

  /**
   * Compatibility method for legacy caller
   */
  public async recordTest(testData: Omit<PermitGasTest, 'TestId'>): Promise<PermitGasTest> {
    // The legacy write contract is not the current GasTestType. Use a verified SAP action.
    void testData;
    throw new Error('Gas-test recording requires the approved site limits and SAP workflow action.');
  }

  /**
   * Limit validator comparing readings only against an explicitly supplied site policy
   */
  public validateLimits(
    readings: { oxygenPct: number; flammableLelPct: number; h2sPpm: number; coPpm: number },
    thresholds: GasSafetyThresholds | undefined = DEFAULT_GAS_THRESHOLDS
  ): { safe: boolean; violations: string[] } {
    if (!thresholds) return { safe: false, violations: ['HSE-approved gas limits are required; the source procedure contains conflicting values.'] };
    if ([readings.oxygenPct, readings.flammableLelPct, readings.h2sPpm, readings.coPpm].some(value => !Number.isFinite(value) || value < 0) || readings.oxygenPct > 100 || readings.flammableLelPct > 100) {
      return { safe: false, violations: ['All gas readings must be finite, nonnegative values with valid percentage ranges.'] };
    }
    if ([thresholds.minOxygen, thresholds.maxOxygen, thresholds.maxFlammableLel, thresholds.maxH2sPpm, thresholds.maxCoPpm].some(value => !Number.isFinite(value) || value < 0) || thresholds.minOxygen > thresholds.maxOxygen || thresholds.maxOxygen > 100 || thresholds.maxFlammableLel > 100) {
      return { safe: false, violations: ['The supplied gas limit policy is invalid.'] };
    }
    const violations: string[] = [];
    if (readings.oxygenPct < thresholds.minOxygen || readings.oxygenPct > thresholds.maxOxygen) violations.push('Oxygen is outside the approved range.');
    if (readings.flammableLelPct > thresholds.maxFlammableLel) violations.push('Flammable gas exceeds the approved limit.');
    if (readings.h2sPpm > thresholds.maxH2sPpm) violations.push('H2S exceeds the approved limit.');
    if (readings.coPpm > thresholds.maxCoPpm) violations.push('CO exceeds the approved limit.');
    return { safe: violations.length === 0, violations };
  }

  /**
   * Retrieves calibrated status for field gas sniffer detectors
   */
  public async getDeviceCalibration(deviceId: string): Promise<{ deviceId: string; validUntil: string; isCalibrated: boolean }> {
    const endpoint = `${ODATA_ENTITIES.GAS_TESTS}/GetCalibrationStatus(DeviceId='${encodeURIComponent(deviceId)}')`;
    try {
      const response = await odataClient.get<{ DeviceId: string; ValidUntil: string; IsCalibrated: boolean }>(endpoint);
      return {
        deviceId: response.data?.DeviceId || deviceId,
        validUntil: response.data?.ValidUntil || '',
        isCalibrated: response.data?.IsCalibrated === true && response.data?.DeviceId === deviceId && Number.isFinite(Date.parse(response.data?.ValidUntil || '')) && Date.parse(response.data.ValidUntil) > Date.now(),
      };
    } catch {
      return {
        deviceId,
        validUntil: '',
        isCalibrated: false,
      };
    }
  }

  /**
   * Retrieves permits in status INTD requiring gas testing (GasTestRequired = 'X' | 'Y')
   * Endpoint: PermitInfo?$filter=Status eq 'INTD'
   */
  public async listPendingPermits(plant?: string, signal?: AbortSignal): Promise<PermitInfoRecord[]> {
    const list: PermitInfoRecord[] = [];

    // 1. Query SAP Gateway OData V4 PermitInfo
    try {
      const filters: string[] = ["Status eq 'INTD'"];
      if (plant?.trim()) {
        filters.push(`Werks eq '${plant.trim().replace(/'/g, "''")}'`);
      }
      const response = await odataClient.get<ODataCollectionResponse<PermitInfoRecord>>(
        ODATA_ENTITIES.PERMIT_INFO,
        {
          signal,
          params: {
            $filter: filters.join(' and '),
            $top: '50',
            $orderby: 'Erdat desc,Erzet desc,Permit_No desc'
          }
        }
      );
      if (Array.isArray(response.data?.value)) {
        response.data.value.forEach(p => {
          const req = (p.GasTestRequired || '').toUpperCase();
          if (req === 'X' || req === 'Y') {
            list.push(p);
          }
        });
      }
    } catch (err) {
      console.warn('[GasTesterApi] Querying PermitInfo from SAP Gateway failed:', err);
    }

    // 2. Merge recent permits cached in localStorage (e.g. newly created during active session)
    if (import.meta.env.DEV && typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = JSON.parse(window.localStorage.getItem('ptw_recent_created_permits') || '[]');
        if (Array.isArray(cached)) {
          cached.forEach((p: PermitInfoRecord) => {
            const req = (p.GasTestRequired || '').toUpperCase();
            if ((req === 'X' || req === 'Y') && p.Status === 'INTD') {
              if (!list.some(existing => existing.Permit_No === p.Permit_No)) {
                list.push(p);
              }
            }
          });
        }
      } catch {
        // ignore cache parse errors
      }
    }

    // No fallback mock permits: strictly live SAP INTD permits only

    // 4. Return sorted by creation date/time and latest permit number descending
    return list.sort((a, b) => {
      const dtA = `${a.Erdat || ''} ${a.Erzet || ''}`.trim();
      const dtB = `${b.Erdat || ''} ${b.Erzet || ''}`.trim();
      if (dtA && dtB && dtA !== dtB) {
        return dtB.localeCompare(dtA);
      }
      return (b.Permit_No || '').localeCompare(a.Permit_No || '', undefined, { numeric: true });
    });
  }
}

export const gasTesterApi = new GasTesterApiService();
export default gasTesterApi;
