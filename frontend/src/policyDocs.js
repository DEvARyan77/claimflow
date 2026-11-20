const same = (a, b) => Boolean(a && b) && a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * The documents this patient should see:
 *  - their own uploaded policy (matched by policy number), if they have one
 *  - otherwise the sample policy, so they can still try the assistant
 * Other patients' policies are never shown.
 */
export function documentsFor(documents, patient) {
  if (!documents?.length) return [];
  const own = documents.filter((d) => !d.sample && same(d.policyNumber, patient?.policyNumber));
  if (own.length) return own;
  return documents.filter((d) => d.sample);
}

/** The newest of the patient's own policies, otherwise the sample. */
export function defaultDocumentFor(documents, patient) {
  const visible = documentsFor(documents, patient);
  return [...visible].sort((a, b) => String(b.uploadedAt ?? '').localeCompare(String(a.uploadedAt ?? '')))[0] ?? null;
}
