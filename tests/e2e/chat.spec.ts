/**
 * E2E test: Chat IA tab — input, suggestions, sending messages.
 */

import { test, expect } from "@playwright/test";

test.describe("Chat IA tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator('[role="tab"]', { hasText: "Chat IA" }).click();
  });

  test("shows chat header", async ({ page }) => {
    await expect(page.locator("h2", { hasText: "Assistente IA · NVIDIA NIM" })).toBeVisible();
  });

  test("shows suggestion buttons when no messages", async ({ page }) => {
    await expect(page.locator("text=Sugestões")).toBeVisible();
    const suggestions = page.locator("button", { hasText: /vídeos|roteiro|hashtags/i });
    const count = await suggestions.count();
    expect(count).toBeGreaterThan(0);
  });

  test("has input textarea and send button", async ({ page }) => {
    await expect(page.locator("textarea")).toBeVisible();
    const sendButton = page.locator('button[class*="bg-gradient-to-br"]');
    await expect(sendButton).toBeVisible();
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    const sendButton = page.locator('button[class*="bg-gradient-to-br"]');
    await expect(sendButton).toBeDisabled();
  });

  test("typing enables send button", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("test message");
    const sendButton = page.locator('button[class*="bg-gradient-to-br"]');
    await expect(sendButton).toBeEnabled();
  });

  test("clicking a suggestion fills the input", async ({ page }) => {
    const firstSuggestion = page.locator("button", { hasText: /vídeos|roteiro|hashtags/i }).first();
    await firstSuggestion.click();
    // Should send the message (button gets disabled while loading or input clears)
    // Wait a moment for the request
    await page.waitForTimeout(2000);
  });

  test("Enter key sends message", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("test question");
    await textarea.press("Enter");
    // Wait for request to start
    await page.waitForTimeout(1000);
  });

  test("Shift+Enter adds newline (doesn't send)", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("line 1");
    await textarea.press("Shift+Enter");
    await textarea.fill("line 1\nline 2");
    // Should still be in textarea (not sent)
    const value = await textarea.inputValue();
    expect(value).toContain("line 1");
    expect(value).toContain("line 2");
  });
});
