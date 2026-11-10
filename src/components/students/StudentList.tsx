'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  UserPlus,
  Users,
  AlertTriangle,
  ChevronRight,
  ArrowUpDown,
  Building,
  Eye,
} from 'lucide-react';
import { formatBDT } from '@/lib/formatters';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/layout/DashboardLayout';

interface StudentListItem {
  _id: string;
  student_no: string;
  name: string;
  photo_url?: string;
  trade_id?: { _id: string; name: string };
  trade_name: string;
  batch: string;
  destination_country: string;
  mobile: string;
  passport_no: string;
  status: string;
  total_paid: number;
  total_due: number;
  fee_snapshot: {
    total_payable: number;
  };
  is_overdue?: boolean;
}

export function StudentList() {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrade, setSelectedTrade] = useState('all');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [trades, setTrades] = useState<any[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);

  // Load trades filter list
  useEffect(() => {
    fetch('/api/trades')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTrades(d.trades || []);
      })
      .catch((e) => console.error(e));
  }, []);

  // Fetch students with debounce
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.set('q', searchQuery);
        if (selectedTrade !== 'all') params.set('trade_id', selectedTrade);
        if (selectedCountry !== 'all') params.set('country', selectedCountry);
        if (selectedStatus !== 'all') params.set('status', selectedStatus);

        const res = await fetch(`/api/students?${params.toString()}`);
        const data = await res.json();

        if (!isCancelled && data.success) {
          setStudents(data.students || []);
          setTotalStudents(data.total || 0);
        }
      } catch (err) {
        console.error('Fetch students error:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedTrade, selectedCountry, selectedStatus]);

  const canAdmit = user?.role === 'Admin' || user?.role === 'Counselor';

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Student Directory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage candidates, view training & visa pipelines, monitor payments, and track overdue installments.
          </p>
        </div>

        {canAdmit && (
          <Link
            href="/admissions/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>New Admission</span>
          </Link>
        )}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box per PRD Section 8: "Search first. Every list has a search box." */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Name, ID, Mobile, Passport..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Trade Filter */}
          <div>
            <select
              value={selectedTrade}
              onChange={(e) => setSelectedTrade(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Trades</option>
              {trades.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Destination Country Filter */}
          <div>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Destinations</option>
              <option value="Saudi Arabia">Saudi Arabia</option>
              <option value="Singapore">Singapore</option>
              <option value="UAE - Dubai">UAE - Dubai</option>
              <option value="Qatar">Qatar</option>
              <option value="Malaysia">Malaysia</option>
              <option value="Not decided yet">Not decided yet</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Passed">Passed</option>
              <option value="Failed">Failed</option>
              <option value="Dropped">Dropped</option>
            </select>
          </div>
        </div>
      </div>

      {/* Students Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Student ID</th>
                <th className="px-5 py-3">Candidate Name</th>
                <th className="px-5 py-3">Trade & Batch</th>
                <th className="px-5 py-3">Destination</th>
                <th className="px-5 py-3">Mobile & Passport</th>
                <th className="px-5 py-3 text-right">Paid</th>
                <th className="px-5 py-3 text-right">Due Balance</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                    Loading student records...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-600 font-medium">No students found matching your criteria</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting the search query or filter tags</p>
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr
                    key={student._id}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                  >
                    {/* Student ID */}
                    <td className="px-5 py-3.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                      <Link href={`/students/${student._id}`} className="hover:underline">
                        {student.student_no}
                      </Link>
                    </td>

                    {/* Name + Photo */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {student.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={student.photo_url}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs uppercase shrink-0 border border-slate-200">
                            {student.name.charAt(0)}
                          </div>
                        )}
                        <span className="font-semibold text-slate-900">{student.name}</span>
                      </div>
                    </td>

                    {/* Trade & Batch */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <p className="font-medium text-slate-800">{student.trade_name}</p>
                      <p className="text-xs text-slate-500 font-mono">Batch: {student.batch}</p>
                    </td>

                    {/* Country */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                        {student.destination_country}
                      </span>
                    </td>

                    {/* Mobile & Passport */}
                    <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs">
                      <p className="text-slate-800">{student.mobile}</p>
                      <p className="text-slate-400 uppercase">{student.passport_no}</p>
                    </td>

                    {/* Paid */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-emerald-700">
                      {formatBDT(student.total_paid)}
                    </td>

                    {/* Due + Overdue badge (PRD Section 5.4: "Show an Overdue tag when an installment is late.") */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end">
                        <span
                          className={`font-mono font-bold ${
                            student.total_due > 0 ? 'text-rose-600' : 'text-slate-500'
                          }`}
                        >
                          {formatBDT(student.total_due)}
                        </span>
                        {student.is_overdue && (
                          <Badge variant="danger" size="sm" className="mt-0.5 animate-pulse">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      <StatusBadge status={student.status} />
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <Link
                        href={`/students/${student._id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 rounded-md transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Profile</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {students.length} of {totalStudents} candidate(s)</span>
          <span className="font-mono">BD Manpower Training & Recruitment ERP</span>
        </div>
      </div>
    </div>
  );
}

