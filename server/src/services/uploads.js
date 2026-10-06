import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { config } from "../config.js";
import { HttpError } from "../middleware/http.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(config.uploadDir, { recursive: true });

/** Keep files in memory first so their real type can be checked before anything touches the disk. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 10 },
});

/** Identify the format from the file's first bytes, never from its name or the browser's claim. */
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Save one uploaded image under a random name and return its public URL. */
export function saveImage(file) {
  const ext = sniff(file.buffer);
  if (!ext) throw new HttpError(400, `ไฟล์ ${file.originalname} ไม่ใช่รูป JPG, PNG หรือ WebP`);
  const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(config.uploadDir, name), file.buffer);
  return `/uploads/${name}`;
}

/** Remove a file we stored; ignores URLs that are not ours. */
export function deleteImage(url) {
  const m = /^\/uploads\/([a-f0-9]{24}\.(jpg|png|webp))$/.exec(url || "");
  if (!m) return;
  fs.rm(path.join(config.uploadDir, m[1]), { force: true }, () => {});
}
