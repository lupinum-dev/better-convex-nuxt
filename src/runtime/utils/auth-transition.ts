type TransitionTrackedApp = object & {
  _convexAuthTransitionId?: number
}

export function getAuthTransitionId(app: object): number {
  return (app as TransitionTrackedApp)._convexAuthTransitionId ?? 0
}

export function bumpAuthTransitionId(app: object): number {
  const trackedApp = app as TransitionTrackedApp
  trackedApp._convexAuthTransitionId = getAuthTransitionId(trackedApp) + 1
  return trackedApp._convexAuthTransitionId
}
