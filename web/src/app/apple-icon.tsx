import { ImageResponse } from "next/og";
import { CrystalIcon } from "../lib/brand-art";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return new ImageResponse(<CrystalIcon size={180} />, size);
}
