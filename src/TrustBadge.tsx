/** This label reports metadata; it never confers or manufactures editorial approval. */
export default function TrustBadge({ status, origin }: { status: string; origin?: string }) {
  return <p className="trust-badge" lang="en">
    {origin === 'human_authored' ? 'Human-authored' : origin === 'ai_assisted' ? 'AI-assisted' : 'AI-assisted application'}, human review status: {status} · Comparison relationships are editor-assigned · This app does not proselytize or call for conversion.
  </p>;
}
