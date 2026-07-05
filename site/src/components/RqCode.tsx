"use client";

import { RqTip } from "@/components/RqTip";
import { tokenizeRq } from "@/lib/rq-highlight";

type RqCodeProps = {
  code: string;
  className?: string;
};

export function RqCode({ code, className }: RqCodeProps) {
  const tokens = tokenizeRq(code);
  const preClass = className ? `${className} rq-block` : "rq-block";

  return (
    <pre className={preClass}>
      <code className="rq-code">
        {tokens.map((token, index) => {
          const tokenClassName = `rq-${token.type}${token.tooltip ? " rq-tip" : ""}`;

          if (token.tooltip) {
            return (
              <RqTip
                key={index}
                className={tokenClassName}
                tip={token.tooltip}
              >
                {token.text}
              </RqTip>
            );
          }

          return (
            <span key={index} className={tokenClassName}>
              {token.text}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
