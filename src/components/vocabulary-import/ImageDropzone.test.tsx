import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImageDropzone } from "./ImageDropzone";

it("offers separate camera and gallery inputs", () => {
  render(<ImageDropzone onChoose={vi.fn()} onFiles={vi.fn()} />);

  expect(screen.getByRole("heading", { name: /从电脑选择/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "拍照" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "选择照片" })).toHaveTextContent("从电脑选择");
  expect(screen.getByRole("button", { name: "选择照片" })).toHaveTextContent("从相册选择");

  const camera = document.querySelector<HTMLInputElement>('input[data-image-source="camera"]');
  const gallery = document.querySelector<HTMLInputElement>('input[data-image-source="gallery"]');
  expect(camera).toHaveAttribute("accept", "image/*");
  expect(camera).toHaveAttribute("capture", "environment");
  expect(gallery).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
  expect(gallery).toHaveAttribute("multiple");
});

it("passes selected gallery files to the import page", () => {
  const onFiles = vi.fn();
  render(<ImageDropzone onChoose={vi.fn()} onFiles={onFiles} />);
  const gallery = document.querySelector<HTMLInputElement>('input[data-image-source="gallery"]');
  const photo = new File([new Uint8Array([1, 2, 3])], "words.jpg", { type: "image/jpeg" });

  fireEvent.change(gallery!, { target: { files: [photo] } });

  expect(onFiles).toHaveBeenCalledWith([photo]);
});
