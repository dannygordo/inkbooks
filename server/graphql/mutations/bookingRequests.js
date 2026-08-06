const crypto = require('crypto');
const BookingRequest = require('../../models/BookingRequest');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const Appointment = require('../../models/Appointment');
const Client = require('../../models/Client');
const User = require('../../models/User');
const Project = require('../../models/Project');
const Artist = require('../../models/Artist');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError, RateLimitError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const { findOrCreateGuestClient } = require('../../utils/guest-client');
const { resolveGuestToken } = require('../../utils/guest-auth');
const { checkRateLimit, getClientIp } = require('../../utils/rate-limit');
const { tryCheckAuth } = require('../../utils/check-auth');
const { assertCanManageArtist, linkClientToUsersShops } = require('../../utils/shop-membership');
const { getActiveShopIdForArtist } = require('../../utils/artist-shop');
const {
  createBookingRequestInputSchema,
  guestMessageInputSchema,
  convertBookingRequestInputSchema,
  reassignBookingRequestInputSchema,
  createAppointmentInputSchema,
  createProjectInputSchema,
  validate,
} = require('../../utils/validation');
const { getShopIdsForUser } = require('../../utils/shop-membership');
const {
  sendBookingRequestReceivedEmail,
  sendNewBookingRequestNotificationToArtist,
} = require('../../utils/email');
const { notifyNewMessage, logNotifyOutcomes } = require('../../utils/message-notifications');
const { notifySafely } = require('../../utils/notifications');
const { scheduleAudienceForArtist } = require('../../utils/notification-audience');
const { actorName } = require('../../utils/notification-copy');

module.exports = {
  // Public and unauthenticated by design - this is the intake form, submitted before any
  // account exists. Rate-limited by IP: 5 submissions/hour is generous for a real prospective
  // client (nobody legitimately submits the same intake form five times in an hour) but blocks
  // scripted spam before it reaches Mongo, floods an artist's inbox, or burns Resend's free
  // 3,000-email/month quota.
  //
  // An authenticated caller (an artist using this same public form/mutation for a walk-in client
  // at the studio - see PRODUCTION_ROADMAP.md's "Rates & settings" entry) gets a much higher
  // limit instead of being lumped in with anonymous traffic - a busy shop's front desk submitting
  // several walk-ins from one IP in an hour is real, legitimate use, not abuse. Still rate-limited
  // (not exempted outright) since a compromised/malicious authenticated account shouldn't get an
  // unlimited free pass either.
  async createBookingRequest(_, { bookingRequestInput }, context) {
    const ip = getClientIp(context.req);
    const authenticatedCaller = tryCheckAuth(context);
    // Keyed separately (not just a different `max` on the same key) so an anonymous visitor's
    // count on this IP can never bleed into, or be inflated by, an authenticated staff member's
    // usage of the same public form from the same shop network, and vice versa.
    const rateLimitKey = authenticatedCaller
      ? `${ip}:createBookingRequest:auth`
      : `${ip}:createBookingRequest:anon`;
    const rateLimitOptions = authenticatedCaller
      ? { windowMs: 60 * 60 * 1000, max: 100 }
      : { windowMs: 60 * 60 * 1000, max: 5 };
    const { allowed, retryAfterSeconds } = checkRateLimit(rateLimitKey, rateLimitOptions);
    if (!allowed) {
      throw new RateLimitError(
        `Too many booking requests from this address. Try again in ${retryAfterSeconds} seconds.`,
      );
    }

    const { valid, errors, data } = validate(createBookingRequestInputSchema, bookingRequestInput);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }

    const artist = await User.findById(data.artistId);
    if (!artist) {
      throw new UserInputError('Errors', { errors: { artistId: 'Artist not found' } });
    }

    // A logged-in caller is the actor; an anonymous submission means the client is. Resolved here,
    // once, because both the artist's email and the artist's notification hang off it.
    const callerIsTheArtist =
      !!authenticatedCaller && String(authenticatedCaller.id) === String(artist._id);

    const { user: clientUser, client } = await findOrCreateGuestClient({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
    });
    // Somebody who submits the public intake form for one of a shop's artists is that shop's
    // client from this moment, before any project exists. Keyed off the ARTIST being booked rather
    // than off the caller, because the caller may be nobody at all - the public form is anonymous,
    // and the artist is the only party guaranteed to be present in every path through here.
    await linkClientToUsersShops(client._id, data.artistId);

    const actorUserId = authenticatedCaller ? authenticatedCaller.id : clientUser._id;

    const now = new Date();
    const conversation = await new Conversation({
      members: [artist.id, clientUser.id],
      createdAt: now,
      updatedAt: now,
    }).save();

    // guestToken is a required field on BookingRequest - must be generated before the first
    // save, not assigned afterward, or the save itself would fail validation.
    const guestToken = crypto.randomBytes(32).toString('hex');

    const bookingRequest = await new BookingRequest({
      artistId: artist.id,
      clientId: client.id,
      conversationId: conversation.id,
      guestToken,
      description: data.description,
      referenceImages: data.referenceImages,
      placement: data.placement,
      size: data.size,
      budget: data.budget,
      availability: data.availability,
      isCoverUp: data.isCoverUp,
      howHeard: data.howHeard,
      // Defaults to 'public_form' (the Mongoose schema's own default) when the caller doesn't
      // send one - covers the real public intake form and anything else calling this mutation
      // without an opinion. AppointmentWizard.jsx is the one caller that explicitly sends
      // 'artist_created'. See BookingRequest.js's own comment on what this distinguishes.
      source: data.source || 'public_form',
    }).save();

    // Best-effort notifications, sent after the record is safely persisted - a delivery
    // failure here shouldn't fail the whole request, and sendEmail() itself already warns and
    // no-ops rather than throwing (see utils/email.js).
    await sendBookingRequestReceivedEmail({
      to: clientUser.email,
      firstName: clientUser.firstName,
      artistName: artist.firstName,
      guestToken,
    });
    // Not when the artist made it themselves. An artist scheduling a walk-in through the
    // appointment wizard hits this same mutation, and mailing them "you have a new booking
    // request" about the thing they are currently looking at is noise of the worst kind: it makes
    // every OTHER email from this system slightly less worth opening.
    if (!callerIsTheArtist) {
      await sendNewBookingRequestNotificationToArtist({
        to: artist.email,
        artistFirstName: artist.firstName,
        clientName: `${clientUser.firstName} ${clientUser.lastName}`,
      });
    }

    // WHO CAUSED THIS, not who the form is about.
    //
    // This was hardcoded to the client, on the reasoning that a public intake form has no logged-in
    // caller. True for the public form - and wrong for the other caller, because the appointment
    // wizard reaches this same mutation with the artist logged in. The artist was then the actor of
    // record for an event they themselves caused, so notify()'s actor filter had nothing to catch
    // and dutifully told them about their own consult.
    //
    // Deriving the actor from the request rather than assuming it means the artist filters
    // themselves out, and a shop admin booking a walk-in on an artist's behalf still notifies the
    // artist - which is correct, and which a `source === 'artist_created'` check would have got
    // wrong, since the wizard sends that flag no matter who is driving it.
    await notifySafely({
      actorId: actorUserId,
      recipientIds: [artist._id],
      type: 'booking_request_received',
      category: 'schedule',
      subjectType: 'bookingRequest',
      subjectId: bookingRequest._id,
      title: `New booking request from ${clientUser.firstName} ${clientUser.lastName}`,
      body: (data.description || '').slice(0, 140),
    });

    return bookingRequest;
  },

  // Public, token-gated (not withAuth) - a guest replying on their own booking request's page.
  // Rate-limited two ways: by IP (30/hour - generous for a real back-and-forth conversation,
  // still blocks a script hammering the endpoint) and by the token itself (same limit), since a
  // token could in principle be replayed from a different IP - the per-token check catches that
  // even though the 32-byte random token isn't realistically guessable.
  async sendGuestMessage(_, { token, message }, context) {
    const ip = getClientIp(context.req);
    const ipCheck = checkRateLimit(`${ip}:sendGuestMessage`, { windowMs: 60 * 60 * 1000, max: 30 });
    if (!ipCheck.allowed) {
      throw new RateLimitError(
        `Too many messages from this address. Try again in ${ipCheck.retryAfterSeconds} seconds.`,
      );
    }
    const tokenCheck = checkRateLimit(`token:${token}:sendGuestMessage`, {
      windowMs: 60 * 60 * 1000,
      max: 30,
    });
    if (!tokenCheck.allowed) {
      throw new RateLimitError(
        `Too many messages sent. Try again in ${tokenCheck.retryAfterSeconds} seconds.`,
      );
    }

    const { valid, errors } = validate(guestMessageInputSchema, { message });
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }

    const { bookingRequest, user } = await resolveGuestToken(token);

    const now = new Date();
    const newMessage = await new Message({
      conversationId: bookingRequest.conversationId,
      senderId: user.id,
      message,
      createdAt: now,
      updatedAt: now,
    }).save();

    // Same path as an in-app message now (see utils/message-notifications.js) rather than a
    // second hand-rolled copy: same throttle, same link, same per-recipient outcome. This one
    // notified without any throttle and with an email that said "log in to InkBooks to view it"
    // and gave no link, while the other direction had a link and no throttle - two flavours of the
    // same notification, differing for no reason other than being written in two places.
    await Conversation.updateOne(
      { _id: bookingRequest.conversationId },
      { $set: { updatedAt: now } },
    );
    logNotifyOutcomes(
      'guest-message',
      bookingRequest.conversationId,
      await notifyNewMessage({
        conversationId: bookingRequest.conversationId,
        senderId: user.id,
      }),
    );

    return newMessage;
  },

  // Artist-only (withAuth) - converts a pending request into a real Appointment (consult or
  // session) or marks it declined.
  convertBookingRequest: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(convertBookingRequestInputSchema, {
      outcome: args.outcome,
      projectTitle: args.projectTitle,
    });
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }
    // Cross-field requirement zod's object schema doesn't express cleanly on its own - a Project
    // needs a title (required at both the Mongoose and zod layers), but BookingRequest never
    // collects one, so the caller (the artist, via a small "Book Session" sub-form) has to supply
    // it - only for this outcome, since consult_booked/declined never touch Project at all.
    if (data.outcome === 'session_booked' && !data.projectTitle) {
      throw new UserInputError('Errors', {
        errors: { projectTitle: 'A project title is required to book a session' },
      });
    }

    const bookingRequest = await BookingRequest.findById(args.bookingRequestId);
    if (!bookingRequest) {
      throw new UserInputError('Errors', { errors: { bookingRequestId: 'Booking request not found' } });
    }
    // The request's own artist, or a shop admin at that artist's shop. Was `role <= SHOP_ADMIN`,
    // which let a shop admin convert or reassign another shop's booking requests.
    await assertCanManageArtist(user, bookingRequest.artistId);

    // Which outcome is reachable depends on the request's *current* status, not just its shape -
    // the real-world funnel is pending -> (consult_booked -> (session_booked | not_booked)) |
    // session_booked | declined. A request that's already session_booked/declined/not_booked is
    // terminal - re-converting it would either silently orphan the Appointment/Project already
    // created (the old resultingAppointmentId gets overwritten with nothing pointing at the
    // original) or double-book a client who already has a real Appointment on the books. See
    // BookingRequest.status's own comment for why declined and not_booked are kept as two distinct
    // terminal values instead of one shared "closed" state.
    const VALID_OUTCOMES_BY_STATUS = {
      pending: ['consult_booked', 'session_booked', 'declined'],
      consult_booked: ['session_booked', 'not_booked'],
    };
    const allowedOutcomes = VALID_OUTCOMES_BY_STATUS[bookingRequest.status] || [];
    if (!allowedOutcomes.includes(data.outcome)) {
      throw new UserInputError('Errors', {
        errors: {
          outcome: `Cannot convert a "${bookingRequest.status}" booking request to "${data.outcome}"`,
        },
      });
    }

    if (data.outcome === 'declined' || data.outcome === 'not_booked') {
      bookingRequest.status = data.outcome;
      await bookingRequest.save();
      return bookingRequest;
    }

    const clientForAppointment = await Client.findById(bookingRequest.clientId);
    if (!clientForAppointment) {
      throw new UserInputError('Errors', { errors: { bookingRequestId: 'Client record not found' } });
    }

    // appointmentType is derived from the outcome, not trusted from the caller's
    // appointmentInput - keeps outcome and appointmentType from ever disagreeing. createdAt/
    // updatedAt are generated here rather than required from the caller, unlike the older
    // createAppointment mutation this schema is shared with.
    const appointmentType = data.outcome === 'consult_booked' ? 'consult' : 'session';
    const now = new Date();

    // Booking a session used to only ever create an Appointment, leaving Appointment.projectId
    // unset - found while wiring up the "every session must have a project" rule for the
    // appointment-creation wizard. A consult can (and usually does) happen before anyone knows if
    // a project exists at all - that's the whole reason BookingRequest is a separate model from
    // Project. But by the time an artist is booking a *session*, they've decided the work is
    // happening, so this auto-creates the real Project from the request's own intake fields
    // (description/placement/size/referenceImages) instead of leaving that as a manual follow-up
    // step. referenceImages are plain URL strings on BookingRequest (see that model's own
    // comment on why - no real userId existed yet when a guest uploaded them); Project needs
    // [IBImage], so each URL is wrapped with the now-real client's userId as the attributed
    // uploader.
    let newProjectId;
    if (data.outcome === 'session_booked') {
      const projectInput = {
        title: data.projectTitle,
        description: bookingRequest.description,
        placement: bookingRequest.placement,
        size: bookingRequest.size,
        artistId: bookingRequest.artistId.toString(),
        clientId: bookingRequest.clientId.toString(),
        referenceImages: (bookingRequest.referenceImages || []).map((url) => ({
          url,
          userId: clientForAppointment.userId,
        })),
        status: 'open',
      };
      const { valid: projValid, errors: projErrors, data: projData } = validate(
        createProjectInputSchema,
        projectInput,
      );
      if (!projValid) {
        throw new UserInputError('Errors', { errors: projErrors });
      }
      // bookingRequestId is stamped on here so a Project can find its way back to the consult
      // that collected its deposit - see models/Project.js. The consult carries bookingRequestId
      // too, so the request is the join between them.
      const project = await new Project({ ...projData, bookingRequestId: bookingRequest._id }).save();
      newProjectId = project.id;
    }

    // Appointment.userId means "the artist this appointment belongs to" everywhere else in this
    // codebase - getAppointmentsByArtist/getAppointmentsByShop filter on it as the artist,
    // loadOwnedAppointment (mutations/appointments.js) checks it against the caller as the
    // artist, every other creation path (createAppointment, the appointment wizard) sets it to
    // the logged-in artist's own id. This resolver alone set it to the *client's* userId instead -
    // wrong on every axis above, and the actual reason a converted booking request (consult or
    // session) never showed up on the artist's calendar or dashboard: getAppointmentsByArtist
    // was filtering for the artist's id against a field that held the client's id instead, so it
    // could never match. Found by re-reading every real caller of Appointment.userId against what
    // this resolver was actually writing - not caught earlier because nothing had exercised this
    // path against a real dashboard/calendar view until now.
    //
    // shopId was never set at all for a shop-affiliated artist - IBCalendar.jsx exclusively uses
    // getAppointmentsByShop once an artist has a shop (see that file's own comment), which filters
    // on Appointment.shopId, so a converted booking request was invisible on a shop-affiliated
    // artist's calendar for the same "never actually appears anywhere" reason, independent of the
    // userId bug above. Derived from the artist's active shop connection here (the same single
    // source every other path now uses - see utils/artist-shop.js) rather than requiring every
    // caller (the wizard, the booking-requests dashboard) to remember to pass it - one fix here
    // covers both existing callers.
    // From the artist's active ArtistShopConnection, not the old Artist.shopId field. This read
    // was the last one left on the stored field, and it's on the money path: shopId is what
    // decides whether a shop cut gets computed and whether this session shows up in the shop's
    // revenue. With Artist.shopId no longer written, this would have silently produced
    // shop-less appointments for every booking request converted - the same bug, one layer down.
    const artistShopId = await getActiveShopIdForArtist(bookingRequest.artistId);

    // A session gets its title from the Project just created above (data.projectTitle) - the
    // same label already shown everywhere a Project is (dashboard, Project page). A consult has
    // no Project to borrow a title from at all, so it defaults to the client's own name (e.g.
    // "Jane Doe") - short, meaningful, and exactly what the calendar already shows next to a
    // *session* appointment's title (see ibCalendar/Day.jsx's client-name-plus-title format).
    // Previously neither path set a title at all, so Appointment.title stayed null - harmless in
    // the data itself, but ibCalendar/Day.jsx's template string interpolates a null title as the
    // literal text "null" (`${time} - ${evt.title}`), which is what was actually showing up in
    // the calendar. An explicit caller-supplied title (args.appointmentInput?.title) still wins if
    // ever sent - today no caller sends one for these two outcomes, but this shouldn't silently
    // override one if that changes.
    const derivedTitle =
      appointmentType === 'consult'
        ? `${clientForAppointment.firstName} ${clientForAppointment.lastName}`
        : data.projectTitle;

    const appointmentInput = {
      ...(args.appointmentInput || {}),
      appointmentType,
      title: args.appointmentInput?.title || derivedTitle,
      // A consult has no Project to hold its own intake description - copying it onto the
      // Appointment directly is what lets a consult be genuinely self-describing (see the
      // ConsultDetail view) without one. Harmless to also set for a session, where Project already
      // carries the same text - just a convenience if the Appointment is ever read on its own.
      description: args.appointmentInput?.description || bookingRequest.description,
      // Overrides whatever (if anything) the caller sent - same reasoning as appointmentType
      // above, this is derived from the just-created Project, not trusted from the client.
      ...(newProjectId ? { projectId: newProjectId } : {}),
      // Links this Appointment back to the BookingRequest that produced it - see
      // models/Appointment.js's own comment on why (lets a consult with no Project still surface
      // its full intake details and a "convert to session" action).
      bookingRequestId: bookingRequest.id,
      // .toString() matters here - Mongoose ObjectIds aren't plain strings, and
      // createAppointmentInputSchema's userId/shopId fields are zod string regex checks (see
      // utils/validation.js's objectIdSchema).
      userId: bookingRequest.artistId.toString(),
      shopId: artistShopId ? artistShopId.toString() : args.appointmentInput?.shopId,
      createdAt: args.appointmentInput?.createdAt || now,
      updatedAt: args.appointmentInput?.updatedAt || now,
    };

    const { valid: apptValid, errors: apptErrors, data: apptData } = validate(
      createAppointmentInputSchema,
      appointmentInput,
    );
    if (!apptValid) {
      throw new UserInputError('Errors', { errors: apptErrors });
    }

    const appointment = await new Appointment(apptData).save();

    // Close out the consult this session came from.
    //
    // Booking a session out of a consult means the consult HAPPENED - the artist and the client
    // met, agreed the work, and (usually) money changed hands. But nothing here used to say so.
    // The consult stayed 'scheduled' with its originally-booked date, which caused two distinct
    // problems, one cosmetic and one financial:
    //
    //   1. It kept showing up as an upcoming appointment. Every "upcoming" list is
    //      `appointmentDate >= now` (see appointmentFilterToQuery in resolvers/appointments.js),
    //      and a consult booked for next Tuesday that actually happened today is still ahead of
    //      now. The artist saw a meeting they had already had sitting in their schedule.
    //
    //   2. Worse: it dated the deposit wrong. A deposit is recorded against this consult (see
    //      BookSessionDatesForm), and utils/analytics.js buckets every figure by appointmentDate,
    //      not createdAt - deliberately, so "how did March go" means work done in March. A
    //      consult scheduled for next month but held early therefore booked its deposit revenue
    //      into NEXT month. The money was real, correctly recorded, and in the wrong period.
    //
    // Both are fixed by the same two writes, and the date one is the reason this belongs here
    // rather than in the UI: it has to happen in the same operation that takes the deposit.
    //
    // The date only ever moves BACKWARD, never forward. If the consult was scheduled for last
    // week and is only being converted now (an artist catching up on paperwork), its real date is
    // still last week - that is when the meeting happened, and rewriting it to today would move
    // revenue out of the period it belongs to, which is the exact bug this is fixing, mirrored.
    // Only a consult whose scheduled date is still in the future gets pulled back to now.
    if (data.outcome === 'session_booked' && bookingRequest.resultingAppointmentId) {
      const consult = await Appointment.findById(bookingRequest.resultingAppointmentId);
      // Guarded on type: resultingAppointmentId is overwritten below to point at the new session,
      // so a request converted twice would otherwise "close out" a session as if it were a
      // consult. Only ever act on something that is actually a consult and not already closed.
      if (consult && consult.appointmentType === 'consult' && consult.appointmentStatus !== 'completed') {
        consult.appointmentStatus = 'completed';
        if (consult.appointmentDate && consult.appointmentDate > now) {
          consult.appointmentDate = now;
        }
        await consult.save();
      }
    }

    bookingRequest.status = data.outcome;
    bookingRequest.resultingAppointmentId = appointment.id;
    await bookingRequest.save();

    // A booking is the shop's business - the calendar just changed and the front desk manages it.
    // Schedule audience rather than money: staff see the schedule, not the books (§7).
    //
    // The artist who converted it is the actor and is filtered out. An independent artist has no
    // shop, so this writes nothing at all, which is right - there is nobody else to tell.
    if (data.outcome === 'session_booked' || data.outcome === 'consult_booked') {
      await notifySafely({
        actorId: user.id,
        recipientIds: await scheduleAudienceForArtist(bookingRequest.artistId),
        type: data.outcome === 'session_booked' ? 'session_booked' : 'consult_booked',
        category: 'schedule',
        subjectType: 'appointment',
        subjectId: appointment._id,
        title:
          data.outcome === 'session_booked'
            ? `${await actorName(user.id)} booked a session — ${data.projectTitle}`
            : `${await actorName(user.id)} booked a consult — ${derivedTitle}`,
        body: `For ${clientForAppointment.firstName} ${clientForAppointment.lastName}.`,
      });
    }

    return bookingRequest;
  }),

  // Forwards a still-pending request to another artist - the "4th action" alongside Book
  // Consult/Book Session/Decline on the artist dashboard, for a shop where the artist who
  // originally got the request isn't the right fit (specialty, fully booked, etc.) but a
  // shop-mate is. Only allowed between two artists actively connected to the *same* shop -
  // reusing getShopIdsForUser (already used to scope getArtists/getClients/etc. - see
  // utils/shop-membership.js) rather than the legacy single Artist.shopId field, so this works
  // correctly under the fuller multi-shop connection model, not just the common single-shop case.
  reassignBookingRequest: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(reassignBookingRequestInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }

    const bookingRequest = await BookingRequest.findById(data.bookingRequestId);
    if (!bookingRequest) {
      throw new UserInputError('Errors', {
        errors: { bookingRequestId: 'Booking request not found' },
      });
    }
    // The request's own artist, or a shop admin at that artist's shop. Was `role <= SHOP_ADMIN`,
    // which let a shop admin convert or reassign another shop's booking requests.
    await assertCanManageArtist(user, bookingRequest.artistId);
    // Reassigning after conversion doesn't mean anything - the resulting Appointment/Project
    // already exist under the original artistId, and this mutation only ever touches
    // BookingRequest.artistId, not those. Only a still-open request can be forwarded.
    if (bookingRequest.status !== 'pending') {
      throw new UserInputError('Errors', {
        errors: { bookingRequestId: 'Only a pending request can be reassigned' },
      });
    }

    const newArtist = await User.findById(data.newArtistId);
    if (!newArtist || newArtist.userType !== Constants.USER_TYPE.ARTIST) {
      throw new UserInputError('Errors', { errors: { newArtistId: 'Artist not found' } });
    }

    const [currentArtistShopIds, newArtistShopIds] = await Promise.all([
      getShopIdsForUser(bookingRequest.artistId),
      getShopIdsForUser(data.newArtistId),
    ]);
    const sharesAShop = newArtistShopIds.some((id) => currentArtistShopIds.includes(id));
    if (!sharesAShop) {
      throw new UserInputError('Errors', {
        errors: { newArtistId: 'That artist is not connected to the same shop' },
      });
    }

    bookingRequest.artistId = data.newArtistId;
    await bookingRequest.save();
    return bookingRequest;
  }),
};
