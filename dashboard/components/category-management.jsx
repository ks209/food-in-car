"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Search, Plus, Edit } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import axios from "axios"
import { toast } from "sonner"
import { API } from "@/lib/api"

export function CategoryManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState({ name: "", isActive: true })

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/api/category/`, { withCredentials: true })
      setCategories(response.data)
    } catch {
      toast.error("Failed to fetch categories")
    }
  }

  useEffect(() => { fetchCategories() }, [])

  const handleAddCategory = async () => {
    if (!newCategory.name.trim()) { toast.error("Name is required"); return }
    try {
      const res = await axios.post(`${API}/api/category/create`, newCategory, { withCredentials: true })
      setCategories([...categories, res.data])
      setNewCategory({ name: "", isActive: true })
      setIsAddDialogOpen(false)
      toast.success("Category added")
    } catch {
      toast.error("Failed to add category")
    }
  }

  const handleEditCategory = async () => {
    if (!selectedCategory) return
    try {
      await axios.put(`${API}/api/category/${selectedCategory.id}`, selectedCategory, { withCredentials: true })
      setIsEditDialogOpen(false)
      setSelectedCategory(null)
      fetchCategories()
      toast.success("Category updated")
    } catch {
      toast.error("Failed to update category")
    }
  }

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-500 text-sm">{categories.length} categories</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="brand-bg text-white h-9 text-sm">
              <Plus className="h-4 w-4 mr-1.5" />Add Category
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label htmlFor="name" className="text-sm">Name</Label>
                <Input
                  id="name"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  placeholder="e.g. Starters"
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={newCategory.isActive}
                  onCheckedChange={(v) => setNewCategory({ ...newCategory, isActive: v })}
                />
                <Label className="text-sm">Active</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddCategory} className="brand-bg text-white">Add</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
        <Input
          placeholder="Search categories…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 bg-white border-slate-200"
        />
      </div>

      {/* List */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {filteredCategories.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-10">No categories found</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredCategories.map((category) => (
                <div key={category.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full brand-bg flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{category.name}</p>
                      <p className="text-xs text-slate-400">{category.menuItems?.length || 0} items</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={category.isActive ? "default" : "secondary"}
                      className={`text-xs ${category.isActive ? "brand-bg text-white border-0" : ""}`}
                    >
                      {category.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Dialog open={isEditDialogOpen && selectedCategory?.id === category.id}
                      onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setSelectedCategory(null) }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
                          onClick={() => { setSelectedCategory({ ...category }); setIsEditDialogOpen(true) }}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
                        {selectedCategory && (
                          <div className="space-y-4 pt-2">
                            <div>
                              <Label className="text-sm">Name</Label>
                              <Input
                                value={selectedCategory.name}
                                onChange={(e) => setSelectedCategory({ ...selectedCategory, name: e.target.value })}
                                className="mt-1"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={selectedCategory.isActive}
                                onCheckedChange={(v) => setSelectedCategory({ ...selectedCategory, isActive: v })}
                              />
                              <Label className="text-sm">Active</Label>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                              <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                              <Button size="sm" onClick={handleEditCategory} className="brand-bg text-white">Save</Button>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
