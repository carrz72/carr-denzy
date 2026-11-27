import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { HelpCenter } from "@/components/help-center";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Help", robots: { index: false } };

export default async function HelpPage() {
  await requireStaff();

  return (
    <>
      <PageHeader
        title="Help"
        description="How to do things in the app. Tap a question for the steps, or 'Show me how' and it points at each button for you."
        back={{ href: "/app", label: "Today" }}
      />
      <div className="mx-auto max-w-3xl">
        <HelpCenter />
      </div>
    </>
  );
}
