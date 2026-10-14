# DynamoDB data and access patterns

All IDs in the public API remain 24-character hexadecimal strings. New user and message IDs are random; friend request and conversation IDs are a deterministic SHA-256 prefix of a sorted user pair. ID text is never used as a chronological sort key. Table names are `blinkmeet-{stage}-{lowercase logical name}` and all tables use on-demand billing. ECS task role receives table/index data permissions. Application items are encrypted at rest by DynamoDB. Production tables enable PITR, deletion protection and `RETAIN`; dev data is explicitly disposable and its tables use `DESTROY` for the deploy→destroy→redeploy cycle.

| Table | Primary key and indexes | Hot-path operations |
| --- | --- | --- |
| Users | `_id`; GSI `Recommendations` (`recommendationBucket`, `_id`) | Strong Get for principal/profile; conditional create and update; bounded recommendation queries over 16 sparse buckets |
| Emails | `normalizedEmail` | Strong Get for login; conditional Put in transaction with Users |
| FriendRequests | `_id`; GSIs `IncomingRequests` (`incomingPk`, `createdAt`) and `OutgoingRequests` (`outgoingPk`, `createdAt`) | Deterministic pair lookup; conditional pending request creation; incoming/outgoing/accepted lists by status partition |
| Friendships | (`userId`, `friendId`) | Strong Get for membership; Query by user; both directional edges created in the acceptance transaction |
| Conversations | `_id` | Deterministic participant pair Get and conditional Put |
| Messages | (`conversation`, `messageKey`); GSIs `RecipientStatus` (`recipientStatus`, `messageKey`) and `ConversationRecipientStatus` (`conversationRecipientStatus`, `messageKey`) | Query latest/older by conversation; bounded pending delivery and unseen status queries; conditional status transitions |
| MessageKeys | `lookupKey` | Strong `MSG#id` lookup and conditional `CLIENT#sender#clientMessageId` dedup pointer, committed with the message |

Signup transaction reserves normalized email with the user row. Reverse-direction friend requests map to the same request ID, so one conditional transaction wins. Accepting a request updates its status and creates both friendship edges in one transaction. Conversation creation uses a deterministic ID and conditional Put. Sending a message writes the message and lookup/dedup pointers in one transaction before emitting a Socket.IO event. Status updates require the current state; concurrent retries cannot regress `sent → delivered → seen`.

Message history queries the conversation partition in descending `messageKey` order, returns ascending messages to React, and passes an opaque base64url cursor containing the conversation and last emitted sort key. The cursor is checked against the authorized conversation. `messageKey` uses a padded timestamp plus random ID so equal-millisecond writes have a stable order.

GSI reads are eventually consistent. Strong table reads are used for principal lookup, email uniqueness, friendship membership, request acceptance, dedup pointers and message lookup. Recommendation queries read at most two pages of 40 users from each of 16 buckets, then filter self/friends. Delivery and seen queries read at most 200 indexed messages per status per call and return scoped cursors. React follows the cursors with pacing that stays below the socket event rate limits. An empty GSI page at one instant is not a permanent delivery guarantee; later message events and reconnects reconcile again.

There is no regular application `Scan`. Table item size, GSI storage, transaction write cost, hot recipient status keys and recommendation bucket skew need monitoring as usage grows. User passwords are hashed with bcrypt in the auth service and stripped from public objects.
