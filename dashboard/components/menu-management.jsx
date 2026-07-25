"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusDot } from "@/components/ui/status-dot"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Search, Plus, Edit, Trash2, X, GripVertical, FolderPlus } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import axios from "axios"
import { API } from "@/lib/api"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const emptyItem = { name: "", description: "", price: 0, categoryId: "", available: true, optionGroups: [] }
const emptyCategory = { name: "", isActive: true }

export function MenuManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])

  const [isAddItemOpen, setIsAddItemOpen] = useState(false)
  const [isEditItemOpen, setIsEditItemOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [newItem, setNewItem] = useState(emptyItem)

  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false)
  const [isEditCategoryOpen, setIsEditCategoryOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [newCategory, setNewCategory] = useState(emptyCategory)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const fetchMenu = async () => {
    try {
      const res = await axios.get(`${API}/api/menu/`, { withCredentials: true })
      setMenuItems(res.data)
    } catch { toast.error("Failed to fetch menu items") }
  }

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${API}/api/category/`, { withCredentials: true })
      setCategories(res.data)
    } catch { toast.error("Failed to fetch categories") }
  }

  useEffect(() => { fetchMenu(); fetchCategories() }, [])

  // ── Option groups (Add Item form) ────────────────────────────────────────────
  const addOptionGroup = () =>
    setNewItem((p) => ({ ...p, optionGroups: [...p.optionGroups, { title: "", required: false, multiple: false, options: [] }] }))

  const updateOptionGroup = (gIdx, field, value) =>
    setNewItem((p) => { const g = [...p.optionGroups]; g[gIdx] = { ...g[gIdx], [field]: value }; return { ...p, optionGroups: g } })

  const removeOptionGroup = (gIdx) =>
    setNewItem((p) => ({ ...p, optionGroups: p.optionGroups.filter((_, i) => i !== gIdx) }))

  const addOption = (gIdx) =>
    setNewItem((p) => { const g = [...p.optionGroups]; g[gIdx] = { ...g[gIdx], options: [...g[gIdx].options, { name: "", priceDelta: 0 }] }; return { ...p, optionGroups: g } })

  const updateOption = (gIdx, oIdx, field, value) =>
    setNewItem((p) => { const g = [...p.optionGroups]; const o = [...g[gIdx].options]; o[oIdx] = { ...o[oIdx], [field]: value }; g[gIdx] = { ...g[gIdx], options: o }; return { ...p, optionGroups: g } })

  const removeOption = (gIdx, oIdx) =>
    setNewItem((p) => { const g = [...p.optionGroups]; g[gIdx] = { ...g[gIdx], options: g[gIdx].options.filter((_, i) => i !== oIdx) }; return { ...p, optionGroups: g } })

  // ── Menu item CRUD ────────────────────────────────────────────────────────────
  const openAddItem = (categoryId) => {
    setNewItem({ ...emptyItem, categoryId: categoryId ? String(categoryId) : "" })
    setIsAddItemOpen(true)
  }

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.price) { toast.error("Name and price are required"); return }
    try {
      await axios.post(`${API}/api/menu/create`, {
        name: newItem.name, description: newItem.description, price: newItem.price,
        available: newItem.available,
        categoryId: newItem.categoryId ? parseInt(newItem.categoryId) : undefined,
        optionGroups: newItem.optionGroups.length > 0 ? newItem.optionGroups : undefined,
      }, { withCredentials: true })
      toast.success("Item added")
      setNewItem(emptyItem); setIsAddItemOpen(false); fetchMenu()
    } catch { toast.error("Failed to add item") }
  }

  const handleEditItem = async () => {
    if (!selectedItem) return
    try {
      await axios.put(`${API}/api/menu/${selectedItem.id}`, {
        name: selectedItem.name, description: selectedItem.description,
        price: selectedItem.price, available: selectedItem.available,
        isActive: selectedItem.isActive,
      }, { withCredentials: true })
      toast.success("Item updated"); setIsEditItemOpen(false); setSelectedItem(null); fetchMenu()
    } catch { toast.error("Failed to update item") }
  }

  const handleDeleteItem = async (id) => {
    try {
      await axios.delete(`${API}/api/menu/${id}`, { withCredentials: true })
      toast.success("Item removed"); fetchMenu()
    } catch { toast.error("Failed to remove item") }
  }

  const toggleAvailability = async (item) => {
    try {
      await axios.put(`${API}/api/menu/${item.id}`, { available: !item.available }, { withCredentials: true })
      fetchMenu()
    } catch { toast.error("Failed to update availability") }
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCategory.name.trim()) { toast.error("Name is required"); return }
    try {
      await axios.post(`${API}/api/category/create`, newCategory, { withCredentials: true })
      toast.success("Category added")
      setNewCategory(emptyCategory); setIsAddCategoryOpen(false); fetchCategories()
    } catch { toast.error("Failed to add category") }
  }

  const handleEditCategory = async () => {
    if (!selectedCategory) return
    try {
      await axios.put(`${API}/api/category/${selectedCategory.id}`, selectedCategory, { withCredentials: true })
      toast.success("Category updated"); setIsEditCategoryOpen(false); setSelectedCategory(null); fetchCategories()
    } catch { toast.error("Failed to update category") }
  }

  const handleDeleteCategory = async (id) => {
    try {
      await axios.delete(`${API}/api/category/${id}`, { withCredentials: true })
      toast.success("Category removed"); fetchCategories()
    } catch { toast.error("Failed to remove category") }
  }

  const handleBulkAvailability = async (categoryId, available) => {
    try {
      await axios.patch(`${API}/api/menu/bulk-availability`, { categoryId, available }, { withCredentials: true })
      toast.success(available ? "Marked all available" : "Marked all unavailable")
      fetchMenu()
    } catch { toast.error("Failed to update availability") }
  }

  // ── Reordering within a category group ────────────────────────────────────────
  const reorderGroup = async (categoryKey, orderedItems) => {
    // Optimistic local update
    setMenuItems((prev) => {
      const others = prev.filter((i) => String(i.categoryId ?? "uncategorized") !== categoryKey)
      return [...others, ...orderedItems]
    })
    try {
      await axios.patch(`${API}/api/menu/reorder`, {
        items: orderedItems.map((item, idx) => ({ id: item.id, position: idx })),
      }, { withCredentials: true })
    } catch {
      toast.error("Failed to save new order")
      fetchMenu()
    }
  }

  const handleDragEnd = (groupItems, categoryKey) => (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groupItems.findIndex((i) => i.id === active.id)
    const newIndex = groupItems.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorderGroup(categoryKey, arrayMove(groupItems, oldIndex, newIndex))
  }

  // ── Grouping ───────────────────────────────────────────────────────────────────
  const term = searchTerm.toLowerCase()
  const matches = (item) =>
    !term ||
    item.name.toLowerCase().includes(term) ||
    (item.description || "").toLowerCase().includes(term)

  const allGroups = [
    ...categories.map((c) => ({
      key: String(c.id), id: c.id, name: c.name, isActive: c.isActive,
      items: menuItems.filter((i) => i.categoryId === c.id && matches(i)),
    })),
    {
      key: "uncategorized", id: null, name: "Uncategorized", isActive: true,
      items: menuItems.filter((i) => !i.categoryId && matches(i)),
    },
  ]

  const groups = allGroups
    .filter((g) => categoryFilter === "all" || g.key === categoryFilter)
    .filter((g) => !term || g.items.length > 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-slate-500 text-sm">{menuItems.length} items · {categories.length} categories</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9 text-sm" onClick={() => { setNewCategory(emptyCategory); setIsAddCategoryOpen(true) }}>
            <FolderPlus className="h-4 w-4 mr-1.5" />Add Category
          </Button>
          <Button className="brand-bg text-white h-9 text-sm" onClick={() => openAddItem()}>
            <Plus className="h-4 w-4 mr-1.5" />Add Item
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
        <Input placeholder="Search items…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-white" />
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 ml-3">
        {[{ key: "all", name: "All" }, ...allGroups].map((g) => (
          <button
            key={g.key}
            onClick={() => setCategoryFilter(g.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === g.key
                ? "brand-bg text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            {g.name}{g.items ? ` · ${g.items.length}` : ""}
          </button>
        ))}
      </div>

      {/* Groups */}
      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="flex flex-wrap items-center justify-between gap-y-1 mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-700">{group.name}</h3>
                {!group.isActive && <StatusDot color="#94a3b8">Inactive</StatusDot>}
                <span className="text-xs text-slate-400">{group.items.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {group.items.length > 0 && (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500"
                      onClick={() => handleBulkAvailability(group.id, true)}>
                      All on
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500"
                      onClick={() => handleBulkAvailability(group.id, false)}>
                      All off
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={() => openAddItem(group.id)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Item
                </Button>
                {group.id != null && (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                      onClick={() => { setSelectedCategory({ id: group.id, name: group.name, isActive: group.isActive }); setIsEditCategoryOpen(true) }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                      onClick={() => handleDeleteCategory(group.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {group.items.length === 0 ? (
              <p className="text-slate-400 text-sm py-6 text-center border border-dashed border-slate-200 rounded-lg">No items yet</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(group.items, group.key)}>
                <SortableContext items={group.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <SortableMenuItemRow
                        key={item.id}
                        item={item}
                        onToggleAvailability={() => toggleAvailability(item)}
                        onEdit={() => { setSelectedItem({ ...item }); setIsEditItemOpen(true) }}
                        onDelete={() => handleDeleteItem(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        ))}
        {groups.length === 0 && (
          <div className="text-center py-16 text-slate-400 text-sm">No items found</div>
        )}
      </div>

      {/* Add Item dialog */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Menu Item</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Name</Label>
                <Input className="mt-1" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Item name" />
              </div>
              <div>
                <Label className="text-sm">Price (₹)</Label>
                <Input className="mt-1" type="number" step="0.01" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label className="text-sm">Description</Label>
              <Textarea className="mt-1" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label className="text-sm">Category</Label>
              <Select value={newItem.categoryId} onValueChange={(v) => setNewItem({ ...newItem, categoryId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={newItem.available} onCheckedChange={(v) => setNewItem({ ...newItem, available: v })} />
              <Label className="text-sm">Available for ordering</Label>
            </div>

            {/* Option groups */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-semibold">Option Groups</Label>
                <Button variant="outline" size="sm" onClick={addOptionGroup}>+ Add Group</Button>
              </div>
              {newItem.optionGroups.map((group, gIdx) => (
                <div key={gIdx} className="border border-slate-200 p-3 rounded-lg space-y-2 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Input placeholder="Group title" value={group.title} onChange={(e) => updateOptionGroup(gIdx, "title", e.target.value)} />
                    <Button variant="ghost" size="sm" onClick={() => removeOptionGroup(gIdx)}><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={group.required} onChange={(e) => updateOptionGroup(gIdx, "required", e.target.checked)} />
                      Required
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={group.multiple} onChange={(e) => updateOptionGroup(gIdx, "multiple", e.target.checked)} />
                      Multiple
                    </label>
                  </div>
                  <div className="space-y-2">
                    {group.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <Input placeholder="Option name" value={opt.name} onChange={(e) => updateOption(gIdx, oIdx, "name", e.target.value)} />
                        <Input type="number" step="0.01" placeholder="₹ delta" value={opt.priceDelta} onChange={(e) => updateOption(gIdx, oIdx, "priceDelta", parseFloat(e.target.value))} className="w-28" />
                        <Button variant="ghost" size="sm" onClick={() => removeOption(gIdx, oIdx)}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => addOption(gIdx)}>+ Option</Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsAddItemOpen(false)}>Cancel</Button>
              <Button onClick={handleAddItem} className="brand-bg text-white">Add Item</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Item dialog */}
      <Dialog open={isEditItemOpen} onOpenChange={(open) => { setIsEditItemOpen(open); if (!open) setSelectedItem(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Item</DialogTitle></DialogHeader>
          {selectedItem && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Name</Label>
                  <Input className="mt-1" value={selectedItem.name} onChange={(e) => setSelectedItem({ ...selectedItem, name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-sm">Price (₹)</Label>
                  <Input className="mt-1" type="number" step="0.01" value={selectedItem.price} onChange={(e) => setSelectedItem({ ...selectedItem, price: parseFloat(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label className="text-sm">Description</Label>
                <Textarea className="mt-1" value={selectedItem.description || ""} onChange={(e) => setSelectedItem({ ...selectedItem, description: e.target.value })} rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={selectedItem.available} onCheckedChange={(v) => setSelectedItem({ ...selectedItem, available: v })} />
                <Label className="text-sm">Available</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditItemOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleEditItem} className="brand-bg text-white">Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Category dialog */}
      <Dialog open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Category</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-sm">Name</Label>
              <Input className="mt-1" value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="e.g. Starters" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsAddCategoryOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAddCategory} className="brand-bg text-white">Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Category dialog */}
      <Dialog open={isEditCategoryOpen} onOpenChange={(open) => { setIsEditCategoryOpen(open); if (!open) setSelectedCategory(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
          {selectedCategory && (
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-sm">Name</Label>
                <Input className="mt-1" value={selectedCategory.name} onChange={(e) => setSelectedCategory({ ...selectedCategory, name: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={selectedCategory.isActive} onCheckedChange={(v) => setSelectedCategory({ ...selectedCategory, isActive: v })} />
                <Label className="text-sm">Active</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditCategoryOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleEditCategory} className="brand-bg text-white">Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableMenuItemRow({ item, onToggleAvailability, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Card ref={setNodeRef} style={style} className="border-0 shadow-sm hover:bg-muted/40">
      <CardContent className="p-3 flex items-center gap-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none" aria-label="Reorder">
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800 text-sm truncate">{item.name}</h3>
            <StatusDot color={item.available ? "#10b981" : "#94a3b8"}>{item.available ? "Available" : "Off"}</StatusDot>
          </div>
          {item.description && <p className="text-slate-400 text-xs mt-0.5 truncate">{item.description}</p>}
          {item.optionGroups?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {item.optionGroups.map((group) => (
                <span key={group.id} className="text-xs text-slate-400">
                  <span className="font-medium text-slate-600">{group.title}: </span>
                  {group.options.map((o) => o.name).join(", ")}
                </span>
              ))}
            </div>
          )}
        </div>

        <span className="font-bold text-slate-900 text-sm flex-shrink-0">₹{item.price.toFixed(0)}</span>
        <Switch checked={item.available} onCheckedChange={onToggleAvailability} className="flex-shrink-0" />
        <Button variant="outline" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={onEdit}>
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete}
          className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 border-0 flex-shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  )
}
