import parsePhoneNumber from "libphonenumber-js";

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

	const _formatImagePathForFirebaseStorage = (str) => {
		return str.trim().replace(/\s+/g, "_");
	};

	return {
		formatPhone: _formatPhone,
		prettyConstantsListValue: _prettyConstantsListValue,
		formatImagePathForFirebaseStorage: _formatImagePathForFirebaseStorage,
	};
})();

export default UtilsService;
