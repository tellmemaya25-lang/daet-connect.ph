/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuideRegistrationForm } from "@/app/(subsystems)/tours/guide/guide-registration-form";
import { prepareGuideQrPreview, submitGuideRegistration } from "@/app/(subsystems)/tours/guide/actions";

jest.mock("@/app/(subsystems)/tours/guide/actions", () => ({
  prepareGuideQrPreview: jest.fn(async () => ({ status: "success", message: "Ready", guideId: "7f1c1988-d352-46bb-9ac8-37a8d0197a11", qrDataUrl: "data:image/png;base64,preview" })),
  submitGuideRegistration: jest.fn(async () => ({ status: "idle", message: "" })),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

const validPng = new File([
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
], "identity.png", { type: "image/png" });

describe("guide registration steps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function completePublicProfile() {
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: "Maya Santos" } });
    fireEvent.change(screen.getByLabelText(/Contact number/i), { target: { value: "09171234567" } });
    fireEvent.change(screen.getByLabelText(/Guide introduction/i), { target: { value: "I have guided visitors around Daet for several years." } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("Identity verification & consent")).toBeInTheDocument();
  }

  it("uses three steps, leaves consent unchecked, and blocks continuing without it", async () => {
    render(<GuideRegistrationForm />);
    expect(screen.getByRole("list", { name: /guide application steps/i }).querySelectorAll("li")).toHaveLength(3);
    await completePublicProfile();

    const consent = screen.getByRole("checkbox");
    expect(consent).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(/ID image or PDF/i), { target: { files: [validPng] } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/Consent is required before we can store your ID/i)).toBeInTheDocument();
    expect(prepareGuideQrPreview).not.toHaveBeenCalled();
    expect(submitGuideRegistration).not.toHaveBeenCalled();
  });

  it("shows only a QR preview before submission and requires the checkbox", async () => {
    render(<GuideRegistrationForm />);
    await completePublicProfile();
    fireEvent.change(screen.getByLabelText(/Government ID type/i), { target: { value: "philippine_national_id" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^ID number/i }), { target: { value: "1234-5678-9012" } });
    fireEvent.change(screen.getByLabelText(/ID image or PDF/i), { target: { files: [validPng] } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("img", { name: /preview of your guide badge qr/i })).toBeInTheDocument();
    expect(await screen.findByText(/Preview only · activates after approval/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit for approval/i })).toBeInTheDocument();
    expect(submitGuideRegistration).not.toHaveBeenCalled();
    await waitFor(() => expect(prepareGuideQrPreview).toHaveBeenCalledTimes(1));
  });
});
