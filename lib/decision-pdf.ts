import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";

type Snapshot = any;

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

const MARGIN = 52;

const CONTENT_WIDTH =
  PAGE_WIDTH - MARGIN * 2;

function clean(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDecisionTitle(value: unknown) {
  const original = clean(value);
  if (!original) return "Decision";

  const lower = original.toLowerCase();
  if (lower.includes("should i")) {
    const start = lower.indexOf("should i");
    const candidate = original.slice(start);
    const normalized = candidate
      .replace(/^should i\s+/i, "Should I ")
      .replace(/\s+/g, " ")
      .replace(/[.]+$/, "");
    return normalized.endsWith("?") ? normalized : `${normalized}?`;
  }

  const sentence =
    original.charAt(0).toUpperCase() + original.slice(1).replace(/[.]+$/, "");
  return sentence.endsWith("?") ? sentence : `${sentence}?`;
}

function wrapText(
  text: string,
  font: any,
  size: number,
  width: number
) {
  const words = clean(text)
    .split(" ")
    .filter(Boolean);

  const lines: string[] = [];

  let current = "";

  for (const word of words) {
    const candidate = current
      ? `${current} ${word}`
      : word;

    const candidateWidth =
      font.widthOfTextAtSize(
        candidate,
        size
      );

    if (candidateWidth <= width) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
      }

      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

export async function buildDecisionPdf({
  title,
  question,
  snapshot,
}: {
  title?: string;
  question?: string;
  snapshot: Snapshot;
}) {
  const pdf =
    await PDFDocument.create();

  const regular =
    await pdf.embedFont(
      StandardFonts.Helvetica
    );

  const bold =
    await pdf.embedFont(
      StandardFonts.HelveticaBold
    );

  const colors = {
    background:
      rgb(0.03, 0.05, 0.10),

    card:
      rgb(0.06, 0.09, 0.16),

    white:
      rgb(0.97, 0.98, 0.99),

    text:
      rgb(0.78, 0.82, 0.88),

    muted:
      rgb(0.44, 0.50, 0.60),

    violet:
      rgb(0.55, 0.36, 0.96),

    green:
      rgb(0.20, 0.83, 0.60),

    amber:
      rgb(0.98, 0.75, 0.14),

    blue:
      rgb(0.22, 0.74, 0.97),
  };

  let page =
    pdf.addPage([
      PAGE_WIDTH,
      PAGE_HEIGHT,
    ]);

  let y =
    PAGE_HEIGHT - MARGIN;

  function drawPageHeader() {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      color: colors.background,
    });

    y =
      PAGE_HEIGHT - MARGIN;

    page.drawText(
      "ROUND TABLE AI",
      {
        x: MARGIN,
        y,
        size: 9,
        font: bold,
        color: colors.violet,
      }
    );

    page.drawText(
      "by Abhi Analyst",
      {
        x:
          PAGE_WIDTH -
          MARGIN -
          72,

        y,

        size: 8,

        font: regular,

        color: colors.muted,
      }
    );

    y -= 30;
  }

  function newPage() {
    page =
      pdf.addPage([
        PAGE_WIDTH,
        PAGE_HEIGHT,
      ]);

    drawPageHeader();
  }

  function ensureSpace(
    required: number
  ) {
    if (
      y - required <
      MARGIN + 12
    ) {
      newPage();
    }
  }

  function label(
    text: string,
    color = colors.muted
  ) {
    ensureSpace(20);

    page.drawText(
      text.toUpperCase(),
      {
        x: MARGIN,
        y,
        size: 8,
        font: bold,
        color,
      }
    );

    y -= 16;
  }

  function paragraph(
    text: string,
    options?: {
      size?: number;
      font?: any;
      color?: any;
      gap?: number;
    }
  ) {
    const cleaned =
      clean(text);

    if (!cleaned) {
      return;
    }

    const size =
      options?.size || 10;

    const usedFont =
      options?.font ||
      regular;

    const color =
      options?.color ||
      colors.text;

    const gap =
      options?.gap ??
      10;

    const lines =
      wrapText(
        cleaned,
        usedFont,
        size,
        CONTENT_WIDTH
      );

    const lineHeight =
      size * 1.42;

    ensureSpace(
      lines.length *
        lineHeight +
        gap
    );

    for (const line of lines) {
      page.drawText(
        line,
        {
          x: MARGIN,
          y,
          size,
          font: usedFont,
          color,
        }
      );

      y -= lineHeight;
    }

    y -= gap;
  }

  function bullet(
    text: string
  ) {
    const cleaned =
      clean(text);

    if (!cleaned) {
      return;
    }

    const size = 9.5;

    const lines =
      wrapText(
        cleaned,
        regular,
        size,
        CONTENT_WIDTH - 18
      );

    const lineHeight =
      13.5;

    ensureSpace(
      lines.length *
        lineHeight +
        8
    );

    page.drawCircle({
      x:
        MARGIN + 3,

      y:
        y + 3,

      size: 2,

      color:
        colors.green,
    });

    for (const line of lines) {
      page.drawText(
        line,
        {
          x:
            MARGIN + 16,

          y,

          size,

          font:
            regular,

          color:
            colors.text,
        }
      );

      y -= lineHeight;
    }

    y -= 5;
  }

  function divider() {
    ensureSpace(18);

    page.drawLine({
      start: {
        x: MARGIN,
        y,
      },

      end: {
        x:
          PAGE_WIDTH -
          MARGIN,

        y,
      },

      thickness:
        0.5,

      color:
        rgb(
          0.15,
          0.18,
          0.26
        ),
    });

    y -= 18;
  }

  function infoBox(
    heading: string,
    text: string,
    accent: any
  ) {
    const cleaned =
      clean(text);

    if (!cleaned) {
      return;
    }

    const lines =
      wrapText(
        cleaned,
        regular,
        9.5,
        CONTENT_WIDTH -
          28
      );

    const height =
      42 +
      lines.length * 13;

    ensureSpace(
      height + 12
    );

    page.drawRectangle({
      x: MARGIN,

      y:
        y -
        height +
        10,

      width:
        CONTENT_WIDTH,

      height,

      color:
        colors.card,

      borderColor:
        accent,

      borderWidth:
        0.7,
    });

    page.drawText(
      heading.toUpperCase(),
      {
        x:
          MARGIN + 14,

        y:
          y - 6,

        size:
          7.5,

        font: bold,

        color:
          accent,
      }
    );

    let textY =
      y - 24;

    for (const line of lines) {
      page.drawText(
        line,
        {
          x:
            MARGIN + 14,

          y:
            textY,

          size:
            9.5,

          font:
            regular,

          color:
            colors.text,
        }
      );

      textY -= 13;
    }

    y -=
      height + 12;
  }

  /* ============================================================
     FIRST PAGE
     ============================================================ */

  drawPageHeader();

  const verdict =
    snapshot
      ?.currentDecision
      ?.verdict || {};

  const finalQuestion =
    clean(question) ||
    clean(
      snapshot
        ?.submittedQuestion
    ) ||
    clean(title) ||
    "Decision";

  /* DECISION */

  const displayQuestion = cleanDecisionTitle(finalQuestion);

  label(
    "Decision",
    colors.violet
  );

  paragraph(
    displayQuestion,
    {
      size: 17,
      font: bold,
      color:
        colors.white,
      gap: 8,
    }
  );

  if (displayQuestion !== finalQuestion) {
    label("Original question");
    paragraph(finalQuestion, {
      size: 8.5,
      color: colors.muted,
      gap: 14,
    });
  }

  /* CONTEXT */

  const clarifications =
    snapshot
      ?.submittedClarifications ||
    [];

  if (
    clarifications.length >
    0
  ) {
    label(
      "Context considered"
    );

    for (
      const item of clarifications
    ) {
      const answer =
        clean(
          item?.answer
        );

      const questionText =
        clean(
          item?.question
        );

      if (
        questionText &&
        answer
      ) {
        bullet(
          `${questionText}: ${answer}`
        );
      }
    }

    y -= 6;
  }

  divider();

  /* RECOMMENDATION */

  label(
    "Current recommendation",
    colors.green
  );

  paragraph(
    clean(
      verdict.recommendation
    ),
    {
      size: 15,
      font: bold,
      color:
        colors.white,
      gap: 10,
    }
  );

  if (verdict.reasons?.length || verdict.summary) {
    label("Why");

    const whyItems = verdict.reasons?.length
      ? verdict.reasons.slice(0, 3)
      : [verdict.summary];

    whyItems.forEach((reason: string) => {
      bullet(reason);
    });

    y -= 4;
  }

  /* CONFIDENCE */

  if (
    verdict.confidence
  ) {
    infoBox(
      `Confidence - ${clean(
        verdict.confidence
      )}`,

      clean(
        verdict.confidenceReason
      ) ||
        "Confidence reflects the strength and consistency of the Round Table recommendation.",

      colors.green
    );
  }

  /* KEY ASSUMPTION */

  if (
    verdict.keyAssumption
  ) {
    infoBox(
      "Key assumption",
      verdict.keyAssumption,
      colors.violet
    );
  }

  /* DECISION SENSITIVITY */

  if (
    verdict.decisionSensitivity
  ) {
    infoBox(
      `Decision sensitivity - ${clean(
        verdict.decisionSensitivity
      )}`,

      clean(
        verdict.decisionSensitivityReason
      ) ||
        `The decision has ${clean(
          verdict.decisionSensitivity
        ).toLowerCase()} sensitivity to changes in the underlying assumptions.`,

      colors.blue
    );
  }

  /* FLIP CONDITION */

  if (
    verdict.flipCondition ||
    verdict.changeCondition
  ) {
    infoBox(
      "What would flip this decision?",

      clean(
        verdict.flipCondition ||
          verdict.changeCondition
      ),

      colors.amber
    );
  }

  /* MISSING INFORMATION */

  if (
    verdict.missingInformation
  ) {
    infoBox(
      "Missing information",

      verdict.missingInformation,

      colors.blue
    );
  }

  /* DISAGREEMENT */

  if (
    verdict.disagreement
  ) {
    label(
      "Main disagreement",
      colors.amber
    );

    paragraph(
      verdict.disagreement
    );
  }

  /* EXPERT TABLE */

  const originalExperts =
    snapshot
      ?.experts || [];

  const addedExperts =
    (
      snapshot
        ?.addedExperts ||
      []
    ).map(
      (item: any) =>
        item.expert
    );

  const allExperts = [
    ...originalExperts,
    ...addedExperts,
  ];

  if (
    allExperts.length >
    0
  ) {
    label(
      "The table",
      colors.violet
    );

    for (
      const expert of allExperts
    ) {
      const name =
        clean(
          expert?.name
        );

      const role =
        clean(
          expert?.role
        );

      const focus =
        clean(
          expert?.focus
        );

      bullet(
        [
          name,
          role,
          focus,
        ]
          .filter(Boolean)
          .join(" - ")
      );
    }

    y -= 6;
  }

  /* DECISION HISTORY */

  const history =
    snapshot
      ?.currentDecision
      ?.history || [];

  if (
    history.length >
    1
  ) {
    label(
      "Decision history",
      colors.blue
    );

    history.forEach(
      (
        item: any,
        index: number
      ) => {
        let historyText =
          index === 0
            ? "Initial verdict"
            : "Updated verdict";

        if (
          item?.source
            ?.type ===
          "challenge"
        ) {
          historyText =
            `Challenge: ${clean(
              item.source
                ?.label
            )}`;
        }

        if (
          item?.source
            ?.type ===
          "added-expert"
        ) {
          historyText =
            `${clean(
              item.source
                ?.label
            )} joined the table`;

          if (
            item.source
              ?.status
          ) {
            historyText +=
              ` - ${clean(
                item.source
                  .status
              )}`;
          }
        }

        bullet(
          historyText
        );
      }
    );

    y -= 6;
  }

  /* NEXT STEP */

  if (
    verdict.nextStep
  ) {
    divider();

    label(
      "Recommended next step",
      colors.violet
    );

    paragraph(
      verdict.nextStep,
      {
        size: 11,
        font: bold,
        color:
          colors.white,
      }
    );
  }

  /* FOOTER */

  ensureSpace(44);

  page.drawLine({
    start: {
      x: MARGIN,
      y:
        MARGIN + 20,
    },

    end: {
      x:
        PAGE_WIDTH -
        MARGIN,

      y:
        MARGIN + 20,
    },

    thickness:
      0.5,

    color:
      rgb(
        0.15,
        0.18,
        0.26
      ),
  });

  page.drawText(
    "Round Table AI",
    {
      x: MARGIN,

      y:
        MARGIN + 4,

      size:
        7.5,

      font:
        bold,

      color:
        colors.violet,
    }
  );

  page.drawText(
    "by Abhi Analyst",
    {
      x:
        MARGIN + 65,

      y:
        MARGIN + 4,

      size:
        7.5,

      font:
        regular,

      color:
        colors.text,
    }
  );

  page.drawText(
    "AI-assisted decision analysis",
    {
      x:
        PAGE_WIDTH -
        MARGIN -
        108,

      y:
        MARGIN + 4,

      size: 7,

      font:
        regular,

      color:
        colors.muted,
    }
  );

  return await pdf.save();
}