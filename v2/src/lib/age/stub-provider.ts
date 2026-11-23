import type { AgeVerificationProvider, AgeVerificationProof } from './provider';
import { createVendorAgeProvider } from './vendor-provider';
import { runtimeEnv } from '../env';

export function createStubAgeProvider(): AgeVerificationProvider {
  return {
    id: 'stub.v1',
    createChallenge() {
      return {
        providerId: 'stub.v1',
        title: 'Age check',
        disclosure:
          'This does not check an ID — no documents, selfies, or payment numbers are collected. Your preference stays in a browser cookie.',
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
  const apiUrl = runtimeEnv('AGE_VENDOR_API_URL');
  const apiKey = runtimeEnv('AGE_VENDOR_API_KEY');
  if (typeof apiUrl === 'string' && apiUrl.length > 0 && typeof apiKey === 'string' && apiKey.length > 0) {
    return createVendorAgeProvider({ apiUrl, apiKey });
  }
  return createStubAgeProvider();
}
