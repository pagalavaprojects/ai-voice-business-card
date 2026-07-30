import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { SupabasePromptRepository } from "@/core/infrastructure/database/supabase/SupabasePromptRepository";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { SupabaseAgentRepository } from "@/core/infrastructure/database/supabase/SupabaseAgentRepository";
import { SupabaseEmailLogRepository } from "@/core/infrastructure/database/supabase/SupabaseEmailLogRepository";
import { ResendEmailAdapter } from "@/core/infrastructure/email/ResendEmailAdapter";
import { RedisCache } from "@/core/infrastructure/cache/RedisCache";
import { PromptAssemblyService } from "@/core/application/services/PromptAssemblyService";
import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { NotificationService } from "@/core/application/services/NotificationService";

// Shared by both the assistant-request path (webhook) and the public
// business-card route (client fetches the assembled prompt/tools before
// starting a live call) — both need the exact same assembled system
// prompt and tool set, so this is one construction, not two that could
// drift out of sync with each other.
const knowledgeRepo = new SupabaseKnowledgeRepository();
const promptRepo = new SupabasePromptRepository();
const crmRepo = new SupabaseCRMRepository();
const bookingRepo = new SupabaseBookingRepository();
export const agentRepo = new SupabaseAgentRepository();
const notificationService = new NotificationService(new ResendEmailAdapter(), new SupabaseEmailLogRepository());

export const promptAssemblyService = new PromptAssemblyService(knowledgeRepo, promptRepo, new RedisCache());
export const toolRegistry = new ToolRegistry(crmRepo, bookingRepo, knowledgeRepo, notificationService);
