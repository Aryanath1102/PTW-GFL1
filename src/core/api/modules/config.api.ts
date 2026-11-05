import { odataClient } from '../odataClient';
import { ConfigType, SapConfigRecord, SapConfigResponse } from '../../types/config.types';

/**
 * Offline / Fallback Seed Data supplied by SAP backend configuration
 * Used when disconnected from VPN or when SAP Gateway is unreachable.
 */
export const FALLBACK_CONFIG_DATA: Record<ConfigType, SapConfigRecord[]> = {
  PPE: [
    { Config_Type: 'PPE', Config_Code: 'ARCFLHV', Config_Desc: 'ARC FLASH SUIT WITH HOOD (HV) 40CAL/CM²', Parent_Code: 'ELECTRICAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'ARCFLLV', Config_Desc: 'ARC FLASH SUIT WITH HOOD (LV) 8CAL/CM²', Parent_Code: 'ELECTRICAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'CHEMGLOV', Config_Desc: 'CHEMICAL RESISTANT GLOVES', Parent_Code: 'LINE_BRK', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'CHEMGOGG', Config_Desc: 'CHEMICAL SPLASH GOGGLES', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'CHEMSUIT', Config_Desc: 'CHEMICAL-RESISTANT SUIT', Parent_Code: 'LINE_BRK', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'COTGLOVE', Config_Desc: 'COTTON GLOVES (WITH OR W/O PVC DOTS)', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'CUTGLOVE', Config_Desc: 'CUT RESISTANCE GLOVES', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'DIELSHOE', Config_Desc: 'DI-ELECTRIC RUBBER SHOES', Parent_Code: 'ELECTRICAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'DUSTMASK', Config_Desc: 'DUST MASK', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'FACESHLD', Config_Desc: 'FACE SHIELD', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'FLAMESUIT', Config_Desc: 'FLAME-RESISTANT SUIT', Parent_Code: 'LINE_BRK', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'FRCLOTH', Config_Desc: 'FIRE-RETARDANT CLOTHING', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'FULLBODY', Config_Desc: 'FULL BODY PROTECTION (JACKET/APRON RUBBER, NEOPRENE-SUITS)', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'FULLRESP', Config_Desc: 'FULL-FACE (AIR PURIFYING VIA CARTRIDGE)', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'GUMBOOTS', Config_Desc: 'GUM BOOTS', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'HALFRESP', Config_Desc: 'HALF-FACE (MOUTH, NOSE)', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'HEARPROT', Config_Desc: 'HEARING PROTECTION', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'HEATGLOV', Config_Desc: 'HEAT RESISTANT GLOVES', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'HVGLOVE', Config_Desc: 'HIGH VOLTAGE GLOVES', Parent_Code: 'ELECTRICAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'LEATHGLV', Config_Desc: 'LEATHER GLOVES', Parent_Code: 'LINE_BRK', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'LVGLOVE', Config_Desc: 'LOW VOLTAGE GLOVES (1.1KV)', Parent_Code: 'ELECTRICAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'NITGLOVE', Config_Desc: 'NITRILE GLOVES', Parent_Code: 'LINE_BRK', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'SAFHARN', Config_Desc: 'FALL PROTECTION - SA', Parent_Code: 'ELECTRICAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'SAFHELM', Config_Desc: 'SAFETY HELMET', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'SAFSHOES', Config_Desc: 'SAFETY SHOES', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'SCBA', Config_Desc: 'SELF-CONTAINED BREATHING APPARATUS', Parent_Code: 'LINE_BRK', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'SGLASSES', Config_Desc: 'SAFETY GLASSES', Parent_Code: 'GENERAL', Active: 'X' },
    { Config_Type: 'PPE', Config_Code: 'WELDGOGG', Config_Desc: 'WELDING OR CUTTING GOGGLES', Parent_Code: 'GENERAL', Active: 'X' }
  ],
  SHIFT: [
    { Config_Type: 'SHIFT', Config_Code: 'A', Config_Desc: 'SHIFT A', Parent_Code: '', Active: 'X' },
    { Config_Type: 'SHIFT', Config_Code: 'B', Config_Desc: 'SHIFT B', Parent_Code: '', Active: 'X' },
    { Config_Type: 'SHIFT', Config_Code: 'C', Config_Desc: 'SHIFT C', Parent_Code: '', Active: 'X' },
    { Config_Type: 'SHIFT', Config_Code: 'EXTENDED DAY', Config_Desc: 'EXTENDED DAY', Parent_Code: '', Active: 'X' },
    { Config_Type: 'SHIFT', Config_Code: 'EXTENDED NIGHT', Config_Desc: 'EXTENDED NIGHT', Parent_Code: '', Active: 'X' },
    { Config_Type: 'SHIFT', Config_Code: 'G', Config_Desc: 'SHIFT GENERAL', Parent_Code: '', Active: 'X' }
  ],
  PERMIT_TYPE: [
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'COLD', Config_Desc: 'COLD WORK', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'CSE', Config_Desc: 'CONFINED SPACE ENTRY', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'EXCV', Config_Desc: 'EXCAVATION', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'HOT', Config_Desc: 'HOT WORK', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'HYD_PNEU', Config_Desc: 'HYDRAULIC & PNEUMATIC SYSTEM', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'LBRK', Config_Desc: 'LINE BREAK', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'RAD', Config_Desc: 'RADIOGRAPHY', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'RIG', Config_Desc: 'RIGGING', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'W@H', Config_Desc: 'WORK AT HEIGHT', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PERMIT_TYPE', Config_Code: 'ELEC', Config_Desc: 'ELECTRICAL', Parent_Code: '', Active: 'X' }
  ],
  WORKER_TYPE: [
    { Config_Type: 'WORKER_TYPE', Config_Code: 'CONT', Config_Desc: 'CONTRACTOR', Parent_Code: '', Active: 'X' },
    { Config_Type: 'WORKER_TYPE', Config_Code: 'EMP', Config_Desc: 'EMPLOYEE', Parent_Code: '', Active: 'X' }
  ],
  DEPARTMENT: [
    { Config_Type: 'DEPARTMENT', Config_Code: 'CIVIL', Config_Desc: 'CIVIL', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'ELECTRICAL', Config_Desc: 'ELECTRICAL', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'ENV', Config_Desc: 'ENVIRONMENT', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'FIRE', Config_Desc: 'FIRE', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'INSTRU', Config_Desc: 'INSTRUMENTATION', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'IT', Config_Desc: 'IT', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'MECH', Config_Desc: 'MECHANICAL', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'MECH_ROTARY', Config_Desc: 'MECHANICAL (ROTARY)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'MECH_STATIC', Config_Desc: 'MECHANICAL (STATIC)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'PROCESS', Config_Desc: 'PROCESS / OPPERATIONS', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEPARTMENT', Config_Code: 'SAFETY', Config_Desc: 'SAFETY', Parent_Code: '', Active: 'X' }
  ],
  PLANT: [
    { Config_Type: 'PLANT', Config_Code: 'APTFE_PLANT', Config_Desc: 'APTFE PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'CA_PLANT', Config_Desc: 'CA PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'CACL2_PLANT_1', Config_Desc: 'CACL2 PLANT 1', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'CACL2_PLANT_2', Config_Desc: 'CACL2 PLANT 2', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'CACL2_PLANT_3', Config_Desc: 'CACL2 PLANT 3', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'CACL2_PLANT_4', Config_Desc: 'CACL2 PLANT 4', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'CMS_PLANT_1', Config_Desc: 'CMS PLANT 1', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'CMS_PLANT_2', Config_Desc: 'CMS PLANT 2', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'COMMON_POLYMER_UTIL', Config_Desc: 'COMMON POLYMER UTILS', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'CPP_COAL', Config_Desc: 'CPP - COAL', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'CPP_NG', Config_Desc: 'CPP - NG', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'DPTFE_PLANT', Config_Desc: 'DPTFE PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'ETP_PLANT', Config_Desc: 'EFFLUENT TREATMENT PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'FEP_PLANT', Config_Desc: 'FEP PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'FI_PLANT', Config_Desc: 'FI PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'FKM_PLANT', Config_Desc: 'FKM PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'HCFC_R22_PLANT', Config_Desc: 'HCFC (R-22) PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'HF_PLANT', Config_Desc: 'HF PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'PFA_PLANT', Config_Desc: 'PFA PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'PILOT_PLANT', Config_Desc: 'PILOT PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'PVDF_PLANT', Config_Desc: 'PVDF PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'R125_PLANT', Config_Desc: 'R-125 PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'R225_PLANT', Config_Desc: 'R-225 PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'REACTOR_8_9', Config_Desc: '8 & 9 REACTOR PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'SPTFE_PTPTFE_PLANT', Config_Desc: 'SPTFE / PTPTFE PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'TFE_PLANT_1', Config_Desc: 'TFE PLANT 1', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'TFE_PLANT_2', Config_Desc: 'TFE PLANT 2', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'TFE_PLANT_3', Config_Desc: 'TFE PLANT 3', Parent_Code: 'DEPARTMENT', Active: 'X' },
    { Config_Type: 'PLANT', Config_Code: 'VDF_PLANT', Config_Desc: 'VDF PLANT', Parent_Code: 'DEPARTMENT', Active: 'X' }
  ],
  ISOLATION_TYPE: [
    { Config_Type: 'ISOLATION_TYPE', Config_Code: 'ELEC', Config_Desc: 'ELECTRICAL', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATION_TYPE', Config_Code: 'INHOVR', Config_Desc: 'INHIBITS AND OVERRIDES', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATION_TYPE', Config_Code: 'MECH', Config_Desc: 'PROCESS/MECHANICAL', Parent_Code: '', Active: 'X' }
  ],
  ISOLATED_STATE: [
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'APPLIED', Config_Desc: 'APPLIED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'BLEED', Config_Desc: 'BLEED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'CAPPED', Config_Desc: 'CAPPED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'CLOSED', Config_Desc: 'CLOSED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'DISCONN', Config_Desc: 'DISCONNECTED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'FITTED', Config_Desc: 'FITTED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'IN_PLACE', Config_Desc: 'IN PLACE', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'INH_OVR', Config_Desc: 'INHIBITED/OVERRIDEN', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'INSERTED', Config_Desc: 'INSERTED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'INSTALLED', Config_Desc: 'INSTALLED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'LABELLED', Config_Desc: 'LABELLED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'LOCKED', Config_Desc: 'LOCKED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'OPEN', Config_Desc: 'OPEN', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'PLUGGED', Config_Desc: 'PLUGGED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'RACKED_IN', Config_Desc: 'RACKED IN', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'RACKED_OUT', Config_Desc: 'RACKED OUT', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'RELEASED', Config_Desc: 'RELEASED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'REMOVED', Config_Desc: 'REMOVED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOLATED_STATE', Config_Code: 'SECURED', Config_Desc: 'SECURED', Parent_Code: '', Active: 'X' }
  ],
  ISOL_METHOD: [
    { Config_Type: 'ISOL_METHOD', Config_Code: 'BLANK_IR', Config_Desc: 'BLANK (I/R)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'BLANK_RI', Config_Desc: 'BLANK (R/I)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'BLEED_BC', Config_Desc: 'BLEED (B/C)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'BLEED_BO', Config_Desc: 'BLEED (B/O)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'BUSBAR_SHUT', Config_Desc: 'BUSBAR SHUTTERS', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'CAPPED', Config_Desc: 'CAPPED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'CB_RIRO', Config_Desc: 'CIRCUIT BREAKER (RI/RO)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'CB_RORI', Config_Desc: 'CIRCUIT BREAKER (RO/RI)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'CIRC_SHUT', Config_Desc: 'CIRCUIT SHUTTERS', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'CUBICLE_D', Config_Desc: 'CUBICLE DOOR', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'EARTH_SW', Config_Desc: 'EARTH SWITCH (A/R)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'FUSE', Config_Desc: 'FUSE', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'INHIB_OVR', Config_Desc: 'INHIBIT/OVERRIDE', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'INHIBIT', Config_Desc: 'INHIBIT', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'ISOL_CO', Config_Desc: 'ISOLATOR (C/O)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'ISOL_OC', Config_Desc: 'ISOLATOR (O/C)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'ISOL_OO', Config_Desc: 'ISOLATOR (O/O)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'KNIFE_SW', Config_Desc: 'KNIFE SWITCH/EDGE', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'LC_VLV_CC', Config_Desc: 'L/C VALVE (C/C)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'LC_VLV_OC', Config_Desc: 'L/C VALVE (O/C)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'LO_VLV_CO', Config_Desc: 'L/O VALVE (C/O)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'LO_VLV_OO', Config_Desc: 'L/O VALVE (O/O)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'LOCKBOX_LR', Config_Desc: 'LOCKBOX/HASP (L/R)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'MAIN_EARTH', Config_Desc: 'MAIN EARTH', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'MOVEMENT', Config_Desc: 'MOVEMENT', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'OUT_CABLE', Config_Desc: 'OUTGOING CABLES', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'PIPE_SP_FR', Config_Desc: 'PIPE SPOOL (F/R)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'PIPE_SP_RF', Config_Desc: 'PIPE SPOOL (R/F)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'PLUGGED', Config_Desc: 'PLUGGED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'PORT_EARTH', Config_Desc: 'PORTABLE EARTHS', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'PROC_BLEED', Config_Desc: 'PROCESS BLEED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'RACK_MECH', Config_Desc: 'RACKING MECHANISM', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'SHUTTERS', Config_Desc: 'SHUTTERS', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'SPADE_II', Config_Desc: 'SPADE/BLIND (I/I)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'SPADE_INS', Config_Desc: 'SPADE INSERTED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'SPADE_IR', Config_Desc: 'SPADE/BLIND (I/R)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'SPADE_RI', Config_Desc: 'SPADE/BLIND (R/I)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'SPECT_IR', Config_Desc: 'SPECTACLE BLIND (I/R)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'SPECT_RI', Config_Desc: 'SPECTACLE BLIND (R/I)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'STORED_ENG', Config_Desc: 'STORED ENERGY', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'VALVE_CC', Config_Desc: 'VALVE (C/C)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'VALVE_CO', Config_Desc: 'VALVE (C/O)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'VALVE_OC', Config_Desc: 'VALVE (O/C)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'VALVE_OO', Config_Desc: 'VALVE (O/O)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'VENT_CO', Config_Desc: 'VENT (C/O)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'VENT_OC', Config_Desc: 'VENT (O/C)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'VENT_OO', Config_Desc: 'VENT (O/O)', Parent_Code: '', Active: 'X' },
    { Config_Type: 'ISOL_METHOD', Config_Code: 'VOLT_TRAN', Config_Desc: 'VOLTAGE TRANSFORMER', Parent_Code: '', Active: 'X' }
  ],
  DEISOLATED_STATE: [
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'CLOSED', Config_Desc: 'CLOSED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'CONNECTED', Config_Desc: 'CONNECTED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'FITTED', Config_Desc: 'FITTED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'FREE', Config_Desc: 'FREE', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'IN_PLACE', Config_Desc: 'IN PLACE', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'INSTALLED', Config_Desc: 'INSTALLED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'LBL_REMOVED', Config_Desc: 'LABEL REMOVED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'NORMAL', Config_Desc: 'NORMAL', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'OPEN', Config_Desc: 'OPEN', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'RACKED_IN', Config_Desc: 'RACKED IN', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'RACKED_OUT', Config_Desc: 'RACKED OUT', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'REMOVED', Config_Desc: 'REMOVED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'REPLACED', Config_Desc: 'REPLACED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'RESTORED', Config_Desc: 'RESTORED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'UN_LOCKED', Config_Desc: 'UN-LOCKED', Parent_Code: '', Active: 'X' },
    { Config_Type: 'DEISOLATED_STATE', Config_Code: 'UNLOCKED', Config_Desc: 'UNLOCKED', Parent_Code: '', Active: 'X' }
  ],
  PTW_ACCEPTOR_ROLE: [
    { Config_Type: 'PTW_ACCEPTOR_ROLE', Config_Code: 'PTW_ACCP', Config_Desc: 'PERMIT ACCEPTOR', Parent_Code: '', Active: 'X' }
  ],
  PTW_ADMIN: [
    { Config_Type: 'PTW_ADMIN', Config_Code: 'PTW_ADMIN', Config_Desc: 'PTW ADMINISTRATOR', Parent_Code: '', Active: 'X' }
  ],
  PTW_APPROVAL_ROLE: [
    { Config_Type: 'PTW_APPROVAL_ROLE', Config_Code: 'PTW_APPR1', Config_Desc: 'PERMIT APPROVER-I', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PTW_APPROVAL_ROLE', Config_Code: 'PTW_APPR2', Config_Desc: 'PERMIT APPROVER-II', Parent_Code: '', Active: 'X' },
    { Config_Type: 'PTW_APPROVAL_ROLE', Config_Code: 'PTW_APPR3', Config_Desc: 'PERMIT APPROVER-III', Parent_Code: '', Active: 'X' }
  ],
  PTW_AREA_ROLE: [
    { Config_Type: 'PTW_AREA_ROLE', Config_Code: 'PTW_AREA_OPP', Config_Desc: 'PERMIT AREA OPERATOR', Parent_Code: '', Active: 'X' }
  ],
  PTW_GASTESTER_ROLE: [
    { Config_Type: 'PTW_GASTESTER_ROLE', Config_Code: 'PTW_GAS', Config_Desc: 'PERMIT GAS TESTER', Parent_Code: '', Active: 'X' }
  ],
  PTW_HOLDER_ROLE: [
    { Config_Type: 'PTW_HOLDER_ROLE', Config_Code: 'PTW_HOLD', Config_Desc: 'PERMIT HOLDER', Parent_Code: '', Active: 'X' }
  ],
  PTW_ISOLATION_ROLE: [
    { Config_Type: 'PTW_ISOLATION_ROLE', Config_Code: 'PTW_ISO_REQ', Config_Desc: 'ISOLATION REQUESTOR', Parent_Code: '', Active: 'X' }
  ],
  PTW_ISSUER_ROLE: [
    { Config_Type: 'PTW_ISSUER_ROLE', Config_Code: 'PTW_ISSU', Config_Desc: 'PERMIT ISSUER', Parent_Code: '', Active: 'X' }
  ],
  PTW_SAFETY_ROLE: [
    { Config_Type: 'PTW_SAFETY_ROLE', Config_Code: 'PTW_SAFE', Config_Desc: 'PERMIT SAFETY OFFICER', Parent_Code: '', Active: 'X' }
  ]
};

class ConfigApiService {
  private cache: Map<string, SapConfigRecord[]> = new Map();

  /**
   * Fetches configuration records directly from SAP S/4HANA OData V4 service.
   * Performs live HTTP GET: Config?$filter=Config_Type eq '{type}'
   * Falls back to offline payload if the server is unreachable.
   */
  public async fetchConfigByType(type: ConfigType, forceRefresh = false): Promise<SapConfigRecord[]> {
    if (!forceRefresh && this.cache.has(type)) {
      return this.cache.get(type)!;
    }

    try {
      // Live HTTP GET call to SAP Gateway endpoint
      const filter = encodeURIComponent(`Config_Type eq '${type}'`);
      const response = await odataClient.get<SapConfigResponse>(`Config?$filter=${filter}`);
      
      const records = response.data?.value || [];
      // Some config records have Active='X' while others (e.g. DEPARTMENT) have Active=''
      const hasExplicitActiveFlags = records.some(item => item.Active === 'X');
      const activeRecords = hasExplicitActiveFlags
        ? records.filter(item => item.Active === 'X')
        : records.filter(item => item.Active !== 'N' && item.Active !== '0' && item.Active !== 'FALSE');

      if (activeRecords.length > 0) {
        this.cache.set(type, activeRecords);
        return activeRecords;
      }

      // Production must not invent configuration when SAP has no active records.
      if (!import.meta.env.DEV) return [];
      // Development-only reference data
      const fallback = FALLBACK_CONFIG_DATA[type] || [];
      this.cache.set(type, fallback);
      return fallback;
    } catch (error) {
      if (!import.meta.env.DEV) { console.warn('[ConfigApi] SAP configuration unavailable.'); return []; }
      console.warn(`[ConfigApi] Live fetch for Config_Type='${type}' failed, using fallback data. Reason:`, error);
      const fallback = FALLBACK_CONFIG_DATA[type] || [];
      this.cache.set(type, fallback);
      return fallback;
    }
  }

  public async fetchPpeConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('PPE', forceRefresh);
  }

  public async fetchShiftConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('SHIFT', forceRefresh);
  }

  public async fetchPermitTypeConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('PERMIT_TYPE', forceRefresh);
  }

  public async fetchWorkerTypeConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('WORKER_TYPE', forceRefresh);
  }

  public async fetchDepartmentConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('DEPARTMENT', forceRefresh);
  }

  public async fetchPlantConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('PLANT', forceRefresh);
  }

  public async fetchIsolationTypeConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('ISOLATION_TYPE', forceRefresh);
  }

  public async fetchIsolatedStateConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('ISOLATED_STATE', forceRefresh);
  }

  public async fetchIsolMethodConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('ISOL_METHOD', forceRefresh);
  }

  public async fetchDeisolatedStateConfig(forceRefresh = false): Promise<SapConfigRecord[]> {
    return this.fetchConfigByType('DEISOLATED_STATE', forceRefresh);
  }

  /**
   * Fetches all PTW role definition records from the SAP Config entity set
   * Service endpoint: Config?$filter=startswith(Config_Type, 'PTW_') and Active eq 'X'
   * Returns records for PTW_ADMIN, PTW_APPROVAL_ROLE, PTW_AREA_OPP_ROLE, PTW_GASTESTER_ROLE, PTW_HOLDER_ROLE, PTW_ISSUER_ROLE, PTW_SAFETY_ROLE
   */
  public async fetchRoleConfigs(forceRefresh = false): Promise<SapConfigRecord[]> {
    const cacheKey = 'ALL_PTW_ROLES';
    if (!forceRefresh && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const roleTypes: ConfigType[] = [
      'PTW_ACCEPTOR_ROLE',
      'PTW_ADMIN',
      'PTW_APPROVAL_ROLE',
      'PTW_AREA_ROLE',
      'PTW_GASTESTER_ROLE',
      'PTW_HOLDER_ROLE',
      'PTW_ISOLATION_ROLE',
      'PTW_ISSUER_ROLE',
      'PTW_SAFETY_ROLE'
    ];

    try {
      // 1. Try querying Config with startswith filter
      const filter = encodeURIComponent(`startswith(Config_Type, 'PTW_') and Active eq 'X'`);
      const response = await odataClient.get<SapConfigResponse>(`Config?$filter=${filter}`, { timeout: 5000 });
      if (response.data?.value && response.data.value.length > 0) {
        this.cache.set(cacheKey, response.data.value);
        return response.data.value;
      }
    } catch {
      // fallback to multi-type fetch
    }

    try {
      // 2. Fetch all known role types in parallel
      const results = await Promise.all(
        roleTypes.map(t => this.fetchConfigByType(t, forceRefresh).catch(() => []))
      );
      const combined = results.flat();
      if (combined.length > 0) {
        this.cache.set(cacheKey, combined);
        return combined;
      }
    } catch {
      // fallback to local data
    }

    if (!import.meta.env.DEV) return [];
    // Development-only reference configuration
    const fallbackCombined = roleTypes.flatMap(t => FALLBACK_CONFIG_DATA[t] || []);
    this.cache.set(cacheKey, fallbackCombined);
    return fallbackCombined;
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const configApi = new ConfigApiService();
export default configApi;
