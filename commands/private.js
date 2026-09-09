const fs = require('fs');
const path = require('path');
const MODE_FILE = path.join(__dirname, '../data/mode.json');

module.exports = {
  name: "private",
  desc: "Lock the bot for everyone - OWNER ONLY",
  run: async({ sock, m, sender, jid, OWNER_NUMBER, PREFIX }) => {
    if(sender!== OWNER_NUMBER) return sock.sendMessage(jid, { text: `❌ Owner only command` }, { quoted: m });

    let data = { mode: "public", lockedBy: null };
    if(fs.existsSync(MODE_FILE)) data = JSON.parse(fs.readFileSync(MODE_FILE));

    if(data.mode === "private") {
      return sock.sendMessage(jid, { text: `🔒 Bot is already locked` }, { quoted: m });
    }

    data.mode = "private";
    data.lockedBy = sender;
    fs.writeFileSync(MODE_FILE, JSON.stringify(data, null, 2));

    await sock.sendMessage(jid, { text: `🔒 Bot is now LOCKED by owner.\nNo one can use commands until you do ${PREFIX}public` }, { quoted: m });
  }
}
