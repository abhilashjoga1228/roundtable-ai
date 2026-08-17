import {
  NextResponse,
} from "next/server";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  buildDecisionPdf,
} from "@/lib/decision-pdf";

export async function GET(
  request: Request,

  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } =
      await context.params;

    const url =
      new URL(
        request.url
      );

    const ownerToken =
      url.searchParams
        .get(
          "ownerToken"
        )
        ?.trim();

    if (!ownerToken) {
      return NextResponse.json(
        {
          error:
            "ownerToken is required.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "roundtable_decisions"
        )
        .select(
          `
          id,
          title,
          question,
          snapshot
          `
        )
        .eq(
          "id",
          id
        )
        .eq(
          "owner_token",
          ownerToken
        )
        .maybeSingle();

    if (
      error ||
      !data
    ) {
      return NextResponse.json(
        {
          error:
            error?.message ||
            "Decision not found.",
        },
        {
          status:
            error
              ? 500
              : 404,
        }
      );
    }

    const bytes =
      await buildDecisionPdf({
        title:
          data.title,

        question:
          data.question,

        snapshot:
          data.snapshot,
      });

    const safeName =
      String(
        data.title ||
          "round-table-decision"
      )
        .replace(
          /[^a-z0-9]+/gi,
          "-"
        )
        .replace(
          /^-|-$/g,
          ""
        )
        .slice(
          0,
          70
        ) ||
      "round-table-decision";

    return new Response(
       Buffer.from(bytes),
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            `attachment; filename="${safeName}.pdf"`,

          "Cache-Control":
            "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Private PDF error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not generate PDF.",
      },
      {
        status: 500,
      }
    );
  }
}