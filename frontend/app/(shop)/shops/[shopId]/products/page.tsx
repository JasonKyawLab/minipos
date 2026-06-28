// =========================================================
// app/(shop)/shops/[shopId]/products/page.tsx
//
// CHANGES:
//   - Added track_stock toggle to Create Item modal.
//     When OFF, "Initial stock" field is hidden (irrelevant).
//   - Added track_stock toggle to Edit Item modal.
//     openEditItem now reads item.track_stock from DB so the
//     toggle is pre-filled correctly on open.
//   - handleCreateItem sends track_stock + stock_qty only
//     when tracking is enabled.
//   - handleEditItem sends track_stock on every save.
//   - Reset itemTrackStock to true when create modal closes.
//
//   - CHANGED: ProductsTab's two side-by-side panels (model
//     list + item detail) now stack vertically below `lg`
//     (1024px) instead of always sitting side-by-side. The
//     260px left panel was fixed-width regardless of screen
//     size, which squeezed the right panel before its own
//     table even got a chance to render.
//   - CHANGED: items table now uses the shared TableHead/Th/
//     TableBody/Tr/Td components inside an overflow-x-auto
//     wrapper — fixes Actions getting clipped on narrower
//     screens. Not using the full Table component here since
//     this table already lives inside its own card (the right
//     panel), so wrapping it again would nest two cards.
//
//   - CHANGED (pagination): GET /products/models now returns
//     { data, pagination } instead of a raw array, since the
//     backend paginates the catalog (retail/online shops can
//     have hundreds of SKUs). ProductsTab's loadModels now
//     sends page/pageSize/search to the server instead of
//     filtering client-side, and renders a Pagination control
//     under the model list. ModifiersTab's buildLinkedMap also
//     calls this same endpoint to build its "which products are
//     linked to this modifier group" map — it needs the FULL
//     catalog, not one page, so it requests the max page size
//     (100) and unwraps `.data`. NOTE: if a shop ever exceeds
//     100 products, the modifier-linking view will only see the
//     first 100 — flagged inline below as a known limitation
//     rather than silently breaking.
// =========================================================

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useShop }            from "@/context/ShopContext";
import api                    from "@/lib/api";
import { getErrorMessage }    from "@/utils/errorMessages";
import { formatCurrency }     from "@/utils/formatCurrency";
import toast                  from "react-hot-toast";
import type {
  ProductCategory,
  ProductModel,
  ProductItem,
  ModifierGroup,
  ModifierOption,
} from "@/types";
import { EmptyState }         from "@/components/states";
import { SkeletonTable }      from "@/components/ui/Skeleton";
import { Modal }              from "@/components/ui/Modal";
import { Button }             from "@/components/ui/Button";
import { ActiveBadge }        from "@/components/ui/Badge";
import { TableHead, Th, TableBody, Tr, Td } from "@/components/ui/Table";
import { Pagination, type PaginationMeta } from "@/components/ui/Pagination";

type Tab = "PRODUCTS" | "CATEGORIES" | "MODIFIERS";

// Shape returned by the now-paginated GET /products/models endpoint.
interface PaginatedModelsResponse {
  data: ProductModel[];
  pagination: PaginationMeta;
}

// ── Preset colours for the colour picker ─────────────────
const PRESET_COLORS = [
  "#0D7A5F", "#0F2B4C", "#534AB7", "#A32D2D",
  "#B45309", "#0369A1", "#6D28D9", "#BE185D",
  "#064E3B", "#1E3A5F", "#374151", "#92400E",
];

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className} aria-hidden>
      <path d="M1.75 3.5h10.5M5.25 3.5V2.333a.583.583 0 0 1 .583-.583h2.334a.583.583 0 0 1 .583.583V3.5M11.083 3.5l-.583 8.167H3.5L2.917 3.5"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className={className} aria-hidden>
      <path d="M9.917 1.75a1.237 1.237 0 0 1 1.75 1.75L4.083 11.083 1.75 11.667l.583-2.334L9.917 1.75z"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
      <path d="M4 6l4 4 4-4" stroke="#5F5E5A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// =========================================================
// PAGE ROOT
// =========================================================

export default function ProductsPage() {
  const { shopId, currency, userRole } = useShop();
  const canWrite = ["OWNER", "MANAGER"].includes(userRole);
  const [tab, setTab] = useState<Tab>("PRODUCTS");

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Products</h1>
        <div className="flex items-center gap-1 bg-white border border-[#D3D1C7] rounded-lg p-1">
          {(["PRODUCTS", "CATEGORIES", "MODIFIERS"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                tab === t ? "bg-[#0F2B4C] text-white" : "text-[#5F5E5A] hover:text-[#0F2B4C]"
              }`}>
              {t === "PRODUCTS" ? "Products" : t === "CATEGORIES" ? "Categories" : "Modifier Groups"}
            </button>
          ))}
        </div>
      </div>

      {tab === "PRODUCTS"   && <ProductsTab   shopId={shopId} currency={currency} canWrite={canWrite} />}
      {tab === "CATEGORIES" && <CategoriesTab shopId={shopId} canWrite={canWrite} />}
      {tab === "MODIFIERS"  && <ModifiersTab  shopId={shopId} canWrite={canWrite} />}
    </div>
  );
}

// =========================================================
// CATEGORIES TAB
// =========================================================
//
// Full CRUD for product categories.
// Each category has a name, an optional hex colour, and a
// sort_order that controls the order in the POS sidebar.
//
// API endpoints used:
//   GET    /api/shops/:shopId/products/categories
//   POST   /api/shops/:shopId/products/categories
//   PATCH  /api/shops/:shopId/products/categories/:id
//   DELETE /api/shops/:shopId/products/categories/:id
//
// NOT paginated — categories are bounded by reality (a shop
// has a handful of menu/section categories, not hundreds), so
// this stays a plain array endpoint.

function CategoriesTab({ shopId, canWrite }: { shopId: string; canWrite: boolean }) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading]       = useState(true);

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState("");
  const [newColor, setNewColor]     = useState(PRESET_COLORS[0]);
  const [creating, setCreating]     = useState(false);

  // Edit
  const [editCat, setEditCat]       = useState<ProductCategory | null>(null);
  const [editName, setEditName]     = useState("");
  const [editColor, setEditColor]   = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ProductCategory[]>(
        `/api/shops/${shopId}/products/categories`
      );
      setCategories(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) { toast.error("Name is required."); return; }
    setCreating(true);
    try {
      await api.post(`/api/shops/${shopId}/products/categories`, {
        name: newName.trim(),
        color: newColor || undefined,
      });
      toast.success("Category created.");
      setNewName(""); setNewColor(PRESET_COLORS[0]); setShowCreate(false);
      loadCategories();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setCreating(false); }
  }

  function openEdit(cat: ProductCategory) {
    setEditCat(cat);
    setEditName(cat.name);
    setEditColor(cat.color ?? PRESET_COLORS[0]);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editCat) return;
    if (!editName.trim()) { toast.error("Name is required."); return; }
    setEditSaving(true);
    try {
      await api.patch(`/api/shops/${shopId}/products/categories/${editCat.id}`, {
        name: editName.trim(),
        color: editColor || undefined,
      });
      toast.success("Category updated.");
      setEditCat(null);
      loadCategories();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setEditSaving(false); }
  }

  async function handleDelete(cat: ProductCategory) {
    if (!confirm(`Delete "${cat.name}"? Products in this category will become Uncategorised.`)) return;
    try {
      await api.delete(`/api/shops/${shopId}/products/categories/${cat.id}`);
      toast.success("Category deleted.");
      loadCategories();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  return (
    <div className="max-w-xl">
      {/* Explainer */}
      <div className="mb-4 p-3.5 bg-[#EEF5FF] border border-[#C8DEFF] rounded-lg text-[12px] text-[#374151]">
        <p className="font-semibold text-[#1D3A6E] mb-1">What are Categories?</p>
        <p>Categories group your products into tabs in the POS (e.g. Noodles, Rice, Drinks).
        When a cashier opens the POS, they see these tabs and can quickly jump to the right section.
        The colour you pick here shows as a dot on each tab.</p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-[#5F5E5A]">{categories.length} categories</p>
        {canWrite && (
          <button onClick={() => setShowCreate(true)}
            className="h-9 px-4 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition">
            + New category
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={3} cols={2} />
      ) : categories.length === 0 ? (
        <EmptyState title="No categories yet"
          description="Create categories like 'Noodles' or 'Drinks' to organise your POS menu." />
      ) : (
        <div className="space-y-2">
          {categories.map((cat, idx) => (
            <div key={cat.id}
              className="group bg-white border border-[#D3D1C7] rounded-xl px-4 py-3 flex items-center gap-3">
              {/* Sort order hint */}
              <span className="text-[11px] text-[#C8C4B8] w-5 text-center shrink-0">{idx + 1}</span>

              {/* Colour swatch */}
              <div className="w-8 h-8 rounded-lg shrink-0 border border-black/10"
                style={{ background: cat.color ?? "#9CA3AF" }} />

              {/* Name */}
              <p className="flex-1 text-[14px] font-medium text-[#0F2B4C]">{cat.name}</p>

              {/* Edit / delete — appear on hover */}
              {canWrite && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(cat)} type="button"
                    className="p-1.5 rounded text-[#9CA3AF] hover:text-[#0F2B4C]">
                    <PencilIcon />
                  </button>
                  <button onClick={() => handleDelete(cat)} type="button"
                    className="p-1.5 rounded text-[#9CA3AF] hover:text-[#A32D2D]">
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          ))}
          <p className="text-[11px] text-[#9CA3AF] text-center pt-1">
            Categories appear in this order in the POS sidebar.
          </p>
        </div>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Category">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Category name *</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="e.g. Noodles" autoFocus />
          </div>
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Colour</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setNewColor(c)}
                  className={`w-8 h-8 rounded-lg border-2 transition ${
                    newColor === c ? "border-[#0F2B4C] scale-110" : "border-transparent"
                  }`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-7 h-7 rounded border border-[#D3D1C7]" style={{ background: newColor }} />
              <input value={newColor} onChange={(e) => setNewColor(e.target.value)}
                className="flex-1 h-8 px-2 text-[12px] font-mono border border-[#D3D1C7] rounded focus:outline-none"
                placeholder="#0D7A5F" maxLength={7} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
            <Button type="submit" loading={creating}>Create</Button>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editCat} onClose={() => setEditCat(null)} title="Edit Category">
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Category name *</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              autoFocus />
          </div>
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Colour</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setEditColor(c)}
                  className={`w-8 h-8 rounded-lg border-2 transition ${
                    editColor === c ? "border-[#0F2B4C] scale-110" : "border-transparent"
                  }`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-7 h-7 rounded border border-[#D3D1C7]" style={{ background: editColor }} />
              <input value={editColor} onChange={(e) => setEditColor(e.target.value)}
                className="flex-1 h-8 px-2 text-[12px] font-mono border border-[#D3D1C7] rounded focus:outline-none"
                placeholder="#0D7A5F" maxLength={7} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setEditCat(null)} disabled={editSaving}>Cancel</Button>
            <Button type="submit" loading={editSaving}>Save changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// =========================================================
// PRODUCTS TAB
// =========================================================

function ProductsTab({ shopId, currency, canWrite }: {
  shopId: string; currency: string; canWrite: boolean;
}) {
  const [models, setModels]               = useState<ProductModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selected, setSelected]           = useState<ProductModel | null>(null);
  const [items, setItems]                 = useState<ProductItem[]>([]);
  const [itemsLoading, setItemsLoading]   = useState(false);
  const [search, setSearch]               = useState("");
  const [categories, setCategories]       = useState<ProductCategory[]>([]);

  // ── Pagination state for the model list ───────────────
  // The catalog is paginated server-side now (retail/online
  // shops can have hundreds of SKUs). `page` drives the
  // current page; `meta` holds totalCount/totalPages/etc.
  // from the server so the Pagination control can render
  // correctly without recomputing anything client-side.
  const [page, setPage] = useState(1);
  const [meta, setMeta]  = useState<PaginationMeta | null>(null);

  // ── Create product ────────────────────────────────────
  const [showCreateModel, setShowCreateModel] = useState(false);
  const [modelName, setModelName]             = useState("");
  const [modelDesc, setModelDesc]             = useState("");
  const [modelCatId, setModelCatId]           = useState("");
  const [modelSaving, setModelSaving]         = useState(false);

  // ── Edit product ──────────────────────────────────────
  const [editModel, setEditModel]             = useState<ProductModel | null>(null);
  const [editModelName, setEditModelName]     = useState("");
  const [editModelDesc, setEditModelDesc]     = useState("");
  const [editModelCatId, setEditModelCatId]   = useState("");
  const [editModelSaving, setEditModelSaving] = useState(false);

  // ── Create item ───────────────────────────────────────
  // itemTrackStock defaults true — most shops start with
  // stock tracking on. Restaurant users toggle it off for
  // made-to-order items like rice, curry, etc.
  const [showCreateItem, setShowCreateItem]   = useState(false);
  const [itemName, setItemName]               = useState("");
  const [itemPrice, setItemPrice]             = useState("");
  const [itemSku, setItemSku]                 = useState("");
  const [itemStock, setItemStock]             = useState("0");
  const [itemTrackStock, setItemTrackStock]   = useState(true);
  const [itemSaving, setItemSaving]           = useState(false);

  // ── Edit item ─────────────────────────────────────────
  const [editItem, setEditItem]                     = useState<ProductItem | null>(null);
  const [editItemName, setEditItemName]             = useState("");
  const [editItemPrice, setEditItemPrice]           = useState("");
  const [editItemSku, setEditItemSku]               = useState("");
  const [editItemTrackStock, setEditItemTrackStock] = useState(true);
  const [editItemSaving, setEditItemSaving]         = useState(false);

  // ── Data loaders ──────────────────────────────────────

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get<ProductCategory[]>(`/api/shops/${shopId}/products/categories`);
      setCategories(data);
    } catch {}
  }, [shopId]);

  // Server-side pagination + search. Backend route now returns
  // { data, pagination } instead of a raw array — unwrap both.
  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const { data } = await api.get<PaginatedModelsResponse>(
        `/api/shops/${shopId}/products/models`,
        { params: { page, pageSize: 20, search: search || undefined } }
      );
      setModels(data.data ?? []);
      setMeta(data.pagination ?? null);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
      setModels([]);
    } finally { setModelsLoading(false); }
  }, [shopId, page, search]);

  const loadItems = useCallback(async (model: ProductModel) => {
    setItemsLoading(true);
    try {
      const { data } = await api.get<ProductItem[]>(
        `/api/shops/${shopId}/products/models/${model.id}/items`
      );
      setItems(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setItemsLoading(false); }
  }, [shopId]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadModels(); }, [loadModels]);

  // Reset to page 1 whenever the search term changes — otherwise
  // you could be stuck on page 4 with a search that only matches
  // one page of results.
  useEffect(() => { setPage(1); }, [search]);

  function selectModel(model: ProductModel) { setSelected(model); loadItems(model); }

  // ── Product model handlers ────────────────────────────

  async function handleCreateModel(e: React.FormEvent) {
    e.preventDefault();
    if (!modelName.trim()) { toast.error("Name is required."); return; }
    setModelSaving(true);
    try {
      const { data } = await api.post<ProductModel>(`/api/shops/${shopId}/products/models`, {
        name:        modelName.trim(),
        description: modelDesc.trim() || undefined,
        category_id: modelCatId || undefined,
      });
      toast.success("Product created.");
      setModelName(""); setModelDesc(""); setModelCatId("");
      setShowCreateModel(false);
      await loadModels();
      selectModel(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setModelSaving(false); }
  }

  function openEditModel(e: React.MouseEvent, model: ProductModel) {
    e.stopPropagation();
    setEditModel(model);
    setEditModelName(model.name);
    setEditModelDesc(model.description ?? "");
    setEditModelCatId(model.category_id ?? "");
  }

  async function handleEditModel(e: React.FormEvent) {
    e.preventDefault();
    if (!editModel) return;
    if (!editModelName.trim()) { toast.error("Name is required."); return; }
    setEditModelSaving(true);
    try {
      const { data } = await api.patch<ProductModel>(
        `/api/shops/${shopId}/products/models/${editModel.id}`,
        {
          name:        editModelName.trim(),
          description: editModelDesc.trim() || undefined,
          // null explicitly removes the category (uncategorises the product)
          category_id: editModelCatId || null,
        }
      );
      toast.success("Product updated.");
      if (selected?.id === data.id) setSelected(data);
      setEditModel(null);
      loadModels();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setEditModelSaving(false); }
  }

  async function handleDeleteModel(e: React.MouseEvent, model: ProductModel) {
    e.stopPropagation();
    if (!confirm(`Delete "${model.name}"?`)) return;
    try {
      await api.delete(`/api/shops/${shopId}/products/models/${model.id}`);
      toast.success("Product deleted.");
      if (selected?.id === model.id) { setSelected(null); setItems([]); }
      loadModels();
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    }
  }

  // ── Product item handlers ─────────────────────────────

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!itemName.trim()) { toast.error("Name is required."); return; }
    if (!itemPrice || Number(itemPrice) < 0) { toast.error("Valid price required."); return; }
    setItemSaving(true);
    try {
      await api.post(`/api/shops/${shopId}/products/models/${selected.id}/items`, {
        name:        itemName.trim(),
        price:       Number(itemPrice),
        sku:         itemSku.trim() || undefined,
        track_stock: itemTrackStock,
        // Only send stock_qty when tracking is on.
        // When tracking is off (rice, curry, made-to-order items),
        // the stock_qty column in the DB stays at 0 and is ignored
        // by the payment deduction logic.
        ...(itemTrackStock && { stock_qty: Number(itemStock) }),
      });
      toast.success("Item added.");
      setItemName(""); setItemPrice(""); setItemSku(""); setItemStock("0"); setItemTrackStock(true);
      setShowCreateItem(false);
      loadItems(selected);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setItemSaving(false); }
  }

  // Pre-fill ALL fields from the existing item so the edit
  // modal reflects exactly what is in the database.
  function openEditItem(item: ProductItem) {
    setEditItem(item);
    setEditItemName(item.name);
    setEditItemPrice(String(item.price));
    setEditItemSku(item.sku ?? "");
    setEditItemTrackStock(item.track_stock); // ← was missing before this fix
  }

  async function handleEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem || !selected) return;
    if (!editItemName.trim()) { toast.error("Name is required."); return; }
    setEditItemSaving(true);
    try {
      await api.patch(`/api/shops/${shopId}/products/items/${editItem.id}`, {
        name:        editItemName.trim(),
        price:       Number(editItemPrice),
        sku:         editItemSku.trim() || undefined,
        track_stock: editItemTrackStock,
        // Note: editing stock_qty directly is handled via the
        // inventory adjustment flow, not the item edit form.
        // This keeps the audit trail intact.
      });
      toast.success("Item updated.");
      setEditItem(null);
      loadItems(selected);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setEditItemSaving(false); }
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

  // NOTE: search is now server-side (sent as a query param in
  // loadModels), so `models` is already the filtered, current
  // page's worth of rows — no client-side filtering needed here
  // anymore. Previously this component had a `filteredModels`
  // derived array; that's removed since `models` IS the result.

  // ── Render ────────────────────────────────────────────
  //
  // CHANGED: panels stack vertically below `lg` (1024px) —
  // full-width list on top, full-width item detail below it.
  // Below `lg`, max-h-[420px] on the list and min-h-[420px] on
  // the detail panel keep both bounded instead of one growing
  // to fill the whole page; at `lg`+, lg:h-full / lg:max-h-none
  // restore the original fixed-height side-by-side behaviour.

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-180px)]">

      {/* Left: model list */}
      <div className="w-full lg:w-[260px] shrink-0 bg-white border border-[#D3D1C7] rounded-lg flex flex-col overflow-hidden max-h-[420px] lg:max-h-none lg:h-full">
        <div className="p-3 border-b border-[#D3D1C7]">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
            placeholder="Search products…" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {modelsLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-[#F1EFE8] rounded-lg animate-pulse" />
              ))}
            </div>
          ) : models.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-[12px] text-[#5F5E5A]">{search ? "No match." : "No products yet."}</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {models.map((model) => {
                const isSelected = selected?.id === model.id;
                return (
                  <div key={model.id} role="button" tabIndex={0}
                    onClick={() => selectModel(model)}
                    onKeyDown={(e) => e.key === "Enter" && selectModel(model)}
                    className={`group w-full flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition ${
                      isSelected ? "bg-[#0F2B4C] text-white" : "hover:bg-[#F1EFE8] text-[#0F2B4C]"
                    }`}>

                    {/* Category colour dot */}
                    {model.category_color && (
                      <div className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: model.category_color }} />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-medium truncate ${isSelected ? "text-white" : ""}`}>
                        {model.name}
                      </p>
                      {model.category_name && (
                        <p className={`text-[11px] truncate ${isSelected ? "text-white/50" : "text-[#9CA3AF]"}`}>
                          {model.category_name}
                        </p>
                      )}
                    </div>

                    {canWrite && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={(e) => openEditModel(e, model)} type="button"
                          className={`p-1.5 rounded ${isSelected ? "text-white/50 hover:text-white" : "text-[#9CA3AF] hover:text-[#0F2B4C]"}`}>
                          <PencilIcon />
                        </button>
                        <button onClick={(e) => handleDeleteModel(e, model)} type="button"
                          className={`p-1.5 rounded ${isSelected ? "text-white/50 hover:text-white" : "text-[#9CA3AF] hover:text-[#A32D2D]"}`}>
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination — compact, since this panel is only 260px wide.
            Hidden entirely while loading or when there's nothing to page through. */}
        {!modelsLoading && meta && meta.totalCount > 0 && (
          <div className="px-2 py-2 border-t border-[#D3D1C7]">
            <Pagination meta={meta} onPageChange={setPage} />
          </div>
        )}

        {canWrite && (
          <div className="p-3 border-t border-[#D3D1C7]">
            <button onClick={() => setShowCreateModel(true)}
              className="w-full h-8 text-[12px] font-medium text-[#0D7A5F] border border-[#0D7A5F] rounded-lg hover:bg-[#E1F5EE] transition">
              + New product
            </button>
          </div>
        )}
      </div>

      {/* Right: items panel */}
      <div className="flex-1 bg-white border border-[#D3D1C7] rounded-lg flex flex-col overflow-hidden min-h-[420px] lg:min-h-0 lg:h-full">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState title="Select a product" description="Choose from the left to manage its variants." />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#D3D1C7]">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-medium text-[#0F2B4C]">{selected.name}</h2>
                  {selected.category_name && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded text-white font-medium"
                      style={{ background: selected.category_color ?? "#9CA3AF" }}>
                      {selected.category_name}
                    </span>
                  )}
                </div>
                {selected.description && (
                  <p className="text-[12px] text-[#5F5E5A]">{selected.description}</p>
                )}
              </div>
              {canWrite && (
                <button onClick={() => setShowCreateItem(true)}
                  className="h-8 px-3 text-[12px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition">
                  + Add item
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {itemsLoading ? <SkeletonTable rows={4} cols={4} /> :
               items.length === 0 ? <EmptyState title="No items yet" description="Add at least one variant." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[13px]">
                    <TableHead>
                      <Th>Name</Th>
                      <Th>SKU</Th>
                      <Th align="right">Price</Th>
                      <Th align="right">Stock</Th>
                      <Th>Status</Th>
                      {canWrite && <Th align="right">Actions</Th>}
                    </TableHead>
                    <TableBody>
                      {items.map((item) => (
                        <Tr key={item.id}>
                          <Td className="font-medium text-[#0F2B4C]">{item.name}</Td>
                          <Td className="font-mono text-[12px] text-[#5F5E5A]">{item.sku ?? "—"}</Td>
                          <Td align="right" className="font-medium">
                            {formatCurrency(Number(item.price), currency as any)}
                          </Td>
                          {/* Stock column: show qty when tracking, "—" when not tracked */}
                          <Td align="right" className="text-[#5F5E5A]">
                            {item.track_stock ? item.stock_qty : "—"}
                          </Td>
                          <Td><ActiveBadge active={item.is_active} /></Td>
                          {canWrite && (
                            <Td align="right">
                              <div className="flex items-center justify-end gap-3">
                                <button onClick={() => openEditItem(item)}
                                  className="text-[12px] text-[#534AB7] hover:underline flex items-center gap-1">
                                  <PencilIcon /> Edit
                                </button>
                                <button onClick={() => handleToggleItemActive(item)}
                                  className="text-[12px] text-[#5F5E5A] hover:underline">
                                  {item.is_active ? "Disable" : "Enable"}
                                </button>
                              </div>
                            </Td>
                          )}
                        </Tr>
                      ))}
                    </TableBody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Create product modal ──────────────────────── */}
      <Modal open={showCreateModel} onClose={() => setShowCreateModel(false)} title="New Product">
        <form onSubmit={handleCreateModel} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Product name *</label>
            <input value={modelName} onChange={(e) => setModelName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="e.g. Soda Drink" autoFocus />
          </div>
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Description</label>
            <input value={modelDesc} onChange={(e) => setModelDesc(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Category</label>
            <select value={modelCatId} onChange={(e) => setModelCatId(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white">
              <option value="">— Uncategorised —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowCreateModel(false)} disabled={modelSaving}>Cancel</Button>
            <Button type="submit" loading={modelSaving}>Create</Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit product modal ────────────────────────── */}
      <Modal open={!!editModel} onClose={() => setEditModel(null)} title="Edit Product">
        <form onSubmit={handleEditModel} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Product name *</label>
            <input value={editModelName} onChange={(e) => setEditModelName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              autoFocus />
          </div>
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Description</label>
            <input value={editModelDesc} onChange={(e) => setEditModelDesc(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Category</label>
            <select value={editModelCatId} onChange={(e) => setEditModelCatId(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white">
              <option value="">— Uncategorised —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setEditModel(null)} disabled={editModelSaving}>Cancel</Button>
            <Button type="submit" loading={editModelSaving}>Save changes</Button>
          </div>
        </form>
      </Modal>

      {/* ── Create item modal ─────────────────────────── */}
      <Modal open={showCreateItem} onClose={() => setShowCreateItem(false)} title={`Add item to ${selected?.name}`}>
        <form onSubmit={handleCreateItem} className="space-y-4">

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Item name *</label>
            <input value={itemName} onChange={(e) => setItemName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="e.g. Regular" autoFocus />
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Price *</label>
            <input type="number" min="0" step="0.01" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="0.00" />
          </div>

          {/*
            Track stock toggle
            ──────────────────
            ON  → retail items (bottles, cans, packaged goods)
                  stock_qty is decremented on every sale.
            OFF → restaurant / made-to-order items (rice, curry, noodles)
                  no quantity is tracked; the item never shows as "sold out"
                  due to stock. The cook makes it on demand.

            Why a toggle and not a checkbox?
            Toggles are visually clearer for binary states that have real
            downstream consequences (stock deduction logic in payment.service).
          */}
          <div className="flex items-center justify-between py-2.5 px-3 bg-[#F8F7F3] rounded-lg border border-[#D3D1C7]">
            <div>
              <p className="text-[13px] font-medium text-[#1A1A1A]">Track stock quantity</p>
              <p className="text-[11px] text-[#5F5E5A] mt-0.5">
                {itemTrackStock
                  ? "Stock will be deducted on each sale."
                  : "No limit — made to order or unlimited supply."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setItemTrackStock((v) => !v)}
              aria-label="Toggle stock tracking"
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                itemTrackStock ? "bg-[#0D7A5F]" : "bg-[#D3D1C7]"
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                itemTrackStock ? "translate-x-5" : "translate-x-0.5"
              }`} />
            </button>
          </div>

          {/* Only show initial stock when tracking is enabled.
              Hiding it when OFF avoids confusing users — the value
              would be stored in the DB but never used. */}
          {itemTrackStock && (
            <div className="space-y-1">
              <label className="block text-[13px] font-medium text-[#1A1A1A]">Initial stock</label>
              <input type="number" min="0" value={itemStock} onChange={(e) => setItemStock(e.target.value)}
                className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]" />
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">SKU (optional)</label>
            <input value={itemSku} onChange={(e) => setItemSku(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="e.g. SODA-REG" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowCreateItem(false)} disabled={itemSaving}>Cancel</Button>
            <Button type="submit" loading={itemSaving}>Add item</Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit item modal ───────────────────────────── */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Item">
        <form onSubmit={handleEditItem} className="space-y-4">

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Item name *</label>
            <input value={editItemName} onChange={(e) => setEditItemName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              autoFocus />
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Price *</label>
            <input type="number" min="0" step="0.01" value={editItemPrice} onChange={(e) => setEditItemPrice(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]" />
          </div>

          {/*
            Track stock toggle (edit)
            ─────────────────────────
            Pre-filled from item.track_stock via openEditItem().
            Changing this updates the DB flag on save, which
            immediately changes the payment deduction behaviour
            for all future orders of this item.
          */}
          <div className="flex items-center justify-between py-2.5 px-3 bg-[#F8F7F3] rounded-lg border border-[#D3D1C7]">
            <div>
              <p className="text-[13px] font-medium text-[#1A1A1A]">Track stock quantity</p>
              <p className="text-[11px] text-[#5F5E5A] mt-0.5">
                {editItemTrackStock
                  ? "Stock will be deducted on each sale."
                  : "No limit — made to order or unlimited supply."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditItemTrackStock((v) => !v)}
              aria-label="Toggle stock tracking"
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                editItemTrackStock ? "bg-[#0D7A5F]" : "bg-[#D3D1C7]"
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                editItemTrackStock ? "translate-x-5" : "translate-x-0.5"
              }`} />
            </button>
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">SKU</label>
            <input value={editItemSku} onChange={(e) => setEditItemSku(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="Optional" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setEditItem(null)} disabled={editItemSaving}>Cancel</Button>
            <Button type="submit" loading={editItemSaving}>Save changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// =========================================================
// MODIFIERS TAB
// =========================================================

function ModifiersTab({ shopId, canWrite }: { shopId: string; canWrite: boolean }) {
  const [groups, setGroups]       = useState<ModifierGroup[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [options, setOptions]     = useState<Record<string, ModifierOption[]>>({});
  const [allModels, setAllModels] = useState<ProductModel[]>([]);
  const [linkedMap, setLinkedMap] = useState<Record<string, ProductModel[]>>({});
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName]     = useState("");
  const [groupRequired, setGroupRequired] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);

  const [editGroup, setEditGroup]           = useState<ModifierGroup | null>(null);
  const [editGroupName, setEditGroupName]   = useState("");
  const [editGroupRequired, setEditGroupRequired] = useState(false);
  const [editGroupSaving, setEditGroupSaving] = useState(false);

  const [newOptionName, setNewOptionName]   = useState<Record<string, string>>({});
  const [newOptionDelta, setNewOptionDelta] = useState<Record<string, string>>({});
  const [optionSaving, setOptionSaving]     = useState<Record<string, boolean>>({});

  const [editOptionId, setEditOptionId]     = useState<string | null>(null);
  const [editOptionName, setEditOptionName] = useState("");
  const [editOptionDelta, setEditOptionDelta] = useState("");
  const [editOptionSaving, setEditOptionSaving] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ModifierGroup[]>(`/api/shops/${shopId}/modifiers/groups`);
      setGroups(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err.response?.data?.message));
    } finally { setLoading(false); }
  }, [shopId]);

  // Builds "which products is each modifier group linked to" by
  // fetching every product model, then checking each one's linked
  // groups. This genuinely needs the FULL catalog, not one page —
  // so it requests pageSize=100 (the server's hard ceiling) and
  // unwraps the paginated { data, pagination } response.
  //
  // KNOWN LIMITATION: if a shop has more than 100 products, this
  // view will only see the first 100 and "unlinked products" in
  // the picker below will be incomplete for the rest. That's an
  // acceptable trade-off for now (most catalogs are well under
  // 100), but flagged here rather than silently truncating with
  // no explanation if it's ever revisited.
  const buildLinkedMap = useCallback(async () => {
    try {
      const { data: modelsResponse } = await api.get<PaginatedModelsResponse>(
        `/api/shops/${shopId}/products/models`,
        { params: { page: 1, pageSize: 100 } }
      );
      const models = modelsResponse.data ?? [];
      setAllModels(models);
      const results = await Promise.all(
        models.map((model) =>
          api.get<ModifierGroup[]>(`/api/shops/${shopId}/products/models/${model.id}/modifier-groups`)
            .then((res) => ({ model, groups: res.data }))
            .catch(() => ({ model, groups: [] as ModifierGroup[] }))
        )
      );
      const map: Record<string, ProductModel[]> = {};
      for (const { model, groups } of results) {
        for (const group of groups) {
          if (!map[group.id]) map[group.id] = [];
          map[group.id].push(model);
        }
      }
      setLinkedMap(map);
    } catch (err) { console.warn("Modifier linked-map failed:", err); }
  }, [shopId]);

  useEffect(() => { loadGroups(); buildLinkedMap(); }, [loadGroups, buildLinkedMap]);

  async function loadOptions(groupId: string) {
    try {
      const { data } = await api.get<ModifierOption[]>(`/api/shops/${shopId}/modifiers/groups/${groupId}/options`);
      setOptions((prev) => ({ ...prev, [groupId]: data }));
    } catch (err: any) { toast.error(getErrorMessage(err.response?.data?.message)); }
  }

  function toggleExpand(groupId: string) {
    if (expanded === groupId) { setExpanded(null); return; }
    setExpanded(groupId);
    if (!options[groupId]) loadOptions(groupId);
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) { toast.error("Name is required."); return; }
    setGroupSaving(true);
    try {
      await api.post(`/api/shops/${shopId}/modifiers/groups`, { name: groupName.trim(), is_required: groupRequired });
      toast.success("Group created.");
      setGroupName(""); setGroupRequired(false); setShowCreateGroup(false); loadGroups();
    } catch (err: any) { toast.error(getErrorMessage(err.response?.data?.message)); }
    finally { setGroupSaving(false); }
  }

  function openEditGroup(e: React.MouseEvent, group: ModifierGroup) {
    e.stopPropagation();
    setEditGroup(group); setEditGroupName(group.name); setEditGroupRequired(group.is_required);
  }

  async function handleEditGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!editGroup) return;
    setEditGroupSaving(true);
    try {
      await api.patch(`/api/shops/${shopId}/modifiers/groups/${editGroup.id}`,
        { name: editGroupName.trim(), is_required: editGroupRequired });
      toast.success("Group updated."); setEditGroup(null); loadGroups();
    } catch (err: any) { toast.error(getErrorMessage(err.response?.data?.message)); }
    finally { setEditGroupSaving(false); }
  }

  async function handleAddOption(groupId: string) {
    const name = newOptionName[groupId]?.trim();
    if (!name) { toast.error("Name is required."); return; }
    setOptionSaving((p) => ({ ...p, [groupId]: true }));
    try {
      await api.post(`/api/shops/${shopId}/modifiers/groups/${groupId}/options`,
        { name, price_delta: Number(newOptionDelta[groupId] ?? 0) });
      setNewOptionName((p) => ({ ...p, [groupId]: "" }));
      setNewOptionDelta((p) => ({ ...p, [groupId]: "" }));
      loadOptions(groupId);
    } catch (err: any) { toast.error(getErrorMessage(err.response?.data?.message)); }
    finally { setOptionSaving((p) => ({ ...p, [groupId]: false })); }
  }

  async function handleDeleteOption(groupId: string, optionId: string) {
    try {
      await api.delete(`/api/shops/${shopId}/modifiers/options/${optionId}`);
      loadOptions(groupId);
    } catch (err: any) { toast.error(getErrorMessage(err.response?.data?.message)); }
  }

  function startEditOption(opt: ModifierOption) {
    setEditOptionId(opt.id); setEditOptionName(opt.name); setEditOptionDelta(String(opt.price_delta));
  }

  function cancelEditOption() {
    setEditOptionId(null); setEditOptionName(""); setEditOptionDelta("");
  }

  async function handleEditOption(groupId: string, optionId: string) {
    if (!editOptionName.trim()) { toast.error("Name is required."); return; }
    setEditOptionSaving(true);
    try {
      await api.patch(`/api/shops/${shopId}/modifiers/options/${optionId}`,
        { name: editOptionName.trim(), price_delta: Number(editOptionDelta ?? 0) });
      toast.success("Option updated."); cancelEditOption(); loadOptions(groupId);
    } catch (err: any) { toast.error(getErrorMessage(err.response?.data?.message)); }
    finally { setEditOptionSaving(false); }
  }

  async function handleLinkProduct(groupId: string, modelId: string) {
    setLinkingId(groupId);
    try {
      await api.post(`/api/shops/${shopId}/products/models/${modelId}/modifier-groups`, { groupId });
      toast.success("Linked."); await buildLinkedMap();
    } catch (err: any) { toast.error(getErrorMessage(err.response?.data?.message)); }
    finally { setLinkingId(null); }
  }

  async function handleUnlinkProduct(groupId: string, modelId: string) {
    setLinkingId(groupId);
    try {
      await api.delete(`/api/shops/${shopId}/products/models/${modelId}/modifier-groups/${groupId}`);
      toast.success("Unlinked."); await buildLinkedMap();
    } catch (err: any) { toast.error(getErrorMessage(err.response?.data?.message)); }
    finally { setLinkingId(null); }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#5F5E5A]">{groups.length} modifier groups</p>
        {canWrite && (
          <button onClick={() => setShowCreateGroup(true)}
            className="h-9 px-4 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-opacity-90 transition">
            + New group
          </button>
        )}
      </div>

      {loading ? <SkeletonTable rows={4} cols={3} /> :
       groups.length === 0 ? <EmptyState title="No modifier groups" description="Create groups like 'Spice Level', then link them to products." /> : (
        <div className="space-y-2">
          {groups.map((group) => {
            const linkedProducts   = linkedMap[group.id] ?? [];
            const unlinkedProducts = allModels.filter((m) => !linkedProducts.some((lp) => lp.id === m.id));
            const isExpanded       = expanded === group.id;
            const isLinking        = linkingId === group.id;

            return (
              <div key={group.id} className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
                <div className="flex items-center px-5 py-3 hover:bg-[#F1EFE8]/30 transition-colors">
                  <button onClick={() => toggleExpand(group.id)} type="button"
                    className="flex items-center gap-2 text-left flex-1 min-w-0">
                    <span className="text-[14px] font-medium text-[#0F2B4C]">{group.name}</span>
                    {group.is_required && (
                      <span className="text-[11px] px-1.5 py-0.5 bg-[#FCEBEB] text-[#A32D2D] rounded shrink-0">Required</span>
                    )}
                    {linkedProducts.length > 0 ? (
                      <span className="text-[11px] px-1.5 py-0.5 bg-[#E1F5EE] text-[#0D7A5F] rounded shrink-0">
                        {linkedProducts.length} product{linkedProducts.length !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-[11px] px-1.5 py-0.5 bg-[#FEF3C7] text-[#92400E] rounded shrink-0">Not linked</span>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {canWrite && (
                      <button onClick={(e) => openEditGroup(e, group)} type="button"
                        className="p-1.5 rounded text-[#9CA3AF] hover:text-[#0F2B4C]">
                        <PencilIcon />
                      </button>
                    )}
                    <button onClick={() => toggleExpand(group.id)} type="button" className="p-1">
                      <ChevronIcon open={isExpanded} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[#F1EFE8] px-5 py-4 space-y-4">
                    <div>
                      <p className="text-[11px] font-semibold text-[#5F5E5A] uppercase tracking-wide mb-2">Options</p>
                      {(options[group.id] ?? []).length === 0 ? (
                        <p className="text-[12px] text-[#5F5E5A]">No options yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {(options[group.id] ?? []).map((opt) => {
                            const isEditing = editOptionId === opt.id;
                            return (
                              <div key={opt.id} className="flex items-center gap-2 text-[13px] py-1">
                                {isEditing ? (
                                  <>
                                    <input value={editOptionName} onChange={(e) => setEditOptionName(e.target.value)}
                                      className="flex-1 h-7 px-2 text-[12px] border border-[#0D7A5F] rounded focus:outline-none"
                                      autoFocus onKeyDown={(e) => e.key === "Escape" && cancelEditOption()} />
                                    <input type="number" step="0.01" value={editOptionDelta}
                                      onChange={(e) => setEditOptionDelta(e.target.value)}
                                      className="w-20 h-7 px-2 text-[12px] border border-[#0D7A5F] rounded focus:outline-none" />
                                    <button onClick={() => handleEditOption(group.id, opt.id)} disabled={editOptionSaving}
                                      className="h-7 px-2 text-[12px] font-medium text-white bg-[#0D7A5F] rounded disabled:opacity-50" type="button">
                                      {editOptionSaving ? "…" : "Save"}
                                    </button>
                                    <button onClick={cancelEditOption} type="button"
                                      className="h-7 px-2 text-[12px] text-[#5F5E5A] rounded border border-[#D3D1C7]">
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="flex-1 text-[#0F2B4C]">{opt.name}</span>
                                    <span className={opt.price_delta > 0 ? "text-[#0D7A5F]" : opt.price_delta < 0 ? "text-[#A32D2D]" : "text-[#5F5E5A]"}>
                                      {opt.price_delta > 0 ? `+${opt.price_delta}` : opt.price_delta === 0 ? "Free" : opt.price_delta}
                                    </span>
                                    {canWrite && (
                                      <div className="flex gap-1">
                                        <button onClick={() => startEditOption(opt)} type="button"
                                          className="p-1 text-[#9CA3AF] hover:text-[#0F2B4C]"><PencilIcon /></button>
                                        <button onClick={() => handleDeleteOption(group.id, opt.id)} type="button"
                                          className="p-1 text-[#9CA3AF] hover:text-[#A32D2D]"><TrashIcon /></button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {canWrite && (
                        <div className="flex items-center gap-2 pt-2 mt-2 border-t border-[#F1EFE8]">
                          <input value={newOptionName[group.id] ?? ""}
                            onChange={(e) => setNewOptionName((p) => ({ ...p, [group.id]: e.target.value }))}
                            className="flex-1 h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                            placeholder="Option name"
                            onKeyDown={(e) => e.key === "Enter" && handleAddOption(group.id)} />
                          <input type="number" step="0.01" value={newOptionDelta[group.id] ?? ""}
                            onChange={(e) => setNewOptionDelta((p) => ({ ...p, [group.id]: e.target.value }))}
                            className="w-24 h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
                            placeholder="+0.00" />
                          <button onClick={() => handleAddOption(group.id)} disabled={optionSaving[group.id]} type="button"
                            className="h-8 px-3 text-[12px] font-medium text-white bg-[#0D7A5F] rounded-md disabled:opacity-50">
                            {optionSaving[group.id] ? "…" : "Add"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-[#F1EFE8] pt-3">
                      <p className="text-[11px] font-semibold text-[#5F5E5A] uppercase tracking-wide mb-2">Linked to products</p>
                      {linkedProducts.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {linkedProducts.map((model) => (
                            <div key={model.id}
                              className="flex items-center gap-1 px-2 py-1 bg-[#EEF5FF] border border-[#C8DEFF] rounded text-[12px] text-[#1D3A6E]">
                              <span>{model.name}</span>
                              {canWrite && (
                                <button onClick={() => handleUnlinkProduct(group.id, model.id)} disabled={isLinking} type="button"
                                  className="text-[#6B7280] hover:text-[#A32D2D] ml-0.5 text-[14px] leading-none disabled:opacity-40">×</button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-[#9CA3AF] mb-3">Not linked to any product yet.</p>
                      )}
                      {canWrite && unlinkedProducts.length > 0 && (
                        <select defaultValue="" disabled={isLinking}
                          onChange={(e) => { if (e.target.value) { handleLinkProduct(group.id, e.target.value); e.target.value = ""; } }}
                          className="w-full h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] bg-white disabled:opacity-50">
                          <option value="" disabled>{isLinking ? "Linking…" : "Attach to a product…"}</option>
                          {unlinkedProducts.map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </select>
                      )}
                      {canWrite && unlinkedProducts.length === 0 && allModels.length > 0 && (
                        <p className="text-[12px] text-[#0D7A5F]">✓ Linked to all products.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} title="New Modifier Group">
        <form onSubmit={handleCreateGroup} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Group name *</label>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              placeholder="e.g. Spice Level" autoFocus />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={groupRequired} onChange={(e) => setGroupRequired(e.target.checked)}
              className="w-4 h-4 rounded accent-[#0D7A5F]" />
            <span className="text-[13px] text-[#1A1A1A]">Required (customer must choose)</span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowCreateGroup(false)} disabled={groupSaving}>Cancel</Button>
            <Button type="submit" loading={groupSaving}>Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editGroup} onClose={() => setEditGroup(null)} title="Edit Modifier Group">
        <form onSubmit={handleEditGroup} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[#1A1A1A]">Group name *</label>
            <input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
              autoFocus />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={editGroupRequired} onChange={(e) => setEditGroupRequired(e.target.checked)}
              className="w-4 h-4 rounded accent-[#0D7A5F]" />
            <span className="text-[13px] text-[#1A1A1A]">Required (customer must choose)</span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setEditGroup(null)} disabled={editGroupSaving}>Cancel</Button>
            <Button type="submit" loading={editGroupSaving}>Save changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}