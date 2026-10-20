import { z } from "zod";
import { id } from "./shared";

// Validation only: LunchJu never follows redirects, embeds or scrapes a source.
export function videoSource(
  value: string,
): { url: string; platform: "instagram" | "tiktok" | "youtube" } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const host = url.hostname.toLowerCase(),
    path = url.pathname;
  if (
    ["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host)
  ) {
    const match = path.match(/^\/reels?\/([A-Za-z0-9_-]+)\/?$/);
    return match
      ? {
          url: `https://www.instagram.com/reel/${match[1]}/`,
          platform: "instagram",
        }
      : null;
  }
  if (
    ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(
      host,
    )
  ) {
    const match =
      host === "youtu.be"
        ? path.match(/^\/([A-Za-z0-9_-]{11})\/?$/)
        : path.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/);
    return match
      ? {
          url: `https://www.youtube.com/shorts/${match[1]}`,
          platform: "youtube",
        }
      : null;
  }
  if (
    [
      "tiktok.com",
      "www.tiktok.com",
      "m.tiktok.com",
      "vm.tiktok.com",
      "vt.tiktok.com",
    ].includes(host)
  ) {
    const valid = ["vm.tiktok.com", "vt.tiktok.com"].includes(host)
      ? /^\/[A-Za-z0-9_-]+\/?$/.test(path)
      : /^\/@[A-Za-z0-9._-]+\/video\/\d{5,30}\/?$/.test(path) ||
        /^\/t\/[A-Za-z0-9_-]+\/?$/.test(path);
    return valid ? { url: `https://${host}${path}`, platform: "tiktok" } : null;
  }
  return null;
}
export const recipeSourceSchema = z.object({
  kind: z.enum(["video", "text", "image"]),
  title: z.string().trim().max(160).default(""),
  url: z.string().trim().max(2000).default(""),
  notes: z.string().trim().max(6000).default(""),
  recipeId: id.nullable().default(null),
});
export const validRecipeSource = (input: z.infer<typeof recipeSourceSchema>) =>
  input.kind === "video"
    ? !!videoSource(input.url)
    : !input.url && (input.kind === "image" || !!input.notes);
export const sourceValidationMessage =
  "Gib einen gültigen Reel-, TikTok- oder Shorts-Link an, oder wähle Text bzw. Bild als Quelle.";
export type RecipeSource = z.infer<typeof recipeSourceSchema> & {
  id: string;
  platform: "instagram" | "tiktok" | "youtube" | null;
  status: "pending" | "needs_info" | "done";
  resolution: string;
  imageUrl: string | null;
  imageAlt: string;
  ready: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};
