import { connectDB } from '@/lib/db';
import { Department } from '@/models/Department';
import { Designation } from '@/models/Designation';
import { Employee } from '@/models/Employee';

const CORE_DEPARTMENTS = [
  { name: 'Counseling', code: 'COUNS', description: 'Candidate counseling and admissions' },
  { name: 'Visa', code: 'VISA', description: 'Visa processing and embassy coordination' },
  { name: 'Training', code: 'TRAIN', description: 'Trade skill training and batch assessments' },
  { name: 'Accounts', code: 'ACCTS', description: 'Fee collections, payroll, and accounting' },
  { name: 'Agent', code: 'AGENT', description: 'Field recruitment agents and referrals' },
  { name: 'Administration', code: 'ADMIN', description: 'HR, office management, and administration' },
  { name: 'Other', code: 'OTHER', description: 'Support and miscellaneous roles' },
];

const CORE_DESIGNATIONS = [
  { name: 'Managing Director', code: 'MD', level: 10, grade_label: 'G10' },
  { name: 'Department Manager', code: 'MGR', level: 8, grade_label: 'G8' },
  { name: 'HR Officer', code: 'HRO', level: 6, grade_label: 'G6' },
  { name: 'Senior Counselor', code: 'SCNS', level: 6, grade_label: 'G6' },
  { name: 'Student Counselor', code: 'CNS', level: 4, grade_label: 'G4' },
  { name: 'Visa Executive', code: 'VISA-EX', level: 5, grade_label: 'G5' },
  { name: 'Trade Instructor', code: 'INST', level: 5, grade_label: 'G5' },
  { name: 'Accounts Officer', code: 'ACCT', level: 5, grade_label: 'G5' },
  { name: 'Field Agent', code: 'AGT', level: 3, grade_label: 'G3' },
  { name: 'Office Assistant', code: 'ASST', level: 2, grade_label: 'G2' },
];

let hrmBaseSeededOnce = false;

export async function ensureDepartmentsAndDesignationsSeeded() {
  if (hrmBaseSeededOnce) return;
  await connectDB();

  for (const d of CORE_DEPARTMENTS) {
    await Department.updateOne(
      { code: d.code },
      { $setOnInsert: { ...d, status: 'Active' } },
      { upsert: true }
    );
  }

  for (const des of CORE_DESIGNATIONS) {
    await Designation.updateOne(
      { code: des.code },
      { $setOnInsert: { ...des, status: 'Active' } },
      { upsert: true }
    );
  }

  // Safely backfill any existing employees that don't yet have department_id or designation_id
  const employeesToLink = await Employee.find({
    $or: [{ department_id: null }, { department_id: { $exists: false } }, { designation_id: null }, { designation_id: { $exists: false } }],
  }).lean();

  if (employeesToLink.length > 0) {
    const allDepts = await Department.find({}).lean();
    const deptByName = new Map(allDepts.map((d) => [d.name.toLowerCase(), d]));

    const allDesigs = await Designation.find({}).lean();
    const desigByName = new Map(allDesigs.map((d) => [d.name.toLowerCase(), d]));

    for (const emp of employeesToLink) {
      const updates: Record<string, unknown> = {};
      if (!emp.department_id && emp.department) {
        let deptDoc = deptByName.get(emp.department.trim().toLowerCase());
        if (!deptDoc) {
          const code = emp.department.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'DEPT';
          deptDoc = await Department.findOneAndUpdate(
            { name: emp.department.trim() },
            { $setOnInsert: { name: emp.department.trim(), code: `${code}-${Date.now().toString().slice(-3)}`, status: 'Active' } },
            { upsert: true, returnDocument: 'after' }
          ).lean() as any;
          if (deptDoc) deptByName.set(deptDoc.name.toLowerCase(), deptDoc);
        }
        if (deptDoc) updates.department_id = deptDoc._id;
      }

      if (!emp.designation_id && emp.designation) {
        let desigDoc = desigByName.get(emp.designation.trim().toLowerCase());
        if (!desigDoc) {
          const code = emp.designation.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'DESIG';
          desigDoc = await Designation.findOneAndUpdate(
            { name: emp.designation.trim() },
            { $setOnInsert: { name: emp.designation.trim(), code: `${code}-${Date.now().toString().slice(-3)}`, level: 4, grade_label: 'G4', status: 'Active' } },
            { upsert: true, returnDocument: 'after' }
          ).lean() as any;
          if (desigDoc) desigByName.set(desigDoc.name.toLowerCase(), desigDoc);
        }
        if (desigDoc) updates.designation_id = desigDoc._id;
      }

      if (Object.keys(updates).length > 0) {
        await Employee.updateOne({ _id: emp._id }, { $set: updates });
      }
    }
  }

  hrmBaseSeededOnce = true;
}

export async function resolveOrCreateDepartment(nameOrId?: string | null) {
  if (!nameOrId) return null;
  await ensureDepartmentsAndDesignationsSeeded();
  if (/^[0-9a-fA-F]{24}$/.test(nameOrId)) {
    const byId = await Department.findById(nameOrId).lean();
    if (byId) return byId;
  }
  const clean = nameOrId.trim();
  let doc = await Department.findOne({ name: new RegExp(`^${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
  if (!doc) {
    const code = clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'DEPT';
    doc = (await Department.create({
      name: clean,
      code: `${code}-${Date.now().toString().slice(-4)}`,
      status: 'Active',
    })).toObject();
  }
  return doc;
}

export async function resolveOrCreateDesignation(nameOrId?: string | null, departmentId?: string | null) {
  if (!nameOrId) return null;
  await ensureDepartmentsAndDesignationsSeeded();
  if (/^[0-9a-fA-F]{24}$/.test(nameOrId)) {
    const byId = await Designation.findById(nameOrId).lean();
    if (byId) return byId;
  }
  const clean = nameOrId.trim();
  let doc = await Designation.findOne({ name: new RegExp(`^${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
  if (!doc) {
    const code = clean.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'DESIG';
    doc = (await Designation.create({
      name: clean,
      code: `${code}-${Date.now().toString().slice(-4)}`,
      level: 4,
      grade_label: 'G4',
      department_id: departmentId || null,
      status: 'Active',
    })).toObject();
  }
  return doc;
}

