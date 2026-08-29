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
  removeSharedImageFromList: Scalars['Boolean']['output'];
  requestPasswordReset: Scalars['Boolean']['output'];
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


export type MutationRemoveSharedImageFromListArgs = {
  sharedImageId: Scalars['ID']['input'];
};


export type MutationRequestPasswordResetArgs = {
  email: Scalars['String']['input'];
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

export type LoginMutationVariables = Exact<{
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
}>;


export type LoginMutation = { __typename?: 'Mutation', login: { __typename?: 'User', id: string, email: string, firstName?: string | null, lastName?: string | null, avatar?: string | null, role: number, userType: string, tagColor?: string | null, themePreference?: string | null, accessToken: string, userInfo?: { __typename?: 'Artist', id: string, firstName: string, lastName: string, avatar?: string | null, hourlyRate?: number | null, shop?: { __typename?: 'Shop', id: string, name: string } | null } | { __typename?: 'Client', id: string, firstName: string, lastName: string, avatar?: string | null } | { __typename?: 'Staff', id: string, firstName: string, lastName: string, avatar?: string | null, title?: string | null, shop?: { __typename?: 'Shop', id: string, name: string } | null } | null } };

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