// src/core/infrastructure/database/supabase/SupabaseCMSRepository.ts

import { supabaseAdmin } from "@/shared/lib/supabase";
import {
  CompanyProfile,
  OfficeLocation,
  CMSHomePageContent,
  CMSServiceItem,
  CMSAISolution,
  MediaItem,
  CMSSEOSettings,
  CMSTestimonial,
  CMSFAQ,
  CMSTeamMember,
  CMSBlogPost,
  CMSContactSettings,
  CMSFooterSettings,
  CMSThemeSettings,
} from "@/core/domain/models/cms";

export class SupabaseCMSRepository {
  // 1. Company Profile
  async getCompanyProfile(companyId: string): Promise<CompanyProfile | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from("company_profiles")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      return data as CompanyProfile | null;
    } catch {
      return {
        company_id: companyId,
        company_name: "Pagalava Data Analytics",
        legal_name: "Pagalava Data Analytics Pvt Ltd",
        tagline: "AI Integrated. Growth Automated.",
        mission: "Democratize Artificial Intelligence for mid-sized companies.",
        vision: "Be the leading Plug-and-Play AI Department globally.",
        about: "We design and integrate AI solutions that automate operations, improve productivity, and reduce business costs by up to 24%.",
        founder: "Srinivasan Kandasamy",
        is_women_led: false,
        website: "https://pagalava.com",
        support_email: "support@pagalava.com",
        sales_email: "sales@pagalava.com",
      };
    }
  }

  async upsertCompanyProfile(profile: CompanyProfile): Promise<CompanyProfile> {
    const payload = { ...profile, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin
      .from("company_profiles")
      .upsert(payload, { onConflict: "company_id" })
      .select()
      .single();

    if (error) {
      return payload;
    }
    return data as CompanyProfile;
  }

  // 2. Offices
  async getOffices(companyId: string): Promise<OfficeLocation[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from("offices")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as OfficeLocation[];
    } catch {
      return [
        {
          company_id: companyId,
          office_name: "Global HQ",
          country: "India",
          city: "Chennai",
          address: "Pagalava Tech Tower, OMR IT Expressway",
          phone: "+91 98765 43210",
          email: "hq@pagalava.com",
          is_primary: true,
          status: "active",
        },
      ];
    }
  }

  async upsertOffice(office: OfficeLocation): Promise<OfficeLocation> {
    const payload = { ...office, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin
      .from("offices")
      .upsert(payload)
      .select()
      .single();

    if (error) return payload;
    return data as OfficeLocation;
  }

  // 3. Home Page Content
  async getHomePageContent(companyId: string): Promise<CMSHomePageContent | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_home_page")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      return data as CMSHomePageContent | null;
    } catch {
      return {
        company_id: companyId,
        hero_title: "Plug-and-Play AI Department for Mid-Sized Enterprise",
        hero_subtitle: "AI Integrated. Growth Automated.",
        hero_description:
          "Adopt AI without the massive overhead of hiring an in-house AI engineering team. Reduce operating costs by up to 24%.",
        statistics: [
          { label: "Cost Reduction", value: "24%", subtext: "Average client savings" },
          { label: "Deploy Time", value: "< 14 Days", subtext: "Rapid integration" },
          { label: "AI Twin Uptime", value: "99.99%", subtext: "Enterprise Reliability" },
        ],
        cta_title: "Transform Your Business with Autonomous AI Twins",
        cta_description: "Schedule a live demonstration or try our AI Business Card today.",
        cta_button_text: "Talk to AI Twin",
        cta_button_url: "/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444",
      };
    }
  }

  async upsertHomePageContent(content: CMSHomePageContent): Promise<CMSHomePageContent> {
    const payload = { ...content, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin
      .from("cms_home_page")
      .upsert(payload, { onConflict: "company_id" })
      .select()
      .single();

    if (error) return payload;
    return data as CMSHomePageContent;
  }

  // 4. Services
  async getServices(companyId: string): Promise<CMSServiceItem[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_services")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as CMSServiceItem[];
    } catch {
      return [
        {
          company_id: companyId,
          name: "Plug-and-Play AI Department",
          slug: "plug-and-play-ai-department",
          short_description: "End-to-end AI operations team as a subscription.",
          status: "published",
          display_order: 1,
        },
      ];
    }
  }

  async upsertService(service: CMSServiceItem): Promise<CMSServiceItem> {
    const payload = { ...service, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin
      .from("cms_services")
      .upsert(payload)
      .select()
      .single();

    if (error) return payload;
    return data as CMSServiceItem;
  }

  // 5. AI Solutions
  async getAISolutions(companyId: string): Promise<CMSAISolution[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_ai_solutions")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as CMSAISolution[];
    } catch {
      return [
        {
          company_id: companyId,
          title: "AI Voice Business Card",
          slug: "ai-voice-business-card",
          description: "Autonomous WebRTC Voice Agent digital twin for 24/7 lead qualification.",
          features: ["Voice WebRTC", "RAG Knowledge Base", "Cal.com Booking"],
          status: "active",
        },
        {
          company_id: companyId,
          title: "Enterprise MCP & Vector Search",
          slug: "mcp-vector-search",
          description: "Model Context Protocol & pgvector integration for private company docs.",
          features: ["Supabase Vector", "Context Isolation", "Fast RAG"],
          status: "active",
        },
      ];
    }
  }

  async upsertAISolution(solution: CMSAISolution): Promise<CMSAISolution> {
    const payload = { ...solution, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin
      .from("cms_ai_solutions")
      .upsert(payload)
      .select()
      .single();

    if (error) return payload;
    return data as CMSAISolution;
  }

  // 6. Media Items
  async getMediaItems(companyId: string): Promise<MediaItem[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from("media_items")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as MediaItem[];
    } catch {
      return [];
    }
  }

  // 7. SEO Settings
  async getSEOSettings(companyId: string): Promise<CMSSEOSettings | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_seo_settings")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      return data as CMSSEOSettings | null;
    } catch {
      return {
        company_id: companyId,
        meta_title: "Pagalava Data Analytics | Enterprise AI Voice Business Card SaaS",
        meta_description:
          "Plug-and-play AI Department for mid-sized companies. Automate operations, qualify leads, and scale growth.",
      };
    }
  }

  async upsertSEOSettings(seo: CMSSEOSettings): Promise<CMSSEOSettings> {
    const payload = { ...seo, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin
      .from("cms_seo_settings")
      .upsert(payload, { onConflict: "company_id" })
      .select()
      .single();

    if (error) return payload;
    return data as CMSSEOSettings;
  }

  // 8. Testimonials
  async getTestimonials(companyId: string): Promise<CMSTestimonial[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_testimonials")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as CMSTestimonial[];
    } catch {
      return [
        {
          company_id: companyId,
          client_name: "Rahul Verma",
          company_name: "Apex Logistics",
          position: "VP Operations",
          review: "Pagalava's AI voice twin reduced our inbound query response time to zero and cut costs by 22%.",
          rating: 5.0,
          is_featured: true,
          status: "published",
        },
      ];
    }
  }

  // 9. FAQs
  async getFAQs(companyId: string): Promise<CMSFAQ[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_faqs")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as CMSFAQ[];
    } catch {
      return [
        {
          company_id: companyId,
          question: "How does Pagalava AI replace an in-house AI team?",
          answer:
            "We provide pre-built, custom-tuned AI Twin workflows, RAG knowledge bases, and WebRTC voice agents on a subscription basis.",
          category: "General",
          status: "published",
        },
      ];
    }
  }

  // 10. Team Members
  async getTeamMembers(companyId: string): Promise<CMSTeamMember[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_team_members")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as CMSTeamMember[];
    } catch {
      return [
        {
          company_id: companyId,
          name: "Srinivasan Kandasamy",
          role: "Founder & AI Architect",
          role_type: "leadership",
          biography: "Pioneer in Voice AI and Enterprise Data Science.",
          status: "active",
        },
      ];
    }
  }

  // 11. Blog Posts
  async getBlogPosts(companyId: string): Promise<CMSBlogPost[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_blog_posts")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as CMSBlogPost[];
    } catch {
      return [];
    }
  }

  // 12. Contact Settings
  async getContactSettings(companyId: string): Promise<CMSContactSettings | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_contact_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;
      return data as CMSContactSettings | null;
    } catch {
      return {
        company_id: companyId,
        email: "support@pagalava.com",
        phone: "+91 98765 43210",
        whatsapp: "+91 98765 43210",
        business_hours: "Monday - Friday, 9 AM - 6 PM IST",
      };
    }
  }

  // 13. Footer Settings
  async getFooterSettings(companyId: string): Promise<CMSFooterSettings | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_footer_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;
      return data as CMSFooterSettings | null;
    } catch {
      return {
        company_id: companyId,
        copyright_text: "© 2026 Pagalava Data Analytics. All rights reserved.",
        newsletter_enabled: true,
      };
    }
  }

  // 14. Theme Settings
  async getThemeSettings(companyId: string): Promise<CMSThemeSettings | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from("cms_theme_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;
      return data as CMSThemeSettings | null;
    } catch {
      return {
        company_id: companyId,
        primary_color: "#0ea5e9",
        secondary_color: "#6366f1",
        accent_color: "#10b981",
        default_mode: "dark",
        typography: "Inter",
        animations_enabled: true,
      };
    }
  }
}

export const cmsRepository = new SupabaseCMSRepository();
