import {
  NextResponse,
} from "next/server";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  createIdentitySession,
  normalizeName,
  validateIdentityInput,
  verifyPasscode,
} from "@/lib/identity-auth";

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const displayName =
      String(
        body?.name || ""
      ).trim();

    const passcode =
      String(
        body?.passcode ||
          ""
      );

    const validation =
      validateIdentityInput(
        displayName,
        passcode
      );

    if (
      !validation.valid
    ) {
      return NextResponse.json(
        {
          error:
            validation.error,
        },
        {
          status: 400,
        }
      );
    }

    const normalizedName =
      normalizeName(
        displayName
      );

    const supabase =
      getSupabaseAdmin();

    const {
      data:
        identities,
      error,
    } =
      await supabase
        .from(
          "roundtable_identities"
        )
        .select(
          `
          id,
          display_name,
          passcode_hash
          `
        )
        .eq(
          "normalized_name",
          normalizedName
        );

    if (error) {
      console.error(
        "Identity login lookup error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Could not verify your details.",
        },
        {
          status: 500,
        }
      );
    }

    let matched:
      | {
          id: string;
          display_name: string;
        }
      | null =
      null;

    for (
      const identity of
        identities || []
    ) {
      if (
        verifyPasscode(
          passcode,
          identity.passcode_hash
        )
      ) {
        matched = identity;
        break;
      }
    }

    if (!matched) {
      return NextResponse.json(
        {
          error:
            "Name or passcode is incorrect.",
        },
        {
          status: 401,
        }
      );
    }

    const session =
      createIdentitySession(
        matched.id
      );

    return NextResponse.json({
      identity: {
        id:
          matched.id,

        displayName:
          matched.display_name,
      },

      sessionToken:
        session.token,

      expiresAt:
        session.expiresAt,
    });
  } catch (error) {
    console.error(
      "POST /api/identity/login error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not verify your details.",
      },
      {
        status: 500,
      }
    );
  }
}