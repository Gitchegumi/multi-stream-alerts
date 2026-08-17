export const legalEffectiveDate = 'August 16, 2026';

export function legalOperatorName(): string {
  return process.env.LEGAL_OPERATOR_NAME?.trim() || 'the operator of this GitchAlerts instance';
}

export function legalContactEmail(): string | null {
  return process.env.LEGAL_CONTACT_EMAIL?.trim() || null;
}
