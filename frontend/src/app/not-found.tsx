import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <p className="text-5xl font-bold text-edge-strong mb-4">404</p>
      <p className="text-sm text-ink-secondary mb-6">Page not found.</p>
      <Link href="/" className="text-sm font-medium text-accent hover:underline">
        Back to Feed
      </Link>
    </div>
  );
}
