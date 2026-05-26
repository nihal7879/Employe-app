import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { CookieOptions, Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { getRequestContext } from '../common/utils/request-context';
import { AuthService } from './auth.service';

export const COOKIE_NAME = 'em_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions(): CookieOptions {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    };
  }

  private setAuthCookie(res: Response, token: string) {
    res.cookie(COOKIE_NAME, token, this.cookieOptions());
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // passport redirects to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as { email: string; name: string; picture?: string };
    const { access_token } = await this.auth.loginWithGoogle(profile, getRequestContext(req));
    this.setAuthCookie(res, access_token);
    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
    return res.redirect(`${frontend}/auth/callback`);
  }

  @Public()
  @Post('google')
  async googleTokenLogin(
    @Body() body: { credential: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = await this.auth.verifyGoogleIdToken(body.credential);
    const { access_token, user } = await this.auth.loginWithGoogle(profile, getRequestContext(req));
    this.setAuthCookie(res, access_token);
    return { user };
  }

  @Post('logout')
  @Public()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const token = cookies?.[COOKIE_NAME];
    if (token) {
      const decoded = this.auth.decodeToken(token);
      if (decoded) {
        await this.auth.recordAudit(decoded.sub, decoded.email, 'Logout', getRequestContext(req));
      }
    }
    res.clearCookie(COOKIE_NAME, { ...this.cookieOptions(), maxAge: 0 });
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
