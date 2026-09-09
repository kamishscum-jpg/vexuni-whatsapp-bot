require("dotenv").config();

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// =====================================================
// VEXLUNI
// =====================================================

const BOT_NAME = "Vexluni";
const OWNER_NUMBER = process.env.OWNER_NUMBER || "2348135534609";
const PREFIX = process.env.PREFIX || "/";

const AI_API_URL = process.env.AI_API_URL || "";
const AI_API_KEY = process.env.AI_API_KEY || "";

const IMAGE_API_URL = process.env.IMAGE_API_URL || "";
const IMAGE_API_KEY = process.env.IMAGE_API_KEY || "";

const HUG_MEDIA_URL = process.env.HUG_MEDIA_URL || "";
const SLAP_MEDIA_URL = process.env.SLAP_MEDIA_URL || "";

// =====================================================
// LIMITS
// =====================================================

const NORMAL_IMAGE_LIMIT = 3;
const PREMIUM_IMAGE_LIMIT = 50;

const IMAGE_COOLDOWN =
  8 * 60 * 60 * 1000; // 8 hours

const DOWNLOAD_COOLDOWN =
  3 * 60 * 60 * 1000; // 3 hours

// =====================================================
// DIRECTORIES
// =====================================================

const SESSION_DIR =
  path.join(__dirname, "session");

const DATA_DIR =
  path.join(__dirname, "data");

const PREMIUM_FILE =
  path.join(DATA_DIR, "premium.json");

const VIP_FILE =
  path.join(DATA_DIR, "vip.json");

const LIMIT_FILE =
  path.join(DATA_DIR, "limits.json");

fs.mkdirSync(SESSION_DIR, {
  recursive: true
});

fs.mkdirSync(DATA_DIR, {
  recursive: true
});

if (!fs.existsSync(PREMIUM_FILE)) {
  fs.writeFileSync(
    PREMIUM_FILE,
    "[]"
  );
}

if (!fs.existsSync(VIP_FILE)) {
  fs.writeFileSync(
    VIP_FILE,
    "[]"
  );
}

if (!fs.existsSync(LIMIT_FILE)) {
  fs.writeFileSync(
    LIMIT_FILE,
    "{}"
  );
}

// =====================================================
// NUMBER HELPERS
// =====================================================

function cleanNumber(number) {
  return String(number || "")
    .replace(/[^\d]/g, "")
    .replace(/^0+/, "");
}

function jidNumber(jid) {
  return cleanNumber(
    String(jid || "")
      .split("@")[0]
  );
}

function numberToJid(number) {
  return `${cleanNumber(number)}@s.whatsapp.net`;
}

// =====================================================
// OWNER
// =====================================================

function isOwner(jid) {
  return (
    cleanNumber(jidNumber(jid)) ===
    cleanNumber(OWNER_NUMBER)
  );
}

// =====================================================
// PREMIUM / VIP
// =====================================================

function readJson(file, fallback) {
  try {
    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

function getPremiumUsers() {
  return readJson(
    PREMIUM_FILE,
    []
  );
}

function getVIPUsers() {
  return readJson(
    VIP_FILE,
    []
  );
}

function isPremium(jid) {
  const number =
    cleanNumber(jidNumber(jid));

  return (
    isOwner(jid) ||
    getPremiumUsers()
      .map(cleanNumber)
      .includes(number)
  );
}

function isVIP(jid) {
  const number =
    cleanNumber(jidNumber(jid));

  return (
    isOwner(jid) ||
    getVIPUsers()
      .map(cleanNumber)
      .includes(number)
  );
}

function getLevel(jid) {
  if (isOwner(jid)) {
    return "OWNER";
  }

  if (isVIP(jid)) {
    return "VIP";
  }

  if (isPremium(jid)) {
    return "PREMIUM";
  }

  return "NORMAL";
}

// =====================================================
// PREMIUM / VIP MANAGEMENT
// =====================================================

function addPremium(number) {
  number = cleanNumber(number);

  const users =
    getPremiumUsers();

  if (
    !users
      .map(cleanNumber)
      .includes(number)
  ) {
    users.push(number);
    writeJson(
      PREMIUM_FILE,
      users
    );

    return true;
  }

  return false;
}

function removePremium(number) {
  number = cleanNumber(number);

  const users =
    getPremiumUsers();

  const filtered =
    users.filter(
      n =>
        cleanNumber(n) !==
        number
    );

  writeJson(
    PREMIUM_FILE,
    filtered
  );

  return (
    filtered.length !==
    users.length
  );
}

function addVIP(number) {
  number = cleanNumber(number);

  const users =
    getVIPUsers();

  if (
    !users
      .map(cleanNumber)
      .includes(number)
  ) {
    users.push(number);
    writeJson(
      VIP_FILE,
      users
    );

    return true;
  }

  return false;
}

function removeVIP(number) {
  number = cleanNumber(number);

  const users =
    getVIPUsers();

  const filtered =
    users.filter(
      n =>
        cleanNumber(n) !==
        number
    );

  writeJson(
    VIP_FILE,
    filtered
  );

  return (
    filtered.length !==
    users.length
  );
}

// =====================================================
// LIMIT STORAGE
// =====================================================

function getLimits() {
  return readJson(
    LIMIT_FILE,
    {}
  );
}

function saveLimits(data) {
  writeJson(
    LIMIT_FILE,
    data
  );
}

function getUserLimit(jid) {
  const number =
    cleanNumber(jidNumber(jid));

  const data =
    getLimits();

  if (!data[number]) {
    data[number] = {
      imageCount: 0,
      imageResetAt: 0,
      downloadAt: 0
    };

    saveLimits(data);
  }

  return data[number];
}

function saveUserLimit(
  jid,
  limit
) {
  const number =
    cleanNumber(jidNumber(jid));

  const data =
    getLimits();

  data[number] = limit;

  saveLimits(data);
}

// =====================================================
// IMAGE LIMIT CHECK
// =====================================================

function getImageLimit(jid) {
  const level =
    getLevel(jid);

  if (
    level === "OWNER" ||
    level === "VIP"
  ) {
    return Infinity;
  }

  if (
    level === "PREMIUM"
  ) {
    return PREMIUM_IMAGE_LIMIT;
  }

  return NORMAL_IMAGE_LIMIT;
}

function checkImageLimit(jid) {
  const limit =
    getImageLimit(jid);

  if (limit === Infinity) {
    return {
      allowed: true,
      remaining: Infinity,
      wait: 0
    };
  }

  const user =
    getUserLimit(jid);

  const now =
    Date.now();

  if (
    user.imageResetAt &&
    now >= user.imageResetAt
  ) {
    user.imageCount = 0;
    user.imageResetAt = 0;

    saveUserLimit(
      jid,
      user
    );
  }

  if (
    user.imageCount >= limit
  ) {
    const wait =
      Math.max(
        0,
        user.imageResetAt - now
      );

    return {
      allowed: false,
      remaining: 0,
      wait
    };
  }

  return {
    allowed: true,
    remaining:
      limit - user.imageCount,
    wait: 0
  };
}

function useImageCredit(jid) {
  const limit =
    getImageLimit(jid);

  if (limit === Infinity) {
    return;
  }

  const user =
    getUserLimit(jid);

  const now =
    Date.now();

  if (
    !user.imageResetAt ||
    now >= user.imageResetAt
  ) {
    user.imageCount = 0;
    user.imageResetAt =
      now + IMAGE_COOLDOWN;
  }

  user.imageCount++;

  saveUserLimit(
    jid,
    user
  );
}

// =====================================================
// DOWNLOAD COOLDOWN
// =====================================================

function checkDownloadLimit(jid) {
  const level =
    getLevel(jid);

  if (
    level === "OWNER" ||
    level === "VIP" ||
    level === "PREMIUM"
  ) {
    return {
      allowed: true,
      wait: 0
    };
  }

  const user =
    getUserLimit(jid);

  const now =
    Date.now();

  if (
    !user.downloadAt ||
    now >= user.downloadAt
  ) {
    return {
      allowed: true,
      wait: 0
    };
  }

  return {
    allowed: false,
    wait:
      user.downloadAt - now
  };
}

function useDownloadCredit(jid) {
  const level =
    getLevel(jid);

  if (
    level === "OWNER" ||
    level === "VIP" ||
    level === "PREMIUM"
  ) {
    return;
  }

  const user =
    getUserLimit(jid);

  user.downloadAt =
    Date.now() +
    DOWNLOAD_COOLDOWN;

  saveUserLimit(
    jid,
    user
  );
}

// =====================================================
// TIME FORMAT
// =====================================================

function formatTime(ms) {
  const totalSeconds =
    Math.ceil(ms / 1000);

  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
      60
    );

  const seconds =
    totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

// =====================================================
// MESSAGE HELPERS
// =====================================================

function getText(message) {
  const msg =
    message?.message;

  if (!msg) {
    return "";
  }

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentWithCaptionMessage
      ?.message
      ?.documentMessage
      ?.caption ||
    ""
  );
}

function getMentions(message) {
  return (
    message?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid ||
    []
  );
}

async function sendText(
  sock,
  jid,
  text,
  quoted = null,
  mentions = []
) {
  return sock.sendMessage(
    jid,
    {
      text,
      mentions
    },
    quoted
      ? { quoted }
      : {}
  );
}

// =====================================================
// MENU
// =====================================================

function getMenu(jid) {
  const level =
    getLevel(jid);

  const premium =
    level === "PREMIUM" ||
    level === "VIP" ||
    level === "OWNER";

  return `
╭━━━〔 ${BOT_NAME} 〕━━━╮
┃
┃ 🤖 Welcome to ${BOT_NAME}
┃
┃ 👤 Access: ${level}
┃
╠══ 💬 GENERAL ══
┃
┃ /menu
┃ /help
┃ /status
┃
┃ 💬 Normal AI chat
┃ ♾️ Unlimited
┃
╠══ 🤖 AI ══
┃
┃ /generate <text>
┃ 🔒 Premium / VIP
┃
╠══ 🎨 IMAGE ══
┃
┃ /image <prompt>
┃ /img <prompt>
┃
┃ Normal: 3 images / 8h
┃ Premium: 50 images / 8h
┃ VIP: Unlimited
┃
╠══ 💎 PREMIUM ══
┃
┃ /premium
┃ /images <prompt>
┃
┃ /images can generate
┃ multiple images.
┃
╠══ 🤗 FUN ══
┃
┃ /hug @user
┃ /slap @user
┃
╠══ 📥 DOWNLOAD ══
┃
┃ /download <URL>
┃
┃ Normal: 3h cooldown
┃ Premium/VIP: Unlimited
┃
╠══ 👥 GROUP ══
┃
┃ /groupinfo
┃ /tagall
┃ /link
┃ /kick @user
┃ /add <number>
┃ /promote @user
┃ /demote @user
┃ /leave
┃
╠══ 📱 WHATSAPP ══
┃
┃ /pair
┃
╠══ 👑 OWNER ══
┃
${
  level === "OWNER"
    ? `┃ /addpremium <number>
┃ /delpremium <number>
┃ /addvip <number>
┃ /delvip <number>
┃ /listpremium
┃ /listvip
┃
`
    : `┃ 🔒 Owner commands
┃
`
}╰━━━━━━━━━━━━━━━━━━╯

💎 Your access: ${level}

📞 Premium / VIP Support:
https://wa.me/${cleanNumber(
    OWNER_NUMBER
  )}

— ${BOT_NAME}
`;
}

// =====================================================
// AI
// =====================================================

async function generateAI(prompt) {
  if (!AI_API_URL) {
    return `⚠️ ${BOT_NAME} AI is not connected yet.

Add AI_API_URL and AI_API_KEY to your .env file.`;
  }

  try {
    const response =
      await axios.post(
        AI_API_URL,
        {
          prompt
        },
        {
          headers: {
            Authorization:
              AI_API_KEY
                ? `Bearer ${AI_API_KEY}`
                : undefined,

            "Content-Type":
              "application/json"
          },

          timeout: 60000
        }
      );

    return (
      response.data?.text ||
      response.data?.response ||
      response.data?.result ||
      response.data?.choices?.[0]
        ?.message?.content ||
      `❌ ${BOT_NAME} received no AI response.`
    );

  } catch (error) {
    console.error(
      "AI ERROR:",
      error.message
    );

    return `❌ ${BOT_NAME} AI generation failed.`;
  }
}

// =====================================================
// IMAGE API
// =====================================================

async function generateImage(prompt) {
  if (!IMAGE_API_URL) {
    return null;
  }

  try {
    const response =
      await axios.post(
        IMAGE_API_URL,
        {
          prompt
        },
        {
          headers: {
            Authorization:
              IMAGE_API_KEY
                ? `Bearer ${IMAGE_API_KEY}`
                : undefined,

            "Content-Type":
              "application/json"
          },

          timeout: 120000
        }
      );

    return (
      response.data?.url ||
      response.data?.image_url ||
      response.data?.data?.[0]?.url ||
      response.data?.data?.[0] ||
      null
    );

  } catch (error) {
    console.error(
      "IMAGE ERROR:",
      error.message
    );

    return null;
  }
}

// =====================================================
// GROUP
// =====================================================

async function getGroupMetadata(
  sock,
  jid
) {
  try {
    return await sock.groupMetadata(
      jid
    );
  } catch (error) {
    console.error(
      "GROUP ERROR:",
      error.message
    );

    return null;
  }
}

function participantIsAdmin(
  metadata,
  jid
) {
  const number =
    jidNumber(jid);

  const participant =
    metadata?.participants?.find(
      p =>
        jidNumber(p.id) ===
        number
    );

  return (
    participant?.admin ===
      "admin" ||
    participant?.admin ===
      "superadmin"
  );
}

function getBotJid(sock) {
  return sock.user?.id || "";
}

async function requireGroup(
  sock,
  jid,
  message
) {
  if (
    !jid.endsWith("@g.us")
  ) {
    await sendText(
      sock,
      jid,
      `❌ ${BOT_NAME}: This command can only be used in a group.`,
      message
    );

    return false;
  }

  return true;
}

async function requireBotAdmin(
  sock,
  jid,
  message
) {
  const metadata =
    await getGroupMetadata(
      sock,
      jid
    );

  if (!metadata) {
    await sendText(
      sock,
      jid,
      `❌ ${BOT_NAME}: I couldn't get the group information.`,
      message
    );

    return false;
  }

  if (
    !participantIsAdmin(
      metadata,
      getBotJid(sock)
    )
  ) {
    await sendText(
      sock,
      jid,
      `❌ ${BOT_NAME} needs to be a group admin for this command.`,
      message
    );

    return false;
  }

  return true;
}

async function requireSenderAdmin(
  sock,
  jid,
  sender,
  message
) {
  if (isOwner(sender)) {
    return true;
  }

  const metadata =
    await getGroupMetadata(
      sock,
      jid
    );

  if (!metadata) {
    return false;
  }

  if (
    participantIsAdmin(
      metadata,
      sender
    )
  ) {
    return true;
  }

  await sendText(
    sock,
    jid,
    `❌ ${BOT_NAME}: Only group admins can use this command.`,
    message
  );

  return false;
}

// =====================================================
// HUG / SLAP
// =====================================================

async function doAction(
  sock,
  jid,
  target,
  action,
  message
) {
  const targetNumber =
    jidNumber(target);

  const mention =
    `@${targetNumber}`;

  const caption =
    action === "hug"
      ? `🤗 ${BOT_NAME} hugged ${mention}!`
      : `👋 ${BOT_NAME} slapped ${mention}!`;

  const mediaUrl =
    action === "hug"
      ? HUG_MEDIA_URL
      : SLAP_MEDIA_URL;

  if (!mediaUrl) {
    await sendText(
      sock,
      jid,
      caption,
      message,
      [target]
    );

    return;
  }

  try {
    await sock.sendMessage(
      jid,
      {
        video: {
          url: mediaUrl
        },

        gifPlayback: true,

        caption,

        mentions: [target]
      },
      {
        quoted: message
      }
    );

  } catch (error) {
    console.error(
      "ACTION MEDIA ERROR:",
      error.message
    );

    await sendText(
      sock,
      jid,
      caption,
      message,
      [target]
    );
  }
}

// =====================================================
// PAIRING
// =====================================================

async function createPairingCode(
  phoneNumber
) {
  const number =
    cleanNumber(phoneNumber);

  if (!number) {
    throw new Error(
      "Invalid WhatsApp number."
    );
  }

  const pairDir =
    path.join(
      PAIR_DIR,
      number
    );

  fs.mkdirSync(
    pairDir,
    {
      recursive: true
    }
  );

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      pairDir
    );

  const pairSock =
    makeWASocket({
      auth: {
        creds: state.creds,

        keys:
          makeCacheableSignalKeyStore(
            state.keys,
            pino({
              level: "silent"
            })
          )
      },

      logger: pino({
        level: "silent"
      }),

      browser: [
        BOT_NAME,
        "Chrome",
        "1.0.0"
      ]
    });

  pairSock.ev.on(
    "creds.update",
    saveCreds
  );

  const code =
    await pairSock.requestPairingCode(
      number
    );

  return code;
}

// =====================================================
// START MAIN BOT
// =====================================================

let restarting = false;

async function startBot() {
  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      SESSION_DIR
    );

  const sock =
    makeWASocket({
      auth: {
        creds: state.creds,

        keys:
          makeCacheableSignalKeyStore(
            state.keys,
            pino({
              level: "silent"
            })
          )
      },

      logger: pino({
        level: "silent"
      }),

      browser: [
        BOT_NAME,
        "Chrome",
        "1.0.0"
      ],

      markOnlineOnConnect:
        true
    });

  sock.ev.on(
    "creds.update",
    saveCreds
  );

  // ===================================================
  // CONNECTION
  // ===================================================

  sock.ev.on(
    "connection.update",
    async update => {
      const {
        connection,
        lastDisconnect
      } = update;

      if (
        connection === "open"
      ) {
        console.log("");
        console.log(
          "======================================"
        );
        console.log(
          `        ${BOT_NAME} IS ONLINE`
        );
        console.log(
          "======================================"
        );
        console.log(
          `Owner: ${OWNER_NUMBER}`
        );
        console.log(
          "Normal image limit: 3 / 8 hours"
        );
        console.log(
          "Premium image limit: 50 / 8 hours"
        );
        console.log(
          "VIP image limit: Unlimited"
        );
        console.log(
          "======================================"
        );
        console.log("");
      }

      if (
        connection === "close"
      ) {
        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        if (
          statusCode !==
          DisconnectReason.loggedOut
        ) {
          console.log(
            `${BOT_NAME}: connection closed. Reconnecting...`
          );

          setTimeout(
            () => {
              if (!restarting) {
                startBot();
              }
            },
            5000
          );

        } else {
          console.log(
            `${BOT_NAME}: WhatsApp logged out.`
          );

          console.log(
            "Delete the session folder and pair again."
          );
        }
      }
    }
  );

  // ===================================================
  // MESSAGES
  // ===================================================

  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {
      try {
        const message =
          messages?.[0];

        if (!message?.message) {
          return;
        }

        if (
            message.key.fromMe || 
            !message.message
        ) return;
        
        const msg = message.message;
        const from = message.key.remoteJid;
   Perfect! Here's the **complete missing code** for your `src/bot.js`. This replaces everything from the truncated `messages.upsert` event onwards:

```javascript
  // ===================================================
  // MESSAGES
  // ===================================================

  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {
      try {
        const message = messages?.[0];

        if (!message?.message) {
          return;
        }

        if (message.key.fromMe) {
          return;
        }

        const jid = message.key.remoteJid;
        const sender = message.key.participant || jid;
        const text = getText(message).trim();
        const isGroup = jid.endsWith("@g.us");

        if (!text) {
          return;
        }

        console.log(`[${isGroup ? "GROUP" : "PRIVATE"}] ${jidNumber(sender)}: ${text}`);

        // ===================================================
        // COMMAND ROUTING
        // ===================================================

        const [cmd, ...args] = text.split(" ");
        const command = cmd.toLowerCase().replace(PREFIX, "");
        const argument = args.join(" ");

        // MENU
        if (command === "menu" || command === "help") {
          await sendText(
            sock,
            jid,
            getMenu(sender),
            message
          );
          return;
        }

        // STATUS
        if (command === "status") {
          const level = getLevel(sender);
          await sendText(
            sock,
            jid,
            `📊 Your Status:\n\nLevel: ${level}\nJID: ${sender}`,
            message
          );
          return;
        }

        // AI CHAT (NORMAL - UNLIMITED)
        if (!command.startsWith(PREFIX.slice(0, 1)) && text) {
          const reply = await generateAI(text);
          await sendText(
            sock,
            jid,
            reply,
            message
          );
          return;
        }

        // ===================================================
        // IMAGE GENERATION
        // ===================================================

        if (command === "image" || command === "img") {
          if (!argument) {
            await sendText(
              sock,
              jid,
              `❌ Usage: ${PREFIX}image <prompt>`,
              message
            );
            return;
          }

          const limit = checkImageLimit(sender);

          if (!limit.allowed) {
            const wait = formatTime(limit.wait);
            await sendText(
              sock,
              jid,
              `⏳ Image limit reached.\n\nRemaining: ${limit.remaining}\nWait: ${wait}`,
              message
            );
            return;
          }

          await sendText(
            sock,
            jid,
            `🎨 Generating image for: "${argument}"\n\n⏳ Please wait...`,
            message
          );

          const imageUrl = await generateImage(argument);

          if (!imageUrl) {
            await sendText(
              sock,
              jid,
              `❌ Failed to generate image. Check your IMAGE_API_URL and IMAGE_API_KEY.`,
              message
            );
            return;
          }

          useImageCredit(sender);

          try {
            await sock.sendMessage(
              jid,
              {
                image: {
                  url: imageUrl
                },
                caption: `🎨 Generated for: ${sender}\n\n"${argument}"`
              },
              {
                quoted: message
              }
            );
          } catch (error) {
            console.error("IMAGE SEND ERROR:", error.message);
            await sendText(
              sock,
              jid,
              `❌ Failed to send image.`,
              message
            );
          }
          return;
        }

        // GENERATE (PREMIUM ONLY - AI IMAGE TEXT)
        if (command === "generate") {
          if (!isPremium(sender)) {
            await sendText(
              sock,
              jid,
              `🔒 ${PREFIX}generate is for Premium / VIP users only.\n\n/premium to get premium.`,
              message
            );
            return;
          }

          if (!argument) {
            await sendText(
              sock,
              jid,
              `❌ Usage: ${PREFIX}generate <text>`,
              message
            );
            return;
          }

          await sendText(
            sock,
            jid,
            `🤖 Generating with AI...\n\n⏳ Please wait...`,
            message
          );

          const result = await generateAI(argument);
          await sendText(
            sock,
            jid,
            result,
            message
          );
          return;
        }

        // ===================================================
        // FUN COMMANDS
        // ===================================================

        if (command === "hug") {
          const mentions = getMentions(message);

          if (!mentions.length) {
            await sendText(
              sock,
              jid,
              `❌ Tag someone to hug.`,
              message
            );
            return;
          }

          await doAction(
            sock,
            jid,
            mentions[0],
            "hug",
            message
          );
          return;
        }

        if (command === "slap") {
          const mentions = getMentions(message);

          if (!mentions.length) {
            await sendText(
              sock,
              jid,
              `❌ Tag someone to slap.`,
              message
            );
            return;
          }

          await doAction(
            sock,
            jid,
            mentions[0],
            "slap",
            message
          );
          return;
        }

        // ===================================================
        // DOWNLOAD
        // ===================================================

        if (command === "download") {
          if (!argument) {
            await sendText(
              sock,
              jid,
              `❌ Usage: ${PREFIX}download <URL>`,
              message
            );
            return;
          }

          const cooldown = checkDownloadLimit(sender);

          if (!cooldown.allowed) {
            const wait = formatTime(cooldown.wait);
            await sendText(
              sock,
              jid,
              `⏳ Download cooldown active.\n\nWait: ${wait}`,
              message
            );
            return;
          }

          useDownloadCredit(sender);

          await sendText(
            sock,
            jid,
            `📥 Downloading from: ${argument}\n\n⏳ Please wait...`,
            message
          );

          try {
            const response = await axios.get(
              argument,
              {
                responseType: "arraybuffer",
                timeout: 60000
              }
            );

            const contentType = response.headers["content-type"];
            const isVideo = contentType?.includes("video");
            const isImage = contentType?.includes("image");

            if (isVideo) {
              await sock.sendMessage(
                jid,
                {
                  video: response.data,
                  caption: `📹 Downloaded`
                },
                {
                  quoted: message
                }
              );
            } else if (isImage) {
              await sock.sendMessage(
                jid,
                {
                  image: response.data,
                  caption: `🖼️ Downloaded`
                },
                {
                  quoted: message
                }
              );
            } else {
              await sock.sendMessage(
                jid,
                {
                  document: response.data,
                  fileName: `download_${Date.now()}`,
                  mimetype: contentType || "application/octet-stream"
                },
                {
                  quoted: message
                }
              );
            }
          } catch (error) {
            console.error("DOWNLOAD ERROR:", error.message);
            await sendText(
              sock,
              jid,
              `❌ Failed to download. Check the URL.`,
              message
            );
          }
          return;
        }

        // ===================================================
        // GROUP COMMANDS
        // ===================================================

        if (command === "groupinfo") {
          if (!await requireGroup(sock, jid, message)) {
            return;
          }

          const metadata = await getGroupMetadata(sock, jid);

          if (!metadata) {
            await sendText(
              sock,
              jid,
              `❌ Failed to get group info.`,
              message
            );
            return;
          }

          const info = `
╭━━━〔 GROUP INFO 〕━━━╮
┃
┃ 📛 Name: ${metadata.subject}
┃ 🆔 ID: ${metadata.id}
┃ 👥 Members: ${metadata.participants.length}
┃ 📝 Desc: ${metadata.desc || "No description"}
┃ 👑 Owner: ${metadata.owner ? `@${jidNumber(metadata.owner)}` : "Unknown"}
┃
╰━━━━━━━━━━━━━━━━━╯
`;

          await sendText(
            sock,
            jid,
            info,
            message
          );
          return;
        }

        if (command === "tagall") {
          if (!await requireGroup(sock, jid, message)) {
            return;
          }

          if (!await requireBotAdmin(sock, jid, message)) {
            return;
          }

          const metadata = await getGroupMetadata(sock, jid);

          if (!metadata) {
            return;
          }

          const mentions = metadata.participants.map(p => p.id);
          const text = `📢 Attention everyone!\n\n${mentions.map(m => `@${jidNumber(m)}`).join(" ")}`;

          await sendText(
            sock,
            jid,
            text,
            message,
            mentions
          );
          return;
        }

        if (command === "link") {
          if (!await requireGroup(sock, jid, message)) {
            return;
          }

          if (!await requireBotAdmin(sock, jid, message)) {
            return;
          }

          try {
            const link = await sock.groupInviteCode(jid);
            await sendText(
              sock,
              jid,
              `🔗 Group Link:\n\nhttps://chat.whatsapp.com/${link}`,
              message
            );
          } catch (error) {
            console.error("LINK ERROR:", error.message);
            await sendText(
              sock,
              jid,
              `❌ Failed to get group link.`,
              message
            );
          }
          return;
        }

        if (command === "kick") {
          if (!await requireGroup(sock, jid, message)) {
            return;
          }

          if (!await requireSenderAdmin(sock, jid, sender, message)) {
            return;
          }

          const mentions = getMentions(message);

          if (!mentions.length) {
            await sendText(
              sock,
              jid,
              `❌ Tag someone to kick.`,
              message
            );
            return;
          }

          try {
            await sock.groupParticipantsUpdate(
              jid,
              mentions,
              "remove"
            );

            await sendText(
              sock,
              jid,
              `👋 Kicked ${mentions.map(m => `@${jidNumber(m)}`).join(", ")}`,
              message,
              mentions
            );
          } catch (error) {
            console.error("KICK ERROR:", error.message);
            await sendText(
              sock,
              jid,
              `❌ Failed to kick.`,
              message
            );
          }
          return;
        }

        if (command === "add") {
          if (!await requireGroup(sock, jid, message)) {
            return;
          }

          if (!await requireBotAdmin(sock, jid, message)) {
            return;
          }

          if (!argument) {
            await sendText(
              sock,
              jid,
              `❌ Usage: ${PREFIX}add <number>`,
              message
            );
            return;
          }

          const toAdd = numberToJid(argument);

          try {
            await sock.groupParticipantsUpdate(
              jid,
              [toAdd],
              "add"
            );

            await sendText(
              sock,
              jid,
              `✅ Added @${cleanNumber(argument)} to the group.`,
              message,
              [toAdd]
            );
          } catch (error) {
            console.error("ADD ERROR:", error.message);
            await sendText(
              sock,
              jid,
              `❌ Failed to add member.`,
              message
            );
          }
          return;
        }

        if (command === "promote") {
          if (!await requireGroup(sock, jid, message)) {
            return;
          }

          if (!await requireSenderAdmin(sock, jid, sender, message)) {
            return;
          }

          const mentions = getMentions(message);

          if (!mentions.length) {
            await sendText(
              sock,
              jid,
              `❌ Tag someone to promote.`,
              message
            );
            return;
          }

          try {
            await sock.groupParticipantsUpdate(
              jid,
              mentions,
              "promote"
            );

            await sendText(
              sock,
              jid,
              `👑 Promoted ${mentions.map(m => `@${jidNumber(m)}`).join(", ")}`,
              message,
              mentions
            );
          } catch (error) {
            console.error("PROMOTE ERROR:", error.message);
            await sendText(
              sock,
              jid,
              `❌ Failed to promote.`,
              message
            );
          }
          return;
        }

        if (command === "demote") {
          if (!await requireGroup(sock, jid, message)) {
            return;
          }

          if (!await requireSenderAdmin(sock, jid, sender, message)) {
            return;
          }

          const mentions = getMentions(message);

          if (!mentions.length) {
            await sendText(
              sock,
              jid,
              `❌ Tag someone to demote.`,
              message
            );
            return;
          }

          try {
            await sock.groupParticipantsUpdate(
              jid,
              mentions,
              "demote"
            );

            await sendText(
              sock,
              jid,
              `📉 Demoted ${mentions.map(m => `@${jidNumber(m)}`).join(", ")}`,
              message,
              mentions
            );
          } catch (error) {
            console.error("DEMOTE ERROR:", error.message);
            await sendText(
              sock,
              jid,
              `❌ Failed to demote.`,
              message
            );
          }
          return;
        }

        if (command === "leave") {
          if (!await requireGroup(sock, jid, message)) {
            return;
          }

          try {
            await sock.groupLeave(jid);
          } catch (error) {
            console.error("LEAVE ERROR:", error.message);
            await sendText(
              sock,
              jid,
              `❌ Failed to leave group.`,
              message
            );
          }
          return;
        }

        // ===================================================
        // PAIRING
        // ===================================================

        if (command === "pair") {
          if (!argument) {
            await sendText(
              sock,
              jid,
              `❌ Usage: ${PREFIX}pair <WhatsApp number>`,
              message
            );
            return;
          }

          try {
            await sendText(
              sock,
              jid,
              `📱 Generating pairing code for: ${argument}\n\n⏳ Please wait...`,
              message
            );

            const code = await createPairingCode(argument);

            await sendText(
              sock,
              jid,
              `✅ Pairing code:\n\n${code}`,
              message
            );
          } catch (error) {
            console.error("PAIR ERROR:", error.message);
            await sendText(
              sock,
              jid,
              `❌ Failed to generate pairing code.`,
              message
            );
          }
          return;
        }

        // ===================================================
        // PREMIUM
        // ===================================================

        if (command === "premium") {
          const level = getLevel(sender);

          if (level !== "NORMAL") {
            await sendText(
              sock,
              jid,
              `✅ You already have ${level} access!`,
              message
            );
            return;
          }

          await sendText(
            sock,
            jid,
            `💎 Premium Features:\n\n🔓 Unlimited AI generation\n🎨 50 images / 8 hours\n📥 Unlimited downloads\n\n📞 Contact owner:\nhttps://wa.me/${cleanNumber(OWNER_NUMBER)}`,
            message
          );
          return;
        }

        // ===================================================
        // OWNER COMMANDS
        // ===================================================

        if (command === "addpremium") {
          if (!isOwner(sender)) {
            await sendText(
              sock,
              jid,
              `🔒 Owner only.`,
              message
            );
            return;
          }

          if (!argument) {
            await sendText(
              sock,
              jid,
              `❌ Usage: ${PREFIX}addpremium <number>`,
              message
            );
            return;
          }

          if (addPremium(argument)) {
            await sendText(
              sock,
              jid,
              `✅ Added ${argument} to premium.`,
              message
            );
          } else {
            await sendText(
              sock,
              jid,
              `ℹ️ ${argument} already premium.`,
              message
            );
          }
          return;
        }

        if (command === "delpremium") {
          if (!isOwner(sender)) {
            await sendText(
              sock,
              jid,
              `🔒 Owner only.`,
              message
            );
            return;
          }

          if (!argument) {
            await sendText(
              sock,
              jid,
              `❌ Usage: ${PREFIX}delpremium <number>`,
              message
            );
            return;
          }

          if (removePremium(argument)) {
            await sendText(
              sock,
              jid,
              `✅ Removed ${argument} from premium.`,
              message
            );
          } else {
            await sendText(
              sock,
              jid,
              `ℹ️ ${argument} not in premium.`,
              message
            );
          }
          return;
        }

        if (command === "addvip") {
          if (!isOwner(sender)) {
            await sendText(
              sock,
              jid,
              `🔒 Owner only.`,
              message
            );
            return;
          }

          if (!argument) {
            await sendText(
              sock,
              jid,
              `❌ Usage: ${PREFIX}addvip <number>`,
              message
            );
            return;
          }

          if (addVIP(argument))