export const CacheKeys = {
  companyPrompt: (companyId: string, employeeId: string) => `prompt:${companyId}:${employeeId}`,
  productCatalog: (companyId: string) => `products:${companyId}`,
  faqCatalog: (companyId: string) => `faqs:${companyId}`,
  agentFleet: (companyId: string) => `agents:${companyId}`,
  workflowDefinition: (workflowId: string) => `workflow:${workflowId}`,
};
