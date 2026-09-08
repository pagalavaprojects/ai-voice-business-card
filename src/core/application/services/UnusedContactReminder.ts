/**
 * Item 15 — the 2-day unused-contact reminder's eligibility rule, as pure
 * logic over already-loaded rows: the boundary is testable to the
 * millisecond and the cron route stays a thin orchestrator.
 *
 * "Unused" is the application's own activity model, never an invented field:
 * a contact was captured (a leads row) but, 2+ days later, the lead is still
 * NEW or QUALIFIED, has no appointment in any status (a cancelled booking
 * still means the contact was used), and has no CALL / EMAIL / APPOINTMENT
 * activity on its timeline. Time is absolute — 48h from `created_at`, which
 * is stored as a UTC instant — so the reminder never lands earlier or later
 * depending on where the server runs or on daylight-saving changes.
 */
export const UNUSED_CONTACT_AFTER_MS = 48 * 3600_000;
/** After this the lead ages out: one reminder, at most a few daily attempts,
 * never a nudge weeks later. */
export const UNUSED_CONTACT_UNTIL_MS = 120 * 3600_000;
/** Success marker on the lead's timeline (NOTE content) — the durable "this
 * lead was reminded" record. */
export const UNUSED_LEAD_MARKER = "lead_unused_reminder_2d";
/** Written when every channel failed, so a failure is observable on the
 * timeline and attempts can be capped; the lead stays retryable. */
export const UNUSED_LEAD_FAILED_MARKER = "lead_unused_reminder_2d_failed";
export const MAX_UNUSED_REMINDER_ATTEMPTS = 3;
export const UNUSED_ELIGIBLE_STATUSES = ["NEW", "QUALIFIED"] as const;
/** Timeline activity types that prove the contact WAS used. */
export const USED_ACTIVITY_TYPES: ReadonlySet<string> = new Set(["CALL", "EMAIL", "APPOINTMENT"]);

export interface UnusedCandidate {
  id: string;
  company_id: string;
  employee_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string | null;
  deleted_at?: string | null;
}
export interface TimelineEntry {
  type: string;
  content: string | null;
}
export type UnusedExclusion =
  | "deleted"
  | "status"
  | "invalid_timestamp"
  | "too_recent"
  | "aged_out"
  | "has_appointment"
  | "used"
  | "already_reminded"
  | "attempts_exhausted"
  | "duplicate_contact";

const PLACEHOLDER_EMAIL = /@placeholder\.maylaanai\.internal$/i;

/** The identity two lead rows share when they are the same person: a real
 * e-mail address (case-insensitive) or, failing that, a phone number by its
 * digits. Placeholder addresses are per-lead and never identify anyone. */
export function contactKey(lead: Pick<UnusedCandidate, "email" | "phone">): string | null {
  const email = (lead.email ?? "").trim().toLowerCase();
  if (email && email.includes("@") && !PLACEHOLDER_EMAIL.test(email)) return `email:${email}`;
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 8) return `phone:${digits}`;
  return null;
}

export function selectUnusedContacts(input: {
  now: number;
  leads: UnusedCandidate[];
  leadIdsWithAppointments: ReadonlySet<string>;
  activitiesByLead: ReadonlyMap<string, TimelineEntry[]>;
}): { eligible: UnusedCandidate[]; excluded: Array<{ id: string; reason: UnusedExclusion }> } {
  const { now, leads, leadIdsWithAppointments, activitiesByLead } = input;
  const eligible: UnusedCandidate[] = [];
  const excluded: Array<{ id: string; reason: UnusedExclusion }> = [];

  const classify = (lead: UnusedCandidate): UnusedExclusion | null => {
    if (lead.deleted_at) return "deleted";
    if (!(UNUSED_ELIGIBLE_STATUSES as readonly string[]).includes(lead.status)) return "status";
    const created = lead.created_at ? Date.parse(lead.created_at) : Number.NaN;
    if (Number.isNaN(created)) return "invalid_timestamp";
    const age = now - created;
    if (age < UNUSED_CONTACT_AFTER_MS) return "too_recent";
    if (age > UNUSED_CONTACT_UNTIL_MS) return "aged_out";
    if (leadIdsWithAppointments.has(lead.id)) return "has_appointment";
    const timeline = activitiesByLead.get(lead.id) ?? [];
    if (timeline.some((a) => USED_ACTIVITY_TYPES.has(a.type))) return "used";
    if (timeline.some((a) => a.content === UNUSED_LEAD_MARKER)) return "already_reminded";
    if (timeline.filter((a) => a.content === UNUSED_LEAD_FAILED_MARKER).length >= MAX_UNUSED_REMINDER_ATTEMPTS) return "attempts_exhausted";
    return null;
  };

  // Newest record first, so a person captured twice is reminded through
  // their newest record only.
  const ordered = [...leads].sort((a, b) => (Date.parse(b.created_at ?? "") || 0) - (Date.parse(a.created_at ?? "") || 0));
  const verdicts = ordered.map((lead) => ({ lead, reason: classify(lead) }));

  // A contact who already booked, was contacted or was reminded under ANOTHER
  // lead record is not unused either — their key is consumed for the batch.
  const consumedKeys = new Set<string>();
  for (const v of verdicts) {
    if (v.reason === "has_appointment" || v.reason === "used" || v.reason === "already_reminded") {
      const key = contactKey(v.lead);
      if (key) consumedKeys.add(key);
    }
  }

  for (const v of verdicts) {
    if (v.reason) {
      excluded.push({ id: v.lead.id, reason: v.reason });
      continue;
    }
    const key = contactKey(v.lead);
    if (key) {
      if (consumedKeys.has(key)) {
        excluded.push({ id: v.lead.id, reason: "duplicate_contact" });
        continue;
      }
      consumedKeys.add(key);
    }
    eligible.push(v.lead);
  }
  return { eligible, excluded };
}
