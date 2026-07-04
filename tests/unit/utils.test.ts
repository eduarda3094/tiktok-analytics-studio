/**
 * Unit tests for utils.ts — cn() class name merge utility.
 */

import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (class name merge utility)", () => {
  it("returns empty string for no args", () => {
    expect(cn()).toBe("");
  });

  it("returns single class name", () => {
    expect(cn("btn")).toBe("btn");
  });

  it("merges multiple class names", () => {
    expect(cn("btn", "primary", "large")).toBe("btn primary large");
  });

  it("handles conditional classes (truthy)", () => {
    expect(cn("btn", true && "active", false && "disabled")).toBe("btn active");
  });

  it("handles undefined and null values", () => {
    expect(cn("btn", undefined, null, "primary")).toBe("btn primary");
  });

  it("handles empty strings", () => {
    expect(cn("btn", "", "primary")).toBe("btn primary");
  });

  it("deduplicates conflicting Tailwind classes (tailwind-merge)", () => {
    // tailwind-merge should keep the last conflicting class
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("merges non-conflicting Tailwind classes", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("handles object syntax (clsx)", () => {
    expect(cn("btn", { active: true, disabled: false })).toBe("btn active");
  });

  it("handles array syntax (clsx)", () => {
    expect(cn("btn", ["primary", { large: true }])).toBe("btn primary large");
  });

  it("handles mixed inputs", () => {
    expect(cn("base", "btn", { active: true }, ["extra", { hidden: false }], undefined)).toBe(
      "base btn active extra"
    );
  });
});
