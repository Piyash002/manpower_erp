'use client';

import React from 'react';
import { MapPin } from 'lucide-react';
import { BD_DISTRICTS, BD_DISTRICT_UPAZILAS } from '@/lib/bd-locations';

export interface AddressValue {
  district: string;
  upazila: string;
  details: string;
  customDistrict: boolean;
  customUpazila: boolean;
}

export function composeAddressString(val: AddressValue): string {
  return [val.details.trim(), val.upazila.trim(), val.district.trim()]
    .filter(Boolean)
    .join(', ');
}

interface AddressSelectorProps {
  label: string;
  value: AddressValue;
  onChange: (next: AddressValue, composed: string) => void;
  headerRight?: React.ReactNode;
  required?: boolean;
}

export function AddressSelector({
  label,
  value,
  onChange,
  headerRight,
  required = true,
}: AddressSelectorProps) {
  const upazilaOptions =
    !value.customDistrict && value.district && BD_DISTRICT_UPAZILAS[value.district]
      ? BD_DISTRICT_UPAZILAS[value.district]
      : [];

  const update = (patch: Partial<AddressValue>) => {
    const next = { ...value, ...patch };
    onChange(next, composeAddressString(next));
  };

  const composed = composeAddressString(value);

  return (
    <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-semibold text-slate-700 uppercase flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-blue-600" />
          <span>{label}</span>
        </label>
        {headerRight}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* District (জেলা) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-600">
              District (জেলা)
            </span>
            {value.customDistrict && (
              <button
                type="button"
                onClick={() => update({ customDistrict: false, district: '', upazila: '' })}
                className="text-[11px] text-blue-600 hover:underline font-medium"
              >
                Select from list
              </button>
            )}
          </div>

          {value.customDistrict ? (
            <input
              type="text"
              value={value.district}
              onChange={(e) => update({ district: e.target.value })}
              placeholder="Type custom district..."
              className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <select
              value={value.district}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__CUSTOM__') {
                  update({ customDistrict: true, district: '', customUpazila: true, upazila: '' });
                } else {
                  update({ district: v, upazila: '', customUpazila: false });
                }
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select District --</option>
              {BD_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value="__CUSTOM__">✎ Custom / Type Manually...</option>
            </select>
          )}
        </div>

        {/* Upazila / Thana (থানা / উপজেলা) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-600">
              Thana / Upazila (থানা / উপজেলা)
            </span>
            {value.customUpazila && upazilaOptions.length > 0 && (
              <button
                type="button"
                onClick={() => update({ customUpazila: false, upazila: '' })}
                className="text-[11px] text-blue-600 hover:underline font-medium"
              >
                Select from list
              </button>
            )}
          </div>

          {value.customUpazila || upazilaOptions.length === 0 ? (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={value.upazila}
                onChange={(e) => update({ upazila: e.target.value })}
                placeholder={
                  value.district
                    ? 'Type Thana / Upazila...'
                    : 'Select District or type Thana...'
                }
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <select
              value={value.upazila}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__CUSTOM__') {
                  update({ customUpazila: true, upazila: '' });
                } else {
                  update({ upazila: v });
                }
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Thana / Upazila --</option>
              {upazilaOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              <option value="__CUSTOM__">✎ Custom / Type Manually...</option>
            </select>
          )}
        </div>
      </div>

      {/* Detailed Street / House / Village / Post Office */}
      <div>
        <span className="block text-[11px] font-semibold text-slate-600 mb-1">
          House / Road / Village / Post Office *
        </span>
        <input
          type="text"
          required={required}
          value={value.details}
          onChange={(e) => update({ details: e.target.value })}
          placeholder="e.g. House 12, Road 4, Block B / Vill: ..., PO: ..."
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {composed && (
        <p className="text-[11px] text-slate-500 bg-white px-2.5 py-1.5 rounded-md border border-slate-200/80">
          Saved Address: <strong className="text-slate-800">{composed}</strong>
        </p>
      )}
    </div>
  );
}
