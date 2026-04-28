import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getDomainModule, type DomainModuleKey } from "@/modules/registry";

type RelatedLink = {
  href: string;
  label: string;
  description: string;
};

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  moduleKey: DomainModuleKey;
  acceptanceCriteria: readonly string[];
  firstBuildMilestone: readonly string[];
  relatedLinks?: readonly RelatedLink[];
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  moduleKey,
  acceptanceCriteria,
  firstBuildMilestone,
  relatedLinks,
}: PlaceholderPageProps) {
  const owningModule = getDomainModule(moduleKey);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.95fr]">
        <Panel
          eyebrow="Key behaviors"
          title="What this route needs to support"
          description="Use this checklist to keep unfinished screens aligned with the product behavior already defined elsewhere in the app."
        >
          <ul className="space-y-3 text-sm leading-6 text-foreground">
            {acceptanceCriteria.map((item) => (
              <li key={item} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          eyebrow="Owning module"
          title={owningModule.title}
          description={owningModule.summary}
        >
          <ul className="space-y-3 text-sm leading-6 text-foreground">
            {owningModule.responsibilities.map((item) => (
              <li key={item} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel eyebrow="Core workflows" title="What this area still needs">
          <ul className="space-y-3 text-sm leading-6 text-foreground">
            {owningModule.workflows.map((item) => (
              <li key={item} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          eyebrow="Next milestone"
          title="What to build next"
          description="This screen is not finished yet. These are the first product capabilities that belong here when development resumes."
        >
          <ul className="space-y-3 text-sm leading-6 text-foreground">
            {firstBuildMilestone.map((item) => (
              <li key={item} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {relatedLinks && relatedLinks.length > 0 ? (
        <Panel eyebrow="Related routes" title="Other areas to reference">
          <div className="grid gap-4 md:grid-cols-2">
            {relatedLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 transition hover:border-accent/40 hover:bg-panel"
              >
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="mt-1 text-sm leading-5 text-muted">{item.description}</p>
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
