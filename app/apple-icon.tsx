import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export const size = {
  width: 180,
  height: 180
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0d1117",
          backgroundImage:
            "radial-gradient(circle at 22% 18%, rgba(240,181,111,0.28), transparent 32%), radial-gradient(circle at 78% 82%, rgba(138,197,207,0.24), transparent 36%)",
          color: "#f4efe7",
          fontSize: 78,
          fontWeight: 700,
          letterSpacing: "0.12em"
        }}
      >
        AS
      </div>
    ),
    size
  );
}
