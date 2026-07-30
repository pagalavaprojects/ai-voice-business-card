import { IKnowledgeRepository } from "../../domain/repositories/IKnowledgeRepository";
import { IPromptRepository } from "../../domain/repositories/IPromptRepository";

export class PromptAssemblyService {
  constructor(
    private knowledgeRepo: IKnowledgeRepository,
    private promptRepo: IPromptRepository
  ) {}

  async assembleSystemPrompt(companyId: string, employeeId: string): Promise<string> {
    // 1. Fetch Company & Employee
    const company = await this.knowledgeRepo.getCompanyById(companyId);
    const employee = await this.knowledgeRepo.getEmployeeById(employeeId);

    if (!company || !employee) {
      throw new Error("Company or Employee not found for prompt assembly.");
    }

    // 2. Fetch Knowledge Base
    const products = await this.knowledgeRepo.getProductsByCompany(companyId);
    const services = await this.knowledgeRepo.getServicesByCompany(companyId);
    const faqs = await this.knowledgeRepo.getFAQsByCompany(companyId);

    // 3. Fetch Prompt Templates
    const templates = await this.promptRepo.getPromptTemplates(companyId);
    const identityTemplate = templates.find((t) => t.module_name === "identity")?.template_content ||
      "You are {{employee_name}}, {{employee_designation}} at {{company_name}}.";
    const salesTemplate = templates.find((t) => t.module_name === "sales")?.template_content ||
      "Help visitors understand our products and services, qualify leads naturally, and offer to schedule a call.";

    // 4. Construct Dynamic Assembly
    const productsText = products
      .map((p) => `- ${p.name}: ${p.description} (Price: $${p.pricing})`)
      .join("\n");
    const servicesText = services
      .map((s) => `- ${s.name}: ${s.description} (Deliverables: ${s.deliverables.join(", ")})`)
      .join("\n");
    const faqsText = faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");

    const systemPrompt = `
=== DIGITAL TWIN IDENTITY ===
${identityTemplate
  .replace("{{employee_name}}", employee.name)
  .replace("{{employee_designation}}", employee.designation)
  .replace("{{company_name}}", company.name)}

Working Hours: ${employee.working_hours || "9 AM - 5 PM EST"}
Contact Email: ${employee.email}
Phone: ${employee.phone}
Office: ${employee.office_address || "Remote"}

=== SALES GUIDELINES & BEHAVIOR ===
${salesTemplate}

=== COMPANY PRODUCTS ===
${productsText || "No public products listed."}

=== COMPANY SERVICES ===
${servicesText || "No public services listed."}

=== FREQUENTLY ASKED QUESTIONS ===
${faqsText || "No FAQs listed."}

=== MANDATORY INSTRUCTIONS ===
1. Be natural, polite, and human-like.
2. If asked to book a meeting, collect the user's Name, Email, and Phone number before calling the 'book_appointment' function.
3. Once you understand the visitor's company/needs, save their details using 'save_lead'.
4. NEVER invent prices or features not explicitly listed in the knowledge base above.
    `.trim();

    return systemPrompt;
  }
}
