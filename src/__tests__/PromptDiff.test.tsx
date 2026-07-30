/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PromptDiff } from "@/features/dashboard/components/PromptDiff";

describe("PromptDiff", () => {
  it("reports no differences for identical text", () => {
    render(<PromptDiff before="Hello world" after="Hello world" />);
    expect(screen.getByText("No differences between these two versions.")).toBeInTheDocument();
  });

  it("renders added and removed lines for changed text", () => {
    render(<PromptDiff before={"Line A\nLine B"} after={"Line A\nLine C"} />);
    expect(screen.getByText("Line B")).toBeInTheDocument();
    expect(screen.getByText("Line C")).toBeInTheDocument();
  });
});
