export const billingPlans = {
  team: {
    priceId: 'price_local_team',
    limits: {
      projects: 10,
    },
  },
} as const

export function stripeSubscriptionPlans() {
  return Object.entries(billingPlans).map(([name, plan]) => ({
    name,
    priceId: plan.priceId,
    limits: plan.limits,
  }))
}

export function projectLimitForPlan(plan: string | undefined) {
  if (!plan) return null

  const billingPlan = billingPlans[plan as keyof typeof billingPlans]
  return billingPlan?.limits.projects ?? null
}
