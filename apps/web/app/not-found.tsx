import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-prose py-10">
      <p className="kicker">Not found</p>
      <h1 className="mt-2 text-2xl md:text-3xl">There’s no page at this address</h1>
      <p className="mt-3 text-ink-muted">
        It may have moved, or the link may be mistyped. <Link href="/">Go to the front page</Link>.
      </p>
    </div>
  );
}
