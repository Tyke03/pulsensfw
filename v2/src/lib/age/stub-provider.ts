import type { AgeVerificationProvider, AgeVerificationProof } from './provider';
import { createVendorAgeProvider } from './vendor-provider';

export function createStubAgeProvider(): AgeVerificationProvider {
  return {
    id: 'stub.v1',
    createChallenge() {
      return {
        providerId: 'stub.v1',
        title: 'Age check',
        disclosure:
          'Phase 1 stub. This does not check an ID. A later release hands this step to a third-party ID or transactional-data verifier. No documents, selfies, or payment numbers are collected here.',
        fields: [
          {
            name: 'over18',
            label: 'I confirm I am 18 or older.',
            type: 'acknowledgement',
          },
        ],
      };
    },
    async verify(proof: AgeVerificationProof) {
      if (proof.providerId !== 'stub.v1') {
        return { ok: false, reason: 'unknown-provider' };
      }
      if (proof.vendorPayload.over18 !== 'yes') {
        return { ok: false, reason: 'not-confirmed' };
      }
      return { ok: true, providerId: 'stub.v1', verifiedAt: new Date().toISOString() };
    },
  };
}

/**
 * Provider selection: a real third-party verifier when both vendor env vars
 * are set, the built-in stub otherwise. Local dev keeps working with no env.
 * The interface in ./provider.ts does not change either way.
 */
export function getAgeVerificationProvider(): AgeVerificationProvider {
  const apiUrl = import.meta.env.AGE_VENDOR_API_URL;
  const apiKey = import.meta.env.AGE_VENDOR_API_KEY;
  if (typeof apiUrl === 'string' && apiUrl.length > 0 && typeof apiKey === 'string' && apiKey.length > 0) {
    return createVendorAgeProvider({ apiUrl, apiKey });
  }
  return createStubAgeProvider();
}
