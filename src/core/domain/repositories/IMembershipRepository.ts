import { CompanyMember, UserProfile } from "../models/types";

export interface IMembershipRepository {
  getMembership(companyId: string, userId: string): Promise<CompanyMember | null>;
  listMembers(companyId: string): Promise<Array<CompanyMember & { user: UserProfile | null }>>;
  inviteMember(companyId: string, email: string, role: CompanyMember["role"], invitedBy: string): Promise<CompanyMember>;
  updateMemberRole(companyId: string, memberId: string, role: CompanyMember["role"]): Promise<CompanyMember>;
  removeMember(companyId: string, memberId: string): Promise<boolean>;
  getUserByEmail(email: string): Promise<UserProfile | null>;
  isPlatformAdmin(userId: string): Promise<boolean>;
}
