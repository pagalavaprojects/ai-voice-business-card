import { supabaseAdmin } from "@/shared/lib/supabase";

/** Thin wrapper over Supabase Storage, shared by every module that stores
 * a file: knowledge documents here, and company logos / CSV exports /
 * voice call recordings in Phase 9. One bucket per concern keeps RLS and
 * lifecycle rules simple. */
export type StorageBucket = "knowledge-documents" | "company-logos" | "exports" | "voice-assets" | "product-images";

export class SupabaseStorageAdapter {
  async ensureBucket(bucket: StorageBucket, isPublic: boolean): Promise<void> {
    const { data: existing } = await supabaseAdmin.storage.getBucket(bucket);
    if (existing) return;
    const { error } = await supabaseAdmin.storage.createBucket(bucket, { public: isPublic });
    if (error && !error.message.includes("already exists")) {
      throw new Error(`SupabaseStorageAdapter.ensureBucket(${bucket}) failed: ${error.message}`);
    }
  }

  async upload(bucket: StorageBucket, path: string, data: Buffer, contentType: string): Promise<string> {
    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, data, { contentType, upsert: true });
    if (error) throw new Error(`SupabaseStorageAdapter.upload failed: ${error.message}`);
    return path;
  }

  async remove(bucket: StorageBucket, path: string): Promise<void> {
    const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);
    if (error) throw new Error(`SupabaseStorageAdapter.remove failed: ${error.message}`);
  }

  async getSignedUrl(bucket: StorageBucket, path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw new Error(`SupabaseStorageAdapter.getSignedUrl failed: ${error?.message}`);
    return data.signedUrl;
  }

  getPublicUrl(bucket: StorageBucket, path: string): string {
    return supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
}
