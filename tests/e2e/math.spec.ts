import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { launch, dialogs, stop, clickAction } from "./helpers";

test("protected math toggles into rendering from the main mode control and native menu without rewriting", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-math-mode-"),
  );
  const filename = path.join(directory, "complex-math.md");
  const markdown = String.raw`# Complex formulas

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t}
\end{aligned}
$$

$$f(x)=\begin{cases}\frac{1}{\sqrt{2\pi}}e^{-x^2/2}, & x>0 \\ 0, & x\le 0\end{cases}$$

$$\mathbf{A}=\begin{pmatrix}a_{11}&a_{12}\\a_{21}&a_{22}\end{pmatrix}$$

Inline $\lim_{n\to\infty}\sum_{k=1}^n\frac{1}{k^2}=\frac{\pi^2}{6}$.

Literal \`$not_math$\`.

Invalid $$\left\[ x \right]$$
`.replace(/\\`/g, "`");
  await fs.writeFile(filename, markdown);
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    const toggle = page.getByRole("button", {
      name: "切换源码模式",
      exact: true,
    });
    await expect(page.locator(".source-editor")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(page.locator(".reading-preview")).toBeVisible();
    await expect(page.locator(".source-reason")).toHaveCount(0);
    await expect(page.locator(".reading-preview .katex")).toHaveCount(4);
    await expect(page.locator(".reading-preview .katex-error")).toHaveCount(1);
    await expect(page.locator(".reading-preview code")).toHaveText(
      "$not_math$",
    );
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(page.locator(".source-editor")).toBeVisible();
    await expect(page.locator(".reading-preview")).toHaveCount(0);
    await app.evaluate(({ Menu }) => {
      const display = Menu.getApplicationMenu()?.items.find(
        (item) => item.label === "显示",
      );
      const source = display?.submenu?.items.find(
        (item) => item.label === "源码模式",
      );
      if (!source) throw Error("Missing source menu");
      source.click();
    });
    await expect(page.locator(".reading-preview")).toBeVisible();
    await app.evaluate(({ Menu }) => {
      const display = Menu.getApplicationMenu()?.items.find(
        (item) => item.label === "显示",
      );
      const source = display?.submenu?.items.find(
        (item) => item.label === "源码模式",
      );
      if (!source) throw Error("Missing source menu");
      source.click();
    });
    await expect(page.locator(".source-editor")).toBeVisible();
    await clickAction(page, "源码");
    await expect(page.locator(".reading-preview")).toBeVisible();
    await clickAction(page, "保存");
    expect(await fs.readFile(filename, "utf8")).toBe(markdown);
    expect((await page.evaluate(() => window.chomy.status())).dirty).toBe(
      false,
    );
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
