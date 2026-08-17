"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SharedDecision = {
  id: string;
  title: string;
  question: string;
  current_recommendation: string;
  share_slug: string;
  created_at: string;
  updated_at: string;
  snapshot: any;
};

export default function SharedDecisionPage() {
  const params = useParams<{ slug: string }>();

  const [decision, setDecision] =
    useState<SharedDecision | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSharedDecision() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `/api/share/${encodeURIComponent(params.slug)}`,
          {
            cache: "no-store",
          }
        );

        const contentType =
          response.headers.get("content-type");

        if (!contentType?.includes("application/json")) {
          throw new Error(
            `Share API returned HTTP ${response.status}.`
          );
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Could not load this shared decision."
          );
        }

        setDecision(data.decision);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load this shared decision."
        );
      } finally {
        setLoading(false);
      }
    }

    if (params.slug) {
      loadSharedDecision();
    }
  }, [params.slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] px-5 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0D1428] p-7">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#8B5CF6]" />
              <p className="text-sm text-[#94A3B8]">
                Loading shared decision…
              </p>
            </div>
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
            Shared decision unavailable
          </h1>

          <p className="mt-2 text-sm leading-6 text-rose-100/70">
            {error ||
              "This share link may no longer be active."}
          </p>

          <a
            href="/"
            className="mt-5 inline-block rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
          >
            Start your own Round Table →
          </a>
        </div>
      </main>
    );
  }

  const verdict =
    decision.snapshot?.currentDecision?.verdict;

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
        <div className="absolute bottom-[-260px] right-[-150px] h-[500px] w-[500px] rounded-full bg-[#38BDF8]/[0.03] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/[0.05] pb-4">
          <a
            href="/"
            className="flex items-center gap-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#8B5CF6]/10 text-[10px] font-bold text-violet-200">
              RT
            </div>

            <span className="text-sm font-semibold">
              Round Table AI
            </span>
          </a>

          <div className="flex items-center gap-2">
            <a
              href={`/api/share/${decision.share_slug}/pdf`}
              className="rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/[0.04] px-4 py-2 text-xs font-semibold text-[#BAE6FD] transition hover:bg-[#38BDF8]/[0.08]"
            >
              Download PDF
            </a>

            <span className="rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/[0.05] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#7DD3FC]">
              Shared decision
            </span>
          </div>
        </header>

        <section className="mt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#52627A]">
            Decision
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
                      Round Table recommendation
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

                {(verdict.keyAssumption ||
                  verdict.decisionSensitivity ||
                  verdict.flipCondition ||
                  verdict.missingInformation) && (
                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    {verdict.keyAssumption && (
                      <div className="rounded-2xl border border-[#A78BFA]/16 bg-[#A78BFA]/[0.035] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#B99AFF]">
                          Key assumption
                        </p>

                        <p className="mt-2 text-sm leading-6 text-[#CBD5E1]">
                          {verdict.keyAssumption}
                        </p>
                      </div>
                    )}

                    {verdict.decisionSensitivity && (
                      <div className="rounded-2xl border border-white/[0.07] bg-black/10 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">
                          Decision sensitivity
                        </p>

                        <p className="mt-2 text-sm font-semibold text-[#DDD6FE]">
                          {verdict.decisionSensitivity}
                        </p>

                        {verdict.decisionSensitivityReason && (
                          <p className="mt-2 text-xs leading-5 text-[#64748B]">
                            {verdict.decisionSensitivityReason}
                          </p>
                        )}
                      </div>
                    )}

                    {(verdict.flipCondition ||
                      verdict.changeCondition) && (
                      <div className="rounded-2xl border border-[#FBBF24]/16 bg-[#FBBF24]/[0.025] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FBBF24]">
                          What would flip this decision?
                        </p>

                        <p className="mt-2 text-sm leading-6 text-[#CBD5E1]">
                          {verdict.flipCondition ||
                            verdict.changeCondition}
                        </p>
                      </div>
                    )}

                    {verdict.missingInformation && (
                      <div className="rounded-2xl border border-[#38BDF8]/14 bg-[#38BDF8]/[0.025] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7DD3FC]">
                          Missing information
                        </p>

                        <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                          {verdict.missingInformation}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {verdict.reasons?.length > 0 && (
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {verdict.reasons
                      .slice(0, 3)
                      .map(
                        (reason: string, index: number) => (
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
                        )
                      )}
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

        {experts.length > 0 && (
          <section className="mt-9">
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
          <section className="mt-9 border-t border-white/[0.06] pt-6">
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
                      ? `${
                          item.source?.label || "Expert"
                        } added`
                      : `Update ${index + 1}`}
                  </span>
                )
              )}
            </div>
          </section>
        )}

        <section className="mt-10 rounded-2xl border border-[#8B5CF6]/15 bg-[#0D1428] p-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B99AFF]">
            Round Table AI
          </p>

          <h2 className="mt-2 text-xl font-semibold">
            Have a decision of your own?
          </h2>

          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#64748B]">
            Assemble multiple perspectives, let them challenge one another,
            and get one reasoned recommendation.
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <a
              href={`/api/share/${decision.share_slug}/pdf`}
              className="inline-block rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/[0.04] px-5 py-3 text-sm font-semibold text-[#BAE6FD] transition hover:bg-[#38BDF8]/[0.08]"
            >
              Download PDF
            </a>

            <a
              href="/"
              className="inline-block rounded-xl bg-[#8B5CF6] px-5 py-3 text-sm font-semibold text-white hover:bg-[#9D74FF]"
            >
              Start a Round Table →
            </a>
          </div>
        </section>

        <footer className="mt-10 border-t border-white/[0.05] py-8 text-center">
          <p className="text-xs text-[#52627A]">
            Shared from Round Table AI · by Abhi Analyst
          </p>
        </footer>
      </div>
    </main>
  );
}