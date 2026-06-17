const fs = require("fs");

let _agent = null;
let _RichText = null;
let isLoggedIn = false;

// @atproto/api is published as ESM-only, so it must be loaded with a
// dynamic import() even from this CommonJS file. We cache the agent
// and RichText class after the first load.
async function getAgent() {
  if (!_agent) {
    const { BskyAgent, RichText } = await import("@atproto/api");
    _agent = new BskyAgent({
      service: "https://bsky.social",
    });
    _RichText = RichText;
  }
  return _agent;
}

// Log in once, reuse the session for subsequent posts
async function loginIfNeeded() {
  const agent = await getAgent();
  if (!isLoggedIn) {
    await agent.login({
      identifier: process.env.BSKY_HANDLE,
      password: process.env.BSKY_APP_PASSWORD,
    });
    isLoggedIn = true;
    console.log("Logged into Bluesky as", process.env.BSKY_HANDLE);
  }
  return agent;
}

// Post text + up to 4 images (Bluesky's max per post)
// imagePaths: array of local file paths (already downloaded)
async function postToBluesky(text, imagePaths = []) {
  const agent = await loginIfNeeded();

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

  // Detect #hashtags, @mentions, and links in the text and turn them
  // into clickable facets. detectFacets() takes the agent so it can
  // resolve @mentions to DIDs; hashtags/links don't need network calls.
  const rt = new _RichText({ text });
  await rt.detectFacets(agent);

  const postRecord = {
    text: rt.text,
    facets: rt.facets,
  };
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

module.exports = { loginIfNeeded, postToBluesky };
