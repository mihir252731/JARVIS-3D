import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const apiKey = process.env.OPENAI_API_KEY;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You translate natural language 3D scene requests into simple commands.
Return ONLY a JSON array of strings. No markdown. No explanation.

Supported objects:
- city
- human / person / man / woman
- cyberpunk
- cube / box
- sphere / ball

Supported command language:
- "add city"
- "add human"
- "add 10 humans"
- "add 10 humans over here"
- "add 10 humans at the balcony"
- "remove human"
- "remove 5 humans"
- "remove city"
- "remove selected"
- "zoom in"
- "zoom in max"
- "zoom in 10 times"
- "zoom into the building in center"
- "zoom into the intersection near the center building"
- "zoom out"
- "rotate 90 degrees"
- "rotate left 45 degrees"
- "move left 5 times"
- "move right 3 times"
- "move closer"
- "move farther"
- "take me to human"
- "take me to city"
- "select human"
- "select city"
- "scale up"
- "scale down"
- "make human smaller"
- "make human bigger"
- "move forward 2 times"
- "move back 2 times"
- "show me the nearest balcony"
- "focus on the center building"

Rules:
- Preserve counts from the user.
- If user says "here", "there", "balcony", "street", "intersection", or "where I am looking", include that phrase in the command.
- For impossible semantic precision, use a best-effort focus or placement command based on the visible center.

Examples:
create 2 cubes -> ["add 2 cubes"]
put ten people on the balcony -> ["add 10 humans at the balcony"]
make the people smaller -> ["make human smaller"]
take out three people -> ["remove 3 humans"]
go to the crossing by the middle building -> ["zoom into the intersection near the center building"]
turn the person sideways -> ["rotate 90 degrees"]
bring the selected model closer -> ["move closer"]
take me in front of the person -> ["take me to human"]
          `,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "[]";

  return NextResponse.json({ commands: text });
}
