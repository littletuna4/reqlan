// rq:["../../../../reqlan rq/site/site.rq".interlock_showcase]
// rq:["../../../../reqlan rq/language/syntax.rq".reference_file]
// rq:["../../../../reqlan rq/language/syntax.rq".comment_reference]
import type { Showcase } from "./types";

export const interlockShowcase = {
  id: "interlock",
  title: "The interlock that must not fail",
  summary:
    "A safety requirement bound to ST by line range, to a test by name, and back by an rq: comment.",
  tags: ["industrial", "safety", "sequencing"],
  mechanism: "symbol · line · test anchors",
  domain: "Industrial control",
  tier: "flagship",
  blocks: [
    {
      kind: "callout",
      text: "One name - EmergencyStop - from requirement to PLC to proof.",
    },
    {
      language: "rq",
      label: "safety/interlock.rq",
      code: `EmergencyStop {
  E-stop must drop heater enable within one scan
  valve must close before heater enables
  pressure must reach setpoint before valve opens
  implemented in ["./plc/interlock.st".EmergencyStop]
  proven by ["./plc/interlock.test.ts:drops heater within one scan"]
  @status verified
  @tags (
      iec-61131
      critical
      safety
  )
}

safety_interlock {
  guards [EmergencyStop] on every phase transition
  @status verified
}`,
    },
    {
      language: "st",
      label: "plc/interlock.st",
      code: `(* rq:["../safety/interlock.rq".EmergencyStop] *)
FUNCTION_BLOCK EmergencyStop
VAR_INPUT
  Estop_NC : BOOL;
END_VAR
VAR_OUTPUT
  HeaterEnable : BOOL;
  ValveOpen    : BOOL;
END_VAR

HeaterEnable := Estop_NC AND NOT ValveOpen;
ValveOpen    := Estop_NC AND PressureOk;
END_FUNCTION_BLOCK`,
    },
    {
      language: "ts",
      label: "plc/interlock.test.ts",
      code: `test("drops heater within one scan", () => {
  const fb = new EmergencyStop();
  fb.Estop_NC = false;
  fb.cycle();
  expect(fb.HeaterEnable).toBe(false);
});`,
    },
    {
      kind: "diagram",
      label: "trace",
      content: `EmergencyStop
  ├── ["./plc/interlock.st".EmergencyStop]
  ├── ["./plc/interlock.test.ts:drops heater within one scan"]
  └── rq: comment in ST → back to the idea`,
    },
  ],
} satisfies Showcase;
