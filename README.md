# Auto-Twitter-Bot

## Twitter Developer Account
- Be sure to have a Twitter developer account ready. [Here](https://developer.twitter.com/en/portal/dashboard)

- We need Consumer Keys (API Keys, Serect) and Authentication Tokens (Access Token and Secret).
![Keys](./note/keys.png) Keep them in a safe place and not reveal to others.

## Dependencies
- Check if you have Node.js and npm installed in the terminal
`node -v` and `npm -v`.

- Download the necessary components
```
npm install twitter-api-v2
npm install dotenv
npm install cron
npm install fs
npm install request
```

- Create a `.env` file and replace your values you created on the Twitter developer platform. Note that APP_ID is the first few numbers of ACCESS_TOKEN
```
NODE_ENV="development"
API_KEY = "XXXXXX"
API_SECRET = "YYYYYY"
ACCESS_TOKEN = "12345-ZZZZ"
ACCESS_SECRET = "WWWWWWW"
BEARER_TOKEN = "AAAAAAA"
APP_ID = "12345"
```

- You have to also create a `.gitignore` file to hide these sensitive values from other people.

## Environment
- I don't want to set up the Twitter bot locally, so I build a Linux environment inside a EC2 instance of AWS (free tier, free for the first year).

- I use pm2 to keep my `index.js` running. By default, pm2 will keep the process running even after disconnecting from the SSH session. 
![pm2](./note/pm2.png)
You can download it by typing `sudo npm install -g pm2` in the terminal.

## Limitations
- I still have to manually filter the image and add the image direct link to a JSON file.

- I use igmur to keep all my images online.

## License and Credits
MIT License. Inspired by the Twitter Bot tutorial from [Ryan Carmody](https://www.ryancarmody.dev/about)
