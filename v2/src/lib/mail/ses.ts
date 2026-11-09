/**
 * Amazon SES mail helper (round 2D) — plain text only.
 *
 * One client for newsletter confirmations/welcomes and the contact form.
 * No AWS SDK: minimal SigV4 over fetch, so the Worker bundle stays small.
 * Plain-text SendEmail bodies only — this desk never sends HTML marketing.
 *
 * Env (all empty when unset — see `.env.example`):
 *   MAIL_REGION             default us-east-1
 *   MAIL_ACCESS_KEY_ID      server-only IAM key
 *   MAIL_SECRET_ACCESS_KEY  server-only secret
 *   MAIL_FROM               e.g. "PulseNSFW" <news@pulsensfw.com>
 *   MAIL_REPLY_TO           optional reply-to (list inbox)
 *   NEWS_TO                 optional destination checked for contact mail
 */
const encoder = new TextEncoder();

async function subtle(): Promise<SubtleLike> {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.subtle) return globalCrypto.subtle as unknown as SubtleLike;
  const { webcrypto } = await import('node:crypto');
  return webcrypto.subtle as unknown as SubtleLike;
}

/** Structural subset of SubtleCrypto we use, typed without node/DOM unions. */
type SubtleLike = {
  importKey(format: string, key: unknown, algorithm: unknown, extractable: boolean, usages: string[]): Promise<unknown>;
  sign(algorithm: string, key: unknown, data: unknown): Promise<unknown>;
  digest(algorithm: string, data: unknown): Promise<unknown>;
};

export type MailConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  from: string;
  replyTo: string | null;
  contactInbox: string | null;
};

export function mailConfig(env: { [key: string]: string | undefined } = importMetaEnvSafe()): MailConfig | null {
  const region = (env.MAIL_REGION || 'us-east-1').trim();
  const accessKeyId = (env.MAIL_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.MAIL_SECRET_ACCESS_KEY || '').trim();
  const from = (env.MAIL_FROM || '').trim();
  if (!region || !accessKeyId || !secretAccessKey || !from) return null;
  return {
    region,
    accessKeyId,
    secretAccessKey,
    from,
    replyTo: (env.MAIL_REPLY_TO || '').trim() || null,
    contactInbox: (env.NEWS_TO || '').trim() || null,
  };
}

function importMetaEnvSafe(): { [key: string]: string | undefined } {
  const maybe = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return maybe ?? {};
}

/* ---------------- SigV4 (Web Crypto, no SDK) ---------------- */

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const sc = await subtle();
  const cryptoKey = await sc.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = (await sc.sign('HMAC', cryptoKey, encoder.encode(data))) as ArrayBuffer;
  return new Uint8Array(signed);
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const sc = await subtle();
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const digest = (await sc.digest('SHA-256', bytes)) as ArrayBuffer;
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function amzStamp(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/** RFC3986-encode for canonical query strings. */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export type SigV4Input = {
  method: string;
  host: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string; // payload bytes to sign (we sign bodies; no unsigned payloads)
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  stamp?: Date;
};

/** Returns the Authorization header value. Exposed for tests. */
export async function sigv4Authorization(input: SigV4Input): Promise<{ authorization: string; amzDate: string; contentSha: string }> {
  const stamp = amzStamp(input.stamp ?? new Date());
  const payloadSha = await sha256Hex(input.body);
  const headers = { ...input.headers };
  const lower: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) lower[name.toLowerCase()] = value.trim();
  lower['x-amz-date'] = stamp.amzDate;
  // Host header is part of every canonical request.
  if (!lower['host']) lower.host = input.host;

  const sortedNames = Object.keys(lower).sort();
  const canonicalHeaders = sortedNames.map((name) => `${name}:${lower[name]}\n`).join('');
  const signedHeaders = sortedNames.join(';');
  const canonicalQuery = Object.keys(input.query)
    .sort()
    .map((name) => `${uriEncode(name)}=${uriEncode(input.query[name] ?? '')}`)
    .join('&');
  const canonicalUri = input.path.split('/').map((segment) => uriEncode(segment)).join('/');

  const canonical = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadSha,
  ].join('\n');

  const scope = `${stamp.dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    stamp.amzDate,
    scope,
    await sha256Hex(canonical),
  ].join('\n');

  let key = await hmac(encoder.encode(`AWS4${input.secretAccessKey}`), stamp.dateStamp);
  key = await hmac(key, input.region);
  key = await hmac(key, input.service);
  key = await hmac(key, 'aws4_request');
  const signature = [...await hmac(key, stringToSign)].map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    amzDate: stamp.amzDate,
    contentSha: payloadSha,
  };
}

/* ---------------- Send ---------------- */

export type PlainMail = {
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string | null;
  contactInbox?: string | null;
};

export type MailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: 'not-configured' | 'send-error'; detail?: string };

/**
 * SES v2 SendEmail, simple (plain text) body only.
 * Configuration/compliance (bounce handling, list ops) stays with the
 * owner's SES setup — this only sends the message.
 */
export async function sendPlainEmail(config: MailConfig, mail: PlainMail): Promise<MailResult> {
  const to = Array.isArray(mail.to) ? mail.to.filter(Boolean) : [mail.to];
  if (to.length === 0) return { sent: false, reason: 'send-error', detail: 'no-recipient' };
  const cc = mail.contactInbox ? [mail.contactInbox] : [];
  const payload = {
    FromEmailAddress: config.from,
    Destination: { ToAddresses: to, ...(cc.length > 0 ? { CcAddresses: cc } : {}) },
    ...(mail.replyTo ? { ReplyToAddresses: [mail.replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: mail.subject, Charset: 'UTF-8' },
        Body: { Text: { Data: mail.text, Charset: 'UTF-8' } },
      },
    },
  };
  const body = JSON.stringify(payload);
  const endpoint = `https://email.${config.region}.amazonaws.com/v2/email/outbound-emails`;
  const url = new URL(endpoint);
  const stamp = new Date();
  const { authorization, amzDate } = await sigv4Authorization({
    method: 'POST',
    host: url.host,
    path: '/v2/email/outbound-emails',
    query: {},
    headers: { 'content-type': 'application/json' },
    body,
    region: config.region,
    service: 'ses',
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    stamp,
  });
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
        'x-amz-date': amzDate,
      },
      body,
    });
    if (!response.ok) {
      const detail = `${response.status} ${await response.text()}`;
      return { sent: false, reason: 'send-error', detail };
    }
    const data = (await response.json()) as { MessageId?: string };
    return { sent: true, messageId: String(data.MessageId ?? '') };
  } catch (error) {
    return { sent: false, reason: 'send-error', detail: (error as Error).message };
  }
}
