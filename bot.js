import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const UPI_VPA = process.env.UPI_VPA || 'c.sandeep@superyes';
const UPI_NAME = process.env.UPI_NAME || 'My Business';

const NOCODEAPI_ENDPOINT = 'https://v1.nocodeapi.com/sandeep1111/telegram/GacagRwLbyHERlGO/sendText';

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is missing in environment variables.');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// Active payment sessions map: orderId -> { userId, product, price, timestamp }
const activeCheckoutSessions = {};
const userPurchasedKeys = {};

async function sendNoCodeAlert(textMessage) {
  try {
    const url = `${NOCODEAPI_ENDPOINT}?text=${encodeURIComponent(textMessage)}`;
    await fetch(url, { method: 'POST' });
  } catch (error) {
    console.error('Error with NoCodeAPI request:', error);
  }
}

function getFilePathForProduct(productName) {
  const name = productName.toUpperCase();
  if (name.includes('5 HOURS')) return 'keys_5h.txt';
  if (name.includes('1 DAY')) return 'keys_1d.txt';
  if (name.includes('3 DAYS')) return 'keys_3d.txt';
  if (name.includes('7 DAYS')) return 'keys_7d.txt';
  if (name.includes('30 DAYS')) return 'keys_30d.txt';
  if (name.includes('FULL SEASON')) return 'keys_season.txt';
  return null;
}

async function fetchKeysFromGitHub(filePath) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (response.ok) {
      const data = await response.json();
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const keys = content.split('\n').map((line) => line.trim()).filter(Boolean);
      return { keys, sha: data.sha };
    }
  } catch (error) {
    console.error(`Error fetching keys from GitHub (${filePath}):`, error);
  }
  return { keys: [], sha: null };
}

async function removeKeyFromGitHub(filePath, keyToRemove) {
  const { keys, sha } = await fetchKeysFromGitHub(filePath);
  if (!sha || !keys.includes(keyToRemove)) return false;

  const index = keys.indexOf(keyToRemove);
  keys.splice(index, 1);

  const updatedContent = keys.join('\n') + (keys.length ? '\n' : '');
  const encodedContent = Buffer.from(updatedContent).toString('base64');

  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Auto-remove sold key: ${keyToRemove}`,
        content: encodedContent,
        sha: sha,
      }),
    });
    if (response.ok) {
      console.log(`Successfully removed key ${keyToRemove} from ${filePath}`);
      return true;
    }
  } catch (error) {
    console.error(`Error updating GitHub keys file (${filePath}):`, error);
  }
  return false;
}

const mainMenu = Markup.keyboard([
  ['🔑 Purchase Key', '📋 My Keys'],
  ['🎁 Redeem Code', '📖 How to Buy'],
  ['🆔 My ID', '🆘 Contact Support'],
]).resize();

const brandsMenu = Markup.keyboard([
  ['XSCILENT LOADER'],
  ['⬅️ Back'],
]).resize();

const xscilentMenu = Markup.keyboard([
  ['XSCILENT 5 HOURS - ₹40', 'XSCILENT 1 DAY - ₹100'],
  ['XSCILENT 3 DAYS - ₹180', 'XSCILENT 7 DAYS - ₹300'],
  ['XSCILENT 30 DAYS - ₹800', 'XSCILENT FULL SEASON - ₹1200'],
  ['⬅️ Back to Brands'],
]).resize();

bot.start((ctx) => {
  ctx.reply('👋 Welcome to Key Store', mainMenu);
});

bot.hears('🔑 Purchase Key', (ctx) => {
  ctx.reply('🎮 Select a brand:', brandsMenu);
});

bot.hears('⬅️ Back to Brands', (ctx) => {
  ctx.reply('🎮 Select a brand:', brandsMenu);
});

bot.hears('⬅️ Back', (ctx) => {
  ctx.reply('👋 Main Menu', mainMenu);
});

bot.hears('XSCILENT LOADER', (ctx) => {
  ctx.reply('⏳ Select duration:', xscilentMenu);
});

bot.hears('📋 My Keys', (ctx) => {
  const userId = ctx.from.id;
  const purchased = userPurchasedKeys[userId] || [];
  if (purchased.length === 0) {
    ctx.reply("📋 You haven't purchased any keys yet.", mainMenu);
  } else {
    let msg = '📋 **Your Purchased Keys:**\n\n';
    purchased.forEach((item, idx) => {
      msg += `${idx + 1}. **${item.product}**\n🔑 Key: \`${item.key}\`\n💵 Price: ₹${item.price}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
  }
});

bot.hears('📖 How to Buy', (ctx) => {
  const guideText =
    '📖 **How to Buy License Keys:**\n\n' +
    '1️⃣ Tap **🔑 Purchase Key** from the main menu.\n' +
    '2️⃣ Select your desired loader brand and duration.\n' +
    '3️⃣ Scan the UPI QR code and complete payment.\n' +
    '4️⃣ Your license key will be delivered **instantly and automatically** upon successful payment! 🚀';
  ctx.reply(guideText, { parse_mode: 'Markdown', ...mainMenu });
});

bot.hears('🆘 Contact Support', (ctx) => {
  ctx.reply('🆘 **Customer Support**\n\nIf you are facing any issues, reach out:\n\n💬 Support Admin: @c_sandeep', {
    parse_mode: 'Markdown',
    ...mainMenu,
  });
});

bot.hears('🎁 Redeem Code', (ctx) => {
  ctx.reply('🎁 **Redeem Code**\n\nSend voucher code directly in chat to redeem.', {
    parse_mode: 'Markdown',
    ...mainMenu,
  });
});

bot.hears('🆔 My ID', (ctx) => {
  ctx.reply(`Your User ID is: \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
});

bot.hears(/₹(\d+)/, async (ctx) => {
  try {
    const text = ctx.message.text;
    const userId = ctx.from.id;
    const match = text.match(/₹(\d+)/);
    if (!match) return;

    const basePrice = parseFloat(match[1]);
    const orderId = `ord_${Date.now()}`;
    const note = `Payment for ${text}`;

    const upiUri = `upi://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(UPI_NAME)}&am=${basePrice}&tr=${orderId}&tn=${encodeURIComponent(note)}&cu=INR`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiUri)}`;

    const links = {
      phonepe: `phonepe://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(UPI_NAME)}&am=${basePrice}&tr=${orderId}&tn=${encodeURIComponent(note)}&cu=INR`,
      gpay: `tez://upi/pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(UPI_NAME)}&am=${basePrice}&tr=${orderId}&tn=${encodeURIComponent(note)}&cu=INR`,
      paytm: `paytmmp://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(UPI_NAME)}&am=${basePrice}&tr=${orderId}&tn=${encodeURIComponent(note)}&cu=INR`,
      bhim: `upi://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(UPI_NAME)}&am=${basePrice}&tr=${orderId}&tn=${encodeURIComponent(note)}&cu=INR`
    };

    activeCheckoutSessions[orderId] = {
      userId: userId,
      product: text,
      price: basePrice,
      timestamp: Date.now(),
    };

    const caption = `
💳 **Payment Checkout**

💵 Amount: **₹${basePrice}**
📦 Item: \`${text}\`
🆔 Order ID: \`${orderId}\`

📱 **Pay Instantly via Apps:**
• [PhonePe](${links.phonepe})
• [Google Pay](${links.gpay})
• [Paytm](${links.paytm})
• [Any UPI App](${links.bhim})

*Scan the QR code or click an app to pay. Your key will be sent **automatically** as soon as payment is confirmed!*
    `.trim();

    await ctx.replyWithPhoto(qrImageUrl, {
      caption: caption,
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('Error generating UPI QR:', error);
    ctx.reply('❌ Failed to generate payment QR code. Please try again later.');
  }
});

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('Telegram UPI Bot with Smart Amount-Matching Webhook is running successfully!');
});

// Smart Webhook Endpoint: Matches incoming notification text amount to active sessions
app.post('/webhook', async (req, res) => {
  try {
    let { orderId, text, status } = req.body;
    const rawInput = text || orderId || JSON.stringify(req.body);

    let matchedOrderId = null;

    // 1. Try to find explicit orderId if present
    if (orderId && activeCheckoutSessions[orderId]) {
      matchedOrderId = orderId;
    } else {
      // 2. Search raw notification text for orderId (ord_...)
      const ordMatch = rawInput.match(/ord_\d+/);
      if (ordMatch && activeCheckoutSessions[ordMatch[0]]) {
        matchedOrderId = ordMatch[0];
      } else {
        // 3. Fallback: Extract amount (e.g., ₹40) from notification and match active sessions
        const amountMatch = rawInput.match(/(?:₹|Rs\.?)\s*(\d+(?:\.\d+)?)/i);
        if (amountMatch) {
          const receivedAmount = parseFloat(amountMatch[1]);
          // Find the newest active session matching this price
          let latestTime = 0;
          for (const [id, session] of Object.entries(activeCheckoutSessions)) {
            if (session.price === receivedAmount && session.timestamp > latestTime) {
              latestTime = session.timestamp;
              matchedOrderId = id;
            }
          }
        }
      }
    }

    const session = activeCheckoutSessions[matchedOrderId];
    if (!session) {
      return res.status(404).json({ error: 'Matching active order session not found', received: rawInput });
    }

    const isSuccess = status ? (status.toLowerCase() === 'success') : true;

    if (isSuccess) {
      const { userId, product, price } = session;
      const filePath = getFilePathForProduct(product);

      if (filePath) {
        const { keys } = await fetchKeysFromGitHub(filePath);
        if (keys.length > 0) {
          const deliveredKey = keys[0];
          const success = await removeKeyFromGitHub(filePath, deliveredKey);

          if (success) {
            if (!userPurchasedKeys[userId]) {
              userPurchasedKeys[userId] = [];
            }
            userPurchasedKeys[userId].push({
              product: product,
              key: deliveredKey,
              price: price,
            });

            await sendNoCodeAlert(`🚨 Automated Sale Verified!\nUser ID: ${userId}\nProduct: ${product}\nAmount matched: ₹${price}\nKey Delivered: ${deliveredKey}`);

            await bot.telegram.sendMessage(
              userId,
              `✅ **Payment Verified & Key Delivered Automatically!**\n\n📦 Product: \`${product}\`\n🔑 Your Key:\n\`${deliveredKey}\``,
              { parse_mode: 'Markdown' }
            );

            delete activeCheckoutSessions[matchedOrderId];
            return res.status(200).json({ status: 'success', message: 'Key delivered via amount match' });
          }
        } else {
          await bot.telegram.sendMessage(
            userId,
            `⚠️ Payment received for **${product}**, but keys are currently out of stock! Please contact support @c_sandeep.`,
            { parse_mode: 'Markdown' }
          );
        }
      }
    }

    res.status(200).json({ status: 'received' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Web server listening on port ${PORT}`);
});

bot.launch().then(() => {
  console.log('🤖 Telegram UPI Bot is running...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
