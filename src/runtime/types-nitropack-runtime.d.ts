declare module 'nitropack/runtime' {
  export interface NitroStorage {
    getItem<T>(key: string): Promise<T | null>
    setItem<T>(key: string, value: T, opts?: { ttl?: number }): Promise<void>
    removeItem(key: string): Promise<void>
  }

  export function useStorage(base?: string): NitroStorage
}
