import { IMembershipRepository } from "@/core/domain/repositories/IMembershipRepository";
import { CompanyMember, UserProfile } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

export class SupabaseMembershipRepository implements IMembershipRepository {
  async getMembership(companyId: string, userId: string): Promise<CompanyMember | null> {
    const { data, error } = await supabaseAdmin
      .from("company_members")
      .select()
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(`SupabaseMembershipRepository.getMembership failed: ${error.message}`);
    return (data as CompanyMember) || null;
  }

  async listActiveMembershipsForUser(userId: string): Promise<CompanyMember[]> {
    const { data, error } = await supabaseAdmin
      .from("company_members")
      .select()
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true });

    if (error) throw new Error(`SupabaseMembershipRepository.listActiveMembershipsForUser failed: ${error.message}`);
    return (data as CompanyMember[]) || [];
  }

  async listMembers(companyId: string): Promise<Array<CompanyMember & { user: UserProfile | null }>> {
    const { data, error } = await supabaseAdmin
      .from("company_members")
      .select("*, user:users(*)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`SupabaseMembershipRepository.listMembers failed: ${error.message}`);
    return (data as unknown as Array<CompanyMember & { user: UserProfile | null }>) || [];
  }

  async inviteMember(
    companyId: string,
    email: string,
    role: CompanyMember["role"],
    invitedBy: string
  ): Promise<CompanyMember> {
    const invitee = await this.getUserByEmail(email);
    if (!invitee) {
      throw new Error(
        `No account exists for ${email} yet. They need to sign up once before they can be added to a company.`
      );
    }

    const { data, error } = await supabaseAdmin
      .from("company_members")
      .upsert(
        {
          company_id: companyId,
          user_id: invitee.id,
          role,
          status: "INVITED",
          invited_by: invitedBy,
        },
        { onConflict: "company_id,user_id" }
      )
      .select()
      .single();

    if (error) throw new Error(`SupabaseMembershipRepository.inviteMember failed: ${error.message}`);
    return data as CompanyMember;
  }

  async updateMemberRole(companyId: string, memberId: string, role: CompanyMember["role"]): Promise<CompanyMember> {
    const { data, error } = await supabaseAdmin
      .from("company_members")
      .update({ role })
      .eq("id", memberId)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) throw new Error(`SupabaseMembershipRepository.updateMemberRole failed: ${error.message}`);
    return data as CompanyMember;
  }

  async removeMember(companyId: string, memberId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from("company_members")
      .delete()
      .eq("id", memberId)
      .eq("company_id", companyId);

    if (error) throw new Error(`SupabaseMembershipRepository.removeMember failed: ${error.message}`);
    return true;
  }

  async getUserByEmail(email: string): Promise<UserProfile | null> {
    const { data, error } = await supabaseAdmin.from("users").select().eq("email", email).maybeSingle();
    if (error) throw new Error(`SupabaseMembershipRepository.getUserByEmail failed: ${error.message}`);
    return (data as UserProfile) || null;
  }

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("is_platform_admin")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error(`SupabaseMembershipRepository.isPlatformAdmin failed: ${error.message}`);
    return Boolean(data?.is_platform_admin);
  }
}
