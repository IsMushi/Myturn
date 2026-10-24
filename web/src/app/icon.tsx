import { ImageResponse } from "next/og";

/**
 * The browser-tab icon, drawn as the same mark the header uses (LogoMark in
 * components/Logo.tsx): a rounded deep-green tile with three circles standing
 * for the queue, the first one highlighted.
 *
 * It is generated rather than shipped as a .ico so the palette has a single
 * source of truth. These hexes are the literal values from the @theme block in
 * globals.css (deep-green, primary, light-lime); CSS variables cannot be used
 * here because ImageResponse renders to a raster, outside the page.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#00594f",
          borderRadius: 9,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: "#80ef24" }} />
          <div style={{ width: 7, height: 7, borderRadius: 99, background: "#b9f477" }} />
          <div
            style={{ width: 7, height: 7, borderRadius: 99, background: "#ffffff", opacity: 0.45 }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
