/**
 * E2E test: Banco tab — table, search, filters, modal.
 */

import { test, expect } from "@playwright/test";

test.describe("Banco tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Already on Banco tab by default
  });

  test("shows search input", async ({ page }) => {
    await expect(page.locator('input[placeholder*="Buscar"]')).toBeVisible();
  });

  test("shows table with headers", async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector("table", { timeout: 10000 });
    const headers = page.locator("th");
    const headerTexts = await headers.allTextContents();
    // Should have at least these
    expect(headerTexts.join(" ")).toMatch(/Vídeo/);
    expect(headerTexts.join(" ")).toMatch(/Autor/);
  });

  test("shows sort dropdown", async ({ page }) => {
    // Click the sort select
    await page.locator('button[role="combobox"]').first().click();
    // Should show options
    await expect(page.locator('[role="option"]', { hasText: "Data publicação" })).toBeVisible();
    await expect(page.locator('[role="option"]', { hasText: "Views" })).toBeVisible();
    // Close dropdown
    await page.keyboard.press("Escape");
  });

  test("shows filters button", async ({ page }) => {
    await expect(page.locator("button", { hasText: "Filtros" })).toBeVisible();
  });

  test("expands filters when clicked", async ({ page }) => {
    await page.locator("button", { hasText: "Filtros" }).click();
    // Should show filter inputs
    await expect(page.locator("label", { hasText: /Autor/ })).toBeVisible();
    await expect(page.locator("label", { hasText: /Hashtag/ })).toBeVisible();
  });

  test("typing in search filters results", async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await searchInput.fill("nonexistent-search-term-xyz");
    // Wait a bit for debounce
    await page.waitForTimeout(500);
    // Should show empty state
    const emptyMessage = page.locator("text=Nenhum vídeo encontrado");
    await expect(emptyMessage).toBeVisible();
  });

  test("clicking a video row opens detail modal", async ({ page }) => {
    // Clear search
    await page.locator('input[placeholder*="Buscar"]').fill("");
    await page.waitForTimeout(500);

    // Wait for table rows
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Click first row
    await rows.first().click();
    // Modal should appear with video details
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test("modal has Visão geral and Análise profunda tabs", async ({ page }) => {
    // Open modal first
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await rows.first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Should have both tabs
    await expect(page.locator("button", { hasText: "Visão geral" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Análise profunda" })).toBeVisible();
  });

  test("deep analysis tab shows metrics", async ({ page }) => {
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await rows.first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Click Análise profunda
    await page.locator("button", { hasText: "Análise profunda" }).click();

    // Should show metrics sections
    await expect(page.locator("h4", { hasText: "Métricas brutas" })).toBeVisible({ timeout: 10000 });
    await expect(page.locator("h4", { hasText: "Taxas calculadas" })).toBeVisible();
    await expect(page.locator("h4", { hasText: "Insights" })).toBeVisible();
  });
});
