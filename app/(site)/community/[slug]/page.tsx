import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isBackendConfigured } from "@/lib/env";
import { getUser } from "@/lib/session";
import { applyForMembership, switchCommunity } from "@/lib/actions/membership";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { BackendNotice, Notice } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import type { Community } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!isBackendConfigured() || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { data } = await (await createClient()).from("class_communities")
    .select("id, slug, name, department_name, graduation_year, institution_id, status, is_founding, description, institutions(name, status)")
    .eq("slug", slug).maybeSingle<Community>();
  return data;
}

export async function generateMetadata({ params }: Params) {
  const c = await load((await params).slug);
  return { title: c?.name ?? "Community" };
}

export default async function CommunityPage({ params }: Params) {
  const { slug } = await params;
  if (!isBackendConfigured()) return <div className="container py-16"><BackendNotice /></div>;
  const c = await load(slug);
  if (!c) notFound();
  const user = await getUser();
  let membership: { status: string } | null = null;
  let request: { status: string; created_at: string } | null = null;
  if (user) {
    const supabase = await createClient();
    const [m, r] = await Promise.all([
      supabase.from("memberships").select("status").eq("community_id", c.id).eq("user_id", user.id).maybeSingle(),
      supabase.from("membership_requests").select("status, created_at").eq("community_id", c.id).eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    membership = m.data; request = r.data;
  }
  const institution = c.institutions?.status === "verified" ? c.institutions.name : null;

  return (
    <>
      <section className="hero-surface py-16 text-white sm:py-20">
        <div className="container">
          <div className="flex flex-wrap gap-2">
            {c.is_founding && <Badge tone="accent" className="bg-transparent text-champagne">Founding community</Badge>}
            {c.status !== "active" && <StatusBadge status={c.status} />}
          </div>
          <h1 className="mt-4 font-serif text-4xl font-normal sm:text-6xl">{c.name}</h1>
          <p className="mt-3 text-lg text-[#D6DEE9]">{c.department_name} · Class of {c.graduation_year} · {institution ?? "Institution pending confirmation"}</p>
        </div>
      </section>
      <section className="container grid gap-10 py-14 lg:grid-cols-[1fr_420px]">
        <div>
          <h2 className="text-xl font-bold">About this class</h2>
          <p className="mt-3 max-w-prose text-muted">{c.description ?? "This class community hasn't added a description yet."}</p>
          <h2 className="mt-10 text-xl font-bold">Members only</h2>
          <p className="mt-3 max-w-prose text-muted">
            The directory, businesses, events, gallery and announcements are visible only to verified members. Class leaders review every
            request; you'll be notified as soon as yours is decided.
          </p>
        </div>
        <aside className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          {!user ? (
            <>
              <h2 className="text-lg font-bold">Is this your class?</h2>
              <p className="mt-2 text-sm text-muted">Create an account and verify your email to apply for membership.</p>
              <div className="mt-5 grid gap-2">
                <ButtonLink href={`/register?next=/community/${c.slug}`}>Apply for membership</ButtonLink>
                <ButtonLink href={`/sign-in?next=/community/${c.slug}`} variant="secondary">I already have an account</ButtonLink>
              </div>
            </>
          ) : membership?.status === "active" ? (
            <>
              <Badge tone="success">Verified member</Badge>
              <form action={switchCommunity} className="mt-4">
                <input type="hidden" name="community_id" value={c.id} />
                <SubmitButton className="w-full">Open community dashboard</SubmitButton>
              </form>
            </>
          ) : membership?.status === "suspended" ? (
            <Notice tone="warning">Your membership in this community is suspended. Contact the class leaders.</Notice>
          ) : request?.status === "pending" ? (
            <>
              <h2 className="text-lg font-bold">Request under review</h2>
              <p className="mt-2 text-sm text-muted">Sent {new Date(request.created_at).toUTCString().slice(5, 16)}. Track it in <Link href="/app/my-classes" className="text-accent-text underline">My classes</Link>.</p>
            </>
          ) : c.status !== "active" ? (
            <Notice>This community isn't accepting members yet.</Notice>
          ) : (
            <>
              <h2 className="text-lg font-bold">Apply for membership</h2>
              {request?.status === "rejected" && <div className="mt-3"><Notice tone="warning">A previous request was not approved. You may apply again with more detail.</Notice></div>}
              <ActionForm action={applyForMembership} className="mt-4 grid gap-4">
                <input type="hidden" name="community_id" value={c.id} />
                <Field label="Your name at graduation" htmlFor="nag" hint="Helps leaders match you to the class list.">
                  <Input id="nag" name="name_at_graduation" required minLength={2} maxLength={160} />
                </Field>
                <Field label="Student / matriculation number (optional)" htmlFor="sid" hint="Only visible to class leaders reviewing your request.">
                  <Input id="sid" name="student_identifier" maxLength={64} />
                </Field>
                <Field label="Anything classmates would remember? (optional)" htmlFor="note"><Textarea id="note" name="note" maxLength={1000} /></Field>
                <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
              </ActionForm>
            </>
          )}
        </aside>
      </section>
    </>
  );
}
