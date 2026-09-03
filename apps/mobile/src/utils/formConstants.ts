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

// Mirrors apps/web's FORM_CHOICE_FIELD_TYPES - the two field types that carry an `options` list
// and need at least two non-empty ones to be savable. See formBuilder.ts's canSaveForm/
// fieldsForInput, both direct ports of FormBuilder.jsx's own canSave/fieldsForInput.
export const FORM_CHOICE_FIELD_TYPES = ['single_choice', 'multi_choice'];

export function isChoiceFieldType(type: string): boolean {
	return FORM_CHOICE_FIELD_TYPES.includes(type);
}

// Insertion order here is the order FormBuilder's own type picker renders in - same order as
// apps/web's FORM_FIELD_TYPES list (constants/app.js), built from FORM_FIELD_TYPE_LABELS above
// rather than kept as a second hand-copied list.
export const FORM_FIELD_TYPE_OPTIONS: Array<{ value: string; label: string }> = Object.entries(
	FORM_FIELD_TYPE_LABELS,
).map(([value, label]) => ({ value, label }));
