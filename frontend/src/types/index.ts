export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF';
export type ShiftType = 'DAY' | 'EVENING' | 'NIGHT';
export type ShiftStatus = 'SCHEDULED' | 'COMPLETED' | 'CALLED_IN' | 'OPEN' | 'SWAPPED';
export type SwapStatus = 'PENDING' | 'ACCEPTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type CallInReason = 'SICK' | 'FAMILY_EMERGENCY' | 'PERSONAL' | 'OTHER';
export type NotificationType =
  | 'SHIFT_ASSIGNED'
  | 'SHIFT_REMINDER'
  | 'SWAP_REQUEST'
  | 'SWAP_APPROVED'
  | 'SWAP_REJECTED'
  | 'CALL_IN_ALERT'
  | 'SCHEDULE_PUBLISHED'
  | 'OPEN_SHIFT_AVAILABLE';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  position?: string;
  phone?: string;
  hoursPerWeek: number;
  facilityId: string;
  units?: UserUnit[];
}

export interface Unit {
  id: string;
  name: string;
  requiredStaffPerShift: number;
  facilityId: string;
}

export interface UserUnit {
  userId: string;
  unitId: string;
  isPrimary: boolean;
  unit: Unit;
}

export interface Shift {
  id: string;
  unitId: string;
  unit: { id: string; name: string };
  assignedToId?: string;
  assignedTo?: Pick<User, 'id' | 'firstName' | 'lastName' | 'position'>;
  date: string;
  startTime: string;
  endTime: string;
  shiftType: ShiftType;
  status: ShiftStatus;
  hoursCount: number;
  isPublished: boolean;
  notes?: string;
  clockIn?: {
    clockInAt?: string;
    clockOutAt?: string;
    actualHours?: number;
  };
  swapRequest?: {
    id: string;
    status: SwapStatus;
  };
}

export interface ShiftSwap {
  id: string;
  originalShiftId: string;
  originalShift: Shift;
  requesterId: string;
  requester: Pick<User, 'id' | 'firstName' | 'lastName'>;
  targetId?: string;
  target?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  offeredShiftId?: string;
  status: SwapStatus;
  requesterNote?: string;
  managerNote?: string;
  createdAt: string;
}

export interface ClockIn {
  id: string;
  shiftId: string;
  clockInAt?: string;
  clockOutAt?: string;
  actualHours?: number;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  sentAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
