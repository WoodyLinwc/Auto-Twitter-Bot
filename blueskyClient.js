const { BskyAgent } = require("@atproto/api");
const fs = require("fs");

const agent = new BskyAgent({
  service: "https://bsky.social",
});

let isLoggedIn = false;

// Log in once, reuse the session for subsequent posts
async function loginIfNeeded() {
  if (!isLoggedIn) {
    await agent.login({
      identifier: process.env.BSKY_HANDLE,
      password: process.env.BSKY_APP_PASSWORD,
    });
    isLoggedIn = true;
    console.log("Logged into Bluesky as", process.env.BSKY_HANDLE);
  }
}

// Post text + up to 4 images (Bluesky's max per post)
// imagePaths: array of local file paths (already downloaded)
async function postToBluesky(text, imagePaths = []) {
  await loginIfNeeded();

  const images = [];
  for (const filepath of imagePaths.slice(0, 4)) {
    const imageBuffer = fs.readFileSync(filepath);
    const { data } = await agent.uploadBlob(imageBuffer, {
      encoding: "image/jpeg",
    });
    images.push({
      image: data.blob,
      alt: "", // optional alt text for accessibility
    });
  }

  const postRecord = { text };
  if (images.length > 0) {
    postRecord.embed = {
      $type: "app.bsky.embed.images",
      images,
    };
  }

  const result = await agent.post(postRecord);
  console.log("Posted to Bluesky:", result.uri);
  return result;
}

module.exports = { agent, loginIfNeeded, postToBluesky };
