/** Functional permissions come exclusively from active SAP UserRole records. */
export function activePtwRoles(records: Array<{ SAP_USER: string; PTW_ROLE: string; ACTIVE: unknown }>, userId: string): string[] {
  return [...new Set(records.filter(r =>
    r.SAP_USER?.trim().toUpperCase() === userId.trim().toUpperCase() && r.ACTIVE === 'X'
  ).map(r => r.PTW_ROLE?.trim().toUpperCase()).filter(r => /^(Z)?PTW_/.test(r || '')))];
}

export function normalizePtwRoles(roles: string[]): string[] {
  const result = new Set<string>();
  const groups = [
    ['PTW_ACCP', 'PTW_ACCEPTOR'],
    ['PTW_AREA_OPP', 'PTW_AOPR', 'PTW_AREA_OWNER'],
    ['PTW_ISO_REQ', 'PTW_ISOLATOR', 'PTW_ISOLATION_REQUESTOR'],
    ['PTW_GAS', 'PTW_GAS_TESTER'], ['PTW_HOLD', 'PTW_HOLDER'],
    ['PTW_ISSU', 'PTW_ISSUER'], ['PTW_SAFE', 'PTW_SAFETY_OFFICER'],
  ];
  for (const role of roles) {
    const clean = role.trim().toUpperCase();
    if (!/^(Z)?PTW_/.test(clean)) continue;
    const bare = clean.startsWith('Z') ? clean.slice(1) : clean;
    for (const alias of groups.find(g => g.includes(bare)) || [bare]) {
      result.add(alias);
      result.add(`Z${alias}`);
    }
  }
  // Approval tiers are deliberately not expanded into other tiers.
  return [...result];
}
