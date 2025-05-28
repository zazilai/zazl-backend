import express from 'express';
import dotenv from 'dotenv';
import zazilPrompt from './zazilPrompt.js';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import Parser from 'rss-parser';
const parser = new Parser();

dotenv.config();
const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const checkForEventsIntent = async (userInput) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'Responda apenas SIM ou NÃO. O usuário está perguntando sobre eventos ou atividades que estão acontecendo hoje ou em breve?',
      },
      {
        role: 'user',
        content: userInput,
      }
    ],
    max_tokens: 3,
    temperature: 0,
  });

  return response.choices[0].message.content.trim().toUpperCase() === "SIM";
};
const fetchNews = async () => {
  const feeds = [
    'https://g1.globo.com/rss/g1/',
    'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml',
    'https://rss.uol.com.br/feed/noticias.xml',
    'https://www.estadao.com.br/rss/ultimas.xml'
  ];

  let headlines = [];

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);
      headlines.push(...feed.items.slice(0, 2)); // pega 2 de cada
    } catch (err) {
      console.error(`Erro ao buscar feed ${url}:`, err.message);
    }
  }

  return headlines.slice(0, 5); // máximo de 5 no total
};
app.post('/zazil', async (req, res) => {
  const { message, userId, channel } = req.body;
  const lowerMsg = message.toLowerCase();
  if (
  lowerMsg.includes('notícia') ||
  lowerMsg.includes('noticias') ||
  lowerMsg.includes('o que tá rolando') ||
  lowerMsg.includes('acontecendo hoje') ||
  lowerMsg.includes('o que está acontecendo') ||
  lowerMsg.includes('me atualiza') ||
  lowerMsg.includes('últimas') ||
  lowerMsg.includes('ultimas')
) {
  const news = await fetchNews(); // ✅ agora 'news' está definido

  const reply = news.length
    ? news.map(item =>
        `📰 *${item.title}*\n${item.contentSnippet || 'Sem resumo'}\n🔗 ${item.link}`
      ).join('\n\n')
    : 'Hoje não encontrei notícias relevantes.';

  return res.json({ reply });
}
  // Dólar ou Euro?
if (
  message.toLowerCase().includes('dólar') ||
  message.toLowerCase().includes('dolar') ||
  message.toLowerCase().includes('euro')
) {
  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL');
    const data = await response.json();

    const usd = parseFloat(data.USDBRL.bid).toFixed(2);
    const eur = parseFloat(data.EURBRL.bid).toFixed(2);

    const reply = `💵 *Dólar hoje:* R$${usd}\n💶 *Euro hoje:* R$${eur}`;
    return res.json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao consultar a cotação.' });
  }
}

  const isAskingForEvents = await checkForEventsIntent(message);

  if (isAskingForEvents) {
    try {
      const response = await fetch('https://api.groovoo.io/ticketing_events');
      const events = await response.json();

      const filtered = events.filter(e => {
  const startDate = new Date(e.start_at);
  const now = new Date();
  return startDate >= now;
});

const reply = filtered.length
  ? filtered
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at)) // sort by date
      .slice(0, 3)
      .map(ev => {
        const name = ev.name || 'Evento sem nome';
        const date = new Date(ev.start_at).toLocaleString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const city = ev.address?.city || 'Local não informado';
        const link = ev.external_shop_url || ev.voucher || '';

        return `🎤 *${name}*\n📍 ${city}\n📅 ${date}${link ? `\n🔗 ${link}` : ''}`;
      })
      .join('\n\n')
  : 'Hoje não encontrei eventos no Groovoo. 😕';

return res.json({ reply });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro ao buscar eventos' });
    }
  } // closes if(isAskingForEvents)

// fallback to full OpenAI logic here

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: zazilPrompt },
{ role: 'system', content: `user_location=US` },
        { role: 'system', content: `channel=${channel}` },
        { role: 'user', content: message }
      ]
    });

    const rawReply = completion.choices[0].message.content;
const reply = channel === 'whatsapp' && rawReply.length > 1500
  ? rawReply.slice(0, 1490).trim() + ' … [resposta encurtada]'
  : rawReply;
// Affiliate enrichment for Amazon links
if (reply.toLowerCase().includes('amazon.com') && !reply.includes('tag=zilahrozati-20')) {
  reply = reply.replace(/(https:\/\/www\.amazon\.com\/[^\s)]+)/gi, (match) => {
    const hasParams = match.includes('?');
    return hasParams
      ? `${match}&tag=zilahrozati-20`
      : `${match}?tag=zilahrozati-20`;
  });
}
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Zazil backend running on port ${PORT}`);
});
