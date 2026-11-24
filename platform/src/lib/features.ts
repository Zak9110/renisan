/**
 * Phase 2-3 (Helpers, Orders, Community) stays off until the founder signs off Phase 1 and a
 * safeguarding partner is in place. NEXT_PUBLIC_ values are fixed at build time: redeploy to change.
 */
export const phase2Enabled = process.env.NEXT_PUBLIC_PHASE2_ENABLED === "true";
