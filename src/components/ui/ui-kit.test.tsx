/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, fieldDescribedBy, Input, Select, Textarea } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";

describe("Button", () => {
  it("meets the touch-target and shape standard", () => {
    for (const variant of ["primary", "secondary", "ghost", "danger", "accent"] as const) {
      const classes = buttonClasses({ variant });
      expect(classes).toContain("rounded-full");
      expect(classes).toContain("min-h-11");
    }
    expect(buttonClasses({ size: "icon" })).toContain("h-11 w-11");
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("disables itself and shows the loading label while loading", () => {
    const onClick = jest.fn();
    render(
      <Button loading loadingText="Saving…" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders links with button styles", () => {
    render(
      <ButtonLink href="/tours/browse" variant="secondary">
        Browse
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Browse" });
    expect(link).toHaveAttribute("href", "/tours/browse");
    expect(link.className).toContain("rounded-full");
  });
});

describe("Field and controls", () => {
  it("associates the label with the control", () => {
    render(
      <Field id="name" label="Full name" required>
        <Input id="name" />
      </Field>,
    );
    expect(screen.getByLabelText(/Full name/)).toBeInTheDocument();
  });

  it("shows the error instead of the hint and marks the control invalid", () => {
    const describedBy = fieldDescribedBy("email", { hint: "We never share it.", error: "Enter a valid email." });
    render(
      <Field id="email" label="Email" hint="We never share it." error="Enter a valid email.">
        <Input id="email" invalid aria-describedby={describedBy} />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid email.");
    expect(screen.queryByText("We never share it.")).not.toBeInTheDocument();
  });

  it("uses a 16px font so iOS does not zoom on focus", () => {
    render(
      <>
        <Input aria-label="a" />
        <Textarea aria-label="b" />
        <Select aria-label="c">
          <option>x</option>
        </Select>
      </>,
    );
    for (const label of ["a", "b", "c"]) {
      expect(screen.getByLabelText(label).className).toContain("text-base");
      expect(screen.getByLabelText(label)).not.toHaveAttribute("aria-invalid");
    }
  });

  it("describes by hint when there is no error", () => {
    expect(fieldDescribedBy("x", { hint: "h" })).toBe("x-hint");
    expect(fieldDescribedBy("x", {})).toBeUndefined();
  });
});

describe("Card, Badge, EmptyState", () => {
  it("renders content", () => {
    render(
      <Card>
        <CardHeader title="Bookings" action={<Badge tone="success">3 new</Badge>} />
        <EmptyState icon="📅" title="Nothing scheduled" description="Open dates in the calendar." />
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Bookings" })).toBeInTheDocument();
    expect(screen.getByText("3 new")).toBeInTheDocument();
    expect(screen.getByText("Nothing scheduled")).toBeInTheDocument();
  });
});

describe("Modal / ConfirmDialog", () => {
  it("is hidden until opened, and is labelled by its title", () => {
    const { rerender } = render(
      <Modal open={false} onClose={() => {}} title="Cancel booking?">
        body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <Modal open onClose={() => {}} title="Cancel booking?">
        body
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Cancel booking?" })).toBeInTheDocument();
  });

  it("calls confirm and cancel handlers", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog open title="Delete event?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
