# Contacts

Contacts are directional, owner-scoped records. A contact's `customName` belongs
only to the owner and never changes the target user's profile. Identifiers are
resolved through the normalized username, optional email, or normalized E.164
phone number. All list, update, and delete operations are filtered by the
authenticated owner.

Routes are mounted under `/api/v1/contacts`.
