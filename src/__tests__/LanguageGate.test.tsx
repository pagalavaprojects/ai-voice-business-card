/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageGate } from "@/features/language/components/LanguageGate";
import en from "@/features/language/locales/en.json";

// jsdom has no PointerEvent constructor — framer-motion's whileTap/whileHover
// gesture handling on the language cards synthesizes one internally whenever
// a card is interacted with, which throws "PointerEvent is not defined"
// without this. A minimal MouseEvent-based stand-in is enough; the tests
// below never assert on pointer-specific fields.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
    }
  }
  // @ts-expect-error - partial polyfill, sufficient for framer-motion's internal use
  window.PointerEvent = PointerEventPolyfill;
}

// Simple resolver for nested keys in en.json
const mockT = (key: string, vars?: Record<string, string>): string => {
  const parts = key.split(".");
  let current: any = en;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return key;
    }
  }
  if (typeof current === "string") {
    if (vars) {
      return Object.entries(vars).reduce(
        (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), v),
        current
      );
    }
    return current;
  }
  return key;
};

describe("LanguageGate", () => {
  it("renders a radiogroup with every supported language, in its own native script", () => {
    render(<LanguageGate initialLanguage="ta" onContinue={jest.fn()} t={mockT} />);
    expect(screen.getByRole("radiogroup", { name: /choose conversation language/i })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(screen.getByText("தமிழ்")).toBeInTheDocument();
    expect(screen.getByText("తెలుగు")).toBeInTheDocument();
    expect(screen.getByText("മലയാളം")).toBeInTheDocument();
    expect(screen.getByText("ಕನ್ನಡ")).toBeInTheDocument();
  });

  it("pre-selects the initial language so Continue is immediately actionable", () => {
    render(<LanguageGate initialLanguage="hi" onContinue={jest.fn()} t={mockT} />);
    const hindiCard = screen.getByText("हिन्दी").closest('[role="radio"]');
    expect(hindiCard).toHaveAttribute("aria-checked", "true");
    expect(hindiCard).toHaveAttribute("tabIndex", "0");
  });

  it("does not call onContinue on a single click — only updates the selection", () => {
    const onContinue = jest.fn();
    render(<LanguageGate initialLanguage="ta" onContinue={onContinue} t={mockT} />);
    const englishCard = screen.getByRole("radio", { name: /english/i });
    fireEvent.click(englishCard);
    expect(onContinue).not.toHaveBeenCalled();
    expect(englishCard).toHaveAttribute("aria-checked", "true");
  });

  it("calls onContinue with the selected language when Continue is pressed", () => {
    const onContinue = jest.fn();
    render(<LanguageGate initialLanguage="ta" onContinue={onContinue} t={mockT} />);
    fireEvent.click(screen.getByRole("radio", { name: /english/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith("en");
  });

  it("calls onContinue immediately on double-click of a card", () => {
    const onContinue = jest.fn();
    render(<LanguageGate initialLanguage="ta" onContinue={onContinue} t={mockT} />);
    fireEvent.doubleClick(screen.getByText("हिन्दी"));
    expect(onContinue).toHaveBeenCalledWith("hi");
  });

  it("moves selection with ArrowRight and confirms with Enter (keyboard-only flow)", () => {
    const onContinue = jest.fn();
    render(<LanguageGate initialLanguage="en" onContinue={onContinue} t={mockT} />);
    const englishCard = screen.getByRole("radio", { name: /english/i });
    fireEvent.keyDown(englishCard, { key: "ArrowRight" });
    const tamilCard = screen.getByText("தமிழ்").closest('[role="radio"]') as HTMLElement;
    expect(tamilCard).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(tamilCard, { key: "Enter" });
    expect(onContinue).toHaveBeenCalledWith("ta");
  });

  it("restricts the offered languages to enabledLanguages when provided", () => {
    render(<LanguageGate initialLanguage="en" enabledLanguages={["en", "ta"]} onContinue={jest.fn()} t={mockT} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("தமிழ்")).toBeInTheDocument();
    expect(screen.queryByText("हिन्दी")).not.toBeInTheDocument();
  });
});

