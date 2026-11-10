import { initialPermitStatus, gasRequirementRow } from '../../ptw/prerequisites';
import schema from '../permitCreateSchema.json';
import { validateSitePermit, toSapPermitType, toNatwCode, toEquipCode } from '../../ptw/siteProcedure';
import { PermitDeepInsertPayload } from '../../types/ptw.types';

interface Property { type: string; maxLength: string | null; precision: string | null; scale: string | null; nullable: boolean }
const entities = schema as Record<string, Record<string, Property>>;
const children: Record<string, string> = {
  _Worker: 'WorkerType',
  _PPE: 'PPEType',
  _Safety: 'SafetyType',
  _HazardControl: 'HazardControlType',
  _WorkType: 'WorkTypeType',
  _CHK: 'CHKType',
  _Equipment: 'EquipmentType',
  _NATW: 'NATWType'
};
const serverFields = new Set(['Permit_No', 'PermitNo', 'SAP__Messages', 'Ernam', 'Erdat', 'Erzet', 'Aenam', 'Aedat', 'Aezet', 'LastChangedAt', 'PersonsQty']);

function serialize(entity: string, value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(entities[entity])) {
    if (serverFields.has(key) || value[key] === undefined) continue;
    let field = value[key];
    if (property.type === 'Edm.Date' && field === '') field = null;
    if (field === null) {
      if (!property.nullable) throw new Error(`${key} cannot be empty.`);
    } else if (property.type === 'Edm.String') {
      if (typeof field !== 'string') throw new Error(`${key} must be text.`);
      if (property.maxLength && field.length > Number(property.maxLength)) throw new Error(`${key} must be at most ${property.maxLength} characters.`);
    } else if (property.type === 'Edm.Decimal') {
      const numeric = Number(field);
      if (!Number.isFinite(numeric) || numeric < 0 || (Number(property.scale || 0) === 0 && !Number.isInteger(numeric))) throw new Error(`${key} must be a valid nonnegative number.`);
      if (property.precision && numeric >= 10 ** (Number(property.precision) - Number(property.scale || 0))) throw new Error(`${key} exceeds the SAP numeric limit.`);
      field = numeric;
    } else if (property.type === 'Edm.Date') {
      if (typeof field !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(field) || !Number.isFinite(Date.parse(field)) || new Date(field).toISOString().slice(0, 10) !== field) throw new Error(`${key} must be a valid date.`);
    } else if (property.type === 'Edm.TimeOfDay') {
      if (typeof field !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(field)) throw new Error(`${key} must be a valid time.`);
      if (field.length === 5) field += ':00';
    }
    result[key] = field;
  }
  return result;
}

export interface PreparePermitCreateOptions {
  allowBlankReference?: boolean;
}

export function preparePermitCreate(
  payload: PermitDeepInsertPayload,
  options?: PreparePermitCreateOptions
): Record<string, unknown> {
  const required = ['ExecDept', 'PermitType', 'Werks', 'JobDesc', 'ValidFromD', 'ValidFromT', 'ValidToD', 'ValidToT'] as const;
  for (const key of required) if (!payload[key]?.trim()) throw new Error(`Complete ${key} before creating the permit.`);
  if (!options?.allowBlankReference && !payload.Aufnr && !payload.Qmnum) {
    throw new Error('Select a real SAP order or notification.');
  }
  const start = new Date(`${payload.ValidFromD}T${payload.ValidFromT}+05:30`);
  const end = new Date(`${payload.ValidToD}T${payload.ValidToT}+05:30`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error('Permit end date/time must be after its start.');
  if (end.getTime() <= Date.now()) throw new Error('The permit validity period has already ended.');
  if (payload.PersonsQty !== (payload._Worker?.length ?? 0)) throw new Error('Make the crew quantity match the worker list.');
  if (!payload._HazardControl?.length) throw new Error('Add the work hazards and required controls.');
  const isGas = payload.GasTestRequired === 'Y' || payload.GasTestRequired === 'X';
  const isIso = payload.IsolationRequired === 'Y' || payload.IsolationRequired === 'X';
  const isLoto = payload.LotoRequired === 'Y' || payload.LotoRequired === 'X';
  if (isLoto && !isIso) throw new Error('LOTO requires isolation. Select Yes for isolation.');
  if (payload._Isolation?.length) throw new Error('Create isolation certificates with their _Item points in the isolation module after the permit is created.');
  const status = initialPermitStatus(payload.IsolationRequired, payload.GasTestRequired || '');
  if (isGas && !['1', '2'].includes(payload.GasTestFreqHr)) throw new Error('Plan gas retesting at intervals of no more than two hours.');
  validateSitePermit(payload);
  const sapType = toSapPermitType(payload.PermitType) || payload.PermitType;

  // Derive _WorkType (primary work category and any additional types) if not already supplied
  let effectiveWorkTypes = payload._WorkType;
  if ((!effectiveWorkTypes || !effectiveWorkTypes.length) && (sapType || payload._Safety?.length)) {
    const primarySap = sapType;
    const typeItems = payload._Safety
      ? payload._Safety
          .filter(row => row.Category === 'PTW' && row.ItemCode === 'TYPE')
          .map(row => row.Remarks?.trim())
          .filter(Boolean)
      : [];
    const additionalSaps = typeItems
      .map(t => toSapPermitType(t) || t)
      .filter(t => Boolean(t) && t !== primarySap);
    const allTypes = Array.from(new Set([primarySap, ...additionalSaps].filter(Boolean)));
    if (allTypes.length > 0) {
      effectiveWorkTypes = allTypes.map((code, idx) => ({
        SeqNo: String(idx + 1),
        WorkType: code
      }));
    }
  }

  // Derive _NATW child table items if not explicitly provided
  let effectiveNatw = payload._NATW;
  if (effectiveNatw === undefined && payload._Safety?.length) {
    const natwRows = payload._Safety.filter(row => row.Category === 'PTW' && row.ItemCode === 'NATR');
    if (natwRows.length > 0) {
      effectiveNatw = natwRows.map((row, idx) => {
        const isOther = (row.Remarks || row.ValueText || '').startsWith('Other');
        const customText = row.Remarks?.includes(':')
          ? row.Remarks.split(':').slice(1).join(':').trim()
          : (payload._Safety?.find(r => r.ItemCode === 'NOTE')?.Remarks || '');
        return {
          ItemNo: String(idx + 1),
          NatwCode: toNatwCode(row.Remarks || row.ValueText),
          NatwDesc: (row.Remarks || row.ValueText || '').slice(0, 255),
          OtherText: (isOther ? customText : '').slice(0, 255)
        };
      });
    }
  }

  // Derive _Equipment child table items if not explicitly provided
  let effectiveEquipment = payload._Equipment;
  if (effectiveEquipment === undefined && payload._Safety?.length) {
    const equipRows = payload._Safety.filter(row => row.Category === 'PTW' && row.ItemCode === 'TOOL');
    if (equipRows.length > 0) {
      effectiveEquipment = equipRows.map((row, idx) => {
        const isOther = (row.Remarks || row.ValueText || '').startsWith('Other');
        const customText = row.Remarks?.includes(':')
          ? row.Remarks.split(':').slice(1).join(':').trim()
          : (payload._Safety?.find(r => r.ItemCode === 'NOTE')?.Remarks || '');
        return {
          ItemNo: String(idx + 1),
          EquipCode: toEquipCode(row.Remarks || row.ValueText),
          EquipDesc: (row.Remarks || row.ValueText || '').slice(0, 255),
          OtherText: (isOther ? customText : '').slice(0, 255)
        };
      });
    }
  }

  // Compile _Safety rows, preserving gas requirement row (compliance checklist items belong in _CHK, not _Safety)
  const safetyRows = [
    ...(payload._Safety || []).filter(row => !(row.Category === 'PTW' && row.ItemCode === 'GREQ') && !row.ItemCode?.startsWith('Q')),
    gasRequirementRow(isGas ? 'Y' : 'N')
  ];

  payload = { ...payload, ExecDept: payload.ExecDept.trim(),
    PermitType: sapType,
    GasTestFreqHr: isGas ? payload.GasTestFreqHr : '',
    GasTestRequired: isGas ? 'X' : ' ',
    IsolationRequired: isIso ? 'X' : ' ',
    IsolationStatus: isIso ? 'CRTD' : '',
    ...(payload.LotoRequired !== undefined ? { LotoRequired: isLoto ? 'X' : ' ' } : {}),
    _Isolation: isIso ? payload._Isolation : [],
    _Safety: safetyRows,
    _WorkType: effectiveWorkTypes,
    _CHK: payload._CHK || [],
    _Equipment: effectiveEquipment,
    _NATW: effectiveNatw
  };
  const body = serialize('PermitInfoType', payload as unknown as Record<string, unknown>);
  body.PermitType = sapType;

  // Pure Cold Work Check: Primary category is Cold Work and no other additional categories exist
  const isOnlyColdWork = (sapType === 'COLD') && (
    !effectiveWorkTypes ||
    effectiveWorkTypes.length === 0 ||
    effectiveWorkTypes.every(wt => {
      const code = (toSapPermitType(wt.WorkType) || wt.WorkType || '').trim().toUpperCase();
      return code === 'COLD';
    })
  );

  // If Status is explicitly passed as 'APPR' and only primary permit type is cold work (no additional types added),
  // post Status as 'APPR' (Approve) so system behaves synchronously without requiring approver sign-off.
  const finalStatus = (payload.Status === 'APPR' && isOnlyColdWork)
    ? 'APPR'
    : status;

  body.Status = finalStatus;
  for (const [navigation, entity] of Object.entries(children)) {
    const rows = (payload as unknown as Record<string, unknown>)[navigation];
    if (!Array.isArray(rows) || !rows.length) continue;
    const keys = new Set<string>();
    body[navigation] = rows.map((row, index) => {
      if (!row || typeof row !== 'object') throw new Error(`${navigation} contains an invalid row.`);
      const raw = row as Record<string, unknown>;
      const sapWorkType = navigation === '_WorkType'
        ? (toSapPermitType(String(raw.WorkType || '')) || String(raw.WorkType || '').trim())
        : undefined;
      const sapChkPermitType = navigation === '_CHK'
        ? (toSapPermitType(String(raw.PermitType || '')) || String(raw.PermitType || '').trim())
        : undefined;
      const source: Record<string, any> = {
        ...raw,
        ItemNo: String(index + 1),
        SeqNo: String(index + 1),
        ...(sapWorkType !== undefined ? { WorkType: sapWorkType } : {}),
        ...(sapChkPermitType !== undefined ? { PermitType: sapChkPermitType } : {}),
        ...(navigation === '_CHK' ? {
          QuestionnaireId: String(raw.QuestionnaireId || (raw as any).QuestionaireId || '').trim(),
          Answer: String(raw.Answer || (raw as any).response || '').trim().toUpperCase(),
          Remarks: String(raw.Remarks || (raw as any).remarks || '').trim()
        } : {}),
        ...(navigation === '_Equipment' ? {
          EquipCode: String(raw.EquipCode || toEquipCode(String(raw.EquipDesc || ''))).trim().slice(0, 10),
          EquipDesc: String(raw.EquipDesc || '').trim().slice(0, 255),
          OtherText: String(raw.OtherText || '').trim().slice(0, 255)
        } : {}),
        ...(navigation === '_NATW' ? {
          NatwCode: String(raw.NatwCode || toNatwCode(String(raw.NatwDesc || ''))).trim().slice(0, 10),
          NatwDesc: String(raw.NatwDesc || '').trim().slice(0, 255),
          OtherText: String(raw.OtherText || '').trim().slice(0, 255)
        } : {})
      };
      if (navigation === '_Worker' && (!source.WorkerName?.trim() || (source.WorkerTypeCode === 'EMP' && !source.EmpId?.trim()) || (source.WorkerTypeCode === 'CONT' && !source.ContractorName?.trim()))) throw new Error('Each worker needs a name and employee ID or contractor company.');
      if (navigation === '_HazardControl' && (!source.HazardDesc?.trim() || !source.ControlDesc?.trim())) throw new Error('Each hazard needs a description and control.');
      if (navigation === '_PPE' && (!source.PpeCode?.trim() || !source.PpeDesc?.trim())) throw new Error('Each PPE item needs its real code and description.');
      if (navigation === '_Safety' && (!source.ItemCode?.trim() || !source.ValueText?.trim())) throw new Error('Each safety check needs a code and description.');
      if (navigation === '_WorkType' && !source.WorkType?.trim()) throw new Error('Each work type record needs a valid category code.');
      if (navigation === '_Equipment' && (!source.EquipCode?.trim() || !source.EquipDesc?.trim())) throw new Error('Each equipment item needs a valid code and description.');
      if (navigation === '_NATW' && (!source.NatwCode?.trim() || !source.NatwDesc?.trim())) throw new Error('Each nature of work item needs a valid code and description.');
      if (navigation === '_CHK') {
        if (!source.QuestionnaireId?.trim()) throw new Error('Each checklist response requires a QuestionnaireId.');
        if (!source.PermitType?.trim()) throw new Error('Each checklist response requires a PermitType.');
        if (!source.Answer?.trim()) throw new Error('Each checklist response requires an Answer.');
      }
      const key = navigation === '_CHK'
        ? `${source.PermitType}_${source.QuestionnaireId}`
        : navigation === '_WorkType'
        ? source.SeqNo
        : source.ItemNo;
      if (keys.has(key)) throw new Error(`Duplicate ${navigation} item.`);
      keys.add(key);
      return serialize(entity, source);
    });
  }
  // No browser-generated number, attachments, approvals, audit entries, renewals or gas signatures.
  return body;
}
