import { expect, it, vi } from "vitest";
vi.mock("electron", () => ({ safeStorage: {} }));
import { CloudService } from "../../apps/desktop/src/main/cloud";
import type { CloudConfig } from "../../packages/contracts/src";
const config: CloudConfig = {
  provider: "s3",
  bucket: "fixture",
  region: "test",
  endpoint: "",
  publicUrl: "https://cdn.example.test",
  prefix: "test",
  pathStyle: true,
};
it("does not report success or return an insertion URL after cancel, even if an SDK resolves late", async () => {
  const service = new CloudService("unused");
  let resolveUpload: ((url: string) => void) | undefined;
  vi.spyOn(service, "provider").mockResolvedValue({
    test: async () => {},
    upload: () =>
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
  });
  const pending = service.upload(
    config,
    "fixture",
    Buffer.from("retained"),
    "image/png",
  );
  const checked = expect(pending).rejects.toMatchObject({
    code: "UPLOAD_CANCELLED",
  });
  await vi.waitFor(() => expect(service.status?.state).toBe("uploading"));
  expect(service.status?.total).toBe(8);
  service.cancel();
  resolveUpload?.("https://cdn.example.test/object");
  await checked;
  expect(service.status?.state).toBe("canceled");
  vi.restoreAllMocks();
});
