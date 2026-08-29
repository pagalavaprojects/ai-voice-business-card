import {
  QUALIFICATION_QUESTIONS,
  QUALIFICATION_QUESTIONS_TA,
  getActiveQualificationQuestion,
  getQuickReplyOptions,
} from "@/features/voice/lib/qualificationScript";

/**
 * The single source of truth for "which question are we on".
 *
 * The whole desync class of bug — a question number that disagrees with the
 * text, or with the options, or that jumps ahead of what was answered — comes
 * from more than one place deciding the active question. This function is the
 * only place that decides it, from the server's recorded-answer count alone,
 * so these tests are what keep every surface honest.
 */

describe("getActiveQualificationQuestion", () => {
  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
  ])("with %i answers recorded, the active question is number %i's successor", (answeredCount, expected) => {
    const active = getActiveQualificationQuestion({ language: "en", answeredCount, complete: false });
    expect(active.number).toBe(expected);
    expect(active.total).toBe(6);
    expect(active.complete).toBe(false);
    // The text is the EXACT authored question for that number.
    expect(active.text).toBe(QUALIFICATION_QUESTIONS[expected - 1].question);
  });

  it("uses the exact authored Tamil text for the Tamil questionnaire", () => {
    for (let answeredCount = 0; answeredCount < 6; answeredCount++) {
      const active = getActiveQualificationQuestion({ language: "ta", answeredCount, complete: false });
      expect(active.text).toBe(QUALIFICATION_QUESTIONS_TA[answeredCount].question);
    }
  });

  it("reports complete — no question, Continue's turn — once all six are answered", () => {
    for (const complete of [true, false]) {
      const active = getActiveQualificationQuestion({ language: "en", answeredCount: 6, complete });
      expect(active.complete).toBe(true);
      expect(active.number).toBe(0);
      expect(active.text).toBeNull();
    }
  });

  it("reports complete the moment the server says so, whatever the count", () => {
    const active = getActiveQualificationQuestion({ language: "ta", answeredCount: 3, complete: true });
    expect(active.complete).toBe(true);
    expect(active.number).toBe(0);
  });

  it("carries the language's own answer options, never the other language's", () => {
    expect(getActiveQualificationQuestion({ language: "en", answeredCount: 0, complete: false }).options).toBe(getQuickReplyOptions("en"));
    expect(getActiveQualificationQuestion({ language: "ta", answeredCount: 0, complete: false }).options).toBe(getQuickReplyOptions("ta"));
  });

  it("clamps a malformed count rather than pointing out of range or backwards", () => {
    // Defensive: a negative or absurd count can never index outside 1..6.
    expect(getActiveQualificationQuestion({ language: "en", answeredCount: -5, complete: false }).number).toBe(1);
    expect(getActiveQualificationQuestion({ language: "en", answeredCount: 99, complete: false }).complete).toBe(true);
  });

  it("moves strictly forward as answers accumulate — never back, never skipping", () => {
    const numbers = [0, 1, 2, 3, 4, 5].map(
      (answeredCount) => getActiveQualificationQuestion({ language: "en", answeredCount, complete: false }).number
    );
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
    // Strictly increasing by exactly one — the definition of "no skip, no
    // repeat, no regress".
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBe(numbers[i - 1] + 1);
    }
  });
});
