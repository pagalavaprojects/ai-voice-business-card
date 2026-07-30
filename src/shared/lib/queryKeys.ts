export const queryKeys = {
  leads: {
    all: ["leads"] as const,
    list: (companyId: string, status?: string) => ["leads", "list", companyId, status] as const,
    detail: (id: string) => ["leads", "detail", id] as const,
  },
  knowledge: {
    products: (companyId: string) => ["knowledge", "products", companyId] as const,
    services: (companyId: string) => ["knowledge", "services", companyId] as const,
    faqs: (companyId: string) => ["knowledge", "faqs", companyId] as const,
  },
  agents: {
    all: (companyId: string) => ["agents", companyId] as const,
    detail: (id: string) => ["agents", "detail", id] as const,
  },
  workflows: {
    all: (companyId: string) => ["workflows", companyId] as const,
  },
};
