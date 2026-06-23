require("dotenv").config({ path: __dirname + "/.env" });
const { CronJob } = require("cron");
const fs = require("fs");
const { twitterClient } = require("./twitterClient.js");
const { download } = require("./utilities.js");
const { postToBluesky } = require("./blueskyClient.js");
const { postToMastodon } = require("./mastodonClient.js");

// Cross-platform profile URLs (same as in index.js)
const X_PROFILE_URL = "https://twitter.com/GIDLE_BOT_DAILY";
const BLUESKY_PROFILE_URL =
  "https://bsky.app/profile/gidle-bot-daily.bsky.social";
const MASTODON_PROFILE_URL = "https://mastodon.social/@GIDLE_BOT_DAILY";

// Member data — add or remove members here as needed.
// Soojin is included as a former member worth celebrating.
const MEMBERS = [
  { name: "Miyeon", hashtag: "#MIYEON #미연", born: 1997, month: 1, day: 31 },
  { name: "Minnie", hashtag: "#MINNIE #미니", born: 1997, month: 10, day: 23 },
  { name: "Soojin", hashtag: "#SOOJIN #수진", born: 1998, month: 3, day: 9 },
  { name: "Soyeon", hashtag: "#SOYEON #소연", born: 1998, month: 8, day: 26 },
  { name: "Yuqi", hashtag: "#YUQI #우기", born: 1999, month: 9, day: 23 },
  { name: "Shuhua", hashtag: "#SHUHUA #슈화", born: 2000, month: 1, day: 6 },
];

// ─── Special image helpers ────────────────────────────────────────────────────

// Load special_uris.json and return the image pool for a given key
// (member name or "anniversary"). Returns [] if the key is missing or empty.
function getSpecialURIs(key) {
  try {
    const data = JSON.parse(fs.readFileSync("special_uris.json", "utf8"));
    return data[key] || [];
  } catch (e) {
    console.error("Error reading special_uris.json:", e);
    return [];
  }
}

// Pick up to `count` unique random URIs from a pool.
// Returns fewer if the pool has less than `count` items.
function pickRandomMultiple(pool, count = 3) {
  if (!pool.length) return [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Download multiple image URIs to ./img/ and return their local filepaths.
// Skips any that fail so one bad URL doesn't block the rest.
async function downloadSpecialImages(uris) {
  const filepaths = [];
  for (const uri of uris) {
    const filepath = await downloadSpecialImage(uri);
    if (filepath) filepaths.push(filepath);
  }
  return filepaths;
}

// Upload a local image to Twitter v1 and return its media_id.
async function uploadToTwitter(filepath) {
  return twitterClient.v1.uploadMedia(filepath, { mimeType: "image/jpeg" });
}

// ─── Birthday posts ───────────────────────────────────────────────────────────

async function checkAndPostBirthday() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstMonth = kst.getUTCMonth() + 1;
  const kstDay = kst.getUTCDate();
  const kstYear = kst.getUTCFullYear();

  const member = MEMBERS.find((m) => m.month === kstMonth && m.day === kstDay);
  if (!member) return;

  const age = kstYear - member.born;
  console.log(`🎂 Today is ${member.name}'s birthday! Turning ${age}.`);

  // Try to get up to 3 special birthday images for this member
  const uris = pickRandomMultiple(getSpecialURIs(member.name), 3);
  const filepaths = await downloadSpecialImages(uris);

  const base =
    `🎂✨ 생일 축하해요 ${member.name}!! ✨🎂\n` +
    `She's turning ${age} today and we LOVE HER SO MUCH ٩(◕‿◕)۶💕\n` +
    `生日快乐！${age}岁的她依然那么耀眼闪亮～ (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧\n` +
    `สุขสันต์วันเกิดนะคะ!! (っ˘ω˘ς )\n` +
    `우리 ${member.name} 영원히 사랑해 ♡( ◡‿◡ )♡\n` +
    `${member.hashtag} #gidle #idle #neverland #여자아이들 #아이들 #네버랜드 #女娃 #kpop`;

  // Twitter
  try {
    const tweetPayload = { text: base };
    if (filepaths.length) {
      const mediaIds = [];
      for (const fp of filepaths) {
        const mediaId = await uploadToTwitter(fp);
        mediaIds.push(mediaId);
      }
      tweetPayload.media = { media_ids: mediaIds };
    }
    await twitterClient.v2.tweet(tweetPayload);
    console.log("Birthday tweet posted to Twitter");
  } catch (e) {
    console.error("Error posting birthday tweet to Twitter:", e);
  }

  // Bluesky
  try {
    await postToBluesky(
      `${base}\nFollow on X: ${X_PROFILE_URL}\nFollow on Mastodon: ${MASTODON_PROFILE_URL}`,
      filepaths,
    );
    console.log("Birthday post sent to Bluesky");
  } catch (e) {
    console.error("Error posting birthday post to Bluesky:", e);
  }

  // Mastodon
  try {
    await postToMastodon(
      `${base}\nFollow on X: ${X_PROFILE_URL}\nFollow on Bluesky: ${BLUESKY_PROFILE_URL}`,
      filepaths,
    );
    console.log("Birthday post sent to Mastodon");
  } catch (e) {
    console.error("Error posting birthday post to Mastodon:", e);
  }
}

// ─── Debut Anniversary ────────────────────────────────────────────────────────
// (G)I-DLE debuted on May 2, 2018.

const DEBUT_YEAR = 2018;
const DEBUT_MONTH = 5;
const DEBUT_DAY = 2;

async function checkAndPostAnniversary() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstMonth = kst.getUTCMonth() + 1;
  const kstDay = kst.getUTCDate();
  const kstYear = kst.getUTCFullYear();

  if (kstMonth !== DEBUT_MONTH || kstDay !== DEBUT_DAY) return;

  const years = kstYear - DEBUT_YEAR;
  console.log(`🎊 Today is (G)I-DLE's ${years}th debut anniversary!`);

  // Try to get up to 3 special anniversary images
  const uris = pickRandomMultiple(getSpecialURIs("anniversary"), 3);
  const filepaths = await downloadSpecialImages(uris);

  const base =
    `🎊✨ (여자)아이들 데뷔 ${years}주년을 축하해요!! ✨🎊\n` +
    `${years} years of (G)I-DLE and we're so PROUD (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧💕\n` +
    `出道${years}周年快乐！感谢你们这${years}年带给我们的一切～ (っ˘ω˘ς )\n` +
    `ครบรอบ ${years} ปีเดบิวต์นะคะ!! ٩(◕‿◕)۶\n` +
    `네버랜드와 함께한 ${years}년 영원히 사랑해 ♡( ◡‿◡ )♡\n` +
    `#gidle #idle #neverland #여자아이들 #아이들 #네버랜드 #女娃 #kpop`;

  // Twitter
  try {
    const tweetPayload = { text: base };
    if (filepaths.length) {
      const mediaIds = [];
      for (const fp of filepaths) {
        const mediaId = await uploadToTwitter(fp);
        mediaIds.push(mediaId);
      }
      tweetPayload.media = { media_ids: mediaIds };
    }
    await twitterClient.v2.tweet(tweetPayload);
    console.log("Anniversary tweet posted to Twitter");
  } catch (e) {
    console.error("Error posting anniversary tweet to Twitter:", e);
  }

  // Bluesky
  try {
    await postToBluesky(
      `${base}\nFollow on X: ${X_PROFILE_URL}\nFollow on Mastodon: ${MASTODON_PROFILE_URL}`,
      filepaths,
    );
    console.log("Anniversary post sent to Bluesky");
  } catch (e) {
    console.error("Error posting anniversary post to Bluesky:", e);
  }

  // Mastodon
  try {
    await postToMastodon(
      `${base}\nFollow on X: ${X_PROFILE_URL}\nFollow on Bluesky: ${BLUESKY_PROFILE_URL}`,
      filepaths,
    );
    console.log("Anniversary post sent to Mastodon");
  } catch (e) {
    console.error("Error posting anniversary post to Mastodon:", e);
  }
}

// ─── Cron starters ───────────────────────────────────────────────────────────

function startBirthdayChecker() {
  const job = new CronJob("0 15 * * *", checkAndPostBirthday);
  job.start();
  console.log("Birthday checker started! Runs daily at KST 00:00.");
}

function startAnniversaryChecker() {
  const job = new CronJob("0 15 * * *", checkAndPostAnniversary);
  job.start();
  console.log("Anniversary checker started! Runs daily at KST 00:00.");
}

module.exports = {
  startBirthdayChecker,
  startAnniversaryChecker,
  checkAndPostBirthday,
  checkAndPostAnniversary,
};
