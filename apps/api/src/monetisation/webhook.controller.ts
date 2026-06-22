import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  /**
   * Razorpay payment webhook. @Public (NO auth) — the tenant is resolved from the
   * Host and the request is authenticated by the HMAC signature, not a token.
   *
   * Reads `req.rawBody` (enabled app-wide via NestFactory `rawBody: true`): the
   * signature is computed over the EXACT bytes Razorpay sent, so the JSON-parsed
   * body cannot be used for verification. The service verifies the signature
   * before touching the payload.
   */
  @Public() @HttpCode(200) @Post('razorpay')
  razorpay(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    return this.webhooks.handle(req.rawBody, signature, eventId);
  }
}
