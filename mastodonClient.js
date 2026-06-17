const fs = require("fs");
const path = require("path");

const API_URL = process.env.MASTODON_API_URL; // e.g. https://mastodon.social
const ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN;

// Upload a single image file and return its media id.
// Mastodon requires media to be uploaded first, then attached to a post by id.
async function uploadMedia(filepath) {
  const fileBuffer = fs.readFileSync(filepath);
  const filename = path.basename(filepath);

  const form = new FormData();
  form.append("file", new Blob([fileBuffer]), filename);

  const response = await fetch(`${API_URL}/api/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: form,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Mastodon media upload failed: ${response.status} ${JSON.stringify(data)}`,
    );
  }

  // v2/media can return 200 (processed) or 202 (still processing async).
  // For typical jpeg sizes this resolves immediately, but we poll briefly
  // just in case the server queues it.
  if (response.status === 202) {
    return waitForMediaReady(data.id);
  }

  return data.id;
}

// Poll a queued media upload until Mastodon finishes processing it.
async function waitForMediaReady(mediaId, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const response = await fetch(`${API_URL}/api/v1/media/${mediaId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    if (response.status === 200) {
      return mediaId; // processed
    }
    // 206 = still processing, keep polling
  }

  throw new Error(
    `Mastodon media ${mediaId} did not finish processing in time`,
  );
}

// Post text + up to 4 images (Mastodon's default max attachments per post)
// imagePaths: array of local file paths (already downloaded)
async function postToMastodon(text, imagePaths = []) {
  const mediaIds = [];
  for (const filepath of imagePaths.slice(0, 4)) {
    const mediaId = await uploadMedia(filepath);
    mediaIds.push(mediaId);
  }

  const body = new URLSearchParams();
  body.append("status", text);
  mediaIds.forEach((id) => body.append("media_ids[]", id));

  const response = await fetch(`${API_URL}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Mastodon post failed: ${response.status} ${JSON.stringify(data)}`,
    );
  }

  console.log("Posted to Mastodon:", data.url);
  return data;
}

module.exports = { postToMastodon };
