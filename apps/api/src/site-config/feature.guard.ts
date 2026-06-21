import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FeatureFlags } from './site-config.schema';
import { SiteConfigService } from './site-config.service';

export const FEATURE_KEY = 'required_feature';

/**
 * Gate a handler behind a tenant feature flag. The flag's state lives in the
 * tenant's SiteConfig (cached). Apply with `@UseGuards(FeatureGuard)`.
 */
export const RequireFeature = (feature: keyof FeatureFlags) =>
  SetMetadata(FEATURE_KEY, feature);

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly siteConfig: SiteConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<keyof FeatureFlags>(FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const features = await this.siteConfig.getFeatures();
    if (!features[required]) {
      throw new ForbiddenException(`Feature '${required}' is not enabled for this tenant`);
    }
    return true;
  }
}
