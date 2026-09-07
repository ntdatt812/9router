import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicPath = (src) => join(repoRoot, "public", src);
const iconPath = (id) => join(repoRoot, "public", "providers", `${id}.png`);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const readPngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

// Three files under public/providers/ hold JPEG data under a .png name
// (`ff d8 ff e0 … JFIF`). Browsers sniff the body and render them, so nothing
// looks broken. They are named here rather than quietly dropped from the check,
// so the exclusion is a statement about those three files and not a hole the
// next added icon can slip through.
const JPEG_UNDER_A_PNG_NAME = ["/providers/nebius.png", "/providers/reka.png", "/providers/siliconflow.png"];

async function providerIds() {
  const registry = (await import("../../open-sse/providers/registry/index.js")).default;
  return registry.map((p) => p.id);
}

async function iconSrc() {
  return (await import("../../src/shared/utils/providerIcon.js")).getProviderIconSrc;
}

describe("provider brand icons", () => {
  // The invariant a provider added tomorrow can break silently: the dashboard
  // falls back to a text badge, so a missing icon renders as ordinary-looking
  // output rather than as an error anyone would notice.
  it("ships an icon file for every provider in the registry", async () => {
    const getProviderIconSrc = await iconSrc();

    const missing = (await providerIds()).filter((id) => {
      const src = getProviderIconSrc(id);
      return !src || !existsSync(publicPath(src));
    });

    expect(missing).toEqual([]);
  });

  it("uses 128x128 PNGs, the shape the folder standardised on", async () => {
    const getProviderIconSrc = await iconSrc();

    const wrong = (await providerIds())
      .map((id) => [id, getProviderIconSrc(id)])
      .filter(([, src]) => src && !JPEG_UNDER_A_PNG_NAME.includes(src))
      .filter(([, src]) => {
        const buf = readFileSync(publicPath(src));
        if (!buf.subarray(0, 8).equals(PNG_MAGIC)) return true;
        const { width, height } = readPngSize(buf);
        return width !== 128 || height !== 128;
      })
      .map(([id]) => id);

    expect(wrong).toEqual([]);
  });

  // Alibaba ships one brand under three endpoints. Three near-identical marks
  // drawn separately would drift; one file copied three times cannot.
  it("gives the three Alibaba Cloud endpoints the same mark, not lookalikes", () => {
    const source = readFileSync(iconPath("alicode"));

    for (const id of ["alicode-intl", "alims-intl", "alitp-intl"]) {
      expect(readFileSync(iconPath(id)).equals(source), `${id}.png differs from alicode.png`).toBe(true);
    }

    expect(readFileSync(iconPath("fish-audio")).equals(source)).toBe(false);
  });
});
