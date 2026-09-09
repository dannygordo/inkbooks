import parsePhoneNumber from "libphonenumber-js";
import moment from "moment";

const UtilsService = (() => {
	// Real crash, found via manual testing against seeded data: every IBCard*Details component
	// (Artist/Client/Staff/Shop) calls this unconditionally, and phone is optional everywhere it
	// comes from (Mongoose defaults it to "" on Artist/Client/Staff/Shop - nothing requires a
	// caller to have one on file). parsePhoneNumber("+1") (empty digits) or any string it can't
	// parse as a real number returns undefined rather than throwing, so the old
	// `.formatNational()` call crashed with "Cannot read properties of undefined" the moment any
	// entity with no phone on file rendered - not an edge case, the default state for a freshly
	// created record. Now returns "" for empty/falsy input, and falls back to the raw stored value
	// (rather than crashing) if the library can't parse it as a valid number at all.
	const _formatPhone = (phoneNumber) => {
		if (!phoneNumber) {
			return "";
		}
		try {
			const parsed = parsePhoneNumber(`+1${phoneNumber}`);
			return parsed ? parsed.formatNational() : phoneNumber;
		} catch (err) {
			return phoneNumber;
		}
	};

	// FIX (2026-09-04, found reading Projects.jsx's/Search.jsx's own status columns against
	// constants/app.js): every list in this app - PROJECT_STATUS, APPOINTMENT_STATUS, BILLING_TYPE,
	// and the rest - is keyed lowercase `value`/`label`. This used to check `item.VALUE`/
	// `item.LABEL` (uppercase), which no entry anywhere in the codebase has ever had, so it always
	// fell through and returned "". The `val >= 0` guard compounded it: every real caller passes a
	// STRING status ('open', 'in_progress', ...), and a non-numeric string coerces to NaN, which is
	// never >= 0 - so the loop never even ran, regardless of casing. Together, this function has
	// never once returned a real label for a real caller; both call sites (Projects.jsx, Search.jsx)
	// silently rendered an em dash in their Status column instead. See Projects.test.jsx's own
	// now-corrected test, which used to assert the em dash as the expected behavior.
	const _prettyConstantsListValue = (list, val) => {
		let result = "";
		if (list && val !== undefined && val !== null && val !== "") {
			Object.values(list).map((item) => {
				if (item.value === val) {
					result = item.label;
				}
			});
		}
		return result;
	};

	const _formatDateToISO = (date) => {
		return new Date(date).toISOString();
	};


	const _isObjectEmpty = (obj) => {
		if(Object.keys(obj).length === 0) {
			return true;
		}
		return false;
	};

	const _removePropertiesForUpdate = (list) => {
		return list.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);
	};

	const _formatImagePathForFirebaseStorage = (str) => {
		return str.trim().replace(/\s+/g, "_");
	};

	const _getMonth = (month = moment().month()) => {
		month = Math.floor(month);
		const year = moment().year();
		const firstDayOfTheMonth = moment(new Date(year, month, 1)).day();
		let currentMonthCount = 0 - firstDayOfTheMonth;
		const daysMatrix = new Array(5).fill([]).map(() => {
			return new Array(7).fill(null).map(() => {
				currentMonthCount++;
				return moment(new Date(year, month, currentMonthCount));
			});
		});
		return daysMatrix;
	}

	/**
	 * The colours this person may choose: every unclaimed one, with their CURRENT colour first.
	 *
	 * The two conditions used to be two separate `if`s rather than a branch, so a tag that was both
	 * the user's own colour AND unclaimed by anyone else was unshifted onto the front and then
	 * pushed onto the back - the same colour twice, which React reported as "Encountered two
	 * children with the same key". Whether it happened depended on whether the caller's own colour
	 * came back in usedTags, so it looked intermittent.
	 *
	 * Kept as their own colour first rather than filtered out: it has to be in the list for the
	 * picker to show which swatch is currently selected.
	 */
	const _showAvailableColorTags = (tags, usedTags, userColor) => {
		const taken = new Set((usedTags || []).map((t) => t.tagColor));
		const mine = tags.filter((tag) => tag.value === userColor);
		const available = tags.filter((tag) => tag.value !== userColor && !taken.has(tag.value));
		return [...mine, ...available];
	}

	return {
		formatPhone: _formatPhone,
		prettyConstantsListValue: _prettyConstantsListValue,
		formatImagePathForFirebaseStorage: _formatImagePathForFirebaseStorage,
		formatDateToISO: _formatDateToISO,
		isObjectEmpty: _isObjectEmpty,
		removePropertiesForUpdate: _removePropertiesForUpdate,
		getMonth: _getMonth,
		showAvailableColorTags: _showAvailableColorTags
	};
})();

export default UtilsService;
