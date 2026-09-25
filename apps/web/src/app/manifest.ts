import type { MetadataRoute } from "next";

/** Lets people add Wedding Yantra to their phone's home screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wedding Yantra",
    short_name: "Yantra",
    description: "Run your wedding business from one place.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#FFFFFF",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
