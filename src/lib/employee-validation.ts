import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryHistory } from '@/models/SalaryHistory';
import { WorkingSchedule } from '@/models/WorkingSchedule';
import { SalaryStructure } from '@/models/SalaryStructure';
import { ensurePayrollSeeded } from '@/lib/payroll-seed';

export interface EmployeeUniquenessInput {
  excludeId?: string;
  employee_id?: string;
  email?: string;
  phone?: string;
  nid_number?: string;
  biometric_id?: string;
  userId?: string | null;
}

/**
 * Shared uniqueness guard across Employee POST, PUT, and Bulk Import.
 */
export async function checkEmployeeUniqueness(
  input: EmployeeUniquenessInput
): Promise<string | null> {
  const neFilter = input.excludeId ? { _id: { $ne: input.excludeId } } : {};

  if (input.employee_id) {
    const cleanEmpId = input.employee_id.trim().toUpperCase();
    const dup = await Employee.findOne({ employee_id: cleanEmpId, ...neFilter }).lean();
    if (dup) return `Employee ID "${cleanEmpId}" already exists.`;
  }

  if (input.email && input.email.trim()) {
    const cleanEmail = input.email.trim().toLowerCase();
    const dup = await Employee.findOne({ email: cleanEmail, ...neFilter }).lean();
    if (dup) return `Email "${cleanEmail}" is already assigned to ${dup.employee_id}.`;
  }

  if (input.phone && input.phone.trim()) {
    const cleanPhone = input.phone.trim();
    const dup = await Employee.findOne({ phone: cleanPhone, is_deleted: { $ne: true }, ...neFilter }).lean();
    if (dup) return `Phone "${cleanPhone}" is already assigned to ${dup.employee_id}.`;
  }

  if (input.nid_number && input.nid_number.trim()) {
    const cleanNid = input.nid_number.trim();
    const dup = await Employee.findOne({ nid_number: cleanNid, ...neFilter }).lean();
    if (dup) return `NID "${cleanNid}" is already registered under ${dup.employee_id}.`;
  }

  if (input.biometric_id && input.biometric_id.trim()) {
    const cleanBio = input.biometric_id.trim().toUpperCase();
    const dup = await Employee.findOne({ biometric_id: cleanBio, ...neFilter }).lean();
    if (dup) return `Biometric ID "${cleanBio}" is already assigned to ${dup.employee_id}.`;
  }

  if (input.userId && input.userId.trim()) {
    const dup = await Employee.findOne({ userId: input.userId.trim(), ...neFilter }).lean();
    if (dup) return `Selected ERP user is already linked to ${dup.employee_id}.`;
  }

  return null;
}

/**
 * Resolve schedule by shift name or explicit ID.
 */
export async function resolveOptionalScheduleId(
  scheduleId?: string | null,
  shift?: string
): Promise<string | null> {
  if (scheduleId && /^[0-9a-fA-F]{24}$/.test(scheduleId)) {
    return scheduleId;
  }
  if (shift && shift !== 'Regular') {
    const sched = await WorkingSchedule.findOne({ shift, active: true }).select('_id').lean();
    if (sched) return sched._id.toString();
  }
  return null;
}

/**
 * Sync Employee Contract and SalaryHistory when salary or salary structure is configured.
 */
export async function syncEmployeeContractAndSalaryHistory(params: {
  employeeId: string;
  basicSalary: number;
  previousBasicSalary?: number;
  structureId?: string | null;
  bankName?: string;
  bankAccountNo?: string;
  startDate?: Date;
  changedBy: string;
  reason?: string;
  isNewEmployee?: boolean;
}) {
  await ensurePayrollSeeded();

  let targetStructureId = params.structureId;
  if (!targetStructureId) {
    const activeContract = await EmployeeContract.findOne({
      employee_id: params.employeeId,
      status: 'Active',
    }).lean();
    if (activeContract) {
      targetStructureId = activeContract.structure_id.toString();
    } else if (params.isNewEmployee && params.basicSalary > 0) {
      const defStruct = await SalaryStructure.findOne({ active: true }).sort({ createdAt: 1 }).lean();
      if (defStruct) targetStructureId = defStruct._id.toString();
    }
  }

  if (targetStructureId) {
    const existingActive = await EmployeeContract.findOne({
      employee_id: params.employeeId,
      status: 'Active',
    });

    if (existingActive) {
      existingActive.structure_id = targetStructureId as unknown as typeof existingActive.structure_id;
      existingActive.basic_salary = params.basicSalary;
      if (params.bankName !== undefined) existingActive.bank_name = params.bankName;
      if (params.bankAccountNo !== undefined) existingActive.bank_account_no = params.bankAccountNo;
      await existingActive.save();
    } else {
      await EmployeeContract.create({
        employee_id: params.employeeId,
        structure_id: targetStructureId,
        basic_salary: params.basicSalary,
        start_date: params.startDate || new Date(),
        status: 'Active',
        bank_name: params.bankName || '',
        bank_account_no: params.bankAccountNo || '',
        notes: params.reason || 'Synced via Employee Management',
      });
    }
  }

  const prev = params.previousBasicSalary ?? 0;
  if (params.isNewEmployee || prev !== params.basicSalary) {
    await SalaryHistory.create({
      employee_id: params.employeeId,
      previous_basic: prev,
      new_basic: params.basicSalary,
      structure_id: targetStructureId || null,
      effective_date: new Date(),
      reason: params.reason || (params.isNewEmployee ? 'Initial joining salary' : 'Salary updated'),
      changed_by: params.changedBy,
    });
  }
}

