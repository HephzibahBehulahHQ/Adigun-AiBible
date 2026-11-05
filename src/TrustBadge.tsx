/** This label reports metadata; it never confers or manufactures editorial approval. */
export default function TrustBadge({ status, origin = 'ai_assisted' }: { status: string; origin?: string }) {
  return <p className="trust-badge" lang="en">
    {origin === 'human' ? 'Human-authored' : 'AI-assisted'}, human review status: {status} · Comparison relationships are editor-assigned · This app does not proselytize or call for conversion.
  </p>;
}
