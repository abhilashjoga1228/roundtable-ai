import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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

    const { data, error } =
      await supabase
        .from("roundtable_decisions")
        .select(
          `
          id,
          title,
          question,
          current_recommendation,
          snapshot,
          share_slug,
          is_public,
          created_at,
          updated_at
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
        "Public share Supabase error:",
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
      Do NOT expose private Ask Expert conversations.

      We create a clean public snapshot.
    */

    const snapshot =
      data.snapshot || {};

    const publicSnapshot = {
      version:
        snapshot.version,

      submittedQuestion:
        snapshot.submittedQuestion,

      submittedClarifications:
        snapshot.submittedClarifications ||
        [],

      experts:
        snapshot.experts ||
        [],

      round1:
        snapshot.round1 ||
        [],

      round2:
        snapshot.round2 ||
        [],

      addedExperts:
        snapshot.addedExperts ||
        [],

      reconveneExpertResults:
        snapshot.reconveneExpertResults ||
        {},

      currentDecision:
        snapshot.currentDecision,

      challenge:
        snapshot.challenge,

      savedAt:
        snapshot.savedAt,
    };

    return NextResponse.json({
      decision: {
        id:
          data.id,

        title:
          data.title,

        question:
          data.question,

        current_recommendation:
          data.current_recommendation,

        share_slug:
          data.share_slug,

        created_at:
          data.created_at,

        updated_at:
          data.updated_at,

        snapshot:
          publicSnapshot,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/share/[slug] error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load shared decision.",
      },
      {
        status: 500,
      }
    );
  }
}