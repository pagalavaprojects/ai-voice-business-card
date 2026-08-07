import { ISettingsRepository } from "@/core/domain/repositories/ISettingsRepository";
import { ApiKeyRecord, Branding, Settings } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { randomBytes, createHash } from "crypto";

export class SupabaseSettingsRepository implements ISettingsRepository {
  async getBranding(companyId: string): Promise<Branding | null> {
    const { data, error } = await supabaseAdmin.from("branding").select().eq("company_id", companyId).maybeSingle();
    if (error) throw new Error(`SupabaseSettingsRepository.getBranding failed: ${error.message}`);
    return (data as Branding) || null;
  }

  async upsertBranding(
    companyId: string,
    data: Partial<Pick<Branding, "logo_storage_path" | "primary_color" | "secondary_color" | "font_family">>
  ): Promise<Branding> {
    const { data: row, error } = await supabaseAdmin
      .from("branding")
      .upsert({ company_id: companyId, ...data }, { onConflict: "company_id" })
      .select()
      .single();

    if (error) throw new Error(`SupabaseSettingsRepository.upsertBranding failed: ${error.message}`);
    return row as Branding;
  }

  async getSettings(companyId: string): Promise<Settings | null> {
    const { data, error } = await supabaseAdmin.from("settings").select().eq("company_id", companyId).maybeSingle();
    if (error) throw new Error(`SupabaseSettingsRepository.getSettings failed: ${error.message}`);
    return (data as Settings) || null;
  }

  async upsertSettings(
    companyId: string,
    data: Partial<Pick<Settings, "business_info" | "calendar_settings" | "email_settings" | "voice_settings" | "language_settings">>
  ): Promise<Settings> {
    const existing = await this.getSettings(companyId);
    const merged = {
      business_info: { ...(existing?.business_info || {}), ...(data.business_info || {}) },
      calendar_settings: { ...(existing?.calendar_settings || {}), ...(data.calendar_settings || {}) },
      email_settings: { ...(existing?.email_settings || {}), ...(data.email_settings || {}) },
      voice_settings: { ...(existing?.voice_settings || {}), ...(data.voice_settings || {}) },
      language_settings: { ...(existing?.language_settings || {}), ...(data.language_settings || {}) },
    };

    const { data: row, error } = await supabaseAdmin
      .from("settings")
      .upsert({ company_id: companyId, ...merged }, { onConflict: "company_id" })
      .select()
      .single();

    if (error) throw new Error(`SupabaseSettingsRepository.upsertSettings failed: ${error.message}`);
    return row as Settings;
  }

  async listApiKeys(companyId: string): Promise<ApiKeyRecord[]> {
    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .select("id, company_id, name, key_prefix, scopes, created_by, last_used_at, revoked_at, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`SupabaseSettingsRepository.listApiKeys failed: ${error.message}`);
    return (data as ApiKeyRecord[]) || [];
  }

  /** Generates a real random API key, returns the raw value exactly once,
   * and stores only its SHA-256 hash — the raw key can never be recovered
   * from the database afterward, standard practice for API key issuance. */
  async createApiKey(companyId: string, name: string, scopes: string[], createdBy?: string): Promise<{ record: ApiKeyRecord; rawKey: string }> {
    const secret = randomBytes(24).toString("base64url");
    const rawKey = `sk_live_${secret}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 16);

    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .insert({ company_id: companyId, name, key_prefix: keyPrefix, key_hash: keyHash, scopes, created_by: createdBy })
      .select("id, company_id, name, key_prefix, scopes, created_by, last_used_at, revoked_at, created_at")
      .single();

    if (error) throw new Error(`SupabaseSettingsRepository.createApiKey failed: ${error.message}`);
    return { record: data as ApiKeyRecord, rawKey };
  }

  async revokeApiKey(companyId: string, keyId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("company_id", companyId);

    if (error) throw new Error(`SupabaseSettingsRepository.revokeApiKey failed: ${error.message}`);
    return true;
  }
}
