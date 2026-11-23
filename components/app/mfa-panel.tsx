"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

type Factor = { id: string; friendly_name?: string; status: string };

/** TOTP enrollment and step-up to AAL2 via Supabase Auth MFA. Privileged RPCs require AAL2. */
export function MfaPanel({ next }: { next?: string } = {}) {
  const supabase = createClient();
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [aal, setAal] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: f }, { data: a }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
    setFactors((f?.totp ?? []) as Factor[]);
    setAal(a?.currentLevel ?? null);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  const verified = factors.find((f) => f.status === "verified");

  async function enroll() {
    setBusy(true); setMsg(null);
    // Clear abandoned, unverified factors first so enrollment can be retried.
    for (const f of factors.filter((x) => x.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `ALUMS ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) return setMsg({ tone: "error", text: "Could not start enrollment. Is MFA enabled for this Supabase project?" });
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(factorId: string) {
    if (!/^\d{6}$/.test(code)) return setMsg({ tone: "error", text: "Enter the 6-digit code from your authenticator app." });
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false); setCode("");
    if (error) return setMsg({ tone: "error", text: "That code didn't work. Check your device clock and try again." });
    setEnrolling(null); setMsg({ tone: "ok", text: next ? "Verified. Taking you back…" : "Verified. Privileged actions are unlocked for this session." });
    await load();
    if (next) router.push(next); else router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Session assurance:</span>
        {aal === "aal2" ? <Badge tone="success">MFA verified (AAL2)</Badge> : <Badge tone="warning">Password only (AAL1)</Badge>}
        {verified ? <Badge tone="success">Authenticator enrolled</Badge> : <Badge>No authenticator</Badge>}
      </div>
      {enrolling ? (
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolling.qr} alt="QR code to add ALUMS to your authenticator app" className="h-44 w-44 rounded-xl bg-white p-2" />
          <div className="grid content-start gap-3">
            <p className="text-sm">Scan with an authenticator app, or enter this key: <code className="break-all rounded bg-surface-2 px-1.5 py-0.5 text-xs">{enrolling.secret}</code></p>
            <label className="grid gap-1.5 text-sm font-semibold">6-digit code<Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.trim())} /></label>
            <div><Button onClick={() => verify(enrolling.id)} disabled={busy}>Verify and enable</Button></div>
          </div>
        </div>
      ) : verified && aal !== "aal2" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-1.5 text-sm font-semibold">Code from your authenticator<Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.trim())} /></label>
          <Button onClick={() => verify(verified.id)} disabled={busy}>Verify this session</Button>
        </div>
      ) : !verified ? (
        <div><Button onClick={enroll} disabled={busy}>Set up authenticator app</Button></div>
      ) : null}
      <p aria-live="polite" className={msg?.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}>{msg?.text}</p>
    </div>
  );
}
