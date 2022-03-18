import { deleteObject, ref } from 'firebase/storage';
import { storage } from './firebase';

const IBDeleteFile = (filePath) => {
  try {
    const imageRef = ref(storage, filePath);
    return deleteObject(imageRef);
  }catch(error) {
    console.log(error);
  }
};

export default IBDeleteFile;