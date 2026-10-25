import { ImageResponse } from "next/og";
import { crystalDataUrl } from "../lib/brand-art";
export const alt = "Earmark PayPal — Every payment has a purpose.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function SocialPreview() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 70,
        background: "linear-gradient(135deg, #f5fbff, #d8eeff)",
        color: "#092454",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 650 }}>
        <div style={{ fontSize: 66, fontWeight: 700 }}>Earmark PayPal</div>
        <div style={{ fontSize: 46, marginTop: 28 }}>
          Every payment has a purpose.
        </div>
        <div style={{ fontSize: 25, color: "#537096", marginTop: 34 }}>
          Purpose-bound authorization for autonomous AI agents.
        </div>
        <div style={{ fontSize: 22, marginTop: 36 }}>
          PayPal Sandbox integration in preparation.
        </div>
      </div>
      {/* biome-ignore lint/performance/noImgElement: This server-only ImageResponse becomes an optimized PNG; next/image is unsupported by the metadata rasterizer. */}
      <img
        src={crystalDataUrl()}
        width={400}
        height={267}
        alt=""
        style={{ borderRadius: 32, flexShrink: 0 }}
      />
    </div>,
    size,
  );
}
