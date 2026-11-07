/**
 * R2 media sink (round 2E) — extends the existing image upload/metadata seam.
 *
 * Storage model: a Cloudflare R2 bucket bound to the Worker (`MEDIA_R2` in
 * wrangler config; names documented in .env.example). The seam only stores
 * metadata-charged image records; binding access appears when the owner adds
 * it. Every stored image records:
 *   { source_url, source_access_date, credit, license, explicit, record2257? }
 * Dev fallback continues to serve the local plate/cover generator when the
 * binding is absent — clearly labeled, never faked as a real upload.
 */
import type { RawImage } from '../content/types';

export type MediaUploadInput = {
  bytes: ArrayBuffer;
  contentType: string;
  /** Stable key inside the bucket, e.g. entities/2026/11/slug-cover. */
  key: string;
  source_url: string;
  source_access_date: string;
  credit: string | null;
  license: RawImage['license'];
  explicit: boolean;
  /** 2257 record id when the image depicts a real person. */
  record2257?: string;
};

export type MediaUploadResult = {
  deployed: boolean;
  key: string;
    /** RawImage record for persistence (no URL until the binding exists). */
    record: RawImage;
};

type R2Binding = {
  put(key: string, value: ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};

function explicitProvenance(input: MediaUploadInput): string | null {
  if (!input.explicit) return null;
  // Explicit media must trace to its 2257 record or it is rejected outright —
  // the delivery gate refuses explicit material without provenance.
  return input.record2257 ?? null;
}

export async function putMedia(input: MediaUploadInput, binding: R2Binding | null): Promise<MediaUploadResult> {
  const evidence = explicitProvenance(input);
  if (input.explicit && !evidence) {
    throw new Error('media-rejected: explicit upload requires a 2257 record reference');
  }
  const record: RawImage = {
    alt: '',
    credit: input.credit ?? undefined,
    sourceUrl: input.source_url,
    license: input.license,
    explicit: input.explicit,
    record2257: input.record2257,
  };
  if (!binding) {
    // Keep the object intact in dev: metadata recorded, upload obviously not
    // deployed (the label the UI shows is "not configured", never success).
    return { deployed: false, key: input.key, record };
  }
  await binding.put(input.key, input.bytes, { httpMetadata: { contentType: input.contentType } });
  return { deployed: true, key: input.key, record };
}

/** Reads the MEDIA_R2 binding from the platform env, when the owner sets it. */
export function mediaBinding(env: Record<string, unknown> = (globalThis as { __pfBindings?: Record<string, unknown> }).__pfBindings ?? {}): R2Binding | null {
  const candidate = env.MEDIA_R2;
  if (candidate && typeof candidate === 'object' && 'put' in (candidate as object)) {
    return candidate as R2Binding;
  }
  return null;
}
