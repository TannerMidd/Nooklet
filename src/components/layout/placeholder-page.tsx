import Link from "next/link";

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
  firstBuildSlice: readonly string[];
  relatedLinks?: readonly RelatedLink[];
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  moduleKey,
  acceptanceCriteria,
  firstBuildSlice,
  relatedLinks,
}: PlaceholderPageProps) {
  const owningModule = getDomainModule(moduleKey);

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          {eyebrow}
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            {title}
          </h1>
          <p className="text-base leading-7 text-muted">{description}</p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.95fr]">
        <Panel
          eyebrow="Acceptance anchor"
          title="Behavior this route has to preserve"
          description="The rewrite keeps product behavior while replacing the old component and API shape."
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
        <Panel eyebrow="Explicit workflows" title="Workflow phases to model next">
          <ul className="space-y-3 text-sm leading-6 text-foreground">
            {owningModule.workflows.map((item) => (
              <li key={item} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          eyebrow="Implementation slice"
          title="What belongs in the first pass"
          description="This page exists so each route can grow from a clean, explicit workflow boundary."
        >
          <ul className="space-y-3 text-sm leading-6 text-foreground">
            {firstBuildSlice.map((item) => (
              <li key={item} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {relatedLinks && relatedLinks.length > 0 ? (
        <Panel eyebrow="Related routes" title="Adjacent flows already scaffolded">
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
