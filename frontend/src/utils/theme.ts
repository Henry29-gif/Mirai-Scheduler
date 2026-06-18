/**
 * DESIGN TOKENS
 * Clinical-clean palette — trustworthy navy, warm white, urgent amber for alerts.
 * Deliberately avoids generic healthcare green in favor of a more considered identity.
 */

export const Colors = {
  // Primary — deep navy (authority, trust)
  primary: '#1B3A5C',
  primaryLight: '#2D5A8E',
  primaryDark: '#0F2238',

  // Accent — warm amber (alerts, urgency without panic)
  accent: '#E8A020',
  accentLight: '#F5C460',

  // Status colors
  success: '#2D8A4E',
  successLight: '#EBF7EE',
  warning: '#C47900',
  warningLight: '#FFF4DC',
  danger: '#C0392B',
  dangerLight: '#FDEDEC',
  info: '#1A6EA8',
  infoLight: '#EAF3FB',

  // Shift type colors
  shiftDay: '#1B3A5C',
  shiftEvening: '#6B3F8E',
  shiftNight: '#1A3050',

  // Neutrals
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceSecondary: '#EEF0F3',
  border: '#D8DCE2',
  borderLight: '#ECEEF2',

  // Text
  textPrimary: '#1A1F2E',
  textSecondary: '#5A6478',
  textMuted: '#9198A8',
  textInverse: '#FFFFFF',
};

export const Typography = {
  // Font sizes
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  xxxl: 36,

  // Font weights
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
};

// Shift type display helpers
export const SHIFT_CONFIG = {
  DAY: {
    label: 'Day',
    time: '7:00 AM – 3:00 PM',
    color: Colors.shiftDay,
    bgColor: '#E8EFF7',
    icon: 'sunny',
  },
  EVENING: {
    label: 'Evening',
    time: '3:00 PM – 11:00 PM',
    color: Colors.shiftEvening,
    bgColor: '#F0EAF7',
    icon: 'partly-sunny',
  },
  NIGHT: {
    label: 'Night',
    time: '11:00 PM – 7:00 AM',
    color: Colors.shiftNight,
    bgColor: '#E8EEF5',
    icon: 'moon',
  },
} as const;

export const STATUS_CONFIG = {
  SCHEDULED: { label: 'Scheduled', color: Colors.info, bgColor: Colors.infoLight },
  COMPLETED: { label: 'Completed', color: Colors.success, bgColor: Colors.successLight },
  CALLED_IN: { label: 'Called In', color: Colors.danger, bgColor: Colors.dangerLight },
  OPEN: { label: 'Open', color: Colors.warning, bgColor: Colors.warningLight },
  SWAPPED: { label: 'Swapped', color: Colors.success, bgColor: Colors.successLight },
} as const;
