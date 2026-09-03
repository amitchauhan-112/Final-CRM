export type Role = 'ADMIN' | 'EMPLOYEE' | 'OPERATIONS' | 'FINANCE';
export type LeadSource = 'WHATSAPP' | 'INSTAGRAM' | 'MANUAL' | 'WEBSITE' | 'META_ADS';
export type LeadStatus = 'NEW' | 'NOT_CONTACTED' | 'CONTACTED' | 'INTERESTED' | 'FOLLOW_UP_SCHEDULED' | 'CONFIRMED' | 'LOST';
export type LeadPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DRAFT' | 'ENDED';
export type NotificationType = 'FOLLOW_UP_DUE' | 'FOLLOW_UP_OVERDUE' | 'NEW_LEAD_ASSIGNED' | 'LEAD_STATUS_CHANGED' | 'CAMPAIGN_UPDATE' | 'SYSTEM';
export type AvailabilityStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Department {
  id: string;
  organizationId?: string;
  name: string;
  code: string;
  description?: string;
  headId?: string;
  head?: { id: string; name: string };
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  _count?: { employees: number; designations: number };
}

export interface Designation {
  id: string;
  departmentId: string;
  department?: { id: string; name: string; code: string };
  name: string;
  description?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  _count?: { employees: number };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  availability: AvailabilityStatus;
  lastLogin?: string;
  createdAt: string;
  employeeId?: string;
  departmentId?: string;
  department?: { id: string; name: string; code: string };
  designationId?: string;
  designation?: { id: string; name: string };
  _count?: { assignedLeads: number };
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  organizationId?: string;
  _count?: { leads: number };
  createdAt: string;
}

export interface LeadTag {
  id: string;
  leadId: string;
  tagId: string;
  tag: Tag;
}

export interface Campaign {
  id: string;
  name: string;
  destination: string;
  description?: string;
  status: CampaignStatus;
  startDate?: string;
  endDate?: string;
  targetLeads?: number;
  budget?: number;
  whatsappNumber?: string;
  instagramAdId?: string;
  utmSource?: string;
  utmCampaign?: string;
  keywords: string[];
  employees: CampaignEmployee[];
  _count?: { leads: number };
  createdAt: string;
  updatedAt: string;
  isFromMeta?: boolean;
  metaCampaignId?: string;
  archivedAt?: string;
  archiveS3Key?: string;
}

export interface CampaignEmployee {
  id: string;
  campaignId: string;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'email'>;
  assignedAt: string;
}

export interface CampaignNote {
  id: string;
  content: string;
  isEdited: boolean;
  campaignId: string;
  authorId: string;
  author: Pick<User, 'id' | 'name' | 'avatar' | 'role'>;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignAttachment {
  id: string;
  name: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  campaignId: string;
  uploadedById: string;
  uploadedBy: Pick<User, 'id' | 'name'>;
  createdAt: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  message?: string;
  destination?: string;
  campaignId?: string;
  campaign?: Pick<Campaign, 'id' | 'name' | 'destination'>;
  assignedToId?: string;
  assignedTo?: Pick<User, 'id' | 'name' | 'email'>;
  lostReason?: string;
  lostReasonOther?: string;
  followUpDate?: string;
  followUpNotes?: string;
  followUpDone: boolean;
  notes?: string;
  budget?: number;
  groupSize?: number;
  preferredDate?: string;
  isRead: boolean;
  whatsappMsgId?: string;
  instagramLeadId?: string;
  adName?: string;
  tags?: LeadTag[];
  activityLogs?: ActivityLog[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadComment {
  id: string;
  content: string;
  isEdited: boolean;
  leadId: string;
  authorId: string;
  author: Pick<User, 'id' | 'name' | 'avatar' | 'role'>;
  parentId?: string;
  replies?: LeadComment[];
  createdAt: string;
  updatedAt: string;
}

export type NotificationCategory = 'SALES' | 'OPERATIONS' | 'FINANCE' | 'CUSTOMER' | 'SYSTEM';
export type NotificationSeverity = 'INFO' | 'REMINDER' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  userId: string;
  leadId?: string;
  lead?: Pick<Lead, 'id' | 'name'>;
  departureId?: string;
  category?: NotificationCategory;
  severity: NotificationSeverity;
  channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  details?: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'avatar' | 'role'>;
  leadId?: string;
  lead?: Pick<Lead, 'id' | 'name'>;
  createdAt: string;
}

export interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  adminNote?: string;
  employeeId: string;
  employee: Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
  approvedById?: string;
  approvedBy?: Pick<User, 'id' | 'name'>;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  availability: AvailabilityStatus;
  lastLogin?: string;
  createdAt: string;
  stats: {
    total: number;
    confirmed: number;
    lost: number;
    pending: number;
    overdue: number;
    conversionRate: string;
  };
  campaignAssignments: Array<{
    id: string;
    campaign: Pick<Campaign, 'id' | 'name' | 'destination' | 'status'>;
  }>;
  activityLogs: ActivityLog[];
}

export interface OrgSettings {
  sources: string[];
  destinations: string[];
  lostReasons: string[];
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  companyWebsite: string;
}

export interface LeadStats {
  total: number;
  byStatus: Record<LeadStatus, number>;
  bySource: Record<LeadSource, number>;
  overdue: number;
}

export interface EmployeePerformance {
  id: string;
  name: string;
  email: string;
  total: number;
  confirmed: number;
  lost: number;
  active: number;
  overdue: number;
  conversionRate: string;
}

export interface CampaignStat {
  id: string;
  name: string;
  destination: string;
  status: CampaignStatus;
  total: number;
  confirmed: number;
  lost: number;
  pending: number;
  active: number;
  conversionRate: string;
  targetLeads?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    unreadCount?: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ─── Masters ──────────────────────────────────────────────────────────────────

export interface Destination {
  id: string;
  organizationId?: string;
  name: string;
  country: string;
  state?: string;
  city?: string;
  type: 'DOMESTIC' | 'INTERNATIONAL';
  description?: string;
  isPopular: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface TourCategory {
  id: string;
  organizationId?: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

// ─── Packages ─────────────────────────────────────────────────────────────────

export type PackageStatus = 'ACTIVE' | 'INACTIVE' | 'DRAFT';
export type PackageType = 'GIT' | 'FIT';
export type DifficultyLevel = 'EASY' | 'MODERATE' | 'DIFFICULT' | 'EXTREME';
export type TaskType = 'GENERAL' | 'COLLECT_DOCS' | 'COLLECT_PAYMENT' | 'CONFIRM_HOTEL' | 'CONFIRM_VEHICLE' | 'SEND_REMINDER' | 'TRIP_DAY' | 'COLLECT_REVIEW' | 'REFERRAL';
export type TaskDepartment = 'SALES' | 'OPERATIONS' | 'CUSTOMER_CARE' | 'ALL';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';
export type PaymentType = 'ADVANCE' | 'PARTIAL' | 'FINAL' | 'REFUND';
export type PaymentMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE';

export interface Package {
  id: string;
  organizationId?: string;
  name: string;
  code: string;
  description?: string;
  overview?: string;
  destinationId?: string;
  destination?: { id: string; name: string; country: string; state?: string };
  tourCategoryId?: string;
  tourCategory?: { id: string; name: string; icon?: string };
  nights: number;
  days: number;
  inclusions: string;   // JSON string array
  exclusions: string;   // JSON string array
  highlights: string;   // JSON string array
  thingsToCarry: string; // JSON string array
  pricePerPerson: number;
  offerPrice?: number;
  priceSingle?: number;
  priceDouble?: number;
  priceTriple?: number;
  priceQuad?: number;
  capacityMin?: number;
  capacityMax?: number;
  difficultyLevel?: DifficultyLevel;
  bestSeason: string;  // JSON string array of months
  pickupLocation?: string;
  dropLocation?: string;
  cancellationPolicy?: string;
  termsAndConditions?: string;
  packageNotes?: string;
  images: string;   // JSON string array of URLs
  gallery: string;  // JSON string array of URLs
  isPopular: boolean;
  status: PackageStatus;
  packageType: PackageType;
  createdById?: string;
  createdBy?: { id: string; name: string; employeeId?: string };
  lastModifiedById?: string;
  lastModifiedBy?: { id: string; name: string };
  itineraryItems?: PackageItinerary[];
  _count?: { itineraryItems: number; bookings: number };
  createdAt: string;
  updatedAt: string;
}

export interface PackageAuditLog {
  id: string;
  packageId: string | null;
  userId: string;
  userName: string;
  employeeId?: string;
  userRole: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changedFields?: string; // JSON: [{ field, from, to }]
  packageName?: string;
  packageCode?: string;
  packageType?: string;
  createdAt: string;
}

export interface PackageItinerary {
  id: string;
  packageId: string;
  dayOffset: number;
  title: string;
  description?: string;
  notes?: string;
  taskType: TaskType;
  department: TaskDepartment;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'CORRECTION_REQUESTED';

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  receiptNo?: string;
  proofUrl?: string;
  status: PaymentStatus;
  financeNote?: string;
  scheduleItemId?: string;
  verifiedById?: string;
  verifiedBy?: Pick<User, 'id' | 'name'>;
  verifiedAt?: string;
  recordedById: string;
  recordedBy: Pick<User, 'id' | 'name'>;
  createdAt: string;
  updatedAt: string;
  booking?: {
    id: string; bookingNumber?: string; travelerName: string; finalPrice: number;
    lead: Pick<Lead, 'id' | 'name' | 'phone'> & { assignedTo?: Pick<User, 'id' | 'name'> };
    departure?: { destination: string; departureDate: string };
  };
}

export interface BookingTask {
  id: string;
  bookingId: string;
  title: string;
  description?: string;
  notes?: string;
  dueDate?: string;
  dayOffset?: number;
  taskType: TaskType;
  department: TaskDepartment;
  status: TaskStatus;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  assigneeId?: string;
  assignee?: Pick<User, 'id' | 'name' | 'avatar'>;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  booking?: {
    lead: Pick<Lead, 'id' | 'name' | 'phone' | 'destination'>;
  };
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export type FoodPreference = 'VEG' | 'NON_VEG' | 'JAIN' | 'NO_PREFERENCE';
export type RoomSharing = 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'QUAD';
export type TourType = 'FIT' | 'GIT';

export interface Booking {
  id: string;
  organizationId?: string;
  leadId: string;
  bookingNumber?: string;
  packageId?: string;
  package?: { id: string; name: string; code: string };
  travelerName: string;
  numberOfTravelers: number;
  aadharNumber?: string;
  foodPreference: FoodPreference;
  roomSharing: RoomSharing;
  departureLocation?: string;
  departurePackage?: string;
  tourType: TourType;
  specialRequest?: string;
  bookingNotes?: string;
  departureDate?: string;
  returnDate?: string;
  finalPrice: number;
  amountPaid: number;
  balanceAmount: number;
  balanceDueDate?: string;
  salesExecutiveId?: string;
  opsExecutiveId?: string;
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
  payments?: Payment[];
  tasks?: BookingTask[];
  createdAt: string;
  updatedAt: string;
}

export interface JourneyStage {
  key: string;
  label: string;
  done: boolean;
  at: string | null;
}

export interface Journey {
  stages: JourneyStage[];
  completedCount: number;
  totalCount: number;
  currentStage: string | null;
}

export interface BookingWithLead extends Booking {
  lead: Pick<Lead, 'id' | 'name' | 'phone' | 'email' | 'destination' | 'preferredDate'> & {
    assignedTo?: Pick<User, 'id' | 'name'>;
  };
}

export interface FinanceSummary {
  totalRevenue: number;
  totalCollected: number;
  totalBalance: number;
  overdueBalance: number;
  fullyPaid: number;
  partiallyPaid: number;
  unpaid: number;
  total: number;
}

export interface MonthlyFinanceData {
  month: number;
  revenue: number;
  collected: number;
  count: number;
}

export interface TripGroup {
  departureDate: string;
  totalPax: number;
  totalRevenue: number;
  totalCollected: number;
  bookings: Array<Lead & { booking?: Booking }>;
}

export type FeedbackType = 'BUG' | 'SUGGESTION' | 'OTHER';
export type FeedbackPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface Feedback {
  id: string;
  type: FeedbackType;
  title: string;
  description: string;
  page?: string;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  adminNotes?: string;
  submittedById: string;
  submittedBy: Pick<User, 'id' | 'name' | 'email' | 'role'>;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackStats {
  total: number;
  open: number;
  inProgress: number;
  bugs: number;
  suggestions: number;
}

// ─── Operations Panel ───────────────────────────────────────────────────────

export type DepartureStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type TripCaptainStatus = 'UNASSIGNED' | 'ASSIGNED' | 'CONFIRMED';
export type OpsBookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type DepartureTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type VendorType = 'HOTEL' | 'VEHICLE' | 'LOCAL_GUIDE' | 'LOCAL_VENDOR' | 'OTHER';
export type OpsDocumentType = 'HOTEL_VOUCHER' | 'VEHICLE_VOUCHER' | 'CUSTOMER_LIST' | 'ROOMING_LIST' | 'TRIP_CAPTAIN_SHEET' | 'EMERGENCY_CONTACT_LIST' | 'VENDOR_BILL' | 'OTHER';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export type TravelerVerificationStatus = 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'CORRECTION_REQUESTED';
export type GovIdType = 'AADHAR' | 'PASSPORT' | 'VOTER_ID' | 'DRIVING_LICENSE';

export interface Traveler {
  id: string;
  bookingId: string;
  name: string;
  mobile?: string;
  email?: string;
  gender?: Gender;
  dob?: string;
  age?: number;
  bloodGroup?: string;
  nationality?: string;
  seatNumber?: string;
  pickupPoint?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  roomSharing?: RoomSharing;
  foodPreference?: FoodPreference;
  isChild: boolean;
  isSeniorCitizen: boolean;
  needsExtraMattress: boolean;
  specialNotes?: string;
  govIdType?: GovIdType;
  govIdNumber?: string;
  govIdDocumentUrl?: string;
  medicalConditions?: string;
  arrivalDetails?: string;
  departureDetails?: string;
  flightBookedByUs?: boolean | null;
  pickupDropBookedByUs?: boolean | null;
  verificationStatus: TravelerVerificationStatus;
  verificationNote?: string;
  submittedAt?: string;
  verifiedAt?: string;
  verifiedById?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Traveler Portal (public, token-gated) ───────────────────────────────────

export interface PortalBooking {
  bookingNumber?: string;
  customerName: string;
  destination?: string;
  package?: { name: string; code: string; nights: number; days: number };
  departureDate?: string;
  returnDate?: string;
  numberOfTravelers: number;
  finalPrice: number;
  amountPaid: number;
  balanceAmount: number;
  travelers: Traveler[];
  paymentSchedule: PaymentScheduleItem[];
}

export interface Hotel {
  id: string;
  departureId: string;
  name: string;
  location?: string;
  checkInDate?: string;
  checkOutDate?: string;
  numberOfRooms?: number;
  roomAllocation?: string;
  vendorName?: string;
  vendorContact?: string;
  contactPerson?: string;
  rate?: number;
  vendorId?: string;
  confirmationNumber?: string;
  status: OpsBookingStatus;
  voucherUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  departureId: string;
  vehicleType?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverMobile?: string;
  pickupTime?: string;
  pickupLocation?: string;
  vendorName?: string;
  vendorContact?: string;
  contactPerson?: string;
  rate?: number;
  vendorId?: string;
  status: OpsBookingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  organizationId?: string;
  name: string;
  type: VendorType;
  contact?: string;
  contactPerson?: string;
  rate?: number;
  notes?: string;
  status: 'ACTIVE' | 'INACTIVE';
  rating?: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VendorDocument {
  id: string;
  vendorId: string;
  name: string;
  type: 'CONTRACT' | 'LICENSE' | 'AGREEMENT' | 'OTHER';
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedById: string;
  uploadedBy: Pick<User, 'id' | 'name'>;
  createdAt: string;
}

export interface VendorTrip {
  service: 'HOTEL' | 'VEHICLE';
  id: string;
  status: OpsBookingStatus;
  departureId: string;
  destination: string;
  departureDate: string;
  departureStatus: DepartureStatus;
}

export interface VendorDetail extends Vendor {
  documents: VendorDocument[];
  payments: VendorPayment[];
  upcomingTrips: VendorTrip[];
  pastTrips: VendorTrip[];
  paymentSummary: { totalBilled: number; totalPaid: number; totalPending: number; billCount: number };
}

export interface RoomAllocationSuggestionRoom {
  roomNumber: number;
  roomType: string;
  bookingId: string;
  travelerIds: string[];
  travelerNames: string[];
  note: string | null;
}

export interface RoomAllocationSuggestion {
  rooms: RoomAllocationSuggestionRoom[];
  summaryText: string;
}

export interface TravelCalendarItem {
  id: string;
  destination: string;
  packageName: string | null;
  departureDate: string;
  returnDate: string | null;
  status: DepartureStatus;
  totalTravelers: number;
  daysUntilDeparture: number;
  daysUntilReturn: number | null;
  bucket: 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'THIS_MONTH' | 'LATER' | 'IN_PROGRESS';
}

export interface OperationsDocument {
  id: string;
  departureId: string;
  name: string;
  type: OpsDocumentType;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedById: string;
  uploadedBy: Pick<User, 'id' | 'name'>;
  createdAt: string;
}

export interface OperationsNote {
  id: string;
  departureId: string;
  content: string;
  authorId: string;
  author: Pick<User, 'id' | 'name'>;
  createdAt: string;
}

export interface DepartureTask {
  id: string;
  departureId: string;
  dayOffset: number;
  title: string;
  description?: string;
  status: DepartureTaskStatus;
  sortOrder: number;
  updatedById?: string;
  updatedBy?: Pick<User, 'id' | 'name'>;
  createdAt: string;
  updatedAt: string;
}

export interface GroupSummary {
  totalTravelers: number;
  maleCount: number;
  femaleCount: number;
  doubleSharingRoomsRequired: number;
  tripleSharingRoomsRequired: number;
  quadSharingRoomsRequired: number;
  extraMattressRequired: number;
  vegMeals: number;
  nonVegMeals: number;
  jainMeals: number;
  childrenCount: number;
  seniorCitizenCount: number;
  pendingPayments: number;
  totalPendingAmount: number;
}

export interface DepartureBooking extends Booking {
  lead: Pick<Lead, 'id' | 'name' | 'phone' | 'email'>;
  travelers: Traveler[];
}

export interface Departure {
  id: string;
  organizationId?: string;
  packageId?: string;
  package?: { id: string; name: string; code: string; nights?: number; days?: number };
  destination: string;
  departureDate: string;
  returnDate?: string;
  status: DepartureStatus;
  tripCaptainName?: string;
  tripCaptainPhone?: string;
  tripCaptainStatus: TripCaptainStatus;
  bookings: DepartureBooking[];
  hotels: Hotel[];
  vehicles: Vehicle[];
  documents: OperationsDocument[];
  notes: OperationsNote[];
  timeline: DepartureTask[];
  groupSummary?: GroupSummary;
  checklist?: Checklist;
  tripProfitability?: TripProfitability;
  journeySummaries?: JourneySummary[];
  createdAt: string;
  updatedAt: string;
}

export interface TripProfitability {
  revenue: number;
  collected: number;
  vendorCost: number;
  expenseCost: number;
  refunds: number;
  netProfit: number;
  marginPct: number;
}

export interface JourneySummary {
  bookingId: string;
  leadId: string;
  leadName: string;
  completedCount: number;
  totalCount: number;
  currentStage: string | null;
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export interface Checklist {
  items: ChecklistItem[];
  completedCount: number;
  totalCount: number;
  progress: number;
}

export interface DepartureListItem {
  id: string;
  packageId?: string;
  package?: { id: string; name: string; code: string };
  destination: string;
  departureDate: string;
  returnDate?: string;
  status: DepartureStatus;
  tripCaptainStatus: TripCaptainStatus;
  totalTravelers: number;
  totalRevenue: number;
  totalPending: number;
  bookingCount: number;
  hotelsPending: number;
  vehiclesPending: number;
}

export interface OpsDashboardStats {
  todaysDepartures: number;
  upcomingDepartures: number;
  activeTrips: number;
  completedTrips: number;
  totalTravelersToday: number;
  pendingHotelBookings: number;
  bookedHotelBookings: number;
  pendingVehicleBookings: number;
  bookedVehicleBookings: number;
  pendingRoomAllocation: number;
  pendingTripCaptainAssignment: number;
  assignedTripCaptains: number;
  roomsRequired: number;
  roomsBooked: number;
  roomsPending: number;
  todaysCheckins: number;
  todaysCheckouts: number;
  todaysTransfers: number;
  upcomingActivities: number;
  totalTravelersOnTour: number;
  pendingTravelerVerification: number;
  checklistProgressAvg: number;
}

export interface StayPlanBookingInfo {
  bookingId: string;
  bookingNumber: string | null;
  travelerName: string;
  numberOfTravelers: number;
  roomSharing: string;
  specialRequest: string | null;
  salesExecutive: { id: string; name: string } | null;
}

export interface StayPlanPackageBreakdown {
  packageId: string;
  packageName: string;
  packageType: 'GIT' | 'FIT' | null;
  guestCount: number;
  rooms: { SINGLE: number; DOUBLE: number; TRIPLE: number; QUAD: number; total: number };
  departureIds: string[];
  checkOutDate: string;
  nights: number;
  bookings: StayPlanBookingInfo[];
}

export interface StayPlanEntry {
  destination: string;
  guestCount: number;
  rooms: { SINGLE: number; DOUBLE: number; TRIPLE: number; QUAD: number; total: number };
  vehicles: { type: string; count: number; seats: number }[];
  departureIds: string[];
  packageNames: string[];
  checkOutDate: string;
  nights: number;
  breakdown: StayPlanPackageBreakdown[];
}

export interface StayPlanDateItem {
  date: string;
  entries: StayPlanEntry[];
}

export interface StayPlanPackageItem {
  packageId: string;
  packageName: string;
  dates: { date: string; destination: string; guestCount: number }[];
}

export type RoomRequirementStatus = 'PENDING' | 'PARTIALLY_BOOKED' | 'FULLY_BOOKED' | 'OVERBOOKED';

export interface RoomsRequiredEntry extends StayPlanEntry {
  roomsBooked: number;
  roomsPending: number;
  status: RoomRequirementStatus;
}

export interface RoomsRequiredDateItem {
  date: string;
  entries: RoomsRequiredEntry[];
}

export interface RoomsRequired {
  dateWise: RoomsRequiredDateItem[];
}

export interface StayPlan {
  dateWise: StayPlanDateItem[];
  packageWise: StayPlanPackageItem[];
}

// ─── Finance Panel ───────────────────────────────────────────────────────────

export type RefundStatus = 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED';
export type VendorPaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
export type VendorServiceType = 'HOTEL' | 'VEHICLE' | 'TRIP_CAPTAIN' | 'LOCAL_GUIDE' | 'LOCAL_VENDOR' | 'ACTIVITY';
export type PendingIndicator = 'PAID' | 'DUE_SOON' | 'OVERDUE';

export interface Refund {
  id: string;
  bookingId: string;
  booking?: Booking & { lead: Pick<Lead, 'id' | 'name' | 'phone'> };
  amount: number;
  reason: string;
  status: RefundStatus;
  transactionId?: string;
  remarks?: string;
  requestedById: string;
  requestedBy: Pick<User, 'id' | 'name'>;
  approvedById?: string;
  approvedBy?: Pick<User, 'id' | 'name'>;
  refundDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VendorLedger extends Vendor {
  payments: VendorPayment[];
  ledger: {
    totalBilled: number;
    totalPaid: number;
    totalOutstanding: number;
    billCount: number;
    overdueCount: number;
  };
}

export interface VendorPayment {
  id: string;
  vendorId: string;
  vendor: Pick<Vendor, 'id' | 'name' | 'type'>;
  departureId?: string;
  departure?: { id: string; destination: string; departureDate: string };
  serviceType: VendorServiceType;
  totalAmount: number;
  advancePaid: number;
  balanceAmount: number;
  dueDate?: string;
  status: VendorPaymentStatus;
  invoiceUrl?: string;
  paymentProofUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | 'HOTEL' | 'VEHICLE' | 'DRIVER' | 'GUIDE' | 'MEALS' | 'PERMITS' | 'FUEL' | 'MISCELLANEOUS'
  | 'OFFICE' | 'MARKETING' | 'SALARY' | 'SOFTWARE' | 'UTILITIES';
export type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  departureId?: string;
  departure?: { id: string; destination: string; departureDate: string };
  packageId?: string;
  package?: { id: string; name: string; code: string };
  vendorId?: string;
  vendor?: { id: string; name: string };
  billUrl?: string;
  status: ExpenseStatus;
  approvedById?: string;
  approvedBy?: Pick<User, 'id' | 'name'>;
  approvedAt?: string;
  rejectionReason?: string;
  createdById: string;
  createdBy: Pick<User, 'id' | 'name'>;
  createdAt: string;
  updatedAt: string;
}

export type PaymentScheduleItemStatus = 'PENDING' | 'PARTIAL' | 'PAID';

export interface PaymentScheduleItem {
  id: string;
  bookingId: string;
  label: string;
  sequence: number;
  amount: number;
  dueDate: string;
  status: PaymentScheduleItemStatus;
  paidAmount: number;
  createdAt: string;
  updatedAt: string;
}

export type FinanceDocumentType = 'TAX_INVOICE' | 'RECEIPT' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'REFUND_VOUCHER';

export interface FinanceDocument {
  id: string;
  type: FinanceDocumentType;
  documentNumber: string;
  bookingId: string;
  paymentId?: string;
  refundId?: string;
  amount: number;
  taxAmount: number;
  status: 'GENERATED' | 'CANCELLED';
  pdfUrl?: string;
  generatedById: string;
  generatedBy: Pick<User, 'id' | 'name'>;
  generatedAt: string;
  createdAt: string;
}

export interface PackageAnalytics {
  id: string; name: string; code: string;
  bookings: number; passengers: number; revenue: number; expenses: number; profit: number;
  averageRating: number | null; cancellationPct: number; upcomingTrips: number; mostPopularMonth: string | null;
}

export interface DestinationAnalytics {
  destination: string; revenue: number; profit: number; trips: number; passengers: number;
  growthPct: number | null; refundPct: number; topPackages: string[];
}

export interface CampaignAnalytics {
  id: string; name: string;
  leadsGenerated: number; bookings: number; revenue: number; expenses: number;
  roi: number | null; costPerLead: number | null; costPerBooking: number | null;
  conversionRatePct: number; bestPerformingMonth: string | null;
}

export interface CustomerAnalyticsRow {
  name: string; phone: string; totalSpending: number; lifetimeValue: number;
  tripsCompleted: number; tripsUpcoming: number; tripsCancelled: number;
  preferredDestination: string | null; preferredPackage: string | null;
  referralCount: number; isReturning: boolean;
}

export interface CustomerAnalytics {
  summary: { totalCustomers: number; returningCustomers: number; averageSpending: number; totalReferrals: number };
  customers: CustomerAnalyticsRow[];
}

export interface EmployeeAnalytics {
  id: string; name: string;
  assignedLeads: number; activeLeads: number; bookings: number; revenueGenerated: number;
  conversionRatePct: number; avgResponseTimeHours: number | null;
  pendingFollowUps: number; completedFollowUps: number;
  // Hours late a follow-up was completed, on average (0 = never counted as
  // early, only genuinely overdue completions raise this) — see
  // analytics.controller.ts's "Known approximations" note for how this is derived.
  avgFollowUpDelayHours: number | null;
  byStatus: Record<LeadStatus, number>;
  taskCompletionRatePct: number | null; customerRating: number | null;
}

export type AutomationTriggerType =
  | 'LEAD_CREATED' | 'BOOKING_CONFIRMED' | 'PAYMENT_OVERDUE' | 'TASK_OVERDUE'
  | 'TRAVELER_VERIFICATION_PENDING' | 'HOTEL_PENDING' | 'VEHICLE_PENDING';
export type AutomationConditionOperator = 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan';
export type AutomationActionType = 'ASSIGN_EMPLOYEE' | 'NOTIFY_EMPLOYEE' | 'NOTIFY_MANAGER' | 'SCHEDULE_FOLLOWUP' | 'SEND_REMINDER';

export interface AutomationCondition {
  field: string;
  operator: AutomationConditionOperator;
  value: string;
}

export interface AutomationAction {
  type: AutomationActionType;
  config: Record<string, string>;
}

export interface AutomationRule {
  id: string;
  name: string;
  triggerType: AutomationTriggerType;
  triggerConfig: Record<string, unknown>;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  delayMinutes: number | null;
  isActive: boolean;
  createdById: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface SystemHealth {
  database: { connected: boolean; pingMs: number };
  jobs: { jobName: string; success: number; failed: number; running: number; lastRun: string | null }[];
  failedJobs24h: number;
  notificationsPending: number;
  storageUsedBytes: number;
  recentErrors: { id: string; message: string; stack?: string; path?: string; method?: string; statusCode?: number; userId?: string; createdAt: string }[];
}

export interface SearchResults {
  leads?: { id: string; name: string; phone: string; status: string }[];
  bookings?: { id: string; bookingNumber?: string; travelerName: string; leadId: string }[];
  payments?: { id: string; amount: number; reference?: string; receiptNo?: string; bookingId: string }[];
  packages?: { id: string; name: string; code: string }[];
  hotels?: { id: string; name: string; departureId: string }[];
  vehicles?: { id: string; vehicleNumber?: string; driverName?: string; departureId: string }[];
  vendors?: { id: string; name: string; type: string }[];
  users?: { id: string; name: string; email: string; role: string }[];
  travelers?: { id: string; name: string; bookingId: string; departureId?: string }[];
}

export interface ExecutiveDashboardStats {
  todaysRevenue: number;
  monthlyRevenue: number;
  outstandingAmount: number;
  collectionsToday: number;
  refundsPending: number;
  upcomingDepartures: number;
  tripsInProgress: number;
  activeBookings: number;
  pendingPayments: number;
  pendingTravelerVerification: number;
  pendingHotelConfirmation: number;
  pendingVehicleConfirmation: number;
  topSellingPackage: { name: string; bookings: number; revenue: number } | null;
  topDestination: { destination: string; revenue: number } | null;
  topCampaign: { name: string; revenue: number } | null;
  topEmployee: { name: string; revenue: number } | null;
  totalCustomers: number;
  newCustomersThisMonth: number;
  customerRetentionPct: number;
  conversionRatePct: number;
  businessHealthScore: number;
  businessHealthBreakdown: {
    collectionRatePct: number;
    checklistProgressAvg: number;
    onTimeReadinessPct: number;
    conversionRatePct: number;
  };
}

export interface FinanceDashboardStats {
  todaysCollections: number;
  monthlyCollections: number;
  totalRevenue: number;
  pendingPaymentVerification: number;
  pendingCustomerBalances: number;
  upcomingDuePayments: number;
  overduePayments: number;
  refundRequests: number;
  vendorPaymentsPending: number;
  todaysExpenses: number;
  pendingExpenseApproval: number;
  profitThisMonth: number;
  topRevenuePackage: { name: string; revenue: number } | null;
  paymentCompletionPct: number;
  cashCollection: number;
  onlineCollection: number;
  upiCollection: number;
  bankTransferCollection: number;
  collectionTrend: Array<{ date: string; amount: number }>;
  revenueByDestination: Array<{ destination: string; revenue: number }>;
  revenueByDeparture: Array<{ id: string; label: string; revenue: number }>;
}

export interface PendingTrackerRow {
  id: string;
  bookingId: string;
  customerName: string;
  phone: string;
  destination: string;
  departureDate?: string;
  pendingAmount: number;
  dueDate?: string;
  daysRemaining: number | null;
  salesEmployee: string;
  indicator: PendingIndicator;
}

export interface CustomerLedger extends Booking {
  lead: Pick<Lead, 'id' | 'name' | 'phone' | 'email'> & { assignedTo?: Pick<User, 'id' | 'name'> };
  package?: { id: string; name: string; code: string };
  departure?: { id: string; destination: string; departureDate: string };
  payments: Payment[];
  refunds: Refund[];
  ledger: {
    packagePrice: number;
    totalPayable: number;
    advanceReceived: number;
    verifiedPayments: number;
    pendingAmount: number;
    balanceDueDate?: string;
    refunds: number;
  };
}
