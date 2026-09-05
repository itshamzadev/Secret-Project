import { describe, expect, it } from "vitest";

import {
  detectMedia,
  inspectMedia,
  sanitizeFileName,
} from "../src/modules/media/media.validation.js";

describe("media validation", () => {
  it("accepts a signature-identified M4A brand as canonical audio", async () => {
    const m4a = createIsoBmffAudioFixture("M4A ");
    await expect(inspectMedia(m4a)).resolves.toMatchObject({
      mimeType: "audio/x-m4a",
      extension: "m4a",
      hasAudioTrack: true,
      hasVideoTrack: false,
    });
    await expect(detectMedia("audio", m4a)).resolves.toEqual({
      mimeType: "audio/mp4",
      extension: "m4a",
    });
  });

  it("accepts a generic ISO-BMFF audio-only M4A recording", async () => {
    const m4a = createIsoBmffAudioFixture("isom");
    await expect(inspectMedia(m4a)).resolves.toMatchObject({
      mimeType: "video/mp4",
      extension: "mp4",
      isIsoBmff: true,
      hasAudioTrack: true,
      hasVideoTrack: false,
    });

    await expect(
      detectMedia("audio", m4a, {
        declaredMimeType: "audio/mp4",
        fileName: "voice-note.m4a",
      }),
    ).resolves.toEqual({
      mimeType: "audio/mp4",
      extension: "m4a",
    });
  });

  it("does not classify a video MP4 as audio from its name or header alone", async () => {
    const videoMp4 = createIsoBmffVideoFixture();
    await expect(
      detectMedia("audio", videoMp4, {
        declaredMimeType: "video/mp4",
        fileName: "random.mp4",
      }),
    ).rejects.toMatchObject({ code: "MEDIA_TYPE_NOT_ALLOWED" });

    await expect(
      detectMedia("audio", createIsoBmffAudioFixture("isom"), {
        declaredMimeType: "video/mp4",
        fileName: "random.mp4",
      }),
    ).rejects.toMatchObject({ code: "MEDIA_TYPE_NOT_ALLOWED" });

    await expect(
      detectMedia("audio", createIsoBmffAudioFixture("isom"), {
        declaredMimeType: "audio/mp4",
        fileName: "random.mp4",
      }),
    ).rejects.toMatchObject({ code: "MEDIA_TYPE_NOT_ALLOWED" });
  });

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

function createIsoBmffAudioFixture(brand: string): Buffer {
  const ftyp = createBox(
    "ftyp",
    Buffer.concat([
      Buffer.from(brand),
      Buffer.alloc(4),
      Buffer.from("isomiso2"),
    ]),
  );
  const handler = createBox(
    "hdlr",
    Buffer.concat([Buffer.alloc(8), Buffer.from("soun"), Buffer.alloc(4)]),
  );
  return Buffer.concat([
    ftyp,
    createBox("moov", createBox("trak", createBox("mdia", handler))),
  ]);
}

function createIsoBmffVideoFixture(): Buffer {
  const ftyp = createBox(
    "ftyp",
    Buffer.concat([
      Buffer.from("isom"),
      Buffer.alloc(4),
      Buffer.from("isomiso2"),
    ]),
  );
  const handler = createBox(
    "hdlr",
    Buffer.concat([Buffer.alloc(8), Buffer.from("vide"), Buffer.alloc(4)]),
  );
  return Buffer.concat([
    ftyp,
    createBox("moov", createBox("trak", createBox("mdia", handler))),
  ]);
}

function createBox(type: string, payload: Buffer): Buffer {
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.length, 0);
  box.write(type, 4, "ascii");
  payload.copy(box, 8);
  return box;
}
