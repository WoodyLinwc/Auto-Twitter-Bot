// https://www.ryancarmody.dev/blog/creating-a-twitter-bot-with-nodejs-api
// https://www.youtube.com/@codewithryan4646/videos

require("dotenv").config({ path: __dirname + "/.env" });
const { twitterClient } = require("./twitterClient.js")
const CronJob = require("cron").CronJob;
const { download } = require("./utilities");
// const express = require('express')
// const app = express()
// const port = process.env.PORT || 4000;

// app.listen(port, () => {
//   console.log(`Listening on port ${port}`)
// })

const tweet = async () => {
  const uri = "https://i.imgur.com/Zl2GLjnh.jpg";
  const directory = "./img";
  const filename = "image.png";
  const filepath = `${directory}/${filename}`;

  download(uri, filepath, async function(err){
    try {
      const mediaId = await twitterClient.v1.uploadMedia(filepath);
      console.log(mediaId);
      await twitterClient.v2.tweet({
        text: "Hello world! This is an image in Ukraine!",
        media: {
          media_ids: [mediaId]
        }
      });
    } catch (e) {
      console.error(e);
    }
  });
};

tweet();

// const cronTweet = new CronJob("0 */12 * * *", async () => {
//     tweet();
// });
  
// cronTweet.start();




