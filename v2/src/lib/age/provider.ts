/**
 * Age verification seam.
 * Phase 1 ships a stub. A later phase swaps in a third-party ID or
 * transactional-data verifier without rewriting the gate UI.
 * The stub must not collect government IDs, selfies, or card numbers.
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
