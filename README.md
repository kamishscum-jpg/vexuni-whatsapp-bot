# Vexluni (vexuni-whatsapp-bot)

Vexluni WhatsApp bot built with Baileys. This repository contains the bot's source files. Configure using the .env file and start with npm start.

Important:
- Do NOT commit real secrets. Use .env (ignored) and provide only .env.example in the repo.

Quickstart:
1. Copy .env.example to .env and update values.
2. Install dependencies: npm install
3. Run locally: npm start
4. On first run, the bot will print a QR in terminal. Scan with your WhatsApp to pair.

Files included:
- src/bot.js - main bot script
- commands/ - command modules (private/public)
- data/mode.json - current bot mode (public/private)

License: MIT
