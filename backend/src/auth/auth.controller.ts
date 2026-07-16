import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
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
    // No maxAge / expires → session cookie. Browser deletes it on full close.
    // Combined with the frontend's `pagehide` beacon (single-tab close) and
    // the 20-min idle hook, this ensures a fresh Login audit row on every
    // real return-to-work, which the day-start logic depends on.
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
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
  // FRONTEND_URL may hold a comma-separated list (localhost + prod). Pick the
  // entry that matches the host that served THIS request, so the localhost
  // backend redirects to the localhost frontend and the deployed backend
  // redirects to the deployed frontend — regardless of NODE_ENV.
  private frontendUrl(req: Request): string {
    const urls = this.config
      .get<string>('FRONTEND_URL', 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const host = (req.get('host') || '').toLowerCase();
    const isLocal = host.includes('localhost') || host.startsWith('127.');
    return (
      (isLocal ? urls.find((u) => u.includes('localhost')) : urls.find((u) => !u.includes('localhost'))) ||
      urls[0]
    );
  }

  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const frontend = this.frontendUrl(req);
    try {
      const profile = req.user as { email: string; name: string; picture?: string };
      const { access_token } = await this.auth.loginWithGoogle(profile, getRequestContext(req));
      this.setAuthCookie(res, access_token);
      return res.redirect(`${frontend}/auth/callback?status=success`);
    } catch {
      // e.g. no active employee for this Google account — let the popup surface it.
      return res.redirect(`${frontend}/auth/callback?status=error`);
    }
  }

  @Public()
  @Post('google')
  async googleTokenLogin(
    @Body() body: { credential: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = await this.auth.verifyGoogleIdToken(body.credential);

    // Shared login (one Google account used by several people): don't issue a
    // session yet — hand back the list of identities so the frontend can force
    // a "who are you?" picker. No cookie, no Login row until they choose.
    const sharedIds = this.auth.sharedMemberIdsFor(profile.email);
    if (sharedIds) {
      const options = await this.auth.membersForSelection(sharedIds);
      if (options.length > 1) {
        const selectionToken = this.auth.signSelectionToken(
          profile.email,
          options.map((o) => o.id),
        );
        return { needsSelection: true, options, selectionToken };
      }
      // Only one active member is configured — no ambiguity, log straight in.
      if (options.length === 1) {
        const { access_token, user } = await this.auth.loginAsMember(options[0].id, getRequestContext(req));
        this.setAuthCookie(res, access_token);
        return { user };
      }
      // Zero active members → fall through to the normal (will 401) path.
    }

    const { access_token, user } = await this.auth.loginWithGoogle(profile, getRequestContext(req));
    this.setAuthCookie(res, access_token);
    return { user };
  }

  // Second step of a shared login: the user picked which identity they are.
  // The selectionToken proves the Google auth succeeded and pins the allowed
  // ids, so an arbitrary employeeId can't be smuggled in here.
  @Public()
  @Post('select-identity')
  async selectIdentity(
    @Body() body: { selectionToken: string; employeeId: number },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const claim = this.auth.verifySelectionToken(body.selectionToken);
    if (!claim || !claim.ids.includes(Number(body.employeeId))) {
      throw new UnauthorizedException('Invalid identity selection');
    }
    const { access_token, user } = await this.auth.loginAsMember(Number(body.employeeId), getRequestContext(req));
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

  // Fired by the frontend's `pagehide` beacon (navigator.sendBeacon) when the
  // browser/tab is actually closed or navigated away — records a Logout audit
  // row so a real browser close is captured at close time. Deliberately does
  // NOT clear the auth cookie: pagehide also fires on refresh, and a
  // Set-Cookie clear from the beacon response would wipe the session and bounce
  // the user to /login on the very next load. Refresh therefore produces an
  // extra Logout row, but every day-bounds query takes MAX(Logout) per day, so
  // the real close always supersedes it and the session-end time stays correct.
  @Post('logout-beacon')
  @Public()
  async logoutBeacon(@Req() req: Request) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const token = cookies?.[COOKIE_NAME];
    if (token) {
      const decoded = this.auth.decodeToken(token);
      if (decoded) {
        await this.auth.recordAudit(decoded.sub, decoded.email, 'Logout', getRequestContext(req));
      }
    }
    return { success: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    // Merge the live permission flags so the task form unlocks/locks the moment
    // an admin toggles them (no re-login needed).
    const perms = await this.auth.permissionsFor(user.id);
    return { ...user, ...perms };
  }
}







