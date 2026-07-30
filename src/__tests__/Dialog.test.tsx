/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { Dialog } from "@/shared/ui/dialog";

function TestHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Test Dialog" description="A description">
        <button>First action</button>
        <button>Second action</button>
      </Dialog>
    </div>
  );
}

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    render(
      <Dialog open={false} onClose={jest.fn()} title="Hidden">
        <p>content</p>
      </Dialog>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders with the correct accessible role, title, and description when open", () => {
    render(
      <Dialog open onClose={jest.fn()} title="Test Dialog" description="A description">
        <p>content</p>
      </Dialog>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByText("A description")).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = jest.fn();
    render(
      <Dialog open onClose={onClose} title="Test">
        <p>content</p>
      </Dialog>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the backdrop", () => {
    const onClose = jest.fn();
    const { container } = render(
      <Dialog open onClose={onClose} title="Test">
        <p>content</p>
      </Dialog>
    );
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is activated", () => {
    const onClose = jest.fn();
    render(
      <Dialog open onClose={onClose} title="Test">
        <p>content</p>
      </Dialog>
    );
    fireEvent.click(screen.getByLabelText("Close dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the triggering element after closing", () => {
    render(<TestHarness />);
    const trigger = screen.getByText("Open dialog");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });
});
