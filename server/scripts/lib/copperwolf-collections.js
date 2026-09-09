// Single source of truth for "every real top-level Mongoose collection this project has", shared
// by scripts/seed-copperwolf.js (wipe + restore) and scripts/export-copperwolf-snapshot.js (dump).
// Before this file existed, seed-copperwolf.js kept its own inline copy of this list, and
// scripts/seed.js/scripts/seed-large.js each kept a second, independently-drifting copy (see the
// 2026-09-05 fix applied to both of those - 8 real collections had been added to the schema after
// their lists were last updated and never folded in). This is the one file seed-copperwolf.js and
// its export script both read from, so the two can never disagree about what "everything" means.
//
// IBImage/IBNote are deliberately excluded - see models/IBImage.js and models/IBNote.js. Both are
// embedded sub-schemas (Project.referenceImages/bodyImages/designImages, Client.notes), never
// their own top-level collection, so there is nothing for Model.find({}) to return for them;
// their data travels with whatever document embeds them.
const User = require('../../models/User');
const Shop = require('../../models/Shop');
const Staff = require('../../models/Staff');
const Artist = require('../../models/Artist');
const Client = require('../../models/Client');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const Project = require('../../models/Project');
const Appointment = require('../../models/Appointment');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const BookingRequest = require('../../models/BookingRequest');
const PasswordToken = require('../../models/PasswordToken');
const Form = require('../../models/Form');
const FormResponse = require('../../models/FormResponse');
const Adjustment = require('../../models/Adjustment');
const ClientFlag = require('../../models/ClientFlag');
const ClientFlagType = require('../../models/ClientFlagType');
const ExpenseType = require('../../models/ExpenseType');
const Expense = require('../../models/Expense');
const IncomeType = require('../../models/IncomeType');
const Income = require('../../models/Income');
const GiftCard = require('../../models/GiftCard');
const GiftCardRedemption = require('../../models/GiftCardRedemption');
const ShopCutRate = require('../../models/ShopCutRate');
const SquareAccount = require('../../models/SquareAccount');
const EventLog = require('../../models/EventLog');
const ReminderSettings = require('../../models/ReminderSettings');
const ReminderLog = require('../../models/ReminderLog');
const ClientScheduleEmail = require('../../models/ClientScheduleEmail');
const Notification = require('../../models/Notification');
const AutoResponse = require('../../models/AutoResponse');
const AutoResponseLog = require('../../models/AutoResponseLog');
const BoothRentCharge = require('../../models/BoothRentCharge');
const BoothRentPlan = require('../../models/BoothRentPlan');
const PushToken = require('../../models/PushToken');
const RecurringExpense = require('../../models/RecurringExpense');
const ScheduledRun = require('../../models/ScheduledRun');
const SharedImage = require('../../models/SharedImage');
const ResponseTimeSettings = require('../../models/ResponseTimeSettings');
const SystemMessageTemplate = require('../../models/SystemMessageTemplate');

// Order only matters in that it's the order collections print in during wipe/export/restore logs -
// insertMany has no cross-collection foreign key to satisfy, so restore order is otherwise
// arbitrary (Mongo itself doesn't enforce referential integrity between collections).
const COLLECTIONS = [
  { name: 'User', Model: User },
  { name: 'Shop', Model: Shop },
  { name: 'Staff', Model: Staff },
  { name: 'Artist', Model: Artist },
  { name: 'Client', Model: Client },
  { name: 'ArtistShopConnection', Model: ArtistShopConnection },
  { name: 'Project', Model: Project },
  { name: 'Appointment', Model: Appointment },
  { name: 'Conversation', Model: Conversation },
  { name: 'Message', Model: Message },
  { name: 'BookingRequest', Model: BookingRequest },
  { name: 'PasswordToken', Model: PasswordToken },
  { name: 'Form', Model: Form },
  { name: 'FormResponse', Model: FormResponse },
  { name: 'Adjustment', Model: Adjustment },
  { name: 'ClientFlag', Model: ClientFlag },
  { name: 'ClientFlagType', Model: ClientFlagType },
  { name: 'ExpenseType', Model: ExpenseType },
  { name: 'Expense', Model: Expense },
  { name: 'IncomeType', Model: IncomeType },
  { name: 'Income', Model: Income },
  { name: 'GiftCard', Model: GiftCard },
  { name: 'GiftCardRedemption', Model: GiftCardRedemption },
  { name: 'ShopCutRate', Model: ShopCutRate },
  { name: 'SquareAccount', Model: SquareAccount },
  { name: 'EventLog', Model: EventLog },
  { name: 'ReminderSettings', Model: ReminderSettings },
  { name: 'ReminderLog', Model: ReminderLog },
  { name: 'ClientScheduleEmail', Model: ClientScheduleEmail },
  { name: 'Notification', Model: Notification },
  { name: 'AutoResponse', Model: AutoResponse },
  { name: 'AutoResponseLog', Model: AutoResponseLog },
  { name: 'BoothRentCharge', Model: BoothRentCharge },
  { name: 'BoothRentPlan', Model: BoothRentPlan },
  { name: 'PushToken', Model: PushToken },
  { name: 'RecurringExpense', Model: RecurringExpense },
  { name: 'ScheduledRun', Model: ScheduledRun },
  { name: 'SharedImage', Model: SharedImage },
  { name: 'ResponseTimeSettings', Model: ResponseTimeSettings },
  { name: 'SystemMessageTemplate', Model: SystemMessageTemplate },
];

module.exports = { COLLECTIONS };
