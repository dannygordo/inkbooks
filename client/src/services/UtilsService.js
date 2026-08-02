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

	const _prettyConstantsListValue = (list, val) => {
		let result = "";
		if (list && val >= 0) {
			Object.values(list).map((item) => {
				if (item.VALUE === val) {
					result = item.LABEL;
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

	const _showAvailableColorTags = (tags, usedTags, userColor) => {
		let tagArr = usedTags.map(t => t.tagColor);
		let result = [];
		console.log(tags);
		console.log(usedTags);
		console.log(userColor);
		tags.map((tag) => {
			if(tag.value === userColor) {
				result.unshift(tag);
			}
			if(!tagArr.includes(tag.value)) {
				result.push(tag);
			}
		});
		return result;
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
