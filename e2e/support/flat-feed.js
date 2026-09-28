import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A flat-luma fake camera feed, generated at test time instead of committing a
 * multi-megabyte binary. Y=16 is video black (what Android's Quick Settings
 * "Camera access" off delivers to an app that has permission); Y=30 is a dim
 * room. Chromium loops the file.
 */
export function flatFeed(name, luma) {
  const dir = join(process.cwd(), "test-results", "feeds");
  mkdirSync(dir, { recursive: true });
  const w = 160, h = 120, frames = 15;
  const parts = [Buffer.from(`YUV4MPEG2 W${w} H${h} F15:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) {
    parts.push(Buffer.from("FRAME\n"), Buffer.alloc(w * h, luma), Buffer.alloc(w * h / 2, 128));
  }
  const path = join(dir, `${name}.y4m`);
  writeFileSync(path, Buffer.concat(parts));
  return path;
}

export const feedArgs = (path) => [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  `--use-file-for-fake-video-capture=${path}`,
];

/** Consent through to the live camera, exactly as a person taps it. */
export async function openCapture(page) {
  await page.goto("/qise.html");
  await page.getByRole("button", { name: /Begin my reading/ }).click();
  await page.getByRole("button", { name: /Agree & open camera/ }).click();
}
