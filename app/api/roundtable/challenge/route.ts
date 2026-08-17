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

type Expert = {
  name: string;
  role: string;
  focus: string;
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
  confidence: ConfidenceLabel;
  confidenceReason: string;
  changeCondition: string;
  nextStep: string;
};

type Reconsideration = {
  expert: string;
  role: string;
  shift:
    | "MAJOR CHANGE"
    | "PARTIAL CHANGE"
    | "NO CHANGE";
  summary: string;
  updatedPosition: string;
};

type UpdatedVerdict =
  Verdict & {
    whatChanged: string;
    expertShifts: string;
    whatStillHolds: string;
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
    const body =
      await request.json();

    const {
      question,
      challenge,
      experts,
      round1,
      round2,
      previousVerdict,
    } = body;

    if (!question || !challenge) {
      return NextResponse.json(
        {
          error:
            "Question and new information are required.",
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
          error:
            "Original expert panel is missing.",
        },
        { status: 400 }
      );
    }

    // ============================================================
    // SAME EXPERTS RECONSIDER
    // ============================================================

    const reconsiderations:
      Reconsideration[] =
      await Promise.all(
        experts.map(
          async (
            expert: Expert
          ) => {
            const previousRound1 =
              round1?.find(
                (
                  item: AgentResult
                ) =>
                  item.expert ===
                  expert.name
              );

            const previousRound2 =
              round2?.find(
                (
                  item: AgentResult
                ) =>
                  item.expert ===
                  expert.name
              );

            const response =
              await client.responses.create(
                {
                  model:
                    "gpt-4.1-mini",

                  instructions: `
You are "${expert.name}" reconvening at the same Round Table.

ROLE:
${expert.role}

VOICE:
${expert.voice || "Natural and direct"}

REASONING STYLE:
${expert.reasoningStyle || expert.focus}

The user has added important new information.

Reconsider honestly.

Do not defend your old answer just because you said it before.
Do not change merely to please the user.

Keep your analysis SHORT.

Return ONLY JSON:

{
  "shift": "PARTIAL CHANGE",
  "summary": "Maximum 2 short sentences explaining why the new information matters",
  "updatedPosition": "Maximum 2 short sentences giving your current view"
}

shift must be exactly:

"MAJOR CHANGE"
"PARTIAL CHANGE"
"NO CHANGE"

No markdown.
                  `,

                  input: `
ORIGINAL QUESTION:

${question}

NEW INFORMATION:

${challenge}

YOUR ORIGINAL VIEW:

${previousRound1?.answer}

YOUR DEBATE POSITION:

${previousRound2?.answer}
                  `,
                }
              );

            const parsed =
              JSON.parse(
                cleanJSON(
                  response.output_text
                )
              );

            return {
              expert:
                expert.name,
              role:
                expert.role,
              shift:
                parsed.shift,
              summary:
                parsed.summary,
              updatedPosition:
                parsed.updatedPosition,
            };
          }
        )
      );

    // ============================================================
    // UPDATED CHAIRPERSON
    // ============================================================

    const chairpersonResponse =
      await client.responses.create({
        model: "gpt-4.1-mini",

        instructions: `
You are the Chairperson reconvening Round Table AI.

Decide whether the user's new information changes the original verdict.

Do not use numeric confidence.

Confidence must be exactly:

"Low"
"Moderate"
"High"
"Very High"

Return ONLY valid JSON:

{
  "recommendation": "Short updated recommendation",
  "summary": "2-3 concise sentences",
  "consensus": "Current genuine consensus",
  "reasons": [
    "Strongest reason 1",
    "Strongest reason 2",
    "Strongest reason 3"
  ],
  "disagreement": "Most important remaining disagreement",
  "minorityReport": "Strongest opposing view or state that none meaningfully exists",
  "confidence": "High",
  "confidenceReason": "Short explanation",
  "changeCondition": "What could materially change this decision again",
  "nextStep": "One concrete next action",
  "whatChanged": "What changed because of the user's new information",
  "expertShifts": "Brief summary of which experts changed",
  "whatStillHolds": "Important original reasoning that remains valid"
}

No percentages.
Do not manufacture disagreement.
No markdown.
No text outside JSON.
        `,

        input: `
ORIGINAL QUESTION:

${question}

ORIGINAL VERDICT:

${JSON.stringify(
  previousVerdict,
  null,
  2
)}

NEW INFORMATION:

${challenge}

EXPERT RECONSIDERATIONS:

${reconsiderations
  .map(
    (item) => `
${item.expert}

Shift: ${item.shift}

${item.summary}

Updated position:
${item.updatedPosition}
`
  )
  .join("\n")}
        `,
      });

    const updatedVerdict:
      UpdatedVerdict =
      JSON.parse(
        cleanJSON(
          chairpersonResponse.output_text
        )
      );

    const allowedConfidence:
      ConfidenceLabel[] = [
      "Low",
      "Moderate",
      "High",
      "Very High",
    ];

    if (
      !allowedConfidence.includes(
        updatedVerdict.confidence
      )
    ) {
      updatedVerdict.confidence =
        "Moderate";
    }

    return NextResponse.json({
      challenge,
      reconsiderations,
      updatedVerdict,
    });
  } catch (error) {
    console.error(
      "Challenge API Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while reconvening the Round Table.",
      },
      { status: 500 }
    );
  }
}