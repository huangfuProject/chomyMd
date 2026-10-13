import { expect, it } from "vitest";
import { RemoteImages } from "../../apps/desktop/src/main/remote-images";
it("bounds remote image bytes, type and URL; strips credentials and rejects redirects", async () => {
  let options: RequestInit | undefined;
  const images = new RemoteImages(async (_url, init) => {
    options = init;
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/png" },
    });
  });
  expect(
    (await images.load("https://images.example.test/pic.png")).bytes,
  ).toEqual(Buffer.from([1, 2, 3]));
  expect(options?.credentials).toBe("omit");
  expect(options?.redirect).toBe("error");
  for (const source of [
    "http://example.test/a",
    "https://user:secret@example.test/a",
    "https://127.0.0.1/a",
    "https://localhost/a",
  ])
    await expect(images.load(source)).rejects.toThrow();
  await expect(
    new RemoteImages(
      async () =>
        new Response("script", { headers: { "content-type": "text/html" } }),
    ).load("https://example.test/a"),
  ).rejects.toMatchObject({ code: "IMAGE_TYPE" });
  const large = new RemoteImages(
    async () =>
      new Response(new Uint8Array(1), {
        headers: {
          "content-type": "image/png",
          "content-length": String(21 * 1024 * 1024),
        },
      }),
  );
  await expect(large.load("https://example.test/a")).rejects.toMatchObject({
    code: "IMAGE_SIZE",
  });
});
it("limits concurrent remote image downloads", async () => {
  let complete: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const images = new RemoteImages(async () => {
    await gate;
    return new Response(new Uint8Array([1]), {
      headers: { "content-type": "image/png" },
    });
  });
  const pending = Array.from({ length: 4 }, () =>
    images.load("https://example.test/a"),
  );
  await expect(images.load("https://example.test/a")).rejects.toMatchObject({
    code: "IMAGE_BUSY",
  });
  complete?.();
  await Promise.all(pending);
});
