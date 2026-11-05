# Nearby study transport

## Scope and status

Two-person experimental WebRTC data-channel room with manual offer/answer exchange, no STUN/TURN or internet signaling, explicit approval on both screens, selected-edition reading, discussion and permitted source-passage packages. A connection verification code binds both peer certificate fingerprints and this room's identifiers.

Physical two-device testing with internet disabled is **NOT TESTED**. Browser or mocked transport checks do not establish support for two offline phones. No automatic reconnect, mesh networking, media transport or cloud synchronization is claimed.

## Repair checkpoint

- Connection disposal cancels ICE gathering and blocked transfers, rejects late pairing results, detaches stale callbacks and emits closure once.
- Cancellation and leave controls are processed without waiting behind a transfer callback. Content messages retain validated sequence order and explicit approval checks.
- Buffer waits observe cancellation, channel closure and connection disposal; a cancellation racing a drained-buffer event cannot send another chunk.
- UI callbacks are bound to the active connection; resetting during pairing prevents late results from restoring it. Incoming cancellations discard late chunks and late source verification. Outgoing transfers do not block the incoming application queue.
- Both sender and recipient enforce display, peer sharing, redistribution, document export and offline permissions. Receipt re-resolves the exact installed source rather than trusting peer-supplied text or hashes.
- Eighteen focused protocol, source and synthetic transport tests pass. Synthetic peer/channel tests are mocked coverage, not a physical-network result.
- Actual-browser verification remains pending. This checkpoint is not a release candidate.
- Previous remote checkpoint: `9ee18257930b77aedf4525246cfe7b568af4f645`, verified on 5 November 2026 via the authenticated branch ref and `git ls-remote`.

## Physical-device acceptance still required

Use two separately identified supported devices on the same LAN with internet access disabled after downloading the app and required source content. Record browser/OS versions, network topology, explicit mutual approval, passage coordination, chat, permitted package transfer/checksum validation, cancellation, disconnect/re-pair, and inaccessible-content behavior. Keep unsupported LAN isolation or browser restrictions visible. Do not include pairing codes, local addresses or private discussion in public evidence.
