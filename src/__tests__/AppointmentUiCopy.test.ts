/**
 * The Book an Appointment UI must be customer-facing and clean: it shows
 * the visitor's own questions and answers, never internal lead-scoring
 * terminology. Regression guard for the 2026-08-13 six-question revision,
 * which removed the old "Lead qualification — question N of 7" / "Lead
 * conversion — question N of 17" progress labels and the HOT/WARM/COLD-
 * dependent messaging entirely.
 */
import en from "@/features/language/locales/en.json";
import ta from "@/features/language/locales/ta.json";
import hi from "@/features/language/locales/hi.json";
import te from "@/features/language/locales/te.json";
import ml from "@/features/language/locales/ml.json";
import kn from "@/features/language/locales/kn.json";

const LOCALES: Record<string, unknown> = { en, ta, hi, te, ml, kn };

describe("appointment UI copy — no internal lead-scoring terminology reaches the customer-facing screen", () => {
  it("the English locale's appointment section never mentions Lead Qualification, Lead Conversion, or HOT/WARM/COLD", () => {
    const appointment = (en as { appointment: Record<string, string> }).appointment;
    const joined = JSON.stringify(appointment);
    for (const forbidden of ["Lead qualification", "Lead Qualification", "Lead conversion", "Lead Conversion", "HOT", "WARM", "COLD"]) {
      expect(joined).not.toContain(forbidden);
    }
  });

  it("the old per-set progress keys (progressSet1/progressSet2) and temperature-specific messages no longer exist in any locale", () => {
    for (const [code, bundle] of Object.entries(LOCALES)) {
      const appointment = (bundle as { appointment: Record<string, unknown> }).appointment;
      expect(appointment).not.toHaveProperty("progressSet1");
      expect(appointment).not.toHaveProperty("progressSet2");
      expect(appointment).not.toHaveProperty("qualifyDoneCold");
      expect(appointment).not.toHaveProperty("qualifyDoneWarm");
      // The replacement keys exist in every locale — no raw key ever
      // flashes to a visitor in any supported language.
      expect(typeof appointment.qualifyProgress).toBe("string");
      expect(typeof appointment.qualifyDone).toBe("string");
      expect(String(appointment.qualifyProgress)).toContain("{n}");
      expect(String(appointment.qualifyProgress)).toContain("{total}");
      void code;
    }
  });
});
