/** Server-only live user verification; does not trust decoded JWT/user_metadata. */
export function createSupabaseAuthenticator({ url, publishableKey, fetchImpl = fetch, requireActiveSession } = {}) {
  if (!url || !publishableKey) return undefined;
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname)) throw new TypeError('Invalid Supabase URL');
  if (!publishableKey.startsWith('sb_publishable_')) throw new TypeError('A project publishable key is required');
  // A live session lookup is required in this contract, because deleting a user
  // or revoking a session is not equivalent to merely checking JWT expiry.
  if (typeof requireActiveSession !== 'function') return undefined;
  return async (bearer, { signal }) => {
    const result = await fetchImpl(new URL('/auth/v1/user', base), {
      method: 'GET', headers: { apikey: publishableKey, Authorization: `Bearer ${bearer}` },
      signal, redirect: 'error', cache: 'no-store',
    });
    if (!result.ok) return null;
    const user = await result.json();
    if (typeof user.id !== 'string' || user.is_anonymous !== false || user.banned_until && Date.parse(user.banned_until) > Date.now()) return null;
    // This server adapter must verify the JWT issuer/signature/session_id with
    // the project's current Auth configuration, and look up the active session
    // for THIS user. It must not trust a session/user ID supplied in a body.
    if (await requireActiveSession({ bearer, userId: user.id, signal }) !== true) return null;
    return { userId: user.id, isAnonymous: false };
  };
}
