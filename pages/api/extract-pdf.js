// Extracts text from an uploaded PDF using Claude's document understanding.
// For heavier traffic later, swap this for a dedicated library like pdf-parse
// so extraction is instant and doesn't cost an API call.

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }
  const { base64Data } = req.body || {};
  if (!base64Data) {
    return res.status(400).json({ error: "Missing file data." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } },
              { type: "text", text: "Extract the full plain text content of this document. Respond with ONLY the extracted text, no commentary, no markdown fences." },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`status_${response.status}`);
    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock || !textBlock.text.trim()) throw new Error("empty");
    return res.status(200).json({ text: textBlock.text.trim() });
  } catch (err) {
    return res.status(502).json({ error: "Couldn't read that PDF — try .txt/.docx or paste instead." });
  }
}
