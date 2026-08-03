import type { Metadata } from "next";

import { CertificatePage } from "@/views/CertificatePage";

export const metadata: Metadata = {
  title: "Certificate · reqlan",
  description: "reqlan tutorial assessment certificate",
};

export default function Page() {
  return <CertificatePage />;
}
