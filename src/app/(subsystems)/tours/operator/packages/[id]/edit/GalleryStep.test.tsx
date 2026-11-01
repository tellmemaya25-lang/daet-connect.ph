/** @jest-environment jsdom */

import { fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { FeedbackProvider } from "@/components/ui/feedback";
import { GalleryStep } from "./GalleryStep";
import { uploadPackageImage } from "./actions";
import type { EditGalleryImage } from "./edit-types";

jest.mock("./actions", () => ({
  uploadPackageImage: jest.fn(),
  deletePackageImage: jest.fn(),
}));

const mockedUpload = uploadPackageImage as jest.MockedFunction<typeof uploadPackageImage>;

const photo = (name: string, type = "image/jpeg") => new File(["x"], name, { type });

/** jsdom's DragEvent has no usable DataTransfer, so build the event by hand. */
const dropEvent = (files: File[]) => {
  const event = new Event("drop", { bubbles: true, cancelable: true }) as Event & {
    dataTransfer: unknown;
  };
  event.dataTransfer = { types: ["Files"], files, dropEffect: "" };
  return event;
};

const existing: EditGalleryImage = {
  id: "existing-1",
  imageUrl: "https://example.supabase.co/storage/v1/object/public/tours-package-media/1.jpg",
  caption: null,
  displayOrder: 1,
};

function renderGallery(data: EditGalleryImage[] = []) {
  const onUpdate = jest.fn();

  const { container } = render(
    <FeedbackProvider>
      <GalleryStep
        packageId="pkg-1"
        data={data}
        originalData={data}
        packageStatus="draft"
        onUpdate={onUpdate}
        errors={{}}
        loading={false}
      />
    </FeedbackProvider>,
  );

  return { onUpdate, section: container.firstElementChild as Element };
}

describe("GalleryStep multi-photo upload", () => {
  beforeEach(() => {
    let n = 0;
    mockedUpload.mockImplementation(async () => {
      n += 1;
      return { success: true, imageUrl: `https://example.supabase.co/storage/v1/object/public/tours-package-media/new-${n}.jpg` };
    });
  });

  it("uploads every photo dropped at once", async () => {
    const { onUpdate, section } = renderGallery();

    fireEvent(section, dropEvent([photo("a.jpg"), photo("b.png"), photo("c.webp")]));

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(3));

    const last = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
    expect(last).toHaveLength(3);
    expect(last.map((image) => image.displayOrder)).toEqual([1, 2, 3]);
    expect(new Set(last.map((image) => image.id)).size).toBe(3);
  });

  it("continues the numbering after photos already in the gallery", async () => {
    const { onUpdate, section } = renderGallery([existing]);

    fireEvent(section, dropEvent([photo("a.jpg"), photo("b.jpg")]));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(2));

    const last = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
    expect(last.map((image) => image.displayOrder)).toEqual([1, 2, 3]);
    expect(last[0].id).toBe("existing-1");
  });

  it("keeps the good photos and names the ones it refuses", async () => {
    const { onUpdate, section } = renderGallery();

    fireEvent(section, dropEvent([photo("good.jpg"), photo("notes.txt", "text/plain")]));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(section.textContent).toContain("notes.txt"));

    const last = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
    expect(last).toHaveLength(1);
  });

  it("stops at 20 images and says how many it skipped", async () => {
    const { onUpdate, section } = renderGallery();

    const files = Array.from({ length: 22 }, (_, i) => photo(`photo-${i}.jpg`));
    fireEvent(section, dropEvent(files));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(20));

    const last = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
    expect(last).toHaveLength(20);
    await waitFor(() => expect(section.textContent).toContain("2 files were skipped"));
  });

  it("reports a failed upload without losing the photos that worked", async () => {
    let call = 0;
    mockedUpload.mockImplementation(async () => {
      call += 1;
      return call === 2
        ? { success: false, error: { message: "Storage said no" } }
        : { success: true, imageUrl: `https://example.supabase.co/storage/v1/object/public/tours-package-media/ok-${call}.jpg` };
    });

    const { onUpdate, section } = renderGallery();

    fireEvent(section, dropEvent([photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(section.textContent).toContain("Storage said no"));

    const last = onUpdate.mock.calls.at(-1)?.[0] as EditGalleryImage[];
    expect(last).toHaveLength(2);
    expect(last.map((image) => image.displayOrder)).toEqual([1, 2]);
  });
});
