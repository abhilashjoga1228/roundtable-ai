import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Expert = {
  name: string;
  role: string;
  focus?: string;
  voice?: string;
  reasoningStyle?: string;
};

type AgentResult = {
  expert: string;
  role: string;
  answer: string;
};

type Verdict = {
  recommendation: string;
  summary: string;
  consensus: string;
  reasons: string[];
  disagreement: string;
  minorityReport: string;
  confidence:
    | "Low"
    | "Moderate"
    | "High"
    | "Very High";
  confidenceReason: string;
  changeCondition: string;
  nextStep: string;
};

type DebateLine = {
  speaker: string;
  text: string;
};

type DebateScript = {
  title: string;
  estimatedSeconds: number;
  lines: DebateLine[];
};

function cleanJSON(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      question,
      experts,
      round1,
      round2,
      verdict,
    } = body;

    if (!question) {
      return NextResponse.json(
        {
          error: "Original question is required.",
        },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(experts) ||
      experts.length === 0
    ) {
      return NextResponse.json(
        {
          error: "Expert panel is required.",
        },
        { status: 400 }
      );
    }

    const response =
      await client.responses.create({
        model: "gpt-4.1-mini",

        instructions: `
You are the Debate Director for Round Table AI.

The experts have ALREADY completed their reasoning and debate.

Your job is NOT to create a new analysis.

Your job is to transform the EXISTING discussion into a short,
natural, engaging round-table conversation.

IMPORTANT RULES:

1. Preserve the actual substance of the expert arguments.
2. Do not introduce important new facts or arguments.
3. Do not change the final verdict.
4. Make experts sound distinct from one another.
5. Avoid repetitive phrases such as:
   "I agree with..."
   "That's a good point..."
   "I partially agree..."
6. Experts should directly respond to one another.
7. The conversation should feel like people sitting around a table.
8. Use short turns.
9. Avoid speeches longer than 2-3 sentences.
10. The Chairperson should speak LAST and close with the actual verdict.
11. Aim for approximately 60-120 seconds when spoken aloud.
12. Usually produce 8-14 total lines.
13. Every expert does not need the exact same number of turns.
14. Preserve meaningful disagreement.
15. If the experts largely agreed, do not invent dramatic conflict.

Use the expert's role, voice, and reasoning style to make each speaker
sound different.

For example:

A risk-oriented expert may sound direct and skeptical.

A startup advisor may sound energetic and upside-focused.

A therapist may sound measured and people-focused.

A technical expert may sound concise and analytical.

The Chairperson should sound neutral and decisive.

Return ONLY valid JSON using this structure:

{
  "title": "A short title for the debate",
  "estimatedSeconds": 90,
  "lines": [
    {
      "speaker": "Expert name",
      "text": "Natural spoken dialogue"
    },
    {
      "speaker": "Another expert",
      "text": "Direct response"
    },
    {
      "speaker": "Chairperson",
      "text": "Closing verdict"
    }
  ]
}

Do not use markdown.
Do not include anything outside JSON.
        `,

        input: `
ORIGINAL QUESTION:

${question}


EXPERT PANEL:

${experts
  .map(
    (expert: Expert) => `
${expert.name}
Role: ${expert.role}
Focus: ${expert.focus || ""}
Voice: ${expert.voice || ""}
Reasoning style: ${expert.reasoningStyle || ""}
`
  )
  .join("\n")}


ROUND 1 — INDEPENDENT POSITIONS:

${(round1 || [])
  .map(
    (item: AgentResult) => `
${item.expert}:
${item.answer}
`
  )
  .join("\n")}


ROUND 2 — ACTUAL DEBATE:

${(round2 || [])
  .map(
    (item: AgentResult) => `
${item.expert}:
${item.answer}
`
  )
  .join("\n")}


FINAL VERDICT:

${JSON.stringify(verdict, null, 2)}


Create a short spoken-style debate faithful to this discussion.
        `,
      });

    const script: DebateScript =
      JSON.parse(
        cleanJSON(response.output_text)
      );

    if (
      !script.title ||
      !Array.isArray(script.lines) ||
      script.lines.length < 3
    ) {
      throw new Error(
        "Invalid debate script."
      );
    }

    const hasChairperson =
      script.lines.some(
        (line) =>
          line.speaker
            .toLowerCase()
            .includes("chairperson")
      );

    if (!hasChairperson) {
      script.lines.push({
        speaker: "Chairperson",
        text:
          verdict?.recommendation ||
          "The table has reached its final recommendation.",
      });
    }

    return NextResponse.json({
      script,
    });
  } catch (error) {
    console.error(
      "Debate Director API Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while preparing the debate.",
      },
      { status: 500 }
    );
  }
}