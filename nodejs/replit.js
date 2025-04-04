require("dotenv").config()
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js")
const { TwitterApi } = require("twitter-api-v2")
const express = require("express")

// Initialize Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

// Initialize Twitter client
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
})

// Twitter user ID to monitor
const TWITTER_USER_ID = process.env.TWITTER_USER_ID
// Discord channel ID to post tweets to
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID

let lastTweetId = null

async function checkForNewTweets() {
  try {
    console.log("Starting tweet check...")
    const params = {
      exclude: ["replies"],
      max_results: 5,
    }

    if (lastTweetId) {
      params.since_id = lastTweetId
      console.log(`Checking tweets since ID: ${lastTweetId}`)
    } else {
      console.log("First run - checking latest tweets")
    }

    const tweets = await twitterClient.v2.userTimeline(TWITTER_USER_ID, params)
    console.log(`Found ${tweets.data.data?.length || 0} tweets`)

    // Process tweets first before checking rate limits
    if (tweets.data.data && tweets.data.data.length > 0) {
      const latestTweet = tweets.data.data[0]
      console.log("latestTweet", latestTweet)

      // Store the latest post ID and send it to Discord on the first run
      if (lastTweetId === null) {
        console.log("Initializing with first tweet...")
        const channel = client.channels.cache.get(DISCORD_CHANNEL_ID)

        if (channel) {
          console.log(`Sending to channel: #${channel.name}`)
          await channel.send({
            content: `🔔 Hey @everyone check out this post!\nhttps://x.com/user/status/${latestTweet.id}`,
          })
          console.log("Initial post sent successfully to Discord")
        } else {
          console.error(
            `Could not find Discord channel with ID: ${DISCORD_CHANNEL_ID}`
          )
        }

        lastTweetId = latestTweet.id
        console.log(`Initial tweet ID set to: ${lastTweetId}`)
        return
      }

      // If there's a new post
      if (latestTweet.id !== lastTweetId) {
        console.log("New tweet detected!")
        console.log(`Previous tweet ID: ${lastTweetId}`)
        console.log(`New tweet ID: ${latestTweet.id}`)

        const channel = client.channels.cache.get(DISCORD_CHANNEL_ID)
        if (channel) {
          console.log(`Sending new tweet to channel: #${channel.name}`)
          await channel.send({
            content: `🚨 New post alert @everyone!\nhttps://x.com/user/status/${latestTweet.id}`,
          })
          console.log("New tweet sent successfully to Discord")
        } else {
          console.error(
            `Could not find Discord channel with ID: ${DISCORD_CHANNEL_ID}`
          )
        }

        lastTweetId = latestTweet.id
        console.log(`Updated lastTweetId to: ${lastTweetId}`)
      } else {
        console.log("No new tweets found")
      }
    } else {
      console.log("No tweets found in response")
    }

    // Log rate limit info after processing tweets
    console.log("Twitter API Rate limits:", {
      remaining: tweets.rateLimit.remaining,
      limit: tweets.rateLimit.limit,
      reset: new Date(tweets.rateLimit.reset * 1000).toLocaleTimeString(),
      nextResetIn: `${Math.ceil(
        (tweets.rateLimit.reset * 1000 - Date.now()) / 1000 / 60
      )} minutes`,
    })
  } catch (error) {
    if (error.code === 429) {
      const resetTime = error.rateLimit.reset * 1000
      const waitTime = resetTime - Date.now()
      console.warn(`Rate limit exceeded. Details:`, {
        resetTime: new Date(resetTime).toLocaleString(),
        waitTime: `${Math.ceil(waitTime / 1000)} seconds`,
        error: error.message,
      })
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      return checkForNewTweets()
    }

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

// When Discord bot is ready
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`)

  const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID)
  if (!channel) {
    console.error("Invalid Discord Channel ID! Make sure it's correct.")
  } else {
    console.log(`Bot will send messages to: #${channel.name}`)
  }

  // Run initial check immediately
  checkForNewTweets()

  // Then run every 15 minutes
  setInterval(checkForNewTweets, 15 * 60 * 1000) // 15 minutes in milliseconds

  console.log(`Tweet checks scheduled every 15 minutes`)
})

// Login to Discord
client.login(process.env.DISCORD_TOKEN)

// Set up Express server
const app = express()
const PORT = process.env.PORT || 3000

app.get("/", (req, res) => {
  res.send("Twitter-Discord Bot is running!")
})

app.get("/status", (req, res) => {
  res.json({
    status: "online",
    lastCheck: new Date().toISOString(),
    discordConnected: client.isReady(),
    lastTweetId: lastTweetId,
  })
})

app.get("/ping", (req, res) => {
  res.status(200).send("OK")
  console.log("Ping received to keep bot alive: " + new Date().toISOString())
})

// Start Express server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Web server running at http://0.0.0.0:${PORT}`)
  console.log(
    `For Replit dev environment, access at: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
  )
})

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error)
})

// Add graceful shutdown
process.on("SIGINT", () => {
  console.log("Gracefully shutting down...")
  server.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})

client.on("error", (error) => {
  console.error("Discord client error:", error)
})

client.on("messageCreate", async (message) => {
  if (
    message.content === "!restart" &&
    message.author.id === "YOUR_DISCORD_ID"
  ) {
    await message.channel.send("Restarting bot...")
    process.exit(1) // Replit will automatically restart the process
  }
})
