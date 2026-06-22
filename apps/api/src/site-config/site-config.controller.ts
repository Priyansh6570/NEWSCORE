import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../rbac/permissions.guard';
import { SiteConfigService } from './site-config.service';
import { SetRazorpayKeysDto, SetSmsConfigDto, UpdateSiteConfigDto } from './dto/site-config.dto';

@Controller('site-config')
export class SiteConfigController {
  constructor(private readonly siteConfig: SiteConfigService) {}

  // ── Public read: the white-label config the website renders. NEVER secrets. ──
  @Public() @Get()
  publicConfig() {
    return this.siteConfig.getPublicView();
  }

  // ── Admin: editable config + integration STATUS (configured/keyId), no secrets ──
  @RequirePermissions('settings:edit') @Get('admin')
  adminConfig() {
    return this.siteConfig.getAdminView();
  }

  @RequirePermissions('settings:edit') @Patch()
  update(@Body() dto: UpdateSiteConfigDto) {
    return this.siteConfig.updateConfig(dto);
  }

  // ── Set/rotate Razorpay keys; secrets are encrypted, only status returned ──
  @RequirePermissions('settings:edit') @Put('integrations/razorpay')
  setRazorpay(@Body() dto: SetRazorpayKeysDto) {
    return this.siteConfig.setRazorpayKeys(dto);
  }

  // ── Set/rotate MSG91 SMS config; authKey encrypted, only status returned ──
  @RequirePermissions('settings:edit') @Put('integrations/sms')
  setSms(@Body() dto: SetSmsConfigDto) {
    return this.siteConfig.setSmsConfig(dto);
  }
}
