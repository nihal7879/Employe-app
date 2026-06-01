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

  async loginWithGoogle(profile: { email: string; name: string; picture?: string }, ctx?: RequestContext) {
    if (!profile?.email) throw new UnauthorizedException('Google profile missing email');

    const employee = await this.db('employees')
      .leftJoin('roles', 'employees.role_id', 'roles.id')
      .where('employees.email', profile.email)
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

    if (!employee) {
      throw new UnauthorizedException('No active employee account for this email');
    }

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
