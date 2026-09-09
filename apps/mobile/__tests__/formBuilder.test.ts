import {
	canSaveForm,
	fieldNeedsMoreOptions,
	fieldsForInput,
	localFieldFromServer,
	moveField,
	newLocalField,
	type LocalFormField,
} from '@/utils/formBuilder';

const field = (overrides: Partial<LocalFormField> = {}): LocalFormField => ({
	_localId: 'loc-1',
	key: undefined,
	type: 'short_text',
	label: 'Question',
	helpText: '',
	required: false,
	options: [],
	...overrides,
});

describe('newLocalField', () => {
	it('returns a blank short_text field with a unique _localId and no server key', () => {
		const a = newLocalField();
		const b = newLocalField();
		expect(a._localId).not.toEqual(b._localId);
		expect(a.key).toBeUndefined();
		expect(a.type).toBe('short_text');
		expect(a.label).toBe('');
		expect(a.required).toBe(false);
		expect(a.options).toEqual([]);
	});
});

describe('localFieldFromServer', () => {
	it('uses the server key as _localId and defaults nullish fields', () => {
		const result = localFieldFromServer({ key: 'k1', type: 'paragraph', label: 'Notes' });
		expect(result).toEqual({
			_localId: 'k1',
			key: 'k1',
			type: 'paragraph',
			label: 'Notes',
			helpText: '',
			required: false,
			options: [],
		});
	});

	it('carries through helpText/required/options when present', () => {
		const result = localFieldFromServer({
			key: 'k2',
			type: 'single_choice',
			label: 'Color',
			helpText: 'Pick one',
			required: true,
			options: ['Red', 'Blue'],
		});
		expect(result.helpText).toBe('Pick one');
		expect(result.required).toBe(true);
		expect(result.options).toEqual(['Red', 'Blue']);
	});
});

describe('canSaveForm', () => {
	it('is false with a blank title', () => {
		expect(canSaveForm('  ', [field()])).toBe(false);
	});

	it('is false with no fields', () => {
		expect(canSaveForm('Intake', [])).toBe(false);
	});

	it('is false when any field has a blank label', () => {
		expect(canSaveForm('Intake', [field({ label: '  ' })])).toBe(false);
	});

	it('is false when a choice field has fewer than two non-empty options', () => {
		expect(canSaveForm('Intake', [field({ type: 'single_choice', options: ['Only one'] })])).toBe(false);
		expect(
			canSaveForm('Intake', [field({ type: 'multi_choice', options: ['One', '  ', 'Two'] })]),
		).toBe(true);
	});

	it('is true for a plain title, one labeled non-choice field', () => {
		expect(canSaveForm('Intake', [field()])).toBe(true);
	});
});

describe('fieldNeedsMoreOptions', () => {
	it('is false for non-choice types regardless of options', () => {
		expect(fieldNeedsMoreOptions(field({ type: 'short_text', options: [] }))).toBe(false);
	});

	it('is true for a choice field with fewer than two non-empty options', () => {
		expect(fieldNeedsMoreOptions(field({ type: 'single_choice', options: ['Only'] }))).toBe(true);
	});

	it('is false for a choice field with two or more non-empty options', () => {
		expect(fieldNeedsMoreOptions(field({ type: 'single_choice', options: ['A', 'B'] }))).toBe(false);
	});
});

describe('fieldsForInput', () => {
	it('omits key entirely for a brand-new field', () => {
		const [result] = fieldsForInput([field({ key: undefined, label: '  Name  ' })]);
		expect(result).not.toHaveProperty('key');
		expect(result.label).toBe('Name');
	});

	it('keeps an existing key', () => {
		const [result] = fieldsForInput([field({ key: 'k1' })]);
		expect(result.key).toBe('k1');
	});

	it('strips and filters options for non-choice types', () => {
		const [result] = fieldsForInput([field({ type: 'short_text', options: ['A', 'B'] })]);
		expect(result.options).toEqual([]);
	});

	it('trims and drops blank options for choice types', () => {
		const [result] = fieldsForInput([
			field({ type: 'multi_choice', options: [' A ', '', 'B', '   '] }),
		]);
		expect(result.options).toEqual(['A', 'B']);
	});
});

describe('moveField', () => {
	const fields = [field({ _localId: 'a' }), field({ _localId: 'b' }), field({ _localId: 'c' })];

	it('moves a field up by one', () => {
		const result = moveField(fields, 1, 'up');
		expect(result.map((f) => f._localId)).toEqual(['b', 'a', 'c']);
	});

	it('moves a field down by one', () => {
		const result = moveField(fields, 1, 'down');
		expect(result.map((f) => f._localId)).toEqual(['a', 'c', 'b']);
	});

	it('is a no-op moving the first field up', () => {
		const result = moveField(fields, 0, 'up');
		expect(result).toBe(fields);
	});

	it('is a no-op moving the last field down', () => {
		const result = moveField(fields, fields.length - 1, 'down');
		expect(result).toBe(fields);
	});
});
