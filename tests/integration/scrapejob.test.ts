/**
 * Integration tests for ScrapeJob model.
 *
 * Tests the full CRUD flow for ScrapeJob records: create, read, update, delete.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, getTestDb } from "../fixtures/db";

describe("ScrapeJob database integration", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    const db = getTestDb();
    await db.scrapeJob.deleteMany({});
  });

  it("creates a pending job", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: {
        type: "urls",
        status: "pending",
        urls: JSON.stringify(["https://www.tiktok.com/@user/video/1"]),
        total: 1,
      },
    });

    expect(job.id).toBeTruthy();
    expect(job.status).toBe("pending");
    expect(job.total).toBe(1);
    expect(job.completed).toBe(0);
    expect(job.failed).toBe(0);
  });

  it("creates an account job with username", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: {
        type: "account",
        status: "pending",
        username: "tiktokuser",
        urls: JSON.stringify([]),
        total: 0,
      },
    });

    expect(job.type).toBe("account");
    expect(job.username).toBe("tiktokuser");
  });

  it("updates job status to processing", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: {
        type: "urls",
        status: "pending",
        urls: JSON.stringify([]),
        total: 0,
      },
    });

    const updated = await db.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "processing",
        startedAt: new Date(),
      },
    });

    expect(updated.status).toBe("processing");
    expect(updated.startedAt).toBeTruthy();
  });

  it("increments completed count", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: {
        type: "urls",
        status: "processing",
        urls: JSON.stringify([]),
        total: 5,
        completed: 2,
        startedAt: new Date(),
      },
    });

    const updated = await db.scrapeJob.update({
      where: { id: job.id },
      data: { completed: { increment: 1 } },
    });

    expect(updated.completed).toBe(3);
  });

  it("increments failed count", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: {
        type: "urls",
        status: "processing",
        urls: JSON.stringify([]),
        total: 5,
        failed: 1,
        startedAt: new Date(),
      },
    });

    const updated = await db.scrapeJob.update({
      where: { id: job.id },
      data: { failed: { increment: 1 } },
    });

    expect(updated.failed).toBe(2);
  });

  it("marks job as completed with videoIds and errors", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: {
        type: "urls",
        status: "processing",
        urls: JSON.stringify(["url1", "url2"]),
        total: 2,
        completed: 2,
        startedAt: new Date(),
      },
    });

    const updated = await db.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        videoIds: JSON.stringify(["video-id-1", "video-id-2"]),
        errors: JSON.stringify([]),
        finishedAt: new Date(),
      },
    });

    expect(updated.status).toBe("completed");
    expect(updated.videoIds).toBe(JSON.stringify(["video-id-1", "video-id-2"]));
    expect(updated.finishedAt).toBeTruthy();
  });

  it("marks job as partial with some errors", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: {
        type: "urls",
        status: "processing",
        urls: JSON.stringify(["url1", "url2", "url3"]),
        total: 3,
        completed: 2,
        failed: 1,
        startedAt: new Date(),
      },
    });

    const updated = await db.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "partial",
        videoIds: JSON.stringify(["id1", "id2"]),
        errors: JSON.stringify([{ url: "url3", error: "timeout" }]),
        finishedAt: new Date(),
      },
    });

    expect(updated.status).toBe("partial");
    const errors = JSON.parse(updated.errors!);
    expect(errors).toHaveLength(1);
    expect(errors[0].url).toBe("url3");
    expect(errors[0].error).toBe("timeout");
  });

  it("marks job as failed with error message", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: {
        type: "account",
        status: "processing",
        username: "baduser",
        urls: JSON.stringify([]),
        total: 0,
        startedAt: new Date(),
      },
    });

    const updated = await db.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: "Conta não encontrada",
        finishedAt: new Date(),
      },
    });

    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("Conta não encontrada");
  });

  it("queries pending jobs ordered by createdAt", async () => {
    const db = getTestDb();
    // Create multiple jobs
    await db.scrapeJob.create({
      data: { type: "urls", status: "completed", urls: "[]", total: 0, finishedAt: new Date() },
    });
    const job2 = await db.scrapeJob.create({
      data: { type: "urls", status: "pending", urls: "[]", total: 0 },
    });
    await db.scrapeJob.create({
      data: { type: "urls", status: "completed", urls: "[]", total: 0, finishedAt: new Date() },
    });

    // Query pending jobs
    const pending = await db.scrapeJob.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
    });

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(job2.id);
  });

  it("deletes a job", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: { type: "urls", status: "completed", urls: "[]", total: 0, finishedAt: new Date() },
    });

    await db.scrapeJob.delete({ where: { id: job.id } });
    const found = await db.scrapeJob.findUnique({ where: { id: job.id } });
    expect(found).toBeNull();
  });

  it("parses JSON fields from job", async () => {
    const db = getTestDb();
    const job = await db.scrapeJob.create({
      data: {
        type: "urls",
        status: "completed",
        urls: JSON.stringify(["https://url1.com", "https://url2.com"]),
        total: 2,
        completed: 2,
        videoIds: JSON.stringify(["vid1", "vid2"]),
        errors: JSON.stringify([]),
        finishedAt: new Date(),
      },
    });

    const urls = JSON.parse(job.urls);
    expect(urls).toEqual(["https://url1.com", "https://url2.com"]);

    const videoIds = JSON.parse(job.videoIds!);
    expect(videoIds).toEqual(["vid1", "vid2"]);

    const errors = JSON.parse(job.errors!);
    expect(errors).toEqual([]);
  });
});
