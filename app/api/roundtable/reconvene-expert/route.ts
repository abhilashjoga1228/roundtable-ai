import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ConfidenceLabel =
  | "Low"
  | "Moderate"
  | "High"
  | "Very High";

type VerdictChange =
  | "VERDICT CHANGED"
  | "VERDICT REFINED"
  | "VERDICT UNCHANGED";

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

type Clarification = {
  question: string;
  answer: string;
};

type Verdict = {
  recommendation: string;
  summary: string;
  consensus: string;
  reasons: string[];
  disagreement: string;
  minorityReport: string;
  confidence: ConfidenceLabel;
  confidenceReason: string;
  changeCondition: string;
  nextStep: string;
};

type ExpertReaction = {
  expert: string;
  role: string;
  reaction: string;
};

type ReconvenedVerdict = Verdict & {
  status: VerdictChange;
  whatChanged: string;
  whatStillHolds: string;
  newExpertImpact: string;
};

function cleanJSON(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

function buildClarificationContext(
  clarifications?: Clarification[]
) {
  if (
    !Array.isArray(clarifications) ||
    clarifications.length === 0
  ) {
    return "No additional clarification was provided.";
  }

  return clarifications
    .map(
      (item, index) => `
${index + 1}. ${item.question}
User answer: ${item.answer}
`
    )
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      question,
      clarifications,
      originalExperts,
      round1,
      round2,
      previousVerdict,
      addedExpert,
      addedExpertPerspective,
    } = body as {
      question: string;
      clarifications?: Clarification[];
      originalExperts: Expert[];
      round1?: AgentResult[];
      round2?: AgentResult[];
      previousVerdict: Verdict;
      addedExpert: Expert;
      addedExpertPerspective: string;
    };

    // ============================================================
    // VALIDATION
    // ============================================================

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "Original question is required." },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(originalExperts) ||
      originalExperts.length === 0
    ) {
      return NextResponse.json(
        { error: "Original expert panel is required." },
        { status: 400 }
      );
    }

    if (!previousVerdict?.recommendation) {
      return NextResponse.json(
        { error: "Previous verdict is required." },
        { status: 400 }
      );
    }

    if (!addedExpert?.name) {
      return NextResponse.json(
        { error: "Added expert is required." },
        { status: 400 }
      );
    }

    if (!addedExpertPerspective?.trim()) {
      return NextResponse.json(
        { error: "Added expert perspective is required." },
        { status: 400 }
      );
    }

    const userContext =
      buildClarificationContext(clarifications);

    // ============================================================
    // STEP 1 — ORIGINAL EXPERTS REACT TO THE NEW EXPERT
    // ============================================================

    const reactions: ExpertReaction[] =
      await Promise.all(
        originalExperts.map(
          async (expert) => {
            const originalRound1 =
              round1?.find(
                (item) =>
                  item.expert ===
                  expert.name
              );

            const originalRound2 =
              round2?.find(
                (item) =>
                  item.expert ===
                  expert.name
              );

            const response =
              await client.responses.create({
                model: "gpt-4.1-mini",

                instructions: `
You are "${expert.name}" returning to an existing Round Table.

ROLE:
${expert.role}

FOCUS:
${expert.focus || "Use the perspective implied by your role."}

VOICE:
${expert.voice || "Natural, concise, and direct."}

REASONING STYLE:
${
  expert.reasoningStyle ||
  "Evaluate the new perspective carefully from your own lens."
}

A new expert has joined AFTER the original verdict.

Your job is to react to the new expert, not repeat your old analysis.

Keep the entire response under 90 words.

Speak naturally, as if you are responding across the table.

Do one of these:
- challenge the new expert,
- strengthen their argument,
- explain why it does not change your view,
- or acknowledge that it materially changes your view.

Do not manufacture disagreement.
Do not summarize the entire table.
                `,

                input: `
ORIGINAL QUESTION:

${question}

USER CONTEXT:

${userContext}

YOUR ORIGINAL ROUND 1 VIEW:

${originalRound1?.answer || "Not available."}

YOUR ORIGINAL ROUND 2 VIEW:

${originalRound2?.answer || "Not available."}

CURRENT CHAIRPERSON VERDICT:

${previousVerdict.recommendation}

NEW EXPERT:

${addedExpert.name}
Role: ${addedExpert.role}
Focus: ${addedExpert.focus || "Not specified"}

NEW EXPERT'S CONTRIBUTION:

${addedExpertPerspective}

Respond directly to the new expert from your established perspective.
                `,
              });

            return {
              expert: expert.name,
              role: expert.role,
              reaction:
                response.output_text.trim(),
            };
          }
        )
      );

    // ============================================================
    // STEP 2 — NEW EXPERT GETS ONE FINAL RESPONSE
    // ============================================================

    const addedExpertResponse =
      await client.responses.create({
        model: "gpt-4.1-mini",

        instructions: `
You are "${addedExpert.name}", the newly invited expert at Round Table AI.

ROLE:
${addedExpert.role}

FOCUS:
${addedExpert.focus || "Use the perspective implied by your role."}

VOICE:
${addedExpert.voice || "Natural, concise, and direct."}

REASONING STYLE:
${
  addedExpert.reasoningStyle ||
  "Reason carefully from your unique perspective."
}

The original experts have now responded to your contribution.

Give ONE short final response to the table.

Keep it under 100 words.

Address the strongest reaction you heard.
Clarify whether your perspective changes, refines, or supports the existing verdict.

Do not repeat your entire original contribution.
Do not force disagreement.
        `,

        input: `
ORIGINAL QUESTION:

${question}

USER CONTEXT:

${userContext}

YOUR ORIGINAL CONTRIBUTION:

${addedExpertPerspective}

ORIGINAL EXPERT REACTIONS:

${reactions
  .map(
    (item) => `
${item.expert}:
${item.reaction}
`
  )
  .join("\n")}

CURRENT VERDICT:

${previousVerdict.recommendation}

Give your final response to the table.
        `,
      });

    const newExpertFinalResponse =
      addedExpertResponse.output_text.trim();

    // ============================================================
    // STEP 3 — CHAIRPERSON RECONVENES
    // ============================================================

    const chairpersonResponse =
      await client.responses.create({
        model: "gpt-4.1-mini",

        instructions: `
You are the neutral Chairperson of Round Table AI.

A new expert joined after the original verdict.
The original experts reacted.
The new expert responded once more.

Your job is to determine whether the new perspective actually changes
the decision.

Do NOT change the verdict merely because a new expert was added.

Use exactly one status:

"VERDICT CHANGED"
Use only when the recommended action meaningfully changes.

"VERDICT REFINED"
Use when the core recommendation remains, but an important condition,
sequence, caveat, or action changes.

"VERDICT UNCHANGED"
Use when the new perspective is useful but does not materially alter
the original recommendation.

CONFIDENCE must be exactly one of:
"Low"
"Moderate"
"High"
"Very High"

Return ONLY valid JSON:

{
  "status": "VERDICT REFINED",
  "recommendation": "Short current recommendation",
  "summary": "2-3 concise sentences explaining the reconvened verdict",
  "consensus": "Where the reconvened table genuinely agrees",
  "reasons": [
    "Strongest reason 1",
    "Strongest reason 2",
    "Strongest reason 3"
  ],
  "disagreement": "Most important remaining disagreement",
  "minorityReport": "Strongest opposing view, or say no meaningful minority view exists",
  "confidence": "High",
  "confidenceReason": "Why this confidence label is appropriate",
  "changeCondition": "Most important fact that could change the decision again",
  "nextStep": "One concrete next action",
  "whatChanged": "What changed after adding this expert",
  "whatStillHolds": "What important part of the original reasoning remains valid",
  "newExpertImpact": "The specific contribution the new expert made to the decision"
}

Do not manufacture consensus.
Do not manufacture disagreement.
No percentages.
No markdown.
No text outside JSON.
        `,

        input: `
ORIGINAL QUESTION:

${question}

USER CONTEXT:

${userContext}

ORIGINAL VERDICT:

${JSON.stringify(
  previousVerdict,
  null,
  2
)}

NEW EXPERT:

${addedExpert.name}
Role: ${addedExpert.role}
Focus: ${addedExpert.focus || "Not specified"}

NEW EXPERT'S ORIGINAL CONTRIBUTION:

${addedExpertPerspective}

ORIGINAL EXPERT REACTIONS:

${reactions
  .map(
    (item) => `
${item.expert}:
${item.reaction}
`
  )
  .join("\n")}

NEW EXPERT'S FINAL RESPONSE:

${newExpertFinalResponse}

Determine whether the verdict changed, was refined, or remains unchanged.
        `,
      });

    const reconvenedVerdict:
      ReconvenedVerdict =
      JSON.parse(
        cleanJSON(
          chairpersonResponse.output_text
        )
      );

    const allowedStatuses:
      VerdictChange[] = [
      "VERDICT CHANGED",
      "VERDICT REFINED",
      "VERDICT UNCHANGED",
    ];

    if (
      !allowedStatuses.includes(
        reconvenedVerdict.status
      )
    ) {
      reconvenedVerdict.status =
        "VERDICT REFINED";
    }

    const allowedConfidence:
      ConfidenceLabel[] = [
      "Low",
      "Moderate",
      "High",
      "Very High",
    ];

    if (
      !allowedConfidence.includes(
        reconvenedVerdict.confidence
      )
    ) {
      reconvenedVerdict.confidence =
        "Moderate";
    }

    if (
      !reconvenedVerdict.recommendation ||
      !reconvenedVerdict.summary ||
      !Array.isArray(
        reconvenedVerdict.reasons
      ) ||
      reconvenedVerdict.reasons.length !== 3
    ) {
      throw new Error(
        "Invalid reconvened verdict."
      );
    }

    return NextResponse.json({
      addedExpert:
        addedExpert.name,
      reactions,
      newExpertFinalResponse,
      updatedVerdict:
        reconvenedVerdict,
    });
  } catch (error) {
    console.error(
      "Reconvene Expert API Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while reconvening the table with the new expert.",
      },
      { status: 500 }
    );
  }
}