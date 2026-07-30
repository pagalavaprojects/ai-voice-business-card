import { Company, Employee } from "../../domain/models/types";

// Split out from PromptAssemblyService.ts because that file transitively
// imports RedisCache -> ioredis, which pulls in Node-only built-ins (net,
// tls, dns) that break when bundled into a client component — the Prompt
// Builder dashboard page only needs this constant, not the whole service.
export const PROMPT_TEMPLATE_VARIABLES = [
  "employee_name",
  "employee_designation",
  "company_name",
  "company_website",
  "working_hours",
  "office_address",
] as const;

export function substituteTemplateVariables(template: string, company: Company, employee: Employee): string {
  const values: Record<string, string> = {
    employee_name: employee.name,
    employee_designation: employee.designation,
    company_name: company.name,
    company_website: company.website,
    working_hours: employee.working_hours || "9 AM - 5 PM EST",
    office_address: employee.office_address || "Remote",
  };

  return PROMPT_TEMPLATE_VARIABLES.reduce((text, key) => text.replaceAll(`{{${key}}}`, values[key]), template);
}
