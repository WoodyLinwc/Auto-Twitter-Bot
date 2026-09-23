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

// Platform text limits.
// X: 280 "weighted" chars — CJK, Hangul and emoji count as 2 each.
// Bluesky: 300 graphemes (links count in full).
// Mastodon: 500 chars (links count as 23).
const X_LIMIT = 280;
const BLUESKY_LIMIT = 300;

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

// (G)I-DLE debuted on May 2, 2018.
const DEBUT_YEAR = 2018;
const DEBUT_MONTH = 5;
const DEBUT_DAY = 2;

const SHORT_HASHTAGS = "#gidle #여자아이들 #neverland #女娃";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Current date in Korea, independent of the server's timezone.
function getKSTDate() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}

// Approximate X's weighted length: chars in the Latin/Thai/etc. ranges
// count as 1, everything else (CJK, Hangul, emoji…) counts as 2.
function xWeightedLength(text) {
  let len = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const light =
      (cp >= 0 && cp <= 4351) ||
      (cp >= 8192 && cp <= 8205) ||
      (cp >= 8208 && cp <= 8223) ||
      (cp >= 8242 && cp <= 8247);
    len += light ? 1 : 2;
  }
  return len;
}

// Count user-perceived characters (what Bluesky limits on).
function graphemeLength(text) {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...seg.segment(text)].length;
}

// Log a clear warning if a post is over a platform's limit, so a too-long
// caption shows up in `pm2 logs` instead of failing silently.
function checkLengths(label, xText, bskyText) {
  const x = xWeightedLength(xText);
  const b = graphemeLength(bskyText);
  console.log(
    `[${label}] length check — X: ${x}/${X_LIMIT}, Bluesky: ${b}/${BLUESKY_LIMIT}`,
  );
  if (x > X_LIMIT)
    console.warn(`⚠️  [${label}] X text is too long (${x}/${X_LIMIT})`);
  if (b > BLUESKY_LIMIT)
    console.warn(
      `⚠️  [${label}] Bluesky text is too long (${b}/${BLUESKY_LIMIT})`,
    );
}

// ─── Special image helpers ────────────────────────────────────────────────────

// Load special_uris.json and return the image pool for a given key
// (member name or "anniversary"). Returns [] if the key is missing or empty.
function getSpecialURIs(key) {
  try {
    const data = JSON.parse(
      fs.readFileSync(__dirname + "/special_uris.json", "utf8"),
    );
    return data[key] || [];
  } catch (e) {
    console.error("Error reading special_uris.json:", e);
    return [];
  }
}

// Pick up to `count` unique random URIs from a pool.
function pickRandomMultiple(pool, count = 3) {
  if (!pool.length) return [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Download a single image to ./img/ and return its local filepath,
// or null if the download fails or produces an empty file.
async function downloadSpecialImage(uri) {
  const filepath = `./img/${uri.substring(uri.lastIndexOf("/") + 1)}`;
  try {
    await new Promise((resolve, reject) => {
      download(uri, filepath, (err) => (err ? reject(err) : resolve()));
    });
    if (!fs.existsSync(filepath) || fs.statSync(filepath).size === 0) {
      throw new Error("downloaded file is empty");
    }
    return filepath;
  } catch (e) {
    console.error(`Failed to download special image ${uri}:`, e);
    return null;
  }
}

// Download multiple images; skips any that fail.
async function downloadSpecialImages(uris) {
  const filepaths = [];
  for (const uri of uris) {
    const filepath = await downloadSpecialImage(uri);
    if (filepath) filepaths.push(filepath);
  }
  return filepaths;
}

// Pick and download up to 3 special images for a key. Never throws.
async function prepareImages(key) {
  try {
    return await downloadSpecialImages(
      pickRandomMultiple(getSpecialURIs(key), 3),
    );
  } catch (e) {
    console.error(`Error preparing special images for ${key}:`, e);
    return [];
  }
}

// ─── Posting ─────────────────────────────────────────────────────────────────

// Post to all three platforms. Each platform is independent: one failing
// never blocks the others. On X, an image that fails to upload is skipped
// instead of killing the whole tweet.
async function postEverywhere(
  label,
  { xText, bskyText, mastodonText },
  filepaths,
) {
  // X
  try {
    const mediaIds = [];
    for (const fp of filepaths) {
      try {
        mediaIds.push(
          await twitterClient.v1.uploadMedia(fp, { mimeType: "image/jpeg" }),
        );
      } catch (e) {
        console.error(`[${label}] X media upload failed for ${fp}:`, e);
      }
    }
    const payload = { text: xText };
    if (mediaIds.length) payload.media = { media_ids: mediaIds };
    await twitterClient.v2.tweet(payload);
    console.log(`[${label}] Posted to X`);
  } catch (e) {
    console.error(`[${label}] Error posting to X:`, e);
  }

  // Bluesky
  try {
    await postToBluesky(bskyText, filepaths);
    console.log(`[${label}] Posted to Bluesky`);
  } catch (e) {
    console.error(`[${label}] Error posting to Bluesky:`, e);
  }

  // Mastodon
  try {
    await postToMastodon(mastodonText, filepaths);
    console.log(`[${label}] Posted to Mastodon`);
  } catch (e) {
    console.error(`[${label}] Error posting to Mastodon:`, e);
  }
}

// ─── Birthday posts ───────────────────────────────────────────────────────────

function buildBirthdayTexts(member, age, belated = false) {
  const intro = belated
    ? `🎂✨ 늦었지만 생일 축하해요 ${member.name}!! ✨🎂\n` +
      `Happy belated birthday to our ${member.name}, now ${age} 💕\n`
    : `🎂✨ 생일 축하해요 ${member.name}!! ✨🎂\n` +
      `Happy birthday to our ${member.name}, turning ${age} today 💕\n`;

  const base =
    intro +
    `生日快乐！${age}岁的${member.name}依然闪闪发光～ ✧\n` +
    `สุขสันต์วันเกิดนะคะ!! ♡\n` +
    `${member.hashtag} ${SHORT_HASHTAGS}`;

  return {
    xText: base,
    bskyText: `${base}\nFollow on X: ${X_PROFILE_URL}`,
    mastodonText: `${base}\nFollow on X: ${X_PROFILE_URL}\nFollow on Bluesky: ${BLUESKY_PROFILE_URL}`,
  };
}

// memberName: force a specific member (for manual/belated posts).
// options.dryRun: print the texts and lengths without posting anything.
async function checkAndPostBirthday(memberName = null, options = {}) {
  const { dryRun = false, belated = false } = options;
  const today = getKSTDate();

  const member = memberName
    ? MEMBERS.find((m) => m.name.toLowerCase() === memberName.toLowerCase())
    : MEMBERS.find((m) => m.month === today.month && m.day === today.day);

  if (!member) {
    if (memberName) console.error(`No member named "${memberName}"`);
    return;
  }

  const age = today.year - member.born;
  console.log(`🎂 Birthday post for ${member.name} (${age}).`);

  const texts = buildBirthdayTexts(member, age, belated);
  checkLengths(`${member.name} birthday`, texts.xText, texts.bskyText);

  if (dryRun) {
    console.log("---- X ----\n" + texts.xText);
    console.log("---- Bluesky ----\n" + texts.bskyText);
    console.log("---- Mastodon ----\n" + texts.mastodonText);
    return;
  }

  const filepaths = await prepareImages(member.name);
  await postEverywhere(`${member.name} birthday`, texts, filepaths);
}

// ─── Debut Anniversary ────────────────────────────────────────────────────────

function buildAnniversaryTexts(years) {
  const base =
    `🎊✨ (여자)아이들 데뷔 ${years}주년 축하해요!! ✨🎊\n` +
    `${years} years of (G)I-DLE and we're so PROUD 💕\n` +
    `出道${years}周年快乐！感谢一路陪伴～ ✧\n` +
    `ครบรอบ ${years} ปีเดบิวต์นะคะ!! ♡\n` +
    SHORT_HASHTAGS;

  return {
    xText: base,
    bskyText: `${base}\nFollow on X: ${X_PROFILE_URL}`,
    mastodonText: `${base}\nFollow on X: ${X_PROFILE_URL}\nFollow on Bluesky: ${BLUESKY_PROFILE_URL}`,
  };
}

async function checkAndPostAnniversary(options = {}) {
  const { dryRun = false, force = false } = options;
  const today = getKSTDate();

  if (!force && (today.month !== DEBUT_MONTH || today.day !== DEBUT_DAY))
    return;

  const years = today.year - DEBUT_YEAR;
  console.log(`🎊 (G)I-DLE ${years}th debut anniversary post.`);

  const texts = buildAnniversaryTexts(years);
  checkLengths("anniversary", texts.xText, texts.bskyText);

  if (dryRun) {
    console.log("---- X ----\n" + texts.xText);
    console.log("---- Bluesky ----\n" + texts.bskyText);
    console.log("---- Mastodon ----\n" + texts.mastodonText);
    return;
  }

  const filepaths = await prepareImages("anniversary");
  await postEverywhere("anniversary", texts, filepaths);
}

// ─── Cron starters ───────────────────────────────────────────────────────────
// Timezone is set explicitly, so this runs at KST 00:00 no matter what
// timezone the server itself is in.

function startBirthdayChecker() {
  const job = new CronJob(
    "0 0 * * *",
    () =>
      checkAndPostBirthday().catch((e) =>
        console.error("Birthday job error:", e),
      ),
    null,
    true,
    "Asia/Seoul",
  );
  console.log("Birthday checker started! Runs daily at KST 00:00.");
  return job;
}

function startAnniversaryChecker() {
  const job = new CronJob(
    "0 0 * * *",
    () =>
      checkAndPostAnniversary().catch((e) =>
        console.error("Anniversary job error:", e),
      ),
    null,
    true,
    "Asia/Seoul",
  );
  console.log("Anniversary checker started! Runs daily at KST 00:00.");
  return job;
}

// ─── Manual use from the command line ────────────────────────────────────────
//   node birthdayPost.js --member Yuqi --dry-run      preview only, posts nothing
//   node birthdayPost.js --member Yuqi --belated      really posts a belated wish
//   node birthdayPost.js --anniversary --dry-run      preview anniversary post
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const belated = args.includes("--belated");
  const memberIdx = args.indexOf("--member");

  (async () => {
    if (args.includes("--anniversary")) {
      await checkAndPostAnniversary({ dryRun, force: true });
    } else if (memberIdx !== -1 && args[memberIdx + 1]) {
      await checkAndPostBirthday(args[memberIdx + 1], { dryRun, belated });
    } else {
      console.log(
        "Usage: node birthdayPost.js --member <Name> [--dry-run] [--belated]",
      );
      console.log("       node birthdayPost.js --anniversary [--dry-run]");
    }
  })().catch((e) => console.error(e));
}

module.exports = {
  startBirthdayChecker,
  startAnniversaryChecker,
  checkAndPostBirthday,
  checkAndPostAnniversary,
};
