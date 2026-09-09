const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

const PREFIX = process.env.PREFIX || '/';
const OWNER_NUMBER = process.env.OWNER_NUMBER + '@s.whatsapp.net';
const commands = new Map();

const commandsPath = path.join(__dirname, '../commands');
fs.readdirSync(commandsPath).forEach(file => {
    if(file.endsWith('.js')){
        const command = require(path.join(commandsPath, file));
        commands.set(command.name, command);
    }
});

async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if(!m.message) return;
        const jid = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || '';

        if(!text.startsWith(PREFIX)) return;

        const args = text.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        const MODE_FILE = path.join(__dirname, "../data/mode.json");
        let data = { mode: "public", lockedBy: null };
        if(fs.existsSync(MODE_FILE)) data = JSON.parse(fs.readFileSync(MODE_FILE));

        if(data.mode === "private" && data.lockedBy!== sender && command!== "public"){
            return sock.sendMessage(jid, { text: `🔒 Bot is currently locked by owner. Wait for owner to do ${PREFIX}public` }, { quoted: m });
        }

        const cmd = commands.get(command);
        if(cmd){
            try{
                await cmd.run({ sock, m, args, sender, jid, OWNER_NUMBER, PREFIX });
            }catch(e){
                console.log(e);
                sock.sendMessage(jid, { text: `❌ Error: ${e.message}` }, { quoted: m });
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if(qr) qrcode.generate(qr, { small: true });
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode!== DisconnectReason.loggedOut;
            if(shouldReconnect) startBot();
        }
    });
}

startBot();
