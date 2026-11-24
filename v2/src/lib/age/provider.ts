/**
 * Age verification seam.
 * Phase 1 shipped a stub; round 2D adds the real third-party adapter behind
 * env flags (see ./vendor-provider.ts). Swapping verifiers does not rewrite
 * the gate UI. Neither path collects government IDs, selfies, or card
 * numbers on this site.
 */
export type AgeChallengeField = {
  name: string;
  label: string;
  type: 'acknowledgement';
};

export type AgeChallenge = {
  providerId: string;
  title: string;
  disclosure: string;
  fields: AgeChallengeField[];
};

export type AgeVerificationProof = {
  providerId: string;
  /** Vendor payload. The stub only accepts an acknowledgement flag. */
  vendorPayload: Record<string, string>;
};

export type AgeVerificationResult =
  | { ok: true; providerId: string; verifiedAt: string }
  | { ok: false; reason: string };

export interface AgeVerificationProvider {
  readonly id: string;
  createChallenge(): AgeChallenge;
  verify(proof: AgeVerificationProof): Promise<AgeVerificationResult>;
}
