require("dotenv").config();
console.log("URL:", process.env.MASTODON_API_URL);
console.log("TOKEN:", process.env.MASTODON_ACCESS_TOKEN);
const { postToMastodon } = require("./mastodonClient");

postToMastodon("测试一下 #test")
  .then(() => console.log("成功!"))
  .catch((e) => console.error("失败:", e));
