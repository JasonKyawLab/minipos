"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import { Spinner } from "@/components/states";

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();

  const [name, setName]   = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);

  const [currPw, setCurrPw]     = useState("");
  const [newPw, setNewPw]       = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  function getInitials(n: string) {
    return n.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required."); return; }
    setSaving(true);
    try {
      await api.patch("/api/users/me", { name: name.trim(), email: email.trim() || undefined });
      await refresh();
      toast.success("Profile updated.");
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setSaving(false); }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { toast.error("Passwords do not match."); return; }
    if (newPw.length < 6)   { toast.error("Password must be at least 6 characters."); return; }
    setChangingPw(true);
    try {
      await api.post("/api/users/me/change-password", { currentPassword: currPw, newPassword: newPw });
      toast.success("Password changed. Please log in again.");
      await logout();
      router.push("/login");
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setChangingPw(false); }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") { toast.error('Type DELETE to confirm.'); return; }
    setDeleting(true);
    try {
      await api.delete("/api/users/me");
      toast.success("Account deleted.");
      router.push("/login");
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setDeleting(false); }
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <h1 className="text-[22px] font-medium text-[#0F2B4C]">My Profile</h1>

      {/* Avatar + Info */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#0D7A5F] flex items-center justify-center text-white text-[18px] font-medium flex-shrink-0">
          {getInitials(user.name)}
        </div>
        <div>
          <p className="text-[16px] font-medium text-[#0F2B4C]">{user.name}</p>
          <p className="text-[13px] text-[#5F5E5A]">{user.email}</p>
          <span className="inline-block mt-1 px-2 py-0.5 text-[11px] font-medium bg-[#E1F5EE] text-[#0D7A5F] rounded">
            {user.role}
          </span>
        </div>
      </div>

      {/* Edit profile */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg p-5">
        <h2 className="text-[16px] font-medium text-[#0F2B4C] mb-4">Edit Profile</h2>
        <form onSubmit={handleProfileSave} className="space-y-3">
          <div>
            <label className="block text-[13px] text-[#5F5E5A] mb-1">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-[13px] text-[#5F5E5A] mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
              placeholder="your@email.com"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition"
          >
            {saving && <Spinner size={14} />}
            Save changes
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg p-5">
        <h2 className="text-[16px] font-medium text-[#0F2B4C] mb-4">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          {[
            { label: "Current password", value: currPw, set: setCurrPw },
            { label: "New password",     value: newPw,   set: setNewPw },
            { label: "Confirm new password", value: confirmPw, set: setConfirmPw },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-[13px] text-[#5F5E5A] mb-1">{label}</label>
              <input
                type="password"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={changingPw}
            className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50 hover:bg-opacity-90 transition"
          >
            {changingPw && <Spinner size={14} />}
            Update password
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="bg-[#FCEBEB] border border-[#A32D2D] rounded-lg p-5">
        <h2 className="text-[16px] font-medium text-[#A32D2D] mb-1">Danger Zone</h2>
        <p className="text-[13px] text-[#A32D2D] mb-3">
          Deleting your account is permanent and cannot be undone.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-4 h-9 text-[13px] font-medium text-[#A32D2D] bg-[#FCEBEB] border border-[#A32D2D] rounded-lg hover:bg-[#A32D2D] hover:text-white transition"
        >
          Delete my account
        </button>
      </div>

      {/* Delete confirm modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-[#D3D1C7] p-6 w-full max-w-md shadow-md">
            <h3 className="text-[16px] font-medium text-[#0F2B4C] mb-2">Delete account</h3>
            <p className="text-[13px] text-[#5F5E5A] mb-4">
              This action is permanent. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-[#A32D2D]"
              placeholder="DELETE"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 h-9 text-[13px] text-[#5F5E5A] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirm !== "DELETE"}
                className="flex items-center gap-2 px-4 h-9 text-[13px] font-medium text-white bg-[#A32D2D] rounded-lg disabled:opacity-50"
              >
                {deleting && <Spinner size={14} />}
                Delete account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}