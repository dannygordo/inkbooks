import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Date: { input: string; output: string; }
  DateTime: { input: string; output: string; }
};

export type Adjustment = {
  __typename?: 'Adjustment';
  amountCents: Scalars['Int']['output'];
  appointmentId: Scalars['ID']['output'];
  artistUserId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  createdBy?: Maybe<User>;
  createdByUserId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  reason: Scalars['String']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
};

export type Analytics = {
  __typename?: 'Analytics';
  activeProjectCount: Scalars['Int']['output'];
  appointmentCount: Scalars['Int']['output'];
  artistCount: Scalars['Int']['output'];
  artists: Array<ArtistAnalyticsRow>;
  averageTipCents?: Maybe<Scalars['Int']['output']>;
  completedSessionCount: Scalars['Int']['output'];
  consultCount: Scalars['Int']['output'];
  depositsAppliedCents?: Maybe<Scalars['Int']['output']>;
  depositsCollectedCents?: Maybe<Scalars['Int']['output']>;
  depositsOutstandingCents?: Maybe<Scalars['Int']['output']>;
  end: Scalars['DateTime']['output'];
  expensesCents?: Maybe<Scalars['Int']['output']>;
  feeCents?: Maybe<Scalars['Int']['output']>;
  netCents?: Maybe<Scalars['Int']['output']>;
  newClientCount: Scalars['Int']['output'];
  newProjectCount: Scalars['Int']['output'];
  otherIncomeCents?: Maybe<Scalars['Int']['output']>;
  revenueCents?: Maybe<Scalars['Int']['output']>;
  shopCutAwaitingConfirmationCents?: Maybe<Scalars['Int']['output']>;
  shopCutEarnedCents?: Maybe<Scalars['Int']['output']>;
  shopCutOutstandingCents?: Maybe<Scalars['Int']['output']>;
  start: Scalars['DateTime']['output'];
  subtotalCents?: Maybe<Scalars['Int']['output']>;
  taxCents?: Maybe<Scalars['Int']['output']>;
  tippedCount?: Maybe<Scalars['Int']['output']>;
  tipsCents?: Maybe<Scalars['Int']['output']>;
  totalClientCount: Scalars['Int']['output'];
  upcomingCount: Scalars['Int']['output'];
};

export type Appointment = {
  __typename?: 'Appointment';
  accumulatedSeconds?: Maybe<Scalars['Int']['output']>;
  adjustments: Array<Adjustment>;
  appointmentDate: Scalars['DateTime']['output'];
  appointmentEnd: Scalars['DateTime']['output'];
  appointmentStatus: Scalars['String']['output'];
  appointmentType: Scalars['String']['output'];
  artistIssuedGiftCardCreditCents?: Maybe<Scalars['Int']['output']>;
  bookingRequest?: Maybe<BookingRequest>;
  bookingRequestId?: Maybe<Scalars['ID']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  depositAppliedAt?: Maybe<Scalars['DateTime']['output']>;
  depositAppliedToAppointmentId?: Maybe<Scalars['ID']['output']>;
  depositCents?: Maybe<Scalars['Int']['output']>;
  depositCollectedAt?: Maybe<Scalars['DateTime']['output']>;
  depositCreditCents?: Maybe<Scalars['Int']['output']>;
  depositCreditFromAppointmentId?: Maybe<Scalars['ID']['output']>;
  depositPaymentMethod?: Maybe<Scalars['String']['output']>;
  depositSquarePaymentId?: Maybe<Scalars['String']['output']>;
  depositStatus?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  durationMinutes: Scalars['Int']['output'];
  feeCents?: Maybe<Scalars['Int']['output']>;
  giftCardCreditCents?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  isPersonal: Scalars['Boolean']['output'];
  project?: Maybe<Project>;
  projectId?: Maybe<Scalars['ID']['output']>;
  sessionNotes?: Maybe<Scalars['String']['output']>;
  shop?: Maybe<Shop>;
  shopCutCents?: Maybe<Scalars['Int']['output']>;
  shopCutConfirmedAt?: Maybe<Scalars['DateTime']['output']>;
  shopCutConfirmedBy?: Maybe<Scalars['ID']['output']>;
  shopCutMarkedPaidAt?: Maybe<Scalars['DateTime']['output']>;
  shopCutMarkedPaidBy?: Maybe<Scalars['ID']['output']>;
  shopCutPaymentMethod?: Maybe<Scalars['String']['output']>;
  shopCutPercentApplied?: Maybe<Scalars['Int']['output']>;
  shopCutSquareInvoiceId?: Maybe<Scalars['String']['output']>;
  shopCutStatus: Scalars['String']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
  subtotalCents?: Maybe<Scalars['Int']['output']>;
  taxCents?: Maybe<Scalars['Int']['output']>;
  timerStartedAt?: Maybe<Scalars['DateTime']['output']>;
  timerStatus?: Maybe<Scalars['String']['output']>;
  tipCents?: Maybe<Scalars['Int']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  totalCents?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  user?: Maybe<User>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type AppointmentFilter = {
  appointmentStatus?: InputMaybe<Scalars['String']['input']>;
  from?: InputMaybe<Scalars['DateTime']['input']>;
  isPersonal?: InputMaybe<Scalars['Boolean']['input']>;
  shopCutStatus?: InputMaybe<Scalars['String']['input']>;
  to?: InputMaybe<Scalars['DateTime']['input']>;
  upcomingOnly?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AppointmentInput = {
  appointmentDate: Scalars['DateTime']['input'];
  appointmentStatus?: InputMaybe<Scalars['String']['input']>;
  appointmentType?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['DateTime']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  durationMinutes?: InputMaybe<Scalars['Int']['input']>;
  feeCents?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  isPersonal?: InputMaybe<Scalars['Boolean']['input']>;
  projectId?: InputMaybe<Scalars['ID']['input']>;
  sessionNotes?: InputMaybe<Scalars['String']['input']>;
  shopCutStatus?: InputMaybe<Scalars['String']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  subtotalCents?: InputMaybe<Scalars['Int']['input']>;
  taxCents?: InputMaybe<Scalars['Int']['input']>;
  tipCents?: InputMaybe<Scalars['Int']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  totalCents?: InputMaybe<Scalars['Int']['input']>;
  updatedAt?: InputMaybe<Scalars['DateTime']['input']>;
  userId?: InputMaybe<Scalars['ID']['input']>;
};

export type AppointmentPage = {
  __typename?: 'AppointmentPage';
  items: Array<Appointment>;
  pageInfo: PageInfo;
};

export type Artist = UserInfo & {
  __typename?: 'Artist';
  address?: Maybe<Scalars['String']['output']>;
  avatar?: Maybe<Scalars['String']['output']>;
  billingType?: Maybe<Scalars['String']['output']>;
  bookingSlug?: Maybe<Scalars['String']['output']>;
  city?: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  endDate?: Maybe<Scalars['Date']['output']>;
  facebook?: Maybe<Scalars['String']['output']>;
  firstName: Scalars['String']['output'];
  flatRate?: Maybe<Scalars['Int']['output']>;
  hourlyRate?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  instagram?: Maybe<Scalars['String']['output']>;
  lastName: Scalars['String']['output'];
  phone?: Maybe<Scalars['String']['output']>;
  shop?: Maybe<Shop>;
  shopId?: Maybe<Scalars['ID']['output']>;
  startDate: Scalars['Date']['output'];
  state?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['Int']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  user?: Maybe<User>;
  userId: Scalars['ID']['output'];
  zip?: Maybe<Scalars['String']['output']>;
};

export type ArtistAccountResult = {
  __typename?: 'ArtistAccountResult';
  artist: Artist;
  inviteLink: Scalars['String']['output'];
};

export type ArtistAnalyticsRow = {
  __typename?: 'ArtistAnalyticsRow';
  appointmentCount: Scalars['Int']['output'];
  artistId?: Maybe<Scalars['ID']['output']>;
  completedSessionCount: Scalars['Int']['output'];
  consultCount: Scalars['Int']['output'];
  revenueCents?: Maybe<Scalars['Int']['output']>;
  shopCutAwaitingConfirmationCents?: Maybe<Scalars['Int']['output']>;
  shopCutEarnedCents?: Maybe<Scalars['Int']['output']>;
  shopCutOutstandingCents?: Maybe<Scalars['Int']['output']>;
  tipsCents?: Maybe<Scalars['Int']['output']>;
  user?: Maybe<User>;
  userId: Scalars['ID']['output'];
};

export type ArtistInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  avatar?: InputMaybe<Scalars['String']['input']>;
  billingType?: InputMaybe<Scalars['String']['input']>;
  bookingSlug?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['Date']['input']>;
  facebook?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  flatRate?: InputMaybe<Scalars['Int']['input']>;
  hourlyRate?: InputMaybe<Scalars['Int']['input']>;
  id: Scalars['ID']['input'];
  instagram?: InputMaybe<Scalars['String']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  startDate?: InputMaybe<Scalars['Date']['input']>;
  state?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['Int']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  userId?: InputMaybe<Scalars['ID']['input']>;
  zip?: InputMaybe<Scalars['String']['input']>;
};

export type ArtistPage = {
  __typename?: 'ArtistPage';
  items: Array<Artist>;
  pageInfo: PageInfo;
};

export type ArtistShopConnection = {
  __typename?: 'ArtistShopConnection';
  artistId: Scalars['ID']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  disconnectedAt?: Maybe<Scalars['DateTime']['output']>;
  endedAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  rateSource: Scalars['String']['output'];
  shopCutPercent?: Maybe<Scalars['Int']['output']>;
  shopId: Scalars['ID']['output'];
  startedAt: Scalars['DateTime']['output'];
  status: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type AutoResponse = {
  __typename?: 'AutoResponse';
  active: Scalars['Boolean']['output'];
  artistUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  emailBodyTemplate?: Maybe<Scalars['String']['output']>;
  emailEnabled: Scalars['Boolean']['output'];
  emailSubjectTemplate?: Maybe<Scalars['String']['output']>;
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
  smsEnabled: Scalars['Boolean']['output'];
  smsTemplate?: Maybe<Scalars['String']['output']>;
  trigger: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type BatchShopCutInvoiceResult = {
  __typename?: 'BatchShopCutInvoiceResult';
  appointments: Array<Appointment>;
  invoiceUrl: Scalars['String']['output'];
};

export type BookingRequest = {
  __typename?: 'BookingRequest';
  artistId: Scalars['ID']['output'];
  availability?: Maybe<Scalars['String']['output']>;
  budget?: Maybe<Scalars['String']['output']>;
  client?: Maybe<Client>;
  clientId: Scalars['ID']['output'];
  conversation?: Maybe<Conversation>;
  conversationId: Scalars['ID']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  description: Scalars['String']['output'];
  howHeard?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isCoverUp?: Maybe<Scalars['Boolean']['output']>;
  placement?: Maybe<Scalars['String']['output']>;
  referenceImages?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  resultingAppointment?: Maybe<Appointment>;
  resultingAppointmentId?: Maybe<Scalars['ID']['output']>;
  size?: Maybe<Scalars['String']['output']>;
  source?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type BookingRequestFieldInput = {
  hidden?: InputMaybe<Scalars['Boolean']['input']>;
  key: Scalars['ID']['input'];
  label: Scalars['String']['input'];
  required?: InputMaybe<Scalars['Boolean']['input']>;
};

export type BookingRequestInput = {
  artistId: Scalars['ID']['input'];
  availability?: InputMaybe<Scalars['String']['input']>;
  budget?: InputMaybe<Scalars['String']['input']>;
  description: Scalars['String']['input'];
  email: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  howHeard?: InputMaybe<Scalars['String']['input']>;
  isCoverUp?: InputMaybe<Scalars['Boolean']['input']>;
  lastName: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
  placement?: InputMaybe<Scalars['String']['input']>;
  referenceImages?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  size?: InputMaybe<Scalars['String']['input']>;
  source?: InputMaybe<Scalars['String']['input']>;
};

export type BookingRequestPage = {
  __typename?: 'BookingRequestPage';
  items: Array<BookingRequest>;
  pageInfo: PageInfo;
};

export type BookingSlugAvailability = {
  __typename?: 'BookingSlugAvailability';
  available: Scalars['Boolean']['output'];
  reason?: Maybe<Scalars['String']['output']>;
  slug: Scalars['String']['output'];
};

export type BoothRentCharge = {
  __typename?: 'BoothRentCharge';
  amountCents: Scalars['Int']['output'];
  artistId: Scalars['ID']['output'];
  confirmedAt?: Maybe<Scalars['DateTime']['output']>;
  confirmedByUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  dueDate: Scalars['DateTime']['output'];
  expenseId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  incomeId?: Maybe<Scalars['ID']['output']>;
  markedPaidAt?: Maybe<Scalars['DateTime']['output']>;
  markedPaidByUserId?: Maybe<Scalars['ID']['output']>;
  periodMonth: Scalars['DateTime']['output'];
  shopId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
};

export type BoothRentChargePage = {
  __typename?: 'BoothRentChargePage';
  items: Array<BoothRentCharge>;
  pageInfo: PageInfo;
};

export type BoothRentPlan = {
  __typename?: 'BoothRentPlan';
  active: Scalars['Boolean']['output'];
  amountCents: Scalars['Int']['output'];
  artistId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  dueDayOfMonth: Scalars['Int']['output'];
  effectiveFrom: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  setByUserId: Scalars['ID']['output'];
  shopId: Scalars['ID']['output'];
};

export type ChargeQuote = {
  __typename?: 'ChargeQuote';
  amountDueCents: Scalars['Int']['output'];
  canCharge: Scalars['Boolean']['output'];
  depositCreditCents: Scalars['Int']['output'];
  feeOffsetCents: Scalars['Int']['output'];
  giftCardCents: Scalars['Int']['output'];
  netSubtotalCents: Scalars['Int']['output'];
  source: Scalars['String']['output'];
  subtotalCents: Scalars['Int']['output'];
  taxCents: Scalars['Int']['output'];
  taxableCents: Scalars['Int']['output'];
  tipCents: Scalars['Int']['output'];
  totalCents: Scalars['Int']['output'];
};

export type Client = UserInfo & {
  __typename?: 'Client';
  address?: Maybe<Scalars['String']['output']>;
  appointments: AppointmentPage;
  avatar?: Maybe<Scalars['String']['output']>;
  city?: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  facebook?: Maybe<Scalars['String']['output']>;
  firstName: Scalars['String']['output'];
  flags: Array<ClientFlag>;
  id: Scalars['ID']['output'];
  instagram?: Maybe<Scalars['String']['output']>;
  lastName: Scalars['String']['output'];
  notes?: Maybe<Array<Maybe<IbNote>>>;
  phone: Scalars['String']['output'];
  projects: ProjectPage;
  shopIds?: Maybe<Array<Maybe<Scalars['ID']['output']>>>;
  state?: Maybe<Scalars['String']['output']>;
  stats: ClientStats;
  status?: Maybe<Scalars['Int']['output']>;
  user?: Maybe<User>;
  userId: Scalars['ID']['output'];
  zip?: Maybe<Scalars['String']['output']>;
};


export type ClientAppointmentsArgs = {
  page?: InputMaybe<PageInput>;
};


export type ClientProjectsArgs = {
  page?: InputMaybe<PageInput>;
};

export type ClientAccountResult = {
  __typename?: 'ClientAccountResult';
  client: Client;
  isNewAccount: Scalars['Boolean']['output'];
};

export type ClientFlag = {
  __typename?: 'ClientFlag';
  appointment?: Maybe<Appointment>;
  appointmentId?: Maybe<Scalars['ID']['output']>;
  clientId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  createdBy?: Maybe<User>;
  createdByUserId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  note?: Maybe<Scalars['String']['output']>;
  resolvedAt?: Maybe<Scalars['DateTime']['output']>;
  resolvedBy?: Maybe<User>;
  resolvedByUserId?: Maybe<Scalars['ID']['output']>;
  shopId?: Maybe<Scalars['ID']['output']>;
  systemGenerated: Scalars['Boolean']['output'];
  type?: Maybe<ClientFlagType>;
  typeKey: Scalars['String']['output'];
};

export type ClientFlagType = {
  __typename?: 'ClientFlagType';
  active: Scalars['Boolean']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
  systemGenerated: Scalars['Boolean']['output'];
};

export type ClientInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  avatar?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  facebook?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  instagram?: InputMaybe<Scalars['String']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  state?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['Int']['input']>;
  userId?: InputMaybe<Scalars['ID']['input']>;
  zip?: InputMaybe<Scalars['String']['input']>;
};

export type ClientPage = {
  __typename?: 'ClientPage';
  items: Array<Client>;
  pageInfo: PageInfo;
};

export type ClientStats = {
  __typename?: 'ClientStats';
  averageTipCents: Scalars['Int']['output'];
  completedSessionCount: Scalars['Int']['output'];
  projectCount: Scalars['Int']['output'];
  tippedSessionCount: Scalars['Int']['output'];
  totalSpentCents: Scalars['Int']['output'];
  totalTipsCents: Scalars['Int']['output'];
  upcomingAppointmentCount: Scalars['Int']['output'];
};

export type Conversation = {
  __typename?: 'Conversation';
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  members: Array<Scalars['ID']['output']>;
  membersInfo?: Maybe<Array<Maybe<User>>>;
  messages?: Maybe<Array<Maybe<Message>>>;
  unreadCount: Scalars['Int']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type ConversationInput = {
  createdAt?: InputMaybe<Scalars['DateTime']['input']>;
  id: Scalars['ID']['input'];
  members: Array<Scalars['ID']['input']>;
  updatedAt?: InputMaybe<Scalars['DateTime']['input']>;
};

export type CreateArtistAccountInput = {
  bookingSlug?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  facebook?: InputMaybe<Scalars['String']['input']>;
  firstName: Scalars['String']['input'];
  hourlyRate?: InputMaybe<Scalars['Int']['input']>;
  instagram?: InputMaybe<Scalars['String']['input']>;
  lastName: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type CreateArtistGiftCardInput = {
  applyFeeOffset?: InputMaybe<Scalars['Boolean']['input']>;
  faceValueCents: Scalars['Int']['input'];
  paymentMethod: Scalars['String']['input'];
  pending?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateAutoResponseInput = {
  emailBodyTemplate?: InputMaybe<Scalars['String']['input']>;
  emailEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  emailSubjectTemplate?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  shopId?: InputMaybe<Scalars['ID']['input']>;
  smsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  smsTemplate?: InputMaybe<Scalars['String']['input']>;
  trigger: Scalars['String']['input'];
};

export type CreateClientAccountInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  facebook?: InputMaybe<Scalars['String']['input']>;
  firstName: Scalars['String']['input'];
  instagram?: InputMaybe<Scalars['String']['input']>;
  lastName: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
  state?: InputMaybe<Scalars['String']['input']>;
  zip?: InputMaybe<Scalars['String']['input']>;
};

export type CreateExpenseTypeInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  shopId?: InputMaybe<Scalars['ID']['input']>;
};

export type CreateFormInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  fields: Array<FormFieldInput>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  shopUseOnly?: InputMaybe<Scalars['Boolean']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
};

export type CreateIncomeTypeInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  shopId?: InputMaybe<Scalars['ID']['input']>;
};

export type CreateRecurringExpenseInput = {
  amountCents: Scalars['Int']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  expenseTypeId: Scalars['ID']['input'];
  frequency: Scalars['String']['input'];
  shopId?: InputMaybe<Scalars['ID']['input']>;
  startDate: Scalars['DateTime']['input'];
};

export type CreateShopGiftCardInput = {
  applyFeeOffset?: InputMaybe<Scalars['Boolean']['input']>;
  faceValueCents: Scalars['Int']['input'];
  paymentMethod: Scalars['String']['input'];
  pending?: InputMaybe<Scalars['Boolean']['input']>;
  shopId: Scalars['ID']['input'];
};

export type CreateStaffAccountInput = {
  email: Scalars['String']['input'];
  facebook?: InputMaybe<Scalars['String']['input']>;
  firstName: Scalars['String']['input'];
  instagram?: InputMaybe<Scalars['String']['input']>;
  lastName: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type EventLogChange = {
  __typename?: 'EventLogChange';
  field: Scalars['String']['output'];
  from?: Maybe<Scalars['String']['output']>;
  to?: Maybe<Scalars['String']['output']>;
};

export type EventLogEntry = {
  __typename?: 'EventLogEntry';
  action: Scalars['String']['output'];
  actorName: Scalars['String']['output'];
  actorUserId: Scalars['ID']['output'];
  changes: Array<EventLogChange>;
  createdAt: Scalars['DateTime']['output'];
  entityId: Scalars['ID']['output'];
  entityType: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
  summary: Scalars['String']['output'];
};

export type EventLogFilter = {
  actorUserId?: InputMaybe<Scalars['ID']['input']>;
  entityType?: InputMaybe<Scalars['String']['input']>;
  from?: InputMaybe<Scalars['DateTime']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  to?: InputMaybe<Scalars['DateTime']['input']>;
};

export type EventLogPage = {
  __typename?: 'EventLogPage';
  items: Array<EventLogEntry>;
  pageInfo: PageInfo;
};

export type Expense = {
  __typename?: 'Expense';
  amountCents: Scalars['Int']['output'];
  artistUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  createdBy?: Maybe<User>;
  createdByUserId: Scalars['ID']['output'];
  date: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  expenseType?: Maybe<ExpenseType>;
  expenseTypeId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  recurringExpenseId?: Maybe<Scalars['ID']['output']>;
  shopId?: Maybe<Scalars['ID']['output']>;
};

export type ExpensePage = {
  __typename?: 'ExpensePage';
  items: Array<Expense>;
  pageInfo: PageInfo;
};

export type ExpenseType = {
  __typename?: 'ExpenseType';
  active: Scalars['Boolean']['output'];
  artistUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
};

export type Form = {
  __typename?: 'Form';
  allowGuestSubmissions: Scalars['Boolean']['output'];
  artistUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  createdBy?: Maybe<User>;
  createdByUserId: Scalars['ID']['output'];
  description?: Maybe<Scalars['String']['output']>;
  fields: Array<FormField>;
  id: Scalars['ID']['output'];
  publicToken?: Maybe<Scalars['ID']['output']>;
  shopId?: Maybe<Scalars['ID']['output']>;
  shopUseOnly: Scalars['Boolean']['output'];
  slug?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  systemKey?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type FormAnalytics = {
  __typename?: 'FormAnalytics';
  fields: Array<FormFieldAnalytics>;
  formId: Scalars['ID']['output'];
  responsesByDay: Array<FormResponsesByDay>;
  totalResponses: Scalars['Int']['output'];
};

export type FormAnswer = {
  __typename?: 'FormAnswer';
  dateValue?: Maybe<Scalars['DateTime']['output']>;
  fieldKey: Scalars['ID']['output'];
  fileUrls: Array<Scalars['String']['output']>;
  selectedOptions: Array<Scalars['String']['output']>;
  signature?: Maybe<FormSignature>;
  textValue?: Maybe<Scalars['String']['output']>;
};

export type FormAnswerInput = {
  dateValue?: InputMaybe<Scalars['DateTime']['input']>;
  fieldKey: Scalars['ID']['input'];
  fileUrls?: InputMaybe<Array<Scalars['String']['input']>>;
  selectedOptions?: InputMaybe<Array<Scalars['String']['input']>>;
  signedName?: InputMaybe<Scalars['String']['input']>;
  textValue?: InputMaybe<Scalars['String']['input']>;
};

export type FormField = {
  __typename?: 'FormField';
  helpText?: Maybe<Scalars['String']['output']>;
  hidden: Scalars['Boolean']['output'];
  key: Scalars['ID']['output'];
  label: Scalars['String']['output'];
  options: Array<Scalars['String']['output']>;
  required: Scalars['Boolean']['output'];
  type: Scalars['String']['output'];
};

export type FormFieldAnalytics = {
  __typename?: 'FormFieldAnalytics';
  answeredCount: Scalars['Int']['output'];
  fieldKey: Scalars['ID']['output'];
  label: Scalars['String']['output'];
  optionCounts: Array<FormOptionCount>;
  type: Scalars['String']['output'];
};

export type FormFieldInput = {
  helpText?: InputMaybe<Scalars['String']['input']>;
  key?: InputMaybe<Scalars['ID']['input']>;
  label: Scalars['String']['input'];
  options?: InputMaybe<Array<Scalars['String']['input']>>;
  required?: InputMaybe<Scalars['Boolean']['input']>;
  type: Scalars['String']['input'];
};

export type FormLinkSummary = {
  __typename?: 'FormLinkSummary';
  slug: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

export type FormOptionCount = {
  __typename?: 'FormOptionCount';
  count: Scalars['Int']['output'];
  option: Scalars['String']['output'];
};

export type FormPage = {
  __typename?: 'FormPage';
  items: Array<Form>;
  pageInfo: PageInfo;
};

export type FormResponse = {
  __typename?: 'FormResponse';
  answers: Array<FormAnswer>;
  artistUserId?: Maybe<Scalars['ID']['output']>;
  client?: Maybe<Client>;
  clientId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  fieldsSnapshot: Array<FormField>;
  formId: Scalars['ID']['output'];
  formTitle: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
  source: Scalars['String']['output'];
  submittedBy?: Maybe<User>;
  submittedByUserId: Scalars['ID']['output'];
  submitterIp?: Maybe<Scalars['String']['output']>;
};

export type FormResponsePage = {
  __typename?: 'FormResponsePage';
  items: Array<FormResponse>;
  pageInfo: PageInfo;
};

export type FormResponsesByDay = {
  __typename?: 'FormResponsesByDay';
  count: Scalars['Int']['output'];
  date: Scalars['DateTime']['output'];
};

export type FormSignature = {
  __typename?: 'FormSignature';
  signedAt?: Maybe<Scalars['DateTime']['output']>;
  signedName?: Maybe<Scalars['String']['output']>;
};

export type GiftCard = {
  __typename?: 'GiftCard';
  balanceCents: Scalars['Int']['output'];
  code: Scalars['String']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  faceValueCents: Scalars['Int']['output'];
  feeOffsetCents: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  issuerArtist?: Maybe<Artist>;
  issuerArtistId?: Maybe<Scalars['ID']['output']>;
  issuerType: Scalars['String']['output'];
  paymentMethod?: Maybe<Scalars['String']['output']>;
  saleStatus: Scalars['String']['output'];
  shop?: Maybe<Shop>;
  shopCutCents?: Maybe<Scalars['Int']['output']>;
  shopCutConfirmedAt?: Maybe<Scalars['DateTime']['output']>;
  shopCutConfirmedBy?: Maybe<Scalars['ID']['output']>;
  shopCutMarkedPaidAt?: Maybe<Scalars['DateTime']['output']>;
  shopCutMarkedPaidBy?: Maybe<Scalars['ID']['output']>;
  shopCutPaymentMethod?: Maybe<Scalars['String']['output']>;
  shopCutPercentApplied?: Maybe<Scalars['Int']['output']>;
  shopCutSquareInvoiceId?: Maybe<Scalars['String']['output']>;
  shopCutStatus: Scalars['String']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
  soldAt: Scalars['DateTime']['output'];
  soldBy?: Maybe<User>;
  soldByUserId: Scalars['ID']['output'];
  squarePaymentId?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type GiftCardLiabilityReport = {
  __typename?: 'GiftCardLiabilityReport';
  cardCount: Scalars['Int']['output'];
  oldestIssuedAt?: Maybe<Scalars['DateTime']['output']>;
  outstandingBalanceCents: Scalars['Int']['output'];
};

export type GiftCardRedemption = {
  __typename?: 'GiftCardRedemption';
  amountCents: Scalars['Int']['output'];
  appointment?: Maybe<Appointment>;
  appointmentId: Scalars['ID']['output'];
  giftCardId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  redeemedAt: Scalars['DateTime']['output'];
  redeemedByUserId: Scalars['ID']['output'];
  shopPayoutCents?: Maybe<Scalars['Int']['output']>;
};

export type GiftCardShopCutInvoiceResult = {
  __typename?: 'GiftCardShopCutInvoiceResult';
  giftCard: GiftCard;
  invoiceUrl: Scalars['String']['output'];
};

export type IbImage = {
  __typename?: 'IBImage';
  avatar?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  tags?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  title?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uploadedByDisplayName?: Maybe<Scalars['String']['output']>;
  url: Scalars['String']['output'];
  userId: Scalars['ID']['output'];
  userInfo?: Maybe<User>;
};

export type IbImageInput = {
  avatar?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['DateTime']['input']>;
  id: Scalars['ID']['input'];
  tags?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  title?: InputMaybe<Scalars['String']['input']>;
  updatedAt?: InputMaybe<Scalars['DateTime']['input']>;
  uploadedByDisplayName?: InputMaybe<Scalars['String']['input']>;
  url: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
};

export type IbNote = {
  __typename?: 'IBNote';
  author: Scalars['String']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  note: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type IbNoteInput = {
  author: Scalars['String']['input'];
  createdAt?: InputMaybe<Scalars['DateTime']['input']>;
  id: Scalars['ID']['input'];
  note: Scalars['String']['input'];
  updatedAt?: InputMaybe<Scalars['DateTime']['input']>;
};

export type InboxItem = {
  __typename?: 'InboxItem';
  amountCents?: Maybe<Scalars['Int']['output']>;
  body?: Maybe<Scalars['String']['output']>;
  category: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  doneAt?: Maybe<Scalars['DateTime']['output']>;
  isCondition: Scalars['Boolean']['output'];
  key: Scalars['ID']['output'];
  readAt?: Maybe<Scalars['DateTime']['output']>;
  subjectId?: Maybe<Scalars['ID']['output']>;
  subjectType?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type InboxSummary = {
  __typename?: 'InboxSummary';
  items: Array<InboxItem>;
  unreadCount: Scalars['Int']['output'];
};

export type Income = {
  __typename?: 'Income';
  amountCents: Scalars['Int']['output'];
  artistUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  createdBy?: Maybe<User>;
  createdByUserId: Scalars['ID']['output'];
  date: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  incomeType?: Maybe<IncomeType>;
  incomeTypeId: Scalars['ID']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
};

export type IncomePage = {
  __typename?: 'IncomePage';
  items: Array<Income>;
  pageInfo: PageInfo;
};

export type IncomeType = {
  __typename?: 'IncomeType';
  active: Scalars['Boolean']['output'];
  artistUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
};

export type Message = {
  __typename?: 'Message';
  conversationId: Scalars['ID']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  imageUrls: Array<Scalars['String']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  senderId: Scalars['ID']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  user?: Maybe<User>;
};

export type MessageInput = {
  conversationId: Scalars['ID']['input'];
  createdAt?: InputMaybe<Scalars['DateTime']['input']>;
  id: Scalars['ID']['input'];
  message: Scalars['String']['input'];
  senderId: Scalars['ID']['input'];
  updatedAt?: InputMaybe<Scalars['DateTime']['input']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  applyDeposit?: Maybe<Appointment>;
  archiveArtist?: Maybe<Artist>;
  archiveAutoResponse: AutoResponse;
  archiveClient?: Maybe<Client>;
  archiveForm: Form;
  archiveStaff?: Maybe<Staff>;
  assignSharedImageToProject: SharedImage;
  cancelSession: Appointment;
  changePassword: User;
  confirmBoothRentPaid: BoothRentCharge;
  confirmGiftCardShopCutPaid: GiftCard;
  confirmShopCutPaid: Appointment;
  connectArtistToShop: ArtistShopConnection;
  convertBookingRequest: BookingRequest;
  createAppointment?: Maybe<Appointment>;
  createArtist: Artist;
  createArtistAccount: ArtistAccountResult;
  createArtistGiftCard: GiftCard;
  createAutoResponse: AutoResponse;
  createBatchShopCutInvoice: BatchShopCutInvoiceResult;
  createBookingRequest: BookingRequest;
  createClient: Client;
  createClientAccount: ClientAccountResult;
  createConversation: Conversation;
  createExpenseType: ExpenseType;
  createForm: Form;
  createGiftCardShopCutInvoice: GiftCardShopCutInvoiceResult;
  createIncomeType: IncomeType;
  createMessage: Message;
  createProject: Project;
  createRecurringExpense: RecurringExpense;
  createShop: Shop;
  createShopCutInvoice: ShopCutInvoiceResult;
  createShopGiftCard: GiftCard;
  createStaff: Staff;
  createStaffAccount: StaffAccountResult;
  deleteAppointment?: Maybe<Scalars['String']['output']>;
  deleteExpense: Scalars['Boolean']['output'];
  deleteForm: Scalars['Boolean']['output'];
  deleteIncome: Scalars['Boolean']['output'];
  deleteRecurringExpense: Scalars['Boolean']['output'];
  disconnectArtistFromShop: ArtistShopConnection;
  disconnectMySquare: SquareConnection;
  disconnectShopSquare: Shop;
  login: User;
  markBoothRentPaidManually: BoothRentCharge;
  markConversationRead: Conversation;
  markConversationUnread: Conversation;
  markGiftCardShopCutPaidManually: GiftCard;
  markNotificationsDone: Scalars['Int']['output'];
  markNotificationsRead: Scalars['Int']['output'];
  markShopCutPaidManually: Appointment;
  publishForm: Form;
  raiseClientFlag: ClientFlag;
  reassignBookingRequest: BookingRequest;
  recordAdjustment: Adjustment;
  recordDeposit?: Maybe<Appointment>;
  recordExpense: Expense;
  recordIncome: Income;
  redactClient?: Maybe<RedactionResult>;
  redeemGiftCard: RedeemGiftCardResult;
  registerAccount: User;
  registerDeviceToken: Scalars['Boolean']['output'];
  removeSharedImageFromList: Scalars['Boolean']['output'];
  requestPasswordReset: Scalars['Boolean']['output'];
  rescheduleSession: Appointment;
  resetSessionTimer: Appointment;
  resetSystemMessageTemplate: Scalars['Boolean']['output'];
  resolveClientFlag: ClientFlag;
  sendAutoResponseNow: Scalars['Boolean']['output'];
  sendGuestMessage: Message;
  setArtistShopRateSource: ArtistShopConnection;
  setBoothRentPlan: BoothRentPlan;
  setFormGuestAccess: Form;
  setPasswordWithToken: Scalars['Boolean']['output'];
  setShopCutRate: ShopCutRate;
  startSessionTimer: Appointment;
  stopSessionTimer: Appointment;
  submitFormResponse: FormResponse;
  unarchiveArtist?: Maybe<Artist>;
  unarchiveClient?: Maybe<Client>;
  unarchiveStaff?: Maybe<Staff>;
  unregisterDeviceToken: Scalars['Boolean']['output'];
  updateAppointment?: Maybe<Appointment>;
  updateArtist?: Maybe<Artist>;
  updateArtistRateSettings: Artist;
  updateAutoResponse: AutoResponse;
  updateBookingRequestFields: Form;
  updateClient?: Maybe<Client>;
  updateClientNotes?: Maybe<Client>;
  updateConversation?: Maybe<Conversation>;
  updateExpense: Expense;
  updateExpenseType: ExpenseType;
  updateForm: Form;
  updateIncome: Income;
  updateIncomeType: IncomeType;
  updateMessage?: Maybe<Message>;
  updateMyBookingSlug: Artist;
  updateMyShopFormSlug: Shop;
  updateNotificationSettings: NotificationSettings;
  updateProject?: Maybe<Project>;
  updateProjectNotes?: Maybe<Project>;
  updateProjectTags?: Maybe<Project>;
  updateRecurringExpense: RecurringExpense;
  updateReminderSettings: ReminderSettings;
  updateResponseTimeSettings: ResponseTimeSettings;
  updateSharedImageTags: SharedImage;
  updateShop?: Maybe<Shop>;
  updateSquarePricingSettings: SquarePricingSettings;
  updateStaff?: Maybe<Staff>;
  updateSystemMessageTemplate: SystemMessageTemplate;
  updateUser: User;
};


export type MutationApplyDepositArgs = {
  depositAppointmentId: Scalars['ID']['input'];
  targetAppointmentId: Scalars['ID']['input'];
};


export type MutationArchiveArtistArgs = {
  artistId: Scalars['ID']['input'];
};


export type MutationArchiveAutoResponseArgs = {
  autoResponseId: Scalars['ID']['input'];
};


export type MutationArchiveClientArgs = {
  clientId: Scalars['ID']['input'];
};


export type MutationArchiveFormArgs = {
  formId: Scalars['ID']['input'];
};


export type MutationArchiveStaffArgs = {
  staffId: Scalars['ID']['input'];
};


export type MutationAssignSharedImageToProjectArgs = {
  imageType: Scalars['String']['input'];
  projectId: Scalars['ID']['input'];
  sharedImageId: Scalars['ID']['input'];
};


export type MutationCancelSessionArgs = {
  appointmentId: Scalars['ID']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
};


export type MutationChangePasswordArgs = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};


export type MutationConfirmBoothRentPaidArgs = {
  boothRentChargeId: Scalars['ID']['input'];
};


export type MutationConfirmGiftCardShopCutPaidArgs = {
  giftCardId: Scalars['ID']['input'];
};


export type MutationConfirmShopCutPaidArgs = {
  appointmentId: Scalars['ID']['input'];
};


export type MutationConnectArtistToShopArgs = {
  artistId: Scalars['ID']['input'];
  confirmTransfer?: InputMaybe<Scalars['Boolean']['input']>;
  shopId: Scalars['ID']['input'];
};


export type MutationConvertBookingRequestArgs = {
  appointmentInput?: InputMaybe<AppointmentInput>;
  bookingRequestId: Scalars['ID']['input'];
  outcome: Scalars['String']['input'];
  projectTitle?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateAppointmentArgs = {
  appointmentInput?: InputMaybe<AppointmentInput>;
};


export type MutationCreateArtistArgs = {
  address: Scalars['String']['input'];
  avatar: Scalars['String']['input'];
  city: Scalars['String']['input'];
  email: Scalars['String']['input'];
  endDate?: InputMaybe<Scalars['String']['input']>;
  facebook: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  hourlyRate?: InputMaybe<Scalars['Int']['input']>;
  instagram: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  phone: Scalars['String']['input'];
  shopId: Scalars['ID']['input'];
  startDate: Scalars['String']['input'];
  state: Scalars['String']['input'];
  status?: InputMaybe<Scalars['Int']['input']>;
  title: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
  zip: Scalars['String']['input'];
};


export type MutationCreateArtistAccountArgs = {
  input: CreateArtistAccountInput;
};


export type MutationCreateArtistGiftCardArgs = {
  input: CreateArtistGiftCardInput;
};


export type MutationCreateAutoResponseArgs = {
  input: CreateAutoResponseInput;
};


export type MutationCreateBatchShopCutInvoiceArgs = {
  appointmentIds: Array<Scalars['ID']['input']>;
  paymentMethod?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateBookingRequestArgs = {
  bookingRequestInput: BookingRequestInput;
};


export type MutationCreateClientArgs = {
  address: Scalars['String']['input'];
  avatar: Scalars['String']['input'];
  city: Scalars['String']['input'];
  email: Scalars['String']['input'];
  facebook: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  instagram: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  phone: Scalars['String']['input'];
  state: Scalars['String']['input'];
  userId: Scalars['ID']['input'];
  zip: Scalars['String']['input'];
};


export type MutationCreateClientAccountArgs = {
  input: CreateClientAccountInput;
};


export type MutationCreateConversationArgs = {
  members?: InputMaybe<Array<Scalars['ID']['input']>>;
};


export type MutationCreateExpenseTypeArgs = {
  input: CreateExpenseTypeInput;
};


export type MutationCreateFormArgs = {
  input: CreateFormInput;
};


export type MutationCreateGiftCardShopCutInvoiceArgs = {
  giftCardId: Scalars['ID']['input'];
  paymentMethod?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateIncomeTypeArgs = {
  input: CreateIncomeTypeInput;
};


export type MutationCreateMessageArgs = {
  conversationId: Scalars['ID']['input'];
  imageUrls?: InputMaybe<Array<Scalars['String']['input']>>;
  message?: InputMaybe<Scalars['String']['input']>;
  senderId: Scalars['ID']['input'];
};


export type MutationCreateProjectArgs = {
  artistId: Scalars['ID']['input'];
  bodyImages?: InputMaybe<Array<InputMaybe<IbImageInput>>>;
  clientId: Scalars['ID']['input'];
  description: Scalars['String']['input'];
  designImages?: InputMaybe<Array<InputMaybe<IbImageInput>>>;
  materialsUsed?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  notes?: InputMaybe<Array<InputMaybe<IbNoteInput>>>;
  palette?: InputMaybe<Scalars['String']['input']>;
  placement?: InputMaybe<Scalars['String']['input']>;
  referenceImages?: InputMaybe<Array<InputMaybe<IbImageInput>>>;
  size?: InputMaybe<Scalars['String']['input']>;
  status: Scalars['String']['input'];
  tags?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  title: Scalars['String']['input'];
};


export type MutationCreateRecurringExpenseArgs = {
  input: CreateRecurringExpenseInput;
};


export type MutationCreateShopArgs = {
  address?: InputMaybe<Scalars['String']['input']>;
  billingType?: InputMaybe<Scalars['Int']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  facebook?: InputMaybe<Scalars['String']['input']>;
  hourlyRate?: InputMaybe<Scalars['Int']['input']>;
  instagram?: InputMaybe<Scalars['String']['input']>;
  logo?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
  shopMinimum?: InputMaybe<Scalars['Int']['input']>;
  state?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['Int']['input']>;
  website?: InputMaybe<Scalars['String']['input']>;
  zip?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateShopCutInvoiceArgs = {
  appointmentId: Scalars['ID']['input'];
  paymentMethod?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateShopGiftCardArgs = {
  input: CreateShopGiftCardInput;
};


export type MutationCreateStaffArgs = {
  address: Scalars['String']['input'];
  avatar: Scalars['String']['input'];
  city: Scalars['String']['input'];
  email: Scalars['String']['input'];
  facebook: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  instagram: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  phone: Scalars['String']['input'];
  shopId: Scalars['ID']['input'];
  state: Scalars['String']['input'];
  status: Scalars['Int']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['ID']['input'];
  zip: Scalars['String']['input'];
};


export type MutationCreateStaffAccountArgs = {
  input: CreateStaffAccountInput;
};


export type MutationDeleteAppointmentArgs = {
  appointmentId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationDeleteExpenseArgs = {
  expenseId: Scalars['ID']['input'];
};


export type MutationDeleteFormArgs = {
  formId: Scalars['ID']['input'];
};


export type MutationDeleteIncomeArgs = {
  incomeId: Scalars['ID']['input'];
};


export type MutationDeleteRecurringExpenseArgs = {
  recurringExpenseId: Scalars['ID']['input'];
};


export type MutationDisconnectArtistFromShopArgs = {
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
};


export type MutationDisconnectShopSquareArgs = {
  shopId: Scalars['ID']['input'];
};


export type MutationLoginArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationMarkBoothRentPaidManuallyArgs = {
  boothRentChargeId: Scalars['ID']['input'];
};


export type MutationMarkConversationReadArgs = {
  conversationId: Scalars['ID']['input'];
};


export type MutationMarkConversationUnreadArgs = {
  conversationId: Scalars['ID']['input'];
};


export type MutationMarkGiftCardShopCutPaidManuallyArgs = {
  giftCardId: Scalars['ID']['input'];
};


export type MutationMarkNotificationsDoneArgs = {
  notificationIds: Array<Scalars['ID']['input']>;
};


export type MutationMarkNotificationsReadArgs = {
  notificationIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};


export type MutationMarkShopCutPaidManuallyArgs = {
  appointmentId: Scalars['ID']['input'];
};


export type MutationPublishFormArgs = {
  formId: Scalars['ID']['input'];
};


export type MutationRaiseClientFlagArgs = {
  input: RaiseClientFlagInput;
};


export type MutationReassignBookingRequestArgs = {
  bookingRequestId: Scalars['ID']['input'];
  newArtistId: Scalars['ID']['input'];
};


export type MutationRecordAdjustmentArgs = {
  input: RecordAdjustmentInput;
};


export type MutationRecordDepositArgs = {
  appointmentId: Scalars['ID']['input'];
  depositCents: Scalars['Int']['input'];
  paymentMethod: Scalars['String']['input'];
  pending?: InputMaybe<Scalars['Boolean']['input']>;
  squarePaymentId?: InputMaybe<Scalars['String']['input']>;
};


export type MutationRecordExpenseArgs = {
  input: RecordExpenseInput;
};


export type MutationRecordIncomeArgs = {
  input: RecordIncomeInput;
};


export type MutationRedactClientArgs = {
  clientId: Scalars['ID']['input'];
};


export type MutationRedeemGiftCardArgs = {
  amountCents: Scalars['Int']['input'];
  appointmentId: Scalars['ID']['input'];
  code: Scalars['String']['input'];
};


export type MutationRegisterAccountArgs = {
  input: RegisterAccountInput;
};


export type MutationRegisterDeviceTokenArgs = {
  platform: Scalars['String']['input'];
  token: Scalars['String']['input'];
};


export type MutationRemoveSharedImageFromListArgs = {
  sharedImageId: Scalars['ID']['input'];
};


export type MutationRequestPasswordResetArgs = {
  email: Scalars['String']['input'];
};


export type MutationRescheduleSessionArgs = {
  appointmentId: Scalars['ID']['input'];
  newDate: Scalars['String']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
};


export type MutationResetSessionTimerArgs = {
  appointmentId: Scalars['ID']['input'];
};


export type MutationResetSystemMessageTemplateArgs = {
  key: Scalars['String']['input'];
  shopId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationResolveClientFlagArgs = {
  flagId: Scalars['ID']['input'];
};


export type MutationSendAutoResponseNowArgs = {
  appointmentId?: InputMaybe<Scalars['ID']['input']>;
  autoResponseId: Scalars['ID']['input'];
  clientId: Scalars['ID']['input'];
};


export type MutationSendGuestMessageArgs = {
  message: Scalars['String']['input'];
  token: Scalars['String']['input'];
};


export type MutationSetArtistShopRateSourceArgs = {
  artistId: Scalars['ID']['input'];
  rateSource: Scalars['String']['input'];
  shopId: Scalars['ID']['input'];
};


export type MutationSetBoothRentPlanArgs = {
  amountCents: Scalars['Int']['input'];
  artistId: Scalars['ID']['input'];
  dueDayOfMonth: Scalars['Int']['input'];
  effectiveFrom?: InputMaybe<Scalars['DateTime']['input']>;
  shopId: Scalars['ID']['input'];
};


export type MutationSetFormGuestAccessArgs = {
  allow: Scalars['Boolean']['input'];
  formId: Scalars['ID']['input'];
};


export type MutationSetPasswordWithTokenArgs = {
  newPassword: Scalars['String']['input'];
  token: Scalars['String']['input'];
};


export type MutationSetShopCutRateArgs = {
  artistId: Scalars['ID']['input'];
  compensationModel?: InputMaybe<Scalars['String']['input']>;
  effectiveFrom?: InputMaybe<Scalars['DateTime']['input']>;
  note?: InputMaybe<Scalars['String']['input']>;
  percent: Scalars['Int']['input'];
  shopId: Scalars['ID']['input'];
};


export type MutationStartSessionTimerArgs = {
  appointmentId: Scalars['ID']['input'];
};


export type MutationStopSessionTimerArgs = {
  appointmentId: Scalars['ID']['input'];
};


export type MutationSubmitFormResponseArgs = {
  input: SubmitFormResponseInput;
};


export type MutationUnarchiveArtistArgs = {
  artistId: Scalars['ID']['input'];
};


export type MutationUnarchiveClientArgs = {
  clientId: Scalars['ID']['input'];
};


export type MutationUnarchiveStaffArgs = {
  staffId: Scalars['ID']['input'];
};


export type MutationUnregisterDeviceTokenArgs = {
  token: Scalars['String']['input'];
};


export type MutationUpdateAppointmentArgs = {
  appointmentInput?: InputMaybe<AppointmentInput>;
};


export type MutationUpdateArtistArgs = {
  artist?: InputMaybe<ArtistInput>;
};


export type MutationUpdateArtistRateSettingsArgs = {
  billingType: Scalars['String']['input'];
  flatRate?: InputMaybe<Scalars['Int']['input']>;
  hourlyRate?: InputMaybe<Scalars['Int']['input']>;
};


export type MutationUpdateAutoResponseArgs = {
  input: UpdateAutoResponseInput;
};


export type MutationUpdateBookingRequestFieldsArgs = {
  fields: Array<BookingRequestFieldInput>;
  formId: Scalars['ID']['input'];
};


export type MutationUpdateClientArgs = {
  client?: InputMaybe<ClientInput>;
};


export type MutationUpdateClientNotesArgs = {
  clientId: Scalars['ID']['input'];
  notes?: InputMaybe<Array<InputMaybe<IbNoteInput>>>;
};


export type MutationUpdateConversationArgs = {
  conversation?: InputMaybe<ConversationInput>;
};


export type MutationUpdateExpenseArgs = {
  input: UpdateExpenseInput;
};


export type MutationUpdateExpenseTypeArgs = {
  input: UpdateExpenseTypeInput;
};


export type MutationUpdateFormArgs = {
  input: UpdateFormInput;
};


export type MutationUpdateIncomeArgs = {
  input: UpdateIncomeInput;
};


export type MutationUpdateIncomeTypeArgs = {
  input: UpdateIncomeTypeInput;
};


export type MutationUpdateMessageArgs = {
  message?: InputMaybe<MessageInput>;
};


export type MutationUpdateMyBookingSlugArgs = {
  slug: Scalars['String']['input'];
};


export type MutationUpdateMyShopFormSlugArgs = {
  shopId: Scalars['ID']['input'];
  slug: Scalars['String']['input'];
};


export type MutationUpdateNotificationSettingsArgs = {
  digestHour?: InputMaybe<Scalars['Int']['input']>;
  prefs?: InputMaybe<NotificationPrefsInput>;
  timezone?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateProjectArgs = {
  project?: InputMaybe<ProjectInput>;
};


export type MutationUpdateProjectNotesArgs = {
  notes?: InputMaybe<Array<InputMaybe<IbNoteInput>>>;
  projectId: Scalars['ID']['input'];
};


export type MutationUpdateProjectTagsArgs = {
  projectId: Scalars['ID']['input'];
  tags?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};


export type MutationUpdateRecurringExpenseArgs = {
  input: UpdateRecurringExpenseInput;
};


export type MutationUpdateReminderSettingsArgs = {
  emailBodyTemplate?: InputMaybe<Scalars['String']['input']>;
  emailEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  emailSubjectTemplate?: InputMaybe<Scalars['String']['input']>;
  rules?: InputMaybe<Array<ReminderRuleInput>>;
  smsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  smsTemplate?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateResponseTimeSettingsArgs = {
  input: UpdateResponseTimeSettingsInput;
};


export type MutationUpdateSharedImageTagsArgs = {
  sharedImageId: Scalars['ID']['input'];
  tags: Array<Scalars['String']['input']>;
};


export type MutationUpdateShopArgs = {
  shop?: InputMaybe<ShopInput>;
};


export type MutationUpdateSquarePricingSettingsArgs = {
  squareFeeOffsetCents: Scalars['Int']['input'];
  taxRateBasisPoints: Scalars['Int']['input'];
};


export type MutationUpdateStaffArgs = {
  staff?: InputMaybe<StaffInput>;
};


export type MutationUpdateSystemMessageTemplateArgs = {
  input: UpdateSystemMessageTemplateInput;
};


export type MutationUpdateUserArgs = {
  user?: InputMaybe<UserUpdateInput>;
};

export type NotificationPrefs = {
  __typename?: 'NotificationPrefs';
  messageEmail?: Maybe<Scalars['Boolean']['output']>;
  moneyEmail?: Maybe<Scalars['Boolean']['output']>;
  rosterEmail?: Maybe<Scalars['Boolean']['output']>;
  scheduleEmail?: Maybe<Scalars['Boolean']['output']>;
};

export type NotificationPrefsInput = {
  messageEmail?: InputMaybe<Scalars['Boolean']['input']>;
  moneyEmail?: InputMaybe<Scalars['Boolean']['input']>;
  rosterEmail?: InputMaybe<Scalars['Boolean']['input']>;
  scheduleEmail?: InputMaybe<Scalars['Boolean']['input']>;
};

export type NotificationSettings = {
  __typename?: 'NotificationSettings';
  digestHour: Scalars['Int']['output'];
  messageMode: Scalars['String']['output'];
  moneyMode: Scalars['String']['output'];
  prefs: NotificationPrefs;
  rosterMode: Scalars['String']['output'];
  scheduleMode: Scalars['String']['output'];
  timezone: Scalars['String']['output'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  hasMore: Scalars['Boolean']['output'];
  limit: Scalars['Int']['output'];
  offset: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type PageInput = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type PasswordTokenStatus = {
  __typename?: 'PasswordTokenStatus';
  firstName?: Maybe<Scalars['String']['output']>;
  purpose?: Maybe<Scalars['String']['output']>;
  valid: Scalars['Boolean']['output'];
};

export type Project = {
  __typename?: 'Project';
  artist?: Maybe<Artist>;
  artistId: Scalars['ID']['output'];
  bodyImages?: Maybe<Array<Maybe<IbImage>>>;
  bookingRequestId?: Maybe<Scalars['ID']['output']>;
  client?: Maybe<Client>;
  clientId: Scalars['ID']['output'];
  consultAppointment?: Maybe<Appointment>;
  conversation?: Maybe<Conversation>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  depositAvailableCents?: Maybe<Scalars['Int']['output']>;
  depositCollectedCents?: Maybe<Scalars['Int']['output']>;
  deposits?: Maybe<Array<Maybe<Appointment>>>;
  description: Scalars['String']['output'];
  designImages?: Maybe<Array<Maybe<IbImage>>>;
  id: Scalars['ID']['output'];
  materialsUsed?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  notes?: Maybe<Array<Maybe<IbNote>>>;
  palette?: Maybe<Scalars['String']['output']>;
  placement?: Maybe<Scalars['String']['output']>;
  referenceImages?: Maybe<Array<Maybe<IbImage>>>;
  size?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  tags?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  title: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type ProjectInput = {
  artistId: Scalars['ID']['input'];
  bodyImages?: InputMaybe<Array<InputMaybe<IbImageInput>>>;
  clientId: Scalars['ID']['input'];
  description: Scalars['String']['input'];
  designImages?: InputMaybe<Array<InputMaybe<IbImageInput>>>;
  id: Scalars['ID']['input'];
  materialsUsed?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  notes?: InputMaybe<Array<InputMaybe<IbNoteInput>>>;
  palette?: InputMaybe<Scalars['String']['input']>;
  placement?: InputMaybe<Scalars['String']['input']>;
  referenceImages?: InputMaybe<Array<InputMaybe<IbImageInput>>>;
  size?: InputMaybe<Scalars['String']['input']>;
  status: Scalars['String']['input'];
  tags?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  title: Scalars['String']['input'];
};

export type ProjectPage = {
  __typename?: 'ProjectPage';
  items: Array<Project>;
  pageInfo: PageInfo;
};

export type PublicArtistProfile = {
  __typename?: 'PublicArtistProfile';
  archived: Scalars['Boolean']['output'];
  avatar?: Maybe<Scalars['String']['output']>;
  bookingSlug?: Maybe<Scalars['String']['output']>;
  firstName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastName: Scalars['String']['output'];
};

export type PublicForm = {
  __typename?: 'PublicForm';
  description?: Maybe<Scalars['String']['output']>;
  fields: Array<FormField>;
  id: Scalars['ID']['output'];
  title: Scalars['String']['output'];
};

export type PublicFormLookup = {
  __typename?: 'PublicFormLookup';
  form?: Maybe<PublicForm>;
  state: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  checkBookingSlugAvailable: BookingSlugAvailability;
  findClientByEmail?: Maybe<Client>;
  findClientsByEmailPrefix: Array<Client>;
  getAppointment?: Maybe<Appointment>;
  getAppointmentsByArtist: AppointmentPage;
  getAppointmentsByProject?: Maybe<Array<Maybe<Appointment>>>;
  getAppointmentsByShop: AppointmentPage;
  getArtist?: Maybe<Artist>;
  getArtistAnalytics?: Maybe<Analytics>;
  getArtistShopConnections?: Maybe<Array<Maybe<ArtistShopConnection>>>;
  getArtists: ArtistPage;
  getArtistsByShop?: Maybe<Array<Maybe<Artist>>>;
  getAutoResponses: Array<AutoResponse>;
  getAvailableDeposits?: Maybe<Array<Maybe<Appointment>>>;
  getBookingRequest?: Maybe<BookingRequest>;
  getBookingRequestByToken?: Maybe<BookingRequest>;
  getBookingRequests: BookingRequestPage;
  getBoothRentCharges: BoothRentChargePage;
  getBoothRentPlans: Array<BoothRentPlan>;
  getChargeQuote: ChargeQuote;
  getClient?: Maybe<Client>;
  getClientFlagTypes: Array<ClientFlagType>;
  getClients: ClientPage;
  getConversation?: Maybe<Conversation>;
  getConversationsByMemberId?: Maybe<Array<Maybe<Conversation>>>;
  getConversationsByShopId?: Maybe<Array<Conversation>>;
  getEventLogs: EventLogPage;
  getExpenseTypes: Array<ExpenseType>;
  getExpenses: ExpensePage;
  getForm: Form;
  getFormAnalytics: FormAnalytics;
  getFormResponse: FormResponse;
  getFormResponses: FormResponsePage;
  getForms: FormPage;
  getGiftCardByCode?: Maybe<GiftCard>;
  getGiftCardLiabilityReport: GiftCardLiabilityReport;
  getGiftCardRedemptions: Array<GiftCardRedemption>;
  getGiftCardsByShop: Array<GiftCard>;
  getInbox: InboxSummary;
  getIncomeTypes: Array<IncomeType>;
  getIncomes: IncomePage;
  getMessage?: Maybe<Message>;
  getMessagesByConversationId?: Maybe<Array<Message>>;
  getMyFillableForms: Array<Form>;
  getMyFormLinks: Array<FormLinkSummary>;
  getMyGiftCardLiabilityReport: GiftCardLiabilityReport;
  getMyGiftCards: Array<GiftCard>;
  getMySquareAuthorizationUrl: Scalars['String']['output'];
  getMySquareConnection: SquareConnection;
  getMySquareMobileCredentials: SquareMobileCredentials;
  getMySquarePricingSettings: SquarePricingSettings;
  getNotificationSettings: NotificationSettings;
  getOneStaff?: Maybe<Staff>;
  getPendingBookingRequestCount: Scalars['Int']['output'];
  getPendingShopCutConfirmations?: Maybe<Array<Maybe<Appointment>>>;
  getProject?: Maybe<Project>;
  getProjectConversation?: Maybe<Conversation>;
  getProjects: ProjectPage;
  getProjectsByArtist?: Maybe<Array<Maybe<Project>>>;
  getProjectsForClient: Array<Project>;
  getPublicArtistProfile?: Maybe<PublicArtistProfile>;
  getPublicForm?: Maybe<PublicForm>;
  getPublicFormBySlug: PublicFormLookup;
  getRecurringExpenses: Array<RecurringExpense>;
  getReminderSettings: ReminderSettings;
  getResponseTimeSettings: ResponseTimeSettings;
  getSharedImagesForClient: Array<SharedImage>;
  getShop?: Maybe<Shop>;
  getShopAnalytics?: Maybe<Analytics>;
  getShopArtistConnections?: Maybe<Array<Maybe<ArtistShopConnection>>>;
  getShopCutPayoutCandidates: Array<Appointment>;
  getShopCutPayoutCandidatesByShop: Array<Appointment>;
  getShopCutRates: Array<ShopCutRate>;
  getShops?: Maybe<Array<Maybe<Shop>>>;
  getSquareAuthorizationUrl: Scalars['String']['output'];
  getStaff: StaffPage;
  getSystemMessageTemplates: Array<SystemMessageTemplate>;
  getUnreadMessageCount: Scalars['Int']['output'];
  getUser?: Maybe<User>;
  getUserTagColors?: Maybe<Array<Maybe<User>>>;
  inspectPasswordToken: PasswordTokenStatus;
  search: SearchResults;
};


export type QueryCheckBookingSlugAvailableArgs = {
  slug: Scalars['String']['input'];
};


export type QueryFindClientByEmailArgs = {
  email: Scalars['String']['input'];
};


export type QueryFindClientsByEmailPrefixArgs = {
  emailPrefix: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryGetAppointmentArgs = {
  appointmentId: Scalars['ID']['input'];
};


export type QueryGetAppointmentsByArtistArgs = {
  filter?: InputMaybe<AppointmentFilter>;
  page?: InputMaybe<PageInput>;
  userId: Scalars['ID']['input'];
};


export type QueryGetAppointmentsByProjectArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryGetAppointmentsByShopArgs = {
  filter?: InputMaybe<AppointmentFilter>;
  page?: InputMaybe<PageInput>;
  shopId: Scalars['ID']['input'];
};


export type QueryGetArtistArgs = {
  artistId: Scalars['ID']['input'];
};


export type QueryGetArtistAnalyticsArgs = {
  end: Scalars['DateTime']['input'];
  start: Scalars['DateTime']['input'];
  userId: Scalars['ID']['input'];
};


export type QueryGetArtistShopConnectionsArgs = {
  artistId: Scalars['ID']['input'];
};


export type QueryGetArtistsArgs = {
  includeArchived?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<PageInput>;
};


export type QueryGetArtistsByShopArgs = {
  shopId: Scalars['ID']['input'];
};


export type QueryGetAutoResponsesArgs = {
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryGetAvailableDepositsArgs = {
  appointmentId: Scalars['ID']['input'];
};


export type QueryGetBookingRequestArgs = {
  bookingRequestId: Scalars['ID']['input'];
};


export type QueryGetBookingRequestByTokenArgs = {
  token: Scalars['String']['input'];
};


export type QueryGetBookingRequestsArgs = {
  artistId: Scalars['ID']['input'];
  page?: InputMaybe<PageInput>;
  statuses?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryGetBoothRentChargesArgs = {
  artistId?: InputMaybe<Scalars['ID']['input']>;
  page?: InputMaybe<PageInput>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryGetBoothRentPlansArgs = {
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
};


export type QueryGetChargeQuoteArgs = {
  applyFeeOffset?: InputMaybe<Scalars['Boolean']['input']>;
  appointmentId: Scalars['ID']['input'];
  chargeType?: InputMaybe<Scalars['String']['input']>;
  subtotalCentsOverride?: InputMaybe<Scalars['Int']['input']>;
  tipCents?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryGetClientArgs = {
  clientId: Scalars['ID']['input'];
};


export type QueryGetClientFlagTypesArgs = {
  shopId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryGetClientsArgs = {
  includeArchived?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<PageInput>;
};


export type QueryGetConversationArgs = {
  conversationId: Scalars['ID']['input'];
};


export type QueryGetConversationsByMemberIdArgs = {
  memberId: Scalars['ID']['input'];
};


export type QueryGetConversationsByShopIdArgs = {
  shopId: Scalars['ID']['input'];
};


export type QueryGetEventLogsArgs = {
  filter?: InputMaybe<EventLogFilter>;
  page?: InputMaybe<PageInput>;
};


export type QueryGetExpenseTypesArgs = {
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryGetExpensesArgs = {
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  end?: InputMaybe<Scalars['DateTime']['input']>;
  page?: InputMaybe<PageInput>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  start?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryGetFormArgs = {
  formId: Scalars['ID']['input'];
};


export type QueryGetFormAnalyticsArgs = {
  formId: Scalars['ID']['input'];
};


export type QueryGetFormResponseArgs = {
  formResponseId: Scalars['ID']['input'];
};


export type QueryGetFormResponsesArgs = {
  formId: Scalars['ID']['input'];
  page?: InputMaybe<PageInput>;
};


export type QueryGetFormsArgs = {
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  page?: InputMaybe<PageInput>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryGetGiftCardByCodeArgs = {
  code: Scalars['String']['input'];
};


export type QueryGetGiftCardLiabilityReportArgs = {
  shopId: Scalars['ID']['input'];
};


export type QueryGetGiftCardRedemptionsArgs = {
  giftCardId: Scalars['ID']['input'];
};


export type QueryGetGiftCardsByShopArgs = {
  shopId: Scalars['ID']['input'];
};


export type QueryGetInboxArgs = {
  includeRead?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryGetIncomeTypesArgs = {
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryGetIncomesArgs = {
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  end?: InputMaybe<Scalars['DateTime']['input']>;
  page?: InputMaybe<PageInput>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  start?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryGetMessageArgs = {
  messageId: Scalars['ID']['input'];
};


export type QueryGetMessagesByConversationIdArgs = {
  conversationId: Scalars['ID']['input'];
};


export type QueryGetMySquareAuthorizationUrlArgs = {
  platform?: InputMaybe<Scalars['String']['input']>;
};


export type QueryGetOneStaffArgs = {
  staffId: Scalars['ID']['input'];
};


export type QueryGetPendingShopCutConfirmationsArgs = {
  shopId: Scalars['ID']['input'];
};


export type QueryGetProjectArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryGetProjectConversationArgs = {
  artistId: Scalars['ID']['input'];
  clientId: Scalars['ID']['input'];
};


export type QueryGetProjectsArgs = {
  page?: InputMaybe<PageInput>;
};


export type QueryGetProjectsByArtistArgs = {
  artistId: Scalars['ID']['input'];
};


export type QueryGetProjectsForClientArgs = {
  clientId: Scalars['ID']['input'];
};


export type QueryGetPublicArtistProfileArgs = {
  artistId: Scalars['ID']['input'];
};


export type QueryGetPublicFormArgs = {
  publicToken: Scalars['String']['input'];
};


export type QueryGetPublicFormBySlugArgs = {
  formSlug: Scalars['String']['input'];
  ownerHandle: Scalars['String']['input'];
};


export type QueryGetRecurringExpensesArgs = {
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryGetResponseTimeSettingsArgs = {
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryGetSharedImagesForClientArgs = {
  clientId: Scalars['ID']['input'];
};


export type QueryGetShopArgs = {
  shopId: Scalars['ID']['input'];
};


export type QueryGetShopAnalyticsArgs = {
  end: Scalars['DateTime']['input'];
  shopId: Scalars['ID']['input'];
  start: Scalars['DateTime']['input'];
};


export type QueryGetShopArtistConnectionsArgs = {
  shopId: Scalars['ID']['input'];
};


export type QueryGetShopCutPayoutCandidatesArgs = {
  filter?: InputMaybe<AppointmentFilter>;
  userId: Scalars['ID']['input'];
};


export type QueryGetShopCutPayoutCandidatesByShopArgs = {
  filter?: InputMaybe<AppointmentFilter>;
  shopId: Scalars['ID']['input'];
};


export type QueryGetShopCutRatesArgs = {
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
};


export type QueryGetSquareAuthorizationUrlArgs = {
  platform?: InputMaybe<Scalars['String']['input']>;
  shopId: Scalars['ID']['input'];
};


export type QueryGetStaffArgs = {
  includeArchived?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<PageInput>;
};


export type QueryGetSystemMessageTemplatesArgs = {
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryGetUserArgs = {
  userId: Scalars['ID']['input'];
};


export type QueryGetUserTagColorsArgs = {
  shopId: Scalars['ID']['input'];
};


export type QueryInspectPasswordTokenArgs = {
  token: Scalars['String']['input'];
};


export type QuerySearchArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  query: Scalars['String']['input'];
};

export type RaiseClientFlagInput = {
  clientId: Scalars['ID']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  typeKey: Scalars['String']['input'];
};

export type RecordAdjustmentInput = {
  amountCents: Scalars['Int']['input'];
  appointmentId: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};

export type RecordExpenseInput = {
  amountCents: Scalars['Int']['input'];
  date: Scalars['DateTime']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  expenseTypeId: Scalars['ID']['input'];
  shopId?: InputMaybe<Scalars['ID']['input']>;
};

export type RecordIncomeInput = {
  amountCents: Scalars['Int']['input'];
  date: Scalars['DateTime']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  incomeTypeId: Scalars['ID']['input'];
  shopId?: InputMaybe<Scalars['ID']['input']>;
};

export type RecurringExpense = {
  __typename?: 'RecurringExpense';
  active: Scalars['Boolean']['output'];
  amountCents: Scalars['Int']['output'];
  artistUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  createdByUserId: Scalars['ID']['output'];
  description?: Maybe<Scalars['String']['output']>;
  endDate?: Maybe<Scalars['DateTime']['output']>;
  expenseType?: Maybe<ExpenseType>;
  expenseTypeId: Scalars['ID']['output'];
  frequency: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  nextRunDate: Scalars['DateTime']['output'];
  shopId?: Maybe<Scalars['ID']['output']>;
  startDate: Scalars['DateTime']['output'];
};

export type RedactionResult = {
  __typename?: 'RedactionResult';
  appointmentsRetitled: Scalars['Int']['output'];
  clientId: Scalars['ID']['output'];
  projectsAffected: Scalars['Int']['output'];
  userRedacted: Scalars['Boolean']['output'];
};

export type RedeemGiftCardResult = {
  __typename?: 'RedeemGiftCardResult';
  appointment: Appointment;
  giftCard: GiftCard;
  redemption: GiftCardRedemption;
};

export type RegisterAccountInput = {
  accountType: Scalars['String']['input'];
  bookingSlug?: InputMaybe<Scalars['String']['input']>;
  confirmPassword: Scalars['String']['input'];
  email: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  password: Scalars['String']['input'];
  shopName?: InputMaybe<Scalars['String']['input']>;
};

export type ReminderRule = {
  __typename?: 'ReminderRule';
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  offsetMinutes: Scalars['Int']['output'];
};

export type ReminderRuleInput = {
  enabled: Scalars['Boolean']['input'];
  offsetMinutes: Scalars['Int']['input'];
};

export type ReminderSettings = {
  __typename?: 'ReminderSettings';
  emailBodyTemplate?: Maybe<Scalars['String']['output']>;
  emailEnabled: Scalars['Boolean']['output'];
  emailSubjectTemplate?: Maybe<Scalars['String']['output']>;
  rules: Array<ReminderRule>;
  smsEnabled: Scalars['Boolean']['output'];
  smsTemplate?: Maybe<Scalars['String']['output']>;
};

export type ResponseTimeCeiling = {
  __typename?: 'ResponseTimeCeiling';
  initialThresholdMinutes: Scalars['Int']['output'];
  repeatIntervalMinutes: Scalars['Int']['output'];
};

export type ResponseTimeSettings = {
  __typename?: 'ResponseTimeSettings';
  artistUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  initialThresholdMinutes: Scalars['Int']['output'];
  repeatIntervalMinutes: Scalars['Int']['output'];
  setByUserId?: Maybe<Scalars['ID']['output']>;
  shopCeiling?: Maybe<ResponseTimeCeiling>;
  shopId?: Maybe<Scalars['ID']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type SearchResults = {
  __typename?: 'SearchResults';
  clients: Array<Client>;
  images: Array<SharedImage>;
  messages: Array<Message>;
  projects: Array<Project>;
};

export type SharedImage = {
  __typename?: 'SharedImage';
  artistId: Scalars['ID']['output'];
  assignedAt?: Maybe<Scalars['DateTime']['output']>;
  assignedByUserId?: Maybe<Scalars['ID']['output']>;
  assignedImageType?: Maybe<Scalars['String']['output']>;
  assignedProject?: Maybe<Project>;
  assignedProjectId?: Maybe<Scalars['ID']['output']>;
  clientId: Scalars['ID']['output'];
  conversationId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  messageId: Scalars['ID']['output'];
  senderId: Scalars['ID']['output'];
  tags: Array<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  url: Scalars['String']['output'];
  userInfo?: Maybe<User>;
};

export type Shop = {
  __typename?: 'Shop';
  address?: Maybe<Scalars['String']['output']>;
  billingType?: Maybe<Scalars['String']['output']>;
  city?: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  facebook?: Maybe<Scalars['String']['output']>;
  flatRate?: Maybe<Scalars['Int']['output']>;
  formSlug?: Maybe<Scalars['String']['output']>;
  hourlyRate?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  instagram?: Maybe<Scalars['String']['output']>;
  logo?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  phone?: Maybe<Scalars['String']['output']>;
  shopCutPercent?: Maybe<Scalars['Int']['output']>;
  shopMinimum?: Maybe<Scalars['Int']['output']>;
  squareConnected?: Maybe<Scalars['Boolean']['output']>;
  squareConnectedAt?: Maybe<Scalars['DateTime']['output']>;
  squareLocationId?: Maybe<Scalars['String']['output']>;
  state?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['Int']['output']>;
  website?: Maybe<Scalars['String']['output']>;
  zip?: Maybe<Scalars['String']['output']>;
};

export type ShopCutInvoiceResult = {
  __typename?: 'ShopCutInvoiceResult';
  appointment: Appointment;
  invoiceUrl: Scalars['String']['output'];
};

export type ShopCutRate = {
  __typename?: 'ShopCutRate';
  artistId: Scalars['ID']['output'];
  compensationModel: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  effectiveFrom: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  note?: Maybe<Scalars['String']['output']>;
  percent: Scalars['Int']['output'];
  setByUserId: Scalars['ID']['output'];
  shopId: Scalars['ID']['output'];
};

export type ShopInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  billingType?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  facebook?: InputMaybe<Scalars['String']['input']>;
  flatRate?: InputMaybe<Scalars['Int']['input']>;
  hourlyRate?: InputMaybe<Scalars['Int']['input']>;
  id: Scalars['ID']['input'];
  instagram?: InputMaybe<Scalars['String']['input']>;
  logo?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  shopCutPercent?: InputMaybe<Scalars['Int']['input']>;
  shopMinimum?: InputMaybe<Scalars['Int']['input']>;
  state?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['Int']['input']>;
  website?: InputMaybe<Scalars['String']['input']>;
  zip?: InputMaybe<Scalars['String']['input']>;
};

export type SquareConnection = {
  __typename?: 'SquareConnection';
  connected: Scalars['Boolean']['output'];
  connectedAt?: Maybe<Scalars['DateTime']['output']>;
  locationId?: Maybe<Scalars['String']['output']>;
  ownerName?: Maybe<Scalars['String']['output']>;
  source: Scalars['String']['output'];
};

export type SquareMobileCredentials = {
  __typename?: 'SquareMobileCredentials';
  accessToken: Scalars['String']['output'];
  locationId: Scalars['String']['output'];
};

export type SquarePricingSettings = {
  __typename?: 'SquarePricingSettings';
  canEdit: Scalars['Boolean']['output'];
  ownerName?: Maybe<Scalars['String']['output']>;
  source: Scalars['String']['output'];
  squareFeeOffsetCents: Scalars['Int']['output'];
  taxRateBasisPoints: Scalars['Int']['output'];
};

export type Staff = UserInfo & {
  __typename?: 'Staff';
  address?: Maybe<Scalars['String']['output']>;
  avatar?: Maybe<Scalars['String']['output']>;
  city?: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  facebook?: Maybe<Scalars['String']['output']>;
  firstName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  instagram?: Maybe<Scalars['String']['output']>;
  lastName: Scalars['String']['output'];
  phone: Scalars['String']['output'];
  shop?: Maybe<Shop>;
  shopId: Scalars['ID']['output'];
  state?: Maybe<Scalars['String']['output']>;
  status: Scalars['Int']['output'];
  title?: Maybe<Scalars['String']['output']>;
  user?: Maybe<User>;
  userId: Scalars['ID']['output'];
  zip?: Maybe<Scalars['String']['output']>;
};

export type StaffAccountResult = {
  __typename?: 'StaffAccountResult';
  inviteLink: Scalars['String']['output'];
  staff: Staff;
};

export type StaffInput = {
  address?: InputMaybe<Scalars['String']['input']>;
  avatar?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  facebook?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  instagram?: InputMaybe<Scalars['String']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  shopId: Scalars['ID']['input'];
  state?: InputMaybe<Scalars['String']['input']>;
  status: Scalars['Int']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['ID']['input'];
  zip?: InputMaybe<Scalars['String']['input']>;
};

export type StaffPage = {
  __typename?: 'StaffPage';
  items: Array<Staff>;
  pageInfo: PageInfo;
};

export type SubmitFormResponseInput = {
  answers: Array<FormAnswerInput>;
  clientId?: InputMaybe<Scalars['ID']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  formId?: InputMaybe<Scalars['ID']['input']>;
  formSlug?: InputMaybe<Scalars['String']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
  ownerHandle?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  publicToken?: InputMaybe<Scalars['String']['input']>;
};

export type SystemMessageTemplate = {
  __typename?: 'SystemMessageTemplate';
  artistUserId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  emailBodyTemplate?: Maybe<Scalars['String']['output']>;
  emailSubjectTemplate?: Maybe<Scalars['String']['output']>;
  extraNoteTemplate?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  setByUserId?: Maybe<Scalars['ID']['output']>;
  shopId?: Maybe<Scalars['ID']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type UpdateAutoResponseInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  autoResponseId: Scalars['ID']['input'];
  emailBodyTemplate?: InputMaybe<Scalars['String']['input']>;
  emailEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  emailSubjectTemplate?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  smsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  smsTemplate?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateExpenseInput = {
  amountCents?: InputMaybe<Scalars['Int']['input']>;
  date?: InputMaybe<Scalars['DateTime']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  expenseId: Scalars['ID']['input'];
  expenseTypeId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateExpenseTypeInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  expenseTypeId: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateFormInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  fields?: InputMaybe<Array<FormFieldInput>>;
  formId: Scalars['ID']['input'];
  shopUseOnly?: InputMaybe<Scalars['Boolean']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateIncomeInput = {
  amountCents?: InputMaybe<Scalars['Int']['input']>;
  date?: InputMaybe<Scalars['DateTime']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  incomeId: Scalars['ID']['input'];
  incomeTypeId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateIncomeTypeInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  incomeTypeId: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateRecurringExpenseInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  amountCents?: InputMaybe<Scalars['Int']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  expenseTypeId?: InputMaybe<Scalars['ID']['input']>;
  frequency?: InputMaybe<Scalars['String']['input']>;
  recurringExpenseId: Scalars['ID']['input'];
};

export type UpdateResponseTimeSettingsInput = {
  initialThresholdMinutes?: InputMaybe<Scalars['Int']['input']>;
  repeatIntervalMinutes?: InputMaybe<Scalars['Int']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateSystemMessageTemplateInput = {
  emailBodyTemplate?: InputMaybe<Scalars['String']['input']>;
  emailSubjectTemplate?: InputMaybe<Scalars['String']['input']>;
  extraNoteTemplate?: InputMaybe<Scalars['String']['input']>;
  key: Scalars['String']['input'];
  shopId?: InputMaybe<Scalars['ID']['input']>;
};

export type User = {
  __typename?: 'User';
  accessToken: Scalars['String']['output'];
  avatar?: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  firebaseToken?: Maybe<Scalars['String']['output']>;
  firstName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lastName?: Maybe<Scalars['String']['output']>;
  role: Scalars['Int']['output'];
  tagColor?: Maybe<Scalars['String']['output']>;
  themePreference?: Maybe<Scalars['String']['output']>;
  userInfo?: Maybe<UserInfo>;
  userType: Scalars['String']['output'];
};

export type UserInfo = {
  address?: Maybe<Scalars['String']['output']>;
  avatar?: Maybe<Scalars['String']['output']>;
  city?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  facebook?: Maybe<Scalars['String']['output']>;
  firstName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  instagram?: Maybe<Scalars['String']['output']>;
  lastName?: Maybe<Scalars['String']['output']>;
  phone?: Maybe<Scalars['String']['output']>;
  state?: Maybe<Scalars['String']['output']>;
  zip?: Maybe<Scalars['String']['output']>;
};

export type UserUpdateInput = {
  avatar?: InputMaybe<Scalars['String']['input']>;
  confirmPassword?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  firstName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  lastName?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
  role: Scalars['Int']['input'];
  tagColor?: InputMaybe<Scalars['String']['input']>;
  themePreference?: InputMaybe<Scalars['String']['input']>;
  userType?: InputMaybe<Scalars['String']['input']>;
};

export type ChangePasswordMutationVariables = Exact<{
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
}>;


export type ChangePasswordMutation = { __typename?: 'Mutation', changePassword: { __typename?: 'User', id: string, accessToken: string } };

export type GetUserTagColorsQueryVariables = Exact<{
  shopId: Scalars['ID']['input'];
}>;


export type GetUserTagColorsQuery = { __typename?: 'Query', getUserTagColors?: Array<{ __typename?: 'User', tagColor?: string | null } | null> | null };

export type CreateClientAccountMutationVariables = Exact<{
  input: CreateClientAccountInput;
}>;


export type CreateClientAccountMutation = { __typename?: 'Mutation', createClientAccount: { __typename?: 'ClientAccountResult', isNewAccount: boolean, client: { __typename?: 'Client', id: string, firstName: string, lastName: string, email: string, phone: string } } };

export type CreateArtistAccountMutationVariables = Exact<{
  input: CreateArtistAccountInput;
}>;


export type CreateArtistAccountMutation = { __typename?: 'Mutation', createArtistAccount: { __typename?: 'ArtistAccountResult', inviteLink: string, artist: { __typename?: 'Artist', id: string, firstName: string, lastName: string, email: string, title?: string | null, userId: string } } };

export type CreateStaffAccountMutationVariables = Exact<{
  input: CreateStaffAccountInput;
}>;


export type CreateStaffAccountMutation = { __typename?: 'Mutation', createStaffAccount: { __typename?: 'StaffAccountResult', inviteLink: string, staff: { __typename?: 'Staff', id: string, firstName: string, lastName: string, email: string, title?: string | null, userId: string } } };

export type RecordAdjustmentMutationVariables = Exact<{
  input: RecordAdjustmentInput;
}>;


export type RecordAdjustmentMutation = { __typename?: 'Mutation', recordAdjustment: { __typename?: 'Adjustment', id: string, appointmentId: string, amountCents: number, reason: string, createdByUserId: string, createdAt: string, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null } };

export type AnalyticsFieldsFragment = { __typename?: 'Analytics', start: string, end: string, revenueCents?: number | null, subtotalCents?: number | null, taxCents?: number | null, feeCents?: number | null, tipsCents?: number | null, averageTipCents?: number | null, tippedCount?: number | null, shopCutEarnedCents?: number | null, shopCutOutstandingCents?: number | null, shopCutAwaitingConfirmationCents?: number | null, depositsCollectedCents?: number | null, depositsAppliedCents?: number | null, depositsOutstandingCents?: number | null, expensesCents?: number | null, otherIncomeCents?: number | null, netCents?: number | null, completedSessionCount: number, consultCount: number, appointmentCount: number, upcomingCount: number, activeProjectCount: number, newProjectCount: number, totalClientCount: number, newClientCount: number, artistCount: number };

export type GetArtistAnalyticsQueryVariables = Exact<{
  userId: Scalars['ID']['input'];
  start: Scalars['DateTime']['input'];
  end: Scalars['DateTime']['input'];
}>;


export type GetArtistAnalyticsQuery = { __typename?: 'Query', getArtistAnalytics?: { __typename?: 'Analytics', start: string, end: string, revenueCents?: number | null, subtotalCents?: number | null, taxCents?: number | null, feeCents?: number | null, tipsCents?: number | null, averageTipCents?: number | null, tippedCount?: number | null, shopCutEarnedCents?: number | null, shopCutOutstandingCents?: number | null, shopCutAwaitingConfirmationCents?: number | null, depositsCollectedCents?: number | null, depositsAppliedCents?: number | null, depositsOutstandingCents?: number | null, expensesCents?: number | null, otherIncomeCents?: number | null, netCents?: number | null, completedSessionCount: number, consultCount: number, appointmentCount: number, upcomingCount: number, activeProjectCount: number, newProjectCount: number, totalClientCount: number, newClientCount: number, artistCount: number } | null };

export type GetShopAnalyticsQueryVariables = Exact<{
  shopId: Scalars['ID']['input'];
  start: Scalars['DateTime']['input'];
  end: Scalars['DateTime']['input'];
}>;


export type GetShopAnalyticsQuery = { __typename?: 'Query', getShopAnalytics?: { __typename?: 'Analytics', start: string, end: string, revenueCents?: number | null, subtotalCents?: number | null, taxCents?: number | null, feeCents?: number | null, tipsCents?: number | null, averageTipCents?: number | null, tippedCount?: number | null, shopCutEarnedCents?: number | null, shopCutOutstandingCents?: number | null, shopCutAwaitingConfirmationCents?: number | null, depositsCollectedCents?: number | null, depositsAppliedCents?: number | null, depositsOutstandingCents?: number | null, expensesCents?: number | null, otherIncomeCents?: number | null, netCents?: number | null, completedSessionCount: number, consultCount: number, appointmentCount: number, upcomingCount: number, activeProjectCount: number, newProjectCount: number, totalClientCount: number, newClientCount: number, artistCount: number, artists: Array<{ __typename?: 'ArtistAnalyticsRow', userId: string, artistId?: string | null, revenueCents?: number | null, tipsCents?: number | null, shopCutEarnedCents?: number | null, shopCutOutstandingCents?: number | null, shopCutAwaitingConfirmationCents?: number | null, completedSessionCount: number, consultCount: number, appointmentCount: number, user?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, tagColor?: string | null } | null }> } | null };

export type GetAppointmentQueryVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
}>;


export type GetAppointmentQuery = { __typename?: 'Query', getAppointment?: { __typename?: 'Appointment', id: string, projectId?: string | null, userId?: string | null, shopId?: string | null, isPersonal: boolean, title?: string | null, description?: string | null, appointmentDate: string, durationMinutes: number, appointmentEnd: string, appointmentStatus: string, appointmentType: string, shopCutStatus: string, shopCutCents?: number | null, createdAt?: string | null, updatedAt?: string | null } | null };

export type UpdateAppointmentMutationVariables = Exact<{
  appointmentInput?: InputMaybe<AppointmentInput>;
}>;


export type UpdateAppointmentMutation = { __typename?: 'Mutation', updateAppointment?: { __typename?: 'Appointment', id: string, projectId?: string | null, userId?: string | null, shopId?: string | null, isPersonal: boolean, title?: string | null, description?: string | null, appointmentDate: string, durationMinutes: number, appointmentEnd: string, appointmentStatus: string, appointmentType: string, shopCutStatus: string, shopCutCents?: number | null, createdAt?: string | null, updatedAt?: string | null } | null };

export type DeleteAppointmentMutationVariables = Exact<{
  appointmentId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type DeleteAppointmentMutation = { __typename?: 'Mutation', deleteAppointment?: string | null };

export type CreateAppointmentMutationVariables = Exact<{
  appointmentInput?: InputMaybe<AppointmentInput>;
}>;


export type CreateAppointmentMutation = { __typename?: 'Mutation', createAppointment?: { __typename?: 'Appointment', id: string, projectId?: string | null, userId?: string | null, shopId?: string | null, title?: string | null, appointmentType: string, appointmentDate: string, durationMinutes: number, appointmentEnd: string, appointmentStatus: string, shopCutStatus: string } | null };

export type AppointmentListItemFragment = { __typename?: 'Appointment', id: string, projectId?: string | null, userId?: string | null, bookingRequestId?: string | null, shopId?: string | null, isPersonal: boolean, title?: string | null, description?: string | null, appointmentType: string, appointmentDate: string, durationMinutes: number, appointmentEnd: string, appointmentStatus: string, totalCents?: number | null, tipCents?: number | null, shopCutStatus: string, shopCutCents?: number | null, shopCutPaymentMethod?: string | null, shopCutSquareInvoiceId?: string | null, project?: { __typename?: 'Project', id: string, title: string, depositCollectedCents?: number | null, client?: { __typename?: 'Client', id: string, user?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null } | null, bookingRequest?: { __typename?: 'BookingRequest', id: string, client?: { __typename?: 'Client', id: string, firstName: string, lastName: string } | null } | null, user?: { __typename?: 'User', id: string, tagColor?: string | null, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null };

export type GetAppointmentsByShopQueryVariables = Exact<{
  shopId: Scalars['ID']['input'];
  filter?: InputMaybe<AppointmentFilter>;
  page?: InputMaybe<PageInput>;
}>;


export type GetAppointmentsByShopQuery = { __typename?: 'Query', getAppointmentsByShop: { __typename?: 'AppointmentPage', items: Array<{ __typename?: 'Appointment', id: string, projectId?: string | null, userId?: string | null, bookingRequestId?: string | null, shopId?: string | null, isPersonal: boolean, title?: string | null, description?: string | null, appointmentType: string, appointmentDate: string, durationMinutes: number, appointmentEnd: string, appointmentStatus: string, totalCents?: number | null, tipCents?: number | null, shopCutStatus: string, shopCutCents?: number | null, shopCutPaymentMethod?: string | null, shopCutSquareInvoiceId?: string | null, project?: { __typename?: 'Project', id: string, title: string, depositCollectedCents?: number | null, client?: { __typename?: 'Client', id: string, user?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null } | null, bookingRequest?: { __typename?: 'BookingRequest', id: string, client?: { __typename?: 'Client', id: string, firstName: string, lastName: string } | null } | null, user?: { __typename?: 'User', id: string, tagColor?: string | null, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type GetAppointmentsByArtistQueryVariables = Exact<{
  userId: Scalars['ID']['input'];
  filter?: InputMaybe<AppointmentFilter>;
  page?: InputMaybe<PageInput>;
}>;


export type GetAppointmentsByArtistQuery = { __typename?: 'Query', getAppointmentsByArtist: { __typename?: 'AppointmentPage', items: Array<{ __typename?: 'Appointment', id: string, projectId?: string | null, userId?: string | null, bookingRequestId?: string | null, shopId?: string | null, isPersonal: boolean, title?: string | null, description?: string | null, appointmentType: string, appointmentDate: string, durationMinutes: number, appointmentEnd: string, appointmentStatus: string, totalCents?: number | null, tipCents?: number | null, shopCutStatus: string, shopCutCents?: number | null, shopCutPaymentMethod?: string | null, shopCutSquareInvoiceId?: string | null, project?: { __typename?: 'Project', id: string, title: string, depositCollectedCents?: number | null, client?: { __typename?: 'Client', id: string, user?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null } | null, bookingRequest?: { __typename?: 'BookingRequest', id: string, client?: { __typename?: 'Client', id: string, firstName: string, lastName: string } | null } | null, user?: { __typename?: 'User', id: string, tagColor?: string | null, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type GetAppointmentsByProjectQueryVariables = Exact<{
  projectId: Scalars['ID']['input'];
}>;


export type GetAppointmentsByProjectQuery = { __typename?: 'Query', getAppointmentsByProject?: Array<{ __typename?: 'Appointment', id: string, projectId?: string | null, userId?: string | null, shopId?: string | null, title?: string | null, description?: string | null, appointmentType: string, appointmentDate: string, durationMinutes: number, appointmentEnd: string, appointmentStatus: string, subtotalCents?: number | null, taxCents?: number | null, feeCents?: number | null, tipCents?: number | null, totalCents?: number | null, shopCutCents?: number | null, shopCutStatus: string, shopCutPercentApplied?: number | null, depositCents?: number | null, depositStatus?: string | null, depositCreditCents?: number | null, depositCreditFromAppointmentId?: string | null, giftCardCreditCents?: number | null, artistIssuedGiftCardCreditCents?: number | null, timerStatus?: string | null, timerStartedAt?: string | null, accumulatedSeconds?: number | null, sessionNotes?: string | null, adjustments: Array<{ __typename?: 'Adjustment', id: string, amountCents: number, reason: string, createdAt: string, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null }> } | null> | null };

export type GetArtistShopConnectionsQueryVariables = Exact<{
  artistId: Scalars['ID']['input'];
}>;


export type GetArtistShopConnectionsQuery = { __typename?: 'Query', getArtistShopConnections?: Array<{ __typename?: 'ArtistShopConnection', id: string, artistId: string, shopId: string, status: string, rateSource: string } | null> | null };

export type ConnectArtistToShopMutationVariables = Exact<{
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
  confirmTransfer?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type ConnectArtistToShopMutation = { __typename?: 'Mutation', connectArtistToShop: { __typename?: 'ArtistShopConnection', id: string, artistId: string, shopId: string, status: string } };

export type DisconnectArtistFromShopMutationVariables = Exact<{
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
}>;


export type DisconnectArtistFromShopMutation = { __typename?: 'Mutation', disconnectArtistFromShop: { __typename?: 'ArtistShopConnection', id: string, artistId: string, shopId: string, status: string } };

export type GetShopForConnectionQueryVariables = Exact<{
  shopId: Scalars['ID']['input'];
}>;


export type GetShopForConnectionQuery = { __typename?: 'Query', getShop?: { __typename?: 'Shop', id: string, name: string, website?: string | null } | null };

export type GetArtistsListQueryVariables = Exact<{
  includeArchived?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<PageInput>;
}>;


export type GetArtistsListQuery = { __typename?: 'Query', getArtists: { __typename?: 'ArtistPage', items: Array<{ __typename?: 'Artist', id: string, firstName: string, lastName: string, title?: string | null, email: string, phone?: string | null, instagram?: string | null, facebook?: string | null, avatar?: string | null, status?: number | null, user?: { __typename?: 'User', id: string, avatar?: string | null } | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type GetArtistDetailQueryVariables = Exact<{
  artistId: Scalars['ID']['input'];
}>;


export type GetArtistDetailQuery = { __typename?: 'Query', getArtist?: { __typename?: 'Artist', id: string, userId: string, firstName: string, lastName: string, email: string, title?: string | null, phone?: string | null, address?: string | null, city?: string | null, state?: string | null, zip?: string | null, instagram?: string | null, facebook?: string | null, avatar?: string | null, startDate: string, status?: number | null, shopId?: string | null, user?: { __typename?: 'User', id: string, avatar?: string | null } | null } | null };

export type UpdateArtistIdentityMutationVariables = Exact<{
  artist: ArtistInput;
}>;


export type UpdateArtistIdentityMutation = { __typename?: 'Mutation', updateArtist?: { __typename?: 'Artist', id: string, firstName: string, lastName: string, email: string, title?: string | null, phone?: string | null, address?: string | null, city?: string | null, state?: string | null, zip?: string | null, instagram?: string | null, facebook?: string | null, startDate: string } | null };

export type ArchiveArtistMutationVariables = Exact<{
  artistId: Scalars['ID']['input'];
}>;


export type ArchiveArtistMutation = { __typename?: 'Mutation', archiveArtist?: { __typename?: 'Artist', id: string, status?: number | null } | null };

export type UnarchiveArtistMutationVariables = Exact<{
  artistId: Scalars['ID']['input'];
}>;


export type UnarchiveArtistMutation = { __typename?: 'Mutation', unarchiveArtist?: { __typename?: 'Artist', id: string, status?: number | null } | null };

export type SendAutoResponseNowMutationVariables = Exact<{
  autoResponseId: Scalars['ID']['input'];
  clientId: Scalars['ID']['input'];
  appointmentId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type SendAutoResponseNowMutation = { __typename?: 'Mutation', sendAutoResponseNow: boolean };

export type GetAutoResponsesQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetAutoResponsesQuery = { __typename?: 'Query', getAutoResponses: Array<{ __typename?: 'AutoResponse', id: string, shopId?: string | null, artistUserId?: string | null, name: string, trigger: string, enabled: boolean, emailEnabled: boolean, smsEnabled: boolean, emailSubjectTemplate?: string | null, emailBodyTemplate?: string | null, smsTemplate?: string | null, active: boolean }> };

export type CreateAutoResponseMutationVariables = Exact<{
  input: CreateAutoResponseInput;
}>;


export type CreateAutoResponseMutation = { __typename?: 'Mutation', createAutoResponse: { __typename?: 'AutoResponse', id: string, shopId?: string | null, artistUserId?: string | null, name: string, trigger: string, enabled: boolean, emailEnabled: boolean, smsEnabled: boolean, emailSubjectTemplate?: string | null, emailBodyTemplate?: string | null, smsTemplate?: string | null, active: boolean } };

export type UpdateAutoResponseMutationVariables = Exact<{
  input: UpdateAutoResponseInput;
}>;


export type UpdateAutoResponseMutation = { __typename?: 'Mutation', updateAutoResponse: { __typename?: 'AutoResponse', id: string, shopId?: string | null, artistUserId?: string | null, name: string, trigger: string, enabled: boolean, emailEnabled: boolean, smsEnabled: boolean, emailSubjectTemplate?: string | null, emailBodyTemplate?: string | null, smsTemplate?: string | null, active: boolean } };

export type ArchiveAutoResponseMutationVariables = Exact<{
  autoResponseId: Scalars['ID']['input'];
}>;


export type ArchiveAutoResponseMutation = { __typename?: 'Mutation', archiveAutoResponse: { __typename?: 'AutoResponse', id: string, active: boolean } };

export type GetBookingRequestsQueryVariables = Exact<{
  artistId: Scalars['ID']['input'];
  statuses?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  page?: InputMaybe<PageInput>;
}>;


export type GetBookingRequestsQuery = { __typename?: 'Query', getBookingRequests: { __typename?: 'BookingRequestPage', pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number }, items: Array<{ __typename?: 'BookingRequest', id: string, status: string, description: string, createdAt?: string | null, client?: { __typename?: 'Client', firstName: string, lastName: string } | null, conversation?: { __typename?: 'Conversation', id: string, unreadCount: number } | null }> } };

export type GetBookingRequestQueryVariables = Exact<{
  bookingRequestId: Scalars['ID']['input'];
}>;


export type GetBookingRequestQuery = { __typename?: 'Query', getBookingRequest?: { __typename?: 'BookingRequest', id: string, artistId: string, status: string, description: string, placement?: string | null, size?: string | null, budget?: string | null, availability?: string | null, isCoverUp?: boolean | null, howHeard?: string | null, referenceImages?: Array<string | null> | null, createdAt?: string | null, client?: { __typename?: 'Client', firstName: string, lastName: string, email: string, phone: string } | null, conversation?: { __typename?: 'Conversation', id: string, unreadCount: number } | null } | null };

export type GetPendingBookingRequestCountQueryVariables = Exact<{ [key: string]: never; }>;


export type GetPendingBookingRequestCountQuery = { __typename?: 'Query', getPendingBookingRequestCount: number };

export type CreateBookingRequestMutationVariables = Exact<{
  bookingRequestInput: BookingRequestInput;
}>;


export type CreateBookingRequestMutation = { __typename?: 'Mutation', createBookingRequest: { __typename?: 'BookingRequest', id: string, status: string } };

export type GetBoothRentPlansQueryVariables = Exact<{
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
}>;


export type GetBoothRentPlansQuery = { __typename?: 'Query', getBoothRentPlans: Array<{ __typename?: 'BoothRentPlan', id: string, artistId: string, shopId: string, amountCents: number, dueDayOfMonth: number, effectiveFrom: string, setByUserId: string, active: boolean, createdAt: string }> };

export type GetBoothRentChargesQueryVariables = Exact<{
  artistId?: InputMaybe<Scalars['ID']['input']>;
  shopId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  page?: InputMaybe<PageInput>;
}>;


export type GetBoothRentChargesQuery = { __typename?: 'Query', getBoothRentCharges: { __typename?: 'BoothRentChargePage', items: Array<{ __typename?: 'BoothRentCharge', id: string, artistId: string, shopId: string, amountCents: number, periodMonth: string, dueDate: string, status: string, markedPaidAt?: string | null, markedPaidByUserId?: string | null, confirmedAt?: string | null, confirmedByUserId?: string | null, expenseId?: string | null, incomeId?: string | null, createdAt: string }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type MarkBoothRentPaidManuallyMutationVariables = Exact<{
  boothRentChargeId: Scalars['ID']['input'];
}>;


export type MarkBoothRentPaidManuallyMutation = { __typename?: 'Mutation', markBoothRentPaidManually: { __typename?: 'BoothRentCharge', id: string, artistId: string, shopId: string, amountCents: number, periodMonth: string, dueDate: string, status: string, markedPaidAt?: string | null, markedPaidByUserId?: string | null, confirmedAt?: string | null, confirmedByUserId?: string | null, expenseId?: string | null, incomeId?: string | null, createdAt: string } };

export type SetBoothRentPlanMutationVariables = Exact<{
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
  amountCents: Scalars['Int']['input'];
  dueDayOfMonth: Scalars['Int']['input'];
  effectiveFrom?: InputMaybe<Scalars['DateTime']['input']>;
}>;


export type SetBoothRentPlanMutation = { __typename?: 'Mutation', setBoothRentPlan: { __typename?: 'BoothRentPlan', id: string, artistId: string, shopId: string, amountCents: number, dueDayOfMonth: number, effectiveFrom: string, setByUserId: string, active: boolean, createdAt: string } };

export type ConfirmBoothRentPaidMutationVariables = Exact<{
  boothRentChargeId: Scalars['ID']['input'];
}>;


export type ConfirmBoothRentPaidMutation = { __typename?: 'Mutation', confirmBoothRentPaid: { __typename?: 'BoothRentCharge', id: string, artistId: string, shopId: string, amountCents: number, periodMonth: string, dueDate: string, status: string, markedPaidAt?: string | null, markedPaidByUserId?: string | null, confirmedAt?: string | null, confirmedByUserId?: string | null, expenseId?: string | null, incomeId?: string | null, createdAt: string } };

export type GetChargeQuoteQueryVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
  applyFeeOffset?: InputMaybe<Scalars['Boolean']['input']>;
  tipCents?: InputMaybe<Scalars['Int']['input']>;
  subtotalCentsOverride?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetChargeQuoteQuery = { __typename?: 'Query', getChargeQuote: { __typename?: 'ChargeQuote', subtotalCents: number, depositCreditCents: number, netSubtotalCents: number, feeOffsetCents: number, taxableCents: number, taxCents: number, tipCents: number, totalCents: number, giftCardCents: number, amountDueCents: number, source: string, canCharge: boolean } };

export type GetClientDashboardQueryVariables = Exact<{
  clientId: Scalars['ID']['input'];
  projectsPage?: InputMaybe<PageInput>;
  appointmentsPage?: InputMaybe<PageInput>;
}>;


export type GetClientDashboardQuery = { __typename?: 'Query', getClient?: { __typename?: 'Client', id: string, firstName: string, lastName: string, email: string, phone: string, avatar?: string | null, stats: { __typename?: 'ClientStats', totalSpentCents: number, totalTipsCents: number, averageTipCents: number, tippedSessionCount: number, completedSessionCount: number, projectCount: number, upcomingAppointmentCount: number }, projects: { __typename?: 'ProjectPage', items: Array<{ __typename?: 'Project', id: string, title: string, status: string, createdAt?: string | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } }, appointments: { __typename?: 'AppointmentPage', items: Array<{ __typename?: 'Appointment', id: string, title?: string | null, appointmentDate: string, appointmentType: string, appointmentStatus: string, totalCents?: number | null, tipCents?: number | null, projectId?: string | null, project?: { __typename?: 'Project', id: string, title: string } | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } }, notes?: Array<{ __typename?: 'IBNote', id: string, author: string, note: string, createdAt?: string | null, updatedAt?: string | null } | null> | null, flags: Array<{ __typename?: 'ClientFlag', id: string, typeKey: string, note?: string | null, systemGenerated: boolean, createdAt: string, type?: { __typename?: 'ClientFlagType', key: string, label: string } | null, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null }> } | null };

export type UpdateClientNotesMutationVariables = Exact<{
  clientId: Scalars['ID']['input'];
  notes?: InputMaybe<Array<InputMaybe<IbNoteInput>> | InputMaybe<IbNoteInput>>;
}>;


export type UpdateClientNotesMutation = { __typename?: 'Mutation', updateClientNotes?: { __typename?: 'Client', id: string, notes?: Array<{ __typename?: 'IBNote', id: string, author: string, note: string, createdAt?: string | null, updatedAt?: string | null } | null> | null } | null };

export type GetClientFlagTypesQueryVariables = Exact<{ [key: string]: never; }>;


export type GetClientFlagTypesQuery = { __typename?: 'Query', getClientFlagTypes: Array<{ __typename?: 'ClientFlagType', key: string, label: string, systemGenerated: boolean }> };

export type RaiseClientFlagMutationVariables = Exact<{
  input: RaiseClientFlagInput;
}>;


export type RaiseClientFlagMutation = { __typename?: 'Mutation', raiseClientFlag: { __typename?: 'ClientFlag', id: string, typeKey: string, note?: string | null, systemGenerated: boolean, createdAt: string, type?: { __typename?: 'ClientFlagType', key: string, label: string } | null, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null } };

export type ResolveClientFlagMutationVariables = Exact<{
  flagId: Scalars['ID']['input'];
}>;


export type ResolveClientFlagMutation = { __typename?: 'Mutation', resolveClientFlag: { __typename?: 'ClientFlag', id: string, resolvedAt?: string | null } };

export type GetClientsQueryVariables = Exact<{
  page?: InputMaybe<PageInput>;
}>;


export type GetClientsQuery = { __typename?: 'Query', getClients: { __typename?: 'ClientPage', items: Array<{ __typename?: 'Client', id: string, firstName: string, lastName: string, email: string, phone: string, avatar?: string | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type FindClientByEmailQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;


export type FindClientByEmailQuery = { __typename?: 'Query', findClientByEmail?: { __typename?: 'Client', id: string, firstName: string, lastName: string, email: string, phone: string } | null };

export type GetConsultAppointmentQueryVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
}>;


export type GetConsultAppointmentQuery = { __typename?: 'Query', getAppointment?: { __typename?: 'Appointment', id: string, title?: string | null, appointmentType: string, appointmentDate: string, durationMinutes: number, appointmentStatus: string, projectId?: string | null, bookingRequestId?: string | null, bookingRequest?: { __typename?: 'BookingRequest', id: string, status: string, description: string, placement?: string | null, size?: string | null, budget?: string | null, isCoverUp?: boolean | null, referenceImages?: Array<string | null> | null, client?: { __typename?: 'Client', id: string, firstName: string, lastName: string, email: string, phone: string } | null } | null } | null };

export type ConvertBookingRequestMutationVariables = Exact<{
  bookingRequestId: Scalars['ID']['input'];
  outcome: Scalars['String']['input'];
  appointmentInput?: InputMaybe<AppointmentInput>;
  projectTitle?: InputMaybe<Scalars['String']['input']>;
}>;


export type ConvertBookingRequestMutation = { __typename?: 'Mutation', convertBookingRequest: { __typename?: 'BookingRequest', id: string, status: string, resultingAppointmentId?: string | null, resultingAppointment?: { __typename?: 'Appointment', id: string, projectId?: string | null } | null } };

export type CreateProjectMutationVariables = Exact<{
  title: Scalars['String']['input'];
  description: Scalars['String']['input'];
  placement?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['String']['input']>;
  artistId: Scalars['ID']['input'];
  clientId: Scalars['ID']['input'];
  status: Scalars['String']['input'];
}>;


export type CreateProjectMutation = { __typename?: 'Mutation', createProject: { __typename?: 'Project', id: string, title: string } };

export type RecordDepositMutationVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
  depositCents: Scalars['Int']['input'];
  paymentMethod: Scalars['String']['input'];
  pending?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type RecordDepositMutation = { __typename?: 'Mutation', recordDeposit?: { __typename?: 'Appointment', id: string, depositCents?: number | null, depositStatus?: string | null, depositPaymentMethod?: string | null, depositCollectedAt?: string | null } | null };

export type GetAvailableDepositsQueryVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
}>;


export type GetAvailableDepositsQuery = { __typename?: 'Query', getAvailableDeposits?: Array<{ __typename?: 'Appointment', id: string, depositCents?: number | null, appointmentDate: string, appointmentType: string } | null> | null };

export type ApplyDepositMutationVariables = Exact<{
  depositAppointmentId: Scalars['ID']['input'];
  targetAppointmentId: Scalars['ID']['input'];
}>;


export type ApplyDepositMutation = { __typename?: 'Mutation', applyDeposit?: { __typename?: 'Appointment', id: string, depositCreditCents?: number | null, depositCreditFromAppointmentId?: string | null, subtotalCents?: number | null, totalCents?: number | null, shopCutCents?: number | null, shopCutPercentApplied?: number | null, shopCutStatus: string } | null };

export type GetEventLogsQueryVariables = Exact<{
  filter?: InputMaybe<EventLogFilter>;
  page?: InputMaybe<PageInput>;
}>;


export type GetEventLogsQuery = { __typename?: 'Query', getEventLogs: { __typename?: 'EventLogPage', items: Array<{ __typename?: 'EventLogEntry', id: string, entityType: string, entityId: string, action: string, actorName: string, summary: string, createdAt: string, changes: Array<{ __typename?: 'EventLogChange', field: string, from?: string | null, to?: string | null }> }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type GetExpenseTypesForSettingsQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetExpenseTypesForSettingsQuery = { __typename?: 'Query', getExpenseTypes: Array<{ __typename?: 'ExpenseType', id: string, name: string, description?: string | null, active: boolean }> };

export type CreateExpenseTypeMutationVariables = Exact<{
  input: CreateExpenseTypeInput;
}>;


export type CreateExpenseTypeMutation = { __typename?: 'Mutation', createExpenseType: { __typename?: 'ExpenseType', id: string } };

export type UpdateExpenseTypeMutationVariables = Exact<{
  input: UpdateExpenseTypeInput;
}>;


export type UpdateExpenseTypeMutation = { __typename?: 'Mutation', updateExpenseType: { __typename?: 'ExpenseType', id: string, active: boolean } };

export type GetExpenseTypesListQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type GetExpenseTypesListQuery = { __typename?: 'Query', getExpenseTypes: Array<{ __typename?: 'ExpenseType', id: string, name: string }> };

export type GetExpensesListQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  start?: InputMaybe<Scalars['DateTime']['input']>;
  end?: InputMaybe<Scalars['DateTime']['input']>;
  page?: InputMaybe<PageInput>;
}>;


export type GetExpensesListQuery = { __typename?: 'Query', getExpenses: { __typename?: 'ExpensePage', items: Array<{ __typename?: 'Expense', id: string, expenseTypeId: string, amountCents: number, description?: string | null, date: string, recurringExpenseId?: string | null, expenseType?: { __typename?: 'ExpenseType', id: string, name: string } | null, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type RecordExpenseMutationVariables = Exact<{
  input: RecordExpenseInput;
}>;


export type RecordExpenseMutation = { __typename?: 'Mutation', recordExpense: { __typename?: 'Expense', id: string, expenseTypeId: string, amountCents: number, description?: string | null, date: string, recurringExpenseId?: string | null, expenseType?: { __typename?: 'ExpenseType', id: string, name: string } | null, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null } };

export type UpdateExpenseMutationVariables = Exact<{
  input: UpdateExpenseInput;
}>;


export type UpdateExpenseMutation = { __typename?: 'Mutation', updateExpense: { __typename?: 'Expense', id: string, expenseTypeId: string, amountCents: number, description?: string | null, date: string, recurringExpenseId?: string | null, expenseType?: { __typename?: 'ExpenseType', id: string, name: string } | null, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null } };

export type DeleteExpenseMutationVariables = Exact<{
  expenseId: Scalars['ID']['input'];
}>;


export type DeleteExpenseMutation = { __typename?: 'Mutation', deleteExpense: boolean };

export type GetFormsListQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  page?: InputMaybe<PageInput>;
}>;


export type GetFormsListQuery = { __typename?: 'Query', getForms: { __typename?: 'FormPage', items: Array<{ __typename?: 'Form', id: string, title: string, status: string, allowGuestSubmissions: boolean, publicToken?: string | null, slug?: string | null, systemKey?: string | null, shopUseOnly: boolean, createdAt: string, fields: Array<{ __typename?: 'FormField', key: string, type: string, label: string, helpText?: string | null, required: boolean, options: Array<string> }> }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type PublishFormMutationVariables = Exact<{
  formId: Scalars['ID']['input'];
}>;


export type PublishFormMutation = { __typename?: 'Mutation', publishForm: { __typename?: 'Form', id: string, status: string } };

export type ArchiveFormMutationVariables = Exact<{
  formId: Scalars['ID']['input'];
}>;


export type ArchiveFormMutation = { __typename?: 'Mutation', archiveForm: { __typename?: 'Form', id: string, status: string } };

export type SetFormGuestAccessMutationVariables = Exact<{
  formId: Scalars['ID']['input'];
  allow: Scalars['Boolean']['input'];
}>;


export type SetFormGuestAccessMutation = { __typename?: 'Mutation', setFormGuestAccess: { __typename?: 'Form', id: string, allowGuestSubmissions: boolean, publicToken?: string | null, slug?: string | null } };

export type DeleteFormMutationVariables = Exact<{
  formId: Scalars['ID']['input'];
}>;


export type DeleteFormMutation = { __typename?: 'Mutation', deleteForm: boolean };

export type DuplicateFormMutationVariables = Exact<{
  input: CreateFormInput;
}>;


export type DuplicateFormMutation = { __typename?: 'Mutation', createForm: { __typename?: 'Form', id: string } };

export type GetFormTitleQueryVariables = Exact<{
  formId: Scalars['ID']['input'];
}>;


export type GetFormTitleQuery = { __typename?: 'Query', getForm: { __typename?: 'Form', id: string, title: string } };

export type GetFormResponsesListQueryVariables = Exact<{
  formId: Scalars['ID']['input'];
  page?: InputMaybe<PageInput>;
}>;


export type GetFormResponsesListQuery = { __typename?: 'Query', getFormResponses: { __typename?: 'FormResponsePage', items: Array<{ __typename?: 'FormResponse', id: string, formTitle: string, source: string, createdAt: string, fieldsSnapshot: Array<{ __typename?: 'FormField', key: string, type: string, label: string }>, client?: { __typename?: 'Client', id: string, firstName: string, lastName: string } | null, answers: Array<{ __typename?: 'FormAnswer', fieldKey: string, textValue?: string | null, selectedOptions: Array<string>, dateValue?: string | null, fileUrls: Array<string>, signature?: { __typename?: 'FormSignature', signedName?: string | null, signedAt?: string | null } | null }> }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type GetFormForEditQueryVariables = Exact<{
  formId: Scalars['ID']['input'];
}>;


export type GetFormForEditQuery = { __typename?: 'Query', getForm: { __typename?: 'Form', id: string, title: string, description?: string | null, slug?: string | null, shopUseOnly: boolean, status: string, allowGuestSubmissions: boolean, publicToken?: string | null, systemKey?: string | null, fields: Array<{ __typename?: 'FormField', key: string, type: string, label: string, helpText?: string | null, required: boolean, options: Array<string>, hidden: boolean }> } };

export type CreateFormFromBuilderMutationVariables = Exact<{
  input: CreateFormInput;
}>;


export type CreateFormFromBuilderMutation = { __typename?: 'Mutation', createForm: { __typename?: 'Form', id: string, title: string, description?: string | null, slug?: string | null, shopUseOnly: boolean, status: string, allowGuestSubmissions: boolean, publicToken?: string | null, systemKey?: string | null, fields: Array<{ __typename?: 'FormField', key: string, type: string, label: string, helpText?: string | null, required: boolean, options: Array<string> }> } };

export type UpdateFormMutationVariables = Exact<{
  input: UpdateFormInput;
}>;


export type UpdateFormMutation = { __typename?: 'Mutation', updateForm: { __typename?: 'Form', id: string, title: string, description?: string | null, slug?: string | null, shopUseOnly: boolean, status: string, allowGuestSubmissions: boolean, publicToken?: string | null, systemKey?: string | null, fields: Array<{ __typename?: 'FormField', key: string, type: string, label: string, helpText?: string | null, required: boolean, options: Array<string> }> } };

export type UpdateBookingRequestFieldsMutationVariables = Exact<{
  formId: Scalars['ID']['input'];
  fields: Array<BookingRequestFieldInput> | BookingRequestFieldInput;
}>;


export type UpdateBookingRequestFieldsMutation = { __typename?: 'Mutation', updateBookingRequestFields: { __typename?: 'Form', id: string, title: string, description?: string | null, slug?: string | null, shopUseOnly: boolean, status: string, allowGuestSubmissions: boolean, publicToken?: string | null, systemKey?: string | null, fields: Array<{ __typename?: 'FormField', key: string, type: string, label: string, helpText?: string | null, required: boolean, options: Array<string>, hidden: boolean }> } };

export type GetFormToFillOutQueryVariables = Exact<{
  formId: Scalars['ID']['input'];
}>;


export type GetFormToFillOutQuery = { __typename?: 'Query', getForm: { __typename?: 'Form', id: string, title: string, description?: string | null, status: string, fields: Array<{ __typename?: 'FormField', key: string, type: string, label: string, helpText?: string | null, required: boolean, options: Array<string> }> } };

export type SubmitFormResponseMutationVariables = Exact<{
  input: SubmitFormResponseInput;
}>;


export type SubmitFormResponseMutation = { __typename?: 'Mutation', submitFormResponse: { __typename?: 'FormResponse', id: string } };

export type GetProjectQueryVariables = Exact<{
  projectId: Scalars['ID']['input'];
}>;


export type GetProjectQuery = { __typename?: 'Query', getProject?: { __typename?: 'Project', id: string, title: string, description: string, placement?: string | null, size?: string | null, palette?: string | null, artistId: string, clientId: string, materialsUsed?: Array<string | null> | null, tags?: Array<string | null> | null, status: string, depositCollectedCents?: number | null, depositAvailableCents?: number | null, artist?: { __typename?: 'Artist', firstName: string, lastName: string, email: string, id: string, hourlyRate?: number | null, flatRate?: number | null, billingType?: string | null, user?: { __typename?: 'User', id: string } | null, shop?: { __typename?: 'Shop', id: string, name: string, hourlyRate?: number | null, flatRate?: number | null, billingType?: string | null } | null } | null, client?: { __typename?: 'Client', firstName: string, lastName: string, email: string, id: string } | null, conversation?: { __typename?: 'Conversation', id: string, members: Array<string>, createdAt?: string | null, updatedAt?: string | null, membersInfo?: Array<{ __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null> | null, messages?: Array<{ __typename?: 'Message', id: string, conversationId: string, senderId: string, message?: string | null, createdAt?: string | null, updatedAt?: string | null, user?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null } | null, referenceImages?: Array<{ __typename?: 'IBImage', id: string, url: string, avatar?: string | null, title?: string | null, uploadedByDisplayName?: string | null, userId: string, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null, id: string } | null } | null> | null, bodyImages?: Array<{ __typename?: 'IBImage', id: string, url: string, avatar?: string | null, title?: string | null, uploadedByDisplayName?: string | null, userId: string, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null, id: string } | null } | null> | null, designImages?: Array<{ __typename?: 'IBImage', id: string, url: string, avatar?: string | null, uploadedByDisplayName?: string | null, userId: string, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null, id: string } | null } | null> | null, notes?: Array<{ __typename?: 'IBNote', id: string, author: string, note: string, createdAt?: string | null, updatedAt?: string | null } | null> | null, deposits?: Array<{ __typename?: 'Appointment', id: string, depositCents?: number | null, depositPaymentMethod?: string | null, depositCollectedAt?: string | null } | null> | null, consultAppointment?: { __typename?: 'Appointment', id: string, depositCents?: number | null, depositStatus?: string | null, depositPaymentMethod?: string | null, depositCollectedAt?: string | null } | null } | null };

export type GetProjectGqlQueryVariables = Exact<{
  projectId: Scalars['ID']['input'];
}>;


export type GetProjectGqlQuery = { __typename?: 'Query', getProject?: { __typename?: 'Project', id: string, title: string, description: string, placement?: string | null, size?: string | null, palette?: string | null, artistId: string, clientId: string, materialsUsed?: Array<string | null> | null, tags?: Array<string | null> | null, status: string, depositCollectedCents?: number | null, depositAvailableCents?: number | null, artist?: { __typename?: 'Artist', firstName: string, lastName: string, email: string, id: string, shop?: { __typename?: 'Shop', id: string, name: string } | null } | null, client?: { __typename?: 'Client', firstName: string, lastName: string, email: string, id: string } | null, referenceImages?: Array<{ __typename?: 'IBImage', url: string, avatar?: string | null, title?: string | null, uploadedByDisplayName?: string | null, userId: string, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null, bodyImages?: Array<{ __typename?: 'IBImage', url: string, avatar?: string | null, title?: string | null, uploadedByDisplayName?: string | null, userId: string, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null, designImages?: Array<{ __typename?: 'IBImage', url: string, avatar?: string | null, uploadedByDisplayName?: string | null, userId: string, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null, notes?: Array<{ __typename?: 'IBNote', author: string, note: string, createdAt?: string | null, updatedAt?: string | null } | null> | null, deposits?: Array<{ __typename?: 'Appointment', id: string, depositCents?: number | null, depositPaymentMethod?: string | null, depositCollectedAt?: string | null } | null> | null } | null };

export type GetProjectsQueryVariables = Exact<{
  page?: InputMaybe<PageInput>;
}>;


export type GetProjectsQuery = { __typename?: 'Query', getProjects: { __typename?: 'ProjectPage', items: Array<{ __typename?: 'Project', id: string, title: string, description: string, placement?: string | null, size?: string | null, palette?: string | null, artistId: string, clientId: string, materialsUsed?: Array<string | null> | null, tags?: Array<string | null> | null, status: string, depositCollectedCents?: number | null, depositAvailableCents?: number | null, artist?: { __typename?: 'Artist', firstName: string, lastName: string, email: string, avatar?: string | null, id: string } | null, client?: { __typename?: 'Client', firstName: string, lastName: string, email: string, avatar?: string | null, id: string } | null, referenceImages?: Array<{ __typename?: 'IBImage', url: string, avatar?: string | null, title?: string | null, uploadedByDisplayName?: string | null, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null } | null> | null, bodyImages?: Array<{ __typename?: 'IBImage', url: string, avatar?: string | null, title?: string | null, uploadedByDisplayName?: string | null, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null } | null> | null, designImages?: Array<{ __typename?: 'IBImage', url: string, avatar?: string | null, uploadedByDisplayName?: string | null, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null } | null> | null, notes?: Array<{ __typename?: 'IBNote', author: string, note: string, createdAt?: string | null, updatedAt?: string | null } | null> | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type GetProjectsByArtistQueryVariables = Exact<{
  artistId: Scalars['ID']['input'];
}>;


export type GetProjectsByArtistQuery = { __typename?: 'Query', getProjectsByArtist?: Array<{ __typename?: 'Project', id: string, title: string, description: string, client?: { __typename?: 'Client', user?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null, artist?: { __typename?: 'Artist', user?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null } | null> | null };

export type CreateArtistGiftCardMutationVariables = Exact<{
  input: CreateArtistGiftCardInput;
}>;


export type CreateArtistGiftCardMutation = { __typename?: 'Mutation', createArtistGiftCard: { __typename?: 'GiftCard', id: string, code: string, issuerType: string, faceValueCents: number, balanceCents: number, feeOffsetCents: number, paymentMethod?: string | null, saleStatus: string } };

export type CreateShopGiftCardMutationVariables = Exact<{
  input: CreateShopGiftCardInput;
}>;


export type CreateShopGiftCardMutation = { __typename?: 'Mutation', createShopGiftCard: { __typename?: 'GiftCard', id: string, code: string, issuerType: string, shopId?: string | null, faceValueCents: number, balanceCents: number, feeOffsetCents: number, paymentMethod?: string | null, saleStatus: string } };

export type GetMyGiftCardsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMyGiftCardsQuery = { __typename?: 'Query', getMyGiftCards: Array<{ __typename?: 'GiftCard', id: string, code: string, issuerType: string, shopId?: string | null, faceValueCents: number, balanceCents: number, feeOffsetCents: number, soldAt: string, soldByUserId: string, paymentMethod?: string | null, saleStatus: string, squarePaymentId?: string | null, shopCutStatus: string, shopCutCents?: number | null, shopCutPercentApplied?: number | null }> };

export type GetGiftCardsByShopQueryVariables = Exact<{
  shopId: Scalars['ID']['input'];
}>;


export type GetGiftCardsByShopQuery = { __typename?: 'Query', getGiftCardsByShop: Array<{ __typename?: 'GiftCard', id: string, code: string, issuerType: string, shopId?: string | null, faceValueCents: number, balanceCents: number, feeOffsetCents: number, soldAt: string, soldByUserId: string, paymentMethod?: string | null, saleStatus: string, squarePaymentId?: string | null, shopCutStatus: string, shopCutCents?: number | null, shopCutPercentApplied?: number | null }> };

export type GetMyGiftCardLiabilityReportQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMyGiftCardLiabilityReportQuery = { __typename?: 'Query', getMyGiftCardLiabilityReport: { __typename?: 'GiftCardLiabilityReport', outstandingBalanceCents: number, cardCount: number, oldestIssuedAt?: string | null } };

export type GetGiftCardLiabilityReportQueryVariables = Exact<{
  shopId: Scalars['ID']['input'];
}>;


export type GetGiftCardLiabilityReportQuery = { __typename?: 'Query', getGiftCardLiabilityReport: { __typename?: 'GiftCardLiabilityReport', outstandingBalanceCents: number, cardCount: number, oldestIssuedAt?: string | null } };

export type RedeemGiftCardMutationVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
  code: Scalars['String']['input'];
  amountCents: Scalars['Int']['input'];
}>;


export type RedeemGiftCardMutation = { __typename?: 'Mutation', redeemGiftCard: { __typename?: 'RedeemGiftCardResult', giftCard: { __typename?: 'GiftCard', id: string, balanceCents: number }, appointment: { __typename?: 'Appointment', id: string, subtotalCents?: number | null, totalCents?: number | null, shopCutCents?: number | null, shopCutPercentApplied?: number | null, giftCardCreditCents?: number | null, artistIssuedGiftCardCreditCents?: number | null }, redemption: { __typename?: 'GiftCardRedemption', id: string, amountCents: number, shopPayoutCents?: number | null } } };

export type CreateGiftCardShopCutInvoiceMutationVariables = Exact<{
  giftCardId: Scalars['ID']['input'];
  paymentMethod?: InputMaybe<Scalars['String']['input']>;
}>;


export type CreateGiftCardShopCutInvoiceMutation = { __typename?: 'Mutation', createGiftCardShopCutInvoice: { __typename?: 'GiftCardShopCutInvoiceResult', invoiceUrl: string, giftCard: { __typename?: 'GiftCard', id: string, shopCutStatus: string, shopCutSquareInvoiceId?: string | null } } };

export type MarkGiftCardShopCutPaidManuallyMutationVariables = Exact<{
  giftCardId: Scalars['ID']['input'];
}>;


export type MarkGiftCardShopCutPaidManuallyMutation = { __typename?: 'Mutation', markGiftCardShopCutPaidManually: { __typename?: 'GiftCard', id: string, shopCutStatus: string, shopCutMarkedPaidBy?: string | null, shopCutMarkedPaidAt?: string | null } };

export type ConfirmGiftCardShopCutPaidMutationVariables = Exact<{
  giftCardId: Scalars['ID']['input'];
}>;


export type ConfirmGiftCardShopCutPaidMutation = { __typename?: 'Mutation', confirmGiftCardShopCutPaid: { __typename?: 'GiftCard', id: string, shopCutStatus: string, shopCutConfirmedBy?: string | null, shopCutConfirmedAt?: string | null } };

export type GlobalSearchQueryVariables = Exact<{
  query: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GlobalSearchQuery = { __typename?: 'Query', search: { __typename?: 'SearchResults', clients: Array<{ __typename?: 'Client', id: string, avatar?: string | null, firstName: string, lastName: string, email: string, phone: string, city?: string | null, state?: string | null }>, projects: Array<{ __typename?: 'Project', id: string, title: string, description: string, status: string, artist?: { __typename?: 'Artist', id: string, firstName: string, lastName: string, avatar?: string | null } | null, client?: { __typename?: 'Client', id: string, firstName: string, lastName: string } | null }>, messages: Array<{ __typename?: 'Message', id: string, conversationId: string, message?: string | null, senderId: string, createdAt?: string | null, user?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null }>, images: Array<{ __typename?: 'SharedImage', id: string, url: string, clientId: string, tags: Array<string>, assignedProjectId?: string | null, createdAt: string }> } };

export type GetIncomeTypesListQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type GetIncomeTypesListQuery = { __typename?: 'Query', getIncomeTypes: Array<{ __typename?: 'IncomeType', id: string, name: string }> };

export type GetIncomesListQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  start?: InputMaybe<Scalars['DateTime']['input']>;
  end?: InputMaybe<Scalars['DateTime']['input']>;
  page?: InputMaybe<PageInput>;
}>;


export type GetIncomesListQuery = { __typename?: 'Query', getIncomes: { __typename?: 'IncomePage', items: Array<{ __typename?: 'Income', id: string, incomeTypeId: string, amountCents: number, description?: string | null, date: string, incomeType?: { __typename?: 'IncomeType', id: string, name: string } | null, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type RecordIncomeMutationVariables = Exact<{
  input: RecordIncomeInput;
}>;


export type RecordIncomeMutation = { __typename?: 'Mutation', recordIncome: { __typename?: 'Income', id: string, incomeTypeId: string, amountCents: number, description?: string | null, date: string, incomeType?: { __typename?: 'IncomeType', id: string, name: string } | null, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null } };

export type UpdateIncomeMutationVariables = Exact<{
  input: UpdateIncomeInput;
}>;


export type UpdateIncomeMutation = { __typename?: 'Mutation', updateIncome: { __typename?: 'Income', id: string, incomeTypeId: string, amountCents: number, description?: string | null, date: string, incomeType?: { __typename?: 'IncomeType', id: string, name: string } | null, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null } };

export type DeleteIncomeMutationVariables = Exact<{
  incomeId: Scalars['ID']['input'];
}>;


export type DeleteIncomeMutation = { __typename?: 'Mutation', deleteIncome: boolean };

export type GetIncomeTypesForSettingsQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetIncomeTypesForSettingsQuery = { __typename?: 'Query', getIncomeTypes: Array<{ __typename?: 'IncomeType', id: string, name: string, description?: string | null, active: boolean }> };

export type CreateIncomeTypeMutationVariables = Exact<{
  input: CreateIncomeTypeInput;
}>;


export type CreateIncomeTypeMutation = { __typename?: 'Mutation', createIncomeType: { __typename?: 'IncomeType', id: string } };

export type UpdateIncomeTypeMutationVariables = Exact<{
  input: UpdateIncomeTypeInput;
}>;


export type UpdateIncomeTypeMutation = { __typename?: 'Mutation', updateIncomeType: { __typename?: 'IncomeType', id: string, active: boolean } };

export type LoginMutationVariables = Exact<{
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
}>;


export type LoginMutation = { __typename?: 'Mutation', login: { __typename?: 'User', id: string, email: string, firstName?: string | null, lastName?: string | null, avatar?: string | null, role: number, userType: string, tagColor?: string | null, themePreference?: string | null, accessToken: string, firebaseToken?: string | null, userInfo?: { __typename?: 'Artist', id: string, firstName: string, lastName: string, avatar?: string | null, hourlyRate?: number | null, shop?: { __typename?: 'Shop', id: string, name: string, website?: string | null } | null } | { __typename?: 'Client', id: string, firstName: string, lastName: string, avatar?: string | null } | { __typename?: 'Staff', id: string, firstName: string, lastName: string, avatar?: string | null, title?: string | null, shop?: { __typename?: 'Shop', id: string, name: string } | null } | null } };

export type GetConversationsByMemberIdQueryVariables = Exact<{
  memberId: Scalars['ID']['input'];
}>;


export type GetConversationsByMemberIdQuery = { __typename?: 'Query', getConversationsByMemberId?: Array<{ __typename?: 'Conversation', id: string, members: Array<string>, updatedAt?: string | null, unreadCount: number, membersInfo?: Array<{ __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null> | null } | null> | null };

export type GetMessagesByConversationIdQueryVariables = Exact<{
  conversationId: Scalars['ID']['input'];
}>;


export type GetMessagesByConversationIdQuery = { __typename?: 'Query', getMessagesByConversationId?: Array<{ __typename?: 'Message', id: string, conversationId: string, senderId: string, message?: string | null, imageUrls: Array<string>, createdAt?: string | null, user?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null }> | null };

export type CreateMessageMutationVariables = Exact<{
  conversationId: Scalars['ID']['input'];
  senderId: Scalars['ID']['input'];
  message?: InputMaybe<Scalars['String']['input']>;
  imageUrls?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
}>;


export type CreateMessageMutation = { __typename?: 'Mutation', createMessage: { __typename?: 'Message', id: string, conversationId: string, senderId: string, message?: string | null, imageUrls: Array<string>, createdAt?: string | null } };

export type MarkConversationReadMutationVariables = Exact<{
  conversationId: Scalars['ID']['input'];
}>;


export type MarkConversationReadMutation = { __typename?: 'Mutation', markConversationRead: { __typename?: 'Conversation', id: string, unreadCount: number } };

export type MarkConversationUnreadMutationVariables = Exact<{
  conversationId: Scalars['ID']['input'];
}>;


export type MarkConversationUnreadMutation = { __typename?: 'Mutation', markConversationUnread: { __typename?: 'Conversation', id: string, unreadCount: number } };

export type GetUnreadMessageCountQueryVariables = Exact<{ [key: string]: never; }>;


export type GetUnreadMessageCountQuery = { __typename?: 'Query', getUnreadMessageCount: number };

export type GetMyBookingSlugQueryVariables = Exact<{
  artistId: Scalars['ID']['input'];
}>;


export type GetMyBookingSlugQuery = { __typename?: 'Query', getArtist?: { __typename?: 'Artist', id: string, bookingSlug?: string | null } | null };

export type UpdateMyBookingSlugMutationVariables = Exact<{
  slug: Scalars['String']['input'];
}>;


export type UpdateMyBookingSlugMutation = { __typename?: 'Mutation', updateMyBookingSlug: { __typename?: 'Artist', id: string, bookingSlug?: string | null } };

export type GetMyFormLinksQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMyFormLinksQuery = { __typename?: 'Query', getMyFormLinks: Array<{ __typename?: 'FormLinkSummary', title: string, slug: string }> };

export type GetInboxQueryVariables = Exact<{
  includeRead?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetInboxQuery = { __typename?: 'Query', getInbox: { __typename?: 'InboxSummary', unreadCount: number, items: Array<{ __typename?: 'InboxItem', key: string, type: string, category: string, subjectType?: string | null, subjectId?: string | null, title: string, body?: string | null, amountCents?: number | null, createdAt: string, readAt?: string | null, doneAt?: string | null, isCondition: boolean }> } };

export type MarkNotificationsReadMutationVariables = Exact<{
  notificationIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
}>;


export type MarkNotificationsReadMutation = { __typename?: 'Mutation', markNotificationsRead: number };

export type MarkNotificationsDoneMutationVariables = Exact<{
  notificationIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;


export type MarkNotificationsDoneMutation = { __typename?: 'Mutation', markNotificationsDone: number };

export type GetNotificationSettingsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetNotificationSettingsQuery = { __typename?: 'Query', getNotificationSettings: { __typename?: 'NotificationSettings', moneyMode: string, scheduleMode: string, rosterMode: string, messageMode: string, timezone: string, digestHour: number, prefs: { __typename?: 'NotificationPrefs', moneyEmail?: boolean | null, scheduleEmail?: boolean | null, rosterEmail?: boolean | null, messageEmail?: boolean | null } } };

export type UpdateNotificationSettingsMutationVariables = Exact<{
  prefs?: InputMaybe<NotificationPrefsInput>;
  timezone?: InputMaybe<Scalars['String']['input']>;
  digestHour?: InputMaybe<Scalars['Int']['input']>;
}>;


export type UpdateNotificationSettingsMutation = { __typename?: 'Mutation', updateNotificationSettings: { __typename?: 'NotificationSettings', moneyMode: string, scheduleMode: string, rosterMode: string, messageMode: string, timezone: string, digestHour: number, prefs: { __typename?: 'NotificationPrefs', moneyEmail?: boolean | null, scheduleEmail?: boolean | null, rosterEmail?: boolean | null, messageEmail?: boolean | null } } };

export type RequestPasswordResetMutationVariables = Exact<{
  email: Scalars['String']['input'];
}>;


export type RequestPasswordResetMutation = { __typename?: 'Mutation', requestPasswordReset: boolean };

export type ProjectImageFieldsFragment = { __typename?: 'IBImage', id: string, url: string, title?: string | null, uploadedByDisplayName?: string | null, userId: string, avatar?: string | null, tags?: Array<string | null> | null, createdAt?: string | null, updatedAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null };

export type GetProjectDetailQueryVariables = Exact<{
  projectId: Scalars['ID']['input'];
}>;


export type GetProjectDetailQuery = { __typename?: 'Query', getProject?: { __typename?: 'Project', id: string, title: string, description: string, placement?: string | null, size?: string | null, palette?: string | null, artistId: string, clientId: string, tags?: Array<string | null> | null, status: string, depositCollectedCents?: number | null, depositAvailableCents?: number | null, artist?: { __typename?: 'Artist', id: string, billingType?: string | null, hourlyRate?: number | null, flatRate?: number | null, shop?: { __typename?: 'Shop', id: string, billingType?: string | null, hourlyRate?: number | null, flatRate?: number | null } | null } | null, client?: { __typename?: 'Client', id: string, firstName: string, lastName: string } | null, notes?: Array<{ __typename?: 'IBNote', id: string, author: string, note: string, createdAt?: string | null, updatedAt?: string | null } | null> | null, deposits?: Array<{ __typename?: 'Appointment', id: string, depositCents?: number | null, depositPaymentMethod?: string | null, depositCollectedAt?: string | null } | null> | null, consultAppointment?: { __typename?: 'Appointment', id: string, depositCents?: number | null, depositStatus?: string | null, depositPaymentMethod?: string | null, depositCollectedAt?: string | null } | null, referenceImages?: Array<{ __typename?: 'IBImage', id: string, url: string, title?: string | null, uploadedByDisplayName?: string | null, userId: string, avatar?: string | null, tags?: Array<string | null> | null, createdAt?: string | null, updatedAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null, designImages?: Array<{ __typename?: 'IBImage', id: string, url: string, title?: string | null, uploadedByDisplayName?: string | null, userId: string, avatar?: string | null, tags?: Array<string | null> | null, createdAt?: string | null, updatedAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null, bodyImages?: Array<{ __typename?: 'IBImage', id: string, url: string, title?: string | null, uploadedByDisplayName?: string | null, userId: string, avatar?: string | null, tags?: Array<string | null> | null, createdAt?: string | null, updatedAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null } | null };

export type UpdateProjectDetailMutationVariables = Exact<{
  project?: InputMaybe<ProjectInput>;
}>;


export type UpdateProjectDetailMutation = { __typename?: 'Mutation', updateProject?: { __typename?: 'Project', id: string, title: string, description: string, placement?: string | null, size?: string | null, palette?: string | null, artistId: string, clientId: string, tags?: Array<string | null> | null, status: string, depositCollectedCents?: number | null, depositAvailableCents?: number | null, notes?: Array<{ __typename?: 'IBNote', id: string, author: string, note: string, createdAt?: string | null, updatedAt?: string | null } | null> | null, referenceImages?: Array<{ __typename?: 'IBImage', id: string, url: string, title?: string | null, uploadedByDisplayName?: string | null, userId: string, avatar?: string | null, tags?: Array<string | null> | null, createdAt?: string | null, updatedAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null, designImages?: Array<{ __typename?: 'IBImage', id: string, url: string, title?: string | null, uploadedByDisplayName?: string | null, userId: string, avatar?: string | null, tags?: Array<string | null> | null, createdAt?: string | null, updatedAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null, bodyImages?: Array<{ __typename?: 'IBImage', id: string, url: string, title?: string | null, uploadedByDisplayName?: string | null, userId: string, avatar?: string | null, tags?: Array<string | null> | null, createdAt?: string | null, updatedAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null } | null } | null> | null } | null };

export type GetProjectsListQueryVariables = Exact<{
  page?: InputMaybe<PageInput>;
}>;


export type GetProjectsListQuery = { __typename?: 'Query', getProjects: { __typename?: 'ProjectPage', items: Array<{ __typename?: 'Project', id: string, title: string, description: string, status: string, depositCollectedCents?: number | null, artistId: string, clientId: string, artist?: { __typename?: 'Artist', firstName: string, lastName: string, avatar?: string | null } | null, client?: { __typename?: 'Client', firstName: string, lastName: string } | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type RegisterDeviceTokenMutationVariables = Exact<{
  token: Scalars['String']['input'];
  platform: Scalars['String']['input'];
}>;


export type RegisterDeviceTokenMutation = { __typename?: 'Mutation', registerDeviceToken: boolean };

export type UnregisterDeviceTokenMutationVariables = Exact<{
  token: Scalars['String']['input'];
}>;


export type UnregisterDeviceTokenMutation = { __typename?: 'Mutation', unregisterDeviceToken: boolean };

export type GetMyRateSettingsQueryVariables = Exact<{
  artistId: Scalars['ID']['input'];
}>;


export type GetMyRateSettingsQuery = { __typename?: 'Query', getArtist?: { __typename?: 'Artist', id: string, hourlyRate?: number | null, flatRate?: number | null, billingType?: string | null } | null };

export type UpdateArtistRateSettingsMutationVariables = Exact<{
  hourlyRate?: InputMaybe<Scalars['Int']['input']>;
  flatRate?: InputMaybe<Scalars['Int']['input']>;
  billingType: Scalars['String']['input'];
}>;


export type UpdateArtistRateSettingsMutation = { __typename?: 'Mutation', updateArtistRateSettings: { __typename?: 'Artist', id: string, hourlyRate?: number | null, flatRate?: number | null, billingType?: string | null } };

export type SetArtistShopRateSourceMutationVariables = Exact<{
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
  rateSource: Scalars['String']['input'];
}>;


export type SetArtistShopRateSourceMutation = { __typename?: 'Mutation', setArtistShopRateSource: { __typename?: 'ArtistShopConnection', id: string, rateSource: string } };

export type GetRecurringExpensesListQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetRecurringExpensesListQuery = { __typename?: 'Query', getRecurringExpenses: Array<{ __typename?: 'RecurringExpense', id: string, expenseTypeId: string, amountCents: number, description?: string | null, frequency: string, startDate: string, nextRunDate: string, endDate?: string | null, active: boolean, expenseType?: { __typename?: 'ExpenseType', id: string, name: string } | null }> };

export type CreateRecurringExpenseMutationVariables = Exact<{
  input: CreateRecurringExpenseInput;
}>;


export type CreateRecurringExpenseMutation = { __typename?: 'Mutation', createRecurringExpense: { __typename?: 'RecurringExpense', id: string } };

export type UpdateRecurringExpenseMutationVariables = Exact<{
  input: UpdateRecurringExpenseInput;
}>;


export type UpdateRecurringExpenseMutation = { __typename?: 'Mutation', updateRecurringExpense: { __typename?: 'RecurringExpense', id: string, active: boolean } };

export type DeleteRecurringExpenseMutationVariables = Exact<{
  recurringExpenseId: Scalars['ID']['input'];
}>;


export type DeleteRecurringExpenseMutation = { __typename?: 'Mutation', deleteRecurringExpense: boolean };

export type RegisterAccountMutationVariables = Exact<{
  input: RegisterAccountInput;
}>;


export type RegisterAccountMutation = { __typename?: 'Mutation', registerAccount: { __typename?: 'User', id: string, email: string, firstName?: string | null, lastName?: string | null, avatar?: string | null, role: number, userType: string, tagColor?: string | null, themePreference?: string | null, accessToken: string, firebaseToken?: string | null, userInfo?: { __typename?: 'Artist', id: string, firstName: string, lastName: string, avatar?: string | null, hourlyRate?: number | null, shop?: { __typename?: 'Shop', id: string, name: string, website?: string | null } | null } | { __typename?: 'Client', id: string, firstName: string, lastName: string, avatar?: string | null } | { __typename?: 'Staff', id: string, firstName: string, lastName: string, avatar?: string | null, title?: string | null, shop?: { __typename?: 'Shop', id: string, name: string } | null } | null } };

export type GetReminderSettingsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetReminderSettingsQuery = { __typename?: 'Query', getReminderSettings: { __typename?: 'ReminderSettings', emailEnabled: boolean, smsEnabled: boolean, emailSubjectTemplate?: string | null, emailBodyTemplate?: string | null, smsTemplate?: string | null, rules: Array<{ __typename?: 'ReminderRule', id: string, offsetMinutes: number, enabled: boolean }> } };

export type UpdateReminderSettingsMutationVariables = Exact<{
  emailEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  smsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  rules?: InputMaybe<Array<ReminderRuleInput> | ReminderRuleInput>;
  emailSubjectTemplate?: InputMaybe<Scalars['String']['input']>;
  emailBodyTemplate?: InputMaybe<Scalars['String']['input']>;
  smsTemplate?: InputMaybe<Scalars['String']['input']>;
}>;


export type UpdateReminderSettingsMutation = { __typename?: 'Mutation', updateReminderSettings: { __typename?: 'ReminderSettings', emailEnabled: boolean, smsEnabled: boolean, emailSubjectTemplate?: string | null, emailBodyTemplate?: string | null, smsTemplate?: string | null, rules: Array<{ __typename?: 'ReminderRule', id: string, offsetMinutes: number, enabled: boolean }> } };

export type GetResponseTimeSettingsQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type GetResponseTimeSettingsQuery = { __typename?: 'Query', getResponseTimeSettings: { __typename?: 'ResponseTimeSettings', id: string, shopId?: string | null, artistUserId?: string | null, initialThresholdMinutes: number, repeatIntervalMinutes: number, shopCeiling?: { __typename?: 'ResponseTimeCeiling', initialThresholdMinutes: number, repeatIntervalMinutes: number } | null } };

export type UpdateResponseTimeSettingsMutationVariables = Exact<{
  input: UpdateResponseTimeSettingsInput;
}>;


export type UpdateResponseTimeSettingsMutation = { __typename?: 'Mutation', updateResponseTimeSettings: { __typename?: 'ResponseTimeSettings', id: string, shopId?: string | null, artistUserId?: string | null, initialThresholdMinutes: number, repeatIntervalMinutes: number, shopCeiling?: { __typename?: 'ResponseTimeCeiling', initialThresholdMinutes: number, repeatIntervalMinutes: number } | null } };

export type UpdateSessionDetailsMutationVariables = Exact<{
  appointmentInput?: InputMaybe<AppointmentInput>;
}>;


export type UpdateSessionDetailsMutation = { __typename?: 'Mutation', updateAppointment?: { __typename?: 'Appointment', id: string, appointmentDate: string, durationMinutes: number, appointmentEnd: string, subtotalCents?: number | null, taxCents?: number | null, feeCents?: number | null, tipCents?: number | null, totalCents?: number | null, shopCutCents?: number | null, shopCutStatus: string, shopCutPercentApplied?: number | null, sessionNotes?: string | null, appointmentStatus: string, depositCreditCents?: number | null, timerStatus?: string | null, timerStartedAt?: string | null, accumulatedSeconds?: number | null, adjustments: Array<{ __typename?: 'Adjustment', id: string, amountCents: number, reason: string, createdAt: string, createdBy?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null } | null }> } | null };

export type StartSessionTimerMutationVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
}>;


export type StartSessionTimerMutation = { __typename?: 'Mutation', startSessionTimer: { __typename?: 'Appointment', id: string, timerStatus?: string | null, timerStartedAt?: string | null, accumulatedSeconds?: number | null } };

export type StopSessionTimerMutationVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
}>;


export type StopSessionTimerMutation = { __typename?: 'Mutation', stopSessionTimer: { __typename?: 'Appointment', id: string, timerStatus?: string | null, timerStartedAt?: string | null, accumulatedSeconds?: number | null } };

export type ResetSessionTimerMutationVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
}>;


export type ResetSessionTimerMutation = { __typename?: 'Mutation', resetSessionTimer: { __typename?: 'Appointment', id: string, timerStatus?: string | null, timerStartedAt?: string | null, accumulatedSeconds?: number | null } };

export type GetSharedImagesForClientQueryVariables = Exact<{
  clientId: Scalars['ID']['input'];
}>;


export type GetSharedImagesForClientQuery = { __typename?: 'Query', getSharedImagesForClient: Array<{ __typename?: 'SharedImage', id: string, url: string, tags: Array<string>, assignedProjectId?: string | null, assignedImageType?: string | null, createdAt: string, userInfo?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null } | null, assignedProject?: { __typename?: 'Project', id: string, title: string } | null }> };

export type GetPendingShopCutConfirmationsQueryVariables = Exact<{
  shopId: Scalars['ID']['input'];
}>;


export type GetPendingShopCutConfirmationsQuery = { __typename?: 'Query', getPendingShopCutConfirmations?: Array<{ __typename?: 'Appointment', id: string, appointmentDate: string, title?: string | null, shopCutCents?: number | null, shopCutMarkedPaidAt?: string | null, user?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, avatar?: string | null, tagColor?: string | null } | null } | null> | null };

export type ConfirmShopCutPaidMutationVariables = Exact<{
  appointmentId: Scalars['ID']['input'];
}>;


export type ConfirmShopCutPaidMutation = { __typename?: 'Mutation', confirmShopCutPaid: { __typename?: 'Appointment', id: string, shopCutStatus: string, shopCutConfirmedAt?: string | null } };

export type GetShopCutRatesQueryVariables = Exact<{
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
}>;


export type GetShopCutRatesQuery = { __typename?: 'Query', getShopCutRates: Array<{ __typename?: 'ShopCutRate', id: string, artistId: string, shopId: string, percent: number, compensationModel: string, effectiveFrom: string, setByUserId: string, note?: string | null, createdAt: string }> };

export type SetShopCutRateMutationVariables = Exact<{
  artistId: Scalars['ID']['input'];
  shopId: Scalars['ID']['input'];
  percent: Scalars['Int']['input'];
  compensationModel?: InputMaybe<Scalars['String']['input']>;
  effectiveFrom?: InputMaybe<Scalars['DateTime']['input']>;
  note?: InputMaybe<Scalars['String']['input']>;
}>;


export type SetShopCutRateMutation = { __typename?: 'Mutation', setShopCutRate: { __typename?: 'ShopCutRate', id: string, artistId: string, shopId: string, percent: number, compensationModel: string, effectiveFrom: string, setByUserId: string, note?: string | null, createdAt: string } };

export type GetShopsListQueryVariables = Exact<{ [key: string]: never; }>;


export type GetShopsListQuery = { __typename?: 'Query', getShops?: Array<{ __typename?: 'Shop', id: string, name: string, email: string, phone?: string | null, website?: string | null, logo?: string | null, address?: string | null, city?: string | null, state?: string | null, hourlyRate?: number | null, shopMinimum?: number | null } | null> | null };

export type GetShopDetailQueryVariables = Exact<{
  shopId: Scalars['ID']['input'];
}>;


export type GetShopDetailQuery = { __typename?: 'Query', getShop?: { __typename?: 'Shop', id: string, name: string, email: string, phone?: string | null, address?: string | null, city?: string | null, state?: string | null, zip?: string | null, instagram?: string | null, facebook?: string | null, website?: string | null, shopMinimum?: number | null, hourlyRate?: number | null, shopCutPercent?: number | null, logo?: string | null, billingType?: string | null, status?: number | null, formSlug?: string | null, squareConnected?: boolean | null, squareLocationId?: string | null, squareConnectedAt?: string | null } | null };

export type UpdateShopIdentityMutationVariables = Exact<{
  shop: ShopInput;
}>;


export type UpdateShopIdentityMutation = { __typename?: 'Mutation', updateShop?: { __typename?: 'Shop', id: string, name: string, email: string, phone?: string | null, address?: string | null, city?: string | null, state?: string | null, zip?: string | null, instagram?: string | null, facebook?: string | null, website?: string | null } | null };

export type GetSquareAuthorizationUrlQueryVariables = Exact<{
  shopId: Scalars['ID']['input'];
}>;


export type GetSquareAuthorizationUrlQuery = { __typename?: 'Query', getSquareAuthorizationUrl: string };

export type DisconnectShopSquareMutationVariables = Exact<{
  shopId: Scalars['ID']['input'];
}>;


export type DisconnectShopSquareMutation = { __typename?: 'Mutation', disconnectShopSquare: { __typename?: 'Shop', id: string, squareConnected?: boolean | null, squareLocationId?: string | null, squareConnectedAt?: string | null } };

export type UpdateShopCutPercentMutationVariables = Exact<{
  shop: ShopInput;
}>;


export type UpdateShopCutPercentMutation = { __typename?: 'Mutation', updateShop?: { __typename?: 'Shop', id: string, shopCutPercent?: number | null } | null };

export type UpdateMyShopFormSlugMutationVariables = Exact<{
  shopId: Scalars['ID']['input'];
  slug: Scalars['String']['input'];
}>;


export type UpdateMyShopFormSlugMutation = { __typename?: 'Mutation', updateMyShopFormSlug: { __typename?: 'Shop', id: string, formSlug?: string | null } };

export type GetMySquareConnectionQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMySquareConnectionQuery = { __typename?: 'Query', getMySquareConnection: { __typename?: 'SquareConnection', source: string, connected: boolean, locationId?: string | null, connectedAt?: string | null, ownerName?: string | null } };

export type GetMySquareAuthorizationUrlQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMySquareAuthorizationUrlQuery = { __typename?: 'Query', getMySquareAuthorizationUrl: string };

export type DisconnectMySquareMutationVariables = Exact<{ [key: string]: never; }>;


export type DisconnectMySquareMutation = { __typename?: 'Mutation', disconnectMySquare: { __typename?: 'SquareConnection', source: string, connected: boolean, locationId?: string | null, connectedAt?: string | null, ownerName?: string | null } };

export type GetMySquarePricingSettingsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMySquarePricingSettingsQuery = { __typename?: 'Query', getMySquarePricingSettings: { __typename?: 'SquarePricingSettings', source: string, ownerName?: string | null, taxRateBasisPoints: number, squareFeeOffsetCents: number, canEdit: boolean } };

export type UpdateSquarePricingSettingsMutationVariables = Exact<{
  taxRateBasisPoints: Scalars['Int']['input'];
  squareFeeOffsetCents: Scalars['Int']['input'];
}>;


export type UpdateSquarePricingSettingsMutation = { __typename?: 'Mutation', updateSquarePricingSettings: { __typename?: 'SquarePricingSettings', source: string, ownerName?: string | null, taxRateBasisPoints: number, squareFeeOffsetCents: number, canEdit: boolean } };

export type GetStaffListQueryVariables = Exact<{
  includeArchived?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<PageInput>;
}>;


export type GetStaffListQuery = { __typename?: 'Query', getStaff: { __typename?: 'StaffPage', items: Array<{ __typename?: 'Staff', id: string, firstName: string, lastName: string, title?: string | null, email: string, phone: string, city?: string | null, state?: string | null, instagram?: string | null, facebook?: string | null, avatar?: string | null, status: number, shopId: string, shop?: { __typename?: 'Shop', name: string } | null, user?: { __typename?: 'User', id: string, avatar?: string | null } | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasMore: boolean, limit: number, offset: number } } };

export type GetStaffDetailQueryVariables = Exact<{
  staffId: Scalars['ID']['input'];
}>;


export type GetStaffDetailQuery = { __typename?: 'Query', getOneStaff?: { __typename?: 'Staff', id: string, firstName: string, lastName: string, email: string, phone: string, title?: string | null, address?: string | null, city?: string | null, state?: string | null, zip?: string | null, instagram?: string | null, facebook?: string | null, avatar?: string | null, userId: string, status: number, shopId: string, user?: { __typename?: 'User', id: string, avatar?: string | null } | null } | null };

export type UpdateStaffIdentityMutationVariables = Exact<{
  staff: StaffInput;
}>;


export type UpdateStaffIdentityMutation = { __typename?: 'Mutation', updateStaff?: { __typename?: 'Staff', id: string, firstName: string, lastName: string, email: string, phone: string, title?: string | null, address?: string | null, city?: string | null, state?: string | null, zip?: string | null, instagram?: string | null, facebook?: string | null } | null };

export type ArchiveStaffMutationVariables = Exact<{
  staffId: Scalars['ID']['input'];
}>;


export type ArchiveStaffMutation = { __typename?: 'Mutation', archiveStaff?: { __typename?: 'Staff', id: string, status: number } | null };

export type UnarchiveStaffMutationVariables = Exact<{
  staffId: Scalars['ID']['input'];
}>;


export type UnarchiveStaffMutation = { __typename?: 'Mutation', unarchiveStaff?: { __typename?: 'Staff', id: string, status: number } | null };

export type GetSystemMessageTemplatesQueryVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  artistUserId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type GetSystemMessageTemplatesQuery = { __typename?: 'Query', getSystemMessageTemplates: Array<{ __typename?: 'SystemMessageTemplate', id: string, shopId?: string | null, artistUserId?: string | null, key: string, emailSubjectTemplate?: string | null, emailBodyTemplate?: string | null, extraNoteTemplate?: string | null }> };

export type UpdateSystemMessageTemplateMutationVariables = Exact<{
  input: UpdateSystemMessageTemplateInput;
}>;


export type UpdateSystemMessageTemplateMutation = { __typename?: 'Mutation', updateSystemMessageTemplate: { __typename?: 'SystemMessageTemplate', id: string, shopId?: string | null, artistUserId?: string | null, key: string, emailSubjectTemplate?: string | null, emailBodyTemplate?: string | null, extraNoteTemplate?: string | null } };

export type ResetSystemMessageTemplateMutationVariables = Exact<{
  shopId?: InputMaybe<Scalars['ID']['input']>;
  key: Scalars['String']['input'];
}>;


export type ResetSystemMessageTemplateMutation = { __typename?: 'Mutation', resetSystemMessageTemplate: boolean };

export type UpdateProjectMutationVariables = Exact<{
  project?: InputMaybe<ProjectInput>;
}>;


export type UpdateProjectMutation = { __typename?: 'Mutation', updateProject?: { __typename?: 'Project', id: string, title: string, description: string, placement?: string | null, size?: string | null, palette?: string | null, artistId: string, clientId: string, materialsUsed?: Array<string | null> | null, tags?: Array<string | null> | null, status: string, depositCollectedCents?: number | null, depositAvailableCents?: number | null, referenceImages?: Array<{ __typename?: 'IBImage', id: string, url: string, avatar?: string | null, title?: string | null, uploadedByDisplayName?: string | null, userId: string, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null, id: string } | null } | null> | null, bodyImages?: Array<{ __typename?: 'IBImage', id: string, url: string, avatar?: string | null, title?: string | null, uploadedByDisplayName?: string | null, userId: string, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null, id: string } | null } | null> | null, designImages?: Array<{ __typename?: 'IBImage', id: string, url: string, avatar?: string | null, uploadedByDisplayName?: string | null, userId: string, tags?: Array<string | null> | null, updatedAt?: string | null, createdAt?: string | null, userInfo?: { __typename?: 'User', firstName?: string | null, lastName?: string | null, avatar?: string | null, id: string } | null } | null> | null, notes?: Array<{ __typename?: 'IBNote', id: string, author: string, note: string, createdAt?: string | null, updatedAt?: string | null } | null> | null } | null };

export type UpdateProjectNotesMutationVariables = Exact<{
  projectId: Scalars['ID']['input'];
  notes?: InputMaybe<Array<InputMaybe<IbNoteInput>> | InputMaybe<IbNoteInput>>;
}>;


export type UpdateProjectNotesMutation = { __typename?: 'Mutation', updateProjectNotes?: { __typename?: 'Project', notes?: Array<{ __typename?: 'IBNote', author: string, note: string, createdAt?: string | null, updatedAt?: string | null } | null> | null } | null };

export type UpdateProjectTagsMutationVariables = Exact<{
  projectId: Scalars['ID']['input'];
  tags?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>> | InputMaybe<Scalars['String']['input']>>;
}>;


export type UpdateProjectTagsMutation = { __typename?: 'Mutation', updateProjectTags?: { __typename?: 'Project', tags?: Array<string | null> | null } | null };

export type UpdateUserMutationVariables = Exact<{
  user: UserUpdateInput;
}>;


export type UpdateUserMutation = { __typename?: 'Mutation', updateUser: { __typename?: 'User', id: string, avatar?: string | null, tagColor?: string | null, themePreference?: string | null } };

export const AnalyticsFieldsFragmentDoc = gql`
    fragment AnalyticsFields on Analytics {
  start
  end
  revenueCents
  subtotalCents
  taxCents
  feeCents
  tipsCents
  averageTipCents
  tippedCount
  shopCutEarnedCents
  shopCutOutstandingCents
  shopCutAwaitingConfirmationCents
  depositsCollectedCents
  depositsAppliedCents
  depositsOutstandingCents
  expensesCents
  otherIncomeCents
  netCents
  completedSessionCount
  consultCount
  appointmentCount
  upcomingCount
  activeProjectCount
  newProjectCount
  totalClientCount
  newClientCount
  artistCount
}
    `;
export const AppointmentListItemFragmentDoc = gql`
    fragment AppointmentListItem on Appointment {
  id
  projectId
  userId
  bookingRequestId
  project {
    id
    title
    client {
      id
      user {
        id
        firstName
        lastName
        avatar
      }
    }
    depositCollectedCents
  }
  bookingRequest {
    id
    client {
      id
      firstName
      lastName
    }
  }
  shopId
  isPersonal
  user {
    id
    tagColor
    firstName
    lastName
    avatar
  }
  title
  description
  appointmentType
  appointmentDate
  durationMinutes
  appointmentEnd
  appointmentStatus
  totalCents
  tipCents
  shopCutStatus
  shopCutCents
  shopCutPaymentMethod
  shopCutSquareInvoiceId
}
    `;
export const ProjectImageFieldsFragmentDoc = gql`
    fragment ProjectImageFields on IBImage {
  id
  url
  title
  uploadedByDisplayName
  userId
  userInfo {
    firstName
    lastName
    avatar
  }
  avatar
  tags
  createdAt
  updatedAt
}
    `;
export const ChangePasswordDocument = gql`
    mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
  changePassword(currentPassword: $currentPassword, newPassword: $newPassword) {
    id
    accessToken
  }
}
    `;
export type ChangePasswordMutationFn = Apollo.MutationFunction<ChangePasswordMutation, ChangePasswordMutationVariables>;

/**
 * __useChangePasswordMutation__
 *
 * To run a mutation, you first call `useChangePasswordMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useChangePasswordMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [changePasswordMutation, { data, loading, error }] = useChangePasswordMutation({
 *   variables: {
 *      currentPassword: // value for 'currentPassword'
 *      newPassword: // value for 'newPassword'
 *   },
 * });
 */
export function useChangePasswordMutation(baseOptions?: Apollo.MutationHookOptions<ChangePasswordMutation, ChangePasswordMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ChangePasswordMutation, ChangePasswordMutationVariables>(ChangePasswordDocument, options);
      }
export type ChangePasswordMutationHookResult = ReturnType<typeof useChangePasswordMutation>;
export type ChangePasswordMutationResult = Apollo.MutationResult<ChangePasswordMutation>;
export type ChangePasswordMutationOptions = Apollo.BaseMutationOptions<ChangePasswordMutation, ChangePasswordMutationVariables>;
export const GetUserTagColorsDocument = gql`
    query GetUserTagColors($shopId: ID!) {
  getUserTagColors(shopId: $shopId) {
    tagColor
  }
}
    `;

/**
 * __useGetUserTagColorsQuery__
 *
 * To run a query within a React component, call `useGetUserTagColorsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserTagColorsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserTagColorsQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useGetUserTagColorsQuery(baseOptions: Apollo.QueryHookOptions<GetUserTagColorsQuery, GetUserTagColorsQueryVariables> & ({ variables: GetUserTagColorsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetUserTagColorsQuery, GetUserTagColorsQueryVariables>(GetUserTagColorsDocument, options);
      }
export function useGetUserTagColorsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUserTagColorsQuery, GetUserTagColorsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetUserTagColorsQuery, GetUserTagColorsQueryVariables>(GetUserTagColorsDocument, options);
        }
// @ts-ignore
export function useGetUserTagColorsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetUserTagColorsQuery, GetUserTagColorsQueryVariables>): Apollo.UseSuspenseQueryResult<GetUserTagColorsQuery, GetUserTagColorsQueryVariables>;
export function useGetUserTagColorsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUserTagColorsQuery, GetUserTagColorsQueryVariables>): Apollo.UseSuspenseQueryResult<GetUserTagColorsQuery | undefined, GetUserTagColorsQueryVariables>;
export function useGetUserTagColorsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUserTagColorsQuery, GetUserTagColorsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetUserTagColorsQuery, GetUserTagColorsQueryVariables>(GetUserTagColorsDocument, options);
        }
export type GetUserTagColorsQueryHookResult = ReturnType<typeof useGetUserTagColorsQuery>;
export type GetUserTagColorsLazyQueryHookResult = ReturnType<typeof useGetUserTagColorsLazyQuery>;
export type GetUserTagColorsSuspenseQueryHookResult = ReturnType<typeof useGetUserTagColorsSuspenseQuery>;
export type GetUserTagColorsQueryResult = Apollo.QueryResult<GetUserTagColorsQuery, GetUserTagColorsQueryVariables>;
export const CreateClientAccountDocument = gql`
    mutation CreateClientAccount($input: CreateClientAccountInput!) {
  createClientAccount(input: $input) {
    isNewAccount
    client {
      id
      firstName
      lastName
      email
      phone
    }
  }
}
    `;
export type CreateClientAccountMutationFn = Apollo.MutationFunction<CreateClientAccountMutation, CreateClientAccountMutationVariables>;

/**
 * __useCreateClientAccountMutation__
 *
 * To run a mutation, you first call `useCreateClientAccountMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateClientAccountMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createClientAccountMutation, { data, loading, error }] = useCreateClientAccountMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateClientAccountMutation(baseOptions?: Apollo.MutationHookOptions<CreateClientAccountMutation, CreateClientAccountMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateClientAccountMutation, CreateClientAccountMutationVariables>(CreateClientAccountDocument, options);
      }
export type CreateClientAccountMutationHookResult = ReturnType<typeof useCreateClientAccountMutation>;
export type CreateClientAccountMutationResult = Apollo.MutationResult<CreateClientAccountMutation>;
export type CreateClientAccountMutationOptions = Apollo.BaseMutationOptions<CreateClientAccountMutation, CreateClientAccountMutationVariables>;
export const CreateArtistAccountDocument = gql`
    mutation CreateArtistAccount($input: CreateArtistAccountInput!) {
  createArtistAccount(input: $input) {
    inviteLink
    artist {
      id
      firstName
      lastName
      email
      title
      userId
    }
  }
}
    `;
export type CreateArtistAccountMutationFn = Apollo.MutationFunction<CreateArtistAccountMutation, CreateArtistAccountMutationVariables>;

/**
 * __useCreateArtistAccountMutation__
 *
 * To run a mutation, you first call `useCreateArtistAccountMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateArtistAccountMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createArtistAccountMutation, { data, loading, error }] = useCreateArtistAccountMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateArtistAccountMutation(baseOptions?: Apollo.MutationHookOptions<CreateArtistAccountMutation, CreateArtistAccountMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateArtistAccountMutation, CreateArtistAccountMutationVariables>(CreateArtistAccountDocument, options);
      }
export type CreateArtistAccountMutationHookResult = ReturnType<typeof useCreateArtistAccountMutation>;
export type CreateArtistAccountMutationResult = Apollo.MutationResult<CreateArtistAccountMutation>;
export type CreateArtistAccountMutationOptions = Apollo.BaseMutationOptions<CreateArtistAccountMutation, CreateArtistAccountMutationVariables>;
export const CreateStaffAccountDocument = gql`
    mutation CreateStaffAccount($input: CreateStaffAccountInput!) {
  createStaffAccount(input: $input) {
    inviteLink
    staff {
      id
      firstName
      lastName
      email
      title
      userId
    }
  }
}
    `;
export type CreateStaffAccountMutationFn = Apollo.MutationFunction<CreateStaffAccountMutation, CreateStaffAccountMutationVariables>;

/**
 * __useCreateStaffAccountMutation__
 *
 * To run a mutation, you first call `useCreateStaffAccountMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateStaffAccountMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createStaffAccountMutation, { data, loading, error }] = useCreateStaffAccountMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateStaffAccountMutation(baseOptions?: Apollo.MutationHookOptions<CreateStaffAccountMutation, CreateStaffAccountMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateStaffAccountMutation, CreateStaffAccountMutationVariables>(CreateStaffAccountDocument, options);
      }
export type CreateStaffAccountMutationHookResult = ReturnType<typeof useCreateStaffAccountMutation>;
export type CreateStaffAccountMutationResult = Apollo.MutationResult<CreateStaffAccountMutation>;
export type CreateStaffAccountMutationOptions = Apollo.BaseMutationOptions<CreateStaffAccountMutation, CreateStaffAccountMutationVariables>;
export const RecordAdjustmentDocument = gql`
    mutation RecordAdjustment($input: RecordAdjustmentInput!) {
  recordAdjustment(input: $input) {
    id
    appointmentId
    amountCents
    reason
    createdByUserId
    createdBy {
      id
      firstName
      lastName
    }
    createdAt
  }
}
    `;
export type RecordAdjustmentMutationFn = Apollo.MutationFunction<RecordAdjustmentMutation, RecordAdjustmentMutationVariables>;

/**
 * __useRecordAdjustmentMutation__
 *
 * To run a mutation, you first call `useRecordAdjustmentMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRecordAdjustmentMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [recordAdjustmentMutation, { data, loading, error }] = useRecordAdjustmentMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useRecordAdjustmentMutation(baseOptions?: Apollo.MutationHookOptions<RecordAdjustmentMutation, RecordAdjustmentMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RecordAdjustmentMutation, RecordAdjustmentMutationVariables>(RecordAdjustmentDocument, options);
      }
export type RecordAdjustmentMutationHookResult = ReturnType<typeof useRecordAdjustmentMutation>;
export type RecordAdjustmentMutationResult = Apollo.MutationResult<RecordAdjustmentMutation>;
export type RecordAdjustmentMutationOptions = Apollo.BaseMutationOptions<RecordAdjustmentMutation, RecordAdjustmentMutationVariables>;
export const GetArtistAnalyticsDocument = gql`
    query GetArtistAnalytics($userId: ID!, $start: DateTime!, $end: DateTime!) {
  getArtistAnalytics(userId: $userId, start: $start, end: $end) {
    ...AnalyticsFields
  }
}
    ${AnalyticsFieldsFragmentDoc}`;

/**
 * __useGetArtistAnalyticsQuery__
 *
 * To run a query within a React component, call `useGetArtistAnalyticsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetArtistAnalyticsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetArtistAnalyticsQuery({
 *   variables: {
 *      userId: // value for 'userId'
 *      start: // value for 'start'
 *      end: // value for 'end'
 *   },
 * });
 */
export function useGetArtistAnalyticsQuery(baseOptions: Apollo.QueryHookOptions<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables> & ({ variables: GetArtistAnalyticsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables>(GetArtistAnalyticsDocument, options);
      }
export function useGetArtistAnalyticsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables>(GetArtistAnalyticsDocument, options);
        }
// @ts-ignore
export function useGetArtistAnalyticsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables>): Apollo.UseSuspenseQueryResult<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables>;
export function useGetArtistAnalyticsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables>): Apollo.UseSuspenseQueryResult<GetArtistAnalyticsQuery | undefined, GetArtistAnalyticsQueryVariables>;
export function useGetArtistAnalyticsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables>(GetArtistAnalyticsDocument, options);
        }
export type GetArtistAnalyticsQueryHookResult = ReturnType<typeof useGetArtistAnalyticsQuery>;
export type GetArtistAnalyticsLazyQueryHookResult = ReturnType<typeof useGetArtistAnalyticsLazyQuery>;
export type GetArtistAnalyticsSuspenseQueryHookResult = ReturnType<typeof useGetArtistAnalyticsSuspenseQuery>;
export type GetArtistAnalyticsQueryResult = Apollo.QueryResult<GetArtistAnalyticsQuery, GetArtistAnalyticsQueryVariables>;
export const GetShopAnalyticsDocument = gql`
    query GetShopAnalytics($shopId: ID!, $start: DateTime!, $end: DateTime!) {
  getShopAnalytics(shopId: $shopId, start: $start, end: $end) {
    ...AnalyticsFields
    artists {
      userId
      artistId
      revenueCents
      tipsCents
      shopCutEarnedCents
      shopCutOutstandingCents
      shopCutAwaitingConfirmationCents
      completedSessionCount
      consultCount
      appointmentCount
      user {
        id
        firstName
        lastName
        tagColor
      }
    }
  }
}
    ${AnalyticsFieldsFragmentDoc}`;

/**
 * __useGetShopAnalyticsQuery__
 *
 * To run a query within a React component, call `useGetShopAnalyticsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetShopAnalyticsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetShopAnalyticsQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      start: // value for 'start'
 *      end: // value for 'end'
 *   },
 * });
 */
export function useGetShopAnalyticsQuery(baseOptions: Apollo.QueryHookOptions<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables> & ({ variables: GetShopAnalyticsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables>(GetShopAnalyticsDocument, options);
      }
export function useGetShopAnalyticsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables>(GetShopAnalyticsDocument, options);
        }
// @ts-ignore
export function useGetShopAnalyticsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables>;
export function useGetShopAnalyticsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopAnalyticsQuery | undefined, GetShopAnalyticsQueryVariables>;
export function useGetShopAnalyticsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables>(GetShopAnalyticsDocument, options);
        }
export type GetShopAnalyticsQueryHookResult = ReturnType<typeof useGetShopAnalyticsQuery>;
export type GetShopAnalyticsLazyQueryHookResult = ReturnType<typeof useGetShopAnalyticsLazyQuery>;
export type GetShopAnalyticsSuspenseQueryHookResult = ReturnType<typeof useGetShopAnalyticsSuspenseQuery>;
export type GetShopAnalyticsQueryResult = Apollo.QueryResult<GetShopAnalyticsQuery, GetShopAnalyticsQueryVariables>;
export const GetAppointmentDocument = gql`
    query GetAppointment($appointmentId: ID!) {
  getAppointment(appointmentId: $appointmentId) {
    id
    projectId
    userId
    shopId
    isPersonal
    title
    description
    appointmentDate
    durationMinutes
    appointmentEnd
    appointmentStatus
    appointmentType
    shopCutStatus
    shopCutCents
    createdAt
    updatedAt
  }
}
    `;

/**
 * __useGetAppointmentQuery__
 *
 * To run a query within a React component, call `useGetAppointmentQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAppointmentQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAppointmentQuery({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *   },
 * });
 */
export function useGetAppointmentQuery(baseOptions: Apollo.QueryHookOptions<GetAppointmentQuery, GetAppointmentQueryVariables> & ({ variables: GetAppointmentQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetAppointmentQuery, GetAppointmentQueryVariables>(GetAppointmentDocument, options);
      }
export function useGetAppointmentLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetAppointmentQuery, GetAppointmentQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetAppointmentQuery, GetAppointmentQueryVariables>(GetAppointmentDocument, options);
        }
// @ts-ignore
export function useGetAppointmentSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetAppointmentQuery, GetAppointmentQueryVariables>): Apollo.UseSuspenseQueryResult<GetAppointmentQuery, GetAppointmentQueryVariables>;
export function useGetAppointmentSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAppointmentQuery, GetAppointmentQueryVariables>): Apollo.UseSuspenseQueryResult<GetAppointmentQuery | undefined, GetAppointmentQueryVariables>;
export function useGetAppointmentSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAppointmentQuery, GetAppointmentQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetAppointmentQuery, GetAppointmentQueryVariables>(GetAppointmentDocument, options);
        }
export type GetAppointmentQueryHookResult = ReturnType<typeof useGetAppointmentQuery>;
export type GetAppointmentLazyQueryHookResult = ReturnType<typeof useGetAppointmentLazyQuery>;
export type GetAppointmentSuspenseQueryHookResult = ReturnType<typeof useGetAppointmentSuspenseQuery>;
export type GetAppointmentQueryResult = Apollo.QueryResult<GetAppointmentQuery, GetAppointmentQueryVariables>;
export const UpdateAppointmentDocument = gql`
    mutation UpdateAppointment($appointmentInput: AppointmentInput) {
  updateAppointment(appointmentInput: $appointmentInput) {
    id
    projectId
    userId
    shopId
    isPersonal
    title
    description
    appointmentDate
    durationMinutes
    appointmentEnd
    appointmentStatus
    appointmentType
    shopCutStatus
    shopCutCents
    createdAt
    updatedAt
  }
}
    `;
export type UpdateAppointmentMutationFn = Apollo.MutationFunction<UpdateAppointmentMutation, UpdateAppointmentMutationVariables>;

/**
 * __useUpdateAppointmentMutation__
 *
 * To run a mutation, you first call `useUpdateAppointmentMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateAppointmentMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateAppointmentMutation, { data, loading, error }] = useUpdateAppointmentMutation({
 *   variables: {
 *      appointmentInput: // value for 'appointmentInput'
 *   },
 * });
 */
export function useUpdateAppointmentMutation(baseOptions?: Apollo.MutationHookOptions<UpdateAppointmentMutation, UpdateAppointmentMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateAppointmentMutation, UpdateAppointmentMutationVariables>(UpdateAppointmentDocument, options);
      }
export type UpdateAppointmentMutationHookResult = ReturnType<typeof useUpdateAppointmentMutation>;
export type UpdateAppointmentMutationResult = Apollo.MutationResult<UpdateAppointmentMutation>;
export type UpdateAppointmentMutationOptions = Apollo.BaseMutationOptions<UpdateAppointmentMutation, UpdateAppointmentMutationVariables>;
export const DeleteAppointmentDocument = gql`
    mutation DeleteAppointment($appointmentId: ID) {
  deleteAppointment(appointmentId: $appointmentId)
}
    `;
export type DeleteAppointmentMutationFn = Apollo.MutationFunction<DeleteAppointmentMutation, DeleteAppointmentMutationVariables>;

/**
 * __useDeleteAppointmentMutation__
 *
 * To run a mutation, you first call `useDeleteAppointmentMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteAppointmentMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteAppointmentMutation, { data, loading, error }] = useDeleteAppointmentMutation({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *   },
 * });
 */
export function useDeleteAppointmentMutation(baseOptions?: Apollo.MutationHookOptions<DeleteAppointmentMutation, DeleteAppointmentMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteAppointmentMutation, DeleteAppointmentMutationVariables>(DeleteAppointmentDocument, options);
      }
export type DeleteAppointmentMutationHookResult = ReturnType<typeof useDeleteAppointmentMutation>;
export type DeleteAppointmentMutationResult = Apollo.MutationResult<DeleteAppointmentMutation>;
export type DeleteAppointmentMutationOptions = Apollo.BaseMutationOptions<DeleteAppointmentMutation, DeleteAppointmentMutationVariables>;
export const CreateAppointmentDocument = gql`
    mutation CreateAppointment($appointmentInput: AppointmentInput) {
  createAppointment(appointmentInput: $appointmentInput) {
    id
    projectId
    userId
    shopId
    title
    appointmentType
    appointmentDate
    durationMinutes
    appointmentEnd
    appointmentStatus
    shopCutStatus
  }
}
    `;
export type CreateAppointmentMutationFn = Apollo.MutationFunction<CreateAppointmentMutation, CreateAppointmentMutationVariables>;

/**
 * __useCreateAppointmentMutation__
 *
 * To run a mutation, you first call `useCreateAppointmentMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateAppointmentMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createAppointmentMutation, { data, loading, error }] = useCreateAppointmentMutation({
 *   variables: {
 *      appointmentInput: // value for 'appointmentInput'
 *   },
 * });
 */
export function useCreateAppointmentMutation(baseOptions?: Apollo.MutationHookOptions<CreateAppointmentMutation, CreateAppointmentMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateAppointmentMutation, CreateAppointmentMutationVariables>(CreateAppointmentDocument, options);
      }
export type CreateAppointmentMutationHookResult = ReturnType<typeof useCreateAppointmentMutation>;
export type CreateAppointmentMutationResult = Apollo.MutationResult<CreateAppointmentMutation>;
export type CreateAppointmentMutationOptions = Apollo.BaseMutationOptions<CreateAppointmentMutation, CreateAppointmentMutationVariables>;
export const GetAppointmentsByShopDocument = gql`
    query GetAppointmentsByShop($shopId: ID!, $filter: AppointmentFilter, $page: PageInput) {
  getAppointmentsByShop(shopId: $shopId, filter: $filter, page: $page) {
    items {
      ...AppointmentListItem
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    ${AppointmentListItemFragmentDoc}`;

/**
 * __useGetAppointmentsByShopQuery__
 *
 * To run a query within a React component, call `useGetAppointmentsByShopQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAppointmentsByShopQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAppointmentsByShopQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      filter: // value for 'filter'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetAppointmentsByShopQuery(baseOptions: Apollo.QueryHookOptions<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables> & ({ variables: GetAppointmentsByShopQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables>(GetAppointmentsByShopDocument, options);
      }
export function useGetAppointmentsByShopLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables>(GetAppointmentsByShopDocument, options);
        }
// @ts-ignore
export function useGetAppointmentsByShopSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables>): Apollo.UseSuspenseQueryResult<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables>;
export function useGetAppointmentsByShopSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables>): Apollo.UseSuspenseQueryResult<GetAppointmentsByShopQuery | undefined, GetAppointmentsByShopQueryVariables>;
export function useGetAppointmentsByShopSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables>(GetAppointmentsByShopDocument, options);
        }
export type GetAppointmentsByShopQueryHookResult = ReturnType<typeof useGetAppointmentsByShopQuery>;
export type GetAppointmentsByShopLazyQueryHookResult = ReturnType<typeof useGetAppointmentsByShopLazyQuery>;
export type GetAppointmentsByShopSuspenseQueryHookResult = ReturnType<typeof useGetAppointmentsByShopSuspenseQuery>;
export type GetAppointmentsByShopQueryResult = Apollo.QueryResult<GetAppointmentsByShopQuery, GetAppointmentsByShopQueryVariables>;
export const GetAppointmentsByArtistDocument = gql`
    query GetAppointmentsByArtist($userId: ID!, $filter: AppointmentFilter, $page: PageInput) {
  getAppointmentsByArtist(userId: $userId, filter: $filter, page: $page) {
    items {
      ...AppointmentListItem
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    ${AppointmentListItemFragmentDoc}`;

/**
 * __useGetAppointmentsByArtistQuery__
 *
 * To run a query within a React component, call `useGetAppointmentsByArtistQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAppointmentsByArtistQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAppointmentsByArtistQuery({
 *   variables: {
 *      userId: // value for 'userId'
 *      filter: // value for 'filter'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetAppointmentsByArtistQuery(baseOptions: Apollo.QueryHookOptions<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables> & ({ variables: GetAppointmentsByArtistQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables>(GetAppointmentsByArtistDocument, options);
      }
export function useGetAppointmentsByArtistLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables>(GetAppointmentsByArtistDocument, options);
        }
// @ts-ignore
export function useGetAppointmentsByArtistSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables>): Apollo.UseSuspenseQueryResult<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables>;
export function useGetAppointmentsByArtistSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables>): Apollo.UseSuspenseQueryResult<GetAppointmentsByArtistQuery | undefined, GetAppointmentsByArtistQueryVariables>;
export function useGetAppointmentsByArtistSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables>(GetAppointmentsByArtistDocument, options);
        }
export type GetAppointmentsByArtistQueryHookResult = ReturnType<typeof useGetAppointmentsByArtistQuery>;
export type GetAppointmentsByArtistLazyQueryHookResult = ReturnType<typeof useGetAppointmentsByArtistLazyQuery>;
export type GetAppointmentsByArtistSuspenseQueryHookResult = ReturnType<typeof useGetAppointmentsByArtistSuspenseQuery>;
export type GetAppointmentsByArtistQueryResult = Apollo.QueryResult<GetAppointmentsByArtistQuery, GetAppointmentsByArtistQueryVariables>;
export const GetAppointmentsByProjectDocument = gql`
    query GetAppointmentsByProject($projectId: ID!) {
  getAppointmentsByProject(projectId: $projectId) {
    id
    projectId
    userId
    shopId
    title
    description
    appointmentType
    appointmentDate
    durationMinutes
    appointmentEnd
    appointmentStatus
    subtotalCents
    taxCents
    feeCents
    tipCents
    totalCents
    shopCutCents
    shopCutStatus
    shopCutPercentApplied
    depositCents
    depositStatus
    depositCreditCents
    depositCreditFromAppointmentId
    giftCardCreditCents
    artistIssuedGiftCardCreditCents
    timerStatus
    timerStartedAt
    accumulatedSeconds
    sessionNotes
    adjustments {
      id
      amountCents
      reason
      createdAt
      createdBy {
        id
        firstName
        lastName
      }
    }
  }
}
    `;

/**
 * __useGetAppointmentsByProjectQuery__
 *
 * To run a query within a React component, call `useGetAppointmentsByProjectQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAppointmentsByProjectQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAppointmentsByProjectQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *   },
 * });
 */
export function useGetAppointmentsByProjectQuery(baseOptions: Apollo.QueryHookOptions<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables> & ({ variables: GetAppointmentsByProjectQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables>(GetAppointmentsByProjectDocument, options);
      }
export function useGetAppointmentsByProjectLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables>(GetAppointmentsByProjectDocument, options);
        }
// @ts-ignore
export function useGetAppointmentsByProjectSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables>): Apollo.UseSuspenseQueryResult<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables>;
export function useGetAppointmentsByProjectSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables>): Apollo.UseSuspenseQueryResult<GetAppointmentsByProjectQuery | undefined, GetAppointmentsByProjectQueryVariables>;
export function useGetAppointmentsByProjectSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables>(GetAppointmentsByProjectDocument, options);
        }
export type GetAppointmentsByProjectQueryHookResult = ReturnType<typeof useGetAppointmentsByProjectQuery>;
export type GetAppointmentsByProjectLazyQueryHookResult = ReturnType<typeof useGetAppointmentsByProjectLazyQuery>;
export type GetAppointmentsByProjectSuspenseQueryHookResult = ReturnType<typeof useGetAppointmentsByProjectSuspenseQuery>;
export type GetAppointmentsByProjectQueryResult = Apollo.QueryResult<GetAppointmentsByProjectQuery, GetAppointmentsByProjectQueryVariables>;
export const GetArtistShopConnectionsDocument = gql`
    query GetArtistShopConnections($artistId: ID!) {
  getArtistShopConnections(artistId: $artistId) {
    id
    artistId
    shopId
    status
    rateSource
  }
}
    `;

/**
 * __useGetArtistShopConnectionsQuery__
 *
 * To run a query within a React component, call `useGetArtistShopConnectionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetArtistShopConnectionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetArtistShopConnectionsQuery({
 *   variables: {
 *      artistId: // value for 'artistId'
 *   },
 * });
 */
export function useGetArtistShopConnectionsQuery(baseOptions: Apollo.QueryHookOptions<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables> & ({ variables: GetArtistShopConnectionsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables>(GetArtistShopConnectionsDocument, options);
      }
export function useGetArtistShopConnectionsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables>(GetArtistShopConnectionsDocument, options);
        }
// @ts-ignore
export function useGetArtistShopConnectionsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables>): Apollo.UseSuspenseQueryResult<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables>;
export function useGetArtistShopConnectionsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables>): Apollo.UseSuspenseQueryResult<GetArtistShopConnectionsQuery | undefined, GetArtistShopConnectionsQueryVariables>;
export function useGetArtistShopConnectionsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables>(GetArtistShopConnectionsDocument, options);
        }
export type GetArtistShopConnectionsQueryHookResult = ReturnType<typeof useGetArtistShopConnectionsQuery>;
export type GetArtistShopConnectionsLazyQueryHookResult = ReturnType<typeof useGetArtistShopConnectionsLazyQuery>;
export type GetArtistShopConnectionsSuspenseQueryHookResult = ReturnType<typeof useGetArtistShopConnectionsSuspenseQuery>;
export type GetArtistShopConnectionsQueryResult = Apollo.QueryResult<GetArtistShopConnectionsQuery, GetArtistShopConnectionsQueryVariables>;
export const ConnectArtistToShopDocument = gql`
    mutation ConnectArtistToShop($artistId: ID!, $shopId: ID!, $confirmTransfer: Boolean) {
  connectArtistToShop(
    artistId: $artistId
    shopId: $shopId
    confirmTransfer: $confirmTransfer
  ) {
    id
    artistId
    shopId
    status
  }
}
    `;
export type ConnectArtistToShopMutationFn = Apollo.MutationFunction<ConnectArtistToShopMutation, ConnectArtistToShopMutationVariables>;

/**
 * __useConnectArtistToShopMutation__
 *
 * To run a mutation, you first call `useConnectArtistToShopMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useConnectArtistToShopMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [connectArtistToShopMutation, { data, loading, error }] = useConnectArtistToShopMutation({
 *   variables: {
 *      artistId: // value for 'artistId'
 *      shopId: // value for 'shopId'
 *      confirmTransfer: // value for 'confirmTransfer'
 *   },
 * });
 */
export function useConnectArtistToShopMutation(baseOptions?: Apollo.MutationHookOptions<ConnectArtistToShopMutation, ConnectArtistToShopMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ConnectArtistToShopMutation, ConnectArtistToShopMutationVariables>(ConnectArtistToShopDocument, options);
      }
export type ConnectArtistToShopMutationHookResult = ReturnType<typeof useConnectArtistToShopMutation>;
export type ConnectArtistToShopMutationResult = Apollo.MutationResult<ConnectArtistToShopMutation>;
export type ConnectArtistToShopMutationOptions = Apollo.BaseMutationOptions<ConnectArtistToShopMutation, ConnectArtistToShopMutationVariables>;
export const DisconnectArtistFromShopDocument = gql`
    mutation DisconnectArtistFromShop($artistId: ID!, $shopId: ID!) {
  disconnectArtistFromShop(artistId: $artistId, shopId: $shopId) {
    id
    artistId
    shopId
    status
  }
}
    `;
export type DisconnectArtistFromShopMutationFn = Apollo.MutationFunction<DisconnectArtistFromShopMutation, DisconnectArtistFromShopMutationVariables>;

/**
 * __useDisconnectArtistFromShopMutation__
 *
 * To run a mutation, you first call `useDisconnectArtistFromShopMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDisconnectArtistFromShopMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [disconnectArtistFromShopMutation, { data, loading, error }] = useDisconnectArtistFromShopMutation({
 *   variables: {
 *      artistId: // value for 'artistId'
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useDisconnectArtistFromShopMutation(baseOptions?: Apollo.MutationHookOptions<DisconnectArtistFromShopMutation, DisconnectArtistFromShopMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DisconnectArtistFromShopMutation, DisconnectArtistFromShopMutationVariables>(DisconnectArtistFromShopDocument, options);
      }
export type DisconnectArtistFromShopMutationHookResult = ReturnType<typeof useDisconnectArtistFromShopMutation>;
export type DisconnectArtistFromShopMutationResult = Apollo.MutationResult<DisconnectArtistFromShopMutation>;
export type DisconnectArtistFromShopMutationOptions = Apollo.BaseMutationOptions<DisconnectArtistFromShopMutation, DisconnectArtistFromShopMutationVariables>;
export const GetShopForConnectionDocument = gql`
    query GetShopForConnection($shopId: ID!) {
  getShop(shopId: $shopId) {
    id
    name
    website
  }
}
    `;

/**
 * __useGetShopForConnectionQuery__
 *
 * To run a query within a React component, call `useGetShopForConnectionQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetShopForConnectionQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetShopForConnectionQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useGetShopForConnectionQuery(baseOptions: Apollo.QueryHookOptions<GetShopForConnectionQuery, GetShopForConnectionQueryVariables> & ({ variables: GetShopForConnectionQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetShopForConnectionQuery, GetShopForConnectionQueryVariables>(GetShopForConnectionDocument, options);
      }
export function useGetShopForConnectionLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetShopForConnectionQuery, GetShopForConnectionQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetShopForConnectionQuery, GetShopForConnectionQueryVariables>(GetShopForConnectionDocument, options);
        }
// @ts-ignore
export function useGetShopForConnectionSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetShopForConnectionQuery, GetShopForConnectionQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopForConnectionQuery, GetShopForConnectionQueryVariables>;
export function useGetShopForConnectionSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopForConnectionQuery, GetShopForConnectionQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopForConnectionQuery | undefined, GetShopForConnectionQueryVariables>;
export function useGetShopForConnectionSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopForConnectionQuery, GetShopForConnectionQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetShopForConnectionQuery, GetShopForConnectionQueryVariables>(GetShopForConnectionDocument, options);
        }
export type GetShopForConnectionQueryHookResult = ReturnType<typeof useGetShopForConnectionQuery>;
export type GetShopForConnectionLazyQueryHookResult = ReturnType<typeof useGetShopForConnectionLazyQuery>;
export type GetShopForConnectionSuspenseQueryHookResult = ReturnType<typeof useGetShopForConnectionSuspenseQuery>;
export type GetShopForConnectionQueryResult = Apollo.QueryResult<GetShopForConnectionQuery, GetShopForConnectionQueryVariables>;
export const GetArtistsListDocument = gql`
    query GetArtistsList($includeArchived: Boolean, $page: PageInput) {
  getArtists(includeArchived: $includeArchived, page: $page) {
    items {
      id
      firstName
      lastName
      title
      email
      phone
      instagram
      facebook
      avatar
      status
      user {
        id
        avatar
      }
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetArtistsListQuery__
 *
 * To run a query within a React component, call `useGetArtistsListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetArtistsListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetArtistsListQuery({
 *   variables: {
 *      includeArchived: // value for 'includeArchived'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetArtistsListQuery(baseOptions?: Apollo.QueryHookOptions<GetArtistsListQuery, GetArtistsListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetArtistsListQuery, GetArtistsListQueryVariables>(GetArtistsListDocument, options);
      }
export function useGetArtistsListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetArtistsListQuery, GetArtistsListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetArtistsListQuery, GetArtistsListQueryVariables>(GetArtistsListDocument, options);
        }
// @ts-ignore
export function useGetArtistsListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetArtistsListQuery, GetArtistsListQueryVariables>): Apollo.UseSuspenseQueryResult<GetArtistsListQuery, GetArtistsListQueryVariables>;
export function useGetArtistsListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetArtistsListQuery, GetArtistsListQueryVariables>): Apollo.UseSuspenseQueryResult<GetArtistsListQuery | undefined, GetArtistsListQueryVariables>;
export function useGetArtistsListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetArtistsListQuery, GetArtistsListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetArtistsListQuery, GetArtistsListQueryVariables>(GetArtistsListDocument, options);
        }
export type GetArtistsListQueryHookResult = ReturnType<typeof useGetArtistsListQuery>;
export type GetArtistsListLazyQueryHookResult = ReturnType<typeof useGetArtistsListLazyQuery>;
export type GetArtistsListSuspenseQueryHookResult = ReturnType<typeof useGetArtistsListSuspenseQuery>;
export type GetArtistsListQueryResult = Apollo.QueryResult<GetArtistsListQuery, GetArtistsListQueryVariables>;
export const GetArtistDetailDocument = gql`
    query GetArtistDetail($artistId: ID!) {
  getArtist(artistId: $artistId) {
    id
    userId
    firstName
    lastName
    email
    title
    phone
    address
    city
    state
    zip
    instagram
    facebook
    avatar
    startDate
    status
    shopId
    user {
      id
      avatar
    }
  }
}
    `;

/**
 * __useGetArtistDetailQuery__
 *
 * To run a query within a React component, call `useGetArtistDetailQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetArtistDetailQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetArtistDetailQuery({
 *   variables: {
 *      artistId: // value for 'artistId'
 *   },
 * });
 */
export function useGetArtistDetailQuery(baseOptions: Apollo.QueryHookOptions<GetArtistDetailQuery, GetArtistDetailQueryVariables> & ({ variables: GetArtistDetailQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetArtistDetailQuery, GetArtistDetailQueryVariables>(GetArtistDetailDocument, options);
      }
export function useGetArtistDetailLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetArtistDetailQuery, GetArtistDetailQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetArtistDetailQuery, GetArtistDetailQueryVariables>(GetArtistDetailDocument, options);
        }
// @ts-ignore
export function useGetArtistDetailSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetArtistDetailQuery, GetArtistDetailQueryVariables>): Apollo.UseSuspenseQueryResult<GetArtistDetailQuery, GetArtistDetailQueryVariables>;
export function useGetArtistDetailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetArtistDetailQuery, GetArtistDetailQueryVariables>): Apollo.UseSuspenseQueryResult<GetArtistDetailQuery | undefined, GetArtistDetailQueryVariables>;
export function useGetArtistDetailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetArtistDetailQuery, GetArtistDetailQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetArtistDetailQuery, GetArtistDetailQueryVariables>(GetArtistDetailDocument, options);
        }
export type GetArtistDetailQueryHookResult = ReturnType<typeof useGetArtistDetailQuery>;
export type GetArtistDetailLazyQueryHookResult = ReturnType<typeof useGetArtistDetailLazyQuery>;
export type GetArtistDetailSuspenseQueryHookResult = ReturnType<typeof useGetArtistDetailSuspenseQuery>;
export type GetArtistDetailQueryResult = Apollo.QueryResult<GetArtistDetailQuery, GetArtistDetailQueryVariables>;
export const UpdateArtistIdentityDocument = gql`
    mutation UpdateArtistIdentity($artist: ArtistInput!) {
  updateArtist(artist: $artist) {
    id
    firstName
    lastName
    email
    title
    phone
    address
    city
    state
    zip
    instagram
    facebook
    startDate
  }
}
    `;
export type UpdateArtistIdentityMutationFn = Apollo.MutationFunction<UpdateArtistIdentityMutation, UpdateArtistIdentityMutationVariables>;

/**
 * __useUpdateArtistIdentityMutation__
 *
 * To run a mutation, you first call `useUpdateArtistIdentityMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateArtistIdentityMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateArtistIdentityMutation, { data, loading, error }] = useUpdateArtistIdentityMutation({
 *   variables: {
 *      artist: // value for 'artist'
 *   },
 * });
 */
export function useUpdateArtistIdentityMutation(baseOptions?: Apollo.MutationHookOptions<UpdateArtistIdentityMutation, UpdateArtistIdentityMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateArtistIdentityMutation, UpdateArtistIdentityMutationVariables>(UpdateArtistIdentityDocument, options);
      }
export type UpdateArtistIdentityMutationHookResult = ReturnType<typeof useUpdateArtistIdentityMutation>;
export type UpdateArtistIdentityMutationResult = Apollo.MutationResult<UpdateArtistIdentityMutation>;
export type UpdateArtistIdentityMutationOptions = Apollo.BaseMutationOptions<UpdateArtistIdentityMutation, UpdateArtistIdentityMutationVariables>;
export const ArchiveArtistDocument = gql`
    mutation ArchiveArtist($artistId: ID!) {
  archiveArtist(artistId: $artistId) {
    id
    status
  }
}
    `;
export type ArchiveArtistMutationFn = Apollo.MutationFunction<ArchiveArtistMutation, ArchiveArtistMutationVariables>;

/**
 * __useArchiveArtistMutation__
 *
 * To run a mutation, you first call `useArchiveArtistMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useArchiveArtistMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [archiveArtistMutation, { data, loading, error }] = useArchiveArtistMutation({
 *   variables: {
 *      artistId: // value for 'artistId'
 *   },
 * });
 */
export function useArchiveArtistMutation(baseOptions?: Apollo.MutationHookOptions<ArchiveArtistMutation, ArchiveArtistMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ArchiveArtistMutation, ArchiveArtistMutationVariables>(ArchiveArtistDocument, options);
      }
export type ArchiveArtistMutationHookResult = ReturnType<typeof useArchiveArtistMutation>;
export type ArchiveArtistMutationResult = Apollo.MutationResult<ArchiveArtistMutation>;
export type ArchiveArtistMutationOptions = Apollo.BaseMutationOptions<ArchiveArtistMutation, ArchiveArtistMutationVariables>;
export const UnarchiveArtistDocument = gql`
    mutation UnarchiveArtist($artistId: ID!) {
  unarchiveArtist(artistId: $artistId) {
    id
    status
  }
}
    `;
export type UnarchiveArtistMutationFn = Apollo.MutationFunction<UnarchiveArtistMutation, UnarchiveArtistMutationVariables>;

/**
 * __useUnarchiveArtistMutation__
 *
 * To run a mutation, you first call `useUnarchiveArtistMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUnarchiveArtistMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [unarchiveArtistMutation, { data, loading, error }] = useUnarchiveArtistMutation({
 *   variables: {
 *      artistId: // value for 'artistId'
 *   },
 * });
 */
export function useUnarchiveArtistMutation(baseOptions?: Apollo.MutationHookOptions<UnarchiveArtistMutation, UnarchiveArtistMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UnarchiveArtistMutation, UnarchiveArtistMutationVariables>(UnarchiveArtistDocument, options);
      }
export type UnarchiveArtistMutationHookResult = ReturnType<typeof useUnarchiveArtistMutation>;
export type UnarchiveArtistMutationResult = Apollo.MutationResult<UnarchiveArtistMutation>;
export type UnarchiveArtistMutationOptions = Apollo.BaseMutationOptions<UnarchiveArtistMutation, UnarchiveArtistMutationVariables>;
export const SendAutoResponseNowDocument = gql`
    mutation SendAutoResponseNow($autoResponseId: ID!, $clientId: ID!, $appointmentId: ID) {
  sendAutoResponseNow(
    autoResponseId: $autoResponseId
    clientId: $clientId
    appointmentId: $appointmentId
  )
}
    `;
export type SendAutoResponseNowMutationFn = Apollo.MutationFunction<SendAutoResponseNowMutation, SendAutoResponseNowMutationVariables>;

/**
 * __useSendAutoResponseNowMutation__
 *
 * To run a mutation, you first call `useSendAutoResponseNowMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSendAutoResponseNowMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [sendAutoResponseNowMutation, { data, loading, error }] = useSendAutoResponseNowMutation({
 *   variables: {
 *      autoResponseId: // value for 'autoResponseId'
 *      clientId: // value for 'clientId'
 *      appointmentId: // value for 'appointmentId'
 *   },
 * });
 */
export function useSendAutoResponseNowMutation(baseOptions?: Apollo.MutationHookOptions<SendAutoResponseNowMutation, SendAutoResponseNowMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SendAutoResponseNowMutation, SendAutoResponseNowMutationVariables>(SendAutoResponseNowDocument, options);
      }
export type SendAutoResponseNowMutationHookResult = ReturnType<typeof useSendAutoResponseNowMutation>;
export type SendAutoResponseNowMutationResult = Apollo.MutationResult<SendAutoResponseNowMutation>;
export type SendAutoResponseNowMutationOptions = Apollo.BaseMutationOptions<SendAutoResponseNowMutation, SendAutoResponseNowMutationVariables>;
export const GetAutoResponsesDocument = gql`
    query GetAutoResponses($shopId: ID, $artistUserId: ID, $includeInactive: Boolean) {
  getAutoResponses(
    shopId: $shopId
    artistUserId: $artistUserId
    includeInactive: $includeInactive
  ) {
    id
    shopId
    artistUserId
    name
    trigger
    enabled
    emailEnabled
    smsEnabled
    emailSubjectTemplate
    emailBodyTemplate
    smsTemplate
    active
  }
}
    `;

/**
 * __useGetAutoResponsesQuery__
 *
 * To run a query within a React component, call `useGetAutoResponsesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAutoResponsesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAutoResponsesQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *      includeInactive: // value for 'includeInactive'
 *   },
 * });
 */
export function useGetAutoResponsesQuery(baseOptions?: Apollo.QueryHookOptions<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>(GetAutoResponsesDocument, options);
      }
export function useGetAutoResponsesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>(GetAutoResponsesDocument, options);
        }
// @ts-ignore
export function useGetAutoResponsesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>): Apollo.UseSuspenseQueryResult<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>;
export function useGetAutoResponsesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>): Apollo.UseSuspenseQueryResult<GetAutoResponsesQuery | undefined, GetAutoResponsesQueryVariables>;
export function useGetAutoResponsesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>(GetAutoResponsesDocument, options);
        }
export type GetAutoResponsesQueryHookResult = ReturnType<typeof useGetAutoResponsesQuery>;
export type GetAutoResponsesLazyQueryHookResult = ReturnType<typeof useGetAutoResponsesLazyQuery>;
export type GetAutoResponsesSuspenseQueryHookResult = ReturnType<typeof useGetAutoResponsesSuspenseQuery>;
export type GetAutoResponsesQueryResult = Apollo.QueryResult<GetAutoResponsesQuery, GetAutoResponsesQueryVariables>;
export const CreateAutoResponseDocument = gql`
    mutation CreateAutoResponse($input: CreateAutoResponseInput!) {
  createAutoResponse(input: $input) {
    id
    shopId
    artistUserId
    name
    trigger
    enabled
    emailEnabled
    smsEnabled
    emailSubjectTemplate
    emailBodyTemplate
    smsTemplate
    active
  }
}
    `;
export type CreateAutoResponseMutationFn = Apollo.MutationFunction<CreateAutoResponseMutation, CreateAutoResponseMutationVariables>;

/**
 * __useCreateAutoResponseMutation__
 *
 * To run a mutation, you first call `useCreateAutoResponseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateAutoResponseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createAutoResponseMutation, { data, loading, error }] = useCreateAutoResponseMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateAutoResponseMutation(baseOptions?: Apollo.MutationHookOptions<CreateAutoResponseMutation, CreateAutoResponseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateAutoResponseMutation, CreateAutoResponseMutationVariables>(CreateAutoResponseDocument, options);
      }
export type CreateAutoResponseMutationHookResult = ReturnType<typeof useCreateAutoResponseMutation>;
export type CreateAutoResponseMutationResult = Apollo.MutationResult<CreateAutoResponseMutation>;
export type CreateAutoResponseMutationOptions = Apollo.BaseMutationOptions<CreateAutoResponseMutation, CreateAutoResponseMutationVariables>;
export const UpdateAutoResponseDocument = gql`
    mutation UpdateAutoResponse($input: UpdateAutoResponseInput!) {
  updateAutoResponse(input: $input) {
    id
    shopId
    artistUserId
    name
    trigger
    enabled
    emailEnabled
    smsEnabled
    emailSubjectTemplate
    emailBodyTemplate
    smsTemplate
    active
  }
}
    `;
export type UpdateAutoResponseMutationFn = Apollo.MutationFunction<UpdateAutoResponseMutation, UpdateAutoResponseMutationVariables>;

/**
 * __useUpdateAutoResponseMutation__
 *
 * To run a mutation, you first call `useUpdateAutoResponseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateAutoResponseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateAutoResponseMutation, { data, loading, error }] = useUpdateAutoResponseMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateAutoResponseMutation(baseOptions?: Apollo.MutationHookOptions<UpdateAutoResponseMutation, UpdateAutoResponseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateAutoResponseMutation, UpdateAutoResponseMutationVariables>(UpdateAutoResponseDocument, options);
      }
export type UpdateAutoResponseMutationHookResult = ReturnType<typeof useUpdateAutoResponseMutation>;
export type UpdateAutoResponseMutationResult = Apollo.MutationResult<UpdateAutoResponseMutation>;
export type UpdateAutoResponseMutationOptions = Apollo.BaseMutationOptions<UpdateAutoResponseMutation, UpdateAutoResponseMutationVariables>;
export const ArchiveAutoResponseDocument = gql`
    mutation ArchiveAutoResponse($autoResponseId: ID!) {
  archiveAutoResponse(autoResponseId: $autoResponseId) {
    id
    active
  }
}
    `;
export type ArchiveAutoResponseMutationFn = Apollo.MutationFunction<ArchiveAutoResponseMutation, ArchiveAutoResponseMutationVariables>;

/**
 * __useArchiveAutoResponseMutation__
 *
 * To run a mutation, you first call `useArchiveAutoResponseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useArchiveAutoResponseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [archiveAutoResponseMutation, { data, loading, error }] = useArchiveAutoResponseMutation({
 *   variables: {
 *      autoResponseId: // value for 'autoResponseId'
 *   },
 * });
 */
export function useArchiveAutoResponseMutation(baseOptions?: Apollo.MutationHookOptions<ArchiveAutoResponseMutation, ArchiveAutoResponseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ArchiveAutoResponseMutation, ArchiveAutoResponseMutationVariables>(ArchiveAutoResponseDocument, options);
      }
export type ArchiveAutoResponseMutationHookResult = ReturnType<typeof useArchiveAutoResponseMutation>;
export type ArchiveAutoResponseMutationResult = Apollo.MutationResult<ArchiveAutoResponseMutation>;
export type ArchiveAutoResponseMutationOptions = Apollo.BaseMutationOptions<ArchiveAutoResponseMutation, ArchiveAutoResponseMutationVariables>;
export const GetBookingRequestsDocument = gql`
    query GetBookingRequests($artistId: ID!, $statuses: [String!], $page: PageInput) {
  getBookingRequests(artistId: $artistId, statuses: $statuses, page: $page) {
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
    items {
      id
      status
      description
      createdAt
      client {
        firstName
        lastName
      }
      conversation {
        id
        unreadCount
      }
    }
  }
}
    `;

/**
 * __useGetBookingRequestsQuery__
 *
 * To run a query within a React component, call `useGetBookingRequestsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetBookingRequestsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetBookingRequestsQuery({
 *   variables: {
 *      artistId: // value for 'artistId'
 *      statuses: // value for 'statuses'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetBookingRequestsQuery(baseOptions: Apollo.QueryHookOptions<GetBookingRequestsQuery, GetBookingRequestsQueryVariables> & ({ variables: GetBookingRequestsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetBookingRequestsQuery, GetBookingRequestsQueryVariables>(GetBookingRequestsDocument, options);
      }
export function useGetBookingRequestsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetBookingRequestsQuery, GetBookingRequestsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetBookingRequestsQuery, GetBookingRequestsQueryVariables>(GetBookingRequestsDocument, options);
        }
// @ts-ignore
export function useGetBookingRequestsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetBookingRequestsQuery, GetBookingRequestsQueryVariables>): Apollo.UseSuspenseQueryResult<GetBookingRequestsQuery, GetBookingRequestsQueryVariables>;
export function useGetBookingRequestsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetBookingRequestsQuery, GetBookingRequestsQueryVariables>): Apollo.UseSuspenseQueryResult<GetBookingRequestsQuery | undefined, GetBookingRequestsQueryVariables>;
export function useGetBookingRequestsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetBookingRequestsQuery, GetBookingRequestsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetBookingRequestsQuery, GetBookingRequestsQueryVariables>(GetBookingRequestsDocument, options);
        }
export type GetBookingRequestsQueryHookResult = ReturnType<typeof useGetBookingRequestsQuery>;
export type GetBookingRequestsLazyQueryHookResult = ReturnType<typeof useGetBookingRequestsLazyQuery>;
export type GetBookingRequestsSuspenseQueryHookResult = ReturnType<typeof useGetBookingRequestsSuspenseQuery>;
export type GetBookingRequestsQueryResult = Apollo.QueryResult<GetBookingRequestsQuery, GetBookingRequestsQueryVariables>;
export const GetBookingRequestDocument = gql`
    query GetBookingRequest($bookingRequestId: ID!) {
  getBookingRequest(bookingRequestId: $bookingRequestId) {
    id
    artistId
    status
    description
    placement
    size
    budget
    availability
    isCoverUp
    howHeard
    referenceImages
    createdAt
    client {
      firstName
      lastName
      email
      phone
    }
    conversation {
      id
      unreadCount
    }
  }
}
    `;

/**
 * __useGetBookingRequestQuery__
 *
 * To run a query within a React component, call `useGetBookingRequestQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetBookingRequestQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetBookingRequestQuery({
 *   variables: {
 *      bookingRequestId: // value for 'bookingRequestId'
 *   },
 * });
 */
export function useGetBookingRequestQuery(baseOptions: Apollo.QueryHookOptions<GetBookingRequestQuery, GetBookingRequestQueryVariables> & ({ variables: GetBookingRequestQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetBookingRequestQuery, GetBookingRequestQueryVariables>(GetBookingRequestDocument, options);
      }
export function useGetBookingRequestLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetBookingRequestQuery, GetBookingRequestQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetBookingRequestQuery, GetBookingRequestQueryVariables>(GetBookingRequestDocument, options);
        }
// @ts-ignore
export function useGetBookingRequestSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetBookingRequestQuery, GetBookingRequestQueryVariables>): Apollo.UseSuspenseQueryResult<GetBookingRequestQuery, GetBookingRequestQueryVariables>;
export function useGetBookingRequestSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetBookingRequestQuery, GetBookingRequestQueryVariables>): Apollo.UseSuspenseQueryResult<GetBookingRequestQuery | undefined, GetBookingRequestQueryVariables>;
export function useGetBookingRequestSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetBookingRequestQuery, GetBookingRequestQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetBookingRequestQuery, GetBookingRequestQueryVariables>(GetBookingRequestDocument, options);
        }
export type GetBookingRequestQueryHookResult = ReturnType<typeof useGetBookingRequestQuery>;
export type GetBookingRequestLazyQueryHookResult = ReturnType<typeof useGetBookingRequestLazyQuery>;
export type GetBookingRequestSuspenseQueryHookResult = ReturnType<typeof useGetBookingRequestSuspenseQuery>;
export type GetBookingRequestQueryResult = Apollo.QueryResult<GetBookingRequestQuery, GetBookingRequestQueryVariables>;
export const GetPendingBookingRequestCountDocument = gql`
    query GetPendingBookingRequestCount {
  getPendingBookingRequestCount
}
    `;

/**
 * __useGetPendingBookingRequestCountQuery__
 *
 * To run a query within a React component, call `useGetPendingBookingRequestCountQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPendingBookingRequestCountQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPendingBookingRequestCountQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetPendingBookingRequestCountQuery(baseOptions?: Apollo.QueryHookOptions<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>(GetPendingBookingRequestCountDocument, options);
      }
export function useGetPendingBookingRequestCountLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>(GetPendingBookingRequestCountDocument, options);
        }
// @ts-ignore
export function useGetPendingBookingRequestCountSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>): Apollo.UseSuspenseQueryResult<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>;
export function useGetPendingBookingRequestCountSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>): Apollo.UseSuspenseQueryResult<GetPendingBookingRequestCountQuery | undefined, GetPendingBookingRequestCountQueryVariables>;
export function useGetPendingBookingRequestCountSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>(GetPendingBookingRequestCountDocument, options);
        }
export type GetPendingBookingRequestCountQueryHookResult = ReturnType<typeof useGetPendingBookingRequestCountQuery>;
export type GetPendingBookingRequestCountLazyQueryHookResult = ReturnType<typeof useGetPendingBookingRequestCountLazyQuery>;
export type GetPendingBookingRequestCountSuspenseQueryHookResult = ReturnType<typeof useGetPendingBookingRequestCountSuspenseQuery>;
export type GetPendingBookingRequestCountQueryResult = Apollo.QueryResult<GetPendingBookingRequestCountQuery, GetPendingBookingRequestCountQueryVariables>;
export const CreateBookingRequestDocument = gql`
    mutation CreateBookingRequest($bookingRequestInput: BookingRequestInput!) {
  createBookingRequest(bookingRequestInput: $bookingRequestInput) {
    id
    status
  }
}
    `;
export type CreateBookingRequestMutationFn = Apollo.MutationFunction<CreateBookingRequestMutation, CreateBookingRequestMutationVariables>;

/**
 * __useCreateBookingRequestMutation__
 *
 * To run a mutation, you first call `useCreateBookingRequestMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateBookingRequestMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createBookingRequestMutation, { data, loading, error }] = useCreateBookingRequestMutation({
 *   variables: {
 *      bookingRequestInput: // value for 'bookingRequestInput'
 *   },
 * });
 */
export function useCreateBookingRequestMutation(baseOptions?: Apollo.MutationHookOptions<CreateBookingRequestMutation, CreateBookingRequestMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateBookingRequestMutation, CreateBookingRequestMutationVariables>(CreateBookingRequestDocument, options);
      }
export type CreateBookingRequestMutationHookResult = ReturnType<typeof useCreateBookingRequestMutation>;
export type CreateBookingRequestMutationResult = Apollo.MutationResult<CreateBookingRequestMutation>;
export type CreateBookingRequestMutationOptions = Apollo.BaseMutationOptions<CreateBookingRequestMutation, CreateBookingRequestMutationVariables>;
export const GetBoothRentPlansDocument = gql`
    query GetBoothRentPlans($artistId: ID!, $shopId: ID!) {
  getBoothRentPlans(artistId: $artistId, shopId: $shopId) {
    id
    artistId
    shopId
    amountCents
    dueDayOfMonth
    effectiveFrom
    setByUserId
    active
    createdAt
  }
}
    `;

/**
 * __useGetBoothRentPlansQuery__
 *
 * To run a query within a React component, call `useGetBoothRentPlansQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetBoothRentPlansQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetBoothRentPlansQuery({
 *   variables: {
 *      artistId: // value for 'artistId'
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useGetBoothRentPlansQuery(baseOptions: Apollo.QueryHookOptions<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables> & ({ variables: GetBoothRentPlansQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables>(GetBoothRentPlansDocument, options);
      }
export function useGetBoothRentPlansLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables>(GetBoothRentPlansDocument, options);
        }
// @ts-ignore
export function useGetBoothRentPlansSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables>): Apollo.UseSuspenseQueryResult<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables>;
export function useGetBoothRentPlansSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables>): Apollo.UseSuspenseQueryResult<GetBoothRentPlansQuery | undefined, GetBoothRentPlansQueryVariables>;
export function useGetBoothRentPlansSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables>(GetBoothRentPlansDocument, options);
        }
export type GetBoothRentPlansQueryHookResult = ReturnType<typeof useGetBoothRentPlansQuery>;
export type GetBoothRentPlansLazyQueryHookResult = ReturnType<typeof useGetBoothRentPlansLazyQuery>;
export type GetBoothRentPlansSuspenseQueryHookResult = ReturnType<typeof useGetBoothRentPlansSuspenseQuery>;
export type GetBoothRentPlansQueryResult = Apollo.QueryResult<GetBoothRentPlansQuery, GetBoothRentPlansQueryVariables>;
export const GetBoothRentChargesDocument = gql`
    query GetBoothRentCharges($artistId: ID, $shopId: ID, $status: String, $page: PageInput) {
  getBoothRentCharges(
    artistId: $artistId
    shopId: $shopId
    status: $status
    page: $page
  ) {
    items {
      id
      artistId
      shopId
      amountCents
      periodMonth
      dueDate
      status
      markedPaidAt
      markedPaidByUserId
      confirmedAt
      confirmedByUserId
      expenseId
      incomeId
      createdAt
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetBoothRentChargesQuery__
 *
 * To run a query within a React component, call `useGetBoothRentChargesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetBoothRentChargesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetBoothRentChargesQuery({
 *   variables: {
 *      artistId: // value for 'artistId'
 *      shopId: // value for 'shopId'
 *      status: // value for 'status'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetBoothRentChargesQuery(baseOptions?: Apollo.QueryHookOptions<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>(GetBoothRentChargesDocument, options);
      }
export function useGetBoothRentChargesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>(GetBoothRentChargesDocument, options);
        }
// @ts-ignore
export function useGetBoothRentChargesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>): Apollo.UseSuspenseQueryResult<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>;
export function useGetBoothRentChargesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>): Apollo.UseSuspenseQueryResult<GetBoothRentChargesQuery | undefined, GetBoothRentChargesQueryVariables>;
export function useGetBoothRentChargesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>(GetBoothRentChargesDocument, options);
        }
export type GetBoothRentChargesQueryHookResult = ReturnType<typeof useGetBoothRentChargesQuery>;
export type GetBoothRentChargesLazyQueryHookResult = ReturnType<typeof useGetBoothRentChargesLazyQuery>;
export type GetBoothRentChargesSuspenseQueryHookResult = ReturnType<typeof useGetBoothRentChargesSuspenseQuery>;
export type GetBoothRentChargesQueryResult = Apollo.QueryResult<GetBoothRentChargesQuery, GetBoothRentChargesQueryVariables>;
export const MarkBoothRentPaidManuallyDocument = gql`
    mutation MarkBoothRentPaidManually($boothRentChargeId: ID!) {
  markBoothRentPaidManually(boothRentChargeId: $boothRentChargeId) {
    id
    artistId
    shopId
    amountCents
    periodMonth
    dueDate
    status
    markedPaidAt
    markedPaidByUserId
    confirmedAt
    confirmedByUserId
    expenseId
    incomeId
    createdAt
  }
}
    `;
export type MarkBoothRentPaidManuallyMutationFn = Apollo.MutationFunction<MarkBoothRentPaidManuallyMutation, MarkBoothRentPaidManuallyMutationVariables>;

/**
 * __useMarkBoothRentPaidManuallyMutation__
 *
 * To run a mutation, you first call `useMarkBoothRentPaidManuallyMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkBoothRentPaidManuallyMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markBoothRentPaidManuallyMutation, { data, loading, error }] = useMarkBoothRentPaidManuallyMutation({
 *   variables: {
 *      boothRentChargeId: // value for 'boothRentChargeId'
 *   },
 * });
 */
export function useMarkBoothRentPaidManuallyMutation(baseOptions?: Apollo.MutationHookOptions<MarkBoothRentPaidManuallyMutation, MarkBoothRentPaidManuallyMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<MarkBoothRentPaidManuallyMutation, MarkBoothRentPaidManuallyMutationVariables>(MarkBoothRentPaidManuallyDocument, options);
      }
export type MarkBoothRentPaidManuallyMutationHookResult = ReturnType<typeof useMarkBoothRentPaidManuallyMutation>;
export type MarkBoothRentPaidManuallyMutationResult = Apollo.MutationResult<MarkBoothRentPaidManuallyMutation>;
export type MarkBoothRentPaidManuallyMutationOptions = Apollo.BaseMutationOptions<MarkBoothRentPaidManuallyMutation, MarkBoothRentPaidManuallyMutationVariables>;
export const SetBoothRentPlanDocument = gql`
    mutation SetBoothRentPlan($artistId: ID!, $shopId: ID!, $amountCents: Int!, $dueDayOfMonth: Int!, $effectiveFrom: DateTime) {
  setBoothRentPlan(
    artistId: $artistId
    shopId: $shopId
    amountCents: $amountCents
    dueDayOfMonth: $dueDayOfMonth
    effectiveFrom: $effectiveFrom
  ) {
    id
    artistId
    shopId
    amountCents
    dueDayOfMonth
    effectiveFrom
    setByUserId
    active
    createdAt
  }
}
    `;
export type SetBoothRentPlanMutationFn = Apollo.MutationFunction<SetBoothRentPlanMutation, SetBoothRentPlanMutationVariables>;

/**
 * __useSetBoothRentPlanMutation__
 *
 * To run a mutation, you first call `useSetBoothRentPlanMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetBoothRentPlanMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setBoothRentPlanMutation, { data, loading, error }] = useSetBoothRentPlanMutation({
 *   variables: {
 *      artistId: // value for 'artistId'
 *      shopId: // value for 'shopId'
 *      amountCents: // value for 'amountCents'
 *      dueDayOfMonth: // value for 'dueDayOfMonth'
 *      effectiveFrom: // value for 'effectiveFrom'
 *   },
 * });
 */
export function useSetBoothRentPlanMutation(baseOptions?: Apollo.MutationHookOptions<SetBoothRentPlanMutation, SetBoothRentPlanMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetBoothRentPlanMutation, SetBoothRentPlanMutationVariables>(SetBoothRentPlanDocument, options);
      }
export type SetBoothRentPlanMutationHookResult = ReturnType<typeof useSetBoothRentPlanMutation>;
export type SetBoothRentPlanMutationResult = Apollo.MutationResult<SetBoothRentPlanMutation>;
export type SetBoothRentPlanMutationOptions = Apollo.BaseMutationOptions<SetBoothRentPlanMutation, SetBoothRentPlanMutationVariables>;
export const ConfirmBoothRentPaidDocument = gql`
    mutation ConfirmBoothRentPaid($boothRentChargeId: ID!) {
  confirmBoothRentPaid(boothRentChargeId: $boothRentChargeId) {
    id
    artistId
    shopId
    amountCents
    periodMonth
    dueDate
    status
    markedPaidAt
    markedPaidByUserId
    confirmedAt
    confirmedByUserId
    expenseId
    incomeId
    createdAt
  }
}
    `;
export type ConfirmBoothRentPaidMutationFn = Apollo.MutationFunction<ConfirmBoothRentPaidMutation, ConfirmBoothRentPaidMutationVariables>;

/**
 * __useConfirmBoothRentPaidMutation__
 *
 * To run a mutation, you first call `useConfirmBoothRentPaidMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useConfirmBoothRentPaidMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [confirmBoothRentPaidMutation, { data, loading, error }] = useConfirmBoothRentPaidMutation({
 *   variables: {
 *      boothRentChargeId: // value for 'boothRentChargeId'
 *   },
 * });
 */
export function useConfirmBoothRentPaidMutation(baseOptions?: Apollo.MutationHookOptions<ConfirmBoothRentPaidMutation, ConfirmBoothRentPaidMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ConfirmBoothRentPaidMutation, ConfirmBoothRentPaidMutationVariables>(ConfirmBoothRentPaidDocument, options);
      }
export type ConfirmBoothRentPaidMutationHookResult = ReturnType<typeof useConfirmBoothRentPaidMutation>;
export type ConfirmBoothRentPaidMutationResult = Apollo.MutationResult<ConfirmBoothRentPaidMutation>;
export type ConfirmBoothRentPaidMutationOptions = Apollo.BaseMutationOptions<ConfirmBoothRentPaidMutation, ConfirmBoothRentPaidMutationVariables>;
export const GetChargeQuoteDocument = gql`
    query GetChargeQuote($appointmentId: ID!, $applyFeeOffset: Boolean, $tipCents: Int, $subtotalCentsOverride: Int) {
  getChargeQuote(
    appointmentId: $appointmentId
    applyFeeOffset: $applyFeeOffset
    tipCents: $tipCents
    subtotalCentsOverride: $subtotalCentsOverride
  ) {
    subtotalCents
    depositCreditCents
    netSubtotalCents
    feeOffsetCents
    taxableCents
    taxCents
    tipCents
    totalCents
    giftCardCents
    amountDueCents
    source
    canCharge
  }
}
    `;

/**
 * __useGetChargeQuoteQuery__
 *
 * To run a query within a React component, call `useGetChargeQuoteQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetChargeQuoteQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetChargeQuoteQuery({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *      applyFeeOffset: // value for 'applyFeeOffset'
 *      tipCents: // value for 'tipCents'
 *      subtotalCentsOverride: // value for 'subtotalCentsOverride'
 *   },
 * });
 */
export function useGetChargeQuoteQuery(baseOptions: Apollo.QueryHookOptions<GetChargeQuoteQuery, GetChargeQuoteQueryVariables> & ({ variables: GetChargeQuoteQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetChargeQuoteQuery, GetChargeQuoteQueryVariables>(GetChargeQuoteDocument, options);
      }
export function useGetChargeQuoteLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetChargeQuoteQuery, GetChargeQuoteQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetChargeQuoteQuery, GetChargeQuoteQueryVariables>(GetChargeQuoteDocument, options);
        }
// @ts-ignore
export function useGetChargeQuoteSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetChargeQuoteQuery, GetChargeQuoteQueryVariables>): Apollo.UseSuspenseQueryResult<GetChargeQuoteQuery, GetChargeQuoteQueryVariables>;
export function useGetChargeQuoteSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetChargeQuoteQuery, GetChargeQuoteQueryVariables>): Apollo.UseSuspenseQueryResult<GetChargeQuoteQuery | undefined, GetChargeQuoteQueryVariables>;
export function useGetChargeQuoteSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetChargeQuoteQuery, GetChargeQuoteQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetChargeQuoteQuery, GetChargeQuoteQueryVariables>(GetChargeQuoteDocument, options);
        }
export type GetChargeQuoteQueryHookResult = ReturnType<typeof useGetChargeQuoteQuery>;
export type GetChargeQuoteLazyQueryHookResult = ReturnType<typeof useGetChargeQuoteLazyQuery>;
export type GetChargeQuoteSuspenseQueryHookResult = ReturnType<typeof useGetChargeQuoteSuspenseQuery>;
export type GetChargeQuoteQueryResult = Apollo.QueryResult<GetChargeQuoteQuery, GetChargeQuoteQueryVariables>;
export const GetClientDashboardDocument = gql`
    query GetClientDashboard($clientId: ID!, $projectsPage: PageInput, $appointmentsPage: PageInput) {
  getClient(clientId: $clientId) {
    id
    firstName
    lastName
    email
    phone
    avatar
    stats {
      totalSpentCents
      totalTipsCents
      averageTipCents
      tippedSessionCount
      completedSessionCount
      projectCount
      upcomingAppointmentCount
    }
    projects(page: $projectsPage) {
      items {
        id
        title
        status
        createdAt
      }
      pageInfo {
        totalCount
        hasMore
        limit
        offset
      }
    }
    appointments(page: $appointmentsPage) {
      items {
        id
        title
        appointmentDate
        appointmentType
        appointmentStatus
        totalCents
        tipCents
        projectId
        project {
          id
          title
        }
      }
      pageInfo {
        totalCount
        hasMore
        limit
        offset
      }
    }
    notes {
      id
      author
      note
      createdAt
      updatedAt
    }
    flags {
      id
      typeKey
      note
      systemGenerated
      createdAt
      type {
        key
        label
      }
      createdBy {
        id
        firstName
        lastName
      }
    }
  }
}
    `;

/**
 * __useGetClientDashboardQuery__
 *
 * To run a query within a React component, call `useGetClientDashboardQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetClientDashboardQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetClientDashboardQuery({
 *   variables: {
 *      clientId: // value for 'clientId'
 *      projectsPage: // value for 'projectsPage'
 *      appointmentsPage: // value for 'appointmentsPage'
 *   },
 * });
 */
export function useGetClientDashboardQuery(baseOptions: Apollo.QueryHookOptions<GetClientDashboardQuery, GetClientDashboardQueryVariables> & ({ variables: GetClientDashboardQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetClientDashboardQuery, GetClientDashboardQueryVariables>(GetClientDashboardDocument, options);
      }
export function useGetClientDashboardLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetClientDashboardQuery, GetClientDashboardQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetClientDashboardQuery, GetClientDashboardQueryVariables>(GetClientDashboardDocument, options);
        }
// @ts-ignore
export function useGetClientDashboardSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetClientDashboardQuery, GetClientDashboardQueryVariables>): Apollo.UseSuspenseQueryResult<GetClientDashboardQuery, GetClientDashboardQueryVariables>;
export function useGetClientDashboardSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetClientDashboardQuery, GetClientDashboardQueryVariables>): Apollo.UseSuspenseQueryResult<GetClientDashboardQuery | undefined, GetClientDashboardQueryVariables>;
export function useGetClientDashboardSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetClientDashboardQuery, GetClientDashboardQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetClientDashboardQuery, GetClientDashboardQueryVariables>(GetClientDashboardDocument, options);
        }
export type GetClientDashboardQueryHookResult = ReturnType<typeof useGetClientDashboardQuery>;
export type GetClientDashboardLazyQueryHookResult = ReturnType<typeof useGetClientDashboardLazyQuery>;
export type GetClientDashboardSuspenseQueryHookResult = ReturnType<typeof useGetClientDashboardSuspenseQuery>;
export type GetClientDashboardQueryResult = Apollo.QueryResult<GetClientDashboardQuery, GetClientDashboardQueryVariables>;
export const UpdateClientNotesDocument = gql`
    mutation UpdateClientNotes($clientId: ID!, $notes: [IBNoteInput]) {
  updateClientNotes(clientId: $clientId, notes: $notes) {
    id
    notes {
      id
      author
      note
      createdAt
      updatedAt
    }
  }
}
    `;
export type UpdateClientNotesMutationFn = Apollo.MutationFunction<UpdateClientNotesMutation, UpdateClientNotesMutationVariables>;

/**
 * __useUpdateClientNotesMutation__
 *
 * To run a mutation, you first call `useUpdateClientNotesMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateClientNotesMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateClientNotesMutation, { data, loading, error }] = useUpdateClientNotesMutation({
 *   variables: {
 *      clientId: // value for 'clientId'
 *      notes: // value for 'notes'
 *   },
 * });
 */
export function useUpdateClientNotesMutation(baseOptions?: Apollo.MutationHookOptions<UpdateClientNotesMutation, UpdateClientNotesMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateClientNotesMutation, UpdateClientNotesMutationVariables>(UpdateClientNotesDocument, options);
      }
export type UpdateClientNotesMutationHookResult = ReturnType<typeof useUpdateClientNotesMutation>;
export type UpdateClientNotesMutationResult = Apollo.MutationResult<UpdateClientNotesMutation>;
export type UpdateClientNotesMutationOptions = Apollo.BaseMutationOptions<UpdateClientNotesMutation, UpdateClientNotesMutationVariables>;
export const GetClientFlagTypesDocument = gql`
    query GetClientFlagTypes {
  getClientFlagTypes {
    key
    label
    systemGenerated
  }
}
    `;

/**
 * __useGetClientFlagTypesQuery__
 *
 * To run a query within a React component, call `useGetClientFlagTypesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetClientFlagTypesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetClientFlagTypesQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetClientFlagTypesQuery(baseOptions?: Apollo.QueryHookOptions<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>(GetClientFlagTypesDocument, options);
      }
export function useGetClientFlagTypesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>(GetClientFlagTypesDocument, options);
        }
// @ts-ignore
export function useGetClientFlagTypesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>): Apollo.UseSuspenseQueryResult<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>;
export function useGetClientFlagTypesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>): Apollo.UseSuspenseQueryResult<GetClientFlagTypesQuery | undefined, GetClientFlagTypesQueryVariables>;
export function useGetClientFlagTypesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>(GetClientFlagTypesDocument, options);
        }
export type GetClientFlagTypesQueryHookResult = ReturnType<typeof useGetClientFlagTypesQuery>;
export type GetClientFlagTypesLazyQueryHookResult = ReturnType<typeof useGetClientFlagTypesLazyQuery>;
export type GetClientFlagTypesSuspenseQueryHookResult = ReturnType<typeof useGetClientFlagTypesSuspenseQuery>;
export type GetClientFlagTypesQueryResult = Apollo.QueryResult<GetClientFlagTypesQuery, GetClientFlagTypesQueryVariables>;
export const RaiseClientFlagDocument = gql`
    mutation RaiseClientFlag($input: RaiseClientFlagInput!) {
  raiseClientFlag(input: $input) {
    id
    typeKey
    note
    systemGenerated
    createdAt
    type {
      key
      label
    }
    createdBy {
      id
      firstName
      lastName
    }
  }
}
    `;
export type RaiseClientFlagMutationFn = Apollo.MutationFunction<RaiseClientFlagMutation, RaiseClientFlagMutationVariables>;

/**
 * __useRaiseClientFlagMutation__
 *
 * To run a mutation, you first call `useRaiseClientFlagMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRaiseClientFlagMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [raiseClientFlagMutation, { data, loading, error }] = useRaiseClientFlagMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useRaiseClientFlagMutation(baseOptions?: Apollo.MutationHookOptions<RaiseClientFlagMutation, RaiseClientFlagMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RaiseClientFlagMutation, RaiseClientFlagMutationVariables>(RaiseClientFlagDocument, options);
      }
export type RaiseClientFlagMutationHookResult = ReturnType<typeof useRaiseClientFlagMutation>;
export type RaiseClientFlagMutationResult = Apollo.MutationResult<RaiseClientFlagMutation>;
export type RaiseClientFlagMutationOptions = Apollo.BaseMutationOptions<RaiseClientFlagMutation, RaiseClientFlagMutationVariables>;
export const ResolveClientFlagDocument = gql`
    mutation ResolveClientFlag($flagId: ID!) {
  resolveClientFlag(flagId: $flagId) {
    id
    resolvedAt
  }
}
    `;
export type ResolveClientFlagMutationFn = Apollo.MutationFunction<ResolveClientFlagMutation, ResolveClientFlagMutationVariables>;

/**
 * __useResolveClientFlagMutation__
 *
 * To run a mutation, you first call `useResolveClientFlagMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useResolveClientFlagMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [resolveClientFlagMutation, { data, loading, error }] = useResolveClientFlagMutation({
 *   variables: {
 *      flagId: // value for 'flagId'
 *   },
 * });
 */
export function useResolveClientFlagMutation(baseOptions?: Apollo.MutationHookOptions<ResolveClientFlagMutation, ResolveClientFlagMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ResolveClientFlagMutation, ResolveClientFlagMutationVariables>(ResolveClientFlagDocument, options);
      }
export type ResolveClientFlagMutationHookResult = ReturnType<typeof useResolveClientFlagMutation>;
export type ResolveClientFlagMutationResult = Apollo.MutationResult<ResolveClientFlagMutation>;
export type ResolveClientFlagMutationOptions = Apollo.BaseMutationOptions<ResolveClientFlagMutation, ResolveClientFlagMutationVariables>;
export const GetClientsDocument = gql`
    query GetClients($page: PageInput) {
  getClients(includeArchived: false, page: $page) {
    items {
      id
      firstName
      lastName
      email
      phone
      avatar
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetClientsQuery__
 *
 * To run a query within a React component, call `useGetClientsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetClientsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetClientsQuery({
 *   variables: {
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetClientsQuery(baseOptions?: Apollo.QueryHookOptions<GetClientsQuery, GetClientsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetClientsQuery, GetClientsQueryVariables>(GetClientsDocument, options);
      }
export function useGetClientsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetClientsQuery, GetClientsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetClientsQuery, GetClientsQueryVariables>(GetClientsDocument, options);
        }
// @ts-ignore
export function useGetClientsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetClientsQuery, GetClientsQueryVariables>): Apollo.UseSuspenseQueryResult<GetClientsQuery, GetClientsQueryVariables>;
export function useGetClientsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetClientsQuery, GetClientsQueryVariables>): Apollo.UseSuspenseQueryResult<GetClientsQuery | undefined, GetClientsQueryVariables>;
export function useGetClientsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetClientsQuery, GetClientsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetClientsQuery, GetClientsQueryVariables>(GetClientsDocument, options);
        }
export type GetClientsQueryHookResult = ReturnType<typeof useGetClientsQuery>;
export type GetClientsLazyQueryHookResult = ReturnType<typeof useGetClientsLazyQuery>;
export type GetClientsSuspenseQueryHookResult = ReturnType<typeof useGetClientsSuspenseQuery>;
export type GetClientsQueryResult = Apollo.QueryResult<GetClientsQuery, GetClientsQueryVariables>;
export const FindClientByEmailDocument = gql`
    query FindClientByEmail($email: String!) {
  findClientByEmail(email: $email) {
    id
    firstName
    lastName
    email
    phone
  }
}
    `;

/**
 * __useFindClientByEmailQuery__
 *
 * To run a query within a React component, call `useFindClientByEmailQuery` and pass it any options that fit your needs.
 * When your component renders, `useFindClientByEmailQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useFindClientByEmailQuery({
 *   variables: {
 *      email: // value for 'email'
 *   },
 * });
 */
export function useFindClientByEmailQuery(baseOptions: Apollo.QueryHookOptions<FindClientByEmailQuery, FindClientByEmailQueryVariables> & ({ variables: FindClientByEmailQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<FindClientByEmailQuery, FindClientByEmailQueryVariables>(FindClientByEmailDocument, options);
      }
export function useFindClientByEmailLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<FindClientByEmailQuery, FindClientByEmailQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<FindClientByEmailQuery, FindClientByEmailQueryVariables>(FindClientByEmailDocument, options);
        }
// @ts-ignore
export function useFindClientByEmailSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<FindClientByEmailQuery, FindClientByEmailQueryVariables>): Apollo.UseSuspenseQueryResult<FindClientByEmailQuery, FindClientByEmailQueryVariables>;
export function useFindClientByEmailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<FindClientByEmailQuery, FindClientByEmailQueryVariables>): Apollo.UseSuspenseQueryResult<FindClientByEmailQuery | undefined, FindClientByEmailQueryVariables>;
export function useFindClientByEmailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<FindClientByEmailQuery, FindClientByEmailQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<FindClientByEmailQuery, FindClientByEmailQueryVariables>(FindClientByEmailDocument, options);
        }
export type FindClientByEmailQueryHookResult = ReturnType<typeof useFindClientByEmailQuery>;
export type FindClientByEmailLazyQueryHookResult = ReturnType<typeof useFindClientByEmailLazyQuery>;
export type FindClientByEmailSuspenseQueryHookResult = ReturnType<typeof useFindClientByEmailSuspenseQuery>;
export type FindClientByEmailQueryResult = Apollo.QueryResult<FindClientByEmailQuery, FindClientByEmailQueryVariables>;
export const GetConsultAppointmentDocument = gql`
    query GetConsultAppointment($appointmentId: ID!) {
  getAppointment(appointmentId: $appointmentId) {
    id
    title
    appointmentType
    appointmentDate
    durationMinutes
    appointmentStatus
    projectId
    bookingRequestId
    bookingRequest {
      id
      status
      description
      placement
      size
      budget
      isCoverUp
      referenceImages
      client {
        id
        firstName
        lastName
        email
        phone
      }
    }
  }
}
    `;

/**
 * __useGetConsultAppointmentQuery__
 *
 * To run a query within a React component, call `useGetConsultAppointmentQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetConsultAppointmentQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetConsultAppointmentQuery({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *   },
 * });
 */
export function useGetConsultAppointmentQuery(baseOptions: Apollo.QueryHookOptions<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables> & ({ variables: GetConsultAppointmentQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables>(GetConsultAppointmentDocument, options);
      }
export function useGetConsultAppointmentLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables>(GetConsultAppointmentDocument, options);
        }
// @ts-ignore
export function useGetConsultAppointmentSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables>): Apollo.UseSuspenseQueryResult<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables>;
export function useGetConsultAppointmentSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables>): Apollo.UseSuspenseQueryResult<GetConsultAppointmentQuery | undefined, GetConsultAppointmentQueryVariables>;
export function useGetConsultAppointmentSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables>(GetConsultAppointmentDocument, options);
        }
export type GetConsultAppointmentQueryHookResult = ReturnType<typeof useGetConsultAppointmentQuery>;
export type GetConsultAppointmentLazyQueryHookResult = ReturnType<typeof useGetConsultAppointmentLazyQuery>;
export type GetConsultAppointmentSuspenseQueryHookResult = ReturnType<typeof useGetConsultAppointmentSuspenseQuery>;
export type GetConsultAppointmentQueryResult = Apollo.QueryResult<GetConsultAppointmentQuery, GetConsultAppointmentQueryVariables>;
export const ConvertBookingRequestDocument = gql`
    mutation ConvertBookingRequest($bookingRequestId: ID!, $outcome: String!, $appointmentInput: AppointmentInput, $projectTitle: String) {
  convertBookingRequest(
    bookingRequestId: $bookingRequestId
    outcome: $outcome
    appointmentInput: $appointmentInput
    projectTitle: $projectTitle
  ) {
    id
    status
    resultingAppointmentId
    resultingAppointment {
      id
      projectId
    }
  }
}
    `;
export type ConvertBookingRequestMutationFn = Apollo.MutationFunction<ConvertBookingRequestMutation, ConvertBookingRequestMutationVariables>;

/**
 * __useConvertBookingRequestMutation__
 *
 * To run a mutation, you first call `useConvertBookingRequestMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useConvertBookingRequestMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [convertBookingRequestMutation, { data, loading, error }] = useConvertBookingRequestMutation({
 *   variables: {
 *      bookingRequestId: // value for 'bookingRequestId'
 *      outcome: // value for 'outcome'
 *      appointmentInput: // value for 'appointmentInput'
 *      projectTitle: // value for 'projectTitle'
 *   },
 * });
 */
export function useConvertBookingRequestMutation(baseOptions?: Apollo.MutationHookOptions<ConvertBookingRequestMutation, ConvertBookingRequestMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ConvertBookingRequestMutation, ConvertBookingRequestMutationVariables>(ConvertBookingRequestDocument, options);
      }
export type ConvertBookingRequestMutationHookResult = ReturnType<typeof useConvertBookingRequestMutation>;
export type ConvertBookingRequestMutationResult = Apollo.MutationResult<ConvertBookingRequestMutation>;
export type ConvertBookingRequestMutationOptions = Apollo.BaseMutationOptions<ConvertBookingRequestMutation, ConvertBookingRequestMutationVariables>;
export const CreateProjectDocument = gql`
    mutation CreateProject($title: String!, $description: String!, $placement: String, $size: String, $artistId: ID!, $clientId: ID!, $status: String!) {
  createProject(
    title: $title
    description: $description
    placement: $placement
    size: $size
    artistId: $artistId
    clientId: $clientId
    status: $status
  ) {
    id
    title
  }
}
    `;
export type CreateProjectMutationFn = Apollo.MutationFunction<CreateProjectMutation, CreateProjectMutationVariables>;

/**
 * __useCreateProjectMutation__
 *
 * To run a mutation, you first call `useCreateProjectMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateProjectMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createProjectMutation, { data, loading, error }] = useCreateProjectMutation({
 *   variables: {
 *      title: // value for 'title'
 *      description: // value for 'description'
 *      placement: // value for 'placement'
 *      size: // value for 'size'
 *      artistId: // value for 'artistId'
 *      clientId: // value for 'clientId'
 *      status: // value for 'status'
 *   },
 * });
 */
export function useCreateProjectMutation(baseOptions?: Apollo.MutationHookOptions<CreateProjectMutation, CreateProjectMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateProjectMutation, CreateProjectMutationVariables>(CreateProjectDocument, options);
      }
export type CreateProjectMutationHookResult = ReturnType<typeof useCreateProjectMutation>;
export type CreateProjectMutationResult = Apollo.MutationResult<CreateProjectMutation>;
export type CreateProjectMutationOptions = Apollo.BaseMutationOptions<CreateProjectMutation, CreateProjectMutationVariables>;
export const RecordDepositDocument = gql`
    mutation RecordDeposit($appointmentId: ID!, $depositCents: Int!, $paymentMethod: String!, $pending: Boolean) {
  recordDeposit(
    appointmentId: $appointmentId
    depositCents: $depositCents
    paymentMethod: $paymentMethod
    pending: $pending
  ) {
    id
    depositCents
    depositStatus
    depositPaymentMethod
    depositCollectedAt
  }
}
    `;
export type RecordDepositMutationFn = Apollo.MutationFunction<RecordDepositMutation, RecordDepositMutationVariables>;

/**
 * __useRecordDepositMutation__
 *
 * To run a mutation, you first call `useRecordDepositMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRecordDepositMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [recordDepositMutation, { data, loading, error }] = useRecordDepositMutation({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *      depositCents: // value for 'depositCents'
 *      paymentMethod: // value for 'paymentMethod'
 *      pending: // value for 'pending'
 *   },
 * });
 */
export function useRecordDepositMutation(baseOptions?: Apollo.MutationHookOptions<RecordDepositMutation, RecordDepositMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RecordDepositMutation, RecordDepositMutationVariables>(RecordDepositDocument, options);
      }
export type RecordDepositMutationHookResult = ReturnType<typeof useRecordDepositMutation>;
export type RecordDepositMutationResult = Apollo.MutationResult<RecordDepositMutation>;
export type RecordDepositMutationOptions = Apollo.BaseMutationOptions<RecordDepositMutation, RecordDepositMutationVariables>;
export const GetAvailableDepositsDocument = gql`
    query GetAvailableDeposits($appointmentId: ID!) {
  getAvailableDeposits(appointmentId: $appointmentId) {
    id
    depositCents
    appointmentDate
    appointmentType
  }
}
    `;

/**
 * __useGetAvailableDepositsQuery__
 *
 * To run a query within a React component, call `useGetAvailableDepositsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAvailableDepositsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAvailableDepositsQuery({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *   },
 * });
 */
export function useGetAvailableDepositsQuery(baseOptions: Apollo.QueryHookOptions<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables> & ({ variables: GetAvailableDepositsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables>(GetAvailableDepositsDocument, options);
      }
export function useGetAvailableDepositsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables>(GetAvailableDepositsDocument, options);
        }
// @ts-ignore
export function useGetAvailableDepositsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables>): Apollo.UseSuspenseQueryResult<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables>;
export function useGetAvailableDepositsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables>): Apollo.UseSuspenseQueryResult<GetAvailableDepositsQuery | undefined, GetAvailableDepositsQueryVariables>;
export function useGetAvailableDepositsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables>(GetAvailableDepositsDocument, options);
        }
export type GetAvailableDepositsQueryHookResult = ReturnType<typeof useGetAvailableDepositsQuery>;
export type GetAvailableDepositsLazyQueryHookResult = ReturnType<typeof useGetAvailableDepositsLazyQuery>;
export type GetAvailableDepositsSuspenseQueryHookResult = ReturnType<typeof useGetAvailableDepositsSuspenseQuery>;
export type GetAvailableDepositsQueryResult = Apollo.QueryResult<GetAvailableDepositsQuery, GetAvailableDepositsQueryVariables>;
export const ApplyDepositDocument = gql`
    mutation ApplyDeposit($depositAppointmentId: ID!, $targetAppointmentId: ID!) {
  applyDeposit(
    depositAppointmentId: $depositAppointmentId
    targetAppointmentId: $targetAppointmentId
  ) {
    id
    depositCreditCents
    depositCreditFromAppointmentId
    subtotalCents
    totalCents
    shopCutCents
    shopCutPercentApplied
    shopCutStatus
  }
}
    `;
export type ApplyDepositMutationFn = Apollo.MutationFunction<ApplyDepositMutation, ApplyDepositMutationVariables>;

/**
 * __useApplyDepositMutation__
 *
 * To run a mutation, you first call `useApplyDepositMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useApplyDepositMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [applyDepositMutation, { data, loading, error }] = useApplyDepositMutation({
 *   variables: {
 *      depositAppointmentId: // value for 'depositAppointmentId'
 *      targetAppointmentId: // value for 'targetAppointmentId'
 *   },
 * });
 */
export function useApplyDepositMutation(baseOptions?: Apollo.MutationHookOptions<ApplyDepositMutation, ApplyDepositMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ApplyDepositMutation, ApplyDepositMutationVariables>(ApplyDepositDocument, options);
      }
export type ApplyDepositMutationHookResult = ReturnType<typeof useApplyDepositMutation>;
export type ApplyDepositMutationResult = Apollo.MutationResult<ApplyDepositMutation>;
export type ApplyDepositMutationOptions = Apollo.BaseMutationOptions<ApplyDepositMutation, ApplyDepositMutationVariables>;
export const GetEventLogsDocument = gql`
    query GetEventLogs($filter: EventLogFilter, $page: PageInput) {
  getEventLogs(filter: $filter, page: $page) {
    items {
      id
      entityType
      entityId
      action
      actorName
      summary
      changes {
        field
        from
        to
      }
      createdAt
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetEventLogsQuery__
 *
 * To run a query within a React component, call `useGetEventLogsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetEventLogsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetEventLogsQuery({
 *   variables: {
 *      filter: // value for 'filter'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetEventLogsQuery(baseOptions?: Apollo.QueryHookOptions<GetEventLogsQuery, GetEventLogsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetEventLogsQuery, GetEventLogsQueryVariables>(GetEventLogsDocument, options);
      }
export function useGetEventLogsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetEventLogsQuery, GetEventLogsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetEventLogsQuery, GetEventLogsQueryVariables>(GetEventLogsDocument, options);
        }
// @ts-ignore
export function useGetEventLogsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetEventLogsQuery, GetEventLogsQueryVariables>): Apollo.UseSuspenseQueryResult<GetEventLogsQuery, GetEventLogsQueryVariables>;
export function useGetEventLogsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetEventLogsQuery, GetEventLogsQueryVariables>): Apollo.UseSuspenseQueryResult<GetEventLogsQuery | undefined, GetEventLogsQueryVariables>;
export function useGetEventLogsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetEventLogsQuery, GetEventLogsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetEventLogsQuery, GetEventLogsQueryVariables>(GetEventLogsDocument, options);
        }
export type GetEventLogsQueryHookResult = ReturnType<typeof useGetEventLogsQuery>;
export type GetEventLogsLazyQueryHookResult = ReturnType<typeof useGetEventLogsLazyQuery>;
export type GetEventLogsSuspenseQueryHookResult = ReturnType<typeof useGetEventLogsSuspenseQuery>;
export type GetEventLogsQueryResult = Apollo.QueryResult<GetEventLogsQuery, GetEventLogsQueryVariables>;
export const GetExpenseTypesForSettingsDocument = gql`
    query GetExpenseTypesForSettings($shopId: ID, $artistUserId: ID, $includeInactive: Boolean) {
  getExpenseTypes(
    shopId: $shopId
    artistUserId: $artistUserId
    includeInactive: $includeInactive
  ) {
    id
    name
    description
    active
  }
}
    `;

/**
 * __useGetExpenseTypesForSettingsQuery__
 *
 * To run a query within a React component, call `useGetExpenseTypesForSettingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetExpenseTypesForSettingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetExpenseTypesForSettingsQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *      includeInactive: // value for 'includeInactive'
 *   },
 * });
 */
export function useGetExpenseTypesForSettingsQuery(baseOptions?: Apollo.QueryHookOptions<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>(GetExpenseTypesForSettingsDocument, options);
      }
export function useGetExpenseTypesForSettingsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>(GetExpenseTypesForSettingsDocument, options);
        }
// @ts-ignore
export function useGetExpenseTypesForSettingsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>;
export function useGetExpenseTypesForSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetExpenseTypesForSettingsQuery | undefined, GetExpenseTypesForSettingsQueryVariables>;
export function useGetExpenseTypesForSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>(GetExpenseTypesForSettingsDocument, options);
        }
export type GetExpenseTypesForSettingsQueryHookResult = ReturnType<typeof useGetExpenseTypesForSettingsQuery>;
export type GetExpenseTypesForSettingsLazyQueryHookResult = ReturnType<typeof useGetExpenseTypesForSettingsLazyQuery>;
export type GetExpenseTypesForSettingsSuspenseQueryHookResult = ReturnType<typeof useGetExpenseTypesForSettingsSuspenseQuery>;
export type GetExpenseTypesForSettingsQueryResult = Apollo.QueryResult<GetExpenseTypesForSettingsQuery, GetExpenseTypesForSettingsQueryVariables>;
export const CreateExpenseTypeDocument = gql`
    mutation CreateExpenseType($input: CreateExpenseTypeInput!) {
  createExpenseType(input: $input) {
    id
  }
}
    `;
export type CreateExpenseTypeMutationFn = Apollo.MutationFunction<CreateExpenseTypeMutation, CreateExpenseTypeMutationVariables>;

/**
 * __useCreateExpenseTypeMutation__
 *
 * To run a mutation, you first call `useCreateExpenseTypeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateExpenseTypeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createExpenseTypeMutation, { data, loading, error }] = useCreateExpenseTypeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateExpenseTypeMutation(baseOptions?: Apollo.MutationHookOptions<CreateExpenseTypeMutation, CreateExpenseTypeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateExpenseTypeMutation, CreateExpenseTypeMutationVariables>(CreateExpenseTypeDocument, options);
      }
export type CreateExpenseTypeMutationHookResult = ReturnType<typeof useCreateExpenseTypeMutation>;
export type CreateExpenseTypeMutationResult = Apollo.MutationResult<CreateExpenseTypeMutation>;
export type CreateExpenseTypeMutationOptions = Apollo.BaseMutationOptions<CreateExpenseTypeMutation, CreateExpenseTypeMutationVariables>;
export const UpdateExpenseTypeDocument = gql`
    mutation UpdateExpenseType($input: UpdateExpenseTypeInput!) {
  updateExpenseType(input: $input) {
    id
    active
  }
}
    `;
export type UpdateExpenseTypeMutationFn = Apollo.MutationFunction<UpdateExpenseTypeMutation, UpdateExpenseTypeMutationVariables>;

/**
 * __useUpdateExpenseTypeMutation__
 *
 * To run a mutation, you first call `useUpdateExpenseTypeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateExpenseTypeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateExpenseTypeMutation, { data, loading, error }] = useUpdateExpenseTypeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateExpenseTypeMutation(baseOptions?: Apollo.MutationHookOptions<UpdateExpenseTypeMutation, UpdateExpenseTypeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateExpenseTypeMutation, UpdateExpenseTypeMutationVariables>(UpdateExpenseTypeDocument, options);
      }
export type UpdateExpenseTypeMutationHookResult = ReturnType<typeof useUpdateExpenseTypeMutation>;
export type UpdateExpenseTypeMutationResult = Apollo.MutationResult<UpdateExpenseTypeMutation>;
export type UpdateExpenseTypeMutationOptions = Apollo.BaseMutationOptions<UpdateExpenseTypeMutation, UpdateExpenseTypeMutationVariables>;
export const GetExpenseTypesListDocument = gql`
    query GetExpenseTypesList($shopId: ID, $artistUserId: ID) {
  getExpenseTypes(shopId: $shopId, artistUserId: $artistUserId) {
    id
    name
  }
}
    `;

/**
 * __useGetExpenseTypesListQuery__
 *
 * To run a query within a React component, call `useGetExpenseTypesListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetExpenseTypesListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetExpenseTypesListQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *   },
 * });
 */
export function useGetExpenseTypesListQuery(baseOptions?: Apollo.QueryHookOptions<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>(GetExpenseTypesListDocument, options);
      }
export function useGetExpenseTypesListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>(GetExpenseTypesListDocument, options);
        }
// @ts-ignore
export function useGetExpenseTypesListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>;
export function useGetExpenseTypesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetExpenseTypesListQuery | undefined, GetExpenseTypesListQueryVariables>;
export function useGetExpenseTypesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>(GetExpenseTypesListDocument, options);
        }
export type GetExpenseTypesListQueryHookResult = ReturnType<typeof useGetExpenseTypesListQuery>;
export type GetExpenseTypesListLazyQueryHookResult = ReturnType<typeof useGetExpenseTypesListLazyQuery>;
export type GetExpenseTypesListSuspenseQueryHookResult = ReturnType<typeof useGetExpenseTypesListSuspenseQuery>;
export type GetExpenseTypesListQueryResult = Apollo.QueryResult<GetExpenseTypesListQuery, GetExpenseTypesListQueryVariables>;
export const GetExpensesListDocument = gql`
    query GetExpensesList($shopId: ID, $artistUserId: ID, $start: DateTime, $end: DateTime, $page: PageInput) {
  getExpenses(
    shopId: $shopId
    artistUserId: $artistUserId
    start: $start
    end: $end
    page: $page
  ) {
    items {
      id
      expenseTypeId
      expenseType {
        id
        name
      }
      amountCents
      description
      date
      recurringExpenseId
      createdBy {
        id
        firstName
        lastName
      }
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetExpensesListQuery__
 *
 * To run a query within a React component, call `useGetExpensesListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetExpensesListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetExpensesListQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *      start: // value for 'start'
 *      end: // value for 'end'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetExpensesListQuery(baseOptions?: Apollo.QueryHookOptions<GetExpensesListQuery, GetExpensesListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetExpensesListQuery, GetExpensesListQueryVariables>(GetExpensesListDocument, options);
      }
export function useGetExpensesListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetExpensesListQuery, GetExpensesListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetExpensesListQuery, GetExpensesListQueryVariables>(GetExpensesListDocument, options);
        }
// @ts-ignore
export function useGetExpensesListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetExpensesListQuery, GetExpensesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetExpensesListQuery, GetExpensesListQueryVariables>;
export function useGetExpensesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetExpensesListQuery, GetExpensesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetExpensesListQuery | undefined, GetExpensesListQueryVariables>;
export function useGetExpensesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetExpensesListQuery, GetExpensesListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetExpensesListQuery, GetExpensesListQueryVariables>(GetExpensesListDocument, options);
        }
export type GetExpensesListQueryHookResult = ReturnType<typeof useGetExpensesListQuery>;
export type GetExpensesListLazyQueryHookResult = ReturnType<typeof useGetExpensesListLazyQuery>;
export type GetExpensesListSuspenseQueryHookResult = ReturnType<typeof useGetExpensesListSuspenseQuery>;
export type GetExpensesListQueryResult = Apollo.QueryResult<GetExpensesListQuery, GetExpensesListQueryVariables>;
export const RecordExpenseDocument = gql`
    mutation RecordExpense($input: RecordExpenseInput!) {
  recordExpense(input: $input) {
    id
    expenseTypeId
    expenseType {
      id
      name
    }
    amountCents
    description
    date
    recurringExpenseId
    createdBy {
      id
      firstName
      lastName
    }
  }
}
    `;
export type RecordExpenseMutationFn = Apollo.MutationFunction<RecordExpenseMutation, RecordExpenseMutationVariables>;

/**
 * __useRecordExpenseMutation__
 *
 * To run a mutation, you first call `useRecordExpenseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRecordExpenseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [recordExpenseMutation, { data, loading, error }] = useRecordExpenseMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useRecordExpenseMutation(baseOptions?: Apollo.MutationHookOptions<RecordExpenseMutation, RecordExpenseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RecordExpenseMutation, RecordExpenseMutationVariables>(RecordExpenseDocument, options);
      }
export type RecordExpenseMutationHookResult = ReturnType<typeof useRecordExpenseMutation>;
export type RecordExpenseMutationResult = Apollo.MutationResult<RecordExpenseMutation>;
export type RecordExpenseMutationOptions = Apollo.BaseMutationOptions<RecordExpenseMutation, RecordExpenseMutationVariables>;
export const UpdateExpenseDocument = gql`
    mutation UpdateExpense($input: UpdateExpenseInput!) {
  updateExpense(input: $input) {
    id
    expenseTypeId
    expenseType {
      id
      name
    }
    amountCents
    description
    date
    recurringExpenseId
    createdBy {
      id
      firstName
      lastName
    }
  }
}
    `;
export type UpdateExpenseMutationFn = Apollo.MutationFunction<UpdateExpenseMutation, UpdateExpenseMutationVariables>;

/**
 * __useUpdateExpenseMutation__
 *
 * To run a mutation, you first call `useUpdateExpenseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateExpenseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateExpenseMutation, { data, loading, error }] = useUpdateExpenseMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateExpenseMutation(baseOptions?: Apollo.MutationHookOptions<UpdateExpenseMutation, UpdateExpenseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateExpenseMutation, UpdateExpenseMutationVariables>(UpdateExpenseDocument, options);
      }
export type UpdateExpenseMutationHookResult = ReturnType<typeof useUpdateExpenseMutation>;
export type UpdateExpenseMutationResult = Apollo.MutationResult<UpdateExpenseMutation>;
export type UpdateExpenseMutationOptions = Apollo.BaseMutationOptions<UpdateExpenseMutation, UpdateExpenseMutationVariables>;
export const DeleteExpenseDocument = gql`
    mutation DeleteExpense($expenseId: ID!) {
  deleteExpense(expenseId: $expenseId)
}
    `;
export type DeleteExpenseMutationFn = Apollo.MutationFunction<DeleteExpenseMutation, DeleteExpenseMutationVariables>;

/**
 * __useDeleteExpenseMutation__
 *
 * To run a mutation, you first call `useDeleteExpenseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteExpenseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteExpenseMutation, { data, loading, error }] = useDeleteExpenseMutation({
 *   variables: {
 *      expenseId: // value for 'expenseId'
 *   },
 * });
 */
export function useDeleteExpenseMutation(baseOptions?: Apollo.MutationHookOptions<DeleteExpenseMutation, DeleteExpenseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteExpenseMutation, DeleteExpenseMutationVariables>(DeleteExpenseDocument, options);
      }
export type DeleteExpenseMutationHookResult = ReturnType<typeof useDeleteExpenseMutation>;
export type DeleteExpenseMutationResult = Apollo.MutationResult<DeleteExpenseMutation>;
export type DeleteExpenseMutationOptions = Apollo.BaseMutationOptions<DeleteExpenseMutation, DeleteExpenseMutationVariables>;
export const GetFormsListDocument = gql`
    query GetFormsList($shopId: ID, $artistUserId: ID, $status: String, $page: PageInput) {
  getForms(
    shopId: $shopId
    artistUserId: $artistUserId
    status: $status
    page: $page
  ) {
    items {
      id
      title
      status
      allowGuestSubmissions
      publicToken
      slug
      systemKey
      shopUseOnly
      fields {
        key
        type
        label
        helpText
        required
        options
      }
      createdAt
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetFormsListQuery__
 *
 * To run a query within a React component, call `useGetFormsListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetFormsListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetFormsListQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *      status: // value for 'status'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetFormsListQuery(baseOptions?: Apollo.QueryHookOptions<GetFormsListQuery, GetFormsListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetFormsListQuery, GetFormsListQueryVariables>(GetFormsListDocument, options);
      }
export function useGetFormsListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetFormsListQuery, GetFormsListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetFormsListQuery, GetFormsListQueryVariables>(GetFormsListDocument, options);
        }
// @ts-ignore
export function useGetFormsListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetFormsListQuery, GetFormsListQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormsListQuery, GetFormsListQueryVariables>;
export function useGetFormsListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormsListQuery, GetFormsListQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormsListQuery | undefined, GetFormsListQueryVariables>;
export function useGetFormsListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormsListQuery, GetFormsListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetFormsListQuery, GetFormsListQueryVariables>(GetFormsListDocument, options);
        }
export type GetFormsListQueryHookResult = ReturnType<typeof useGetFormsListQuery>;
export type GetFormsListLazyQueryHookResult = ReturnType<typeof useGetFormsListLazyQuery>;
export type GetFormsListSuspenseQueryHookResult = ReturnType<typeof useGetFormsListSuspenseQuery>;
export type GetFormsListQueryResult = Apollo.QueryResult<GetFormsListQuery, GetFormsListQueryVariables>;
export const PublishFormDocument = gql`
    mutation PublishForm($formId: ID!) {
  publishForm(formId: $formId) {
    id
    status
  }
}
    `;
export type PublishFormMutationFn = Apollo.MutationFunction<PublishFormMutation, PublishFormMutationVariables>;

/**
 * __usePublishFormMutation__
 *
 * To run a mutation, you first call `usePublishFormMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `usePublishFormMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [publishFormMutation, { data, loading, error }] = usePublishFormMutation({
 *   variables: {
 *      formId: // value for 'formId'
 *   },
 * });
 */
export function usePublishFormMutation(baseOptions?: Apollo.MutationHookOptions<PublishFormMutation, PublishFormMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<PublishFormMutation, PublishFormMutationVariables>(PublishFormDocument, options);
      }
export type PublishFormMutationHookResult = ReturnType<typeof usePublishFormMutation>;
export type PublishFormMutationResult = Apollo.MutationResult<PublishFormMutation>;
export type PublishFormMutationOptions = Apollo.BaseMutationOptions<PublishFormMutation, PublishFormMutationVariables>;
export const ArchiveFormDocument = gql`
    mutation ArchiveForm($formId: ID!) {
  archiveForm(formId: $formId) {
    id
    status
  }
}
    `;
export type ArchiveFormMutationFn = Apollo.MutationFunction<ArchiveFormMutation, ArchiveFormMutationVariables>;

/**
 * __useArchiveFormMutation__
 *
 * To run a mutation, you first call `useArchiveFormMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useArchiveFormMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [archiveFormMutation, { data, loading, error }] = useArchiveFormMutation({
 *   variables: {
 *      formId: // value for 'formId'
 *   },
 * });
 */
export function useArchiveFormMutation(baseOptions?: Apollo.MutationHookOptions<ArchiveFormMutation, ArchiveFormMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ArchiveFormMutation, ArchiveFormMutationVariables>(ArchiveFormDocument, options);
      }
export type ArchiveFormMutationHookResult = ReturnType<typeof useArchiveFormMutation>;
export type ArchiveFormMutationResult = Apollo.MutationResult<ArchiveFormMutation>;
export type ArchiveFormMutationOptions = Apollo.BaseMutationOptions<ArchiveFormMutation, ArchiveFormMutationVariables>;
export const SetFormGuestAccessDocument = gql`
    mutation SetFormGuestAccess($formId: ID!, $allow: Boolean!) {
  setFormGuestAccess(formId: $formId, allow: $allow) {
    id
    allowGuestSubmissions
    publicToken
    slug
  }
}
    `;
export type SetFormGuestAccessMutationFn = Apollo.MutationFunction<SetFormGuestAccessMutation, SetFormGuestAccessMutationVariables>;

/**
 * __useSetFormGuestAccessMutation__
 *
 * To run a mutation, you first call `useSetFormGuestAccessMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetFormGuestAccessMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setFormGuestAccessMutation, { data, loading, error }] = useSetFormGuestAccessMutation({
 *   variables: {
 *      formId: // value for 'formId'
 *      allow: // value for 'allow'
 *   },
 * });
 */
export function useSetFormGuestAccessMutation(baseOptions?: Apollo.MutationHookOptions<SetFormGuestAccessMutation, SetFormGuestAccessMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetFormGuestAccessMutation, SetFormGuestAccessMutationVariables>(SetFormGuestAccessDocument, options);
      }
export type SetFormGuestAccessMutationHookResult = ReturnType<typeof useSetFormGuestAccessMutation>;
export type SetFormGuestAccessMutationResult = Apollo.MutationResult<SetFormGuestAccessMutation>;
export type SetFormGuestAccessMutationOptions = Apollo.BaseMutationOptions<SetFormGuestAccessMutation, SetFormGuestAccessMutationVariables>;
export const DeleteFormDocument = gql`
    mutation DeleteForm($formId: ID!) {
  deleteForm(formId: $formId)
}
    `;
export type DeleteFormMutationFn = Apollo.MutationFunction<DeleteFormMutation, DeleteFormMutationVariables>;

/**
 * __useDeleteFormMutation__
 *
 * To run a mutation, you first call `useDeleteFormMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteFormMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteFormMutation, { data, loading, error }] = useDeleteFormMutation({
 *   variables: {
 *      formId: // value for 'formId'
 *   },
 * });
 */
export function useDeleteFormMutation(baseOptions?: Apollo.MutationHookOptions<DeleteFormMutation, DeleteFormMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteFormMutation, DeleteFormMutationVariables>(DeleteFormDocument, options);
      }
export type DeleteFormMutationHookResult = ReturnType<typeof useDeleteFormMutation>;
export type DeleteFormMutationResult = Apollo.MutationResult<DeleteFormMutation>;
export type DeleteFormMutationOptions = Apollo.BaseMutationOptions<DeleteFormMutation, DeleteFormMutationVariables>;
export const DuplicateFormDocument = gql`
    mutation DuplicateForm($input: CreateFormInput!) {
  createForm(input: $input) {
    id
  }
}
    `;
export type DuplicateFormMutationFn = Apollo.MutationFunction<DuplicateFormMutation, DuplicateFormMutationVariables>;

/**
 * __useDuplicateFormMutation__
 *
 * To run a mutation, you first call `useDuplicateFormMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDuplicateFormMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [duplicateFormMutation, { data, loading, error }] = useDuplicateFormMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useDuplicateFormMutation(baseOptions?: Apollo.MutationHookOptions<DuplicateFormMutation, DuplicateFormMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DuplicateFormMutation, DuplicateFormMutationVariables>(DuplicateFormDocument, options);
      }
export type DuplicateFormMutationHookResult = ReturnType<typeof useDuplicateFormMutation>;
export type DuplicateFormMutationResult = Apollo.MutationResult<DuplicateFormMutation>;
export type DuplicateFormMutationOptions = Apollo.BaseMutationOptions<DuplicateFormMutation, DuplicateFormMutationVariables>;
export const GetFormTitleDocument = gql`
    query GetFormTitle($formId: ID!) {
  getForm(formId: $formId) {
    id
    title
  }
}
    `;

/**
 * __useGetFormTitleQuery__
 *
 * To run a query within a React component, call `useGetFormTitleQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetFormTitleQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetFormTitleQuery({
 *   variables: {
 *      formId: // value for 'formId'
 *   },
 * });
 */
export function useGetFormTitleQuery(baseOptions: Apollo.QueryHookOptions<GetFormTitleQuery, GetFormTitleQueryVariables> & ({ variables: GetFormTitleQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetFormTitleQuery, GetFormTitleQueryVariables>(GetFormTitleDocument, options);
      }
export function useGetFormTitleLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetFormTitleQuery, GetFormTitleQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetFormTitleQuery, GetFormTitleQueryVariables>(GetFormTitleDocument, options);
        }
// @ts-ignore
export function useGetFormTitleSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetFormTitleQuery, GetFormTitleQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormTitleQuery, GetFormTitleQueryVariables>;
export function useGetFormTitleSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormTitleQuery, GetFormTitleQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormTitleQuery | undefined, GetFormTitleQueryVariables>;
export function useGetFormTitleSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormTitleQuery, GetFormTitleQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetFormTitleQuery, GetFormTitleQueryVariables>(GetFormTitleDocument, options);
        }
export type GetFormTitleQueryHookResult = ReturnType<typeof useGetFormTitleQuery>;
export type GetFormTitleLazyQueryHookResult = ReturnType<typeof useGetFormTitleLazyQuery>;
export type GetFormTitleSuspenseQueryHookResult = ReturnType<typeof useGetFormTitleSuspenseQuery>;
export type GetFormTitleQueryResult = Apollo.QueryResult<GetFormTitleQuery, GetFormTitleQueryVariables>;
export const GetFormResponsesListDocument = gql`
    query GetFormResponsesList($formId: ID!, $page: PageInput) {
  getFormResponses(formId: $formId, page: $page) {
    items {
      id
      formTitle
      fieldsSnapshot {
        key
        type
        label
      }
      client {
        id
        firstName
        lastName
      }
      answers {
        fieldKey
        textValue
        selectedOptions
        dateValue
        fileUrls
        signature {
          signedName
          signedAt
        }
      }
      source
      createdAt
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetFormResponsesListQuery__
 *
 * To run a query within a React component, call `useGetFormResponsesListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetFormResponsesListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetFormResponsesListQuery({
 *   variables: {
 *      formId: // value for 'formId'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetFormResponsesListQuery(baseOptions: Apollo.QueryHookOptions<GetFormResponsesListQuery, GetFormResponsesListQueryVariables> & ({ variables: GetFormResponsesListQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetFormResponsesListQuery, GetFormResponsesListQueryVariables>(GetFormResponsesListDocument, options);
      }
export function useGetFormResponsesListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetFormResponsesListQuery, GetFormResponsesListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetFormResponsesListQuery, GetFormResponsesListQueryVariables>(GetFormResponsesListDocument, options);
        }
// @ts-ignore
export function useGetFormResponsesListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetFormResponsesListQuery, GetFormResponsesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormResponsesListQuery, GetFormResponsesListQueryVariables>;
export function useGetFormResponsesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormResponsesListQuery, GetFormResponsesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormResponsesListQuery | undefined, GetFormResponsesListQueryVariables>;
export function useGetFormResponsesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormResponsesListQuery, GetFormResponsesListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetFormResponsesListQuery, GetFormResponsesListQueryVariables>(GetFormResponsesListDocument, options);
        }
export type GetFormResponsesListQueryHookResult = ReturnType<typeof useGetFormResponsesListQuery>;
export type GetFormResponsesListLazyQueryHookResult = ReturnType<typeof useGetFormResponsesListLazyQuery>;
export type GetFormResponsesListSuspenseQueryHookResult = ReturnType<typeof useGetFormResponsesListSuspenseQuery>;
export type GetFormResponsesListQueryResult = Apollo.QueryResult<GetFormResponsesListQuery, GetFormResponsesListQueryVariables>;
export const GetFormForEditDocument = gql`
    query GetFormForEdit($formId: ID!) {
  getForm(formId: $formId) {
    id
    title
    description
    slug
    shopUseOnly
    status
    allowGuestSubmissions
    publicToken
    systemKey
    fields {
      key
      type
      label
      helpText
      required
      options
      hidden
    }
  }
}
    `;

/**
 * __useGetFormForEditQuery__
 *
 * To run a query within a React component, call `useGetFormForEditQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetFormForEditQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetFormForEditQuery({
 *   variables: {
 *      formId: // value for 'formId'
 *   },
 * });
 */
export function useGetFormForEditQuery(baseOptions: Apollo.QueryHookOptions<GetFormForEditQuery, GetFormForEditQueryVariables> & ({ variables: GetFormForEditQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetFormForEditQuery, GetFormForEditQueryVariables>(GetFormForEditDocument, options);
      }
export function useGetFormForEditLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetFormForEditQuery, GetFormForEditQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetFormForEditQuery, GetFormForEditQueryVariables>(GetFormForEditDocument, options);
        }
// @ts-ignore
export function useGetFormForEditSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetFormForEditQuery, GetFormForEditQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormForEditQuery, GetFormForEditQueryVariables>;
export function useGetFormForEditSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormForEditQuery, GetFormForEditQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormForEditQuery | undefined, GetFormForEditQueryVariables>;
export function useGetFormForEditSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormForEditQuery, GetFormForEditQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetFormForEditQuery, GetFormForEditQueryVariables>(GetFormForEditDocument, options);
        }
export type GetFormForEditQueryHookResult = ReturnType<typeof useGetFormForEditQuery>;
export type GetFormForEditLazyQueryHookResult = ReturnType<typeof useGetFormForEditLazyQuery>;
export type GetFormForEditSuspenseQueryHookResult = ReturnType<typeof useGetFormForEditSuspenseQuery>;
export type GetFormForEditQueryResult = Apollo.QueryResult<GetFormForEditQuery, GetFormForEditQueryVariables>;
export const CreateFormFromBuilderDocument = gql`
    mutation CreateFormFromBuilder($input: CreateFormInput!) {
  createForm(input: $input) {
    id
    title
    description
    slug
    shopUseOnly
    status
    allowGuestSubmissions
    publicToken
    systemKey
    fields {
      key
      type
      label
      helpText
      required
      options
    }
  }
}
    `;
export type CreateFormFromBuilderMutationFn = Apollo.MutationFunction<CreateFormFromBuilderMutation, CreateFormFromBuilderMutationVariables>;

/**
 * __useCreateFormFromBuilderMutation__
 *
 * To run a mutation, you first call `useCreateFormFromBuilderMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateFormFromBuilderMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createFormFromBuilderMutation, { data, loading, error }] = useCreateFormFromBuilderMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateFormFromBuilderMutation(baseOptions?: Apollo.MutationHookOptions<CreateFormFromBuilderMutation, CreateFormFromBuilderMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateFormFromBuilderMutation, CreateFormFromBuilderMutationVariables>(CreateFormFromBuilderDocument, options);
      }
export type CreateFormFromBuilderMutationHookResult = ReturnType<typeof useCreateFormFromBuilderMutation>;
export type CreateFormFromBuilderMutationResult = Apollo.MutationResult<CreateFormFromBuilderMutation>;
export type CreateFormFromBuilderMutationOptions = Apollo.BaseMutationOptions<CreateFormFromBuilderMutation, CreateFormFromBuilderMutationVariables>;
export const UpdateFormDocument = gql`
    mutation UpdateForm($input: UpdateFormInput!) {
  updateForm(input: $input) {
    id
    title
    description
    slug
    shopUseOnly
    status
    allowGuestSubmissions
    publicToken
    systemKey
    fields {
      key
      type
      label
      helpText
      required
      options
    }
  }
}
    `;
export type UpdateFormMutationFn = Apollo.MutationFunction<UpdateFormMutation, UpdateFormMutationVariables>;

/**
 * __useUpdateFormMutation__
 *
 * To run a mutation, you first call `useUpdateFormMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateFormMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateFormMutation, { data, loading, error }] = useUpdateFormMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateFormMutation(baseOptions?: Apollo.MutationHookOptions<UpdateFormMutation, UpdateFormMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateFormMutation, UpdateFormMutationVariables>(UpdateFormDocument, options);
      }
export type UpdateFormMutationHookResult = ReturnType<typeof useUpdateFormMutation>;
export type UpdateFormMutationResult = Apollo.MutationResult<UpdateFormMutation>;
export type UpdateFormMutationOptions = Apollo.BaseMutationOptions<UpdateFormMutation, UpdateFormMutationVariables>;
export const UpdateBookingRequestFieldsDocument = gql`
    mutation UpdateBookingRequestFields($formId: ID!, $fields: [BookingRequestFieldInput!]!) {
  updateBookingRequestFields(formId: $formId, fields: $fields) {
    id
    title
    description
    slug
    shopUseOnly
    status
    allowGuestSubmissions
    publicToken
    systemKey
    fields {
      key
      type
      label
      helpText
      required
      options
      hidden
    }
  }
}
    `;
export type UpdateBookingRequestFieldsMutationFn = Apollo.MutationFunction<UpdateBookingRequestFieldsMutation, UpdateBookingRequestFieldsMutationVariables>;

/**
 * __useUpdateBookingRequestFieldsMutation__
 *
 * To run a mutation, you first call `useUpdateBookingRequestFieldsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateBookingRequestFieldsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateBookingRequestFieldsMutation, { data, loading, error }] = useUpdateBookingRequestFieldsMutation({
 *   variables: {
 *      formId: // value for 'formId'
 *      fields: // value for 'fields'
 *   },
 * });
 */
export function useUpdateBookingRequestFieldsMutation(baseOptions?: Apollo.MutationHookOptions<UpdateBookingRequestFieldsMutation, UpdateBookingRequestFieldsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateBookingRequestFieldsMutation, UpdateBookingRequestFieldsMutationVariables>(UpdateBookingRequestFieldsDocument, options);
      }
export type UpdateBookingRequestFieldsMutationHookResult = ReturnType<typeof useUpdateBookingRequestFieldsMutation>;
export type UpdateBookingRequestFieldsMutationResult = Apollo.MutationResult<UpdateBookingRequestFieldsMutation>;
export type UpdateBookingRequestFieldsMutationOptions = Apollo.BaseMutationOptions<UpdateBookingRequestFieldsMutation, UpdateBookingRequestFieldsMutationVariables>;
export const GetFormToFillOutDocument = gql`
    query GetFormToFillOut($formId: ID!) {
  getForm(formId: $formId) {
    id
    title
    description
    status
    fields {
      key
      type
      label
      helpText
      required
      options
    }
  }
}
    `;

/**
 * __useGetFormToFillOutQuery__
 *
 * To run a query within a React component, call `useGetFormToFillOutQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetFormToFillOutQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetFormToFillOutQuery({
 *   variables: {
 *      formId: // value for 'formId'
 *   },
 * });
 */
export function useGetFormToFillOutQuery(baseOptions: Apollo.QueryHookOptions<GetFormToFillOutQuery, GetFormToFillOutQueryVariables> & ({ variables: GetFormToFillOutQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetFormToFillOutQuery, GetFormToFillOutQueryVariables>(GetFormToFillOutDocument, options);
      }
export function useGetFormToFillOutLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetFormToFillOutQuery, GetFormToFillOutQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetFormToFillOutQuery, GetFormToFillOutQueryVariables>(GetFormToFillOutDocument, options);
        }
// @ts-ignore
export function useGetFormToFillOutSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetFormToFillOutQuery, GetFormToFillOutQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormToFillOutQuery, GetFormToFillOutQueryVariables>;
export function useGetFormToFillOutSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormToFillOutQuery, GetFormToFillOutQueryVariables>): Apollo.UseSuspenseQueryResult<GetFormToFillOutQuery | undefined, GetFormToFillOutQueryVariables>;
export function useGetFormToFillOutSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetFormToFillOutQuery, GetFormToFillOutQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetFormToFillOutQuery, GetFormToFillOutQueryVariables>(GetFormToFillOutDocument, options);
        }
export type GetFormToFillOutQueryHookResult = ReturnType<typeof useGetFormToFillOutQuery>;
export type GetFormToFillOutLazyQueryHookResult = ReturnType<typeof useGetFormToFillOutLazyQuery>;
export type GetFormToFillOutSuspenseQueryHookResult = ReturnType<typeof useGetFormToFillOutSuspenseQuery>;
export type GetFormToFillOutQueryResult = Apollo.QueryResult<GetFormToFillOutQuery, GetFormToFillOutQueryVariables>;
export const SubmitFormResponseDocument = gql`
    mutation SubmitFormResponse($input: SubmitFormResponseInput!) {
  submitFormResponse(input: $input) {
    id
  }
}
    `;
export type SubmitFormResponseMutationFn = Apollo.MutationFunction<SubmitFormResponseMutation, SubmitFormResponseMutationVariables>;

/**
 * __useSubmitFormResponseMutation__
 *
 * To run a mutation, you first call `useSubmitFormResponseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSubmitFormResponseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [submitFormResponseMutation, { data, loading, error }] = useSubmitFormResponseMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useSubmitFormResponseMutation(baseOptions?: Apollo.MutationHookOptions<SubmitFormResponseMutation, SubmitFormResponseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SubmitFormResponseMutation, SubmitFormResponseMutationVariables>(SubmitFormResponseDocument, options);
      }
export type SubmitFormResponseMutationHookResult = ReturnType<typeof useSubmitFormResponseMutation>;
export type SubmitFormResponseMutationResult = Apollo.MutationResult<SubmitFormResponseMutation>;
export type SubmitFormResponseMutationOptions = Apollo.BaseMutationOptions<SubmitFormResponseMutation, SubmitFormResponseMutationVariables>;
export const GetProjectDocument = gql`
    query GetProject($projectId: ID!) {
  getProject(projectId: $projectId) {
    id
    title
    description
    placement
    size
    palette
    artistId
    artist {
      firstName
      lastName
      email
      id
      hourlyRate
      flatRate
      billingType
      user {
        id
      }
      shop {
        id
        name
        hourlyRate
        flatRate
        billingType
      }
    }
    clientId
    client {
      firstName
      lastName
      email
      id
    }
    conversation {
      id
      members
      membersInfo {
        id
        firstName
        lastName
        avatar
      }
      messages {
        id
        conversationId
        senderId
        user {
          firstName
          lastName
          avatar
        }
        message
        createdAt
        updatedAt
      }
      createdAt
      updatedAt
    }
    referenceImages {
      id
      url
      avatar
      title
      uploadedByDisplayName
      userId
      userInfo {
        firstName
        lastName
        avatar
        id
      }
      tags
      updatedAt
      createdAt
    }
    bodyImages {
      id
      url
      avatar
      title
      uploadedByDisplayName
      userId
      userInfo {
        firstName
        lastName
        avatar
        id
      }
      tags
      updatedAt
      createdAt
    }
    designImages {
      id
      url
      avatar
      uploadedByDisplayName
      userId
      userInfo {
        firstName
        lastName
        avatar
        id
      }
      tags
      updatedAt
      createdAt
    }
    materialsUsed
    notes {
      id
      author
      note
      createdAt
      updatedAt
    }
    tags
    status
    depositCollectedCents
    depositAvailableCents
    deposits {
      id
      depositCents
      depositPaymentMethod
      depositCollectedAt
    }
    consultAppointment {
      id
      depositCents
      depositStatus
      depositPaymentMethod
      depositCollectedAt
    }
  }
}
    `;

/**
 * __useGetProjectQuery__
 *
 * To run a query within a React component, call `useGetProjectQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProjectQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProjectQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *   },
 * });
 */
export function useGetProjectQuery(baseOptions: Apollo.QueryHookOptions<GetProjectQuery, GetProjectQueryVariables> & ({ variables: GetProjectQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProjectQuery, GetProjectQueryVariables>(GetProjectDocument, options);
      }
export function useGetProjectLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProjectQuery, GetProjectQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProjectQuery, GetProjectQueryVariables>(GetProjectDocument, options);
        }
// @ts-ignore
export function useGetProjectSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetProjectQuery, GetProjectQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectQuery, GetProjectQueryVariables>;
export function useGetProjectSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectQuery, GetProjectQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectQuery | undefined, GetProjectQueryVariables>;
export function useGetProjectSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectQuery, GetProjectQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetProjectQuery, GetProjectQueryVariables>(GetProjectDocument, options);
        }
export type GetProjectQueryHookResult = ReturnType<typeof useGetProjectQuery>;
export type GetProjectLazyQueryHookResult = ReturnType<typeof useGetProjectLazyQuery>;
export type GetProjectSuspenseQueryHookResult = ReturnType<typeof useGetProjectSuspenseQuery>;
export type GetProjectQueryResult = Apollo.QueryResult<GetProjectQuery, GetProjectQueryVariables>;
export const GetProjectGqlDocument = gql`
    query GetProjectGql($projectId: ID!) {
  getProject(projectId: $projectId) {
    id
    title
    description
    placement
    size
    palette
    artistId
    artist {
      firstName
      lastName
      email
      id
      shop {
        id
        name
      }
    }
    clientId
    client {
      firstName
      lastName
      email
      id
    }
    referenceImages {
      url
      avatar
      title
      uploadedByDisplayName
      userId
      userInfo {
        firstName
        lastName
        avatar
      }
      tags
      updatedAt
      createdAt
    }
    bodyImages {
      url
      avatar
      title
      uploadedByDisplayName
      userId
      userInfo {
        firstName
        lastName
        avatar
      }
      tags
      updatedAt
      createdAt
    }
    designImages {
      url
      avatar
      uploadedByDisplayName
      userId
      userInfo {
        firstName
        lastName
        avatar
      }
      tags
      updatedAt
      createdAt
    }
    materialsUsed
    notes {
      author
      note
      createdAt
      updatedAt
    }
    tags
    status
    depositCollectedCents
    depositAvailableCents
    deposits {
      id
      depositCents
      depositPaymentMethod
      depositCollectedAt
    }
  }
}
    `;

/**
 * __useGetProjectGqlQuery__
 *
 * To run a query within a React component, call `useGetProjectGqlQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProjectGqlQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProjectGqlQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *   },
 * });
 */
export function useGetProjectGqlQuery(baseOptions: Apollo.QueryHookOptions<GetProjectGqlQuery, GetProjectGqlQueryVariables> & ({ variables: GetProjectGqlQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProjectGqlQuery, GetProjectGqlQueryVariables>(GetProjectGqlDocument, options);
      }
export function useGetProjectGqlLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProjectGqlQuery, GetProjectGqlQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProjectGqlQuery, GetProjectGqlQueryVariables>(GetProjectGqlDocument, options);
        }
// @ts-ignore
export function useGetProjectGqlSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetProjectGqlQuery, GetProjectGqlQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectGqlQuery, GetProjectGqlQueryVariables>;
export function useGetProjectGqlSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectGqlQuery, GetProjectGqlQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectGqlQuery | undefined, GetProjectGqlQueryVariables>;
export function useGetProjectGqlSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectGqlQuery, GetProjectGqlQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetProjectGqlQuery, GetProjectGqlQueryVariables>(GetProjectGqlDocument, options);
        }
export type GetProjectGqlQueryHookResult = ReturnType<typeof useGetProjectGqlQuery>;
export type GetProjectGqlLazyQueryHookResult = ReturnType<typeof useGetProjectGqlLazyQuery>;
export type GetProjectGqlSuspenseQueryHookResult = ReturnType<typeof useGetProjectGqlSuspenseQuery>;
export type GetProjectGqlQueryResult = Apollo.QueryResult<GetProjectGqlQuery, GetProjectGqlQueryVariables>;
export const GetProjectsDocument = gql`
    query GetProjects($page: PageInput) {
  getProjects(page: $page) {
    items {
      id
      title
      description
      placement
      size
      palette
      artistId
      artist {
        firstName
        lastName
        email
        avatar
        id
      }
      clientId
      client {
        firstName
        lastName
        email
        avatar
        id
      }
      referenceImages {
        url
        avatar
        title
        uploadedByDisplayName
        tags
        updatedAt
        createdAt
      }
      bodyImages {
        url
        avatar
        title
        uploadedByDisplayName
        tags
        updatedAt
        createdAt
      }
      designImages {
        url
        avatar
        uploadedByDisplayName
        tags
        updatedAt
        createdAt
      }
      materialsUsed
      notes {
        author
        note
        createdAt
        updatedAt
      }
      tags
      status
      depositCollectedCents
      depositAvailableCents
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetProjectsQuery__
 *
 * To run a query within a React component, call `useGetProjectsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProjectsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProjectsQuery({
 *   variables: {
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetProjectsQuery(baseOptions?: Apollo.QueryHookOptions<GetProjectsQuery, GetProjectsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProjectsQuery, GetProjectsQueryVariables>(GetProjectsDocument, options);
      }
export function useGetProjectsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProjectsQuery, GetProjectsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProjectsQuery, GetProjectsQueryVariables>(GetProjectsDocument, options);
        }
// @ts-ignore
export function useGetProjectsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetProjectsQuery, GetProjectsQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectsQuery, GetProjectsQueryVariables>;
export function useGetProjectsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectsQuery, GetProjectsQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectsQuery | undefined, GetProjectsQueryVariables>;
export function useGetProjectsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectsQuery, GetProjectsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetProjectsQuery, GetProjectsQueryVariables>(GetProjectsDocument, options);
        }
export type GetProjectsQueryHookResult = ReturnType<typeof useGetProjectsQuery>;
export type GetProjectsLazyQueryHookResult = ReturnType<typeof useGetProjectsLazyQuery>;
export type GetProjectsSuspenseQueryHookResult = ReturnType<typeof useGetProjectsSuspenseQuery>;
export type GetProjectsQueryResult = Apollo.QueryResult<GetProjectsQuery, GetProjectsQueryVariables>;
export const GetProjectsByArtistDocument = gql`
    query GetProjectsByArtist($artistId: ID!) {
  getProjectsByArtist(artistId: $artistId) {
    id
    title
    description
    client {
      user {
        id
        firstName
        lastName
        avatar
      }
    }
    artist {
      user {
        id
        firstName
        lastName
        avatar
      }
    }
  }
}
    `;

/**
 * __useGetProjectsByArtistQuery__
 *
 * To run a query within a React component, call `useGetProjectsByArtistQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProjectsByArtistQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProjectsByArtistQuery({
 *   variables: {
 *      artistId: // value for 'artistId'
 *   },
 * });
 */
export function useGetProjectsByArtistQuery(baseOptions: Apollo.QueryHookOptions<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables> & ({ variables: GetProjectsByArtistQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables>(GetProjectsByArtistDocument, options);
      }
export function useGetProjectsByArtistLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables>(GetProjectsByArtistDocument, options);
        }
// @ts-ignore
export function useGetProjectsByArtistSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables>;
export function useGetProjectsByArtistSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectsByArtistQuery | undefined, GetProjectsByArtistQueryVariables>;
export function useGetProjectsByArtistSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables>(GetProjectsByArtistDocument, options);
        }
export type GetProjectsByArtistQueryHookResult = ReturnType<typeof useGetProjectsByArtistQuery>;
export type GetProjectsByArtistLazyQueryHookResult = ReturnType<typeof useGetProjectsByArtistLazyQuery>;
export type GetProjectsByArtistSuspenseQueryHookResult = ReturnType<typeof useGetProjectsByArtistSuspenseQuery>;
export type GetProjectsByArtistQueryResult = Apollo.QueryResult<GetProjectsByArtistQuery, GetProjectsByArtistQueryVariables>;
export const CreateArtistGiftCardDocument = gql`
    mutation CreateArtistGiftCard($input: CreateArtistGiftCardInput!) {
  createArtistGiftCard(input: $input) {
    id
    code
    issuerType
    faceValueCents
    balanceCents
    feeOffsetCents
    paymentMethod
    saleStatus
  }
}
    `;
export type CreateArtistGiftCardMutationFn = Apollo.MutationFunction<CreateArtistGiftCardMutation, CreateArtistGiftCardMutationVariables>;

/**
 * __useCreateArtistGiftCardMutation__
 *
 * To run a mutation, you first call `useCreateArtistGiftCardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateArtistGiftCardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createArtistGiftCardMutation, { data, loading, error }] = useCreateArtistGiftCardMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateArtistGiftCardMutation(baseOptions?: Apollo.MutationHookOptions<CreateArtistGiftCardMutation, CreateArtistGiftCardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateArtistGiftCardMutation, CreateArtistGiftCardMutationVariables>(CreateArtistGiftCardDocument, options);
      }
export type CreateArtistGiftCardMutationHookResult = ReturnType<typeof useCreateArtistGiftCardMutation>;
export type CreateArtistGiftCardMutationResult = Apollo.MutationResult<CreateArtistGiftCardMutation>;
export type CreateArtistGiftCardMutationOptions = Apollo.BaseMutationOptions<CreateArtistGiftCardMutation, CreateArtistGiftCardMutationVariables>;
export const CreateShopGiftCardDocument = gql`
    mutation CreateShopGiftCard($input: CreateShopGiftCardInput!) {
  createShopGiftCard(input: $input) {
    id
    code
    issuerType
    shopId
    faceValueCents
    balanceCents
    feeOffsetCents
    paymentMethod
    saleStatus
  }
}
    `;
export type CreateShopGiftCardMutationFn = Apollo.MutationFunction<CreateShopGiftCardMutation, CreateShopGiftCardMutationVariables>;

/**
 * __useCreateShopGiftCardMutation__
 *
 * To run a mutation, you first call `useCreateShopGiftCardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateShopGiftCardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createShopGiftCardMutation, { data, loading, error }] = useCreateShopGiftCardMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateShopGiftCardMutation(baseOptions?: Apollo.MutationHookOptions<CreateShopGiftCardMutation, CreateShopGiftCardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateShopGiftCardMutation, CreateShopGiftCardMutationVariables>(CreateShopGiftCardDocument, options);
      }
export type CreateShopGiftCardMutationHookResult = ReturnType<typeof useCreateShopGiftCardMutation>;
export type CreateShopGiftCardMutationResult = Apollo.MutationResult<CreateShopGiftCardMutation>;
export type CreateShopGiftCardMutationOptions = Apollo.BaseMutationOptions<CreateShopGiftCardMutation, CreateShopGiftCardMutationVariables>;
export const GetMyGiftCardsDocument = gql`
    query GetMyGiftCards {
  getMyGiftCards {
    id
    code
    issuerType
    shopId
    faceValueCents
    balanceCents
    feeOffsetCents
    soldAt
    soldByUserId
    paymentMethod
    saleStatus
    squarePaymentId
    shopCutStatus
    shopCutCents
    shopCutPercentApplied
  }
}
    `;

/**
 * __useGetMyGiftCardsQuery__
 *
 * To run a query within a React component, call `useGetMyGiftCardsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMyGiftCardsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMyGiftCardsQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetMyGiftCardsQuery(baseOptions?: Apollo.QueryHookOptions<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>(GetMyGiftCardsDocument, options);
      }
export function useGetMyGiftCardsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>(GetMyGiftCardsDocument, options);
        }
// @ts-ignore
export function useGetMyGiftCardsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>;
export function useGetMyGiftCardsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyGiftCardsQuery | undefined, GetMyGiftCardsQueryVariables>;
export function useGetMyGiftCardsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>(GetMyGiftCardsDocument, options);
        }
export type GetMyGiftCardsQueryHookResult = ReturnType<typeof useGetMyGiftCardsQuery>;
export type GetMyGiftCardsLazyQueryHookResult = ReturnType<typeof useGetMyGiftCardsLazyQuery>;
export type GetMyGiftCardsSuspenseQueryHookResult = ReturnType<typeof useGetMyGiftCardsSuspenseQuery>;
export type GetMyGiftCardsQueryResult = Apollo.QueryResult<GetMyGiftCardsQuery, GetMyGiftCardsQueryVariables>;
export const GetGiftCardsByShopDocument = gql`
    query GetGiftCardsByShop($shopId: ID!) {
  getGiftCardsByShop(shopId: $shopId) {
    id
    code
    issuerType
    shopId
    faceValueCents
    balanceCents
    feeOffsetCents
    soldAt
    soldByUserId
    paymentMethod
    saleStatus
    squarePaymentId
    shopCutStatus
    shopCutCents
    shopCutPercentApplied
  }
}
    `;

/**
 * __useGetGiftCardsByShopQuery__
 *
 * To run a query within a React component, call `useGetGiftCardsByShopQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetGiftCardsByShopQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetGiftCardsByShopQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useGetGiftCardsByShopQuery(baseOptions: Apollo.QueryHookOptions<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables> & ({ variables: GetGiftCardsByShopQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables>(GetGiftCardsByShopDocument, options);
      }
export function useGetGiftCardsByShopLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables>(GetGiftCardsByShopDocument, options);
        }
// @ts-ignore
export function useGetGiftCardsByShopSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables>): Apollo.UseSuspenseQueryResult<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables>;
export function useGetGiftCardsByShopSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables>): Apollo.UseSuspenseQueryResult<GetGiftCardsByShopQuery | undefined, GetGiftCardsByShopQueryVariables>;
export function useGetGiftCardsByShopSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables>(GetGiftCardsByShopDocument, options);
        }
export type GetGiftCardsByShopQueryHookResult = ReturnType<typeof useGetGiftCardsByShopQuery>;
export type GetGiftCardsByShopLazyQueryHookResult = ReturnType<typeof useGetGiftCardsByShopLazyQuery>;
export type GetGiftCardsByShopSuspenseQueryHookResult = ReturnType<typeof useGetGiftCardsByShopSuspenseQuery>;
export type GetGiftCardsByShopQueryResult = Apollo.QueryResult<GetGiftCardsByShopQuery, GetGiftCardsByShopQueryVariables>;
export const GetMyGiftCardLiabilityReportDocument = gql`
    query GetMyGiftCardLiabilityReport {
  getMyGiftCardLiabilityReport {
    outstandingBalanceCents
    cardCount
    oldestIssuedAt
  }
}
    `;

/**
 * __useGetMyGiftCardLiabilityReportQuery__
 *
 * To run a query within a React component, call `useGetMyGiftCardLiabilityReportQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMyGiftCardLiabilityReportQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMyGiftCardLiabilityReportQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetMyGiftCardLiabilityReportQuery(baseOptions?: Apollo.QueryHookOptions<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>(GetMyGiftCardLiabilityReportDocument, options);
      }
export function useGetMyGiftCardLiabilityReportLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>(GetMyGiftCardLiabilityReportDocument, options);
        }
// @ts-ignore
export function useGetMyGiftCardLiabilityReportSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>;
export function useGetMyGiftCardLiabilityReportSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyGiftCardLiabilityReportQuery | undefined, GetMyGiftCardLiabilityReportQueryVariables>;
export function useGetMyGiftCardLiabilityReportSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>(GetMyGiftCardLiabilityReportDocument, options);
        }
export type GetMyGiftCardLiabilityReportQueryHookResult = ReturnType<typeof useGetMyGiftCardLiabilityReportQuery>;
export type GetMyGiftCardLiabilityReportLazyQueryHookResult = ReturnType<typeof useGetMyGiftCardLiabilityReportLazyQuery>;
export type GetMyGiftCardLiabilityReportSuspenseQueryHookResult = ReturnType<typeof useGetMyGiftCardLiabilityReportSuspenseQuery>;
export type GetMyGiftCardLiabilityReportQueryResult = Apollo.QueryResult<GetMyGiftCardLiabilityReportQuery, GetMyGiftCardLiabilityReportQueryVariables>;
export const GetGiftCardLiabilityReportDocument = gql`
    query GetGiftCardLiabilityReport($shopId: ID!) {
  getGiftCardLiabilityReport(shopId: $shopId) {
    outstandingBalanceCents
    cardCount
    oldestIssuedAt
  }
}
    `;

/**
 * __useGetGiftCardLiabilityReportQuery__
 *
 * To run a query within a React component, call `useGetGiftCardLiabilityReportQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetGiftCardLiabilityReportQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetGiftCardLiabilityReportQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useGetGiftCardLiabilityReportQuery(baseOptions: Apollo.QueryHookOptions<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables> & ({ variables: GetGiftCardLiabilityReportQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables>(GetGiftCardLiabilityReportDocument, options);
      }
export function useGetGiftCardLiabilityReportLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables>(GetGiftCardLiabilityReportDocument, options);
        }
// @ts-ignore
export function useGetGiftCardLiabilityReportSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables>): Apollo.UseSuspenseQueryResult<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables>;
export function useGetGiftCardLiabilityReportSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables>): Apollo.UseSuspenseQueryResult<GetGiftCardLiabilityReportQuery | undefined, GetGiftCardLiabilityReportQueryVariables>;
export function useGetGiftCardLiabilityReportSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables>(GetGiftCardLiabilityReportDocument, options);
        }
export type GetGiftCardLiabilityReportQueryHookResult = ReturnType<typeof useGetGiftCardLiabilityReportQuery>;
export type GetGiftCardLiabilityReportLazyQueryHookResult = ReturnType<typeof useGetGiftCardLiabilityReportLazyQuery>;
export type GetGiftCardLiabilityReportSuspenseQueryHookResult = ReturnType<typeof useGetGiftCardLiabilityReportSuspenseQuery>;
export type GetGiftCardLiabilityReportQueryResult = Apollo.QueryResult<GetGiftCardLiabilityReportQuery, GetGiftCardLiabilityReportQueryVariables>;
export const RedeemGiftCardDocument = gql`
    mutation RedeemGiftCard($appointmentId: ID!, $code: String!, $amountCents: Int!) {
  redeemGiftCard(
    appointmentId: $appointmentId
    code: $code
    amountCents: $amountCents
  ) {
    giftCard {
      id
      balanceCents
    }
    appointment {
      id
      subtotalCents
      totalCents
      shopCutCents
      shopCutPercentApplied
      giftCardCreditCents
      artistIssuedGiftCardCreditCents
    }
    redemption {
      id
      amountCents
      shopPayoutCents
    }
  }
}
    `;
export type RedeemGiftCardMutationFn = Apollo.MutationFunction<RedeemGiftCardMutation, RedeemGiftCardMutationVariables>;

/**
 * __useRedeemGiftCardMutation__
 *
 * To run a mutation, you first call `useRedeemGiftCardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRedeemGiftCardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [redeemGiftCardMutation, { data, loading, error }] = useRedeemGiftCardMutation({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *      code: // value for 'code'
 *      amountCents: // value for 'amountCents'
 *   },
 * });
 */
export function useRedeemGiftCardMutation(baseOptions?: Apollo.MutationHookOptions<RedeemGiftCardMutation, RedeemGiftCardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RedeemGiftCardMutation, RedeemGiftCardMutationVariables>(RedeemGiftCardDocument, options);
      }
export type RedeemGiftCardMutationHookResult = ReturnType<typeof useRedeemGiftCardMutation>;
export type RedeemGiftCardMutationResult = Apollo.MutationResult<RedeemGiftCardMutation>;
export type RedeemGiftCardMutationOptions = Apollo.BaseMutationOptions<RedeemGiftCardMutation, RedeemGiftCardMutationVariables>;
export const CreateGiftCardShopCutInvoiceDocument = gql`
    mutation CreateGiftCardShopCutInvoice($giftCardId: ID!, $paymentMethod: String) {
  createGiftCardShopCutInvoice(
    giftCardId: $giftCardId
    paymentMethod: $paymentMethod
  ) {
    giftCard {
      id
      shopCutStatus
      shopCutSquareInvoiceId
    }
    invoiceUrl
  }
}
    `;
export type CreateGiftCardShopCutInvoiceMutationFn = Apollo.MutationFunction<CreateGiftCardShopCutInvoiceMutation, CreateGiftCardShopCutInvoiceMutationVariables>;

/**
 * __useCreateGiftCardShopCutInvoiceMutation__
 *
 * To run a mutation, you first call `useCreateGiftCardShopCutInvoiceMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateGiftCardShopCutInvoiceMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createGiftCardShopCutInvoiceMutation, { data, loading, error }] = useCreateGiftCardShopCutInvoiceMutation({
 *   variables: {
 *      giftCardId: // value for 'giftCardId'
 *      paymentMethod: // value for 'paymentMethod'
 *   },
 * });
 */
export function useCreateGiftCardShopCutInvoiceMutation(baseOptions?: Apollo.MutationHookOptions<CreateGiftCardShopCutInvoiceMutation, CreateGiftCardShopCutInvoiceMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateGiftCardShopCutInvoiceMutation, CreateGiftCardShopCutInvoiceMutationVariables>(CreateGiftCardShopCutInvoiceDocument, options);
      }
export type CreateGiftCardShopCutInvoiceMutationHookResult = ReturnType<typeof useCreateGiftCardShopCutInvoiceMutation>;
export type CreateGiftCardShopCutInvoiceMutationResult = Apollo.MutationResult<CreateGiftCardShopCutInvoiceMutation>;
export type CreateGiftCardShopCutInvoiceMutationOptions = Apollo.BaseMutationOptions<CreateGiftCardShopCutInvoiceMutation, CreateGiftCardShopCutInvoiceMutationVariables>;
export const MarkGiftCardShopCutPaidManuallyDocument = gql`
    mutation MarkGiftCardShopCutPaidManually($giftCardId: ID!) {
  markGiftCardShopCutPaidManually(giftCardId: $giftCardId) {
    id
    shopCutStatus
    shopCutMarkedPaidBy
    shopCutMarkedPaidAt
  }
}
    `;
export type MarkGiftCardShopCutPaidManuallyMutationFn = Apollo.MutationFunction<MarkGiftCardShopCutPaidManuallyMutation, MarkGiftCardShopCutPaidManuallyMutationVariables>;

/**
 * __useMarkGiftCardShopCutPaidManuallyMutation__
 *
 * To run a mutation, you first call `useMarkGiftCardShopCutPaidManuallyMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkGiftCardShopCutPaidManuallyMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markGiftCardShopCutPaidManuallyMutation, { data, loading, error }] = useMarkGiftCardShopCutPaidManuallyMutation({
 *   variables: {
 *      giftCardId: // value for 'giftCardId'
 *   },
 * });
 */
export function useMarkGiftCardShopCutPaidManuallyMutation(baseOptions?: Apollo.MutationHookOptions<MarkGiftCardShopCutPaidManuallyMutation, MarkGiftCardShopCutPaidManuallyMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<MarkGiftCardShopCutPaidManuallyMutation, MarkGiftCardShopCutPaidManuallyMutationVariables>(MarkGiftCardShopCutPaidManuallyDocument, options);
      }
export type MarkGiftCardShopCutPaidManuallyMutationHookResult = ReturnType<typeof useMarkGiftCardShopCutPaidManuallyMutation>;
export type MarkGiftCardShopCutPaidManuallyMutationResult = Apollo.MutationResult<MarkGiftCardShopCutPaidManuallyMutation>;
export type MarkGiftCardShopCutPaidManuallyMutationOptions = Apollo.BaseMutationOptions<MarkGiftCardShopCutPaidManuallyMutation, MarkGiftCardShopCutPaidManuallyMutationVariables>;
export const ConfirmGiftCardShopCutPaidDocument = gql`
    mutation ConfirmGiftCardShopCutPaid($giftCardId: ID!) {
  confirmGiftCardShopCutPaid(giftCardId: $giftCardId) {
    id
    shopCutStatus
    shopCutConfirmedBy
    shopCutConfirmedAt
  }
}
    `;
export type ConfirmGiftCardShopCutPaidMutationFn = Apollo.MutationFunction<ConfirmGiftCardShopCutPaidMutation, ConfirmGiftCardShopCutPaidMutationVariables>;

/**
 * __useConfirmGiftCardShopCutPaidMutation__
 *
 * To run a mutation, you first call `useConfirmGiftCardShopCutPaidMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useConfirmGiftCardShopCutPaidMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [confirmGiftCardShopCutPaidMutation, { data, loading, error }] = useConfirmGiftCardShopCutPaidMutation({
 *   variables: {
 *      giftCardId: // value for 'giftCardId'
 *   },
 * });
 */
export function useConfirmGiftCardShopCutPaidMutation(baseOptions?: Apollo.MutationHookOptions<ConfirmGiftCardShopCutPaidMutation, ConfirmGiftCardShopCutPaidMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ConfirmGiftCardShopCutPaidMutation, ConfirmGiftCardShopCutPaidMutationVariables>(ConfirmGiftCardShopCutPaidDocument, options);
      }
export type ConfirmGiftCardShopCutPaidMutationHookResult = ReturnType<typeof useConfirmGiftCardShopCutPaidMutation>;
export type ConfirmGiftCardShopCutPaidMutationResult = Apollo.MutationResult<ConfirmGiftCardShopCutPaidMutation>;
export type ConfirmGiftCardShopCutPaidMutationOptions = Apollo.BaseMutationOptions<ConfirmGiftCardShopCutPaidMutation, ConfirmGiftCardShopCutPaidMutationVariables>;
export const GlobalSearchDocument = gql`
    query GlobalSearch($query: String!, $limit: Int) {
  search(query: $query, limit: $limit) {
    clients {
      id
      avatar
      firstName
      lastName
      email
      phone
      city
      state
    }
    projects {
      id
      title
      description
      status
      artist {
        id
        firstName
        lastName
        avatar
      }
      client {
        id
        firstName
        lastName
      }
    }
    messages {
      id
      conversationId
      message
      senderId
      user {
        id
        firstName
        lastName
        avatar
      }
      createdAt
    }
    images {
      id
      url
      clientId
      tags
      assignedProjectId
      createdAt
    }
  }
}
    `;

/**
 * __useGlobalSearchQuery__
 *
 * To run a query within a React component, call `useGlobalSearchQuery` and pass it any options that fit your needs.
 * When your component renders, `useGlobalSearchQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGlobalSearchQuery({
 *   variables: {
 *      query: // value for 'query'
 *      limit: // value for 'limit'
 *   },
 * });
 */
export function useGlobalSearchQuery(baseOptions: Apollo.QueryHookOptions<GlobalSearchQuery, GlobalSearchQueryVariables> & ({ variables: GlobalSearchQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GlobalSearchQuery, GlobalSearchQueryVariables>(GlobalSearchDocument, options);
      }
export function useGlobalSearchLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GlobalSearchQuery, GlobalSearchQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GlobalSearchQuery, GlobalSearchQueryVariables>(GlobalSearchDocument, options);
        }
// @ts-ignore
export function useGlobalSearchSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GlobalSearchQuery, GlobalSearchQueryVariables>): Apollo.UseSuspenseQueryResult<GlobalSearchQuery, GlobalSearchQueryVariables>;
export function useGlobalSearchSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GlobalSearchQuery, GlobalSearchQueryVariables>): Apollo.UseSuspenseQueryResult<GlobalSearchQuery | undefined, GlobalSearchQueryVariables>;
export function useGlobalSearchSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GlobalSearchQuery, GlobalSearchQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GlobalSearchQuery, GlobalSearchQueryVariables>(GlobalSearchDocument, options);
        }
export type GlobalSearchQueryHookResult = ReturnType<typeof useGlobalSearchQuery>;
export type GlobalSearchLazyQueryHookResult = ReturnType<typeof useGlobalSearchLazyQuery>;
export type GlobalSearchSuspenseQueryHookResult = ReturnType<typeof useGlobalSearchSuspenseQuery>;
export type GlobalSearchQueryResult = Apollo.QueryResult<GlobalSearchQuery, GlobalSearchQueryVariables>;
export const GetIncomeTypesListDocument = gql`
    query GetIncomeTypesList($shopId: ID, $artistUserId: ID) {
  getIncomeTypes(shopId: $shopId, artistUserId: $artistUserId) {
    id
    name
  }
}
    `;

/**
 * __useGetIncomeTypesListQuery__
 *
 * To run a query within a React component, call `useGetIncomeTypesListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetIncomeTypesListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetIncomeTypesListQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *   },
 * });
 */
export function useGetIncomeTypesListQuery(baseOptions?: Apollo.QueryHookOptions<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>(GetIncomeTypesListDocument, options);
      }
export function useGetIncomeTypesListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>(GetIncomeTypesListDocument, options);
        }
// @ts-ignore
export function useGetIncomeTypesListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>;
export function useGetIncomeTypesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetIncomeTypesListQuery | undefined, GetIncomeTypesListQueryVariables>;
export function useGetIncomeTypesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>(GetIncomeTypesListDocument, options);
        }
export type GetIncomeTypesListQueryHookResult = ReturnType<typeof useGetIncomeTypesListQuery>;
export type GetIncomeTypesListLazyQueryHookResult = ReturnType<typeof useGetIncomeTypesListLazyQuery>;
export type GetIncomeTypesListSuspenseQueryHookResult = ReturnType<typeof useGetIncomeTypesListSuspenseQuery>;
export type GetIncomeTypesListQueryResult = Apollo.QueryResult<GetIncomeTypesListQuery, GetIncomeTypesListQueryVariables>;
export const GetIncomesListDocument = gql`
    query GetIncomesList($shopId: ID, $artistUserId: ID, $start: DateTime, $end: DateTime, $page: PageInput) {
  getIncomes(
    shopId: $shopId
    artistUserId: $artistUserId
    start: $start
    end: $end
    page: $page
  ) {
    items {
      id
      incomeTypeId
      incomeType {
        id
        name
      }
      amountCents
      description
      date
      createdBy {
        id
        firstName
        lastName
      }
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetIncomesListQuery__
 *
 * To run a query within a React component, call `useGetIncomesListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetIncomesListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetIncomesListQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *      start: // value for 'start'
 *      end: // value for 'end'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetIncomesListQuery(baseOptions?: Apollo.QueryHookOptions<GetIncomesListQuery, GetIncomesListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetIncomesListQuery, GetIncomesListQueryVariables>(GetIncomesListDocument, options);
      }
export function useGetIncomesListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetIncomesListQuery, GetIncomesListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetIncomesListQuery, GetIncomesListQueryVariables>(GetIncomesListDocument, options);
        }
// @ts-ignore
export function useGetIncomesListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetIncomesListQuery, GetIncomesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetIncomesListQuery, GetIncomesListQueryVariables>;
export function useGetIncomesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetIncomesListQuery, GetIncomesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetIncomesListQuery | undefined, GetIncomesListQueryVariables>;
export function useGetIncomesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetIncomesListQuery, GetIncomesListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetIncomesListQuery, GetIncomesListQueryVariables>(GetIncomesListDocument, options);
        }
export type GetIncomesListQueryHookResult = ReturnType<typeof useGetIncomesListQuery>;
export type GetIncomesListLazyQueryHookResult = ReturnType<typeof useGetIncomesListLazyQuery>;
export type GetIncomesListSuspenseQueryHookResult = ReturnType<typeof useGetIncomesListSuspenseQuery>;
export type GetIncomesListQueryResult = Apollo.QueryResult<GetIncomesListQuery, GetIncomesListQueryVariables>;
export const RecordIncomeDocument = gql`
    mutation RecordIncome($input: RecordIncomeInput!) {
  recordIncome(input: $input) {
    id
    incomeTypeId
    incomeType {
      id
      name
    }
    amountCents
    description
    date
    createdBy {
      id
      firstName
      lastName
    }
  }
}
    `;
export type RecordIncomeMutationFn = Apollo.MutationFunction<RecordIncomeMutation, RecordIncomeMutationVariables>;

/**
 * __useRecordIncomeMutation__
 *
 * To run a mutation, you first call `useRecordIncomeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRecordIncomeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [recordIncomeMutation, { data, loading, error }] = useRecordIncomeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useRecordIncomeMutation(baseOptions?: Apollo.MutationHookOptions<RecordIncomeMutation, RecordIncomeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RecordIncomeMutation, RecordIncomeMutationVariables>(RecordIncomeDocument, options);
      }
export type RecordIncomeMutationHookResult = ReturnType<typeof useRecordIncomeMutation>;
export type RecordIncomeMutationResult = Apollo.MutationResult<RecordIncomeMutation>;
export type RecordIncomeMutationOptions = Apollo.BaseMutationOptions<RecordIncomeMutation, RecordIncomeMutationVariables>;
export const UpdateIncomeDocument = gql`
    mutation UpdateIncome($input: UpdateIncomeInput!) {
  updateIncome(input: $input) {
    id
    incomeTypeId
    incomeType {
      id
      name
    }
    amountCents
    description
    date
    createdBy {
      id
      firstName
      lastName
    }
  }
}
    `;
export type UpdateIncomeMutationFn = Apollo.MutationFunction<UpdateIncomeMutation, UpdateIncomeMutationVariables>;

/**
 * __useUpdateIncomeMutation__
 *
 * To run a mutation, you first call `useUpdateIncomeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateIncomeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateIncomeMutation, { data, loading, error }] = useUpdateIncomeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateIncomeMutation(baseOptions?: Apollo.MutationHookOptions<UpdateIncomeMutation, UpdateIncomeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateIncomeMutation, UpdateIncomeMutationVariables>(UpdateIncomeDocument, options);
      }
export type UpdateIncomeMutationHookResult = ReturnType<typeof useUpdateIncomeMutation>;
export type UpdateIncomeMutationResult = Apollo.MutationResult<UpdateIncomeMutation>;
export type UpdateIncomeMutationOptions = Apollo.BaseMutationOptions<UpdateIncomeMutation, UpdateIncomeMutationVariables>;
export const DeleteIncomeDocument = gql`
    mutation DeleteIncome($incomeId: ID!) {
  deleteIncome(incomeId: $incomeId)
}
    `;
export type DeleteIncomeMutationFn = Apollo.MutationFunction<DeleteIncomeMutation, DeleteIncomeMutationVariables>;

/**
 * __useDeleteIncomeMutation__
 *
 * To run a mutation, you first call `useDeleteIncomeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteIncomeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteIncomeMutation, { data, loading, error }] = useDeleteIncomeMutation({
 *   variables: {
 *      incomeId: // value for 'incomeId'
 *   },
 * });
 */
export function useDeleteIncomeMutation(baseOptions?: Apollo.MutationHookOptions<DeleteIncomeMutation, DeleteIncomeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteIncomeMutation, DeleteIncomeMutationVariables>(DeleteIncomeDocument, options);
      }
export type DeleteIncomeMutationHookResult = ReturnType<typeof useDeleteIncomeMutation>;
export type DeleteIncomeMutationResult = Apollo.MutationResult<DeleteIncomeMutation>;
export type DeleteIncomeMutationOptions = Apollo.BaseMutationOptions<DeleteIncomeMutation, DeleteIncomeMutationVariables>;
export const GetIncomeTypesForSettingsDocument = gql`
    query GetIncomeTypesForSettings($shopId: ID, $artistUserId: ID, $includeInactive: Boolean) {
  getIncomeTypes(
    shopId: $shopId
    artistUserId: $artistUserId
    includeInactive: $includeInactive
  ) {
    id
    name
    description
    active
  }
}
    `;

/**
 * __useGetIncomeTypesForSettingsQuery__
 *
 * To run a query within a React component, call `useGetIncomeTypesForSettingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetIncomeTypesForSettingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetIncomeTypesForSettingsQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *      includeInactive: // value for 'includeInactive'
 *   },
 * });
 */
export function useGetIncomeTypesForSettingsQuery(baseOptions?: Apollo.QueryHookOptions<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>(GetIncomeTypesForSettingsDocument, options);
      }
export function useGetIncomeTypesForSettingsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>(GetIncomeTypesForSettingsDocument, options);
        }
// @ts-ignore
export function useGetIncomeTypesForSettingsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>;
export function useGetIncomeTypesForSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetIncomeTypesForSettingsQuery | undefined, GetIncomeTypesForSettingsQueryVariables>;
export function useGetIncomeTypesForSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>(GetIncomeTypesForSettingsDocument, options);
        }
export type GetIncomeTypesForSettingsQueryHookResult = ReturnType<typeof useGetIncomeTypesForSettingsQuery>;
export type GetIncomeTypesForSettingsLazyQueryHookResult = ReturnType<typeof useGetIncomeTypesForSettingsLazyQuery>;
export type GetIncomeTypesForSettingsSuspenseQueryHookResult = ReturnType<typeof useGetIncomeTypesForSettingsSuspenseQuery>;
export type GetIncomeTypesForSettingsQueryResult = Apollo.QueryResult<GetIncomeTypesForSettingsQuery, GetIncomeTypesForSettingsQueryVariables>;
export const CreateIncomeTypeDocument = gql`
    mutation CreateIncomeType($input: CreateIncomeTypeInput!) {
  createIncomeType(input: $input) {
    id
  }
}
    `;
export type CreateIncomeTypeMutationFn = Apollo.MutationFunction<CreateIncomeTypeMutation, CreateIncomeTypeMutationVariables>;

/**
 * __useCreateIncomeTypeMutation__
 *
 * To run a mutation, you first call `useCreateIncomeTypeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateIncomeTypeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createIncomeTypeMutation, { data, loading, error }] = useCreateIncomeTypeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateIncomeTypeMutation(baseOptions?: Apollo.MutationHookOptions<CreateIncomeTypeMutation, CreateIncomeTypeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateIncomeTypeMutation, CreateIncomeTypeMutationVariables>(CreateIncomeTypeDocument, options);
      }
export type CreateIncomeTypeMutationHookResult = ReturnType<typeof useCreateIncomeTypeMutation>;
export type CreateIncomeTypeMutationResult = Apollo.MutationResult<CreateIncomeTypeMutation>;
export type CreateIncomeTypeMutationOptions = Apollo.BaseMutationOptions<CreateIncomeTypeMutation, CreateIncomeTypeMutationVariables>;
export const UpdateIncomeTypeDocument = gql`
    mutation UpdateIncomeType($input: UpdateIncomeTypeInput!) {
  updateIncomeType(input: $input) {
    id
    active
  }
}
    `;
export type UpdateIncomeTypeMutationFn = Apollo.MutationFunction<UpdateIncomeTypeMutation, UpdateIncomeTypeMutationVariables>;

/**
 * __useUpdateIncomeTypeMutation__
 *
 * To run a mutation, you first call `useUpdateIncomeTypeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateIncomeTypeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateIncomeTypeMutation, { data, loading, error }] = useUpdateIncomeTypeMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateIncomeTypeMutation(baseOptions?: Apollo.MutationHookOptions<UpdateIncomeTypeMutation, UpdateIncomeTypeMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateIncomeTypeMutation, UpdateIncomeTypeMutationVariables>(UpdateIncomeTypeDocument, options);
      }
export type UpdateIncomeTypeMutationHookResult = ReturnType<typeof useUpdateIncomeTypeMutation>;
export type UpdateIncomeTypeMutationResult = Apollo.MutationResult<UpdateIncomeTypeMutation>;
export type UpdateIncomeTypeMutationOptions = Apollo.BaseMutationOptions<UpdateIncomeTypeMutation, UpdateIncomeTypeMutationVariables>;
export const LoginDocument = gql`
    mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    id
    email
    firstName
    lastName
    avatar
    role
    userType
    tagColor
    themePreference
    accessToken
    firebaseToken
    userInfo {
      ... on Artist {
        id
        firstName
        lastName
        avatar
        hourlyRate
        shop {
          id
          name
          website
        }
      }
      ... on Client {
        id
        firstName
        lastName
        avatar
      }
      ... on Staff {
        id
        firstName
        lastName
        avatar
        title
        shop {
          id
          name
        }
      }
    }
  }
}
    `;
export type LoginMutationFn = Apollo.MutationFunction<LoginMutation, LoginMutationVariables>;

/**
 * __useLoginMutation__
 *
 * To run a mutation, you first call `useLoginMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLoginMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [loginMutation, { data, loading, error }] = useLoginMutation({
 *   variables: {
 *      email: // value for 'email'
 *      password: // value for 'password'
 *   },
 * });
 */
export function useLoginMutation(baseOptions?: Apollo.MutationHookOptions<LoginMutation, LoginMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<LoginMutation, LoginMutationVariables>(LoginDocument, options);
      }
export type LoginMutationHookResult = ReturnType<typeof useLoginMutation>;
export type LoginMutationResult = Apollo.MutationResult<LoginMutation>;
export type LoginMutationOptions = Apollo.BaseMutationOptions<LoginMutation, LoginMutationVariables>;
export const GetConversationsByMemberIdDocument = gql`
    query GetConversationsByMemberId($memberId: ID!) {
  getConversationsByMemberId(memberId: $memberId) {
    id
    members
    updatedAt
    unreadCount
    membersInfo {
      id
      firstName
      lastName
      avatar
    }
  }
}
    `;

/**
 * __useGetConversationsByMemberIdQuery__
 *
 * To run a query within a React component, call `useGetConversationsByMemberIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetConversationsByMemberIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetConversationsByMemberIdQuery({
 *   variables: {
 *      memberId: // value for 'memberId'
 *   },
 * });
 */
export function useGetConversationsByMemberIdQuery(baseOptions: Apollo.QueryHookOptions<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables> & ({ variables: GetConversationsByMemberIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables>(GetConversationsByMemberIdDocument, options);
      }
export function useGetConversationsByMemberIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables>(GetConversationsByMemberIdDocument, options);
        }
// @ts-ignore
export function useGetConversationsByMemberIdSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables>): Apollo.UseSuspenseQueryResult<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables>;
export function useGetConversationsByMemberIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables>): Apollo.UseSuspenseQueryResult<GetConversationsByMemberIdQuery | undefined, GetConversationsByMemberIdQueryVariables>;
export function useGetConversationsByMemberIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables>(GetConversationsByMemberIdDocument, options);
        }
export type GetConversationsByMemberIdQueryHookResult = ReturnType<typeof useGetConversationsByMemberIdQuery>;
export type GetConversationsByMemberIdLazyQueryHookResult = ReturnType<typeof useGetConversationsByMemberIdLazyQuery>;
export type GetConversationsByMemberIdSuspenseQueryHookResult = ReturnType<typeof useGetConversationsByMemberIdSuspenseQuery>;
export type GetConversationsByMemberIdQueryResult = Apollo.QueryResult<GetConversationsByMemberIdQuery, GetConversationsByMemberIdQueryVariables>;
export const GetMessagesByConversationIdDocument = gql`
    query GetMessagesByConversationId($conversationId: ID!) {
  getMessagesByConversationId(conversationId: $conversationId) {
    id
    conversationId
    senderId
    message
    imageUrls
    createdAt
    user {
      firstName
      lastName
      avatar
    }
  }
}
    `;

/**
 * __useGetMessagesByConversationIdQuery__
 *
 * To run a query within a React component, call `useGetMessagesByConversationIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMessagesByConversationIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMessagesByConversationIdQuery({
 *   variables: {
 *      conversationId: // value for 'conversationId'
 *   },
 * });
 */
export function useGetMessagesByConversationIdQuery(baseOptions: Apollo.QueryHookOptions<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables> & ({ variables: GetMessagesByConversationIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables>(GetMessagesByConversationIdDocument, options);
      }
export function useGetMessagesByConversationIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables>(GetMessagesByConversationIdDocument, options);
        }
// @ts-ignore
export function useGetMessagesByConversationIdSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables>): Apollo.UseSuspenseQueryResult<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables>;
export function useGetMessagesByConversationIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables>): Apollo.UseSuspenseQueryResult<GetMessagesByConversationIdQuery | undefined, GetMessagesByConversationIdQueryVariables>;
export function useGetMessagesByConversationIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables>(GetMessagesByConversationIdDocument, options);
        }
export type GetMessagesByConversationIdQueryHookResult = ReturnType<typeof useGetMessagesByConversationIdQuery>;
export type GetMessagesByConversationIdLazyQueryHookResult = ReturnType<typeof useGetMessagesByConversationIdLazyQuery>;
export type GetMessagesByConversationIdSuspenseQueryHookResult = ReturnType<typeof useGetMessagesByConversationIdSuspenseQuery>;
export type GetMessagesByConversationIdQueryResult = Apollo.QueryResult<GetMessagesByConversationIdQuery, GetMessagesByConversationIdQueryVariables>;
export const CreateMessageDocument = gql`
    mutation CreateMessage($conversationId: ID!, $senderId: ID!, $message: String, $imageUrls: [String!]) {
  createMessage(
    conversationId: $conversationId
    senderId: $senderId
    message: $message
    imageUrls: $imageUrls
  ) {
    id
    conversationId
    senderId
    message
    imageUrls
    createdAt
  }
}
    `;
export type CreateMessageMutationFn = Apollo.MutationFunction<CreateMessageMutation, CreateMessageMutationVariables>;

/**
 * __useCreateMessageMutation__
 *
 * To run a mutation, you first call `useCreateMessageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateMessageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createMessageMutation, { data, loading, error }] = useCreateMessageMutation({
 *   variables: {
 *      conversationId: // value for 'conversationId'
 *      senderId: // value for 'senderId'
 *      message: // value for 'message'
 *      imageUrls: // value for 'imageUrls'
 *   },
 * });
 */
export function useCreateMessageMutation(baseOptions?: Apollo.MutationHookOptions<CreateMessageMutation, CreateMessageMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateMessageMutation, CreateMessageMutationVariables>(CreateMessageDocument, options);
      }
export type CreateMessageMutationHookResult = ReturnType<typeof useCreateMessageMutation>;
export type CreateMessageMutationResult = Apollo.MutationResult<CreateMessageMutation>;
export type CreateMessageMutationOptions = Apollo.BaseMutationOptions<CreateMessageMutation, CreateMessageMutationVariables>;
export const MarkConversationReadDocument = gql`
    mutation MarkConversationRead($conversationId: ID!) {
  markConversationRead(conversationId: $conversationId) {
    id
    unreadCount
  }
}
    `;
export type MarkConversationReadMutationFn = Apollo.MutationFunction<MarkConversationReadMutation, MarkConversationReadMutationVariables>;

/**
 * __useMarkConversationReadMutation__
 *
 * To run a mutation, you first call `useMarkConversationReadMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkConversationReadMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markConversationReadMutation, { data, loading, error }] = useMarkConversationReadMutation({
 *   variables: {
 *      conversationId: // value for 'conversationId'
 *   },
 * });
 */
export function useMarkConversationReadMutation(baseOptions?: Apollo.MutationHookOptions<MarkConversationReadMutation, MarkConversationReadMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<MarkConversationReadMutation, MarkConversationReadMutationVariables>(MarkConversationReadDocument, options);
      }
export type MarkConversationReadMutationHookResult = ReturnType<typeof useMarkConversationReadMutation>;
export type MarkConversationReadMutationResult = Apollo.MutationResult<MarkConversationReadMutation>;
export type MarkConversationReadMutationOptions = Apollo.BaseMutationOptions<MarkConversationReadMutation, MarkConversationReadMutationVariables>;
export const MarkConversationUnreadDocument = gql`
    mutation MarkConversationUnread($conversationId: ID!) {
  markConversationUnread(conversationId: $conversationId) {
    id
    unreadCount
  }
}
    `;
export type MarkConversationUnreadMutationFn = Apollo.MutationFunction<MarkConversationUnreadMutation, MarkConversationUnreadMutationVariables>;

/**
 * __useMarkConversationUnreadMutation__
 *
 * To run a mutation, you first call `useMarkConversationUnreadMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkConversationUnreadMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markConversationUnreadMutation, { data, loading, error }] = useMarkConversationUnreadMutation({
 *   variables: {
 *      conversationId: // value for 'conversationId'
 *   },
 * });
 */
export function useMarkConversationUnreadMutation(baseOptions?: Apollo.MutationHookOptions<MarkConversationUnreadMutation, MarkConversationUnreadMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<MarkConversationUnreadMutation, MarkConversationUnreadMutationVariables>(MarkConversationUnreadDocument, options);
      }
export type MarkConversationUnreadMutationHookResult = ReturnType<typeof useMarkConversationUnreadMutation>;
export type MarkConversationUnreadMutationResult = Apollo.MutationResult<MarkConversationUnreadMutation>;
export type MarkConversationUnreadMutationOptions = Apollo.BaseMutationOptions<MarkConversationUnreadMutation, MarkConversationUnreadMutationVariables>;
export const GetUnreadMessageCountDocument = gql`
    query GetUnreadMessageCount {
  getUnreadMessageCount
}
    `;

/**
 * __useGetUnreadMessageCountQuery__
 *
 * To run a query within a React component, call `useGetUnreadMessageCountQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUnreadMessageCountQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUnreadMessageCountQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetUnreadMessageCountQuery(baseOptions?: Apollo.QueryHookOptions<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>(GetUnreadMessageCountDocument, options);
      }
export function useGetUnreadMessageCountLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>(GetUnreadMessageCountDocument, options);
        }
// @ts-ignore
export function useGetUnreadMessageCountSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>): Apollo.UseSuspenseQueryResult<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>;
export function useGetUnreadMessageCountSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>): Apollo.UseSuspenseQueryResult<GetUnreadMessageCountQuery | undefined, GetUnreadMessageCountQueryVariables>;
export function useGetUnreadMessageCountSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>(GetUnreadMessageCountDocument, options);
        }
export type GetUnreadMessageCountQueryHookResult = ReturnType<typeof useGetUnreadMessageCountQuery>;
export type GetUnreadMessageCountLazyQueryHookResult = ReturnType<typeof useGetUnreadMessageCountLazyQuery>;
export type GetUnreadMessageCountSuspenseQueryHookResult = ReturnType<typeof useGetUnreadMessageCountSuspenseQuery>;
export type GetUnreadMessageCountQueryResult = Apollo.QueryResult<GetUnreadMessageCountQuery, GetUnreadMessageCountQueryVariables>;
export const GetMyBookingSlugDocument = gql`
    query GetMyBookingSlug($artistId: ID!) {
  getArtist(artistId: $artistId) {
    id
    bookingSlug
  }
}
    `;

/**
 * __useGetMyBookingSlugQuery__
 *
 * To run a query within a React component, call `useGetMyBookingSlugQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMyBookingSlugQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMyBookingSlugQuery({
 *   variables: {
 *      artistId: // value for 'artistId'
 *   },
 * });
 */
export function useGetMyBookingSlugQuery(baseOptions: Apollo.QueryHookOptions<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables> & ({ variables: GetMyBookingSlugQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables>(GetMyBookingSlugDocument, options);
      }
export function useGetMyBookingSlugLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables>(GetMyBookingSlugDocument, options);
        }
// @ts-ignore
export function useGetMyBookingSlugSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables>;
export function useGetMyBookingSlugSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyBookingSlugQuery | undefined, GetMyBookingSlugQueryVariables>;
export function useGetMyBookingSlugSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables>(GetMyBookingSlugDocument, options);
        }
export type GetMyBookingSlugQueryHookResult = ReturnType<typeof useGetMyBookingSlugQuery>;
export type GetMyBookingSlugLazyQueryHookResult = ReturnType<typeof useGetMyBookingSlugLazyQuery>;
export type GetMyBookingSlugSuspenseQueryHookResult = ReturnType<typeof useGetMyBookingSlugSuspenseQuery>;
export type GetMyBookingSlugQueryResult = Apollo.QueryResult<GetMyBookingSlugQuery, GetMyBookingSlugQueryVariables>;
export const UpdateMyBookingSlugDocument = gql`
    mutation UpdateMyBookingSlug($slug: String!) {
  updateMyBookingSlug(slug: $slug) {
    id
    bookingSlug
  }
}
    `;
export type UpdateMyBookingSlugMutationFn = Apollo.MutationFunction<UpdateMyBookingSlugMutation, UpdateMyBookingSlugMutationVariables>;

/**
 * __useUpdateMyBookingSlugMutation__
 *
 * To run a mutation, you first call `useUpdateMyBookingSlugMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateMyBookingSlugMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateMyBookingSlugMutation, { data, loading, error }] = useUpdateMyBookingSlugMutation({
 *   variables: {
 *      slug: // value for 'slug'
 *   },
 * });
 */
export function useUpdateMyBookingSlugMutation(baseOptions?: Apollo.MutationHookOptions<UpdateMyBookingSlugMutation, UpdateMyBookingSlugMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateMyBookingSlugMutation, UpdateMyBookingSlugMutationVariables>(UpdateMyBookingSlugDocument, options);
      }
export type UpdateMyBookingSlugMutationHookResult = ReturnType<typeof useUpdateMyBookingSlugMutation>;
export type UpdateMyBookingSlugMutationResult = Apollo.MutationResult<UpdateMyBookingSlugMutation>;
export type UpdateMyBookingSlugMutationOptions = Apollo.BaseMutationOptions<UpdateMyBookingSlugMutation, UpdateMyBookingSlugMutationVariables>;
export const GetMyFormLinksDocument = gql`
    query GetMyFormLinks {
  getMyFormLinks {
    title
    slug
  }
}
    `;

/**
 * __useGetMyFormLinksQuery__
 *
 * To run a query within a React component, call `useGetMyFormLinksQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMyFormLinksQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMyFormLinksQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetMyFormLinksQuery(baseOptions?: Apollo.QueryHookOptions<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>(GetMyFormLinksDocument, options);
      }
export function useGetMyFormLinksLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>(GetMyFormLinksDocument, options);
        }
// @ts-ignore
export function useGetMyFormLinksSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>;
export function useGetMyFormLinksSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyFormLinksQuery | undefined, GetMyFormLinksQueryVariables>;
export function useGetMyFormLinksSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>(GetMyFormLinksDocument, options);
        }
export type GetMyFormLinksQueryHookResult = ReturnType<typeof useGetMyFormLinksQuery>;
export type GetMyFormLinksLazyQueryHookResult = ReturnType<typeof useGetMyFormLinksLazyQuery>;
export type GetMyFormLinksSuspenseQueryHookResult = ReturnType<typeof useGetMyFormLinksSuspenseQuery>;
export type GetMyFormLinksQueryResult = Apollo.QueryResult<GetMyFormLinksQuery, GetMyFormLinksQueryVariables>;
export const GetInboxDocument = gql`
    query GetInbox($includeRead: Boolean) {
  getInbox(includeRead: $includeRead) {
    unreadCount
    items {
      key
      type
      category
      subjectType
      subjectId
      title
      body
      amountCents
      createdAt
      readAt
      doneAt
      isCondition
    }
  }
}
    `;

/**
 * __useGetInboxQuery__
 *
 * To run a query within a React component, call `useGetInboxQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetInboxQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetInboxQuery({
 *   variables: {
 *      includeRead: // value for 'includeRead'
 *   },
 * });
 */
export function useGetInboxQuery(baseOptions?: Apollo.QueryHookOptions<GetInboxQuery, GetInboxQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetInboxQuery, GetInboxQueryVariables>(GetInboxDocument, options);
      }
export function useGetInboxLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetInboxQuery, GetInboxQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetInboxQuery, GetInboxQueryVariables>(GetInboxDocument, options);
        }
// @ts-ignore
export function useGetInboxSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetInboxQuery, GetInboxQueryVariables>): Apollo.UseSuspenseQueryResult<GetInboxQuery, GetInboxQueryVariables>;
export function useGetInboxSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetInboxQuery, GetInboxQueryVariables>): Apollo.UseSuspenseQueryResult<GetInboxQuery | undefined, GetInboxQueryVariables>;
export function useGetInboxSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetInboxQuery, GetInboxQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetInboxQuery, GetInboxQueryVariables>(GetInboxDocument, options);
        }
export type GetInboxQueryHookResult = ReturnType<typeof useGetInboxQuery>;
export type GetInboxLazyQueryHookResult = ReturnType<typeof useGetInboxLazyQuery>;
export type GetInboxSuspenseQueryHookResult = ReturnType<typeof useGetInboxSuspenseQuery>;
export type GetInboxQueryResult = Apollo.QueryResult<GetInboxQuery, GetInboxQueryVariables>;
export const MarkNotificationsReadDocument = gql`
    mutation MarkNotificationsRead($notificationIds: [ID!]) {
  markNotificationsRead(notificationIds: $notificationIds)
}
    `;
export type MarkNotificationsReadMutationFn = Apollo.MutationFunction<MarkNotificationsReadMutation, MarkNotificationsReadMutationVariables>;

/**
 * __useMarkNotificationsReadMutation__
 *
 * To run a mutation, you first call `useMarkNotificationsReadMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkNotificationsReadMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markNotificationsReadMutation, { data, loading, error }] = useMarkNotificationsReadMutation({
 *   variables: {
 *      notificationIds: // value for 'notificationIds'
 *   },
 * });
 */
export function useMarkNotificationsReadMutation(baseOptions?: Apollo.MutationHookOptions<MarkNotificationsReadMutation, MarkNotificationsReadMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<MarkNotificationsReadMutation, MarkNotificationsReadMutationVariables>(MarkNotificationsReadDocument, options);
      }
export type MarkNotificationsReadMutationHookResult = ReturnType<typeof useMarkNotificationsReadMutation>;
export type MarkNotificationsReadMutationResult = Apollo.MutationResult<MarkNotificationsReadMutation>;
export type MarkNotificationsReadMutationOptions = Apollo.BaseMutationOptions<MarkNotificationsReadMutation, MarkNotificationsReadMutationVariables>;
export const MarkNotificationsDoneDocument = gql`
    mutation MarkNotificationsDone($notificationIds: [ID!]!) {
  markNotificationsDone(notificationIds: $notificationIds)
}
    `;
export type MarkNotificationsDoneMutationFn = Apollo.MutationFunction<MarkNotificationsDoneMutation, MarkNotificationsDoneMutationVariables>;

/**
 * __useMarkNotificationsDoneMutation__
 *
 * To run a mutation, you first call `useMarkNotificationsDoneMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkNotificationsDoneMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markNotificationsDoneMutation, { data, loading, error }] = useMarkNotificationsDoneMutation({
 *   variables: {
 *      notificationIds: // value for 'notificationIds'
 *   },
 * });
 */
export function useMarkNotificationsDoneMutation(baseOptions?: Apollo.MutationHookOptions<MarkNotificationsDoneMutation, MarkNotificationsDoneMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<MarkNotificationsDoneMutation, MarkNotificationsDoneMutationVariables>(MarkNotificationsDoneDocument, options);
      }
export type MarkNotificationsDoneMutationHookResult = ReturnType<typeof useMarkNotificationsDoneMutation>;
export type MarkNotificationsDoneMutationResult = Apollo.MutationResult<MarkNotificationsDoneMutation>;
export type MarkNotificationsDoneMutationOptions = Apollo.BaseMutationOptions<MarkNotificationsDoneMutation, MarkNotificationsDoneMutationVariables>;
export const GetNotificationSettingsDocument = gql`
    query GetNotificationSettings {
  getNotificationSettings {
    prefs {
      moneyEmail
      scheduleEmail
      rosterEmail
      messageEmail
    }
    moneyMode
    scheduleMode
    rosterMode
    messageMode
    timezone
    digestHour
  }
}
    `;

/**
 * __useGetNotificationSettingsQuery__
 *
 * To run a query within a React component, call `useGetNotificationSettingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetNotificationSettingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetNotificationSettingsQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetNotificationSettingsQuery(baseOptions?: Apollo.QueryHookOptions<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>(GetNotificationSettingsDocument, options);
      }
export function useGetNotificationSettingsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>(GetNotificationSettingsDocument, options);
        }
// @ts-ignore
export function useGetNotificationSettingsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>;
export function useGetNotificationSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetNotificationSettingsQuery | undefined, GetNotificationSettingsQueryVariables>;
export function useGetNotificationSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>(GetNotificationSettingsDocument, options);
        }
export type GetNotificationSettingsQueryHookResult = ReturnType<typeof useGetNotificationSettingsQuery>;
export type GetNotificationSettingsLazyQueryHookResult = ReturnType<typeof useGetNotificationSettingsLazyQuery>;
export type GetNotificationSettingsSuspenseQueryHookResult = ReturnType<typeof useGetNotificationSettingsSuspenseQuery>;
export type GetNotificationSettingsQueryResult = Apollo.QueryResult<GetNotificationSettingsQuery, GetNotificationSettingsQueryVariables>;
export const UpdateNotificationSettingsDocument = gql`
    mutation UpdateNotificationSettings($prefs: NotificationPrefsInput, $timezone: String, $digestHour: Int) {
  updateNotificationSettings(
    prefs: $prefs
    timezone: $timezone
    digestHour: $digestHour
  ) {
    prefs {
      moneyEmail
      scheduleEmail
      rosterEmail
      messageEmail
    }
    moneyMode
    scheduleMode
    rosterMode
    messageMode
    timezone
    digestHour
  }
}
    `;
export type UpdateNotificationSettingsMutationFn = Apollo.MutationFunction<UpdateNotificationSettingsMutation, UpdateNotificationSettingsMutationVariables>;

/**
 * __useUpdateNotificationSettingsMutation__
 *
 * To run a mutation, you first call `useUpdateNotificationSettingsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateNotificationSettingsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateNotificationSettingsMutation, { data, loading, error }] = useUpdateNotificationSettingsMutation({
 *   variables: {
 *      prefs: // value for 'prefs'
 *      timezone: // value for 'timezone'
 *      digestHour: // value for 'digestHour'
 *   },
 * });
 */
export function useUpdateNotificationSettingsMutation(baseOptions?: Apollo.MutationHookOptions<UpdateNotificationSettingsMutation, UpdateNotificationSettingsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateNotificationSettingsMutation, UpdateNotificationSettingsMutationVariables>(UpdateNotificationSettingsDocument, options);
      }
export type UpdateNotificationSettingsMutationHookResult = ReturnType<typeof useUpdateNotificationSettingsMutation>;
export type UpdateNotificationSettingsMutationResult = Apollo.MutationResult<UpdateNotificationSettingsMutation>;
export type UpdateNotificationSettingsMutationOptions = Apollo.BaseMutationOptions<UpdateNotificationSettingsMutation, UpdateNotificationSettingsMutationVariables>;
export const RequestPasswordResetDocument = gql`
    mutation RequestPasswordReset($email: String!) {
  requestPasswordReset(email: $email)
}
    `;
export type RequestPasswordResetMutationFn = Apollo.MutationFunction<RequestPasswordResetMutation, RequestPasswordResetMutationVariables>;

/**
 * __useRequestPasswordResetMutation__
 *
 * To run a mutation, you first call `useRequestPasswordResetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRequestPasswordResetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [requestPasswordResetMutation, { data, loading, error }] = useRequestPasswordResetMutation({
 *   variables: {
 *      email: // value for 'email'
 *   },
 * });
 */
export function useRequestPasswordResetMutation(baseOptions?: Apollo.MutationHookOptions<RequestPasswordResetMutation, RequestPasswordResetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RequestPasswordResetMutation, RequestPasswordResetMutationVariables>(RequestPasswordResetDocument, options);
      }
export type RequestPasswordResetMutationHookResult = ReturnType<typeof useRequestPasswordResetMutation>;
export type RequestPasswordResetMutationResult = Apollo.MutationResult<RequestPasswordResetMutation>;
export type RequestPasswordResetMutationOptions = Apollo.BaseMutationOptions<RequestPasswordResetMutation, RequestPasswordResetMutationVariables>;
export const GetProjectDetailDocument = gql`
    query GetProjectDetail($projectId: ID!) {
  getProject(projectId: $projectId) {
    id
    title
    description
    placement
    size
    palette
    artistId
    artist {
      id
      billingType
      hourlyRate
      flatRate
      shop {
        id
        billingType
        hourlyRate
        flatRate
      }
    }
    clientId
    client {
      id
      firstName
      lastName
    }
    tags
    notes {
      id
      author
      note
      createdAt
      updatedAt
    }
    status
    depositCollectedCents
    depositAvailableCents
    deposits {
      id
      depositCents
      depositPaymentMethod
      depositCollectedAt
    }
    consultAppointment {
      id
      depositCents
      depositStatus
      depositPaymentMethod
      depositCollectedAt
    }
    referenceImages {
      ...ProjectImageFields
    }
    designImages {
      ...ProjectImageFields
    }
    bodyImages {
      ...ProjectImageFields
    }
  }
}
    ${ProjectImageFieldsFragmentDoc}`;

/**
 * __useGetProjectDetailQuery__
 *
 * To run a query within a React component, call `useGetProjectDetailQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProjectDetailQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProjectDetailQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *   },
 * });
 */
export function useGetProjectDetailQuery(baseOptions: Apollo.QueryHookOptions<GetProjectDetailQuery, GetProjectDetailQueryVariables> & ({ variables: GetProjectDetailQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProjectDetailQuery, GetProjectDetailQueryVariables>(GetProjectDetailDocument, options);
      }
export function useGetProjectDetailLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProjectDetailQuery, GetProjectDetailQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProjectDetailQuery, GetProjectDetailQueryVariables>(GetProjectDetailDocument, options);
        }
// @ts-ignore
export function useGetProjectDetailSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetProjectDetailQuery, GetProjectDetailQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectDetailQuery, GetProjectDetailQueryVariables>;
export function useGetProjectDetailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectDetailQuery, GetProjectDetailQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectDetailQuery | undefined, GetProjectDetailQueryVariables>;
export function useGetProjectDetailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectDetailQuery, GetProjectDetailQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetProjectDetailQuery, GetProjectDetailQueryVariables>(GetProjectDetailDocument, options);
        }
export type GetProjectDetailQueryHookResult = ReturnType<typeof useGetProjectDetailQuery>;
export type GetProjectDetailLazyQueryHookResult = ReturnType<typeof useGetProjectDetailLazyQuery>;
export type GetProjectDetailSuspenseQueryHookResult = ReturnType<typeof useGetProjectDetailSuspenseQuery>;
export type GetProjectDetailQueryResult = Apollo.QueryResult<GetProjectDetailQuery, GetProjectDetailQueryVariables>;
export const UpdateProjectDetailDocument = gql`
    mutation UpdateProjectDetail($project: ProjectInput) {
  updateProject(project: $project) {
    id
    title
    description
    placement
    size
    palette
    artistId
    clientId
    tags
    notes {
      id
      author
      note
      createdAt
      updatedAt
    }
    status
    depositCollectedCents
    depositAvailableCents
    referenceImages {
      ...ProjectImageFields
    }
    designImages {
      ...ProjectImageFields
    }
    bodyImages {
      ...ProjectImageFields
    }
  }
}
    ${ProjectImageFieldsFragmentDoc}`;
export type UpdateProjectDetailMutationFn = Apollo.MutationFunction<UpdateProjectDetailMutation, UpdateProjectDetailMutationVariables>;

/**
 * __useUpdateProjectDetailMutation__
 *
 * To run a mutation, you first call `useUpdateProjectDetailMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateProjectDetailMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateProjectDetailMutation, { data, loading, error }] = useUpdateProjectDetailMutation({
 *   variables: {
 *      project: // value for 'project'
 *   },
 * });
 */
export function useUpdateProjectDetailMutation(baseOptions?: Apollo.MutationHookOptions<UpdateProjectDetailMutation, UpdateProjectDetailMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateProjectDetailMutation, UpdateProjectDetailMutationVariables>(UpdateProjectDetailDocument, options);
      }
export type UpdateProjectDetailMutationHookResult = ReturnType<typeof useUpdateProjectDetailMutation>;
export type UpdateProjectDetailMutationResult = Apollo.MutationResult<UpdateProjectDetailMutation>;
export type UpdateProjectDetailMutationOptions = Apollo.BaseMutationOptions<UpdateProjectDetailMutation, UpdateProjectDetailMutationVariables>;
export const GetProjectsListDocument = gql`
    query GetProjectsList($page: PageInput) {
  getProjects(page: $page) {
    items {
      id
      title
      description
      status
      depositCollectedCents
      artistId
      artist {
        firstName
        lastName
        avatar
      }
      clientId
      client {
        firstName
        lastName
      }
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetProjectsListQuery__
 *
 * To run a query within a React component, call `useGetProjectsListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProjectsListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProjectsListQuery({
 *   variables: {
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetProjectsListQuery(baseOptions?: Apollo.QueryHookOptions<GetProjectsListQuery, GetProjectsListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProjectsListQuery, GetProjectsListQueryVariables>(GetProjectsListDocument, options);
      }
export function useGetProjectsListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProjectsListQuery, GetProjectsListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProjectsListQuery, GetProjectsListQueryVariables>(GetProjectsListDocument, options);
        }
// @ts-ignore
export function useGetProjectsListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetProjectsListQuery, GetProjectsListQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectsListQuery, GetProjectsListQueryVariables>;
export function useGetProjectsListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectsListQuery, GetProjectsListQueryVariables>): Apollo.UseSuspenseQueryResult<GetProjectsListQuery | undefined, GetProjectsListQueryVariables>;
export function useGetProjectsListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProjectsListQuery, GetProjectsListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetProjectsListQuery, GetProjectsListQueryVariables>(GetProjectsListDocument, options);
        }
export type GetProjectsListQueryHookResult = ReturnType<typeof useGetProjectsListQuery>;
export type GetProjectsListLazyQueryHookResult = ReturnType<typeof useGetProjectsListLazyQuery>;
export type GetProjectsListSuspenseQueryHookResult = ReturnType<typeof useGetProjectsListSuspenseQuery>;
export type GetProjectsListQueryResult = Apollo.QueryResult<GetProjectsListQuery, GetProjectsListQueryVariables>;
export const RegisterDeviceTokenDocument = gql`
    mutation RegisterDeviceToken($token: String!, $platform: String!) {
  registerDeviceToken(token: $token, platform: $platform)
}
    `;
export type RegisterDeviceTokenMutationFn = Apollo.MutationFunction<RegisterDeviceTokenMutation, RegisterDeviceTokenMutationVariables>;

/**
 * __useRegisterDeviceTokenMutation__
 *
 * To run a mutation, you first call `useRegisterDeviceTokenMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRegisterDeviceTokenMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [registerDeviceTokenMutation, { data, loading, error }] = useRegisterDeviceTokenMutation({
 *   variables: {
 *      token: // value for 'token'
 *      platform: // value for 'platform'
 *   },
 * });
 */
export function useRegisterDeviceTokenMutation(baseOptions?: Apollo.MutationHookOptions<RegisterDeviceTokenMutation, RegisterDeviceTokenMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RegisterDeviceTokenMutation, RegisterDeviceTokenMutationVariables>(RegisterDeviceTokenDocument, options);
      }
export type RegisterDeviceTokenMutationHookResult = ReturnType<typeof useRegisterDeviceTokenMutation>;
export type RegisterDeviceTokenMutationResult = Apollo.MutationResult<RegisterDeviceTokenMutation>;
export type RegisterDeviceTokenMutationOptions = Apollo.BaseMutationOptions<RegisterDeviceTokenMutation, RegisterDeviceTokenMutationVariables>;
export const UnregisterDeviceTokenDocument = gql`
    mutation UnregisterDeviceToken($token: String!) {
  unregisterDeviceToken(token: $token)
}
    `;
export type UnregisterDeviceTokenMutationFn = Apollo.MutationFunction<UnregisterDeviceTokenMutation, UnregisterDeviceTokenMutationVariables>;

/**
 * __useUnregisterDeviceTokenMutation__
 *
 * To run a mutation, you first call `useUnregisterDeviceTokenMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUnregisterDeviceTokenMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [unregisterDeviceTokenMutation, { data, loading, error }] = useUnregisterDeviceTokenMutation({
 *   variables: {
 *      token: // value for 'token'
 *   },
 * });
 */
export function useUnregisterDeviceTokenMutation(baseOptions?: Apollo.MutationHookOptions<UnregisterDeviceTokenMutation, UnregisterDeviceTokenMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UnregisterDeviceTokenMutation, UnregisterDeviceTokenMutationVariables>(UnregisterDeviceTokenDocument, options);
      }
export type UnregisterDeviceTokenMutationHookResult = ReturnType<typeof useUnregisterDeviceTokenMutation>;
export type UnregisterDeviceTokenMutationResult = Apollo.MutationResult<UnregisterDeviceTokenMutation>;
export type UnregisterDeviceTokenMutationOptions = Apollo.BaseMutationOptions<UnregisterDeviceTokenMutation, UnregisterDeviceTokenMutationVariables>;
export const GetMyRateSettingsDocument = gql`
    query GetMyRateSettings($artistId: ID!) {
  getArtist(artistId: $artistId) {
    id
    hourlyRate
    flatRate
    billingType
  }
}
    `;

/**
 * __useGetMyRateSettingsQuery__
 *
 * To run a query within a React component, call `useGetMyRateSettingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMyRateSettingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMyRateSettingsQuery({
 *   variables: {
 *      artistId: // value for 'artistId'
 *   },
 * });
 */
export function useGetMyRateSettingsQuery(baseOptions: Apollo.QueryHookOptions<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables> & ({ variables: GetMyRateSettingsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables>(GetMyRateSettingsDocument, options);
      }
export function useGetMyRateSettingsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables>(GetMyRateSettingsDocument, options);
        }
// @ts-ignore
export function useGetMyRateSettingsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables>;
export function useGetMyRateSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetMyRateSettingsQuery | undefined, GetMyRateSettingsQueryVariables>;
export function useGetMyRateSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables>(GetMyRateSettingsDocument, options);
        }
export type GetMyRateSettingsQueryHookResult = ReturnType<typeof useGetMyRateSettingsQuery>;
export type GetMyRateSettingsLazyQueryHookResult = ReturnType<typeof useGetMyRateSettingsLazyQuery>;
export type GetMyRateSettingsSuspenseQueryHookResult = ReturnType<typeof useGetMyRateSettingsSuspenseQuery>;
export type GetMyRateSettingsQueryResult = Apollo.QueryResult<GetMyRateSettingsQuery, GetMyRateSettingsQueryVariables>;
export const UpdateArtistRateSettingsDocument = gql`
    mutation UpdateArtistRateSettings($hourlyRate: Int, $flatRate: Int, $billingType: String!) {
  updateArtistRateSettings(
    hourlyRate: $hourlyRate
    flatRate: $flatRate
    billingType: $billingType
  ) {
    id
    hourlyRate
    flatRate
    billingType
  }
}
    `;
export type UpdateArtistRateSettingsMutationFn = Apollo.MutationFunction<UpdateArtistRateSettingsMutation, UpdateArtistRateSettingsMutationVariables>;

/**
 * __useUpdateArtistRateSettingsMutation__
 *
 * To run a mutation, you first call `useUpdateArtistRateSettingsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateArtistRateSettingsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateArtistRateSettingsMutation, { data, loading, error }] = useUpdateArtistRateSettingsMutation({
 *   variables: {
 *      hourlyRate: // value for 'hourlyRate'
 *      flatRate: // value for 'flatRate'
 *      billingType: // value for 'billingType'
 *   },
 * });
 */
export function useUpdateArtistRateSettingsMutation(baseOptions?: Apollo.MutationHookOptions<UpdateArtistRateSettingsMutation, UpdateArtistRateSettingsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateArtistRateSettingsMutation, UpdateArtistRateSettingsMutationVariables>(UpdateArtistRateSettingsDocument, options);
      }
export type UpdateArtistRateSettingsMutationHookResult = ReturnType<typeof useUpdateArtistRateSettingsMutation>;
export type UpdateArtistRateSettingsMutationResult = Apollo.MutationResult<UpdateArtistRateSettingsMutation>;
export type UpdateArtistRateSettingsMutationOptions = Apollo.BaseMutationOptions<UpdateArtistRateSettingsMutation, UpdateArtistRateSettingsMutationVariables>;
export const SetArtistShopRateSourceDocument = gql`
    mutation SetArtistShopRateSource($artistId: ID!, $shopId: ID!, $rateSource: String!) {
  setArtistShopRateSource(
    artistId: $artistId
    shopId: $shopId
    rateSource: $rateSource
  ) {
    id
    rateSource
  }
}
    `;
export type SetArtistShopRateSourceMutationFn = Apollo.MutationFunction<SetArtistShopRateSourceMutation, SetArtistShopRateSourceMutationVariables>;

/**
 * __useSetArtistShopRateSourceMutation__
 *
 * To run a mutation, you first call `useSetArtistShopRateSourceMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetArtistShopRateSourceMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setArtistShopRateSourceMutation, { data, loading, error }] = useSetArtistShopRateSourceMutation({
 *   variables: {
 *      artistId: // value for 'artistId'
 *      shopId: // value for 'shopId'
 *      rateSource: // value for 'rateSource'
 *   },
 * });
 */
export function useSetArtistShopRateSourceMutation(baseOptions?: Apollo.MutationHookOptions<SetArtistShopRateSourceMutation, SetArtistShopRateSourceMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetArtistShopRateSourceMutation, SetArtistShopRateSourceMutationVariables>(SetArtistShopRateSourceDocument, options);
      }
export type SetArtistShopRateSourceMutationHookResult = ReturnType<typeof useSetArtistShopRateSourceMutation>;
export type SetArtistShopRateSourceMutationResult = Apollo.MutationResult<SetArtistShopRateSourceMutation>;
export type SetArtistShopRateSourceMutationOptions = Apollo.BaseMutationOptions<SetArtistShopRateSourceMutation, SetArtistShopRateSourceMutationVariables>;
export const GetRecurringExpensesListDocument = gql`
    query GetRecurringExpensesList($shopId: ID, $artistUserId: ID, $includeInactive: Boolean) {
  getRecurringExpenses(
    shopId: $shopId
    artistUserId: $artistUserId
    includeInactive: $includeInactive
  ) {
    id
    expenseTypeId
    expenseType {
      id
      name
    }
    amountCents
    description
    frequency
    startDate
    nextRunDate
    endDate
    active
  }
}
    `;

/**
 * __useGetRecurringExpensesListQuery__
 *
 * To run a query within a React component, call `useGetRecurringExpensesListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetRecurringExpensesListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetRecurringExpensesListQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *      includeInactive: // value for 'includeInactive'
 *   },
 * });
 */
export function useGetRecurringExpensesListQuery(baseOptions?: Apollo.QueryHookOptions<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>(GetRecurringExpensesListDocument, options);
      }
export function useGetRecurringExpensesListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>(GetRecurringExpensesListDocument, options);
        }
// @ts-ignore
export function useGetRecurringExpensesListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>;
export function useGetRecurringExpensesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>): Apollo.UseSuspenseQueryResult<GetRecurringExpensesListQuery | undefined, GetRecurringExpensesListQueryVariables>;
export function useGetRecurringExpensesListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>(GetRecurringExpensesListDocument, options);
        }
export type GetRecurringExpensesListQueryHookResult = ReturnType<typeof useGetRecurringExpensesListQuery>;
export type GetRecurringExpensesListLazyQueryHookResult = ReturnType<typeof useGetRecurringExpensesListLazyQuery>;
export type GetRecurringExpensesListSuspenseQueryHookResult = ReturnType<typeof useGetRecurringExpensesListSuspenseQuery>;
export type GetRecurringExpensesListQueryResult = Apollo.QueryResult<GetRecurringExpensesListQuery, GetRecurringExpensesListQueryVariables>;
export const CreateRecurringExpenseDocument = gql`
    mutation CreateRecurringExpense($input: CreateRecurringExpenseInput!) {
  createRecurringExpense(input: $input) {
    id
  }
}
    `;
export type CreateRecurringExpenseMutationFn = Apollo.MutationFunction<CreateRecurringExpenseMutation, CreateRecurringExpenseMutationVariables>;

/**
 * __useCreateRecurringExpenseMutation__
 *
 * To run a mutation, you first call `useCreateRecurringExpenseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateRecurringExpenseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createRecurringExpenseMutation, { data, loading, error }] = useCreateRecurringExpenseMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateRecurringExpenseMutation(baseOptions?: Apollo.MutationHookOptions<CreateRecurringExpenseMutation, CreateRecurringExpenseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateRecurringExpenseMutation, CreateRecurringExpenseMutationVariables>(CreateRecurringExpenseDocument, options);
      }
export type CreateRecurringExpenseMutationHookResult = ReturnType<typeof useCreateRecurringExpenseMutation>;
export type CreateRecurringExpenseMutationResult = Apollo.MutationResult<CreateRecurringExpenseMutation>;
export type CreateRecurringExpenseMutationOptions = Apollo.BaseMutationOptions<CreateRecurringExpenseMutation, CreateRecurringExpenseMutationVariables>;
export const UpdateRecurringExpenseDocument = gql`
    mutation UpdateRecurringExpense($input: UpdateRecurringExpenseInput!) {
  updateRecurringExpense(input: $input) {
    id
    active
  }
}
    `;
export type UpdateRecurringExpenseMutationFn = Apollo.MutationFunction<UpdateRecurringExpenseMutation, UpdateRecurringExpenseMutationVariables>;

/**
 * __useUpdateRecurringExpenseMutation__
 *
 * To run a mutation, you first call `useUpdateRecurringExpenseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateRecurringExpenseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateRecurringExpenseMutation, { data, loading, error }] = useUpdateRecurringExpenseMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateRecurringExpenseMutation(baseOptions?: Apollo.MutationHookOptions<UpdateRecurringExpenseMutation, UpdateRecurringExpenseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateRecurringExpenseMutation, UpdateRecurringExpenseMutationVariables>(UpdateRecurringExpenseDocument, options);
      }
export type UpdateRecurringExpenseMutationHookResult = ReturnType<typeof useUpdateRecurringExpenseMutation>;
export type UpdateRecurringExpenseMutationResult = Apollo.MutationResult<UpdateRecurringExpenseMutation>;
export type UpdateRecurringExpenseMutationOptions = Apollo.BaseMutationOptions<UpdateRecurringExpenseMutation, UpdateRecurringExpenseMutationVariables>;
export const DeleteRecurringExpenseDocument = gql`
    mutation DeleteRecurringExpense($recurringExpenseId: ID!) {
  deleteRecurringExpense(recurringExpenseId: $recurringExpenseId)
}
    `;
export type DeleteRecurringExpenseMutationFn = Apollo.MutationFunction<DeleteRecurringExpenseMutation, DeleteRecurringExpenseMutationVariables>;

/**
 * __useDeleteRecurringExpenseMutation__
 *
 * To run a mutation, you first call `useDeleteRecurringExpenseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteRecurringExpenseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteRecurringExpenseMutation, { data, loading, error }] = useDeleteRecurringExpenseMutation({
 *   variables: {
 *      recurringExpenseId: // value for 'recurringExpenseId'
 *   },
 * });
 */
export function useDeleteRecurringExpenseMutation(baseOptions?: Apollo.MutationHookOptions<DeleteRecurringExpenseMutation, DeleteRecurringExpenseMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteRecurringExpenseMutation, DeleteRecurringExpenseMutationVariables>(DeleteRecurringExpenseDocument, options);
      }
export type DeleteRecurringExpenseMutationHookResult = ReturnType<typeof useDeleteRecurringExpenseMutation>;
export type DeleteRecurringExpenseMutationResult = Apollo.MutationResult<DeleteRecurringExpenseMutation>;
export type DeleteRecurringExpenseMutationOptions = Apollo.BaseMutationOptions<DeleteRecurringExpenseMutation, DeleteRecurringExpenseMutationVariables>;
export const RegisterAccountDocument = gql`
    mutation RegisterAccount($input: RegisterAccountInput!) {
  registerAccount(input: $input) {
    id
    email
    firstName
    lastName
    avatar
    role
    userType
    tagColor
    themePreference
    accessToken
    firebaseToken
    userInfo {
      ... on Artist {
        id
        firstName
        lastName
        avatar
        hourlyRate
        shop {
          id
          name
          website
        }
      }
      ... on Client {
        id
        firstName
        lastName
        avatar
      }
      ... on Staff {
        id
        firstName
        lastName
        avatar
        title
        shop {
          id
          name
        }
      }
    }
  }
}
    `;
export type RegisterAccountMutationFn = Apollo.MutationFunction<RegisterAccountMutation, RegisterAccountMutationVariables>;

/**
 * __useRegisterAccountMutation__
 *
 * To run a mutation, you first call `useRegisterAccountMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRegisterAccountMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [registerAccountMutation, { data, loading, error }] = useRegisterAccountMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useRegisterAccountMutation(baseOptions?: Apollo.MutationHookOptions<RegisterAccountMutation, RegisterAccountMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RegisterAccountMutation, RegisterAccountMutationVariables>(RegisterAccountDocument, options);
      }
export type RegisterAccountMutationHookResult = ReturnType<typeof useRegisterAccountMutation>;
export type RegisterAccountMutationResult = Apollo.MutationResult<RegisterAccountMutation>;
export type RegisterAccountMutationOptions = Apollo.BaseMutationOptions<RegisterAccountMutation, RegisterAccountMutationVariables>;
export const GetReminderSettingsDocument = gql`
    query GetReminderSettings {
  getReminderSettings {
    emailEnabled
    smsEnabled
    rules {
      id
      offsetMinutes
      enabled
    }
    emailSubjectTemplate
    emailBodyTemplate
    smsTemplate
  }
}
    `;

/**
 * __useGetReminderSettingsQuery__
 *
 * To run a query within a React component, call `useGetReminderSettingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetReminderSettingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetReminderSettingsQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetReminderSettingsQuery(baseOptions?: Apollo.QueryHookOptions<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>(GetReminderSettingsDocument, options);
      }
export function useGetReminderSettingsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>(GetReminderSettingsDocument, options);
        }
// @ts-ignore
export function useGetReminderSettingsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>;
export function useGetReminderSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetReminderSettingsQuery | undefined, GetReminderSettingsQueryVariables>;
export function useGetReminderSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>(GetReminderSettingsDocument, options);
        }
export type GetReminderSettingsQueryHookResult = ReturnType<typeof useGetReminderSettingsQuery>;
export type GetReminderSettingsLazyQueryHookResult = ReturnType<typeof useGetReminderSettingsLazyQuery>;
export type GetReminderSettingsSuspenseQueryHookResult = ReturnType<typeof useGetReminderSettingsSuspenseQuery>;
export type GetReminderSettingsQueryResult = Apollo.QueryResult<GetReminderSettingsQuery, GetReminderSettingsQueryVariables>;
export const UpdateReminderSettingsDocument = gql`
    mutation UpdateReminderSettings($emailEnabled: Boolean, $smsEnabled: Boolean, $rules: [ReminderRuleInput!], $emailSubjectTemplate: String, $emailBodyTemplate: String, $smsTemplate: String) {
  updateReminderSettings(
    emailEnabled: $emailEnabled
    smsEnabled: $smsEnabled
    rules: $rules
    emailSubjectTemplate: $emailSubjectTemplate
    emailBodyTemplate: $emailBodyTemplate
    smsTemplate: $smsTemplate
  ) {
    emailEnabled
    smsEnabled
    rules {
      id
      offsetMinutes
      enabled
    }
    emailSubjectTemplate
    emailBodyTemplate
    smsTemplate
  }
}
    `;
export type UpdateReminderSettingsMutationFn = Apollo.MutationFunction<UpdateReminderSettingsMutation, UpdateReminderSettingsMutationVariables>;

/**
 * __useUpdateReminderSettingsMutation__
 *
 * To run a mutation, you first call `useUpdateReminderSettingsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateReminderSettingsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateReminderSettingsMutation, { data, loading, error }] = useUpdateReminderSettingsMutation({
 *   variables: {
 *      emailEnabled: // value for 'emailEnabled'
 *      smsEnabled: // value for 'smsEnabled'
 *      rules: // value for 'rules'
 *      emailSubjectTemplate: // value for 'emailSubjectTemplate'
 *      emailBodyTemplate: // value for 'emailBodyTemplate'
 *      smsTemplate: // value for 'smsTemplate'
 *   },
 * });
 */
export function useUpdateReminderSettingsMutation(baseOptions?: Apollo.MutationHookOptions<UpdateReminderSettingsMutation, UpdateReminderSettingsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateReminderSettingsMutation, UpdateReminderSettingsMutationVariables>(UpdateReminderSettingsDocument, options);
      }
export type UpdateReminderSettingsMutationHookResult = ReturnType<typeof useUpdateReminderSettingsMutation>;
export type UpdateReminderSettingsMutationResult = Apollo.MutationResult<UpdateReminderSettingsMutation>;
export type UpdateReminderSettingsMutationOptions = Apollo.BaseMutationOptions<UpdateReminderSettingsMutation, UpdateReminderSettingsMutationVariables>;
export const GetResponseTimeSettingsDocument = gql`
    query GetResponseTimeSettings($shopId: ID, $artistUserId: ID) {
  getResponseTimeSettings(shopId: $shopId, artistUserId: $artistUserId) {
    id
    shopId
    artistUserId
    initialThresholdMinutes
    repeatIntervalMinutes
    shopCeiling {
      initialThresholdMinutes
      repeatIntervalMinutes
    }
  }
}
    `;

/**
 * __useGetResponseTimeSettingsQuery__
 *
 * To run a query within a React component, call `useGetResponseTimeSettingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetResponseTimeSettingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetResponseTimeSettingsQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *   },
 * });
 */
export function useGetResponseTimeSettingsQuery(baseOptions?: Apollo.QueryHookOptions<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>(GetResponseTimeSettingsDocument, options);
      }
export function useGetResponseTimeSettingsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>(GetResponseTimeSettingsDocument, options);
        }
// @ts-ignore
export function useGetResponseTimeSettingsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>;
export function useGetResponseTimeSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetResponseTimeSettingsQuery | undefined, GetResponseTimeSettingsQueryVariables>;
export function useGetResponseTimeSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>(GetResponseTimeSettingsDocument, options);
        }
export type GetResponseTimeSettingsQueryHookResult = ReturnType<typeof useGetResponseTimeSettingsQuery>;
export type GetResponseTimeSettingsLazyQueryHookResult = ReturnType<typeof useGetResponseTimeSettingsLazyQuery>;
export type GetResponseTimeSettingsSuspenseQueryHookResult = ReturnType<typeof useGetResponseTimeSettingsSuspenseQuery>;
export type GetResponseTimeSettingsQueryResult = Apollo.QueryResult<GetResponseTimeSettingsQuery, GetResponseTimeSettingsQueryVariables>;
export const UpdateResponseTimeSettingsDocument = gql`
    mutation UpdateResponseTimeSettings($input: UpdateResponseTimeSettingsInput!) {
  updateResponseTimeSettings(input: $input) {
    id
    shopId
    artistUserId
    initialThresholdMinutes
    repeatIntervalMinutes
    shopCeiling {
      initialThresholdMinutes
      repeatIntervalMinutes
    }
  }
}
    `;
export type UpdateResponseTimeSettingsMutationFn = Apollo.MutationFunction<UpdateResponseTimeSettingsMutation, UpdateResponseTimeSettingsMutationVariables>;

/**
 * __useUpdateResponseTimeSettingsMutation__
 *
 * To run a mutation, you first call `useUpdateResponseTimeSettingsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateResponseTimeSettingsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateResponseTimeSettingsMutation, { data, loading, error }] = useUpdateResponseTimeSettingsMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateResponseTimeSettingsMutation(baseOptions?: Apollo.MutationHookOptions<UpdateResponseTimeSettingsMutation, UpdateResponseTimeSettingsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateResponseTimeSettingsMutation, UpdateResponseTimeSettingsMutationVariables>(UpdateResponseTimeSettingsDocument, options);
      }
export type UpdateResponseTimeSettingsMutationHookResult = ReturnType<typeof useUpdateResponseTimeSettingsMutation>;
export type UpdateResponseTimeSettingsMutationResult = Apollo.MutationResult<UpdateResponseTimeSettingsMutation>;
export type UpdateResponseTimeSettingsMutationOptions = Apollo.BaseMutationOptions<UpdateResponseTimeSettingsMutation, UpdateResponseTimeSettingsMutationVariables>;
export const UpdateSessionDetailsDocument = gql`
    mutation UpdateSessionDetails($appointmentInput: AppointmentInput) {
  updateAppointment(appointmentInput: $appointmentInput) {
    id
    appointmentDate
    durationMinutes
    appointmentEnd
    subtotalCents
    taxCents
    feeCents
    tipCents
    totalCents
    shopCutCents
    shopCutStatus
    shopCutPercentApplied
    sessionNotes
    appointmentStatus
    depositCreditCents
    timerStatus
    timerStartedAt
    accumulatedSeconds
    adjustments {
      id
      amountCents
      reason
      createdAt
      createdBy {
        id
        firstName
        lastName
      }
    }
  }
}
    `;
export type UpdateSessionDetailsMutationFn = Apollo.MutationFunction<UpdateSessionDetailsMutation, UpdateSessionDetailsMutationVariables>;

/**
 * __useUpdateSessionDetailsMutation__
 *
 * To run a mutation, you first call `useUpdateSessionDetailsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateSessionDetailsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateSessionDetailsMutation, { data, loading, error }] = useUpdateSessionDetailsMutation({
 *   variables: {
 *      appointmentInput: // value for 'appointmentInput'
 *   },
 * });
 */
export function useUpdateSessionDetailsMutation(baseOptions?: Apollo.MutationHookOptions<UpdateSessionDetailsMutation, UpdateSessionDetailsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateSessionDetailsMutation, UpdateSessionDetailsMutationVariables>(UpdateSessionDetailsDocument, options);
      }
export type UpdateSessionDetailsMutationHookResult = ReturnType<typeof useUpdateSessionDetailsMutation>;
export type UpdateSessionDetailsMutationResult = Apollo.MutationResult<UpdateSessionDetailsMutation>;
export type UpdateSessionDetailsMutationOptions = Apollo.BaseMutationOptions<UpdateSessionDetailsMutation, UpdateSessionDetailsMutationVariables>;
export const StartSessionTimerDocument = gql`
    mutation StartSessionTimer($appointmentId: ID!) {
  startSessionTimer(appointmentId: $appointmentId) {
    id
    timerStatus
    timerStartedAt
    accumulatedSeconds
  }
}
    `;
export type StartSessionTimerMutationFn = Apollo.MutationFunction<StartSessionTimerMutation, StartSessionTimerMutationVariables>;

/**
 * __useStartSessionTimerMutation__
 *
 * To run a mutation, you first call `useStartSessionTimerMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useStartSessionTimerMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [startSessionTimerMutation, { data, loading, error }] = useStartSessionTimerMutation({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *   },
 * });
 */
export function useStartSessionTimerMutation(baseOptions?: Apollo.MutationHookOptions<StartSessionTimerMutation, StartSessionTimerMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<StartSessionTimerMutation, StartSessionTimerMutationVariables>(StartSessionTimerDocument, options);
      }
export type StartSessionTimerMutationHookResult = ReturnType<typeof useStartSessionTimerMutation>;
export type StartSessionTimerMutationResult = Apollo.MutationResult<StartSessionTimerMutation>;
export type StartSessionTimerMutationOptions = Apollo.BaseMutationOptions<StartSessionTimerMutation, StartSessionTimerMutationVariables>;
export const StopSessionTimerDocument = gql`
    mutation StopSessionTimer($appointmentId: ID!) {
  stopSessionTimer(appointmentId: $appointmentId) {
    id
    timerStatus
    timerStartedAt
    accumulatedSeconds
  }
}
    `;
export type StopSessionTimerMutationFn = Apollo.MutationFunction<StopSessionTimerMutation, StopSessionTimerMutationVariables>;

/**
 * __useStopSessionTimerMutation__
 *
 * To run a mutation, you first call `useStopSessionTimerMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useStopSessionTimerMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [stopSessionTimerMutation, { data, loading, error }] = useStopSessionTimerMutation({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *   },
 * });
 */
export function useStopSessionTimerMutation(baseOptions?: Apollo.MutationHookOptions<StopSessionTimerMutation, StopSessionTimerMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<StopSessionTimerMutation, StopSessionTimerMutationVariables>(StopSessionTimerDocument, options);
      }
export type StopSessionTimerMutationHookResult = ReturnType<typeof useStopSessionTimerMutation>;
export type StopSessionTimerMutationResult = Apollo.MutationResult<StopSessionTimerMutation>;
export type StopSessionTimerMutationOptions = Apollo.BaseMutationOptions<StopSessionTimerMutation, StopSessionTimerMutationVariables>;
export const ResetSessionTimerDocument = gql`
    mutation ResetSessionTimer($appointmentId: ID!) {
  resetSessionTimer(appointmentId: $appointmentId) {
    id
    timerStatus
    timerStartedAt
    accumulatedSeconds
  }
}
    `;
export type ResetSessionTimerMutationFn = Apollo.MutationFunction<ResetSessionTimerMutation, ResetSessionTimerMutationVariables>;

/**
 * __useResetSessionTimerMutation__
 *
 * To run a mutation, you first call `useResetSessionTimerMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useResetSessionTimerMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [resetSessionTimerMutation, { data, loading, error }] = useResetSessionTimerMutation({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *   },
 * });
 */
export function useResetSessionTimerMutation(baseOptions?: Apollo.MutationHookOptions<ResetSessionTimerMutation, ResetSessionTimerMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ResetSessionTimerMutation, ResetSessionTimerMutationVariables>(ResetSessionTimerDocument, options);
      }
export type ResetSessionTimerMutationHookResult = ReturnType<typeof useResetSessionTimerMutation>;
export type ResetSessionTimerMutationResult = Apollo.MutationResult<ResetSessionTimerMutation>;
export type ResetSessionTimerMutationOptions = Apollo.BaseMutationOptions<ResetSessionTimerMutation, ResetSessionTimerMutationVariables>;
export const GetSharedImagesForClientDocument = gql`
    query GetSharedImagesForClient($clientId: ID!) {
  getSharedImagesForClient(clientId: $clientId) {
    id
    url
    userInfo {
      id
      firstName
      lastName
      avatar
    }
    tags
    assignedProjectId
    assignedImageType
    assignedProject {
      id
      title
    }
    createdAt
  }
}
    `;

/**
 * __useGetSharedImagesForClientQuery__
 *
 * To run a query within a React component, call `useGetSharedImagesForClientQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetSharedImagesForClientQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetSharedImagesForClientQuery({
 *   variables: {
 *      clientId: // value for 'clientId'
 *   },
 * });
 */
export function useGetSharedImagesForClientQuery(baseOptions: Apollo.QueryHookOptions<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables> & ({ variables: GetSharedImagesForClientQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables>(GetSharedImagesForClientDocument, options);
      }
export function useGetSharedImagesForClientLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables>(GetSharedImagesForClientDocument, options);
        }
// @ts-ignore
export function useGetSharedImagesForClientSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables>): Apollo.UseSuspenseQueryResult<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables>;
export function useGetSharedImagesForClientSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables>): Apollo.UseSuspenseQueryResult<GetSharedImagesForClientQuery | undefined, GetSharedImagesForClientQueryVariables>;
export function useGetSharedImagesForClientSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables>(GetSharedImagesForClientDocument, options);
        }
export type GetSharedImagesForClientQueryHookResult = ReturnType<typeof useGetSharedImagesForClientQuery>;
export type GetSharedImagesForClientLazyQueryHookResult = ReturnType<typeof useGetSharedImagesForClientLazyQuery>;
export type GetSharedImagesForClientSuspenseQueryHookResult = ReturnType<typeof useGetSharedImagesForClientSuspenseQuery>;
export type GetSharedImagesForClientQueryResult = Apollo.QueryResult<GetSharedImagesForClientQuery, GetSharedImagesForClientQueryVariables>;
export const GetPendingShopCutConfirmationsDocument = gql`
    query GetPendingShopCutConfirmations($shopId: ID!) {
  getPendingShopCutConfirmations(shopId: $shopId) {
    id
    appointmentDate
    title
    shopCutCents
    shopCutMarkedPaidAt
    user {
      id
      firstName
      lastName
      avatar
      tagColor
    }
  }
}
    `;

/**
 * __useGetPendingShopCutConfirmationsQuery__
 *
 * To run a query within a React component, call `useGetPendingShopCutConfirmationsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPendingShopCutConfirmationsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPendingShopCutConfirmationsQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useGetPendingShopCutConfirmationsQuery(baseOptions: Apollo.QueryHookOptions<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables> & ({ variables: GetPendingShopCutConfirmationsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables>(GetPendingShopCutConfirmationsDocument, options);
      }
export function useGetPendingShopCutConfirmationsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables>(GetPendingShopCutConfirmationsDocument, options);
        }
// @ts-ignore
export function useGetPendingShopCutConfirmationsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables>): Apollo.UseSuspenseQueryResult<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables>;
export function useGetPendingShopCutConfirmationsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables>): Apollo.UseSuspenseQueryResult<GetPendingShopCutConfirmationsQuery | undefined, GetPendingShopCutConfirmationsQueryVariables>;
export function useGetPendingShopCutConfirmationsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables>(GetPendingShopCutConfirmationsDocument, options);
        }
export type GetPendingShopCutConfirmationsQueryHookResult = ReturnType<typeof useGetPendingShopCutConfirmationsQuery>;
export type GetPendingShopCutConfirmationsLazyQueryHookResult = ReturnType<typeof useGetPendingShopCutConfirmationsLazyQuery>;
export type GetPendingShopCutConfirmationsSuspenseQueryHookResult = ReturnType<typeof useGetPendingShopCutConfirmationsSuspenseQuery>;
export type GetPendingShopCutConfirmationsQueryResult = Apollo.QueryResult<GetPendingShopCutConfirmationsQuery, GetPendingShopCutConfirmationsQueryVariables>;
export const ConfirmShopCutPaidDocument = gql`
    mutation ConfirmShopCutPaid($appointmentId: ID!) {
  confirmShopCutPaid(appointmentId: $appointmentId) {
    id
    shopCutStatus
    shopCutConfirmedAt
  }
}
    `;
export type ConfirmShopCutPaidMutationFn = Apollo.MutationFunction<ConfirmShopCutPaidMutation, ConfirmShopCutPaidMutationVariables>;

/**
 * __useConfirmShopCutPaidMutation__
 *
 * To run a mutation, you first call `useConfirmShopCutPaidMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useConfirmShopCutPaidMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [confirmShopCutPaidMutation, { data, loading, error }] = useConfirmShopCutPaidMutation({
 *   variables: {
 *      appointmentId: // value for 'appointmentId'
 *   },
 * });
 */
export function useConfirmShopCutPaidMutation(baseOptions?: Apollo.MutationHookOptions<ConfirmShopCutPaidMutation, ConfirmShopCutPaidMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ConfirmShopCutPaidMutation, ConfirmShopCutPaidMutationVariables>(ConfirmShopCutPaidDocument, options);
      }
export type ConfirmShopCutPaidMutationHookResult = ReturnType<typeof useConfirmShopCutPaidMutation>;
export type ConfirmShopCutPaidMutationResult = Apollo.MutationResult<ConfirmShopCutPaidMutation>;
export type ConfirmShopCutPaidMutationOptions = Apollo.BaseMutationOptions<ConfirmShopCutPaidMutation, ConfirmShopCutPaidMutationVariables>;
export const GetShopCutRatesDocument = gql`
    query GetShopCutRates($artistId: ID!, $shopId: ID!) {
  getShopCutRates(artistId: $artistId, shopId: $shopId) {
    id
    artistId
    shopId
    percent
    compensationModel
    effectiveFrom
    setByUserId
    note
    createdAt
  }
}
    `;

/**
 * __useGetShopCutRatesQuery__
 *
 * To run a query within a React component, call `useGetShopCutRatesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetShopCutRatesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetShopCutRatesQuery({
 *   variables: {
 *      artistId: // value for 'artistId'
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useGetShopCutRatesQuery(baseOptions: Apollo.QueryHookOptions<GetShopCutRatesQuery, GetShopCutRatesQueryVariables> & ({ variables: GetShopCutRatesQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetShopCutRatesQuery, GetShopCutRatesQueryVariables>(GetShopCutRatesDocument, options);
      }
export function useGetShopCutRatesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetShopCutRatesQuery, GetShopCutRatesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetShopCutRatesQuery, GetShopCutRatesQueryVariables>(GetShopCutRatesDocument, options);
        }
// @ts-ignore
export function useGetShopCutRatesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetShopCutRatesQuery, GetShopCutRatesQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopCutRatesQuery, GetShopCutRatesQueryVariables>;
export function useGetShopCutRatesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopCutRatesQuery, GetShopCutRatesQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopCutRatesQuery | undefined, GetShopCutRatesQueryVariables>;
export function useGetShopCutRatesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopCutRatesQuery, GetShopCutRatesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetShopCutRatesQuery, GetShopCutRatesQueryVariables>(GetShopCutRatesDocument, options);
        }
export type GetShopCutRatesQueryHookResult = ReturnType<typeof useGetShopCutRatesQuery>;
export type GetShopCutRatesLazyQueryHookResult = ReturnType<typeof useGetShopCutRatesLazyQuery>;
export type GetShopCutRatesSuspenseQueryHookResult = ReturnType<typeof useGetShopCutRatesSuspenseQuery>;
export type GetShopCutRatesQueryResult = Apollo.QueryResult<GetShopCutRatesQuery, GetShopCutRatesQueryVariables>;
export const SetShopCutRateDocument = gql`
    mutation SetShopCutRate($artistId: ID!, $shopId: ID!, $percent: Int!, $compensationModel: String, $effectiveFrom: DateTime, $note: String) {
  setShopCutRate(
    artistId: $artistId
    shopId: $shopId
    percent: $percent
    compensationModel: $compensationModel
    effectiveFrom: $effectiveFrom
    note: $note
  ) {
    id
    artistId
    shopId
    percent
    compensationModel
    effectiveFrom
    setByUserId
    note
    createdAt
  }
}
    `;
export type SetShopCutRateMutationFn = Apollo.MutationFunction<SetShopCutRateMutation, SetShopCutRateMutationVariables>;

/**
 * __useSetShopCutRateMutation__
 *
 * To run a mutation, you first call `useSetShopCutRateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetShopCutRateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setShopCutRateMutation, { data, loading, error }] = useSetShopCutRateMutation({
 *   variables: {
 *      artistId: // value for 'artistId'
 *      shopId: // value for 'shopId'
 *      percent: // value for 'percent'
 *      compensationModel: // value for 'compensationModel'
 *      effectiveFrom: // value for 'effectiveFrom'
 *      note: // value for 'note'
 *   },
 * });
 */
export function useSetShopCutRateMutation(baseOptions?: Apollo.MutationHookOptions<SetShopCutRateMutation, SetShopCutRateMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetShopCutRateMutation, SetShopCutRateMutationVariables>(SetShopCutRateDocument, options);
      }
export type SetShopCutRateMutationHookResult = ReturnType<typeof useSetShopCutRateMutation>;
export type SetShopCutRateMutationResult = Apollo.MutationResult<SetShopCutRateMutation>;
export type SetShopCutRateMutationOptions = Apollo.BaseMutationOptions<SetShopCutRateMutation, SetShopCutRateMutationVariables>;
export const GetShopsListDocument = gql`
    query GetShopsList {
  getShops {
    id
    name
    email
    phone
    website
    logo
    address
    city
    state
    hourlyRate
    shopMinimum
  }
}
    `;

/**
 * __useGetShopsListQuery__
 *
 * To run a query within a React component, call `useGetShopsListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetShopsListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetShopsListQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetShopsListQuery(baseOptions?: Apollo.QueryHookOptions<GetShopsListQuery, GetShopsListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetShopsListQuery, GetShopsListQueryVariables>(GetShopsListDocument, options);
      }
export function useGetShopsListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetShopsListQuery, GetShopsListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetShopsListQuery, GetShopsListQueryVariables>(GetShopsListDocument, options);
        }
// @ts-ignore
export function useGetShopsListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetShopsListQuery, GetShopsListQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopsListQuery, GetShopsListQueryVariables>;
export function useGetShopsListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopsListQuery, GetShopsListQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopsListQuery | undefined, GetShopsListQueryVariables>;
export function useGetShopsListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopsListQuery, GetShopsListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetShopsListQuery, GetShopsListQueryVariables>(GetShopsListDocument, options);
        }
export type GetShopsListQueryHookResult = ReturnType<typeof useGetShopsListQuery>;
export type GetShopsListLazyQueryHookResult = ReturnType<typeof useGetShopsListLazyQuery>;
export type GetShopsListSuspenseQueryHookResult = ReturnType<typeof useGetShopsListSuspenseQuery>;
export type GetShopsListQueryResult = Apollo.QueryResult<GetShopsListQuery, GetShopsListQueryVariables>;
export const GetShopDetailDocument = gql`
    query GetShopDetail($shopId: ID!) {
  getShop(shopId: $shopId) {
    id
    name
    email
    phone
    address
    city
    state
    zip
    instagram
    facebook
    website
    shopMinimum
    hourlyRate
    shopCutPercent
    logo
    billingType
    status
    formSlug
    squareConnected
    squareLocationId
    squareConnectedAt
  }
}
    `;

/**
 * __useGetShopDetailQuery__
 *
 * To run a query within a React component, call `useGetShopDetailQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetShopDetailQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetShopDetailQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useGetShopDetailQuery(baseOptions: Apollo.QueryHookOptions<GetShopDetailQuery, GetShopDetailQueryVariables> & ({ variables: GetShopDetailQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetShopDetailQuery, GetShopDetailQueryVariables>(GetShopDetailDocument, options);
      }
export function useGetShopDetailLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetShopDetailQuery, GetShopDetailQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetShopDetailQuery, GetShopDetailQueryVariables>(GetShopDetailDocument, options);
        }
// @ts-ignore
export function useGetShopDetailSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetShopDetailQuery, GetShopDetailQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopDetailQuery, GetShopDetailQueryVariables>;
export function useGetShopDetailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopDetailQuery, GetShopDetailQueryVariables>): Apollo.UseSuspenseQueryResult<GetShopDetailQuery | undefined, GetShopDetailQueryVariables>;
export function useGetShopDetailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetShopDetailQuery, GetShopDetailQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetShopDetailQuery, GetShopDetailQueryVariables>(GetShopDetailDocument, options);
        }
export type GetShopDetailQueryHookResult = ReturnType<typeof useGetShopDetailQuery>;
export type GetShopDetailLazyQueryHookResult = ReturnType<typeof useGetShopDetailLazyQuery>;
export type GetShopDetailSuspenseQueryHookResult = ReturnType<typeof useGetShopDetailSuspenseQuery>;
export type GetShopDetailQueryResult = Apollo.QueryResult<GetShopDetailQuery, GetShopDetailQueryVariables>;
export const UpdateShopIdentityDocument = gql`
    mutation UpdateShopIdentity($shop: ShopInput!) {
  updateShop(shop: $shop) {
    id
    name
    email
    phone
    address
    city
    state
    zip
    instagram
    facebook
    website
  }
}
    `;
export type UpdateShopIdentityMutationFn = Apollo.MutationFunction<UpdateShopIdentityMutation, UpdateShopIdentityMutationVariables>;

/**
 * __useUpdateShopIdentityMutation__
 *
 * To run a mutation, you first call `useUpdateShopIdentityMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateShopIdentityMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateShopIdentityMutation, { data, loading, error }] = useUpdateShopIdentityMutation({
 *   variables: {
 *      shop: // value for 'shop'
 *   },
 * });
 */
export function useUpdateShopIdentityMutation(baseOptions?: Apollo.MutationHookOptions<UpdateShopIdentityMutation, UpdateShopIdentityMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateShopIdentityMutation, UpdateShopIdentityMutationVariables>(UpdateShopIdentityDocument, options);
      }
export type UpdateShopIdentityMutationHookResult = ReturnType<typeof useUpdateShopIdentityMutation>;
export type UpdateShopIdentityMutationResult = Apollo.MutationResult<UpdateShopIdentityMutation>;
export type UpdateShopIdentityMutationOptions = Apollo.BaseMutationOptions<UpdateShopIdentityMutation, UpdateShopIdentityMutationVariables>;
export const GetSquareAuthorizationUrlDocument = gql`
    query GetSquareAuthorizationUrl($shopId: ID!) {
  getSquareAuthorizationUrl(shopId: $shopId, platform: "mobile")
}
    `;

/**
 * __useGetSquareAuthorizationUrlQuery__
 *
 * To run a query within a React component, call `useGetSquareAuthorizationUrlQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetSquareAuthorizationUrlQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetSquareAuthorizationUrlQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useGetSquareAuthorizationUrlQuery(baseOptions: Apollo.QueryHookOptions<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables> & ({ variables: GetSquareAuthorizationUrlQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables>(GetSquareAuthorizationUrlDocument, options);
      }
export function useGetSquareAuthorizationUrlLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables>(GetSquareAuthorizationUrlDocument, options);
        }
// @ts-ignore
export function useGetSquareAuthorizationUrlSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables>): Apollo.UseSuspenseQueryResult<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables>;
export function useGetSquareAuthorizationUrlSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables>): Apollo.UseSuspenseQueryResult<GetSquareAuthorizationUrlQuery | undefined, GetSquareAuthorizationUrlQueryVariables>;
export function useGetSquareAuthorizationUrlSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables>(GetSquareAuthorizationUrlDocument, options);
        }
export type GetSquareAuthorizationUrlQueryHookResult = ReturnType<typeof useGetSquareAuthorizationUrlQuery>;
export type GetSquareAuthorizationUrlLazyQueryHookResult = ReturnType<typeof useGetSquareAuthorizationUrlLazyQuery>;
export type GetSquareAuthorizationUrlSuspenseQueryHookResult = ReturnType<typeof useGetSquareAuthorizationUrlSuspenseQuery>;
export type GetSquareAuthorizationUrlQueryResult = Apollo.QueryResult<GetSquareAuthorizationUrlQuery, GetSquareAuthorizationUrlQueryVariables>;
export const DisconnectShopSquareDocument = gql`
    mutation DisconnectShopSquare($shopId: ID!) {
  disconnectShopSquare(shopId: $shopId) {
    id
    squareConnected
    squareLocationId
    squareConnectedAt
  }
}
    `;
export type DisconnectShopSquareMutationFn = Apollo.MutationFunction<DisconnectShopSquareMutation, DisconnectShopSquareMutationVariables>;

/**
 * __useDisconnectShopSquareMutation__
 *
 * To run a mutation, you first call `useDisconnectShopSquareMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDisconnectShopSquareMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [disconnectShopSquareMutation, { data, loading, error }] = useDisconnectShopSquareMutation({
 *   variables: {
 *      shopId: // value for 'shopId'
 *   },
 * });
 */
export function useDisconnectShopSquareMutation(baseOptions?: Apollo.MutationHookOptions<DisconnectShopSquareMutation, DisconnectShopSquareMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DisconnectShopSquareMutation, DisconnectShopSquareMutationVariables>(DisconnectShopSquareDocument, options);
      }
export type DisconnectShopSquareMutationHookResult = ReturnType<typeof useDisconnectShopSquareMutation>;
export type DisconnectShopSquareMutationResult = Apollo.MutationResult<DisconnectShopSquareMutation>;
export type DisconnectShopSquareMutationOptions = Apollo.BaseMutationOptions<DisconnectShopSquareMutation, DisconnectShopSquareMutationVariables>;
export const UpdateShopCutPercentDocument = gql`
    mutation UpdateShopCutPercent($shop: ShopInput!) {
  updateShop(shop: $shop) {
    id
    shopCutPercent
  }
}
    `;
export type UpdateShopCutPercentMutationFn = Apollo.MutationFunction<UpdateShopCutPercentMutation, UpdateShopCutPercentMutationVariables>;

/**
 * __useUpdateShopCutPercentMutation__
 *
 * To run a mutation, you first call `useUpdateShopCutPercentMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateShopCutPercentMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateShopCutPercentMutation, { data, loading, error }] = useUpdateShopCutPercentMutation({
 *   variables: {
 *      shop: // value for 'shop'
 *   },
 * });
 */
export function useUpdateShopCutPercentMutation(baseOptions?: Apollo.MutationHookOptions<UpdateShopCutPercentMutation, UpdateShopCutPercentMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateShopCutPercentMutation, UpdateShopCutPercentMutationVariables>(UpdateShopCutPercentDocument, options);
      }
export type UpdateShopCutPercentMutationHookResult = ReturnType<typeof useUpdateShopCutPercentMutation>;
export type UpdateShopCutPercentMutationResult = Apollo.MutationResult<UpdateShopCutPercentMutation>;
export type UpdateShopCutPercentMutationOptions = Apollo.BaseMutationOptions<UpdateShopCutPercentMutation, UpdateShopCutPercentMutationVariables>;
export const UpdateMyShopFormSlugDocument = gql`
    mutation UpdateMyShopFormSlug($shopId: ID!, $slug: String!) {
  updateMyShopFormSlug(shopId: $shopId, slug: $slug) {
    id
    formSlug
  }
}
    `;
export type UpdateMyShopFormSlugMutationFn = Apollo.MutationFunction<UpdateMyShopFormSlugMutation, UpdateMyShopFormSlugMutationVariables>;

/**
 * __useUpdateMyShopFormSlugMutation__
 *
 * To run a mutation, you first call `useUpdateMyShopFormSlugMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateMyShopFormSlugMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateMyShopFormSlugMutation, { data, loading, error }] = useUpdateMyShopFormSlugMutation({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      slug: // value for 'slug'
 *   },
 * });
 */
export function useUpdateMyShopFormSlugMutation(baseOptions?: Apollo.MutationHookOptions<UpdateMyShopFormSlugMutation, UpdateMyShopFormSlugMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateMyShopFormSlugMutation, UpdateMyShopFormSlugMutationVariables>(UpdateMyShopFormSlugDocument, options);
      }
export type UpdateMyShopFormSlugMutationHookResult = ReturnType<typeof useUpdateMyShopFormSlugMutation>;
export type UpdateMyShopFormSlugMutationResult = Apollo.MutationResult<UpdateMyShopFormSlugMutation>;
export type UpdateMyShopFormSlugMutationOptions = Apollo.BaseMutationOptions<UpdateMyShopFormSlugMutation, UpdateMyShopFormSlugMutationVariables>;
export const GetMySquareConnectionDocument = gql`
    query GetMySquareConnection {
  getMySquareConnection {
    source
    connected
    locationId
    connectedAt
    ownerName
  }
}
    `;

/**
 * __useGetMySquareConnectionQuery__
 *
 * To run a query within a React component, call `useGetMySquareConnectionQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMySquareConnectionQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMySquareConnectionQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetMySquareConnectionQuery(baseOptions?: Apollo.QueryHookOptions<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>(GetMySquareConnectionDocument, options);
      }
export function useGetMySquareConnectionLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>(GetMySquareConnectionDocument, options);
        }
// @ts-ignore
export function useGetMySquareConnectionSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>): Apollo.UseSuspenseQueryResult<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>;
export function useGetMySquareConnectionSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>): Apollo.UseSuspenseQueryResult<GetMySquareConnectionQuery | undefined, GetMySquareConnectionQueryVariables>;
export function useGetMySquareConnectionSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>(GetMySquareConnectionDocument, options);
        }
export type GetMySquareConnectionQueryHookResult = ReturnType<typeof useGetMySquareConnectionQuery>;
export type GetMySquareConnectionLazyQueryHookResult = ReturnType<typeof useGetMySquareConnectionLazyQuery>;
export type GetMySquareConnectionSuspenseQueryHookResult = ReturnType<typeof useGetMySquareConnectionSuspenseQuery>;
export type GetMySquareConnectionQueryResult = Apollo.QueryResult<GetMySquareConnectionQuery, GetMySquareConnectionQueryVariables>;
export const GetMySquareAuthorizationUrlDocument = gql`
    query GetMySquareAuthorizationUrl {
  getMySquareAuthorizationUrl(platform: "mobile")
}
    `;

/**
 * __useGetMySquareAuthorizationUrlQuery__
 *
 * To run a query within a React component, call `useGetMySquareAuthorizationUrlQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMySquareAuthorizationUrlQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMySquareAuthorizationUrlQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetMySquareAuthorizationUrlQuery(baseOptions?: Apollo.QueryHookOptions<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>(GetMySquareAuthorizationUrlDocument, options);
      }
export function useGetMySquareAuthorizationUrlLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>(GetMySquareAuthorizationUrlDocument, options);
        }
// @ts-ignore
export function useGetMySquareAuthorizationUrlSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>): Apollo.UseSuspenseQueryResult<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>;
export function useGetMySquareAuthorizationUrlSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>): Apollo.UseSuspenseQueryResult<GetMySquareAuthorizationUrlQuery | undefined, GetMySquareAuthorizationUrlQueryVariables>;
export function useGetMySquareAuthorizationUrlSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>(GetMySquareAuthorizationUrlDocument, options);
        }
export type GetMySquareAuthorizationUrlQueryHookResult = ReturnType<typeof useGetMySquareAuthorizationUrlQuery>;
export type GetMySquareAuthorizationUrlLazyQueryHookResult = ReturnType<typeof useGetMySquareAuthorizationUrlLazyQuery>;
export type GetMySquareAuthorizationUrlSuspenseQueryHookResult = ReturnType<typeof useGetMySquareAuthorizationUrlSuspenseQuery>;
export type GetMySquareAuthorizationUrlQueryResult = Apollo.QueryResult<GetMySquareAuthorizationUrlQuery, GetMySquareAuthorizationUrlQueryVariables>;
export const DisconnectMySquareDocument = gql`
    mutation DisconnectMySquare {
  disconnectMySquare {
    source
    connected
    locationId
    connectedAt
    ownerName
  }
}
    `;
export type DisconnectMySquareMutationFn = Apollo.MutationFunction<DisconnectMySquareMutation, DisconnectMySquareMutationVariables>;

/**
 * __useDisconnectMySquareMutation__
 *
 * To run a mutation, you first call `useDisconnectMySquareMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDisconnectMySquareMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [disconnectMySquareMutation, { data, loading, error }] = useDisconnectMySquareMutation({
 *   variables: {
 *   },
 * });
 */
export function useDisconnectMySquareMutation(baseOptions?: Apollo.MutationHookOptions<DisconnectMySquareMutation, DisconnectMySquareMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DisconnectMySquareMutation, DisconnectMySquareMutationVariables>(DisconnectMySquareDocument, options);
      }
export type DisconnectMySquareMutationHookResult = ReturnType<typeof useDisconnectMySquareMutation>;
export type DisconnectMySquareMutationResult = Apollo.MutationResult<DisconnectMySquareMutation>;
export type DisconnectMySquareMutationOptions = Apollo.BaseMutationOptions<DisconnectMySquareMutation, DisconnectMySquareMutationVariables>;
export const GetMySquarePricingSettingsDocument = gql`
    query GetMySquarePricingSettings {
  getMySquarePricingSettings {
    source
    ownerName
    taxRateBasisPoints
    squareFeeOffsetCents
    canEdit
  }
}
    `;

/**
 * __useGetMySquarePricingSettingsQuery__
 *
 * To run a query within a React component, call `useGetMySquarePricingSettingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMySquarePricingSettingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMySquarePricingSettingsQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetMySquarePricingSettingsQuery(baseOptions?: Apollo.QueryHookOptions<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>(GetMySquarePricingSettingsDocument, options);
      }
export function useGetMySquarePricingSettingsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>(GetMySquarePricingSettingsDocument, options);
        }
// @ts-ignore
export function useGetMySquarePricingSettingsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>;
export function useGetMySquarePricingSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>): Apollo.UseSuspenseQueryResult<GetMySquarePricingSettingsQuery | undefined, GetMySquarePricingSettingsQueryVariables>;
export function useGetMySquarePricingSettingsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>(GetMySquarePricingSettingsDocument, options);
        }
export type GetMySquarePricingSettingsQueryHookResult = ReturnType<typeof useGetMySquarePricingSettingsQuery>;
export type GetMySquarePricingSettingsLazyQueryHookResult = ReturnType<typeof useGetMySquarePricingSettingsLazyQuery>;
export type GetMySquarePricingSettingsSuspenseQueryHookResult = ReturnType<typeof useGetMySquarePricingSettingsSuspenseQuery>;
export type GetMySquarePricingSettingsQueryResult = Apollo.QueryResult<GetMySquarePricingSettingsQuery, GetMySquarePricingSettingsQueryVariables>;
export const UpdateSquarePricingSettingsDocument = gql`
    mutation UpdateSquarePricingSettings($taxRateBasisPoints: Int!, $squareFeeOffsetCents: Int!) {
  updateSquarePricingSettings(
    taxRateBasisPoints: $taxRateBasisPoints
    squareFeeOffsetCents: $squareFeeOffsetCents
  ) {
    source
    ownerName
    taxRateBasisPoints
    squareFeeOffsetCents
    canEdit
  }
}
    `;
export type UpdateSquarePricingSettingsMutationFn = Apollo.MutationFunction<UpdateSquarePricingSettingsMutation, UpdateSquarePricingSettingsMutationVariables>;

/**
 * __useUpdateSquarePricingSettingsMutation__
 *
 * To run a mutation, you first call `useUpdateSquarePricingSettingsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateSquarePricingSettingsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateSquarePricingSettingsMutation, { data, loading, error }] = useUpdateSquarePricingSettingsMutation({
 *   variables: {
 *      taxRateBasisPoints: // value for 'taxRateBasisPoints'
 *      squareFeeOffsetCents: // value for 'squareFeeOffsetCents'
 *   },
 * });
 */
export function useUpdateSquarePricingSettingsMutation(baseOptions?: Apollo.MutationHookOptions<UpdateSquarePricingSettingsMutation, UpdateSquarePricingSettingsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateSquarePricingSettingsMutation, UpdateSquarePricingSettingsMutationVariables>(UpdateSquarePricingSettingsDocument, options);
      }
export type UpdateSquarePricingSettingsMutationHookResult = ReturnType<typeof useUpdateSquarePricingSettingsMutation>;
export type UpdateSquarePricingSettingsMutationResult = Apollo.MutationResult<UpdateSquarePricingSettingsMutation>;
export type UpdateSquarePricingSettingsMutationOptions = Apollo.BaseMutationOptions<UpdateSquarePricingSettingsMutation, UpdateSquarePricingSettingsMutationVariables>;
export const GetStaffListDocument = gql`
    query GetStaffList($includeArchived: Boolean, $page: PageInput) {
  getStaff(includeArchived: $includeArchived, page: $page) {
    items {
      id
      firstName
      lastName
      title
      email
      phone
      city
      state
      instagram
      facebook
      avatar
      status
      shopId
      shop {
        name
      }
      user {
        id
        avatar
      }
    }
    pageInfo {
      totalCount
      hasMore
      limit
      offset
    }
  }
}
    `;

/**
 * __useGetStaffListQuery__
 *
 * To run a query within a React component, call `useGetStaffListQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetStaffListQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetStaffListQuery({
 *   variables: {
 *      includeArchived: // value for 'includeArchived'
 *      page: // value for 'page'
 *   },
 * });
 */
export function useGetStaffListQuery(baseOptions?: Apollo.QueryHookOptions<GetStaffListQuery, GetStaffListQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetStaffListQuery, GetStaffListQueryVariables>(GetStaffListDocument, options);
      }
export function useGetStaffListLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetStaffListQuery, GetStaffListQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetStaffListQuery, GetStaffListQueryVariables>(GetStaffListDocument, options);
        }
// @ts-ignore
export function useGetStaffListSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetStaffListQuery, GetStaffListQueryVariables>): Apollo.UseSuspenseQueryResult<GetStaffListQuery, GetStaffListQueryVariables>;
export function useGetStaffListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetStaffListQuery, GetStaffListQueryVariables>): Apollo.UseSuspenseQueryResult<GetStaffListQuery | undefined, GetStaffListQueryVariables>;
export function useGetStaffListSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetStaffListQuery, GetStaffListQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetStaffListQuery, GetStaffListQueryVariables>(GetStaffListDocument, options);
        }
export type GetStaffListQueryHookResult = ReturnType<typeof useGetStaffListQuery>;
export type GetStaffListLazyQueryHookResult = ReturnType<typeof useGetStaffListLazyQuery>;
export type GetStaffListSuspenseQueryHookResult = ReturnType<typeof useGetStaffListSuspenseQuery>;
export type GetStaffListQueryResult = Apollo.QueryResult<GetStaffListQuery, GetStaffListQueryVariables>;
export const GetStaffDetailDocument = gql`
    query GetStaffDetail($staffId: ID!) {
  getOneStaff(staffId: $staffId) {
    id
    firstName
    lastName
    email
    phone
    title
    address
    city
    state
    zip
    instagram
    facebook
    avatar
    userId
    status
    shopId
    user {
      id
      avatar
    }
  }
}
    `;

/**
 * __useGetStaffDetailQuery__
 *
 * To run a query within a React component, call `useGetStaffDetailQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetStaffDetailQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetStaffDetailQuery({
 *   variables: {
 *      staffId: // value for 'staffId'
 *   },
 * });
 */
export function useGetStaffDetailQuery(baseOptions: Apollo.QueryHookOptions<GetStaffDetailQuery, GetStaffDetailQueryVariables> & ({ variables: GetStaffDetailQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetStaffDetailQuery, GetStaffDetailQueryVariables>(GetStaffDetailDocument, options);
      }
export function useGetStaffDetailLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetStaffDetailQuery, GetStaffDetailQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetStaffDetailQuery, GetStaffDetailQueryVariables>(GetStaffDetailDocument, options);
        }
// @ts-ignore
export function useGetStaffDetailSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetStaffDetailQuery, GetStaffDetailQueryVariables>): Apollo.UseSuspenseQueryResult<GetStaffDetailQuery, GetStaffDetailQueryVariables>;
export function useGetStaffDetailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetStaffDetailQuery, GetStaffDetailQueryVariables>): Apollo.UseSuspenseQueryResult<GetStaffDetailQuery | undefined, GetStaffDetailQueryVariables>;
export function useGetStaffDetailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetStaffDetailQuery, GetStaffDetailQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetStaffDetailQuery, GetStaffDetailQueryVariables>(GetStaffDetailDocument, options);
        }
export type GetStaffDetailQueryHookResult = ReturnType<typeof useGetStaffDetailQuery>;
export type GetStaffDetailLazyQueryHookResult = ReturnType<typeof useGetStaffDetailLazyQuery>;
export type GetStaffDetailSuspenseQueryHookResult = ReturnType<typeof useGetStaffDetailSuspenseQuery>;
export type GetStaffDetailQueryResult = Apollo.QueryResult<GetStaffDetailQuery, GetStaffDetailQueryVariables>;
export const UpdateStaffIdentityDocument = gql`
    mutation UpdateStaffIdentity($staff: StaffInput!) {
  updateStaff(staff: $staff) {
    id
    firstName
    lastName
    email
    phone
    title
    address
    city
    state
    zip
    instagram
    facebook
  }
}
    `;
export type UpdateStaffIdentityMutationFn = Apollo.MutationFunction<UpdateStaffIdentityMutation, UpdateStaffIdentityMutationVariables>;

/**
 * __useUpdateStaffIdentityMutation__
 *
 * To run a mutation, you first call `useUpdateStaffIdentityMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateStaffIdentityMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateStaffIdentityMutation, { data, loading, error }] = useUpdateStaffIdentityMutation({
 *   variables: {
 *      staff: // value for 'staff'
 *   },
 * });
 */
export function useUpdateStaffIdentityMutation(baseOptions?: Apollo.MutationHookOptions<UpdateStaffIdentityMutation, UpdateStaffIdentityMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateStaffIdentityMutation, UpdateStaffIdentityMutationVariables>(UpdateStaffIdentityDocument, options);
      }
export type UpdateStaffIdentityMutationHookResult = ReturnType<typeof useUpdateStaffIdentityMutation>;
export type UpdateStaffIdentityMutationResult = Apollo.MutationResult<UpdateStaffIdentityMutation>;
export type UpdateStaffIdentityMutationOptions = Apollo.BaseMutationOptions<UpdateStaffIdentityMutation, UpdateStaffIdentityMutationVariables>;
export const ArchiveStaffDocument = gql`
    mutation ArchiveStaff($staffId: ID!) {
  archiveStaff(staffId: $staffId) {
    id
    status
  }
}
    `;
export type ArchiveStaffMutationFn = Apollo.MutationFunction<ArchiveStaffMutation, ArchiveStaffMutationVariables>;

/**
 * __useArchiveStaffMutation__
 *
 * To run a mutation, you first call `useArchiveStaffMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useArchiveStaffMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [archiveStaffMutation, { data, loading, error }] = useArchiveStaffMutation({
 *   variables: {
 *      staffId: // value for 'staffId'
 *   },
 * });
 */
export function useArchiveStaffMutation(baseOptions?: Apollo.MutationHookOptions<ArchiveStaffMutation, ArchiveStaffMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ArchiveStaffMutation, ArchiveStaffMutationVariables>(ArchiveStaffDocument, options);
      }
export type ArchiveStaffMutationHookResult = ReturnType<typeof useArchiveStaffMutation>;
export type ArchiveStaffMutationResult = Apollo.MutationResult<ArchiveStaffMutation>;
export type ArchiveStaffMutationOptions = Apollo.BaseMutationOptions<ArchiveStaffMutation, ArchiveStaffMutationVariables>;
export const UnarchiveStaffDocument = gql`
    mutation UnarchiveStaff($staffId: ID!) {
  unarchiveStaff(staffId: $staffId) {
    id
    status
  }
}
    `;
export type UnarchiveStaffMutationFn = Apollo.MutationFunction<UnarchiveStaffMutation, UnarchiveStaffMutationVariables>;

/**
 * __useUnarchiveStaffMutation__
 *
 * To run a mutation, you first call `useUnarchiveStaffMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUnarchiveStaffMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [unarchiveStaffMutation, { data, loading, error }] = useUnarchiveStaffMutation({
 *   variables: {
 *      staffId: // value for 'staffId'
 *   },
 * });
 */
export function useUnarchiveStaffMutation(baseOptions?: Apollo.MutationHookOptions<UnarchiveStaffMutation, UnarchiveStaffMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UnarchiveStaffMutation, UnarchiveStaffMutationVariables>(UnarchiveStaffDocument, options);
      }
export type UnarchiveStaffMutationHookResult = ReturnType<typeof useUnarchiveStaffMutation>;
export type UnarchiveStaffMutationResult = Apollo.MutationResult<UnarchiveStaffMutation>;
export type UnarchiveStaffMutationOptions = Apollo.BaseMutationOptions<UnarchiveStaffMutation, UnarchiveStaffMutationVariables>;
export const GetSystemMessageTemplatesDocument = gql`
    query GetSystemMessageTemplates($shopId: ID, $artistUserId: ID) {
  getSystemMessageTemplates(shopId: $shopId, artistUserId: $artistUserId) {
    id
    shopId
    artistUserId
    key
    emailSubjectTemplate
    emailBodyTemplate
    extraNoteTemplate
  }
}
    `;

/**
 * __useGetSystemMessageTemplatesQuery__
 *
 * To run a query within a React component, call `useGetSystemMessageTemplatesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetSystemMessageTemplatesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetSystemMessageTemplatesQuery({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      artistUserId: // value for 'artistUserId'
 *   },
 * });
 */
export function useGetSystemMessageTemplatesQuery(baseOptions?: Apollo.QueryHookOptions<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>(GetSystemMessageTemplatesDocument, options);
      }
export function useGetSystemMessageTemplatesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>(GetSystemMessageTemplatesDocument, options);
        }
// @ts-ignore
export function useGetSystemMessageTemplatesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>): Apollo.UseSuspenseQueryResult<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>;
export function useGetSystemMessageTemplatesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>): Apollo.UseSuspenseQueryResult<GetSystemMessageTemplatesQuery | undefined, GetSystemMessageTemplatesQueryVariables>;
export function useGetSystemMessageTemplatesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>(GetSystemMessageTemplatesDocument, options);
        }
export type GetSystemMessageTemplatesQueryHookResult = ReturnType<typeof useGetSystemMessageTemplatesQuery>;
export type GetSystemMessageTemplatesLazyQueryHookResult = ReturnType<typeof useGetSystemMessageTemplatesLazyQuery>;
export type GetSystemMessageTemplatesSuspenseQueryHookResult = ReturnType<typeof useGetSystemMessageTemplatesSuspenseQuery>;
export type GetSystemMessageTemplatesQueryResult = Apollo.QueryResult<GetSystemMessageTemplatesQuery, GetSystemMessageTemplatesQueryVariables>;
export const UpdateSystemMessageTemplateDocument = gql`
    mutation UpdateSystemMessageTemplate($input: UpdateSystemMessageTemplateInput!) {
  updateSystemMessageTemplate(input: $input) {
    id
    shopId
    artistUserId
    key
    emailSubjectTemplate
    emailBodyTemplate
    extraNoteTemplate
  }
}
    `;
export type UpdateSystemMessageTemplateMutationFn = Apollo.MutationFunction<UpdateSystemMessageTemplateMutation, UpdateSystemMessageTemplateMutationVariables>;

/**
 * __useUpdateSystemMessageTemplateMutation__
 *
 * To run a mutation, you first call `useUpdateSystemMessageTemplateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateSystemMessageTemplateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateSystemMessageTemplateMutation, { data, loading, error }] = useUpdateSystemMessageTemplateMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateSystemMessageTemplateMutation(baseOptions?: Apollo.MutationHookOptions<UpdateSystemMessageTemplateMutation, UpdateSystemMessageTemplateMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateSystemMessageTemplateMutation, UpdateSystemMessageTemplateMutationVariables>(UpdateSystemMessageTemplateDocument, options);
      }
export type UpdateSystemMessageTemplateMutationHookResult = ReturnType<typeof useUpdateSystemMessageTemplateMutation>;
export type UpdateSystemMessageTemplateMutationResult = Apollo.MutationResult<UpdateSystemMessageTemplateMutation>;
export type UpdateSystemMessageTemplateMutationOptions = Apollo.BaseMutationOptions<UpdateSystemMessageTemplateMutation, UpdateSystemMessageTemplateMutationVariables>;
export const ResetSystemMessageTemplateDocument = gql`
    mutation ResetSystemMessageTemplate($shopId: ID, $key: String!) {
  resetSystemMessageTemplate(shopId: $shopId, key: $key)
}
    `;
export type ResetSystemMessageTemplateMutationFn = Apollo.MutationFunction<ResetSystemMessageTemplateMutation, ResetSystemMessageTemplateMutationVariables>;

/**
 * __useResetSystemMessageTemplateMutation__
 *
 * To run a mutation, you first call `useResetSystemMessageTemplateMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useResetSystemMessageTemplateMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [resetSystemMessageTemplateMutation, { data, loading, error }] = useResetSystemMessageTemplateMutation({
 *   variables: {
 *      shopId: // value for 'shopId'
 *      key: // value for 'key'
 *   },
 * });
 */
export function useResetSystemMessageTemplateMutation(baseOptions?: Apollo.MutationHookOptions<ResetSystemMessageTemplateMutation, ResetSystemMessageTemplateMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ResetSystemMessageTemplateMutation, ResetSystemMessageTemplateMutationVariables>(ResetSystemMessageTemplateDocument, options);
      }
export type ResetSystemMessageTemplateMutationHookResult = ReturnType<typeof useResetSystemMessageTemplateMutation>;
export type ResetSystemMessageTemplateMutationResult = Apollo.MutationResult<ResetSystemMessageTemplateMutation>;
export type ResetSystemMessageTemplateMutationOptions = Apollo.BaseMutationOptions<ResetSystemMessageTemplateMutation, ResetSystemMessageTemplateMutationVariables>;
export const UpdateProjectDocument = gql`
    mutation UpdateProject($project: ProjectInput) {
  updateProject(project: $project) {
    id
    title
    description
    placement
    size
    palette
    artistId
    clientId
    referenceImages {
      id
      url
      avatar
      title
      uploadedByDisplayName
      userId
      userInfo {
        firstName
        lastName
        avatar
        id
      }
      tags
      updatedAt
      createdAt
    }
    bodyImages {
      id
      url
      avatar
      title
      uploadedByDisplayName
      userId
      userInfo {
        firstName
        lastName
        avatar
        id
      }
      tags
      updatedAt
      createdAt
    }
    designImages {
      id
      url
      avatar
      uploadedByDisplayName
      userId
      userInfo {
        firstName
        lastName
        avatar
        id
      }
      tags
      updatedAt
      createdAt
    }
    materialsUsed
    notes {
      id
      author
      note
      createdAt
      updatedAt
    }
    tags
    status
    depositCollectedCents
    depositAvailableCents
  }
}
    `;
export type UpdateProjectMutationFn = Apollo.MutationFunction<UpdateProjectMutation, UpdateProjectMutationVariables>;

/**
 * __useUpdateProjectMutation__
 *
 * To run a mutation, you first call `useUpdateProjectMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateProjectMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateProjectMutation, { data, loading, error }] = useUpdateProjectMutation({
 *   variables: {
 *      project: // value for 'project'
 *   },
 * });
 */
export function useUpdateProjectMutation(baseOptions?: Apollo.MutationHookOptions<UpdateProjectMutation, UpdateProjectMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateProjectMutation, UpdateProjectMutationVariables>(UpdateProjectDocument, options);
      }
export type UpdateProjectMutationHookResult = ReturnType<typeof useUpdateProjectMutation>;
export type UpdateProjectMutationResult = Apollo.MutationResult<UpdateProjectMutation>;
export type UpdateProjectMutationOptions = Apollo.BaseMutationOptions<UpdateProjectMutation, UpdateProjectMutationVariables>;
export const UpdateProjectNotesDocument = gql`
    mutation UpdateProjectNotes($projectId: ID!, $notes: [IBNoteInput]) {
  updateProjectNotes(projectId: $projectId, notes: $notes) {
    notes {
      author
      note
      createdAt
      updatedAt
    }
  }
}
    `;
export type UpdateProjectNotesMutationFn = Apollo.MutationFunction<UpdateProjectNotesMutation, UpdateProjectNotesMutationVariables>;

/**
 * __useUpdateProjectNotesMutation__
 *
 * To run a mutation, you first call `useUpdateProjectNotesMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateProjectNotesMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateProjectNotesMutation, { data, loading, error }] = useUpdateProjectNotesMutation({
 *   variables: {
 *      projectId: // value for 'projectId'
 *      notes: // value for 'notes'
 *   },
 * });
 */
export function useUpdateProjectNotesMutation(baseOptions?: Apollo.MutationHookOptions<UpdateProjectNotesMutation, UpdateProjectNotesMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateProjectNotesMutation, UpdateProjectNotesMutationVariables>(UpdateProjectNotesDocument, options);
      }
export type UpdateProjectNotesMutationHookResult = ReturnType<typeof useUpdateProjectNotesMutation>;
export type UpdateProjectNotesMutationResult = Apollo.MutationResult<UpdateProjectNotesMutation>;
export type UpdateProjectNotesMutationOptions = Apollo.BaseMutationOptions<UpdateProjectNotesMutation, UpdateProjectNotesMutationVariables>;
export const UpdateProjectTagsDocument = gql`
    mutation UpdateProjectTags($projectId: ID!, $tags: [String]) {
  updateProjectTags(projectId: $projectId, tags: $tags) {
    tags
  }
}
    `;
export type UpdateProjectTagsMutationFn = Apollo.MutationFunction<UpdateProjectTagsMutation, UpdateProjectTagsMutationVariables>;

/**
 * __useUpdateProjectTagsMutation__
 *
 * To run a mutation, you first call `useUpdateProjectTagsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateProjectTagsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateProjectTagsMutation, { data, loading, error }] = useUpdateProjectTagsMutation({
 *   variables: {
 *      projectId: // value for 'projectId'
 *      tags: // value for 'tags'
 *   },
 * });
 */
export function useUpdateProjectTagsMutation(baseOptions?: Apollo.MutationHookOptions<UpdateProjectTagsMutation, UpdateProjectTagsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateProjectTagsMutation, UpdateProjectTagsMutationVariables>(UpdateProjectTagsDocument, options);
      }
export type UpdateProjectTagsMutationHookResult = ReturnType<typeof useUpdateProjectTagsMutation>;
export type UpdateProjectTagsMutationResult = Apollo.MutationResult<UpdateProjectTagsMutation>;
export type UpdateProjectTagsMutationOptions = Apollo.BaseMutationOptions<UpdateProjectTagsMutation, UpdateProjectTagsMutationVariables>;
export const UpdateUserDocument = gql`
    mutation UpdateUser($user: UserUpdateInput!) {
  updateUser(user: $user) {
    id
    avatar
    tagColor
    themePreference
  }
}
    `;
export type UpdateUserMutationFn = Apollo.MutationFunction<UpdateUserMutation, UpdateUserMutationVariables>;

/**
 * __useUpdateUserMutation__
 *
 * To run a mutation, you first call `useUpdateUserMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateUserMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateUserMutation, { data, loading, error }] = useUpdateUserMutation({
 *   variables: {
 *      user: // value for 'user'
 *   },
 * });
 */
export function useUpdateUserMutation(baseOptions?: Apollo.MutationHookOptions<UpdateUserMutation, UpdateUserMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateUserMutation, UpdateUserMutationVariables>(UpdateUserDocument, options);
      }
export type UpdateUserMutationHookResult = ReturnType<typeof useUpdateUserMutation>;
export type UpdateUserMutationResult = Apollo.MutationResult<UpdateUserMutation>;
export type UpdateUserMutationOptions = Apollo.BaseMutationOptions<UpdateUserMutation, UpdateUserMutationVariables>;