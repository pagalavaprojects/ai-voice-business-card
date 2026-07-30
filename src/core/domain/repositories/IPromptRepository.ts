import { PromptTemplate } from "../models/types";

export interface IPromptRepository {
  getPromptTemplates(companyId: string): Promise<PromptTemplate[]>;
  getPromptTemplateByModule(companyId: string, moduleName: PromptTemplate["module_name"]): Promise<PromptTemplate | null>;
  upsertPromptTemplate(companyId: string, moduleName: PromptTemplate["module_name"], content: string): Promise<PromptTemplate>;
}
