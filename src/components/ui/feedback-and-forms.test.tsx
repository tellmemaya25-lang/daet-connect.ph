/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { ImageUploader } from "@/components/tours/image-uploader";
import { FeedbackProvider, useFeedback } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";

// jsdom has no <dialog>.showModal(); the Modal falls back to setting `open`.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

describe("Field", () => {
  it("connects the hint to its control without the caller doing anything", () => {
    render(
      <Field id="email" label="Email" hint="We never share it">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-describedby", "email-hint");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid and announces the error", () => {
    render(
      <Field id="email" label="Email" error="Enter a valid email">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email");
  });
});

describe("ImageUploader", () => {
  it("keeps the file input reachable by keyboard", () => {
    render(<ImageUploader onUpload={jest.fn()} label="Cover photo" />);
    const input = screen.getByLabelText(/Cover photo/);
    expect(input).toHaveAttribute("type", "file");
    expect(input).not.toHaveAttribute("hidden");
    expect(input).not.toHaveClass("hidden");
  });

  it("passes on images and tells the user about files it skipped", () => {
    const onUpload = jest.fn();
    render(<ImageUploader onUpload={onUpload} label="Cover photo" maxSizeMb={1} />);
    const input = screen.getByLabelText(/Cover photo/);
    const image = new File(["x"], "beach.png", { type: "image/png" });
    const notImage = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [image, notImage] } });

    expect(onUpload).toHaveBeenCalledWith([image]);
    expect(screen.getByRole("alert")).toHaveTextContent("notes.txt is not an image");
  });
});

function ToastButton() {
  const { toast } = useFeedback();
  return <button onClick={() => toast("Saved.", "success")}>Save</button>;
}

describe("FeedbackProvider", () => {
  it("shows a toast as a status message and lets it be dismissed", () => {
    render(
      <FeedbackProvider>
        <ToastButton />
      </FeedbackProvider>,
    );
    fireEvent.click(screen.getByText("Save"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("submits the form only after the dialog is confirmed", async () => {
    const onSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <FeedbackProvider>
        <form onSubmit={onSubmit}>
          <ConfirmSubmitButton message="Delete this booking?">Delete</ConfirmSubmitButton>
        </form>
      </FeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Yes, continue" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("does not submit when the dialog is cancelled", async () => {
    const onSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <FeedbackProvider>
        <form onSubmit={onSubmit}>
          <ConfirmSubmitButton message="Delete this booking?">Delete</ConfirmSubmitButton>
        </form>
      </FeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
