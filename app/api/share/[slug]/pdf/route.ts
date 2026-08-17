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
      slug: string;
    }>;
  }
) {
  try {
    const { slug } =
      await context.params;

    if (!slug) {
      return NextResponse.json(
        {
          error:
            "Share slug is required.",
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
          title,
          question,
          snapshot
          `
        )
        .eq(
          "share_slug",
          slug
        )
        .eq(
          "is_public",
          true
        )
        .maybeSingle();

    if (error) {
      console.error(
        "Public PDF Supabase error:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Could not load shared decision.",
        },
        {
          status: 500,
        }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Shared decision not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
      Public PDF copy.

      Explicitly remove any private
      expert-conversation content.
    */

    const safeSnapshot = {
      ...data.snapshot,

      expertConversations:
        undefined,
    };

    const bytes =
      await buildDecisionPdf({
        title:
          data.title,

        question:
          data.question,

        snapshot:
          safeSnapshot,
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
      Buffer.from(
        bytes
      ),
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            `attachment; filename="${safeName}.pdf"`,

          "Cache-Control":
            "public, max-age=300",
        },
      }
    );
  } catch (error) {
    console.error(
      "Public PDF error:",
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