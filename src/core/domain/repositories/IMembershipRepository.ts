import { CompanyMember, UserProfile } from "../models/types";

export interface IMembershipRepository {
  getMembership(companyId: string, userId: string): Promise<CompanyMember | null>;
  /** Every ACTIVE membership this user holds, oldest first.
   *
   * Exists so a dashboard can derive its tenant scope from the authenticated
   * IDENTITY alone. Every other authorization path takes a companyId from the
   * client and verifies it, which is safe but cannot answer "which company is
   * this person allowed to see?" without being told — and the user dashboard
   * must never be told by the client. */
  listActiveMembershipsForUser(userId: string): Promise<CompanyMember[]>;
  listMembers(companyId: string): Promise<Array<CompanyMember & { user: UserProfile | null }>>;
  inviteMember(companyId: string, email: string, role: CompanyMember["role"], invitedBy: string): Promise<CompanyMember>;
  updateMemberRole(companyId: string, memberId: string, role: CompanyMember["role"]): Promise<CompanyMember>;
  removeMember(companyId: string, memberId: string): Promise<boolean>;
  getUserByEmail(email: string): Promise<UserProfile | null>;
  isPlatformAdmin(userId: string): Promise<boolean>;
}
