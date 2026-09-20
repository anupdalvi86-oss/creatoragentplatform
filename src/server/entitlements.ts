import type { Env } from './db';

export interface EntitlementProvider {
  name: string;
  listActive(creatorId: string, userId: string): Promise<string[]>;
}
export class InternalEntitlementProvider implements EntitlementProvider {
  name = 'internal';
  constructor(private readonly env: Env) {}
  async listActive(creatorId: string, userId: string): Promise<string[]> {
    const rows = await this.env.DB.prepare('SELECT entitlement_code FROM user_entitlements WHERE creator_id=? AND user_id=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)').bind(creatorId, userId).all<{ entitlement_code: string }>();
    return rows.results.map((row) => row.entitlement_code);
  }
}
export interface ExternalEntitlementGrant { creatorId: string; userId: string; code: string; provider: 'stripe' | 'revenuecat'; externalReference: string; expiresAt?: string; verifiedAt: string }
