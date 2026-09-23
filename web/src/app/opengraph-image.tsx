import { ImageResponse } from "next/og";
import { SITE } from "@/config/site";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0C0C0C",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          color: "#D7E2EA",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, textTransform: "uppercase", opacity: 0.6 }}>{SITE.event}</div>
        <div
          style={{
            fontSize: 220,
            fontWeight: 900,
            lineHeight: 0.9,
            backgroundImage: "linear-gradient(180deg, #646973 0%, #BBCCD7 100%)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {SITE.name}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 32 }}>
          <span>{SITE.tagline}</span>
          <span
            style={{
              padding: "16px 36px",
              borderRadius: 999,
              color: "#fff",
              backgroundImage: "linear-gradient(123deg, #18011F 7%, #B600A8 37%, #7621B0 72%, #BE4C00 100%)",
            }}
          >
            Analyze Media
          </span>
        </div>
      </div>
    ),
    size,
  );
}
