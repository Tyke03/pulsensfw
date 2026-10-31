import type { AgeVerificationProvider, AgeVerificationProof } from './provider';

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

export function getAgeVerificationProvider(): AgeVerificationProvider {
  return createStubAgeProvider();
}
