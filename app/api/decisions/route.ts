import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyIdentitySession } from "@/lib/identity-auth";

function createShareSlug() {
  return crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 16);
}

function verifySession(
  token: string | null | undefined
) {
  if (!token) {
    return null;
  }

  return verifyIdentitySession(
    token.trim()
  );
}

/* ============================================================
   GET — LIST SAVED DECISIONS

   Supports:
   1. Existing browser ownerToken
   2. Signed identitySessionToken

   If both are supplied:
   - legacy decisions on this browser that do not yet have
     identity_id are attached to the authenticated identity.
   ============================================================ */

export async function GET(
  request: Request
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const ownerToken =
      searchParams
        .get("ownerToken")
        ?.trim();

    const identitySessionToken =
      searchParams
        .get("identitySessionToken")
        ?.trim();

    const verifiedIdentity =
      verifySession(
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

    /* ========================================================
       CLAIM OLD SAME-BROWSER DECISIONS

       Example:
       User previously saved decisions using ownerToken only.
       Later they create Name + Passcode.

       We attach those old rows to their new identity.
       ======================================================== */

    if (
      verifiedIdentity &&
      ownerToken
    ) {
      const {
        error:
          claimError,
      } =
        await supabase
          .from(
            "roundtable_decisions"
          )
          .update({
            identity_id:
              verifiedIdentity
                .identityId,
          })
          .eq(
            "owner_token",
            ownerToken
          )
          .is(
            "identity_id",
            null
          );

      if (claimError) {
        console.error(
          "Claim legacy decisions error:",
          claimError
        );

        return NextResponse.json(
          {
            error:
              claimError.message ||
              "Could not connect your existing decisions.",
          },
          {
            status: 500,
          }
        );
      }
    }

    /* ========================================================
       AUTHENTICATED IDENTITY
       ======================================================== */

    if (
      verifiedIdentity
    ) {
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
            identity_id,
            title,
            question,
            current_recommendation,
            created_at,
            updated_at,
            share_slug,
            is_public
            `
          )
          .eq(
            "identity_id",
            verifiedIdentity
              .identityId
          )
          .order(
            "updated_at",
            {
              ascending: false,
            }
          );

      if (error) {
        console.error(
          "Load identity decisions Supabase error:",
          error
        );

        return NextResponse.json(
          {
            error:
              error.message ||
              "Could not load saved decisions.",
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json(
        {
          decisions:
            data || [],

          accessMode:
            "identity",
        },
        {
          status: 200,
        }
      );
    }

    /* ========================================================
       LEGACY SAME-BROWSER ACCESS
       ======================================================== */

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
          identity_id,
          title,
          question,
          current_recommendation,
          created_at,
          updated_at,
          share_slug,
          is_public
          `
        )
        .eq(
          "owner_token",
          ownerToken!
        )
        .order(
          "updated_at",
          {
            ascending: false,
          }
        );

    if (error) {
      console.error(
        "Load browser decisions Supabase error:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Could not load saved decisions.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        decisions:
          data || [],

        accessMode:
          "browser",
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "GET /api/decisions error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load saved decisions.",
      },
      {
        status: 500,
      }
    );
  }
}

/* ============================================================
   POST — SAVE / UPDATE DECISION

   ownerToken stays required because it preserves the current
   browser ownership system.

   If identitySessionToken is valid, identity_id is derived
   SERVER-SIDE from the signed session.

   Browser never gets to choose identity_id.
   ============================================================ */

export async function POST(
  request: Request
) {
  try {
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
      verifySession(
        identitySessionToken
      );

    const snapshot =
      body?.snapshot;

    if (
      !ownerToken ||
      !snapshot
        ?.submittedQuestion ||
      !snapshot
        ?.currentDecision
        ?.verdict
    ) {
      return NextResponse.json(
        {
          error:
            "ownerToken and a complete Round Table snapshot are required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
      If the browser sends an identity session token,
      it must be valid.

      We do not silently ignore an invalid token.
    */

    if (
      identitySessionToken &&
      !verifiedIdentity
    ) {
      return NextResponse.json(
        {
          error:
            "Your decision access session has expired or is invalid.",
        },
        {
          status: 401,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    const id =
      body?.id
        ? String(
            body.id
          )
        : crypto.randomUUID();

    const shareSlug =
      body?.shareSlug
        ? String(
            body.shareSlug
          )
        : createShareSlug();

    const title =
      String(
        body?.title ||
          snapshot
            .submittedQuestion
      )
        .trim()
        .slice(
          0,
          140
        );

    const currentRecommendation =
      String(
        snapshot
          .currentDecision
          .verdict
          .recommendation ||
          ""
      );

    /* ========================================================
       NEW DECISION DATA
       ======================================================== */

    const row = {
      id,

      owner_token:
        ownerToken,

      identity_id:
        verifiedIdentity
          ?.identityId ||
        null,

      title,

      question:
        snapshot
          .submittedQuestion,

      current_recommendation:
        currentRecommendation,

      snapshot,

      share_slug:
        shareSlug,

      is_public:
        Boolean(
          body?.isPublic
        ),

      updated_at:
        new Date()
          .toISOString(),
    };

    /* ========================================================
       IMPORTANT UPDATE OWNERSHIP CHECK

       For an existing decision ID, first make sure the caller
       already owns it by:
       - identity_id, when identity session exists
       - otherwise owner_token

       This prevents someone from supplying another row's UUID
       and changing its owner.
       ======================================================== */

    if (
      body?.id
    ) {
      let ownershipQuery =
        supabase
          .from(
            "roundtable_decisions"
          )
          .select(
            `
            id,
            owner_token,
            identity_id
            `
          )
          .eq(
            "id",
            id
          );

      if (
        verifiedIdentity
      ) {
        ownershipQuery =
          ownershipQuery.or(
            `identity_id.eq.${verifiedIdentity.identityId},and(identity_id.is.null,owner_token.eq.${ownerToken})`
          );
      } else {
        ownershipQuery =
          ownershipQuery.eq(
            "owner_token",
            ownerToken
          );
      }

      const {
        data:
          existingDecision,
        error:
          ownershipError,
      } =
        await ownershipQuery
          .maybeSingle();

      if (ownershipError) {
        console.error(
          "Decision ownership check error:",
          ownershipError
        );

        return NextResponse.json(
          {
            error:
              ownershipError.message ||
              "Could not verify decision ownership.",
          },
          {
            status: 500,
          }
        );
      }

      if (
        !existingDecision
      ) {
        return NextResponse.json(
          {
            error:
              "Decision not found or you do not have permission to update it.",
          },
          {
            status: 404,
          }
        );
      }
    }

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "roundtable_decisions"
        )
        .upsert(
          row,
          {
            onConflict:
              "id",
          }
        )
        .select(
          `
          id,
          identity_id,
          title,
          question,
          current_recommendation,
          created_at,
          updated_at,
          share_slug,
          is_public
          `
        )
        .single();

    if (error) {
      console.error(
        "Save decision Supabase error:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Could not save this Round Table.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        decision: data,

        accessMode:
          verifiedIdentity
            ? "identity"
            : "browser",
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/decisions error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save this Round Table.",
      },
      {
        status: 500,
      }
    );
  }
}