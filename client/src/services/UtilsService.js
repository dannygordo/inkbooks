import parsePhoneNumber from "libphonenumber-js";
import moment from "moment";

const UtilsService = (() => {
	const _formatPhone = (phoneNumber) => {
		return parsePhoneNumber(`+1${phoneNumber}`).formatNational();
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

	return {
		formatPhone: _formatPhone,
		prettyConstantsListValue: _prettyConstantsListValue,
		formatImagePathForFirebaseStorage: _formatImagePathForFirebaseStorage,
		formatDateToISO: _formatDateToISO,
		isObjectEmpty: _isObjectEmpty,
		removePropertiesForUpdate: _removePropertiesForUpdate,
		getMonth: _getMonth
	};
})();

export default UtilsService;
