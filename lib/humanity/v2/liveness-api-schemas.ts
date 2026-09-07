import { z } from "zod"

export const triProofLightColorSchema = z.enum(["RED", "GREEN", "BLUE", "WHITE"])

export const triProofRgbFrameSchema = z.object({
  capturedAtMs: z.number().finite().nonnegative().max(120_000),
  width: z.literal(32),
  height: z.literal(32),
  rgbBase64: z.string().min(100).max(8_000),
})

const trackSnapshotSchema = z.object({
  width: z.number().finite().nonnegative().max(7680),
  height: z.number().finite().nonnegative().max(4320),
  frameRate: z.number().finite().nonnegative().max(240).nullable().optional(),
  facingMode: z.string().trim().max(32).nullable().optional(),
  resizeMode: z.string().trim().max(32).nullable().optional(),
  readyState: z.string().trim().max(24).nullable().optional(),
  muted: z.boolean(),
  enabled: z.boolean(),
})

export const triProofCaptureIntegritySchema = z.object({
  secureContext: z.boolean(),
  frameCallbacksSupported: z.boolean(),
  observedDurationMs: z.number().finite().nonnegative().max(120_000),
  trackStart: trackSnapshotSchema,
  trackEnd: trackSnapshotSchema,
  frameCallbacks: z.array(z.object({
    callbackAtMs: z.number().finite().nonnegative().max(120_000),
    mediaTimeMs: z.number().finite().nonnegative().max(120_000),
    presentedFrames: z.number().int().nonnegative().max(1_000_000_000),
    expectedDisplayTimeMs: z.number().finite().nonnegative().max(120_000).nullable().optional(),
  })).max(360),
  visualSignatures: z.array(z.string().regex(/^[0-9a-f]{8,64}$/i)).max(240),
  motionPairs: z.array(z.object({
    capturedAtMs: z.number().finite().nonnegative().max(120_000),
    landmarkMotion: z.number().finite().nonnegative().max(100),
    pixelMotion: z.number().finite().nonnegative().max(255),
  })).max(240),
  eventCounts: z.object({
    settingsChanges: z.number().int().nonnegative().max(100),
    mute: z.number().int().nonnegative().max(100),
    unmute: z.number().int().nonnegative().max(100),
    ended: z.number().int().nonnegative().max(100),
    visibilityHidden: z.number().int().nonnegative().max(100),
    windowBlur: z.number().int().nonnegative().max(100),
    windowFocus: z.number().int().nonnegative().max(100),
  }),
})
