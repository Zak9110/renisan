import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Renisan — Iraq Scholarships & Admissions",
    short_name: "Renisan",
    description:
      "Verified scholarships, explainable eligibility matching, deadlines, and Iraqi university admissions cutoffs.",
    start_url: "/ar",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#0f6b5c",
    lang: "ar",
    dir: "rtl",
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
