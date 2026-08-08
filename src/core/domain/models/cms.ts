// src/core/domain/models/cms.ts
// Domain entities for Enterprise CMS

export interface CompanyProfile {
  id?: string;
  company_id: string;
  company_name: string;
  legal_name?: string;
  tagline?: string;
  mission?: string;
  vision?: string;
  about?: string;
  founder?: string;
  ceo_message?: string;
  is_women_led?: boolean;
  taas_description?: string;
  registration_number?: string;
  gst_number?: string;
  cin?: string;
  pan?: string;
  year_founded?: number;
  website?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  youtube?: string;
  whatsapp?: string;
  support_email?: string;
  sales_email?: string;
  phone_numbers?: string[];
  office_hours?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OfficeLocation {
  id?: string;
  company_id: string;
  office_name: string;
  country: string;
  state?: string;
  city: string;
  address: string;
  postal_code?: string;
  google_maps_url?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  working_hours?: string;
  is_primary?: boolean;
  display_order?: number;
  status?: "active" | "inactive";
  created_at?: string;
  updated_at?: string;
}

export interface CMSHomePageContent {
  id?: string;
  company_id: string;
  hero_title?: string;
  hero_subtitle?: string;
  hero_description?: string;
  hero_buttons?: Array<{ text: string; url: string; variant?: string }>;
  statistics?: Array<{ label: string; value: string; subtext?: string }>;
  features?: Array<{ title: string; description: string; icon?: string }>;
  why_choose_us?: Array<{ title: string; description: string; icon?: string }>;
  client_logos?: Array<{ name: string; logo_url: string; website?: string }>;
  partners?: Array<{ name: string; logo_url: string }>;
  industries?: Array<{ title: string; description: string; icon?: string }>;
  cta_title?: string;
  cta_description?: string;
  cta_button_text?: string;
  cta_button_url?: string;
  footer_content?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface CMSServiceItem {
  id?: string;
  company_id: string;
  name: string;
  slug: string;
  short_description?: string;
  long_description?: string;
  overview?: string;
  business_problems?: string[];
  solutions?: string[];
  benefits?: string[];
  industries?: string[];
  roi_metrics?: Array<{ metric: string; improvement: string }>;
  ai_workflow?: Array<{ step: number; title: string; description: string }>;
  image_url?: string;
  icon_name?: string;
  seo_meta?: { title?: string; description?: string; keywords?: string[] };
  display_order?: number;
  status?: "published" | "draft" | "archived";
  created_at?: string;
  updated_at?: string;
}

export interface CMSAISolution {
  id?: string;
  company_id: string;
  title: string;
  slug: string;
  description?: string;
  image_url?: string;
  features?: string[];
  benefits?: string[];
  technology_stack?: string[];
  pricing_tier?: { starting_price?: string; billing_cycle?: string; details?: string };
  display_order?: number;
  status?: "active" | "inactive";
  created_at?: string;
  updated_at?: string;
}

export interface MediaItem {
  id?: string;
  company_id: string;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  file_url: string;
  folder?: string;
  tags?: string[];
  alt_text?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CMSSEOSettings {
  id?: string;
  company_id: string;
  meta_title?: string;
  meta_description?: string;
  og_image_url?: string;
  twitter_card_type?: string;
  canonical_url?: string;
  robots_txt?: string;
  sitemap_xml?: string;
  structured_data?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface CMSTestimonial {
  id?: string;
  company_id: string;
  client_name: string;
  company_name?: string;
  position?: string;
  review: string;
  photo_url?: string;
  rating?: number;
  is_featured?: boolean;
  status?: "published" | "draft";
  display_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CMSFAQ {
  id?: string;
  company_id: string;
  question: string;
  answer: string;
  category?: string;
  display_order?: number;
  status?: "published" | "draft";
  created_at?: string;
  updated_at?: string;
}

export interface CMSTeamMember {
  id?: string;
  company_id: string;
  name: string;
  role: string;
  role_type?: "employee" | "leadership" | "advisor" | "board";
  biography?: string;
  photo_url?: string;
  social_links?: Record<string, string>;
  display_order?: number;
  status?: "active" | "inactive";
  created_at?: string;
  updated_at?: string;
}

export interface CMSBlogPost {
  id?: string;
  company_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  category_id?: string;
  tags?: string[];
  status?: "draft" | "published" | "scheduled";
  published_at?: string;
  cover_image_url?: string;
  seo_meta?: Record<string, any>;
  related_post_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface CMSContactSettings {
  id?: string;
  company_id: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  google_maps_embed_url?: string;
  business_hours?: string;
  holiday_schedule?: Array<{ date: string; title: string }>;
  emergency_contact?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CMSFooterSettings {
  id?: string;
  company_id: string;
  quick_links?: Array<{ text: string; url: string }>;
  product_links?: Array<{ text: string; url: string }>;
  service_links?: Array<{ text: string; url: string }>;
  legal_links?: Array<{ text: string; url: string }>;
  privacy_policy_html?: string;
  terms_conditions_html?: string;
  copyright_text?: string;
  social_links?: Record<string, string>;
  newsletter_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CMSThemeSettings {
  id?: string;
  company_id: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  default_mode?: "dark" | "light" | "system";
  typography?: string;
  logo_url?: string;
  logo_dark_url?: string;
  favicon_url?: string;
  loader_style?: string;
  animations_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}
