import {
  NextResponse,
} from "next/server";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  createIdentitySession,
  hashPasscode,
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

    /*
      Same name is allowed.

      If this exact name + passcode
      already exists, reuse that identity
      instead of creating a duplicate.
    */

    const {
      data:
        existingIdentities,
      error:
        existingError,
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

    if (
      existingError
    ) {
      console.error(
        "Identity lookup error:",
        existingError
      );

      return NextResponse.json(
        {
          error:
            "Could not create identity.",
        },
        {
          status: 500,
        }
      );
    }

    for (
      const identity of
        existingIdentities ||
        []
    ) {
      if (
        verifyPasscode(
          passcode,
          identity.passcode_hash
        )
      ) {
        const session =
          createIdentitySession(
            identity.id
          );

        return NextResponse.json({
          identity: {
            id:
              identity.id,

            displayName:
              identity.display_name,
          },

          sessionToken:
            session.token,

          expiresAt:
            session.expiresAt,

          existing: true,
        });
      }
    }

    const passcodeHash =
      hashPasscode(
        passcode
      );

    const {
      data:
        createdIdentity,
      error:
        createError,
    } =
      await supabase
        .from(
          "roundtable_identities"
        )
        .insert({
          display_name:
            displayName,

          normalized_name:
            normalizedName,

          passcode_hash:
            passcodeHash,
        })
        .select(
          `
          id,
          display_name
          `
        )
        .single();

    if (
      createError ||
      !createdIdentity
    ) {
      console.error(
        "Identity create error:",
        createError
      );

      return NextResponse.json(
        {
          error:
            createError
              ?.message ||
            "Could not create identity.",
        },
        {
          status: 500,
        }
      );
    }

    const session =
      createIdentitySession(
        createdIdentity.id
      );

    return NextResponse.json({
      identity: {
        id:
          createdIdentity.id,

        displayName:
          createdIdentity.display_name,
      },

      sessionToken:
        session.token,

      expiresAt:
        session.expiresAt,

      existing: false,
    });
  } catch (error) {
    console.error(
      "POST /api/identity/create error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create identity.",
      },
      {
        status: 500,
      }
    );
  }
}