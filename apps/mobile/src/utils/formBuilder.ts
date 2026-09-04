import { isChoiceFieldType } from '@/utils/formConstants';

/**
 * Pure field-editing logic for the mobile FormBuilder (form/[id].tsx) - a direct port of apps/
 * web's FormBuilder.jsx newField/fieldFromServer/canSave/fieldsForInput, minus the drag-and-drop
 * reorder handler (handleDragEnd/arrayMove), which moveField below replaces.
 *
 * REORDER SUBSTITUTE: web reorders fields via @dnd-kit's pointer/keyboard drag-and-drop
 * (FormFieldEditorRow.jsx's drag handle). No cross-platform drag primitive exists anywhere in
 * this app - the same gap DurationPicker.tsx's own header comment names for select dropdowns,
 * solved there with a pill row instead. Here the substitute is a pair of Up/Down move buttons per
 * field row (form/[id].tsx) - moveField is the pure array move they call, clamped rather than
 * wrapping, since "move the first field up" has no sensible destination unlike a drag gesture
 * that simply can't be dropped above the top.
 */

export type LocalFormField = {
	_localId: string;
	key?: string | null;
	type: string;
	label: string;
	helpText: string;
	required: boolean;
	options: string[];
};

// Server-shape fields as GetFormForEditQuery/GetFormForEditQuery['getForm']['fields'][number]
// actually returns them - kept as its own loose type rather than importing the generated one here,
// since only these five properties are ever read.
export type ServerFormField = {
	key?: string | null;
	type: string;
	label: string;
	helpText?: string | null;
	required?: boolean | null;
	options?: string[] | null;
};

let localIdCounter = 0;

// Purely a React list key + Up/Down/Remove handle - NEVER sent to the server. Matches web's own
// `new-${Math.random().toString(36).slice(2)}` in spirit (unique, obviously-not-a-real-key), but
// uses an incrementing counter instead of Math.random so it's deterministic in tests.
export function newLocalField(): LocalFormField {
	localIdCounter += 1;
	return {
		_localId: `new-${localIdCounter}`,
		key: undefined,
		type: 'short_text',
		label: '',
		helpText: '',
		required: false,
		options: [],
	};
}

export function localFieldFromServer(field: ServerFormField): LocalFormField {
	return {
		_localId: field.key ?? '',
		key: field.key ?? undefined,
		type: field.type,
		label: field.label,
		helpText: field.helpText ?? '',
		required: Boolean(field.required),
		options: field.options ?? [],
	};
}

// Direct port of FormBuilder.jsx's canSave.
export function canSaveForm(title: string, fields: LocalFormField[]): boolean {
	if (title.trim().length === 0 || fields.length === 0) {
		return false;
	}
	return fields.every((f) => f.label.trim().length > 0) && fields.every(fieldHasEnoughOptions);
}

function fieldHasEnoughOptions(field: LocalFormField): boolean {
	if (!isChoiceFieldType(field.type)) {
		return true;
	}
	return field.options.filter((o) => o.trim().length > 0).length >= 2;
}

// A single field's own version of the check above - form/[id].tsx uses this to show the same
// "needs at least two options" notice FormFieldEditorRow.jsx shows inline, per choice field.
export function fieldNeedsMoreOptions(field: LocalFormField): boolean {
	return isChoiceFieldType(field.type) && !fieldHasEnoughOptions(field);
}

// Direct port of FormBuilder.jsx's fieldsForInput - the FormFieldInput[] shape createForm/
// updateForm expect. `key` is omitted entirely for a brand-new field (never sent as undefined
// inside an object literal either) so the server always treats it as absent, not explicitly null.
export function fieldsForInput(fields: LocalFormField[]) {
	return fields.map((f) => ({
		...(f.key ? { key: f.key } : {}),
		type: f.type,
		label: f.label.trim(),
		helpText: f.helpText || '',
		required: Boolean(f.required),
		options: isChoiceFieldType(f.type) ? f.options.map((o) => o.trim()).filter(Boolean) : [],
	}));
}

// Clamped move-by-one - moving the first field up or the last field down is a no-op (returns the
// same array reference) rather than wrapping around, since there's no drag gesture here to simply
// refuse the way dropping above the list's top would.
// Generic over T (not just LocalFormField) since X54 reuses this exact swap for
// form-booking-fields/[id].tsx's fixed seven-field array, which has its own narrower shape - the
// reorder logic itself has nothing to do with what a field looks like.
export function moveField<T>(fields: T[], index: number, direction: 'up' | 'down'): T[] {
	const targetIndex = direction === 'up' ? index - 1 : index + 1;
	if (index < 0 || index >= fields.length || targetIndex < 0 || targetIndex >= fields.length) {
		return fields;
	}
	const next = [...fields];
	const [moved] = next.splice(index, 1);
	next.splice(targetIndex, 0, moved);
	return next;
}
