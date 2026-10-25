import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Original approved artwork; Next renders sizes without redrawing the mark. */
export function crystalDataUrl() {
  return (
    "data:image/png;base64," +
    readFileSync(
      join(process.cwd(), "public/brand/earmark-crystal.png"),
    ).toString("base64")
  );
}
export function CrystalIcon({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "white",
        overflow: "hidden",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: ImageResponse rasterizes this server-only element; next/image is a browser optimizer, not a Satori primitive. */}
      <img
        src={crystalDataUrl()}
        width={size * 1.5}
        height={size}
        alt="Earmark crystal mark"
        style={{ flexShrink: 0 }}
      />
    </div>
  );
}
