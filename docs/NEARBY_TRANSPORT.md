# Nearby study transport

## Scope and status

Two-person experimental WebRTC data-channel room with manual offer/answer exchange, no STUN/TURN or internet signaling, explicit approval on both screens, selected-edition reading, discussion and permitted source-passage packages. A connection verification code binds both peer certificate fingerprints and this room's identifiers.

Physical two-device testing with internet disabled is **NOT TESTED**. Browser or mocked transport checks do not establish support for two offline phones. No automatic reconnect, mesh networking, media transport or cloud synchronization is claimed.

## Implemented repair and verification

- Connection disposal cancels ICE gathering and blocked transfers, rejects late pairing results, detaches stale callbacks and emits closure once.
- Cancellation and leave controls are processed without waiting behind a transfer callback. Content messages retain validated sequence order and explicit approval checks.
- Buffer waits observe cancellation, channel closure and connection disposal; a cancellation racing a drained-buffer event cannot send another chunk.
- UI callbacks are bound to the active connection; resetting during pairing prevents late results from restoring it. Incoming cancellations discard late chunks and late source verification. Outgoing transfers do not block the incoming application queue.
- Both sender and recipient enforce display, peer sharing, redistribution, document export and offline permissions. Receipt re-resolves the exact installed source rather than trusting peer-supplied text or hashes.
- Eighteen focused protocol, source and synthetic transport tests pass. Synthetic peer/channel tests are mocked coverage, not a physical-network result.
- TypeScript, scoped ESLint and `git diff --check` pass for the repair.
- Six Playwright cases are collected across desktop and mobile: real two-page RTC consent/chat/navigation/package/re-pair flows, delayed-pairing disposal, and unsupported 320px fallback. `playwright test --list` passes; browser execution is **NOT TESTED locally** because the Chromium installer returned an invalid archive. Run these in the existing GitHub Actions browser gate before release.
- The real-page RTC case uses host-network candidates without STUN/TURN and must fail honestly if the CI browser cannot establish that connection. It does not simulate a relay or prove two-device offline support.
- Previous remote checkpoint: `4855a7d56efeb2e1788e80be907240fd8fc53f5c`, verified on 5 November 2026 through the authenticated GitHub branch-ref read. Complete integrated release checks and publication remain the integration owner’s responsibility.

## Physical-device acceptance still required

Use two separately identified supported devices on the same LAN with internet access disabled after downloading the app and required source content. Record browser/OS versions, network topology, explicit mutual approval, passage coordination, chat, permitted package transfer/checksum validation, cancellation, disconnect/re-pair, and inaccessible-content behavior. Keep unsupported LAN isolation or browser restrictions visible. Do not include pairing codes, local addresses or private discussion in public evidence.
