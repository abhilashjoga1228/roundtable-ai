import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyIdentitySession } from "@/lib/identity-auth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getIdentityFromToken(
  token: string | null | undefined
) {
  if (!token) return null;

  return verifyIdentitySession(
    token.trim()
  );
}

/* ============================================================
   GET — LOAD ONE PRIVATE SAVED DECISION
   ============================================================ */

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    const url =
      new URL(request.url);

    const ownerToken =
      url.searchParams
        .get("ownerToken")
        ?.trim();

    const identitySessionToken =
      url.searchParams
        .get("identitySessionToken")
        ?.trim();

    const verifiedIdentity =
      getIdentityFromToken(
        identitySessionToken
      );

    if (
      !ownerToken &&
      !verifiedIdentity
    ) {
      return NextResponse.json(
        {
          error:
            "A valid owner token or identity session is required.",
        },
        {
          status: 401,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    let query =
      supabase
        .from(
          "roundtable_decisions"
        )
        .select(
          `
          id,
          owner_token,
          identity_id,
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
          "id",
          id
        );

    if (
      verifiedIdentity
    ) {
      query =
        query.eq(
          "identity_id",
          verifiedIdentity.identityId
        );
    } else {
      query =
        query.eq(
          "owner_token",
          ownerToken!
        );
    }

    const {
      data,
      error,
    } =
      await query
        .maybeSingle();

    if (error) {
      console.error(
        "Supabase GET decision error:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Could not load this decision.",
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
            "Decision not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      decision: data,
    });
  } catch (error) {
    console.error(
      "GET /api/decisions/[id] error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load this decision.",
      },
      {
        status: 500,
      }
    );
  }
}

/* ============================================================
   PATCH — ENABLE / DISABLE PUBLIC SHARE
   ============================================================ */

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    const body =
      await request.json();

    const ownerToken =
      String(
        body?.ownerToken || ""
      ).trim();

    const identitySessionToken =
      String(
        body?.identitySessionToken ||
          ""
      ).trim();

    const verifiedIdentity =
      getIdentityFromToken(
        identitySessionToken
      );

    const isPublic =
      Boolean(
        body?.isPublic
      );

    if (
      !ownerToken &&
      !verifiedIdentity
    ) {
      return NextResponse.json(
        {
          error:
            "A valid owner token or identity session is required.",
        },
        {
          status: 401,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    let query =
      supabase
        .from(
          "roundtable_decisions"
        )
        .update({
          is_public:
            isPublic,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          id
        );

    if (
      verifiedIdentity
    ) {
      query =
        query.eq(
          "identity_id",
          verifiedIdentity.identityId
        );
    } else {
      query =
        query.eq(
          "owner_token",
          ownerToken
        );
    }

    const {
      data,
      error,
    } =
      await query
        .select(
          `
          id,
          identity_id,
          title,
          share_slug,
          is_public,
          updated_at
          `
        )
        .maybeSingle();

    if (error) {
      console.error(
        "Supabase PATCH decision error:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Could not update sharing.",
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
            "Decision not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      decision: data,
    });
  } catch (error) {
    console.error(
      "PATCH /api/decisions/[id] error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update sharing.",
      },
      {
        status: 500,
      }
    );
  }
}

/* ============================================================
   DELETE — DELETE ONE SAVED DECISION
   ============================================================ */

export async function DELETE(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    const url =
      new URL(request.url);

    const ownerToken =
      url.searchParams
        .get("ownerToken")
        ?.trim();

    const identitySessionToken =
      url.searchParams
        .get(
          "identitySessionToken"
        )
        ?.trim();

    const verifiedIdentity =
      getIdentityFromToken(
        identitySessionToken
      );

    if (
      !ownerToken &&
      !verifiedIdentity
    ) {
      return NextResponse.json(
        {
          error:
            "A valid owner token or identity session is required.",
        },
        {
          status: 401,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    let query =
      supabase
        .from(
          "roundtable_decisions"
        )
        .delete()
        .eq(
          "id",
          id
        );

    if (
      verifiedIdentity
    ) {
      query =
        query.eq(
          "identity_id",
          verifiedIdentity.identityId
        );
    } else {
      query =
        query.eq(
          "owner_token",
          ownerToken!
        );
    }

    const {
      error,
    } =
      await query;

    if (error) {
      console.error(
        "Supabase DELETE decision error:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Could not delete this decision.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "DELETE /api/decisions/[id] error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete this decision.",
      },
      {
        status: 500,
      }
    );
  }
}