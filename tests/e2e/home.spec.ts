/**
 * E2E test: page loads and basic UI works.
 *
 * Verifies:
 *   - Home page loads with title
 *   - All 4 tabs are present
 *   - Header shows the app name and NIM status badge
 *   - Stats cards are visible
 *   - Theme toggle button works
 */

import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/TikTok Analytics Studio/);
  });

  test("shows main heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("TikTok Analytics Studio");
  });

  test("shows all 4 tabs", async ({ page }) => {
    await page.goto("/");
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toContainText("Banco");
    await expect(tabs.nth(1)).toContainText("Adicionar");
    await expect(tabs.nth(2)).toContainText("Jobs em lote");
    await expect(tabs.nth(3)).toContainText("Chat IA");
  });

  test("shows NIM status badge in header", async ({ page }) => {
    await page.goto("/");
    // Badge should be visible (either "online" or "sem API key")
    const badge = page.locator("text=/NIM (online|sem API key)/");
    await expect(badge).toBeVisible();
  });

  test("stats cards are visible on Banco tab", async ({ page }) => {
    await page.goto("/");
    // Default tab is Banco — stats cards should be visible
    await expect(page.locator("text=Vídeos")).toBeVisible();
    await expect(page.locator("text=Views")).toBeVisible();
    await expect(page.locator("text=Likes")).toBeVisible();
  });

  test("theme toggle button is clickable", async ({ page }) => {
    await page.goto("/");
    const themeButton = page.locator('button[aria-label="Alternar tema"]');
    await expect(themeButton).toBeVisible();
    await themeButton.click();
    // Should not error
  });
});

test.describe("Navigation", () => {
  test("switches between tabs", async ({ page }) => {
    await page.goto("/");

    // Click Adicionar
    await page.locator('[role="tab"]', { hasText: "Adicionar" }).click();
    await expect(page.locator("h2", { hasText: "Adicionar vídeo ao banco" })).toBeVisible();

    // Click Jobs em lote
    await page.locator('[role="tab"]', { hasText: "Jobs em lote" }).click();
    await expect(page.locator("h2", { hasText: "Processamento em lote" })).toBeVisible();

    // Click Chat IA
    await page.locator('[role="tab"]', { hasText: "Chat IA" }).click();
    await expect(page.locator("h2", { hasText: "Assistente IA" })).toBeVisible();

    // Back to Banco
    await page.locator('[role="tab"]', { hasText: "Banco" }).click();
    await expect(page.locator("input[placeholder*='Buscar']")).toBeVisible();
  });
});
