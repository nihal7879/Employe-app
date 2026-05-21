import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Knex } from 'knex';
import * as nodemailer from 'nodemailer';
import { KNEX_CONNECTION } from '../database/knex.module';

export type EmailType =
  | 'Reminder'
  | 'Daily Summary'
  | 'Weekly Summary'
  | 'Monthly Summary'
  | 'Client Summary';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: Number(this.config.get<number>('SMTP_PORT', 587)),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASSWORD'),
      },
    });
    this.from = this.config.get<string>('MAIL_FROM', 'no-reply@example.com');
  }

  async send(opts: { to: string; subject: string; html: string; type: EmailType }) {
    const logId = await this.logPending(opts);
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });
      await this.markSent(logId);
      this.logger.log(`Email sent → ${opts.to} [${opts.type}]`);
    } catch (err: any) {
      await this.markFailed(logId, err?.message || String(err));
      this.logger.error(`Email failed → ${opts.to}: ${err?.message}`);
    }
  }

  private async logPending(opts: { to: string; subject: string; type: EmailType }) {
    const [id] = await this.db('email_logs').insert({
      email_to: opts.to,
      subject: opts.subject,
      email_type: opts.type,
      status: 'Pending',
    });
    return id;
  }

  private markSent(id: number) {
    return this.db('email_logs').where({ id }).update({ status: 'Sent', sent_at: this.db.fn.now() });
  }

  private markFailed(id: number, error: string) {
    return this.db('email_logs').where({ id }).update({ status: 'Failed', error_message: error });
  }
}
