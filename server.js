import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const client = new Anthropic();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const COMPANY_PROFILES = {
  yashvi_global: {
    name: "Yashvi Global",
    website: "yashviglobal.com",
    description: `Yashvi Global is a full-service digital agency offering 360° digital marketing and software development.
Services include:
- Digital Marketing: SEO, social media marketing, paid ads (Google/Meta), content marketing, email marketing, performance marketing
- Software Development: ERP systems, CRM solutions, custom web development
- Tech Stack: PHP and open-source technologies
- Approach: Data-driven, results-focused, tailored strategies
- Goal: Lead generation and business growth for clients`,
  },
  yashvi_konnect: {
    name: "Yashvi Konnect",
    website: "yashvikonnect.com",
    description: `Yashvi Konnect is a specialized digital agency exclusively serving e-commerce businesses.
Services include:
- E-commerce marketing: Paid ads (Google Shopping, Meta), conversion rate optimization, retargeting
- E-commerce SEO: Product page optimization, category SEO, technical SEO
- E-commerce growth: Email/SMS marketing, marketplace management, analytics
- Platform expertise: Shopify, WooCommerce, Magento, OpenCart
- Goal: Revenue growth and lead generation specifically for e-commerce brands`,
  },
};

const TONE_INSTRUCTIONS = `
You are responding from a personal LinkedIn profile on behalf of the company.
Tone guidelines:
- Warm, professional, and conversational (not salesy or pushy)
- Sound like a real person, not a corporate bot
- Brief and to the point — LinkedIn replies should be 2-5 sentences max
- Always end with a soft CTA: offer a quick call, ask a follow-up question, or invite them to connect
- Don't start with "Hi [name]" — just get into the reply naturally
- Don't use buzzwords like "synergy", "leverage", "holistic"
- Avoid emojis unless absolutely natural in context
`;

app.post("/api/generate", async (req, res) => {
  const { comment, company, context } = req.body;

  if (!comment || !company) {
    return res.status(400).json({ error: "comment and company are required" });
  }

  const profile = COMPANY_PROFILES[company];
  if (!profile) {
    return res.status(400).json({ error: "invalid company" });
  }

  const systemPrompt = `You are a LinkedIn reply generator for ${profile.name}.

Company Profile:
${profile.description}

${TONE_INSTRUCTIONS}

Your job: Given a LinkedIn comment or message someone left on a ${profile.name} post (or sent to the profile), generate a thoughtful, engaging reply that:
1. Acknowledges what they said
2. Subtly reinforces ${profile.name}'s value/expertise
3. Moves the conversation forward toward a potential business relationship
4. Feels like it came from a real person, not a marketing team`;

  const userMessage = `LinkedIn comment/message to reply to:
"${comment}"${context ? `\n\nAdditional context about this person or conversation:\n${context}` : ""}

Generate a natural LinkedIn reply.`;

  try {
    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      res.status(401).json({ error: "Invalid API key. Set ANTHROPIC_API_KEY." });
    } else if (error instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "Rate limited. Please try again shortly." });
    } else {
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LinkedIn Response Generator running at http://localhost:${PORT}`);
});
