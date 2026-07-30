import { IPromptRepository } from "../../../domain/repositories/IPromptRepository";
import { PromptTemplate } from "../../../domain/models/types";
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

  async upsertPromptTemplate(
    companyId: string,
    moduleName: PromptTemplate["module_name"],
    content: string
  ): Promise<PromptTemplate> {
    const { data, error } = await supabaseAdmin
      .from("prompt_templates")
      .upsert(
        {
          company_id: companyId,
          module_name: moduleName,
          template_content: content,
          is_active: true,
        },
        { onConflict: "company_id,module_name" }
      )
      .select()
      .single();

    if (error) throw new Error(`upsertPromptTemplate failed: ${error.message}`);
    return data as PromptTemplate;
  }
}
