/**
 * NOTIFICATION SERVICE
 * Handles: SMS via Twilio, Push via Expo, in-app notifications
 */
import twilio from "twilio";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ── SMS ──────────────────────────────────────────────────────────────────────

export async function sendSMS(to: string, body: string): Promise<boolean> {
  try {
    await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to,
    });
    logger.info(`SMS sent to ${to}`);
    return true;
  } catch (err) {
    logger.error("Twilio SMS error", err);
    return false;
  }
}

// ── CALL-IN ALERT ────────────────────────────────────────────────────────────

export async function sendCallInAlert(callInReportId: string): Promise<void> {
  const report = await prisma.callInReport.findUnique({
    where: { id: callInReportId },
    include: {
      staff: true,
      shift: {
        include: {
          unit: {
            include: { facility: true },
          },
        },
      },
    },
  });

  if (!report) throw new Error(`CallInReport ${callInReportId} not found`);

  const staffName  = `${report.staff.firstName} ${report.staff.lastName}`;
  const unitName   = report.shift.unit.name;
  const shiftStart = report.shift.startTime.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });
  const shiftDate  = report.shift.startTime.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  const smsBody = [
    `⚠️ CALL-IN ALERT`,
    `Staff: ${staffName}`,
    `Unit: ${unitName}`,
    `Shift: ${shiftDate} at ${shiftStart}`,
    report.reason ? `Reason: ${report.reason}` : null,
    `Action needed: Find a replacement.`,
  ]
    .filter(Boolean)
    .join("\n");

  // Get all managers for this facility
  const managers = await prisma.user.findMany({
    where: {
      facilityId: report.shift.unit.facilityId,
      role: { in: ["ADMIN", "MANAGER"] },
      isActive: true,
      phone: { not: null },
    },
    select: { id: true, phone: true },
  });

  const smsPromises = managers
    .filter((m) => m.phone)
    .map((m) => sendSMS(m.phone!, smsBody));

  await Promise.allSettled(smsPromises);

  // Update smsSentAt timestamp
  await prisma.callInReport.update({
    where: { id: callInReportId },
    data:  { smsSentAt: new Date() },
  });

  // Also create in-app notifications for managers
  await prisma.notification.createMany({
    data: managers.map((m) => ({
      userId:   m.id,
      title:    "⚠️ Call-In Alert",
      body:     `${staffName} has called in for ${unitName} on ${shiftDate}`,
      type:     "CALL_IN",
      metadata: { callInReportId, shiftId: report.shiftId },
    })),
  });

  logger.info(`Call-in alerts sent for report ${callInReportId}`);
}

// ── IN-APP NOTIFICATION ─────────────────────────────────────────────────────

export async function createNotification(params: {
  userId:   string;
  title:    string;
  body:     string;
  type:     string;
  metadata?: Record<string, string>;
}) {
  return prisma.notification.create({ data: params });
}

// ── PUSH VIA EXPO ────────────────────────────────────────────────────────────

export async function sendExpoPush(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const message = { to: expoPushToken, sound: "default", title, body, data };
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(message),
    });
    const json = await res.json() as any;
    if (json?.data?.status === "error") {
      logger.warn("Expo push error", json.data.details);
    }
  } catch (err) {
    logger.error("Expo push error", err);
  }
}
