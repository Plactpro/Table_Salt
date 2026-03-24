import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

let s3Client: import("@aws-sdk/client-s3").S3Client | null = null;

function getS3Client() {
  if (!s3Client) {
    const { S3Client } = require("@aws-sdk/client-s3");
    s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return s3Client;
}

export function isS3Enabled(): boolean {
  return !!process.env.AWS_S3_BUCKET;
}

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string
): Promise<string> {
  if (isS3Enabled()) {
    const bucket = process.env.AWS_S3_BUCKET!;
    const ext = path.extname(originalName) || "";
    const key = `uploads/${randomUUID()}/${originalName}`;

    const { Upload } = require("@aws-sdk/lib-storage");
    const upload = new Upload({
      client: getS3Client(),
      params: {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      },
    });

    await upload.done();

    const region = process.env.AWS_REGION || "us-east-1";
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  } else {
    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(originalName) || "";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/${filename}`;
  }
}

export async function deleteFile(url: string): Promise<void> {
  if (!url) return;

  if (isS3Enabled() && (url.startsWith("https://") || url.startsWith("http://"))) {
    try {
      const bucket = process.env.AWS_S3_BUCKET!;
      const urlObj = new URL(url);
      const key = urlObj.pathname.replace(/^\//, "");

      const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
      await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      console.error("[file-storage] S3 delete failed:", err);
    }
  } else if (url.startsWith("/uploads/")) {
    try {
      const filePath = path.join(process.cwd(), url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.error("[file-storage] Local delete failed:", err);
    }
  }
}
