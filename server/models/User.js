const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {type: String, required: true, unique: true},
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    role: {type: Number, required: true},
    userType: {type: String, required: true},
    firstName: {type: String},
    lastName: {type: String},
    avatar: {type: String}

}, {
    timestamps: true
});
module.exports = mongoose.model('User', UserSchema);