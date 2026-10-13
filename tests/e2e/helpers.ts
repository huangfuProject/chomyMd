import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import path from "node:path";
export async function launch(directory: string) {
  return electron.launch({
    ...(process.env.CHOMY_EXECUTABLE
      ? { executablePath: process.env.CHOMY_EXECUTABLE, args: [] }
      : { args: [path.resolve("apps/desktop")] }),
    env: { ...process.env, CHOMY_TEST_DATA: path.join(directory, "data") },
  });
}
export async function dialogs(app: ElectronApplication, filename: string) {
  await app.evaluate(({ dialog }, filename) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [filename],
    });
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: filename,
    });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  }, filename);
}
export async function stop(app: ElectronApplication) {
  const closed = app.waitForEvent("close");
  await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await closed;
}

export async function showTools(page: Page) {
  if (!(await page.locator(".primary-tools").isVisible()))
    await clickAction(page, "编辑工具");
}

export async function clickAction(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  if (!(await button.isVisible()))
    await page.locator(".document-menu > summary").click();
  await button.click();
}
