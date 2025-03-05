require("dotenv").config()
const { TwitterApi } = require("twitter-api-v2")

// Initialize Twitter client
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
})

// Twitter username (without @)
const TWITTER_USERNAME = process.env.TWITTER_USERNAME // Replace with the username

async function getUserId() {
  try {
    const user = await twitterClient.v2.userByUsername(TWITTER_USERNAME)
    console.log(`User ID for ${TWITTER_USERNAME}: ${user.data.id}`)
  } catch (error) {
    console.error("Error fetching user ID:", error)
  }
}

getUserId()
