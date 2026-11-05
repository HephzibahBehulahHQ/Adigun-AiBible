# Nearby study transport

## Scope and status

Two-person experimental WebRTC data-channel room with manual offer/answer exchange, no STUN/TURN or internet signaling, explicit approval on both screens, selected-edition reading, discussion and permitted source-passage packages. A connection verification code binds both peer certificate fingerprints and this room's identifiers.

Physical two-device testing with internet disabled is **NOT TESTED**. Browser or mocked transport checks do not establish support for two offline phones. No automatic reconnect, mesh networking, media transport or cloud synchronization is claimed.

## Repair checkpoint

- Connection disposal cancels ICE gathering and blocked transfers, rejects late pairing results, detaches stale callbacks and emits closure once.
- Cancellation and leave controls are processed without waiting behind a transfer callback. Content messages retain validated sequence order and explicit approval checks.
- Buffer waits observe cancellation, channel closure and connection disposal; a cancellation racing a drained-buffer event cannot send another chunk.
- Ten focused transport state-machine tests pass with a synthetic peer/channel harness. This is mocked coverage, not a physical-network result.
- UI lifecycle/transfer repair, source-permission checks and actual-browser verification remain in progress at this checkpoint. This checkpoint is not a release candidate.

## Physical-device acceptance still required

Use two separately identified supported devices on the same LAN with internet access disabled after downloading the app and required source content. Record browser/OS versions, network topology, explicit mutual approval, passage coordination, chat, permitted package transfer/checksum validation, cancellation, disconnect/re-pair, and inaccessible-content behavior. Keep unsupported LAN isolation or browser restrictions visible. Do not include pairing codes, local addresses or private discussion in public evidence.
