import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("Windows portable package boundary", () => {
  it.skipIf(process.platform !== "win32")("creates a self-contained Electron app directory", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "codex-maps-package-test-"));
    const scriptPath = resolve(process.cwd(), "scripts", "package-windows-portable.ps1");

    try {
      await execFileAsync(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-OutputDirectory", outputDirectory],
        { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 },
      );

      const packageDirectory = join(outputDirectory, "Codex Maps Portable");
      await expect(stat(join(packageDirectory, "Codex Maps.exe"))).resolves.toMatchObject({ isFile: expect.any(Function) });
      await expect(stat(join(packageDirectory, "resources", "app", "build", "desktop", "src", "main.js")))
        .resolves.toMatchObject({ isFile: expect.any(Function) });
      const appPackage = JSON.parse(await readFile(join(packageDirectory, "resources", "app", "package.json"), "utf8"));
      expect(appPackage).toMatchObject({ main: "build/desktop/src/main.js", private: true });
      const provenance = JSON.parse(await readFile(join(packageDirectory, "resources", "app", ".build-provenance.json"), "utf8"));
      expect(provenance).toMatchObject({ schemaVersion: 1, platform: "win32", appVersion: "0.1.0" });
      expect(typeof provenance.sourceDirty).toBe("boolean");
      expect(JSON.stringify(provenance)).not.toContain("session");
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
