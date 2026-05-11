const systemTransactionNotePlaceholders = new Set([
  "Auto matched by target rent amount.",
  "Auto matched by target rent amount",
  "Marked as ignored.",
  "Marked as ignored",
  "Marked as expense.",
  "Marked as expense",
  "Marked as not rental income.",
  "Marked as not rental income",
  "Marked as rental income.",
  "Marked as rental income",
  "Needs expense review.",
  "Needs expense review",
  "Needs rent review.",
  "Needs rent review"
]);

export function normalizeTransactionNote(
  note: string | null | undefined
): string | null {
  const trimmedNote = note?.trim();

  if (
    !trimmedNote ||
    systemTransactionNotePlaceholders.has(trimmedNote) ||
    trimmedNote.startsWith("Classified by rule:")
  ) {
    return null;
  }

  return trimmedNote;
}

export function getTransactionNoteCsvValue(
  note: string | null | undefined
): string {
  return normalizeTransactionNote(note) ?? "";
}
