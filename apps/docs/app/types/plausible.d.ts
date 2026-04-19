/**
 * Plausible Analytics type declarations
 */
interface PlausibleFunction {
  (eventName: string, options?: { props?: Record<string, string | number | boolean> }): void
  q?: IArguments[]
  o?: Record<string, unknown>
  init?: (options?: Record<string, unknown>) => void
}

declare global {
  interface Window {
    plausible: PlausibleFunction
  }
}

export {}
