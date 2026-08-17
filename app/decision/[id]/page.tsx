"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SavedDecision = {
  id: string;
  title: string;
  question: string;
  current_recommendation: string;
  created_at: string;
  updated_at: string;
  share_slug: string;
  is_public: boolean;
  snapshot: any;
};

function getOwnerToken() {
  let token = localStorage.getItem("roundtable_owner_token");

  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("roundtable_owner_token", token);
  }

  return token;
}

export default function SavedDecisionPage() {
  const params = useParams<{ id: string }>();

  const [decision, setDecision] = useState<SavedDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  async function loadDecision() {
    try {
      setLoading(true);
      setError("");

   const ownerToken =
  getOwnerToken();

const identitySessionToken =
  window.localStorage.getItem(
    "roundtable_identity_session"
  );

const query =
  new URLSearchParams();

query.set(
  "ownerToken",
  ownerToken
);

if (identitySessionToken) {
  query.set(
    "identitySessionToken",
    identitySessionToken
  );
}

const response =
  await fetch(
    `/api/decisions/${encodeURIComponent(
      params.id
    )}?${query.toString()}`,
    {
      cache: "no-store",
    }
  );

      const contentType = response.headers.get("content-type");

      if (!contentType?.includes("application/json")) {
        throw new Error(
          `Decision API returned HTTP ${response.status}.`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not load this decision."
        );
      }

      setDecision(data.decision);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load this decision."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params.id) {
      loadDecision();
    }
  }, [params.id]);

  function continueRoundTable() {
    if (!decision?.snapshot) return;

    sessionStorage.setItem(
      "roundtable_resume_snapshot",
      JSON.stringify({
        ...decision.snapshot,
        savedDecisionId: decision.id,
        savedShareSlug: decision.share_slug,
      })
    );

    window.location.href = "/";
  }

  function downloadPdf() {
    if (!decision) return;

    const ownerToken = getOwnerToken();

    window.location.href =
      `/api/decisions/${decision.id}/pdf?ownerToken=${encodeURIComponent(
        ownerToken
      )}`;
  }

  async function shareDecision() {
    if (!decision) return;

    try {
      setSharing(true);
      setShareMessage("");

      const ownerToken = getOwnerToken();

      if (!decision.is_public) {
        const response = await fetch(
          `/api/decisions/${decision.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ownerToken,
              isPublic: true,
            }),
          }
        );

        const contentType = response.headers.get("content-type");

        if (!contentType?.includes("application/json")) {
          throw new Error(
            `Share endpoint returned HTTP ${response.status}.`
          );
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Could not create the share link."
          );
        }

        setDecision((current) =>
          current
            ? {
                ...current,
                is_public: true,
                updated_at:
                  data.decision?.updated_at || current.updated_at,
              }
            : current
        );
      }

      const shareUrl =
        `${window.location.origin}/share/${decision.share_slug}`;

      await navigator.clipboard.writeText(shareUrl);

      setShareMessage("Share link copied.");

      window.setTimeout(() => {
        setShareMessage("");
      }, 3200);
    } catch (err) {
      setShareMessage(
        err instanceof Error
          ? err.message
          : "Could not create the share link."
      );
    } finally {
      setSharing(false);
    }
  }

  async function stopSharing() {
    if (!decision) return;

    try {
      setSharing(true);
      setShareMessage("");

      const ownerToken = getOwnerToken();

      const response = await fetch(
        `/api/decisions/${decision.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerToken,
            isPublic: false,
          }),
        }
      );

      const contentType = response.headers.get("content-type");

      if (!contentType?.includes("application/json")) {
        throw new Error(
          `Stop sharing endpoint returned HTTP ${response.status}.`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not disable sharing."
        );
      }

      setDecision((current) =>
        current
          ? {
              ...current,
              is_public: false,
              updated_at:
                data.decision?.updated_at || current.updated_at,
            }
          : current
      );

      setShareMessage("Sharing disabled.");

      window.setTimeout(() => {
        setShareMessage("");
      }, 3200);
    } catch (err) {
      setShareMessage(
        err instanceof Error
          ? err.message
          : "Could not disable sharing."
      );
    } finally {
      setSharing(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] px-5 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0D1428] p-7">
            <p className="text-sm text-[#94A3B8]">
              Loading saved decision…
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !decision) {
    return (
      <main className="min-h-screen bg-[#050816] px-5 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-400/20 bg-rose-400/10 p-6">
          <h1 className="text-lg font-semibold text-rose-200">
            Could not open this decision
          </h1>

          <p className="mt-2 text-sm text-rose-100/70">
            {error || "Decision not found."}
          </p>

          <a
            href="/decisions"
            className="mt-5 inline-block rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
          >
            ← Back to decisions
          </a>
        </div>
      </main>
    );
  }

  const verdict = decision.snapshot?.currentDecision?.verdict;

  const clarifications =
    decision.snapshot?.submittedClarifications || [];

  const experts = [
    ...(decision.snapshot?.experts || []),
    ...(decision.snapshot?.addedExperts || []).map(
      (item: any) => item.expert
    ),
  ];

  const history =
    decision.snapshot?.currentDecision?.history || [];

  return (
    <main className="min-h-screen bg-[#050816] px-5 py-7 text-white sm:px-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-280px] h-[600px] w-[820px] -translate-x-1/2 rounded-full bg-[#8B5CF6]/[0.08] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.05] pb-4">
          <a
            href="/decisions"
            className="text-sm font-medium text-[#64748B] transition hover:text-white"
          >
            ← Your decisions
          </a>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#8B5CF6]/10 text-[10px] font-bold text-violet-200">
              RT
            </div>

            <span className="text-sm font-semibold">
              Round Table AI
            </span>
          </div>

          <div className="flex items-center gap-2">
            {decision.is_public && (
              <span className="hidden rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#7DD3FC] sm:inline">
                Shared
              </span>
            )}

            <button
              onClick={downloadPdf}
              className="rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/[0.04] px-4 py-2 text-xs font-semibold text-[#BAE6FD] transition hover:bg-[#38BDF8]/[0.08]"
            >
              Download PDF
            </button>

            <button
              onClick={shareDecision}
              disabled={sharing}
              className="rounded-xl border border-[#8B5CF6]/25 bg-[#8B5CF6]/10 px-4 py-2 text-xs font-semibold text-[#D8C7FF] transition hover:bg-[#8B5CF6]/15 disabled:opacity-50"
            >
              {sharing
                ? "Sharing…"
                : decision.is_public
                ? "Copy share link"
                : "Share"}
            </button>
          </div>
        </header>

        <section className="mt-9">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#52627A]">
            Your decision
          </p>

          <h1 className="mt-2 max-w-5xl text-2xl font-semibold leading-9 tracking-tight text-[#F8FAFC] sm:text-3xl">
            {decision.question}
          </h1>

          {clarifications.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {clarifications.map(
                (item: any, index: number) => (
                  <span
                    key={index}
                    title={item.question}
                    className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] text-[#64748B]"
                  >
                    {item.answer}
                  </span>
                )
              )}
            </div>
          )}

          {decision.is_public && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={`/share/${decision.share_slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-[#7DD3FC] hover:text-[#BAE6FD]"
              >
                Open public page ↗
              </a>

              <button
                onClick={stopSharing}
                disabled={sharing}
                className="text-xs text-[#52627A] hover:text-rose-300 disabled:opacity-40"
              >
                Stop sharing
              </button>
            </div>
          )}
        </section>

        {verdict && (
          <section className="mt-7 overflow-hidden rounded-[26px] border border-[#34D399]/25 bg-[#0B1720] shadow-2xl shadow-black/20">
            <div className="grid lg:grid-cols-[1fr_300px]">
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#34D399]/10 text-sm">
                    ⚖
                  </span>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#34D399]">
                      Current verdict
                    </p>

                    <p className="mt-0.5 text-[11px] text-[#52627A]">
                      Saved snapshot
                    </p>
                  </div>

                  {verdict.confidence && (
                    <span className="ml-auto rounded-full border border-[#38BDF8]/30 bg-[#38BDF8]/10 px-3 py-1.5 text-xs font-semibold text-[#7DD3FC]">
                      {verdict.confidence}
                    </span>
                  )}
                </div>

                <h2 className="mt-6 max-w-4xl text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-4xl">
                  {verdict.recommendation}
                </h2>

                <p className="mt-4 max-w-4xl text-sm leading-7 text-[#94A3B8] sm:text-base">
                  {verdict.summary}
                </p>

                {verdict.reasons?.length > 0 && (
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {verdict.reasons
                      .slice(0, 3)
                      .map((reason: string, index: number) => (
                        <div
                          key={index}
                          className="rounded-xl border border-white/[0.06] bg-black/10 p-4"
                        >
                          <div className="flex gap-3">
                            <span className="mt-0.5 text-xs text-[#34D399]">
                              ✓
                            </span>

                            <p className="text-xs leading-5 text-[#94A3B8]">
                              {reason}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="border-t border-white/[0.06] bg-black/10 p-6 lg:border-l lg:border-t-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FBBF24]">
                  Watch out
                </p>

                <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                  {verdict.disagreement}
                </p>

                <div className="mt-6 border-t border-white/[0.06] pt-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B99AFF]">
                    Next move
                  </p>

                  <p className="mt-2 text-sm leading-6 text-[#E2E8F0]">
                    {verdict.nextStep}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="mt-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-[#8B5CF6]/15 bg-[#0D1428] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B99AFF]">
                Continue the decision
              </p>

              <h2 className="mt-1 text-lg font-semibold">
                Reopen this Round Table
              </h2>

              <p className="mt-1 text-sm text-[#64748B]">
                Return to the full discussion and continue with new information.
              </p>
            </div>

            <button
              onClick={continueRoundTable}
              className="rounded-xl bg-[#8B5CF6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#9D74FF]"
            >
              Continue this Round Table →
            </button>
          </div>
        </section>

        {experts.length > 0 && (
          <section className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#B99AFF]">
              The table
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              {experts.length} perspectives
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {experts.map(
                (expert: any, index: number) => (
                  <div
                    key={`${expert.name}-${index}`}
                    className="rounded-2xl border border-[#94A3B8]/10 bg-[#0F172A] p-5"
                  >
                    <h3 className="text-sm font-semibold text-[#F8FAFC]">
                      {expert.name}
                    </h3>

                    <p className="mt-1 text-xs text-[#52627A]">
                      {expert.role}
                    </p>

                    <p className="mt-3 text-sm leading-6 text-[#94A3B8]">
                      {expert.focus}
                    </p>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {history.length > 1 && (
          <section className="mt-8 border-t border-white/[0.06] pt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#52627A]">
              Decision history
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {history.map(
                (item: any, index: number) => (
                  <span
                    key={item.id || index}
                    className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs text-[#94A3B8]"
                  >
                    {index === 0
                      ? "Initial verdict"
                      : item.source?.type === "challenge"
                      ? "Challenge"
                      : item.source?.type === "added-expert"
                      ? item.source?.label || "Added expert"
                      : `Update ${index + 1}`}
                  </span>
                )
              )}
            </div>
          </section>
        )}

        <footer className="mt-10 border-t border-white/[0.05] py-8 text-center">
          <p className="text-xs text-[#52627A]">
            Last updated{" "}
            {new Date(decision.updated_at).toLocaleString()}
          </p>
        </footer>
      </div>

      {shareMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl border border-[#34D399]/25 bg-[#071A18]/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur">
          <p className="text-sm font-medium text-[#D1FAE5]">
            {shareMessage}
          </p>
        </div>
      )}
    </main>
  );
}