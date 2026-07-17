export const SECURITY_MUTANT_SURVIVED = 'SECURITY_MUTANT_SURVIVED'

/** The identical deny contract is run against production and its one reviewed mutant. */
export async function requireAttackDenied(unsafeAccepted: () => boolean | Promise<boolean>) {
  if (await unsafeAccepted()) throw new Error(SECURITY_MUTANT_SURVIVED)
}
