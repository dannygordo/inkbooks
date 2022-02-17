const mongoose = require('mongoose');

const StaffSchema = new mongoose.Schema({
    firstName: {type: String, required: true},
    lastName: {type: String, required: true},
    email: {type: String, required: true, unique: true},
    phone: {type: String, default: ""},
    address: {type: String, default: ""},
    city: {type: String, default: ""},
    state: {type: String, default: ""},
    zip: {type: String, default: ""},
    instagram: {type: String, default: ""},
    facebook: {type: String, default: ""},
    avatar: {type: String, default: ""},
    userId: {type: mongoose.Schema.Types.ObjectId, required: true},
    status: {type: Number, required: true},
    title: {type: String, default: ""},
    shopId: {type: mongoose.Schema.Types.ObjectId, required: true}

}, {
    timestamps: true
});
module.exports = mongoose.model('Staff', StaffSchema);
