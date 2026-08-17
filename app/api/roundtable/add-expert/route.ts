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
  recommendation?: string;
  summary?: string;
  consensus?: string;
  reasons?: string[];
  disagreement?: string;
  minorityReport?: string;
  confidence?: string;
  confidenceReason?: string;
  changeCondition?: string;
  nextStep?: string;
};

type Clarification = {
  question: string;
  answer: string;
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
      requestedPerspective,
      existingExperts,
      round1,
      round2,
      verdict,
      clarifications,
    } = body as {
      question: string;
      requestedPerspective: string;
      existingExperts?: Expert[];
      round1?: AgentResult[];
      round2?: AgentResult[];
      verdict?: Verdict;
      clarifications?: Clarification[];
    };

    // ============================================================
    // VALIDATION
    // ============================================================

    if (!question?.trim()) {
      return NextResponse.json(
        {
          error: "Original question is required.",
        },
        { status: 400 }
      );
    }

    if (!requestedPerspective?.trim()) {
      return NextResponse.json(
        {
          error: "Please describe the perspective you want to add.",
        },
        { status: 400 }
      );
    }

    // ============================================================
    // PREPARE EXISTING TABLE CONTEXT
    // ============================================================

    const existingExpertText =
      existingExperts && existingExperts.length > 0
        ? existingExperts
            .map(
              (expert) => `
${expert.name}
Role: ${expert.role}
Focus: ${expert.focus || "Not specified"}
`
            )
            .join("\n")
        : "No existing experts available.";

    const clarificationText =
      clarifications && clarifications.length > 0
        ? clarifications
            .map(
              (item) => `
Question: ${item.question}
User answer: ${item.answer}
`
            )
            .join("\n")
        : "No additional clarification was provided.";

    const round1Text =
      round1 && round1.length > 0
        ? round1
            .map(
              (item) => `
${item.expert}
Role: ${item.role}

${item.answer}
`
            )
            .join("\n--------------------\n")
        : "Round 1 is not available.";

    const round2Text =
      round2 && round2.length > 0
        ? round2
            .map(
              (item) => `
${item.expert}
Role: ${item.role}

${item.answer}
`
            )
            .join("\n--------------------\n")
        : "Round 2 is not available.";

    // ============================================================
    // CREATE THE NEW EXPERT
    // ============================================================

    const expertCreationResponse = await client.responses.create({
      model: "gpt-4.1-mini",

      instructions: `
You are the expert-selection system for Round Table AI.

The user wants to add ONE new perspective to an existing expert panel.

Your job is to create one expert persona that contributes a genuinely
different and useful lens.

IMPORTANT:

- Do not duplicate an existing expert.
- Follow the user's requested perspective.
- Make the expert relevant to the original decision.
- Give the expert a memorable but professional name.
- The expert must represent a perspective, not falsely claim to be a
  real licensed professional.
- The expert should have a distinct reasoning style.
- Keep the role and focus concise.
- "voice" describes conversational personality, not an audio voice.

Return ONLY valid JSON using exactly this structure:

{
  "name": "Expert name",
  "role": "Short description of the expert's perspective",
  "focus": "What this expert will specifically analyze",
  "voice": "How this expert communicates",
  "reasoningStyle": "How this expert approaches decisions"
}

No markdown.
No text outside JSON.
      `,

      input: `
ORIGINAL USER QUESTION:

${question}

USER WANTS TO ADD THIS PERSPECTIVE:

${requestedPerspective}

EXISTING EXPERT PANEL:

${existingExpertText}

Create ONE new expert who adds a meaningfully different perspective.
      `,
    });

    const expertText = cleanJSON(
      expertCreationResponse.output_text
    );

    const newExpert: Expert = JSON.parse(expertText);

    if (
      !newExpert.name ||
      !newExpert.role ||
      !newExpert.focus
    ) {
      throw new Error("Invalid new expert.");
    }

    // ============================================================
    // GET NEW EXPERT'S INDEPENDENT PERSPECTIVE
    // ============================================================

    const perspectiveResponse = await client.responses.create({
      model: "gpt-4.1-mini",

      instructions: `
You are "${newExpert.name}", a newly invited participant in Round Table AI.

ROLE:
${newExpert.role}

FOCUS:
${newExpert.focus}

VOICE:
${newExpert.voice || "Natural, concise, and direct."}

REASONING STYLE:
${
  newExpert.reasoningStyle ||
  "Analyze the decision carefully from your unique perspective."
}

You were invited AFTER the original Round Table finished.

You can see the original discussion and Chairperson verdict.

Your purpose is NOT to summarize what everyone already said.

Your purpose is to identify what your perspective adds.

You may agree with the existing verdict.
You may disagree with it.
You may partially agree.

Do not manufacture disagreement merely to seem different.

Do not pretend to have real-world credentials, licenses, employment,
or personal experiences.

Keep your response concise and conversational.
      `,

      input: `
ORIGINAL USER QUESTION:

${question}

ADDITIONAL USER CONTEXT:

${clarificationText}

EXISTING EXPERT PANEL:

${existingExpertText}

ROUND 1:

${round1Text}

ROUND 2:

${round2Text}

CHAIRPERSON'S CURRENT VERDICT:

Recommendation:
${verdict?.recommendation || "Not available"}

Summary:
${verdict?.summary || "Not available"}

Consensus:
${verdict?.consensus || "Not available"}

Key disagreement:
${verdict?.disagreement || "Not available"}

Minority report:
${verdict?.minorityReport || "Not available"}

What could change the decision:
${verdict?.changeCondition || "Not available"}

YOU WERE INVITED BECAUSE THE USER ASKED FOR:

${requestedPerspective}

Give your independent contribution using exactly these sections:

WHAT I ADD:
Explain the important perspective the existing table may be missing.

MY VIEW:
Give your recommendation from your perspective.

WHAT I WOULD CHALLENGE:
Identify one assumption, argument, or part of the existing verdict you
would question. If you genuinely agree with the table, explain what
still deserves more scrutiny.

WHAT WOULD MATTER MOST:
Give the single most important piece of information you would want
before making the decision.

Keep the entire response concise.
      `,
    });

    const perspective = perspectiveResponse.output_text?.trim();

    if (!perspective) {
      throw new Error(
        "The new expert did not return a perspective."
      );
    }

    // ============================================================
    // RETURN
    // ============================================================

    return NextResponse.json({
      expert: newExpert,
      perspective,
    });
  } catch (error) {
    console.error("Add Expert API Error:", error);

    return NextResponse.json(
      {
        error:
          "Something went wrong while adding the new perspective.",
      },
      { status: 500 }
    );
  }
}