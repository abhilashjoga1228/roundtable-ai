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

type Clarification = {
  question: string;
  answer: string;
};

type AgentResult = {
  expert: string;
  role: string;
  answer: string;
};

type DecisionSensitivity =
  | "Low"
  | "Medium"
  | "High";

type Verdict = {
  recommendation: string;
  summary: string;
  consensus: string;
  reasons: string[];
  disagreement: string;
  minorityReport: string;
  confidence: ConfidenceLabel;
  confidenceReason: string;

  // Verdict Intelligence
  keyAssumption: string;
  decisionSensitivity: DecisionSensitivity;
  decisionSensitivityReason: string;
  flipCondition: string;
  missingInformation: string;

  // Backward compatibility for existing downstream routes
  changeCondition: string;

  nextStep: string;
};

function cleanJSON(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

function clarificationText(
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

function normalizeConfidence(
  value: unknown
): ConfidenceLabel {
  if (
    value === "Low" ||
    value === "Moderate" ||
    value === "High" ||
    value === "Very High"
  ) {
    return value;
  }

  return "Moderate";
}

function normalizeSensitivity(
  value: unknown
): DecisionSensitivity {
  if (
    value === "Low" ||
    value === "Medium" ||
    value === "High"
  ) {
    return value;
  }

  return "Medium";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : "";

    const clarifications:
      Clarification[] =
      Array.isArray(body?.clarifications)
        ? body.clarifications
        : [];

    if (!question) {
      return NextResponse.json(
        {
          error: "Question is required.",
        },
        { status: 400 }
      );
    }

    const context =
      clarificationText(clarifications);

    // ============================================================
    // STEP 1 — ORCHESTRATOR V2
    // Deliberate perspective diversity
    // ============================================================

    const orchestratorResponse =
      await client.responses.create({
        model: "gpt-4.1-mini",

        instructions: `
You are the Orchestrator for Round Table AI.

Do NOT answer the user's question.

Build a panel of experts that maximizes DECISION DIVERSITY,
not job-title diversity.

The panel should normally contain exactly 3 experts.

The three default decision functions are:

1. OPPORTUNITY / UPSIDE LENS
   - strongest credible case for the opportunity
   - benefits, upside, strategic advantage, growth, optionality
   - must still acknowledge real constraints

2. RISK / DOWNSIDE LENS
   - strongest credible downside case
   - failure modes, irreversibility, financial / operational / human risk
   - must not be pessimistic merely for balance

3. DOMAIN / PRACTICAL LENS
   - most relevant subject-matter or implementation perspective
   - evaluates what is realistically likely to work in practice

You may use a 4th expert ONLY if the decision genuinely requires a
distinct lens that the first three cannot cover well, such as:
- legal / regulatory
- family / relationship
- technical feasibility
- medical / safety
- ethics
- taxation
- geographic / immigration constraints

Do NOT create redundant experts.

Do NOT create artificial disagreement.

Each expert should have:
- a memorable professional name
- a concise role
- a specific focus
- a distinct communication voice
- a distinct reasoning style

For high-stakes decisions, use cautious advisory personas and do not
pretend the system is a licensed professional.

Return ONLY valid JSON:

{
  "experts": [
    {
      "name": "Expert title or persona",
      "role": "Short description of perspective",
      "focus": "Exactly what this expert should analyze",
      "voice": "Distinct conversational style",
      "reasoningStyle": "How this expert evaluates the decision"
    }
  ]
}

No markdown.
No text outside JSON.
        `,

        input: `
USER DECISION:

${question}

ADDITIONAL CONTEXT:

${context}

Choose the smallest expert panel that covers the decision with
meaningfully different lenses.
        `,
      });

    const orchestratorData = JSON.parse(
      cleanJSON(
        orchestratorResponse.output_text
      )
    ) as {
      experts?: Expert[];
    };

    const experts =
      Array.isArray(
        orchestratorData.experts
      )
        ? orchestratorData.experts.filter(
            (expert) =>
              expert?.name &&
              expert?.role &&
              expert?.focus
          )
        : [];

    if (
      experts.length < 3 ||
      experts.length > 4
    ) {
      throw new Error(
        "Invalid expert panel."
      );
    }

    // ============================================================
    // STEP 2 — ROUND 1 V2
    // TRUE BLIND INDEPENDENT ANALYSIS
    // ============================================================

    const round1: AgentResult[] =
      await Promise.all(
        experts.map(async (expert) => {
          const response =
            await client.responses.create({
              model: "gpt-4.1-mini",

              instructions: `
You are "${expert.name}" participating in Round Table AI.

ROLE:
${expert.role}

FOCUS:
${expert.focus}

VOICE:
${
  expert.voice ||
  "Natural, concise, and direct."
}

REASONING STYLE:
${
  expert.reasoningStyle ||
  "Reason carefully from your assigned perspective."
}

This is ROUND 1.

You are analyzing independently.

CRITICAL:
You have NOT seen the other experts.
Do not speculate about what they might say.
Do not manufacture consensus.
Do not manufacture disagreement.

Your job is to make the strongest reasoned recommendation from your
assigned perspective while respecting the user's stated priorities.

Evaluate:
- likely upside
- likely downside
- reversibility
- opportunity cost
- uncertainty
- user constraints
- what assumption your conclusion depends on most

Use exactly these headings because the frontend parses them:

POSITION:
One direct recommendation.

WHY:
Your strongest reasoning in 2-4 concise sentences.

WATCH OUT:
The most important risk, tradeoff, or failure mode.

KEY ASSUMPTION:
The single assumption that most affects your conclusion.

WHAT WOULD CHANGE MY VIEW:
One concrete fact or condition that would materially change your recommendation.

Keep the entire response concise.
              `,

              input: `
USER DECISION:

${question}

ADDITIONAL CONTEXT:

${context}

Analyze independently from your assigned perspective.
              `,
            });

          return {
            expert: expert.name,
            role: expert.role,
            answer:
              response.output_text.trim(),
          };
        })
      );

    // ============================================================
    // STEP 3 — ROUND 2 V2
    // CROSS-EXAMINATION + REVISION
    // ============================================================

    const round2: AgentResult[] =
      await Promise.all(
        experts.map(async (expert) => {
          const ownRound1 =
            round1.find(
              (item) =>
                item.expert ===
                expert.name
            );

          const others =
            round1.filter(
              (item) =>
                item.expert !==
                expert.name
            );

          const response =
            await client.responses.create({
              model: "gpt-4.1-mini",

              instructions: `
You are "${expert.name}" returning for ROUND 2 of Round Table AI.

ROLE:
${expert.role}

FOCUS:
${expert.focus}

VOICE:
${
  expert.voice ||
  "Natural, concise, and direct."
}

You can now see the other experts' independent Round 1 positions.

Your job is NOT to repeat Round 1.

You must genuinely update, defend, or refine your reasoning.

Do these four things:

1. Identify the STRONGEST POINT made by another expert.
2. Identify ONE ASSUMPTION or argument you challenge.
3. State whether your position changed:
   - YES
   - PARTIALLY
   - NO
4. Give a concise revised position.

If another expert exposed something you underweighted, acknowledge it.
If your original position still holds, explain why.

Do not agree merely to create consensus.
Do not disagree merely to create drama.

Return using exactly:

STRONGEST POINT FROM THE TABLE:
...

ASSUMPTION I CHALLENGE:
...

POSITION CHANGE:
YES / PARTIALLY / NO — short explanation

REVISED POSITION:
...

Keep the response concise.
              `,

              input: `
ORIGINAL USER DECISION:

${question}

ADDITIONAL CONTEXT:

${context}

YOUR ROUND 1:

${ownRound1?.answer || "Not available."}

OTHER EXPERTS' ROUND 1 POSITIONS:

${others
  .map(
    (item) => `
--------------------------------
${item.expert}
Role: ${item.role}

${item.answer}
`
  )
  .join("\n")}

Reconsider your position after reading the table.
              `,
            });

          return {
            expert: expert.name,
            role: expert.role,
            answer:
              response.output_text.trim(),
          };
        })
      );

    // ============================================================
    // STEP 4 — CHAIRPERSON V2
    // ARGUMENT QUALITY, NOT VOTE COUNT
    // ============================================================

    const chairpersonResponse =
      await client.responses.create({
        model: "gpt-4.1-mini",

        instructions: `
You are the neutral Chairperson of Round Table AI.

Your job is to synthesize a decision, not count votes.

Evaluate the recommendation using:

1. USER PRIORITIES
   What the user explicitly values or fears.

2. REVERSIBILITY
   How difficult it would be to undo the decision.

3. DOWNSIDE SEVERITY
   Not just probability — how costly failure would be.

4. OPPORTUNITY COST
   What the user gives up by choosing each option.

5. EVIDENCE QUALITY
   Which expert arguments are actually supported by the facts provided.

6. UNCERTAINTY
   Which unknowns materially affect the decision.

7. ARGUMENT QUALITY
   Prefer stronger reasoning over majority agreement.

Do NOT automatically side with the majority.

Do NOT manufacture consensus.

Do NOT manufacture a minority report.

If experts converge independently for strong reasons, say so.

If disagreement remains meaningful, preserve it clearly.

CONFIDENCE must be exactly one of:
"Low"
"Moderate"
"High"
"Very High"

Use "Very High" sparingly.

The recommendation should be direct and concise.
Keep it suitable for a prominent UI headline.

Return ONLY valid JSON:

{
  "recommendation": "Short direct recommendation",
  "summary": "2-4 concise sentences explaining the decision",
  "consensus": "Where experts genuinely agree",
  "reasons": [
    "Strongest reason 1",
    "Strongest reason 2",
    "Strongest reason 3"
  ],
  "disagreement": "Most important unresolved disagreement",
  "minorityReport": "Strongest credible opposing view, or clearly state there is no meaningful minority view",
  "confidence": "High",
  "confidenceReason": "Why this confidence level is appropriate",

  "keyAssumption": "The single assumption the recommendation depends on most",

  "decisionSensitivity": "Medium",
  "decisionSensitivityReason": "Why the recommendation is or is not sensitive to changing assumptions",

  "flipCondition": "A concrete fact, threshold, or condition that would most likely flip the recommended action",

  "missingInformation": "The most important unresolved information still limiting the decision, or an empty string if nothing material is missing",

  "changeCondition": "Copy the flipCondition here for backward compatibility",

  "nextStep": "One concrete practical next action"
}

DECISION SENSITIVITY:

"Low"
The recommendation is robust. Reasonable changes to uncertain facts are
unlikely to change the recommended action.

"Medium"
One or two important assumptions could change the recommendation if
they move materially.

"High"
The recommendation is fragile. A plausible change in a major unknown
could reverse the recommended action.

KEY ASSUMPTION:
Return ONE specific assumption only. It should be something the user
can evaluate, verify, or challenge.

FLIP CONDITION:
Be concrete. Prefer an observable threshold or condition.

Examples:
- "If post-purchase liquid reserves would fall below 6 months of expenses, keep renting."
- "If the startup cannot show credible revenue traction within 6 months, keep the current job."
- "If a credible competitor is likely to launch within 8 weeks, launch a controlled beta now."

MISSING INFORMATION:
Include only unresolved information important enough to reduce
confidence or decision stability.
Return an empty string if nothing material is missing.

Rules:
- reasons must contain exactly 3 items.
- decisionSensitivity must be exactly "Low", "Medium", or "High".
- changeCondition must match flipCondition in substance.
- No percentages.
- No markdown.
- No text outside JSON.
        `,

        input: `
USER DECISION:

${question}

ADDITIONAL CONTEXT:

${context}

EXPERT PANEL:

${experts
  .map(
    (expert) => `
${expert.name}
Role: ${expert.role}
Focus: ${expert.focus}
`
  )
  .join("\n")}

ROUND 1 — BLIND INDEPENDENT ANALYSIS:

${round1
  .map(
    (item) => `
================================
${item.expert}

${item.answer}
`
  )
  .join("\n")}

ROUND 2 — CROSS-EXAMINATION & REVISION:

${round2
  .map(
    (item) => `
================================
${item.expert}

${item.answer}
`
  )
  .join("\n")}

Produce the best decision for the user based on argument quality,
user priorities, downside, reversibility, opportunity cost, and uncertainty.
        `,
      });

    const verdictRaw =
      JSON.parse(
        cleanJSON(
          chairpersonResponse.output_text
        )
      ) as Partial<Verdict>;

    const verdict: Verdict = {
      recommendation:
        String(
          verdictRaw.recommendation || ""
        ).trim(),

      summary:
        String(
          verdictRaw.summary || ""
        ).trim(),

      consensus:
        String(
          verdictRaw.consensus || ""
        ).trim(),

      reasons:
        Array.isArray(
          verdictRaw.reasons
        )
          ? verdictRaw.reasons
              .map((item) =>
                String(item).trim()
              )
              .filter(Boolean)
              .slice(0, 3)
          : [],

      disagreement:
        String(
          verdictRaw.disagreement || ""
        ).trim(),

      minorityReport:
        String(
          verdictRaw.minorityReport || ""
        ).trim(),

      confidence:
        normalizeConfidence(
          verdictRaw.confidence
        ),

      confidenceReason:
        String(
          verdictRaw.confidenceReason ||
            ""
        ).trim(),

      keyAssumption:
        String(
          verdictRaw.keyAssumption ||
            ""
        ).trim(),

      decisionSensitivity:
        normalizeSensitivity(
          verdictRaw.decisionSensitivity
        ),

      decisionSensitivityReason:
        String(
          verdictRaw.decisionSensitivityReason ||
            ""
        ).trim(),

      flipCondition:
        String(
          verdictRaw.flipCondition ||
            verdictRaw.changeCondition ||
            ""
        ).trim(),

      missingInformation:
        String(
          verdictRaw.missingInformation ||
            ""
        ).trim(),

      changeCondition:
        String(
          verdictRaw.flipCondition ||
            verdictRaw.changeCondition ||
            ""
        ).trim(),

      nextStep:
        String(
          verdictRaw.nextStep || ""
        ).trim(),
    };

    if (
      !verdict.recommendation ||
      !verdict.summary ||
      verdict.reasons.length !== 3 ||
      !verdict.keyAssumption ||
      !verdict.decisionSensitivityReason ||
      !verdict.flipCondition ||
      !verdict.nextStep
    ) {
      throw new Error(
        "Invalid Chairperson verdict."
      );
    }

    return NextResponse.json({
      question,
      experts,
      round1,
      round2,
      verdict,
    });
  } catch (error) {
    console.error(
      "Round Table API Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while running the Round Table.",
      },
      { status: 500 }
    );
  }
}