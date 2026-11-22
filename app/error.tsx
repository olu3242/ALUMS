"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="container grid min-h-[60dvh] place-items-center py-20 text-center">
      <div>
        <h1 className="text-2xl font-extrabold">Something went wrong</h1>
        <p className="mt-2 text-muted">The error has been logged. Please try again.</p>
        <button onClick={reset} className="mt-6 h-11 rounded-xl bg-primary px-5 font-semibold text-primary-fg">Try again</button>
      </div>
    </main>
  );
}
