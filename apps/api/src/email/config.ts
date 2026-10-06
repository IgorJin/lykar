import { createResendProvider, createMailerSendProvider } from './providers';
import { validateEmailProviders, type BudgetedEmailProvider } from './delivery';
import { DEFAULT_EMAIL_LIMITS, type EmailLimitOptions } from './policy';

export function emailRuntimeFromEnvironment(env: NodeJS.ProcessEnv, fetcher?: typeof fetch): {
  mode: 'disabled' | 'file' | 'providers'; providers: BudgetedEmailProvider[];
  limitSecret: string; limits: EmailLimitOptions;
} {
  const mode = env.LYKAR_EMAIL_MODE ?? (env.LYKAR_MAGIC_LINK_FILE ? 'file' : 'disabled');
  if (!['disabled', 'file', 'providers'].includes(mode)) throw new Error('Invalid LYKAR_EMAIL_MODE');
  const positive = (name: string, fallback: number) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
    return value;
  };
  const limits = {
    maxRequests: positive('LYKAR_EMAIL_REQUEST_MAX', DEFAULT_EMAIL_LIMITS.maxRequests),
    windowMs: positive('LYKAR_EMAIL_REQUEST_WINDOW_SECONDS', 3600) * 1000,
    cooldownMs: positive('LYKAR_EMAIL_REQUEST_COOLDOWN_SECONDS', 60) * 1000,
    actorMax: positive('LYKAR_EMAIL_ACTOR_MAX', DEFAULT_EMAIL_LIMITS.actorMax),
  };
  if (limits.cooldownMs > limits.windowMs || !Number.isSafeInteger(limits.windowMs) || !Number.isSafeInteger(limits.cooldownMs)) {
    throw new Error('Invalid email request window');
  }
  const limitSecret = env.LYKAR_EMAIL_LIMIT_SECRET ?? (env.NODE_ENV !== 'production' ? 'lykar-local-email-limit-secret-for-development' : '');
  if (limitSecret.length < 32) throw new Error('LYKAR_EMAIL_LIMIT_SECRET must contain at least 32 characters');
  if (env.NODE_ENV === 'production' && mode !== 'providers') throw new Error('Production requires email provider mode');
  if (mode !== 'providers') {
    if (env.LYKAR_EMAIL_PROVIDERS) throw new Error('LYKAR_EMAIL_PROVIDERS requires provider mode');
    if (mode === 'file' && !env.LYKAR_MAGIC_LINK_FILE) throw new Error('Email file mode requires LYKAR_MAGIC_LINK_FILE');
    return { mode: mode as 'disabled' | 'file', providers: [], limitSecret, limits };
  }
  if (env.LYKAR_MAGIC_LINK_FILE) throw new Error('Email providers cannot be combined with a test file sender');
  let providers: BudgetedEmailProvider[];
  try {
    const raw: unknown = JSON.parse(env.LYKAR_EMAIL_PROVIDERS ?? 'null');
    if (!Array.isArray(raw) || !raw.length || raw.length > 5) throw new Error();
    providers = raw.map(value => {
      if (!value || typeof value !== 'object' || !['resend', 'mailersend'].includes(value.type)
        || typeof value.apiKeyEnv !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(value.apiKeyEnv)
        || !env[value.apiKeyEnv]?.trim()) throw new Error();
      const input = { id: value.id, apiKey: env[value.apiKeyEnv]!, from: value.from, fetcher };
      return { provider: value.type === 'resend' ? createResendProvider(input) : createMailerSendProvider(input),
        dailyLimit: value.dailyLimit, periodLimit: value.periodLimit, period: value.period,
        reservedDaily: value.reservedDaily, reservedPeriod: value.reservedPeriod };
    });
    validateEmailProviders(providers);
  } catch { throw new Error('Invalid LYKAR_EMAIL_PROVIDERS or missing provider credentials'); }
  return { mode: 'providers', providers, limitSecret, limits };
}
