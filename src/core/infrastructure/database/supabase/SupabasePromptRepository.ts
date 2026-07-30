import { IPromptRepository } from "../../../domain/repositories/IPromptRepository";
import { PromptTemplate, PromptTemplateVersion } from "../../../domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

export class SupabasePromptRepository implements IPromptRepository {
  async getPromptTemplates(companyId: string): Promise<PromptTemplate[]> {
    const { data, error } = await supabaseAdmin
      .from("prompt_templates")
      .select()
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (error) throw new Error(`getPromptTemplates failed: ${error.message}`);
    return (data as PromptTemplate[]) || [];
  }

  async getPromptTemplateById(id: string): Promise<PromptTemplate | null> {
    const { data, error } = await supabaseAdmin.from("prompt_templates").select().eq("id", id).maybeSingle();
    if (error) throw new Error(`getPromptTemplateById failed: ${error.message}`);
    return (data as PromptTemplate) || null;
  }

  async getPromptTemplateByModule(
    companyId: string,
    moduleName: PromptTemplate["module_name"]
  ): Promise<PromptTemplate | null> {
    const { data, error } = await supabaseAdmin
      .from("prompt_templates")
      .select()
      .eq("company_id", companyId)
      .eq("module_name", moduleName)
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") throw new Error(`getPromptTemplateByModule failed: ${error.message}`);
    return (data as PromptTemplate) || null;
  }

  /** Every save bumps `version` and writes the prior content to
   * prompt_template_versions first — that's what makes diff/rollback
   * (Phase 6) possible instead of just overwriting in place. */
  async upsertPromptTemplate(
    companyId: string,
    moduleName: PromptTemplate["module_name"],
    content: string,
    createdBy?: string
  ): Promise<PromptTemplate> {
    const existing = await this.getPromptTemplateByModule(companyId, moduleName);

    if (existing) {
      await supabaseAdmin.from("prompt_template_versions").insert({
        prompt_template_id: existing.id,
        version: existing.version,
        content: existing.template_content,
        created_by: createdBy,
      });

      const { data, error } = await supabaseAdmin
        .from("prompt_templates")
        .update({ template_content: content, version: existing.version + 1 })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw new Error(`upsertPromptTemplate failed: ${error.message}`);
      return data as PromptTemplate;
    }

    const { data, error } = await supabaseAdmin
      .from("prompt_templates")
      .insert({ company_id: companyId, module_name: moduleName, template_content: content, version: 1, is_active: true })
      .select()
      .single();

    if (error) throw new Error(`upsertPromptTemplate failed: ${error.message}`);
    return data as PromptTemplate;
  }

  async listVersions(promptTemplateId: string): Promise<PromptTemplateVersion[]> {
    const { data, error } = await supabaseAdmin
      .from("prompt_template_versions")
      .select()
      .eq("prompt_template_id", promptTemplateId)
      .order("version", { ascending: false });

    if (error) throw new Error(`listVersions failed: ${error.message}`);
    return (data as PromptTemplateVersion[]) || [];
  }

  async rollbackToVersion(promptTemplateId: string, version: number, createdBy?: string): Promise<PromptTemplate> {
    const { data: versionRow, error: versionError } = await supabaseAdmin
      .from("prompt_template_versions")
      .select()
      .eq("prompt_template_id", promptTemplateId)
      .eq("version", version)
      .single();

    if (versionError || !versionRow) throw new Error(`rollbackToVersion failed: version ${version} not found`);

    const current = await this.getPromptTemplateById(promptTemplateId);
    if (!current) throw new Error("rollbackToVersion failed: template not found");

    return this.upsertPromptTemplate(current.company_id, current.module_name, versionRow.content, createdBy);
  }
}
