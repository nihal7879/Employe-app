import { Controller, Get, Delete, Module, Param, Query, Res } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { InboxService } from './inbox.service';

@ApiExcludeController()
@Controller('inbox')
class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Whether this employee has linked their Gmail.
  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.inbox.status(user.id);
  }

  // Returns the Google consent URL. `state` is a short-lived signed token so the
  // public callback can identify the employee without a session.
  @Get('connect')
  connect(@CurrentUser() user: AuthUser) {
    const state = this.jwt.sign(
      { sub: user.id, purpose: 'gmail-connect' },
      { secret: this.config.get<string>('JWT_SECRET', 'change-me'), expiresIn: '10m' },
    );
    return { url: this.inbox.authUrl(state) };
  }

  // OAuth redirect target — public, validated via the signed `state`.
  @Public()
  @Get('google/callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173').split(',')[0];
    try {
      const payload = this.jwt.verify<{ sub: number; purpose: string }>(state, {
        secret: this.config.get<string>('JWT_SECRET', 'change-me'),
      });
      if (payload.purpose !== 'gmail-connect') throw new Error('bad state');
      await this.inbox.connect(payload.sub, code);
      return res.redirect(`${frontend}/?gmail=connected`);
    } catch (e) {
      return res.redirect(`${frontend}/?gmail=error`);
    }
  }

  @Get('messages')
  messages(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('pageToken') pageToken?: string) {
    return this.inbox.messages(user.id, { limit: 20, q, pageToken });
  }

  // Full single message (with body) for the reading pane.
  @Get('messages/:id')
  message(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inbox.message(user.id, id);
  }

  @Delete('disconnect')
  disconnect(@CurrentUser() user: AuthUser) {
    return this.inbox.disconnect(user.id).then(() => ({ success: true }));
  }
}

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-me'),
      }),
    }),
  ],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
