"use client";
// components/ui/Input.tsx
// Standardised input and select components that match
// the MiniPOS design system exactly — consistent focus
// rings, error states, and label styles across all forms.

import React from "react";
import { clsx } from "clsx";

// ── Text / Password / Email / Number Input ────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-[#1A1A1A]">
          {label}
          {props.required && <span className="text-[#A32D2D] ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          "w-full h-9 px-3 text-[14px] border rounded-lg transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-offset-1",
          error
            ? "border-[#A32D2D] focus:ring-[#A32D2D]"
            : "border-[#D3D1C7] focus:ring-[#0D7A5F]",
          props.disabled && "opacity-50 cursor-not-allowed bg-[#F1EFE8]",
          className
        )}
        {...props}
      />
      {error && <p className="text-[12px] text-[#A32D2D]">{error}</p>}
      {hint && !error && <p className="text-[12px] text-[#5F5E5A]">{hint}</p>}
    </div>
  );
}

// ── Textarea ──────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-[#1A1A1A]">
          {label}
          {props.required && <span className="text-[#A32D2D] ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        className={clsx(
          "w-full px-3 py-2 text-[14px] border rounded-lg resize-none transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-offset-1",
          error
            ? "border-[#A32D2D] focus:ring-[#A32D2D]"
            : "border-[#D3D1C7] focus:ring-[#0D7A5F]",
          props.disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        rows={props.rows ?? 3}
        {...props}
      />
      {error && <p className="text-[12px] text-[#A32D2D]">{error}</p>}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, options, className, id, ...props }: SelectProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-[#1A1A1A]">
          {label}
          {props.required && <span className="text-[#A32D2D] ml-0.5">*</span>}
        </label>
      )}
      <select
        id={inputId}
        className={clsx(
          "w-full h-9 px-3 text-[14px] border rounded-lg bg-white transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-offset-1",
          error
            ? "border-[#A32D2D] focus:ring-[#A32D2D]"
            : "border-[#D3D1C7] focus:ring-[#0D7A5F]",
          props.disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-[12px] text-[#A32D2D]">{error}</p>}
    </div>
  );
}