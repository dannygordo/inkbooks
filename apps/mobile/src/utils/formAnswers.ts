// Direct port of apps/web's pages/forms/FormResponses.jsx formatAnswer - see that file's own
// header comment on why this is read against the RESPONSE's own fieldsSnapshot, never a live
// Form (models/FormResponse.js: a field's wording/options may have changed since submission, and
// a signed waiver has to keep meaning what it meant the day it was signed).
//
// file_upload returns a plain count here rather than web's clickable filename list - the pure
// text-formatting job this function does can't itself open a URL; app/form-responses/[id].tsx
// renders the actual openable rows from the answer's own fileUrls directly, this just tells it
// whether there's anything to render.

import { formatUtcCalendarDate } from '@/utils/utcDate';

export type FormAnswerField = { type: string };
export type FormAnswerValue = {
	textValue?: string | null;
	selectedOptions?: string[] | null;
	dateValue?: string | null;
	fileUrls?: string[] | null;
	signature?: { signedName?: string | null; signedAt?: string | null } | null;
} | null | undefined;

// signedAt, unlike dateValue above, IS a real timestamp of when signing happened - local time is
// correct here, matching web's own (non-UTC) moment(...) call for this one field.
function formatLocalDateTime(iso: string): string {
	const d = new Date(iso);
	return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function formatFormAnswer(field: FormAnswerField, answer: FormAnswerValue): string {
	if (!answer) {
		return '—';
	}
	switch (field.type) {
		case 'short_text':
		case 'paragraph':
			return answer.textValue || '—';
		case 'single_choice':
		case 'multi_choice':
			return (answer.selectedOptions || []).join(', ') || '—';
		case 'date':
			return answer.dateValue ? formatUtcCalendarDate(answer.dateValue) : '—';
		case 'file_upload': {
			const count = (answer.fileUrls || []).length;
			return count > 0 ? `${count} file${count === 1 ? '' : 's'}` : '—';
		}
		case 'signature':
			return answer.signature?.signedName
				? `Signed "${answer.signature.signedName}" on ${formatLocalDateTime(answer.signature.signedAt ?? '')}`
				: '—';
		default:
			return '—';
	}
}
