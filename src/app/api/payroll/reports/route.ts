import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Payslip } from '@/models/Payslip';
import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    void Employee;
    void EmployeeContract;

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
    const reportType = searchParams.get('reportType') || 'register';
    const format = searchParams.get('format') || 'json';

    const payslips = await Payslip.find({
      month,
      year,
      status: { $ne: 'Cancelled' },
    })
      .populate('employee_id', 'employee_id firstName lastName department designation phone')
      .populate('contract_id', 'bank_name bank_account_no')
      .sort({ payslip_no: 1 })
      .lean();

    if (reportType === 'department_summary') {
      const deptMap = new Map<
        string,
        {
          department: string;
          employees: number;
          basic_pay: number;
          total_allowances: number;
          gross_pay: number;
          total_deductions: number;
          net_pay: number;
        }
      >();

      for (const p of payslips as any[]) {
        const dept = p.employee_id?.department || 'Other';
        const cur = deptMap.get(dept) || {
          department: dept,
          employees: 0,
          basic_pay: 0,
          total_allowances: 0,
          gross_pay: 0,
          total_deductions: 0,
          net_pay: 0,
        };
        cur.employees += 1;
        cur.basic_pay += p.basic_pay || 0;
        cur.total_allowances += p.total_allowances || 0;
        cur.gross_pay += p.gross_pay || 0;
        cur.total_deductions += p.total_deductions || 0;
        cur.net_pay += p.net_pay || 0;
        deptMap.set(dept, cur);
      }

      const rows = Array.from(deptMap.values()).sort((a, b) => b.net_pay - a.net_pay);
      if (format === 'csv') {
        const headers = [
          'Department',
          'Employees',
          'Basic Pay (BDT)',
          'Allowances (BDT)',
          'Gross Pay (BDT)',
          'Deductions (BDT)',
          'Net Pay (BDT)',
        ];
        const lines = [
          headers.join(','),
          ...rows.map((r) =>
            [
              csvEscape(r.department),
              r.employees,
              r.basic_pay,
              r.total_allowances,
              r.gross_pay,
              r.total_deductions,
              r.net_pay,
            ].join(',')
          ),
        ].join('\n');
        return new NextResponse(lines, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="Department_Salary_Summary_${year}_${month}.csv"`,
          },
        });
      }

      return NextResponse.json({ success: true, data: { month, year, reportType, rows } });
    }

    if (reportType === 'tax_summary') {
      const rows = (payslips as any[]).map((p) => {
        const tdsLine = (p.lines || []).find((l: any) => l.code === 'TDS');
        const pfLine = (p.lines || []).find((l: any) => l.code === 'PF');
        return {
          payslip_no: p.payslip_no,
          employee_id: p.employee_id?.employee_id || '',
          employee_name: `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
          department: p.employee_id?.department || '',
          gross_pay: p.gross_pay || 0,
          tds_amount: tdsLine?.amount || 0,
          pf_amount: pfLine?.amount || 0,
          total_deductions: p.total_deductions || 0,
          status: p.status,
        };
      });

      if (format === 'csv') {
        const headers = [
          'Payslip No',
          'Employee ID',
          'Employee Name',
          'Department',
          'Gross Pay (BDT)',
          'Income Tax / TDS (BDT)',
          'Provident Fund (BDT)',
          'Total Deductions (BDT)',
          'Status',
        ];
        const lines = [
          headers.join(','),
          ...rows.map((r) =>
            [
              csvEscape(r.payslip_no),
              csvEscape(r.employee_id),
              csvEscape(r.employee_name),
              csvEscape(r.department),
              r.gross_pay,
              r.tds_amount,
              r.pf_amount,
              r.total_deductions,
              csvEscape(r.status),
            ].join(',')
          ),
        ].join('\n');
        return new NextResponse(lines, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="Tax_TDS_Summary_${year}_${month}.csv"`,
          },
        });
      }

      return NextResponse.json({ success: true, data: { month, year, reportType, rows } });
    }

    if (reportType === 'bank_transfer') {
      const rows = (payslips as any[]).map((p) => ({
        payslip_no: p.payslip_no,
        employee_id: p.employee_id?.employee_id || '',
        beneficiary_name: `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
        phone: p.employee_id?.phone || '',
        department: p.employee_id?.department || '',
        bank_name: p.contract_id?.bank_name || 'Cash / Not Set',
        bank_account_no: p.contract_id?.bank_account_no || '—',
        net_pay: p.net_pay || 0,
        status: p.status,
      }));

      if (format === 'csv') {
        const headers = [
          'Payslip No',
          'Employee ID',
          'Beneficiary Name',
          'Mobile',
          'Department',
          'Bank Name',
          'Account Number',
          'Transfer Amount (BDT)',
          'Payslip Status',
        ];
        const lines = [
          headers.join(','),
          ...rows.map((r) =>
            [
              csvEscape(r.payslip_no),
              csvEscape(r.employee_id),
              csvEscape(r.beneficiary_name),
              csvEscape(r.phone),
              csvEscape(r.department),
              csvEscape(r.bank_name),
              csvEscape(r.bank_account_no),
              r.net_pay,
              csvEscape(r.status),
            ].join(',')
          ),
        ].join('\n');
        return new NextResponse(lines, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="Bank_Transfer_Sheet_${year}_${month}.csv"`,
          },
        });
      }

      return NextResponse.json({ success: true, data: { month, year, reportType, rows } });
    }

    // Default: Monthly Payroll Register (all employees)
    const rows = (payslips as any[]).map((p) => ({
      payslip_no: p.payslip_no,
      employee_id: p.employee_id?.employee_id || '',
      employee_name: `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
      department: p.employee_id?.department || '',
      designation: p.employee_id?.designation || '',
      basic_pay: p.basic_pay || 0,
      total_allowances: p.total_allowances || 0,
      gross_pay: p.gross_pay || 0,
      total_deductions: p.total_deductions || 0,
      net_pay: p.net_pay || 0,
      status: p.status,
    }));

    if (format === 'csv') {
      const headers = [
        'Payslip No',
        'Employee ID',
        'Employee Name',
        'Department',
        'Designation',
        'Basic Pay (BDT)',
        'Allowances (BDT)',
        'Gross Pay (BDT)',
        'Total Deductions (BDT)',
        'Net Pay (BDT)',
        'Status',
      ];
      const lines = [
        headers.join(','),
        ...rows.map((r) =>
          [
            csvEscape(r.payslip_no),
            csvEscape(r.employee_id),
            csvEscape(r.employee_name),
            csvEscape(r.department),
            csvEscape(r.designation),
            r.basic_pay,
            r.total_allowances,
            r.gross_pay,
            r.total_deductions,
            r.net_pay,
            csvEscape(r.status),
          ].join(',')
        ),
      ].join('\n');
      return new NextResponse(lines, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Monthly_Payroll_Register_${year}_${month}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: { month, year, reportType, rows } });
  } catch (error: any) {
    console.error('GET /api/payroll/reports error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate payroll report' },
      { status: 500 }
    );
  }
}

