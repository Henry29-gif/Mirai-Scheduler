/**
 * SMS SERVICE (Twilio)
 * Handles automated SMS alerts when a staff member calls in for a shift.
 * Messages are sent to all ADMIN and MANAGER users in the facility.
 */

import twilio from 'twilio';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

let twilioClient: twilio.Twilio | null = null;

function getClient(): twilio.Twilio {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error('Twilio credentials not configured.');
    }
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

interface CallInAlertData {
  staffName: string;
  shiftDate: Date;
  shiftType: string;
  unitName: string;
  reason: string;
  note?: string;
}

/**
 * Sends an SMS to all managers/admins in a facility when a staff member calls in.
 * Returns the phone numbers that were successfully messaged.
 */
export async function sendCallInAlert(
  facilityId: string,
  callInData: CallInAlertData
): Promise<string[]> {
  // Find all managers and admins with phone numbers
  const managers = await prisma.user.findMany({
    where: {
      facilityId,
      role: { in: ['ADMIN', 'MANAGER'] },
      phone: { not: null },
      isActive: true,
    },
    select: { phone: true, firstName: true, lastName: true },
  });

  if (managers.length === 0) {
    logger.warn(`No managers with phone numbers found for facility ${facilityId}`);
    return [];
  }

  const { staffName, shiftDate, shiftType, unitName, reason, note } = callInData;
  const dateStr = shiftDate.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });

  const message = [
    `🚨 CALL-IN ALERT`,
    `Staff: ${staffName}`,
    `Unit: ${unitName}`,
    `Shift: ${shiftType} on ${dateStr}`,
    `Reason: ${reason}`,
    note ? `Note: ${note}` : null,
    `⚠️ This shift needs coverage.`,
  ]
    .filter(Boolean)
    .join('\n');

  const client = getClient();
  const sentTo: string[] = [];

  // Send to each manager in parallel
  const results = await Promise.allSettled(
    managers
      .filter(m => m.phone)
      .map(async (manager) => {
        await client.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: manager.phone!,
        });
        sentTo.push(manager.phone!);
        logger.info(`Call-in SMS sent to ${manager.firstName} ${manager.lastName}`);
      })
  );

  // Log any failures but don't throw — partial delivery is still useful
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      logger.error(`Failed to send SMS to manager: ${result.reason}`);
    }
  });

  return sentTo;
}

/**
 * Sends a generic SMS (used for shift reminders, etc.)
 */
export async function sendSMS(to: string, body: string): Promise<boolean> {
  try {
    const client = getClient();
    await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to,
    });
    return true;
  } catch (err) {
    logger.error(`SMS send failed to ${to}:`, err);
    return false;
  }
}
