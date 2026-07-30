import { PromptTemplate, PromptTemplateVersion } from "../models/types";

export interface IPromptRepository {
  getPromptTemplates(companyId: string): Promise<PromptTemplate[]>;
  getPromptTemplateById(id: string): Promise<PromptTemplate | null>;
  getPromptTemplateByModule(companyId: string, moduleName: PromptTemplate["module_name"]): Promise<PromptTemplate | null>;
  upsertPromptTemplate(
    companyId: string,
    moduleName: PromptTemplate["module_name"],
    content: string,
    createdBy?: string
  ): Promise<PromptTemplate>;
  listVersions(promptTemplateId: string): Promise<PromptTemplateVersion[]>;
  rollbackToVersion(promptTemplateId: string, version: number, createdBy?: string): Promise<PromptTemplate>;
}
