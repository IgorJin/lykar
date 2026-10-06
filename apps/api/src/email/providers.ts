export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailProvider = {
  id: string;
  send(message: EmailMessage, deliveryId: string): Promise<{ providerMessageId: string }>;
};

export type ProviderOutcome = 'rejected' | 'unknown';

const SAFE_CODES = new Set([
  'invalid_configuration', 'invalid_delivery_id', 'network_error', 'timeout',
  'malformed_response', 'unexpected_status', 'provider_failure',
]);

/** Safe to persist or log: never retains an upstream body, request, or cause. */
export class ProviderSendError extends Error {
  readonly outcome: ProviderOutcome;
  readonly safeCode: string;
  readonly retryAfterSeconds?: number;

  constructor(outcome: ProviderOutcome, safeCode: string, retryAfterSeconds?: number) {
    const code = SAFE_CODES.has(safeCode) || /^http_[45]\d{2}$/.test(safeCode)
      ? safeCode : 'provider_failure';
    super(`Email provider send ${outcome}: ${code}`);
    this.name = 'ProviderSendError';
    this.outcome = outcome;
    this.safeCode = code;
    if (retryAfterSeconds !== undefined && Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds >= 0) {
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
}

type ProviderOptions = { id: string; apiKey: string; from: string; fetcher?: typeof fetch };
const SEND_TIMEOUT_MS = 10_000;

function validateOptions(options: ProviderOptions): void {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(options.id)
    || !options.apiKey.trim() || /[\r\n]/.test(options.apiKey)
    || !options.from.trim() || /[\r\n]/.test(options.from)) {
    throw new ProviderSendError('rejected', 'invalid_configuration');
  }
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (value === null) return undefined;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  // Date.parse also accepts unrelated numeric strings; only accept HTTP-date syntax.
  if (!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return undefined;
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function assertAccepted(response: Response): void {
  if (response.status >= 400 && response.status < 500 && response.status !== 408) {
    throw new ProviderSendError('rejected', `http_${response.status}`, retryAfter(response));
  }
  if (!response.ok) {
    throw new ProviderSendError('unknown', response.status >= 400 && response.status <= 599
      ? `http_${response.status}` : 'unexpected_status', retryAfter(response));
  }
}

function messageId(value: unknown, pattern: RegExp, options: ProviderOptions): string {
  if (typeof value !== 'string' || !pattern.test(value) || value === options.apiKey) {
    throw new ProviderSendError('unknown', 'malformed_response');
  }
  return value;
}

async function sendRequest(
  options: ProviderOptions,
  endpoint: string,
  payload: object,
  headers: Record<string, string>,
  readId: (response: Response) => Promise<string>,
): Promise<{ providerMessageId: string }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      // Abort the transport as well as bounding fetchers/body readers that ignore abort.
      reject(new ProviderSendError('unknown', 'timeout'));
      controller.abort();
    }, SEND_TIMEOUT_MS);
  });
  try {
    const request = async () => {
      const response = await (options.fetcher ?? fetch)(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: 'error',
      });
      assertAccepted(response);
      return { providerMessageId: await readId(response) };
    };
    return await Promise.race([request(), timedOut]);
  } catch (error) {
    if (error instanceof ProviderSendError) throw error;
    // Upstream exception messages can include recipient addresses, URLs, and keys.
    throw new ProviderSendError('unknown', 'network_error');
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** https://resend.com/docs/api-reference/emails/send-email */
export function createResendProvider(options: ProviderOptions): EmailProvider {
  validateOptions(options);
  return {
    id: options.id,
    async send(message, deliveryId) {
      if (!/^[A-Za-z0-9_/-]{1,256}$/.test(deliveryId)) {
        throw new ProviderSendError('rejected', 'invalid_delivery_id');
      }
      return sendRequest(options, 'https://api.resend.com/emails', {
        from: options.from, to: [message.to], subject: message.subject, text: message.text, html: message.html,
      }, { 'Idempotency-Key': deliveryId }, async response => {
        let body: unknown;
        try { body = await response.json(); }
        catch { throw new ProviderSendError('unknown', 'malformed_response'); }
        const id = body !== null && typeof body === 'object' && 'id' in body ? body.id : undefined;
        return messageId(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, options);
      });
    },
  };
}

/** https://developers.mailersend.com/api/v1/email */
export function createMailerSendProvider(options: ProviderOptions): EmailProvider {
  validateOptions(options);
  return {
    id: options.id,
    async send(message, _deliveryId) {
      return sendRequest(options, 'https://api.mailersend.com/v1/email', {
        from: { email: options.from }, to: [{ email: message.to }],
        subject: message.subject, text: message.text, html: message.html,
        settings: { track_clicks: false, track_opens: false, track_content: false },
      }, {}, async response => messageId(response.headers.get('x-message-id'), /^[0-9a-f]{24,64}$/i, options));
    },
  };
}
