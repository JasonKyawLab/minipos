"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/utils/formatCurrency";
import toast from "react-hot-toast";
import type { ProductModel, ProductItem, ModifierGroup, ModifierOption } from "@/types";
import { EmptyState, Spinner } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ActiveBadge } from "@/components/ui/Badge";

type Tab = "PRODUCTS" | "MODIFIERS";

export default function ProductsPage() {
  const { shopId, currency, userRole } = useShop();
  const canWrite = ["OWNER", "MANAGER"].includes(userRole);

  const [tab, setTab] = useState<Tab>("PRODUCTS");

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Products</h1>
        <div className="flex items-center gap-1 bg-white border border-[#D3D1C7] rounded-lg p-1">
          {(["PRODUCTS", "MODIFIERS"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                tab === t
                  ? "bg-[#0F2B4C] text-white"
                  : "text-[#5F5E5A] hover:text-[#0F2B4C]"
              }`}
            >
              {t === "PRODUCTS" ? "Products" : "Modifier Groups"}
            </button>
          ))}
        </div>
      </div>

      {tab === "PRODUCTS" ? (
        <ProductsTab shopId={shopId} currency={currency} canWrite={canWrite} />
      ) : (
        <ModifiersTab shopId={shopId} canWrite={canWrite} />
      )}
    </div>
  );
}

// =========================================================
// PRODUCTS TAB
// =========================================================

function ProductsTab({
  shopId,
  currency,
  canWrite,
}: {
  shopId: string;
  currency: string;
  canWrite: boolean;
}) {
  const [models, setModels] = useState<ProductModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selected, setSelected] = useState<ProductModel | null>(null);
  const [items, setItems] = useState<ProductItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [showCreateModel, setShowCreateModel] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelDesc, setModelDesc] = useState("");
  const [modelSaving, setModelSaving] = useState(false);

  const [showCreateItem, setShowCreateItem] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [itemStock, setItemStock] = useState("0");
  const [itemSaving, setItemSaving] = useState(false);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const { data } = await api.get<ProductModel[]>(
        `/api/shops/${shopId}/products/models`
      );
      setModels(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setModelsLoading(false);
    }
  }, [shopId]);

  const loadItems = useCallback(
    async (model: ProductModel) => {
      setItemsLoading(true);
      try {
        const { data } = await api.get<ProductItem[]>(
          `/api/shops/${shopId}/products/models/${model.id}/items`
        );
        setItems(data);
      } catch (err: any) {
        toast.error(getErrorMessage(err.response?.data?.message));
      } finally {
        setItemsLoading(false);
      }
    },
    [shopId]
  );

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  function selectModel(model: ProductModel) {
    setSelected(model);
    loadItems(model);
  }

  async function handleCreateModel(e: React.FormEvent) {
    e.preventDefault();
    if (!modelName.trim()) {
      toast.error("Name is required.");
      return;
    }
    setModelSaving(true);
    try {
      const { data } = await api.post<ProductModel>(
        `/api/shops/${shopId}/products/models`,
        {
          name: modelName.trim(),
          description: modelDesc.trim() || undefined,
        }
      );
      toast.success("Product created.");
      setModelName("");
      setModelDesc("");
      setShowCreateModel(false);
      await loadModels();
      selectModel(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setModelSaving(false);
    }
  }

  async function handleDeleteModel(e: React.MouseEvent, model: ProductModel) {
    // Stop propagation so the row's onClick (selectModel) doesn't fire
    e.stopPropagation();
    if (!confirm(`Delete "${model.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/shops/${shopId}/products/models/${model.id}`);
      toast.success("Product deleted.");
      if (selected?.id === model.id) {
        setSelected(null);
        setItems([]);
      }
      loadModels();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!itemName.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!itemPrice || Number(itemPrice) < 0) {
      toast.error("Valid price is required.");
      return;
    }
    setItemSaving(true);
    try {
      await api.post(
        `/api/shops/${shopId}/products/models/${selected.id}/items`,
        {
          name: itemName.trim(),
          price: Number(itemPrice),
          sku: itemSku.trim() || undefined,
          stock_qty: Number(itemStock),
        }
      );
      toast.success("Item added.");
      setItemName("");
      setItemPrice("");
      setItemSku("");
      setItemStock("0");
      setShowCreateItem(false);
      loadItems(selected);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setItemSaving(false);
    }
  }

  async function handleToggleItemActive(item: ProductItem) {
    if (!selected) return;
    try {
      await api.patch(`/api/shops/${shopId}/products/items/${item.id}/active`, {
        is_active: !item.is_active,
      });
      loadItems(selected);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex gap-4 h-[calc(100vh-180px)]">

      {/* ── Left: Model list ── */}
      <div className="w-[260px] shrink-0 bg-white border border-[#D3D1C7] rounded-lg flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#D3D1C7]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
            placeholder="Search products…"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {modelsLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 bg-[#F1EFE8] rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-[12px] text-[#5F5E5A]">
                {search ? "No products match." : "No products yet."}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {filteredModels.map((model) => {
                const isSelected = selected?.id === model.id;
                return (
                  /*
                   * FIX: Changed from <button> to <div role="button"> so the
                   * delete <button> inside is not a button-inside-button,
                   * which is invalid HTML and causes hydration errors.
                   */
                  <div
                    key={model.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectModel(model)}
                    onKeyDown={(e) => e.key === "Enter" && selectModel(model)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer group ${
                      isSelected
                        ? "bg-[#0F2B4C] text-white"
                        : "hover:bg-[#F1EFE8] text-[#0F2B4C]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p
                        className={`text-[13px] font-medium truncate ${
                          isSelected ? "text-white" : ""
                        }`}
                      >
                        {model.name}
                      </p>
                      {!model.is_active && (
                        <p
                          className={`text-[11px] ${
                            isSelected ? "text-white/60" : "text-[#A32D2D]"
                          }`}
                        >
                          Inactive
                        </p>
                      )}
                    </div>

                    {/* Delete button — only visible on selected row for owners */}
                    {canWrite && isSelected && (
                      <button
                        onClick={(e) => handleDeleteModel(e, model)}
                        className="text-white/60 hover:text-white text-[16px] leading-none ml-1 flex-shrink-0 p-1 rounded"
                        title="Delete product"
                        type="button"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {canWrite && (
          <div className="p-3 border-t border-[#D3D1C7]">
            <button
              onClick={() => setShowCreateModel(true)}
              className="w-full h-8 text-[12px] font-medium text-[#0D7A5F] border border-[#0D7A5F] rounded-lg hover:bg-[#E1F5EE] transition"
            >
              + New product
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Items panel ── */}
      <div className="flex-1 bg-white border border-[#D3D1C7] rounded-lg flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              title="Select a product"
              description="Choose a product from the left to manage its items."
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#D3D1C7]">
              <div>
                <h2 className="text-[15px] font-medium text-[#0F2B4C]">
                  {selected.name}
                </h2>
                {selected.description && (
                  <p className="text-[12px] text-[#5F5E5A]">
                    {selected.description}
                  </p>
                )}
              </div>
              {canWrite && (
                <button
                  onClick={() => setShowCreateItem(true)}
                  className="h-8 px-3 text-[12px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition"
                >
                  + Add item
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {itemsLoading ? (
                <SkeletonTable rows={4} cols={4} />
              ) : items.length === 0 ? (
                <EmptyState
                  title="No items yet"
                  description="Add at least one item (SKU) to this product."
                />
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#F1EFE8] text-[11px] text-[#5F5E5A] font-medium uppercase tracking-wide">
                      <th className="text-left px-5 py-2.5">Name</th>
                      <th className="text-left px-4 py-2.5">SKU</th>
                      <th className="text-right px-4 py-2.5">Price</th>
                      <th className="text-right px-4 py-2.5">Stock</th>
                      <th className="text-left px-4 py-2.5">Status</th>
                      {canWrite && (
                        <th className="text-right px-5 py-2.5">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1EFE8]">
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-[#F1EFE8]/30 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium text-[#0F2B4C]">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-[#5F5E5A]">
                          {item.sku ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(Number(item.price), currency as any)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#5F5E5A]">
                          {item.track_stock ? item.stock_qty : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <ActiveBadge active={item.is_active} />
                        </td>
                        {canWrite && (
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => handleToggleItemActive(item)}
                              className="text-[12px] text-[#534AB7] hover:underline"
                            >
                              {item.is_active ? "Disable" : "Enable"}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create model modal */}
      <Modal
        open={showCreateModel}
        onClose={() => setShowCreateModel(false)}
        title="New Product"
      >
        <form onSubmit={handleCreateModel} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">
              Product name *
            </label>
            <input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="e.g. Coca-Cola"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">
              Description
            </label>
            <input
              value={modelDesc}
              onChange={(e) => setModelDesc(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="Optional"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreateModel(false)}
              disabled={modelSaving}
            >
              Cancel
            </Button>
            <Button type="submit" loading={modelSaving}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create item modal */}
      <Modal
        open={showCreateItem}
        onClose={() => setShowCreateItem(false)}
        title={`Add item to ${selected?.name}`}
      >
        <form onSubmit={handleCreateItem} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">
              Item name *
            </label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="e.g. 330ml"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[13px] font-medium text-[#1A1A1A]">
                Price *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium text-[#1A1A1A]">
                Initial stock
              </label>
              <input
                type="number"
                min="0"
                value={itemStock}
                onChange={(e) => setItemStock(e.target.value)}
                className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">
              SKU (optional)
            </label>
            <input
              value={itemSku}
              onChange={(e) => setItemSku(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="e.g. COKE-330"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreateItem(false)}
              disabled={itemSaving}
            >
              Cancel
            </Button>
            <Button type="submit" loading={itemSaving}>
              Add item
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// =========================================================
// MODIFIERS TAB
// =========================================================

function ModifiersTab({
  shopId,
  canWrite,
}: {
  shopId: string;
  canWrite: boolean;
}) {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, ModifierOption[]>>({});

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupRequired, setGroupRequired] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);

  const [newOptionName, setNewOptionName] = useState<Record<string, string>>({});
  const [newOptionDelta, setNewOptionDelta] = useState<Record<string, string>>({});
  const [optionSaving, setOptionSaving] = useState<Record<string, boolean>>({});

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ModifierGroup[]>(
        `/api/shops/${shopId}/modifiers/groups`
      );
      setGroups(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  async function loadOptions(groupId: string) {
    try {
      const { data } = await api.get<ModifierOption[]>(
        `/api/shops/${shopId}/modifiers/groups/${groupId}/options`
      );
      setOptions((prev) => ({ ...prev, [groupId]: data }));
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  function toggleExpand(groupId: string) {
    if (expanded === groupId) {
      setExpanded(null);
    } else {
      setExpanded(groupId);
      if (!options[groupId]) loadOptions(groupId);
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error("Name is required.");
      return;
    }
    setGroupSaving(true);
    try {
      await api.post(`/api/shops/${shopId}/modifiers/groups`, {
        name: groupName.trim(),
        is_required: groupRequired,
      });
      toast.success("Modifier group created.");
      setGroupName("");
      setGroupRequired(false);
      setShowCreateGroup(false);
      loadGroups();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleAddOption(groupId: string) {
    const name = newOptionName[groupId]?.trim();
    if (!name) {
      toast.error("Option name is required.");
      return;
    }
    setOptionSaving((prev) => ({ ...prev, [groupId]: true }));
    try {
      await api.post(
        `/api/shops/${shopId}/modifiers/groups/${groupId}/options`,
        {
          name,
          price_delta: Number(newOptionDelta[groupId] ?? 0),
        }
      );
      setNewOptionName((prev) => ({ ...prev, [groupId]: "" }));
      setNewOptionDelta((prev) => ({ ...prev, [groupId]: "" }));
      loadOptions(groupId);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setOptionSaving((prev) => ({ ...prev, [groupId]: false }));
    }
  }

  async function handleDeleteOption(groupId: string, optionId: string) {
    try {
      await api.delete(`/api/shops/${shopId}/modifiers/options/${optionId}`);
      loadOptions(groupId);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#5F5E5A]">{groups.length} modifier groups</p>
        {canWrite && (
          <button
            onClick={() => setShowCreateGroup(true)}
            className="h-9 px-4 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition"
          >
            + New group
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={4} cols={3} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No modifier groups"
          description="Create groups like 'Spice Level' or 'Add-ons'."
        />
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <div
              key={group.id}
              className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleExpand(group.id)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F1EFE8]/50 transition-colors"
                type="button"
              >
                <div className="flex items-center gap-2 text-left">
                  <span className="text-[14px] font-medium text-[#0F2B4C]">
                    {group.name}
                  </span>
                  {group.is_required && (
                    <span className="text-[11px] px-1.5 py-0.5 bg-[#FCEBEB] text-[#A32D2D] rounded">
                      Required
                    </span>
                  )}
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className={`transition-transform ${
                    expanded === group.id ? "rotate-180" : ""
                  }`}
                >
                  <path
                    d="M4 6l4 4 4-4"
                    stroke="#5F5E5A"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {expanded === group.id && (
                <div className="border-t border-[#F1EFE8] px-5 py-3 space-y-2">
                  {(options[group.id] ?? []).length === 0 ? (
                    <p className="text-[12px] text-[#5F5E5A]">
                      No options yet. Add one below.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {(options[group.id] ?? []).map((opt) => (
                        <div
                          key={opt.id}
                          className="flex items-center justify-between text-[13px]"
                        >
                          <span className="text-[#0F2B4C]">{opt.name}</span>
                          <div className="flex items-center gap-3">
                            <span
                              className={`${
                                opt.price_delta > 0
                                  ? "text-[#0D7A5F]"
                                  : opt.price_delta < 0
                                  ? "text-[#A32D2D]"
                                  : "text-[#5F5E5A]"
                              }`}
                            >
                              {opt.price_delta > 0
                                ? `+${opt.price_delta}`
                                : opt.price_delta === 0
                                ? "Free"
                                : opt.price_delta}
                            </span>
                            {canWrite && (
                              <button
                                onClick={() =>
                                  handleDeleteOption(group.id, opt.id)
                                }
                                className="text-[#A32D2D] text-[14px] hover:opacity-70"
                                type="button"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {canWrite && (
                    <div className="flex items-center gap-2 pt-2 border-t border-[#F1EFE8]">
                      <input
                        value={newOptionName[group.id] ?? ""}
                        onChange={(e) =>
                          setNewOptionName((p) => ({
                            ...p,
                            [group.id]: e.target.value,
                          }))
                        }
                        className="flex-1 h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                        placeholder="Option name"
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleAddOption(group.id)
                        }
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={newOptionDelta[group.id] ?? ""}
                        onChange={(e) =>
                          setNewOptionDelta((p) => ({
                            ...p,
                            [group.id]: e.target.value,
                          }))
                        }
                        className="w-24 h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                        placeholder="+0.00"
                      />
                      <button
                        onClick={() => handleAddOption(group.id)}
                        disabled={optionSaving[group.id]}
                        className="h-8 px-3 text-[12px] font-medium text-white bg-[#0D7A5F] rounded-md disabled:opacity-50"
                        type="button"
                      >
                        {optionSaving[group.id] ? "…" : "Add"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        title="New Modifier Group"
      >
        <form onSubmit={handleCreateGroup} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">
              Group name *
            </label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="e.g. Spice Level"
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={groupRequired}
              onChange={(e) => setGroupRequired(e.target.checked)}
              className="w-4 h-4 rounded accent-[#0D7A5F]"
            />
            <span className="text-[13px] text-[#1A1A1A]">
              Required (customer must choose)
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreateGroup(false)}
              disabled={groupSaving}
            >
              Cancel
            </Button>
            <Button type="submit" loading={groupSaving}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}