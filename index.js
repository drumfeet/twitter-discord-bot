require("dotenv").config()
const { Client, GatewayIntentBits } = require("discord.js")
const { TwitterApi } = require("twitter-api-v2")

// Helper functions for time formatting
function formatUTCTime(date) {
  return new Date(date).toUTCString()
}

function getTwitterFormattedTime(date) {
  return new Date(date).toISOString()
}

// Update CONFIG to use Twitter's expected format
const CONFIG = {
  TWITTER_USER_ID: process.env.TWITTER_USER_ID,
  DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,
  CHECK_INTERVAL: 15 * 60 * 1000, // 15 minutes
  TWEET_PARAMS: {
    exclude: ["replies"],
    max_results: 5,
    start_time: getTwitterFormattedTime(new Date()), // ISO 8601 format for Twitter API
  },
}

// Helper function for UTC time formatting
function formatUTCTime(date) {
  return new Date(date).toUTCString()
}

// State tracking
let lastProcessedTweetId = null

// Initialize clients
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

// Initialize Twitter client with User Auth (OAuth 1.0a)
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
})

async function sendTweetToDiscord(channel, tweet) {
  try {
    await channel.send({
      content: `🔔 New post alert @everyone\nhttps://x.com/user/status/${tweet.id}`,
    })
    console.log(
      `Tweet ${tweet.id} sent to Discord at ${formatUTCTime(new Date())}`
    )
  } catch (error) {
    console.error(
      `Error sending tweet to Discord at ${formatUTCTime(new Date())}:`,
      error.message
    )
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function checkForNewTweets() {
  try {
    console.log(`Checking for new tweets at ${formatUTCTime(new Date())}...`)

    const tweets = await twitterClient.v2.userTimeline(
      CONFIG.TWITTER_USER_ID,
      CONFIG.TWEET_PARAMS
    )

    const resetTime = new Date(tweets.rateLimit.reset * 1000)
    console.log("Rate limits:", {
      remaining: tweets.rateLimit.remaining,
      reset: formatUTCTime(resetTime),
      nextResetIn: `${Math.ceil(
        (resetTime - Date.now()) / 1000 / 60
      )} minutes (${formatUTCTime(resetTime)})`,
    })

    if (!tweets.data.data?.length) {
      return console.log(`No new tweets found at ${formatUTCTime(new Date())}`)
    }

    const channel = discordClient.channels.cache.get(CONFIG.DISCORD_CHANNEL_ID)
    if (!channel) {
      return console.error(
        `Discord channel not found at ${formatUTCTime(new Date())}!`
      )
    }

    const newTweets = tweets.data.data.filter(
      (tweet) => !lastProcessedTweetId || tweet.id > lastProcessedTweetId
    )

    if (newTweets.length === 0) {
      return console.log(
        `No new tweets since last check at ${formatUTCTime(new Date())}`
      )
    }

    lastProcessedTweetId = newTweets[0].id
    console.log(
      `Updated last processed tweet ID to: ${lastProcessedTweetId} at ${formatUTCTime(
        new Date()
      )}`
    )

    for (const tweet of newTweets.reverse()) {
      await sendTweetToDiscord(channel, tweet)
    }
  } catch (error) {
    if (error.code === 429) {
      const resetTime = error.rateLimit.reset * 1000
      const waitTime = resetTime - Date.now()
      const waitMinutes = Math.ceil(waitTime / 1000 / 60)

      console.warn(
        `Rate limit hit at ${formatUTCTime(
          new Date()
        )}. Retrying in ${waitMinutes} minutes (at ${formatUTCTime(
          new Date(Date.now() + waitTime)
        )})...`
      )
      await sleep(waitTime)
      console.log(
        `Rate limit reset at ${formatUTCTime(new Date())}, retrying...`
      )
      return checkForNewTweets()
    } else if (error.code === 403) {
      console.error("Twitter API Authentication Error:", {
        message: error.message,
        code: error.code,
        data: error.data, // This might contain more details
        timestamp: formatUTCTime(new Date()),
      })
    }
    console.error("Error:", {
      message: error.message,
      code: error.code,
      timestamp: formatUTCTime(new Date()),
    })
  }
}

discordClient.once("ready", () => {
  console.log(
    `Logged in as ${discordClient.user.tag} at ${formatUTCTime(new Date())}`
  )

  const channel = discordClient.channels.cache.get(CONFIG.DISCORD_CHANNEL_ID)
  if (!channel) {
    console.error(`Invalid Discord channel ID at ${formatUTCTime(new Date())}!`)
    process.exit(1)
  }

  console.log(
    `Connected to channel: #${channel.name} at ${formatUTCTime(new Date())}`
  )
  console.log(
    `Checking for tweets every ${
      CONFIG.CHECK_INTERVAL / 1000 / 60
    } minutes starting at ${formatUTCTime(new Date())}`
  )

  checkForNewTweets()
  setInterval(checkForNewTweets, CONFIG.CHECK_INTERVAL)
})

discordClient.on("error", (error) => {
  console.error(`Discord client error at ${formatUTCTime(new Date())}:`, error)
})

process.on("unhandledRejection", (error) => {
  console.error(
    `Unhandled promise rejection at ${formatUTCTime(new Date())}:`,
    error
  )
})

discordClient.login(process.env.DISCORD_TOKEN)
