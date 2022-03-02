const mongoose = require('mongoose');

const IBNote = new mongoose.Schema({
	author: {type: String, required: true},
    note: {type: String, required: true},
    updatedAt: {type: Date},
    createdAt: {type: Date}
});
module.exports = IBNote;