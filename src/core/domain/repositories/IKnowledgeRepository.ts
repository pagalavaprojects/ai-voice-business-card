import { Product, Service, FAQ, Company, Employee } from "../models/types";

export interface IKnowledgeRepository {
  getCompanyById(id: string): Promise<Company | null>;
  getEmployeeById(id: string): Promise<Employee | null>;
  getProductsByCompany(companyId: string): Promise<Product[]>;
  getServicesByCompany(companyId: string): Promise<Service[]>;
  getFAQsByCompany(companyId: string): Promise<FAQ[]>;
  searchFAQs(companyId: string, query: string): Promise<FAQ[]>;
  searchProducts(companyId: string, query: string): Promise<Product[]>;
}
