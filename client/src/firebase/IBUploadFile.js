import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

const IBUploadFile = (file, filePath) => {
	return new Promise(async (resolve, reject) => {
		const storageRef = ref(storage, filePath);
		try {
            console.log(file);
            console.log(filePath);
			await uploadBytes(storageRef, file);
			const url = await getDownloadURL(storageRef);
            console.log(url);
			resolve(url);
		} catch (err) {
            console.log(err);
			reject(err);
		}
	});
};

export default IBUploadFile;
