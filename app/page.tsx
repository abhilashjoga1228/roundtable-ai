"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ConfidenceLabel = "Low" | "Moderate" | "High" | "Very High";

type Expert = {
  name: string;
  role: string;
  focus: string;
  voice?: string;
  reasoningStyle?: string;
};

type Agent = {
  expert: string;
  role: string;
  answer: string;
};

type DecisionSensitivity =
  | "Low"
  | "Medium"
  | "High";

type Verdict = {
  recommendation: string;
  summary: string;
  consensus: string;
  reasons: string[];
  disagreement: string;
  minorityReport: string;
  confidence: ConfidenceLabel;
  confidenceReason: string;

  // Verdict Intelligence.
  // Optional so older Challenge / Reconvene responses remain compatible.
  keyAssumption?: string;
  decisionSensitivity?: DecisionSensitivity;
  decisionSensitivityReason?: string;
  flipCondition?: string;
  missingInformation?: string;

  changeCondition: string;
  nextStep: string;
};

type ClarificationQuestion = {
  id: string;
  question: string;
  whyItMatters: string;
  type: "choice" | "text";
  options: string[];
};

type ClarifyResponse = {
  needsClarification?: boolean;
  reason?: string;
  questions?: ClarificationQuestion[];
  error?: string;
};

type ClarificationAnswer = {
  question: string;
  answer: string;
};

type Reconsideration = {
  expert: string;
  role: string;
  shift: "MAJOR CHANGE" | "PARTIAL CHANGE" | "NO CHANGE";
  summary: string;
  updatedPosition: string;
};

type UpdatedVerdict = Verdict & {
  whatChanged: string;
  expertShifts: string;
  whatStillHolds: string;
};

type RoundTableResponse = {
  question?: string;
  experts?: Expert[];
  round1?: Agent[];
  round2?: Agent[];
  verdict?: Verdict;
  error?: string;
};

type ChallengeResponse = {
  challenge?: string;
  reconsiderations?: Reconsideration[];
  updatedVerdict?: UpdatedVerdict;
  error?: string;
};

type DebateLine = {
  speaker: string;
  text: string;
};

type DebateScript = {
  title: string;
  estimatedSeconds: number;
  lines: DebateLine[];
};

type DebateResponse = {
  script?: DebateScript;
  error?: string;
};

type ExpertConversationMessage = {
  expert: string;
  role: string;
  question: string;
  answer: string;
};

type AskExpertResponse = {
  expert?: string;
  role?: string;
  question?: string;
  answer?: string;
  error?: string;
};

type AddedExpert = {
  expert: Expert;
  perspective: string;
};

type AddExpertResponse = {
  expert?: Expert;
  perspective?: string;
  error?: string;
};

type VerdictChange =
  | "VERDICT CHANGED"
  | "VERDICT REFINED"
  | "VERDICT UNCHANGED";

type ReconveneExpertReaction = {
  expert: string;
  role: string;
  reaction: string;
};

type ReconvenedExpertVerdict = Verdict & {
  status: VerdictChange;
  whatChanged: string;
  whatStillHolds: string;
  newExpertImpact: string;
};

type ReconveneExpertResponse = {
  addedExpert?: string;
  reactions?: ReconveneExpertReaction[];
  newExpertFinalResponse?: string;
  updatedVerdict?: ReconvenedExpertVerdict;
  error?: string;
};

type ReconveneExpertResult = {
  reactions: ReconveneExpertReaction[];
  newExpertFinalResponse: string;
  updatedVerdict: ReconvenedExpertVerdict;
};

type VerdictSource =
  | { type: "original" }
  | { type: "challenge"; label: string }
  | { type: "added-expert"; label: string; status: VerdictChange };

type DecisionHistoryItem = {
  id: string;
  source: VerdictSource;
  verdict: Verdict;
  createdAt: number;
};

type CurrentDecisionState = {
  verdict: Verdict;
  source: VerdictSource;
  previousVerdict: Verdict | null;
  history: DecisionHistoryItem[];
};

const progressSteps = [
  "Understanding your decision",
  "Selecting the right experts",
  "Independent expert analysis",
  "Experts challenge each other",
  "Chairperson prepares verdict",
];

function positionFromAnswer(answer: string) {
  const normalized = answer.replace(/\r/g, "").trim();
  const positionMatch = normalized.match(/POSITION:\s*([\s\S]*?)(?:\n\s*WHY:|\n\s*WATCH OUT:|$)/i);
  const raw = positionMatch?.[1]?.trim() || normalized.split("\n").find(Boolean) || "";
  return raw.length > 170 ? `${raw.slice(0, 167).trim()}…` : raw;
}

function fullPositionFromAnswer(answer: string) {
  const normalized = answer.replace(/\r/g, "").trim();
  const positionMatch = normalized.match(
    /POSITION:\s*([\s\S]*?)(?:\n\s*WHY:|\n\s*WATCH OUT:|$)/i
  );

  return (
    positionMatch?.[1]?.trim() ||
    normalized.split("\n").find(Boolean) ||
    ""
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function shortVerdictHeadline(text: string, maxWords = 26) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function perspectiveSection(text: string, heading: string) {
  const headings = [
    "WHAT I ADD",
    "MY VIEW",
    "WHAT I WOULD CHALLENGE",
    "WHAT WOULD MATTER MOST",
  ];

  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const otherHeadings = headings
    .filter((item) => item !== heading)
    .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const match = text.match(
    new RegExp(
      `${escapedHeading}:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${otherHeadings}):|$)`,
      "i"
    )
  );

  return match?.[1]?.trim() || "";
}

function compactSnippet(text: string, maxLength = 220) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

function confidenceClasses(confidence: ConfidenceLabel) {
  if (confidence === "Very High") return "border-emerald-400/30 bg-[#34D399]/10 text-emerald-200";
  if (confidence === "High") return "border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#7DD3FC]";
  if (confidence === "Moderate") return "border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FCD34D]";
  return "border-rose-400/30 bg-rose-400/10 text-rose-200";
}

function sensitivityClasses(
  sensitivity?: DecisionSensitivity
) {
  if (sensitivity === "Low") {
    return "border-[#34D399]/25 bg-[#34D399]/10 text-[#6EE7B7]";
  }

  if (sensitivity === "High") {
    return "border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FCD34D]";
  }

  return "border-[#A78BFA]/25 bg-[#A78BFA]/10 text-[#DDD6FE]";
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [decisionTitle, setDecisionTitle] = useState("");
  const [showOriginalQuestion, setShowOriginalQuestion] = useState(false);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [round1, setRound1] = useState<Agent[]>([]);
  const [round2, setRound2] = useState<Agent[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showReasoning, setShowReasoning] = useState(false);
  const [showRound1, setShowRound1] = useState(false);
  const [showRound2, setShowRound2] = useState(false);
  const [showPreviousVerdict, setShowPreviousVerdict] = useState(false);
  const [showDecisionDetails, setShowDecisionDetails] = useState(false);

  const [progressStep, setProgressStep] = useState(0);

  useEffect(() => {
    if (!loading) {
      setProgressStep(0);
      return;
    }

    const interval = window.setInterval(() => {
      setProgressStep((current) => Math.min(current + 1, progressSteps.length - 1));
    }, 2200);

    return () => window.clearInterval(interval);
  }, [loading]);

  // Clarification
  const [checkingClarification, setCheckingClarification] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarificationReason, setClarificationReason] = useState("");
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [submittedClarifications, setSubmittedClarifications] = useState<ClarificationAnswer[]>([]);
  const [showingClarification, setShowingClarification] = useState(false);

  // Debate
  const [debateScript, setDebateScript] = useState<DebateScript | null>(null);
  const [debateLoading, setDebateLoading] = useState(false);
  const [debateError, setDebateError] = useState("");
  const [showDebateTranscript, setShowDebateTranscript] = useState(false);

  // Audio
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeExpertAudioKey, setActiveExpertAudioKey] = useState<string | null>(null);
  const [expertAudioPaused, setExpertAudioPaused] = useState(false);
  const speechSessionRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => setSpeechVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  function stopAudio() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speechSessionRef.current += 1;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setActiveLineIndex(null);
    setActiveExpertAudioKey(null);
    setExpertAudioPaused(false);
  }

  function getVoiceForSpeaker(speaker: string) {
    if (speechVoices.length === 0) return undefined;
    const english = speechVoices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    const available = english.length > 0 ? english : speechVoices;
    const knownSpeakers = [...experts.map((expert) => expert.name), "Chairperson"];
    const index = knownSpeakers.findIndex((name) =>
      speaker.toLowerCase().includes(name.toLowerCase())
    );
    return available[Math.max(0, index) % available.length];
  }

  function speakSimpleText(speaker: string, text: string, audioKey: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    stopAudio();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getVoiceForSpeaker(speaker);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = 0.97;
    utterance.pitch = 1;

    setActiveExpertAudioKey(audioKey);
    setExpertAudioPaused(false);

    utterance.onend = () => {
      setActiveExpertAudioKey(null);
      setExpertAudioPaused(false);
    };
    utterance.onerror = () => {
      setActiveExpertAudioKey(null);
      setExpertAudioPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  function toggleExpertAudioPause() {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !activeExpertAudioKey) return;
    if (expertAudioPaused) {
      window.speechSynthesis.resume();
      setExpertAudioPaused(false);
    } else {
      window.speechSynthesis.pause();
      setExpertAudioPaused(true);
    }
  }

  function speakDebateFrom(startIndex: number) {
    if (!debateScript) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setDebateError("Speech playback is not supported in this browser.");
      return;
    }

    stopAudio();
    const session = speechSessionRef.current + 1;
    speechSessionRef.current = session;
    setIsSpeaking(true);
    setIsPaused(false);

    const speakLine = (index: number) => {
      if (speechSessionRef.current !== session) return;
      if (index >= debateScript.lines.length) {
        setIsSpeaking(false);
        setIsPaused(false);
        setActiveLineIndex(null);
        return;
      }

      const line = debateScript.lines[index];
      setActiveLineIndex(index);
      const utterance = new SpeechSynthesisUtterance(line.text);
      const voice = getVoiceForSpeaker(line.speaker);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.rate = 0.97;
      utterance.onend = () => {
        if (speechSessionRef.current === session) speakLine(index + 1);
      };
      utterance.onerror = (event) => {
        if (event.error === "interrupted") return;
        setIsSpeaking(false);
        setIsPaused(false);
        setActiveLineIndex(null);
      };
      window.speechSynthesis.speak(utterance);
    };

    speakLine(startIndex);
  }

  function togglePauseDebate() {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !isSpeaking) return;
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } else {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }

  // Ask expert
  const [selectedExpert, setSelectedExpert] = useState<Expert | null>(null);
  const [expandedExpertName, setExpandedExpertName] = useState<string | null>(null);
  const [expertQuestion, setExpertQuestion] = useState("");
  const [expertQuestionLoading, setExpertQuestionLoading] = useState(false);
  const [expertQuestionError, setExpertQuestionError] = useState("");
  const [expertConversations, setExpertConversations] = useState<
    Record<string, ExpertConversationMessage[]>
  >({});

  // Add expert
  const [showAddExpert, setShowAddExpert] = useState(false);
  const [requestedPerspective, setRequestedPerspective] = useState("");
  const [addExpertLoading, setAddExpertLoading] = useState(false);
  const [addExpertError, setAddExpertError] = useState("");
  const [addedExperts, setAddedExperts] = useState<AddedExpert[]>([]);

  // Reconvene with added expert
  const [reconveningExpertName, setReconveningExpertName] = useState<string | null>(null);
  const [reconveneExpertError, setReconveneExpertError] = useState<Record<string, string>>({});
  const [reconveneExpertResults, setReconveneExpertResults] = useState<
    Record<string, ReconveneExpertResult>
  >({});
  const [expandedReconvene, setExpandedReconvene] = useState<string | null>(null);
  const [expandedAddedPerspective, setExpandedAddedPerspective] =
    useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState("");

  // Save decision
  const [savingDecision, setSavingDecision] = useState(false);
  const [savedDecisionId, setSavedDecisionId] = useState<string | null>(null);
  const [savedShareSlug, setSavedShareSlug] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");

  // Lightweight identity for cross-device access.
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [identityName, setIdentityName] = useState("");
  const [identityPasscode, setIdentityPasscode] = useState("");
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState("");

  useEffect(() => {
    if (!toastMessage) return;

    const timer = window.setTimeout(() => {
      setToastMessage("");
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // Challenge
  const [showChallenge, setShowChallenge] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [submittedChallenge, setSubmittedChallenge] = useState("");
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState("");
  const [reconsiderations, setReconsiderations] = useState<Reconsideration[]>([]);
  const [updatedVerdict, setUpdatedVerdict] = useState<UpdatedVerdict | null>(null);
  const [showReconsiderations, setShowReconsiderations] = useState(false);

  // Current verdict management
  // One atomic state object is the single source of truth for:
  // - the current verdict
  // - why it changed
  // - the immediately previous verdict
  // - decision history
  const [currentDecision, setCurrentDecision] =
    useState<CurrentDecisionState | null>(null);

  const verdictSectionRef = useRef<HTMLElement | null>(null);

  // ============================================================
  // RESTORE SAVED ROUND TABLE
  // ============================================================

  useEffect(() => {
    const raw =
      window.sessionStorage.getItem(
        "roundtable_resume_snapshot"
      );

    if (!raw) return;

    try {
      const snapshot =
        JSON.parse(raw);

      if (
        !snapshot?.submittedQuestion ||
        !snapshot?.currentDecision?.verdict
      ) {
        window.sessionStorage.removeItem(
          "roundtable_resume_snapshot"
        );
        return;
      }

      // Restore the original question.
      setQuestion(
        snapshot.submittedQuestion
      );

      setSubmittedQuestion(
        snapshot.submittedQuestion
      );

      setDecisionTitle(
        snapshot.decisionTitle ||
          snapshot.submittedQuestion
      );

      setShowOriginalQuestion(false);

      // Restore clarification context.
      setSubmittedClarifications(
        snapshot.submittedClarifications ||
          []
      );

      // Restore original experts and reasoning.
      setExperts(
        snapshot.experts || []
      );

      setRound1(
        snapshot.round1 || []
      );

      setRound2(
        snapshot.round2 || []
      );

      // The Results UI checks `verdict`, so restore it too.
      setVerdict(
        snapshot.currentDecision.verdict
      );

      // Restore latest verdict, source, previous verdict, and history.
      setCurrentDecision(
        snapshot.currentDecision
      );

      // Restore added perspectives.
      setAddedExperts(
        snapshot.addedExperts || []
      );

      // Restore reconvened expert results.
      setReconveneExpertResults(
        snapshot.reconveneExpertResults ||
          {}
      );

      // Restore challenge details if present.
      if (snapshot.challenge) {
        setSubmittedChallenge(
          snapshot.challenge
            .submittedChallenge || ""
        );

        setReconsiderations(
          snapshot.challenge
            .reconsiderations || []
        );

        setUpdatedVerdict(
          snapshot.challenge
            .updatedVerdict || null
        );
      } else {
        setSubmittedChallenge("");
        setReconsiderations([]);
        setUpdatedVerdict(null);
      }

      // Restore the saved database identity so saving again updates
      // the same Supabase row instead of creating a duplicate.
      setSavedDecisionId(
        snapshot.savedDecisionId ||
          null
      );

      setSavedShareSlug(
        snapshot.savedShareSlug ||
          null
      );

      // Reset temporary UI-only states.
      setLoading(false);
      setError("");
      setCheckingClarification(false);
      setShowingClarification(false);

      setShowReasoning(false);
      setShowRound1(false);
      setShowRound2(false);
      setShowPreviousVerdict(false);

      setShowAddExpert(false);
      setShowChallenge(false);

      setSelectedExpert(null);
      setExpertQuestion("");
      setExpertQuestionError("");

      setDebateScript(null);
      setDebateError("");
      setShowDebateTranscript(false);

      setSaveError("");

      // Remove the transfer object after a successful restore.
      window.sessionStorage.removeItem(
        "roundtable_resume_snapshot"
      );

      setToastMessage(
        "Saved Round Table restored."
      );

      window.setTimeout(() => {
        verdictSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 250);
    } catch (error) {
      console.error(
        "Could not restore saved Round Table:",
        error
      );

      window.sessionStorage.removeItem(
        "roundtable_resume_snapshot"
      );
    }
  }, []);

  const effectiveVerdict =
    currentDecision?.verdict || verdict;

  const currentVerdictSource: VerdictSource =
    currentDecision?.source || { type: "original" };

  const previousDisplayedVerdict =
    currentDecision?.previousVerdict || null;

  const currentStatusLabel = useMemo(() => {
    if (currentVerdictSource.type === "added-expert") {
      return currentVerdictSource.status;
    }

    if (currentVerdictSource.type === "challenge") {
      return "UPDATED VERDICT";
    }

    return "FINAL VERDICT";
  }, [currentVerdictSource]);

  async function performSaveDecision(
    identitySessionToken: string
  ) {
    if (!effectiveVerdict || !currentDecision || !submittedQuestion) return;

    setSavingDecision(true);
    setSaveError("");

    try {
      let ownerToken =
        window.localStorage.getItem(
          "roundtable_owner_token"
        );

      if (!ownerToken) {
        ownerToken = crypto.randomUUID();

        window.localStorage.setItem(
          "roundtable_owner_token",
          ownerToken
        );
      }

      const snapshot = {
        version: 1,
        submittedQuestion,
        decisionTitle:
          decisionTitle ||
          submittedQuestion,
        submittedClarifications,
        experts,
        round1,
        round2,
        addedExperts,
        reconveneExpertResults,
        currentDecision,
        challenge: {
          submittedChallenge,
          reconsiderations,
          updatedVerdict,
        },
        savedAt: new Date().toISOString(),
      };

      const response = await fetch(
        "/api/decisions",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            id:
              savedDecisionId ||
              undefined,
            ownerToken,
            identitySessionToken,
            title:
              decisionTitle ||
              submittedQuestion,
            snapshot,
            shareSlug:
              savedShareSlug ||
              undefined,
            isPublic: false,
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
          `Save Decision endpoint returned HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          window.localStorage.removeItem(
            "roundtable_identity_session"
          );
        }

        throw new Error(
          data.error ||
            "Could not save this decision."
        );
      }

      if (!data.decision?.id) {
        throw new Error(
          "The server did not return a saved decision."
        );
      }

      const wasAlreadySaved =
        Boolean(
          savedDecisionId
        );

      setSavedDecisionId(
        data.decision.id
      );

      setSavedShareSlug(
        data.decision
          .share_slug ||
          null
      );

      setToastMessage(
        wasAlreadySaved
          ? "Decision updated."
          : "Decision saved."
      );
    } catch (err) {
      console.error(
        "Save decision error:",
        err
      );

      setSaveError(
        err instanceof Error
          ? err.message
          : "Could not save this decision."
      );
    } finally {
      setSavingDecision(false);
    }
  }

  async function saveDecision() {
    if (
      !effectiveVerdict ||
      !currentDecision ||
      !submittedQuestion
    ) {
      return;
    }

    const identitySessionToken =
      window.localStorage.getItem(
        "roundtable_identity_session"
      );

    if (!identitySessionToken) {
      const storedName =
        window.localStorage.getItem(
          "roundtable_identity_name"
        );

      setIdentityName(
        storedName || ""
      );

      setIdentityPasscode("");
      setIdentityError("");
      setShowIdentityModal(true);

      return;
    }

    await performSaveDecision(
      identitySessionToken
    );
  }

  async function createIdentityAndSave() {
    const cleanName =
      identityName
        .trim()
        .replace(/\s+/g, " ");

    if (cleanName.length < 2) {
      setIdentityError(
        "Please enter your name."
      );
      return;
    }

    if (
      identityPasscode.length <
      6
    ) {
      setIdentityError(
        "Passcode must be at least 6 characters."
      );
      return;
    }

    setIdentityLoading(true);
    setIdentityError("");

    try {
      const response =
        await fetch(
          "/api/identity/create",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                name:
                  cleanName,
                passcode:
                  identityPasscode,
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
          `Identity endpoint returned HTTP ${response.status}.`
        );
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Could not create decision access."
        );
      }

      if (
        !data.sessionToken ||
        !data.identity
          ?.displayName
      ) {
        throw new Error(
          "The server did not return a valid identity session."
        );
      }

      // Store only the signed session + display name.
      // Never store the passcode itself.
      window.localStorage.setItem(
        "roundtable_identity_session",
        data.sessionToken
      );

      window.localStorage.setItem(
        "roundtable_identity_name",
        data.identity
          .displayName
      );

      setIdentityName(
        data.identity
          .displayName
      );

      setIdentityPasscode("");
      setShowIdentityModal(false);

      await performSaveDecision(
        data.sessionToken
      );
    } catch (err) {
      console.error(
        "Create identity error:",
        err
      );

      setIdentityError(
        err instanceof Error
          ? err.message
          : "Could not set up decision access."
      );
    } finally {
      setIdentityLoading(false);
    }
  }

  function scrollToCurrentVerdict() {
    window.setTimeout(() => {
      verdictSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  function resetResults() {
    stopAudio();
    setExperts([]);
    setRound1([]);
    setRound2([]);
    setVerdict(null);
    setCurrentDecision(null);
    setShowReasoning(false);
    setShowRound1(false);
    setShowRound2(false);
    setShowPreviousVerdict(false);
    setShowDecisionDetails(false);

    setDebateScript(null);
    setDebateLoading(false);
    setDebateError("");
    setShowDebateTranscript(false);

    setSelectedExpert(null);
    setExpandedExpertName(null);
    setExpertQuestion("");
    setExpertQuestionError("");
    setExpertConversations({});

    setShowAddExpert(false);
    setRequestedPerspective("");
    setAddExpertLoading(false);
    setAddExpertError("");
    setAddedExperts([]);
    setReconveningExpertName(null);
    setReconveneExpertError({});
    setReconveneExpertResults({});
    setExpandedReconvene(null);
    setExpandedAddedPerspective(null);
    setToastMessage("");

    setShowChallenge(false);
    setChallenge("");
    setSubmittedChallenge("");
    setChallengeError("");
    setReconsiderations([]);
    setUpdatedVerdict(null);
    setShowReconsiderations(false);

    setSavingDecision(false);
    setSavedDecisionId(null);
    setSavedShareSlug(null);
    setSaveError("");
  }

  function startNewRoundTable() {
    setQuestion("");
    setSubmittedQuestion("");
    setDecisionTitle("");
    setShowOriginalQuestion(false);
    resetResults();
    setError("");
    setLoading(false);
    setCheckingClarification(false);
    setClarificationQuestions([]);
    setClarificationReason("");
    setClarificationAnswers({});
    setSubmittedClarifications([]);
    setShowingClarification(false);
    setProgressStep(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleAssemble() {
    if (!question.trim()) return;
    resetResults();
    setError("");
    setSubmittedClarifications([]);
    setCheckingClarification(true);
    setShowingClarification(false);
    setClarificationQuestions([]);
    setClarificationAnswers({});
    setClarificationReason("");

    try {
      const response = await fetch("/api/roundtable/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(`Clarification endpoint returned HTTP ${response.status}`);
      }

      const data: ClarifyResponse = await response.json();
      if (!response.ok) throw new Error(data.error || "Clarification check failed");

      if (data.needsClarification && data.questions && data.questions.length > 0) {
        setClarificationQuestions(data.questions);
        setClarificationReason(data.reason || "");
        setShowingClarification(true);
        return;
      }

      await runRoundTable(question, []);
    } catch (err) {
      console.error("Clarification check failed, continuing without clarification:", err);
      await runRoundTable(question, []);
    } finally {
      setCheckingClarification(false);
    }
  }

  async function runRoundTable(originalQuestion: string, answers: ClarificationAnswer[]) {
    setShowingClarification(false);
    setSubmittedQuestion(originalQuestion);
    setSubmittedClarifications(answers);
    setLoading(true);
    setError("");
    setProgressStep(0);
    resetResults();

    try {
      const response = await fetch("/api/roundtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: originalQuestion, clarifications: answers }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(`Round Table endpoint returned HTTP ${response.status}`);
      }

      const data: RoundTableResponse = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");

      setDecisionTitle(
        (data.question || originalQuestion).trim()
      );
      setShowOriginalQuestion(false);

      setExperts(data.experts || []);
      setRound1(data.round1 || []);
      setRound2(data.round2 || []);
      const initialVerdict = data.verdict || null;

      setVerdict(initialVerdict);

      if (initialVerdict) {
        setCurrentDecision({
          verdict: initialVerdict,
          source: { type: "original" },
          previousVerdict: null,
          history: [
            {
              id: `initial-${Date.now()}`,
              source: { type: "original" },
              verdict: initialVerdict,
              createdAt: Date.now(),
            },
          ],
        });
      } else {
        setCurrentDecision(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function continueWithClarification() {
    const unanswered = clarificationQuestions.some(
      (item) => !clarificationAnswers[item.id]?.trim()
    );
    if (unanswered) {
      setError("Please answer each clarification question or choose Skip & Assemble.");
      return;
    }

    const answers = clarificationQuestions.map((item) => ({
      question: item.question,
      answer: clarificationAnswers[item.id],
    }));

    setError("");
    await runRoundTable(question, answers);
  }

  async function generateDebate() {
    if (!effectiveVerdict) return;
    stopAudio();
    setDebateLoading(true);
    setDebateError("");
    setDebateScript(null);

    try {
      const response = await fetch("/api/roundtable/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: submittedQuestion,
          experts: [...experts, ...addedExperts.map((item) => item.expert)],
          round1,
          round2,
          verdict: effectiveVerdict,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(`Debate endpoint returned HTTP ${response.status}`);
      }

      const data: DebateResponse = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not prepare the debate.");
      setDebateScript(data.script || null);
    } catch (err) {
      setDebateError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDebateLoading(false);
    }
  }

  async function askExpert() {
    if (!selectedExpert || !expertQuestion.trim() || !effectiveVerdict) return;
    setExpertQuestionLoading(true);
    setExpertQuestionError("");
    const questionBeingAsked = expertQuestion.trim();

    try {
      const response = await fetch("/api/roundtable/ask-expert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: submittedQuestion,
          expert: selectedExpert,
          userQuestion: questionBeingAsked,
          round1,
          round2,
          verdict: effectiveVerdict,
          clarifications: submittedClarifications,
          conversationHistory: expertConversations[selectedExpert.name] || [],
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(`Ask Expert endpoint returned HTTP ${response.status}`);
      }

      const data: AskExpertResponse = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not ask the expert.");
      if (!data.answer) throw new Error("The expert did not return an answer.");

      const message: ExpertConversationMessage = {
        expert: selectedExpert.name,
        role: selectedExpert.role,
        question: questionBeingAsked,
        answer: data.answer,
      };

      setExpertConversations((previous) => ({
        ...previous,
        [selectedExpert.name]: [...(previous[selectedExpert.name] || []), message],
      }));
      setExpertQuestion("");
    } catch (err) {
      setExpertQuestionError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setExpertQuestionLoading(false);
    }
  }

  async function handleAddExpert() {
    if (!requestedPerspective.trim() || !effectiveVerdict) return;
    setAddExpertLoading(true);
    setAddExpertError("");

    try {
      const response = await fetch("/api/roundtable/add-expert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: submittedQuestion,
          requestedPerspective: requestedPerspective.trim(),
          existingExperts: [...experts, ...addedExperts.map((item) => item.expert)],
          round1,
          round2,
          verdict: effectiveVerdict,
          clarifications: submittedClarifications,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const returnedText = await response.text();
        console.error("Add Expert returned non-JSON:", returnedText);
        throw new Error(
          `Add Expert API is not available. HTTP ${response.status}. Check app/api/roundtable/add-expert/route.ts.`
        );
      }

      const data: AddExpertResponse = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add the expert.");
      if (!data.expert || !data.perspective) {
        throw new Error("The new expert did not return a valid perspective.");
      }

      setAddedExperts((previous) => [
        ...previous,
        { expert: data.expert!, perspective: data.perspective! },
      ]);
      setRequestedPerspective("");
      setShowAddExpert(false);
    } catch (err) {
      setAddExpertError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAddExpertLoading(false);
    }
  }

  async function handleReconveneExpert(item: AddedExpert) {
    if (!effectiveVerdict || reconveningExpertName) return;
    setReconveningExpertName(item.expert.name);
    setReconveneExpertError((previous) => ({ ...previous, [item.expert.name]: "" }));

    try {
      const response = await fetch("/api/roundtable/reconvene-expert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: submittedQuestion,
          clarifications: submittedClarifications,
          originalExperts: experts,
          round1,
          round2,
          previousVerdict: effectiveVerdict,
          addedExpert: item.expert,
          addedExpertPerspective: item.perspective,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const returnedText = await response.text();
        console.error("Reconvene Expert returned non-JSON:", returnedText);
        throw new Error(
          `Reconvene Expert API is not available. HTTP ${response.status}. Check app/api/roundtable/reconvene-expert/route.ts.`
        );
      }

      const data: ReconveneExpertResponse = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reconvene the table with this expert.");
      if (!data.updatedVerdict || !Array.isArray(data.reactions) || !data.newExpertFinalResponse) {
        throw new Error("The reconvened table returned an incomplete result.");
      }

      const result: ReconveneExpertResult = {
        reactions: data.reactions,
        newExpertFinalResponse: data.newExpertFinalResponse,
        updatedVerdict: data.updatedVerdict,
      };

      setReconveneExpertResults((previous) => ({
        ...previous,
        [item.expert.name]: result,
      }));
      setExpandedReconvene(null);

      const previousCurrentVerdict =
        currentDecision?.verdict || verdict;

      const newSource: VerdictSource = {
        type: "added-expert",
        label: item.expert.name,
        status: data.updatedVerdict.status,
      };

      setCurrentDecision((previous) => {
        const priorVerdict =
          previous?.verdict ||
          previousCurrentVerdict ||
          data.updatedVerdict!;

        return {
          verdict: data.updatedVerdict!,
          source: newSource,
          previousVerdict: priorVerdict,
          history: [
            ...(previous?.history || []),
            {
              id: `added-expert-${Date.now()}`,
              source: newSource,
              verdict: data.updatedVerdict!,
              createdAt: Date.now(),
            },
          ],
        };
      });

      setDebateScript(null);
      setToastMessage(
        `Table reconvened — ${data.updatedVerdict.status
          .replace("VERDICT ", "")
          .toLowerCase()} verdict.`
      );
      scrollToCurrentVerdict();
    } catch (err) {
      setReconveneExpertError((previous) => ({
        ...previous,
        [item.expert.name]: err instanceof Error ? err.message : "Something went wrong",
      }));
    } finally {
      setReconveningExpertName(null);
    }
  }

  async function handleChallenge() {
    if (!challenge.trim() || !effectiveVerdict) return;
    stopAudio();
    setChallengeLoading(true);
    setChallengeError("");
    setSubmittedChallenge(challenge);
    setReconsiderations([]);
    setUpdatedVerdict(null);
    setShowReconsiderations(false);

    try {
      const contextText = submittedClarifications
        .map((item) => `${item.question}\nUser answer: ${item.answer}`)
        .join("\n\n");

      const questionForChallenge = contextText
        ? `${submittedQuestion}\n\nAdditional context provided before the original Round Table:\n\n${contextText}`
        : submittedQuestion;

      const response = await fetch("/api/roundtable/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionForChallenge,
          challenge,
          experts: [...experts, ...addedExperts.map((item) => item.expert)],
          round1,
          round2,
          previousVerdict: effectiveVerdict,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(`Challenge endpoint returned HTTP ${response.status}`);
      }

      const data: ChallengeResponse = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong while reconvening.");

      setReconsiderations(data.reconsiderations || []);
      setUpdatedVerdict(data.updatedVerdict || null);

      if (data.updatedVerdict) {
        const challengeText = challenge.trim();

        const newSource: VerdictSource = {
          type: "challenge",
          label: challengeText,
        };

        const previousCurrentVerdict =
          currentDecision?.verdict || verdict;

        setCurrentDecision((previous) => {
          const priorVerdict =
            previous?.verdict ||
            previousCurrentVerdict ||
            data.updatedVerdict!;

          return {
            verdict: data.updatedVerdict!,
            source: newSource,
            previousVerdict: priorVerdict,
            history: [
              ...(previous?.history || []),
              {
                id: `challenge-${Date.now()}`,
                source: newSource,
                verdict: data.updatedVerdict!,
                createdAt: Date.now(),
              },
            ],
          };
        });
      }

      setChallenge("");
      setShowChallenge(false);
      setDebateScript(null);

      if (data.updatedVerdict) {
        setToastMessage("Table reconvened — verdict updated.");
        scrollToCurrentVerdict();
      }
    } catch (err) {
      setChallengeError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setChallengeLoading(false);
    }
  }

  const expertCards = useMemo(() => {
    return experts.map((expert) => {
      const r1 = round1.find((item) => item.expert === expert.name);
      const r2 = round2.find((item) => item.expert === expert.name);
      const source =
        r2?.answer ||
        r1?.answer ||
        expert.focus;

      return {
        expert,
        position:
          positionFromAnswer(
            source
          ),
        fullPosition:
          fullPositionFromAnswer(
            source
          ),
      };
    });
  }, [experts, round1, round2]);

  const hasCurrentUpdate = currentVerdictSource.type !== "original";

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-320px] h-[620px] w-[860px] -translate-x-1/2 rounded-full bg-[#8B5CF6]/[0.10] blur-[150px]" />
        <div className="absolute bottom-[-260px] right-[-160px] h-[520px] w-[520px] rounded-full bg-[#38BDF8]/[0.035] blur-[150px]" />
      </div>

      {/* ====================================================== */}
      {/* LANDING */}
      {/* ====================================================== */}

      {!verdict && !loading ? (
        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 sm:py-7">
          {/* Minimal brand bar */}
          <header className="relative z-50 mx-auto flex w-full max-w-6xl items-center justify-between">
  {/* Brand */}
  <div className="flex items-center gap-3">
    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#8B5CF6]/35 bg-[#8B5CF6]/10 text-xs font-bold text-[#E9DDFF]">
      RT
    </div>

    <div>
      <span className="block text-sm font-semibold tracking-wide text-[#F8FAFC]">
        Round Table AI
      </span>

      <span className="text-[10px] text-[#52627A]">
        by Abhilash Joga
      </span>
    </div>
  </div>

  {/* Navigation */}
  <div className="relative z-50 flex items-center gap-3">
    <a
      href="https://www.abhilashjoga.com"
      className="relative z-50 cursor-pointer rounded-xl px-3.5 py-2 text-xs font-medium text-[#8290A5] transition hover:bg-white/[0.04] hover:text-[#D8C7FF]"
    >
      Portfolio ↗
    </a>

    <a
      href="/decisions"
      className="relative z-50 cursor-pointer rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-xs font-medium text-[#94A3B8] transition hover:border-[#8B5CF6]/25 hover:text-[#D8C7FF]"
    >
      My Decisions →
    </a>
  </div>
</header>

          {/* Main hero */}
          <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center pb-16 pt-2 text-center sm:pb-20 sm:pt-0 lg:-translate-y-10">
            <h1 className="mx-auto max-w-5xl text-5xl font-semibold tracking-[-0.05em] sm:text-6xl lg:text-[70px] lg:leading-[1.02]">
              One question.
              <br />
              <span className="text-[#B99AFF]">
                Multiple perspectives.
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#AAB7C8] sm:text-lg">
              Get important decisions stress-tested from multiple perspectives before you act.
            </p>

            {/* Decision input */}
            <div className="mx-auto mt-9 w-full max-w-3xl rounded-[26px] border border-[#94A3B8]/20 bg-[#0D1428]/95 p-3 text-left shadow-2xl shadow-black/30">
              <textarea
                value={question}
                onChange={(event) =>
                  setQuestion(event.target.value)
                }
                placeholder="What are you trying to decide?"
                className="h-28 w-full resize-none rounded-2xl bg-transparent p-5 text-base leading-7 text-white outline-none placeholder:text-[#64748B] sm:h-32 sm:text-lg"
              />

              <div className="flex flex-col gap-3 border-t border-[#94A3B8]/14 px-3 pb-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium text-[#7C8CA5]">
                  Career · Money · Relationships · Products · Strategy
                </p>

                <button
                  onClick={handleAssemble}
                  disabled={
                    checkingClarification ||
                    !question.trim()
                  }
                  className="rounded-xl bg-[#8B5CF6] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#8B5CF6]/15 transition hover:bg-[#9D74FF] disabled:cursor-not-allowed disabled:bg-[#8B5CF6]/45 disabled:text-white/60"
                >
                  {checkingClarification
                    ? "Checking context…"
                    : "Assemble the Table →"}
                </button>
              </div>
            </div>

            <p className="mt-5 text-xs text-[#52627A]">
              Independent analysis
              <span className="mx-2">•</span>
              Expert debate
              <span className="mx-2">•</span>
              One recommendation
            </p>
          </section>

          {/* Clarification modal */}
          {showingClarification && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050816]/92 px-5 backdrop-blur-md">
              <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#0b1020] p-6 shadow-2xl sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99AFF]">
                  Before the table meets
                </p>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                  A little context could change the answer.
                </h2>

                <p className="mt-3 leading-7 text-[#94A3B8]">
                  {clarificationReason}
                </p>

                <div className="mt-7 space-y-6">
                  {clarificationQuestions.map((item, index) => (
                    <div key={item.id}>
                      <div className="flex gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-xs text-[#94A3B8]">
                          {index + 1}
                        </span>

                        <div className="flex-1">
                          <p className="font-medium text-[#F8FAFC]">
                            {item.question}
                          </p>

                          <p className="mt-1 text-sm leading-6 text-[#64748B]">
                            {item.whyItMatters}
                          </p>
                        </div>
                      </div>

                      {item.type === "choice" ? (
                        <div className="ml-9 mt-4 flex flex-wrap gap-2">
                          {item.options.map((option) => {
                            const selected =
                              clarificationAnswers[item.id] === option;

                            return (
                              <button
                                key={option}
                                onClick={() =>
                                  setClarificationAnswers((previous) => ({
                                    ...previous,
                                    [item.id]: option,
                                  }))
                                }
                                className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                                  selected
                                    ? "border-[#8B5CF6]/55 bg-[#8B5CF6]/15 text-[#EEE7FF]"
                                    : "border-white/10 bg-white/[0.025] text-[#94A3B8] hover:border-white/20 hover:text-white"
                                }`}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea
                          value={
                            clarificationAnswers[item.id] || ""
                          }
                          onChange={(event) =>
                            setClarificationAnswers((previous) => ({
                              ...previous,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Type your answer…"
                          className="ml-9 mt-4 h-24 w-[calc(100%-2.25rem)] resize-none rounded-xl border border-white/10 bg-black/20 p-4 text-sm outline-none focus:border-[#8B5CF6]/55"
                        />
                      )}
                    </div>
                  ))}
                </div>

                {error && (
                  <p className="mt-5 text-sm text-rose-300">
                    {error}
                  </p>
                )}

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    onClick={() =>
                      runRoundTable(question, [])
                    }
                    className="rounded-xl px-5 py-3 text-sm font-semibold text-[#94A3B8] hover:text-white"
                  >
                    Skip
                  </button>

                  <button
                    onClick={continueWithClarification}
                    className="rounded-xl bg-[#8B5CF6] px-5 py-3 text-sm font-semibold hover:bg-[#9D74FF]"
                  >
                    Continue →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ====================================================== */}
      {/* LOADING */}
      {/* ====================================================== */}

      {loading && (
        <div className="relative mx-auto flex min-h-screen max-w-3xl items-center px-5 py-16">
          <div className="w-full rounded-[30px] border border-white/10 bg-white/[0.04] p-7 shadow-2xl sm:p-10">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#8B5CF6]" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99AFF]">
                Round Table in progress
              </p>
            </div>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              The table is deliberating.
            </h2>

            <p className="mt-3 text-[#64748B]">
              The experts are analyzing independently, challenging one another, and preparing a recommendation.
            </p>

            <div className="mt-8 space-y-4">
              {progressSteps.map((step, index) => {
                const complete = index < progressStep;
                const active = index === progressStep;

                return (
                  <div key={step} className="flex items-center gap-4">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs ${
                        complete
                          ? "border-emerald-400/30 bg-[#34D399]/10 text-[#34D399]"
                          : active
                          ? "border-violet-400/40 bg-[#8B5CF6]/10 text-violet-200"
                          : "border-white/10 text-[#3A465A]"
                      }`}
                    >
                      {complete ? "✓" : active ? "●" : "○"}
                    </div>

                    <p className={active || complete ? "text-[#E2E8F0]" : "text-[#3A465A]"}>
                      {step}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* ERROR */}
      {/* ====================================================== */}

      {!loading && error && !verdict && (
        <div className="relative mx-auto max-w-2xl px-5 py-24">
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-6">
            <h2 className="font-semibold text-rose-200">Something went wrong</h2>
            <p className="mt-2 text-sm leading-6 text-rose-100/70">{error}</p>

            <button
              onClick={startNewRoundTable}
              className="mt-5 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* RESULTS */}
      {/* ====================================================== */}

      {!loading && verdict && effectiveVerdict && (
        <div className="relative mx-auto max-w-7xl px-5 pb-16 sm:px-8">
          {/* Compact sticky navigation */}
          <header className="sticky top-0 z-30 -mx-5 border-b border-white/[0.05] bg-[#050816]/90 px-5 py-3.5 backdrop-blur-xl sm:-mx-8 sm:px-8">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
              <button
                onClick={startNewRoundTable}
                className="flex items-center gap-2 text-sm font-medium text-[#64748B] transition hover:text-white"
              >
                ← <span className="hidden sm:inline">New decision</span>
              </button>

              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#8B5CF6]/10 text-[10px] font-bold text-violet-200">
                  RT
                </div>
                <span className="text-sm font-semibold">Round Table AI</span>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href="/decisions"
                  className="hidden text-xs font-medium text-[#64748B] transition hover:text-[#B99AFF] sm:inline"
                >
                  My decisions
                </a>

                <span className="hidden text-xs text-[#3A465A] md:inline">
                  {experts.length + addedExperts.length} perspectives
                </span>

                <button
                  onClick={saveDecision}
                  disabled={savingDecision}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                    savedDecisionId
                      ? "border-[#34D399]/25 bg-[#34D399]/10 text-[#6EE7B7]"
                      : "border-[#8B5CF6]/25 bg-[#8B5CF6]/10 text-[#D8C7FF] hover:bg-[#8B5CF6]/15"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {savingDecision
                    ? "Saving…"
                    : savedDecisionId
                    ? "✓ Saved"
                    : "Save"}
                </button>
              </div>
            </div>
          </header>

          {/* Decision header */}
          <section className="mx-auto max-w-6xl pt-7 sm:pt-9">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#52627A]">
              Your decision
            </p>

            <h1 className="mt-2 max-w-5xl text-xl font-semibold leading-8 tracking-tight text-[#F8FAFC] sm:text-2xl sm:leading-9">
              {decisionTitle ||
                submittedQuestion}
            </h1>

            {decisionTitle &&
              decisionTitle.trim() !==
                submittedQuestion.trim() && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() =>
                      setShowOriginalQuestion(
                        (value) => !value
                      )
                    }
                    className="text-[11px] font-medium text-[#52627A] transition hover:text-[#94A3B8]"
                  >
                    {showOriginalQuestion
                      ? "Hide original question −"
                      : "View original question +"}
                  </button>

                  {showOriginalQuestion && (
                    <p className="mt-2 max-w-4xl rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs leading-6 text-[#64748B]">
                      {submittedQuestion}
                    </p>
                  )}
                </div>
              )}

            {submittedClarifications.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {submittedClarifications.map((item, index) => (
                  <div
                    key={index}
                    title={item.question}
                    className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] text-[#64748B]"
                  >
                    {item.answer}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ================================================== */}
          {/* CURRENT VERDICT — THE HERO OF RESULTS */}
          {/* ================================================== */}

          <section
            ref={verdictSectionRef}
            className="mx-auto mt-6 max-w-6xl scroll-mt-20"
          >
            <div className="overflow-hidden rounded-[26px] border border-[#34D399]/25 bg-[#0B1720] shadow-2xl shadow-black/20">
              <div className="grid lg:grid-cols-[1fr_320px]">
                <div className="p-6 sm:p-8 lg:p-9">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#34D399]/10 text-sm">
                      ⚖
                    </span>

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#34D399]">
                        Current verdict
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#52627A]">
                        {currentStatusLabel}
                      </p>
                    </div>

                    <div
                      className={`ml-auto rounded-full border px-3 py-1.5 text-xs font-semibold ${confidenceClasses(
                        effectiveVerdict.confidence
                      )}`}
                    >
                      {effectiveVerdict.confidence}
                    </div>
                  </div>

                  <h2
                    title={effectiveVerdict.recommendation}
                    className="mt-6 max-w-4xl text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-4xl"
                  >
                    {shortVerdictHeadline(effectiveVerdict.recommendation)}
                  </h2>

                  <div className="mt-5 max-w-4xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
                      Why this makes sense
                    </p>

                    <div className="mt-3 space-y-2.5">
                      {effectiveVerdict.reasons
                        .slice(0, 3)
                        .map(
                          (
                            reason,
                            index
                          ) => (
                            <div
                              key={index}
                              className="flex gap-3"
                            >
                              <span className="mt-1 text-xs text-[#34D399]">
                                ✓
                              </span>
                              <p className="text-sm leading-6 text-[#94A3B8]">
                                {reason}
                              </p>
                            </div>
                          )
                        )}
                    </div>
                  </div>

                  {hasCurrentUpdate && (
                    <button
                      onClick={() => setShowPreviousVerdict((value) => !value)}
                      className="mt-5 inline-flex items-center gap-2 text-xs text-[#64748B] transition hover:text-[#CBD5E1]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
                      {currentVerdictSource.type === "added-expert"
                        ? `Updated after ${currentVerdictSource.label} joined`
                        : currentVerdictSource.type === "challenge"
                        ? `Updated after your challenge: “${
                            currentVerdictSource.label.length > 72
                              ? `${currentVerdictSource.label.slice(0, 72).trim()}…`
                              : currentVerdictSource.label
                          }”`
                        : "Final verdict"}
                      <span>{showPreviousVerdict ? "−" : "+"}</span>
                    </button>
                  )}

                  {hasCurrentUpdate &&
                    showPreviousVerdict &&
                    previousDisplayedVerdict && (
                      <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/15 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#52627A]">
                          Previous verdict
                        </p>
                        <p className="mt-2 text-sm font-medium text-[#CBD5E1]">
                          {previousDisplayedVerdict.recommendation}
                        </p>
                        <p className="mt-2 text-xs leading-6 text-[#52627A]">
                          {previousDisplayedVerdict.summary}
                        </p>
                      </div>
                    )}
                </div>

                <div className="border-t border-white/[0.06] bg-black/10 p-6 lg:border-l lg:border-t-0 lg:p-7">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FBBF24]">
                      Watch out
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                      {effectiveVerdict.disagreement}
                    </p>
                  </div>

                  <div className="mt-6 border-t border-white/[0.06] pt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B99AFF]">
                      Next move
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#E2E8F0]">
                      {effectiveVerdict.nextStep}
                    </p>
                  </div>
                </div>
              </div>

              {/* Advanced decision intelligence */}
              <div className="border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() =>
                    setShowDecisionDetails(
                      (value) => !value
                    )
                  }
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.015] sm:px-7"
                >
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B99AFF]">
                      Decision details
                    </p>
                    <p className="mt-1 text-xs text-[#64748B]">
                      Assumptions, sensitivity, uncertainty, and what could change the recommendation.
                    </p>
                  </div>

                  <span className="text-lg text-[#52627A]">
                    {showDecisionDetails
                      ? "−"
                      : "+"}
                  </span>
                </button>

                {showDecisionDetails && (
                  <div className="border-t border-white/[0.06] p-5 sm:p-7">
                    <div className="grid gap-3 md:grid-cols-2">
                      {effectiveVerdict.keyAssumption && (
                        <div className="rounded-2xl border border-[#A78BFA]/16 bg-[#A78BFA]/[0.035] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#B99AFF]">
                            Key assumption
                          </p>

                          <p className="mt-2 text-sm leading-6 text-[#CBD5E1]">
                            {effectiveVerdict.keyAssumption}
                          </p>
                        </div>
                      )}

                      {effectiveVerdict.decisionSensitivity && (
                        <div className="rounded-2xl border border-white/[0.07] bg-black/10 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">
                              Decision sensitivity
                            </p>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${sensitivityClasses(
                                effectiveVerdict.decisionSensitivity
                              )}`}
                            >
                              {effectiveVerdict.decisionSensitivity}
                            </span>
                          </div>

                          {effectiveVerdict.decisionSensitivityReason && (
                            <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                              {effectiveVerdict.decisionSensitivityReason}
                            </p>
                          )}
                        </div>
                      )}

                      {(effectiveVerdict.flipCondition ||
                        effectiveVerdict.changeCondition) && (
                        <div className="rounded-2xl border border-[#FBBF24]/16 bg-[#FBBF24]/[0.025] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FBBF24]">
                            What would change this recommendation?
                          </p>

                          <p className="mt-2 text-sm leading-6 text-[#CBD5E1]">
                            {effectiveVerdict.flipCondition ||
                              effectiveVerdict.changeCondition}
                          </p>
                        </div>
                      )}

                      {effectiveVerdict.missingInformation && (
                        <div className="rounded-2xl border border-[#38BDF8]/14 bg-[#38BDF8]/[0.025] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7DD3FC]">
                            Missing information
                          </p>

                          <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                            {effectiveVerdict.missingInformation}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      {effectiveVerdict.consensus && (
                        <div className="rounded-2xl border border-[#34D399]/14 bg-[#34D399]/[0.025] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#34D399]">
                            Table consensus
                          </p>

                          <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                            {effectiveVerdict.consensus}
                          </p>
                        </div>
                      )}

                      {effectiveVerdict.confidenceReason && (
                        <div className="rounded-2xl border border-[#A78BFA]/14 bg-[#A78BFA]/[0.025] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#B99AFF]">
                            Why confidence is {effectiveVerdict.confidence.toLowerCase()}
                          </p>

                          <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                            {effectiveVerdict.confidenceReason}
                          </p>
                        </div>
                      )}

                      {effectiveVerdict.minorityReport && (
                        <div className="rounded-2xl border border-[#FBBF24]/14 bg-[#FBBF24]/[0.02] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FBBF24]">
                            Minority view
                          </p>

                          <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                            {effectiveVerdict.minorityReport}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ================================================== */}
          {/* THE TABLE */}
          {/* ================================================== */}

          <section className="mx-auto mt-9 max-w-6xl">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#B99AFF]">
                  The table
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                  {experts.length} experts. Different lenses.
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {expertCards.map(
                (
                  {
                    expert,
                    position,
                    fullPosition,
                  },
                  index
                ) => {
                  const isExpanded =
                    expandedExpertName ===
                    expert.name;

                  return (
                <div
                  key={expert.name}
                  className="group rounded-2xl border border-[#94A3B8]/12 bg-[#0F172A] p-5 transition hover:border-violet-400/25"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B5CF6]/10 text-[11px] font-bold text-violet-200">
                      {initials(expert.name) || index + 1}
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-[#F8FAFC]">
                        {expert.name}
                      </h3>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-[#52627A]">
                        {expert.role}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 min-h-[54px] text-sm leading-6 text-[#94A3B8]">
                    {isExpanded
                      ? fullPosition
                      : position}
                  </p>

                  {fullPosition.length >
                    position.replace(
                      /…$/,
                      ""
                    ).length && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedExpertName(
                          isExpanded
                            ? null
                            : expert.name
                        )
                      }
                      className="mt-3 text-[11px] font-medium text-[#64748B] transition hover:text-[#B99AFF]"
                    >
                      {isExpanded
                        ? "Show less −"
                        : "View full perspective +"}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setSelectedExpert(expert);
                      setExpertQuestionError("");
                    }}
                    className="mt-4 block text-xs font-semibold text-[#B99AFF] transition hover:text-violet-200"
                  >
                    Ask {expert.name.split(" ")[0]} →
                  </button>
                </div>
                  );
                }
              )}
            </div>
          </section>

          {/* ================================================== */}
          {/* ASK EXPERT — SIDE DRAWER */}
          {/* ================================================== */}

          {selectedExpert && (
            <div className="fixed inset-0 z-50">
              <button
                aria-label="Close expert panel"
                onClick={() => setSelectedExpert(null)}
                className="absolute inset-0 bg-[#050816]/65 backdrop-blur-[2px]"
              />

              <aside className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#8B5CF6]/20 bg-[#090F1F] shadow-2xl shadow-black/50 sm:max-w-[520px]">
                <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-5 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#8B5CF6]/12 text-[11px] font-bold text-[#D8C7FF]">
                      {initials(selectedExpert.name)}
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B99AFF]">
                        Ask an expert
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-[#F8FAFC]">
                        {selectedExpert.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-[#64748B]">
                        {selectedExpert.role}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedExpert(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] text-[#64748B] transition hover:bg-white/[0.04] hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                  {(expertConversations[selectedExpert.name] || []).length === 0 ? (
                    <div className="rounded-2xl border border-[#8B5CF6]/12 bg-[#8B5CF6]/[0.035] p-5">
                      <p className="text-sm font-medium text-[#E2E8F0]">
                        Continue the conversation directly with {selectedExpert.name}.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#64748B]">
                        Ask about assumptions, tradeoffs, or how new information would affect this expert&apos;s position.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {(expertConversations[selectedExpert.name] || []).map(
                        (message, index) => {
                          const audioKey = `${selectedExpert.name}-${index}`;
                          const isThisPlaying = activeExpertAudioKey === audioKey;

                          return (
                            <div key={audioKey} className="space-y-3">
                              <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#8B5CF6]/15 px-4 py-3 text-sm leading-6 text-[#E2E8F0]">
                                {message.question}
                              </div>

                              <div className="rounded-2xl rounded-bl-md border border-white/[0.06] bg-[#0D1428] p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#B99AFF]">
                                    {message.expert}
                                  </p>

                                  <div className="flex items-center gap-2 text-[11px]">
                                    {!isThisPlaying ? (
                                      <button
                                        onClick={() =>
                                          speakSimpleText(
                                            message.expert,
                                            message.answer,
                                            audioKey
                                          )
                                        }
                                        className="text-[#64748B] transition hover:text-[#B99AFF]"
                                      >
                                        🔊 Listen
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          onClick={toggleExpertAudioPause}
                                          className="text-[#B99AFF]"
                                        >
                                          {expertAudioPaused ? "▶ Resume" : "⏸ Pause"}
                                        </button>

                                        <button
                                          onClick={stopAudio}
                                          className="text-rose-300"
                                        >
                                          ■ Stop
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#94A3B8]">
                                  {message.answer}
                                </p>
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/[0.07] bg-[#090F1F] p-4 sm:p-5">
                  <textarea
                    value={expertQuestion}
                    onChange={(event) => setExpertQuestion(event.target.value)}
                    placeholder={`Ask ${selectedExpert.name.split(" ")[0]} a follow-up…`}
                    className="h-24 w-full resize-none rounded-2xl border border-[#94A3B8]/14 bg-[#0D1428] p-4 text-sm leading-6 text-white outline-none placeholder:text-[#64748B] focus:border-[#8B5CF6]/45"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    {expertQuestionError ? (
                      <p className="text-xs text-rose-300">{expertQuestionError}</p>
                    ) : (
                      <p className="text-xs text-[#52627A]">
                        This expert remembers your earlier follow-ups.
                      </p>
                    )}

                    <button
                      onClick={askExpert}
                      disabled={expertQuestionLoading || !expertQuestion.trim()}
                      className="shrink-0 rounded-xl bg-[#8B5CF6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#9D74FF] disabled:opacity-40"
                    >
                      {expertQuestionLoading ? "Thinking…" : "Ask →"}
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          )}

          {/* ================================================== */}
          {/* DEBATE — COMPACT PLAYER BAR */}
          {/* ================================================== */}

          <section className="mx-auto mt-7 max-w-6xl">
            <div className="rounded-2xl border border-[#A78BFA]/18 bg-[#0c1326] px-5 py-4 sm:px-6">
              {!debateScript ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#A78BFA]/10 text-sm">
                      🎙
                    </span>

                    <div>
                      <p className="text-sm font-semibold">Hear the Round Table debate</p>
                      <p className="mt-0.5 text-xs text-[#52627A]">
                        A short conversational version of how the experts challenged each other.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={generateDebate}
                    disabled={debateLoading}
                    className="rounded-xl border border-fuchsia-400/20 bg-[#A78BFA]/10 px-4 py-2.5 text-sm font-semibold text-[#DDD6FE] hover:bg-[#9D74FF]/15 disabled:opacity-40"
                  >
                    {debateLoading ? "Preparing…" : "Prepare →"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#A78BFA]/10 text-sm">
                        🎙
                      </span>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{debateScript.title}</p>
                        <p className="mt-0.5 text-xs text-[#52627A]">
                          ~{Math.max(1, Math.round(debateScript.estimatedSeconds / 60))} min
                          {activeLineIndex !== null
                            ? ` · ${debateScript.lines[activeLineIndex]?.speaker}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isSpeaking ? (
                        <button
                          onClick={() => speakDebateFrom(0)}
                          className="rounded-xl bg-[#8B5CF6] px-4 py-2.5 text-sm font-semibold hover:bg-[#9D74FF]"
                        >
                          ▶ Play
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={togglePauseDebate}
                            className="rounded-xl bg-[#8B5CF6] px-4 py-2.5 text-sm font-semibold hover:bg-[#9D74FF]"
                          >
                            {isPaused ? "▶ Resume" : "⏸ Pause"}
                          </button>

                          <button
                            onClick={stopAudio}
                            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-[#94A3B8] hover:text-white"
                          >
                            ■ Stop
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => setShowDebateTranscript((value) => !value)}
                        className="rounded-xl px-3 py-2.5 text-xs text-[#52627A] hover:text-white"
                      >
                        {showDebateTranscript ? "Hide transcript" : "Transcript"}
                      </button>
                    </div>
                  </div>

                  {showDebateTranscript && (
                    <div className="mt-4 space-y-2 border-t border-white/[0.05] pt-4">
                      {debateScript.lines.map((line, index) => {
                        const active = activeLineIndex === index;

                        return (
                          <div
                            key={`${line.speaker}-${index}`}
                            className={`rounded-xl px-4 py-3 ${
                              active ? "bg-[#A78BFA]/[0.08]" : "bg-black/10"
                            }`}
                          >
                            <p
                              className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${
                                active ? "text-[#C4B5FD]" : "text-[#52627A]"
                              }`}
                            >
                              {line.speaker}
                              {active ? " · Speaking" : ""}
                            </p>

                            <p className="mt-1.5 text-sm leading-6 text-[#94A3B8]">
                              {line.text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {debateError && <p className="mt-3 text-xs text-rose-300">{debateError}</p>}
            </div>
          </section>

          {/* ================================================== */}
          {/* CONTINUE THE DISCUSSION */}
          {/* ================================================== */}

          <section className="mx-auto mt-7 max-w-6xl">
            <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#52627A]">
                  Continue the discussion
                </p>
                <p className="mt-1 text-sm text-[#64748B]">
                  Bring in a missing lens or challenge the verdict directly.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setShowAddExpert((value) => !value);
                    setAddExpertError("");
                  }}
                  className="rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 py-2.5 text-sm font-semibold text-[#CBD5E1] hover:border-sky-400/25 hover:text-[#BAE6FD]"
                >
                  + Add Perspective
                </button>

                <button
                  onClick={() => {
                    setShowChallenge((value) => !value);
                    setChallengeError("");
                  }}
                  className="rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 py-2.5 text-sm font-semibold text-[#CBD5E1] hover:border-violet-400/25 hover:text-violet-200"
                >
                  ⚖ Challenge Verdict
                </button>
              </div>
            </div>

            {/* Add perspective drawer */}
            {showAddExpert && (
              <div className="mt-4 rounded-2xl border border-sky-400/15 bg-sky-400/[0.025] p-5">
                <p className="text-sm font-semibold">What perspective is missing?</p>
                <p className="mt-1 text-xs text-[#52627A]">
                  Example: “Someone who understands startup fundraising.”
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <textarea
                    value={requestedPerspective}
                    onChange={(event) => setRequestedPerspective(event.target.value)}
                    placeholder="Describe the perspective to invite…"
                    className="h-20 flex-1 resize-none rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm outline-none placeholder:text-[#3A465A] focus:border-sky-400/30"
                  />

                  <div className="flex gap-2 sm:flex-col">
                    <button
                      onClick={handleAddExpert}
                      disabled={addExpertLoading || !requestedPerspective.trim()}
                      className="rounded-xl bg-[#38BDF8] px-4 py-2.5 text-sm font-semibold hover:bg-[#7DD3FC] disabled:opacity-40"
                    >
                      {addExpertLoading ? "Inviting…" : "Invite →"}
                    </button>

                    <button
                      onClick={() => {
                        setShowAddExpert(false);
                        setRequestedPerspective("");
                      }}
                      className="rounded-xl px-4 py-2.5 text-sm text-[#52627A] hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {addExpertError && (
                  <p className="mt-3 text-sm text-rose-300">{addExpertError}</p>
                )}
              </div>
            )}

            {/* Challenge drawer */}
            {showChallenge && (
              <div className="mt-4 rounded-2xl border border-violet-400/15 bg-[#8B5CF6]/[0.025] p-5">
                <p className="text-sm font-semibold">What did the table miss?</p>
                <p className="mt-1 text-xs text-[#52627A]">
                  Add one important fact or challenge one assumption.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <textarea
                    value={challenge}
                    onChange={(event) => setChallenge(event.target.value)}
                    placeholder="Give the table new information…"
                    className="h-20 flex-1 resize-none rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm outline-none placeholder:text-[#3A465A] focus:border-violet-400/30"
                  />

                  <div className="flex gap-2 sm:flex-col">
                    <button
                      onClick={handleChallenge}
                      disabled={challengeLoading || !challenge.trim()}
                      className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-[#8B5CF6] disabled:opacity-40"
                    >
                      {challengeLoading ? "Reconvening…" : "Reconvene →"}
                    </button>

                    <button
                      onClick={() => setShowChallenge(false)}
                      className="rounded-xl px-4 py-2.5 text-sm text-[#52627A] hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {challengeError && (
                  <p className="mt-3 text-sm text-rose-300">{challengeError}</p>
                )}
              </div>
            )}
          </section>

          {/* ================================================== */}
          {/* ADDED PERSPECTIVES — COMPACT */}
          {/* ================================================== */}

          {addedExperts.length > 0 && (
            <section className="mx-auto mt-7 max-w-6xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7DD3FC]">
                Added perspectives
              </p>

              <div className="mt-3 space-y-3">
                {addedExperts.map((item) => {
                  const result = reconveneExpertResults[item.expert.name];
                  const discussionExpanded = expandedReconvene === item.expert.name;
                  const perspectiveExpanded = expandedAddedPerspective === item.expert.name;

                  const whatAdds =
                    perspectiveSection(item.perspective, "WHAT I ADD") || item.perspective;
                  const myView = perspectiveSection(item.perspective, "MY VIEW");
                  const mattersMost = perspectiveSection(
                    item.perspective,
                    "WHAT WOULD MATTER MOST"
                  );

                  return (
                    <div
                      key={item.expert.name}
                      className="rounded-2xl border border-[#38BDF8]/15 bg-[#38BDF8]/[0.025] p-5"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#38BDF8]/10 text-[11px] font-bold text-[#BAE6FD]">
                            {initials(item.expert.name)}
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-[#F8FAFC]">
                              {item.expert.name}
                            </h3>
                            <p className="mt-0.5 text-[11px] text-[#64748B]">
                              {item.expert.role}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              setSelectedExpert(item.expert);
                              setExpertQuestion("");
                              setExpertQuestionError("");
                            }}
                            className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-[#94A3B8] transition hover:text-white"
                          >
                            Ask →
                          </button>

                          <button
                            onClick={() => handleReconveneExpert(item)}
                            disabled={reconveningExpertName !== null}
                            className="rounded-lg bg-[#34D399] px-3 py-2 text-xs font-semibold text-[#052E2B] transition hover:brightness-110 disabled:opacity-40"
                          >
                            {reconveningExpertName === item.expert.name
                              ? "Reconvening…"
                              : "⚖ Reconvene"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-white/[0.05] bg-black/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7DD3FC]">
                            What this adds
                          </p>
                          <p className="mt-2 text-xs leading-5 text-[#94A3B8]">
                            {compactSnippet(whatAdds)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/[0.05] bg-black/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#B99AFF]">
                            Expert view
                          </p>
                          <p className="mt-2 text-xs leading-5 text-[#94A3B8]">
                            {compactSnippet(myView || whatAdds)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/[0.05] bg-black/10 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#FBBF24]">
                            What matters most
                          </p>
                          <p className="mt-2 text-xs leading-5 text-[#94A3B8]">
                            {compactSnippet(
                              mattersMost ||
                                "Additional information may materially affect this perspective."
                            )}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          setExpandedAddedPerspective(
                            perspectiveExpanded ? null : item.expert.name
                          )
                        }
                        className="mt-4 text-xs font-medium text-[#64748B] transition hover:text-[#BAE6FD]"
                      >
                        {perspectiveExpanded
                          ? "Hide full perspective −"
                          : "View full perspective +"}
                      </button>

                      {perspectiveExpanded && (
                        <div className="mt-4 rounded-xl border border-white/[0.05] bg-black/10 p-4">
                          <p className="whitespace-pre-wrap text-sm leading-7 text-[#94A3B8]">
                            {item.perspective}
                          </p>
                        </div>
                      )}

                      {reconveneExpertError[item.expert.name] && (
                        <p className="mt-3 text-sm text-rose-300">
                          {reconveneExpertError[item.expert.name]}
                        </p>
                      )}

                      {result && (
                        <div className="mt-5 border-t border-white/[0.07] pt-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <span
                                className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                                  result.updatedVerdict.status === "VERDICT CHANGED"
                                    ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                                    : result.updatedVerdict.status === "VERDICT REFINED"
                                    ? "border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FCD34D]"
                                    : "border-[#34D399]/30 bg-[#34D399]/10 text-[#6EE7B7]"
                                }`}
                              >
                                {result.updatedVerdict.status}
                              </span>
                              <span className="text-xs text-[#52627A]">
                                Incorporated into Current Verdict
                              </span>
                            </div>

                            <button
                              onClick={() =>
                                setExpandedReconvene(
                                  discussionExpanded ? null : item.expert.name
                                )
                              }
                              className="text-xs text-[#64748B] transition hover:text-white"
                            >
                              {discussionExpanded
                                ? "Hide discussion −"
                                : "View discussion +"}
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-xl bg-black/10 p-4">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#67E8F9]">
                                What changed
                              </p>
                              <p className="mt-2 text-xs leading-5 text-[#64748B]">
                                {compactSnippet(result.updatedVerdict.whatChanged, 180)}
                              </p>
                            </div>

                            <div className="rounded-xl bg-black/10 p-4">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7DD3FC]">
                                Expert impact
                              </p>
                              <p className="mt-2 text-xs leading-5 text-[#64748B]">
                                {compactSnippet(result.updatedVerdict.newExpertImpact, 180)}
                              </p>
                            </div>

                            <div className="rounded-xl bg-black/10 p-4">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#34D399]">
                                What held
                              </p>
                              <p className="mt-2 text-xs leading-5 text-[#64748B]">
                                {compactSnippet(result.updatedVerdict.whatStillHolds, 180)}
                              </p>
                            </div>
                          </div>

                          {discussionExpanded && (
                            <div className="mt-4 space-y-3">
                              {result.reactions.map((reaction) => (
                                <div
                                  key={reaction.expert}
                                  className="rounded-xl border border-[#94A3B8]/08 bg-black/10 p-4"
                                >
                                  <p className="text-xs font-semibold text-[#B99AFF]">
                                    {reaction.expert}
                                  </p>
                                  <p className="mt-2 text-xs leading-6 text-[#64748B]">
                                    {reaction.reaction}
                                  </p>
                                </div>
                              ))}

                              <div className="rounded-xl border border-[#38BDF8]/10 bg-[#38BDF8]/[0.025] p-4">
                                <p className="text-xs font-semibold text-[#7DD3FC]">
                                  {item.expert.name}&apos;s final response
                                </p>
                                <p className="mt-2 text-xs leading-6 text-[#64748B]">
                                  {result.newExpertFinalResponse}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Challenge result details */}
          {updatedVerdict && currentVerdictSource.type === "challenge" && (
            <section className="mx-auto mt-5 max-w-6xl rounded-2xl border border-violet-400/[0.12] bg-[#8B5CF6]/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#64748B]">
                  <span className="font-semibold text-[#B99AFF]">Challenge incorporated:</span>{" "}
                  “{submittedChallenge}”
                </p>

                <button
                  onClick={() => setShowReconsiderations((value) => !value)}
                  className="text-xs text-[#52627A] hover:text-white"
                >
                  {showReconsiderations ? "Hide expert shifts −" : "Expert shifts +"}
                </button>
              </div>

              {showReconsiderations && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {reconsiderations.map((item) => (
                    <div
                      key={item.expert}
                      className="rounded-xl border border-[#94A3B8]/08 bg-black/10 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold">{item.expert}</p>
                        <span className="text-[10px] text-[#52627A]">{item.shift}</span>
                      </div>

                      <p className="mt-2 text-xs leading-5 text-[#64748B]">
                        {item.summary}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ================================================== */}
          {/* DECISION HISTORY — COMPACT TIMELINE */}
          {/* ================================================== */}

          {currentDecision && currentDecision.history.length > 1 && (
            <section className="mx-auto mt-7 max-w-6xl border-t border-white/[0.06] pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#52627A]">
                    Decision history
                  </p>
                  <p className="mt-1 text-xs text-[#64748B]">
                    How the recommendation evolved.
                  </p>
                </div>

                <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
                  {currentDecision.history.map((item, index) => {
                    const isCurrent =
                      index === currentDecision.history.length - 1;

                    let label = index === 0 ? "Initial verdict" : "Updated";
                    let statusText = "";

                    if (item.source.type === "added-expert") {
                      label = item.source.label;
                      statusText = item.source.status
                        .replace("VERDICT ", "")
                        .toLowerCase();
                    }

                    if (item.source.type === "challenge") {
                      label = "Challenge";
                      statusText = "updated";
                    }

                    return (
                      <div
                        key={item.id}
                        className="flex shrink-0 items-center gap-2"
                      >
                        {index > 0 && (
                          <span className="text-[#3A465A]">→</span>
                        )}

                        <div
                          title={item.verdict.recommendation}
                          className={`rounded-full border px-3 py-2 ${
                            isCurrent
                              ? "border-[#34D399]/25 bg-[#34D399]/[0.07]"
                              : "border-white/[0.07] bg-white/[0.02]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-medium ${
                                isCurrent
                                  ? "text-[#E2E8F0]"
                                  : "text-[#64748B]"
                              }`}
                            >
                              {label}
                            </span>

                            {statusText && (
                              <span className="text-[9px] uppercase tracking-wider text-[#52627A]">
                                {statusText}
                              </span>
                            )}

                            {isCurrent && (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ================================================== */}
          {/* DEEP REASONING */}
          {/* ================================================== */}

          <section className="mx-auto mt-8 max-w-6xl border-t border-white/[0.06] pt-6">
            <button
              onClick={() => setShowReasoning((value) => !value)}
              className="flex w-full items-center justify-between py-2 text-left"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#3A465A]">
                  Optional deep dive
                </p>
                <p className="mt-1 text-sm font-semibold text-[#94A3B8]">
                  Explore the full reasoning
                </p>
              </div>

              <span className="text-lg text-[#3A465A]">
                {showReasoning ? "−" : "+"}
              </span>
            </button>

            {showReasoning && (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-[#94A3B8]/10 bg-[#0B1222]">
                  <button
                    onClick={() => setShowRound1((value) => !value)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#B99AFF]">
                        Round 1
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#94A3B8]">
                        Independent expert opinions
                      </p>
                    </div>

                    <span className="text-[#3A465A]">{showRound1 ? "−" : "+"}</span>
                  </button>

                  {showRound1 && (
                    <div className="grid gap-3 border-t border-white/[0.05] p-4 md:grid-cols-2">
                      {round1.map((agent) => (
                        <div
                          key={agent.expert}
                          className="rounded-xl border border-[#94A3B8]/08 bg-black/10 p-4"
                        >
                          <p className="text-xs font-semibold text-[#B99AFF]">
                            {agent.expert}
                          </p>
                          <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[#64748B]">
                            {agent.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[#94A3B8]/10 bg-[#0B1222]">
                  <button
                    onClick={() => setShowRound2((value) => !value)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#FBBF24]">
                        Round 2
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#94A3B8]">
                        Debate & revision
                      </p>
                    </div>

                    <span className="text-[#3A465A]">{showRound2 ? "−" : "+"}</span>
                  </button>

                  {showRound2 && (
                    <div className="space-y-3 border-t border-white/[0.05] p-4">
                      {round2.map((agent) => (
                        <div
                          key={agent.expert}
                          className="rounded-xl border border-[#94A3B8]/08 bg-black/10 p-4"
                        >
                          <p className="text-xs font-semibold text-[#FBBF24]">
                            {agent.expert}
                          </p>
                          <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[#64748B]">
                            {agent.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7DD3FC]">
                      Consensus
                    </p>
                    <p className="mt-2 text-xs leading-6 text-[#64748B]">
                      {effectiveVerdict.consensus}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#94A3B8]">
                      Minority report
                    </p>
                    <p className="mt-2 text-xs leading-6 text-[#64748B]">
                      {effectiveVerdict.minorityReport}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-300">
                      What could change it?
                    </p>
                    <p className="mt-2 text-xs leading-6 text-[#64748B]">
                      {effectiveVerdict.flipCondition ||
                        effectiveVerdict.changeCondition}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Minimal footer */}
          <footer className="mx-auto mt-10 max-w-6xl border-t border-white/[0.05] py-8 text-center">
            <button
              onClick={startNewRoundTable}
              className="text-sm font-medium text-[#52627A] transition hover:text-[#B99AFF]"
            >
              Have another decision? <span className="text-[#B99AFF]">Start a new Round Table →</span>
            </button>
          </footer>
        </div>
      )}

      {/* ====================================================== */}
      {/* SAVE IDENTITY MODAL */}
      {/* ====================================================== */}

      {showIdentityModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#050816]/92 px-5 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0B1020] p-6 shadow-2xl shadow-black/50 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B99AFF]">
                  Save your Round Tables
                </p>

                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#F8FAFC]">
                  Access your decisions anywhere.
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (identityLoading) return;

                  setShowIdentityModal(false);
                  setIdentityPasscode("");
                  setIdentityError("");
                }}
                disabled={identityLoading}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-[#64748B] transition hover:border-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <p className="mt-3 text-sm leading-6 text-[#94A3B8]">
              Choose a name and passcode. Use the same details later to access your saved decisions from another device.
            </p>

            <div className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="roundtable-identity-name"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748B]"
                >
                  Your name
                </label>

                <input
                  id="roundtable-identity-name"
                  type="text"
                  value={identityName}
                  onChange={(event) => {
                    setIdentityName(
                      event.target.value
                    );

                    if (identityError) {
                      setIdentityError("");
                    }
                  }}
                  autoComplete="name"
                  placeholder="e.g. Abhilash"
                  maxLength={80}
                  disabled={identityLoading}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none placeholder:text-[#475569] focus:border-[#8B5CF6]/50 disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="roundtable-identity-passcode"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748B]"
                >
                  Create a passcode
                </label>

                <input
                  id="roundtable-identity-passcode"
                  type="password"
                  value={identityPasscode}
                  onChange={(event) => {
                    setIdentityPasscode(
                      event.target.value
                    );

                    if (identityError) {
                      setIdentityError("");
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                        "Enter" &&
                      !identityLoading
                    ) {
                      void createIdentityAndSave();
                    }
                  }}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  maxLength={100}
                  disabled={identityLoading}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none placeholder:text-[#475569] focus:border-[#8B5CF6]/50 disabled:opacity-60"
                />

                <p className="mt-2 text-[11px] leading-5 text-[#52627A]">
                  Your passcode is not saved in this browser. The server stores only a secure hash.
                </p>
              </div>
            </div>

            {identityError && (
              <div className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3">
                <p className="text-sm leading-6 text-rose-200">
                  {identityError}
                </p>
              </div>
            )}

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (identityLoading) return;

                  setShowIdentityModal(false);
                  setIdentityPasscode("");
                  setIdentityError("");
                }}
                disabled={identityLoading}
                className="rounded-xl px-5 py-3 text-sm font-semibold text-[#64748B] transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Not now
              </button>

              <button
                type="button"
                onClick={() => {
                  void createIdentityAndSave();
                }}
                disabled={
                  identityLoading ||
                  !identityName.trim() ||
                  identityPasscode.length < 6
                }
                className="rounded-xl bg-[#8B5CF6] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#8B5CF6]/15 transition hover:bg-[#9D74FF] disabled:cursor-not-allowed disabled:bg-[#8B5CF6]/40 disabled:text-white/55"
              >
                {identityLoading
                  ? "Setting up access…"
                  : "Save decision →"}
              </button>
            </div>

            <div className="mt-6 border-t border-white/[0.06] pt-4 text-center">
              <p className="text-[10px] tracking-[0.12em] text-white/[0.18]">
                Round Table AI · Abhilash Joga
              </p>
            </div>
          </div>
        </div>
      )}

      {saveError && (
        <div className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-2xl border border-rose-400/25 bg-[#241015]/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-400/12 text-sm text-rose-300">
              !
            </span>
            <p className="text-sm font-medium text-rose-100">
              {saveError}
            </p>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-2xl border border-[#34D399]/25 bg-[#071A18]/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#34D399]/12 text-sm text-[#34D399]">
              ✓
            </span>
            <p className="text-sm font-medium text-[#D1FAE5]">
              {toastMessage}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}