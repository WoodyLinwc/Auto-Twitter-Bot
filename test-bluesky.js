require("dotenv").config();
const { postToBluesky } = require("./blueskyClient");
console.log("HANDLE:", process.env.BSKY_HANDLE);
console.log("PASSWORD:", process.env.BSKY_APP_PASSWORD);

postToBluesky("测试一下 #test")
  .then(() => console.log("成功!"))
  .catch((e) => console.error("失败:", e));
