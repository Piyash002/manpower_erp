import { connectDB } from '@/lib/db';
import { WorkingSchedule } from '@/models/WorkingSchedule';
import { Holiday } from '@/models/Holiday';

let attendanceSeededOnce = false;

export async function ensureAttendanceSeeded() {
  if (attendanceSeededOnce) return;
  await connectDB();

  // 1. Ensure default Sun-Thu 09:00-18:00 Working Schedule exists
  let defaultSched = await WorkingSchedule.findOne({ is_default: true });
  if (!defaultSched) {
    defaultSched = await WorkingSchedule.findOne({ code: 'REG-SUN-THU' });
    if (defaultSched) {
      defaultSched.is_default = true;
      await defaultSched.save();
    } else {
      await WorkingSchedule.create({
        name: 'Regular Sun–Thu (09:00–18:00)',
        code: 'REG-SUN-THU',
        department: '',
        working_days: [0, 1, 2, 3, 4], // Sun, Mon, Tue, Wed, Thu (Fri & Sat off)
        start_time: '09:00',
        end_time: '18:00',
        grace_minutes: 10,
        standard_hours: 8,
        half_day_hours: 4,
        overtime_after_hours: 8,
        overtime_multiplier: 1.5,
        overtime_needs_approval: false,
        late_rule_enabled: true,
        late_days_per_deduction: 3,
        is_default: true,
        active: true,
      });
    }
  }

  // 2. Seed sample Bangladesh holidays if collection is empty
  const holidayCount = await Holiday.countDocuments();
  if (holidayCount === 0) {
    const y = new Date().getFullYear();
    const samples = [
      { title: 'International Mother Language Day', date: new Date(Date.UTC(y, 1, 21)), type: 'Government' },
      { title: 'Independence Day', date: new Date(Date.UTC(y, 2, 26)), type: 'Government' },
      { title: 'May Day', date: new Date(Date.UTC(y, 4, 1)), type: 'Government' },
      { title: 'Victory Day', date: new Date(Date.UTC(y, 11, 16)), type: 'Government' },
    ];
    for (const h of samples) {
      await Holiday.updateOne(
        { date: h.date, title: h.title },
        { $setOnInsert: { ...h, active: true } },
        { upsert: true }
      );
    }
  }

  attendanceSeededOnce = true;
}

