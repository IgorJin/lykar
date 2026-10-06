export type EmailKind = 'login' | 'invitation';
export type EmailBudget = {
  key: string;
  limit: number;
  since: Date;
  expiresAt: Date;
  cooldownMs?: number;
  slidingWindowMs?: number;
};
export type EmailReservation = { allowed: boolean; retryAt: Date };
export type EmailDeliveryRecord = {
  id: string;
  kind: EmailKind;
  providerId: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'unknown';
  providerMessageId: string | null;
  safeCode: string | null;
};
export type DeliveryReservation = { state: 'reserved' } | { state: 'limited'; retryAt: Date }
  | { state: 'existing'; delivery: EmailDeliveryRecord };
export interface EmailStore {
  reserve(budgets: EmailBudget[], now: Date): Promise<EmailReservation>;
  beginDelivery(input: { id: string; kind: EmailKind; providerId: string | null; budgets: EmailBudget[]; now: Date }): Promise<DeliveryReservation>;
  finishDelivery(id: string, status: 'accepted' | 'rejected' | 'unknown', providerMessageId: string | null, safeCode: string | null): Promise<void>;
}
