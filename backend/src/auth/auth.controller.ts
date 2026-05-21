import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Passport redirects to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as { email: string; name: string; picture?: string };
    const { access_token, user } = await this.auth.loginWithGoogle(profile);
    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
    return res.redirect(
      `${frontend}/auth/callback?token=${encodeURIComponent(access_token)}&email=${encodeURIComponent(user.email)}`,
    );
  }

  @Public()
  @Post('google')
  async googleTokenLogin(@Body() body: { credential: string }) {
    const profile = await this.auth.verifyGoogleIdToken(body.credential);
    return this.auth.loginWithGoogle(profile);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
