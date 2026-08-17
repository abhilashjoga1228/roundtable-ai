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

type ConversationMessage = {
  question: string;
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      question,
      expert,
      userQuestion,
      round1,
      round2,
      verdict,
      clarifications,
      conversationHistory,
    } = body as {
      question: string;
      expert: Expert;
      userQuestion: string;
      round1?: AgentResult[];
      round2?: AgentResult[];
      verdict?: Verdict;
      clarifications?: {
        question: string;
        answer: string;
      }[];
      conversationHistory?: ConversationMessage[];
    };

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "Original question is required." },
        { status: 400 }
      );
    }

    if (!expert?.name) {
      return NextResponse.json(
        { error: "Expert is required." },
        { status: 400 }
      );
    }

    if (!userQuestion?.trim()) {
      return NextResponse.json(
        { error: "Question for the expert is required." },
        { status: 400 }
      );
    }

    const expertRound1 = round1?.find(
      (item) => item.expert === expert.name
    );

    const expertRound2 = round2?.find(
      (item) => item.expert === expert.name
    );

    const clarificationText =
      clarifications && clarifications.length > 0
        ? clarifications
            .map(
              (item) =>
                `Question: ${item.question}\nUser answer: ${item.answer}`
            )
            .join("\n\n")
        : "No additional clarification was provided.";

    const historyText =
      conversationHistory && conversationHistory.length > 0
        ? conversationHistory
            .map(
              (item, index) => `
FOLLOW-UP ${index + 1}

User:
${item.question}

${expert.name}:
${item.answer}
`
            )
            .join("\n")
        : "No prior direct conversation with this expert.";

    const input = `
ORIGINAL USER DECISION:

${question}

ADDITIONAL USER CONTEXT:

${clarificationText}

YOUR ORIGINAL ROUND 1 POSITION:

${expertRound1?.answer || "No Round 1 response available."}

YOUR ROUND 2 POSITION:

${expertRound2?.answer || "No Round 2 response available."}

CHAIRPERSON'S FINAL VERDICT:

Recommendation:
${verdict?.recommendation || "Not available"}

Summary:
${verdict?.summary || "Not available"}

Consensus:
${verdict?.consensus || "Not available"}

Key disagreement:
${verdict?.disagreement || "Not available"}

WHAT COULD CHANGE THE DECISION:

${verdict?.changeCondition || "Not available"}

YOUR DIRECT CONVERSATION WITH THE USER SO FAR:

${historyText}

THE USER'S NEW FOLLOW-UP:

${userQuestion}

Continue the existing conversation naturally.

Do not restart from the beginning.
Do not repeat information unless needed.
Refer back to earlier follow-ups when relevant.
If the user changes an assumption, explicitly explain how that affects your view.

Answer from YOUR perspective only.

Keep the response concise:
usually 2-4 short paragraphs.

Do not use formal report headings.
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",

      instructions: `
You are "${expert.name}" in Round Table AI.

ROLE:
${expert.role}

FOCUS:
${expert.focus || "Use the perspective implied by your role."}

VOICE:
${expert.voice || "Natural, direct, and distinct."}

REASONING STYLE:
${expert.reasoningStyle || "Reason carefully from your expert perspective."}

You are one persistent member of the same expert panel.

Maintain continuity with your earlier answers.

Do not become a generic assistant.
Do not automatically agree with the user.
Do not automatically agree with the Chairperson.

If new information changes your view, say so clearly.
      `,

      input,
    });

    const answer = response.output_text?.trim();

    if (!answer) {
      throw new Error("Expert returned an empty response.");
    }

    return NextResponse.json({
      expert: expert.name,
      role: expert.role,
      question: userQuestion,
      answer,
    });
  } catch (error) {
    console.error("Ask Expert API Error:", error);

    return NextResponse.json(
      {
        error:
          "Something went wrong while asking the expert.",
      },
      { status: 500 }
    );
  }
}