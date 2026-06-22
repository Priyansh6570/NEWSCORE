import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * Mark a route as optionally authenticated: JwtAuthGuard attaches the user when a
 * valid token is present, but serves the request anonymously (never 401) when the
 * token is absent, stale, or invalid. For reads that behave differently for a
 * logged-in user but must still work for the public (e.g. the paywall).
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
