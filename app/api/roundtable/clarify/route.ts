import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ClarificationQuestion = {
  id: string;
  question: string;
  whyItMatters: string;
  type: "choice" | "text";
  options: string[];
};

type ClarificationResult = {
  needsClarification: boolean;
  reason: string;
  questions: ClarificationQuestion[];
};

function cleanJSON(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

function normalizeQuestion(
  question: Partial<ClarificationQuestion>,
  index: number
): ClarificationQuestion {
  const type =
    question.type === "choice" ? "choice" : "text";

  const options =
    type === "choice" &&
    Array.isArray(question.options)
      ? question.options
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

  return {
    id:
      typeof question.id === "string" &&
      question.id.trim()
        ? question.id.trim()
        : `q${index + 1}`,

    question:
      typeof question.question === "string"
        ? question.question.trim()
        : "",

    whyItMatters:
      typeof question.whyItMatters === "string"
        ? question.whyItMatters.trim()
        : "",

    type,

    options,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return NextResponse.json(
        {
          error: "Question is required.",
        },
        { status: 400 }
      );
    }

    const response =
      await client.responses.create({
        model: "gpt-4.1-mini",

        instructions: `
You are the Clarification Gate for Round Table AI.

Your job is NOT to answer the user's decision.

Your job is to decide whether asking for additional context would
materially improve the eventual recommendation.

Ask clarification questions ONLY when the answer could realistically
change the recommended action, alter the risk/reward balance, or change
which assumptions matter most.

Do NOT ask questions merely because more context would be "nice to know."

Prefer decision variables such as:

- financial runway
- downside severity
- reversibility
- time horizon
- switching costs
- traction or evidence
- opportunity cost
- risk tolerance
- location / mobility constraints
- relationship / family constraints
- liquidity
- legal or contractual constraints
- implementation capacity
- urgency / market timing
- fallback options

Avoid vague questions such as:

- "Tell me more about your goals."
- "How do you feel about this?"
- "What matters most to you?" unless the user has not expressed any priorities
- generic demographic questions
- questions that would not alter the decision

RULES:

1. Ask between 0 and 3 questions.
2. If the question is already sufficiently specified, ask 0.
3. Every question must have a clear "whyItMatters".
4. Prefer "choice" questions when 3-5 concise options can capture the variable.
5. Use "text" only when fixed options would lose important information.
6. Do not ask two questions that measure essentially the same thing.
7. Do not ask for sensitive personal data unless it is genuinely necessary.
8. Keep wording short and concrete.

Return ONLY valid JSON using exactly:

{
  "needsClarification": true,
  "reason": "Short explanation of why these missing variables could change the decision",
  "questions": [
    {
      "id": "q1",
      "question": "Question text",
      "whyItMatters": "How this could change the recommendation",
      "type": "choice",
      "options": [
        "Option 1",
        "Option 2",
        "Option 3"
      ]
    }
  ]
}

If no clarification is needed, return:

{
  "needsClarification": false,
  "reason": "The question already contains enough decision-relevant context.",
  "questions": []
}

No markdown.
No text outside JSON.
        `,

        input: `
USER DECISION:

${question}

Determine whether clarification is genuinely necessary before assembling
the Round Table.
        `,
      });

    const raw = cleanJSON(
      response.output_text || ""
    );

    const parsed =
      JSON.parse(raw) as Partial<ClarificationResult>;

    const questions = Array.isArray(
      parsed.questions
    )
      ? parsed.questions
          .slice(0, 3)
          .map((item, index) =>
            normalizeQuestion(item, index)
          )
          .filter(
            (item) =>
              item.question &&
              item.whyItMatters &&
              (item.type === "text" ||
                item.options.length >= 2)
          )
      : [];

    const needsClarification =
      Boolean(parsed.needsClarification) &&
      questions.length > 0;

    return NextResponse.json({
      needsClarification,
      reason:
        typeof parsed.reason === "string" &&
        parsed.reason.trim()
          ? parsed.reason.trim()
          : needsClarification
          ? "A small amount of additional context could materially change the recommendation."
          : "The question already contains enough decision-relevant context.",
      questions:
        needsClarification
          ? questions
          : [],
    });
  } catch (error) {
    console.error(
      "Clarification API Error:",
      error
    );

    // Clarification is optional. Fail open so the main Round Table can continue.
    return NextResponse.json({
      needsClarification: false,
      reason:
        "Clarification could not be completed, so the Round Table can proceed with the information already provided.",
      questions: [],
    });
  }
}