/**
 * @jest-environment jsdom
 *
 * The qualification panel must always show WHICH question is being asked —
 * never a bare "Listening…". The AI line is the authoritative authored
 * wording (seeded with Q1, advanced by real assistant transcripts); the
 * visitor line is their real transcript only, never invented.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { TAMIL_QUALIFICATION_SET1, matchAuthoredTamilQuestion, ALL_TAMIL_QUESTIONS } from "@/features/voice/lib/qualificationScript";

const t = (key: string, vars?: Record<string, string>) => (vars?.n ? `${key}:${vars.n}` : key);
const baseProps = {
  open: true,
  onClose: jest.fn(),
  companyId: "c1",
  employeeId: "e1",
  employeeName: "Srinivasan",
  companyName: "Pagalava",
  language: "ta" as const,
  t,
};

function voiceWith(messages: Array<{ role: "assistant" | "user"; content: string }>, voiceState = "listening") {
  return { voiceState, callId: "call-1", startCall: jest.fn(), endCall: jest.fn(), messages, language: "ta" };
}

function startQualification() {
  fireEvent.click(screen.getByTestId("start-qualification"));
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ slots: [] }) }) as never;
});

describe("qualification conversation UI", () => {
  it("shows Q1 (exact authored wording) immediately once qualification starts, even before any transcript", async () => {
    render(<AppointmentModal {...baseProps} voice={voiceWith([])} />);
    startQualification();
    expect(screen.getByTestId("current-question").textContent).toContain(TAMIL_QUALIFICATION_SET1[0]);
  });

  it("keeps the current question visible during the listening state — never a bare Listening", async () => {
    render(<AppointmentModal {...baseProps} voice={voiceWith([], "listening")} />);
    startQualification();
    expect(screen.getByTestId("current-question").textContent).toBeTruthy();
    expect(screen.getByText("status.listening")).toBeTruthy();
  });

  it("renders the visitor's REAL transcript under the question", async () => {
    render(
      <AppointmentModal
        {...baseProps}
        voice={voiceWith([
          { role: "assistant", content: TAMIL_QUALIFICATION_SET1[0] },
          { role: "user", content: "எங்க பில்லிங் ரொம்ப மெதுவா இருக்கு" },
        ])}
      />
    );
    startQualification();
    expect(screen.getByTestId("user-transcript").textContent).toContain("எங்க பில்லிங் ரொம்ப மெதுவா இருக்கு");
  });

  it("advances the displayed question to Q2 when the assistant's transcript matches it — showing the AUTHORED wording", async () => {
    render(
      <AppointmentModal
        {...baseProps}
        voice={voiceWith([
          { role: "assistant", content: TAMIL_QUALIFICATION_SET1[0] },
          { role: "user", content: "பில்லிங் பிரச்சனை" },
          // Slight punctuation/whitespace drift, as real TTS transcripts have:
          { role: "assistant", content: "  இந்தப் பிரச்சினை உங்கள் வணிகத்தை எவ்வளவு காலமாக பாதித்து வருகிறது  " },
        ])}
      />
    );
    startQualification();
    expect(screen.getByTestId("current-question").textContent).toContain(TAMIL_QUALIFICATION_SET1[1]);
    // The just-answered exchange's user line belongs to the previous
    // question; nothing is shown as an answer to Q2 yet.
    expect(screen.queryByTestId("user-transcript")).toBeNull();
  });

  it("never invents a visitor transcript", async () => {
    render(<AppointmentModal {...baseProps} voice={voiceWith([{ role: "assistant", content: TAMIL_QUALIFICATION_SET1[0] }])} />);
    startQualification();
    expect(screen.queryByTestId("user-transcript")).toBeNull();
  });

  it("shows Set-1 progress (question n of 7) and advances it with the question", async () => {
    const { rerender } = render(<AppointmentModal {...baseProps} voice={voiceWith([])} />);
    startQualification();
    expect(screen.getByTestId("qual-progress").textContent).toContain("appointment.progressSet1:1");

    rerender(
      <AppointmentModal
        {...baseProps}
        voice={voiceWith([
          { role: "assistant", content: TAMIL_QUALIFICATION_SET1[0] },
          { role: "user", content: "பில்லிங்" },
          { role: "assistant", content: TAMIL_QUALIFICATION_SET1[1] },
        ])}
      />
    );
    expect(screen.getByTestId("qual-progress").textContent).toContain("appointment.progressSet1:2");
  });

  it("shows Set-2 progress once a conversion question is active", async () => {
    render(
      <AppointmentModal
        {...baseProps}
        voice={voiceWith([{ role: "assistant", content: ALL_TAMIL_QUESTIONS[7] }])}
      />
    );
    startQualification();
    expect(screen.getByTestId("qual-progress").textContent).toContain("appointment.progressSet2:8");
  });

  it("keeps previous questions and REAL answers visible as history when the next question starts", async () => {
    render(
      <AppointmentModal
        {...baseProps}
        voice={voiceWith([
          { role: "assistant", content: TAMIL_QUALIFICATION_SET1[0] },
          { role: "user", content: "எங்க பில்லிங் மெதுவா இருக்கு" },
          { role: "assistant", content: TAMIL_QUALIFICATION_SET1[1] },
        ])}
      />
    );
    startQualification();
    const history = screen.getByTestId("qual-history");
    expect(history.textContent).toContain(TAMIL_QUALIFICATION_SET1[0]);
    expect(history.textContent).toContain("எங்க பில்லிங் மெதுவா இருக்கு");
    // And the active question is Q2, outside the history block:
    expect(screen.getByTestId("current-question").textContent).toContain(TAMIL_QUALIFICATION_SET1[1]);
  });
});

describe("matchAuthoredTamilQuestion", () => {
  it("maps drifted transcripts back to the exact authored wording for all 17 questions", () => {
    for (const q of ALL_TAMIL_QUESTIONS) {
      expect(matchAuthoredTamilQuestion(`  ${q.replace("?", "")} `)).toBe(q);
    }
  });

  it("returns null for non-question chatter", () => {
    expect(matchAuthoredTamilQuestion("நன்றி, அது நல்ல பதில்.")).toBeNull();
    expect(matchAuthoredTamilQuestion("")).toBeNull();
  });
});
