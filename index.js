require("dotenv").config({ path: __dirname + "/.env" });
// require("dotenv").config();
const CronJob = require("cron").CronJob;
const fs = require("fs");

// for Twitter
const { twitterClient } = require("./twitterClient.js")
const { download } = require("./utilities");

// for Instagram
const { IgApiClient } = require('instagram-private-api');
const { get } = require('request-promise');

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
  download(uri, filepath, async function(err){
    try {
      const mediaId = await twitterClient.v1.uploadMedia(filepath, {
        mimeType: "image/jpeg"
      });
      console.log(mediaId);
      await twitterClient.v2.tweet({
        text: "#GIDLE #IDLE #여자아이들 #아이들 #女娃",
        media: {
          media_ids: [mediaId],
          // get the id @G_I_DLE, https://tweeterid.com/
          tagged_user_ids: ['967000437797761024'],
        }
      });

      // write the selected URI to a separate file for record-keeping
      fs.appendFileSync("postRecord.txt", `${uri}\n`);

    } catch (e) {
      console.error(e);
    }
  });
};

// check the complete code here https://github.com/WoodyLinwc/Auto-Instagram-Bot
const postToInsta = async () => {
  const ig = new IgApiClient();
  const sharp = require('sharp');
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
    tweet();
    // postToInsta();
});
cronPost.start();




