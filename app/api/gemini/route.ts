// Server-side proxy: the Gemini API key stays here (Vercel env var GEMINI_API_KEY)
// and is never shipped inside the browser extension.

const ALLOWED_MODELS = new Set(["gemini-3.8-flash", "gemini-flash-lite-latest"]);
const MAX_BODY_CHARS = 400_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: { message: "Server is missing GEMINI_API_KEY." } }, 500);

  const model = new URL(request.url).searchParams.get("model") || "";
  if (!ALLOWED_MODELS.has(model)) {
    return json({ error: { message: "Model not allowed." } }, 400);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return json({ error: { message: "Conversation is too long." } }, 413);
  }

  let input: { systemInstruction?: unknown; contents?: unknown };
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: { message: "Invalid JSON." } }, 400);
  }

  // Forward only what we need, so the endpoint can't be used for anything else.
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: input.systemInstruction,
        contents: input.contents,
      }),
    }
  );

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
