require("dotenv").config()
const { Client, GatewayIntentBits } = require("discord.js")
const { TwitterApi } = require("twitter-api-v2")

// Configuration
const CONFIG = {
  TWITTER_USER_ID: process.env.TWITTER_USER_ID,
  DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,
  CHECK_INTERVAL: 15 * 60 * 1000, // 15 minutes in milliseconds
  TWEET_PARAMS: {
    exclude: ["replies"],
    max_results: 5,
  },
}

// Initialize clients
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
})

// State
let lastTweetId = null

// Helper functions
const formatRateLimitInfo = (rateLimit) => ({
  remaining: rateLimit.remaining,
  limit: rateLimit.limit,
  reset: new Date(rateLimit.reset * 1000).toLocaleTimeString(),
  nextResetIn: `${Math.ceil(
    (rateLimit.reset * 1000 - Date.now()) / 1000 / 60
  )} minutes`,
})

const sendTweetToDiscord = async (channel, tweetId, isInitial = false) => {
  const message = isInitial
    ? `🔔 Hey @everyone check out this post!`
    : `🚨 New post alert @everyone!`

  await channel.send({
    content: `${message}\nhttps://x.com/user/status/${tweetId}`,
  })
  console.log(
    `${isInitial ? "Initial" : "New"} tweet sent successfully to Discord`
  )
}

const handleRateLimit = async (error) => {
  const resetTime = error.rateLimit.reset * 1000
  const waitTime = resetTime - Date.now()
  console.warn("Rate limit exceeded. Details:", {
    resetTime: new Date(resetTime).toLocaleString(),
    waitTime: `${Math.ceil(waitTime / 1000)} seconds`,
    error: error.message,
  })
  await new Promise((resolve) => setTimeout(resolve, waitTime))
  return checkForNewTweets()
}

// Main tweet checking function
async function checkForNewTweets() {
  try {
    console.log("Starting tweet check...")
    const params = { ...CONFIG.TWEET_PARAMS }

    if (lastTweetId) {
      params.since_id = lastTweetId
      console.log(`Checking tweets since ID: ${lastTweetId}`)
    }

    const tweets = await twitterClient.v2.userTimeline(
      CONFIG.TWITTER_USER_ID,
      params
    )
    console.log(`Found ${tweets.data.data?.length || 0} tweets`)

    if (!tweets.data.data?.length) {
      console.log("No tweets found in response")
      return
    }

    const channel = discordClient.channels.cache.get(CONFIG.DISCORD_CHANNEL_ID)
    if (!channel) {
      throw new Error(
        `Could not find Discord channel with ID: ${CONFIG.DISCORD_CHANNEL_ID}`
      )
    }

    const latestTweet = tweets.data.data[0]
    const isInitialTweet = lastTweetId === null
    const isNewTweet = latestTweet.id !== lastTweetId

    if (isInitialTweet || isNewTweet) {
      await sendTweetToDiscord(channel, latestTweet.id, isInitialTweet)
      lastTweetId = latestTweet.id
      console.log(
        `${
          isInitialTweet ? "Initial" : "Updated"
        } tweet ID set to: ${lastTweetId}`
      )
    }

    console.log(
      "Twitter API Rate limits:",
      formatRateLimitInfo(tweets.rateLimit)
    )
  } catch (error) {
    if (error.code === 429) return handleRateLimit(error)

    console.error("Error checking for tweets:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    })
  } finally {
    console.log("Tweet check completed at:", new Date().toISOString())
  }
}

// Discord bot initialization
discordClient.once("ready", () => {
  console.log(`Logged in as ${discordClient.user.tag}`)

  const channel = discordClient.channels.cache.get(CONFIG.DISCORD_CHANNEL_ID)
  if (!channel) {
    console.error("Invalid Discord Channel ID! Make sure it's correct.")
    process.exit(1)
  }

  console.log(`Bot will send messages to: #${channel.name}`)
  checkForNewTweets()
  setInterval(checkForNewTweets, CONFIG.CHECK_INTERVAL)
  console.log(
    `Tweet checks scheduled every ${CONFIG.CHECK_INTERVAL / 1000 / 60} minutes`
  )
})

discordClient.login(process.env.DISCORD_TOKEN)
