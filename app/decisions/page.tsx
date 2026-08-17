"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type SavedDecision = {
  id: string;
  identity_id?: string | null;
  title: string;
  question: string;

  current_recommendation:
    string;

  created_at: string;
  updated_at: string;

  share_slug: string;
  is_public: boolean;
};

function getOwnerToken() {
  let token =
    window.localStorage.getItem(
      "roundtable_owner_token"
    );

  if (!token) {
    token =
      crypto.randomUUID();

    window.localStorage.setItem(
      "roundtable_owner_token",
      token
    );
  }

  return token;
}

export default function DecisionsPage() {
  const [
    decisions,
    setDecisions,
  ] =
    useState<SavedDecision[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    accessMode,
    setAccessMode,
  ] =
    useState<
      "identity" | "browser" | null
    >(null);

  const [
    identityName,
    setIdentityName,
  ] =
    useState("");

  const [
    passcode,
    setPasscode,
  ] =
    useState("");

  const [
    loginLoading,
    setLoginLoading,
  ] =
    useState(false);

  const [
    loginError,
    setLoginError,
  ] =
    useState("");

  const [
    displayName,
    setDisplayName,
  ] =
    useState("");

  const [
    showAccessForm,
    setShowAccessForm,
  ] =
    useState(false);

  const [
    deletingId,
    setDeletingId,
  ] =
    useState<string | null>(
      null
    );

  /* ============================================================
     INITIAL LOAD
     ============================================================ */

useEffect(() => {
  // Always lock My Decisions when this page is opened.
  // Users must enter their Name + Passcode each time.

  window.localStorage.removeItem(
    "roundtable_identity_session"
  );

  window.localStorage.removeItem(
    "roundtable_identity_name"
  );

  setDecisions([]);
  setDisplayName("");
  setAccessMode(null);

  setIdentityName("");
  setPasscode("");

  setShowAccessForm(true);

  setLoading(false);
  setError("");
  setLoginError("");
}, []);

  /* ============================================================
     LOAD DECISIONS
     ============================================================ */

  async function loadDecisions(
    sessionOverride?: string | null
  ) {
    setLoading(true);
    setError("");

    try {
      const ownerToken =
        getOwnerToken();

      const identitySessionToken =
        sessionOverride !==
        undefined
          ? sessionOverride
          : window.localStorage.getItem(
              "roundtable_identity_session"
            );

      const params =
        new URLSearchParams();

      /*
        Always include ownerToken.

        If the user later created a name/passcode identity,
        the server can claim old browser-only decisions
        and attach them to that identity.
      */

      params.set(
        "ownerToken",
        ownerToken
      );

      if (
        identitySessionToken
      ) {
        params.set(
          "identitySessionToken",
          identitySessionToken
        );
      }

      const response =
        await fetch(
          `/api/decisions?${params.toString()}`,
          {
            cache:
              "no-store",
          }
        );

      const contentType =
        response.headers.get(
          "content-type"
        );

      if (
        !contentType?.includes(
          "application/json"
        )
      ) {
        throw new Error(
          `Decisions endpoint returned HTTP ${response.status}.`
        );
      }

      const data =
        await response.json();

      /*
        Identity session expired/invalid.

        Remove only identity session and retry using browser
        ownership so existing same-browser decisions still work.
      */

      if (
        response.status ===
          401 &&
        identitySessionToken
      ) {
        window.localStorage.removeItem(
          "roundtable_identity_session"
        );

        window.localStorage.removeItem(
          "roundtable_identity_name"
        );

        setDisplayName("");
        setAccessMode(null);

        return await loadDecisions(
          null
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Could not load saved decisions."
        );
      }

      setDecisions(
        data.decisions || []
      );

      setAccessMode(
        data.accessMode ||
          null
      );

      /*
        If this browser does not have identity access,
        keep the normal browser decisions visible.

        We also expose the Name + Passcode box so the user
        can recover decisions from another device.
      */

      if (
        data.accessMode ===
        "identity"
      ) {
        setShowAccessForm(
          false
        );
      }
    } catch (err) {
      console.error(
        "Load decisions error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not load saved decisions."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     LOGIN WITH NAME + PASSCODE
     ============================================================ */

  async function accessDecisions() {
    const cleanName =
      identityName
        .trim()
        .replace(/\s+/g, " ");

    if (
      cleanName.length < 2
    ) {
      setLoginError(
        "Please enter your name."
      );

      return;
    }

    if (
      passcode.length < 6
    ) {
      setLoginError(
        "Passcode must be at least 6 characters."
      );

      return;
    }

    setLoginLoading(true);
    setLoginError("");

    try {
      const response =
        await fetch(
          "/api/identity/login",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                name:
                  cleanName,

                passcode,
              }),
          }
        );

      const contentType =
        response.headers.get(
          "content-type"
        );

      if (
        !contentType?.includes(
          "application/json"
        )
      ) {
        throw new Error(
          `Identity login returned HTTP ${response.status}.`
        );
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Could not access your decisions."
        );
      }

      if (
        !data.sessionToken ||
        !data.identity
          ?.displayName
      ) {
        throw new Error(
          "The server did not return a valid access session."
        );
      }

      /*
        Save only the signed session and name.

        The passcode itself is NEVER stored locally.
      */

      window.localStorage.setItem(
        "roundtable_identity_session",
        data.sessionToken
      );

      window.localStorage.setItem(
        "roundtable_identity_name",
        data.identity
          .displayName
      );

      setDisplayName(
        data.identity
          .displayName
      );

      setIdentityName("");
      setPasscode("");
      setShowAccessForm(false);

      await loadDecisions(
        data.sessionToken
      );
    } catch (err) {
      console.error(
        "Identity login error:",
        err
      );

      setLoginError(
        err instanceof Error
          ? err.message
          : "Could not access your decisions."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  /* ============================================================
     FORGET IDENTITY ACCESS

     Useful when a user wants to switch identities or when
     testing another device/user.
     ============================================================ */

  async function forgetAccess() {
    window.localStorage.removeItem(
      "roundtable_identity_session"
    );

    window.localStorage.removeItem(
      "roundtable_identity_name"
    );

    setDisplayName("");
    setAccessMode(null);

    setIdentityName("");
    setPasscode("");

    setShowAccessForm(true);

    await loadDecisions(
      null
    );
  }

  /* ============================================================
     OPEN DECISION
     ============================================================ */

  function openDecision(
    id: string
  ) {
    window.location.href =
      `/decision/${id}`;
  }

  /* ============================================================
     DELETE DECISION
     ============================================================ */

  async function deleteDecision(
    id: string
  ) {
    const confirmed =
      window.confirm(
        "Delete this saved decision? This cannot be undone."
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(id);

    try {
      const ownerToken =
        getOwnerToken();

      const identitySessionToken =
        window.localStorage.getItem(
          "roundtable_identity_session"
        );

      const params =
        new URLSearchParams();

      params.set(
        "ownerToken",
        ownerToken
      );

      if (
        identitySessionToken
      ) {
        params.set(
          "identitySessionToken",
          identitySessionToken
        );
      }

      const response =
        await fetch(
          `/api/decisions/${encodeURIComponent(
            id
          )}?${params.toString()}`,
          {
            method:
              "DELETE",
          }
        );

      const contentType =
        response.headers.get(
          "content-type"
        );

      if (
        !contentType?.includes(
          "application/json"
        )
      ) {
        throw new Error(
          `Delete endpoint returned HTTP ${response.status}.`
        );
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Could not delete this decision."
        );
      }

      setDecisions(
        (current) =>
          current.filter(
            (decision) =>
              decision.id !==
              id
          )
      );
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : "Could not delete this decision."
      );
    } finally {
      setDeletingId(
        null
      );
    }
  }

  /* ============================================================
     FILTER
     ============================================================ */

  const filteredDecisions =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return decisions;
      }

      return decisions.filter(
        (decision) =>
          decision.title
            .toLowerCase()
            .includes(
              query
            ) ||
          decision.question
            .toLowerCase()
            .includes(
              query
            ) ||
          decision
            .current_recommendation
            .toLowerCase()
            .includes(
              query
            )
      );
    }, [
      decisions,
      search,
    ]);

  /* ============================================================
     DATE
     ============================================================ */

  function formatDate(
    value: string
  ) {
    try {
      return new Date(
        value
      ).toLocaleString(
        undefined,
        {
          month:
            "short",

          day:
            "numeric",

          year:
            "numeric",
        }
      );
    } catch {
      return "";
    }
  }

  return (
    <main className="min-h-screen bg-[#050816] px-5 py-6 text-white sm:px-8 sm:py-7">

      {/* Ambient background */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-300px] h-[620px] w-[850px] -translate-x-1/2 rounded-full bg-[#8B5CF6]/[0.08] blur-[150px]" />

        <div className="absolute bottom-[-260px] right-[-160px] h-[500px] w-[500px] rounded-full bg-[#38BDF8]/[0.03] blur-[150px]" />
      </div>

      {/* Creator mark */}

      <div className="pointer-events-none fixed bottom-5 right-6 z-40 select-none">
        <span className="text-[10px] font-medium tracking-[0.16em] text-white/20">
          Abhilash Joga
        </span>
      </div>

      <div className="relative mx-auto max-w-6xl">

        {/* ======================================================
            HEADER
            ====================================================== */}

        <header className="flex flex-wrap items-center justify-between gap-4">

          <a
            href="/"
            className="flex items-center gap-3"
          >

            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#8B5CF6]/35 bg-[#8B5CF6]/10 text-xs font-bold text-[#E9DDFF]">
              RT
            </div>

            <span className="text-sm font-semibold tracking-wide">
              Round Table AI
            </span>

          </a>

          <div className="flex items-center gap-3">

            {displayName && (
              <div className="hidden text-right sm:block">

                <p className="text-[10px] uppercase tracking-[0.15em] text-[#52627A]">
                  Decisions for
                </p>

                <p className="mt-0.5 text-xs font-medium text-[#CBD5E1]">
                  {displayName}
                </p>

              </div>
            )}

            <a
              href="/"
              className="rounded-xl bg-[#8B5CF6] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#8B5CF6]/10 transition hover:bg-[#9D74FF]"
            >
              + New decision
            </a>

          </div>

        </header>

        {/* ======================================================
            HERO
            ====================================================== */}

        <section className="mt-12 sm:mt-14">

          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#64748B]">
            Decision workspace
          </p>

          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
            Your decisions
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#94A3B8]">
            Reopen previous Round Tables, continue with new information, share a decision, or download its decision brief.
          </p>

          {accessMode ===
            "identity" &&
            displayName && (
              <div className="mt-4 flex flex-wrap items-center gap-3">

                <span className="rounded-full border border-[#34D399]/20 bg-[#34D399]/[0.06] px-3 py-1.5 text-[11px] font-medium text-[#6EE7B7]">
                  Accessing {displayName}&apos;s decisions
                </span>

                <button
                  onClick={
                    forgetAccess
                  }
                  className="text-[11px] text-[#52627A] transition hover:text-[#B99AFF]"
                >
                  Switch user
                </button>

              </div>
            )}

        </section>

        {/* ======================================================
            CROSS DEVICE ACCESS
            ====================================================== */}

        {accessMode !==
          "identity" && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-[#8B5CF6]/15 bg-[#0D1428]">

            <button
              onClick={() => {
                setShowAccessForm(
                  (current) =>
                    !current
                );

                setLoginError("");
              }}
              className="flex w-full items-center justify-between gap-5 p-5 text-left sm:p-6"
            >

              <div>

                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B99AFF]">
                  Access from another device
                </p>

                <h2 className="mt-1 text-base font-semibold text-[#F8FAFC]">
                  Already saved Round Tables somewhere else?
                </h2>

                <p className="mt-1 text-sm text-[#64748B]">
                  Enter the name and passcode you used when saving.
                </p>

              </div>

              <span className="text-lg text-[#64748B]">
                {showAccessForm
                  ? "−"
                  : "+"}
              </span>

            </button>

            {showAccessForm && (
              <div className="border-t border-white/[0.06] p-5 sm:p-6">

                <div className="grid gap-4 sm:grid-cols-2">

                  <div>

                    <label
                      htmlFor="identity-name"
                      className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#64748B]"
                    >
                      Name
                    </label>

                    <input
                      id="identity-name"
                      value={
                        identityName
                      }
                      onChange={(
                        event
                      ) => {
                        setIdentityName(
                          event.target
                            .value
                        );

                        setLoginError(
                          ""
                        );
                      }}
                      placeholder="Your name"
                      autoComplete="name"
                      disabled={
                        loginLoading
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-[#475569] focus:border-[#8B5CF6]/50 disabled:opacity-50"
                    />

                  </div>

                  <div>

                    <label
                      htmlFor="identity-passcode"
                      className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#64748B]"
                    >
                      Passcode
                    </label>

                    <input
                      id="identity-passcode"
                      type="password"
                      value={
                        passcode
                      }
                      onChange={(
                        event
                      ) => {
                        setPasscode(
                          event.target
                            .value
                        );

                        setLoginError(
                          ""
                        );
                      }}
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                            "Enter" &&
                          !loginLoading
                        ) {
                          void accessDecisions();
                        }
                      }}
                      placeholder="Your passcode"
                      autoComplete="current-password"
                      disabled={
                        loginLoading
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-[#475569] focus:border-[#8B5CF6]/50 disabled:opacity-50"
                    />

                  </div>

                </div>

                {loginError && (
                  <p className="mt-4 text-sm text-rose-300">
                    {
                      loginError
                    }
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-4">

                  <button
                    onClick={() => {
                      void accessDecisions();
                    }}
                    disabled={
                      loginLoading ||
                      !identityName.trim() ||
                      passcode.length <
                        6
                    }
                    className="rounded-xl bg-[#8B5CF6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#9D74FF] disabled:cursor-not-allowed disabled:bg-[#8B5CF6]/40 disabled:text-white/50"
                  >
                    {loginLoading
                      ? "Accessing…"
                      : "Access My Decisions →"}
                  </button>

                  <p className="text-[11px] text-[#52627A]">
                    Your passcode is never stored in this browser.
                  </p>

                </div>

              </div>
            )}

          </section>
        )}

        {/* ======================================================
            SEARCH
            ====================================================== */}

        <section className="mt-8">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <input
              value={search}
              onChange={(
                event
              ) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search decisions..."
              className="w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-4 py-3 text-sm outline-none placeholder:text-[#52627A] focus:border-[#8B5CF6]/35 sm:max-w-md"
            />

            {!loading && (
              <p className="text-xs text-[#52627A]">
                {
                  decisions.length
                }{" "}
                saved
              </p>
            )}

          </div>

        </section>

        {/* ======================================================
            LOADING
            ====================================================== */}

        {loading && (
          <section className="mt-7 rounded-2xl border border-white/[0.07] bg-[#0D1428] p-8">

            <div className="flex items-center justify-center gap-3">

              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#8B5CF6]" />

              <p className="text-sm text-[#94A3B8]">
                Loading saved decisions…
              </p>

            </div>

          </section>
        )}

        {/* ======================================================
            ERROR
            ====================================================== */}

        {!loading &&
          error && (
            <section className="mt-7 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-6">

              <h2 className="font-semibold text-rose-200">
                Could not load your decisions
              </h2>

              <p className="mt-2 text-sm leading-6 text-rose-100/70">
                {error}
              </p>

              <button
                onClick={() => {
                  void loadDecisions();
                }}
                className="mt-4 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
              >
                Retry
              </button>

            </section>
          )}

        {/* ======================================================
            EMPTY STATE
            ====================================================== */}

        {!loading &&
          !error &&
          filteredDecisions.length ===
            0 && (
            <section className="mt-7 rounded-2xl border border-white/[0.07] bg-[#0D1428] px-6 py-12 text-center">

              {search ? (
                <>
                  <h2 className="text-base font-semibold text-[#F8FAFC]">
                    No matching decisions
                  </h2>

                  <p className="mt-2 text-sm text-[#64748B]">
                    Try a different search.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-base font-semibold text-[#F8FAFC]">
                    No saved decisions yet.
                  </h2>

                  <p className="mt-2 text-sm text-[#64748B]">
                    Run a Round Table and press Save to keep it here.
                  </p>

                  <a
                    href="/"
                    className="mt-5 inline-block rounded-xl bg-[#8B5CF6] px-5 py-3 text-sm font-semibold text-white hover:bg-[#9D74FF]"
                  >
                    Start a Round Table →
                  </a>
                </>
              )}

            </section>
          )}

        {/* ======================================================
            DECISION CARDS
            ====================================================== */}

        {!loading &&
          !error &&
          filteredDecisions.length >
            0 && (
            <section className="mt-7 space-y-3">

              {filteredDecisions.map(
                (
                  decision
                ) => (
                  <article
                    key={
                      decision.id
                    }
                    className="group rounded-2xl border border-white/[0.07] bg-[#0D1428] p-5 transition hover:border-[#8B5CF6]/20 sm:p-6"
                  >

                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">

                      <div className="min-w-0 flex-1">

                        <div className="flex flex-wrap items-center gap-2">

                          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#52627A]">
                            Updated{" "}
                            {formatDate(
                              decision.updated_at
                            )}
                          </span>

                          {decision.is_public && (
                            <span className="rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/[0.05] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#7DD3FC]">
                              Shared
                            </span>
                          )}

                        </div>

                        <h2 className="mt-3 max-w-4xl text-lg font-semibold leading-7 text-[#F8FAFC]">
                          {
                            decision.title
                          }
                        </h2>

                        {decision.current_recommendation && (
                          <div className="mt-4">

                            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#34D399]">
                              Current recommendation
                            </p>

                            <p className="mt-1.5 max-w-4xl text-sm leading-6 text-[#94A3B8]">
                              {
                                decision.current_recommendation
                              }
                            </p>

                          </div>
                        )}

                      </div>

                      <div className="flex shrink-0 items-center gap-2">

                        <button
                          onClick={() =>
                            openDecision(
                              decision.id
                            )
                          }
                          className="rounded-xl bg-[#8B5CF6] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#9D74FF]"
                        >
                          Open →
                        </button>

                        <button
                          onClick={() => {
                            void deleteDecision(
                              decision.id
                            );
                          }}
                          disabled={
                            deletingId ===
                            decision.id
                          }
                          className="rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-xs font-medium text-[#64748B] transition hover:border-rose-400/20 hover:text-rose-300 disabled:opacity-40"
                        >
                          {deletingId ===
                          decision.id
                            ? "Deleting…"
                            : "Delete"}
                        </button>

                      </div>

                    </div>

                  </article>
                )
              )}

            </section>
          )}

        {/* ======================================================
            FOOTER
            ====================================================== */}

        <footer className="mt-12 border-t border-white/[0.05] py-8">

          <div className="flex flex-col gap-2 text-xs text-[#52627A] sm:flex-row sm:items-center sm:justify-between">

            <p>
              Round Table AI
            </p>

            <p>
              Abhilash Joga
            </p>

          </div>

        </footer>

      </div>

    </main>
  );
}