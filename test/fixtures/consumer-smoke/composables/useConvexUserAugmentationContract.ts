/**
 * Contract: the `ConvexUser` augmentation declared in
 * `types/convex-user.d.ts` must reach `useConvexAuth().user`. The assignment to
 * a `'yes' | undefined` slot type-asserts the augmented field is visible;
 * deleting the augmentation file makes `user.value?.auditProbeField` an unknown
 * property and fails `check:consumer-smoke`.
 */
export function useConvexUserAugmentationContract(): 'yes' | undefined {
  const { user } = useConvexAuth()
  const probe: 'yes' | undefined = user.value?.auditProbeField
  return probe
}
