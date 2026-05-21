export function ensureNonBlankTypst(output: string): void {
  if (output.trim() === "") {
    throw new Error("converter produced empty Typst output");
  }
}
