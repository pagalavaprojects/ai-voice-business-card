import { ApiKeyRecord, Branding, Settings } from "../models/types";

export interface ISettingsRepository {
  getBranding(companyId: string): Promise<Branding | null>;
  upsertBranding(companyId: string, data: Partial<Pick<Branding, "logo_storage_path" | "primary_color" | "secondary_color" | "font_family">>): Promise<Branding>;

  getSettings(companyId: string): Promise<Settings | null>;
  upsertSettings(
    companyId: string,
    data: Partial<Pick<Settings, "business_info" | "calendar_settings" | "email_settings" | "voice_settings" | "language_settings">>
  ): Promise<Settings>;

  listApiKeys(companyId: string): Promise<ApiKeyRecord[]>;
  createApiKey(companyId: string, name: string, scopes: string[], createdBy?: string): Promise<{ record: ApiKeyRecord; rawKey: string }>;
  revokeApiKey(companyId: string, keyId: string): Promise<boolean>;
}
