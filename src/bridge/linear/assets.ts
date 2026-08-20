import { linear } from "./client.js";

// Fetches a remote file and uploads its bytes to Linear storage, returning the
// permanent asset URL. Linear only accepts asset URLs on its own upload domain,
// so emojis and attachments must be re-hosted here rather than hotlinked.
export async function rehost(
  sourceUrl: string,
  filename: string,
  type: string,
): Promise<string | null> {
  const source = await fetch(sourceUrl);
  if (!source.ok) return null;
  const bytes = await source.arrayBuffer();

  const upload = (await linear().fileUpload(type, filename, bytes.byteLength))
    .uploadFile;
  if (!upload) return null;

  const headers = new Headers({ "Content-Type": type });
  for (const { key, value } of upload.headers) headers.set(key, value);

  const put = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers,
    body: bytes,
  });
  return put.ok ? upload.assetUrl : null;
}

// Re-hosts a remote file for durable storage, or null if the upload fails (the
// caller falls back to the source URL).
export async function uploadFile(
  sourceUrl: string,
  filename: string,
  contentType: string | null,
): Promise<string | null> {
  try {
    const asset = await rehost(
      sourceUrl,
      filename,
      contentType || "application/octet-stream",
    );
    console.debug(
      "[bridge]",
      "uploaded file",
      filename,
      asset ? "ok" : "failed",
    );
    return asset;
  } catch {
    return null;
  }
}
