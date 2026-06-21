/**
 * The active tenant for the current request, stored in AsyncLocalStorage (CLS)
 * so services can read it without it being threaded through every call.
 */
export interface TenantContext {
  id: string;
  slug: string;
  dbName: string;
  domains: string[]; // the tenant's known hosts; domains[0] is the canonical origin host
}

/** CLS key under which the active tenant is stored. */
export const TENANT_CLS_KEY = 'tenant';
