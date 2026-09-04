/** Canonical paths and query params for tutorial certification. */
// rq:["../../../reqlan rq/site/certs.rq".certs]
// rq:["../../../reqlan rq/site/certs.rq".assessment_page]
// rq:["../../../reqlan rq/site/certs.rq".certificate_page]

export const CERTS_ASSESSMENT_PATH = "/certs/assessment";
export const CERTS_CERTIFICATE_PATH = "/certs/certificate";

export function assessmentPath(id?: string): string {
  if (id === undefined || id === "") {
    return `${CERTS_ASSESSMENT_PATH}/`;
  }
  return `${CERTS_ASSESSMENT_PATH}/${id}/`;
}

/** Catalog when multiple quizzes; sole quiz path when there is only one. */
export function assessmentsEntryPath(
  assessments: readonly { id: string }[],
): string {
  if (assessments.length === 1) {
    return assessmentPath(assessments[0]!.id);
  }
  return assessmentPath();
}

export const CERTIFICATE_TOKEN_PARAM = "c";
export const CERTIFICATE_JUST_COMPLETED_PARAM = "just";
export const CERTIFICATE_JUST_COMPLETED_VALUE = "1";

export type CertificatePathOptions = {
  justCompleted?: boolean;
};

export function certificatePath(
  token: string,
  options: CertificatePathOptions = {},
): string {
  const params = new URLSearchParams();
  params.set(CERTIFICATE_TOKEN_PARAM, token);
  if (options.justCompleted) {
    params.set(
      CERTIFICATE_JUST_COMPLETED_PARAM,
      CERTIFICATE_JUST_COMPLETED_VALUE,
    );
  }
  return `${CERTS_CERTIFICATE_PATH}/?${params.toString()}`;
}

export function isJustCompletedParam(value: string | null): boolean {
  return value === CERTIFICATE_JUST_COMPLETED_VALUE;
}
