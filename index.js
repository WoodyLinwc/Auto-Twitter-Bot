require("dotenv").config({ path: __dirname + "/.env" });
const { twitterClient } = require("./twitterClient.js")
const CronJob = require("cron").CronJob;
const { download } = require("./utilities");
const fs = require("fs");

const tweet = async () => {
  // read the uris.json file and randomly choose a image
  const uris = JSON.parse(fs.readFileSync("uris.json", "utf8"));
  const randomIndex = Math.floor(Math.random() * uris.length);
  const uri = uris[randomIndex];

  // name the image
  const directory = "./img";
  const filename = uri.substring(uri.lastIndexOf("/") + 1);
  const filepath = `${directory}/${filename}`;

  // download the image from my igmur album
  download(uri, filepath, async function(err){
    try {
      const mediaId = await twitterClient.v1.uploadMedia(filepath);
      console.log(mediaId);
      await twitterClient.v2.tweet({
        text: "#GIDLE #여자아이들",
        media: {
          media_ids: [mediaId]
        }
      });
    } catch (e) {
      console.error(e);
    }
  });
};

// tweet(); 
// post once every 4 hours
const cronTweet = new CronJob("0 */4 * * *", async () => {
    tweet();
});
  
cronTweet.start();




