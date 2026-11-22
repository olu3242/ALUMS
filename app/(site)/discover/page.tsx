import Link from "next/link";
import { ClassFinder } from "@/components/site/class-finder";
import { CommunityCard } from "@/components/site/community-card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/form";
import { BackendNotice, EmptyState, Notice } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { requestCommunity } from "@/lib/actions/membership";
import { searchCommunities } from "@/lib/queries/public";
import { getUser } from "@/lib/session";
import { finderSchema } from "@/lib/validation";

export const metadata = { title: "Discover your class" };

export default async function Discover({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  const parsed = finderSchema.safeParse(raw);
  const q = parsed.success ? parsed.data : { institution: "", department: "", year: undefined };
  const searched = Boolean(q.institution || q.department || q.year);
  const [{ hits, error }, user] = await Promise.all([searchCommunities(q), getUser()]);

  return (
    <div className="container py-14">
      <p className="eyebrow">Discover</p>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Find my class</h1>
      <p className="mt-2 max-w-2xl text-muted">Search by institution, department and graduation year. Only verified, active class communities are listed.</p>
      <ClassFinder className="mt-8" defaults={{ institution: q.institution, department: q.department, year: q.year }} />
      {!parsed.success && <p role="alert" className="mt-3 text-sm text-danger">Enter a valid four-digit graduation year.</p>}

      <section aria-labelledby="results" className="mt-12">
        <h2 id="results" className="text-xl font-bold">{searched ? "Matching communities" : "Active communities"}</h2>
        {error === "not-configured" ? <div className="mt-4"><BackendNotice /></div> : error === "failed" ? (
          <div className="mt-4"><Notice tone="warning">Class search is temporarily unavailable. Please try again shortly.</Notice></div>
        ) : hits.length > 0 ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{hits.map((c) => <CommunityCard key={c.id} c={c} />)}</div>
        ) : (
          <div className="mt-5">
            <EmptyState title={searched ? "No registered community matches yet" : "No communities yet"}
              action={<ButtonLink href="#request" variant="secondary">Request this class</ButtonLink>}>
              You can request that this class be created. The ALUMS team will verify it and invite a class leader.
            </EmptyState>
          </div>
        )}
      </section>

      <section id="request" aria-labelledby="request-title" className="mt-16 scroll-mt-24 rounded-3xl border border-line bg-surface-2 p-6 sm:p-10">
        <h2 id="request-title" className="text-2xl font-extrabold">Request a missing community</h2>
        <p className="mt-2 max-w-2xl text-muted">Tell us which class you belong to. Requests are reviewed by the ALUMS team — nothing is created automatically.</p>
        {user ? (
          <ActionForm action={requestCommunity} resetOnSuccess className="mt-6 grid gap-4 md:grid-cols-3">
            <Field label="Institution" htmlFor="rq-i"><Input id="rq-i" name="institution_name" required defaultValue={q.institution} /></Field>
            <Field label="Department / course" htmlFor="rq-d"><Input id="rq-d" name="department_name" required defaultValue={q.department} /></Field>
            <Field label="Graduation year" htmlFor="rq-y"><Input id="rq-y" name="graduation_year" required inputMode="numeric" pattern="[0-9]{4}" defaultValue={q.year} /></Field>
            <Field label="Anything that helps us verify (optional)" htmlFor="rq-n" className="md:col-span-3"><Textarea id="rq-n" name="note" maxLength={1000} /></Field>
            <div className="md:col-span-3"><SubmitButton pendingLabel="Sending…">Send request</SubmitButton></div>
          </ActionForm>
        ) : (
          <p className="mt-5"><Link href="/sign-in?next=/discover%23request" className="font-semibold text-accent-text hover:underline">Sign in</Link> or{" "}
            <Link href="/register?next=/discover%23request" className="font-semibold text-accent-text hover:underline">create an account</Link> to request a class community.</p>
        )}
      </section>
    </div>
  );
}
