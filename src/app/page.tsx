import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import {
  architecturalRules,
  documentationSources,
  implementationOrder,
} from "@/config/project-principles";
import {
  navigationGroups,
  publicEntryPoints,
  type NavigationItem,
} from "@/config/navigation";
import { domainModules } from "@/modules/registry";

const routeCards = navigationGroups.flatMap(
  (group): NavigationItem[] => [...group.items],
);

export default function HomePage() {
  return (
    <main className="px-6 py-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="grid gap-6 xl:grid-cols-[1.2fr,0.95fr]">
          <div className="rounded-[36px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8 md:py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-accent">
              Clean restart
            </p>
            <div className="mt-5 max-w-3xl space-y-4">
              <h1 className="font-heading text-5xl leading-[0.95] text-foreground md:text-7xl">
                Build the rewrite around workflows, not screens.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted md:text-lg">
                This scaffold starts from the ADR and behavior matrix, not from
                the previous component tree. Each route exists to grow into an
                explicit module-owned workflow.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {publicEntryPoints.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[28px] border border-line/70 bg-panel-strong/70 px-5 py-5 transition hover:border-accent/40 hover:bg-panel"
                >
                  <p className="font-heading text-2xl text-foreground">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
                </Link>
              ))}
            </div>
          </div>

          <Panel
            eyebrow="Source documents"
            title="Repo rules that are already locked"
            description="These documents are the implementation baseline for every module and route that follows."
            className="h-full"
          >
            <div className="space-y-3">
              {documentationSources.map((source) => (
                <div
                  key={source}
                  className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3 font-mono text-xs text-foreground"
                >
                  {source}
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel
            eyebrow="Route surface"
            title="Phase 1 flows scaffolded now"
            description="Routes are separated by user task so orchestration does not collapse into one root component."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {routeCards.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 transition hover:border-accent/40 hover:bg-panel"
                >
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="mt-2 text-sm leading-5 text-muted">{item.description}</p>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel
            eyebrow="Rewrite rules"
            title="Guardrails carried straight from the ADR"
            description="These are the constraints that keep the rewrite maintainable as behavior is rebuilt."
          >
            <ul className="space-y-3 text-sm leading-6 text-foreground">
              {architecturalRules.map((rule) => (
                <li key={rule} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                  {rule}
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        <Panel
          eyebrow="Domain modules"
          title="Ownership stays with the module, not with the page"
          description="Every behavior in the matrix maps to one of these modules. The routes are only the surface layer."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {domainModules.map((domainModule) => (
              <div
                key={domainModule.key}
                className="rounded-[28px] border border-line/70 bg-panel-strong/70 px-5 py-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
                  {domainModule.key}
                </p>
                <h2 className="mt-3 font-heading text-2xl text-foreground">
                  {domainModule.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {domainModule.summary}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          eyebrow="Implementation order"
          title="What happens after the scaffold"
          description="The next slices follow the ADR order so the data model and workflow seams land before provider-specific UI logic."
        >
          <ol className="grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2">
            {implementationOrder.map((item, index) => (
              <li key={item} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4">
                <span className="font-semibold text-accent">0{index + 1}</span>
                <p className="mt-2">{item}</p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </main>
  );
}
