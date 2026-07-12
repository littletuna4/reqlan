import { RqTip } from "@/components/RqTip";
import { tokenizeRq, type RqTokenType } from "@/lib/rq-highlight";
import { cn } from "@/lib/utils";
import styles from "./RqCode.module.css";

type RqCodeProps = {
  code: string;
  className?: string;
};

const tokenStyles: Partial<Record<RqTokenType, string>> = {
  comment: styles.comment,
  keyword: styles.keyword,
  string: styles.string,
  attribute: styles.attribute,
  ref: styles.ref,
  "file-ref": styles.fileRef,
  idea: styles.idea,
  body: styles.body,
  brace: styles.brace,
  punctuation: styles.punctuation,
  diagram: styles.diagram,
};

function tokenClassName(type: RqTokenType, hasTooltip: boolean): string {
  return cn(tokenStyles[type], hasTooltip && styles.tip);
}

export function RqCode({ code, className }: RqCodeProps) {
  const tokens = tokenizeRq(code);
  const preClass = cn(styles.block, className);

  return (
    <pre className={preClass}>
      <code className={styles.code}>
        {tokens.map((token, index) => {
          const classNameForToken = tokenClassName(token.type, Boolean(token.tooltip));

          if (token.tooltip) {
            return (
              <RqTip
                key={index}
                className={classNameForToken}
                tip={token.tooltip}
              >
                {token.text}
              </RqTip>
            );
          }

          return (
            <span key={index} className={classNameForToken}>
              {token.text}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
