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
  | 'Client Summary'
  | 'Task Assignment'
  | 'Task Comment'
  | 'Task Status'
  | 'Task Reminder';

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

  async send(opts: {
    to: string;
    subject: string;
    html: string;
    type: EmailType;
    // When set, the email is sent at most once per key. The Pending row is
    // claimed atomically via a UNIQUE index, so concurrent/duplicate job runs
    // (in-process @Cron + Vercel HTTP cron + retries) can't double-send.
    dedupeKey?: string;
  }) {
    const logId = await this.logPending(opts);
    if (logId == null) {
      // Another invocation already claimed this key — skip silently.
      this.logger.debug(`Skipped duplicate email → ${opts.to} [${opts.type}] (${opts.dedupeKey})`);
      return;
    }
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

  private async logPending(opts: {
    to: string;
    subject: string;
    type: EmailType;
    dedupeKey?: string;
  }): Promise<number | null> {
    try {
      const [id] = await this.db('email_logs').insert({
        email_to: opts.to,
        subject: opts.subject,
        email_type: opts.type,
        status: 'Pending',
        dedupe_key: opts.dedupeKey ?? null,
      });
      return id;
    } catch (err: any) {
      // Duplicate dedupe_key → another invocation already claimed this send.
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) return null;
      throw err;
    }
  }

  private markSent(id: number) {
    return this.db('email_logs').where({ id }).update({ status: 'Sent', sent_at: this.db.fn.now() });
  }

  private markFailed(id: number, error: string) {
    return this.db('email_logs').where({ id }).update({ status: 'Failed', error_message: error });
  }
}
