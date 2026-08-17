import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";

const SESSION_DAYS = 90;

function getSessionSecret() {
  const secret =
    process.env.IDENTITY_SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "Missing IDENTITY_SESSION_SECRET."
    );
  }

  return secret;
}

export function normalizeName(
  name: string
) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function validateIdentityInput(
  name: string,
  passcode: string
) {
  const cleanName =
    name.trim();

  if (
    cleanName.length < 2
  ) {
    return {
      valid: false,
      error:
        "Please enter your name.",
    };
  }

  if (
    cleanName.length > 80
  ) {
    return {
      valid: false,
      error:
        "Name is too long.",
    };
  }

  if (
    passcode.length < 6
  ) {
    return {
      valid: false,
      error:
        "Passcode must be at least 6 characters.",
    };
  }

  if (
    passcode.length > 100
  ) {
    return {
      valid: false,
      error:
        "Passcode is too long.",
    };
  }

  return {
    valid: true,
    error: "",
  };
}

export function hashPasscode(
  passcode: string
) {
  const salt =
    randomBytes(16);

  const hash =
    scryptSync(
      passcode,
      salt,
      64
    );

  return [
    salt.toString("hex"),
    hash.toString("hex"),
  ].join(":");
}

export function verifyPasscode(
  passcode: string,
  stored: string
) {
  try {
    const [
      saltHex,
      hashHex,
    ] =
      stored.split(":");

    if (
      !saltHex ||
      !hashHex
    ) {
      return false;
    }

    const salt =
      Buffer.from(
        saltHex,
        "hex"
      );

    const storedHash =
      Buffer.from(
        hashHex,
        "hex"
      );

    const candidateHash =
      scryptSync(
        passcode,
        salt,
        storedHash.length
      );

    if (
      candidateHash.length !==
      storedHash.length
    ) {
      return false;
    }

    return timingSafeEqual(
      candidateHash,
      storedHash
    );
  } catch {
    return false;
  }
}

function sign(
  value: string
) {
  return createHmac(
    "sha256",
    getSessionSecret()
  )
    .update(value)
    .digest("base64url");
}

export function createIdentitySession(
  identityId: string
) {
  const expiresAt =
    Math.floor(
      Date.now() / 1000
    ) +
    SESSION_DAYS *
      24 *
      60 *
      60;

  const value =
    `${identityId}.${expiresAt}`;

  const signature =
    sign(value);

  return {
    token:
      `v1.${identityId}.${expiresAt}.${signature}`,

    expiresAt,
  };
}

export function verifyIdentitySession(
  token: string
) {
  try {
    const [
      version,
      identityId,
      expiresText,
      signature,
    ] =
      token.split(".");

    if (
      version !== "v1" ||
      !identityId ||
      !expiresText ||
      !signature
    ) {
      return null;
    }

    const expiresAt =
      Number(expiresText);

    if (
      !Number.isFinite(
        expiresAt
      )
    ) {
      return null;
    }

    if (
      expiresAt <
      Math.floor(
        Date.now() / 1000
      )
    ) {
      return null;
    }

    const value =
      `${identityId}.${expiresAt}`;

    const expected =
      sign(value);

    const actualBuffer =
      Buffer.from(
        signature
      );

    const expectedBuffer =
      Buffer.from(
        expected
      );

    if (
      actualBuffer.length !==
      expectedBuffer.length
    ) {
      return null;
    }

    if (
      !timingSafeEqual(
        actualBuffer,
        expectedBuffer
      )
    ) {
      return null;
    }

    return {
      identityId,
      expiresAt,
    };
  } catch {
    return null;
  }
}