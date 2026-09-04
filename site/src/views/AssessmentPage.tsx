"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { SiteShell } from "@/components/SiteShell";
import {
  PASS_RATIO,
  assessmentQuestions,
  scoreAssessment,
  type Assessment,
  type AssessmentScore,
} from "@/content/assessment";
import { mintCertificateToken } from "@/lib/certificate-token";
import { certificatePath } from "@/lib/certs-paths";
import { sitePath } from "@/lib/paths";
import shared from "@/components/shared.module.css";
import styles from "@/views/assessment.module.css";

type Phase = "quiz" | "failed" | "passed";

type AssessmentPageProps = {
  assessment: Assessment;
};

export function AssessmentPage({ assessment }: AssessmentPageProps) {
  // rq:["../../../reqlan rq/site/certs.rq".assessment_page]
  // rq:["../../../reqlan rq/site/certs.rq".assessment]
  const router = useRouter();
  const questions = useMemo(
    () => assessmentQuestions(assessment),
    [assessment],
  );
  const questionNumberById = useMemo(() => {
    const numbers = new Map<string, number>();
    questions.forEach((question, index) => {
      numbers.set(question.id, index + 1);
    });
    return numbers;
  }, [questions]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("quiz");
  const [score, setScore] = useState<AssessmentScore | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const answeredCount = useMemo(
    () => questions.filter((q) => Boolean(answers[q.id])).length,
    [answers, questions],
  );

  const onSubmitQuiz = () => {
    setError(null);
    const next = scoreAssessment(answers, questions);
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
      const minted = await mintCertificateToken({
        name,
        assessmentId: assessment.id,
      });
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
            Pass at {Math.round(PASS_RATIO * 100)}% for a certificate of
            completion.
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
            {assessment.sections.map((section) => (
              <section key={section.id} className={styles.section}>
                <h2 className={styles.sectionTitle}>{section.title}</h2>
                <ol className={styles.questions}>
                  {section.questions.map((question) => {
                    const index = questionNumberById.get(question.id) ?? 0;
                    return (
                      <li key={question.id} className={styles.question}>
                        <p className={styles.prompt}>
                          <span className={styles.qIndex}>{index}.</span>{" "}
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
                              <label
                                key={choice.id}
                                className={styles.choice}
                                htmlFor={inputId}
                              >
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
                    );
                  })}
                </ol>
              </section>
            ))}

            <div className={styles.actions}>
              <p className={styles.progress}>
                {answeredCount}/{questions.length} answered
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
              {Math.round(PASS_RATIO * 100)}% to pass.
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
