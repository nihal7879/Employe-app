import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Knex } from 'knex';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { KNEX_CONNECTION } from '../../database/knex.module';
import { COOKIE_NAME } from '../auth.controller';
import { jwtSecret } from '../../common/utils/jwt-secret';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  name: string;
}

const cookieExtractor = (req: Request): string | null => {
  const cookies = (req as any)?.cookies;
  return cookies?.[COOKIE_NAME] || null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(config),
    });
  }

  // Runs on every authenticated request. Role, name and active status come
  // from the database, not the token, so deactivating or demoting someone
  // takes effect immediately instead of when their 7-day token expires.
  async validate(payload: JwtPayload & { purpose?: string }) {
    // Short-lived tokens signed for other purposes (identity picker, Gmail
    // connect state) must never work as a login session.
    if (!payload?.sub || payload.purpose) throw new UnauthorizedException();
    const employee = await this.db('employees')
      .leftJoin('roles', 'employees.role_id', 'roles.id')
      .where('employees.id', payload.sub)
      .andWhere('employees.is_deleted', false)
      .andWhere('employees.is_active', true)
      .first('employees.id', 'employees.email', 'employees.name', 'roles.role_name as role');
    if (!employee) throw new UnauthorizedException('Account is inactive or no longer exists');
    return { id: employee.id, email: employee.email, role: employee.role, name: employee.name };
  }
}
