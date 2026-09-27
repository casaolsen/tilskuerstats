import { put, del } from "@vercel/blob";

// Thin wrapper around Vercel Blob (see /admin/media). Requires a Blob store
// connected to the project — Vercel then sets BLOB_READ_WRITE_TOKEN
// automatically, same as it does for DATABASE_URL. See README "Deploy til
// Vercel" for the one-time setup step.
export async function uploadMedia(file: File, folderSlug: string | null) {
  const pathname = `media/${folderSlug ? `${folderSlug}/` : ""}${file.name}`;
  const blob = await put(pathname, file, { access: "public", addRandomSuffix: true });
  return { url: blob.url, pathname: blob.pathname };
}

export async function deleteMedia(pathname: string) {
  await del(pathname);
}
