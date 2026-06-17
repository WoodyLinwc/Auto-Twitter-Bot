require("dotenv").config();
const { postToMastodon } = require("./mastodonClient");

postToMastodon("测试一下 #test")
  .then(() => console.log("成功!"))
  .catch((e) => console.error("失败:", e));
