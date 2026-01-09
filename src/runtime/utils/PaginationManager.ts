/**
 * Pure logic for pagination state management.
 * Extracted from useConvexPaginatedQuery for testability and separation of concerns.
 *
 * This class handles:
 * - Page result storage and retrieval
 * - Results merging across pages
 * - Cursor chaining for "load more"
 * - Done state detection
 */

/**
 * Result from a paginated Convex query
 */
export interface PageResult<T> {
  page: T[]
  continueCursor: string | null
  isDone: boolean
}

/**
 * Pagination status
 */
export type PaginationStatus =
  | 'LoadingFirstPage'
  | 'LoadingMore'
  | 'CanLoadMore'
  | 'Exhausted'

/**
 * Internal page state for tracking additional pages (beyond first page)
 */
export interface PageState<T> {
  index: number
  cursor: string | null
  result: PageResult<T> | undefined
  pending: boolean
  error: Error | null
}

/**
 * Manages pagination state and provides pure logic for:
 * - Merging results from multiple pages
 * - Cursor chaining for continuation
 * - Status derivation
 *
 * @example
 * ```ts
 * const manager = new PaginationManager<Message>()
 *
 * // Set pages as they load
 * manager.setPage(0, { page: [...], continueCursor: 'abc', isDone: false })
 * manager.setPage(1, { page: [...], continueCursor: 'def', isDone: true })
 *
 * // Get merged results
 * const allItems = manager.getAllResults(firstPageData)
 *
 * // Get next cursor for loadMore
 * const cursor = manager.getNextCursor(firstPageData)
 * ```
 */
export class PaginationManager<T> {
  private pages: Map<number, PageState<T>> = new Map()

  /**
   * Set or update a page's state
   */
  setPage(index: number, state: Partial<PageState<T>> & { cursor: string | null }): void {
    const existing = this.pages.get(index)
    this.pages.set(index, {
      index,
      cursor: state.cursor,
      result: state.result ?? existing?.result,
      pending: state.pending ?? existing?.pending ?? false,
      error: state.error ?? existing?.error ?? null,
    })
  }

  /**
   * Get a page's current state
   */
  getPage(index: number): PageState<T> | undefined {
    return this.pages.get(index)
  }

  /**
   * Get the last page's state
   */
  getLastPage(): PageState<T> | undefined {
    if (this.pages.size === 0) return undefined
    const maxIndex = Math.max(...this.pages.keys())
    return this.pages.get(maxIndex)
  }

  /**
   * Get all page states sorted by index
   */
  getAllPages(): PageState<T>[] {
    return [...this.pages.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([_, page]) => page)
  }

  /**
   * Get the number of additional pages
   */
  get pageCount(): number {
    return this.pages.size
  }

  /**
   * Clear all pages
   */
  clear(): void {
    this.pages.clear()
  }

  /**
   * Get merged results from first page and all additional pages
   *
   * @param firstPage - The first page data (from useAsyncData or real-time subscription)
   * @returns All items concatenated in order
   */
  getAllResults(firstPage?: PageResult<T>): T[] {
    const items: T[] = []

    // First page items
    if (firstPage) {
      items.push(...firstPage.page)
    }

    // Additional pages in order
    for (const page of this.getAllPages()) {
      if (page.result) {
        items.push(...page.result.page)
      }
    }

    return items
  }

  /**
   * Get the cursor for the next page to load
   *
   * @param firstPage - The first page data
   * @returns The continuation cursor, or null if exhausted
   */
  getNextCursor(firstPage?: PageResult<T>): string | null {
    const lastPage = this.getLastPage()

    // If we have additional pages, use the last one's cursor
    if (lastPage?.result) {
      return lastPage.result.continueCursor
    }

    // Otherwise use first page's cursor
    return firstPage?.continueCursor ?? null
  }

  /**
   * Check if all data has been loaded
   *
   * @param firstPage - The first page data
   * @returns True if isDone on the last loaded page
   */
  isExhausted(firstPage?: PageResult<T>): boolean {
    const lastPage = this.getLastPage()

    // If we have additional pages, check the last one
    if (lastPage?.result) {
      return lastPage.result.isDone
    }

    // Otherwise check first page
    return firstPage?.isDone ?? false
  }

  /**
   * Check if any page is currently loading
   */
  isLoading(): boolean {
    for (const page of this.pages.values()) {
      if (page.pending) return true
    }
    return false
  }

  /**
   * Get the first error from any page
   */
  getFirstError(): Error | null {
    for (const page of this.getAllPages()) {
      if (page.error) return page.error
    }
    return null
  }

  /**
   * Derive pagination status from current state
   *
   * @param firstPage - The first page data
   * @param firstPageLoading - Whether the first page is still loading
   * @param isSkipped - Whether the query is skipped
   * @returns The current pagination status
   */
  deriveStatus(
    firstPage: PageResult<T> | undefined,
    firstPageLoading: boolean,
    isSkipped: boolean,
  ): PaginationStatus {
    if (isSkipped) return 'Exhausted'

    // First page still loading
    if (firstPageLoading && !firstPage) return 'LoadingFirstPage'
    if (!firstPage) return 'LoadingFirstPage'

    // Check additional pages
    const lastPage = this.getLastPage()
    if (lastPage) {
      if (lastPage.pending) return 'LoadingMore'
      if (lastPage.result?.isDone) return 'Exhausted'
    }

    // Only first page loaded
    if (firstPage.isDone) return 'Exhausted'

    return 'CanLoadMore'
  }
}
