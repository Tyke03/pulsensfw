import type { AgeChallenge, AgeVerificationProof, AgeVerificationProvider, AgeVerificationResult } from './provider';

/**
 * Third-party age verification adapter (round 2D).
 *
 * The gate stays on this site. Any document, selfie, or card flow the vendor
 * requires happens on the vendor's own page — this adapter only passes the
 * vendor's short-lived token to their API with the server key. This site
 * never stores government IDs, selfies, or card numbers.
 *
 * Enabled only when BOTH env vars are set:
 *   AGE_VENDOR_API_URL — vendor verification endpoint (e.g. https://vendor.example/v1/verify)
 *   AGE_VENDOR_API_KEY — server bearer key from the vendor
 * When either is missing, lib/age/stub-provider.ts keeps the stub so local
 * `npm run dev` works unchanged.
 */
export type VendorAgeOptions = {
  apiUrl: string;
  apiKey: string;
  /** Vendor request timeout in ms. */
  timeoutMs?: number;
};

export type VendorAgeResponse = {
  ok?: boolean;
  verified?: boolean;
  result?: string;
  reason?: string;
  verification_id?: string;
};

export function createVendorAgeProvider(options: VendorAgeOptions): AgeVerificationProvider {
  const { apiUrl, apiKey, timeoutMs = 10_000 } = options;
  return {
    id: 'vendor.v1',
    createChallenge(): AgeChallenge {
      return {
        providerId: 'vendor.v1',
        title: 'Age verification',
        disclosure:
          'Verified by a third-party age service. Their checks happen on their site; we only receive a pass/fail answer and never see documents, selfies, or card numbers.',
        fields: [
          {
            name: 'token',
            label: 'I have completed the check with the age-verification service.',
            type: 'acknowledgement',
          },
        ],
      };
    },
    async verify(proof: AgeVerificationProof): Promise<AgeVerificationResult> {
      const token = proof.vendorPayload.token;
      if (!token || typeof token !== 'string') {
        return { ok: false, reason: 'missing-token' };
      }
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ token, purpose: 'age-verification' }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          const reason = response.status >= 500 ? 'vendor-unavailable' : 'vendor-rejected';
          return { ok: false, reason };
        }
        const data = (await response.json()) as VendorAgeResponse;
        const ok = data.ok === true || data.verified === true || data.result === 'verified' || data.result === 'presented_adult_content_allowed';
        if (!ok) {
          return { ok: false, reason: data.reason ?? 'not-verified' };
        }
        return {
          ok: true,
          providerId: 'vendor.v1',
          verifiedAt: new Date().toISOString(),
          // verification_id stays in vendor scope; we keep no record of it.
        };
      } catch (error) {
        return { ok: false, reason: (error as Error).name === 'TimeoutError' ? 'vendor-timeout' : 'vendor-unavailable' };
      }
    },
  };
}
