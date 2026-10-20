import { afterEach, expect, it, vi } from "vitest";
import { prepareRecipePhoto } from "../src/ui/recipe-photo";

afterEach(() => vi.unstubAllGlobals());

function photoBrowser(
  options: { failDecode?: boolean; noCanvas?: boolean } = {},
) {
  const revoke = vi.fn();
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:private-photo"),
    revokeObjectURL: revoke,
  });
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 4032;
      naturalHeight = 3024;
      async decode() {
        if (options.failDecode)
          throw new DOMException("Unsupported image", "EncodingError");
      }
    },
  );
  const draw = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () =>
      options.noCanvas
        ? null
        : { fillStyle: "", fillRect() {}, drawImage: draw },
    toBlob: (callback: BlobCallback, type: string) =>
      callback(new Blob(["encoded camera pixels"], { type })),
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  return { canvas, revoke, draw };
}

it("resizes large camera photos locally and uploads a fresh JPEG rather than original metadata", async () => {
  const f = photoBrowser();
  const photo = await prepareRecipePhoto(
    new File(["original EXIF GPS metadata"], "IMG_1234.HEIC", {
      type: "image/heic",
    }),
  );
  expect(f.canvas.width).toBe(2560);
  expect(f.canvas.height).toBe(1920);
  expect(photo.type).toBe("image/jpeg");
  expect(photo.name).toBe("rezeptfoto.jpg");
  expect(await photo.text()).toBe("encoded camera pixels");
  expect(f.revoke).toHaveBeenCalledWith("blob:private-photo");
});
it("reports unsupported photos and releases their private preview URLs", async () => {
  const f = photoBrowser({ failDecode: true });
  await expect(
    prepareRecipePhoto(new File(["unreadable"], "photo.heic")),
  ).rejects.toThrow("Bildformat");
  expect(f.revoke).toHaveBeenCalledOnce();
  expect(f.draw).not.toHaveBeenCalled();
});
it("rejects empty files and handles a missing canvas without uploading an invalid photo", async () => {
  const f = photoBrowser({ noCanvas: true });
  await expect(prepareRecipePhoto(new File([], "empty.jpg"))).rejects.toThrow(
    "höchstens 40 MB",
  );
  await expect(
    prepareRecipePhoto(new File(["pixels"], "photo.jpg")),
  ).rejects.toThrow("nicht vorbereitet");
  expect(f.revoke).toHaveBeenCalledOnce();
});
