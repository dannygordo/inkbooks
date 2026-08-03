const Appointment = require('../../models/Appointment');
const Shop = require('../../models/Shop');
const User = require('../../models/User');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const square = require('../../utils/square');
const {
  sendShopCutMarkedPaidNotificationToShop,
  sendShopCutConfirmedNotificationToArtist,
} = require('../../utils/email');
const {
  createShopCutInvoiceInputSchema,
  createBatchShopCutInvoiceInputSchema,
  appointmentIdInputSchema,
  validate,
} = require('../../utils/validation');

// See PRODUCTION_ROADMAP.md's "Shop-cut ledger" section for the full design and the discussion
// that led to it: Option B (a tracked ledger, not an automatic per-transaction Square split) plus
// two ways to actually settle a shop cut - a Square Invoice (money never touches InkBooks) or a
// manual/cash path with dual-control confirmation (the artist's own claim of "I paid" isn't
// enough - the shop has to independently confirm before the ledger shows it as paid).

module.exports = {
  // Artist-initiated - only the appointment's own artist can invoice themselves for their own
  // shop cut. Requires the shop to already be Square-connected (see routes/squareOAuth.js) and
  // the appointment to have a shopId + shopCutAmount set and not already invoiced/paid.
  createShopCutInvoice: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(createShopCutInvoiceInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }

    const appointment = await Appointment.findById(data.appointmentId);
    if (!appointment) {
      throw new UserInputError('Errors', { errors: { appointmentId: 'Appointment not found' } });
    }
    if (String(user.id) !== String(appointment.userId)) {
      throw new AuthenticationError('Only the artist on this appointment can send this invoice.');
    }
    if (!appointment.shopId) {
      throw new UserInputError('Errors', { errors: { appointmentId: 'This appointment has no shop attached.' } });
    }
    if (!appointment.shopCutAmount || appointment.shopCutAmount <= 0) {
      throw new UserInputError('Errors', { errors: { appointmentId: 'This appointment has no shop cut amount set.' } });
    }
    if (appointment.shopCutStatus === 'paid') {
      throw new UserInputError('Errors', { errors: { appointmentId: 'This shop cut has already been paid.' } });
    }
    if (appointment.shopCutStatus === 'invoice_sent') {
      throw new UserInputError('Errors', { errors: { appointmentId: 'An invoice has already been sent for this shop cut.' } });
    }
    if (appointment.shopCutStatus === 'pending_confirmation') {
      throw new UserInputError('Errors', { errors: { appointmentId: 'This shop cut is already marked as paid, awaiting the shop\'s confirmation.' } });
    }

    const shop = await Shop.findById(appointment.shopId);
    if (!shop || !shop.squareConnected) {
      throw new UserInputError('Errors', { errors: { appointmentId: 'This shop has not connected a Square account yet.' } });
    }

    const artist = await User.findById(appointment.userId);
    if (!artist) {
      throw new UserInputError('Errors', { errors: { appointmentId: 'Artist account not found.' } });
    }

    const paymentMethod = data.paymentMethod || 'ach';
    const targetAmountCents = Math.round(appointment.shopCutAmount * 100);

    const invoiceResult = await square.createAndPublishShopCutInvoice({
      shop,
      artistEmail: artist.email,
      artistFirstName: artist.firstName,
      artistLastName: artist.lastName,
      targetAmountCents,
      description: `Shop cut for appointment on ${appointment.appointmentDate.toDateString()}`,
      paymentMethod,
    });

    appointment.shopCutSquareInvoiceId = invoiceResult.invoiceId;
    appointment.shopCutStatus = 'invoice_sent';
    appointment.shopCutPaymentMethod = 'square_invoice';
    await appointment.save();

    return { appointment, invoiceUrl: invoiceResult.publicUrl };
  }),

  // Combines several completed sessions' shop cuts into one Square invoice instead of the artist
  // sending one per session - see the artist-dashboard payout list (client/src/components/
  // artistDashboard/ShopCutPayoutList.jsx). All the same per-appointment guards as
  // createShopCutInvoice above apply to every appointment in the batch, plus two batch-specific
  // ones: everything must belong to the same shop (one invoice can't span shops) and the caller
  // must own every appointment in the list (not just some of them).
  createBatchShopCutInvoice: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(createBatchShopCutInvoiceInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }

    const appointments = await Appointment.find({ _id: { $in: data.appointmentIds } });
    if (appointments.length !== data.appointmentIds.length) {
      throw new UserInputError('Errors', {
        errors: { appointmentIds: 'One or more appointments were not found.' },
      });
    }
    for (const appointment of appointments) {
      if (String(user.id) !== String(appointment.userId)) {
        throw new AuthenticationError('Only the artist on these appointments can send this invoice.');
      }
      if (!appointment.shopId) {
        throw new UserInputError('Errors', {
          errors: { appointmentIds: 'One or more appointments have no shop attached.' },
        });
      }
      if (!appointment.shopCutAmount || appointment.shopCutAmount <= 0) {
        throw new UserInputError('Errors', {
          errors: { appointmentIds: 'One or more appointments have no shop cut amount set.' },
        });
      }
      if (appointment.shopCutStatus !== 'unpaid') {
        throw new UserInputError('Errors', {
          errors: { appointmentIds: 'One or more appointments are not in an unpaid state.' },
        });
      }
    }
    const shopId = String(appointments[0].shopId);
    if (!appointments.every((a) => String(a.shopId) === shopId)) {
      throw new UserInputError('Errors', {
        errors: { appointmentIds: 'All appointments in a batch must belong to the same shop.' },
      });
    }

    const shop = await Shop.findById(shopId);
    if (!shop || !shop.squareConnected) {
      throw new UserInputError('Errors', {
        errors: { appointmentIds: 'This shop has not connected a Square account yet.' },
      });
    }

    const artist = await User.findById(user.id);
    if (!artist) {
      throw new UserInputError('Errors', { errors: { appointmentIds: 'Artist account not found.' } });
    }

    const paymentMethod = data.paymentMethod || 'ach';
    const totalAmount = appointments.reduce((sum, a) => sum + a.shopCutAmount, 0);
    const targetAmountCents = Math.round(totalAmount * 100);

    const invoiceResult = await square.createAndPublishShopCutInvoice({
      shop,
      artistEmail: artist.email,
      artistFirstName: artist.firstName,
      artistLastName: artist.lastName,
      targetAmountCents,
      description: `Shop cut for ${appointments.length} session(s)`,
      paymentMethod,
    });

    for (const appointment of appointments) {
      appointment.shopCutSquareInvoiceId = invoiceResult.invoiceId;
      appointment.shopCutStatus = 'invoice_sent';
      appointment.shopCutPaymentMethod = 'square_invoice';
      await appointment.save();
    }

    return { appointments, invoiceUrl: invoiceResult.publicUrl };
  }),

  // The artist's own claim that they paid the shop (e.g. cash) - deliberately does NOT flip
  // shopCutStatus straight to 'paid'. That would make the ledger trust an unverified, one-sided
  // claim for exactly the money the shop is owed - see confirmShopCutPaid below, which is the
  // shop's independent half of this dual-control flow.
  markShopCutPaidManually: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(appointmentIdInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    const appointment = await Appointment.findById(data.appointmentId);
    if (!appointment) {
      throw new UserInputError('Errors', { errors: { appointmentId: 'Appointment not found' } });
    }
    if (String(user.id) !== String(appointment.userId)) {
      throw new AuthenticationError('Only the artist on this appointment can mark it paid.');
    }
    if (!appointment.shopId) {
      throw new UserInputError('Errors', { errors: { appointmentId: 'This appointment has no shop attached.' } });
    }
    if (appointment.shopCutStatus === 'paid') {
      throw new UserInputError('Errors', { errors: { appointmentId: 'This shop cut has already been paid.' } });
    }
    if (appointment.shopCutStatus === 'pending_confirmation') {
      throw new UserInputError('Errors', { errors: { appointmentId: 'This shop cut is already awaiting the shop\'s confirmation.' } });
    }

    appointment.shopCutStatus = 'pending_confirmation';
    appointment.shopCutPaymentMethod = 'manual';
    appointment.shopCutMarkedPaidBy = user.id;
    appointment.shopCutMarkedPaidAt = new Date();
    await appointment.save();

    const shop = await Shop.findById(appointment.shopId);
    const artist = await User.findById(appointment.userId);
    if (shop) {
      // Best-effort - a failed/unconfigured email shouldn't roll back the mutation itself (see
      // utils/email.js's own no-op-on-unconfigured behavior). The pending_confirmation record is
      // also visible in-app via getPendingShopCutConfirmations regardless of whether this email
      // sends.
      await sendShopCutMarkedPaidNotificationToShop({
        to: shop.email,
        shopName: shop.name,
        artistName: artist ? `${artist.firstName} ${artist.lastName}` : 'An artist',
        amount: appointment.shopCutAmount,
      });
    }

    return appointment;
  }),

  // The shop's independent confirmation - the other half of the dual-control design. Same
  // shop-admin-or-better convention as getPendingShopCutConfirmations/getShopArtistConnections
  // (documented gap: no per-shop ownership check yet, only "is this caller a shop-admin-or-better
  // at all").
  confirmShopCutPaid: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(appointmentIdInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    const appointment = await Appointment.findById(data.appointmentId);
    if (!appointment) {
      throw new UserInputError('Errors', { errors: { appointmentId: 'Appointment not found' } });
    }
    if (appointment.shopCutStatus !== 'pending_confirmation') {
      throw new UserInputError('Errors', {
        errors: { appointmentId: 'This shop cut is not awaiting confirmation.' },
      });
    }

    appointment.shopCutStatus = 'paid';
    appointment.shopCutConfirmedBy = user.id;
    appointment.shopCutConfirmedAt = new Date();
    await appointment.save();

    const artist = await User.findById(appointment.userId);
    const shop = await Shop.findById(appointment.shopId);
    if (artist) {
      await sendShopCutConfirmedNotificationToArtist({
        to: artist.email,
        artistFirstName: artist.firstName,
        shopName: shop ? shop.name : 'the shop',
      });
    }

    return appointment;
  }, Constants.ROLES.SHOP_ADMIN),
};
