"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { SiteShell } from "@/components/SiteShell";
import {
  assessmentQuestions,
  scoreAssessment,
  type AssessmentScore,
} from "@/content/assessment";
import { mintCertificateToken } from "@/lib/certificate-token";
import { certificatePath } from "@/lib/certs-paths";
import { sitePath } from "@/lib/paths";
import shared from "@/components/shared.module.css";
import styles from "@/views/assessment.module.css";

type Phase = "quiz" | "failed" | "passed";

export function AssessmentPage() {
  // rq:["../../../reqlan rq/site/certs.rq".assessment_page]
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("quiz");
  const [score, setScore] = useState<AssessmentScore | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const answeredCount = useMemo(
    () => assessmentQuestions.filter((q) => Boolean(answers[q.id])).length,
    [answers],
  );

  const onSubmitQuiz = () => {
    setError(null);
    const next = scoreAssessment(answers);
    setScore(next);
    setPhase(next.passed ? "passed" : "failed");
  };

  const onRetry = () => {
    setPhase("quiz");
    setScore(null);
    setError(null);
  };

  const onMint = async () => {
    setError(null);
    setBusy(true);
    try {
      const minted = await mintCertificateToken({ name });
      router.push(certificatePath(minted, { justCompleted: true }) as Route);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mint certificate");
      setBusy(false);
    }
  };

  return (
    <SiteShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.kicker}>
            <a href={sitePath("/tutorials/")}>Tutorials</a>
            <span aria-hidden> / </span>
            Certification
          </p>
          <h1 className={shared.sectionTitle}>Assessment</h1>
          <p className={styles.lede}>
            Pass at 80% for a certificate of completion.
          </p>
        </header>

        {phase === "quiz" ? (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitQuiz();
            }}
          >
            <ol className={styles.questions}>
              {assessmentQuestions.map((question, index) => (
                <li key={question.id} className={styles.question}>
                  <p className={styles.prompt}>
                    <span className={styles.qIndex}>{index + 1}.</span>{" "}
                    {question.prompt}
                  </p>
                  <div
                    className={styles.choices}
                    role="radiogroup"
                    aria-label={question.prompt}
                  >
                    {question.choices.map((choice) => {
                      const inputId = `${question.id}-${choice.id}`;
                      return (
                        <label key={choice.id} className={styles.choice} htmlFor={inputId}>
                          <input
                            id={inputId}
                            type="radio"
                            name={question.id}
                            value={choice.id}
                            checked={answers[question.id] === choice.id}
                            onChange={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [question.id]: choice.id,
                              }))
                            }
                          />
                          <span>{choice.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ol>

            <div className={styles.actions}>
              <p className={styles.progress}>
                {answeredCount}/{assessmentQuestions.length} answered
              </p>
              <button type="submit" className={styles.primary}>
                Submit
              </button>
            </div>
          </form>
        ) : null}

        {phase === "failed" && score ? (
          <section className={styles.result}>
            <h2 className={styles.resultTitle}>Not quite</h2>
            <p className={styles.resultBody}>
              You scored {score.correct}/{score.total} (
              {Math.round(score.ratio * 100)}%). Need at least{" "}
              {Math.round(0.8 * 100)}% to pass.
            </p>
            <button type="button" className={styles.primary} onClick={onRetry}>
              Try again
            </button>
          </section>
        ) : null}

        {phase === "passed" ? (
          <section className={styles.result}>
            {score ? (
              <p className={styles.resultBody}>
                Passed — {score.correct}/{score.total} (
                {Math.round(score.ratio * 100)}%).
              </p>
            ) : null}

            <h2 className={styles.resultTitle}>Your name on the certificate</h2>
            <label className={styles.nameLabel}>
              <span className={styles.visuallyHidden}>Display name</span>
              <input
                type="text"
                className={styles.nameInput}
                placeholder="Display name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={80}
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                disabled={busy || !name.trim()}
                onClick={() => void onMint()}
              >
                {busy ? "Minting…" : "Get certificate"}
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </SiteShell>
  );
}
