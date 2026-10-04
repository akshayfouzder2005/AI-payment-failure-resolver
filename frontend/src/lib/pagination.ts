/** Page sizes the Payments table offers; GET /payments caps `limit` at 200. */
export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];
