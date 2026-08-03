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
import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";
import { SupabaseSettingsRepository } from "@/core/infrastructure/database/supabase/SupabaseSettingsRepository";
import { SupabaseKnowledgeDocumentRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeDocumentRepository";
import { OpenAIEmbeddingAdapter } from "@/core/infrastructure/embeddings/OpenAIEmbeddingAdapter";

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

// CALCOM_EVENT_TYPE_ID was documented in .env.example but never read by any
// code, which is part of why the voice tool never reached Cal.com. Without a
// valid id there is no event type to book against, so book_appointment
// captures the request as REQUESTED instead of pretending to confirm it.
const calcomEventTypeId = Number(process.env.CALCOM_EVENT_TYPE_ID);
export const settingsRepo = new SupabaseSettingsRepository();
export const toolRegistry = new ToolRegistry(
  crmRepo,
  bookingRepo,
  knowledgeRepo,
  notificationService,
  new CalcomAdapter(),
  Number.isFinite(calcomEventTypeId) && calcomEventTypeId > 0 ? calcomEventTypeId : undefined,
  // Lets each tenant's own Settings page drive the calendar event type and the
  // email sender name; the env var above stays as the platform-wide fallback.
  settingsRepo,
  // Connects the already-built RAG document pipeline (Knowledge Base page:
  // upload, chunk, embed) to the live assistant via search_knowledge_base.
  new SupabaseKnowledgeDocumentRepository(),
  new OpenAIEmbeddingAdapter()
);
