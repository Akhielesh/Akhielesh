import { ImageResponse } from "next/og";

import { fullName, roleSubtitle, roleTitle } from "@/content/site";

export const dynamic = "force-static";
export const alt = `${fullName} portfolio`;
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #080808 0%, #101010 60%, #181818 100%)",
          color: "#f4efe6",
          padding: "72px",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            opacity: 0.7
          }}
        >
          <span>{fullName}</span>
          <span>{roleTitle}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 920 }}>
          <div style={{ fontSize: 82, lineHeight: 0.94 }}>AI products, Python automation, and data systems with measurable impact.</div>
          <div style={{ fontSize: 30, lineHeight: 1.4, opacity: 0.78 }}>{roleSubtitle}</div>
        </div>
      </div>
    ),
    size
  );
}
