import { describe, expect, test } from "bun:test";
import { ensureNonBlankTypst } from "./output.js";

describe("ensureNonBlankTypst", () => {
  test("rejects blank Typst output", () => {
    expect(() => ensureNonBlankTypst(" \n\t")).toThrow("empty Typst output");
  });

  test("accepts non-blank Typst output", () => {
    expect(() => ensureNonBlankTypst("#set page()\n")).not.toThrow();
  });
});
