import type {
  TrellisDenialDecision,
  TrellisDenialExplanation,
  TrellisObservationReasonCode,
  TrellisSuggestedAction,
} from './types.js'

export function createDenialExplanation(input: {
  reasonCode: TrellisObservationReasonCode
  decision: TrellisDenialDecision
  message: string
  policy?: string
  tenantId?: string
  suggestedAction?: TrellisSuggestedAction
}): TrellisDenialExplanation {
  return input
}
