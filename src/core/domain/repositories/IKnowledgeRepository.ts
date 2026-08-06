import { Product, Service, FAQ, Company, Employee } from "../models/types";

export interface IKnowledgeRepository {
  getCompanyById(id: string): Promise<Company | null>;
  getEmployeeById(id: string): Promise<Employee | null>;
  /** Resolves the short public-URL slug (/c/{slug}) to its employee. Returns
   * null both when the slug doesn't exist AND when migration 20260808 hasn't
   * applied yet — the short-URL feature is simply unavailable pre-migration,
   * never a crash. */
  getEmployeeBySlug(slug: string): Promise<Employee | null>;
  getProductsByCompany(companyId: string): Promise<Product[]>;
  getServicesByCompany(companyId: string): Promise<Service[]>;
  getFAQsByCompany(companyId: string): Promise<FAQ[]>;
  searchFAQs(companyId: string, query: string): Promise<FAQ[]>;
  searchProducts(companyId: string, query: string): Promise<Product[]>;
}
