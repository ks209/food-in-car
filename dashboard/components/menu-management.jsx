"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Search, Plus, Edit, Trash2, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import axios from "axios"
import { API } from "@/lib/api"

const emptyItem = { name: "", description: "", price: 0, categoryId: "", available: true, imageUrl: "", optionGroups: [] }

export function MenuManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [newItem, setNewItem] = useState(emptyItem)

  const fetchMenu = async () => {
    try {
      const res = await axios.get(`${API}/api/menu/`, { withCredentials: true })
      setMenuItems(res.data)
    } catch { toast.error("Failed to fetch menu items") }
  }

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${API}/api/category/all`, { withCredentials: true })
      setCategories(res.data)
    } catch { toast.error("Failed to fetch categories") }
  }

  useEffect(() => { fetchMenu(); fetchCategories() }, [])

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

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.price) { toast.error("Name and price are required"); return }
    try {
      await axios.post(`${API}/api/menu/create`, {
        name: newItem.name, description: newItem.description, price: newItem.price,
        available: newItem.available, imageUrl: newItem.imageUrl || null,
        categoryId: newItem.categoryId ? parseInt(newItem.categoryId) : undefined,
        optionGroups: newItem.optionGroups.length > 0 ? newItem.optionGroups : undefined,
      }, { withCredentials: true })
      toast.success("Item added")
      setNewItem(emptyItem); setIsAddDialogOpen(false); fetchMenu()
    } catch { toast.error("Failed to add item") }
  }

  const handleEditItem = async () => {
    if (!selectedItem) return
    try {
      await axios.put(`${API}/api/menu/${selectedItem.id}`, {
        name: selectedItem.name, description: selectedItem.description,
        price: selectedItem.price, available: selectedItem.available,
        imageUrl: selectedItem.imageUrl, isActive: selectedItem.isActive,
      }, { withCredentials: true })
      toast.success("Item updated"); setIsEditDialogOpen(false); setSelectedItem(null); fetchMenu()
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

  const filteredItems = menuItems.filter((item) =>
    (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description || "").toLowerCase().includes(searchTerm.toLowerCase())) &&
    (categoryFilter === "all" || item.category?.name === categoryFilter)
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-sm">{menuItems.length} items</p>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="brand-bg text-white h-9 text-sm">
              <Plus className="h-4 w-4 mr-1.5" />Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Menu Item</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Category</Label>
                  <Select value={newItem.categoryId} onValueChange={(v) => setNewItem({ ...newItem, categoryId: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Image URL</Label>
                  <Input className="mt-1" value={newItem.imageUrl} onChange={(e) => setNewItem({ ...newItem, imageUrl: e.target.value })} placeholder="https://…" />
                </div>
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
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddItem} className="brand-bg text-white">Add Item</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <Input placeholder="Search items…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-white" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => (
          <Card key={item.id} className="border-0 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            {item.imageUrl && (
              <img src={item.imageUrl} alt={item.name} className="w-full h-32 object-cover" />
            )}
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-800 text-sm truncate">{item.name}</h3>
                  {item.category && (
                    <span className="inline-block mt-1 text-xs brand-text font-medium">{item.category.name}</span>
                  )}
                </div>
                <Switch checked={item.available} onCheckedChange={() => toggleAvailability(item)} className="ml-2 flex-shrink-0" />
              </div>

              {item.description && (
                <p className="text-slate-400 text-xs mb-3 line-clamp-2">{item.description}</p>
              )}

              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">₹{item.price.toFixed(0)}</span>
                <Badge
                  variant={item.available ? "default" : "secondary"}
                  className={`text-xs ${item.available ? "brand-bg text-white border-0" : ""}`}
                >
                  {item.available ? "Available" : "Off"}
                </Badge>
              </div>

              {item.optionGroups?.length > 0 && (
                <div className="mt-3 space-y-1">
                  {item.optionGroups.map((group) => (
                    <div key={group.id} className="text-xs text-slate-400">
                      <span className="font-medium text-slate-600">{group.title}: </span>
                      {group.options.map((o) => o.name).join(", ")}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Dialog open={isEditDialogOpen && selectedItem?.id === item.id}
                  onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setSelectedItem(null) }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1 text-xs h-8"
                      onClick={() => { setSelectedItem({ ...item }); setIsEditDialogOpen(true) }}>
                      <Edit className="h-3.5 w-3.5 mr-1" />Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Edit Item</DialogTitle></DialogHeader>
                    {selectedItem && (
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-4">
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
                        <div>
                          <Label className="text-sm">Image URL</Label>
                          <Input className="mt-1" value={selectedItem.imageUrl || ""} onChange={(e) => setSelectedItem({ ...selectedItem, imageUrl: e.target.value })} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={selectedItem.available} onCheckedChange={(v) => setSelectedItem({ ...selectedItem, available: v })} />
                          <Label className="text-sm">Available</Label>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                          <Button size="sm" onClick={handleEditItem} className="brand-bg text-white">Save</Button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
                <Button variant="outline" size="sm" onClick={() => handleDeleteItem(item.id)}
                  className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 border-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredItems.length === 0 && (
          <div className="col-span-3 text-center py-16 text-slate-400 text-sm">No items found</div>
        )}
      </div>
    </div>
  )
}
