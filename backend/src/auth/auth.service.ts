import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.module';

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

  async loginWithGoogle(profile: { email: string; name: string; picture?: string }) {
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
      )
      .first();

    if (!employee) {
      throw new UnauthorizedException('No active employee account for this email');
    }

    const token = this.jwt.sign(
      { sub: employee.id, email: employee.email, role: employee.role, name: employee.name },
      {
        secret: this.config.get<string>('JWT_SECRET', 'change-me'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '7d'),
      },
    );

    return {
      access_token: token,
      user: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
      },
    };
  }
}
