// Direct port of the two relevant apps/web constants/app.js lists (FORM_STATUSES,
// FORM_FIELD_TYPES) as plain label maps - same "build the map directly, don't port
// prettyConstantsListValue" reasoning utils/projectStatus.ts's own header comment gives (that
// helper compares uppercase VALUE/LABEL against these constants' actual lowercase value/label
// fields, so it always returns '' - a real, silent web bug, flagged in DECISIONS.md's Open
// section, deliberately not replicated here).

export const FORM_STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	published: 'Published',
	archived: 'Archived',
};

export function formStatusLabel(status: string): string {
	return FORM_STATUS_LABELS[status] ?? status;
}

export const FORM_FIELD_TYPE_LABELS: Record<string, string> = {
	short_text: 'Short answer',
	paragraph: 'Paragraph',
	single_choice: 'Single choice',
	multi_choice: 'Multiple choice',
	date: 'Date',
	file_upload: 'File upload',
	signature: 'Signature (typed)',
};

export function formFieldTypeLabel(type: string): string {
	return FORM_FIELD_TYPE_LABELS[type] ?? type;
}
