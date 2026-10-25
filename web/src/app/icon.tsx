import { ImageResponse } from "next/og";
import { CrystalIcon } from "../lib/brand-art";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(<CrystalIcon size={32} />, size);
}
