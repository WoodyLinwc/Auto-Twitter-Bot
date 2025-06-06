require("dotenv").config({ path: __dirname + "/.env" });
// require("dotenv").config();
const CronJob = require("cron").CronJob;
const fs = require("fs");

// for Twitter
const { twitterClient } = require("./twitterClient.js");
const { download } = require("./utilities");

// for Instagram
const { IgApiClient } = require("instagram-private-api");
const { get } = require("request-promise");

// Function to determine number of images to post based on probability
const getImageCount = () => {
    const random = Math.random() * 100; // Generate random number 0-100

    if (random < 50) {
        return 1; // 50% chance
    } else if (random < 80) {
        return 2; // 30% chance (50-80)
    } else {
        return 4; // 20% chance (80-100)
    }
};

// Function to get multiple unique random images
const getRandomImages = (count) => {
    const uris = JSON.parse(fs.readFileSync("uris.json", "utf8"));
    const selectedImages = [];
    const usedIndices = new Set();

    // Ensure we don't try to get more images than available
    const maxCount = Math.min(count, uris.length);

    while (selectedImages.length < maxCount) {
        const randomIndex = Math.floor(Math.random() * uris.length);

        // Only add if we haven't used this index before
        if (!usedIndices.has(randomIndex)) {
            usedIndices.add(randomIndex);
            selectedImages.push({
                uri: uris[randomIndex],
                filename: uris[randomIndex].substring(
                    uris[randomIndex].lastIndexOf("/") + 1
                ),
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

const tweet = async () => {
    // read the uris.json file and randomly choose a image
    const uris = JSON.parse(fs.readFileSync("uris.json", "utf8"));
    const randomIndex = Math.floor(Math.random() * uris.length);
    const uri = uris[randomIndex];
    // const uri = "https://example.com/images/image_210.JPG";

    // name the image
    const directory = "./img";
    const filename = uri.substring(uri.lastIndexOf("/") + 1);
    // console.log(filename);
    // Output: "image_210.JPG"
    const filepath = `${directory}/${filename}`;

    // download the image from my GitHub album
    download(uri, filepath, async function (err) {
        try {
            const mediaId = await twitterClient.v1.uploadMedia(filepath, {
                mimeType: "image/jpeg",
            });
            // console.log(mediaId);
            await twitterClient.v2.tweet({
                text: "#GIDLE #IDLE #여자아이들 #아이들 #女娃",
                media: {
                    media_ids: [mediaId],
                    // get the id @G_I_DLE, https://tweeterid.com/
                    tagged_user_ids: ["967000437797761024"],
                },
            });

            // write the selected URI to a separate file for record-keeping
            fs.appendFileSync("postRecord.txt", `${uri}\n`);
        } catch (e) {
            console.error(e);
        }
    });
};

// New function for multi-image posting with probability
const tweetMultiple = async () => {
    try {
        // Determine how many images to post
        const imageCount = getImageCount();
        // console.log(`Posting ${imageCount} image(s)`);

        // Get random images
        const selectedImages = getRandomImages(imageCount);

        // Download all images
        const downloadedImages = await downloadImages(selectedImages);

        // Upload all images to Twitter and get media IDs
        const mediaIds = [];
        for (const image of downloadedImages) {
            const mediaId = await twitterClient.v1.uploadMedia(image.filepath, {
                mimeType: "image/jpeg",
            });
            mediaIds.push(mediaId);
            // console.log(`Uploaded ${image.filepath}, Media ID: ${mediaId}`);
        }

        // Create the tweet with all media
        await twitterClient.v2.tweet({
            text: "#GIDLE #IDLE #여자아이들 #아이들 #女娃",
            media: {
                media_ids: mediaIds,
                // get the id @G_I_DLE, https://tweeterid.com/
                tagged_user_ids: ["967000437797761024"],
            },
        });

        // Record all posted URIs
        const recordEntries =
            downloadedImages.map((img) => img.uri).join("\n") + "\n";
        fs.appendFileSync("postRecord.txt", recordEntries);

        // console.log(`Successfully posted ${imageCount} image(s)`);
    } catch (e) {
        console.error("Error posting tweet:", e);
    }
};

// check the complete code here https://github.com/WoodyLinwc/Auto-Instagram-Bot
const postToInsta = async () => {
    const ig = new IgApiClient();
    const sharp = require("sharp");
    ig.state.generateDevice(process.env.IG_USERNAME);
    await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);

    // read the uris.json file and randomly choose a image
    const uris = JSON.parse(fs.readFileSync("uris.json", "utf8"));
    const randomIndex = Math.floor(Math.random() * uris.length);
    const uri = uris[randomIndex];

    const imageBuffer = await get({
        url: uri,
        encoding: null,
    });

    // convert the image to acceptable format
    const jpegBuffer = await sharp(imageBuffer).jpeg().toBuffer();

    await ig.publish.photo({
        file: jpegBuffer,
        caption: "#GIDLE #여자아이들",
    });
};

// tweet();
// postToInsta();

// post once every 6 hours
const cronPost = new CronJob("0 */6 * * *", async () => {
    tweetMultiple();
    // postToInsta();
});
cronPost.start();
