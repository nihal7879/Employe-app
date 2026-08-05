import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';
import type { RequestContext } from '../common/utils/request-context';
import { APP_CONFIG } from '../config/app-config';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(this.config.get<string>('GOOGLE_CLIENT_ID'));
  }

  async verifyGoogleIdToken(credential: string) {
    const ticket = await this.googleClient.verifyIdToken({
      idToken: credential,
      audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new UnauthorizedException('Invalid Google token');
    return { email: payload.email, name: payload.name || payload.email, picture: payload.picture };
  }

  // Load one active, non-deleted employee (with its role name) by an arbitrary
  // WHERE clause. Shared by email-based login and id-based identity selection.
  private async findActiveEmployee(where: Record<string, unknown>) {
    return this.db('employees')
      .leftJoin('roles', 'employees.role_id', 'roles.id')
      .where(where)
      .andWhere('employees.is_deleted', false)
      .andWhere('employees.is_active', true)
      .select(
        'employees.id',
        'employees.name',
        'employees.email',
        'employees.role_id',
        'roles.role_name as role',
        'employees.allow_backdated_tasks',
        'employees.allow_log_anytime',
      )
      .first();
  }

  // Sign the JWT + record the Login audit row for a resolved employee, and
  // return the session payload. Used by both the normal email login and the
  // shared-login identity picker so they behave identically.
  private async issueSessionFor(
    employee: {
      id: number; name: string; email: string; role: string;
      allow_backdated_tasks: unknown; allow_log_anytime: unknown;
    },
    ctx?: RequestContext,
  ) {
    const token = this.jwt.sign(
      { sub: employee.id, email: employee.email, role: employee.role, name: employee.name },
      {
        secret: this.config.get<string>('JWT_SECRET', 'change-me'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN', APP_CONFIG.jwtExpiresIn),
      },
    );

    await this.recordAudit(employee.id, employee.email, 'Login', ctx);

    return {
      access_token: token,
      user: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        allow_backdated_tasks: !!employee.allow_backdated_tasks,
        allow_log_anytime: !!employee.allow_log_anytime,
      },
    };
  }

  async loginWithGoogle(profile: { email: string; name: string; picture?: string }, ctx?: RequestContext) {
    if (!profile?.email) throw new UnauthorizedException('Google profile missing email');

    const employee = await this.findActiveEmployee({ 'employees.email': profile.email });
    if (!employee) {
      throw new UnauthorizedException('No active employee account for this email');
    }
    return this.issueSessionFor(employee, ctx);
  }

  // -------------------------------------------------------------------------
  // Shared logins (one Google account → several employee identities)
  // -------------------------------------------------------------------------

  // The employee IDs configured to share a given Google login email, or null
  // when the email isn't a shared login. Case-insensitive on the email.
  sharedMemberIdsFor(email: string): number[] | null {
    const map = APP_CONFIG.sharedLogins;
    const key = Object.keys(map).find((k) => k.toLowerCase() === (email || '').toLowerCase());
    const ids = key ? map[key] : null;
    return Array.isArray(ids) && ids.length > 0 ? ids.map(Number) : null;
  }

  // Active members of a shared login, as the picker options (id + name + email).
  async membersForSelection(ids: number[]) {
    return this.db('employees')
      .whereIn('id', ids)
      .andWhere('is_deleted', false)
      .andWhere('is_active', true)
      .select('id', 'name', 'email');
  }

  // Short-lived proof that the Google auth for `loginEmail` succeeded and that
  // these `ids` are the allowed picks — so the follow-up identity selection
  // can't be forged with an arbitrary employee id.
  signSelectionToken(loginEmail: string, ids: number[]): string {
    return this.jwt.sign(
      { purpose: 'identity-selection', login_email: loginEmail, ids },
      { secret: this.config.get<string>('JWT_SECRET', 'change-me'), expiresIn: '5m' },
    );
  }

  verifySelectionToken(token: string): { login_email: string; ids: number[] } | null {
    try {
      const claim = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_SECRET', 'change-me'),
      }) as { purpose?: string; login_email?: string; ids?: number[] };
      if (claim.purpose !== 'identity-selection' || !Array.isArray(claim.ids)) return null;
      return { login_email: claim.login_email || '', ids: claim.ids.map(Number) };
    } catch {
      return null;
    }
  }

  // Issue a session for a specific employee id (the chosen shared-login identity).
  async loginAsMember(id: number, ctx?: RequestContext) {
    const employee = await this.findActiveEmployee({ 'employees.id': id });
    if (!employee) throw new UnauthorizedException('No active employee account');
    return this.issueSessionFor(employee, ctx);
  }

  // Current task-logging permission flags for an employee, read fresh from the
  // DB so an admin's toggle takes effect without the user re-logging in.
  async permissionsFor(id: number) {
    const row = await this.db('employees')
      .where({ id })
      .first('allow_backdated_tasks', 'allow_log_anytime');
    return {
      allow_backdated_tasks: !!row?.allow_backdated_tasks,
      allow_log_anytime: !!row?.allow_log_anytime,
    };
  }

  async recordAudit(
    employee_id: number | null,
    employee_email: string | null,
    event_type: 'Login' | 'Logout',
    ctx?: RequestContext,
  ) {
    try {
      await this.db('audit_logs').insert({
        employee_id,
        employee_email,
        event_type,
        ip: ctx?.ip || null,
        gps: ctx?.gps || null,
        device: ctx?.device || null,
        browser: ctx?.browser || null,
        user_agent: ctx?.user_agent || null,
      });
    } catch {
      // Audit failures must never break login/logout
    }
  }

  decodeToken(token: string): { sub: number; email: string } | null {
    try {
      return this.jwt.verify(token, { secret: this.config.get<string>('JWT_SECRET', 'change-me') });
    } catch {
      return null;
    }
  }
}




































































































