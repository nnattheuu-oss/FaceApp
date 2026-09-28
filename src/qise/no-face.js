/*
 * What to tell a person when MediaPipe finds no face, measured from the frame
 * itself. Pure and DOM-free, like the rest of this tree, because the loop that
 * uses it (ui/qise/app.js) cannot be imported under node --test.
 *
 * Before this existed, a no-face frame was reported as "Opening the camera"
 * (captureInstruction(null) overwriting "Come into view"), and darkness could
 * only be measured inside the face branch — so a dark room, or a camera that
 * delivers pure black (Android's Quick Settings "Camera access" OFF gives the
 * app permission and a black stream, with no in-use dot), looked identical to
 * a camera still starting, forever. tests/qise/no-face-feedback.test.js.
 */

/**
 * Mean luma below which a no-face frame counts as BLACK. Measured 28 Sep in
 * headless Chromium with the pinned model on a real backlit phone photo
 * scaled in brightness: a face was still detected at a centre luma of 3.4 and
 * lost at 2.5. 2 is below every brightness at which a real face was found.
 */
export const BLACK_FRAME_LUMA = 2;

/** How long black must persist before the camera itself is blamed. */
export const BLACK_FRAME_MS = 2000;

/**
 * Below this, a no-face frame is too dim to be worth asking the person to move;
 * ask for light and let the screen assist arm. Advice only: it changes what the
 * screen says and whether the assist lights, never a measured value.
 */
export const DIM_NO_FACE_LUMA = 20;

/**
 * Mean Rec.601 luma inside the central ellipse the face guide occupies,
 * sampled on a grid so a full-resolution frame costs a few thousand reads.
 */
export function centreLuma(image, stride = 4) {
  const { width, height, data } = image || {};
  if (!width || !height || !data) return null;
  const cx = width / 2, cy = height / 2, rx = width * 0.33, ry = height * 0.36;
  let sum = 0, n = 0;
  for (let y = 0; y < height; y += stride) {
    const dy = (y - cy) / ry;
    for (let x = 0; x < width; x += stride) {
      const dx = (x - cx) / rx;
      if (dx * dx + dy * dy > 1) continue;
      const p = (y * width + x) * 4;
      sum += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      n++;
    }
  }
  return n ? sum / n : null;
}

/**
 * @param {{multiple:boolean, luma:number|null, blackForMs:number}} input
 * @returns {{id:string, title:string, detail:string, dark:boolean}}
 */
export function noFaceState({ multiple = false, luma = null, blackForMs = 0 } = {}) {
  if (multiple) {
    return { id: "multiple", title: "One face at a time", detail: "Only the person being read should be in the oval.", dark: false };
  }
  if (typeof luma === "number" && luma < BLACK_FRAME_LUMA && blackForMs >= BLACK_FRAME_MS) {
    return {
      id: "black-frames",
      title: "The camera is sending a black picture",
      detail: "On Android, open Quick Settings and make sure Camera access is on. Close other camera apps, then tap Restart camera.",
      dark: false,
    };
  }
  if (typeof luma === "number" && luma < DIM_NO_FACE_LUMA) {
    return {
      id: "too-dark-no-face",
      title: "Too dark to find your face",
      detail: "Face a lamp or a window, or turn on the screen light below.",
      dark: true,
    };
  }
  return { id: "no-face", title: "Come into view", detail: "Centre your face inside the oval.", dark: false };
}
