import { ButtonLink } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main id="main" className="container grid min-h-[70dvh] place-items-center py-20 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-3xl font-extrabold">We couldn't find that page</h1>
        <p className="mt-2 text-muted">It may have moved, or you may not have access to it.</p>
        <ButtonLink href="/" className="mt-6">Back to ALUMS</ButtonLink>
      </div>
    </main>
  );
}
