import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { FeatureFlags } from './site-config.schema';
import { FeatureGuard } from './feature.guard';
import type { SiteConfigService } from './site-config.service';

function makeContext(): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('FeatureGuard', () => {
  function buildGuard(required: keyof FeatureFlags | undefined, features: Partial<FeatureFlags>) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) };
    const siteConfig = {
      getFeatures: jest.fn().mockResolvedValue(features),
    } as unknown as SiteConfigService;
    return {
      guard: new FeatureGuard(reflector as unknown as Reflector, siteConfig),
      siteConfig,
    };
  }

  it('allows a handler with no @RequireFeature (without reading config)', async () => {
    const { guard, siteConfig } = buildGuard(undefined, {});
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(siteConfig.getFeatures).not.toHaveBeenCalled();
  });

  it('allows when the required feature is enabled for the tenant', async () => {
    const { guard } = buildGuard('comments', { comments: true });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('forbids when the required feature is off', async () => {
    const { guard } = buildGuard('comments', { comments: false });
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids when the flag is absent entirely', async () => {
    const { guard } = buildGuard('epaper', {});
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
