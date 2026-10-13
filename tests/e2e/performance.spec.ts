import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launch, dialogs, stop, clickAction } from "./helpers";
test("records repeatable large-document timings and 10 MB source stress", async () => {
  test.setTimeout(90000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-perf-"));
  const app = await launch(directory);
  const samples: Record<string, number[]> = {
    open: [],
    edit: [],
    save: [],
    search: [],
    conversion: [],
  };
  const filename = path.join(directory, "large.md");
  const original = await fs.readFile(
    "packages/test-fixtures/markdown/10-large-document.md",
    "utf8",
  );
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    for (let index = 0; index < 10; index++) {
      await fs.writeFile(
        "test-results/performance-progress.json",
        JSON.stringify({ stage: "samples", index }),
      );
      await fs.writeFile(filename, original);
      const previousId = (await page.evaluate(() => window.chomy.status())).id;
      let start = performance.now();
      await clickAction(page, "打开");
      await expect
        .poll(async () => (await page.evaluate(() => window.chomy.status())).id)
        .not.toBe(previousId);
      await expect(page.locator(".document-scroll")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expect(page.locator(".cm-content")).toBeVisible();
      samples.open?.push(performance.now() - start);
      await page.locator(".cm-content").click();
      await page.keyboard.press(`${modifier}+End`);
      start = performance.now();
      await page.keyboard.insertText("PERFORMANCE_MARKER");
      await expect(page.locator(".cm-content")).toContainText(
        "PERFORMANCE_MARKER",
      );
      samples.edit?.push(performance.now() - start);
      start = performance.now();
      await clickAction(page, "保存");
      await expect
        .poll(
          async () => (await page.evaluate(() => window.chomy.status())).dirty,
        )
        .toBe(false);
      samples.save?.push(performance.now() - start);
      await clickAction(page, "查找");
      await page.getByLabel("查找文本").fill("PERFORMANCE_MARKER");
      start = performance.now();
      await page.getByRole("button", { name: "下一个", exact: true }).click();
      await expect(
        page.locator(".cm-selectionBackground").first(),
      ).toBeVisible();
      samples.search?.push(performance.now() - start);
      await page.getByRole("button", { name: "关闭查找" }).click();
    }
    const stress: Record<string, number> = {};
    for (const size of [3, 10]) {
      await fs.writeFile(
        "test-results/performance-progress.json",
        JSON.stringify({ stage: "stress", size }),
      );
      const bytes =
        "# Heading\n\nPlain text for large source stress.\n\n".repeat(
          Math.ceil((size * 1024 * 1024) / 48),
        );
      await fs.writeFile(filename, bytes);
      const previousId = (await page.evaluate(() => window.chomy.status())).id;
      const start = performance.now();
      await clickAction(page, "打开");
      await expect
        .poll(async () => (await page.evaluate(() => window.chomy.status())).id)
        .not.toBe(previousId);
      await expect(page.locator(".document-scroll")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expect(page.locator(".cm-content")).toBeVisible();
      await page.locator(".cm-content").click();
      await page.keyboard.press(`${modifier}+End`);
      await page.keyboard.insertText("STRESS_MARKER");
      await clickAction(page, "保存");
      await expect
        .poll(async () =>
          (await fs.readFile(filename, "utf8")).includes("STRESS_MARKER"),
        )
        .toBe(true);
      stress[`${size}MiBOpenEditSaveMs`] = performance.now() - start;
    }
    await fs.writeFile(
      filename,
      "# Small\n\n" + "Paragraph text.\n\n".repeat(1000),
    );
    await clickAction(page, "打开");
    await expect(page.locator(".ProseMirror")).toBeVisible();
    for (let index = 0; index < 10; index++) {
      const start = performance.now();
      await clickAction(page, "源码");
      await expect(page.locator(".cm-content")).toBeVisible();
      await clickAction(page, "源码");
      await expect(page.locator(".ProseMirror")).toBeVisible();
      samples.conversion?.push(performance.now() - start);
    }
    const percentiles = Object.fromEntries(
      Object.entries(samples).map(([name, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return [
          name,
          {
            samples: values,
            P50: sorted[Math.ceil(sorted.length * 0.5) - 1],
            P95: sorted[Math.ceil(sorted.length * 0.95) - 1],
          },
        ];
      }),
    );
    await fs.mkdir("test-results", { recursive: true });
    await fs.writeFile(
      "test-results/performance-percentiles.json",
      JSON.stringify(
        {
          platform: process.platform,
          architecture: process.arch,
          cpu: os.cpus()[0]?.model,
          largeBytes: Buffer.byteLength(original),
          sampleCount: 10,
          unit: "milliseconds",
          scope:
            "UI automation wall time; includes IPC/rendering/assertion, not isolated engine latency",
          percentiles,
          stress,
        },
        null,
        2,
      ),
    );
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
