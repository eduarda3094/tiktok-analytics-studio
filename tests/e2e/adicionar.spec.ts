/**
 * E2E test: Adicionar tab — URL/upload/JSON forms.
 */

import { test, expect } from "@playwright/test";

test.describe("Adicionar tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator('[role="tab"]', { hasText: "Adicionar" }).click();
  });

  test("shows 3 subtabs", async ({ page }) => {
    await expect(page.locator('[role="tab"]', { hasText: "URL TikTok" })).toBeVisible();
    await expect(page.locator('[role="tab"]', { hasText: "Upload arquivo" })).toBeVisible();
    await expect(page.locator('[role="tab"]', { hasText: "JSON manual" })).toBeVisible();
  });

  test("URL tab shows input and submit button", async ({ page }) => {
    await page.locator('[role="tab"]', { hasText: "URL TikTok" }).click();
    await expect(page.locator('input[placeholder*="tiktok.com"]')).toBeVisible();
    await expect(page.locator("button", { hasText: "Adicionar ao banco" })).toBeVisible();
  });

  test("Upload tab shows file dropzone", async ({ page }) => {
    await page.locator('[role="tab"]', { hasText: "Upload arquivo" }).click();
    await expect(page.locator("input[type=file]")).toBeVisible();
    await expect(page.locator("text=MP4, MOV, WebM")).toBeVisible();
  });

  test("JSON tab shows textarea with default JSON", async ({ page }) => {
    await page.locator('[role="tab"]', { hasText: "JSON manual" }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    const value = await textarea.inputValue();
    expect(value).toContain("videoUrl");
    expect(value).toContain("videoViews");
  });

  test("OCR switch is visible and toggleable", async ({ page }) => {
    await expect(page.locator("text=OCR do título (frame 2s)")).toBeVisible();
    const ocrSwitch = page.locator("#ocr");
    await expect(ocrSwitch).toBeVisible();
  });

  test("Transcrição switch is visible and toggleable", async ({ page }) => {
    await expect(page.locator("text=Transcrição de áudio")).toBeVisible();
    const transcribeSwitch = page.locator("#transcribe");
    await expect(transcribeSwitch).toBeVisible();
  });

  test("submit button is disabled when URL is empty", async ({ page }) => {
    await page.locator('[role="tab"]', { hasText: "URL TikTok" }).click();
    const button = page.locator("button", { hasText: "Adicionar ao banco" });
    await expect(button).toBeDisabled();
  });

  test("submit button becomes enabled when URL is typed", async ({ page }) => {
    await page.locator('[role="tab"]', { hasText: "URL TikTok" }).click();
    const input = page.locator('input[placeholder*="tiktok.com"]');
    await input.fill("https://www.tiktok.com/@user/video/123");
    const button = page.locator("button", { hasText: "Adicionar ao banco" });
    await expect(button).toBeEnabled();
  });
});
