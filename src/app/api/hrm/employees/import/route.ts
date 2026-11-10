import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import {
  Employee,
  EmployeeStatus,
  EmployeeType,
  PaymentMethodType,
} from '@/models/Employee';
import { generateEmployeeId } from '@/models/Counter';
import {
  ensureDepartmentsAndDesignationsSeeded,
  resolveOrCreateDepartment,
  resolveOrCreateDesignation,
} from '@/lib/hrm-seed';
import {
  checkEmployeeUniqueness,
  syncEmployeeContractAndSalaryHistory,
} from '@/lib/employee-validation';

interface ImportBody {
  action: 'preview' | 'confirm';
  csvText: string;
}

interface ParsedEmpRow {
  row: number;
  raw: string;
  employee_id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  department: string;
  designation: string;
  employee_type: EmployeeType;
  basic_salary: number;
  joining_date?: string;
  status: EmployeeStatus;
  biometric_id?: string;
  nid_number?: string;
  shift: string;
  payment_method: PaymentMethodType;
  bank_name?: string;
  bank_account_no?: string;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));
  }
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result.map((v) => v.replace(/^["']|["']$/g, ''));
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as ImportBody;
    const action = body.action || 'preview';
    const rawText = body.csvText || '';

    if (!rawText.trim()) {
      return NextResponse.json({ success: false, message: 'Import text/file is empty.' }, { status: 400 });
    }

    await connectDB();
    await ensureDepartmentsAndDesignationsSeeded();

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return NextResponse.json(
        { success: false, message: 'Provide header row plus at least one employee row.' },
        { status: 400 }
      );
    }

    const delimiter = lines[0].includes('\t') && !lines[0].includes(',') ? '\t' : ',';
    const headers = splitCsvLine(lines[0], delimiter).map((h) => h.toLowerCase().replace(/\s+/g, '_'));

    const colIdx = (aliases: string[]) => {
      for (const a of aliases) {
        const i = headers.indexOf(a);
        if (i !== -1) return i;
      }
      return -1;
    };

    const idxFirst = colIdx(['first_name', 'firstname']);
    const idxLast = colIdx(['last_name', 'lastname']);
    const idxPhone = colIdx(['phone', 'mobile', 'mobile_phone']);
    const idxEmail = colIdx(['email']);
    const idxDept = colIdx(['department', 'dept']);
    const idxDesig = colIdx(['designation', 'title']);
    const idxEmpId = colIdx(['employee_id', 'emp_id', 'id']);
    const idxType = colIdx(['employee_type', 'type']);
    const idxSalary = colIdx(['basic_salary', 'salary']);
    const idxJoin = colIdx(['joining_date', 'join_date']);
    const idxBio = colIdx(['biometric_id', 'bio_id', 'pin']);
    const idxNid = colIdx(['nid', 'nid_number']);
    const idxShift = colIdx(['shift']);
    const idxPayMethod = colIdx(['payment_method']);
    const idxBank = colIdx(['bank_name']);
    const idxAcct = colIdx(['bank_account_no', 'account_no']);

    if (idxFirst === -1 || idxLast === -1 || idxPhone === -1 || idxDept === -1 || idxDesig === -1) {
      return NextResponse.json(
        {
          success: false,
          message:
            'CSV header must include: first_name, last_name, phone, department, designation.',
        },
        { status: 400 }
      );
    }

    const validRows: ParsedEmpRow[] = [];
    const errors: Array<{ row: number; raw: string; message: string }> = [];

    const seenEmpIds = new Set<string>();
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();
    const seenBios = new Set<string>();
    const seenNids = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i];
      const rowNum = i + 1;
      const cols = splitCsvLine(rawLine, delimiter);

      const firstName = (cols[idxFirst] || '').trim();
      const lastName = (cols[idxLast] || '').trim();
      const phone = (cols[idxPhone] || '').trim();
      const department = (cols[idxDept] || '').trim();
      const designation = (cols[idxDesig] || '').trim();
      const employee_id = idxEmpId !== -1 ? (cols[idxEmpId] || '').trim().toUpperCase() : '';
      const email = idxEmail !== -1 ? (cols[idxEmail] || '').trim().toLowerCase() : '';
      const biometric_id = idxBio !== -1 ? (cols[idxBio] || '').trim().toUpperCase() : '';
      const nid_number = idxNid !== -1 ? (cols[idxNid] || '').trim() : '';

      if (!firstName || !lastName || !phone || !department || !designation) {
        errors.push({
          row: rowNum,
          raw: rawLine,
          message: 'Missing required fields (first_name, last_name, phone, department, designation)',
        });
        continue;
      }

      if (employee_id && seenEmpIds.has(employee_id)) {
        errors.push({ row: rowNum, raw: rawLine, message: `Duplicate employee_id "${employee_id}" in file` });
        continue;
      }
      if (seenPhones.has(phone)) {
        errors.push({ row: rowNum, raw: rawLine, message: `Duplicate phone "${phone}" in file` });
        continue;
      }
      if (email && seenEmails.has(email)) {
        errors.push({ row: rowNum, raw: rawLine, message: `Duplicate email "${email}" in file` });
        continue;
      }
      if (biometric_id && seenBios.has(biometric_id)) {
        errors.push({ row: rowNum, raw: rawLine, message: `Duplicate biometric_id "${biometric_id}" in file` });
        continue;
      }
      if (nid_number && seenNids.has(nid_number)) {
        errors.push({ row: rowNum, raw: rawLine, message: `Duplicate nid_number "${nid_number}" in file` });
        continue;
      }

      const dbDup = await checkEmployeeUniqueness({
        employee_id: employee_id || undefined,
        phone,
        email: email || undefined,
        biometric_id: biometric_id || undefined,
        nid_number: nid_number || undefined,
      });
      if (dbDup) {
        errors.push({ row: rowNum, raw: rawLine, message: dbDup });
        continue;
      }

      if (employee_id) seenEmpIds.add(employee_id);
      seenPhones.add(phone);
      if (email) seenEmails.add(email);
      if (biometric_id) seenBios.add(biometric_id);
      if (nid_number) seenNids.add(nid_number);

      const rawType = idxType !== -1 ? (cols[idxType] || 'Permanent').trim() : 'Permanent';
      const empType: EmployeeType = (['Permanent', 'Contract', 'Intern', 'Part-time'].includes(rawType)
        ? rawType
        : 'Permanent') as EmployeeType;

      const rawPay = idxPayMethod !== -1 ? (cols[idxPayMethod] || 'Bank').trim() : 'Bank';
      const payMethod: PaymentMethodType = (['Bank', 'bKash', 'Nagad', 'Cash'].includes(rawPay)
        ? rawPay
        : 'Bank') as PaymentMethodType;

      const salary = idxSalary !== -1 ? Math.max(0, Math.round(Number(cols[idxSalary]) || 0)) : 0;

      validRows.push({
        row: rowNum,
        raw: rawLine,
        employee_id: employee_id || undefined,
        firstName,
        lastName,
        phone,
        email: email || undefined,
        department,
        designation,
        employee_type: empType,
        basic_salary: salary,
        joining_date: idxJoin !== -1 ? cols[idxJoin] : undefined,
        status: 'Active',
        biometric_id: biometric_id || undefined,
        nid_number: nid_number || undefined,
        shift: idxShift !== -1 && cols[idxShift] ? cols[idxShift] : 'Regular',
        payment_method: payMethod,
        bank_name: idxBank !== -1 ? cols[idxBank] : '',
        bank_account_no: idxAcct !== -1 ? cols[idxAcct] : '',
      });
    }

    if (action === 'preview') {
      return NextResponse.json({
        success: true,
        data: {
          totalRows: lines.length - 1,
          validCount: validRows.length,
          errorCount: errors.length,
          errors,
          previewRows: validRows.slice(0, 100),
        },
      });
    }

    let createdCount = 0;
    for (const r of validRows) {
      const deptDoc = await resolveOrCreateDepartment(r.department);
      const desigDoc = await resolveOrCreateDesignation(r.designation, deptDoc?._id?.toString());
      const finalId = r.employee_id || (await generateEmployeeId());

      const emp = await Employee.create({
        employee_id: finalId,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        email: r.email,
        department: deptDoc?.name || r.department,
        department_id: deptDoc?._id || null,
        designation: desigDoc?.name || r.designation,
        designation_id: desigDoc?._id || null,
        employee_type: r.employee_type,
        basic_salary: r.basic_salary,
        commission_rate: (deptDoc?.name || r.department) === 'Agent' ? 5 : 0,
        joining_date: r.joining_date ? new Date(r.joining_date) : new Date(),
        status: 'Active',
        biometric_id: r.biometric_id,
        nid_number: r.nid_number,
        shift: r.shift,
        payment_method: r.payment_method,
        bank_name: r.bank_name,
        bank_account_no: r.bank_account_no,
      });

      if (r.basic_salary > 0) {
        await syncEmployeeContractAndSalaryHistory({
          employeeId: emp._id.toString(),
          basicSalary: r.basic_salary,
          bankName: r.bank_name,
          bankAccountNo: r.bank_account_no,
          startDate: emp.joining_date,
          changedBy: auth.user.name,
          reason: 'Imported via bulk employee CSV',
          isNewEmployee: true,
        });
      }
      createdCount++;
    }

    await createAuditLog({
      user: auth.user,
      action: 'EMPLOYEE_BULK_IMPORT',
      entity: 'Employee',
      newValues: { createdCount, errorCount: errors.length },
    });

    return NextResponse.json({
      success: true,
      message: `Imported ${createdCount} employee(s) successfully${
        errors.length ? ` (${errors.length} row(s) skipped due to validation errors)` : ''
      }.`,
      data: { createdCount, errorCount: errors.length, errors },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Employee bulk import failed';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

