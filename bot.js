import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const UPI_VPA = process.env.UPI_VPA || 'c.sandeep@superyes';
const UPI_NAME = process.env.UPI_NAME || 'My Business';

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is missing in environment variables.');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

const activeCheckoutSessions = {};
const userPurchasedKeys = {};

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
    '3️⃣ Scan the UPI QR code or pay instantly via PhonePe, GPay, Paytm, or BHIM.\n' +
    '4️⃣ Tap **✅ I Have Paid & Claim Key** to instantly receive your license key! 🚀';
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

    activeCheckoutSessions[userId] = {
      product: text,
      price: basePrice,
      orderId: orderId,
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

*Or scan the QR code above.*
    `.trim();

    await ctx.replyWithPhoto(qrImageUrl, {
      caption: caption,
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ I Have Paid & Claim Key', `claim_${orderId}`)],
      ]),
    });
  } catch (error) {
    console.error('Error generating UPI QR:', error);
    ctx.reply('❌ Failed to generate payment QR code. Please try again later.');
  }
});

bot.action(/claim_(.+)/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const orderId = ctx.match[1];
    const session = activeCheckoutSessions[userId];

    if (!session || session.orderId !== orderId) {
      return ctx.answerCbQuery('❌ Session expired or invalid order.');
    }

    const filePath = getFilePathForProduct(session.product);
    if (!filePath) {
      return ctx.answerCbQuery('❌ Invalid product category configuration.');
    }

    await ctx.answerCbQuery('🔄 Verifying and fetching your key...');

    const { keys } = await fetchKeysFromGitHub(filePath);
    if (keys.length === 0) {
      return ctx.reply('❌ Out of stock! Please contact support @c_sandeep.');
    }

    const deliveredKey = keys[0];
    const success = await removeKeyFromGitHub(filePath, deliveredKey);

    if (success) {
      delete activeCheckoutSessions[userId];

      if (!userPurchasedKeys[userId]) {
        userPurchasedKeys[userId] = [];
      }
      userPurchasedKeys[userId].push({
        product: session.product,
        key: deliveredKey,
        price: session.price,
      });

      await ctx.editMessageCaption(
        `✅ **Payment Confirmed & Key Delivered!**\n\n📦 Product: \`${session.product}\`\n🔑 Your Key:\n\`${deliveredKey}\``,
        { parse_mode: 'Markdown' }
      );
    } else {
      ctx.reply('❌ Failed to assign key from repository. Please contact support.');
    }
  } catch (error) {
    console.error('Error in claim action:', error);
    ctx.reply('❌ An error occurred while fulfilling your order.');
  }
});

const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.status(200).send('Telegram UPI Bot is running successfully!');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server listening on port ${PORT}`);
});

bot.launch().then(() => {
  console.log('🤖 Telegram UPI Bot is running via Telegraf...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
