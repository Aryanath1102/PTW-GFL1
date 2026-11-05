import { odataClient } from '../odataClient';
import { ODATA_ENTITIES } from '../odataEndpoints';
import { SapChecklistItem, SapChecklistResponse } from '../../types/checklist.types';
import { toSapPermitType } from '../../ptw/siteProcedure';

/**
 * Maps any UI permit category code (e.g. 'HGHT', 'CONF') or SAP code ('W@H', 'CSE')
 * to the exact SAP PermitType code expected by the Checklist OData service.
 */
export const toSapChecklistPermitType = toSapPermitType;
export { toSapPermitType };

/**
 * Development-only questionnaire reference data
 * Sourced directly from SAP OData service zptw_services/0001/Checklist
 */
export const FALLBACK_CHECKLISTS: Record<string, SapChecklistItem[]> = {
  'W@H': [
    {
      QuestionaireId: '1',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GENERAL',
      Question: 'IS WORK BEING PERFORMED AT HEIGHTS ABOVE 1.8 METERS USING EITHER A LADDER OR A SCAFFOLD?'
    },
    {
      QuestionaireId: '2',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GENERAL',
      Question: 'ARE WORKERS INSTRUCTED ON THE PROPER METHOD TO WEAR AND USE THE FULL BODY SAFETY HARNESS, AND HOW TO ATTACH IT TO THE LIFELINE OR ANCHORAGE POINT?'
    },
    {
      QuestionaireId: '3',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GENERAL',
      Question: 'ARE THE FULL BODY SAFETY HARNESS, ANCHORAGE, LIFELINE, OR FALL ARREST SYSTEM INSPECTED BY A GFL AUTHORIZED CES PERSON BEFORE USE BY THE WORKERS?'
    },
    {
      QuestionaireId: '4',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GENERAL',
      Question: 'IS SUFFICIENT AND SECURE ANCHORAGE OR A LIFELINE PROVIDED?'
    },
    {
      QuestionaireId: '5',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GENERAL',
      Question: 'ARE ISI MARKED, HIGH-QUALITY, AND WELL-MAINTAINED FULL BODY SAFETY HARNESSES WITH TWIN LANYARDS USED WHILE WORKING AT HEIGHTS?'
    },
    {
      QuestionaireId: '6',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GENERAL',
      Question: 'HAS A RESCUE PLAN BEEN DEVELOPED AND IMPLEMENTED FOR WORK AT HEIGHT?'
    },
    {
      QuestionaireId: '7',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GENERAL',
      Question: 'WHEN ANY WORK AT HEIGHT IS TO BE CARRIED OUT, IS A SAFE MEANS OF ACCESS AND EGRESS PROVIDED?'
    },
    {
      QuestionaireId: '8',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GENERAL',
      Question: 'IS THERE ADEQUATE SUPERVISION TO ENSURE THAT SAFE WORK PRACTICES FOR WORKING AT HEIGHTS ARE IN PLACE?'
    },
    {
      QuestionaireId: '9',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'LADDER',
      Question: 'ARE THE LADDER AND SCAFFOLD IN GOOD CONDITION AND MARKED WITH INSPECTION TAGS?'
    },
    {
      QuestionaireId: '10',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'LADDER',
      Question: 'IS THE LADDER PLACED ON A SECURE AND LEVEL SURFACE?'
    },
    {
      QuestionaireId: '11',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'LADDER',
      Question: 'IS THE LADDER PLACED AT AN ANGLE GREATER THAN 75 DEGREES TO THE HORIZONTAL GROUND?'
    },
    {
      QuestionaireId: '12',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'LADDER',
      Question: "WHEN A LADDER IS USED FOR ACCESS OR AS A WORKING PLATFORM, ARE ADEQUATE HANDHOLDS PROVIDED TO A HEIGHT OF AT LEAST ONE METER ABOVE THE LANDING POINT OF THE HIGHEST RUNG THAT A PERSON'S FEET WILL REACH?"
    },
    {
      QuestionaireId: '13',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'SCAFFOLDIN',
      Question: 'HAS THE SCAFFOLDING BEEN ERECTED ONLY ON RIGID/FIRM/LEVEL SURFACES?'
    },
    {
      QuestionaireId: '14',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'SCAFFOLDIN',
      Question: 'IS A SUITABLE PLATFORM WITH A TOE GUARD, HANDRAIL, AND MID-RAIL PROVIDED?'
    },
    {
      QuestionaireId: '15',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'SCAFFOLDIN',
      Question: 'HAS THE SCAFFOLD BEEN INSPECTED AND CERTIFIED BY AN AUTHORIZED ENGINEER BEFORE PUTTING INTO USE?'
    },
    {
      QuestionaireId: '16',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'SCAFFOLDIN',
      Question: 'IS PROVISION MADE TO ARRANGE A DUCK LADDER OR CRAWLING BOARD FOR WORKING ON FRAGILE ROOFS OR ASBESTOS?'
    },
    {
      QuestionaireId: '17',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'SCAFFOLDIN',
      Question: 'HAS THE SCISSOR LIFT / MAN LIFTER USED FOR WORK AT HEIGHT BEEN INSPECTED AND CERTIFIED BY A COMPETENT PERSON (CES PERSON) BEFORE USE?'
    },
    {
      QuestionaireId: '18',
      PermitType: 'W@H',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GENERAL',
      Question: 'ARE THERE ANY HIGH-TENSION CABLES, HONEYBEE COMBS, OR OTHER HAZARDS DIRECTLY ABOVE THE WORK BEING PERFORMED AT HEIGHT?'
    }
  ],
  'CSE': [
    {
      QuestionaireId: '20',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'ISOLATION',
      Question: 'IS THE ELECTRICAL ISOLATION OF ROTATING EQUIPMENT DONE BY REMOVING THE FUSE, LOCKING IT, AND TAGGING IT?'
    },
    {
      QuestionaireId: '21',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'ISOLATION',
      Question: 'ARE ALL CONNECTED PIPELINES, INCLUDING THOSE WITH CSE POSITIVELY ISOLATED?'
    },
    {
      QuestionaireId: '22',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'ISOLATION',
      Question: 'ARE THE ENDS OF THE DETACHED LINES FITTED WITH BLINDS? THE BLINDS SHOULD BE INDICATED IN THE DRAWINGS/REGISTER SHOULD BE MAINTAINED.'
    },
    {
      QuestionaireId: '23',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'ISOLATION',
      Question: 'ARE ISOLATION TAGS AVAILABLE ON THE VALVES TO PREVENT ACCIDENTAL OPERATION?'
    },
    {
      QuestionaireId: '24',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'PREPARATION',
      Question: 'IS THE DRAINING, WASHING, CLEANING, AND PURGING DONE PROPERLY?'
    },
    {
      QuestionaireId: '25',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'PREPARATION',
      Question: 'IS THE CSE FREE FROM PHYSICAL HAZARDS LIKE EXTREME COLD OR HEAT THROUGH PROPER COOLING AND AIR PURGING?'
    },
    {
      QuestionaireId: '26',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'VENTILATION',
      Question: 'IS THERE PROPER AIR VENTILATION INSIDE THE CSE, SUCH AS AN EXHAUST FAN OR A MOVABLE BLOWER PROVIDED WITH ADEQUATE CAPACITY?'
    },
    {
      QuestionaireId: '27',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'ELECTRICAL',
      Question: 'FOLLOW ELECTRICAL SAFETY: 8.1 ARE ONLY 24-VOLT BULBS WITH FLAMEPROOF FITTINGS USED? 8.2 ARE THERE ANY CABLE JOINTS OBSERVED? 8.3 IS THE POWER SUPPLY PROTECTED BY AN ELCB?'
    },
    {
      QuestionaireId: '28',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'EARTHING',
      Question: 'IS THE EARTHING RESISTANCE OF THE PROCESS VESSEL OR TANK LESS THAN 1 OHM? (DONE WITH PLANNING)'
    },
    {
      QuestionaireId: '29',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GAS TESTING',
      Question: 'HAS AIR QUALITY BEEN TESTED AND RECORDED FOR TOXIC, POISONOUS AND FLAMMABLE GASES AND OXYGEN PERCENTAGE AT ALL VESSEL/CONFINED-SPACE LOCATIONS AND AT DIFFERENT LEVELS (TOP, MIDDLE AND BOTTOM) OF VERTICAL VESSELS/REACTORS?'
    },
    {
      QuestionaireId: '30',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'ACCESS',
      Question: 'IS THERE A PROVISION FOR A PROPERLY SIZED LADDER (ALUMINIUM, M.S., OR ROPE TYPE) FOR ASCENDING AND DESCENDING INSIDE THE CSE, ACCORDING TO LOCATION REQUIREMENTS?'
    },
    {
      QuestionaireId: '31',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'RESCUE',
      Question: 'IS A STRETCHER ARRANGED AT THE NEAREST LOCATION OF THE CSE ACTIVITY, IF REQUIRED?'
    },
    {
      QuestionaireId: '32',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'MONITORING',
      Question: 'A DISTRESS METER (MOTION METER) IS ARRANGED, AND ANYONE ENTERING THE CSE MUST WEAR IT.'
    },
    {
      QuestionaireId: '33',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'PERSONNEL',
      Question: 'HAVE THE NAMES AND DETAILS OF ALL PERSONNEL ENTERING THE CONFINED SPACE BEEN RECORDED ON THE PERMIT BEFORE ENTRY?'
    },
    {
      QuestionaireId: '34',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'RESPIRATORY PROTECTION',
      Question: 'IS A FRESH-AIR SUPPLY FACILITY (AIRLINE RESPIRATOR/CASCADE SYSTEM) AVAILABLE FOR PROTECTION AGAINST DANGEROUS GASES, FUMES, VAPOURS AND OXYGEN-DEFICIENT ENVIRONMENTS, INCLUDING HAZARDS FROM CHEMICALS SUCH AS CHLORINE, AMMONIA, HCL AND HF?'
    },
    {
      QuestionaireId: '35',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'PREPARATION',
      Question: 'HAVE ALL JOBS, INSPECTIONS, AND BRIEFINGS ON HAZARDS AND PRECAUTIONS FOR THE CONFINED SPACE BEEN COMPLETED FOR ALL PERSONNEL INVOLVED BEFORE STARTING THE JOB?'
    },
    {
      QuestionaireId: '36',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'PPE',
      Question: 'DOES THE PERSON ENTERING THE CSE WEAR A FULL BODY HARNESS WITH A DOUBLE LIFELINE, ANCHORED WITH A SEPARATE LIFELINE TIED OUTSIDE THE CSE AT A SECURE LOCATION?'
    },
    {
      QuestionaireId: '37',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'STANDBY PERSON',
      Question: 'IS THERE A PERSON STATIONED OUTSIDE THE CSE NEAR THE MANHOLE/OPENING AS A STANDBY, EQUIPPED WITH COMMUNICATION TOOLS LIKE A WALKIE-TALKIE FOR PROPER COMMUNICATION?'
    },
    {
      QuestionaireId: '38',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'STANDBY PERSON',
      Question: 'BOTH THE STANDBY PERSON AND THE PERSON ENTERING THE CSE SHOULD BE WELL-TRAINED AND POSSESS SUFFICIENT KNOWLEDGE ABOUT THE PROCESS HAZARDS AND RISKS ASSOCIATED WITH THAT CSE'
    },
    {
      QuestionaireId: '39',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'RESCUE',
      Question: 'IS A RESCUER TEAM MEMBER AVAILABLE DURING THE CSE? NAME:'
    },
    {
      QuestionaireId: '40',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'RESCUE',
      Question: 'IS THE RESCUER TEAM MEMBER TRAINED IN RESCUE OPERATIONS?'
    },
    {
      QuestionaireId: '41',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'GAS TESTING',
      Question: 'IF THE WORK CONTINUES FOR AN EXTENDED PERIOD, DOES THE PERSON TAKE A 15–20-MINUTE REST INTERMITTENTLY. IS A GAS TEST CONDUCTED AFTER EACH REST AND BEFORE RE-ENTERING THE CSE & RECORDED?'
    },
    {
      QuestionaireId: '42',
      PermitType: 'CSE',
      Type: 'CHECKLIST',
      Sequence: '',
      Category: 'FACILITIES',
      Question: 'FACILITIES AVAILABLE FOR CSE: MULTI-GAS DETECTORS FOR O2, LEL, CO, H2S AND CL2; ONLINE AIRLINE RESPIRATORS; SCBA SETS IN THE PLANT CONTROL ROOM/KEY LOCATIONS; TRAINED FIRST-AIDERS.'
    }
  ],
  'HOT': [
    { QuestionaireId: '51', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'SURROUNDINGS', Question: 'IS A 10-METER RADIUS AROUND THE HOT WORK AREA CLEARED OF ALL COMBUSTIBLE AND FLAMMABLE MATERIALS?' },
    { QuestionaireId: '52', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'FIRE PROTECTION', Question: 'ARE FIRE EXTINGUISHERS (DCP/CO2/FOAM) AND PRESSURIZED FIRE WATER HOSE READILY AVAILABLE AT THE WORK SITE?' },
    { QuestionaireId: '53', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'FIRE WATCH', Question: 'IS A DEDICATED AND TRAINED FIRE WATCH ASSIGNED TO MONITOR THE HOT WORK DURING AND FOR 30 MINUTES AFTER COMPLETION?' },
    { QuestionaireId: '54', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'SPARK CONTAINMENT', Question: 'ARE FIRE BLANKETS / METALLIC SPARK ARRESTORS PROPERLY INSTALLED TO CONTAIN FLYING SPARKS AND SLAG?' },
    { QuestionaireId: '55', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'GAS TESTING', Question: 'HAS ATMOSPHERIC GAS TESTING BEEN CONDUCTED AND CONFIRMED 0% LEL FOR FLAMMABLE GASES/VAPORS PRIOR TO SPARK CREATION?' },
    { QuestionaireId: '56', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'EQUIPMENT', Question: 'ARE WELDING CABLES, HOLDER, RETURN CLAMP, AND RETURN LEADS IN SOUND CONDITION WITH NO DAMAGED INSULATION?' },
    { QuestionaireId: '57', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'EQUIPMENT', Question: 'IS THE WELDING MACHINE PROPERLY GROUNDED WITH DOUBLE EARTHING AND CONNECTED THROUGH A FUNCTIONING ELCB/RCCB?' },
    { QuestionaireId: '58', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'GAS CYLINDERS', Question: 'ARE OXYGEN AND ACETYLENE CYLINDERS SECURED UPRIGHT IN A TROLLEY WITH FLASHBACK ARRESTORS AT BOTH TORCH AND REGULATOR ENDS?' },
    { QuestionaireId: '59', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'DRAINS', Question: 'ARE ALL SEWERS, DRAINS, AND SUMPS WITHIN A 15-METER RADIUS COVERED WITH FIRE-RESISTANT BLANKETS AND WETTED?' },
    { QuestionaireId: '60', PermitType: 'HOT', Type: 'CHECKLIST', Sequence: '', Category: 'PPE', Question: 'ARE WELDERS AND HELPERS WEARING APPROVED LEATHER WELDING APRON, SLEEVES, GLOVES, AND PROPER EYE SHIELD/HELMET?' }
  ],
  'ELEC': [
    { QuestionaireId: '71', PermitType: 'ELEC', Type: 'CHECKLIST', Sequence: '', Category: 'ISOLATION', Question: 'HAS THE ELECTRICAL SYSTEM BEEN POSITIVELY ISOLATED, SWITCHED OFF, RACKED OUT, AND LOCKED OUT (LOTO)?' },
    { QuestionaireId: '72', PermitType: 'ELEC', Type: 'CHECKLIST', Sequence: '', Category: 'ZERO ENERGY', Question: 'HAS ZERO VOLTAGE BEEN VERIFIED USING A CALIBRATED TEST INSTRUMENT ON ALL PHASES AND NEUTRAL?' },
    { QuestionaireId: '73', PermitType: 'ELEC', Type: 'CHECKLIST', Sequence: '', Category: 'EARTHING', Question: 'IS TEMPORARY PROTECTIVE DISCHARGE AND PORTABLE EARTH APPLIED TO DISCHARGE RESIDUAL ELECTRICAL ENERGY?' },
    { QuestionaireId: '74', PermitType: 'ELEC', Type: 'CHECKLIST', Sequence: '', Category: 'TOOLS', Question: 'ARE INSULATED HAND TOOLS (TESTED TO 1000V) AND RUBBER INSULATING MATS (IS 15652) USED FOR THE JOB?' },
    { QuestionaireId: '75', PermitType: 'ELEC', Type: 'CHECKLIST', Sequence: '', Category: 'PPE', Question: 'ARE ELECTRICAL-RATED SAFETY SHOES, DIELECTRIC GLOVES, AND ARC FLASH SUIT/FACE SHIELD PROVIDED AS PER HAZARD RATING?' },
    { QuestionaireId: '76', PermitType: 'ELEC', Type: 'CHECKLIST', Sequence: '', Category: 'BARRICADING', Question: 'IS THE ADJACENT LIVE EQUIPMENT / SWITCHGEAR BUSBAR SHROUDED AND CLEAR DANGER WARNING BOARDS DISPLAYED?' }
  ]
};

class ChecklistApi {
  private cache = new Map<string, { timestamp: number; data: SapChecklistItem[] }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetches checklist questionnaire for a given permit type from SAP OData V4 service.
   * If SAP backend returns checklist items, it dynamically caches and returns them.
   * If SAP is unreachable / offline or returns empty for supported types,
   * falls back to the verified seed catalog.
   */
  public async fetchChecklist(
    permitType: string,
    options?: { signal?: AbortSignal; forceRefresh?: boolean }
  ): Promise<SapChecklistItem[]> {
    const sapCode = toSapChecklistPermitType(permitType);
    if (!sapCode) return [];

    const now = Date.now();
    const cached = this.cache.get(sapCode);
    if (!options?.forceRefresh && cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const filter = `Type eq 'CHECKLIST' and PermitType eq '${sapCode}'`;
      const url = `${ODATA_ENTITIES.CHECKLIST}?$filter=${encodeURIComponent(filter)}`;

      const response = await odataClient.get<SapChecklistResponse>(url, {
        signal: options?.signal
      });

      // Detect HTML login redirects or empty/malformed responses
      if (typeof response.data === 'string' && (response.data as string).includes('<html')) {
        throw new Error('SAP session expired or unauthenticated.');
      }

      if (response.data && Array.isArray(response.data.value) && response.data.value.length > 0) {
        this.cache.set(sapCode, { timestamp: now, data: response.data.value });
        return response.data.value;
      }

      // If SAP returned empty array, check fallback seed
      if (import.meta.env.DEV && FALLBACK_CHECKLISTS[sapCode]) {
        const fallback = FALLBACK_CHECKLISTS[sapCode];
        this.cache.set(sapCode, { timestamp: now, data: fallback });
        return fallback;
      }

      if (!import.meta.env.DEV && ['CSE', 'W@H', 'ELEC', 'HOT'].includes(sapCode)) {
        throw new Error('SAP compliance checklist is unavailable.');
      }
      return [];
    } catch (error) {
      // In offline / dev / unauthenticated proxy environments, use fallback if available
      if (import.meta.env.DEV && FALLBACK_CHECKLISTS[sapCode]) {
        const fallback = FALLBACK_CHECKLISTS[sapCode];
        this.cache.set(sapCode, { timestamp: now, data: fallback });
        return fallback;
      }
      if (!import.meta.env.DEV) throw error;
      return [];
    }
  }

  /**
   * Checks whether questionnaire items exist for the given permit type.
   */
  public async hasChecklist(permitType: string): Promise<boolean> {
    const items = await this.fetchChecklist(permitType);
    return items.length > 0;
  }

  /**
   * Clears in-memory questionnaire cache
   */
  public clearCache(): void {
    this.cache.clear();
  }
}

export const checklistApi = new ChecklistApi();
export default checklistApi;
