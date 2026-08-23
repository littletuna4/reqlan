// rq:["../../../../reqlan rq/site/site.rq".firmware_cloud_contract_showcase]
// rq:["../../../../reqlan rq/language/syntax.rq".reference_file]
// rq:["../../../../reqlan rq/reference_types.rq".file_reference]
import type { Showcase } from "./types";

export const firmwareCloudShowcase = {
  id: "firmware-cloud",
  title: "Firmware meets the cloud",
  summary:
    "10 Hz on the device, 50 ms on the ingest path - one invariant neither codebase can hold alone.",
  tags: ["integration", "cross-stack", "embedded"],
  mechanism: "cross-stack file refs",
  domain: "Embedded ↔ backend",
  tier: "flagship",
  blocks: [
    {
      kind: "callout",
      text: "The contract lives in .rq because C and TypeScript cannot see each other.",
    },
    {
      language: "rq",
      label: "contracts/ingest.rq",
      code: `sensor_sample_rate {
  device samples at 10 Hz
  implemented in ["./firmware/adc.c".sample_loop]
  @tags (
      firmware
      timing
  )
}

api_ingest {
  backend must accept a burst within 50 ms
  implemented in ["./api/ingest.ts".ingestBatch]
  aligns with [sensor_sample_rate]
  @tags (
      backend
      sla
  )
}

ingest_contract (
  sensor_sample_rate,
  api_ingest
)`,
    },
    {
      language: "c",
      label: "firmware/adc.c",
      // rq-ignore-error
      code: `/* rq:["../contracts/ingest.rq".sensor_sample_rate] */
void sample_loop(void) {
  const uint32_t period_ms = 100; /* 10 Hz */
  for (;;) {
      adc_read(&sample);
      queue_push(&sample);
      sleep_ms(period_ms);
  }
}`,
    },
    {
      language: "ts",
      label: "api/ingest.ts",
      // rq-ignore-error
      code: `// rq:["../contracts/ingest.rq".api_ingest]
export async function ingestBatch(events: Event[]) {
  const deadline = Date.now() + 50;
  await queue.push(events, { deadline });
}`,
    },
    {
      kind: "features",
      label: "in the editor",
      items: [
        "Inbound @referenced-by inlay on sample_loop and ingestBatch",
        "Go-to-definition from either side into the shared .rq idea",
        "Local graph centered on ingest_contract shows both stacks",
      ],
    },
  ],
} satisfies Showcase;
