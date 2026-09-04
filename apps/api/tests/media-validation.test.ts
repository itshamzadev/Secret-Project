import { describe, expect, it } from "vitest";

import {
  detectMedia,
  sanitizeFileName,
} from "../src/modules/media/media.validation.js";

describe("media validation", () => {
  it("accepts a file whose signature matches the requested image category", async () => {
    const pngHeader = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    await expect(detectMedia("image", pngHeader)).resolves.toEqual({
      mimeType: "image/png",
      extension: "png",
    });
  });

  it("rejects unknown signatures and mismatched categories", async () => {
    await expect(
      detectMedia("image", Buffer.from("not-an-image")),
    ).rejects.toMatchObject({
      code: "MEDIA_TYPE_NOT_ALLOWED",
    });
    const pngHeader = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    await expect(detectMedia("video", pngHeader)).rejects.toMatchObject({
      code: "MEDIA_TYPE_NOT_ALLOWED",
    });
  });

  it("sanitizes client file names without allowing path components", () => {
    expect(sanitizeFileName("../holiday photo?.jpg")).toBe(
      "..holiday photo.jpg",
    );
    expect(sanitizeFileName(undefined)).toBeNull();
  });
});
