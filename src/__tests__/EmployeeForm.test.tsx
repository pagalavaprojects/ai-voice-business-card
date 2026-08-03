/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmployeeForm } from "@/features/dashboard/components/employees/EmployeeForm";

/**
 * The Playwright axe scans only cover PUBLIC pages — the dashboard is
 * auth-gated and those specs carry no session — so the admin forms are checked
 * here instead. The catalog form's WCAG 4.1.2 failure (an unlabelled
 * visually-hidden file input) was found exactly this way, and this form reuses
 * the same primitive.
 */
function renderForm(overrides: Partial<React.ComponentProps<typeof EmployeeForm>> = {}) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  render(
    <EmployeeForm
      companyId="44444444-4444-4444-4444-444444444444"
      initial={null}
      submitting={false}
      serverError={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      publicUrlOf={(path) => `https://cdn.test/${path}`}
      {...overrides}
    />
  );
  return { onSubmit, onCancel };
}

describe("EmployeeForm", () => {
  it("gives every control an accessible name, including the hidden file input", () => {
    renderForm();

    const unnamed = Array.from(document.querySelectorAll("input, select, textarea"))
      .filter((control) => {
        const name =
          control.getAttribute("aria-label")?.trim() ||
          (control.id ? document.querySelector(`label[for="${control.id}"]`)?.textContent?.trim() : "") ||
          control.closest("label")?.textContent?.trim() ||
          "";
        return name === "";
      })
      .map((control) => control.outerHTML.slice(0, 120));

    expect(unnamed).toEqual([]);
  });

  it("blocks submission and moves focus to the first invalid field", () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: /Create employee/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    // Colouring the field is not enough — a keyboard or screen-reader user
    // otherwise gets no signal that the submit did nothing (WCAG 3.3.1).
    expect(document.activeElement).toBe(document.getElementById("employee-name"));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("submits the parsed payload once the required fields are filled", () => {
    const { onSubmit } = renderForm();

    fireEvent.change(document.getElementById("employee-name")!, { target: { value: "Srinivasan Kandasamy" } });
    fireEvent.change(document.getElementById("employee-designation")!, { target: { value: "Founder" } });
    fireEvent.change(document.getElementById("employee-email")!, { target: { value: "srini@example.com" } });
    fireEvent.change(document.getElementById("employee-phone")!, { target: { value: "+91 98765 43210" } });
    fireEvent.click(screen.getByRole("button", { name: /Create employee/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Srinivasan Kandasamy",
        designation: "Founder",
        email: "srini@example.com",
        // Unset optionals become NULL, not "".
        voice_id: null,
        timezone: null,
        is_active: true,
      })
    );
  });

  it("offers 'inherit from agent' as the default voice rather than pre-selecting one", () => {
    renderForm();
    const voice = document.getElementById("employee-voice_id") as HTMLSelectElement;
    // Pre-selecting a voice would silently freeze this employee against later
    // changes to the agent's voice — the opposite of what the nullable column
    // is for.
    expect(voice.value).toBe("");
    expect(screen.getByRole("option", { name: /Inherit from agent/i })).toBeInTheDocument();
  });

  it("surfaces a server error without discarding what the admin typed", () => {
    renderForm({ serverError: "A employee with this email already exists." });
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
  });
});
