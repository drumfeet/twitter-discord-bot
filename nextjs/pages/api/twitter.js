import { TwitterApi } from "twitter-api-v2"
import { Client, GatewayIntentBits } from "discord.js"

function formatUTCTime(date) {
  return new Date(date).toUTCString()
}

async function getLastTweetIdFromDiscord(channel, botId) {
  const messages = await channel.messages.fetch({ limit: 10 })
  const botMessages = messages.filter((msg) => msg.author.id === botId)
  const lastBotMessage = botMessages.first()
  const match = lastBotMessage?.content.match(/status\/(\d+)/)
  return match ? match[1] : null
}

async function sendTweetToDiscord(channel, tweet) {
  await channel.send({
    content: `🔔 New post alert @everyone\nhttps://x.com/user/status/${tweet.id}`,
  })
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  })

  const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  })

  try {
    await discordClient.login(process.env.DISCORD_TOKEN)
    const channel = await discordClient.channels.fetch(
      process.env.DISCORD_CHANNEL_ID
    )

    if (!channel) {
      return res.status(404).json({ error: "Discord channel not found" })
    }

    const tweetParams = {
      exclude: ["replies"],
      max_results: 5,
      start_time: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    }

    const tweets = await twitterClient.v2.userTimeline(
      process.env.TWITTER_USER_ID,
      tweetParams
    )

    const tweetData = tweets.data?.data
    if (!tweetData?.length) {
      return res.status(200).json({ message: "No new tweets" })
    }

    const lastTweetId = await getLastTweetIdFromDiscord(
      channel,
      discordClient.user.id
    )
    const newTweets = tweetData.filter(
      (tweet) => !lastTweetId || tweet.id > lastTweetId
    )

    if (!newTweets.length) {
      return res.status(200).json({ message: "No new tweets to post" })
    }

    for (const tweet of newTweets.reverse()) {
      await sendTweetToDiscord(channel, tweet)
    }

    return res
      .status(200)
      .json({ message: `Posted ${newTweets.length} tweet(s)` })
  } catch (err) {
    console.error("Error:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  } finally {
    // cleanly destroy client to prevent memory leaks in serverless
    discordClient.destroy()
  }
}
