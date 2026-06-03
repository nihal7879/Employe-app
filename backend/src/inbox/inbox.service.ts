import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { Knex } from 'knex';
import * as crypto from 'crypto';
import { KNEX_CONNECTION } from '../database/knex.module';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export interface InboxMessage {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: string;
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly config: ConfigService,
  ) {}

  // ---- Token encryption at rest (AES-256-GCM) -------------------------------
  // Stored tokens are encrypted with a key derived from TOKEN_ENC_KEY (falls
  // back to JWT_SECRET). decrypt() transparently passes through any legacy
  // plaintext value (no "enc:" prefix), so old rows keep working until re-saved.
  private encKey(): Buffer {
    const secret = this.config.get<string>('TOKEN_ENC_KEY') || this.config.get<string>('JWT_SECRET', 'change-me');
    return crypto.createHash('sha256').update(secret).digest();
  }
  private encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return 'enc:' + Buffer.concat([iv, tag, enc]).toString('base64');
  }
  private decrypt(stored?: string | null): string {
    if (!stored) return '';
    if (!stored.startsWith('enc:')) return stored; // legacy plaintext
    try {
      const raw = Buffer.from(stored.slice(4), 'base64');
      const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), data = raw.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch (e) {
      this.logger.error(`token decrypt failed: ${(e as Error).message}`);
      return '';
    }
  }

  private oauthClient(): OAuth2Client {
    return new OAuth2Client(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('INBOX_GOOGLE_CALLBACK_URL', 'http://localhost:4000/inbox/google/callback'),
    );
  }

  // Consent URL with offline access so we receive a refresh token. `state`
  // carries the signed employee id so the public callback can attribute it.
  authUrl(state: string): string {
    return this.oauthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [GMAIL_SCOPE],
      state,
    });
  }

  async connect(employeeId: number, code: string): Promise<void> {
    const client = this.oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('No refresh token returned — revoke prior access and retry with prompt=consent.');
    }
    client.setCredentials(tokens);
    // Identify which Gmail account was connected.
    const profile = await this.gmailFetch<{ emailAddress: string }>(tokens.access_token!, 'profile');
    const row = {
      employee_id: employeeId,
      email: profile.emailAddress,
      refresh_token: this.encrypt(tokens.refresh_token),
      access_token: tokens.access_token ? this.encrypt(tokens.access_token) : null,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      updated_at: this.db.fn.now(),
    };
    const existing = await this.db('gmail_connections').where({ employee_id: employeeId }).first('id');
    if (existing) await this.db('gmail_connections').where({ id: existing.id }).update(row);
    else await this.db('gmail_connections').insert(row);
  }

  async status(employeeId: number): Promise<{ connected: boolean; email?: string }> {
    const row = await this.db('gmail_connections').where({ employee_id: employeeId }).first('email');
    return row ? { connected: true, email: row.email } : { connected: false };
  }

  async disconnect(employeeId: number): Promise<void> {
    await this.db('gmail_connections').where({ employee_id: employeeId }).del();
  }

  // Mint a fresh access token from the stored refresh token (auto-refreshes).
  private async accessTokenFor(employeeId: number): Promise<string | null> {
    const row = await this.db('gmail_connections').where({ employee_id: employeeId }).first('refresh_token');
    if (!row) return null;
    const refresh = this.decrypt(row.refresh_token);
    if (!refresh) return null;
    const client = this.oauthClient();
    client.setCredentials({ refresh_token: refresh });
    const { token } = await client.getAccessToken();
    return token || null;
  }

  private async gmailFetch<T>(accessToken: string, path: string): Promise<T> {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Gmail API ${path} failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  // One page of messages for the given Gmail query. `q` empty = all mail (no
  // date limit); pass `pageToken` (from a prior call) to fetch the next page.
  // Nothing is fetched unless this is called — the UI only calls it on demand.
  async messages(employeeId: number, opts: { limit?: number; q?: string; pageToken?: string } = {}):
    Promise<{ messages: InboxMessage[]; nextPageToken: string | null }> {
    const token = await this.accessTokenFor(employeeId);
    if (!token) return { messages: [], nextPageToken: null };
    const limit = opts.limit || 25;
    const q = (opts.q || '').trim();
    let url = `messages?maxResults=${limit}&q=${encodeURIComponent(q)}`;
    if (opts.pageToken) url += `&pageToken=${encodeURIComponent(opts.pageToken)}`;
    const list = await this.gmailFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(token, url);
    const ids = (list.messages || []).map((m) => m.id);
    const messages = await this.fetchMetadatas(token, ids);
    return { messages, nextPageToken: list.nextPageToken || null };
  }

  // Convert a raw Gmail metadata message into our InboxMessage shape.
  private toInboxMessage(id: string, msg: any): InboxMessage {
    const headers: { name: string; value: string }[] = msg?.payload?.headers || [];
    const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value || '';
    const fromRaw = h('From');
    const m = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
    return {
      id,
      from: (m ? m[1].replace(/(^"|"$)/g, '') : fromRaw).trim() || fromRaw,
      fromEmail: m ? m[2] : fromRaw,
      subject: h('Subject') || '(no subject)',
      snippet: this.decodeSnippet(msg?.snippet || ''),
      date: h('Date'),
    };
  }

  // Fetch metadata for many messages in ONE Gmail batch request (instead of one
  // HTTP call per message). Falls back to parallel single fetches if batching
  // fails for any reason.
  private async fetchMetadatas(token: string, ids: string[]): Promise<InboxMessage[]> {
    if (!ids.length) return [];
    const sub = 'format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';
    try {
      const boundary = 'batch_inbox';
      const body = ids.map((id) =>
        `--${boundary}\r\nContent-Type: application/http\r\n\r\nGET /gmail/v1/users/me/messages/${id}?${sub}\r\n`,
      ).join('') + `--${boundary}--`;
      const res = await fetch('https://www.googleapis.com/batch/gmail/v1', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/mixed; boundary=${boundary}` },
        body,
      });
      if (!res.ok) throw new Error(`batch ${res.status}`);
      const text = await res.text();
      // Each part contains an HTTP response then a JSON body; pull each JSON blob.
      const byId = new Map<string, any>();
      for (const seg of text.split(/--batch[^\r\n]*/)) {
        const start = seg.indexOf('{');
        const end = seg.lastIndexOf('}');
        if (start === -1 || end <= start) continue;
        try { const json = JSON.parse(seg.slice(start, end + 1)); if (json.id) byId.set(json.id, json); } catch { /* skip */ }
      }
      if (byId.size) return ids.map((id) => byId.has(id) ? this.toInboxMessage(id, byId.get(id)) : null)
        .filter((r): r is InboxMessage => r !== null);
      throw new Error('batch parse empty');
    } catch (e) {
      this.logger.warn(`batch metadata failed, falling back: ${(e as Error).message}`);
      const results = await Promise.all(ids.map(async (id) => {
        try { return this.toInboxMessage(id, await this.gmailFetch<any>(token, `messages/${id}?${sub}`)); }
        catch { return null; }
      }));
      return results.filter((r): r is InboxMessage => r !== null);
    }
  }

  // Full message (incl. plain-text body) for the reading pane / DWR description.
  async message(employeeId: number, id: string): Promise<(InboxMessage & { body: string }) | null> {
    const token = await this.accessTokenFor(employeeId);
    if (!token) return null;
    const msg = await this.gmailFetch<any>(token, `messages/${id}?format=full`);
    const headers: { name: string; value: string }[] = msg.payload?.headers || [];
    const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value || '';
    const fromRaw = h('From');
    const m = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
    return {
      id,
      from: (m ? m[1].replace(/(^"|"$)/g, '') : fromRaw).trim() || fromRaw,
      fromEmail: m ? m[2] : fromRaw,
      subject: h('Subject') || '(no subject)',
      snippet: this.decodeSnippet(msg.snippet || ''),
      date: h('Date'),
      body: this.extractBody(msg.payload) || this.decodeSnippet(msg.snippet || ''),
    };
  }

  // Walk the MIME tree for a readable body — prefer text/plain, fall back to a
  // tag-stripped text/html. Gmail bodies are base64url-encoded.
  private extractBody(payload: any): string {
    if (!payload) return '';
    const decode = (data?: string) => {
      if (!data) return '';
      try { return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
      catch { return ''; }
    };
    const stripHtml = (html: string) => html
      .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>(?=)/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n').trim();

    const find = (node: any, mime: string): string => {
      if (!node) return '';
      if (node.mimeType === mime && node.body?.data) return decode(node.body.data);
      for (const part of node.parts || []) {
        const r = find(part, mime);
        if (r) return r;
      }
      return '';
    };
    const plain = find(payload, 'text/plain');
    if (plain) return plain.replace(/\n{3,}/g, '\n\n').trim();
    const html = find(payload, 'text/html');
    if (html) return stripHtml(html);
    return decode(payload.body?.data);
  }

  private decodeSnippet(s: string): string {
    return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
}
