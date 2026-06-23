require("dotenv").config({ path: __dirname + "/.env" });
const CronJob = require("cron").CronJob;
const fs = require("fs");

// for Twitter
const { twitterClient } = require("./twitterClient.js");
const { download } = require("./utilities");

// for Instagram
const { IgApiClient } = require("instagram-private-api");
const { get } = require("request-promise");

// for Bluesky
const { postToBluesky } = require("./blueskyClient.js");

// for Mastodon
const { postToMastodon } = require("./mastodonClient.js");

// Shared caption text and cross-platform promo links.
// X stays link-free (X charges $0.20/post for any post containing a URL,
// vs $0.015 for a plain post — far too expensive just for cross-promotion).
// Bluesky and Mastodon are free to post links on, so each one promotes
// the other two platforms.
const HASHTAGS =
  "#gidle #idle #neverland #여자아이들 #아이들 #네버랜드 #女娃 #kpop";
const X_PROFILE_URL = "https://twitter.com/GIDLE_BOT_DAILY";
const BLUESKY_PROFILE_URL =
  "https://bsky.app/profile/gidle-bot-daily.bsky.social";
const MASTODON_PROFILE_URL = "https://mastodon.social/@GIDLE_BOT_DAILY";

const TWITTER_TEXT = HASHTAGS;
const BLUESKY_TEXT = `${HASHTAGS}\nFollow on X: ${X_PROFILE_URL}\nFollow on Mastodon: ${MASTODON_PROFILE_URL}`;
const MASTODON_TEXT = `${HASHTAGS}\nFollow on X: ${X_PROFILE_URL}\nFollow on Bluesky: ${BLUESKY_PROFILE_URL}`;

// Track posting history for 4-image cooldown
const COOLDOWN_FILE = "posting_history.json";
const COOLDOWN_POSTS = 5; // Number of posts after 4-image post where 4 images are blocked
const POST_RECORD_FILE = "postRecord.txt";

// In-memory set of posted URIs for fast lookups
let postedURIs = new Set();

// Load posting history
function loadPostingHistory() {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      const data = fs.readFileSync(COOLDOWN_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading posting history:", error);
  }
  return {
    lastFourImagePost: null,
    postsSinceFourImages: 0,
    totalPosts: 0,
  };
}

// Save posting history
function savePostingHistory(history) {
  try {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error("Error saving posting history:", error);
  }
}

// Load posted URIs from postRecord.txt into memory
function loadPostedURIs() {
  try {
    if (fs.existsSync(POST_RECORD_FILE)) {
      const data = fs.readFileSync(POST_RECORD_FILE, "utf8");
      const lines = data.split("\n").filter((line) => {
        // Filter out empty lines and separator lines
        return line.trim() && !line.includes("---");
      });

      postedURIs = new Set(lines);
      console.log(`Loaded ${postedURIs.size} previously posted URIs`);
    } else {
      console.log("No post record file found - starting fresh");
    }
  } catch (error) {
    console.error("Error loading posted URIs:", error);
    postedURIs = new Set();
  }
}

// Get available (unposted) URIs
function getAvailableURIs() {
  const allURIs = JSON.parse(fs.readFileSync("uris.json", "utf8"));
  const available = allURIs.filter((uri) => !postedURIs.has(uri));

  // If all images have been posted, reset and start over
  if (available.length === 0) {
    console.log("All images have been posted! Resetting...");
    postedURIs.clear();
    // Wipe the post record so the next cycle starts completely fresh
    fs.writeFileSync(POST_RECORD_FILE, "");
    return allURIs;
  }

  console.log(`Available images: ${available.length}/${allURIs.length}`);
  return available;
}

// Enhanced function to determine number of images with cooldown logic
const getImageCount = () => {
  const history = loadPostingHistory();

  // Check if we're in cooldown period (next 5 posts after a 4-image post)
  const inCooldown =
    history.lastFourImagePost !== null &&
    history.postsSinceFourImages < COOLDOWN_POSTS;

  if (inCooldown) {
    console.log(
      `In cooldown period: ${
        history.postsSinceFourImages + 1
      }/${COOLDOWN_POSTS} posts since last 4-image post`,
    );
    // During cooldown, only allow modes 1-3
    const random = Math.random() * 100;
    if (random < 75) {
      return 1; // 75% → 2 separate single-image tweets
    } else if (random < 90) {
      return 2; // 15% → 2 separate 2-image tweets
    } else {
      return 3; // 10% → 1 tweet with 3 images
    }
  } else {
    // Normal probability distribution
    const random = Math.random() * 100;
    if (random < 65) {
      return 1; // 65% → 2 separate single-image tweets
    } else if (random < 85) {
      return 2; // 20% → 2 separate 2-image tweets
    } else if (random < 95) {
      return 3; // 10% → 1 tweet with 3 images
    } else {
      return 4; //  5% → 1 tweet with 4 images
    }
  }
};

// Update posting history after each post
function updatePostingHistory(imageCount) {
  const history = loadPostingHistory();

  if (imageCount === 4) {
    // Reset cooldown when posting 4 images
    history.lastFourImagePost = new Date().toISOString();
    history.postsSinceFourImages = 0;
    console.log("Posted 4 images - starting cooldown period");
  } else if (history.lastFourImagePost !== null) {
    // Increment posts since last 4-image post
    history.postsSinceFourImages++;

    // Check if cooldown period is over
    if (history.postsSinceFourImages >= COOLDOWN_POSTS) {
      console.log("Cooldown period completed - 4 images allowed again");
      // Keep the history but mark cooldown as complete
    }
  }

  history.totalPosts++;
  savePostingHistory(history);
}

// Function to get multiple unique random images (from unposted images only)
const getRandomImages = (count) => {
  const availableURIs = getAvailableURIs();
  const selectedImages = [];
  const usedIndices = new Set();

  // Ensure we don't try to get more images than available
  const maxCount = Math.min(count, availableURIs.length);

  while (selectedImages.length < maxCount) {
    const randomIndex = Math.floor(Math.random() * availableURIs.length);

    // Only add if we haven't used this index before
    if (!usedIndices.has(randomIndex)) {
      usedIndices.add(randomIndex);
      const uri = availableURIs[randomIndex];
      selectedImages.push({
        uri: uri,
        filename: uri.substring(uri.lastIndexOf("/") + 1),
      });
    }
  }

  return selectedImages;
};

// Function to download multiple images
const downloadImages = async (images) => {
  const directory = "./img";
  const downloadPromises = images.map((image, index) => {
    return new Promise((resolve, reject) => {
      const filepath = `${directory}/${image.filename}`;
      download(image.uri, filepath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            uri: image.uri,
            filepath: filepath,
          });
        }
      });
    });
  });

  return Promise.all(downloadPromises);
};

// Helper: post a single tweet with N images in one tweet
const postMultiImageTweet = async (count) => {
  const selectedImages = getRandomImages(count);
  const downloadedImages = await downloadImages(selectedImages);

  const mediaIds = [];
  for (const image of downloadedImages) {
    const mediaId = await twitterClient.v1.uploadMedia(image.filepath, {
      mimeType: "image/jpeg",
    });
    mediaIds.push(mediaId);
  }

  await twitterClient.v2.tweet({
    text: TWITTER_TEXT,
    media: {
      media_ids: mediaIds,
      tagged_user_ids: ["967000437797761024"],
    },
  });

  // Cross-post the same images to Bluesky, same cadence as Twitter
  try {
    await postToBluesky(
      BLUESKY_TEXT,
      downloadedImages.map((img) => img.filepath),
    );
  } catch (e) {
    console.error("Error posting to Bluesky:", e);
  }

  // Cross-post the same images to Mastodon, same cadence as Twitter
  try {
    await postToMastodon(
      MASTODON_TEXT,
      downloadedImages.map((img) => img.filepath),
    );
  } catch (e) {
    console.error("Error posting to Mastodon:", e);
  }

  const recordEntries =
    downloadedImages.map((img) => img.uri).join("\n") + "\n";
  fs.appendFileSync(POST_RECORD_FILE, recordEntries);
  downloadedImages.forEach((img) => postedURIs.add(img.uri));
};

// Helper: post a single tweet with 1 image
const postSingleTweet = async () => {
  await postMultiImageTweet(1);
};

// Enhanced multi-image posting function with cooldown tracking
//
// Mode 1 (65%): 2 separate single-image tweets
// Mode 2 (20%): 2 separate tweets with 2 images each
// Mode 3 (10%): 1 tweet with 3 images
// Mode 4 ( 5%): 1 tweet with 4 images
const tweetMultiple = async () => {
  try {
    const imageCount = getImageCount();

    if (imageCount === 1) {
      console.log("Mode 1 - posting 2 separate single-image tweets");

      await postSingleTweet();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await postSingleTweet();

      updatePostingHistory(1);
      updatePostingHistory(1);
      console.log("Successfully posted 2 single-image tweets");
    } else if (imageCount === 2) {
      console.log("Mode 2 - posting 2 separate 2-image tweets");

      await postMultiImageTweet(2);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await postMultiImageTweet(2);

      updatePostingHistory(2);
      updatePostingHistory(2);
      console.log("Successfully posted 2 tweets with 2 images each");
    } else {
      // Mode 3 or 4: single tweet with 3 or 4 images
      console.log(
        `Mode ${imageCount} - posting 1 tweet with ${imageCount} images`,
      );

      await postMultiImageTweet(imageCount);
      updatePostingHistory(imageCount);
      console.log(`Successfully posted 1 tweet with ${imageCount} images`);
    }
  } catch (e) {
    console.error("Error posting tweet:", e);
  }
};

// Original single image tweet function (kept for reference)
const tweet = async () => {
  const availableURIs = getAvailableURIs();
  const randomIndex = Math.floor(Math.random() * availableURIs.length);
  const uri = availableURIs[randomIndex];

  const directory = "./img";
  const filename = uri.substring(uri.lastIndexOf("/") + 1);
  const filepath = `${directory}/${filename}`;

  download(uri, filepath, async function (err) {
    try {
      const mediaId = await twitterClient.v1.uploadMedia(filepath, {
        mimeType: "image/jpeg",
      });

      await twitterClient.v2.tweet({
        text: "#gidle #idle #neverland #여자아이들 #아이들 #네버랜드 #女娃 #kpop",
        media: {
          media_ids: [mediaId],
          tagged_user_ids: ["967000437797761024"],
        },
      });

      fs.appendFileSync(POST_RECORD_FILE, `${uri}\n`);
      postedURIs.add(uri); // Update in-memory set

      // Update history for single image post
      updatePostingHistory(1);
    } catch (e) {
      console.error(e);
    }
  });
};

// Instagram posting function (unchanged)
const postToInsta = async () => {
  const ig = new IgApiClient();
  const sharp = require("sharp");
  ig.state.generateDevice(process.env.IG_USERNAME);
  await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);

  const availableURIs = getAvailableURIs();
  const randomIndex = Math.floor(Math.random() * availableURIs.length);
  const uri = availableURIs[randomIndex];

  const imageBuffer = await get({
    url: uri,
    encoding: null,
  });

  const jpegBuffer = await sharp(imageBuffer).jpeg().toBuffer();

  await ig.publish.photo({
    file: jpegBuffer,
    caption: "#GIDLE #여자아이들",
  });
};

// Function to check current cooldown status (utility function)
const checkCooldownStatus = () => {
  const history = loadPostingHistory();

  if (history.lastFourImagePost === null) {
    console.log("No 4-image posts recorded yet");
    return;
  }

  const inCooldown = history.postsSinceFourImages < COOLDOWN_POSTS;

  if (inCooldown) {
    console.log(
      `Currently in cooldown: ${history.postsSinceFourImages}/${COOLDOWN_POSTS} posts since last 4-image post`,
    );
    console.log(
      `${
        COOLDOWN_POSTS - history.postsSinceFourImages
      } more posts until 4 images allowed again`,
    );
  } else {
    console.log("Not in cooldown - 4 images allowed");
  }

  console.log(`Total posts: ${history.totalPosts}`);
  console.log(`Last 4-image post: ${history.lastFourImagePost}`);
};

// Load posted URIs on startup
console.log("Initializing bot...");
loadPostedURIs();

// Uncomment to test functions
// checkCooldownStatus();
// tweetMultiple();

// Post once every 8 hours
const cronPost = new CronJob("0 */8 * * *", async () => {
  tweetMultiple();
  // postToInsta();
});
cronPost.start();
console.log("Bot started! Posting every 8 hours.");

// Birthday & anniversary special posts — logic lives in birthdayPost.js
const {
  startBirthdayChecker,
  startAnniversaryChecker,
} = require("./birthdayPost.js");
startBirthdayChecker();
startAnniversaryChecker();
