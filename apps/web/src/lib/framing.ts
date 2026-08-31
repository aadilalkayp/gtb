/**
 * On-device selfie framing pre-check for the Transformation Readiness Scan.
 *
 * Uses the browser's native FaceDetector (Chrome/Android — most of the ad
 * traffic; not in lib.dom yet, hence the minimal declaration). Free and
 * instant, but purely a UX layer: unsupported browsers skip it, and the server
 * re-validates framing inside the scoring call either way.
 */

interface DetectedFace {
  boundingBox: { top: number; height: number };
}
type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect(image: ImageBitmap): Promise<DetectedFace[]>;
};

/**
 * Returns a user-facing correction message, or null when the photo passes (or
 * the check can't run). Requires one face filling ≥~35% of the frame height,
 * with headroom above the face box so hair isn't cropped.
 */
export async function checkFraming(file: File): Promise<string | null> {
  const Detector = (window as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  if (!Detector) return null; // unsupported browser — server will validate
  try {
    const img = await createImageBitmap(file);
    const faces = await new Detector({ fastMode: true, maxDetectedFaces: 2 }).detect(img);
    const face = faces[0];
    if (!face) return "We couldn't find a face in that photo. Take a front-facing selfie.";
    if (face.boundingBox.height / img.height < 0.35) {
      return "Come closer — your face should fill most of the frame.";
    }
    if (face.boundingBox.top < img.height * 0.02) {
      return "Keep your hair in the shot — tilt the camera up a little.";
    }
    return null;
  } catch {
    return null; // detector hiccup — never block on the UX layer
  }
}
